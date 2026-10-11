# Bộ metadata VinSHC cho BE và FE

**Phiên bản:** `0.1.0` · **Ngày:** 10/10/2026 · **Nhánh làm việc:** `role-3-metadata`.

Người 3 và BE đã chốt chuyển sang bước metadata. Bộ này cụ thể hóa phạm vi ngoại trú trong `BACKEND.md`: MVP-1 lõi khám và hợp đồng dữ liệu MVP-2 vận hành. Các ngưỡng lâm sàng, nguồn/phiên bản danh mục và quyền kỹ thuật được nghiệm thu riêng theo các mốc bên dưới.

Đây là bộ bàn giao để triển khai, gồm **165 trường**, **78 đối tượng metadata** có UUID ổn định, 18 danh mục trạng thái, mẫu biểu, ma trận quyền và dữ liệu giả. Nó bổ sung cho khảo sát 983 dòng của PDF 195 trang; không yêu cầu BE tạo 983 cột hoặc triển khai toàn bộ nội trú.

## 1. Đọc file nào và dùng vào việc gì

| File | Ai dùng / mục đích |
| --- | --- |
| [MVP_METADATA_FIELDS.md](data/MVP_METADATA_FIELDS.md) | BE/FE đọc bảng từng trường: mã, nhãn, kiểu, đơn vị, điều kiện bắt buộc, nơi lưu, UUID, validation và trang nguồn |
| [pack.json](../metadata/vinshc/pack.json) | Nguồn chuẩn của trường, entity, UUID, code list, quy tắc và phụ thuộc danh mục; sửa tại đây |
| [fields.csv](../metadata/vinshc/fields.csv) | Bảng phẳng để nhóm lọc/import vào công cụ quản lý; file sinh, không sửa tay |
| [frontend-map.json](../metadata/vinshc/frontend-map.json) | UUID sinh hiệu đúng mã FE đang dùng; server phải kiểm tra metadata đã nạp trước khi bàn giao map |
| [forms.json](../metadata/vinshc/forms.json) | Ba đặc tả form: tiếp nhận, sinh hiệu và khám. Đây là hợp đồng trường, **chưa phải schema form engine O3** |
| [permissions.json](../metadata/vinshc/permissions.json) | Ma trận nghiệp vụ cho 8 role; **chưa tự cấp privilege hoặc thực thi bảo mật trên Core** |
| [cases.json](../metadata/vinshc/fixtures/cases.json) | 28 ca giả cho validator cấu trúc; không phải request REST trực tiếp |
| [workflows.json](../metadata/vinshc/fixtures/workflows.json) | Kịch bản tích hợp cho BE/người 4: hai bệnh nhân trùng tên, nhiều lượt, quyền, hủy/hoàn/cấp trùng |
| [configuration](../infra/backend/configuration/) | CSV thực sự để Initializer nạp khi build/khởi động backend |

Không đổi các mã trường `patient.ma_noi_bo`, `patient.ma_bhxh`, `vitals.mach`… để đổi nhãn. `patient.ma_bhxh` chỉ là mã BHXH; số thẻ BHYT được tách thành `patient.ma_bhyt`.

## 2. Đối tượng nào được nạp, đối tượng nào là hợp đồng

| Nội dung | Đầu ra thực tế của bộ này |
| --- | --- |
| Location | Tham chiếu location phát triển `feae71be-957c-4f94-b100-d84bc6915574` đã có; không thay bằng tên/địa chỉ phòng khám thật |
| Identifier type | 4 loại: nội bộ, CCCD, BHXH, BHYT |
| Visit type | Ngoại trú, tái khám |
| Encounter type | Hành chính, sinh hiệu, khám, kết quả CLS |
| Encounter role | Người khám, điều dưỡng ghi nhận, tác giả kết quả; khác account role |
| Person attribute type | Điện thoại, ngày sinh nguyên văn/độ chính xác/năm/tháng, nghề nghiệp, địa chỉ nguyên văn/cũ |
| Concept | Numeric, Text, Date, Coded, answer và ba nhóm Obs; các answer phải nạp trước question, group nạp sau member |
| Form, role/privilege | Đặc tả phối hợp FE/BE. Không copy `forms.json` vào một domain không hỗ trợ hoặc coi ma trận nghiệp vụ là quyền đã chạy |
| ICD-10, thuốc, dịch vụ, tỉnh/xã | Contract danh mục trong `externalCatalogues`; nguồn/phiên bản và dữ liệu cơ sở cần được cung cấp trước nghiệm thu chức năng tương ứng |
| Lịch hẹn/queue, billing/dispensing | DTO cần B8/BE-08/BE-12 ánh xạ; cấu hình appointments/queue thuộc người 4, không có thay đổi ở vùng đó |

Trong bảng trường, `native` là path thuộc mô hình OpenMRS; `person_attribute`/`identifier` tham chiếu type đã cấp UUID; `obs` tham chiếu concept và group; `adapter_contract` cần adapter/module được kiểm chứng. Path DTO không phải lời khẳng định REST nhận đúng tên/path đó.

### UUID và bản nạp

UUIDv5 sinh từ namespace đã lưu và `domain:key`; không phụ thuộc nhãn hay phiên bản gói. UUID location có sẵn được giữ nguyên. Không dùng số `concept_id`, không dùng UUID ngẫu nhiên mỗi lần build và không hardcode UUID rải rác trong FE/API test.

CSV dùng `Uuid` đầy đủ. Initializer tìm đối tượng theo UUID để tạo/cập nhật. Coded answers dùng UUID, không dùng tên tiếng Việt để resolve. Tên fully specified có locale `en` và `vi`; concept names mới được Initializer sinh UUID theo nội dung khi đổi tên. Khi đổi ý nghĩa lâm sàng phải tạo key/UUID mới, không tái sử dụng key cũ.

`Required=false` ở identifier type nội bộ là quyết định tương thích Core: không làm hỏng fixture/upstream hoặc ép mọi hồ sơ cũ có thêm mã mới. **Ứng dụng vẫn buộc mã nội bộ khi `patient.create`.** Mã nội bộ gắn location, unique trong location; Idgen/server sinh mã do BE cấu hình. CCCD/BHXH/BHYT là định danh phụ, không tự merge bệnh nhân.

## 3. Quy ước mọi trường dùng chung

### Giá trị và trạng thái thiếu

Định dạng cell trong dữ liệu giả:

```json
{"state": "recorded", "value": 80, "unit": "/min"}
```

Không biết giá trị:

```json
{"state": "unknown"}
```

| State | Nghĩa |
| --- | --- |
| `recorded` | Có value đúng kiểu |
| `not_recorded` | Chưa ghi dữ liệu |
| `not_asked` | Chưa hỏi/đánh giá |
| `unknown` | Đã hỏi hoặc có nguồn nhưng không rõ |
| `refused` | Người cung cấp từ chối |
| `not_applicable` | Không áp dụng cho bối cảnh này |
| `masked` | Dữ liệu nguồn bị che |
| `unreadable` | Có nguồn nhưng không đọc được |

Chỉ `recorded` có `value`. Không gửi `value:null` với `recorded`, không dùng `0`, chuỗi rỗng hoặc `false` để thay thiếu. Ô bỏ trống không chứng minh đã hỏi và trả lời “không”. `masked`/`unreadable` phục vụ đối chiếu nguồn, không phải câu trả lời khám thường ngày.

`storage.missingState` chỉ rõ cách lưu trạng thái: sinh hiệu và tiền sử có companion coded Obs đã cấp UUID; các trường native còn lại cần `fieldStates[].dataStatus` trong adapter/provenance contract. **Native null/không có identifier không lưu đủ các lý do thiếu**. BE phải bổ sung persistence trạng thái cho các trường đó nếu đưa nhập liệu từ nguồn vào phạm vi; chưa được coi extension này đã có trên Core.

Các field lặp thuộc từng bản ghi cha (`contacts[]`, diagnoses, orders, results…), không ghép nhiều thuốc/chẩn đoán vào chuỗi chung. Cell fixture chỉ kiểm tra một giá trị nguyên tử; adapter phải giữ cấu trúc lặp và khóa dòng.

### Ngày, giờ và nguồn

- Thời điểm có giờ phải có offset hoặc `Z`; lưu instant, hiển thị `Asia/Ho_Chi_Minh`. Thời điểm đo (`obsDatetime`) khác thời điểm nhập (`dateCreated`).
- Ngày chỉ dùng `YYYY-MM-DD`, không có timezone. Không tự thêm `00:00` cho PDF chỉ có ngày.
- Ngày sinh có `birth_raw` và `birth_precision`: `day`, `month`, `year`, `unknown`. Chỉ có năm thì giữ năm và nguyên văn; không tự tạo `01/01` cho native birthdate. BE xác nhận cách đăng ký/ngày sinh thiếu trên B2.
- Mỗi giá trị nhập từ nguồn có document UUID/trang/mã khảo sát khi cần đối chiếu. Không dùng số trang làm mã encounter; phiếu nhiều trang/2 liên in không tạo thêm giao dịch.
- User nhập từ session, provider chuyên môn từ encounter provider. Không tin `creator` do FE tự gửi. Sửa bản final tạo phiên bản mới có lý do; không ghi đè nguồn cũ.

### Bắt buộc theo thời điểm nghiệp vụ

`required_when` là điều kiện, không phải mọi field luôn bắt nhập. Giải thích đầy đủ nằm trong `pack.json.requiredConditions`.

| Khi nào | Nhóm bắt buộc |
| --- | --- |
| Đăng ký bệnh nhân | Mã nội bộ, tên, giới tính hành chính, độ chính xác ngày sinh; phần ngày/năm/tháng phụ thuộc precision |
| Mở Visit | Patient, loại visit, location, startDatetime; UUID Visit do server sinh |
| Ghi sinh hiệu | Liên kết patient/visit/encounter, provider/role phù hợp, location, measuredAt; ít nhất một chỉ số hoặc trạng thái đánh giá rõ |
| Chốt phiếu khám | Lý do khám, sàng lọc dị ứng, chẩn đoán chính và certainty/rank theo nghiệp vụ đã chọn; không ép khi đang nháp |
| Kê đơn | Drug/dose/units/route/frequency/quantity/orderer được kê và có danh mục; không tự điền liều |
| Đóng Visit | stopDatetime + lý do; bỏ về/hủy/chuyển khám cần ghi chú, không tự tạo chẩn đoán cho lượt bỏ dở |
| Nhập kết quả/thu phí/cấp thuốc | Theo contract B8 và điều kiện từng field; luôn xác nhận parent link, quyền, trạng thái và idempotency |

UUID của đối tượng mới là `server_generated`. UUID tham chiếu phải tồn tại và đúng đối tượng; regex UUID không chứng minh một encounter thuộc đúng bệnh nhân.

## 4. Sinh hiệu: hợp đồng lưu và đọc lại

Một lần đo = một `group.vitals` thuộc encounter sinh hiệu, với các numeric Obs và các coded Obs `*_trang_thai`. Lần đo sau là nhóm mới. Numeric `obsDatetime`, coded status và parent group cùng thời điểm đo.

Ví dụ khi biết mạch 80: numeric concept `vitals.mach` có `valueNumeric=80`, status concept `vitals.mach_trang_thai` có answer `data_status.recorded`. Nếu không biết nhiệt độ: chỉ status `unknown`, không tạo numeric Obs nhiệt độ. Thiếu status và thiếu value được hiển thị chưa ghi, không được tự thành đã hỏi.

| Mã | UCUM | FE key |
| --- | --- | --- |
| `vitals.mach` | `/min` | `pulse` |
| `vitals.ha_tam_thu` | `mm[Hg]` | `systolic` |
| `vitals.ha_tam_truong` | `mm[Hg]` | `diastolic` |
| `vitals.nhiet_do` | `Cel` | `temperature` |
| `vitals.nhip_tho` | `/min` | `respiratory` |
| `vitals.spo2` | `%` | `spo2` |
| `vitals.can_nang` | `kg` | `weight` |
| `vitals.chieu_cao` | `cm` | `height` |

Numeric hữu hạn; tỷ lệ 0..100, cân nặng/chiều cao/tần số/huyết áp >0 là ràng buộc toán học. **Không đặt normal/critical range hoặc tự cảnh báo lâm sàng** từ dữ liệu của một người trong PDF. Cặp huyết áp cùng group/time; thiếu một thành phần không tự đoán thành phần kia. Một quan hệ số bất thường chỉ được yêu cầu kiểm tra lại theo quy tắc chuyên môn, không sửa số gốc.

UUID numeric trong map khớp `VITAL_FIELD_MAP` hiện có. Adapter hiện tại cần bổ sung encode/decode obsGroup và trạng thái thiếu; chưa được coi là đã hỗ trợ chỉ vì nhận được map này.

LOINC/UCUM trong pack là mapping đích tham khảo FHIR R4. Chưa nạp `SAME-AS` hoặc xác nhận round-trip bằng riêng bảng mapping. `59408-5` chỉ phù hợp SpO2 đo pulse oximetry; phải xác nhận phương pháp. Nhóm BP native chưa tự thành FHIR BP panel/components. Người 4 kiểm tra trên đúng FHIR2 4.2.0.

## 5. Khám, dị ứng, chẩn đoán và thuốc

- **Bệnh sử/khám:** obs Text giữ đoạn văn. Tiền sử có trạng thái `not_asked`, `none_reported`, `present`, `unknown`; `present` cần nội dung. Không tự rút bệnh nền hay điểm đánh giá từ đoạn văn.
- **Dị ứng:** sàng lọc coded Obs có 4 trạng thái. Khi `present`, danh sách tác nhân/phản ứng dùng native Allergy sau B4. BE phải thống nhất obs sàng lọc với allergy list; không xóa dị ứng cũ khi lần khám mới chưa hỏi. Severity/reaction code không bịa từ triệu chứng.
- **Chẩn đoán:** dùng native Diagnosis, một dòng cho một bệnh, main/secondary và certainty. `dx.chinh`/`dx.kem_theo` là hợp đồng ứng dụng, không phải property REST mặc định. Danh mục có code, tên, system, version. Non-coded chỉ theo năng lực API và chính sách nhóm đã chọn; không mặc định coi free text là ICD-10.
- **Thuốc:** DrugOrder khác lần đã cấp/đã dùng. Dose mỗi lần, quantity cấp, duration và frequency tách riêng. Duration phải có durationUnits; không lấy số viên chia ra số ngày. Thuốc/đơn vị/đường/tần suất lấy từ metadata/danh mục đã duyệt, không suy hoạt chất từ tên thương mại.
- **Tái khám:** ngày dự kiến/lời dặn là Obs; Appointment có provider/service/location/slot riêng. Ghi lời dặn không tự tạo lịch hẹn.

## 6. MVP-2 và quyền

Các nhóm `order`, `result`, `document`, `appointment`, `bill`, `payment`, `dispense` mô tả đủ trường và validation để BE xây adapter. Trạng thái trong code list là trạng thái **ứng dụng**, không tự đồng nhất enum module OpenMRS; bảng ánh xạ native do BE/người 4 kiểm chứng.

Result gắn Order đúng patient/visit; raw value/unit/reference giữ theo phiếu. Tham chiếu bình thường khác ngưỡng nhập. Kết quả chưa có không tạo âm tính. File qua download có kiểm tra quyền, không URL công khai.

Tiền VND số nguyên, server tính tổng và chụp snapshot tên/giá. Thu/hoàn có idempotency, không vượt số còn nợ/đã thu. Quy tắc làm tròn số lượng lẻ cần cơ sở chốt. Cấp thuốc dựa trên snapshot đơn xác nhận, không sửa đơn khi cấp.

Ma trận quyền lấy 8 role từ tài liệu nhóm, default deny. Account có thể kiêm nhiệm. Reception chỉ hành chính, cashier chỉ projection thu phí, lab chỉ order được giao, pharmacy chỉ snapshot đơn, manager chỉ aggregate. Admin ứng dụng không tự có quyền chart; Core admin dùng kiểm chứng không chứng minh role ứng dụng đã an toàn. CSV gói này không cấp privilege rộng để giả lập ma trận. B5 cần test read/search/write/download/print trên API.

## 7. Kiểm tra và nạp

### Kiểm tra cấu trúc trên máy bất kỳ

```powershell
python tools/metadata.py
python -m unittest discover -s metadata/tests -v
```

Kiểm tra UUID/key, answer/member, mã trường/đơn vị với FE, nguồn khảo sát, file sinh và 28 ca dữ liệu giả. Đây là kiểm tra cấu trúc, không thay kiểm chứng native API hoặc quyền.

Khi chỉnh nguồn:

```powershell
python tools/metadata.py --write
python tools/metadata.py
```

Không sửa CSV/map/bảng sinh bằng tay. Tăng version khi thay nội dung, cập nhật changelog và báo người dùng UUID/form/adapter.

### Nạp qua đúng baseline

Theo `DEVELOPMENT.md`, build backend để copy configuration, rồi khởi động. **Thử DATA-06 trên Compose project và volume riêng**; không reset volume đang làm việc.

```powershell
docker compose build backend
docker compose up -d --wait --wait-timeout 2400
python tools/metadata.py --verify-url http://127.0.0.1:8080/openmrs --report .runtime/reports/metadata-import.json
```

Lệnh verify chỉ GET metadata trên HTTP loopback, đọc credential từ `.env`, không in credential hoặc ghi patient. Có thể chọn `--settings-file` cho instance test khác. Nó kiểm tra entity UUID, retired, concept datatype/unit/answer/member, không kết luận đã chạy clinical workflow.

### Tiêu chí nghiệm thu tích hợp cho BE/người 4

1. Database test mới: nạp đủ 78 đối tượng được tham chiếu, trong đó location đã có; không có lỗi parse CSV.
2. Chạy lại cùng gói/restart: UUID và số lượng từng key giữ nguyên, không có đối tượng trùng.
3. Đổi nhãn một concept, giữ key/UUID, tăng version: nạp lại và form/map vẫn tham chiếu đúng; tên mới có UUID name mới.
4. Tạo **patient → visit → encounter → obsGroup** bằng dữ liệu giả, đọc lại numeric/unit/measuredAt/status, hai nhóm đo và hai lượt không ghi đè.
5. Birthdate partial, identity, Diagnosis/Allergy/DrugOrder và quyền kiểm tra bằng adapter/native API đã chốt. Chạy các ca `workflows.json` và ghi pass/fail thực tế.
6. Kiểm tra FHIR: code/system/unit/time/encounter, missing status và BP panel. Không đánh dấu tương thích FHIR chỉ vì endpoint trả 200.

## 8. BE cần nhận và còn cần cung cấp

BE có thể bắt đầu B2/B3 bằng identifier/attribute/type/concept CSV và map. B4/B8 dùng từ điển, form/role/DTO contract để chốt adapter. Các nguồn cần điền trong `externalCatalogues` là: ICD-10 có phiên bản, danh mục thuốc cơ sở, dịch vụ/giá và danh mục tỉnh/xã. Tên thuốc/giá trong một PDF không thay các nguồn này.

Người 3 chủ trì ý nghĩa/danh mục/UUID; người 1 nạp và xử lý module; người 4 xác nhận API/FHIR, role, round-trip và mock; người 2 đưa vào form. Bộ này không sửa CI, schema PostgreSQL, adapter FE hay cấu hình appointments/queue của người khác.

## 9. Nguồn kỹ thuật

- [Initializer 2.12.0: CSV conventions](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/csv_conventions.md), [concepts](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/concepts.md), [identifier types](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/pit.md), [person attributes](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/pat.md), [encounter types](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/et.md), [visit types](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/visittypes.md). Đã đối chiếu source tag commit `3a970226eeb4b6233902f7b114a5e4616bf5a65a`.
- [FHIR R4 Vital Signs](https://hl7.org/fhir/R4/observation-vitalsigns.html): mapping tham khảo, chưa thay báo cáo round-trip trên instance VinSHC.
- [BACKEND.md](BACKEND.md), [FRONTEND.md](FRONTEND.md), [khảo sát S01](DATA_DICTIONARY.md): phạm vi, DTO, source rows và phân công.
