# Giao diện công việc và ánh xạ backend

Cập nhật 13/10/2026. Chỉ thay đổi `infra/frontend`; backend giữ nguyên main
`d9d5b957223f6bc73db173dbbc1d413910689526`.

## Giao diện mới

- Mặc định vào **Tổng quan công việc**, chỉ có lối vào các phần thuộc quyền của role.
- **Bệnh nhân**: màn hình tìm kiếm/tiếp nhận chuẩn bị trước, nút mở hành chính theo
  UUID hiện có và bảng các bệnh nhân đã đọc trong workspace.
- **Lượt khám**: chuẩn bị danh sách, mở lượt, tạo encounter và kết thúc lượt.
  Các thao tác ghi chỉ hiện bản xem trước cho role liên quan, chưa được gửi.
- **Hồ sơ đang làm việc**: chọn patient/visit/encounter một lần để điền vào form.
  Mã nhập tay chưa được xác minh chỉ bằng nút Áp dụng; BE kiểm tra quyền/liên kết khi gửi.
- Các phần lịch hẹn, hàng đợi, thu ngân và CLS có bố cục danh sách/filter chờ API,
  các thao tác API thật, bảng bản ghi đã mở và bộ chọn bản ghi theo đúng loại.
- Quầy thuốc có bố cục tìm đơn và xác nhận cấp thuốc/kho/lô/hạn dùng chờ BE.
- Quản trị có lối tắt tìm user/thêm role (System Developer), assignment/audit,
  danh mục 8 role và form chuẩn bị tạo nhân viên/thiết lập cơ sở.
- Các phản hồi có số tiền/báo cáo có thẻ chỉ số từ giá trị BE thực trả về.
  Đã sửa CSS in để nội dung trong `#app` không bị stylesheet landing ẩn.

## Các thao tác đang gọi BE

Tất cả đường dẫn dưới đây nằm sau `/openmrs/ws/rest/v1/`, trừ ghi chú Core.
`connected-actions.js`, `additional-actions.js`, `backend-client.js` giữ hợp đồng
payload, headers role/location và validation đã có; giao diện không đổi quyền BE.

| Màn hình | Nối hiện tại |
| --- | --- |
| Hành chính / mở bệnh nhân theo mã | GET `vinshc/identity/{patient}`; contact/address/field-state và danh mục hành chính |
| Hồ sơ lần khám | GET `vinshc/encounter/{encounter}/clinical-summary`; consultation, diagnosis, allergy, drug-order/finalize |
| Sinh hiệu | POST `vinshc/vitals` |
| Lịch hẹn | `vinshc/operations/appointments`: tạo, đọc UUID, transition |
| Hàng đợi | `vinshc/operations/queue`: tạo, đọc UUID, transition, advance |
| Thu ngân | `vinshc/operations/bills`, `/payments`: tạo/đọc, receipt, settle, refund, cancel |
| CLS | `vinshc/operations/service-orders`, `/results`, `/attachments`: thao tác đã có |
| Chứng từ / báo cáo | `vinshc/operations/documents/{template}/{source}`, `/reports/daily` |
| Quản trị | `vinshc/authorization/*`, `vinshc/operations/configuration`; Core `user` chỉ tìm/đọc/cập nhật role cho System Developer |

Không tự động chạy request khi mở tổng quan hoặc áp dụng context. **Đọc lại** trên
bảng mới thực hiện GET của đúng loại bản ghi qua BackendClient, không dùng Core
patient/visit để vượt quyền. Chọn dòng chỉ chọn context; thao tác ghi cần bấm xác nhận.

## Các màn hình chuẩn bị trước

Chưa có hợp đồng VinSHC scoped cho tìm/tạo patient, lifecycle visit/encounter,
list/search B8, đọc/sửa/void vitals, dispensing và quản lý cấu hình. Tạo user qua
Core tồn tại ở BE nhưng chưa có luồng FE được triển khai/kiểm chứng.

Các form này có nhãn **Chờ backend**, nút gửi disabled và submit handler không
phát request. Không đoán endpoint, không gọi thử endpoint chưa xác nhận, không
trả danh sách rỗng như thể đã tải thành công, không lưu nháp vào DB/trình duyệt.
Input chỉ để xem trước/nhập thử; đổi màn hình không giữ bản nháp.

UUID identifier type, visit type, encounter type lấy từ `metadata/frontend-map.json`.
Giới tính M/F/O/U, birth precision day/month/year/unknown và visit close reason
trích từ pack main vào `metadata/ui-options.json`, có provenance trong `source.json`.
Form chuẩn bị chưa phải payload đã được BE chấp thuận. Khi có API mới cần xác nhận
DTO, quyền, UUID scope, validation và test rồi mới thêm caller/bật nút tương ứng.

## Bản ghi trong phiên và ngữ cảnh

`WorkspaceMemory` chỉ nhận phản hồi thành công, tối đa 100 bản ghi cho một workspace.
Không có dữ liệu sinh sẵn hoặc lưu localStorage/sessionStorage. Đổi role/cơ sở,
đăng xuất/hết phiên hoặc rời trang xóa dữ liệu trong bộ nhớ.

- Patient/encounter DTO dùng `patientUuid`/`encounterUuid`; nghiệp vụ dùng `uuid`.
- Projection con từ SQL có `payment_uuid`, `result_uuid`, `attachment_uuid`;
  được ánh xạ rõ ràng theo loại, không coi mọi UUID là cùng một loại.
- Phiếu phí và giao dịch có bộ chọn riêng: receipt dùng bill UUID, refund/settle
  dùng payment UUID. Không điền UUID giao dịch vào trường UUID phiếu phí.
- Đổi bệnh nhân/lượt/encounter bỏ liên kết và lựa chọn không còn phù hợp.
  Payment không trả patient: chỉ suy liên kết từ bill đã nhận thật; nếu không có
  thì bỏ context bệnh nhân cũ. Backend vẫn kiểm tra mọi thao tác.
- Bảng chỉ là snapshot **đã mở trong phiên**, có giờ nhận, không phải worklist server.
  Sau thu/hoàn/settle, bill đã biết đánh dấu **Cần đọc lại**, không tự suy số dư mới.
- Sau lỗi request, input vẫn còn để sửa/retry; nút chờ API vẫn bị vô hiệu hóa.

## Kiểm chứng

`npm test` kiểm tra cả HTTP client và context/UUID mapping của WorkspaceMemory.
`npm run test:browser` chạy ba bộ Playwright, gồm `workspace-check.cjs` mới:
role dashboard, pending không gọi API, metadata, context reset, bảng phản hồi thật
trong mock, mapping bill/payment, refresh, lỗi, print CSS, desktop 1440/mobile 390.
`npm run test:live` kiểm tra đăng nhập/workspace và đọc API với admin thật.
`npm run test:api` tiếp tục đối chiếu caller cho 56/56 mapping BE hiện tại.
Mock chỉ ở test, không nạp vào ứng dụng hoặc DB. Chưa chạy ghi lâm sàng E2E trên DB.
