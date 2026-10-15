"""Recall only the authenticated request's bounded transcript; never query another session."""
from . import Tool, ToolContext
from ..facts import ToolOutput


async def recall_conversation(ctx: ToolContext, args):
    speaker, selection = args["speaker"], args["selection"]
    turns = [turn for turn in ctx.conversation_history if speaker == "both" or turn.role == speaker]
    if selection == "last":
        turns = turns[-1:]
    if not turns:
        reply = "Chưa có tin nhắn trước đó phù hợp trong phần hội thoại đang lưu. Hội thoại mới hoặc đổi hồ sơ có thể bắt đầu lại lịch sử."
    else:
        lines = [("Bạn" if turn.role == "user" else "Trợ lý") + ": “" + turn.text + "”" for turn in turns]
        reply = "Trong phần hội thoại đang lưu:\n" + "\n".join(lines)
        if any(turn.role == "assistant" for turn in turns):
            reply += "\nĐây là trích lại hội thoại, không phải kết quả đọc lại hồ sơ hiện tại."
    ctx.conversation_reply = reply
    # Conversation text is explicitly separate from clinical facts and citations.
    return ToolOutput(notes=[reply])


CONVERSATION_TOOLS = (
    Tool("recall_conversation",
         "Đọc lại tin nhắn trong chính cuộc hội thoại hiện tại: người dùng đã nói/hỏi gì, trợ lý đã trả lời gì, "
         "hoặc các tin nhắn đã trao đổi. Hiểu ý định, không yêu cầu một câu mẫu cụ thể. "
         "Không dùng để trả giá trị bệnh án hiện tại; câu tiếp nối về bệnh án phải đọc tool hồ sơ mới.",
         {"speaker": {"type": "string", "enum": ["user", "assistant", "both"]},
          "selection": {"type": "string", "enum": ["last", "all"]}}, recall_conversation),
)
