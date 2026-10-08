# Thiết kế frontend và hợp đồng bàn giao FE–BE

**Ngày đối chiếu:** 08/10/2026. **Phạm vi:** một phòng khám ngoại trú, MVP-1 và MVP-2. Đây là thiết kế FE đề xuất để cùng backend/metadata chốt; không thay thế nghiệm thu quyền tại API hoặc xác nhận chuyên môn.

Nguồn: [BACKEND](BACKEND.md) B1–B5/B8/B9, [CLINIC_WORKFLOW](CLINIC_WORKFLOW.md), [DATA_DICTIONARY](DATA_DICTIONARY.md), [ARCHITECTURE](ARCHITECTURE.md), [PROJECT_PLAN](../PROJECT_PLAN.md) FE-01–09/DATA-04. [FRONTEND_SCOPE](FRONTEND_SCOPE.md) giữ bản đồ module ban đầu; tài liệu này mô tả màn hình và cách bàn giao theo backlog backend mới.

## 1. Ranh giới kiến trúc

```text
Trang giới thiệu → chọn phiên demo / đăng nhập thật khi B5 được bàn giao
                              ↓
             Shell + các trang theo vai trò, cơ sở và quyền
                              ↓
         DTO nghiệp vụ + kiểm tra trường + lớp adapter FE
                              ↓
              Gateway → OpenMRS REST / API module
                              ↓
       Patient → Visit → Encounter → Obs / Diagnosis / Order
                              ↓
                 PostgreSQL do OpenMRS quản lý
```

FE độc lập dùng HTML/CSS/JavaScript modules theo lựa chọn của dự án. Không truy cập PostgreSQL, không thiết kế lại schema OpenMRS. FHIR dùng cho mapping/tích hợp ở B7 khi từng interaction đã được thử; không mặc định dùng FHIR để ghi mọi nghiệp vụ. Các phiên bản runtime tham chiếu `config/baseline.json`.

Hai chế độ phải phân biệt rõ:

- **Hiện tại:** `DemoRepository`, dữ liệu giả trên trình duyệt, quyền FE phục vụ kiểm tra luồng; `api.js` chỉ kiểm tra REST session local.
- **Sau bàn giao B1/B5:** adapter OpenMRS lấy user UUID, provider UUID, location UUID, privilege và khả năng từ server. Không giữ tài khoản demo làm nguồn quyền, không tự fallback sang demo khi API lỗi, không lưu mật khẩu/phiên bệnh án trong localStorage.

`backend-mapping.js` cung cấp bản đồ dịch vụ, trường sinh hiệu và command trung gian để bàn giao. Command **không phải request schema REST**. Chỉ nối adapter sau khi có method/path/schema đã kiểm chứng; không đặt endpoint phỏng đoán vào code.

## 2. Phân quyền và phạm vi dữ liệu

Một tài khoản có thể có nhiều role. Quyền hiệu lực là tập privilege backend cấp, có ràng buộc cơ sở, đối tượng và trạng thái. FE chỉ mở không gian của role được cấp; nút thao tác được giới hạn theo nhiệm vụ của không gian đó. Riêng bác sĩ ghi sinh hiệu khi kiêm điều dưỡng hoặc cơ sở không có điều dưỡng và backend cấp privilege tương ứng.

| Role | Trang FE được mở | Được ghi | Dữ liệu được đọc |
| --- | --- | --- | --- |
| `reception` — Tiếp đón | Tổng quan, tiếp nhận/hồ sơ, lịch hẹn, điều phối, lượt mở, lịch sử tiếp nhận | Tạo/sửa hành chính, mở lượt, hẹn/đã đến/hủy, điều phối; đóng tiếp nhận có lý do khi bỏ về | Định danh, thời gian, trạng thái hành chính. Không khám, thuốc, dị ứng, kết quả, file y tế |
| `cashier` — Thu ngân | Tổng quan, thu phí, phiếu thu/giao dịch, bảng giá chỉ đọc | Lập phí, thu từng phần/đủ, hoàn có lý do, hủy phiếu chưa thu | Định danh tối thiểu, lượt, dịch vụ, giá và giao dịch; không bệnh án |
| `nurse` — Điều dưỡng | Tổng quan, sinh hiệu, lượt mở, hàng đợi, hồ sơ chăm sóc, lịch sử, biểu mẫu điều dưỡng | Sinh hiệu, ghi chú/bàn giao, tài liệu và form chăm sóc được giao | Ngữ cảnh chăm sóc; khám/chẩn đoán/đơn/CLS chỉ đọc; backend cần chốt phạm vi chăm sóc với DATA-04 |
| `doctor` — Bác sĩ | Tổng quan, danh sách khám, chart, hàng đợi, lịch khám/tái khám, lịch sử, biểu mẫu khám | Khám, dị ứng, chẩn đoán, đơn thuốc, chỉ định/phân KTV, ghi chú, tái khám, kết thúc lượt | Chart theo quyền cơ sở/đối tượng; không sửa phiếu thu |
| `lab` — KTV CLS | Tổng quan, chỉ định chờ xử lý, kết quả đã hoàn tất | Ghi sơ bộ, đính kèm và xác nhận kết quả của chỉ định được giao | Định danh tối thiểu, lý do/chỉ định được giao, kết quả của chỉ định; không toàn bộ chart |
| `pharmacy` — Dược/quầy thuốc | Tổng quan, đơn chờ cấp, lịch sử cấp thuốc | Xác nhận cấp theo đơn bác sĩ đã xác nhận | Định danh tối thiểu và snapshot đơn; không sửa đơn/khám |
| `manager` — Quản lý | Tổng quan, báo cáo ngày | Chọn kỳ và xuất báo cáo; không sửa dữ liệu nguồn | Tổng hợp lượt/thu/hoàn/ròng và nhân sự; không tên người bệnh/bệnh án |
| `admin` — Quản trị | Tổng quan, tài khoản/quyền, biểu mẫu, cấu hình, bảng giá, nhật ký, bàn giao FE–BE, kết nối | Tài khoản/role, cấu hình, form nháp, bảng giá | Metadata và thông tin vận hành. Không tự có quyền mở chart |

Quản lý kiêm bác sĩ chuyển sang không gian bác sĩ để khám. Quản trị kiêm role lâm sàng phải dùng đúng không gian và danh tính được cấp, không có cơ chế “admin được làm tất cả”. Một account khóa hoặc role không hợp lệ bị loại khỏi bộ chọn.

**Yêu cầu B5:** server kiểm tra quyền ở từng read/write/download/print. Lab cần lọc `assignedTo` tại server; báo cáo quản lý trả số liệu tổng hợp thay vì gửi danh sách bệnh án rồi giấu bằng CSS. DTO cashier/pharmacy chỉ chứa phần cần dùng. FE guard không thay thế quyền server; dữ liệu demo vẫn nằm trong cùng trình duyệt và không tạo cách ly bảo mật.

## 3. Bản đồ trang → dịch vụ → module/backend

Tên dịch vụ dưới đây là tên hợp đồng bàn giao FE, **không phải URL đã tồn tại**. B1 phải cung cấp method/path thật, schema, lỗi, privilege và fixture cho từng dịch vụ.

| Trang / thao tác | Dịch vụ bàn giao | Đối tượng / module cần khảo sát | Mốc / phụ thuộc |
| --- | --- | --- | --- |
| Đăng nhập, chọn cơ sở, role | `session.read`, `access.read` | User, role/privilege, provider, location; Core/REST/auth | B1/B5; session probe hiện có không bàn giao quyền |
| Tìm/tạo/sửa hành chính | `patient.search/create/update` | Person, Patient, identifier, attributes, address; REST/idgen/addresshierarchy | B2; DATA-04/08, phân trang, tiếng Việt, trùng định danh |
| Mở lượt, lịch sử, kết thúc/bỏ về | `visit.open/list/close` | Visit + location/type; Core/REST | B3/B8; UUID patient/type/location, kết thúc có lý do |
| Ghi sinh hiệu | `vitals.save/read` | Encounter + numeric Obs; Core/REST/forms | B3; DATA-02/06, concept/type/provider, đo khác thời điểm nhập |
| Phiếu khám / chẩn đoán | `exam.save/read`, `diagnosis.save` | Encounter, Obs, Diagnosis; REST/emrapi/forms | B4; ICD-10, chính/kèm theo, certainty, metadata |
| Dị ứng | `allergy.save/read` | Allergy hoặc Obs trạng thái theo quyết định B4 | B4; chưa hỏi / không rõ / đã hỏi không có / có dị ứng |
| Đơn thuốc | `prescription.confirm/read` | Drug Order / drug/care setting; Core/REST | B4; danh mục, liều, đơn vị, đường dùng, tần suất, số ngày, số lượng |
| Lịch hẹn/tái khám | `appointment.list/create/arrive/cancel` | Appointments | B8; provider/service/location, slot và xung đột |
| Điều phối | `queue.list/update` | Queue | B8; hàng đợi theo phòng/bác sĩ, trạng thái chuyển bước |
| Chỉ định CLS | `order.create/cancel/assign` | Test Order, danh mục dịch vụ; Core/REST | B8; order type/concept, assignee, state |
| KTV ghi/trả kết quả | `result.save/finalize/read` | Obs + Order; attachments/complex obs tùy năng lực đã thử | B8; link patient/visit/encounter/order, reference, unit, provenance |
| File/tài liệu | `document.upload/download` | Attachments / patientdocuments / complex obs | B8; thử PostgreSQL/BYTEA, MIME/size và quyền tải file |
| Bảng giá/phiếu phí/thu tiền | `price.list/update`, `bill.create`, `payment.collect/refund/cancel` | Billing hoặc API đặc thù nếu B0 xác định thiếu | B8; snapshot giá, số nguyên VND, chống ghi giao dịch trùng |
| Cấp theo đơn | `dispense.confirm/list` | Dispensing/stock management hoặc extension đã chốt | B8/B0; snapshot đơn, idempotency; kho/lô/hạn dùng sau pilot |
| Báo cáo | `report.daily` | Reporting/billing/visit aggregate API | B8; timezone, thu/hoàn, scope không chứa bệnh án |
| Tài khoản/cấu hình/audit | `account.manage`, `facility.read/update`, `audit.list` | Core role/privilege, Initializer/configuration; audit cần xác định năng lực | B5/B6; journal local không phải audit server |
| Mẫu in | `print.prescription/receipt/order/result/followup/summary` | Projection từ dữ liệu đã lưu + cấu hình cơ sở/provider | B4/B8, FE-08/DATA-09; mẫu được chuyên môn/pháp lý xác nhận |

Sao lưu/restore thuộc B6: FE quản trị cần trạng thái/lịch/lần thử restore từ API vận hành được cấp quyền. Chưa có hợp đồng, vì vậy không tạo nút backup/restore giả hoặc cho trình duyệt chạy lệnh DB. BHYT, hóa đơn điện tử, kê đơn quốc gia, LIS/PACS và liên thông thuộc mở rộng.

## 4. DTO và liên kết cần giữ

| DTO | Trường tối thiểu để bàn giao | Quy tắc |
| --- | --- | --- |
| `SessionContext` | `userUuid`, `providerUuid?`, `locationUuid`, `roles`, `privileges`, `capabilities` | Server là nguồn quyền; provider khác user, không dùng tên làm khóa |
| `PatientIdentity` | `patientUuid`, `internalIdentifier`, `name`, `birthDate`, `birthDateEstimated`, `gender`, identifier/attribute/address đã được cấp quyền | Mã hiển thị khác UUID; không tự gộp người trùng tên |
| `VisitContext` | `visitUuid`, `patientUuid`, `locationUuid`, `visitTypeUuid`, `startedAt`, `endedAt?`, `status`, `closureReason?`, `version?` | Mọi command phải khớp patient/visit; lượt đóng chỉ đọc |
| `EncounterContext` | `encounterUuid`, `patientUuid`, `visitUuid`, `encounterTypeUuid`, `providerUuid`, `locationUuid`, `occurredAt` | Không xem Visit OpenMRS là Encounter FHIR tương đương trực tiếp |
| `VitalObservation` | `fieldCode`, `conceptUuid`, `value`, `unit`, `measuredAt`, nguồn encounter/actor | Không gửi chuỗi có đơn vị vào numeric Obs; không biến ô trống thành 0 |
| `Diagnosis` | code + hệ mã/phiên bản, text, primary, certainty, encounter reference | Danh mục chính thức và UUID chờ metadata; không dùng tên tự nhập làm mã đã chuẩn hóa |
| `PrescriptionLine` | drugUuid, tên/hàm lượng/dạng, dose, doseUnit, route, frequency, durationDays, quantity, quantityUnit, instructions | Không gom toàn bộ liều dùng thành một string khi nối API thật |
| `OrderResult` | orderUuid, encounter reference, assignee, value/file, unit/reference, status, author, source, recordedAt | Hoàn tất có xác nhận; đính chính tạo phiên bản/audit mới theo B8 |
| `Bill/Transaction` | bill/visit/patient reference, priceVersion/snapshot, item/qty, VND, transactionId, amount, method, actor, createdAt, reason, version | Thu/hoàn không xóa giao dịch; idempotency và concurrency phải ở server |

### Mapping sinh hiệu

| Trường FE hiện có | Mã từ điển dữ liệu | Đơn vị trao đổi | OpenMRS |
| --- | --- | --- | --- |
| `pulse` | `vitals.mach` | `/min` | Numeric Obs, concept từ DATA-02 |
| `systolic` | `vitals.ha_tam_thu` | `mm[Hg]` | Numeric Obs |
| `diastolic` | `vitals.ha_tam_truong` | `mm[Hg]` | Numeric Obs |
| `temperature` | `vitals.nhiet_do` | `Cel` | Numeric Obs |
| `respiratory` | `vitals.nhip_tho` | `/min` | Numeric Obs |
| `spo2` | `vitals.spo2` | `%` | Numeric Obs |
| `weight` | `vitals.can_nang` | `kg` | Numeric Obs |
| `height` | `vitals.chieu_cao` | `cm` | Numeric Obs |

`backend-mapping.js` bỏ trường chưa đo, giữ số 0 nếu thực sự nhập, chặn giá trị không hữu hạn/thiếu link/thiếu concept hoặc thiếu version metadata. Không sinh UUID placeholder để gửi API. Ngưỡng chuyên môn và tập trường bắt buộc vẫn chờ mentor; các min/max trong demo là kiểm tra nhập liệu.

Thời gian trao đổi ISO 8601 có offset hoặc UTC; hiển thị `vi-VN`, `Asia/Ho_Chi_Minh`. Adapter cần xử lý datetime-local theo timezone cơ sở độc lập với máy người dùng; demo hiện cần máy đặt timezone Việt Nam. Ngày sinh có cờ ước lượng/địa chỉ tỉnh→xã vẫn chờ DATA-08, không tuyên bố đã hoàn thiện.

## 5. Trạng thái và chuyển bước

| Nhóm | Trạng thái FE | Điều kiện / hậu điều kiện |
| --- | --- | --- |
| Lượt | Chưa mở → đang mở → kết thúc | Mở lượt mới giữ lịch sử cũ; kết thúc thông thường cần phiếu khám; bỏ về/hủy tiếp nhận có lý do, không tự hoàn phí |
| Chỉ định | requested → in-progress → completed; hoặc cancelled | Bác sĩ tạo/hủy; KTV đúng assignee ghi sơ bộ/hoàn tất; không ghi lên chỉ định hủy/kết quả final |
| Đơn | Phiếu khám nháp → ready → dispensed | Bác sĩ xác nhận snapshot; dược cấp một lần và giữ nguyên thuốc; không có quầy chỉ in |
| Phí | unpaid → partial → paid; cancelled / refunded | Không thu quá số còn nợ, không tiền lẻ VND; demo hoàn toàn bộ số đã thu, hoàn một phần cần hợp đồng bổ sung |
| Hẹn | scheduled → arrived / cancelled | Slot/provider không trùng; xác nhận đến không tự mở Visit |

Trả trước/trả sau hiện là hướng dẫn cấu hình. Backend B8 phải chốt gating và quyền ngoại lệ; FE không tự suy ra “đã trả tiền thì được khám” hoặc tự gọi hoàn phí khi hủy lượt. CLS gửi ngoài cần nguồn/đơn vị gửi, file và quyền nhập được chốt riêng; KTV tại chỗ chỉ nhận chỉ định đã phân công.

## 6. Thiết kế giao diện

**Trang công khai:** masthead trắng, hero sáng có ảnh chụp thật bên phải, tiêu đề xanh đậm và xanh ngọc bên trái; dải 5 nội dung giới thiệu, ảnh minh họa các bước chăm sóc, quy trình, phần giới thiệu và CTA vào phòng khám. Các link ở đây chỉ cuộn tới nội dung công khai. Không đưa danh sách bệnh nhân/chart lên landing, không bịa số khách hàng/chứng nhận/hotline hoặc nhận đặt hẹn thật khi chưa có patient portal.

**Khu nhân viên:** thanh đầu trang gọn, menu bên trái theo role, tiêu đề trang và bảng công việc ở vùng chính. Một tác vụ chính trên mỗi màn hình; bảng có mã, trạng thái, thời điểm và hành động rõ ràng. Bác sĩ/điều dưỡng có chart; thu ngân/KTV/dược/quản lý dùng màn hình riêng với trường tối thiểu. Tránh banner lớn, biểu tượng trang trí và nhiều card thống kê lặp lại trong màn hình nghiệp vụ. Bộ chọn vai trò là danh sách tài khoản dễ quét, không giả làm đăng nhập thật.

**Hệ màu:** xanh navy cho chữ, xanh dương cho thương hiệu, xanh ngọc cho hành động; nền trắng và xanh nhạt, đường viền xám. Cỡ chữ nội dung 13–14px, không dùng chữ 8–9px cho bảng công việc. Badge có text, không dùng màu làm tín hiệu duy nhất. Mobile giữ vùng bảng cuộn bên trong, menu mở/đóng và biểu mẫu một cột; focus bàn phím luôn nhìn thấy.

**Hiệu ứng:** nội dung công khai xuất hiện khi đi vào viewport, mỗi nhóm trễ lần lượt khoảng 70–90ms; chỉ quan sát một lần, tôn trọng `prefers-reduced-motion`, focus làm hiện nội dung ngay. Nội dung và thao tác lâm sàng không bị ẩn để chờ animation. Ảnh tải local, lazy load dưới màn hình đầu; nguồn tại [ASSET_SOURCES](../frontend/assets/ASSET_SOURCES.md). Không dùng ảnh gen AI theo yêu cầu.

## 7. Lỗi, lưu và quyền truy cập

| Trường hợp API thật | Hành vi FE phải có khi adapter được bàn giao |
| --- | --- |
| Loading / empty | Placeholder trong vùng đang tải; trạng thái rỗng có hướng dẫn; không báo “đã lưu” trước response |
| 400 / 422 | Lỗi tại trường và giữ bản nhập; focus tới lỗi đầu tiên |
| 401 | Ngừng ghi, yêu cầu đăng nhập lại; không đổi sang admin hoặc demo |
| 403 | Thông báo thiếu quyền, không render dữ liệu bị từ chối; route và nút cùng ma trận |
| 404 | Thông báo dữ liệu đã thay đổi/xóa, cập nhật danh sách |
| 409 / version conflict | Nạp bản mới để đối chiếu; không tự ghi đè kết quả/đơn/giao dịch của người khác |
| Network / timeout / 5xx | Giữ dữ liệu chưa lưu, cho thử lại; không retry mù thao tác thu tiền/cấp thuốc |
| Điều hướng khi đang sửa | Xác nhận giữ/rời bản nháp; adapter phải có chính sách draft được chốt |

Demo hiện rollback về snapshot đã lưu nếu localStorage lỗi. File demo giới hạn PDF/PNG/JPEG 1MB; giới hạn triển khai thật và kiểm tra file phải được xác nhận ở backend.

## 8. Thứ tự nối backend và tiêu chí nghiệm thu

| Đợt | Công việc FE | Backend/metadata bàn giao | Bằng chứng cần có |
| --- | --- | --- | --- |
| F1 | Session, role/cơ sở, tìm/tạo/sửa hành chính, mở/kết thúc/lịch sử | B1/B2/B5 + identifier/location/visit type | Read/write/read lại cùng UUID; hai người trùng tên; 401/403/400, pagination |
| F2 | Sinh hiệu, phiếu khám/dị ứng/chẩn đoán/đơn | B3/B4 + encounter/concept/drug/ICD mapping | Đúng patient/visit/encounter, unit/thời điểm/provider; đóng lượt và lượt tái khám |
| F3 | Hẹn/queue/phí/CLS/cấp thuốc/báo cáo/mẫu in | B8 + DATA-09, FE-08/09 | Đúng assignment; thu/hoàn không trùng; final readonly; biến thể cơ sở |
| F4 | Concurrency, lỗi mạng, quyền API, backup-status, kiểm chứng người dùng | B5/B6/B9 + FE-06/07 | Test trên instance cô lập, restart/restore, mentor/nhân sự phòng khám xác nhận |

Các bài test FE phải bao gồm: 8 role và role kiêm nhiệm; locked account; sửa DOM/route để mở sai quyền; tiếp đón không thấy lâm sàng; KTV sai assignee; quản lý không có tên bệnh nhân; dược không sửa đơn; giá do admin quản lý; final/closed readonly; lưu lỗi; viewport desktop/mobile; scroll reveal/reduced motion. Sau đó B9 chạy cùng API thật, không coi test dữ liệu giả là nghiệm thu backend.

**Chưa hoàn thành:** clinical API repository, backend enforcement, metadata UUID thật, danh mục ICD/thuốc, O3 form publish, địa chỉ hierarchy/ngày sinh ước lượng, đính chính kết quả, phiếu thu hoàn từng phần, trạng thái backup, gating thu trước/sau, draft khi rời trang và mẫu in chuyên môn đã duyệt. Không đánh dấu FE-01–09 hoặc B1–B9 đạt chỉ từ việc dựng được giao diện.

## 9. Triển khai FE trong đợt này

- `landing.js` và `styles.css`: bố cục theo ảnh tham chiếu, ảnh chụp Pexels tải local, nội dung công khai tuần tự theo viewport; menu bên trái cho nhân viên và menu mở/đóng trên điện thoại. Không tạo hotline, chứng nhận hoặc số bệnh nhân giả để quảng bá.
- `workflow.js`: ma trận 8 role, guard theo tài khoản và không gian hiện tại, ngoại lệ bác sĩ ghi sinh hiệu khi có quyền; validation trường thuốc và hủy/bỏ về có lý do. `modules.js`/`operations.js` tách kết quả hoàn tất, lịch sử cấp thuốc và trang bàn giao FE–BE.
- Phiếu khám: chẩn đoán có mức chắc chắn, thêm ngày tái khám, trạng thái dị ứng không rõ; dòng thuốc có liều/đơn vị/đường dùng/tần suất/số ngày. Thuốc/ICD vẫn chưa lấy từ danh mục có mã chuẩn. Đơn đã xác nhận giữ snapshot thuốc và lời dặn, không in lời dặn mới của phiếu khám thay cho bản đơn cũ.
- Giấy hẹn/tóm tắt lượt có xem/in mẫu. Hủy/bỏ về giữ dữ liệu và giao dịch, chặn cấp đơn của lượt hủy; số lượt hủy tách khỏi lượt hoàn tất trong báo cáo theo nhóm lượt mở của ngày được chọn.
- `backend-mapping.js`: bản đồ dịch vụ bàn giao và command sinh hiệu với UUID/context, metadata version, mã trường/đơn vị. Chỉ kiểm tra command trung gian; không gọi API lâm sàng và không chứng minh UUID tồn tại tại server.

Kiểm tra đã chạy trên dữ liệu giả: `node frontend/verify.mjs`, `frontend/browser-check.cjs`, `frontend/design-check.cjs`; kiểm tra mọi trang được công bố cho 8 role trên 1440px/390px, sai quyền, kiêm nhiệm, final/closed readonly, thu/hoàn, file, rollback khi lưu lỗi, scroll/reduced motion/focus, mẫu in và snapshot đơn. B5/B9 và nghiệm thu chuyên môn vẫn thực hiện sau khi có hợp đồng/metadata thật.
