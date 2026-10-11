# Bàn giao bổ sung metadata để nghiệm thu B2/B3

**Bàn giao gốc B2/B3 của gói 0.2.0, ngày 11/10/2026, nhánh role-3-metadata.** Đối chiếu nhánh BE thực tế `origin/clinic-backend` tại commit `9a16734`, gồm tài liệu API và test B2/B3. Remote không có branch tên `be` tại lúc đối chiếu. Bản gốc có 180 trường, 78 UUID (1 location tham chiếu + 77 đối tượng do gói quản lý).

**Cập nhật checkout hiện hành:** gói 0.3.0 giữ các contract B2/B3 và identity này, bổ sung [B4–B9](METADATA_B4_B9.md) thành 205 field/234 identity. Recipe update hiện tại là 0.3.0→0.3.1; tham chiếu 0.2.1 bên dưới là lịch sử của bản bàn giao gốc. Kiểm chứng runtime của gói mới tách tại [METADATA_VALIDATION.md](METADATA_VALIDATION.md).

Phần bàn giao là contract/cấu hình/dữ liệu và kiểm tra cấu trúc. BE vẫn phải triển khai adapter, persistence, phân quyền và chứng minh round-trip. Báo cáo B2/B3 trên nhánh BE được đọc để đối chiếu; không coi đó là kết quả chạy gói 0.2.0 này.

## 1. Đối chiếu từng yêu cầu

| Yêu cầu BE | Đầu ra | Trạng thái / điều kiện nghiệm thu |
| --- | --- | --- |
| B2.1 contacts[] | [b2.json](../metadata/vinshc/contracts/b2.json), bảng trường, section lặp trong forms | Contract đầy đủ; BE cần lưu/đọc/void theo rowKey |
| B2.2 danh mục quan hệ | [contact-relationships.json](../metadata/vinshc/catalogues/contact-relationships.json) | 7 mã nội bộ, có nguồn/version/hiệu lực/retire; BE lưu snapshot |
| B2.3 trạng thái thiếu từng trường | `b2Missing` trong pack + [B2_FIELD_STATES.md](data/B2_FIELD_STATES.md) | 37 trường patient/contact, xác định null-only / lý do thiếu / cấm thiếu |
| B2.4 DATA-08 tỉnh/xã | [address-vn-19-2025.json](../metadata/vinshc/catalogues/address-vn-19-2025.json) | Đủ bản gốc 34 tỉnh/thành + 3.321 đơn vị cấp xã; cần kiểm tra thay đổi sau bản gốc và mapping địa chỉ cũ trước pilot |
| B2.5 identifier.system | `identifierSystems` trong pack, B2 và frontend map | Chốt 4 URI do dự án cấp, ổn định môi trường; BE cần thêm vào FHIR export |
| B2.6 điện thoại | Contract B2 + normalize_phone + ca giả | Giữ raw, chuẩn hóa riêng, lý do thiếu, không tự gộp bệnh nhân |
| B3.1 mapping 8 sinh hiệu | [B3_TERMINOLOGY.md](data/B3_TERMINOLOGY.md), [b3.json](../metadata/vinshc/contracts/b3.json) | Có UUID/code/system/release/quan hệ dự kiến/nguồn/ô người duyệt; chờ người chuyên môn, chưa nạp SAME-AS |
| B3.2 phương pháp SpO2 | B3/spo2/methodConfirmation | Người dùng đã xác nhận pulse oximetry ngày 11/10/2026; tên người duyệt chưa cung cấp |
| B3.3 FHIR huyết áp | B3/bloodPressure | Chọn panel/components, có quy tắc thiếu và liên kết group; BE/B7 triển khai export |
| B3.4 validation toán học | pack.rules + B3/validation + validate_bp_measurement | Contract cuối cùng về cấu trúc/toán học; không đặt ngưỡng lâm sàng |
| B3.5 provider | [providers.synthetic.json](../metadata/vinshc/catalogues/providers.synthetic.json) + B3/providers | 2 provider giả có code/UUID/role/location/hiệu lực; chưa tạo trên runtime; nhân sự thật/quyền thuộc B5 |
| B3.6 update/idempotency | [update-label.json](../metadata/vinshc/fixtures/update-label.json), CLI --prepare-update | Đã tạo/thẩm tra overlay 0.2.1, giữ mọi entity key/UUID; BE chạy clean/import lại/update trên instance test |

## 2. Contacts: cấu trúc đã chốt

Một Patient có **0..n** contact hành chính; không bắt người bệnh có contact mới được đăng ký. Mỗi request tối đa 100 row để giới hạn payload, không giới hạn tổng số contact lịch sử của một bệnh nhân.

| Thuộc tính DTO | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| rowKey | UUID, bắt buộc | UUID canonical chữ thường, server cấp một lần, giữ suốt vòng đời; không lấy tên/phone/index làm khóa |
| fullName | text, bắt buộc cho contact được tạo | 1-255 ký tự sau trim; contact thiếu tên trên tài liệu cần xem lại nguồn, không tự tạo người nhà giả |
| relationshipCode | code hoặc null có fieldState | FATHER/MOTHER/SPOUSE/CHILD/SIBLING/GUARDIAN/OTHER; quan hệ contact đối với bệnh nhân |
| relationshipVersion / relationshipName | snapshot, suy từ danh mục | Có code thì giữ version và nhãn lúc ghi; thiếu code thì cả hai null, không tạo OTHER để thay unknown |
| phone | text hoặc null có fieldState | Giữ chuỗi gốc, tối đa 64 ký tự |
| phoneNormalized / phoneNormalizationStatus | text hoặc null / code | Giá trị suy ra; missing/normalized/needs_review; không dùng fieldState riêng cho normalized |
| addressText | text hoặc null có fieldState | Giữ nguyên văn, tối đa 2.000 ký tự |
| priority | integer, bắt buộc | 1-9.999, không trùng giữa contact active |
| isPrimary | boolean, bắt buộc | Tối đa một contact active chính; mặc định false cho row mới |
| emergencyContact | boolean, bắt buộc | Cho phép nhiều contact khẩn cấp; độc lập với contact chính; mặc định false |
| status | active/void, bắt buộc | Hủy có lý do; không hard-delete; void contact không void Person được liên kết |
| linkedPersonUuid | UUID hoặc null, tùy chọn | Chỉ chọn Person đã tồn tại sau xác minh quyền/tồn tại; không tự tạo Person/Patient theo tên người nhà |
| source / recordedAt | object / timestamp có offset, bắt buộc | manual/paper/legacy_import/migration/api; nguồn giấy có documentUuid/page; nhập cũ có sourceReference |
| voidReason | text, bắt buộc khi void | Giữ actor/thời điểm trong audit phía server; không tin creator do FE gửi |

Quy tắc primary/priority phải được kiểm tra trên **toàn bộ contacts active sau PATCH**, kể cả những row không gửi trong request; validator fixture chỉ kiểm tra tập row được cung cấp. BE phải kiểm tra rowKey thuộc đúng patient, transaction đồng thời, quyền và Person link trên server. PATCH bỏ property/row là giữ nguyên, không có nghĩa xóa. Không tự đẩy contact thứ hai lên làm primary khi contact chính bị void.

Danh mục quan hệ 1.0.0 là quy ước nội bộ ngày 11/10/2026. Không tái dùng mã đã retire; mã thay thế có replacedBy/hiệu lực, lịch sử vẫn giữ code/name/version cũ. Các mã này chưa phải OpenMRS RelationshipType/HL7 code đã nạp; BE cần adapter nếu dùng Relationship native.

## 3. FieldStates và điện thoại

Mỗi trường B2 có policy riêng trong `pack.json`:

- `forbidden`: cần value đúng kiểu khi nghiệp vụ yêu cầu; không nhận null/fieldState. Ví dụ mã nội bộ/tên/rowKey/flags. Giới tính hành chính cho phép code `U`; độ chính xác ngày sinh có code `unknown`, không tự đoán dữ liệu.
- `null_only`: null hợp lệ nhưng không có lý do thiếu riêng. Ví dụ link Person chưa chọn, phoneNormalized chưa suy được, snapshot quan hệ khi code chưa có. Lý do thiếu thuộc trường nguồn.
- `field_states`: khi gửi null phải kèm đúng một lý do trong danh sách cho phép của trường. Hai trạng thái nguồn `masked`/`unreadable` cần nguồn giấy/nhập cũ; không chọn chúng như câu trả lời thông thường.

Ví dụ người bệnh từ chối cung cấp điện thoại: giá trị `patient.dien_thoai=null`, `phoneNormalized=null`, status chuẩn hóa là `missing`; kèm:

```json
{
  "fieldCode": "patient.dien_thoai",
  "rowKey": null,
  "context": "patient",
  "dataStatus": "refused",
  "source": {"kind": "manual", "recordedAt": "2026-10-11T13:00:00+07:00"},
  "recordedAt": "2026-10-11T13:00:00+07:00"
}
```

Với contact, context=`contact`, rowKey=UUID contact; BHYT lặp dùng context=`identifier`, rowKey=UUID identifier; địa chỉ lặp dùng context=`address`, rowKey=UUID address. Không dùng index mảng. Value và missing state không cùng tồn tại. Khi nhập lại value, bỏ trạng thái thiếu hiện tại trong cùng transaction và giữ audit cũ. Không ghi record `recorded` với null.

POST bỏ trường tùy chọn có thể khởi tạo `not_recorded` bởi server, nguồn hệ thống (`source.kind=api`, `sourceReference=server:registration:default_missing`); không suy thành đã hỏi hoặc câu trả lời phủ định. PATCH bỏ trường giữ nguyên; gửi null mới là yêu cầu xóa giá trị và ghi lý do. Native absence/null chưa đủ lưu fieldStates, BE cần persistence/projection riêng.

Điện thoại: giữ chính xác raw, chỉ bỏ dấu phân cách để parse. `090 123 4567` -> `+84901234567`; `024 1234 5678` -> `+842412345678`; `0084...` -> `+84...`; số quốc tế có `+` giữ country code. Chuỗi thiếu `0`/`+` như `901234567` cần kiểm tra, không tự thêm `+84`. Validation này kiểm tra cú pháp theo contract dự án, chưa chứng minh đầu số được cấp, chủ sở hữu hoặc liên lạc được. Số nguồn cũ sai cú pháp giữ raw/needs_review; nhập tay mới phải sửa trước lưu. Nguồn [ITU Việt Nam +84](https://www.itu.int/oth/T02020000E4/en), [E.164](https://www.itu.int/rec/T-REC-E.164).

## 4. DATA-08 và namespace định danh

Danh mục có code/name/parentCode/level/version/effectiveFrom/effectiveTo/legacyMappings và trang nguồn từng record. Code là **chuỗi**, ví dụ tỉnh `01`, phường Bạch Mai `00292`, parent=`01`. Phiên bản `VN-19-2025-2025-07-01` là bản gốc có hiệu lực 01/07/2025, lấy từ hai phần [Công báo Chính phủ](https://congbao.chinhphu.vn/van-ban/quyet-dinh-so-19-2025-qd-ttg-45430.htm). Manifest có SHA-256 hai PDF và toàn bộ records; không gọi đây là danh mục đã kiểm chứng mọi thay đổi đến 2026.

Đã đối chiếu số đơn vị từng tỉnh theo văn bản gốc. Hai thư viện đọc độc lập đều thu được 3.321 dòng; có ba khác biệt khoảng trắng do pypdf tách chữ tại 02437/12700/20740, đã xem ảnh trang gốc và xác nhận tên trong JSON. Các PDF/ảnh chỉ giữ ở `.runtime/metadata-sources`, không commit.

Địa chỉ được lưu snapshot: raw, địa chỉ trên giấy tờ cũ, code/tên tỉnh-xã, version, ngày áp dụng và nguồn. Bản mới theo hai cấp tỉnh -> xã, không ép nhập huyện. Địa chỉ chỉ có nguyên văn vẫn giữ được, không tạo mã giả. Nạp catalogue mới không sửa tên/code của địa chỉ lịch sử.

`legacyMappings=[]` nghĩa là **chưa có chuyển đổi cũ-mới đã xác minh**, không chứng minh đơn vị không có tiền thân. Bản nguồn này không cung cấp đầy đủ conversion: cần nghị quyết/nguồn chuyển đổi riêng, có priorVersion/priorCode, targetVersion/targetCode, kiểu rename/merge/split, hiệu lực, bằng chứng và người duyệt. Không tự ghép theo tên; chuyển một-nhiều cần người dùng lựa chọn. effectiveTo=null là chưa ghi nhận ngày kết thúc trong snapshot, không phải bảo đảm mã còn hiệu lực mãi.

Chốt identifier.system cho bốn loại là **`urn:uuid:<UUID identifier type đang có>`**, ghi đầy đủ trong pack/B2/frontend map. Đây là namespace ổn định do dự án cấp, dùng như nhau ở dev/test/prod, không phụ thuộc hostname và không tự nhận là URI quốc gia do cơ quan nhà nước công bố. Namespace mã nội bộ đại diện cơ sở VinSHC của giai đoạn hiện tại; khi thêm cơ sở cấp mã độc lập phải tách namespace hoặc bảo đảm giá trị unique toàn namespace. CCCD/BHXH/BHYT không tự merge người bệnh. BE cần bổ sung `identifier.system` trong FHIR2/projection; CSV này chưa tự làm FHIR2 xuất system.

| Loại | identifier.system đã chốt |
| --- | --- |
| Mã hồ sơ VinSHC | `urn:uuid:ca12ea64-d279-5cce-a2a9-e2c46446ac34` |
| CCCD | `urn:uuid:4e5406dc-8ff9-5486-98fa-5d95c6fe8233` |
| BHXH | `urn:uuid:d7902062-a695-5bf3-8764-acf7f43e3238` |
| BHYT | `urn:uuid:e2b901c3-d442-565b-bff5-841aff260d2d` |

## 5. Mapping sinh hiệu, BP và provider

8 dòng mapping có UUID hiện tại, LOINC dự kiến, system `http://loinc.org`, release đích 2.83, unit, quan hệ dự kiến, yêu cầu phương pháp/vị trí, nguồn và ô phê duyệt. Release dựa [LOINC release](https://loinc.org/news/category/loinc-release); cần kiểm tra terminology theo version và chuyên môn trước khi nạp. `SAME-AS` trong bảng là đề xuất, không tuyên bố đã tương đương. Khi local concept hẹp hơn code đích, review theo chiều `NARROWER-THAN` local -> đích.

SpO2 đã được người dùng xác nhận pulse oximetry ngày 11/10/2026. Candidate riêng là 59408-5; FHIR R4 oxygen-saturation dùng generic 2708-6 và có thể thêm 59408-5. Quan hệ local pulse-ox -> generic là hẹp hơn. Chưa có tên/ngày/bằng chứng của người duyệt chuyên môn nên `enabledForImport=false`. Không suy arterial blood gas, vị trí kẹp, thiết bị hoặc oxy hỗ trợ. Nguồn [LOINC 59408-5](https://loinc.org/59408-5), [FHIR R4 Vital Signs](https://hl7.org/fhir/R4/observation-vitalsigns.html).

Chọn **BP panel 85354-9**, components 8480-6/8462-4, unit mm[Hg], không có top-level value[x]. Có một số đo thì component còn lại có dataAbsentReason; giữ trạng thái nguồn để không mất phân biệt not_recorded/unknown. Hai số phải cùng patient/visit/encounter/group/measuredAt. Cả hai thiếu: giữ status đã đánh giá trong native group, không tạo BP numeric giả. Native group.vitals giữ nguyên; BE tạo projection panel có ID ổn định từ group UUID, resolve encounter qua parent, derivedFrom về Obs gốc. Parent hasMember đang có trên FHIR2 không tự chứng minh BP profile đã đạt. Nguồn [FHIR R4 BP](https://hl7.org/fhir/R4/bp.html).

`R_NUM`: actual JSON number hữu hạn, không bool/chuỗi/NaN/Infinity. `R_POS`: >0 cho tần số, cân nặng/chiều cao và BP. `R_PERCENT`: SpO2 0..100. `R_BP`: đúng nhóm/thời điểm/liên kết, không ghép hai lần đo, không tự đoán số thiếu. Tâm thu <= tâm trương chỉ cờ cần xác minh, không tự sửa số hoặc từ chối theo ngưỡng y khoa. Core hiện có thể nhận số âm/SpO2 101 theo bằng chứng BE: write adapter phải thực thi, không chỉ FE.

Provider fixture gồm điều dưỡng và bác sĩ giả: providerCode ổn định, UUID candidate, encounterRoleUuid đã có, location phát triển, active và hiệu lực. **Chưa tạo provider runtime**; BE phải provision/resolve qua API và đọc lại. Có metadata role không tự có quyền ghi. Bác sĩ ghi sinh hiệu khi được cấp grant rõ; B5 cung cấp nhân sự thật và privilege qua kênh quản trị bảo vệ.

## 6. Gói update và cách chạy kiểm chứng

```powershell
python tools/metadata.py
python -m unittest discover -s metadata/tests -v
python tools/metadata.py --prepare-update .runtime/metadata-update-0.2.1
```

Lệnh cuối cần thư mục **mới** dưới `.runtime`, tạo overlay đầy đủ pack/forms/permissions/contracts/changelog và CSV/map/bảng được sinh lại. Chỉ đổi label/note concept mạch, version 0.2.0 -> 0.2.1; datatype/unit/member/answer/key/UUID và fields giữ nguyên. Thư mục nguồn vẫn ở 0.2.0. Muốn sinh lại các đầu ra bình thường dùng `python tools/metadata.py --write`; không sửa CSV/map bằng tay.

BE cần một Compose project/volume test riêng, bắt đầu bản 0.2.0 và dữ liệu giả. Không reset volume đang dùng. Trình tự nghiệm thu:

1. Clean install: nạp đủ metadata được quản lý, resolve các UUID; contacts/address/provider mới chỉ tính đạt sau adapter/persistence/provisioning tương ứng.
2. Import lần hai/restart: số lượng/UUID từng key không đổi, không trùng; kiểm tra toàn bộ metadata bằng API và logs Initializer.
3. Chồng overlay 0.2.1 vào checkout test và rebuild: nhãn mạch mới đọc lại đúng, UUID/dữ liệu numeric/lịch sử/FE map cũ vẫn dùng được. ConceptName UUID có thể đổi khi đổi tên; Concept UUID phải giữ.
4. Test contact/fieldStates/phone/address round-trip, PATCH/void/history, sai patient/rowKey, concurrent primary/priority. Test identifier.system thực tế qua FHIR.
5. Test sinh hiệu gồm BP partial, sai link/time/unit/number; test nurse/doctor grant và provider hết hiệu lực. Mapping LOINC chỉ nạp sau người chuyên môn duyệt, sau đó kiểm tra BP components/search/encounter/units trên FHIR thực tế.

`--verify-url` vẫn chỉ đọc các domain metadata đã nạp; không thay thế test contacts, provider provision, catalogue persistence, quyền hay clinical workflow.

## 7. Còn cần ai xác nhận

- Người chuyên môn/mentor: người duyệt và bằng chứng cho từng mapping, phương pháp/vị trí mạch/nhiệt độ/chiều cao và các sinh hiệu còn lại. SpO2 có xác nhận phương pháp từ người dùng, chưa có phê duyệt thuật ngữ.
- Người 3 và cơ sở: phiên bản địa giới dùng pilot, nguồn conversion cũ-mới nào thật sự cần, danh mục thuốc/dịch vụ/ICD-10 của các mốc sau.
- BE/người 4: persistence/adapter/transaction, FHIR projection/system, provisioning provider và báo cáo clean/import-repeat/update/round-trip.

Không đánh dấu B2/B3 hoàn thành chỉ vì metadata structural pass. Bộ này bàn giao đủ contract kỹ thuật đã bổ sung và ghi riêng các điều kiện còn mở.
