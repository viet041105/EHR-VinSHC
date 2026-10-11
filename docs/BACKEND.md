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
- [ ] Phối hợp metadata/FE để định nghĩa các trường phụ như số điện thoại, người liên hệ và quy tắc thông tin thiếu. Địa chỉ dùng danh mục tỉnh → xã hiện hành qua Address Hierarchy (DATA-08); kiểm tra cảnh báo cấu hình Address Hierarchy còn ghi trong [VALIDATION.md](VALIDATION.md#giới-hạn). Không đặt CCCD làm khóa định danh toàn mạng nếu chưa có chính sách được chốt.

#### Phần còn phải hoàn thiện để đóng toàn bộ B2

- [ ] **Chốt contract người liên hệ với metadata/FE:** xác định số lượng `contacts[]`, contact chính/khẩn cấp, danh mục quan hệ, trường bắt buộc và việc contact có được liên kết với Person/Patient đã có hay chỉ là dữ liệu hành chính. Không tự tạo Patient chỉ vì nhập người nhà. Khuyến nghị MVP lưu contact thành bản ghi lặp riêng gồm `fullName`, `relationshipCode`, `phone`, `addressText`, `priority`, `emergencyContact` và audit/void; không tách thành các Person Attribute rời vì sẽ mất liên kết giữa các trường của cùng một contact.
- [ ] **Chốt và lưu trạng thái thông tin thiếu:** xác định trường nào phải phân biệt `not_recorded`, `not_asked`, `unknown`, `refused`, `not_applicable`, `masked`, `unreadable`; quy định giá trị đã ghi phải đi với `recorded` và không được đồng thời mang trạng thái thiếu. Backend cần persistence cho `fieldStates[]` theo patient, context/record, `fieldCode` và `rowKey` để hỗ trợ dữ liệu lặp; Core `null` không đủ biểu diễn các trạng thái này.
- [ ] **Bổ sung extension/module Java cho dữ liệu không có native schema:** tạo migration PostgreSQL, service và REST resource cho contact cùng field-state; hỗ trợ create/read/update/void, validation, audit và quyền. Không lưu JSON ghép hoặc địa chỉ dài vào Person Attribute chỉ để tránh làm module. Ghi contract request/response thật vào `docs/api/` và thêm integration test.
- [ ] **Hoàn thiện DATA-08 và Address Hierarchy:** nhóm metadata bàn giao catalogue tỉnh → xã có mã, tên, quan hệ cha, nguồn, phiên bản và ngày hiệu lực; chốt cách giữ địa chỉ nguyên văn và địa chỉ giấy tờ cũ. Backend thêm cấu hình dưới `infra/backend/configuration/addresshierarchy/`, nạp bằng Initializer và loại bỏ cảnh báo `addressConfiguration.xml` không hợp lệ. Test phải chứng minh xã thuộc đúng tỉnh, mã ổn định sau import/restart, địa chỉ cũ không bị ghi đè và REST/FHIR đọc lại đúng.
- [ ] **Xử lý/đóng quyết định lỗi quyền FHIR:** FHIR2 4.2.0 hiện từ chối đúng user thiếu `Get Patients` nhưng trả HTTP 500 `OperationOutcome` thay vì 403. Có thể giữ hành vi đã document/test cho MVP, nâng module sau khi kiểm tra tương thích, hoặc backport exception mapper; không được đổi mọi HTTP 500 thành 403 tại gateway. Nếu giữ cho MVP, FE phải nhận diện đây là lỗi quyền và không retry.
- [ ] **Nghiệm thu cuối:** chạy trên database mới, nạp metadata hai lần không trùng, tạo patient có nhiều contact và field-state, cập nhật/void, kiểm tra địa chỉ hiện hành/cũ, quyền REST/FHIR và đọc lại sau restart. Tick mục B2 cuối chỉ khi contract metadata/FE, catalogue DATA-08, API docs và test đều đã có bằng chứng.

**Đạt khi:** tạo và tìm lại đúng một hồ sơ bằng REST, đọc được cùng UUID/identifier qua FHIR, trường hợp trùng tên và sai quyền có test. Phần lõi đã đạt local ngày 11/10/2026 với 5/5 kiểm tra B2; báo cáo ở `.runtime/reports/b2-integration.json`. Toàn bộ B2 chỉ đóng sau khi hoàn thành checklist mở rộng phía trên.

### Mốc B3 — Visit, encounter và sinh hiệu

**Đầu vào:** B1–B2; gói metadata tối thiểu gồm visit type, encounter type, concept sinh hiệu, đơn vị và UUID ổn định. **Đầu ra:** một lượt khám có sinh hiệu đọc lại được.

- [ ] Kiểm tra Initializer nạp gói metadata trên database mới, chạy lại và sửa một thuộc tính không tạo bản ghi trùng. Nếu người metadata chưa bàn giao đủ, tiếp tục B1/B2/B6; dùng metadata synthetic riêng trong instance test khi cần khảo sát API.
- [x] Kiểm thử mở visit cho đúng patient/location/type, đọc lại, gắn encounter vào visit, ghi provider và thời gian nghiệp vụ. Kiểm tra dữ liệu patient A không thể bị gắn nhầm visit/encounter của patient B. Core trả HTTP 400 với `Encounter.visit.patients.dontMatch` cho liên kết chéo patient.
- [ ] Ghi obs sinh hiệu qua API được runtime hỗ trợ; xác minh concept, value, unit, thời điểm, người ghi, patient, visit và encounter. Kiểm tra thiếu dữ liệu, giá trị sai kiểu/ngoài quy tắc đã chốt và xử lý cập nhật/void theo hành vi OpenMRS. **Đã đạt:** ghi/đọc 8 chỉ số và companion status trong `group.vitals`, hai lần đo riêng, trạng thái `unknown` không tạo numeric Obs, sai kiểu trả 400, update tạo phiên bản Obs mới và void hoạt động. **Chưa đạt:** Core vẫn nhận SpO2 101 hoặc số âm; cần write adapter thực thi `R_POS`, `R_PERCENT`, `R_BP` trước khi tick toàn mục.
- [x] Kết thúc visit, đọc lại lịch sử trên REST và FHIR `Encounter`/`Observation` trong phạm vi API công bố. Phân biệt `Visit` của OpenMRS và `Encounter` trong FHIR; lập mapping thật từ dữ liệu fixture, không giả định tên giống nhau là tương đương. Mapping và giới hạn thực tế được ghi trong [`visit.md`](api/visit.md) và [`encounter-obs.md`](api/encounter-obs.md).

#### Phần còn phải hoàn thiện để đóng toàn bộ B3

- [ ] **Nghiệm thu Initializer trên database sạch:** dựng project Docker cô lập, nạp metadata 0.1.0, khởi động lại/nạp lần hai và thử sửa một thuộc tính có kiểm soát; chứng minh không sinh UUID/bản ghi trùng. Bộ test hiện đã xác minh đúng UUID, datatype, unit và set member trên database đang chạy, nhưng chưa thay thế phép thử clean-install/update này.
- [ ] **Thêm lớp ghi VinSHC để thực thi validation:** kiểm tra số hữu hạn, `R_POS`, SpO2 `R_PERCENT` 0–100 và tính nhất quán cặp huyết áp `R_BP` trước khi gọi Core REST. OpenMRS Core chỉ chặn sai datatype, không tự thực thi các rule trong `metadata/vinshc/fields.csv`; test B3 cố ý chứng minh rồi void ngay bản ghi SpO2 101.
- [ ] **Chốt mapping chuẩn mã cho FHIR:** metadata hiện có UUID/UCUM nhưng chưa nạp mapping LOINC đã được thẩm định. FHIR2 vì vậy trả code UUID OpenMRS; huyết áp chưa thành một Observation panel/components chuẩn. Chỉ thêm LOINC sau khi metadata xác nhận phương pháp đo và mapping, đặc biệt với SpO2.
- [ ] **Chốt provider/quyền production ở B5:** B3 dùng provider điều dưỡng synthetic và role `encounter_role.nurse` để kiểm tra quan hệ. Cần metadata nhân sự thật, ma trận privilege và test user điều dưỡng trước khi dùng ngoài local/CI.
- [x] **Persistence qua restart:** restart/recreate backend rồi chạy lại [`test_b3_vitals.py`](../tests/integration/test_b3_vitals.py); cùng visit, encounter và hai group UUID vẫn đọc đúng, 6/6 kiểm tra đạt. Báo cáo máy đọc nằm tại `.runtime/reports/b3-integration.json`.
- [ ] **Nghiệm thu cuối trên database sạch:** chạy lại toàn bộ B1–B3 trên database Docker mới và tick hai mục còn mở chỉ khi validation adapter cùng phép thử Initializer đều đạt.

**Đạt khi:** fixture `patient → visit → vitals encounter → obs` đọc lại chính xác sau restart; lỗi liên kết sai patient hoặc sai metadata được test; tài liệu API/FE dùng đúng UUID đã nạp. Phần API lõi đạt local ngày 11/10/2026 với 6/6 kiểm tra; B3 chỉ đóng toàn bộ sau các mục còn mở phía trên.

### Mốc B4 — Khám bác sĩ, dị ứng, chẩn đoán và đơn thuốc

**Đầu vào:** B3; từ điển dữ liệu khám, concept, thuốc/đơn vị và quyết định workflow từ nhóm metadata/FE. **Đầu ra:** bác sĩ có thể ghi và xem lại một lần khám hoàn chỉnh.

- [ ] Xác định dữ liệu nào là obs/form, diagnosis/condition, allergy, order/medication; ghi rõ liên hệ với encounter và trạng thái bản ghi. Cùng nhóm metadata chốt sự khác nhau giữa `chưa hỏi`, `không có`, `không biết` cho dị ứng/tiền sử. **B4A đã đạt:** bệnh sử/khám/lời dặn/tái khám và trạng thái sàng lọc lưu trong `group.consultation`; các trạng thái `not_asked`, `unknown`, `none_reported`, `present`, `no_known_allergy` được giữ riêng. **Còn mở:** Diagnosis, Allergy chi tiết và DrugOrder native.
- [ ] Kiểm thử lưu/mở lại triệu chứng, khám, chẩn đoán ICD-10 (chính, kèm theo, mức độ chắc chắn), dị ứng và lời dặn theo form đã chốt; tránh mất dữ liệu khi chỉnh sửa hoặc khi bệnh nhân tái khám. **B4A đã đạt:** round-trip các Obs khám, sửa tạo phiên bản mới không mất bản cũ, hai lần khám không ghi đè nhau. Chẩn đoán ICD-10 và Allergy native chưa làm vì chưa có catalogue.
- [ ] Kiểm thử kê đơn với danh mục thuốc, liều, đơn vị, đường dùng, tần suất, số ngày, số lượng và trạng thái. Đơn phải đủ dữ liệu cho mẫu in theo [VIETNAM_COMPLIANCE.md](VIETNAM_COMPLIANCE.md#2-yêu-cầu-thiết-kế-rút-ra), gồm thông tin người kê đơn (số chứng chỉ hành nghề) và cơ sở. Xác minh API REST và FHIR cho **đúng** thao tác cần dùng; `CapabilityStatement` là điểm bắt đầu, còn create/update/read phải được test trên fixture thật. Nếu FHIR chỉ hỗ trợ đọc cho nghiệp vụ đó, ghi giới hạn và dùng REST phù hợp cho FE.
- [x] Đối chiếu lần khám thứ hai của cùng bệnh nhân: hồ sơ cũ vẫn đọc được, dữ liệu mới không ghi đè hoặc đổi nguồn gốc bản ghi cũ. Fixture B4A dùng visit ngoại trú và visit tái khám, hai encounter/group UUID riêng; sửa lời dặn void bản cũ và tạo Obs thay thế trong đúng group.

#### B4A đã hoàn thành và phần còn phải chờ dữ liệu

- [x] **Phiếu khám dạng Obs:** encounter type khám, provider role người khám, `group.consultation`, lý do khám, bệnh sử, tiền sử, triệu chứng, khám, tóm tắt, hướng điều trị, lời dặn và ngày/lời dặn tái khám đã được ghi/đọc thật qua REST.
- [x] **Trạng thái thiếu và sàng lọc dị ứng:** test phân biệt `not_asked`, `unknown`, `none_reported`, `present` và `no_known_allergy`; lượt sau chưa biết dị ứng không xóa hay đổi câu trả lời của lượt trước.
- [x] **Lịch sử, restart và FHIR trong phạm vi B4A:** hai lượt khám của cùng patient tồn tại độc lập và đọc lại đúng sau restart/recreate backend; parent Consultation Observation đọc được qua FHIR với đúng patient, encounter và `hasMember`. OpenMRS Visit vẫn chỉ đọc qua REST.
- [ ] **ICD-10/Diagnosis:** cần catalogue ICD-10 có nguồn, system URI, phiên bản, tên tiếng Việt và hiệu lực; sau đó nạp/mapping concept và kiểm thử primary/secondary, provisional/confirmed, sửa/void và FHIR Condition. Không dùng free text để giả làm ICD-10.
- [ ] **Allergy chi tiết:** cần catalogue tác nhân, phản ứng, mức độ và quyết định cho dị ứng non-coded; sau đó thống nhất native Allergy/FHIR AllergyIntolerance với Obs sàng lọc. `no_known_allergy` hoặc `unknown` không được tự xóa allergy list cũ.
- [ ] **Đơn thuốc:** cần danh mục thuốc cơ sở cùng dose/quantity units, route, frequency và duration units. Runtime hiện có Drug Order type/care setting nhưng không có Drug hoặc Order Frequency để tạo đơn hợp lệ.
- [ ] **Form và validation adapter:** `forms.json` là handoff spec, chưa phải O3 Form schema. Cần chọn O3 Form hay FE riêng và thêm server-side validation cho điều kiện `present` cần nội dung, trạng thái final, correction/void và provenance.
- [ ] **Provider/cơ sở/quyền production:** fixture dùng bác sĩ synthetic. Số chứng chỉ hành nghề, thông tin cơ sở và quyền bác sĩ thuộc metadata/B5 trước khi xác nhận hoặc in đơn.

Bộ test B4A nằm tại [`test_b4a_consultation.py`](../tests/integration/test_b4a_consultation.py), báo cáo local tại `.runtime/reports/b4a-integration.json`; hợp đồng runtime ở [`consultation.md`](api/consultation.md).

Chỉ định CLS, lịch hẹn, hàng đợi, thu tiền và mẫu in thuộc mốc B8.

**Đạt khi:** kịch bản bác sĩ hoàn thành trên dữ liệu giả; đọc lại toàn bộ lần khám đúng patient/visit/encounter; dữ liệu thuốc và chẩn đoán có đơn vị/mã/trạng thái theo hợp đồng đã chốt.

### Mốc B5 — Xác thực, phân quyền và audit

**Đầu vào:** ma trận quyền được nhóm xác nhận (DATA-04); B2–B4 đủ thao tác để kiểm thử. **Đầu ra:** quyền có hiệu lực tại API.

- [ ] Chốt 8 role theo [CLINIC_WORKFLOW.md](CLINIC_WORKFLOW.md#2-vai-trò): tiếp đón, thu ngân, điều dưỡng, bác sĩ, kỹ thuật viên CLS, dược/quầy thuốc, quản lý phòng khám, quản trị hệ thống. Role được ghép từ privilege; một tài khoản có thể giữ nhiều role. Lập ma trận `role × đọc/tạo/sửa/hủy × loại dữ liệu`. Tài khoản cá nhân; không dùng chung admin cho nghiệp vụ thường ngày. Metadata role/privilege do nhóm metadata và backend phối hợp nạp bằng Initializer hoặc cơ chế phù hợp.
- [ ] Tạo tài khoản thử nghiệm riêng trên instance test, cấp quyền tối thiểu; lưu credential ở cấu hình test an toàn, không commit. Kiểm thử cả thao tác cho phép và bị từ chối qua REST/FHIR. Kiểm tra riêng các ranh giới dễ sai: thu ngân không sửa được nội dung lâm sàng, quản lý xem báo cáo nhưng không đọc chi tiết bệnh án, KTV chỉ thấy chỉ định được giao. Ghi chính xác status và thông điệp runtime; kiểm tra ẩn nút FE chỉ sau khi quyền API đã đúng.
- [ ] Kiểm tra session/login/logout, mật khẩu sai, truy cập chưa đăng nhập, giới hạn truy cập vào location phù hợp. Nếu baseline không thực thi được giới hạn cần thiết, ghi ca tái hiện và phương án mở rộng.
- [ ] Khảo sát log/audit hiện có cho tạo/sửa/void hồ sơ và truy cập hồ sơ; lưu rõ trường nào có người, thời điểm, hành động, dữ liệu trước/sau; phần thiếu phải thành issue có tiêu chí kiểm thử. Đối chiếu yêu cầu nhật ký trong [VIETNAM_COMPLIANCE.md](VIETNAM_COMPLIANCE.md). Không tuyên bố đã có audit truy cập nếu mới thấy audit thay đổi.

**Đạt khi:** ma trận quyền có test backend cho từng role; người không có quyền bị từ chối; dấu vết thay đổi và giới hạn audit được mô tả bằng bằng chứng.

### Mốc B6 — Database, khả năng phục hồi và vận hành

**Đầu vào:** có fixture patient/visit/encounter/obs; B0 baseline. **Đầu ra:** runbook có thể phục hồi một instance test.

Đã có bằng chứng một phần: PostgreSQL dùng UTF8 và hai volume `postgres-data` / `openmrs-pg-data`; một lần dump PostgreSQL và restore sang project chính đã đạt trên dữ liệu giả ([VALIDATION.md](VALIDATION.md)). Mốc này biến kết quả đó thành quy trình lặp lại được.

- [ ] Kiểm tra PostgreSQL và `/openmrs/data` dùng volume bền vững, encoding UTF8, cổng DB/backend không publish ra host, healthcheck/readiness, log và dung lượng. Ghi rõ dữ liệu nào nằm ở DB, dữ liệu nào nằm trong OpenMRS data volume, ví dụ tệp đính kèm nếu chức năng này được dùng.
- [ ] Thiết kế backup nhất quán cho DB (`pg_dump` / `pg_restore`), OpenMRS data volume và bản cấu hình/image tương ứng; ghi lịch, nơi lưu, bảo vệ credential, thời gian lưu và người vận hành. Cách dump/copy cụ thể phải được thử trên **Compose project tách biệt** trước khi đưa vào runbook.
- [ ] Thử restore vào project/volume mới: bệnh nhân, visit, encounter, obs, file đính kèm nếu có phải đọc được qua API; kiểm tra module/version và metadata sau restore; chạy `check_database.py` sau restore. Ghi thời gian phục hồi, sai khác và cách rollback. Restart container chỉ chứng minh persistence, **không** thay thế backup–restore.
- [ ] Tách quyền database trước khi ra ngoài môi trường local: hiện `OMRS_DB_USER` là user khởi tạo của image PostgreSQL và có quyền quản trị cluster. Production cần tài khoản migration/quản trị riêng và tài khoản ứng dụng quyền tối thiểu.
- [ ] Chuẩn bị cấu hình staging/production: HTTPS ở gateway/reverse proxy, secrets ngoài Git, cổng/hostname, giới hạn truy cập, tài khoản quản trị, chính sách backup, log/monitoring và quy trình cập nhật. Compose hiện tại chỉ bind `127.0.0.1` cho local; đưa lên server cần thiết kế riêng và được kiểm chứng.
- [ ] Với thay đổi schema/module/image, ghi kế hoạch nâng cấp có backup trước, thử trên bản sao dữ liệu giả, cách kiểm tra sau nâng cấp và đường lui. Khi nâng phiên bản upstream, xem lại từng bản sửa trong `infra/backend/postgresql/` trước khi giữ hoặc bỏ. Không chạy migration hoặc xóa volume trên instance có dữ liệu cần giữ khi chưa có phương án phục hồi.

**Đạt khi:** có backup và restore kiểm chứng được bằng dữ liệu giả trên môi trường cô lập, runbook ghi lệnh/thứ tự/kết quả; baseline local vẫn pass.

### Mốc B7 — FHIR và khả năng mở rộng liên phòng khám

**Đầu vào:** B2–B5; quyết định định danh và thuật ngữ từ nhóm metadata. **Đầu ra:** bảng mapping có bằng chứng, không triển khai chia sẻ hồ sơ thật trong mốc này.

- [ ] Lập bảng cho Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, ServiceRequest, Location, Practitioner: nguồn OpenMRS, trường FHIR, identifier/mã, đơn vị, thời gian, trạng thái, người/cơ sở tạo, thao tác runtime hỗ trợ và giới hạn. Đối chiếu với cột FHIR trong [DATA_DICTIONARY.md](DATA_DICTIONARY.md).
- [ ] Tạo fixture nhiều lần khám; đối chiếu REST với FHIR trên **cùng UUID** hoặc mapping đã định nghĩa. Kiểm tra thông tin sửa/void, timezone (Asia/Ho_Chi_Minh, trao đổi theo ISO 8601 có offset) và dữ liệu không có. Nếu một resource chưa map đúng, ghi issue và test fail/skip có lý do rõ ràng.
- [ ] Dùng identifier bệnh nhân theo từng cơ sở, facility ID ổn định, mã thuật ngữ có nguồn/phiên bản và provenance phù hợp. Ghi rõ cơ chế MPI/record locator, đồng ý chia sẻ và quyền xem hồ sơ liên cơ sở là quyết định thiết kế của giai đoạn sau (M7).
- [ ] Theo [ADR-0001](decisions/0001-openmrs-openehr.md): OpenMRS là nơi lưu hồ sơ gốc; cột archetype openEHR trong từ điển dữ liệu được giữ khớp với cấu trúc lưu thật (DATA-10); EHRbase chỉ thêm ở tầng sau qua adapter một chiều. FHIR API hiện tại không phải bằng chứng đã đáp ứng openEHR. Nếu mentor đổi quyết định trong ADR, cập nhật mốc này trước khi làm tiếp.

**Đạt khi:** bảng mapping được kiểm tra bằng fixture; nguồn gốc cơ sở và bệnh nhân rõ ràng; giới hạn FHIR được ghi cho FE/nhóm tích hợp.

### Mốc B8 — Vận hành phòng khám (MVP-2)

**Đầu vào:** B3–B5; danh mục dịch vụ và bảng giá mẫu (DATA-09); mẫu giấy tờ từ khảo sát M0; ma trận khả năng của B0. **Đầu ra:** quy trình phòng khám tư chạy trọn trên backend với dữ liệu giả.

- [ ] **Lịch hẹn và hàng đợi:** kiểm thử appointments và queue: đặt lịch, cấp số, hàng đợi theo phòng/bác sĩ, chuyển bước giữa tiếp đón → điều dưỡng → bác sĩ → CLS → thu ngân. Kiểm tra đúng thứ tự và trạng thái khi bệnh nhân bỏ về giữa chừng.
- [ ] **Bảng giá và thu tiền:** đánh giá module billing có đáp ứng danh mục dịch vụ, bảng giá theo cơ sở, thu/hoàn/hủy, trả trước và trả sau hay không. Tiền tệ là VND. Kiểm tra tổng tiền, trạng thái thanh toán và dấu vết người thu. Nếu thiếu, ghi khoảng trống và phương án theo mục 4.
- [ ] **Chỉ định CLS:** kiểm thử tạo chỉ định, gán cho KTV, nhập kết quả số/văn bản hoặc đính kèm file, bác sĩ đọc kết quả. Kết quả phải gắn đúng chỉ định, lượt khám và bệnh nhân. Luồng file đính kèm phải được nghiệm thu riêng, vì [VALIDATION.md](VALIDATION.md#giới-hạn) ghi chưa thử upload/complex obs trên PostgreSQL.
- [ ] **Dữ liệu cho mẫu in:** cung cấp API/dữ liệu đủ cho đơn thuốc, phiếu thu, phiếu chỉ định, phiếu kết quả, giấy hẹn. Thông tin cơ sở và người hành nghề lấy từ cấu hình, không viết cứng. Phối hợp FE-08.
- [ ] **Báo cáo ngày:** số lượt khám và doanh thu theo ngày, khớp dữ liệu giả; role quản lý đọc được báo cáo mà không cần quyền đọc bệnh án.
- [ ] **Biến thể cấu hình:** trả trước/trả sau; có/không có điều dưỡng; có/không có quầy thuốc ([CLINIC_WORKFLOW.md](CLINIC_WORKFLOW.md#các-biến-thể-cần-hỗ-trợ-bằng-cấu-hình)). Mỗi biến thể bật bằng cấu hình, không rẽ nhánh bằng code riêng cho từng phòng khám.
- [ ] **Khung adapter (BE-09):** đề xuất cấu trúc `integrations/` và cách bật/tắt cho BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS, PACS. Chỉ làm khung và hợp đồng (INT-10); adapter thật thuộc M6.

**Đạt khi:** quy trình mục 2.3 của `PROJECT_PLAN.md` chạy trọn trên backend với dữ liệu giả, gồm hàng đợi, thu tiền, CLS và tái khám; ít nhất hai biến thể cấu hình chạy được; tiền và trạng thái thanh toán truy vết được.

### Mốc B9 — Tích hợp, CI và nghiệm thu một phòng khám

**Đầu vào:** B2–B8 và UI/form đủ cho kịch bản. **Đầu ra:** backend của một phòng khám có thể bàn giao để nghiệm thu.

- [ ] Đưa test API nghiệp vụ, quyền, Initializer idempotency, FHIR mapping, MVP-2 và persistence vào CI trên project riêng. CI phải dựng từ image/config trong PR, không dựa vào container có sẵn trên máy lập trình viên. Test có lỗi phải chỉ ra thao tác và dữ liệu synthetic liên quan, không lộ mật khẩu.
- [ ] Chạy kịch bản end to end với FE và metadata cho MVP-1 rồi MVP-2: đăng ký/tìm bệnh nhân, lấy số, thu phí, sinh hiệu, khám, chỉ định CLS, chẩn đoán, kê đơn, in đơn, thu tiền thuốc, kết thúc, xem lại lịch sử. Thử bệnh nhân quay lại, hai người trùng tên, dữ liệu thiếu/sai, người dùng sai quyền, hủy lượt và lỗi API.
- [ ] Chạy lại trên instance sạch, sau restart và sau restore. Bàn giao file cấu hình, phiên bản image/module, cách dựng, API contract, kết quả test, runbook và danh sách giới hạn được chấp nhận.
- [ ] Đánh giá riêng trước khi dùng dữ liệu thật theo [checklist trước pilot](VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật): quyền, audit truy cập, sao lưu, bảo mật triển khai, quy trình vận hành và yêu cầu chuyên môn/pháp lý áp dụng. MVP với dữ liệu giả không tự động trở thành hệ thống production.

**Đạt khi:** một người khác dựng lại và thực hiện trọn kịch bản bằng dữ liệu giả, test CI pass, dữ liệu đọc lại đúng sau restart/restore, các giới hạn còn lại được người phụ trách chấp nhận bằng văn bản.

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
