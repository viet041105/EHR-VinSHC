"""Reference tools receive a server-authenticated scope, never a model-selected role/facility."""
from . import Tool, ToolContext, ref_param
from ..facts import Recorder, Source, ToolError


def require_knowledge(ctx):
    if ctx.knowledge is None or ctx.knowledge_scope is None:
        raise ToolError("Tìm tài liệu chưa được bật cho lượt hỏi này.")
    return ctx.knowledge, ctx.knowledge_scope


def record(ctx: ToolContext, chunks):
    rec = Recorder(ctx.registry)
    for chunk in chunks:
        d = chunk.document
        rec.ref("document", chunk.uuid, title=d.title, version=d.version, section=chunk.section)
        old = ctx.cache.get("document:" + chunk.uuid)
        if old is not None:
            rec.output.facts.append(old)
            continue
        source = Source(kind="document", uuid=chunk.uuid, field=None, recordedAt=None, status=d.status,
                        documentId=d.id, documentTitle=d.title, documentVersion=d.version,
                        documentSection=chunk.section,
                        sourceUrl=f"/v1/{ctx.persona}/knowledge/chunks/{chunk.uuid}")
        fact = rec.add("reference", f"{d.title} (v{d.version}) — {chunk.section}", chunk.text, "recorded", source)
        ctx.cache["document:" + chunk.uuid] = fact
        if d.status == "development":
            rec.note("Tài liệu mẫu dùng để phát triển; chưa phải tài liệu lâm sàng được duyệt cho môi trường thật.")
    return rec.output


async def search_documents(ctx, args):
    kb, scope = require_knowledge(ctx)
    chunks = await kb.search(args["query"], scope)
    result = record(ctx, chunks)
    if not chunks:
        from ..facts import Gap
        gap = Gap("reference", "Tài liệu tham khảo", "no_matching_document", "Không tìm thấy đoạn tài liệu phù hợp trong nguồn được phép đọc.")
        ctx.registry.gap(gap)
        result.gaps.append(gap)
    return result


async def read_document_chunk(ctx, args):
    kb, scope = require_knowledge(ctx)
    key, _ = ctx.registry.resolve(args["document_ref"], "document")
    return record(ctx, [kb.corpus.read(key, scope)])


KNOWLEDGE_TOOLS = (
    Tool("search_documents", "Tìm tài liệu tham khảo có dẫn nguồn về trường dữ liệu và cách dùng hệ thống. Không dùng để lấy kết quả của bệnh nhân hoặc đưa chẩn đoán/điều trị.",
         {"query": {"type": "string", "minLength": 1, "maxLength": 400,
                    "description": "Câu tìm kiếm về tài liệu; không đưa định danh hoặc dữ kiện bệnh nhân."}}, search_documents),
    Tool("read_document_chunk", "Đọc lại đoạn tài liệu theo mã D… do search_documents cấp trong lượt này; quyền và phiên bản được kiểm tra lại.",
         {"document_ref": ref_param("Mã D… đã nhận từ tool tìm tài liệu.")}, read_document_chunk),
)
