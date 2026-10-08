# VinSHC — frontend khám ngoại trú

Frontend độc lập bằng HTML/CSS/JavaScript modules, giữ backend OpenMRS hiện có. Thiết kế trang chủ theo ảnh đã được duyệt; các màn hình nghiệp vụ được đối chiếu báo cáo `Electronic Heath Record.pdf` trang 5–6 và kế hoạch FE-01–FE-07.

Đọc [phạm vi FE và mapping 13 thành phần backend](../docs/FRONTEND_SCOPE.md) để phân biệt tính năng demo, module backend dự kiến và tiêu chí còn phải nghiệm thu.

## Chạy

Tại gốc repo EHR-VinSHC hoặc trong thư mục `frontend`, chạy:

```sh
npm run dev
```

Lệnh ngắn dùng Node.js/npm và Python 3 có sẵn qua lệnh `python`; không cần `npm install` để mở giao diện. Nếu máy dùng lệnh `python3`, có thể chạy trực tiếp từ gốc repo:

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory frontend
```

Mở http://127.0.0.1:5173. Không mở bằng file://. Sửa code rồi refresh trình duyệt; `Ctrl+C` để dừng server.

## Các màn hình

- Trang chủ: banner, ba khối màu, nội dung hai cột và scroll reveal. Hỗ trợ reduced-motion.
- Phòng khám: tìm/tiếp nhận bệnh nhân, lượt đang khám, hàng đợi và lịch hẹn.
- Chart: tổng quan, sinh hiệu, khám ngoại trú, chẩn đoán, dị ứng, thuốc, ghi chú, chỉ định, kết quả, tài liệu, biểu mẫu và lịch sử.
- Biểu mẫu: thư viện dựng sẵn, tạo nháp text/number, concept UUID tùy chọn, xem trước và điền bản mẫu theo lượt. Không phải O3 form builder hoàn chỉnh.
- Quản trị: tài khoản demo, ma trận thao tác, nhật ký local.
- Phiên OpenMRS: form kiểm tra REST session của instance localhost. Có loading/401/network/JSON errors; mật khẩu không lưu. Workspace vẫn dữ liệu giả, kể cả kiểm tra phiên thành công.

## Luồng thử nghiệm

1. Chọn Lễ tân hoặc Đổi phiên demo, tìm/tạo bệnh nhân, mở lượt khám, tạo lịch hẹn hoặc điều phối hàng đợi.
2. Chọn Điều dưỡng, vào hồ sơ, ghi sinh hiệu và ghi chú chăm sóc.
3. Chọn Bác sĩ, ghi dị ứng/khám/chẩn đoán/thuốc, tạo chỉ định.
4. Chọn Điều dưỡng hoặc Quản trị để nhập kết quả giả cho chỉ định, thử kết quả sơ bộ/đã xác nhận. Vai trò này chỉ để thử UI, không khẳng định quyền chuyên môn tại cơ sở thật.
5. Xem các tab chart và lịch sử. Tải một tài liệu giả PDF/PNG/JPEG tối đa 1 MB và thử xem.
6. Chọn Quản trị, thử tài khoản và thư viện biểu mẫu. Có thể tạo form nháp rồi điền form trong lượt mở.
7. Bác sĩ kết thúc lượt sau khi có phiếu khám; các chức năng ghi theo lượt đóng chuyển chỉ đọc. Mở lượt tiếp theo giữ lịch sử lượt trước.
8. Reload để xác nhận dữ liệu giữ trên cùng browser/origin.

## Kiến trúc và kiểm tra

- `app.js`: shell/trang chủ, luồng tiếp nhận và phiếu khám.
- `modules.js`: lịch hẹn, queue, active visits, chart sections, tài liệu, form drafts, quản trị và session UI.
- `workflow.js`: role permissions, chỉ định/kết quả, validation hẹn và form definitions.
- `repository.js`: adapter dữ liệu giả, localStorage `vinshc-demo-v2` gồm patients/workspace; đọc dữ liệu `vinshc-demo-v1` cũ khi chưa có v2.
- `api.js`: kiểm tra session localhost, không phải clinical API repository.
- `styles.css`: layout responsive và hiệu ứng; `assets/medical-hero.jpg`: ảnh minh họa.

```sh
node frontend/verify.mjs
node --check frontend/app.js
node --check frontend/modules.js
```

Browser QA dùng Playwright; `browser-check.cjs` dùng browser context riêng, dữ liệu giả không tác động browser người dùng. Chạy từ frontend sau `npm install` / `npx playwright install chromium`, cùng server đang chạy:

```sh
npm run test:browser
```

Ảnh QA lưu dưới `/private/tmp` (có thể đổi `QA_OUTPUT_DIR`), không phải artifact production.

## Việt Nam, API và giới hạn

UI tiếng Việt, ngày vi-VN và thời gian hiển thị Asia/Ho_Chi_Minh. Các datetime-local nhập theo timezone trình duyệt, nên đặt thiết bị Asia/Ho_Chi_Minh khi demo; adapter thật phải chốt timezone. Có định danh cá nhân/BHYT tùy chọn, địa chỉ văn bản hiện tại, mã riêng, trạng thái dị ứng rõ ràng và đơn vị sinh hiệu. Ngưỡng nhập số chỉ kiểm tra lỗi, không phân loại bệnh; ICD/thuốc chưa đối chiếu danh mục lâm sàng.

Metadata Việt Nam/UUID/địa chỉ hierarchy, O3 form schema, drug/order type/care setting, provider/location, pagination, role/privilege cần xác nhận với người 1/3/4 khi nối backend. Không suy ra quyền ghi FHIR từ read capabilities.

Chỉ nhập dữ liệu giả. localStorage/tài liệu/journal/khóa tài khoản/role demo không phải lưu trữ bệnh án hoặc phân quyền production. Không có chữ ký điện tử, cấp phát thuốc, LIS/PACS, liên thông hay patient portal. Không tuyên bố tuân thủ đầy đủ quy định Việt Nam. Tham chiếu pháp lý cần đối chiếu tiếp: Thông tư 32/2023/TT-BYT và sửa đổi, 13/2025/TT-BYT, 26/2025/TT-BYT theo phiên bản hiện hành và phạm vi cơ sở.

Font Be Vietnam Pro tải từ Google Fonts, fallback system-ui khi offline. Ảnh tải từ https://images.unsplash.com/photo-1559839734-2b71ea197ec2 và lưu local; không phải ảnh nhân viên của VinSHC.
