"""Bounded, expiring process-local conversation memory and aggregate operational metrics.

Never checkpoints tool payloads, facts, credential values or graph dependencies. This is not
durable storage: restarting the service deletes memory. An adapter can replace this store later.
"""
from __future__ import annotations
from collections import Counter, OrderedDict, deque
from dataclasses import dataclass, field
import hashlib
import hmac
import secrets
import threading
import time
from uuid import uuid4

from .backend import BackendError
from .guardrails import redact
from .llm import HistoryTurn, ModelUnavailable


@dataclass
class Session:
    id: str
    actor: str
    context: str
    expires: float
    history: list[HistoryTurn] = field(default_factory=list)
    revision: int = 0
    busy: bool = False
    lease_until: float = 0


class ConversationStore:
    def __init__(self, ttl=900, limit=256, clock=time.monotonic, busy_timeout=180):
        self.ttl, self.limit, self.clock = ttl, limit, clock
        self.busy_timeout = busy_timeout
        self._secret = secrets.token_bytes(32)
        self._sessions = OrderedDict()
        self._lock = threading.RLock()

    def actor(self, *parts):
        return hmac.new(self._secret, repr(parts).encode(), hashlib.sha256).hexdigest()

    def _purge(self):
        for key, session in list(self._sessions.items()):
            if (session.expires <= self.clock() and not session.busy) or (session.busy and session.lease_until <= self.clock()):
                del self._sessions[key]

    def acquire(self, actor, context, session_id=None):
        with self._lock:
            self._purge()
            if session_id:
                session = self._sessions.get(session_id)
                if session is None or session.actor != actor or session.context != context:
                    raise BackendError(404, "conversation_not_found", "Phiên không tồn tại, đã hết hạn hoặc không thuộc ngữ cảnh này.")
                if session.busy:
                    raise BackendError(409, "conversation_busy", "Phiên đang xử lý một câu hỏi; hãy đợi hoặc dừng câu đó.")
            else:
                while len(self._sessions) >= self.limit:
                    key = next((k for k, s in self._sessions.items() if not s.busy), None)
                    if key is None:
                        raise BackendError(429, "conversation_capacity", "Trợ lý đang xử lý nhiều phiên; vui lòng thử lại.")
                    del self._sessions[key]
                session = Session(str(uuid4()), actor, context, self.clock() + self.ttl)
                self._sessions[session.id] = session
            session.busy = True
            session.lease_until = self.clock() + self.busy_timeout + 5
            self._sessions.move_to_end(session.id)
            return session

    def finish(self, session, question, result, history=()):
        with self._lock:
            if self._sessions.get(session.id) is not session:
                return
            keep = result.status in ("ok", "not_found", "out_of_scope") or result.status == "limited" and result.answer
            if keep and (result.answer or result.message):
                if not session.history and session.revision == 0:
                    # A new session may resume bounded client context after expiry/cancellation.
                    # This text remains untrusted conversation context, never a source of chart facts.
                    session.history = [HistoryTurn(t.role, redact(t.text)) for t in history][-12:]
                text = ("\n".join(a.text for a in result.answer) if result.answer else result.message)[:2000]
                session.history.extend([HistoryTurn("user", redact(question)), HistoryTurn("assistant", redact(text))])
                session.history = session.history[-12:]
                session.revision += 1
            session.expires, session.busy = self.clock() + self.ttl, False

    def release(self, session):
        with self._lock:
            session.busy = False
            if session.revision == 0:
                self._sessions.pop(session.id, None)

    def delete(self, actor, session_id):
        with self._lock:
            self._purge()
            session = self._sessions.get(session_id)
            if session is None or session.actor != actor:
                raise BackendError(404, "conversation_not_found", "Không tìm thấy phiên thuộc tài khoản này.")
            if session.busy:
                raise BackendError(409, "conversation_busy", "Dừng câu hỏi đang xử lý trước khi xóa phiên.")
            del self._sessions[session_id]


class CircuitChatModel:
    def __init__(self, inner, failures=3, cooldown=30, clock=time.monotonic):
        self.inner, self.limit, self.cooldown, self.clock = inner, failures, cooldown, clock
        self.provider, self.name = inner.provider, inner.name
        self.failures, self.open_until = 0, 0.0
        self.probing = False

    async def next_turn(self, *args, **kwargs):
        now = self.clock()
        if now < self.open_until or self.probing:
            raise ModelUnavailable("circuit_open")
        probe = bool(self.open_until)
        if probe:
            self.probing = True
        try:
            turn = await self.inner.next_turn(*args, **kwargs)
            self.failures, self.open_until = 0, 0
            return turn
        except ModelUnavailable as ex:
            if str(ex).startswith("http_5") or str(ex) in {"connection", "timeout", "rate_limited"}:
                self.failures += 1
                if self.failures >= self.limit:
                    self.open_until = self.clock() + self.cooldown
            raise
        finally:
            if probe:
                self.probing = False


class Metrics:
    def __init__(self):
        self.counts = Counter()
        self.latencies = deque(maxlen=512)

    def add(self, status, duration, calls, tools, error=None):
        self.counts["requests"] += 1
        self.counts["status_" + status] += 1
        self.counts["modelCalls"] += calls
        self.counts["toolCalls"] += tools
        if error:
            self.counts["modelErrors"] += 1
        self.latencies.append(duration)

    def snapshot(self):
        values = sorted(self.latencies)
        def percentile(p):
            return round(values[min(int((len(values) - 1) * p), len(values) - 1)], 2) if values else None
        return {"counts": dict(self.counts), "sampleSize": len(values), "p50Ms": percentile(.5), "p95Ms": percentile(.95)}
