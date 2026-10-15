"""Deterministic multi-query expansion, RRF + feature reranking and scoped TTL caching.

This is a rule-based reranker, not a trained cross-encoder. No clinical facts are cached here.
"""
from __future__ import annotations
from collections import OrderedDict
import hashlib
import re
import time

from .guardrails import UUID_RE, REDACTED, is_injection, redact
from .knowledge import KnowledgeError, bm25, tokens
from .text import fold

REWRITES = (
    (r"\b(chua hoi|chua khai thac)\b", "not_asked"),
    (r"\b(khong ro|khong biet)\b", "unknown"),
    (r"\b(chua ghi|chua ghi nhan)\b", "not_recorded"),
    (r"\b(tu choi cung cap)\b", "refused"),
    (r"\b(khong ap dung)\b", "not_applicable"),
    (r"\b(da chot|chot phieu)\b", "final"),
    (r"\b(cong bo|duoc xem|phat hanh)\b", "published"),
    (r"\b(oxy mau|bao hoa oxy|may kep do)\b", "SpO2 pulse oximetry"),
    (r"\b(luot den kham)\b", "Visit"),
    (r"\b(phieu kham)\b", "Encounter"),
)


def expand(query):
    base = fold(query)
    result = [query]
    rewritten = base
    for pattern, replacement in REWRITES:
        rewritten = re.sub(pattern, replacement, rewritten)
    if rewritten != base:
        result.append(rewritten[:400])
    codes = re.findall(r"\b(?:not_asked|unknown|not_recorded|refused|not_applicable|masked|unreadable|spo2|final|published|fieldstates|r_bp)\b", rewritten, re.I)
    if codes:
        result.append(" ".join(dict.fromkeys(codes)))
    return list(dict.fromkeys(result))[:3]


async def advanced_search(kb, query, scope, limit):
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 400 or not 1 <= limit <= 4:
        raise KnowledgeError(400, "knowledge_query_invalid", "Câu tìm kiếm cần từ 1 đến 400 ký tự; limit từ 1 đến 4.")
    if is_injection(query):
        raise KnowledgeError(400, "knowledge_query_refused", "Yêu cầu tìm tài liệu không hợp lệ.")
    query = UUID_RE.sub(" ", redact(query)).replace(REDACTED, " ").strip()
    visible = kb.corpus.visible(scope)  # always before cache lookup and embedding
    if not visible or not tokens(query):
        return []
    key = hashlib.sha256(repr((query, scope.role, scope.facility_uuid, kb.corpus.fingerprint,
                              tuple(c.uuid for c in visible), kb.mode, limit)).encode()).hexdigest()
    vectors = None
    if kb.embeddings:
        if any(not c.document.allowExternalEmbedding for c in visible):
            raise KnowledgeError(403, "embedding_not_allowed", "Nguồn chưa cho phép gửi tới dịch vụ embedding.")
        vectors = kb._load_vectors()
        if not all(c.uuid in vectors for c in visible):
            raise KnowledgeError(503, "knowledge_index_required", "Cần cập nhật đủ index tài liệu được phép đọc.")
    now = time.monotonic()
    cached = kb._retrieval_cache.get(key)
    if cached and now - cached[0] < 60:
        kb.search_stats["cacheHits"] += 1
        kb._retrieval_cache.move_to_end(key)
        return [kb.corpus.read(k, scope) for k in cached[1]]
    kb.search_stats["searches"] += 1
    queries = expand(query)
    rankings = [bm25(q, visible) for q in queries]
    semantic_best = {}
    if kb.embeddings:
        query_vectors = await kb.embeddings.embed(queries, document=False)
        kb.search_stats["embeddingCalls"] += 1
        for q in query_vectors:
            scores = {c.uuid: sum(a * b for a, b in zip(q, vectors[c.uuid])) for c in visible}
            for key_, score in scores.items():
                semantic_best[key_] = max(semantic_best.get(key_, -1), score)
            rankings.append(sorted((k for k, v in scores.items() if v >= kb.min_similarity), key=lambda k: (-scores[k], k)))
    fusion = {}
    for i, ranking in enumerate(rankings):
        for rank, item in enumerate(ranking, 1):
            fusion[item] = fusion.get(item, 0) + (2 if i == 0 else 1) / (60 + rank)
    query_terms = set(tokens(" ".join(queries)))
    important = {t for t in query_terms if t in {"spo2", "unknown", "not_asked", "not_recorded", "final", "published", "fieldstates", "r_bp"}}
    candidates = {c.uuid: c for c in visible if c.uuid in fusion}

    def rank(key_):
        c = candidates[key_]
        content = set(tokens(c.text))
        heading = set(tokens(c.section))
        overlap = len(query_terms & content) / max(len(query_terms), 1)
        heading_match = len(query_terms & heading) / max(len(query_terms), 1)
        anchor = len(important & content) / max(len(important), 1)
        return .50 * overlap + .25 * heading_match + .20 * anchor + fusion[key_]

    selected, per_doc = [], {}
    for key_ in sorted(candidates, key=lambda k: (-rank(k), k)):
        c = candidates[key_]
        if important and not (important & set(tokens(c.text))) and semantic_best.get(key_, -1) < kb.min_similarity:
            continue
        if per_doc.get(c.document.id, 0) >= 2:
            continue
        per_doc[c.document.id] = per_doc.get(c.document.id, 0) + 1
        selected.append(key_)
        if len(selected) == limit:
            break
    kb._retrieval_cache[key] = (now, selected)
    kb._retrieval_cache.move_to_end(key)
    while len(kb._retrieval_cache) > 256:
        kb._retrieval_cache.popitem(last=False)
    return [kb.corpus.read(k, scope) for k in selected]
