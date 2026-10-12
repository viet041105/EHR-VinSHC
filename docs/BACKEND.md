# Lộ trình hoàn thiện backend VinSHC cho một phòng khám

Tài liệu này là backlog thực thi cho người hoặc agent phụ trách backend. Đích của giai đoạn này là một **phòng khám tư nhân** vận hành trọn quy trình ngoại trú trên cùng một hệ thống:

- **MVP-1, lõi lâm sàng:** đăng ký bệnh nhân, tiếp nhận, ghi sinh hiệu, khám, chẩn đoán, kê đơn, kết thúc lượt khám và xem lại lịch sử.
- **MVP-2, vận hành phòng khám:** lịch hẹn, hàng đợi, bảng giá và thu tiền, chỉ định cận lâm sàng, mẫu in, báo cáo và backup–restore. MVP-2 là điều kiện bắt buộc trước pilot.

Quy trình và vai trò nằm trong [CLINIC_WORKFLOW.md](CLINIC_WORKFLOW.md). Việc chia sẻ hồ sơ giữa các phòng khám là giai đoạn sau. Giai đoạn này chỉ chuẩn bị định danh, nguồn gốc dữ liệu và khả năng xuất dữ liệu cần thiết, theo các tầng trong [ARCHITECTURE.md](ARCHITECTURE.md).

Phạm vi lâm sàng, danh mục thuốc, quy tắc chuyên môn và ma trận quyền cuối cùng phải được nhóm nghiệp vụ/metadata xác nhận. Không coi một màn hình hoặc module đã cài là bằng chứng nghiệp vụ đã hoàn thành; mỗi luồng phải được kiểm tra trên backend đang chạy với dữ liệu giả.

## 1. Điểm xuất phát và nguồn sự thật

| Thành phần | Hiện trạng trong repo | Việc còn thiếu |
| --- | --- | --- |
| Runtime | OpenMRS Reference Application 3.7.1, Core 2.8.8, 29 module; **PostgreSQL 16.15** ([ADR-0002](decisions/0002-postgresql.md)). Image và danh sách module được khóa trong [`config/baseline.json`](../config/baseline.json) | Kiểm chứng từng nghiệp vụ trên đúng phiên bản này |
| Docker | [`compose.yaml`](../compose.yaml) có `db`, `backend`, `frontend`, `gateway`. [`infra/backend/Dockerfile`](../infra/backend/Dockerfile) mở rộng image backend đã biên dịch, bỏ demo và áp dụng các bản sửa tương thích PostgreSQL trong [`infra/backend/postgresql/`](../infra/backend/postgresql/README.md). Extension DB được tạo bởi [`infra/postgres/initdb/`](../infra/postgres/initdb/) | Tích hợp module tùy biến nếu có nhu cầu thực sự; phương án triển khai ngoài máy local |
| Cấu hình OpenMRS | [`infra/backend/configuration/`](../infra/backend/configuration/) hiện chỉ thêm location giả VinSHC | Nhận và nạp gói metadata Việt Nam và cấu hình cơ sở |
| Kiểm thử | [`scripts/check_database.py`](../scripts/check_database.py) kiểm tra phiên bản PostgreSQL, UTF8, extension và schema. [`scripts/smoke.py`](../scripts/smoke.py) kiểm tra readiness, login, REST/FHIR, location, bệnh nhân giả, visit, encounter, observation. [`tests/test_tooling.py`](../tests/test_tooling.py) kiểm tra công cụ. [CI](../.github/workflows/ci.yml) chạy trên instance tạm | Kiểm thử luồng khám, quyền, dữ liệu lâm sàng, vận hành MVP-2 |
| Tài liệu | [`PROJECT_PLAN.md`](../PROJECT_PLAN.md), [`DEVELOPMENT.md`](DEVELOPMENT.md), [`CI.md`](CI.md), [`VALIDATION.md`](VALIDATION.md), [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md), [`VIETNAM_COMPLIANCE.md`](VIETNAM_COMPLIANCE.md) | Hợp đồng API, ma trận khả năng, runbook vận hành |

Repo không chứa mã nguồn upstream. Đây là bản phân phối OpenMRS dùng image upstream đã khóa, cộng một lớp build nhỏ. Các bản sửa PostgreSQL hiện có (dialect Hibernate, migration Appointments, sequence của Core, cột BYTEA của Reporting/Open Concept Lab, precondition của Stock Management) được build và kiểm tra hash trong Dockerfile. Mọi thay đổi Java mới phải có bước build artifact và đưa artifact vào Docker image/CI được kiểm chứng riêng.

### Quy tắc làm việc cho agent nhận nhiệm vụ

1. Đọc tài liệu này, `PROJECT_PLAN.md` mục BE/INT/DATA, `DEVELOPMENT.md`, `CI.md`, `compose.yaml`, `config/baseline.json`, [`infra/backend/postgresql/README.md`](../infra/backend/postgresql/README.md) và các script/test liên quan. Kiểm tra `git status` trước khi sửa; giữ nguyên thay đổi của người khác.
2. Chọn **một hạng mục có đầu ra kiểm chứng được** trong các mốc dưới đây. Ghi trạng thái `chưa làm / đang làm / đạt / bị chặn`, bằng chứng và phần phụ thuộc trong issue hoặc PR. Không đánh dấu đạt chỉ vì endpoint trả HTTP 200.
3. Mọi test ghi dữ liệu dùng **bệnh nhân giả** và instance local/CI riêng. Test không được xóa hoặc reset volume đang dùng. Khi cần kiểm tra trên database sạch, tạo Compose project tách biệt và xác nhận đúng project/volume trước khi dọn.
4. Không ghi mật khẩu, token, `.env`, database dump hoặc dữ liệu bệnh nhân thật vào Git, log báo cáo hay artifact CI. Không cho frontend kết nối trực tiếp PostgreSQL và không viết SQL thay cho OpenMRS API/service để tạo hồ sơ.
5. Khi đổi image/module, cập nhật đồng thời `compose.yaml`, Dockerfile, `config/baseline.json`, tài liệu phiên bản và test tương ứng. Kiểm tra lại các bản sửa trong `infra/backend/postgresql/` còn cần và còn đúng với phiên bản mới. Khi đổi UUID, API hoặc cấu trúc dữ liệu, phối hợp ngay với FE, metadata và người làm tích hợp.
6. Mỗi PR nêu: mục tiêu, file đổi, cách chạy, kết quả thực tế, phụ thuộc metadata, rủi ro và việc chưa đạt. Chỉ sửa OpenMRS Core/module upstream khi đã có ca nghiệp vụ tái hiện được và quyết định kỹ thuật được ghi lại.
7. Migration hoặc truy vấn mới phải chạy trên PostgreSQL. Không viết SQL theo cú pháp riêng của MySQL/MariaDB.

## 2. Ranh giới công việc và bàn giao giữa các nhóm

Backend chịu trách nhiệm cách dữ liệu đi qua OpenMRS, quyền, API, tích hợp module, build/runtime, bảo mật kỹ thuật, kiểm thử backend và khả năng phục hồi. OpenMRS sở hữu schema trên PostgreSQL; không có đầu việc tự thiết kế lại bảng `patient`, `visit`, `encounter`, `obs`.

| Đầu vào từ nhóm khác | Backend cần làm ngay khi nhận | Có thể làm trước khi nhận? |
| --- | --- | --- |
| Quy trình, 8 role và ma trận quyền đã chốt ([CLINIC_WORKFLOW.md](CLINIC_WORKFLOW.md)) | Biến thành hợp đồng API và test quyền | Có: khảo sát API và lập bản nháp |
| Patient identifier type (mã nội bộ, CCCD, mã BHXH/BHYT), location, visit type, encounter type, địa giới hành chính và UUID ổn định | Kiểm tra Initializer nạp đúng; dùng trong test tạo patient/visit/encounter | Có: viết test/harness và xác định request mẫu bằng metadata synthetic **thực sự tồn tại** trong instance test |
| Concept sinh hiệu và quy tắc đơn vị/giá trị ([DATA_DICTIONARY.md](DATA_DICTIONARY.md)) | Kiểm tra obs gắn đúng patient, visit, encounter; REST/FHIR mapping; validation | Có: khảo sát khả năng `obs`, chưa thể nghiệm thu dữ liệu sinh hiệu cuối cùng |
| Concept khám, chẩn đoán ICD-10, dị ứng, danh mục thuốc/form | Kiểm tra ghi, đọc lại, quyền, trạng thái, lịch sử và FHIR tương ứng | Có: khảo sát endpoint/capability, ghi rõ giới hạn |
| Danh mục dịch vụ, bảng giá mẫu, mẫu giấy tờ (DATA-09, FE-08) | Kiểm tra billing, chỉ định CLS và dữ liệu cấp cho mẫu in | Có: khảo sát module billing/queue/appointments trên baseline |
| Giao diện/luồng FE | Kiểm tra request thực tế, xử lý lỗi, quyền và liên kết dữ liệu | Có: cung cấp API contract và fixture giả cho FE |

Metadata cần hiểu mô hình `Patient → Visit → Encounter → Observation/Diagnosis/Order`, kiểu concept, đơn vị, UUID và cách nạp qua Initializer; không cần thao tác trực tiếp trên bảng PostgreSQL. Backend không hardcode UUID lâm sàng rải rác trong code. UUID chuẩn thuộc file metadata được version hóa; mọi mapping cho test hoặc module phải đọc từ một nơi được kiểm tra khớp với metadata đã nạp. UUID placeholder chỉ dùng trong tài liệu, không dùng trong integration test.

## 3. Trình tự thực hiện

Các mốc sau theo thứ tự phụ thuộc. Công việc trong cùng mốc có thể làm song song khi hợp đồng đã thống nhất. Mỗi mốc kết thúc bằng một PR hoặc một nhóm PR nhỏ; cập nhật tài liệu này khi quyết định kỹ thuật thay đổi.

### Đối chiếu với PROJECT_PLAN

Từ 09/10/2026, BE-03, BE-07, BE-09 và BE-12 (appointments, service queues, tách từ BE-08) do người 4 phụ trách; BE-08 (billing, dispensing, stock management) và BE-11 (HTTPS, secrets, tách tài khoản DB, kế hoạch nâng cấp) ở lại người 1. Vùng file của từng người nằm trong [PROJECT_PLAN.md mục 8.1](../PROJECT_PLAN.md#81-vùng-file-phụ-trách).

| Mốc backend | Đầu việc trong PROJECT_PLAN | Mốc dự án |
| --- | --- | --- |
| B0 — Phạm vi và baseline | BE-01, BE-02, BE-10 (đã xong) | M0–M1 |
| B1 — Hợp đồng API và kiểm thử tích hợp | BE-03, INT-02, INT-03 | M1–M3 |
| B2 — Bệnh nhân và định danh | BE-03, DATA-04, DATA-08 | M3 |
| B3 — Visit, encounter, sinh hiệu | BE-03, BE-04, DATA-02, DATA-06 | M3 |
| B4 — Khám, dị ứng, chẩn đoán, đơn thuốc | BE-03, BE-06, DATA-07 | M3 |
| B5 — Xác thực, phân quyền, audit | BE-05, DATA-04, INT-06, INT-09 | M3 |
| B6 — Database, phục hồi, vận hành | BE-07 (backup–restore, runbook), BE-11 (triển khai ngoài local) | M4 |
| B7 — FHIR và mở rộng liên phòng khám | INT-04, INT-05, DATA-07, DATA-10 | M3 (mapping), M7 (liên thông) |
| B8 — Vận hành phòng khám (MVP-2) | BE-12 (lịch hẹn, hàng đợi), BE-08 (thu tiền, thuốc), BE-09, DATA-09, INT-10, phối hợp FE-08/FE-09 | M4 |
| B9 — Tích hợp, CI và nghiệm thu | INT-06, INT-07, INT-08 | M3–M5 |

### Mốc B0 — Khóa phạm vi và chứng minh baseline

**Đầu vào:** repo hiện tại, `PROJECT_PLAN.md` và `CLINIC_WORKFLOW.md`. **Đầu ra:** bảng phạm vi MVP, danh sách module/version đang chạy, báo cáo baseline lặp lại được.

- [x] Chuyển baseline sang PostgreSQL 16.15, giữ phiên bản Core và 29 module; kiểm chứng database mới, restart và dump/restore local (BE-10). Bằng chứng trong [VALIDATION.md](VALIDATION.md); bản sửa tương thích trong [`infra/backend/postgresql/README.md`](../infra/backend/postgresql/README.md).
- [x] Chốt ngày 10/10/2026 luồng MVP-1: đăng nhập → tìm/tạo bệnh nhân → mở visit → ghi sinh hiệu → bác sĩ khám/chẩn đoán/kê đơn → kết thúc visit → xem lại lịch sử. Luồng MVP-2: lịch hẹn, hàng đợi, thu tiền, chỉ định CLS, mẫu in, báo cáo. Các module mở rộng (kho thuốc đầy đủ, BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS) là `sau pilot`. Phạm vi chi tiết được ghi trong [`docs/api/capabilities.md`](api/capabilities.md#phạm-vi-đã-chốt).
- [x] Chạy `check_config.py`, unit test, `docker compose up -d --wait`, `check_database.py`, `smoke.py`; lưu phiên bản và kết quả ở issue/PR, không ghi credential. Kiểm tra `/ws/rest/v1/module` và `/ws/fhir2/R4/metadata` trên chính instance đó; ghi module **started**, resource và interaction được công bố. `smoke.py` ghi inventory này vào báo cáo JSON; lần kiểm tra local ngày 10/10/2026 đạt 29/29 module started và ghi 24 FHIR resource được công bố.
- [x] Tạo ma trận `nghiệp vụ → module/API hiện có → metadata cần → mức đã thử → khoảng trống` trong [`docs/api/capabilities.md`](api/capabilities.md). Phân biệt `có module`, `API trả dữ liệu`, `luồng nghiệp vụ đã qua test`. Bao gồm cả các module MVP-2: appointments, queue, billing, stock management, attachments, patientdocuments.
- [x] Ghi trong [`docs/api/capabilities.md`](api/capabilities.md) quyết định nền tảng nào có thể dùng nguyên, phần nào cần cấu hình, phần nào cần code; không clone/sửa module chỉ vì source có sẵn.

**Đạt khi:** một thành viên khác dựng lại stack theo `DEVELOPMENT.md`, `check_database.py` và smoke pass; ma trận ghi rõ các giới hạn chưa thử. Baseline không đồng nghĩa đã nghiệm thu nghiệp vụ phòng khám.

### Mốc B1 — Hợp đồng API và bộ kiểm thử tích hợp

**Đầu vào:** B0. **Đầu ra:** tài liệu API có request/response thật và test client dùng chung.

- [x] Tạo [`docs/api/`](api/README.md) cho session/auth, patient/identifier, visit, encounter/obs, diagnosis/allergy, medication/order, error handling và FHIR mapping. Với thao tác đã thử, tài liệu ghi method/path, request/response rút gọn, status/lỗi, privilege, nguồn UUID, tìm kiếm và hậu điều kiện qua API; capability chưa có fixture được ghi rõ là chưa nghiệm thu, không đoán schema.
- [x] Tách HTTP client an toàn thành [`scripts/api_client.py`](../scripts/api_client.py) để `smoke.py` và integration test dùng chung: chỉ gọi loopback/instance test, không theo redirect/proxy ra ngoài, phân biệt JSON với HTML login page, báo lỗi có method/path nhưng không in credential. Smoke vẫn chạy riêng; test B1 nằm trong [`tests/integration/`](../tests/integration/) và chạy bằng `python -m unittest discover -s tests/integration -v`.
- [x] Tạo helper fixture sinh mã duy nhất, lưu UUID để đọc lại và kiểm tra dữ liệu tồn tại trước khi tái sử dụng tại [`tests/integration/fixtures.py`](../tests/integration/fixtures.py). Nếu file fixture còn nhưng patient mất, test fail thay vì tạo lại; user hạn chế dùng cho test 403 được tạo bằng credential ngẫu nhiên chỉ trong bộ nhớ và void sau test.
- [x] Ghi hợp đồng API đầu tiên cho FE: tạo/tìm bệnh nhân, mở/kết thúc visit, đọc lịch sử trong [`docs/api/patient-identifier.md`](api/patient-identifier.md) và [`docs/api/visit.md`](api/visit.md); lỗi runtime 400/401/403/404 nằm trong [`docs/api/error-handling.md`](api/error-handling.md). Integration test ngày 10/10/2026 đạt 4/4 và đã được thêm vào CI.

**Đạt khi:** tài liệu khớp các response thực tế; test chạy lặp lại trên instance tách biệt mà không tạo bệnh nhân trùng ngoài dự kiến. Đã đạt local ngày 10/10/2026: chạy lặp lại tái sử dụng đúng patient UUID/identifier đã lưu, mỗi lần tạo một visit có UUID riêng, và report nằm tại `.runtime/reports/b1-integration.json`. CI dựng instance tách biệt và chạy cùng test; trạng thái run GitHub phải được kiểm tra riêng sau khi push.

### Mốc B2 — Bệnh nhân và định danh

**Đầu vào:** B1 và quy ước identifier từ nhóm metadata (DATA-04). **Đầu ra:** luồng patient được kiểm thử và bàn giao cho FE.

- [x] Xác định các identifier type theo [DATA_DICTIONARY.md](DATA_DICTIONARY.md#2-bệnh-nhân-và-định-danh): mã hồ sơ nội bộ của phòng khám (bắt buộc, duy nhất, hệ thống sinh), CCCD và mã BHXH/BHYT (tùy chọn, kiểm tra định dạng). Ghi nơi cấp, quy tắc bắt buộc/duy nhất và cách phát sinh mã. Nếu dùng module ID Generation, kiểm tra hành vi thật trên PostgreSQL trước khi bật trên form/API. Đã cấu hình và thử IDGen tuần tự `VSHC-########` trên PostgreSQL; hợp đồng nằm trong [patient-identifier.md](api/patient-identifier.md).
- [x] Kiểm thử tạo, đọc, cập nhật, tìm theo mã/CCCD/tên, phân trang và các trường tối thiểu. Xác nhận tạo hai bệnh nhân cùng tên vẫn là hai UUID khác nhau; trường hợp nghi trùng được phát hiện/đưa ra quy trình xử lý chứ không tự gộp. Kiểm tra tìm kiếm tên tiếng Việt có dấu. Bộ test nằm tại [`test_b2_patient.py`](../tests/integration/test_b2_patient.py).
- [x] Kiểm tra FHIR `Patient` có đúng identifier, tên, nguồn định danh; ghi các trường REST chưa được map hoặc có khác biệt. Kiểm tra request sai, mã trùng và người dùng không có quyền. Đã ghi rõ khác biệt `identifier.system` và lỗi FHIR2 trả 500 thay vì 403 khi thiếu quyền trong [patient-identifier.md](api/patient-identifier.md).
- [x] Metadata/FE đã bàn giao contract số điện thoại, `contacts[]`, 37 policy thông tin thiếu, bốn identifier system và catalogue DATA-08. Backend đã triển khai module Java, persistence, REST, Address Hierarchy và test; CCCD không được dùng làm khóa merge. Catalogue vẫn cần xác nhận currentness/chuyển đổi địa chỉ cũ trước pilot.

#### Phần còn phải hoàn thiện để đóng toàn bộ B2

- [x] **Contract người liên hệ đã chốt và triển khai:** `contacts[]` là bản ghi lặp riêng có rowKey UUID bất biến, primary/emergency/priority, catalogue quan hệ snapshot, phone raw/normalized, provenance, optional Person link và append-only update/void. Không tự tạo hoặc merge Patient/Person.
- [x] **Trạng thái thông tin thiếu đã chốt và lưu:** module đọc 37 policy `b2Missing`, kiểm tra mode/context/rowKey/allowed state, lưu provenance/audit; contact/address không cho value và state cùng tồn tại, PATCH value đóng state hiện hành.
- [x] **Extension/module Java đã có:** migration PostgreSQL, service và REST cho contact/field-state/address snapshot, ba privilege riêng, create/read/update/void, validation và integration test. Contract thật nằm tại [`patient-administration.md`](api/patient-administration.md).
- [x] **Hoàn thiện DATA-08 và Address Hierarchy:** đã nạp 34 tỉnh + 3.321 xã thành 3.356 entry có mã ổn định, kiểm tra parent/version/effective date và giữ snapshot raw/legacy qua update/void/restart. Từ module 0.3.0, snapshot hiện hành được chiếu sang `PersonAddress` có UUID bằng `row_key` nên FHIR `Patient.address` đọc được địa chỉ hiện hành; địa chỉ cũ không được chiếu; void snapshot thì void bản chiếu. Cần evict cache cấp 2 `Person.addresses` (Core 2.8.8 không tự vô hiệu hóa). Xem [patient-administration.md](api/patient-administration.md#chiếu-sang-personaddress-và-fhir-patient-module-030).
- [ ] **Xác nhận dữ liệu địa giới trước pilot (việc của metadata):** catalogue có đang là bản hiện hành không, và quy tắc đổi địa chỉ cũ sang mới. Không chặn code B2.
- [x] **Đóng quyết định lỗi quyền FHIR (11/10/2026):** giữ hành vi FHIR2 4.2.0 cho MVP (từ chối đúng nhưng trả 500 `OperationOutcome`), test B2 khóa hành vi này, không đổi 500 → 403 ở gateway. Quy tắc nhận diện cho FE nằm ở [error-handling.md](api/error-handling.md#fhir2-trả-500-khi-thiếu-quyền-quyết-định-cho-mvp). Xem lại khi nâng FHIR2.
- [x] **Nghiệm thu cuối (11/10/2026):** trên database PostgreSQL mới (volume tạo mới), Initializer nạp metadata và nạp lại sau restart không trùng (3.356 mã Address Hierarchy, 4 FHIR identifier system). B1–B4 pass 35/35 trước và sau `restart backend`, gồm patient nhiều contact và field-state, update/void, địa chỉ hiện hành/cũ, chiếu FHIR, quyền REST 403 và FHIR 500 đã chốt. Báo cáo ở `.runtime/reports/`.

**Đạt khi:** tạo và tìm lại đúng một hồ sơ bằng REST, đọc được cùng UUID/identifier qua FHIR, trường hợp trùng tên và sai quyền có test. Phần lõi đã đạt local ngày 11/10/2026 với 5/5 kiểm tra B2; báo cáo ở `.runtime/reports/b2-integration.json`. Toàn bộ B2 chỉ đóng sau khi hoàn thành checklist mở rộng phía trên.

### Mốc B3 — Visit, encounter và sinh hiệu

**Đầu vào:** B1–B2; gói metadata tối thiểu gồm visit type, encounter type, concept sinh hiệu, đơn vị và UUID ổn định. **Đầu ra:** một lượt khám có sinh hiệu đọc lại được.

- [x] Initializer đã được kiểm tra trên database mới: clean import 78/78 identity, restart không trùng 3.356 Address Hierarchy entry/4 identifier system, B1–B3 pass; overlay 0.2.1 đổi nhãn mạch được nạp hai lần, giữ nguyên concept UUID/datatype/unit và không tạo tên trùng.
- [x] Kiểm thử mở visit cho đúng patient/location/type, đọc lại, gắn encounter vào visit, ghi provider và thời gian nghiệp vụ. Kiểm tra dữ liệu patient A không thể bị gắn nhầm visit/encounter của patient B. Core trả HTTP 400 với `Encounter.visit.patients.dontMatch` cho liên kết chéo patient.
- [x] Ghi obs sinh hiệu qua adapter VinSHC đã được runtime hỗ trợ; xác minh concept, value, unit, thời điểm, patient và encounter. Adapter chặn sai kiểu/non-finite, `R_POS`, SpO2 ngoài 0–100 và BP thiếu vế; BP tâm thu ≤ tâm trương được lưu với `needsVerification=true`. Dữ liệu native vẫn hỗ trợ correction/void và đọc REST/FHIR; Core `/obs` trực tiếp không phải write API của ứng dụng.
- [x] Kết thúc visit, đọc lại lịch sử trên REST và FHIR `Encounter`/`Observation` trong phạm vi API công bố. Phân biệt `Visit` của OpenMRS và `Encounter` trong FHIR; lập mapping thật từ dữ liệu fixture, không giả định tên giống nhau là tương đương. Mapping và giới hạn thực tế được ghi trong [`visit.md`](api/visit.md) và [`encounter-obs.md`](api/encounter-obs.md).

#### Phần còn phải hoàn thiện để đóng toàn bộ B3

- [x] **Nghiệm thu Initializer trên database sạch:** project Docker cô lập đã clean-import metadata 0.2.0, pass 78/78 identity, khởi động lại không sinh mã/bản ghi trùng và chạy B1–B3. Overlay `update-label.json` 0.2.1 được nạp hai lần; nhãn mạch đổi đúng, concept UUID/datatype/unit giữ nguyên và không sinh tên trùng. Báo cáo: `.runtime/reports/metadata-update-0.2.1-acceptance.json`.
- [x] **Lớp ghi VinSHC đã thực thi validation:** `POST /vinshc/vitals` kiểm tra số hữu hạn, `R_POS`, SpO2 `R_PERCENT`, `R_BP`, patient/encounter/type và privilege trước khi ghi grouped Obs native. Test chặn bốn payload sai, đọc lại payload hợp lệ và void dữ liệu thử.
- [ ] **Chốt mapping chuẩn mã cho FHIR:** metadata hiện có UUID/UCUM nhưng chưa nạp mapping LOINC đã được thẩm định. FHIR2 vì vậy trả code UUID OpenMRS; huyết áp chưa thành một Observation panel/components chuẩn. Chỉ thêm LOINC sau khi metadata xác nhận phương pháp đo và mapping, đặc biệt với SpO2. **Đang chờ dữ liệu:** cần metadata chốt mapping LOINC đã thẩm định; backend không cần sửa code, chỉ thêm mapping `SAME-AS` vào concept CSV.
- [ ] **Chốt provider/quyền production ở B5:** B3 dùng provider điều dưỡng synthetic và role `encounter_role.nurse` để kiểm tra quan hệ. Cần metadata nhân sự thật, ma trận privilege và test user điều dưỡng trước khi dùng ngoài local/CI. **Thuộc B5**, không chặn API B3.
- [x] **Persistence qua restart:** restart/recreate backend rồi chạy lại [`test_b3_vitals.py`](../tests/integration/test_b3_vitals.py); cùng visit, encounter và hai group UUID vẫn đọc đúng, 6/6 kiểm tra đạt. Báo cáo máy đọc nằm tại `.runtime/reports/b3-integration.json`.
- [x] **Nghiệm thu code B1–B3 trên database sạch:** project/volume tách biệt pass 20 kiểm tra B1–B3 + extension, metadata 78/78, 3.356 mã Address Hierarchy và 4 FHIR identifier system trước/sau restart; overlay 0.2.1 idempotent cũng đạt. Báo cáo ở `.runtime/reports/b23-clean-acceptance.json` và `metadata-update-0.2.1-acceptance.json`. Các gate LOINC/provider/FHIR bên trên vẫn là điều kiện production riêng, không bị mục này che khuất.

**Đạt khi:** fixture `patient → visit → vitals encounter → obs` đọc lại chính xác sau restart; lỗi liên kết sai patient hoặc sai metadata được test; tài liệu API/FE dùng đúng UUID đã nạp. Phần API lõi đạt local ngày 11/10/2026 với 6/6 kiểm tra; B3 chỉ đóng toàn bộ sau các mục còn mở phía trên.

### Mốc B4 — Khám bác sĩ, dị ứng, chẩn đoán và đơn thuốc

**Đầu vào:** B3; từ điển dữ liệu khám, concept, thuốc/đơn vị và quyết định workflow từ nhóm metadata/FE. **Đầu ra:** bác sĩ có thể ghi và xem lại một lần khám hoàn chỉnh.

- [x] Xác định dữ liệu nào là obs/form, diagnosis/condition, allergy, order/medication; ghi rõ liên hệ với encounter và trạng thái bản ghi. Phiếu khám là grouped Obs `group.consultation`; chẩn đoán là `Diagnosis` native gắn encounter (rank 1/2, provisional/confirmed); dị ứng là `Allergy` native của patient (gắn encounter nếu có); thuốc là `DrugOrder` native. Sàng lọc `not_asked`/`unknown`/`no_known_allergy`/`present` là Obs, không bao giờ sửa danh sách dị ứng; mâu thuẫn bị chặn ở module (B4B).
- [x] Kiểm thử lưu/mở lại triệu chứng, khám, chẩn đoán ICD-10 (chính, kèm theo, mức độ chắc chắn), dị ứng và lời dặn theo form đã chốt. API ghi có kiểm tra, sửa append-only, một chẩn đoán chính, thay thế chẩn đoán kèm lý do, dị ứng có mã và `clinical-summary` đọc lại đúng sau restart. Bộ test đã chạy với catalogue metadata 0.3.0; mã category `E11` bị khóa đúng dù có mapping ICD-10. Catalogue production đầy đủ vẫn cần phê duyệt riêng, không chặn nghiệm thu code B4.
- [x] Kiểm thử kê đơn với danh mục thuốc, liều, đơn vị, đường dùng, tần suất, số ngày, số lượng và trạng thái. `POST /vinshc/drug-order` kiểm tra người kê, danh mục, số, đơn trùng, xung đột dị ứng (cần lý do override), ngừng thuốc; REST `order` và FHIR `MedicationRequest` đọc lại cùng UUID. Test metadata 0.3.0 dùng `Drug`, đơn vị liều/cấp riêng, đường dùng và `OrderFrequency` đã nạp thật vào OpenMRS. Số CCHN và thông tin cơ sở production cho mẫu in thuộc B5/B8.
- [x] Đối chiếu lần khám thứ hai của cùng bệnh nhân: hồ sơ cũ vẫn đọc được, dữ liệu mới không ghi đè hoặc đổi nguồn gốc bản ghi cũ. Fixture B4A dùng visit ngoại trú và visit tái khám, hai encounter/group UUID riêng; sửa lời dặn void bản cũ và tạo Obs thay thế trong đúng group.

#### B4B đã hoàn thành (module 0.3.0, 11/10/2026)

- [x] **Phiếu khám có kiểm tra:** `POST /vinshc/consultation` và sửa `POST /vinshc/consultation/{group}` chặn trường lạ, chuỗi rỗng, `present` thiếu nội dung, text tiền sử khi chưa `present`, `no_known_allergy` khi đang có dị ứng, ngày tái khám trước encounter, encounter sai loại/sai patient, phiếu trùng. Hợp đồng: [consultation.md](api/consultation.md).
- [x] **Chốt phiếu:** `POST /vinshc/encounter/{uuid}/finalize` yêu cầu lý do khám, trạng thái dị ứng (có dị ứng nếu `present`) và đúng một chẩn đoán chính; mỗi encounter chốt một lần (unique index). Sau khi chốt, sửa cần `reason` và không void được chẩn đoán chính.
- [x] **Khung chẩn đoán, dị ứng, đơn thuốc:** đọc danh mục qua global property; chưa cấu hình thì trả 503, không nhận text tự do (dị ứng non-coded chỉ khi `vinshc.allergy.allowNonCoded=true`). `GET /vinshc/clinical-configuration` báo mục nào đã sẵn sàng. Hợp đồng: [diagnosis-allergy.md](api/diagnosis-allergy.md), [medication-order.md](api/medication-order.md); bàn giao dữ liệu: [B4_CATALOGUE_HANDOFF.md](data/B4_CATALOGUE_HANDOFF.md).
- [x] **Nhật ký ghi lâm sàng:** bảng `vinshc_clinical_event` ghi cùng transaction cho mọi thao tác B4 (người, thời điểm, UUID, lý do). Chưa phải audit truy cập/xem (B5).
- [x] **Privilege riêng:** 6 privilege `VinSHC: ...` cho đọc, phiếu khám, chốt, chẩn đoán, dị ứng, kê đơn; test xác nhận 403 cho cả 6 nhóm endpoint. Gán vào 8 role là B5.
- [x] **Test:** [`test_b4b_clinical.py`](../tests/integration/test_b4b_clinical.py) đạt 9/9 với catalogue metadata 0.3.0 trên database Docker sạch, đạt lại 9/9 sau recreate backend và đọc được encounter của lần chạy trước. Toàn bộ B1–B4 đạt 35/35 theo đúng thứ tự fixture. Báo cáo `.runtime/reports/b4b-clinical.json`.

#### B4A và catalogue B4 đã hoàn thành

- [x] **Phiếu khám dạng Obs:** encounter type khám, provider role người khám, `group.consultation`, lý do khám, bệnh sử, tiền sử, triệu chứng, khám, tóm tắt, hướng điều trị, lời dặn và ngày/lời dặn tái khám đã được ghi/đọc thật qua REST.
- [x] **Trạng thái thiếu và sàng lọc dị ứng:** test phân biệt `not_asked`, `unknown`, `none_reported`, `present` và `no_known_allergy`; lượt sau chưa biết dị ứng không xóa hay đổi câu trả lời của lượt trước.
- [x] **Lịch sử, restart và FHIR trong phạm vi B4A:** hai lượt khám của cùng patient tồn tại độc lập và đọc lại đúng sau restart/recreate backend; parent Consultation Observation đọc được qua FHIR với đúng patient, encounter và `hasMember`. OpenMRS Visit vẫn chỉ đọc qua REST.
- [x] **ICD-10/Diagnosis:** catalogue test 0.3.0 có nguồn/system/version, mapping `SAME-AS` và allowlist selectable; backend yêu cầu cả source lẫn concept set `vinshc.diagnosis.icd10SelectableConceptSetUuid`. Test chấp nhận I10/J06.9/Z00.0 và từ chối category E11 bị khóa. FHIR2 trả chẩn đoán encounter active dưới dạng `Condition` (`encounter-diagnosis`). Catalogue production đầy đủ và quyết định problem list vẫn là gate nghiệp vụ riêng.
- [x] **Allergy chi tiết:** concept set tác nhân thuốc/thực phẩm/môi trường, phản ứng và mức độ của metadata 0.3.0 đã được nạp; test xác nhận round-trip, trạng thái sàng lọc và xung đột dị ứng–thuốc. Test đặt `allowNonCoded=false`; thay đổi chính sách này cho production cần phê duyệt nghiệp vụ.
- [x] **Đơn thuốc:** `Drug`, `OrderFrequency`, đơn vị liều/cấp, đường dùng và đơn vị thời gian có mapping SNOMED CT của metadata 0.3.0 đã được provision và kiểm thử qua DrugOrder/REST/FHIR. Danh mục thuốc được cơ sở phê duyệt cho production vẫn là gate triển khai, không phải phần code B4 còn thiếu.
- [x] **Form và validation adapter:** chốt dùng FE VinSHC riêng + API `vinshc` (không viết O3 Form schema); validation phía server cho `present`, trạng thái final, sửa/void kèm lý do và provenance đã có ở B4B. `forms.json` vẫn là spec bàn giao cho FE.
- [x] **Ranh giới provider/cơ sở/quyền:** B4 đã kiểm thử bằng bác sĩ/cơ sở synthetic và privilege endpoint riêng. Số chứng chỉ hành nghề, thông tin cơ sở thật, gán quyền cho 8 role và dữ liệu mẫu in là gate production của B5/B8, không phải code B4.

Bộ test B4A nằm tại [`test_b4a_consultation.py`](../tests/integration/test_b4a_consultation.py), báo cáo local tại `.runtime/reports/b4a-integration.json`; hợp đồng runtime ở [`consultation.md`](api/consultation.md).

Chỉ định CLS, lịch hẹn, hàng đợi, thu tiền và mẫu in thuộc mốc B8.

**Đạt khi:** kịch bản bác sĩ hoàn thành trên dữ liệu giả; đọc lại toàn bộ lần khám đúng patient/visit/encounter; dữ liệu thuốc và chẩn đoán có đơn vị/mã/trạng thái theo hợp đồng đã chốt.

### Mốc B5 — Xác thực, phân quyền và audit

**Đầu vào:** ma trận quyền được nhóm xác nhận (DATA-04); B2–B4 đủ thao tác để kiểm thử. **Đầu ra:** quyền có hiệu lực tại API.

- [x] Chốt 8 role theo [CLINIC_WORKFLOW.md](CLINIC_WORKFLOW.md#2-vai-trò): tiếp đón, thu ngân, điều dưỡng, bác sĩ, kỹ thuật viên CLS, dược/quầy thuốc, quản lý phòng khám, quản trị hệ thống. Initializer nạp 8 role và 69 privilege; test chạy đủ 896 ô `8 role × 16 resource × 7 action` theo default-deny. Một tài khoản có thể nhiều role nhưng backend đánh giá privilege của **active workspace role**, không dùng hợp quyền của các role khác.
- [x] Tạo tài khoản thử nghiệm riêng trên instance Docker cô lập, credential ngẫu nhiên chỉ giữ trong bộ nhớ và void sau test. Backend lưu assignment user/role/facility phía server; request chọn workspace bằng header nhưng không thể tự cấp scope. Test xác nhận receptionist/cashier/nurse/doctor/lab/pharmacy đọc đúng adapter, manager/admin không đọc bệnh án, doctor ghi/void diagnosis, và cả 8 role bị chặn khi gọi trực tiếp Core REST/FHIR. FHIR2 4.2.0 vẫn có lỗi upstream trả 500 thay vì 403 khi thiếu quyền.
- [x] Kiểm tra session, mật khẩu sai, truy cập thiếu workspace và facility giả đều bị từ chối. Scope encounter/patient được đối chiếu location với facility hoặc location con từ assignment server-side. Assignment hỗ trợ nhiều facility và có endpoint thu hồi; account production vẫn phải là tài khoản cá nhân provision ngoài Git.
- [x] Khảo sát và bổ sung audit: B2 giữ creator/time/version; B4 giữ `vinshc_clinical_event` cho write/correction/void; B5 thêm `vinshc_access_event` append-only cho các read hồ sơ qua adapter với actor/time/action/target. Hợp đồng và giới hạn nằm ở [`authorization-audit.md`](api/authorization-audit.md). Direct Core/FHIR bị chặn với app role; truy cập break-glass của system admin vẫn cần gateway log tập trung, retention/alert và test tái dựng trước production theo [VIETNAM_COMPLIANCE.md](VIETNAM_COMPLIANCE.md).

**Đạt khi:** ma trận quyền có test backend cho từng role; người không có quyền bị từ chối; dấu vết thay đổi và giới hạn audit được mô tả bằng bằng chứng. Đã đạt trên Docker cô lập ngày 12/10/2026: B5 5/5, toàn bộ ma trận 896 ô và restart/persistence; báo cáo `.runtime/reports/b5-authorization.json`.

### Mốc B6 — Database, khả năng phục hồi và vận hành

**Đầu vào:** có fixture patient/visit/encounter/obs; B0 baseline. **Đầu ra:** runbook có thể phục hồi một instance test.

Đã có bằng chứng một phần: PostgreSQL dùng UTF8 và hai volume `postgres-data` / `openmrs-pg-data`; một lần dump PostgreSQL và restore sang project chính đã đạt trên dữ liệu giả ([VALIDATION.md](VALIDATION.md)). Mốc này biến kết quả đó thành quy trình lặp lại được.

- [x] Kiểm tra PostgreSQL và `/openmrs/data` dùng volume bền vững, encoding UTF8, cổng DB/backend không publish ra host, healthcheck/readiness, log và dung lượng. Phân loại dữ liệu DB/application volume, giới hạn attachment và kiểm tra dung lượng nằm trong [RECOVERY_RUNBOOK.md](RECOVERY_RUNBOOK.md).
- [x] Thiết kế backup nhất quán cho DB (`pg_dump` custom format), OpenMRS data volume giữ Linux ownership và manifest cấu hình/image có SHA-256. `scripts/recovery.py backup` đã chạy trên Compose project tách biệt; lịch, nơi lưu, credential, retention và operator được chốt thành gate trong runbook.
- [x] Restore vào project/volume mới đã đọc lại đúng patient, visit, encounter, obs qua REST/FHIR; module/version/metadata, PostgreSQL 16.15 UTF8, 245 bảng và 118 foreign key đều đạt. Application-volume marker giữ đúng SHA-256; chưa có attachment nghiệp vụ B2–B5 nên không tuyên bố test upload. Backup 95,172 giây; restore + verify 121,203 giây ngày 12/10/2026.
- [ ] Tách quyền database trước khi ra ngoài môi trường local: hiện `OMRS_DB_USER` là user khởi tạo của image PostgreSQL và có quyền quản trị cluster. Production cần tài khoản migration/quản trị riêng và tài khoản ứng dụng quyền tối thiểu.
- [x] Checklist staging/production về HTTPS, secrets ngoài Git, network, admin, backup, log/monitoring và update đã được chuẩn bị trong runbook. Compose hiện tại vẫn chỉ là local `127.0.0.1`; triển khai server cần owner phê duyệt và kiểm chứng riêng.
- [x] Runbook đã ghi quy trình nâng cấp schema/module/image: backup trước, restore/upgrade trên bản sao giả, hậu kiểm, review patch PostgreSQL và rollback bằng instance cũ; cấm reverse migration/xóa volume khi chưa có đường phục hồi.

**Đạt khi:** có backup và restore kiểm chứng được bằng dữ liệu giả trên môi trường cô lập, runbook ghi lệnh/thứ tự/kết quả; baseline local vẫn pass. **Đã đạt local ngày 12/10/2026**; mục tách database role và các phê duyệt production vẫn là deployment gate, không thể hoàn tất bằng credential thật trong Git.

### Mốc B7 — FHIR và khả năng mở rộng liên phòng khám

**Đầu vào:** B2–B5; quyết định định danh và thuật ngữ từ nhóm metadata. **Đầu ra:** bảng mapping có bằng chứng, không triển khai chia sẻ hồ sơ thật trong mốc này.

- [x] Bảng [FHIR mapping](api/fhir-mapping.md) ghi đủ Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, ServiceRequest, Location và Practitioner: nguồn/ID, trường/link, code/unit/time/status, người/cơ sở, capability thực và giới hạn; đã đối chiếu contract metadata và cột FHIR trong [DATA_DICTIONARY.md](DATA_DICTIONARY.md).
- [x] Fixture hai lượt khám đối chiếu REST–FHIR cùng UUID/mapping; test instant ISO 8601 có offset, quy ước hiển thị `Asia/Ho_Chi_Minh`, sửa/void và missing-state. Sáu gap runtime có mã/assertion rõ; ServiceRequest được ghi blocked đến B8 thay vì giả là đã round-trip.
- [x] Patient identifier giữ namespace theo loại/cơ sở; facility UUID ổn định và provider mapping đã xác minh. Catalogue/code/version/provenance chưa đạt production được ghi rõ. MPI/record locator, consent và cross-facility policy vẫn là quyết định M7, không auto-merge.
- [x] Giữ [ADR-0001](decisions/0001-openmrs-openehr.md): OpenMRS là nguồn gốc; openEHR là mapping thiết kế/adapter một chiều ở tầng sau. B7 không tuyên bố FHIR2 hiện tại đáp ứng openEHR hoặc đã triển khai EHRbase.

**Đạt khi:** bảng mapping được kiểm tra bằng fixture; nguồn gốc cơ sở và bệnh nhân rõ ràng; giới hạn FHIR được ghi cho FE/nhóm tích hợp. **Đã đạt local ngày 12/10/2026:** B7 6/6 trên Docker cô lập; báo cáo `.runtime/reports/b7-fhir.json`. Các gap nêu trên là giới hạn được kiểm thử, không phải cam kết interoperability production.

### Mốc B8 — Vận hành phòng khám (MVP-2)

**Đầu vào:** B3–B5; danh mục dịch vụ và bảng giá mẫu (DATA-09); mẫu giấy tờ từ khảo sát M0; ma trận khả năng của B0. **Đầu ra:** quy trình phòng khám tư chạy trọn trên backend với dữ liệu giả.

- [x] **Lịch hẹn và hàng đợi:** transaction adapter đã kiểm thử đặt/tái phát idempotent, khóa slot trùng, lifecycle lịch hẹn; cấp số và chuyển `RECEPTION → NURSE → DOCTOR → LAB → CASHIER → PHARMACY`; trạng thái `left` giữ lý do. Module upstream vẫn started nhưng schema/transition API không được dùng làm contract ứng dụng khi chưa ổn định.
- [x] **Bảng giá và thu tiền:** snapshot danh mục/giá theo cơ sở, số nguyên VND, trả trước/trả sau, thu một phần, chuyển khoản pending/settled, hoàn tiền và hủy bill chưa thu đã được kiểm thử. Mọi payment lưu người ghi, thời điểm, idempotency key và liên kết bill/receipt gốc.
- [x] **Chỉ định CLS:** API tạo native `TestOrder`, gán KTV, chuyển trạng thái, ghi/sửa kết quả append-only và đọc lại cùng UUID qua FHIR `ServiceRequest`. Multipart PDF đã upload/download đúng byte và SHA-256, gắn đúng patient/encounter/order/result; JPEG/PNG cùng allowlist/sniff. Production upload vẫn khóa cho đến khi có scanner/object storage.
- [x] **Dữ liệu cho mẫu in:** DTO có số chứng từ ổn định cho đơn thuốc, phiếu thu, phiếu chỉ định, phiếu kết quả và giấy hẹn; danh tính cơ sở/người hành nghề lấy từ metadata/native record. B8 không render PDF hay tuyên bố chữ ký điện tử hợp lệ pháp lý; FE-08 dùng contract này.
- [x] **Báo cáo ngày:** đối chiếu số lượt và gross/refund/net VND theo ngày `Asia/Ho_Chi_Minh`; output chỉ aggregate. User role quản lý đọc được báo cáo nhưng nhận 403 khi đọc clinical summary.
- [x] **Biến thể cấu hình:** `STANDARD_POSTPAY` có điều dưỡng/quầy thuốc và `COMPACT_PREPAY` không có hai điểm đó được đọc từ `workflow.json`; prepay gate được kiểm thử, không có nhánh code riêng theo phòng khám.
- [x] **Khung adapter (BE-09):** [`integrations/`](../integrations/) có manifest disabled-by-default và JSON Schema envelope chung cho BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS, PACS; adapter thật, credential và kết nối ngoài vẫn thuộc M6.

**Đạt khi:** quy trình mục 2.3 của `PROJECT_PLAN.md` chạy trọn trên backend với dữ liệu giả, gồm hàng đợi, thu tiền, CLS và tái khám; ít nhất hai biến thể cấu hình chạy được; tiền và trạng thái thanh toán truy vết được.

**Đã đạt local ngày 12/10/2026:** B8 đạt 7/7 trên Docker PostgreSQL cô lập sau chuỗi fixture B1–B4; hợp đồng ở [clinic-operations.md](api/clinic-operations.md), report `.runtime/reports/b8-operations.json`. Catalogue và danh tính là synthetic; production upload và mọi tích hợp ngoài đều giữ disabled.

### Mốc B9 — Tích hợp, CI và nghiệm thu một phòng khám

**Đầu vào:** B2–B8 và UI/form đủ cho kịch bản. **Đầu ra:** backend của một phòng khám có thể bàn giao để nghiệm thu.

- [x] CI dựng image/config từ commit trên project riêng, kiểm tra metadata/Initializer, chạy có thứ tự 53 test B1–B8, rồi verifier B9 sau restart và restore. Report/diagnostics được giới hạn trong `.runtime/reports/`; backup và credential không upload. Workflow đã được actionlint/local-equivalent kiểm tra. Commit `647e598` đã push lên `clinic-backend` nhưng chưa có hosted check vì workflow chỉ tự chạy khi mở PR hoặc push `main`; có thể chạy thủ công bằng `workflow_dispatch`.
- [ ] Kịch bản backend synthetic đã bao phủ đăng ký/tìm, hàng đợi, thu phí, sinh hiệu, khám, CLS, chẩn đoán, kê đơn, 5 DTO in, lịch sử/tái khám, trùng tên, dữ liệu sai/thiếu, sai quyền, hủy và lỗi API. **Còn thiếu:** E2E trên trình duyệt với FE và người dùng nghiệp vụ; không tick hoàn thành thay cho nhóm FE.
- [x] Đã chạy database sạch, restart giữ volume và backup–restore sang project/volume mới. Verifier read-only đối chiếu patient/encounter/diagnosis/đơn thuốc, tiền, native TestOrder/FHIR, attachment đúng byte/hash, số chứng từ và báo cáo. Gói bàn giao nằm ở [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md); giới hạn cần owner chấp nhận vẫn mở.
- [x] Đã đánh giá riêng theo [PILOT_READINESS.md](PILOT_READINESS.md), kết luận `NOT APPROVED FOR REAL DATA`: các gate HTTPS/secrets/DB least privilege, catalogue và danh tính pháp lý, file scanning/storage, vận hành, dữ liệu cá nhân, FE UAT và chữ ký owner chưa đạt.

**Đạt khi:** một người khác dựng lại và thực hiện trọn kịch bản bằng dữ liệu giả, test CI pass, dữ liệu đọc lại đúng sau restart/restore, các giới hạn còn lại được người phụ trách chấp nhận bằng văn bản.

**Bằng chứng backend local ngày 12/10/2026:** clean stack đạt 53/53 B1–B8; restart 4/4 và restore project mới 4/4; metadata 78 identity giữ nguyên, PostgreSQL 16.15/253 bảng/118 FK đạt. Backup mất 97,969 giây, restore 130,516 giây. B9 tổng thể chưa đạt điều kiện cuối vì commit hiện tại chưa có hosted CI run, FE/browser UAT, người kiểm chứng độc lập và văn bản chấp nhận giới hạn.

## 4. Khi nào viết module Java hoặc sửa source upstream?

Mỗi khoảng trống phải có: ca tái hiện, request/response hoặc log, hành vi mong muốn, ảnh hưởng FE/metadata, test thất bại hiện tại và các phương án đã thử. Quyết định theo thứ tự:

1. Dùng API/metadata/configuration đã có nếu đáp ứng được và có test chứng minh.
2. Cấu hình hoặc thêm module OpenMRS tương thích với baseline, khóa phiên bản, kiểm tra phụ thuộc, dữ liệu và **khả năng chạy trên PostgreSQL**.
3. Viết module VinSHC riêng khi cần logic nghiệp vụ hoặc API đặc thù. Đặt source do nhóm sở hữu ở `modules/<ten-module>/`; bổ sung Maven build, unit test, kiểm tra tương thích, copy `.omod` vào image, test khởi động và CI. Kết nối hệ thống bên ngoài đặt ở `integrations/` dưới dạng adapter có thể tắt ([ARCHITECTURE.md](ARCHITECTURE.md#3-phân-loại-module)).
4. Fork/sửa module upstream khi lỗi hoặc khoảng trống nằm trong module đó và extension riêng không phù hợp. Checkout đúng phiên bản đang chạy, lưu upstream commit, giấy phép, patch và cách cập nhật; thay đúng artifact trong image và kiểm chứng nâng cấp. Các bản sửa PostgreSQL hiện có trong `infra/backend/postgresql/` là ví dụ cách ghi nguồn, hash và giới hạn. Sửa Core là lựa chọn có chi phí bảo trì cao, cần quyết định riêng.

Không sửa file trong container đang chạy để coi là kết quả bàn giao. Mọi thay đổi phải tái lập được từ Git và Docker build; phải có test trước/sau cho nghiệp vụ bị ảnh hưởng. Khi bản sửa tương thích cũng có ích cho upstream, báo hoặc đóng góp ngược về dự án gốc.

## 5. Lệnh kiểm tra và bằng chứng tối thiểu

Các lệnh dưới đây dùng cho **instance local/test** theo [`DEVELOPMENT.md`](DEVELOPMENT.md); fixture bệnh nhân giả có thể ghi vào DB đang chạy. Trước khi chạy kiểm thử có ghi dữ liệu, xác nhận `COMPOSE_PROJECT_NAME`, cổng và instance đích.

```powershell
python scripts/bootstrap.py
python scripts/check_config.py
python -m unittest discover -s tests -v
docker compose pull --quiet --ignore-buildable
docker compose build --pull backend
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py
```

Để kiểm tra persistence trên **cùng** instance test:

```powershell
python scripts/smoke.py --create-fixture --report .runtime/reports/smoke-before.json
docker compose down
docker compose up -d --wait --wait-timeout 600
python scripts/smoke.py --require-fixture --report .runtime/reports/smoke-after.json
```

Sau khi thêm integration test, cập nhật mục này bằng đúng lệnh chạy và cách chọn Compose project cô lập. Báo cáo nghiệm thu phải có: commit, image/module versions, danh sách test pass/fail, metadata version/UUID liên quan, fixture giả, ngày kiểm thử, giới hạn và người kiểm chứng. Báo cáo không chứa `.env` hay dump DB.

## 6. Ưu tiên ngay cho agent tiếp theo

1. Hoàn tất B0: ma trận khả năng runtime (gồm cả module MVP-2) và scope MVP-1/MVP-2 đã chốt. Không đổi version baseline trong bước này.
2. Làm B1 và B2: API contract, test client dùng chung, patient/identifier workflow. Đây là phần ít phụ thuộc metadata lâm sàng nhất.
3. Yêu cầu nhóm metadata bàn giao gói nhỏ đầu tiên: identifier type, visit type, encounter type, location, UUID và concept sinh hiệu. Tích hợp B3 ngay khi gói có thể nạp trên DB sạch.
4. Chốt ma trận quyền 8 role với cả nhóm, viết test API quyền song song B3/B4.
5. Khảo sát sớm billing (BE-08), queue và appointments (BE-12) trên PostgreSQL để biết B8 cần cấu hình hay cần code; không chờ B4 xong mới phát hiện khoảng trống.
6. Khi B3–B5 có fixture đủ dữ liệu, biến backup–restore thành runbook (B6) và làm FHIR mapping (B7); sau đó làm B8, nối vào CI và nghiệm thu B9.

## 7. Tài liệu tham chiếu

- Nội bộ: [`PROJECT_PLAN.md`](../PROJECT_PLAN.md), [`CLINIC_WORKFLOW.md`](CLINIC_WORKFLOW.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md), [`VIETNAM_COMPLIANCE.md`](VIETNAM_COMPLIANCE.md), [`DEVELOPMENT.md`](DEVELOPMENT.md), [`CI.md`](CI.md), [`VALIDATION.md`](VALIDATION.md), [ADR-0001](decisions/0001-openmrs-openehr.md), [ADR-0002](decisions/0002-postgresql.md), [`config/baseline.json`](../config/baseline.json), [`infra/backend/postgresql/README.md`](../infra/backend/postgresql/README.md).
- Upstream: [OpenMRS REST documentation](https://rest.openmrs.org/), [Initializer 2.12.0](https://github.com/mekomsolutions/openmrs-module-initializer/tree/2.12.0), [OpenMRS module development with Docker](https://openmrs.atlassian.net/wiki/spaces/docs/pages/1097891841/Backend+Module+Development+Using+Docker+No+SDK), [PostgreSQL 16 backup and restore](https://www.postgresql.org/docs/16/backup.html). Luôn đối chiếu tài liệu upstream với phiên bản và hành vi thực tế của instance VinSHC.
