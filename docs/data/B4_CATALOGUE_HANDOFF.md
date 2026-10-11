# Bàn giao danh mục cho B4

Backend B4 (module `vinshc` 0.3.0) đã sẵn sàng nhận danh mục, nhưng **chưa có danh mục thật**. Tài liệu này liệt kê việc người phụ trách metadata (DATA-02, DATA-03) cần bàn giao để chẩn đoán, dị ứng và đơn thuốc chạy với dữ liệu thật. Không cần sửa code: chỉ cần nạp concept bằng Initializer và đặt global property.

Kiểm tra trạng thái bất cứ lúc nào bằng `GET /openmrs/ws/rest/v1/vinshc/clinical-configuration`. Mỗi mục có `ready: true` khi đã cấu hình đúng.

## 1. ICD-10 (DATA-03)

| Cần có | Ghi chú |
| --- | --- |
| Một concept reference source cho ICD-10 | Ghi rõ nguồn (ví dụ danh mục ICD-10 theo quyết định của Bộ Y tế) và `uniqueId` là URI hệ mã dùng cho FHIR |
| Concept lớp `Diagnosis` cho từng mã dùng ở phòng khám | Tên tiếng Việt là tên ưu tiên ở locale `vi` |
| Mapping `SAME-AS` từ concept tới reference term của source trên | Một concept chỉ map một mã ICD-10 |
| GP `vinshc.diagnosis.icd10ConceptSourceUuid` | UUID của concept source |
| GP `vinshc.diagnosis.icd10CatalogueVersion` | Nhãn phiên bản danh mục, trả về cùng mọi chẩn đoán |

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

## 4. Khi nạp danh mục thật

1. Nạp bằng Initializer (domain `conceptsources`, `concepts`, `drugs`, `orderfrequencies`, `globalproperties`) trên database mới, rồi nạp lại để chứng minh không trùng.
2. Danh mục giả của test (`tests/integration/b4_catalogue.py`) chỉ đặt GP khi GP đang trống hoặc trỏ tới concept không tồn tại. Khi GP đã trỏ tới danh mục thật, test B4B **tự bỏ qua** (skip) để không ghi đè. Cần thêm một bộ test dùng mã thật trước khi đóng B4.
3. Trên database local đã chạy test, GP đang trỏ tới danh mục giả. Đặt lại GP sang danh mục thật (Initializer `globalproperties` sẽ ghi đè).
