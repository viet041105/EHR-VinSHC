"""Versioned, permission-filtered reference retrieval, independent of the clinical adapter.

Offline retrieval uses BM25. Optional Gemini embeddings use a prepared local vector index,
cosine similarity and reciprocal rank fusion (RRF). Neither path grants access to records.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Literal
from uuid import UUID, NAMESPACE_URL, uuid5

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .backend import BackendError
from .guardrails import UUID_RE, is_injection, redact
from .text import fold

MAX_CHUNK = 750
STOP = set("toi ban cua la va hay theo tai lieu huong dan cho mot nhung cac trong voi ve duoc nao gi the thi nay khi khong co da de can xin tim doc he thong vinshc dung khac".split())


class KnowledgeError(BackendError):
    """Only safe, fixed messages escape this boundary; provider bodies never do."""


class Document(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(pattern=r"^[a-z][a-z0-9-]{0,63}$")
    title: str = Field(min_length=1, max_length=160)
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    path: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    roles: list[Literal["doctor", "patient"]] = Field(min_length=1)
    facilityUuids: list[str] = Field(default_factory=list)
    status: Literal["development", "approved", "retired", "quarantined"]
    effectiveFrom: date
    effectiveTo: date | None = None
    reviewedBy: str | None = None
    allowExternalEmbedding: bool = False
    origins: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def valid_policy(self):
        if self.effectiveTo and self.effectiveTo <= self.effectiveFrom:
            raise ValueError("effectiveTo must be later than effectiveFrom (exclusive)")
        if self.status == "approved" and not (self.reviewedBy or "").strip():
            raise ValueError("Approved reference material requires a reviewer")
        for value in self.facilityUuids:
            UUID(value)
        return self


class Manifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    synthetic: bool
    purpose: str
    documents: list[Document] = Field(min_length=1, max_length=200)


@dataclass(frozen=True)
class KnowledgeScope:
    role: str
    facility_uuid: str | None = None  # supplied only by authenticated server context


@dataclass(frozen=True)
class Chunk:
    uuid: str
    document: Document
    section: str
    text: str

    def public(self, persona: str) -> dict:
        d = self.document
        return {"uuid": self.uuid, "kind": "document", "documentId": d.id,
                "documentTitle": d.title, "documentVersion": d.version,
                "documentSection": self.section, "status": d.status, "text": self.text,
                "origins": d.origins, "sourceUrl": f"/v1/{persona}/knowledge/chunks/{self.uuid}"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tokens(text: str) -> list[str]:
    folded = fold(text).replace("don vi", "donvi")
    return [t for t in re.findall(r"[a-z0-9_%]+", folded) if t not in STOP]


def split_markdown(text: str) -> list[tuple[str, str]]:
    """Heading-aware chunks; no invented PDF page numbers or mid-word truncation."""
    section = "Tổng quan"
    buffer: list[str] = []
    output: list[tuple[str, str]] = []

    def flush():
        if buffer:
            output.append((section, " ".join(buffer)))
            buffer.clear()

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            flush()
            section = line.lstrip("#").strip()
            if len(section) > 160:
                raise ValueError("Document heading exceeds 160 characters")
            continue
        for word in line.split():
            if len(word) > MAX_CHUNK:
                raise ValueError("Unchunkable document token")
            if sum(len(w) + 1 for w in buffer) + len(word) > MAX_CHUNK:
                flush()
            buffer.append(word)
    flush()
    return output


class Corpus:
    def __init__(self, path: Path, allow_development: bool = False):
        self.path = path.resolve()
        self.allow_development = allow_development
        raw = self.path.read_bytes()
        if len(raw) > 256_000:
            raise ValueError("Reference manifest is too large")
        self.manifest = Manifest.model_validate_json(raw)
        if self.manifest.synthetic and not allow_development:
            raise ValueError("Synthetic reference corpus is only enabled with mock data")
        self._files: list[tuple[Path, str]] = [(self.path, digest(raw))]
        self.chunks: dict[str, Chunk] = {}
        self.quarantined: list[str] = []
        seen: set[str] = set()
        for doc in self.manifest.documents:
            if doc.id in seen:
                raise ValueError("Duplicate document id; publish one current version per manifest")
            seen.add(doc.id)
            file = (self.path.parent / doc.path).resolve()
            if not file.is_relative_to(self.path.parent) or file.suffix != ".md":
                raise ValueError("Reference file must be Markdown within the corpus directory")
            content = file.read_bytes()
            if len(content) > 256_000 or digest(content) != doc.sha256:
                raise ValueError("Reference file hash or size does not match its manifest")
            self._files.append((file, doc.sha256))
            text = content.decode("utf-8")
            if doc.status == "quarantined" or is_injection(text) or is_injection(doc.title):
                self.quarantined.append(doc.id)
                continue
            for ordinal, (section, body) in enumerate(split_markdown(text)):
                key = str(uuid5(NAMESPACE_URL, f"vinshc:reference:{doc.id}:{doc.version}:{section}:{ordinal}:{digest(body.encode())}"))
                self.chunks[key] = Chunk(key, doc, section, body)
        if len(self.chunks) > 1000:
            raise ValueError("Corpus exceeds 1000 chunks")
        self.fingerprint = digest(raw + b"\n" + "\n".join(h for _, h in self._files).encode())

    def fresh(self) -> None:
        try:
            if any(digest(p.read_bytes()) != expected for p, expected in self._files):
                raise OSError()
        except OSError:
            raise KnowledgeError(409, "knowledge_changed", "Tài liệu đã thay đổi; cần kiểm tra và nạp lại nguồn/index.") from None

    def allowed(self, chunk: Chunk, scope: KnowledgeScope, today: date | None = None) -> bool:
        d = chunk.document
        today = today or datetime.now(timezone.utc).date()
        active = d.status == "approved" or (d.status == "development" and self.allow_development)
        facilities = {u.lower() for u in d.facilityUuids}
        return bool(active and d.effectiveFrom <= today and (not d.effectiveTo or today < d.effectiveTo)
                    and scope.role in d.roles and (not facilities or (scope.facility_uuid or "").lower() in facilities))

    def visible(self, scope: KnowledgeScope) -> list[Chunk]:
        self.fresh()
        return [c for c in self.chunks.values() if self.allowed(c, scope)]

    def read(self, key: str, scope: KnowledgeScope) -> Chunk:
        self.fresh()
        c = self.chunks.get(key.lower())
        if c is None or not self.allowed(c, scope):
            raise KnowledgeError(404, "knowledge_not_found", "Không tìm thấy tài liệu được phép đọc.")
        return c


def bm25(query: str, chunks: list[Chunk]) -> list[str]:
    q = set(tokens(query))
    counts = [Counter(tokens(c.document.title + " " + c.section + " " + c.text)) for c in chunks]
    lengths = [sum(c.values()) for c in counts]
    avg = sum(lengths) / max(len(lengths), 1) or 1
    scores: dict[str, float] = {}
    for c, freq, length in zip(chunks, counts, lengths):
        score = 0.0
        for term in q.intersection(freq):
            df = sum(term in terms for terms in counts)
            idf = math.log(1 + (len(chunks) - df + .5) / (df + .5))
            tf = freq[term]
            score += idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * length / avg))
        if score > 0:
            scores[c.uuid] = score
    return sorted(scores, key=lambda key: (-scores[key], key))


def normalized(values, dimensions: int) -> list[float]:
    if not isinstance(values, list) or len(values) != dimensions:
        raise KnowledgeError(502, "embedding_invalid", "Embedding sai cấu trúc hoặc số chiều.")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise KnowledgeError(502, "embedding_invalid", "Embedding chứa giá trị không hợp lệ.")
    norm = math.sqrt(sum(v * v for v in values))
    if not math.isfinite(norm) or norm <= 0:
        raise KnowledgeError(502, "embedding_invalid", "Embedding không có vector hợp lệ.")
    return [v / norm for v in values]


class GeminiEmbeddings:
    model = "gemini-embedding-001"
    dimensions = 768

    def __init__(self, api_key: str, timeout: float = 30, client: httpx.AsyncClient | None = None):
        self._key, self._timeout, self._client = api_key, timeout, client

    async def embed(self, texts: list[str], *, document: bool, titles: list[str] | None = None) -> list[list[float]]:
        if not texts:
            return []
        if len(texts) > 32 or (titles is not None and len(titles) != len(texts)):
            raise ValueError("Embedding batch must contain at most 32 matched inputs")
        requests = []
        for i, text in enumerate(texts):
            config = {"taskType": "RETRIEVAL_DOCUMENT" if document else "RETRIEVAL_QUERY",
                      "outputDimensionality": self.dimensions}
            if document and titles:
                config["title"] = titles[i]
            # batchEmbedContents uses these fields on each EmbedContentRequest. The nested
            # embedContentConfig accepted by the single-item endpoint was ignored by batch
            # in a live check, returning 3072 dimensions instead of the requested 768.
            requests.append({"model": "models/" + self.model, "content": {"parts": [{"text": text}]}, **config})
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:batchEmbedContents"
        try:
            if self._client:
                r = await self._client.post(url, headers={"x-goog-api-key": self._key}, json={"requests": requests}, timeout=self._timeout)
            else:
                async with httpx.AsyncClient(trust_env=False, follow_redirects=False) as client:
                    r = await client.post(url, headers={"x-goog-api-key": self._key}, json={"requests": requests}, timeout=self._timeout)
        except httpx.RequestError:
            raise KnowledgeError(503, "embedding_connection", "Chưa kết nối được dịch vụ embedding.") from None
        if r.status_code != 200:
            code = "embedding_rate_limited" if r.status_code == 429 else f"embedding_http_{r.status_code}"
            raise KnowledgeError(503, code, "Dịch vụ embedding chưa khả dụng; không tự đổi sang chế độ khác.")
        try:
            vectors = r.json()["embeddings"]
            if len(vectors) != len(texts):
                raise ValueError()
            return [normalized(v["values"], self.dimensions) for v in vectors]
        except (KeyError, TypeError, ValueError):
            raise KnowledgeError(502, "embedding_invalid", "Embedding trả về sai cấu trúc.") from None


class KnowledgeBase:
    def __init__(self, corpus: Corpus, *, embeddings: GeminiEmbeddings | None = None,
                 index_path: Path | None = None, min_similarity: float = .55, advanced: bool = False):
        self.corpus, self.embeddings, self.index_path = corpus, embeddings, index_path
        self.min_similarity = min_similarity
        from collections import OrderedDict
        self.advanced = advanced
        self._retrieval_cache = OrderedDict()
        self.search_stats = {"searches": 0, "cacheHits": 0, "embeddingCalls": 0}

    @property
    def mode(self) -> str:
        return "gemini-hybrid" if self.embeddings else "offline-bm25"

    async def build_index(self) -> dict:
        if self.embeddings is None or self.index_path is None:
            raise ValueError("Configure Gemini embedding and an index path before indexing")
        self.corpus.fresh()
        chunks = [c for c in self.corpus.chunks.values() if any(self.corpus.allowed(c, KnowledgeScope(r, f))
                  for r in c.document.roles for f in (c.document.facilityUuids or [None]))]
        if any(not c.document.allowExternalEmbedding for c in chunks):
            raise KnowledgeError(403, "embedding_not_allowed", "Nguồn tài liệu chưa cho phép gửi tới dịch vụ embedding.")
        if self.index_path.resolve() in {p for p, _ in self.corpus._files}:
            raise ValueError("Index path must not overwrite source documents")
        existing = None
        if self.index_path.is_file():
            try:
                existing = self._load_vectors()
            except KnowledgeError:
                pass  # explicit re-index command can repair a stale cache
        if existing is not None and set(existing) == {c.uuid for c in chunks}:
            return {"chunks": len(existing), "reused": True, "fingerprint": self.corpus.fingerprint}
        vectors = {}
        for offset in range(0, len(chunks), 32):
            batch = chunks[offset:offset + 32]
            result = await self.embeddings.embed([c.text for c in batch], document=True,
                                                   titles=[c.document.title + " — " + c.section for c in batch])
            vectors.update({c.uuid: v for c, v in zip(batch, result)})
        self.corpus.fresh()  # changes during embedding must not publish a mismatched index
        payload = {"formatVersion": 1, "fingerprint": self.corpus.fingerprint,
                   "model": self.embeddings.model, "dimensions": self.embeddings.dimensions, "vectors": vectors}
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.index_path.with_suffix(self.index_path.suffix + ".tmp")
        temp.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
        temp.replace(self.index_path)
        return {"chunks": len(vectors), "reused": False, "fingerprint": self.corpus.fingerprint}

    def _load_vectors(self) -> dict[str, list[float]]:
        try:
            if self.index_path is None or self.index_path.stat().st_size > 50_000_000:
                raise ValueError()
            p = json.loads(self.index_path.read_text(encoding="utf-8"))
            if (p["formatVersion"] != 1 or p["fingerprint"] != self.corpus.fingerprint
                    or p["model"] != self.embeddings.model or p["dimensions"] != self.embeddings.dimensions
                    or not isinstance(p["vectors"], dict) or not set(p["vectors"]) <= set(self.corpus.chunks)):
                raise ValueError()
            return {k: normalized(v, self.embeddings.dimensions) for k, v in p["vectors"].items()}
        except (OSError, KeyError, TypeError, ValueError, KnowledgeError):
            raise KnowledgeError(503, "knowledge_index_required", "Cần tạo hoặc cập nhật index embedding bằng npm run agent:rag:index.") from None

    async def search(self, query: str, scope: KnowledgeScope, limit: int = 3) -> list[Chunk]:
        if self.advanced:
            from .retrieval import advanced_search
            return await advanced_search(self, query, scope, limit)
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 400 or not 1 <= limit <= 4:
            raise KnowledgeError(400, "knowledge_query_invalid", "Câu tìm kiếm cần từ 1 đến 400 ký tự; limit từ 1 đến 4.")
        if is_injection(query):
            raise KnowledgeError(400, "knowledge_query_refused", "Yêu cầu tìm tài liệu không hợp lệ.")
        from .guardrails import REDACTED
        query = UUID_RE.sub(" ", redact(query)).replace(REDACTED, " ").strip()
        if not tokens(query):
            return []
        # Policy filtering precedes scoring, vector lookup and sending any query externally.
        chunks = self.corpus.visible(scope)
        if not chunks:
            return []
        lexical = bm25(query, chunks)
        if self.embeddings is None:
            return [self.corpus.read(k, scope) for k in lexical[:limit]]
        if any(not c.document.allowExternalEmbedding for c in chunks):
            raise KnowledgeError(403, "embedding_not_allowed", "Nguồn tài liệu chưa cho phép tìm bằng embedding ngoài.")
        vectors = self._load_vectors()
        if not all(c.uuid in vectors for c in chunks):
            raise KnowledgeError(503, "knowledge_index_required", "Index chưa có đủ tài liệu được phép đọc; cần tạo lại index.")
        q = (await self.embeddings.embed([query], document=False))[0]
        semantic_scores = {c.uuid: sum(a * b for a, b in zip(q, vectors[c.uuid])) for c in chunks}
        semantic = sorted((k for k, v in semantic_scores.items() if v >= self.min_similarity),
                          key=lambda k: (-semantic_scores[k], k))
        fusion: dict[str, float] = {}
        for ranking in (lexical, semantic):
            for rank, key in enumerate(ranking, 1):
                fusion[key] = fusion.get(key, 0) + 1 / (60 + rank)
        ranked = sorted(fusion, key=lambda k: (-fusion[k], k))[:limit]
        return [self.corpus.read(k, scope) for k in ranked]


def make_knowledge(settings) -> KnowledgeBase | None:
    if not settings.knowledge_enabled:
        return None
    corpus = Corpus(settings.knowledge_manifest, allow_development=settings.data_provider == "mock" or settings.knowledge_allow_development)
    if settings.knowledge_mode == "offline":
        return KnowledgeBase(corpus, advanced=settings.advanced_enabled)
    import os
    from .config import read_api_key
    key = read_api_key(settings.gemini_api_key_file) if settings.gemini_api_key_file else os.environ["GEMINI_API_KEY"].strip()
    return KnowledgeBase(corpus, embeddings=GeminiEmbeddings(key), index_path=settings.knowledge_index, advanced=settings.advanced_enabled)
