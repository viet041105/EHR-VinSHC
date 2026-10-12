# Bàn giao danh mục cho B4

Backend B4 (module `vinshc` 0.3.0) đã được kiểm thử với catalogue test metadata 0.3.0. Catalogue này có nguồn và phiên bản nhưng giữ `productionEnabled=false`; vì vậy vẫn cần người phụ trách metadata/nghiệp vụ phê duyệt catalogue production trước khi dùng dữ liệu thật. Adapter test nạp CSV Initializer rồi provision concept set, mapping và global property còn thiếu.

Kiểm tra trạng thái bất cứ lúc nào bằng `GET /openmrs/ws/rest/v1/vinshc/clinical-configuration`. Mỗi mục có `ready: true` khi đã cấu hình đúng.

## 1. ICD-10 (DATA-03)

| Cần có | Ghi chú |
| --- | --- |
| Một concept reference source cho ICD-10 | Ghi rõ nguồn (ví dụ danh mục ICD-10 theo quyết định của Bộ Y tế) và `uniqueId` là URI hệ mã dùng cho FHIR |
| Concept lớp `Diagnosis` cho từng mã dùng ở phòng khám | Tên tiếng Việt là tên ưu tiên ở locale `vi` |
| Mapping `SAME-AS` từ concept tới reference term của source trên | Một concept chỉ map một mã ICD-10 |
| GP `vinshc.diagnosis.icd10ConceptSourceUuid` | UUID của concept source |
| GP `vinshc.diagnosis.icd10CatalogueVersion` | Nhãn phiên bản danh mục, trả về cùng mọi chẩn đoán |
| GP `vinshc.diagnosis.icd10SelectableConceptSetUuid` | Concept set chỉ chứa mã được phép chọn; category có mapping nhưng bị khóa, ví dụ `E11`, không được nằm trong set này |

## 2. Dị ứng

| GP | Nội dung concept set |
| --- | --- |
| `vinshc.allergy.allergenConceptSetUuid.drug` | Tác nhân là thuốc. Nên dùng **chính concept của thuốc** trong danh mục thuốc để backend phát hiện xung đột dị ứng khi kê đơn |
| `vinshc.allergy.allergenConceptSetUuid.food` | Tác nhân thực phẩm |
| `vinshc.allergy.allergenConceptSetUuid.environment` | Tác nhân môi trường |
| `vinshc.allergy.reactionConceptSetUuid` | Phản ứng |
| `vinshc.allergy.severityConceptSetUuid` | Mức độ |
| `vinshc.allergy.allowNonCoded` | `true`/`false`: có nhận text tự do hay không. Cần quyết định của mentor/phòng khám. Nếu `true` thì concept `allergy.concept.otherNonCoded` của Core phải tồn tại |

## 3. Đơn thuốc (DATA-02, DATA-03)

| Cần có | Ghi chú |
| --- | --- |
| `Drug` cho từng chế phẩm | Tên, hàm lượng, concept thuốc |
| Concept set đơn vị liều → GP Core `order.drugDosingUnitsConceptUuid` | Ví dụ viên, ml |
| Concept set đường dùng → GP Core `order.drugRoutesConceptUuid` | Ví dụ uống, nhỏ mắt |
| Concept set đơn vị thời gian → GP Core `order.durationUnitsConceptUuid` | Mỗi đơn vị cần mapping `SAME-AS` sang SNOMED CT (ví dụ `258703001` = ngày; các đơn vị khác lấy đúng mã SNOMED CT mà Core `Duration` hỗ trợ), nếu không Core không tính được ngày hết hạn |
| Concept set đơn vị cấp → GP Core `order.drugDispensingUnitsConceptUuid` | Ví dụ viên, hộp |
| `OrderFrequency` cho từng tần suất | Concept lớp `Frequency` và `frequencyPerDay` |

## 4. Cách kiểm thử và nạp catalogue production

1. Catalogue test 0.3.0 được mount bằng [`compose.b4-metadata.yaml`](../../tests/integration/compose.b4-metadata.yaml). [`b4_metadata_catalogue.py`](../../tests/integration/b4_metadata_catalogue.py) đọc trực tiếp JSON versioned, tạo mapping/concept set ổn định và cấu hình GP trên instance test cô lập.
2. Chạy `VINSHC_B4_CATALOGUE=metadata` với `test_b4b_clinical.py`. Clean import, reimport/recreate và 9/9 test đã đạt ngày 12/10/2026; mã selectable và mã category bị khóa đều có ca kiểm tra.
3. Khi nạp production, dùng catalogue đã được duyệt với UUID/version/source ổn định, nạp trên database mới rồi nạp lần hai để chứng minh idempotent. Không bật `productionEnabled` cho catalogue test.
4. `tests/integration/b4_catalogue.py` chỉ là fallback synthetic. Không dùng mã `SYN-*` làm bằng chứng catalogue production.
