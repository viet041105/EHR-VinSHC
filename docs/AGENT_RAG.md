# RAG tài liệu cho agent VinSHC — bản đầu

Đã bổ sung mở rộng truy vấn, xếp hạng lại, cache, phiên nhớ, timeline và baseline synthetic;
xem [AGENT_ADVANCED.md](AGENT_ADVANCED.md) cho bản bàn giao hiện tại. Tài liệu dưới giữ contract nguồn của RAG.

Kết quả rà soát FE/BE/model thật và giới hạn của từng tính năng được cập nhật tại
[AGENT_AUDIT_2026-10-15.md](AGENT_AUDIT_2026-10-15.md). Các lượt 503/timeout bên dưới là lịch sử kiểm tra;
stack local hiện tạm dùng Gemini 3.5 Flash-Lite, corpus vẫn là metadata development.

## Test trên giao diện local đang chạy

Ngày 15/10/2026 đã bật corpus mẫu cho stack `ehr-vinshc` tại
http://127.0.0.1:5173/connected.html. Agent vẫn lấy hồ sơ qua BE HTTP và dùng Gemini;
khâu tìm tài liệu đang dùng BM25 cùng mở rộng truy vấn/xếp hạng/cache, chưa bật embedding ở stack này.
Ba biến local trong `infra/agent/.env` là `VINSHC_AGENT_KNOWLEDGE_ENABLED=true`,
`VINSHC_AGENT_KNOWLEDGE_ALLOW_DEVELOPMENT=true`, `VINSHC_AGENT_KNOWLEDGE_MODE=offline`.
Đây là bật chủ động cho tài liệu development, không phải nguồn y khoa đã được duyệt.

Đăng nhập bác sĩ, chọn hồ sơ có sẵn rồi thử:

| Câu hỏi | Đối chiếu nguồn |
| --- | --- |
| Theo tài liệu, unknown khác not_asked như thế nào? | Trường dữ liệu và trạng thái thiếu → not_recorded, not_asked và unknown |
| Theo tài liệu, SpO2 dùng đơn vị nào? | Sinh hiệu trong metadata VinSHC → Đơn vị tám sinh hiệu |
| Theo tài liệu, final có đồng nghĩa published không? | Hướng dẫn xem hồ sơ trên cổng bệnh nhân → Hồ sơ final và hồ sơ published |
| Theo tài liệu, R_BP kiểm tra cặp huyết áp thế nào? | Sinh hiệu trong metadata VinSHC → Cặp huyết áp R_BP |

Trả lời phải có nguồn tài liệu; bấm nguồn để đọc đúng mục và phiên bản. Corpus hiện tại có
5 tài liệu/16 đoạn được biên soạn từ repo, chưa nạp toàn bộ PDF mẫu 195 trang của mentor.
Đã kiểm tra endpoint tìm đoạn và đọc nguồn có xác thực trên web proxy.
Lỗi kết nối/503 từ Gemini có thể làm lượt chat dừng trước tool dù endpoint retrieval vẫn hoạt động;
không tự chuyển sang model giả khi gặp lỗi này.
Trong lần bật cấu hình này, retrieval tìm đúng mục `not_recorded, not_asked và unknown` và mở nguồn đạt;
hai lượt chat Gemini liên tiếp hết thời gian chờ khoảng 45 giây (`modelError=connection`),
chưa gọi tool. Vì vậy chưa xác nhận lượt chat RAG đầy đủ bằng model thật ở lần kiểm tra này.
Report: `.runtime/current-database/rag-web-smoke.json` và `rag-web-retry.json`.

Kiểm tra tiếp ngày 15/10/2026 xác nhận lỗi gián đoạn: model metadata trả 200 nhưng
generateContent có lúc trả `503 UNAVAILABLE` hoặc hết thời gian chờ. Một lượt chat RAG
qua web proxy sau đó đạt `ok` trong khoảng 32 giây, gọi `search_documents`, trả 3 ý có nguồn
và `modelError=null`. Cấu hình local đã bật một lần thử lại lỗi tạm thời; API chat hiển thị
riêng lỗi kết nối, dịch vụ không sẵn sàng và giới hạn lượt gọi. Không thay model khi lỗi.
Đây là smoke test với corpus development, chưa phải đánh giá độ chính xác lâm sàng.

Khi 3.8 tiếp tục trả 503 sau retry, kiểm tra giao thức gọi tool trên cùng 3 yêu cầu synthetic
cho kết quả 3.8 thành công 1/3, 3.5 Flash-Lite thành công 3/3. Cấu hình local đã tạm chọn
`VINSHC_AGENT_GEMINI_MODEL=gemini-3.5-flash-lite`; không tự đổi model trong một cuộc hội thoại.
Đây chỉ là kiểm tra kết nối nhỏ, không chứng minh độ ổn định hoặc chất lượng dài hạn.
Câu chào/giới thiệu chức năng đứng riêng được trả bằng nội dung cố định sau xác thực và guardrail,
không gọi model hay lấy dữ kiện bệnh nhân. Câu vừa chào vừa hỏi hồ sơ vẫn chạy model và tool bình thường.
Sau cập nhật container, kiểm tra qua web proxy đạt: chào `ok` không gọi model (khoảng 0,05 giây),
hỏi mạch `ok` có nguồn BE (khoảng 7 giây), hỏi trạng thái thiếu `ok` có nguồn tài liệu (khoảng 13 giây).
Hai lượt hỏi dữ liệu dùng Gemini 3.5 Flash-Lite thật; lượt hồ sơ chỉ dùng bản ghi đã biết là synthetic.
Report local: `.runtime/current-database/greeting-and-model-20261015.json`.

## 1. Phần này giải quyết việc gì?

Agent hiện có hai nguồn riêng:

| Câu hỏi | Nguồn phải đọc | Ví dụ |
| --- | --- | --- |
| Hồ sơ của một bệnh nhân | Tool đọc backend/mock, với danh tính người hỏi | “Sinh hiệu lần khám này?” |
| Cách hiểu dữ liệu hoặc dùng hệ thống | Tool tìm trong tài liệu được phép đọc | “unknown khác not_asked thế nào?” |
| Hỏi cả hai | Đọc hai nguồn, trả thành các ý riêng | “SpO2 đã ghi là bao nhiêu, đơn vị trong metadata là gì?” |

RAG ở đây là tìm đoạn liên quan rồi đưa đoạn có nguồn vào lượt trả lời của model. Nó không tạo database
bệnh nhân mới. Dữ liệu bệnh nhân tiếp tục thuộc BE; khi BE mới sẵn sàng, đổi adapter theo
[AGENT_DATA_HANDOFF.md](AGENT_DATA_HANDOFF.md). Không đưa hồ sơ bệnh nhân vào index tài liệu này.

## 2. Đã triển khai

- Corpus version `0.1.0`: 5 tài liệu Markdown, 16 đoạn. Nội dung được biên soạn từ metadata/contract có trong
  repo, gồm trạng thái thiếu, sinh hiệu, Patient/Visit/Encounter, công bố hồ sơ và đơn thuốc/lịch hẹn.
- Manifest lưu mã, tên, phiên bản, hash nội dung, nguồn biên soạn, vai trò được đọc, cơ sở áp dụng, trạng thái
  và khoảng hiệu lực. Tất cả tài liệu hiện tại là `development`, synthetic; chưa có người duyệt lâm sàng.
- Chia đoạn theo tiêu đề, tối đa 750 ký tự, không cắt giữa một từ. Markdown dẫn theo mục, không bịa số trang PDF.
- Tool `search_documents(query)` tìm đoạn có nguồn. Tool `read_document_chunk(document_ref)` chỉ đọc mã D…
  do lượt tìm trước cấp; không nhận URL, đường dẫn file, patientId, role hoặc facility từ model.
- Câu trả lời có tên tài liệu, phiên bản, mục và endpoint đọc nguồn. Mỗi lần mở nguồn lại kiểm quyền.
- Xác thực tại API và lọc tài liệu theo vai trò/cơ sở/hiệu lực **trước khi** tính thứ hạng. Người bệnh chỉ đọc
  hai hướng dẫn công khai của corpus mẫu, không đọc metadata kỹ thuật dành cho bác sĩ.
- Kiểm hash khi đọc/tìm và trước khi trả câu có nguồn tài liệu. Nguồn thay đổi trong lúc chạy thì trả lỗi,
  cần kiểm tra manifest, nạp lại service và tạo lại index nếu dùng embedding.
- Nội dung có mẫu injection bị cách ly khi nạp. Truy vấn injection bị từ chối. Đây là lớp kiểm tra bằng luật,
  chưa bảo đảm nhận diện mọi cách tấn công.
- Không trộn nguồn tài liệu và nguồn hồ sơ trong cùng một ý trả lời. Phần tài liệu được ghi rõ
  “Tài liệu tham khảo”. Thiếu kết quả thì báo thiếu, không tự điền bằng kiến thức model.
- Câu trả lời giữ cách dựng từ dữ kiện nguồn của MVP: model chọn dữ kiện và thứ tự; server hiển thị nội dung
  nguồn. Bản này chưa mở diễn giải tự do, chẩn đoán mới, phác đồ hay thay đổi điều trị.

## 3. Hai chế độ tìm kiếm

| Chế độ | Cách làm | Cần API? | Trạng thái kiểm tra |
| --- | --- | --- | --- |
| `offline` | BM25, chuẩn hóa tiếng Việt để tìm từ khóa | Không | Đã chạy với corpus và API local |
| `gemini` | Embedding tài liệu/query, cosine similarity, ghép thứ hạng với BM25 bằng RRF | Có | Đã tạo index 16 đoạn và thử truy vấn embedding thật qua API/graph; phần sinh câu trả lời dùng model demo |

Offline không phải embedding ngữ nghĩa. Chế độ Gemini dùng `gemini-embedding-001`, 768 chiều,
`RETRIEVAL_DOCUMENT` và `RETRIEVAL_QUERY`; tách biệt với model chat trong `.env`.
Model chat có thể là Gemini, Claude hoặc fake trong cả hai chế độ retrieval.

Index Gemini được lưu mặc định ở `.runtime/agent-rag/gemini-768.json`, bị Git bỏ qua. Nó chứa vector và mã đoạn,
không chứa API key hoặc hồ sơ bệnh nhân. Cùng corpus/model/số chiều thì lệnh index tái dùng cache hợp lệ;
đổi nguồn/phiên bản thì tạo lại. Không gọi API embedding tài liệu ở mỗi câu hỏi.

Khi dùng embedding, truy vấn được ẩn CCCD/SĐT/email và bỏ UUID trước khi gửi; việc ẩn này không bảo đảm
loại mọi dữ liệu cá nhân khỏi một câu tự do. Giai đoạn hiện tại chỉ thử với hồ sơ và tài liệu synthetic.
Nguồn có `allowExternalEmbedding=false` sẽ chặn chế độ này. Không âm thầm chuyển sang offline khi API lỗi.

API và cơ chế ghép thứ hạng được đối chiếu với [Gemini Embeddings](https://ai.google.dev/api/embeddings)
và [mô tả RRF của Microsoft](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking).

## 4. Chạy thử

Tại gốc repo, cài môi trường một lần nếu chưa có:

```powershell
npm run agent:setup
```

Kiểm tra corpus, không cần chạy service:

```powershell
npm run agent:rag:check
```

Chạy toàn bộ luồng với model demo offline, rồi ở terminal khác hỏi:

```powershell
npm run agent:demo
# Terminal khác:
npm run agent:chat
```

Ví dụ câu hỏi:

- `Theo tài liệu, SpO2 dùng đơn vị nào?`
- `unknown khác not_asked thế nào?`
- `Sinh hiệu lần khám này và theo tài liệu đơn vị SpO2 là gì?`
- Với người bệnh: `Theo tài liệu, final khác published thế nào?`

Tìm tài liệu riêng, không gọi model chat:

```powershell
npm run agent:rag:search -- "SpO2 dùng đơn vị nào?"
npm run agent:rag:search -- "final khác published thế nào?" --persona patient
```

Nếu service khác đã chiếm cổng 8001, dùng cùng một `--port` cho service/chat/search, ví dụ 8002.
Ctrl+C dừng service; `/quit` thoát chương trình chat, không dừng service.

Để thử Gemini embedding thật, cần `GEMINI_API_KEY` và `VINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true`
trong `infra/agent/.env` (đã bị Git bỏ qua). Sau đó:

```powershell
npm run agent:rag:index
npm run agent:dev -- --rag gemini
# Terminal khác:
npm run agent:rag:search -- "SpO2 dùng đơn vị nào?"
npm run agent:chat
```

Chỉ chạy service thứ hai khi service ở cùng cổng đã dừng. Có thể dùng `agent:demo -- --rag gemini` để thử
embedding thật với model chat fake; màn hình phải ghi rõ hai chế độ này. Không coi kết quả fake là
chất lượng của model thật.

`agent:dev` giữ nguyên model chat trong `.env`. Lần trước Gemini chat trả 503 trước khi chọn tool;
thêm RAG không sửa lỗi upstream đó. Endpoint tìm tài liệu riêng giúp kiểm retrieval độc lập.

## 5. Hợp đồng BE/FE

API chat giữ nguyên `POST /v1/doctor/chat` và `POST /v1/patient/chat`.
Trong `answer[].sources[]`, nguồn tài liệu có:

```json
{
  "kind": "document",
  "uuid": "<UUID đoạn>",
  "documentId": "vitals",
  "documentTitle": "Sinh hiệu trong metadata VinSHC",
  "documentVersion": "0.1.0",
  "documentSection": "Đơn vị tám sinh hiệu",
  "sourceUrl": "/v1/doctor/knowledge/chunks/<UUID đoạn>",
  "status": "development"
}
```

Các trường nguồn hồ sơ vẫn giữ như cũ. Đối với Markdown không có page. `recordedAt`, `field`,
`encounterUuid` và `visitUuid` của nguồn tài liệu không được giả thành dữ kiện bệnh nhân.

API mới:

| Endpoint | Request | Quyền |
| --- | --- | --- |
| `POST /v1/doctor/knowledge/search` | `{ "query": "...", "limit": 3 }` | Xác thực và workspace bác sĩ hợp lệ |
| `GET /v1/doctor/knowledge/chunks/{uuid}` | UUID đoạn | Kiểm lại workspace và quyền nguồn |
| `POST /v1/patient/knowledge/search` | Cùng body | Xác thực tài khoản bệnh nhân; chỉ nguồn public cho patient |
| `GET /v1/patient/knowledge/chunks/{uuid}` | UUID đoạn | Kiểm lại danh tính và quyền nguồn |

Truy vấn tối đa 400 ký tự; limit 1–4. Không cho caller chọn role/facility trong body.
Header xác thực dùng adapter hiện tại. BE mới sẽ cấp thông tin vai trò/cơ sở từ phiên đã xác thực;
không tin header do FE gửi nếu chưa kiểm tại server.

FE mới cần phân biệt `kind=document`, hiển thị tên/phiên bản/mục và mở nguồn qua API agent có xác thực.
Không dùng nguồn này để mở phiếu khám. Client FE hiện có đã thêm đọc nguồn tài liệu bằng đường dẫn cố định,
kiểm phản hồi muộn khi đổi phiên và không dùng URL ngoài do câu trả lời đưa vào.
Đằng sau gateway hiện tại, thêm prefix `/agent` khi gọi endpoint. Service standalone không có prefix đó.

## 6. File và cách thêm tài liệu

| File | Mục đích |
| --- | --- |
| `infra/agent/knowledge/manifest.json` | Danh mục nguồn, phiên bản, hash và quyền |
| `infra/agent/knowledge/documents/*.md` | Nội dung tham khảo mẫu |
| `infra/agent/src/vinshc_agent/knowledge.py` | Nạp nguồn, chia đoạn, quyền, BM25, embedding, index và RRF |
| `infra/agent/src/vinshc_agent/tools/knowledge.py` | Tool tìm/đọc tài liệu |
| `infra/agent/tests/test_knowledge.py` | Test kỹ thuật retrieval, quyền, nguồn và graph |
| `scripts/agent_rag.py` | Lệnh check/index/search |

Khi thêm hoặc sửa tài liệu: xác minh nguồn; chỉnh Markdown và manifest; tăng phiên bản nếu nội dung thay đổi;
cập nhật SHA-256; kiểm corpus; khởi động lại service; tạo lại index nếu dùng Gemini; chạy test và kiểm nguồn.
ID tài liệu giữ ổn định khi đổi nhãn; mã đoạn thay đổi theo nội dung/phiên bản. Nguồn cũ không được tự trỏ sang bản mới.
Không cấp `approved` cho tài liệu mẫu để vượt kiểm tra. Nguồn thật cần người phụ trách duyệt và chốt quyền sử dụng.

Biến môi trường:

```dotenv
# Không đặt biến ENABLED: mặc định bật trong mock, tắt trong http.
VINSHC_AGENT_KNOWLEDGE_ENABLED=true
VINSHC_AGENT_KNOWLEDGE_MODE=offline
# VINSHC_AGENT_KNOWLEDGE_MANIFEST=<đường dẫn manifest>
# VINSHC_AGENT_KNOWLEDGE_INDEX=<đường dẫn index Gemini>
```

Corpus synthetic không được bật trong chế độ `http`. Docker đã có cấu hình đóng gói corpus;
mặc định RAG vẫn tắt trong chế độ đó. Image đã build và kiểm khởi động/tài nguyên thành công;
Docker đặt `VINSHC_AGENT_ASSET_ROOT=/app` để package tìm đúng corpus/fixture/playground.

## 7. Việc tiếp theo

1. Chọn tài liệu thực sự cần cho bác sĩ/bệnh nhân, xác nhận nguồn và người duyệt. Corpus hiện tại dùng để thử
   contract, chưa bao phủ tài liệu y khoa, toàn bộ PDF mentor hoặc phác đồ bệnh viện.
2. Kiểm toàn bộ lượt chat bằng model Gemini thật khi generate API hoạt động ổn định. Embedding đã thử được;
   chưa có số liệu chất lượng hoặc hiệu năng thực tế cho phiên bản RAG này.
3. Nối xác thực và adapter với BE mới; FE nối API chat và dẫn nguồn. Kiểm lại quyền trên dữ liệu/cơ sở thật.
4. Đã có baseline synthetic, mở rộng truy vấn/reranker bằng luật, phiên nhớ và timeline trong gói nâng cao.
   Đánh giá model thật với đáp án chuyên môn và triển khai nguồn thật xem [AGENT_ADVANCED.md](AGENT_ADVANCED.md).

## 8. Kết quả kiểm tra lần triển khai này

- 218 test agent qua, gồm 51 ca kỹ thuật RAG; không gọi model thật trong bộ pytest.
- 24 test FE qua; build FE qua. Test browser đã kiểm mở nguồn tài liệu, đổi phiên bản nguồn và giữ các
  luồng hiện có trên desktop 1440px và mobile 390px, cùng luồng cổng bệnh nhân.
- Đã gọi Gemini embedding thật, tạo index 16 đoạn/768 chiều; gọi index lần hai tái dùng cache, không gọi API.
- Đã thử tool RAG qua graph/API với embedding thật và model chat demo: trạng thái `ok`, nguồn đứng đầu là
  tài liệu sinh hiệu đúng mục đơn vị; endpoint mở nguồn trả 200 sau xác thực.
- Thử model chat Gemini thật qua service local vẫn nhận lỗi upstream `http_503`, trước khi chọn tool.
  Chưa xác nhận được toàn bộ luồng chat bằng model thật.
- Docker build và kiểm tra startup/tài nguyên đã qua. CI đã thêm smoke test image cho corpus/fixture/
  playground và timeline, ngoài pytest/build hiện có.

Service local đang có ở 8001 (model Gemini) và 8002 (model fake); cả hai hiện dùng retrieval offline.
Index Gemini đã chuẩn bị, nhưng chỉ dùng khi khởi động với `--rag gemini`. Các thay đổi vẫn ở nhánh
`feature/mvp3-agent-chatbot`, chưa commit/push trong lần triển khai này.
