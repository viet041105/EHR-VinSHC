# FHIR R4 mapping và giới hạn B7

Runtime được kiểm tra trên OpenMRS Core 2.8.8, FHIR2 4.2.0, FHIR R4 `4.0.1`. Endpoint capability là `GET /openmrs/ws/fhir2/R4/metadata`. Bằng chứng máy đọc nằm ở `tests/integration/test_b7_fhir.py` và `.runtime/reports/b7-fhir.json`.

FHIR hiện là projection đọc của dữ liệu gốc OpenMRS. Các thao tác ghi nghiệp vụ tiếp tục qua REST/Core hoặc adapter VinSHC đã kiểm tra; CapabilityStatement không tự chứng minh create/update đúng validation, quyền hoặc workflow.

## Bảng mapping runtime

| Resource | Nguồn OpenMRS và ID FHIR | Trường/link đã xác minh | Mã, đơn vị, thời gian, trạng thái | Người/cơ sở | Runtime hỗ trợ và giới hạn |
| --- | --- | --- | --- | --- | --- |
| Patient | `Patient`; `Patient.uuid` → `id` | name, gender, birthDate, deceased, identifier | `identifier.system=urn:uuid:<identifierTypeUuid>`; identifier giữ giá trị và loại | Identifier extension trỏ `Location/<uuid>` nơi cấp | read/search cùng UUID đạt. Contacts, address snapshot và field-state extension draft chưa được FHIR2 xuất đầy đủ. Không dùng FHIR write cho B2. |
| Encounter | Cả `Visit` và `Encounter` được FHIR2 chiếu thành Encounter cùng UUID native | `meta.tag=visit` phân biệt Visit; `meta.tag=encounter` phân biệt Encounter; encounter `partOf` Visit; subject/type/period | start giữ cùng instant ISO 8601; encounter đang mở trả `status=unknown`, không được suy thành finished | participant → `Practitioner/<Provider.uuid>`; location → `Location/<uuid>` | read/search đạt trên hai lượt khám. Không đồng nhất lifecycle Visit với encounter lâm sàng dù cùng resource type. |
| Observation | `Obs`; `Obs.uuid` → `id` | subject, encounter, effectiveDateTime, value[x], group `hasMember` | code hiện chủ yếu là concept UUID; numeric unit giữ unit native | actor không được biểu diễn đầy đủ; location phụ thuộc encounter | read/search đạt cho sinh hiệu và phiếu khám. Group huyết áp chưa thành BP panel/components chuẩn. Missing state giữ ở native status Obs; draft extension/dataAbsentReason chưa round-trip đầy đủ. Obs void trả 410. |
| Condition | Encounter Diagnosis; `Diagnosis.uuid` → `id` | subject, encounter, category encounter-diagnosis, rank extension, recordedDate | certainty → verificationStatus; active diagnosis có clinicalStatus `unknown`. Runtime xuất concept UUID, **chưa xuất ICD-10 system/code/version** | recorder là Practitioner tạo native record, hiện thường là admin trong fixture | read/search cùng diagnosis UUID đạt. Replacement tạo UUID mới; diagnosis cũ không còn trong ordinary query. Không tự hợp nhất thành bệnh sử dọc. |
| AllergyIntolerance | Core Allergy; `Allergy.uuid` → `id` | patient, allergen, reaction, note, category | active/confirmed đã xác minh; code/reaction vẫn là local concept UUID/text | recorder được FHIR2 chiếu thành Practitioner; allergy là patient-level, không có encounter link | read/search đạt. Screening `not_asked/unknown/no_known_allergy` là Obs riêng, không phải AllergyIntolerance giả. Lifecycle mở rộng/provenance chưa chiếu đầy đủ. |
| MedicationRequest | `DrugOrder`; `Order.uuid` → `id` | medicationReference, subject, encounter, requester, dosage, quantity | active/discontinued đọc lại; duration `d`; dose/route/frequency/quantity còn dùng UUID/text local, chưa đủ system/version/UCUM | requester → `Practitioner/<Provider.uuid>` | Capability chỉ read/search/patch, không create/update. Kê/ngừng đơn qua adapter VinSHC; FHIR dùng đọc lại. |
| ServiceRequest | Test order/native Order dự kiến; `Order.uuid` → `id` | Chưa có fixture service order trong B2–B5 | Chưa nghiệm thu code, specimen, thời gian và status | Chưa nghiệm thu requester/performer/facility | Capability chỉ read/search. Search B7 trả Bundle rỗng đúng dữ liệu nguồn. Round-trip bị chặn đến B8 chỉ định CLS; không được coi là đã hỗ trợ nghiệp vụ. |
| Location | `Location`; `Location.uuid` → `id` | status, name, description, location tags | active/retired → active/inactive | UUID facility ổn định `feae71be-957c-4f94-b100-d84bc6915574` | read/search đạt. FHIR Location hiện **không xuất identifier `VSHC-DEV`**, nên liên cơ sở chỉ được dựa UUID trong instance hiện tại. |
| Practitioner | `Provider` + linked Person; `Provider.uuid` → `id` | provider identifier, active, Person name/gender | identifier system hiện là OpenMRS provider URI, chưa phải namespace nhân sự VinSHC được duyệt | Encounter/MedicationRequest cùng tham chiếu Provider UUID | read/search đạt với provider synthetic. Person UUID không phải Practitioner ID. CCHN, qualification, specialty, period và facility role chưa được chiếu/duyệt. |

`PractitionerRole` có draft contract metadata nhưng không nằm trong chín resource nghiệm thu B7 và chưa có projection adapter runtime.

## Nhiều lượt khám, thời gian và lịch sử

- Fixture có cùng patient với hai Visit và hai consultation Encounter. UUID không trộn; mỗi encounter `partOf` đúng visit tương ứng.
- REST fixture ghi ISO 8601 có offset. FHIR có thể chuẩn hóa về UTC (`+00:00`); test so sánh instant, không so chuỗi. UI hiển thị nghiệp vụ theo `Asia/Ho_Chi_Minh` (`UTC+07:00`). Không tự thêm `00:00` cho thời gian nguồn thiếu giờ.
- Sửa consultation/diagnosis tạo revision hoặc UUID mới theo adapter. FHIR2 ordinary read không cung cấp toàn bộ revision/provenance.
- Obs đã void trả HTTP 410 `OperationOutcome`; cả original/replacement bị void trong ca correction B3 không còn đọc như resource active. Lịch sử native và audit server vẫn là nguồn kiểm toán.
- Dữ liệu thiếu không được đổi thành `0`, `false` hay allergy âm tính. Các sidecar missing-state chưa phải FHIR profile đã publish.

## Các gap B7 được test có chủ ý

| Mã | Khoảng trống |
| --- | --- |
| `B7-LOCATION-IDENTIFIER` | Location chưa xuất facility identifier `VSHC-DEV`. |
| `B7-BP-PROFILE` | Huyết áp là group/hasMember, chưa phải Observation BP component profile. |
| `B7-VOID-HISTORY` | Obs void trả 410; chưa có FHIR Provenance/version-history projection. |
| `B7-CONDITION-ICD-CODING` | Condition xuất concept UUID thay vì ICD-10 system/code/version đã duyệt. |
| `B7-TERMINOLOGY-PROVENANCE` | Allergy/Medication units/coding còn local; Provenance chưa xuất. |
| `B7-SERVICE-REQUEST-FIXTURE` | Chưa có service-order fixture trước B8; chỉ kiểm tra capability và Bundle rỗng. |

Các gap này là assertion trong test: nếu upstream/adapter thay đổi, test buộc cập nhật bằng chứng và tài liệu thay vì âm thầm tuyên bố tương thích.

## Định danh, cơ sở, MPI và quyền

- Namespace patient identifier hiện ổn định theo identifier type. Mã nội bộ do cơ sở phát hành; khi thêm cơ sở cấp mã độc lập phải cấp namespace riêng hoặc bảo đảm unique toàn namespace.
- Không merge patient theo tên, điện thoại, CCCD/BHXH/BHYT. MPI/record locator, consent chia sẻ và policy xem hồ sơ liên cơ sở thuộc M7.
- B5 chặn app role truy cập trực tiếp Core REST/FHIR bằng broad privilege; scoped application workflow phải đi qua adapter. B7 dùng admin chỉ trên Docker test cô lập để khảo sát projection.
- Catalogue test có `productionEnabled=false`. ICD/LOINC/UCUM, CCHN và facility identity phải được duyệt trước khi bật trao đổi production.

## Quan hệ OpenMRS và openEHR

Theo [ADR-0001](../decisions/0001-openmrs-openehr.md), OpenMRS là source of truth. Các cột openEHR trong [DATA_DICTIONARY.md](../DATA_DICTIONARY.md) là mapping thiết kế, không chứng minh đã có EHRbase. Nếu thêm EHRbase ở giai đoạn sau, dùng adapter một chiều, idempotent và có provenance từ OpenMRS; không dual-write và không coi FHIR endpoint hiện tại là bằng chứng tuân thủ openEHR.

Mapping chi tiết máy đọc, extension draft, namespace và deferred decision nằm trong `metadata/vinshc/contracts/fhir.json`.
