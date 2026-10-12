# Review backend EHR-VinSHC — module `vinshc` 0.3.0

| | |
| --- | --- |
| Commit được review | `873e37d` (Merge PR #11 `clinic-backend`, nhánh `main`) |
| Ngày review | 2026-10-12 |
| Phạm vi | [infra/backend/vinshc-module/](../infra/backend/vinshc-module/) (4 service, 6 controller, Liquibase, config module), [compose.yaml](../compose.yaml), [infra/backend/Dockerfile](../infra/backend/Dockerfile), [scripts/](../scripts/), [tests/](../tests/), [.github/workflows/ci.yml](../.github/workflows/ci.yml) |
| Ngoài phạm vi | Frontend, metadata nghiệp vụ, image upstream OpenMRS/gateway |
| Phương pháp | Đọc toàn bộ ~4.200 dòng Java, đối chiếu với test tích hợp và chạy các test offline. **Chưa chạy runtime** (xem mục 1) |

Mọi nhận định đều kèm `file:line` hoặc output lệnh. Mục nào không kiểm chứng được bằng runtime được ghi rõ **CHƯA VERIFY** kèm lý do — không được hiểu là đã pass.

> **Cập nhật 2026-10-12 (chiều):** mục 1–8 giữ nguyên là bản review của commit `873e37d` (số dòng trỏ vào commit đó). Các lỗi đã được sửa và kiểm chứng runtime; kết quả, bằng chứng trước/sau và phần còn lại nằm ở **[mục 9](#9-kết-quả-khắc-phục)**.

---

## 1. Những gì đã chạy

| Lệnh | Kết quả | Output |
| --- | --- | --- |
| `python -m unittest discover -s tests -v` | **PASS** | `Ran 33 tests in 1.287s — OK` |
| `python tools/metadata.py` | **PASS** | `"status": "PASS (structural)", "b2b3Fixtures": 47, "b4b9Fixtures": 159` |
| `python -m unittest discover -s metadata/tests` | **PASS** | `Ran 65 tests — OK` |
| `python scripts/check_config.py` (Python Windows 3.12.5) | **PASS** | `PASS: pinned upstream images, reviewed backend build, readiness, localhost port and volumes.` |
| `python scripts/check_config.py` (Python MSYS2 3.14.6) | **FAIL** | `PostgreSQL requires the read-only OpenMRS extension initialization directory.` — xem L-11 |
| Build module Java, integration test B1–B9 | **CHƯA VERIFY** | Docker daemon không chạy (`failed to connect to the docker API`), máy review không có `mvn` |
| Trạng thái CI trên GitHub | **CHƯA VERIFY** | `gh` chưa đăng nhập |

Hệ quả: mọi nhận định về hành vi runtime bên dưới là **phân tích tĩnh**, chưa có request/response thật.

---

## 2. Tóm tắt

| Mức | Số lượng | Chủ đề chính |
| --- | --- | --- |
| High | 4 | Thiếu facility scope ở B8, race thanh toán do lệch khóa, bill đã huỷ thành `paid`, nghi vấn rò proxy privilege |
| Medium | 9 | Idempotency replay sai, lịch hẹn chặn toàn cơ sở, sửa kết quả gây 500, race → 500, error contract, timezone, audit, mất lý do huỷ, thiếu index |
| Low | 11 | Endpoint không xác thực, cắt số âm thầm, validate sinh hiệu, Liquibase rollback, config, maintainability |
| Test | 6 | Không có unit test Java, B8 chạy bằng admin, không test cross-facility/đồng thời, assert yếu |

---

## 3. HIGH

### H-1. API B8 (operations) không kiểm tra facility scope → IDOR giữa các cơ sở

- **Bằng chứng:** trong [OperationsService.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java), lời gọi kiểm tra scope duy nhất là [dòng 552](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L552) (`createServiceOrder`). Mọi endpoint khác chỉ gọi `require(resource, action)` ([dòng 1282–1284](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L1282-L1284)) — kiểm tra quyền theo role, không xét bản ghi thuộc cơ sở nào.
- **Endpoint bị ảnh hưởng:** bill, receipt, settle, refund, appointment, queue, service-order transition, result, attachment (kể cả tải nội dung file), document, `reports/daily?facility=` (nhận facility bất kỳ).
- **Kịch bản:** thu ngân có workspace ở cơ sở A, biết UUID bill của cơ sở B → `GET /ws/rest/v1/vinshc/operations/bills/{uuid}` đọc được, và có thể thu/hoàn tiền trên bill đó.
- **Vì sao test chưa bắt được:** metadata chỉ có 1 cơ sở (`len(records) = 1, ['VSHC-DEV']`), test B8 chạy bằng admin.
- **Đề xuất:** với mọi bản ghi B8, suy ra patient/visit/location rồi gọi `requirePatientScope` hoặc `requireEncounterScope` (hoặc so `facility_uuid` với workspace); `dailyReport` chỉ nhận facility của workspace.
- **Runtime:** CHƯA VERIFY.

### H-2. Khóa advisory của bill dùng hai key khác nhau → có thể thu vượt tổng bill

- **Bằng chứng:**
  - `cancelBill`, `receipt` khóa `"bill:" + <bill uuid>`: [dòng 379](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L379), [dòng 393](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L393).
  - `settlePayment`, `refund` khóa `"bill:" + bill_id` (số nguyên): [dòng 429](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L429), [dòng 447](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L447).
  - Hai nhóm thao tác này không chặn nhau.
  - Thêm: `receipt` đọc bill ở [dòng 392](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L392) **trước** khi khóa, rồi dùng `status` cũ để kiểm tra `cancelled` ở [dòng 394](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L394). UUID trong key cũng không được chuẩn hoá (chữ hoa/thường cho ra key khác nhau).
- **Kịch bản:** bill 100.000đ có một khoản chuyển khoản 100.000đ đang `pending`. Cùng lúc: thu tiền mặt 100.000đ + settle khoản pending. Cả hai đọc tổng đã thu = 0 → cả hai thành công → đã thu 200.000đ.
- **Đề xuất:** một hàm `lockBill(billId)` duy nhất; đọc lại bill sau khi khóa (hoặc `SELECT … FOR UPDATE`).
- **Runtime:** CHƯA VERIFY (cần test đồng thời).

### H-3. Settle khoản `pending` trên bill đã huỷ làm bill thành `paid` (lỗi tất định)

- **Bằng chứng:**
  - `cancelBill` chỉ chặn khi đã có khoản **settled**, bỏ qua khoản pending: [dòng 380](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L380).
  - `settlePayment` không kiểm tra bill bị huỷ: [dòng 426–439](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L426-L439).
  - `recalculateBill` ghi đè `status`: [dòng 523–526](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L523-L526).
- **Tái hiện:** tạo bill → `POST /bills/{uuid}/receipts` với `method=bank_transfer, status=pending` → `POST /bills/{uuid}/cancel` (thành công) → `POST /payments/{uuid}/settle` → bill chuyển `cancelled` → `paid`.
- **Đề xuất:** chặn huỷ bill khi còn khoản pending (hoặc huỷ luôn các khoản đó); `settlePayment` từ chối khi bill `cancelled`; `recalculateBill` không ghi đè `cancelled`.
- **Runtime:** CHƯA VERIFY.

### H-4. (Nghi vấn) Proxy privilege có thể lọt sang request Core REST chạy song song

- **Bằng chứng:** [ScopedCorePrivilegeInterceptor.java:16–29](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/ScopedCorePrivilegeInterceptor.java#L16-L29) thêm 32 proxy privilege (gồm `Get Patients`, `Add Orders`, `Delete Observations`…) vào `UserContext` trong suốt request `/rest/v1/vinshc/**`, gỡ ra ở `afterCompletion`.
- **Giả định chưa kiểm chứng:** theo hiểu biết về OpenMRS, `UserContext` được lưu trong HTTP session và dùng chung cho các request đồng thời của cùng session. Chưa đối chiếu với mã nguồn OpenMRS trong repo này.
- **Kịch bản nếu giả định đúng:** user app-role gửi một request `/vinshc/...` chậm, đồng thời gọi `GET /ws/rest/v1/patient?q=…` bằng cùng cookie → request Core thấy proxy privilege và vượt qua chốt chặn mà [test_b5_authorization.py:155](../tests/integration/test_b5_authorization.py#L155) khẳng định. Test hiện tại dùng Basic auth tuần tự ([scripts/api_client.py:44](../scripts/api_client.py#L44)) nên không phát hiện được.
- **Đề xuất:** dùng `Daemon`/`Context.addProxyPrivilege` trong phạm vi hẹp quanh từng lời gọi service Core thay vì cả request; hoặc thêm test 2 luồng cùng session.
- **Runtime:** CHƯA VERIFY.

---

## 4. MEDIUM

### M-1. Replay idempotency key của receipt/refund sau khi thu đủ trả 409

Kiểm tra số dư chạy trước khi tra replay: receipt [dòng 405](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L405) trước [dòng 408](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L408); refund [dòng 452](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L452) trước [dòng 455](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L455). Client timeout rồi gửi lại receipt trả đủ tiền → nhận `payment exceeds outstanding bill balance` thay vì kết quả cũ. Test chỉ có replay cho appointment ([test_b8_operations.py:111](../tests/integration/test_b8_operations.py#L111)). **Đề xuất:** tra replay ngay sau validate đầu vào, trước kiểm tra số dư. Runtime: CHƯA VERIFY.

### M-2. Kiểm tra trùng lịch hẹn tính trên toàn cơ sở

Điều kiện `(provider_id=? OR facility_location_id=?)` ở [dòng 146–151](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L146-L151): mọi lịch hẹn cùng cơ sở chồng giờ đều bị chặn. Hai bác sĩ khác nhau đặt cùng khung 9h → người sau nhận 409. Test chỉ thử cùng provider ([test_b8_operations.py:113](../tests/integration/test_b8_operations.py#L113)). Index `ix_vinshc_appointment_slot` cũng khó được dùng với điều kiện `OR` này. **Đề xuất:** xác nhận nghiệp vụ; nếu đúng là trùng theo bác sĩ/phòng thì bỏ vế facility. Runtime: CHƯA VERIFY.

### M-3. Sửa một kết quả đã có bản sửa mới hơn gây 500

`correctResult` ([dòng 647–656](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L647-L656)) không kiểm tra `old` có phải bản mới nhất, trong khi DB có unique `(service_order_id, version_number)` ([liquibase.xml:247](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L247)). Sửa v1 → v2; sửa v1 lần nữa → lại insert v2 → DuplicateKey → 500. **Đề xuất:** chỉ cho sửa bản mới nhất (trả 409), khóa theo service order. Runtime: CHƯA VERIFY.

### M-4. Race condition → 500 thay vì 409; có thể có 2 chẩn đoán chính

Kiểu "kiểm tra rồi insert", chỉ ràng buộc DB làm chốt cuối, mà `DataIntegrityViolationException` không được map trong [BaseVinshcController.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/BaseVinshcController.java):

- Contact: [VinshcService.java:150–155](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/VinshcService.java#L150-L155) (partial unique index ở [liquibase.xml:32–34](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L32-L34)).
- Finalize: [ClinicalService.java:231–242](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L231-L242) (unique index [liquibase.xml:103](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L103)).
- `createResult` ([dòng 641–644](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L641-L644)) và mọi insert idempotency key (bill, payment, queue, service order).
- Chẩn đoán chính: kiểm tra ở [ClinicalService.java:498](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L498) **không có** ràng buộc DB → hai request `rank=primary` đồng thời đều thành công.

**Đề xuất:** map lỗi vi phạm ràng buộc thành 409; khóa advisory theo encounter khi ghi chẩn đoán. Runtime: CHƯA VERIFY.

### M-5. Error contract và logging

- Chưa đăng nhập trả **403** thay vì 401: [AuthorizationService.java:253](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L253) ném `APIAuthenticationException`, [BaseVinshcController.java:34–40](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/BaseVinshcController.java#L34-L40) luôn trả 403.
- Map exception quá rộng: mọi `IllegalStateException` → 503, mọi `IllegalArgumentException` → 400, kèm `getMessage()` ([BaseVinshcController.java:24–46](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/BaseVinshcController.java#L24-L46)). Lỗi nội bộ của Hibernate/Spring cùng kiểu sẽ thành 503/400 và lộ message.
- `discontinue` bắt mọi `Exception` → 400 ([ClinicalService.java:816–821](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L816-L821)), che cả lỗi quyền và lỗi DB.
- **Module không có dòng log nào:** `grep -i "logger|LogFactory|log.(info|warn|error|debug)"` trên module → `0`. Các handler không log, nên lỗi 503/400 không để lại stack trace trên server.
- Response của exception không được map (vd. vi phạm ràng buộc DB): CHƯA VERIFY — chưa xác định được OpenMRS trả gì (có lộ stack trace hay không).

**Đề xuất:** exception riêng cho từng loại lỗi nghiệp vụ; 401 khi chưa xác thực; handler fallback trả 500 với thông điệp chung và log đầy đủ.

### M-6. Lệch múi giờ ở ngày tái khám

Lưu và validate dùng `ZoneId.systemDefault()` ([ClinicalService.java:350](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L350), [dòng 1130](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L1130)); serialize dùng `Asia/Ho_Chi_Minh` ([dòng 1126](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L1126)). Dockerfile và compose không đặt `TZ` (grep `TZ|user.timezone|Asia/Ho_Chi_Minh` → rỗng). Nếu JVM chạy UTC: lượt khám 06:00 ngày 12/10 (+07) bị coi là ngày 11/10 → ngày tái khám 11/10 vẫn được nhận; restore sang máy khác TZ có thể làm lệch ngày đã lưu. Test hiện chỉ thử "hôm qua" ([test_b4b_clinical.py:202](../tests/integration/test_b4b_clinical.py#L202)). **Đề xuất:** dùng `CLINIC_ZONE` thống nhất. Runtime: CHƯA VERIFY (chưa biết TZ thực của container).

### M-7. Endpoint audit bỏ qua bộ lọc khi UUID không tồn tại, không phân trang

[AuthorizationService.java:209–215](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L209-L215): UUID không tìm thấy → biến `null` → bộ lọc bị bỏ → `audit?patient=<uuid-sai>` trả **toàn bộ** audit log, không `LIMIT`. **Đề xuất:** trả 400/404 khi UUID không tồn tại; thêm phân trang.

### M-8. Lý do huỷ chỉ định dịch vụ bị bắt buộc nhưng không lưu; TestOrder gốc vẫn active

[OperationsService.java:621–632](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L621-L632): `reason` được kiểm tra nhưng không có trong câu `UPDATE`, bảng `vinshc_service_order` cũng không có cột lưu. Khi `cancelled`/`entered-in-error`, TestOrder gốc không bị discontinue/void → FHIR `ServiceRequest` vẫn active. **Đề xuất:** thêm cột/bảng sự kiện lưu lý do; đồng bộ trạng thái order gốc.

### M-9. Thiếu index trên khóa ngoại

PostgreSQL không tự tạo index cho FK. Chưa có index cho `vinshc_payment.bill_id`, `vinshc_payment.original_payment_id`, `vinshc_attachment.result_id`, `vinshc_service_order.patient_id` / `encounter_id` ([liquibase.xml:194–260](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L194-L260)). `aggregatePayments` ([OperationsService.java:537–542](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L537-L542)) chạy 2 lần mỗi lần xem bill → quét toàn bảng khi dữ liệu lớn. Ngoài ra `descendantIds` tải **toàn bộ** location ở mỗi lần kiểm tra scope ([AuthorizationService.java:255](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L255)).

---

## 5. LOW

| # | Vấn đề | Bằng chứng |
| --- | --- | --- |
| L-1 | `GET /operations/configuration` không gọi `require()` → truy cập không xác thực (dữ liệu là metadata test, độ nhạy thấp) | [OperationsService.java:98](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L98) |
| L-2 | `ClinicalService.integer` dùng `intValue()` → `duration: 4294967297` thành 1 ngày, `numRefills: 4294967296` thành 0 | [ClinicalService.java:1110–1114](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L1110-L1114) |
| L-3 | `money()` nhận `BigInteger` rồi `longValue()` → 2^64+100 thành 100đ | [OperationsService.java:1233–1236](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L1233-L1236) |
| L-4 | Nhiệt độ không có giới hạn (chỉ kiểm tra `>0` cho một số chỉ số và SpO2 0–100; CSV concept không có cột absolute range) → `-5°C` được nhận | [VinshcService.java:454–457](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/VinshcService.java#L454-L457), header [020-observations.csv](../infra/backend/configuration/concepts/vinshc/020-observations.csv) |
| L-5 | `document()` tra bằng UUID chuẩn hoá nhưng insert UUID gốc → UUID chữ hoa tạo số chứng từ mới mỗi lần in | [OperationsService.java:832](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L832) vs [852](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L852) |
| L-6 | Upload ghi file trước khi INSERT → rollback để lại file mồ côi | [OperationsService.java:776–787](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L776-L787) |
| L-7 | Sau finalize, chẩn đoán bắt buộc `reason` nhưng kê đơn/ngừng thuốc thì không | [ClinicalService.java:433](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L433) vs [727–827](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L727-L827) |
| L-8 | `replaceDiagnosis` có thể NPE với chẩn đoán free-text tạo qua Core (`getCoded()` null) | [ClinicalService.java:446](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/ClinicalService.java#L446) |
| L-9 | Liquibase: các `<sql>` tạo partial unique index không có `<rollback>`; `date_created` là `TIMESTAMP` không timezone ở 3 bảng, các bảng khác dùng `TIMESTAMPTZ` | [liquibase.xml:32–34, 51, 71, 103, 118](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L32-L34); [30](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L30), [49](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L49), [69](../infra/backend/vinshc-module/api/src/main/resources/liquibase.xml#L69) |
| L-10 | Biến môi trường `VINSHC_ATTACHMENT_ROOT`, `VINSHC_B8_METADATA_ROOT`, `VINSHC_METADATA_PACK`, `VINSHC_ADDRESS_CATALOGUE`, `VINSHC_RELATIONSHIP_CATALOGUE` không có trong [.env.example](../.env.example) hay docs (grep rỗng); vẫn chạy được nhờ giá trị mặc định trong container | [VinshcService.java:670–673](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/VinshcService.java#L670-L673), [OperationsService.java:1012–1018](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L1012-L1018) |
| L-11 | `check_config.py` so sánh đường dẫn dạng chuỗi → FAIL với Python MSYS2 (`D:/…` ≠ `D:\…` do `docker compose config` trả) | [scripts/check_config.py:56–60](../scripts/check_config.py#L56-L60) |

**Maintainability**

- Singleton tĩnh `instance = this` ([AuthorizationService.java:55](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L55)); `requirePatientScopeStatic` và các hàm tĩnh khác không kiểm tra null ([dòng 65–76](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L65-L76)), khác `requireLegacy` ([dòng 58–63](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L58-L63)).
- [AuthorizationService.java:228–260](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java#L228-L260) nén nhiều câu lệnh trên một dòng, khó đọc và khó review.
- Helper trùng tên nhưng khác ngữ nghĩa giữa các service: `integer()` ở ClinicalService cắt số, ở OperationsService validate phạm vi; `patient()`, `encounter()`, `outpatient()` lặp lại.
- Controller nhận `Map<String, Object>` thay vì DTO → validation rải rác trong service.
- Mỗi service 900–1.400 dòng, trộn validation, SQL thô và mapping view; bảng chuyển trạng thái được dựng lại mỗi lần gọi.
- Lẫn `JdbcTemplate` riêng ([VinshcService.java:86–88](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/VinshcService.java#L86-L88), [OperationsService.java:91–93](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L91-L93)) với `session.doWork` (ClinicalService, AuthorizationService) — hai cách truy cập DB khác nhau, xem T-6.

---

## 6. Test

| # | Vấn đề | Bằng chứng |
| --- | --- | --- |
| T-1 | Không có unit test Java; image build bỏ qua test | `git ls-files \| grep -c src/test` → `0`; `-DskipTests` ở [Dockerfile:5](../infra/backend/Dockerfile#L5) |
| T-2 | Test B8 gần như chỉ chạy bằng admin (có `System Developer` → bỏ qua toàn bộ kiểm tra quyền); chỉ `test_07` dùng role manager | [test_b8_operations.py:30](../tests/integration/test_b8_operations.py#L30), [293](../tests/integration/test_b8_operations.py#L293) |
| T-3 | Không có test cross-facility (chỉ 1 cơ sở trong metadata) | grep `same_facility\|other facility` trong tests → rỗng |
| T-4 | Không có test đồng thời | grep `thread\|concurren\|ThreadPool` trong tests → rỗng |
| T-5 | Assert yếu: chấp nhận 200 khi sai mật khẩu; chấp nhận 500 ở FHIR | [test_b5_authorization.py:88](../tests/integration/test_b5_authorization.py#L88) `assertIn(wrong, (200, 401, 403))` — nếu sai mật khẩu vẫn đăng nhập được thì test vẫn pass, cần assert `authenticated == false`; [dòng 157](../tests/integration/test_b5_authorization.py#L157) |
| T-6 | Chưa có test rollback chứng minh `JdbcTemplate` và Hibernate dùng chung transaction | Phụ thuộc `HibernateTransactionManager` tự nhận DataSource. Bằng chứng gián tiếp: `createServiceOrder` insert FK tới order vừa lưu bằng Hibernate ([OperationsService.java:595–601](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L595-L601)) — chỉ có giá trị nếu CI đã pass. **CHƯA VERIFY** |

Thiếu test cho các kịch bản: H-1, H-2, H-3, M-1, M-2, M-3, replay receipt/refund, settle trên bill đã huỷ.

---

## 7. Điểm đã làm tốt

- **Không có SQL injection:** SQL động chỉ ghép tên bảng/cột là literal nội bộ (đã liệt kê hết caller của `required()`/`current()`); mọi giá trị dùng tham số bind.
- **Tiền tệ:** VND lưu `BIGINT` số nguyên, có chặn tràn (`addMoney`, `multiplyMoney` — [OperationsService.java:1242–1252](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L1242-L1252)).
- **Upload:** dò MIME theo nội dung, giới hạn 20MB, chặn path traversal ([dòng 773–775](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java#L773-L775)), kiểm SHA-256 khi tải, làm sạch tên file trong `Content-Disposition` ([OperationsController.java:186–188](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/OperationsController.java#L186-L188)).
- **Lịch sử bản ghi:** append-only với partial unique index cho bản hiện hành; mỗi ghi lâm sàng có sự kiện audit cùng transaction Hibernate.
- **Secrets:** không có secret hardcode; `.env` sinh ngẫu nhiên ([scripts/bootstrap.py](../scripts/bootstrap.py)) và nằm trong gitignore; [.dockerignore](../.dockerignore) dạng whitelist.
- **Mạng:** gateway chỉ bind `127.0.0.1` ([compose.yaml:80](../compose.yaml#L80)).
- **CI:** action pin theo SHA, image pin theo digest, có bước backup/restore sang project khác.

---

## 8. Việc còn mở — cần chạy runtime

> Đã thực hiện toàn bộ 7 việc dưới đây; kết quả ở mục 9.

Các mục dưới đây cần dựng stack Docker (`compose.yaml` + `tests/integration/compose.b4-metadata.yaml`, như CI) để chuyển từ phân tích tĩnh thành request/response thật:

1. Chạy lại pipeline B1–B9 giống CI để xác nhận baseline xanh và trạng thái CI hiện tại.
2. Script tái hiện H-3 và M-1 (tuần tự, tất định).
3. Script tái hiện H-2 và M-4 (2 luồng đồng thời).
4. Script tái hiện H-4 (2 request đồng thời cùng session cookie).
5. Tạo thêm một cơ sở thứ hai để kiểm H-1.
6. Ghi lại mã HTTP thực tế cho: chưa đăng nhập, vi phạm ràng buộc DB, `IllegalStateException` (M-5).
7. Kiểm tra TZ của JVM trong container backend (M-6).

---

## 9. Kết quả khắc phục

### 9.1 Cách kiểm chứng

| Môi trường | Chi tiết |
| --- | --- |
| Build/unit test | Maven 3.10.0, JDK 22 (local) và JDK 17 trong `docker build` |
| Runtime | Docker 29.5.2; mỗi lần chạy dùng bản sao repo riêng trong thư mục tạm, compose project, cổng và tag image riêng — không đụng stack/volume của nhóm |
| Pipeline | Đúng các bước của job `smoke` trong CI (pull, build, up, check_database, metadata verify, smoke, B1–B8, …) |
| Bằng chứng trước sửa | Chạy cùng bộ test hồi quy mới trên code `873e37d` (stack `ehr-review-before`) |
| Bằng chứng sau sửa | Chạy trên working tree đã sửa (stack `ehr-review-after`, `ehr-review-final`) |
| Nâng cấp tại chỗ | Cập nhật checkout `873e37d` lên code mới, giữ `.env`, fixture và volume đang có dữ liệu, rồi `up` |

Test hồi quy runtime: [tests/integration/test_b10_review_regressions.py](../tests/integration/test_b10_review_regressions.py) (16 test). Unit test Java: [omod/src/test](../infra/backend/vinshc-module/omod/src/test/java/org/openmrs/module/vinshc/) (18 test, chạy cả trong `docker build`).

### 9.2 Kết quả theo phát hiện

Cột "Trước" là response thật trên code `873e37d`; cột "Sau" là cùng test trên code đã sửa.

| ID | Sửa | Trước (873e37d) | Sau |
| --- | --- | --- | --- |
| H-1 | Mọi loader bản ghi B8 (`billRow`, `paymentRow`, `serviceOrderRow`, `resultRow`, `appointmentRow`, `queueRow`) và mọi lệnh tạo kiểm tra facility workspace; `dailyReport` chỉ nhận cơ sở trong scope ([OperationsService.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java), `requireLocationScope` trong [AuthorizationService.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/AuthorizationService.java)) | Cashier ở cơ sở khác: đọc bill **200**, đọc payment **200**, hoàn tiền **201** | Cả 4 thao tác **403**; cashier ở đúng cơ sở vẫn thu và in được (test_07) |
| H-2 | Một khóa `bill:<bill_id>` duy nhất cho thu/settle/hoàn/huỷ, đọc lại bill sau khi khóa (`lockedBill`) | 8/8 vòng settle ∥ thu tiền mặt: **thu 44.800đ trên bill 22.400đ** | 8/8 vòng: đúng 1 thao tác thành công, `settledVnd ≤ totalVnd` (test_08) |
| H-3 | Huỷ bill huỷ luôn phiếu `pending`; settle trên bill đã huỷ → 409; `recalculateBill` giữ trạng thái `cancelled` | Settle **200**, bill thành `paid` | Settle **409**, bill vẫn `cancelled`, `settledVnd=0` (test_02) |
| H-4 | **Đã xác nhận bằng bytecode** `OpenmrsFilter`: `UserContext` lấy từ attribute session `__openmrs_user_context` và dùng chung giữa các request. Proxy privilege nay nằm trên `RequestUserContext` riêng của từng request ([RequestUserContext.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/RequestUserContext.java), [ScopedCorePrivilegeInterceptor.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/ScopedCorePrivilegeInterceptor.java)) | User nurse (không có `Get Patients`), có tải adapter song song cùng cookie: **240/240** request Core `GET /patient` thành công | **0/240** — tất cả 403 (test_10); unit test xác nhận context của session không bao giờ nhận proxy |
| M-1 | Tra idempotency **trước** kiểm tra số dư (receipt, refund) và trước kiểm tra trạng thái (queue advance) | Retry phiếu thu đủ tiền → **409** | Retry → **201**, cùng UUID; refund đủ tiền cũng vậy (test_03) |
| M-2 | Slot độc quyền theo **bác sĩ** và theo **bệnh nhân**, không còn khóa cả cơ sở | Bác sĩ B + bệnh nhân B cùng giờ → **409** | → **201**; trùng bác sĩ hoặc trùng bệnh nhân vẫn 409 (test_04) |
| M-3 | Chỉ sửa revision mới nhất, khóa theo service order | Sửa revision cũ → **HTTP 200 với stack trace PostgreSQL trong body** | **409** "result has a newer revision" (test_05) |
| M-4 | Khóa advisory trên connection Hibernate (`TransactionLocks`): contact/field-state/address theo bệnh nhân; chẩn đoán/consultation/finalize theo encounter; đơn thuốc/dị ứng theo bệnh nhân. Vi phạm ràng buộc DB → 409 | 6 request tạo bill cùng key song song: `[200, 200, 201, 201, 201, 201]` (200 = lỗi duplicate key bị trả về như thành công) | Chỉ 201/409, mọi 201 cùng một UUID (test_09) |
| M-5 | Error contract mới ([BaseVinshcController.java](../infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/BaseVinshcController.java)): 400/401/403/409/503 cho lỗi có chủ đích; 500 thông điệp chung và log stack trace phía server; exception riêng `VinshcExceptions` | Chưa đăng nhập: `configuration` **200**, `identity` **403**; lỗi DB → **200 + stack trace** | **401** `unauthenticated` (test_01); `ErrorContractTest` dùng resolver handler thật của Spring |
| M-6 | Ngày khám tính theo `Asia/Ho_Chi_Minh`; ngày tái khám lưu nửa đêm UTC, độc lập TZ của JVM. Image backend chạy **UTC** (`/etc/localtime -> UTC`, `TZ` không đặt) | Lượt khám 06:30 ngày 22/06 (+07) chấp nhận tái khám **21/06** | **400** "cannot be before the encounter date" (test_16) |
| M-7 | UUID không tồn tại → 400; `limit` (1–1000, mặc định 200)/`offset`; mới nhất trước | UUID ngẫu nhiên → **200 + toàn bộ log** | **400**; `limit=2` trả tối đa 2 dòng (test_12) |
| M-8 | Cột `state_reason`; huỷ/nhập sai → discontinue `TestOrder` gốc | Không có `stateReason`; order gốc vẫn active | `stateReason` được lưu; REST `dateStopped` có giá trị (test_06) |
| M-9 | Changeset `vinshc-0.3.1-review-fixes` thêm 9 index; kiểm tra scope bệnh nhân bằng CTE thay vì tải mọi location | — | 9 index có trong DB sau nâng cấp (9.3) |
| L-1 | `configuration` yêu cầu đăng nhập | 200 ẩn danh | 401 |
| L-2 | `strictInt` dùng chung, không cắt/quấn số | `4294967297` → 1 | Bị từ chối (unit test) |
| L-3 | `BigInteger` vượt `long` bị từ chối | `2^64+100` → **phiếu thu 100đ (201)** | **400** (test_14) |
| L-4 | Giới hạn sinh lý tuyệt đối theo đơn vị concept (nhiệt độ 25–46 °C, …) | `-5 °C` → **201** | **400** (test_13) |
| L-5 | UUID nguồn được chuẩn hoá cả khi tra và khi lưu | — | Chữ hoa/thường cho cùng một số chứng từ (test_14) |
| L-6 | Xoá file đính kèm khi transaction không commit | — | Đã sửa code; chưa có test runtime riêng |
| L-7 | Kê đơn sau finalize bắt buộc `reason` | Không kiểm tra lý do (lỗi trả về là "orderer is required") | **400** "prescribing after finalization requires reason" (test_15) |
| L-8 | `replaceDiagnosis` từ chối chẩn đoán free-text/thiếu certainty thay vì NPE | — | Đã sửa code; chưa có test runtime riêng |
| L-9 | `<rollback>` cho 3 changeset dùng `<sql>`; changeset `vinshc-0.3.1-timestamptz` đổi `date_created` sang `TIMESTAMPTZ` | — | Checksum V9 trong DB không đổi; chuyển kiểu giữ nguyên giá trị (9.3) |
| L-10 | Biến `VINSHC_*` được ghi trong [DEVELOPMENT.md](DEVELOPMENT.md) | — | — |
| L-11 | `same_path()` chuẩn hoá đường dẫn | FAIL với Python MSYS2 | PASS với cả Python 3.12 Windows và 3.14 MSYS2; thêm test cấu hình hợp lệ |
| T-1 | 18 unit test JUnit 5; Dockerfile bỏ `-DskipTests` | 0 test | 18/18 pass, kể cả trong `docker build` |
| T-2/T-3/T-4 | Test hồi quy dùng cashier/nurse thật, cơ sở thứ hai và các kịch bản đồng thời | — | test_07, test_08, test_09, test_10 |
| T-5 | `test_b5::test_01` bắt buộc `authenticated == false` khi server trả 200 | Chấp nhận 200 bất kể nội dung | Pass trên cả code cũ và code mới |
| T-6 | Test rollback: `advance` đánh dấu `completed` rồi lỗi idempotency | — | **Pass cả trên code cũ**, tức `JdbcTemplate` vốn đã tham gia transaction Hibernate; item giữ nguyên `in_service` (test_11) |

Tổng hợp test hồi quy runtime: **trước sửa 15/16 FAIL** (chỉ T-6 pass); **sau sửa 16/16 PASS**. B1–B8 pass trên cả hai phiên bản.

### 9.3 Nâng cấp tại chỗ (DB 0.3.0 đang có dữ liệu → code mới)

| Kiểm tra | Kết quả |
| --- | --- |
| Code đang chạy | Truy cập ẩn danh `configuration` → 401 (hành vi mới) |
| Liquibase | 8 changeset cũ giữ nguyên checksum V9 trong `liquibasechangelog`; backend khởi động không có lỗi validation; thêm `vinshc-0.3.1-review-fixes` và `vinshc-0.3.1-timestamptz` |
| Chuyển kiểu cột | 3 bảng: `timestamp without time zone` → `timestamp with time zone`; số dòng và tổng epoch `date_created` không đổi |
| Dữ liệu nghiệp vụ | Số lượng và tổng tiền của bill, payment, order, result, document, clinical event không đổi |
| Index | 9/9 index mới tồn tại |
| Smoke `--require-fixture` | PASS |

### 9.4 Phát hiện thêm trong lúc sửa

| ID | Phát hiện | Bằng chứng | Xử lý |
| --- | --- | --- | --- |
| N-1 | Cashier **không in được phiếu thu** của chính cơ sở mình: `userIdentity()` gọi `UserService.getUser()`, cần quyền Core `Get Users` | Trên code cũ: `403 {"error":"forbidden","detail":"Privileges required: Get Users"}`; test B8 chỉ in bằng admin nên không phát hiện | Đọc định danh người lập phiếu bằng SQL; test_07 in bằng cashier |
| N-2 | `document()` trả bản in đã lưu **trước** mọi kiểm tra scope | Đọc code `873e37d` | Luôn dựng và kiểm tra nguồn trước, khóa theo nguồn |
| N-3 | Retry `queue/{uuid}/advance` cùng key trả 409 vì item đã `completed` | Đọc code | Tra replay trước kiểm tra trạng thái |
| N-4 | `createServiceOrder` chấp nhận bill của bệnh nhân khác; bill đã hoàn tiền vẫn được coi là đã trả trước | Đọc code | Kiểm tra bệnh nhân và trạng thái `paid` |
| N-5 | B9 khẳng định dữ liệu không đổi kể từ B8, nên mọi test ghi dữ liệu phải chạy **sau** B9 | Chạy B10 xen giữa: B9 báo `grossVnd 313200 != 66800` | CI chạy B10 sau bước handoff B9 ([ci.yml](../.github/workflows/ci.yml), [CI.md](CI.md)) |
| N-6 | `compose.yaml` có `pull_policy: build`: mọi `docker compose up` đều build lại image từ chính checkout đang chạy | Lần thử nâng cấp đầu tiên chạy lại code cũ dưới tag image mới | Ghi chú vận hành: nâng cấp = cập nhật checkout rồi `up`; không đổi tag image thủ công |

### 9.5 Lần chạy cuối theo đúng thứ tự CI mới

Stack sạch `ehr-review-final`, chạy đúng từng bước của job `smoke` trong [ci.yml](../.github/workflows/ci.yml) đã sửa:

| Bước | Kết quả |
| --- | --- |
| check_config, metadata, metadata tests | PASS |
| Build image (gồm 18 unit test) + up | PASS (khởi động 463 s) |
| check_database, metadata verify, smoke `--create-fixture` | PASS |
| B1–B8 | 53/53 PASS |
| Dựng lại container, giữ volume → check_database, metadata, smoke `--require-fixture`, B9 restart | PASS; B9 4/4 |
| Backup → restore sang project/cổng khác | PASS |
| Metadata + B9 sau restore | PASS; B9 4/4 |
| B9 handoff | PASS (`"passed": true`, 11 mục bằng chứng). Lần đầu fail "cannot read Git revision" vì bản sao trong thư mục tạm không phải git repo; chạy lại trong một git repo tạm thì pass |
| B10 review regressions (bước cuối) | 16/16 PASS |

### 9.6 Chưa làm / giới hạn

- **Chưa chạy trên GitHub Actions** (`gh` chưa đăng nhập) và **chưa commit**: mọi kết quả trên là chạy local.
- M-2 giả định quy tắc nghiệp vụ "một khung giờ độc quyền theo bác sĩ và theo bệnh nhân". Nếu phòng khám cần khóa theo phòng hoặc thiết bị thì phải bổ sung mô hình phòng.
- Refactor cấu trúc (controller nhận DTO thay vì `Map`, tách các service 900–1.400 dòng) **chưa làm** vì là thay đổi lớn, nằm ngoài phạm vi sửa lỗi.
- `test_b5` vẫn chấp nhận FHIR 500 khi thiếu quyền; đây là quyết định đã ghi trong [error-handling.md](api/error-handling.md) do lỗi upstream FHIR2 4.2.0.
- Test H-4 và H-2 là test đồng thời, mang tính xác suất. Trước sửa lỗi lộ ra 240/240 và 8/8 lần, sau sửa 0 lần, nhưng không đảm bảo tuyệt đối cho mọi thứ tự chạy.
- L-6 (dọn file khi rollback) và L-8 mới được review code, chưa có test runtime riêng.
