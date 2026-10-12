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
Chỉ một server dùng cổng 5173. Không mở bằng file://.

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
Tài khoản quản trị gốc có thể đăng nhập và đọc cấu hình thật bằng nút
**Kiểm tra kết nối và cấu hình backend**. Các workspace nghiệp vụ cần role
`VinSHC App: <role>` và assignment user/role/location phía server; FE không tự tạo
tài khoản, gán role hoặc cấp quyền.

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

## Các API đã nối

- Session và B5: xác nhận vai trò/cơ sở, gửi workspace headers trong từng request.
- B2: identity aggregate, người liên hệ, địa chỉ DATA-08; danh mục tỉnh/xã và version
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

B5 chặn Core `/patient`, `/visit`, `/encounter`, `/obs` với app roles. Chưa có API
VinSHC scoped thay thế tìm/tạo/sửa patient Core, mở/kết thúc visit, tạo encounter,
đọc các lần đo sinh hiệu hoặc sửa/void sinh hiệu. B8 chỉ có GET theo UUID, chưa có
list/search. Vì vậy form hiện nhận UUID thật từ backend; chưa thể chạy toàn bộ
quy trình tiếp nhận → khám → kết thúc chỉ bằng giao diện.

Cấp thuốc, CRUD tài khoản/form/cấu hình cơ sở cũng chưa có API ứng dụng.
Backend dùng diagnostic_order print cho cả mẫu đơn thuốc/kết quả, nên pharmacy/lab
chưa mở được các mẫu đó dù metadata có một số quyền print. FE không gọi Core/FHIR
để né giới hạn này hoặc ghi thành công giả.

Bổ sung những API này cần sửa ngoài FE và phải được chủ dự án xác nhận riêng.

## Kiểm thử

```sh
npm test
npm run test:browser
npm run test:live
```

`test:browser` dùng Playwright route mock, context độc lập, desktop/mobile và các
vai trò, không ghi DB. `test:live` cần backend và FE đang chạy; chỉ đọc API thật,
kiểm tra đăng nhập trên trình duyệt, cấu hình/metadata và xóa storage demo cũ trong
browser test riêng. Không chạy integration fixtures tạo patient để chứng minh kết nối.
Ảnh QA nằm trong `/private/tmp`, không phải dữ liệu production.

Đã xác minh ngày 2026-10-12: 8 unit tests đạt; Playwright desktop/mobile
(route mock) đạt; kiểm thử đăng nhập và đọc API qua Vite → gateway → OpenMRS
trên PostgreSQL thật đạt. Bốn container healthy. Sau kiểm thử, DB có 0 patient,
0 visit, 0 encounter và 0 obs; không tạo fixture lâm sàng. Kiểm thử thật chỉ xác
minh kết nối/cấu hình, chưa chứng minh toàn bộ luồng nghiệp vụ ghi dữ liệu.

## Source

- `app.js`, `landing.js`: trang giới thiệu và đường vào phòng khám.
- `connected.js`, `connected-actions.js`, `connected.css`: không gian kết nối.
- `backend-client.js`: HTTP client, lỗi, generation guard, validation payload.
- `metadata.js`, `metadata/`, `backend-mapping.js`: danh mục và hợp đồng backend.
- `clear-demo.js`: xóa đúng hai khóa demo cũ.
- `docker-local.mjs`, `compose.local.yaml`: chạy backend main nguyên bản, không sửa ngoài FE.

Ảnh Pexels được lưu local; xem `assets/ASSET_SOURCES.md`. Font Be Vietnam Pro dùng
fallback khi offline. Ngày/giờ hiển thị theo Asia/Ho_Chi_Minh; nhập datetime theo
múi giờ thiết bị, nên đặt thiết bị đúng múi giờ khi sử dụng.
