# Đánh giá mức hoàn thành BE và FE

Cập nhật 13/10/2026 trên nhánh `feat/complete-clinic-workflow` (tách từ `main` `54a4fda`).
Bản đánh giá trước (FE chỉ có caller cho 56 route, chưa có API tìm bệnh nhân, lượt khám,
danh sách và cấp thuốc) nằm trong lịch sử Git của file này.

## Kết luận

Nhân viên có thể đi trọn luồng **tiếp nhận → sinh hiệu → khám/kê đơn → thu ngân → cấp thuốc →
kết thúc lượt** chỉ qua FE, với tài khoản thật theo vai trò và cơ sở. Đã chứng minh bằng
bộ tích hợp B11 (API) và một lần chạy Playwright trên backend thật (không mock).

Phần chưa làm theo yêu cầu: quản lý tài khoản/provider/cấu hình cơ sở. Ngoài phạm vi pilot:
kho/tồn/lô chi tiết, BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS.

## Đã bổ sung

| Phần | BE (`infra/backend`, hợp đồng [care.md](../../docs/api/care.md)) | FE |
| --- | --- | --- |
| Bệnh nhân | Tìm theo tên không dấu/mã/CCCD/BHYT/điện thoại; đăng ký với mã idgen, idempotency, chặn trùng định danh và cảnh báo hồ sơ tương tự (409 kèm `matches`); sửa một phần có lý do; projection theo vai trò; phạm vi theo cơ sở đăng ký | Danh sách tìm kiếm, form đăng ký/sửa, chọn hồ sơ có sẵn khi 409 |
| Lượt khám | Mở (một lượt mở/bệnh nhân, check-in lịch hẹn), danh sách theo trạng thái/ngày, kết thúc có lý do + ghi chú (Obs hành chính), chặn hoàn tất khi còn chỉ định/phiếu phí, đóng phiếu hàng đợi; encounter sinh hiệu/khám theo vai trò với provider của tài khoản | Danh sách lượt, nút chuyển sang sinh hiệu/khám/xếp hàng/lập phí/kết thúc |
| Sinh hiệu | Đọc lịch sử, đính chính (void + nhóm mới), hủy có lý do, chặn ghi khi lượt đã đóng; clinical-summary kèm sinh hiệu | Encounter → form đo tự điền mã; lịch sử; đính chính/hủy |
| Danh sách vận hành | Lịch hẹn, hàng đợi, phiếu phí, giao dịch chờ xác nhận, chỉ định CLS (KTV: được giao + chờ phân công), phân trang | Danh sách tự tải, lọc, “Tải thêm”, thao tác trên dòng điền sẵn biểu mẫu |
| Cấp thuốc | Đơn chờ cấp, ghi cấp idempotent theo số lượng còn lại, số lô/hạn dùng; chặn đơn ngừng/hết hiệu lực, lượt hủy, lô hết hạn | Danh sách đơn, form cấp, chi tiết các lần cấp |
| Chứng từ/báo cáo | Quyền in đơn thuốc dùng `prescription print`, phiếu kết quả dùng `diagnostic_result print`; báo cáo nhiều ngày ≤ 31 | Dược in được đơn; báo cáo nhiều ngày cho quản lý |

Sửa thêm trong quá trình kiểm thử với tài khoản thật: adapter cấp proxy privilege còn thiếu cho
idgen, Care Settings, và các SaveHandler của module bedmanagement/queue chạy khi lưu visit/encounter
(trước đây kê đơn qua tài khoản bác sĩ thật bị 403 `Get Care Settings`). Các quyền này chỉ có hiệu
lực trong request của adapter, REST/FHIR Core vẫn đóng với role ứng dụng.

Công cụ FE: `npm run backend:*` build backend từ working tree (không còn xuất commit cũ đã khóa),
`test:api` đọc controller trong repo.

## Kiểm chứng ngày 13/10/2026

Stack Docker cô lập `ehr-complete`, volume mới, overlay catalogue metadata như CI.

| Kiểm tra | Kết quả |
| --- | --- |
| Build module + JUnit trong Docker | BUILD SUCCESS, 18/18 |
| `check_database.py`, metadata verify, smoke tạo fixture | PASS |
| B1–B8 theo thứ tự CI trên DB sạch | 53/53 |
| Dựng lại container giữ volume: smoke, metadata, B9 restart | PASS, 4/4 |
| B10 review regressions | 16/16 |
| B11 luồng nhân viên, tài khoản thật 7 role | 12/12 |
| Python tooling tests | 35/35 |
| `npm test` | 16/16 |
| `npm run test:browser` (3 bộ Playwright mock, desktop/mobile) | Đạt |
| `npm run test:api` | Caller FE phủ 79/79 mapping VinSHC |
| `npm run test:live` (Vite → gateway → OpenMRS, chỉ đọc) | Đạt |
| Playwright trên backend thật: tiếp đón đăng ký/mở lượt/xếp hàng → điều dưỡng ghi sinh hiệu → bác sĩ khám/kê đơn → thu ngân lập phí/thu → dược cấp thuốc → tiếp đón kết thúc lượt | Đạt (kịch bản tạm, không commit; dữ liệu synthetic trong stack cô lập) |

Chưa chạy: B9 backup/restore sang project thứ hai và CI trên GitHub Actions cho nhánh này.

## Còn lại

1. Quản lý tài khoản, liên kết provider–tài khoản, cấu hình cơ sở/biểu mẫu (đã loại khỏi đợt này).
   Hiện nhân viên lâm sàng cần quản trị liên kết provider trước khi tạo encounter; FE báo rõ khi thiếu.
2. Bệnh nhân đăng ký ở cơ sở khác hoặc tạo trực tiếp qua Core không tìm được từ cơ sở này.
3. Chưa có sửa/hủy phiếu cấp thuốc vì ma trận quyền chưa có `dispensing update/void`.
4. Mẫu in pháp lý/chữ ký, kho đầy đủ, tích hợp ngoài và nghiệm thu danh mục production vẫn
   theo `docs/PILOT_READINESS.md` (**NOT APPROVED FOR REAL DATA**).
