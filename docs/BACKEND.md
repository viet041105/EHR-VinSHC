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

- [ ] Xác định các identifier type theo [DATA_DICTIONARY.md](DATA_DICTIONARY.md#2-bệnh-nhân-và-định-danh): mã hồ sơ nội bộ của phòng khám (bắt buộc, duy nhất, hệ thống sinh), CCCD và mã BHXH/BHYT (tùy chọn, kiểm tra định dạng). Ghi nơi cấp, quy tắc bắt buộc/duy nhất và cách phát sinh mã. Nếu dùng module ID Generation, kiểm tra hành vi thật trên PostgreSQL trước khi bật trên form/API.
- [ ] Kiểm thử tạo, đọc, cập nhật, tìm theo mã/CCCD/tên, phân trang và các trường tối thiểu. Xác nhận tạo hai bệnh nhân cùng tên vẫn là hai UUID khác nhau; trường hợp nghi trùng được phát hiện/đưa ra quy trình xử lý chứ không tự gộp. Kiểm tra tìm kiếm tên tiếng Việt có dấu.
- [ ] Kiểm tra FHIR `Patient` có đúng identifier, tên, nguồn định danh; ghi các trường REST chưa được map hoặc có khác biệt. Kiểm tra request sai, mã trùng và người dùng không có quyền.
- [ ] Phối hợp metadata/FE để định nghĩa các trường phụ như số điện thoại, người liên hệ và quy tắc thông tin thiếu. Địa chỉ dùng danh mục tỉnh → xã hiện hành qua Address Hierarchy (DATA-08); kiểm tra cảnh báo cấu hình Address Hierarchy còn ghi trong [VALIDATION.md](VALIDATION.md#giới-hạn). Không đặt CCCD làm khóa định danh toàn mạng nếu chưa có chính sách được chốt.

**Đạt khi:** tạo và tìm lại đúng một hồ sơ bằng REST, đọc được cùng UUID/identifier qua FHIR, trường hợp trùng tên và sai quyền có test.

### Mốc B3 — Visit, encounter và sinh hiệu

**Đầu vào:** B1–B2; gói metadata tối thiểu gồm visit type, encounter type, concept sinh hiệu, đơn vị và UUID ổn định. **Đầu ra:** một lượt khám có sinh hiệu đọc lại được.

- [ ] Kiểm tra Initializer nạp gói metadata trên database mới, chạy lại và sửa một thuộc tính không tạo bản ghi trùng. Nếu người metadata chưa bàn giao đủ, tiếp tục B1/B2/B6; dùng metadata synthetic riêng trong instance test khi cần khảo sát API.
- [ ] Kiểm thử mở visit cho đúng patient/location/type, đọc lại, gắn encounter vào visit, ghi provider và thời gian nghiệp vụ. Kiểm tra dữ liệu patient A không thể bị gắn nhầm visit/encounter của patient B.
- [ ] Ghi obs sinh hiệu qua API được runtime hỗ trợ; xác minh concept, value, unit, thời điểm, người ghi, patient, visit và encounter. Kiểm tra thiếu dữ liệu, giá trị sai kiểu/ngoài quy tắc đã chốt và xử lý cập nhật/void theo hành vi OpenMRS. Smoke hiện đã có một obs số (36.7 degC); mốc này mở rộng thành bộ sinh hiệu đã chốt.
- [ ] Kết thúc visit, đọc lại lịch sử trên REST và FHIR `Encounter`/`Observation` trong phạm vi API công bố. Phân biệt `Visit` của OpenMRS và `Encounter` trong FHIR; lập mapping thật từ dữ liệu fixture, không giả định tên giống nhau là tương đương.

**Đạt khi:** fixture `patient → visit → vitals encounter → obs` đọc lại chính xác sau restart; lỗi liên kết sai patient hoặc sai metadata được test; tài liệu API/FE dùng đúng UUID đã nạp.

### Mốc B4 — Khám bác sĩ, dị ứng, chẩn đoán và đơn thuốc

**Đầu vào:** B3; từ điển dữ liệu khám, concept, thuốc/đơn vị và quyết định workflow từ nhóm metadata/FE. **Đầu ra:** bác sĩ có thể ghi và xem lại một lần khám hoàn chỉnh.

- [ ] Xác định dữ liệu nào là obs/form, diagnosis/condition, allergy, order/medication; ghi rõ liên hệ với encounter và trạng thái bản ghi. Cùng nhóm metadata chốt sự khác nhau giữa `chưa hỏi`, `không có`, `không biết` cho dị ứng/tiền sử.
- [ ] Kiểm thử lưu/mở lại triệu chứng, khám, chẩn đoán ICD-10 (chính, kèm theo, mức độ chắc chắn), dị ứng và lời dặn theo form đã chốt; tránh mất dữ liệu khi chỉnh sửa hoặc khi bệnh nhân tái khám.
- [ ] Kiểm thử kê đơn với danh mục thuốc, liều, đơn vị, đường dùng, tần suất, số ngày, số lượng và trạng thái. Đơn phải đủ dữ liệu cho mẫu in theo [VIETNAM_COMPLIANCE.md](VIETNAM_COMPLIANCE.md#2-yêu-cầu-thiết-kế-rút-ra), gồm thông tin người kê đơn (số chứng chỉ hành nghề) và cơ sở. Xác minh API REST và FHIR cho **đúng** thao tác cần dùng; `CapabilityStatement` là điểm bắt đầu, còn create/update/read phải được test trên fixture thật. Nếu FHIR chỉ hỗ trợ đọc cho nghiệp vụ đó, ghi giới hạn và dùng REST phù hợp cho FE.
- [ ] Đối chiếu lần khám thứ hai của cùng bệnh nhân: hồ sơ cũ vẫn đọc được, dữ liệu mới không ghi đè hoặc đổi nguồn gốc bản ghi cũ.

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
