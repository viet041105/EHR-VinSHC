# Bàn giao Agent MVP

## Đã triển khai

- Agent bác sĩ đọc API VinSHC, giữ quyền workspace/cơ sở và quan hệ provider–bệnh nhân; câu trả lời có nguồn, dữ liệu thiếu và lỗi đọc riêng.
- Sửa contract dị ứng đúng API BE. Câu chứa dữ kiện lâm sàng được dựng từ nguồn; model chọn dữ kiện/thứ tự, chưa dùng lời diễn giải tự do để thay đổi số, chẩn đoán hay trạng thái.
- Ẩn CCCD/số điện thoại/email trong tin nhắn, lịch sử và dữ kiện từ tool. Giới hạn vòng/tool, output tokens, retry và tổng thời gian mỗi lượt.
- Chat bác sĩ trong hồ sơ; xóa hội thoại khi đổi tài khoản/workspace/bệnh nhân/lượt/lần khám, hủy và bỏ phản hồi cũ; mở nguồn bằng API VinSHC.
- Cổng bệnh nhân tại /portal.html: đăng nhập, xem lời dặn/đơn đã công bố, chọn lần khám và hỏi agent. BE xác nhận account–patient; không dùng tài khoản nhân viên để đọc thay.
- Bác sĩ có thao tác công bố/thu hồi. Chỉ lời dặn/đơn đã chốt được sao chép thành bản công bố có phiên bản; sửa nguồn sẽ tạm ẩn bản cũ cho đến khi công bố lại.
- Docker Compose chạy BE + agent + web/proxy; CI có test agent, test/build FE và B12 nối BE thật với model fake.

## Chạy ngắn gọn

Từ gốc repo, mở Docker Desktop. Chạy `npm run mvp:build` lần đầu hoặc khi cần cập nhật code trong image; lệnh này build rồi khởi động hệ thống. Sau đó dùng `npm run mvp:up` để chạy bằng image đã có, không build hoặc tải image lại. Nếu image chưa có, cần chạy `mvp:build` trước.

Dừng bằng `npm run mvp:stop`; lệnh này giữ container và dữ liệu để lần sau chạy lại bằng `mvp:up`. Xem trạng thái bằng `npm run mvp:status`. `npm run mvp:down` gỡ container/network nhưng vẫn giữ volume dữ liệu. `Ctrl+C` không dừng các container vì chúng chạy nền.

- Nhân viên: http://127.0.0.1:5173/connected.html
- Bệnh nhân: http://127.0.0.1:5173/portal.html
- Khi không có cấu hình agent riêng, model mặc định là fake. Docker đọc `infra/agent/.env` nếu có; file chứa key chỉ lưu local, không commit.

Để thử Gemini thật, sao chép `infra/agent/gemini.env.example` thành `infra/agent/.env`, điền `GEMINI_API_KEY`, rồi chạy `npm run mvp:agent-build`, `npm run mvp:model-check`, `npm run mvp:up`. Model là `gemini-3.8-flash`, thinking `low`. Chỉ thử hồ sơ synthetic với free tier theo [điều khoản Google](https://ai.google.dev/gemini-api/terms). Kiểm tra key/model không gửi hồ sơ; chat thật sẽ gửi câu hỏi và dữ kiện tool đã lọc ra Gemini. Đánh giá chất lượng và RAG vẫn là đầu việc riêng.

Khi phát triển FE bằng npm run dev, Vite proxy /openmrs và /agent. Chạy agent riêng bằng Python theo infra/agent/README.md; đặt VINSHC_AGENT_PATIENT_PORTAL=http để nối cổng bệnh nhân thật.

## Chuẩn bị tài khoản và hồ sơ

Quản trị tạo tài khoản OpenMRS gắn Person của bệnh nhân, rồi liên kết tại màn hình Quản trị hoặc endpoint portal/accounts. Bác sĩ chốt phiếu và bấm Công bố lời dặn/đơn cho bệnh nhân. Final không tự làm hồ sơ xuất hiện ở portal. Chi tiết ở docs/api/patient-portal.md.

Không commit tài khoản thật, credential hoặc dữ liệu bệnh nhân. Fixture/test chỉ sinh dữ liệu synthetic.

## Để lại theo yêu cầu

- Bộ 10–20 ca có đáp án chuẩn, đánh giá bằng model thật, mentor review, đo độ đúng/latency/cost và lựa chọn model.
- Timeline/so sánh lịch sử nâng cao, RAG tài liệu được duyệt, nhắc lịch/gửi yêu cầu hỗ trợ, mở thêm vai trò.
- Diễn giải ngôn ngữ tự do và vận hành nhiều replica sẽ được nâng cấp sau khi có đánh giá.

Các test tự động trong lần này kiểm tra hoạt động/phân quyền/tích hợp của code; không phải đánh giá chất lượng lâm sàng của model.

## Kết quả kiểm tra triển khai

104 test agent; 22 unit test FE; 88 mapping API; browser test portal chạy trên dev và production build, cùng 4 suite browser FE hiện có. B12 đạt 6/6 ca trên OpenMRS/PostgreSQL thật và model fake; B11 đạt 12/12 ca workflow nhân viên. Metadata validator/65 test, tooling/35 test, build backend/agent/web và actionlint cũng được kiểm tra. Đây là kiểm tra kỹ thuật, không phải kết quả đánh giá model thật.
