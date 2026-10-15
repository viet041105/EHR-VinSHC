# Rà soát agent ngày 15/10/2026

Nhánh: `feature/mvp3-agent-chatbot`. Stack local: `http://127.0.0.1:5173/connected.html`.
Phân biệt code có sẵn, kiểm thử synthetic và hành vi đã chạy với BE/Gemini thật.
Đây là kiểm tra kỹ thuật; chưa phải nghiệm thu chất lượng lâm sàng hay độ ổn định production.

## Trạng thái từng phần

| Phần | Đã có và đã kiểm tra | Giới hạn còn lại |
| --- | --- | --- |
| Hỏi đáp hồ sơ | Web gọi agent, Gemini 3.5 Flash-Lite chọn tool, tool gọi BE HTTP của stack hiện tại; sinh hiệu có nguồn mở được | Hồ sơ dùng để gọi model được xác định là synthetic. Tóm tắt có thể ở trạng thái `limited` khi một số ý bị validator loại; chưa đánh giá độ đầy đủ/độ chính xác lâm sàng |
| Timeline | Có tool liệt kê lượt khám và đọc chi tiết; đã gọi được BE thật | Tối đa 8 lượt gần nhất, chi tiết tối đa 4 phiếu. Bệnh nhân đang thử chỉ có 1 lượt; chưa chứng minh chuỗi nhiều lượt trên DB local này |
| So sánh | Có tính chênh lệch cùng đơn vị và giữ hai nguồn; positive case kiểm bằng fixture synthetic, gồm mạch 70 → 82 | DB local của bệnh nhân đang thử chưa có lần trước. Trường hợp này phải trả `not_found` và nêu thiếu phiếu trước, không tự suy giá trị 0 |
| RAG | Tìm đoạn, dẫn nguồn và mở lại đúng phiên bản đã chạy qua web với Gemini thật | 5 Markdown/16 đoạn về metadata và quy tắc hệ thống; BM25 + mở rộng truy vấn/xếp hạng/cache. Chưa phải kho tài liệu y khoa, chưa nạp PDF mentor 195 trang; chưa bật embedding trong stack này |
| Guardrail/quyền | Kiểm tra user/workspace, quan hệ patient–visit–encounter trước phản hồi dương tính, kiểm nguồn/số/định danh, tách quyền bệnh nhân và bác sĩ; có ca âm tính | Kiểm thử hữu hạn không chứng minh model không bao giờ sai. Validator không phải đánh giá ngữ nghĩa/lâm sàng toàn diện |
| Nhớ hội thoại | FE dùng `remember`/`conversationId`; model đọc lịch sử để hiểu câu tiếp nối và chọn `recall_conversation` để nhắc tin nhắn; không qua danh sách câu cố định | RAM, TTL 15 phút, tối đa 6 cặp hỏi/đáp. Không có lịch sử bền vững qua lần tải trang/đăng nhập. Lịch sử không được dùng thay nguồn hồ sơ |
| Giao diện | Desktop/mobile, trạng thái chờ, dừng chờ, thử lại, mở nguồn, đổi ngữ cảnh và bỏ phản hồi cũ có kiểm thử | FE hiện dùng JSON. SSE có ở API, chưa nối streaming vào màn này. Dừng chờ hủy chờ phía FE; request phía server có thể còn chạy, nên lượt kế tiếp dùng phiên mới với lịch sử giới hạn |
| Cổng bệnh nhân | Có API/adapter/FE và các kiểm thử tài khoản, bản công bố, nguồn và phân quyền bằng synthetic | DB local hiện có **0 tài khoản portal hoạt động, 0 bản công bố hoạt động**. Chưa thể báo là luồng bệnh nhân đã dùng được trên DB này |

## Các lỗi phát hiện và sửa trong lần rà soát

1. FE chỉ giữ lượt có `answer[]`; câu chào là `message` bị bỏ. Đồng thời FE chưa dùng phiên nhớ server.
2. Câu hỏi về hội thoại bị ép vào chính sách chỉ chấp nhận nguồn bệnh án/tài liệu. Bản sửa đầu nhận diện bằng câu cố định còn bỏ sót “tôi mới nói gì”; đã thay bằng model chọn tool hội thoại theo ý định.
3. Không có lần khám trước nhưng lời diễn giải không có fact ID bị validator loại, làm hiện `limited`.
4. HTTP adapter chưa xác minh quan hệ patient–visit–encounter trước các câu không gọi tool. Tool có kiểm tra nguồn nhưng chưa đủ cho câu chào/đọc lịch sử.
5. Dừng graph ngay sau `recall_conversation` khiến một lần chọn nhầm tool được hiển thị như câu trả lời đúng. Đã bỏ đường tắt: model phải đối chiếu lại với yêu cầu hiện tại, chốt scope, rồi mới được hiển thị transcript. Không ghép transcript vào phản hồi ngoài phạm vi.
6. Nguồn thuốc/chỉ định/danh sách khác trống chỉ có `gap`, nên không có fact để dẫn nguồn. Đã cho phép fact mô tả đúng sự vắng mặt trong nguồn đã đọc, kèm nguồn mở lại được. Điều này không phải khẳng định bệnh nhân không dùng thuốc/không có bệnh.
7. Mỗi câu hỏi hẹp bị gắn toàn bộ mục thiếu của summary. Đã lọc theo phần được trả lời; tóm tắt tổng thể vẫn giữ các mục thiếu. FE mở phần thiếu với nội dung rõ, bỏ mục đã được giải thích trong câu trả lời và gộp ghi chú kỹ thuật dưới phần nguồn.

Bản sửa giữ cả câu chào/câu trả lời thông thường, dùng phiên nhớ gắn user/workspace/hồ sơ,
khôi phục lịch sử giới hạn khi phiên hết hạn và không gửi đồng thời `history` với `conversationId`.
Câu nhắc lịch sử có nhãn rõ là hội thoại; không tạo citation bệnh án giả. Không có phiên trước thì nói rõ.
Prompt phân biệt câu hỏi về cuộc trò chuyện với câu tiếp nối về bệnh án. Nếu model viết thẳng câu trả lời
không nguồn trước khi gọi bất kỳ tool nào, agent cho một lần sửa để đọc đúng nguồn; vẫn kiểm tra đầu ra,
không hạ yêu cầu nguồn và không lặp vô hạn. Câu hỏi bệnh án trong lượt sau phải đọc lại tool hiện tại.
Thiếu lần khám trước được trả bằng thông tin thiếu do tool/BE xác định.
Mỗi phản hồi dương tính của bác sĩ phải qua xác minh ngữ cảnh; snapshot dùng xác minh được tái sử dụng
trong cùng request, không gửi toàn bộ cho model nếu tool không yêu cầu. Yêu cầu bị guardrail chặn vẫn dừng trước đọc chart.

## Kiểm chứng

- Agent: **305 test qua** sau sửa luồng kiểm tra cuối và nguồn trống, chạy bằng môi trường theo `infra/agent/constraints.txt`.
- FE: **31 unit test qua**, build qua, đối chiếu 127 route BE qua. Route coverage không chứng minh mọi nghiệp vụ đã chạy.
- 7 bộ browser FE và 2 bộ browser agent qua với API mock; có desktop/mobile, nhớ phiên,
  hết phiên, backend chưa bật memory, mở nguồn, đổi bệnh nhân, stop/retry và chống phản hồi cũ.
- Kiểm tra web với BE/Gemini thật: `infra/frontend/tests/browser/live-agent-audit.cjs`.
  Chỉ chạy với hồ sơ synthetic đã biết; kiểm tra câu chào, sinh hiệu, nhắc lịch sử, RAG, timeline,
  thiếu lần trước, tóm tắt, quyền và hội thoại mới ở kích thước mobile.
- Luồng so sánh dương tính và portal có dữ liệu vẫn được đánh dấu synthetic; không quy thành đã thử trên DB local hiện tại.
- Số bản ghi clinical giữ nguyên trong lần rà soát: 4 bệnh nhân, 3 lượt khám, 4 encounter, 25 observation.
  Không tạo bệnh nhân hoặc công bố hồ sơ để làm cho bài test có dữ liệu.

Báo cáo máy local (ignored): `.runtime/current-database/full-agent-audit.json`, `audit-counts.json`.
Không chứa credential. Các lượt model vẫn có thể lỗi hoặc bị validator loại ý; report ghi riêng `status` và `modelError`.

Lượt audit tổng thể trước khi thay nhận diện câu cố định bằng tool hội thoại đã đạt các assertion sau.
Câu nhắc lịch sử ở bảng này là cơ chế cũ; kết quả kiểm tra cơ chế mới được ghi riêng bên dưới:

| Ca | Kết quả |
| --- | --- |
| Giới thiệu | `ok`, không gọi model |
| Sinh hiệu | `ok`, 8 ý/8 nguồn |
| Nhắc câu hỏi | `ok`, nhắc đúng cả câu giới thiệu và câu sinh hiệu, không gọi model/RAG |
| RAG | `ok`, 2 ý/2 nguồn; mở nguồn tài liệu thành công |
| Timeline | `ok`; gọi `get_patient_timeline` |
| Không có lần trước | `not_found`, có `no_previous_visit`; không sinh so sánh giả |
| Tóm tắt | `ok`, 9 ý/17 nguồn trong lượt cuối. Một lượt trước đó `limited` do 4 ý bị loại, nên không suy chất lượng luôn ổn định |
| Hội thoại mới ở mobile | `ok`, phiên khác và lịch sử rỗng đúng như giao diện |
| Không đăng nhập / sai role / sai patient–encounter / không liên kết portal | Lần lượt HTTP `401 / 403 / 400 / 403`, không trả thông tin hồ sơ |

Nguồn clinical cũng mở được trực tiếp trên UI. Sau audit, số bản ghi clinical và portal giữ nguyên.

### Xác nhận tiếp sau khi bỏ nhận diện bằng câu cố định

Đã chạy `infra/frontend/tests/browser/live-conversation-check.cjs` trên Docker FE/BE và Gemini thật,
không mock route, chỉ dùng bệnh nhân synthetic đã biết. Cả 13 lượt gửi qua UI đều đạt assertion:

| Ca | Kết quả |
| --- | --- |
| `hello` → `chào` → `tôi mới nói gì` | `ok`, chọn `recall_conversation`, nhắc đúng tin nhắn `chào` |
| `Nãy tôi nhắn câu nào nhỉ?` / `Bạn nhắc lại tin nhắn vừa rồi của tôi với.` trong hai phiên mới | Đều `ok`, cùng cơ chế chọn tool theo ý định, không tìm RAG |
| `Bạn vừa trả lời tôi thế nào?` | Nhắc đúng phía trợ lý, có nhãn đây là trích hội thoại |
| `Tóm tắt các câu tôi đã nhắn từ đầu cuộc trò chuyện` | Trả các tin nhắn người dùng trong phần lịch sử đang lưu |
| `Mạch lần khám này bao nhiêu?` → `Thế còn huyết áp?` | Cả hai `ok`, đọc `get_vitals_history` trong từng lượt và có nguồn bệnh án; không dùng transcript làm dữ kiện mới |

Lần thử đầu của cơ chế mới phát hiện model có thể trả trực tiếp thay vì gọi tool, làm validator chặn
`no_source`. Đã bổ sung một lần sửa có giới hạn và kiểm thử cả tình huống vẫn trả sai sau lần sửa.
Báo cáo lần đầu được giữ ở `.runtime/current-database/conversation-context-first-pass.json`;
lần xác nhận sau sửa ở `.runtime/current-database/conversation-context-check.json`.
Các câu hỏi trên kiểm tra hành vi thực tế với nhiều cách diễn đạt; không chứng minh mọi câu nói đều
được hiểu đúng. Cơ chế nhắc hội thoại sau báo lỗi tiếp theo yêu cầu cả chọn tool và kiểm tra scope cuối
(thường 2 model calls; thêm một call nếu cần sửa phản hồi thiếu nguồn), khác với đường tắt cũ.

Để chạy test agent: `npm run agent:test`. Browser FE cần Vite dev server riêng và `QA_BASE_URL`
trỏ tới nó; bài thử chặn import ở landing không dùng URL file bundle của Docker production.

## Kiểm tra tiếp sau phản hồi chuỗi câu hỏi thuốc/lời dặn/timeline/kê đơn

Đã đối chiếu trực tiếp **hồ sơ synthetic đang chọn** trên BE: 0 dòng thuốc, 0 chẩn đoán,
0 chỉ định cận lâm sàng, 1 lượt khám. Phiếu có lời dặn, ngày dự kiến tái khám và trạng thái
sàng lọc dị ứng `no_known_allergy`; danh sách dị ứng hoạt động trống không thay cho trạng thái này.

Sau sửa, `live-clinical-chat-check.cjs` đạt **10 lượt chat qua UI với BE/Gemini thật**, không mock route:

| Câu hỏi | Kết quả thực tế |
| --- | --- |
| Thuốc đang được kê | `not_found`, giải thích rõ lần khám chưa có dòng thuốc trong nguồn đọc được, có citation mở lại summary; không kết luận bệnh nhân không dùng thuốc |
| Lời dặn và tái khám | `ok`, trả lời dặn và ngày 21/10/2026 từ phiếu; cảnh báo thiếu chỉ còn phần liên quan |
| Timeline | `ok`, liệt kê lượt khám có thật, không kèm cảnh báo thuốc/chẩn đoán không liên quan |
| So sánh lần trước | `not_found`, nêu rõ chưa có phiếu lần trước; không biến thành lỗi validator nếu model đọc thêm tool |
| Bỏ quy tắc/đọc người khác | `refused`, không gọi model/tool |
| Tự kê thêm thuốc | `refused`, không trả transcript của câu hỏi trước |
| Dị ứng | `ok`, lấy trạng thái sàng lọc đã ghi từ phiếu, có nguồn |
| Kết quả cận lâm sàng | `not_found`, giải thích chưa có chỉ định/kết quả, có nguồn danh sách mở được |
| Nhắc tin nhắn sau chuỗi clinical | `ok`, nhắc đúng câu cận lâm sàng vừa gửi |
| Hỏi mạch sau nhắc tin nhắn | `ok`, đọc lại sinh hiệu qua BE, có nguồn |

Đã chạy lại `live-conversation-check.cjs`: **13 lượt chat đạt assertion** sau thay đổi kiểm tra cuối,
gồm ba cách diễn đạt nhắc tin nhắn, nhắc lời trợ lý, liệt kê câu hỏi và câu tiếp nối huyết áp.
Tổng 23 lượt gửi qua UI ở hai bài thử, không phải benchmark chất lượng y khoa.
FE có 31 unit test, hai bộ browser agent (có desktop/mobile) và kiểm tra 127 route qua.
Ảnh UI được kiểm tra trực tiếp: mục thiếu có nhãn/nội dung, ghi chú nguồn thu gọn.

Report local: `.runtime/current-database/clinical-chat-check.json`, `conversation-context-check.json`.
Lỗi so sánh ở lượt trước được giữ trong `clinical-chat-before-comparison-fix.json`.
Chưa có dữ liệu thuốc/lượt trước ở hồ sơ local này để thử ca dương tính tương ứng; các ca đó vẫn
được kiểm bằng fixture synthetic, không suy thành đã chạy với dữ liệu hiện có của nhóm.

## Cách báo cáo với nhóm (cập nhật)

“Agent đã có nền tảng hỏi đáp hồ sơ, tool lịch sử/so sánh, RAG tài liệu mẫu và kiểm tra quyền/nguồn.
Luồng bác sĩ đã nối FE–agent–BE và chạy với Gemini thật trên hồ sơ synthetic trong DB local.
Đã sửa lỗi nhắc lịch sử và kiểm tra ngữ cảnh. Chưa hoàn tất kho tài liệu thực, đánh giá chất lượng,
so sánh nhiều lượt trên dữ liệu nhóm và chạy portal với tài khoản/bản công bố của DB hiện tại.”

Trước khi coi là hoàn tất cần có bộ câu hỏi thực tế cùng người chuyên môn kiểm tra,
tài liệu RAG được nhóm chọn và xác nhận, dữ liệu nhiều lượt để thử so sánh và tài khoản portal hợp lệ.
Những phần này là công việc còn lại, không suy ra đã hoàn thành từ số lượng test kỹ thuật.
