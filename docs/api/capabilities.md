# Ma trận khả năng backend

Tài liệu này là đầu ra B0: đối chiếu nhu cầu phòng khám với module/API đang có, metadata cần thiết, mức đã kiểm tra và khoảng trống. Đây không phải tuyên bố nghiệm thu nghiệp vụ. Một module `started` chỉ chứng minh module đã khởi động; một endpoint trả dữ liệu chỉ chứng minh API ở mức được nêu; chỉ cột **Mức đã thử** mới mô tả luồng đã chạy bằng dữ liệu giả.

## Quy ước trạng thái

| Trạng thái | Ý nghĩa |
| --- | --- |
| `Baseline` | Module có trong `config/baseline.json`, đúng phiên bản và `started=true` khi `scripts/smoke.py` chạy. |
| `API đã thử` | Request cụ thể đã chạy trên instance PostgreSQL và cấu trúc/kết quả tối thiểu đã được kiểm tra. |
| `Fixture đã thử` | Có tạo rồi đọc lại dữ liệu giả và kiểm tra quan hệ hoặc giá trị. |
| `Chưa thử nghiệp vụ` | Chưa có bằng chứng cho state transition, quyền, validation hoặc luồng end-to-end. |
| `Chờ metadata` | Có thể khảo sát kỹ thuật, nhưng chưa thể nghiệm thu bằng UUID/danh mục chính thức. |

Báo cáo smoke hiện hành ghi phiên bản Reference Application/Core, trạng thái `started` và phiên bản của 30 module (29 upstream cộng `vinshc`), cùng toàn bộ resource/interaction từ FHIR `CapabilityStatement`. Báo cáo `.runtime/reports/database.json` ghi phiên bản PostgreSQL, UTF8, extension và tình trạng schema. Hai báo cáo không chứa credential và được tạo lại bằng các lệnh ở cuối tài liệu. Báo cáo `.runtime/reports/smoke.json` cũ có thể chỉ ghi 29 module upstream nếu được tạo trước khi VinSHC được đưa vào baseline P0.

## MVP-1 — lõi lâm sàng

| Nghiệp vụ | Module/API hiện có | Metadata cần | Mức đã thử | Khoảng trống / bước tiếp theo |
| --- | --- | --- | --- | --- |
| Đăng nhập và chọn cơ sở | Core session REST; Initializer 2.12.0; VinSHC workspace authorization | Location/cơ sở, 8 role, 69 privilege và assignment user–role–facility | **B5 đã thử:** đăng nhập, mật khẩu sai, active workspace role, nhiều facility, thu hồi assignment và ma trận 896 ô `8 × 16 × 7` theo default-deny | Production cần tài khoản cá nhân, quy trình provision/thu hồi và gateway audit cho system-admin break-glass. |
| Tìm/tạo bệnh nhân và mã hồ sơ | Core patient REST; FHIR2 Patient; idgen 5.0.4; module VinSHC; **B11 staff adapter** `vinshc/patients` | 4 identifier type, 8 person attribute type, contacts/fieldStates, DATA-08 và 4 identifier system | **B2 đã thử:** CRUD/search/phân trang/trùng tên; contact + phone normalize + state + audit/void; address snapshot; 3.356 entry Address Hierarchy; FHIR trả đúng `identifier.system`; custom privilege trả 403. **B11 đã thử với tài khoản tiếp đón/thu ngân/quản lý:** đăng ký qua adapter (mã idgen, idempotency, 409 trùng CCCD và hồ sơ tương tự trong cơ sở), tìm không dấu/mã/điện thoại, projection theo vai trò, sửa có lý do, cơ sở khác 403 | FHIR2 upstream vẫn trả 500 thay vì 403 khi thiếu `Get Patients`; contact/field-state/address history chưa được chiếu đầy đủ vào FHIR Patient; catalogue cần xác nhận currentness trước pilot. |
| Mở/kết thúc lượt khám | Core visit REST; encounter REST; FHIR2 Encounter; **B11** `vinshc/visits` | Visit type, encounter type, location, provider role | **B3/B5/B7 đã thử:** mở/kết thúc và nhiều lượt theo patient; encounter điều dưỡng đúng provider/time; liên kết chéo bị từ chối; quyền theo workspace/facility; FHIR đọc Visit và Encounter cùng UUID nguồn. **B11:** một lượt mở mỗi bệnh nhân, check-in lịch hẹn, encounter theo vai trò với provider của tài khoản, kết thúc có lý do (Obs `group.administrative`), chặn hoàn tất khi còn chỉ định/phiếu phí, hủy chỉ tiếp đón | Chưa thử tải đồng thời ở staging. Liên kết provider–tài khoản do quản trị cấu hình (chưa có API ứng dụng). FHIR2 chiếu cả Visit và Encounter thành `Encounter` nhưng phân biệt bằng `meta.tag`/`partOf`; lifecycle OpenMRS vẫn riêng. Provider production còn chờ danh tính nhân sự thật. |
| Ghi sinh hiệu | VinSHC validated write → Core obs/encounter REST; FHIR2 Observation read; **B11** đọc/đính chính/hủy | `group.vitals`, 8 numeric/status concept, UCUM unit và rule | **B3/B5/B7 đã thử:** hai nhóm đo, đủ 8 giá trị/status, thiếu SpO2, sửa/void, validation số/BP và privilege 403; REST–FHIR cùng UUID/unit/time. **B11:** điều dưỡng đọc lịch sử, đính chính (void + nhóm mới cùng lý do) và hủy; lượt đóng chặn ghi/đính chính; clinical-summary kèm sinh hiệu của lượt | Core `/obs` trực tiếp không thực thi rule và không phải write API ứng dụng. Còn chờ LOINC được thẩm định và BP panel/components chuẩn FHIR; provider production dùng dữ liệu thật. |
| Khám và biểu mẫu | VinSHC consultation adapter → Core encounter/obs; FHIR2 Observation read | Concept bệnh sử/khám, group, encounter type/role | **B4/B5/B7 đã thử:** finalization, text/date/coded Obs, trạng thái thiếu, correction/void append-only, hai lượt không ghi đè, quyền bác sĩ và FHIR parent/member | Chọn FE VinSHC riêng thay vì O3 Form schema; `forms.json` là contract bàn giao. Form UI/E2E vẫn thuộc FE. |
| Dị ứng | VinSHC allergy adapter; Core Allergy; FHIR2 AllergyIntolerance | Trạng thái sàng lọc, tác nhân coded, phản ứng và mức độ | **B4/B5/B7 đã thử:** native Allergy round-trip, `not_asked`/`unknown`/`none_reported`/`present`, phản ứng/mức độ, quyền và xung đột dị ứng–thuốc | Catalogue và chính sách cho phép tác nhân không mã hóa phải được cơ sở phê duyệt trước production. |
| Chẩn đoán ICD-10 | VinSHC diagnosis adapter; emrapi/Core; FHIR2 Condition | Catalogue ICD-10 có source/version, `SAME-AS` mapping và allowlist selectable | **B4/B5/B7 đã thử:** chẩn đoán chính/kèm theo, certainty, thay thế có lý do, mã hợp lệ/bị khóa, quyền và FHIR Condition | Catalogue ICD-10 production đầy đủ và quyết định problem-list còn là gate nghiệp vụ. |
| Kê đơn | VinSHC drug-order adapter; Core DrugOrder; FHIR2 MedicationRequest | Drug, liều/đơn vị, đường dùng, tần suất, thời gian, người kê | **B4/B5/B7/B8 đã thử:** tạo/đọc/ngừng đơn, chống trùng, kiểm tra dị ứng, quyền, REST–FHIR cùng UUID và DTO đơn thuốc | Danh mục thuốc, người kê và thông tin pháp lý production cần phê duyệt; dispensing/MedicationDispense vẫn thuộc khoảng trống BE-08. |
| Xem lại lịch sử | VinSHC clinical summary; Core REST; FHIR2 | Cùng metadata của các dòng trên | **B4–B9 đã thử:** nhiều lượt, lọc lịch sử, sửa/void append-only, missing-state, quyền đọc; dữ liệu giữ đúng sau restart và backup–restore | UI lịch sử và UAT trình duyệt còn thuộc FE; tải và retention production cần kiểm chứng staging. |

## MVP-2 — vận hành phòng khám

| Nghiệp vụ | Module/API hiện có | Metadata/cấu hình cần | Mức đã thử | Khoảng trống / bước tiếp theo |
| --- | --- | --- | --- | --- |
| Lịch hẹn | appointments 2.1.0 + VinSHC operations adapter | Appointment service, service type, provider/location, slot, timezone | **B8 runtime:** tạo/tái phát idempotent, xác nhận/đến/hoàn thành và khóa slot trùng | Dùng bảng/transition adapter vì API schema upstream chưa được chọn làm contract; production cần catalogue thật và tải cạnh tranh. |
| Hàng đợi | queue 3.0.0 + VinSHC operations adapter | Service, queue, location, provider, priority và state model | **B8 runtime:** cấp số, 6 điểm phục vụ, chuyển bước và bỏ về có lý do | Đã thử luồng tuần tự synthetic; tải cạnh tranh/đa cơ sở thuộc nghiệm thu staging. |
| Bảng giá và thu tiền | billing 2.3.0 + VinSHC operations adapter | Danh mục dịch vụ, bảng giá theo cơ sở, VND, phương thức thu | **B8 runtime:** snapshot giá, thu một phần/pending/settled, hoàn/hủy, trả trước/sau, actor trace | Chưa kết nối payment gateway, hóa đơn điện tử hay BHYT; catalogue production vẫn khóa. |
| Kho và cấp thuốc | stockmanagement 3.0.0; Core drug/order | Danh mục thuốc/vật tư, kho, lô/hạn dùng nếu đưa vào pilot | `Baseline`; 118 khóa ngoại Stock Management được kiểm tra trên PostgreSQL. **B11 runtime (cấp thuốc tối thiểu):** danh sách đơn chờ cấp, ghi cấp idempotent theo số lượng còn lại, số lô/hạn dùng, chặn đơn ngừng/hết hiệu lực, lượt hủy, lô hết hạn | Nhập/xuất/tồn kho Stock Management và quyền kho vẫn chưa thử; số lô/hạn chỉ ghi theo lần cấp. |
| Tệp đính kèm | attachments 4.0.0 + private VinSHC file adapter | Loại tài liệu, MIME/kích thước, nguồn và liên kết visit/order | **B8/B9 runtime:** PDF multipart upload/download đúng byte/SHA-256, liên kết order/result và RBAC; PDF/JPEG/PNG allowlist, 20 MiB; nội dung được đối chiếu sau restart và restore project mới | Production upload tắt đến khi có malware scanner, private object storage và retention được duyệt. |
| Tài liệu bệnh nhân | patientdocuments 1.1.0 | Loại tài liệu, encounter/visit/source, retention | `Baseline`; module đúng phiên bản và started | **Chưa thử nghiệp vụ:** tạo, tìm, tải, phân loại, quyền và provenance. |
| Báo cáo ngày | reporting 2.1.0; reportingrest 2.0.0; VinSHC aggregate | Định nghĩa báo cáo, ngày theo Asia/Ho_Chi_Minh, scope cơ sở | **B8/B9 runtime:** lượt mở và gross/refund/net đối chiếu dữ liệu giả; manager đọc aggregate nhưng không có quyền đọc bệnh án; kết quả giữ đúng sau restart/restore | Chỉ aggregate; **B11** thêm báo cáo nhiều ngày (≤ 31) cho quản lý. Kiểm thử tải thuộc staging. |
| Mẫu in | VinSHC document DTO trên Core/billing/order | Thông tin cơ sở/người hành nghề, template và trường bắt buộc | **B8 runtime:** DTO và số chứng từ ổn định cho 5 loại giấy | FE chưa render; chữ ký điện tử/pháp lý và thông tin production cần duyệt riêng. |

## Thành phần hỗ trợ và giới hạn baseline

| Thành phần | Quyết định B0 | Bằng chứng hiện có | Khi nào cần code |
| --- | --- | --- | --- |
| OpenMRS Core, REST, FHIR2 | Giữ upstream, khóa phiên bản | Core/REST/FHIR version và API tối thiểu được smoke kiểm tra | Chỉ sửa/fork khi có ca tái hiện, test thất bại và extension/config không giải quyết được. |
| Initializer | Dùng để nạp metadata version hóa với UUID ổn định | Các gói/overlay metadata synthetic đã được kiểm tra nạp mới, nạp lại, nâng version và không tạo trùng trên database sạch | Tiếp tục dùng metadata cho catalogue/config; chỉ viết Java khi cần validation, transaction hoặc API mà Initializer không đáp ứng. |
| Module nghiệp vụ đã có | Khảo sát API và cấu hình trước khi viết mới | Tất cả module trong baseline phải `started=true` | Viết module VinSHC khi luồng cụ thể không thể đáp ứng bằng API/metadata/configuration và có test chứng minh khoảng trống. |
| PostgreSQL | Giữ schema do OpenMRS/module sở hữu; không tạo hồ sơ bằng SQL | Version, UTF8, extension, bảng và migration quan trọng được kiểm tra | Chỉ thêm migration cho phần mở rộng do dự án sở hữu; không thiết kế lại bảng Core. |
| Adapter bên ngoài | Sau pilot: BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS | Chưa triển khai | Đặt trong `integrations/`, bật/tắt độc lập sau khi có contract được duyệt. |

## Phạm vi đã chốt

Phạm vi sau được xác nhận ngày 10/10/2026, dựa trên `PROJECT_PLAN.md` và `CLINIC_WORKFLOW.md`:

- MVP-1: đăng nhập → tìm/tạo bệnh nhân → mở visit → ghi sinh hiệu → khám/chẩn đoán/kê đơn → kết thúc visit → xem lịch sử.
- MVP-2 trước pilot: lịch hẹn, hàng đợi, thu tiền, chỉ định CLS, mẫu in, báo cáo ngày, tái khám.
- Sau pilot: kho/lô/hạn dùng đầy đủ, BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS và nhắc lịch SMS/Zalo.

Các biến thể trả trước/trả sau, có/không điều dưỡng và có/không quầy thuốc phải được hỗ trợ bằng cấu hình. Việc chốt phạm vi không đồng nghĩa các luồng đã được nghiệm thu; mức kiểm chứng thực tế vẫn theo các bảng capability ở trên.

## Tạo lại bằng chứng B0

Chạy trên instance local/test; không dùng database chứa dữ liệu thật:

```powershell
python scripts/check_config.py
python -m unittest discover -s tests -v
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py --report .runtime/reports/smoke.json
```

Để chứng minh fixture còn sau restart, dùng quy trình `--create-fixture` / `--require-fixture` trong `docs/DEVELOPMENT.md`. Khi đưa kết quả vào issue/PR, ghi commit, ngày chạy, môi trường, hai file báo cáo, giới hạn chưa thử và xác nhận rằng không có credential/dữ liệu bệnh nhân thật.
