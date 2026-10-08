# Lộ trình hoàn thiện backend VinSHC cho một phòng khám

Tài liệu này là backlog thực thi cho người hoặc agent phụ trách backend. Đích của giai đoạn này là một phòng khám ngoại trú có thể đăng ký bệnh nhân, tiếp nhận, ghi sinh hiệu, khám, chẩn đoán, kê đơn trong phạm vi đã chốt, kết thúc lượt khám và xem lại lịch sử trên cùng một hệ thống. Việc chia sẻ hồ sơ giữa các phòng khám là giai đoạn sau; giai đoạn này chỉ chuẩn bị định danh, nguồn gốc dữ liệu và khả năng xuất dữ liệu cần thiết.

Phạm vi lâm sàng, danh mục thuốc, quy tắc chuyên môn và ma trận quyền cuối cùng phải được nhóm nghiệp vụ/metadata xác nhận. Không coi một màn hình hoặc module đã cài là bằng chứng nghiệp vụ đã hoàn thành; mỗi luồng phải được kiểm tra trên backend đang chạy với dữ liệu giả.

## 1. Điểm xuất phát và nguồn sự thật

| Thành phần | Hiện trạng trong repo | Việc còn thiếu |
| --- | --- | --- |
| Runtime | OpenMRS Reference Application 3.7.1, MariaDB 10.11.19; image được khóa trong [`config/baseline.json`](../config/baseline.json) | Kiểm chứng từng nghiệp vụ trên đúng phiên bản này |
| Docker | [`compose.yaml`](../compose.yaml) có `db`, `backend`, `frontend`, `gateway`; [`infra/backend/Dockerfile`](../infra/backend/Dockerfile) mở rộng image backend đã biên dịch | Tích hợp module tùy biến nếu có nhu cầu thực sự; phương án triển khai ngoài máy local |
| Cấu hình OpenMRS | [`infra/backend/configuration/`](../infra/backend/configuration/) hiện chỉ thêm location giả VinSHC | Nhận và nạp metadata nghiệp vụ theo từng gói |
| Kiểm thử | [`scripts/smoke.py`](../scripts/smoke.py) kiểm tra readiness, login, REST/FHIR, location và bệnh nhân giả; [`tests/test_tooling.py`](../tests/test_tooling.py) kiểm tra công cụ; [CI](../.github/workflows/ci.yml) chạy trên instance tạm | Kiểm thử luồng khám, quyền, dữ liệu lâm sàng, backup–restore |
| Tài liệu | [`DEVELOPMENT.md`](DEVELOPMENT.md), [`CI.md`](CI.md), [`PROJECT_PLAN.md`](../PROJECT_PLAN.md) | Hợp đồng API, ma trận khả năng, runbook vận hành |

Mã trong các repo `sources/` không tham gia build hiện tại. Đây là bản phân phối OpenMRS dùng image upstream. Mọi thay đổi Java phải có bước build artifact và đưa artifact vào Docker image/CI được kiểm chứng riêng.

### Quy tắc làm việc cho agent nhận nhiệm vụ

1. Đọc tài liệu này, `PROJECT_PLAN.md` mục BE/INT/DATA, `DEVELOPMENT.md`, `CI.md`, `compose.yaml`, `config/baseline.json` và các script/test liên quan. Kiểm tra `git status` trước khi sửa; giữ nguyên thay đổi của người khác.
2. Chọn **một hạng mục có đầu ra kiểm chứng được** trong các mốc dưới đây. Ghi trạng thái `chưa làm / đang làm / đạt / bị chặn`, bằng chứng và phần phụ thuộc trong issue hoặc PR. Không đánh dấu đạt chỉ vì endpoint trả HTTP 200.
3. Mọi test ghi dữ liệu dùng **bệnh nhân giả** và instance local/CI riêng. Test không được xóa hoặc reset volume đang dùng. Khi cần kiểm tra trên database sạch, tạo Compose project tách biệt và xác nhận đúng project/volume trước khi dọn.
4. Không ghi mật khẩu, token, `.env`, database dump hoặc dữ liệu bệnh nhân thật vào Git, log báo cáo hay artifact CI. Không cho frontend kết nối trực tiếp MariaDB và không viết SQL thay cho OpenMRS API/service để tạo hồ sơ.
5. Khi đổi image/module, cập nhật đồng thời `compose.yaml`, Dockerfile, `config/baseline.json`, tài liệu phiên bản và test tương ứng. Khi đổi UUID, API hoặc cấu trúc dữ liệu, phối hợp ngay với FE, metadata và người làm tích hợp.
6. Mỗi PR nêu: mục tiêu, file đổi, cách chạy, kết quả thực tế, phụ thuộc metadata, rủi ro và việc chưa đạt. Chỉ sửa OpenMRS Core/module upstream khi đã có ca nghiệp vụ tái hiện được và quyết định kỹ thuật được ghi lại.

## 2. Ranh giới công việc và bàn giao giữa các nhóm

Backend chịu trách nhiệm cách dữ liệu đi qua OpenMRS, quyền, API, tích hợp module, build/runtime, bảo mật kỹ thuật, kiểm thử backend và khả năng phục hồi. OpenMRS sở hữu schema MariaDB; không có đầu việc tự thiết kế lại bảng `patient`, `visit`, `encounter`, `obs`.

| Đầu vào từ nhóm khác | Backend cần làm ngay khi nhận | Có thể làm trước khi nhận? |
| --- | --- | --- |
| Luồng ngoại trú và ma trận vai trò đã chốt | Biến thành hợp đồng API và test quyền | Có: khảo sát API và lập bản nháp |
| Patient identifier type, location, visit type, encounter type và UUID ổn định | Kiểm tra Initializer nạp đúng; dùng trong test tạo patient/visit/encounter | Có: viết test/harness và xác định request mẫu bằng metadata synthetic **thực sự tồn tại** trong instance test |
| Concept sinh hiệu và quy tắc đơn vị/giá trị | Kiểm tra obs gắn đúng patient, visit, encounter; REST/FHIR mapping; validation | Có: khảo sát khả năng `obs`, chưa thể nghiệm thu dữ liệu sinh hiệu cuối cùng |
| Concept khám, chẩn đoán, dị ứng, danh mục thuốc/form | Kiểm tra ghi, đọc lại, quyền, trạng thái, lịch sử và FHIR tương ứng | Có: khảo sát endpoint/capability, ghi rõ giới hạn |
| Giao diện/luồng FE | Kiểm tra request thực tế, xử lý lỗi, quyền và liên kết dữ liệu | Có: cung cấp API contract và fixture giả cho FE |

Metadata cần hiểu mô hình `Patient → Visit → Encounter → Observation/Diagnosis/Order`, kiểu concept, đơn vị, UUID và cách nạp qua Initializer; không cần thao tác trực tiếp trên bảng MariaDB. Backend không hardcode UUID lâm sàng rải rác trong code. UUID chuẩn thuộc file metadata được version hóa; mọi mapping cho test hoặc module phải đọc từ một nơi được kiểm tra khớp với metadata đã nạp. UUID placeholder chỉ dùng trong tài liệu, không dùng trong integration test.

## 3. Trình tự thực hiện

Các mốc sau theo thứ tự phụ thuộc. Công việc trong cùng mốc có thể làm song song khi hợp đồng đã thống nhất. Mỗi mốc kết thúc bằng một PR hoặc một nhóm PR nhỏ; cập nhật tài liệu này khi quyết định kỹ thuật thay đổi.

### Mốc B0 — Khóa phạm vi và chứng minh baseline

**Đầu vào:** repo hiện tại và `PROJECT_PLAN.md`. **Đầu ra:** bảng phạm vi MVP, danh sách module/version đang chạy, báo cáo baseline lặp lại được.

- [ ] Chốt với nhóm luồng bắt buộc: đăng nhập → tìm/tạo bệnh nhân → mở visit → ghi sinh hiệu → bác sĩ khám/chẩn đoán/kê đơn → kết thúc visit → xem lại lịch sử. Ghi riêng các mục tùy chọn như lịch hẹn, queue, billing, xét nghiệm, kho, in phiếu. Mỗi mục tùy chọn phải có quyết định `trong MVP / sau MVP`.
- [ ] Chạy `check_config.py`, unit test, `docker compose up -d --wait`, `smoke.py`; lưu phiên bản và kết quả ở issue/PR, không ghi credential. Kiểm tra `/ws/rest/v1/module` và `/ws/fhir2/R4/metadata` trên chính instance đó; ghi module **started**, resource và interaction được công bố.
- [ ] Tạo ma trận `nghiệp vụ → module/API hiện có → metadata cần → mức đã thử → khoảng trống` trong `docs/api/capabilities.md`. Phân biệt `có module`, `API trả dữ liệu`, `luồng nghiệp vụ đã qua test`.
- [ ] Ghi quyết định nền tảng nào có thể dùng nguyên, phần nào cần cấu hình, phần nào cần code; không clone/sửa module chỉ vì source có sẵn.

**Đạt khi:** một thành viên khác dựng lại stack theo `DEVELOPMENT.md`, smoke pass; ma trận ghi rõ các giới hạn chưa thử. Baseline không đồng nghĩa đã nghiệm thu nghiệp vụ phòng khám.

### Mốc B1 — Hợp đồng API và bộ kiểm thử tích hợp

**Đầu vào:** B0. **Đầu ra:** tài liệu API có request/response thật và test client dùng chung.

- [ ] Tạo `docs/api/` cho session/auth, patient/identifier, visit, encounter/obs, diagnosis/allergy, medication/order, error handling và FHIR mapping. Với mỗi thao tác ghi method/path đã kiểm chứng, request/response mẫu đã ẩn dữ liệu nhạy cảm, status/lỗi, privilege, nguồn UUID, phân trang/tìm kiếm và hậu điều kiện trong DB qua API. Đừng đoán request schema từ tên endpoint.
- [ ] Tách hoặc tái sử dụng HTTP client an toàn trong `scripts/smoke.py`: chỉ gọi loopback/instance test, không theo redirect ra ngoài, phân biệt JSON với HTML login page, báo lỗi có ngữ cảnh nhưng không in credential. Giữ smoke test nhanh; đặt test nghiệp vụ trong `tests/integration/` hoặc cấu trúc tương đương và có lệnh chạy riêng.
- [ ] Tạo helper fixture sinh mã duy nhất, lưu UUID để đọc lại, kiểm tra dữ liệu tồn tại trước khi tái sử dụng. Test phải độc lập hoặc có thứ tự setup/teardown rõ ràng; không dùng admin fixture chung như dữ liệu sản phẩm.
- [ ] Thống nhất với FE hợp đồng API đầu tiên: tạo/tìm bệnh nhân, mở/kết thúc visit, đọc lịch sử; có ví dụ lỗi 400/401/403/404 phù hợp hành vi runtime.

**Đạt khi:** tài liệu khớp các response thực tế; test chạy lặp lại trên instance tách biệt mà không tạo bệnh nhân trùng ngoài dự kiến.

### Mốc B2 — Bệnh nhân và định danh

**Đầu vào:** B1 và quy ước identifier từ nhóm metadata. **Đầu ra:** luồng patient được kiểm thử và bàn giao cho FE.

- [ ] Xác định mã hồ sơ nội bộ của **một** phòng khám, identifier type, nơi cấp mã, quy tắc bắt buộc/duy nhất và cách phát sinh mã. Nếu dùng module ID Generation, kiểm tra hành vi thật trước khi bật trên form/API.
- [ ] Kiểm thử tạo, đọc, cập nhật, tìm theo mã/tên, phân trang và các trường tối thiểu. Xác nhận tạo hai bệnh nhân cùng tên vẫn là hai UUID khác nhau; trường hợp nghi trùng được phát hiện/đưa ra quy trình xử lý chứ không tự gộp.
- [ ] Kiểm tra FHIR `Patient` có đúng identifier, tên, nguồn định danh; ghi các trường REST chưa được map hoặc có khác biệt. Kiểm tra request sai, mã trùng và người dùng không có quyền.
- [ ] Phối hợp metadata/FE để định nghĩa các trường phụ như số điện thoại, địa chỉ, người liên hệ và quy tắc thông tin thiếu. Không đặt CCCD làm khóa định danh toàn mạng nếu chưa có chính sách được chốt.

**Đạt khi:** tạo và tìm lại đúng một hồ sơ bằng REST, đọc được cùng UUID/identifier qua FHIR, trường hợp trùng tên và sai quyền có test.

### Mốc B3 — Visit, encounter và sinh hiệu

**Đầu vào:** B1–B2; gói metadata tối thiểu gồm visit type, encounter type, concept sinh hiệu, đơn vị và UUID ổn định. **Đầu ra:** một lượt khám có sinh hiệu đọc lại được.

- [ ] Kiểm tra Initializer nạp gói metadata trên database mới, chạy lại và sửa một thuộc tính không tạo bản ghi trùng. Nếu người metadata chưa bàn giao đủ, tiếp tục B1/B2/B6; dùng metadata synthetic riêng trong instance test khi cần khảo sát API.
- [ ] Kiểm thử mở visit cho đúng patient/location/type, đọc lại, gắn encounter vào visit, ghi provider và thời gian nghiệp vụ. Kiểm tra dữ liệu patient A không thể bị gắn nhầm visit/encounter của patient B.
- [ ] Ghi obs sinh hiệu qua API được runtime hỗ trợ; xác minh concept, value, unit, thời điểm, người ghi, patient, visit và encounter. Kiểm tra thiếu dữ liệu, giá trị sai kiểu/ngoài quy tắc đã chốt và xử lý cập nhật/void theo hành vi OpenMRS.
- [ ] Kết thúc visit, đọc lại lịch sử trên REST và FHIR `Encounter`/`Observation` trong phạm vi API công bố. Phân biệt `Visit` của OpenMRS và `Encounter` trong FHIR; lập mapping thật từ dữ liệu fixture, không giả định tên giống nhau là tương đương.

**Đạt khi:** fixture `patient → visit → vitals encounter → obs` đọc lại chính xác sau restart; lỗi liên kết sai patient hoặc sai metadata được test; tài liệu API/FE dùng đúng UUID đã nạp.

### Mốc B4 — Khám bác sĩ, dị ứng, chẩn đoán và đơn thuốc

**Đầu vào:** B3; từ điển dữ liệu khám, concept, thuốc/đơn vị và quyết định workflow từ nhóm metadata/FE. **Đầu ra:** bác sĩ có thể ghi và xem lại một lần khám hoàn chỉnh.

- [ ] Xác định dữ liệu nào là obs/form, diagnosis/condition, allergy, order/medication; ghi rõ liên hệ với encounter và trạng thái bản ghi. Cùng nhóm metadata chốt sự khác nhau giữa `chưa hỏi`, `không có`, `không biết` cho dị ứng/tiền sử.
- [ ] Kiểm thử lưu/mở lại triệu chứng, khám, chẩn đoán, dị ứng và lời dặn theo form đã chốt; tránh mất dữ liệu khi chỉnh sửa hoặc khi bệnh nhân tái khám.
- [ ] Kiểm thử kê đơn với danh mục thuốc, liều, đơn vị, đường dùng, tần suất, số ngày, số lượng và trạng thái. Xác minh API REST và FHIR cho **đúng** thao tác cần dùng; `CapabilityStatement` là điểm bắt đầu, còn create/update/read phải được test trên fixture thật. Nếu FHIR chỉ hỗ trợ đọc cho nghiệp vụ đó, ghi giới hạn và dùng REST phù hợp cho FE.
- [ ] Kiểm tra chỉ định xét nghiệm, lịch hẹn, queue, in phiếu, billing/kho **chỉ nếu** đã vào phạm vi MVP. Mỗi luồng cần trạng thái, API, quyền, metadata, test và quyết định bàn giao riêng.
- [ ] Đối chiếu lần khám thứ hai của cùng bệnh nhân: hồ sơ cũ vẫn đọc được, dữ liệu mới không ghi đè hoặc đổi nguồn gốc bản ghi cũ.

**Đạt khi:** kịch bản bác sĩ hoàn thành trên dữ liệu giả; đọc lại toàn bộ lần khám đúng patient/visit/encounter; dữ liệu thuốc và chẩn đoán có đơn vị/mã/trạng thái theo hợp đồng đã chốt.

### Mốc B5 — Xác thực, phân quyền và audit

**Đầu vào:** ma trận quyền được nhóm xác nhận; B2–B4 đủ thao tác để kiểm thử. **Đầu ra:** quyền có hiệu lực tại API.

- [ ] Chốt các vai trò lễ tân, điều dưỡng, bác sĩ, quản trị và ma trận `vai trò × đọc/tạo/sửa/hủy × loại dữ liệu`. Tài khoản cá nhân; không dùng chung admin cho nghiệp vụ thường ngày. Metadata role/privilege do nhóm metadata và backend phối hợp nạp bằng Initializer hoặc cơ chế phù hợp.
- [ ] Tạo tài khoản thử nghiệm riêng trên instance test, cấp quyền tối thiểu; lưu credential ở cấu hình test an toàn, không commit. Kiểm thử cả thao tác cho phép và bị từ chối qua REST/FHIR. Ghi chính xác status và thông điệp runtime; kiểm tra ẩn nút FE chỉ sau khi quyền API đã đúng.
- [ ] Kiểm tra session/login/logout, mật khẩu sai, truy cập chưa đăng nhập, giới hạn truy cập vào location phù hợp. Nếu baseline không thực thi được giới hạn cần thiết, ghi ca tái hiện và phương án mở rộng.
- [ ] Khảo sát log/audit hiện có cho tạo/sửa/void hồ sơ và truy cập hồ sơ; lưu rõ trường nào có người, thời điểm, hành động, dữ liệu trước/sau; phần thiếu phải thành issue có tiêu chí kiểm thử. Không tuyên bố đã có audit truy cập nếu mới thấy audit thay đổi.

**Đạt khi:** ma trận quyền có test backend cho từng vai trò chính; người không có quyền bị từ chối; dấu vết thay đổi và giới hạn audit được mô tả bằng bằng chứng.

### Mốc B6 — Database, khả năng phục hồi và vận hành

**Đầu vào:** có fixture patient/visit/encounter/obs; B0 baseline. **Đầu ra:** runbook có thể phục hồi một instance test.

- [ ] Kiểm tra MariaDB và `/openmrs/data` dùng volume bền vững, `utf8mb4`, cổng DB/backend không publish ra host, healthcheck/readiness, log và dung lượng. Ghi rõ dữ liệu nào nằm ở DB, dữ liệu nào nằm trong OpenMRS data volume, ví dụ tệp đính kèm nếu chức năng này được dùng.
- [ ] Thiết kế backup nhất quán cho DB, OpenMRS data volume và bản cấu hình/image tương ứng; ghi lịch, nơi lưu, bảo vệ credential, thời gian lưu và người vận hành. Cách dump/copy cụ thể phải được thử trên **Compose project tách biệt** trước khi đưa vào runbook.
- [ ] Thử restore vào project/volume mới: bệnh nhân, visit, encounter, obs, file đính kèm nếu có phải đọc được qua API; kiểm tra module/version và metadata sau restore. Ghi thời gian phục hồi, sai khác và cách rollback. Restart container chỉ chứng minh persistence, **không** thay thế backup–restore.
- [ ] Chuẩn bị cấu hình staging/production: HTTPS ở gateway/reverse proxy, secrets ngoài Git, cổng/hostname, giới hạn truy cập, tài khoản quản trị, chính sách backup, log/monitoring và quy trình cập nhật. Compose hiện tại chỉ bind `127.0.0.1` cho local; đưa lên server cần thiết kế riêng và được kiểm chứng.
- [ ] Với thay đổi schema/module/image, ghi kế hoạch nâng cấp có backup trước, thử trên bản sao dữ liệu giả, cách kiểm tra sau nâng cấp và đường lui. Không chạy migration hoặc xóa volume trên instance có dữ liệu cần giữ khi chưa có phương án phục hồi.

**Đạt khi:** có backup và restore kiểm chứng được bằng dữ liệu giả trên môi trường cô lập, runbook ghi lệnh/thứ tự/kết quả; baseline local vẫn pass.

### Mốc B7 — FHIR và khả năng mở rộng liên phòng khám

**Đầu vào:** B2–B5; quyết định định danh và thuật ngữ từ nhóm metadata. **Đầu ra:** bảng mapping có bằng chứng, không triển khai chia sẻ hồ sơ thật trong mốc này.

- [ ] Lập bảng cho Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, Location, Practitioner: nguồn OpenMRS, trường FHIR, identifier/mã, đơn vị, thời gian, trạng thái, người/cơ sở tạo, thao tác runtime hỗ trợ và giới hạn.
- [ ] Tạo fixture nhiều lần khám; đối chiếu REST với FHIR trên **cùng UUID** hoặc mapping đã định nghĩa. Kiểm tra thông tin sửa/void, timezone và dữ liệu không có. Nếu một resource chưa map đúng, ghi issue và test fail/skip có lý do rõ ràng.
- [ ] Dùng identifier bệnh nhân theo từng cơ sở, facility ID ổn định, mã thuật ngữ có nguồn/phiên bản và provenance phù hợp. Ghi rõ cơ chế MPI/record locator, đồng ý chia sẻ và quyền xem hồ sơ liên cơ sở là quyết định thiết kế của giai đoạn sau.
- [ ] Nếu yêu cầu openEHR là bắt buộc, cập nhật phạm vi và làm thiết kế/POC riêng theo `PROJECT_PLAN.md`; FHIR API hiện tại không phải bằng chứng đã đáp ứng openEHR.

**Đạt khi:** bảng mapping được kiểm tra bằng fixture; nguồn gốc cơ sở và bệnh nhân rõ ràng; giới hạn FHIR được ghi cho FE/nhóm tích hợp.

### Mốc B8 — Tích hợp, CI và nghiệm thu một phòng khám

**Đầu vào:** B2–B7 và UI/form đủ cho kịch bản. **Đầu ra:** backend của một phòng khám có thể bàn giao để nghiệm thu.

- [ ] Đưa test API nghiệp vụ, quyền, Initializer idempotency, FHIR mapping và persistence vào CI trên project riêng. CI phải dựng từ image/config trong PR, không dựa vào container có sẵn trên máy lập trình viên. Test có lỗi phải chỉ ra thao tác và dữ liệu synthetic liên quan, không lộ mật khẩu.
- [ ] Chạy kịch bản end to end với FE và metadata: đăng ký/tìm bệnh nhân, mở visit, sinh hiệu, khám, chẩn đoán, kê đơn, kết thúc, xem lại lịch sử. Thử bệnh nhân quay lại, hai người trùng tên, dữ liệu thiếu/sai, người dùng sai quyền và lỗi API.
- [ ] Chạy lại trên instance sạch, sau restart và sau restore. Bàn giao file cấu hình, phiên bản image/module, cách dựng, API contract, kết quả test, runbook và danh sách giới hạn được chấp nhận.
- [ ] Đánh giá riêng trước khi dùng dữ liệu thật: quyền, audit truy cập, sao lưu, bảo mật triển khai, quy trình vận hành và yêu cầu chuyên môn/pháp lý áp dụng. MVP với dữ liệu giả không tự động trở thành hệ thống production.

**Đạt khi:** một người khác dựng lại và thực hiện trọn kịch bản bằng dữ liệu giả, test CI pass, dữ liệu đọc lại đúng sau restart/restore, các giới hạn còn lại được người phụ trách chấp nhận bằng văn bản.

## 4. Khi nào viết module Java hoặc sửa source upstream?

Mỗi khoảng trống phải có: ca tái hiện, request/response hoặc log, hành vi mong muốn, ảnh hưởng FE/metadata, test thất bại hiện tại và các phương án đã thử. Quyết định theo thứ tự:

1. Dùng API/metadata/configuration đã có nếu đáp ứng được và có test chứng minh.
2. Cấu hình hoặc thêm module OpenMRS tương thích với baseline, khóa phiên bản, kiểm tra phụ thuộc và dữ liệu.
3. Viết module VinSHC riêng khi cần logic nghiệp vụ hoặc API đặc thù. Đặt source do nhóm sở hữu ở `modules/<ten-module>/`; bổ sung Maven build, unit test, kiểm tra tương thích, copy `.omod` vào image, test khởi động và CI.
4. Fork/sửa module upstream khi lỗi hoặc khoảng trống nằm trong module đó và extension riêng không phù hợp. Checkout đúng phiên bản đang chạy, lưu upstream commit, giấy phép, patch và cách cập nhật; thay đúng artifact trong image và kiểm chứng nâng cấp. Sửa Core là lựa chọn có chi phí bảo trì cao, cần quyết định riêng.

Không sửa file trong container đang chạy để coi là kết quả bàn giao. Mọi thay đổi phải tái lập được từ Git và Docker build; phải có test trước/sau cho nghiệp vụ bị ảnh hưởng.

## 5. Lệnh kiểm tra và bằng chứng tối thiểu

Các lệnh dưới đây dùng cho **instance local/test** theo [`DEVELOPMENT.md`](DEVELOPMENT.md); fixture bệnh nhân giả có thể ghi vào DB đang chạy. Trước khi chạy kiểm thử có ghi dữ liệu, xác nhận `COMPOSE_PROJECT_NAME`, cổng và instance đích.

```powershell
python scripts/bootstrap.py
python scripts/check_config.py
python -m unittest discover -s tests -v
docker compose pull --quiet --ignore-buildable
docker compose build --pull backend
docker compose up -d --wait --wait-timeout 1200
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

1. Làm B0: ma trận khả năng runtime và scope MVP đã chốt. Không đổi version baseline trong bước này.
2. Làm B1 và B2: API contract, test client dùng chung, patient/identifier workflow. Đây là phần ít phụ thuộc metadata lâm sàng nhất.
3. Yêu cầu nhóm metadata bàn giao gói nhỏ đầu tiên: identifier type, visit type, encounter type, location, UUID và concept sinh hiệu. Tích hợp B3 ngay khi gói có thể nạp trên DB sạch.
4. Chốt ma trận quyền với cả nhóm, viết test API quyền song song B3/B4.
5. Khi B3–B5 có fixture đủ dữ liệu, thực hiện backup–restore và FHIR mapping; sau đó nối vào CI và nghiệm thu B8.

## 7. Tài liệu tham chiếu

- Nội bộ: [`PROJECT_PLAN.md`](../PROJECT_PLAN.md), [`DEVELOPMENT.md`](DEVELOPMENT.md), [`CI.md`](CI.md), [`VALIDATION.md`](VALIDATION.md), [`config/baseline.json`](../config/baseline.json).
- Upstream: [OpenMRS REST documentation](https://rest.openmrs.org/), [Initializer 2.12.0](https://github.com/mekomsolutions/openmrs-module-initializer/tree/2.12.0), [OpenMRS module development with Docker](https://openmrs.atlassian.net/wiki/spaces/docs/pages/1097891841/Backend+Module+Development+Using+Docker+No+SDK). Luôn đối chiếu tài liệu upstream với phiên bản và hành vi thực tế của instance VinSHC.
