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

## Chạy backend main và PostgreSQL từ nhánh fe

Cần Docker Desktop đang chạy. Các lệnh sau chỉ tạo file runtime bên trong thư mục
FE; không checkout/merge main hoặc sửa file backend trong working tree.

```sh
npm run backend:prepare
npm run backend:build
npm run backend:up
npm run backend:metadata
npm run backend:admin
npm run backend:status
```

`prepare` xuất nguyên bản commit trong `metadata/source.json` vào `.runtime/backend`,
chạy bootstrap có sẵn để tạo `.env` với mật khẩu ngẫu nhiên. Runtime và secret không
được commit, không được Vite phục vụ. `build` dùng Dockerfile main nguyên bản;
`compose.local.yaml` chỉ chọn amd64 cho backend do Maven image đã khóa không có ARM,
và dùng image riêng `vinshc-fe-local-backend:main-d9d5b95`.

Project Docker riêng: `vinshc-fe-local`. PostgreSQL và dữ liệu OpenMRS dùng named
volume riêng, không ghi đè volume có sẵn của project khác. Gateway ở cổng 8080.
Lần build/khởi tạo schema đầu cần nhiều thời gian; `up` đợi healthcheck tối đa 40 phút.

Đăng nhập bằng `EHR_ADMIN_USERNAME` / `EHR_ADMIN_PASSWORD` trong
`.runtime/backend/.env` (đọc bằng editor trên máy, không chia sẻ file này).
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

Sau khi mở workspace, trang **Tổng quan công việc** hiển thị các chức năng đúng vai trò.
Chọn **Bệnh nhân** hoặc **Lượt khám** để mở màn hình mới (nếu role được phép).
Trong **Hồ sơ đang làm việc**, áp dụng mã patient/visit/encounter có sẵn để dùng chung
giữa các biểu mẫu; backend kiểm tra quyền và liên kết khi gửi.

Các phần nghiệp vụ có nút thao tác nhanh, bảng **Bản ghi đã mở trong phiên**,
bộ lọc trong phiên và chọn/đọc lại theo loại phiếu. Dữ liệu chỉ đến từ phản hồi BE
thành công, không phải danh sách toàn server; đổi workspace/đăng xuất sẽ xóa bộ nhớ này.

Màn hình tiếp nhận/mở lượt/tìm kiếm/cấp thuốc/thiết lập cơ sở đã có bố cục chuẩn bị.
Nút **Chờ backend** chưa gửi dữ liệu; không tạo thành công giả hoặc gọi API chưa tồn tại.
Admin vẫn chỉ thấy quản trị/báo cáo và tổng quan; màn hình bệnh nhân/lượt thuộc role
nghiệp vụ, không tự hiện cho admin chỉ vì có quyền System Developer.

Xem [UI_BACKEND_MAP.md](UI_BACKEND_MAP.md) để đối chiếu từng màn hình với API,
metadata và các phần cần BE bổ sung.

## Các API đã nối

- Session và B5: xác nhận vai trò/cơ sở, gửi workspace headers trong từng request.
- B2: identity aggregate/lịch sử; thêm/sửa/hủy người liên hệ và địa chỉ; ghi/xóa
  field-state theo policy metadata; danh mục tỉnh/xã và version
  đọc từ backend. Identity aggregate hiện không chứa đầy đủ thông tin Person Core.
- B3: ghi lần đo sinh hiệu đã validation bằng field code chính thức; trạng thái
  thiếu tường minh, giới hạn nhập theo backend, cờ needsVerification cho huyết áp đảo.
- B4: clinical-summary, phiếu khám/tạo/đính chính/chốt, chẩn đoán selectable,
  dị ứng coded, kê từng dòng thuốc đã xác nhận, ngừng/void có lý do, cấu hình danh mục.
- B8: lịch hẹn, hàng đợi/chuyển điểm, bill/payment/settle/refund/cancel, chỉ định,
  phân công, kết quả/revision, file PDF/JPEG/PNG, chứng từ và báo cáo ngày tổng hợp.

Danh mục trong `metadata/` sao chép nguyên bản từ commit đã ghi ở `source.json`.
Business facility UUID khác OpenMRS location UUID: headers dùng location, payload B8
và báo cáo dùng business facility. Danh mục FE không thay thế metadata runtime;
backend kiểm tra mọi UUID, quyền, phạm vi, quan hệ và state transition.

Đính chính phiếu cần đọc phiếu trước; xóa trường đang có gửi `null` cùng lý do.
Kê thuốc tạo order đã xác nhận, không có nháp server. Chốt phiếu không đóng Visit.
Key giao dịch chỉ giữ trong bộ nhớ cho retry cùng payload sau lỗi; không tự retry ghi.
Reload/đổi workspace làm mất key: cần đối soát giao dịch nếu mất phản hồi từ server.

## Những phần cần backend bổ sung

Đánh giá BE/FE cập nhật ngày 13/10/2026, kết quả kiểm thử và thứ tự hoàn thiện:
[COMPLETION_REVIEW.md](COMPLETION_REVIEW.md).

B5 chặn Core `/patient`, `/visit`, `/encounter`, `/obs` với app roles. Chưa có API
VinSHC scoped thay thế tìm/tạo/sửa patient Core, mở/kết thúc visit, tạo encounter,
đọc các lần đo sinh hiệu hoặc sửa/void sinh hiệu. B8 chỉ có GET theo UUID, chưa có
list/search. Vì vậy form hiện nhận UUID thật từ backend; chưa thể chạy toàn bộ
quy trình tiếp nhận → khám → kết thúc chỉ bằng giao diện.

Cấp thuốc, CRUD tài khoản/form/cấu hình cơ sở cũng chưa có API ứng dụng scoped.
FE đã nối tìm tài khoản và thêm role qua Core cho System Developer; chưa có form tạo
tài khoản mới hay đổi mật khẩu.
Backend dùng diagnostic_order print cho cả mẫu đơn thuốc/kết quả, nên pharmacy/lab
chưa mở được các mẫu đó dù metadata có một số quyền print. FE không gọi Core/FHIR
để né giới hạn này hoặc ghi thành công giả.

Bổ sung những API này cần sửa ngoài FE và phải được chủ dự án xác nhận riêng.

## Kiểm thử

```sh
npm test
npm run test:browser
npm run test:api
npm run test:live
```

`test:browser` dùng Playwright route mock, context độc lập, desktop/mobile và các
vai trò, không ghi DB. Có kiểm tra giữ role cũ khi cấp role mới, ngăn app-admin gọi
Core, assign/revoke, PATCH null/omission và DELETE 204. `test:api` cần
`backend:prepare`; đối chiếu caller FE với đủ 56 mapping VinSHC trong source BE đã khóa.
Độ phủ route không chứng minh mọi thao tác ghi đều qua runtime. `test:live` cần backend và FE đang chạy; chỉ đọc API thật,
kiểm tra đăng nhập trên trình duyệt, cấu hình/metadata và xóa storage demo cũ trong
browser test riêng. Không chạy integration fixtures tạo patient để chứng minh kết nối.
Ảnh QA nằm trong `/private/tmp`, không phải dữ liệu production.

Đã xác minh ngày 2026-10-13: 16 unit tests đạt; ba bộ Playwright desktop/mobile
(route mock, gồm màn hình công việc mới) đạt; kiểm thử đăng nhập và đọc API qua Vite → gateway → OpenMRS
trên PostgreSQL thật đạt, gồm mở workspace admin, tìm user, đọc audit và báo cáo ngày.
Bốn container healthy; API coverage 56/56; cấu hình admin chạy lại không tạo trùng. Sau kiểm thử, DB có 0 patient,
0 visit, 0 encounter và 0 obs; không tạo fixture lâm sàng. Kiểm thử thật chỉ xác
minh kết nối/cấu hình, chưa chứng minh toàn bộ luồng nghiệp vụ ghi dữ liệu.

## Source

- `app.js`, `landing.js`: trang giới thiệu và đường vào phòng khám.
- `connected.js`, `connected-actions.js`, `connected.css`: không gian kết nối.
- `backend-client.js`: HTTP client, lỗi, generation guard, validation payload.
- `metadata.js`, `metadata/`, `backend-mapping.js`: danh mục và hợp đồng backend.
- `additional-actions.js`: bổ sung CRUD phần mở rộng, policy thông tin thiếu và quản trị workspace.
- `workspace-screens.js`, `workspace-model.js`: tổng quan, màn hình chuẩn bị và bộ nhớ bản ghi/context của workspace.
- `metadata/ui-options.json`: code list giới tính, độ đầy đủ ngày sinh và lý do kết thúc từ pack main.
- `metadata/field-policies.json`: trích nguyên policy field-state từ pack của main đã khóa.
- `configure-admin.py`: cấu hình role/assignment cho admin hiện có qua API.
- `clear-demo.js`: xóa đúng hai khóa demo cũ.
- `docker-local.mjs`, `compose.local.yaml`: chạy backend main nguyên bản, không sửa ngoài FE.

Ảnh Pexels được lưu local; xem `assets/ASSET_SOURCES.md`. Font Be Vietnam Pro dùng
fallback khi offline. Ngày/giờ hiển thị theo Asia/Ho_Chi_Minh; nhập datetime theo
múi giờ thiết bị, nên đặt thiết bị đúng múi giờ khi sử dụng.
