# Giao diện công việc và ánh xạ backend

Cập nhật 13/10/2026 sau khi bổ sung API luồng nhân viên trong `infra/backend`
(hợp đồng: [docs/api/care.md](../../docs/api/care.md)). Tất cả đường dẫn nằm sau
`/openmrs/ws/rest/v1/`, gửi kèm header vai trò/cơ sở của workspace.

## Màn hình và API

| Màn hình | Danh sách (GET) | Thao tác |
| --- | --- | --- |
| Bệnh nhân | `vinshc/patients?q=` — tên không dấu, mã hồ sơ, CCCD/BHYT, điện thoại | Đăng ký `POST vinshc/patients` (idgen, kiểm tra trùng, 409 kèm hồ sơ tương tự); xem/sửa `vinshc/patients/{uuid}` |
| Hành chính | — | `vinshc/identity`, contact, address, field-state, danh mục tỉnh/xã |
| Lượt khám | `vinshc/visits?status=&date=` | Mở `POST vinshc/visits` (check-in lịch hẹn tùy chọn); chi tiết; kết thúc `POST vinshc/visits/{uuid}/close` |
| Sinh hiệu | `vinshc/vitals?patient=&visit=` | Encounter `POST vinshc/visits/{uuid}/encounters` (`vitals`); ghi `POST vinshc/vitals`; đính chính `…/correction`; hủy `DELETE vinshc/vitals/{uuid}` |
| Khám & điều trị | — (vào từ Lượt khám) | Encounter `consultation`; clinical-summary (kèm sinh hiệu); phiếu khám, chẩn đoán, dị ứng, kê/ngừng thuốc, chốt phiếu |
| Lịch hẹn | `vinshc/operations/appointments?date=&status=` | Đặt, chuyển trạng thái, check-in mở lượt, in giấy hẹn |
| Hàng đợi | `vinshc/operations/queue?point=&state=&date=` | Cấp số, chuyển trạng thái, chuyển điểm |
| Thu ngân | `vinshc/operations/bills?status=open`, `vinshc/operations/payments?status=pending` | Lập phiếu, thu, xác nhận chuyển khoản, hoàn, hủy, in phiếu thu |
| Chỉ định & kết quả | `vinshc/operations/service-orders?state=` (KTV: được giao + chờ phân công) | Tạo, phân công, ghi/đính chính kết quả, tệp đính kèm |
| Quầy thuốc | `vinshc/pharmacy/prescriptions?status=pending` | Cấp `POST vinshc/pharmacy/dispenses` (số lượng còn lại, lô, hạn dùng); chi tiết; in đơn |
| Báo cáo | — | Ngày `operations/reports/daily`; nhiều ngày `operations/reports/range` (≤ 31) |
| Quản trị | — | Workspace, kiểm tra quyền, phân công, audit; System Developer: tìm user và thêm role Core |

Người kê/KTV được tự điền từ `vinshc/providers/me` khi tài khoản có đúng một provider.

## Hành vi giao diện

- Danh sách tự tải khi mở mục; có bộ lọc, “Tải thêm” theo `hasMore`, giờ cập nhật.
  Sau mỗi thao tác ghi thành công, danh sách đang hiển thị được tải lại.
- **Chọn** một dòng đặt Hồ sơ đang làm việc (bệnh nhân/lượt/encounter) và hiện họ tên ở
  khung ngữ cảnh. Nút thao tác trên dòng mở đúng biểu mẫu, điền sẵn mã bản ghi và giá trị
  gợi ý (số tiền còn phải thu, số lượng còn phải cấp); người dùng vẫn phải xác nhận.
- Khi backend trả 409 kèm `matches`, FE hiện danh sách bản ghi có sẵn để chọn; dữ liệu
  đã nhập trong biểu mẫu được giữ.
- Nút thao tác chỉ hiện khi vai trò được phép theo `metadata/permissions.json`; backend
  vẫn kiểm tra quyền, phạm vi cơ sở, liên kết và trạng thái.
- Không lưu bệnh nhân/credential trong localStorage/sessionStorage; đổi workspace hoặc
  đăng xuất xóa danh sách, ngữ cảnh và bộ nhớ phiên.

## Còn chờ backend

- Tạo tài khoản nhân viên, liên kết provider, thiết lập cơ sở/biểu mẫu: màn hình chuẩn bị
  trong Quản trị, nút gửi bị tắt.
- Kho/tồn/lô chi tiết và tích hợp ngoài (BHYT, HĐĐT, đơn thuốc quốc gia, LIS/PACS) thuộc
  phạm vi sau pilot.

## Kiểm chứng

`npm test` (HTTP client, context/UUID mapping), `npm run test:browser` (ba bộ Playwright
mock: luồng danh sách → biểu mẫu, quyền theo vai trò, quản trị), `npm run test:api`
(caller FE phủ mọi mapping VinSHC trong repo) và `npm run test:live` (đọc API thật).
Luồng ghi thật bằng tài khoản 7 role: `tests/integration/test_b11_care_workflow.py`.
