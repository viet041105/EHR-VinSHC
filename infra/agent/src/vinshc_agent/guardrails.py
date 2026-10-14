"""Guardrail cơ bản, chạy bằng luật tất định trước và sau model.

Đầu vào: chặn mẫu prompt injection, UUID của hồ sơ khác, yêu cầu xem hồ sơ người khác (bệnh nhân), phát
hiện dấu hiệu cấp cứu (bệnh nhân) và ẩn CCCD/điện thoại/email trước khi gửi model.
Đầu ra: loại câu khuyên đổi thuốc/điều trị hoặc khẳng định chẩn đoán không có trong dữ kiện được trích,
câu chứa định danh cá nhân, và chặn cả câu trả lời nếu lộ chuỗi canary của system prompt.

Đây là lớp phòng thủ bổ sung, không thay cho kiểm quyền ở backend và kiểm tra nguồn trong validate.py.
"""

from __future__ import annotations

import hashlib
import re
import time
from collections import deque
from dataclasses import dataclass
from typing import Iterable, Literal

from .facts import Fact
from .prompts import CANARY
from .text import fold

UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
CCCD_RE = re.compile(r"(?<!\d)\d{12}(?!\d)")
PHONE_RE = re.compile(r"(?<![\d+])(?:\+84|84|0)(?:[\s.\-]?\d){9,10}(?![\d])")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
REDACTED = "[đã ẩn]"

# Mẫu so khớp trên văn bản đã bỏ dấu (text.fold).
INJECTION = [
    re.compile(p)
    for p in (
        r"\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompts?|guidelines?)\b",
        r"\b(bo qua|phot lo|quen het|quen di|vo hieu hoa|vuot qua)\b.{0,30}\b(huong dan|chi dan|chi thi|quy tac|quy dinh|lenh|rang buoc|prompt|gioi han)\b",
        r"\b(system prompt|prompt he thong|developer mode|che do nha phat trien|jailbreak|dan mode|god mode)\b",
        r"\b(tiet lo|in ra|hien thi|cho (toi )?xem|nhac lai|lap lai)\b.{0,30}\b(prompt|huong dan (he thong|ban dau|goc)|chi dan he thong|cau hinh he thong|system)\b",
        r"\b(dong vai|gia vo la|gia lam|act as|pretend to be|roleplay as)\b.{0,30}\b(admin|quan tri|he thong|developer|nha phat trien|bac si khac|nguoi khac)\b",
        r"</?\s*(system|context|message|facts|tool|tool_result|instructions?|assistant)\s*>",
    )
]
OTHER_PERSON = re.compile(
    r"\b(ho so|benh an|don thuoc|ket qua|thong tin|lich hen)\b.{0,20}\b(nguoi khac|me toi|bo toi|cha toi|vo toi|chong toi|"
    r"con toi|ban toi|nguoi nha|nguoi than|ong toi|ba toi|anh toi|chi toi|em toi)\b"
)
EMERGENCY = [
    re.compile(p)
    for p in (
        r"\bkho tho\b",
        r"\b(dau|tuc) (that )?nguc\b",
        r"\b(ngat xiu|bi ngat|bat tinh|hon me)\b",
        r"\bco giat\b",
        r"\bchay mau (nhieu|khong cam|khong ngung|khong dung)\b",
        r"\b(non|ho|di ngoai) ra mau\b",
        r"\b(soc phan ve|phan ve|di ung nang)\b",
        r"\bsung (moi|mat|luoi|hong hong|co hong)\b",
        r"\b(tu tu|tu sat|muon chet|khong muon song|ket lieu ban than|tu lam hai)\b",
        r"\b(uong|dung) qua lieu\b",
        r"\b(meo mieng|liet nua nguoi|yeu nua nguoi|noi ngong|noi kho dot ngot)\b",
    )
]
MEDICATION_ADVICE = [
    re.compile(p)
    for p in (
        r"\b(tang|giam|gap doi|chia doi|ngung|bo|bot|them)\b (lieu|thuoc|so lan|vien)\b",
        r"\buong them\b",
        r"\btu (mua|dung|uong)\b",
        r"\b(nen|co the|duoc phep|hay) (uong|dung|ngung|bo|tang|giam)\b",
    )
]
# Bỏ dấu làm "dừng/dùng", "thay/thầy", "đổi/đợi" trùng nhau, nên các mẫu này so trên văn bản còn dấu.
MEDICATION_ADVICE_ACCENTED = re.compile(r"\b(dừng|thay|đổi) (thuốc|liều)\b")
DIAGNOSTIC_CLAIM = re.compile(r"\b(ban|anh|chi|chu|bac|em) (co the |dang |da |chac )?(bi|mac)\b")
TREATMENT_ADVICE = [
    re.compile(p)
    for p in (
        r"\b(nen|can|de nghi|khuyen) (ke|dung|tang|giam|ngung|doi|bo sung|chi dinh|lam them|dieu tri|cho dung)\b",
        r"\bkhuyen nghi\b",
    )
]

REFUSALS = {
    "prompt_injection": "Yêu cầu này nằm ngoài phạm vi của trợ lý hồ sơ.",
    "other_record": "Trợ lý chỉ làm việc với hồ sơ đang mở; không đọc hồ sơ khác theo mã nhập vào.",
    "other_person": "Trợ lý chỉ xem được thông tin của chính tài khoản đang đăng nhập. Người thân cần dùng tài khoản "
    "của họ hoặc liên hệ phòng khám.",
}
EMERGENCY_MESSAGE = (
    "Nếu bạn hoặc người bên cạnh đang có dấu hiệu nguy hiểm như khó thở, đau ngực, ngất, co giật, chảy máu nhiều, "
    "sưng môi hoặc lưỡi, hay có ý nghĩ tự làm hại bản thân, hãy gọi cấp cứu 115 hoặc đến cơ sở y tế gần nhất ngay. "
    "Trợ lý hồ sơ không xử lý được tình huống khẩn cấp."
)


@dataclass(frozen=True)
class Verdict:
    action: Literal["allow", "refuse", "emergency"]
    code: str | None = None
    message: str | None = None


def redact(text: str) -> str:
    return PHONE_RE.sub(REDACTED, CCCD_RE.sub(REDACTED, EMAIL_RE.sub(REDACTED, text)))


def is_injection(text: str) -> bool:
    folded = fold(text)
    return any(p.search(folded) for p in INJECTION)


def screen_input(
    persona: str, message: str, history: Iterable[str], allowed_uuids: set[str], clinic_contact: str | None = None
) -> Verdict:
    folded = fold(message)
    if persona == "patient" and any(p.search(folded) for p in EMERGENCY):
        contact = f" Liên hệ phòng khám: {clinic_contact}." if clinic_contact else ""
        return Verdict("emergency", "emergency", EMERGENCY_MESSAGE + contact)
    if is_injection(message) or any(is_injection(h) for h in history):
        return Verdict("refuse", "prompt_injection", REFUSALS["prompt_injection"])
    if any(u.lower() not in allowed_uuids for u in UUID_RE.findall(message)):
        return Verdict("refuse", "other_record", REFUSALS["other_record"])
    if persona == "patient" and OTHER_PERSON.search(folded):
        return Verdict("refuse", "other_person", REFUSALS["other_person"])
    return Verdict("allow")


def leaks_prompt(text: str) -> bool:
    return CANARY in text or fold(CANARY) in fold(text)


def screen_statement(persona: str, text: str, facts: list[Fact]) -> str | None:
    """Lý do loại một câu của model, hoặc None nếu câu qua được guardrail đầu ra."""
    folded = fold(text)
    source = fold(" ".join(f"{f.label} {f.value}" for f in facts))
    plain = UUID_RE.sub(" ", text)  # đuôi 12 chữ số của UUID không phải CCCD
    if CCCD_RE.search(plain) or PHONE_RE.search(plain) or EMAIL_RE.search(plain):
        return "personal_identifier"
    if persona == "patient":
        for pattern in MEDICATION_ADVICE:
            match = pattern.search(folded)
            if match and match.group(0) not in source:
                return "medication_advice"
        match = MEDICATION_ADVICE_ACCENTED.search(text.lower())
        if match and fold(match.group(0)) not in source:
            return "medication_advice"
        if DIAGNOSTIC_CLAIM.search(folded) and not any(f.section == "diagnoses" for f in facts):
            return "diagnostic_claim"
    if persona == "doctor":
        for pattern in TREATMENT_ADVICE:
            match = pattern.search(folded)
            if match and match.group(0) not in source:
                return "treatment_advice"
    return None


class RateLimiter:
    """Giới hạn số lượt hỏi mỗi phút theo người dùng (khóa băm từ Authorization), lưu trong bộ nhớ tiến trình."""

    def __init__(self, per_minute: int, window: float = 60.0):
        self.per_minute = per_minute
        self.window = window
        self._hits: dict[str, deque[float]] = {}

    @staticmethod
    def key(persona: str, authorization: str) -> str:
        return persona + ":" + hashlib.sha256(authorization.encode()).hexdigest()[:24]

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        if len(self._hits) > 10_000:
            self._hits = {k: q for k, q in self._hits.items() if q and now - q[-1] < self.window}
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        return True
