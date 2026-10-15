# Agent nâng cao — bàn giao để kiểm một lượt

Ngày 15/10/2026. Nhánh `feature/mvp3-agent-chatbot`.

## 1. Mở màn kiểm tra

Stack FE/BE tích hợp hiện chạy tại **http://127.0.0.1:5173/connected.html**.
Giới hạn và kết quả rà soát thực tế xem [AGENT_AUDIT_2026-10-15.md](AGENT_AUDIT_2026-10-15.md).

Playground dưới đây là màn mock tùy chọn tại **http://127.0.0.1:8002/dev/playground**;
không phải dữ liệu của stack tích hợp và không mặc định chạy sẵn.

Để mở playground mock:

```powershell
npm run agent:demo -- --port 8002
```

Màn này dùng hồ sơ synthetic và cùng API mà FE mới sẽ nối. Có chọn vai trò/hồ sơ/danh tính, nhớ hội thoại,
hiện tiến trình tool, bấm nguồn, xóa phiên và xem thống kê. Model demo chọn tool bằng luật; đây không phải
chất lượng ngôn ngữ của Gemini. Header ghi rõ model và chế độ RAG.

Thử lần lượt:

1. Bác sĩ, hồ sơ A: `Timeline toàn bộ lịch sử` — lượt 09/2026 và 10/2026, có nguồn/thời điểm.
2. `So sánh sinh hiệu với lần khám trước` — hai giá trị và hai nguồn. Fixture gốc có cùng giá trị nên
   chênh lệch là 0; test riêng kiểm mạch trước 70, hiện tại 82, chênh lệch +12 cùng đơn vị.
3. `Theo tài liệu unknown khác not_asked thế nào?` — nguồn metadata; bấm đọc tài liệu/mục/phiên bản.
4. `Chi tiết hơn` — dùng chủ đề trong phiên nhưng gọi lại tool đọc nguồn mới.
5. Hồ sơ B: `So sánh với lần khám trước` — báo thiếu nguồn lần trước, không bịa giá trị 0.
6. Hồ sơ C, bác sĩ A — từ chối quyền. Đổi bác sĩ B để thử quyền tại cơ sở B.
7. Bệnh nhân: thử timeline A, B/C — chỉ A có bản công bố hiện tại; B chưa công bố, C đã thu hồi.
8. `Xem hồ sơ mẹ tôi`, `Tôi nên tăng liều thuốc?` hoặc injection — từ chối, không gọi tool đọc hồ sơ khác.
9. Đổi danh tính/hồ sơ/vai trò — không dùng được phiên cũ ở ngữ cảnh mới.

## 2. Những phần đã có

| Phần | Hành vi | Code chính |
| --- | --- | --- |
| Timeline bác sĩ | Liệt kê lượt và đọc chi tiết có giới hạn, giữ thời gian/trạng thái/nguồn. Sinh hiệu lấy trong summary, không gọi summary sai cho phiếu điều dưỡng | `tools/timeline.py` |
| So sánh lần trước | Tìm phiếu trước ở lượt khác, ghép trường chắc chắn, giữ hai nguồn; chênh lệch số chỉ tính khi cùng đơn vị | `tools/timeline.py`, `facts.py` |
| Timeline bệnh nhân | Chỉ lượt công bố hợp lệ của tài khoản, lời dặn và đơn đã xác nhận | `tools/timeline.py`, portal adapter |
| RAG nâng cao | Tối đa 3 truy vấn theo thuật ngữ metadata; BM25 + embedding tùy chọn + RRF, xếp hạng lại và đa dạng đoạn | `retrieval.py`, `knowledge.py` |
| Cache retrieval | 256 mục, TTL 60 giây, chỉ mã đoạn và khóa băm có scope/nguồn; kiểm quyền/hash trước cả cache hit | `retrieval.py` |
| Nhớ hội thoại | RAM, 15 phút, tối đa 256 phiên/6 cặp hỏi đáp, gắn actor/context; model hiểu câu tiếp nối và chọn `recall_conversation` khi cần nhắc tin nhắn | `runtime.py`, `app.py`, `tools/conversation.py`, `prompts.py` |
| Tool song song | Các tool đọc trong một vòng chạy song song; giữ đúng tool-result, hủy đọc còn lại khi lỗi nghiêm trọng | `agent.py` |
| Streaming | SSE tiến trình và câu trả lời sau validator, có dừng request và lỗi | `agent.py`, `app.py` |
| Lỗi model | Retry có giới hạn của provider; 3 lỗi transient mở circuit 30 giây rồi thử phục hồi; không tự đổi sang fake | `runtime.py`, provider adapters |
| Guardrail | Injection bị chèn ký tự/bọc base64, lọc mẫu API key/JWT, cách ly chỉ dẫn trong hồ sơ, chặn yêu cầu đổi điều trị/ghi hồ sơ | `guardrails.py`, `facts.py` |
| Quan sát | Request ID, model/tool calls, rounds, latency, lỗi model, token usage nếu có; metrics không chứa bệnh án | `app.py`, `runtime.py` |
| Eval/CI | 24 ca synthetic có expected routing/quyền/thiếu nguồn/giá trị; JSON/Markdown có Git HEAD/hash code/mẫu số/giới hạn | `evaluate.py`, `evaluations/cases.json`, workflow agent |

Reranker là **luật tất định**, chưa phải cross-encoder được huấn luyện. Lớp nhớ là store RAM của ứng dụng,
không phải checkpoint bền vững hay vector memory. Restart service xóa phiên. Mỗi lượt vẫn đọc lại nguồn;
câu trả lời cũ không được dùng làm dữ kiện mới.

Câu hỏi về chính cuộc trò chuyện nằm trong phạm vi hỗ trợ. Gemini chọn tool nhắc hội thoại theo
ý định, không qua danh sách câu cố định. Tool chỉ đọc transcript đã giới hạn của phiên hiện tại;
phần trích hội thoại có nhãn riêng, không phải nguồn bệnh án. Câu tiếp nối hỏi bệnh án vẫn dùng
tool hồ sơ mới và đi qua kiểm tra nguồn.
Chọn tool hội thoại chưa đủ để trả kết quả: model phải kết thúc lượt, xác nhận scope của yêu cầu
hiện tại sau khi đọc kết quả tool. Yêu cầu mới không bị thay bằng câu hỏi cũ. Nguồn clinical có danh
sách trống được mô tả bằng fact có nguồn, không suy thành kết luận âm tính hay lỗi model.

Trường thiếu/có nhiều hàng chưa đủ row identity báo `unmatched_comparison`, không ghép theo vị trí mảng.
Không kết luận tốt/xấu hay đưa chẩn đoán mới. Thuốc/dị ứng có thể phản ánh trạng thái lúc đọc, không tự
được xem là snapshot lịch sử. Timeline đọc chi tiết tối đa 4 phiếu trong 8 lượt gần nhất; còn nguồn thì báo giới hạn.

## 3. Contract cho FE mới

Giữ `/v1/doctor/chat` và `/v1/patient/chat`, thêm trường tùy chọn:

```json
{"message":"Timeline toàn bộ lịch sử","remember":true,"stream":false}
```

Response thêm `conversationId`, `conversationRevision`, `diagnostics`. Câu sau gửi `conversationId`
server đã trả; không gửi thêm `history` tự tạo. Bác sĩ vẫn gửi patient/visit/encounter từ màn hình. Bệnh nhân
không gửi patientId; server lấy danh tính qua phiên. Đổi context phải tạo phiên mới. Backend xác nhận
workspace/actor, không tin header lựa chọn FE nếu chưa kiểm.

Không bật `remember` thì API giữ stateless như trước. Xóa phiên của tài khoản:

```text
DELETE /v1/{doctor|patient}/conversations/{conversationId}
```

Request trùng phiên đang xử lý: `409 conversation_busy`; phiên khác actor/context/hết hạn:
`404 conversation_not_found`. Không lưu vào database bệnh nhân. Production nhiều worker cần store chung
có TTL/quyền/atomic lock; RAM hiện tại phục vụ chạy độc lập và kiểm contract.

Gửi `stream=true` bằng fetch POST với Authorization/workspace. Phản hồi `text/event-stream` gồm:

```text
start    -> requestId
progress -> thinking / tool_start / tool_end (chỉ tên tool và trạng thái)
answer   -> text + sources đã được validator kiểm
final    -> ChatOut đầy đủ, gồm status, missing, phiên và diagnostics
done     -> requestId
error    -> code + detail an toàn nếu lỗi phát sinh sau khi mở stream
```

Sai auth/context trước stream vẫn là HTTP lỗi. Không phát token model chưa kiểm, chain-of-thought,
prompt hay raw tool payload. FE dùng AbortController để dừng và bỏ phản hồi cũ khi đổi actor/context.
Mỗi ý so sánh có nguồn cũ và mới trong `sources[]`. RAG giữ `kind=document` theo [AGENT_RAG.md](AGENT_RAG.md).

`GET /v1/doctor/metrics` cần workspace bác sĩ xác thực. Đếm lượt graph có kết quả, không phải mọi HTTP
request: status/model/tool calls, mẫu latency gần nhất và cache statistics; không có câu hỏi/hồ sơ/danh tính.
`costUSD=null` khi chưa đủ usage/giá để tính; không bịa chi phí.

## 4. Kiểm tra một lượt

```powershell
npm run agent:review
```

Chạy test agent rồi baseline **offline**, không gọi Gemini/Claude. Báo cáo trong `.runtime/reports/`:

- `agent-advanced.json` và `agent-advanced.md`.
- `agent-playground-1440.png` và `agent-playground-390.png`: ảnh kiểm UI.

Lần kiểm hiện tại: **243 test qua, 24/24 ca baseline qua, 128/128 ý có nguồn**. Đây là độ phủ dẫn nguồn
trong bộ synthetic/model demo, không phải “100% chính xác y khoa”. Chưa có đáp án prose bác sĩ duyệt và
chưa đo chất lượng model thật trên người dùng. Browser đã kiểm SSE, timeline, source, follow-up, đổi
role/context và công bố hồ sơ ở desktop/mobile.

Thử model thật riêng, có giới hạn số ca:

```powershell
npm run agent:eval -- --model gemini --limit 1
```

Cần `.env` có credential và cờ cho phép gửi dữ liệu synthetic. Report lưu riêng
`agent-advanced-live.json/.md`, không ghi đè demo. Có thể thêm `--rag gemini` sau khi tạo index.
CI chỉ chạy offline, không tự chạy 24 ca qua API thật.

Gemini chat hiện vẫn **HTTP 503 trước khi chọn tool**, nên ca thật chưa đạt. Embedding nâng cao đã thử
thành công: tìm đúng tài liệu sinh hiệu; lần hai có cache hit, không gọi embedding lại. Để bật semantic:

```powershell
npm run agent:rag:index
npm run agent:dev -- --rag gemini
```

8001 dùng model trong `.env`, 8002 dùng demo. Dừng service đang chiếm cổng trước khi chạy lại cùng cổng.
Không đổi `.env` hoặc dùng fake để che lỗi upstream.

## 5. Cấu hình và bàn giao BE

Trong mock, nâng cao mặc định bật; trong HTTP mặc định tắt. Bật sau khi đã nối adapter/quyền BE:

```dotenv
VINSHC_AGENT_ADVANCED_ENABLED=true
VINSHC_AGENT_CONVERSATION_TTL=900
VINSHC_AGENT_CONVERSATION_LIMIT=256
VINSHC_AGENT_MODEL_CIRCUIT_FAILURES=3
VINSHC_AGENT_MODEL_CIRCUIT_COOLDOWN=30
```

BE trả lượt/encounter có thời điểm, nguồn, metadata/status và quyền theo account/facility. Agent không tự
yêu cầu bảng hồ sơ mới. Interface/dữ liệu mẫu xem [AGENT_DATA_HANDOFF.md](AGENT_DATA_HANDOFF.md).

Gói vẫn chỉ đọc. Ghi/chốt hồ sơ, kê/đổi thuốc, scheduler/gửi thông báo cho người thật cần contract và luồng
xác nhận riêng, chưa mở bằng gói này. Corpus là tài liệu phát triển, chưa phải phác đồ được chuyên môn duyệt.
Mock không chứng minh quyền BE mới đúng; cần kiểm lại khi nối dữ liệu/API thật.

CI đã thêm baseline, lưu report và kiểm khởi động image với dữ liệu synthetic. Docker đã build và kiểm
thành công image `vinshc-agent:advanced-check`: HTTP health, tài liệu/hồ sơ mẫu/playground, timeline,
so sánh, RAG, phiên nhớ, SSE và từ chối sai quyền. Image chạy UID 10001. Đã sửa root tài nguyên khi cài
wheel: Docker đặt `VINSHC_AGENT_ASSET_ROOT=/app`, thay vì tìm trong site-packages. Kiểm tra không cần
API model hoặc database. Đây là kiểm image agent, chưa phải tích hợp với BE mới. Chưa commit/push.

## 6. Nguồn kỹ thuật

[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence),
[LangGraph streaming](https://docs.langchain.com/oss/python/langgraph/streaming) và
[Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).
