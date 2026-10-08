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

## Các màn hình và vai trò

Trang chủ giới thiệu giữ menu Giới thiệu / Tính năng / Quy trình, banner và scroll reveal. “Vào phòng khám” mở bộ chọn tài khoản, không mặc định bác sĩ. Xem [thiết kế theo kế hoạch 8 role](../docs/ROLE_WORKFLOWS.md).

- Tiếp đón: tiếp nhận, sửa hành chính, mở lượt, lịch hẹn, hàng đợi theo phòng/bác sĩ; lịch sử hành chính.
- Điều dưỡng: danh sách đo sinh hiệu, ghi chú/bàn giao, tài liệu, biểu mẫu điều dưỡng; ngữ cảnh lâm sàng chỉ đọc.
- Bác sĩ: khám/dị ứng/chẩn đoán/thuốc, chỉ định và phân KTV, đơn mẫu xác nhận, tái khám, kết thúc lượt.
- Thu ngân: bảng giá, phiếu phí, thu từng phần/đủ, hoàn/hủy có lý do, phiếu thu.
- KTV CLS: chỉ định được giao cho đúng tài khoản, kết quả sơ bộ/hoàn tất và báo cáo đính kèm.
- Dược/quầy thuốc: đơn đã được bác sĩ xác nhận, ghi cấp sau đối chiếu, không sửa đơn. Kho/lô/hạn dùng còn ở module mở rộng.
- Quản lý: báo cáo lượt, thu/hoàn/ròng theo ngày; không hiển thị bệnh án hoặc tên người bệnh.
- Quản trị: tài khoản nhiều role, khóa/mở khóa, form nháp theo người điền, bảng giá mẫu, cấu hình cơ sở/biến thể, nhật ký và kiểm tra REST session local.

Tài khoản có thể kiêm nhiệm; chuyển không gian qua menu cạnh tài khoản, giữ nguyên ID. Tài khoản khóa không xuất hiện trong bộ chọn. Mọi thao tác workspace hiện lưu localStorage; đây chưa phải đăng nhập/ủy quyền OpenMRS.

## Luồng thử nghiệm

1. Vào phòng khám → Tiếp đón. Tìm/tạo người bệnh, đối chiếu thông tin và mở lượt. Đặt hẹn hoặc điều phối theo phòng/bác sĩ.
2. Đổi tài khoản → Điều dưỡng. Ghi sinh hiệu, thời điểm đo và ghi chú bàn giao.
3. Bác sĩ ghi phiếu khám/dị ứng/chẩn đoán/thuốc; tại tab Thuốc xác nhận đơn mẫu; tại Chỉ định chọn KTV được giao.
4. KTV chỉ nhìn thấy chỉ định giao cho mình, ghi báo cáo và xác nhận hoàn tất sau khi đối chiếu. Bác sĩ/điều dưỡng xem kết quả trong chart.
5. Thu ngân lập phí, thu một phần/đủ, xem/in phiếu; thử hoàn có lý do hoặc hủy phiếu chưa thu. Tổng tiền VND không có phần thập phân.
6. Dược đối chiếu đơn xác nhận và ghi cấp thuốc mẫu. Quản lý xem thu/hoàn/ròng và lượt khám trong báo cáo ngày.
7. Quản trị thử tài khoản kiêm nhiệm, form bác sĩ/điều dưỡng, cấu hình có/không điều dưỡng/quầy thuốc, tên/địa chỉ/giấy phép cơ sở. Form chỉ được điền theo role được giao, lượt đóng chỉ đọc.
8. Bác sĩ kết thúc lượt sau khi có phiếu. Tiếp đón mở lượt tiếp theo; lượt trước giữ nguyên lịch sử. Reload cần chọn lại tài khoản, dữ liệu giả vẫn còn.

Bản in đơn/chỉ định/kết quả/phiếu thu/báo cáo có nhãn dữ liệu giả và lấy cơ sở từ cấu hình; chưa phải mẫu nghiệp vụ đã được nghiệm thu. Thu trước/sau là hướng dẫn cấu hình; chưa chặn luồng theo trạng thái trả tiền. Giấy hẹn, đính chính kết quả, hủy lượt dang dở, địa chỉ hierarchy và trường chẩn đoán/đơn đầy đủ còn cần phát triển theo FE-04/08/09.

## Kiến trúc và kiểm tra

- `app.js`: shell/trang chủ, luồng tiếp nhận và phiếu khám.
- `modules.js`: lịch hẹn, queue, active visits, chart sections, tài liệu, form drafts, quản trị và session UI.
- `operations.js`: màn hình có phạm vi riêng cho thu ngân, KTV, dược và quản lý; bản in mẫu.
- `workflow.js`: 8 role, privilege ghép, guard màn hình/tab/form, thanh toán/hoàn, chỉ định/kết quả, validation hẹn và form definitions.
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

Chỉ nhập dữ liệu giả. localStorage/tài liệu/journal/thu tiền/cấp thuốc/khóa tài khoản/role demo không phải lưu trữ bệnh án hoặc phân quyền production. Không có chữ ký điện tử, cấp phát thuốc, LIS/PACS, liên thông hay patient portal. Không tuyên bố tuân thủ đầy đủ quy định Việt Nam. Các mục cần xác minh nằm trong [VIETNAM_COMPLIANCE.md](../docs/VIETNAM_COMPLIANCE.md).

Font Be Vietnam Pro tải từ Google Fonts, fallback system-ui khi offline. Ảnh tải từ https://images.unsplash.com/photo-1559839734-2b71ea197ec2 và lưu local; không phải ảnh nhân viên của VinSHC.
