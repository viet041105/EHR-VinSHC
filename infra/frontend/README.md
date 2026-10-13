# VinSHC frontend — kết nối OpenMRS

HTML/CSS/JavaScript modules, Vite, Node.js ≥22.12. Không còn bệnh nhân, tài khoản,
lượt khám, sinh hiệu hoặc giao dịch demo trên ứng dụng. Không có fallback lưu hồ sơ
trên trình duyệt; mọi thao tác nghiệp vụ dùng backend. Mock fixtures chỉ nằm trong
test tự động, không được nạp vào ứng dụng hay database.

## Chạy FE

```sh
cd infra/frontend
npm install
npm run dev
```

Mở http://127.0.0.1:5173 → Đăng nhập phòng khám. Trang đăng nhập trực tiếp:
http://127.0.0.1:5173/connected.html. Vite tự cập nhật khi lưu source; Ctrl+C để dừng.
Trên macOS/Linux, chạy lại `npm run dev` tự dừng Vite cũ của chính thư mục FE này
đang giữ cổng 5173 và khởi động server mới trong terminal hiện tại. Nếu ứng dụng
khác giữ cổng, lệnh báo rõ và không dừng ứng dụng đó; có thể dùng
`npm run dev -- --port 5174`. Không mở bằng file://.

Proxy `/openmrs` mặc định tới http://127.0.0.1:8080. Đổi gateway local nếu cần:

```sh
VINSHC_BACKEND_ORIGIN=http://127.0.0.1:8081 npm run dev
```

Chỉ nhận HTTP loopback. Credentials và dữ liệu backend giữ trong bộ nhớ phiên,
không ghi localStorage/sessionStorage; reload cần đăng nhập lại. Hai khóa demo cũ
`vinshc-demo-v1`/`vinshc-demo-v2` được xóa khi mở trang, không xóa dữ liệu ứng dụng khác.

## Chạy backend và PostgreSQL của repo

Cần Docker Desktop đang chạy. Các lệnh sau build backend từ `infra/backend` của working
tree và chạy trong project Docker riêng `vinshc-fe-local`.

```sh
npm run backend:prepare
npm run backend:build
npm run backend:up
npm run backend:metadata
npm run backend:admin
npm run backend:status
```

`prepare` chạy `scripts/bootstrap.py` ở gốc repo để tạo `.env` với mật khẩu ngẫu nhiên
(giữ nguyên nếu đã có). `build` dùng `infra/backend/Dockerfile` của working tree, nên các
API mới trong `infra/backend` có hiệu lực ngay sau `backend:build` + `backend:up`.
Secret không được commit, không được Vite phục vụ. `compose.local.yaml` chọn amd64 cho
backend do Maven image đã khóa không có ARM, và dùng image riêng `vinshc-fe-local-backend:dev`.

Project Docker riêng: `vinshc-fe-local`. PostgreSQL và dữ liệu OpenMRS dùng named
volume riêng, không ghi đè volume có sẵn của project khác. Gateway ở cổng 8080.
PostgreSQL mở tại `127.0.0.1:15432` cho DBeaver trên máy Mac; trong Docker vẫn dùng `db:5432`.
Lần build/khởi tạo schema đầu cần nhiều thời gian; `up` đợi healthcheck tối đa 40 phút.

Vị trí mã nguồn, dữ liệu, volume Docker và cách mở API/database của môi trường này:
[LOCAL_BACKEND.md](LOCAL_BACKEND.md).

Đăng nhập bằng `EHR_ADMIN_USERNAME` / `EHR_ADMIN_PASSWORD` trong
`.env` ở gốc repo (đọc bằng editor trên máy, không chia sẻ file này).
`backend:admin` cấu hình tài khoản quản trị hiện có: thêm `VinSHC App: admin`,
giữ nguyên các role Core và gán cơ sở phát triển bằng API sẵn có. Lệnh chạy lại không
thêm assignment trùng, không tạo tài khoản/bệnh nhân demo. Không tự chạy lệnh này khi login.

Sau khi cấu hình, đăng xuất/đăng nhập lại, chọn **Quản trị** và **VinSHC Development Clinic**,
bấm **Mở không gian làm việc**. Mật khẩu hiện có được giữ nguyên.
Trong mục Quản trị có đọc cấu hình, audit phân trang, kiểm tra quyền, gán/thu hồi workspace.
System Developer có thêm tìm user Core và thêm role ứng dụng (giữ các role cũ).
Sau khi thêm role, dùng Gán vai trò và cơ sở; tài khoản đích cần đăng nhập lại.
API Core chỉ mở cho System Developer và chỉ cho đọc user/cập nhật role, không dùng
để né giới hạn dữ liệu bệnh nhân. Tài khoản app-admin không được mở các thao tác Core.
FE không tự tạo tài khoản hay cấp quyền khi người dùng đăng nhập.

Dừng stack, giữ dữ liệu:

```sh
npm run backend:down
```

Không dùng `down -v`. Không tự nạp fixture bệnh nhân/giao dịch. Overlay metadata
`tests/integration/compose.b4-metadata.yaml` là gói danh mục của repo (concept, thuốc,
đơn vị, room, role), không tạo bệnh nhân. `backend:metadata` gọi helper có sẵn của main để nối concept set,
reference mapping và global properties; không tạo user, patient hoặc giao dịch. Danh mục dự án hiện vẫn là môi trường
kiểm thử và `productionEnabled=false`; khởi động DB thật không biến danh mục này
thành danh mục lâm sàng đã được duyệt.

## Giao diện công việc

Sau khi mở workspace, **Tổng quan công việc** hiển thị các chức năng đúng vai trò.
Đầu trang hiển thị **Tài khoản**, **Vai trò hiện tại** và trạng thái kết nối, tách khỏi
hai nút **Đổi vai trò/cơ sở**, **Đăng xuất**.

Mỗi mục nghiệp vụ có **danh sách tải từ backend** (phân trang, bộ lọc ngày/trạng thái):
bệnh nhân, lượt khám, lần đo sinh hiệu, lịch hẹn, hàng đợi, phiếu phí, giao dịch chờ
xác nhận, chỉ định CLS và đơn thuốc chờ cấp. Bấm **Chọn** hoặc một thao tác trên dòng
(ví dụ *Mở lượt khám*, *Ghi sinh hiệu*, *Khám*, *Thu tiền*, *Cấp thuốc*) để điền sẵn
**Hồ sơ đang làm việc** và biểu mẫu tương ứng; thao tác ghi vẫn phải bấm xác nhận và được
backend kiểm tra quyền, phạm vi cơ sở và trạng thái. Sau mỗi lần ghi thành công, danh sách
đang mở được tải lại.

Luồng điển hình: Tiếp đón tìm hồ sơ (gõ tên không dấu, mã hồ sơ, CCCD/BHYT hoặc số điện
thoại) → đăng ký nếu chưa có → mở lượt → xếp hàng. Điều dưỡng chọn lượt → *Bắt đầu / tiếp
tục đo sinh hiệu* → ghi lần đo, xem lịch sử, đính chính/hủy có lý do. Bác sĩ chọn lượt →
*Khám* → phiếu khám, chẩn đoán, kê thuốc, chỉ định (mã người kê tự điền từ hồ sơ người hành
nghề của tài khoản). KTV nhận chỉ định chờ phân công/được giao. Thu ngân thu theo phiếu chưa
thu đủ. Dược cấp theo số lượng còn lại, số lô, hạn dùng. Tiếp đón/bác sĩ kết thúc lượt.

Khi backend trả 409 kèm bản ghi liên quan (hồ sơ trùng, lượt đang mở), FE hiển thị danh sách
để chọn bản ghi có sẵn thay vì tạo mới. Bảng **Bản ghi đã mở trong phiên** vẫn giữ các phản
hồi đã nhận trong workspace; đổi workspace/đăng xuất sẽ xóa bộ nhớ này.

Admin chỉ thấy quản trị/báo cáo và tổng quan. Tạo tài khoản và thiết lập cơ sở/biểu mẫu vẫn
là màn hình chuẩn bị (**Chờ backend**), không gửi dữ liệu.

Xem [UI_BACKEND_MAP.md](UI_BACKEND_MAP.md) để đối chiếu từng màn hình với API.

## Các API đã nối

- Session và B5: xác nhận vai trò/cơ sở, gửi workspace headers trong từng request.
- B2: identity aggregate/lịch sử; người liên hệ, địa chỉ có mã hành chính, field-state.
- B11 ([care.md](../../docs/api/care.md)): tìm/đăng ký/sửa bệnh nhân, mở/kết thúc lượt,
  encounter sinh hiệu/khám, đọc/đính chính/hủy sinh hiệu, danh sách vận hành, cấp thuốc,
  báo cáo nhiều ngày và hồ sơ người hành nghề của tài khoản (`providers/me`).
- B3: ghi lần đo sinh hiệu đã validation, trạng thái thiếu, cờ needsVerification.
- B4: clinical-summary (gồm sinh hiệu của lượt), phiếu khám/đính chính/chốt, chẩn đoán,
  dị ứng, kê/ngừng thuốc, cấu hình danh mục.
- B8: lịch hẹn, hàng đợi/chuyển điểm, bill/payment/settle/refund/cancel, chỉ định,
  phân công, kết quả/revision, file PDF/JPEG/PNG, chứng từ và báo cáo ngày.

Business facility UUID khác OpenMRS location UUID: headers dùng location, payload B8
và báo cáo dùng business facility. Danh mục FE không thay thế metadata runtime;
backend kiểm tra mọi UUID, quyền, phạm vi, quan hệ và state transition.

Đính chính phiếu cần đọc phiếu trước; xóa trường đang có gửi `null` cùng lý do.
Kê thuốc tạo order đã xác nhận, không có nháp server. Chốt phiếu không đóng lượt.
Key giao dịch chỉ giữ trong bộ nhớ cho retry cùng payload sau lỗi; không tự retry ghi.

## Phần còn lại

Đánh giá cập nhật: [COMPLETION_REVIEW.md](COMPLETION_REVIEW.md).

- Tạo/sửa tài khoản, liên kết provider, cấu hình cơ sở/biểu mẫu chưa có API ứng dụng.
  Nhân viên lâm sàng cần quản trị liên kết provider với tài khoản trước khi ghi encounter.
- Kho/tồn/lô chi tiết, BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS thuộc phạm vi sau pilot.

## Kiểm thử

```sh
npm test
npm run test:browser
npm run test:api
npm run test:live
```

`test:browser` dùng Playwright route mock, context độc lập, desktop/mobile và các vai trò,
không ghi DB: danh sách và thao tác trên dòng, 409 hồ sơ trùng, encounter sinh hiệu → form
sinh hiệu, tự điền provider, quyền theo vai trò, in, không lưu dữ liệu trên trình duyệt.
Lần đầu cần `npx playwright install chromium`. `test:api` đối chiếu caller FE với mọi mapping
VinSHC trong `infra/backend` của repo (79/79). Độ phủ route không chứng minh thao tác ghi qua
runtime; luồng ghi thật với tài khoản 7 role nằm ở `tests/integration/test_b11_care_workflow.py`.
`test:live` cần backend và FE đang chạy; chỉ đọc API thật.

## Source

- `app.js`, `landing.js`: trang giới thiệu và đường vào phòng khám.
- `connected.js`, `connected-actions.js`, `connected.css`: không gian kết nối.
- `backend-client.js`: HTTP client, lỗi, generation guard, validation payload.
- `metadata.js`, `metadata/`, `backend-mapping.js`: danh mục và hợp đồng backend.
- `additional-actions.js`: bổ sung CRUD phần mở rộng, policy thông tin thiếu và quản trị workspace.
- `care-actions.js`: bệnh nhân, lượt khám, encounter, sinh hiệu, cấp thuốc, báo cáo nhiều ngày.
- `worklists.js`: danh sách tải từ backend và thao tác trên dòng.
- `workspace-screens.js`, `workspace-model.js`: tổng quan, màn hình theo mục và bộ nhớ bản ghi/context của workspace.
- `metadata/ui-options.json`: code list giới tính, độ đầy đủ ngày sinh và lý do kết thúc từ pack main.
- `metadata/field-policies.json`: trích nguyên policy field-state từ pack của main đã khóa.
- `configure-admin.py`: cấu hình role/assignment cho admin hiện có qua API.
- `clear-demo.js`: xóa đúng hai khóa demo cũ.
- `docker-local.mjs`, `compose.local.yaml`: build và chạy backend của working tree trong project Docker riêng.

Ảnh Pexels được lưu local; xem `assets/ASSET_SOURCES.md`. Font Be Vietnam Pro dùng
fallback khi offline. Ngày/giờ hiển thị theo Asia/Ho_Chi_Minh; nhập datetime theo
múi giờ thiết bị, nên đặt thiết bị đúng múi giờ khi sử dụng.
