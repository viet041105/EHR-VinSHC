# Giao diện VinSHC và kết nối backend OpenMRS

Cập nhật 14/10/2026 trên bản main `1f8ee92` vừa merge vào working tree nhánh fe.
Merge và thay đổi FE chưa commit/push theo yêu cầu người dùng. Chỉ sửa trong FE.

## Giao diện

- Landing page nằm trong `landing/`, stylesheet trong `styles/`, assets trong `assets/`. `index.html` dùng boot entry có loading/retry khi script lỗi.
- `workspace.css` chỉ nạp tại `connected.html` và `portal.html`; không tác động trang giới thiệu.
- Đăng nhập trực tiếp vào phòng khám; không có tên, nút đăng nhập hay thao tác đọc/ghi OpenMRS trong UI.
- Menu có biểu tượng nét đơn, tên công việc và mục đang chọn; tài khoản/vai trò nằm ở header.
- Tổng quan bắt đầu bằng công việc của từng role; không có thẻ số liệu giả hoặc huy hiệu “Đã nối API”.
- Mở mục sẽ hiển thị danh sách/bộ lọc trước. Người dùng chọn dòng hoặc chọn công việc rồi mở form.
- Thao tác ghi có nút cụ thể như Xác nhận thu tiền, Xác nhận cấp thuốc, Chốt phiếu khám.
- Bệnh nhân đã chọn hiển thị bằng tên; mã nội bộ nằm trong mục mở rộng cho trường hợp tương thích.
- Sinh hiệu tách số đo và lý do thiếu; phiếu khám chia nhóm bệnh sử, khám, dị ứng và tái khám.
- Quản trị có bảng kết quả tìm nhân viên và nút chọn để phân công, không cần sao chép UUID từ phản hồi.
- Kết quả/nguồn trợ lý hiển thị theo nhãn thay cho JSON thô; các UUID liên kết không hiện trong nội dung chính.
- Các chức năng chưa có dịch vụ vẫn ghi rõ Chưa khả dụng, không tạo kết quả hoặc tài khoản giả.

## Kết nối dịch vụ

Tài liệu `APP_OVERVIEW.md` và `CLINIC_COMPLETION_CHECKLIST.md` được người dùng cung cấp
xác nhận OpenMRS vẫn là nền tảng của dự án. Backend distribution tự build và module
VinSHC mở rộng không đồng nghĩa thay thế OpenMRS Core hay database. Checklist là backlog;
lần chỉnh FE này không triển khai hoặc đánh dấu hoàn thành các hạng mục P0–P7.

Luồng kết nối mặc định:

```text
FE VinSHC → /api/ (cùng origin) → /openmrs/ws/rest/v1/ → Core + module VinSHC → PostgreSQL
```

Vite proxy tới `VINSHC_BACKEND_ORIGIN` (mặc định `http://127.0.0.1:8080`), prefix
upstream mặc định `/openmrs/ws/rest/v1`. Có thể đổi prefix qua
`VINSHC_API_UPSTREAM_PATH` nếu cấu hình dịch vụ khác; không tự chuyển sang BE chưa tồn tại.
Agent vẫn qua `/agent`. Docker image FE dùng cùng mặc định trong nginx template.

```sh
cd infra/frontend
npm install
npm run dev
```

Đăng nhập bằng tài khoản OpenMRS hiện có ngay trên màn hình VinSHC. Giữ Basic credentials,
response session, role/cơ sở và kiểm tra quyền server theo hợp đồng đã có. Không cần mở
O3/Legacy để đăng nhập FE; việc bỏ tên OpenMRS khỏi UI không xóa nền tảng hay tài khoản.
Các tên `openmrs` trong metadata mô tả role/privilege thật của hệ thống này.

Nếu trước đó đã đặt `VINSHC_API_UPSTREAM_PATH=/api` trong terminal, bỏ biến đó hoặc đặt
lại `/openmrs/ws/rest/v1` rồi khởi động lại Vite. Không thay mật khẩu, tạo tài khoản,
bootstrap, migration, rebuild backend hoặc sửa dữ liệu trong lần điều chỉnh kết nối.

Nguồn main vừa nhập là `1f8ee92`, nhưng runtime được đối chiếu vẫn đang dùng image
`vinshc-fe-local-backend:main-d9d5b95`. Đăng nhập/các API quản trị đang có có thể kiểm tra
trực tiếp; API care/portal mới trong source chưa được coi là đã chạy trên image này.
Đồng bộ image/migration và nghiệm thu đủ 8 role là công việc riêng, không được suy từ
thành công của proxy hoặc mock UI. File thiết lập runtime hiện tại còn ở
`.runtime/backend/.env`; script `test:live` hỗ trợ file này và `.env` ở root, hoặc
`VINSHC_ENV_FILE` được chỉ định rõ ràng, không đưa credentials vào giao diện/Git/log.

## Kiểm tra

Unit/contract test, API coverage và build; các bộ Playwright hiện có tiếp tục kiểm
quyền, payload, ngữ cảnh, idempotency, print và module isolation qua request mock.
`product-check.cjs` kiểm tra thêm cả 8 role trên desktop/mobile, từ ngữ không phụ thuộc
nền tảng, danh sách trước form, đóng form và dịch vụ không kết nối không cho đăng nhập giả.
Fixture chỉ tồn tại trong test, không nạp vào ứng dụng hay ghi DB. Không coi mock là nghiệm thu
end-to-end toàn bộ nghiệp vụ.

Kết quả: 22/22 unit test đạt, build thành công, độ phủ hợp đồng cũ 88/88 mapping;
cả 5 bộ browser trong `test:browser` và bộ portal/agent đạt. Luồng quản trị tìm/chọn
nhân viên để phân công cũng đạt trong mock. Ảnh review lưu ở `.runtime/ui-review/`
(bị Git bỏ qua, có dữ liệu QA), không phải ảnh dữ liệu thật của hệ thống.

Sửa trang trắng: `landing/boot.js` tải entry point và hiển thị lỗi có nút tải lại nếu import
thất bại; dev server trả `Cache-Control: no-store`. Kiểm thử `landing-check.cjs`
xác nhận trang chủ và liên kết đăng nhập trên desktop/mobile, chặn import để thử
lỗi rồi tải lại thành công. Không cần backend để mở landing hoặc form đăng nhập.

Đã sửa mặc định proxy sau đối chiếu tài liệu: FE `/api/session` được chuyển tới
OpenMRS session, giữ giao diện mới và tài khoản hiện có. Kết quả kiểm tra trực tiếp
được ghi sau khi chạy `npm run test:live`; không thay backend hoặc dữ liệu.
