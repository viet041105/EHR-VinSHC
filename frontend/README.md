# VinSHC — frontend khám ngoại trú

Frontend độc lập bằng HTML/CSS/JavaScript modules, giữ backend OpenMRS hiện có. Trang chủ dùng ảnh chụp thật và bố cục xanh dương/xanh ngọc theo ảnh tham chiếu; khu nhân viên dùng menu bên trái và trang theo 8 role.

Đọc [thiết kế FE và hợp đồng bàn giao FE–BE](../docs/FRONTEND.md) để đối chiếu màn hình, quyền, DTO và các mốc B1–B9. [Phạm vi/mapping 13 thành phần ban đầu](../docs/FRONTEND_SCOPE.md) giữ bối cảnh báo cáo; không phải hợp đồng API đã được kiểm chứng.

## Chạy

Tại gốc repo EHR-VinSHC hoặc trong thư mục `frontend`, chạy:

```sh
npm run dev
```

Lệnh này dùng Node.js/npm và Python 3 có sẵn qua lệnh `python3`; không cần `npm install` để mở giao diện. Có thể chạy trực tiếp từ gốc repo:

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory frontend
```

Mở http://127.0.0.1:5173. Không mở bằng file://. Sửa code rồi refresh trình duyệt; `Ctrl+C` để dừng server.

## Các màn hình và vai trò

Trang chủ chỉ giới thiệu VinSHC; các nội dung xuất hiện theo viewport với độ trễ lần lượt 80ms trong mỗi nhóm, hỗ trợ reduced motion và focus bàn phím. “Vào phòng khám” mở bộ chọn tài khoản, không mặc định bác sĩ. Khu nhân viên có menu riêng theo role; điện thoại mở menu bằng nút cạnh tài khoản. Xem [thiết kế theo kế hoạch 8 role](../docs/ROLE_WORKFLOWS.md).

- Tiếp đón: tiếp nhận, sửa hành chính, mở lượt, lịch hẹn, hàng đợi theo phòng/bác sĩ; lịch sử hành chính; hủy/bỏ về có lý do.
- Điều dưỡng: danh sách đo sinh hiệu, ghi chú/bàn giao, tài liệu, biểu mẫu điều dưỡng; ngữ cảnh lâm sàng chỉ đọc.
- Bác sĩ: khám/dị ứng/chẩn đoán và mức chắc chắn; thuốc có liều/đơn vị/đường dùng/tần suất/số ngày; chỉ định và phân KTV, đơn mẫu xác nhận, tái khám, kết thúc lượt; tóm tắt lượt và giấy hẹn mẫu.
- Thu ngân: bảng giá, phiếu phí, thu từng phần/đủ, hoàn/hủy có lý do, phiếu thu.
- KTV CLS: chỉ định chờ xử lý được giao cho đúng tài khoản, kết quả sơ bộ và trang kết quả đã hoàn tất riêng; báo cáo đính kèm.
- Dược/quầy thuốc: đơn chờ cấp và lịch sử cấp riêng; ghi cấp sau đối chiếu, không sửa đơn, chặn cấp đối với lượt hủy. Kho/lô/hạn dùng còn ở module mở rộng.
- Quản lý: báo cáo lượt, thu/hoàn/ròng theo ngày; không hiển thị bệnh án hoặc tên người bệnh.
- Quản trị: tài khoản nhiều role, khóa/mở khóa, form nháp theo người điền, bảng giá mẫu, cấu hình cơ sở/biến thể, nhật ký, trang bàn giao FE–BE và kiểm tra REST session local.

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

Bản in đơn/chỉ định/kết quả/phiếu thu/báo cáo/tóm tắt lượt/giấy hẹn có nhãn dữ liệu giả và lấy cơ sở từ cấu hình; chưa phải mẫu nghiệp vụ đã được nghiệm thu. Ngày hẹn trên phiếu không tự tạo slot lịch khám. Hủy/bỏ về giữ phiếu khám, chỉ định và giao dịch; thu ngân xử lý phí riêng. Báo cáo tách lượt hoàn tất với lượt hủy. Thu trước/sau là hướng dẫn cấu hình; chưa chặn luồng theo trạng thái trả tiền. Đính chính kết quả, địa chỉ hierarchy, danh mục chẩn đoán/thuốc và mẫu chuẩn đầy đủ còn cần phát triển theo FE-04/08/09.

## Kiến trúc và kiểm tra

- `app.js`: shell/trang chủ, luồng tiếp nhận và phiếu khám.
- `landing.js`: trang chủ dùng ảnh chụp thật, nội dung giới thiệu và footer.
- `modules.js`: lịch hẹn, queue, active visits, chart sections, tài liệu, form drafts, quản trị và session UI.
- `operations.js`: màn hình có phạm vi riêng cho thu ngân, KTV, dược và quản lý; bản in mẫu.
- `workflow.js`: 8 role, privilege ghép và giới hạn thao tác trong từng không gian; guard màn hình/tab/form, hủy lượt, trường thuốc, thanh toán/hoàn, chỉ định/kết quả, validation hẹn và form definitions.
- `backend-mapping.js`: bản đồ dịch vụ chờ bàn giao và command trung gian sinh hiệu theo concept UUID/version metadata; không tự gửi REST request hoặc sinh UUID tạm.
- `repository.js`: adapter dữ liệu giả, localStorage `vinshc-demo-v2` gồm patients/workspace; đọc dữ liệu `vinshc-demo-v1` cũ khi chưa có v2.
- `api.js`: kiểm tra session localhost, không phải clinical API repository.
- `styles.css`: layout responsive và hiệu ứng; `assets/`: ảnh thật tải local, xem [nguồn ảnh](assets/ASSET_SOURCES.md).

```sh
node frontend/verify.mjs
node --check frontend/app.js
node --check frontend/modules.js
```

Browser QA dùng Playwright; `browser-check.cjs` và `design-check.cjs` dùng browser context riêng, dữ liệu giả không tác động browser người dùng. Bài thứ hai kiểm tra mọi trang của 8 role trên desktop/mobile, hiệu ứng tuần tự/reduced motion/focus, ảnh local, giấy hẹn/tóm tắt lượt và hủy/bỏ về. Chạy từ frontend sau `npm install` / `npx playwright install chromium`, cùng server đang chạy:

```sh
npm run test:browser
```

Ảnh QA lưu dưới `/private/tmp` (có thể đổi `QA_OUTPUT_DIR`), không phải artifact production.

## Việt Nam, API và giới hạn

UI tiếng Việt, ngày vi-VN và thời gian hiển thị Asia/Ho_Chi_Minh. Các datetime-local nhập theo timezone trình duyệt, nên đặt thiết bị Asia/Ho_Chi_Minh khi demo; adapter thật phải chốt timezone. Có định danh cá nhân/BHYT tùy chọn, địa chỉ văn bản hiện tại, mã riêng, trạng thái dị ứng rõ ràng và đơn vị sinh hiệu. Ngưỡng nhập số chỉ kiểm tra lỗi, không phân loại bệnh; ICD/thuốc chưa đối chiếu danh mục lâm sàng.

Metadata Việt Nam/UUID/địa chỉ hierarchy, O3 form schema, drug/order type/care setting, provider/location, pagination, role/privilege cần xác nhận với người 1/3/4 khi nối backend. Không suy ra quyền ghi FHIR từ read capabilities.

Chỉ nhập dữ liệu giả. localStorage/tài liệu/journal/thu tiền/cấp thuốc/khóa tài khoản/role demo không phải lưu trữ bệnh án hoặc phân quyền production. Không có chữ ký điện tử, cấp phát thuốc, LIS/PACS, liên thông hay patient portal. Không tuyên bố tuân thủ đầy đủ quy định Việt Nam. Các mục cần xác minh nằm trong [VIETNAM_COMPLIANCE.md](../docs/VIETNAM_COMPLIANCE.md).

Font Be Vietnam Pro tải từ Google Fonts, fallback Arial/sans-serif khi offline. Ảnh mới là ảnh chụp trên Pexels, tải và lưu local theo yêu cầu không dùng ảnh gen AI; ảnh không đại diện nhân viên của VinSHC. Tác giả, trang nguồn, URL tải và giấy phép được ghi tại [ASSET_SOURCES.md](assets/ASSET_SOURCES.md).
