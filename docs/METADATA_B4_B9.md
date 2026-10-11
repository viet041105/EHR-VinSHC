# Bàn giao metadata B4–B9 phiên bản 0.3.0

Ngày 11/10/2026 · nhánh `role-3-metadata` · baseline Core 2.8.8 / Initializer 2.12.0 / FHIR R4 4.0.1. Đã đối chiếu `clinic-backend@6c407f1` và `main@53ba380`.

**Gói này đủ dữ liệu và quy tắc để BE triển khai/test B4–B9. Chưa phải xác nhận các chức năng đó đã chạy trên backend.** Các nhãn thuốc/dịch vụ, cấu trúc phiếu và vài giá lịch sử lấy từ S01; phần thiếu dùng synthetic do người phụ trách dự án cho phép dùng trong test. Không đưa danh tính, liều điều trị hay nhân sự thật trong PDF vào fixture.

Toàn gói hiện có **205 trường, 234 identity metadata**, gồm 78 identity nền giữ nguyên và 156 identity bổ sung cho test. Có 9 đặc tả form; 8 vai trò × 16 tài nguyên × 7 hành động = 896 ô quyền. Các catalogue test giữ `productionEnabled=false`. Đặc tả form chưa phải schema O3; ma trận quyền đã được backend B5 thực thi theo active role/cơ sở trên API VinSHC.

## 1. BE lấy gì để làm từng yêu cầu

| Yêu cầu bàn giao | Nguồn máy đọc | Quyết định chính / điều kiện còn mở |
| --- | --- | --- |
| 1. ICD-10/chẩn đoán | [icd10-mvp.json](../metadata/vinshc/catalogues/icd10-mvp.json), [b4-b9.json](../metadata/vinshc/contracts/b4-b9.json) | 9 dòng nguồn chính thức, 7 chọn được và 2 category bị khóa; primary/secondary, certainty, non-coded, revision/void và tách lượt khám. Đây là allowlist test MVP, không phải toàn bộ ICD-10 quốc gia |
| 2. Dị ứng | [allergies.json](../metadata/vinshc/catalogues/allergies.json), contract `allergy` | 5 nhóm tác nhân test, 3 phản ứng, severity/criticality riêng; screening theo encounter không xóa allergy theo patient |
| 3. Thuốc/kê/cấp | [medications.json](../metadata/vinshc/catalogues/medications.json), [medication-units.json](../metadata/vinshc/catalogues/medication-units.json), contract `prescription` | 6 nhãn sản phẩm mẫu + 2 sản phẩm giả; unit/route/frequency riêng; confirmed snapshot, sửa bằng revision, cấp từng phần/idempotency |
| 4. Cơ sở/nhân sự | [facilities.json](../metadata/vinshc/catalogues/facilities.json) | 1 cơ sở giả, 3 phòng, 4 provider giả; encounter role bác sĩ/điều dưỡng/KTV/người duyệt. Chưa có pháp nhân, CCHN hoặc nhân sự thật được xác nhận |
| 5. Quyền | [permissions.json](../metadata/vinshc/permissions.json), [permission-matrix.csv](../metadata/vinshc/permission-matrix.csv) | 8 role default deny; 8 OpenMRS role và 69 privilege đã nạp và kiểm tra đủ 896 ô. Backend đã có active role/facility workspace, assignment server-side và B2–B4 scope; account/password vẫn provision ngoài Git |
| 6. FHIR | [fhir.json](../metadata/vinshc/contracts/fhir.json), [b3.json](../metadata/vinshc/contracts/b3.json) | 10 resource mapping, namespace/extension draft, code/version/missing/provenance/write limits. LOINC chưa được duyệt nên chưa import |
| 7. Dịch vụ/giá/CLS | [services.json](../metadata/vinshc/catalogues/services.json), [prices.json](../metadata/vinshc/catalogues/prices.json), [diagnostics.json](../metadata/vinshc/catalogues/diagnostics.json) | 7 dịch vụ/7 giá, 2 chỉ số/1 panel, mẫu bệnh phẩm, hình ảnh/thủ thuật tối thiểu; VND integer snapshot. MIME/dung lượng chỉ là đề xuất test, chờ xác nhận kỹ thuật |
| 8. Lịch hẹn/queue | [workflow.json](../metadata/vinshc/contracts/workflow.json) | 1 dịch vụ hẹn, 2 loại hẹn, mặc định 20 phút; 6 điểm hàng đợi; có/không điều dưỡng/quầy thuốc và trước/sau thanh toán; phân biệt auto/manual |
| 9. In/báo cáo | [printing-reporting.json](../metadata/vinshc/contracts/printing-reporting.json), [print-examples.json](../metadata/vinshc/fixtures/print-examples.json) | 6 contract phiếu + 6 payload giả; phiên bản/snapshot/số chứng từ/chữ ký; doanh thu theo thu/hoàn thực tế, ngày Việt Nam, tách cơ sở |
| 10. Version/import/test | [import-manifest.json](../metadata/vinshc/import-manifest.json), [initializer-test](../metadata/vinshc/initializer-test/), [b4-b9.json fixtures](../metadata/vinshc/fixtures/b4-b9.json), [backend-acceptance.json](../metadata/vinshc/fixtures/backend-acceptance.json) | 7 CSV test, manifest adapter, 159 tình huống, 5 kịch bản nghiệm thu runtime và overlay 0.3.1 giữ UUID. Phần catalogue B4 đã chạy clean-install/reimport/recreate; B5 đã chạy đủ ma trận quyền và boundary runtime; các scenario B6–B9 và overlay update vẫn chưa chạy đầy đủ |

Tìm trường theo `fields.csv`/`pack.json`, không lấy mã catalogue làm tên cột DB. Form mới có đầy đủ các field cũ liên quan và field bổ sung. `frontend-map.json` chỉ liệt kê identity dự kiến; FE cần API xác nhận identity đã import và catalogue đúng scope.

## 2. Nguồn, phạm vi và cách bổ sung catalogue

Manifest [sources.json](../metadata/vinshc/sources.json) giữ URL/phiên bản/hiệu lực/trang/SHA nguồn. S01 chỉ tham chiếu mã tài liệu và trang, không chứa nội dung bệnh nhân. Tên hoạt chất/strength giữ theo nhãn nguồn; chưa chứng nhận danh mục thuốc của cơ sở, chỉ định hoặc khả năng chia viên.

Sáu nhãn sản phẩm từ trang 123: Plavix 75mg, Lipitor 20mg, Mobic 7.5mg, Colchicina Seid 1mg Tablet, Pantoloc 20mg, Tebonin 120mg. Catalogue tách nhãn nguồn, hoạt chất/strength và dạng “viên”; không suy thêm dạng bao/phóng thích. Synthetic tablet/liquid phục vụ test liều lẻ; các sản phẩm mẫu mặc định `splitAllowed=false`. Unit dose/quantity/duration có catalogue riêng; PRN không được gán một tần suất số giả.

Giá Glucose/Creatinin 22.400 đồng từ trang 188; siêu âm bụng 58.600 đồng và ECG tại giường 39.900 đồng từ trang 189. Đây là **giá lịch sử của hồ sơ mẫu để test**, không phải bảng giá hiện hành của VinSHC. Các giá còn lại synthetic. Đơn vị `mmol/L`, `umol/L` của hai chỉ số là cấu hình test synthetic, chưa xác minh từ kết quả nguồn; method/reference range/LOINC để null.

ICD dùng [Thông tư 06/2026/TT-BYT](https://vanban.chinhphu.vn/?classid=0&docid=217536&pageid=27160), hiệu lực 01/07/2026, cùng [phụ lục chính thức](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/4/06-byt-kem.pdf). Tên gốc tiếng Anh/tiếng Việt và cờ hạn chế được trích theo bảng. URI coding là `http://hl7.org/fhir/sid/icd-10`, terminology release WHO 2019; phiên bản catalogue Việt Nam riêng `VN-06-2026-2026-07-01`.

Allowlist gồm E11, E11.9, I10, I63.9, J06.9, K29.7, M10.9, M10.90, Z00.0. E11 và M10.9 bị khóa vì nguồn yêu cầu mã cụ thể hơn. M10.90 chỉ chọn khi thông tin phù hợp; không tự đoán vị trí bệnh để chuyển M10.9 sang M10.90. Giữ mã/phiên bản hồ sơ cũ; không tự cập nhật chẩn đoán lịch sử. BE có thể mở rộng catalogue bằng các dòng đã kiểm tra từ cùng nguồn, với review nghiệp vụ và fixture tương ứng.

Mỗi record có UUID/code/version/source/effectiveFrom/effectiveTo/active/retired. Hiệu lực là `[effectiveFrom, effectiveTo)`; `effectiveTo=null` là chưa đặt ngày kết thúc. Retire không xóa tham chiếu lịch sử. Đổi tên giữ code/UUID; đổi ý nghĩa tạo code/UUID mới và mapping retire/thay thế có nguồn. Giá mới tạo revision price riêng, không sửa snapshot hóa đơn cũ.

## 3. Các quy tắc BE cần áp dụng

### Khám, chẩn đoán và dị ứng

Diagnosis thuộc đúng patient/visit/encounter. Mỗi encounter có tối đa một primary đang active; khi chốt chẩn đoán phải có một primary. Secondary có rank riêng >=2; không trùng rank. Certainty chỉ provisional/confirmed. Chọn code thì dùng concept/catalogue version; non-coded thì giữ text và không gán ICD tự tạo. Cập nhật/void lưu reason, revision, actor/time; các lượt khám khác không tự kế thừa thành diagnosis mới.

Enum của pack đã đồng bộ contract 0.3.0. `legacyCodePolicy` ghi cách giữ mã 0.2.0: ready→confirmed cần xác minh snapshot; dispensed không là prescription lifecycle mới và không chứng minh quantity đã cấp; scheduled→booked giữ raw/version. Result.cancelled cần review nghiệp vụ, không tự đổi entered-in-error. DTO certainty lowercase, native Diagnosis enum vẫn uppercase; PRIMARY/SECONDARY ánh xạ rank 1/>=2.

Sàng lọc dị ứng `not_asked/unknown/no_known_allergy/present` là kết quả của lượt hỏi. Allergy chi tiết theo bệnh nhân có lifecycle active/inactive/resolved/entered-in-error riêng. `no_known_allergy` khi vẫn có allergy active tạo xung đột cần bác sĩ kiểm tra; không tự resolve/void. Entered-in-error dùng native void có lý do, FHIR verificationStatus tương ứng và **không có clinicalStatus**. Core Allergy thiếu lifecycle đầy đủ nên adapter phải lưu bổ sung. Severity phản ứng khác criticality nguy cơ tương lai.

### Đơn thuốc và cấp thuốc

Draft chỉ lưu adapter; confirmed tạo DrugOrder NEW/REVISE đúng patient/encounter/orderer/care setting. Draft có thể cancelled; confirmed ngừng bằng DISCONTINUE + reason. Sửa confirmed tạo snapshot/order mới với previousOrder, không đổi liều trong bản đã xác nhận. Void dành cho bản ghi nhầm, không thay việc ngừng thuốc.

Dose và quantity là chuỗi decimal chính xác; duration số nguyên kèm unit. Không dùng float để cộng/trừ số thuốc. Làm tròn quantity lên bước cấp chỉ sau xác nhận có lý do; không tự làm tròn dose. PRN cần quantity/maxPerDay rõ ràng. Cấp dựa vào snapshot confirmed, phần cấp <= phần còn lại và đúng bước; từ chối lượt khám hủy/rời hoặc đơn đã ngừng.

`idempotencyKey` có scope cơ sở/đơn/dòng; cùng key và payload trả lại kết quả cũ, cùng key khác payload trả 409. Thu/hoàn cũng có key và UUID giao dịch độc lập; duplicate UUID không được tạo hiệu ứng lần hai. Backend phải dùng transaction, row lock/unique constraint; validator Python là mô hình test tuần tự, chưa chứng minh race/concurrency.

### Quyền và nhân sự

`permissions.matrix` là nguồn quyền chính; `roles.*.grants` cũ giữ để tra nhóm field. CSV role/privilege dùng name/key/UUID ổn định; quyền có scope không thể chỉ dùng privilege global của Core để thực hiện. Mọi predicate assignment/facility/state/projection lấy từ server; không tin cờ FE.

Cashier chỉ dữ liệu định danh tối thiểu và thu phí; lab chỉ order được giao và bản kết quả còn sửa được; pharmacy chỉ đơn confirmed; manager chỉ aggregate; admin ứng dụng không đọc chart. Doctor chỉ patient được giao; cập nhật kết quả final/corrected còn cần assignment người duyệt, luôn tạo revision mới. Doctor có thể discontinue đơn confirmed dù snapshot không mutable. Tất cả endpoint detail/list/search/print/download cần cùng policy. Truy cập trực tiếp Core REST/FHIR bằng quyền rộng không chứng minh policy này đã được áp dụng.

Provider UUID khác Person UUID. FHIR Practitioner dùng Person UUID được provision và xác minh; PractitionerRole có UUID riêng. Không tạo account/password từ catalogue. Synthetic provider có CCHN `TEST-*` chưa xác minh; cashier/reception trên phiếu thu/hẹn dùng issuer hành chính, không bị tạo thành bác sĩ. Hai provider fixture B3 cũ giữ identity; catalogue facilities bổ sung identity Person để BE bind rõ ràng khi provision.

### CLS, giá, thanh toán và file

Order có requested→assigned→in_progress→completed; native Order active/discontinued khác trạng thái đã thực hiện. Result draft/preliminary/final/corrected/entered-in-error có history riêng. Final cần người duyệt/time; correction dùng UUID revision mới, previousRevision và lý do. Kiểm tra patient/order/facility/unit/type; không tự tạo reference range hay đổi đơn vị thiếu nguồn.

Tiền VND nguyên, không chấp nhận bool/float/âm hoặc vượt giới hạn số nguyên an toàn. Chụp tên dịch vụ, priceUuid/version, đơn giá, quantity, discount, net và timestamp. Thu không vượt phần còn nợ (BE lấy balance trong transaction); hoàn không vượt phần còn hoàn của receipt thành công. Hủy hóa đơn chưa thu được phép có reason; đã thu thì hoàn explicit, không xóa payment. Không tự hoàn khi hủy lượt khám.

Prepay yêu cầu đúng dịch vụ đã thanh toán trước thực hiện; đăng ký/đo sinh hiệu vẫn có thể tiếp tục. Postpay cho thực hiện trước thu; công nợ vẫn còn sau chốt lượt khám. Bank transfer pending chưa được tính doanh thu.

Đề xuất test file: PDF/JPEG/PNG, tối đa 20 MiB = 20.971.520 byte. Chờ xác nhận kỹ thuật trước production. Server kiểm tra stream size, MIME thực, quyền/patient/order/result linkage, private storage/scanning/hash; không chỉ kiểm tra tên/Content-Type. Fixture chỉ thử predicate MIME/size, không phải kiểm thử bộ upload/scanner thật.

### Lịch hẹn, queue, in và báo cáo

Appointment default 20 phút, start/end có offset và start<end. Kiểm tra trùng provider/location atomically; back-to-back dùng interval nửa mở. Không gắn no_show trước slot bắt đầu. Follow-up note không tự đặt lịch. Queue có item/point/iteration UUID riêng; replay event không tạo item trùng, requeue là iteration mới. `workflow.events` ghi rõ bước tự động và bước người dùng xác nhận. Kết quả final báo doctor worklist, không tự chốt visit; thanh toán chỉ mở gate, không tự chốt kết quả.

STANDARD_POSTPAY có nurse/pharmacy; COMPACT_PREPAY bỏ cả hai. Doctor ghi sinh hiệu ở cơ sở không nurse phải được cấp quyền rõ, không suy quyền từ cờ cấu hình. BE/người 4 chọn adapter/module queue/appointment và kiểm chứng API đúng baseline.

Sáu phiếu có templateVersion, documentVersion, số chứng từ atomic theo cơ sở/type/năm, timestamp/state và repeated lines. Giữ snapshot khi in lại; nguồn sửa tạo bản mới. Chữ ký ướt chưa ký có signedAt/signatureReference cùng null; chữ ký điện tử phải có reference đã xác minh. Không tái dùng chữ ký thật trong S01. Đây là payload contract và ví dụ giả, chưa phải mẫu PDF đã được cơ sở duyệt.

Báo cáo dùng `Asia/Ho_Chi_Minh`, interval `[00:00, 00:00 hôm sau)`, tách facility. Opened visits đếm Visit UUID theo startAt; completed visits theo completedAt và status completed, không đếm số Encounter. Doanh thu = receipt settled trong ngày; hoàn = refund settled trong ngày của refund kể cả thu ngày trước; net có thể âm. Không lấy bill totals làm tiền đã thu; không tính pending, giao dịch trùng hoặc cơ sở khác. Manager chỉ xem aggregate.

## 4. FHIR và điều kiện duyệt

`fhir.mappings` có field mappings cho Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, ServiceRequest, Location, Practitioner và PractitionerRole; UUID metadata type/concept không dùng làm id của clinical instance. Namespace nội bộ/CCCD/BHXH/BHYT B2 giữ nguyên giữa môi trường. Facility identifier và hệ cấp mã theo cơ sở được ghi riêng; cơ sở mới có namespace riêng, không dùng localhost. MPI và merge/cross-facility để giai đoạn sau.

Complex extensions contact-row/address-snapshot/field-state/category-other có canonical URN UUID ổn định, type/cardinality/context/provenance và version draft. RowKey bắt buộc cho contact/address/fieldState lặp; trường singleton không tạo rowKey giả. Value và missing state không cùng tồn tại. Đây là contract draft, BE cần xuất StructureDefinition và kiểm tra bằng tooling FHIR trước khi liên thông.

B3 vẫn chọn BP panel/components; chỉ có một chỉ số thì không sinh chỉ số kia, trạng thái thiếu theo B3. SpO₂ đã được người dùng xác nhận pulse oximetry; các mapping LOINC vẫn chờ người chuyên môn phê duyệt/phương pháp và **không có trong CSV import**. Không suy LOINC chỉ từ tên chỉ số. UCUM/current local concept units được tham chiếu từ B3.

BE hiện có bằng chứng read Patient/Encounter/Observation và REST/adapter B2/B3. Các resource còn lại cần nghiệm thu riêng. MedicationRequest runtime chỉ quảng bá read/search/patch; ServiceRequest read/search. Không tạo clinical dữ liệu qua FHIR create/update chưa hỗ trợ; dùng adapter/native API đã được test. Condition từ Diagnosis cần xác minh adapter mapping, không mặc định native Condition và Diagnosis là một bảng.

## 5. Import, version và kiểm chứng

Chạy tại gốc repo với Python 3.11+; không cần cài thư viện cho metadata tooling:

```powershell
python tools/metadata.py --write
python tools/metadata.py
python -m unittest discover -s metadata/tests -v
python tools/metadata.py --prepare-update .runtime/metadata-update-0.3.1
```

Lệnh cuối yêu cầu thư mục mới và basePackSha256 khớp chính xác. Overlay đổi version package/contracts và nhãn/note mạch, giữ mọi key/UUID/field/unit/ý nghĩa; catalogue, terminology, extension và template version được pin riêng, không tăng chỉ vì package đổi nhãn. Không copy overlay vào checkout chính hoặc reset DB đang dùng. Nếu thư mục đã có, chọn một thư mục test mới, không xóa volume để thử lại.

CSV đang nạp theo build vẫn ở `infra/backend/configuration`, chỉ chứa 77 managed identity + location nền có sẵn. **7 CSV mới để riêng trong `metadata/vinshc/initializer-test`**, không tự nạp khi chạy Docker. Khi thử trên checkout/Compose project/volume riêng, BE dùng manifest để chồng các file test vào configuration tương ứng, build và kiểm chứng. Thứ tự domain: privileges, encounterroles, roles, locations, concepts, drugs, orderfrequencies; concepts nạp trước drug/form/frequency references. Manifest có SHA các CSV.

Provider/person/role binding, drug ingredients, allowed dosing/dispensing/duration-unit/route concept sets và global properties, PRN null-frequency, services/prices/panels, lifecycle/revisions, billing/dispensing/queue/appointments cần provision/migration/adapter theo manifest. CSV Drug nạp tên/concept/dosage form/strength; ingredient relations và unit-set membership cần BE provision qua Core service/API đã test, giữ upstream members. Concept units tồn tại chưa chứng minh DrugOrder nhận chúng. Custom role privilege không tự mở Core clinical REST.

`--verify-url` chỉ GET 78 identity nền; output ghi rõ 156 identity test bị loại khỏi phạm vi. BE xác minh catalogue test, custom role/privilege, provider binding, adapter tables và round-trip bằng [backend-acceptance.json](../metadata/vinshc/fixtures/backend-acceptance.json). Ghi số UUID/bản ghi sau clean install, import lần hai và label overlay; import lần hai/update không tạo trùng. Trên API thật cần thêm ca parallel idempotency, locking/balance, slot collision, download/search scope và FHIR capability/round-trip.

Kết quả local: 28 ca nền + 47 B2/B3 + 159 B4–B9 đúng kỳ vọng; 65 unit test metadata và 25 regression test nền pass. Ngày 12/10/2026, backend đã mount 7 CSV trên Compose project/volume riêng, sửa lớp concept tần suất thành `Frequency` và kết quả xét nghiệm thành `Test`, sau đó clean import/reimport không có lỗi Initializer. B4 đạt 9/9 trước và sau recreate. B5 đạt 5/5, gồm đủ 896 ô quyền, active role/facility scope, direct Core/FHIR denial, access audit và thu hồi assignment. Các scenario B6–B9, overlay update, UI render phiếu và E2E toàn gói vẫn chưa chạy. [Patch CI](patches/metadata-ci-checks.patch) thêm metadata check và unit tests vào configuration job; chưa áp dụng vì token hiện tại thiếu scope workflow. [METADATA_VALIDATION.md](METADATA_VALIDATION.md) tách kết quả local mới với bằng chứng runtime nền trước đó.

## 6. Bước tiếp theo của người 3 và BE

Người 3 gửi tài liệu này cùng JSON/CSV/fixtures trên nhánh cho BE. BE xác nhận tên DTO, schema adapter, API native/FHIR và policy theo đúng runtime; triển khai và chạy 5 scenario nghiệm thu. Người 3 bổ sung reviewer/phương pháp sinh hiệu, danh mục thuốc/giá/nhân sự cơ sở và quyết định MIME/size khi nhóm có thông tin. Chỉ mở production từng catalogue/mapping sau review có người duyệt/nguồn/phiên bản và kết quả runtime; chưa đánh dấu B4–B9 đóng chỉ vì metadata đã xong.
