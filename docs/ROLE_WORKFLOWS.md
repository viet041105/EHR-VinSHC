# Thiết kế FE theo 8 vai trò phòng khám

Đối chiếu ngày 08/10/2026 sau khi đồng bộ `origin/main` tại `631f89e`. Nguồn hiện tại: [PROJECT_PLAN](../PROJECT_PLAN.md) §2.2–2.4, FE-01–FE-09, DATA-04; [CLINIC_WORKFLOW](CLINIC_WORKFLOW.md) §2–4; [BACKEND](BACKEND.md) B5/B8; [DATA_DICTIONARY](DATA_DICTIONARY.md). Báo cáo `Electronic Heath Record.pdf` trang 5–6 là bản đồ module/app ban đầu, không thay thế kế hoạch phòng khám mới.

**4 người phát triển khác với 8 role sử dụng.** Snapshot kế hoạch trước trên nhánh FE chỉ có 4 role; kế hoạch mới có tiếp đón, thu ngân, điều dưỡng, bác sĩ, KTV CLS, dược/quầy thuốc, quản lý phòng khám và quản trị hệ thống.

## Thiết kế đã triển khai bằng dữ liệu giả

Thiết kế bàn giao đầy đủ theo backend nằm tại [FRONTEND.md](FRONTEND.md): trang/DTO/dịch vụ → OpenMRS/module → B1–B9, mapping sinh hiệu, trạng thái, lỗi và tiêu chí nghiệm thu. Giao diện dùng ảnh chụp thật, menu bên trái cho nhân viên và scroll reveal ở trang công khai.

Trang chủ công khai chỉ giới thiệu sản phẩm. “Vào phòng khám” mở bộ chọn tài khoản và không gian làm việc, không mặc định đăng nhập bác sĩ. Mỗi không gian có trang tổng quan, menu, danh sách công việc và thao tác riêng.

| Vai trò | Không gian / màn hình | Quyền ghi trong demo | Phạm vi đọc và giới hạn |
| --- | --- | --- | --- |
| Tiếp đón (`reception`) | Tổng quan, tiếp nhận/tìm hồ sơ, lịch hẹn, điều phối theo phòng/bác sĩ, lượt mở, lịch sử tiếp nhận | Đăng ký/sửa hành chính, mở lượt; tạo/đã đến/hủy hẹn; điều phối; hủy/bỏ về có lý do | Định danh, trạng thái tiếp nhận; không mở nội dung khám, tài liệu y tế, thuốc hoặc kết quả |
| Thu ngân (`cashier`) | Tổng quan, phiếu phí, giao dịch/phiếu thu, bảng giá | Lập phí theo bảng giá, thu từng phần/đủ, hoàn toàn bộ số đã thu có lý do, hủy phiếu chưa thu | Định danh tối thiểu, dịch vụ, lượt, giá; không sửa hoặc mở chart lâm sàng |
| Điều dưỡng (`nurse`) | Tổng quan, danh sách đo, hồ sơ chăm sóc, lượt mở, hàng đợi, lịch sử, biểu mẫu điều dưỡng | Sinh hiệu, ghi chú điều dưỡng/bàn giao, tài liệu giả, biểu mẫu được giao | Đọc ngữ cảnh chăm sóc; phiếu khám/chẩn đoán/thuốc/chỉ định/kết quả chỉ đọc. Không kê đơn, chẩn đoán hoặc xác nhận CLS |
| Bác sĩ (`doctor`) | Tổng quan, danh sách khám, hồ sơ/chart, hàng đợi, lịch khám/tái khám, lịch sử, biểu mẫu khám | Khám/dị ứng/chẩn đoán/thuốc, ghi chú lâm sàng, tạo/hủy chỉ định và phân KTV, xác nhận đơn mẫu, hẹn của mình, kết thúc lượt | Đọc chart; sinh hiệu chỉ đọc trừ khi có privilege từ role điều dưỡng hoặc cấu hình không có điều dưỡng. Không sửa phiếu thu |
| KTV CLS (`lab`) | Tổng quan, chỉ định chờ xử lý được giao, trang kết quả hoàn tất riêng | Kết quả sơ bộ/hoàn tất, báo cáo PDF/ảnh gắn chỉ định | Chỉ định có `assignedTo` khớp tài khoản và định danh cần đối chiếu; không mở toàn bộ chart. Kết quả hoàn tất/lượt đóng chỉ đọc |
| Dược/quầy thuốc (`pharmacy`) | Tổng quan, đơn chờ cấp, lịch sử cấp thuốc riêng | Đối chiếu rồi ghi cấp theo bản chụp đơn đã xác nhận; chặn cấp ở lượt hủy | Định danh, thuốc/cách dùng/số lượng/người kê; không sửa đơn hoặc xem toàn bộ bệnh án. Kho/lô/hạn dùng còn thuộc mở rộng |
| Quản lý phòng khám (`manager`) | Tổng quan, báo cáo ngày | Không ghi bệnh án hoặc giao dịch; xem/in báo cáo | Chỉ số tổng hợp lượt, thu/hoàn/ròng, lượt/bác sĩ. Không hiện tên người bệnh hoặc bệnh án chi tiết |
| Quản trị hệ thống (`admin`) | Tổng quan, tài khoản/quyền, định nghĩa biểu mẫu, cấu hình, bảng giá, nhật ký, bàn giao FE–BE, kết nối | Thêm/phân nhiều role/khóa tài khoản, form nháp, bảng giá mẫu, cấu hình hiển thị và biến thể | Không tự có menu hồ sơ hoặc quyền ghi lâm sàng; muốn khám phải được giao thêm role bác sĩ và chuyển không gian |

Tài khoản chứa `roles[]`; privilege là hợp của các role được giao. Người kiêm nhiệm chọn không gian tương ứng mà giữ nguyên ID tài khoản. `ROLE_DEFINITIONS`, `ROLE_PERMISSIONS`, `accountPermitted`, `workspacePermitted` và các guard route/tab/form nằm tại [workflow.js](../frontend/workflow.js). Menu và thao tác theo ngữ cảnh công việc; admin kiêm bác sĩ không ghi phiếu khám khi còn ở không gian admin. Bác sĩ kiêm điều dưỡng có thể ghi sinh hiệu. Tài khoản khóa bị loại khỏi bộ chọn. Dữ liệu cũ có trường `role` được chuyển sang `roles[]`; 4 tài khoản mẫu bổ sung được tạo khi mở dữ liệu FE cũ. Form cũ chưa có người điền được chuyển về bác sĩ, tránh tự cấp quyền rộng hơn.

Nội dung ghi và nhật ký lưu tên, ID tài khoản, role đang làm việc, thời điểm và lượt liên quan. Bản chụp đơn giữ nguyên thuốc, liều/đường dùng/tần suất/số ngày và lời dặn khi phiếu khám được sửa hoặc khi đã cấp. Phiếu phí giữ giá khi lập; giao dịch hoàn là dòng âm, không xóa giao dịch thu. Không thu quá số còn phải thu hoặc dùng VND có phần thập phân. Kết quả CLS hoàn tất cần xác nhận đối chiếu và được khóa trên UI; quy trình đính chính chưa triển khai.

Hủy/bỏ về ghi `closure.kind/reason/actor/actorId/recorded`, giữ dữ liệu lượt và giao dịch; không tự hoàn phí hoặc xóa chỉ định. Lượt chuyển sang chỉ đọc. Báo cáo tách lượt hoàn tất với lượt hủy trong nhóm lượt mở của ngày báo cáo; thu ngân xử lý khoản phí riêng theo quy trình.

## Biến thể cơ sở và mẫu in

- Tên, địa chỉ, giấy phép cơ sở được cấu hình; tài khoản có trường giấy phép hành nghề để in đơn mẫu.
- Có/không có điều dưỡng: không có điều dưỡng thì bác sĩ được ghi sinh hiệu trong demo. Backend phải cấp privilege tương ứng, không chỉ dựa vào flag FE.
- Có/không có quầy thuốc: tắt quầy thuốc chặn ghi cấp tại cơ sở, vẫn xem đơn mẫu.
- Trả trước/trả sau và CLS tại chỗ/gửi ngoài được cấu hình để hướng dẫn. Chưa có máy trạng thái bắt buộc thanh toán trước khi khám/thực hiện CLS. Chỉ định gửi ngoài hoặc chưa phân KTV không tự xuất hiện trong worklist của mọi KTV.
- Có xem/in đơn mẫu đã xác nhận (cả khi lượt đã đóng), chỉ định, kết quả, phiếu thu, giấy hẹn tái khám, tóm tắt lượt và báo cáo tổng hợp. Các bản in ghi rõ dữ liệu giả. Ngày hẹn ghi trên phiếu khám không tự chiếm slot. Mẫu chuẩn đầy đủ, chữ ký và tích hợp quốc gia còn lại trong FE-08.
- Phiếu khám có mức chắc chắn chẩn đoán, ngày hẹn, trạng thái dị ứng không rõ và thuốc có liều/đơn vị/đường dùng/tần suất/số ngày/số lượng. Danh mục ICD-10/thuốc, chẩn đoán kèm theo và UUID metadata chưa được bàn giao; các trường demo không thay thế mã hóa thật.

## Bàn giao cho backend / metadata

Ma trận trong repo hiện là bản nháp nghiệp vụ theo tài liệu. DATA-04/BE-05 cần chốt privilege, role ghép và phạm vi cơ sở/người bệnh/chỉ định/provider; API phải từ chối truy cập ngoài quyền kể cả sửa request trực tiếp.

| Nhóm FE | Hợp đồng cần BE / metadata |
| --- | --- |
| Session/roles | User UUID, nhiều role/privilege, location, trạng thái khóa, lỗi 401/403, timeout/thu hồi phiên |
| Tiếp nhận/chart | Identifier type, patient/person/address, visit, encounter, obs, allergy, diagnosis, drug order; UUID ổn định và phân trang |
| Lịch/queue | Provider/location/service/slot, danh sách theo người khám, state transitions, tranh chấp khi điều phối |
| Billing | Danh mục/bảng giá, line item, payment/refund/cancel, trạng thái, concurrency và số phiếu do server cấp |
| CLS | Order assignment, giới hạn theo KTV, obs/result/attachment, trạng thái sơ bộ/hoàn tất/đính chính, source/time/author |
| Dược | Đơn có trạng thái phù hợp, cấp một lần/idempotency, tồn kho/lô/hạn dùng khi bật module; server kiểm tra không sửa đơn |
| Quản lý | API tổng hợp có phạm vi thời gian/cơ sở; không trả chart cho role chỉ có quyền báo cáo |
| Quản trị | API users/roles/forms/location, backend audit, quy trình backup/restore; không coi tài khoản admin là clinician |

Chưa có clinical repository thật, xác thực workspace thật, upload backend, billing module adapter, chữ ký, kho thuốc, LIS/PACS, BHYT/HĐĐT hoặc nghiệm thu y khoa/pháp lý. Form kiểm tra REST session là công cụ riêng của quản trị; thành công không biến dữ liệu local thành dữ liệu backend. Chức năng backup/restore đang thuộc tooling/backend, không có nút FE chạy sao lưu.

## Kiểm chứng

`frontend/design-check.cjs` kiểm tra mọi trang được công bố cho 8 role trên desktop/mobile, menu điện thoại, scroll reveal một lần/độ trễ theo nhóm/reduced motion/focus, ảnh thật tải local, mức chắc chắn/ngày hẹn, bản in, snapshot đơn sau khi sửa lời dặn, hủy/bỏ về và chặn cấp thuốc bằng cả thao tác sửa DOM. Các test chỉ dùng browser context riêng và dữ liệu giả.

`node frontend/verify.mjs` kiểm tra role/privilege ghép, tài khoản khóa, route/tab/form, dữ liệu cũ, visit/order/result, slot trùng, số tiền/hoàn và khôi phục bản lưu trước khi localStorage thất bại. `frontend/browser-check.cjs` chạy Chromium với dữ liệu giả và timezone Asia/Ho_Chi_Minh, kiểm tra bàn giao tiếp đón → điều dưỡng → bác sĩ → KTV/dược, thu/hoàn/hủy, báo cáo tổng hợp, kiêm nhiệm, form theo role, sai quyền, đọc lại dữ liệu, phục hồi khi lưu lỗi, xem báo cáo đính kèm, lượt đóng/lượt mới và desktop/mobile cho 8 role. Kiểm tra session dùng phản hồi giả 401/200; không phải nghiệm thu backend.
