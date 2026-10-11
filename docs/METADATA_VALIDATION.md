# Kiểm chứng bộ metadata 0.2.0

**Ngày:** 11/10/2026. **Baseline đối chiếu:** RefApp 3.7.1, Core 2.8.8, Initializer 2.12.0. **Nhánh:** role-3-metadata. Đã đọc B2/B3 trên `clinic-backend@9a16734`, không chạy lại integration test của nhánh BE.

## Đã chạy và đạt trên gói này

| Kiểm tra | Kết quả |
| --- | --- |
| `python tools/metadata.py` | 180 field, 78 entity UUID, 13 file sinh đồng bộ; 28 ca gốc + 47 ca B2/B3 cho kết quả cấu trúc như mong đợi |
| `python -m unittest discover -s metadata/tests -v` | 44 test: 18 test metadata gốc + 26 test B2/B3 về row identity/primary/void/source, missing reasons, phone, catalogue version/parent/hiệu lực, BP link/time/number và update |
| `python -m unittest discover -s tests -v` | 23 regression test nền pass |
| `python scripts/check_config.py` | Pass baseline/config Docker; không đổi image, CI, schema PostgreSQL hoặc FE adapter |
| Catalogue nguồn | Đọc đủ hai phần Công báo bằng pdfplumber: 34 tỉnh/thành, 3.321 đơn vị cấp xã; số đơn vị từng tỉnh khớp văn bản. pypdf độc lập cũng ra 3.321 dòng; 3 lệch khoảng trắng do extraction đã đối chiếu ảnh trang gốc, JSON đúng tên. Manifest giữ SHA hai PDF và records |
| Mapping / nguồn | 8 UUID/unit khớp FE và BE; đối chiếu FHIR R4 BP/Vital Signs, từng trang code LOINC và release 2.83. Người dùng xác nhận phương pháp SpO2; chưa có người duyệt thuật ngữ |
| Overlay update | CLI tạo overlay 0.2.1 riêng và chạy validate_pack trên overlay; unit test xác nhận giữ toàn bộ entity key/UUID/datatype/unit/answers/members/fields. Chỉ đổi label/note mạch và version các file liên quan |
| Dữ liệu bàn giao | Chỉ dùng bệnh nhân/contact/provider giả. Catalogue hành chính là dữ liệu công khai; PDF S01 và giá trị người bệnh không đưa vào gói |

78 entity vẫn gồm một location có sẵn và 77 đối tượng managed (4 identifier type, 2 visit type, 4 encounter type, 3 encounter role, 8 person attribute type, 56 concept). Hai provider fixture **không nằm trong số managed được Initializer nạp**, chưa được provision. Contacts/fieldStates/phoneNormalized/catalogue và FHIR panel là adapter contract, không tự tạo bảng hoặc endpoint mới.

## Những mục chưa chạy / chưa nghiệm thu

- Clean install/import lần hai/update bằng Initializer trên backend với gói 0.2.0/overlay 0.2.1; chưa có báo cáo runtime import của phiên bản này.
- Persistence/round-trip contacts, fieldStates, phone normalized, địa chỉ version/snapshot, UUID ownership và transaction đồng thời.
- Provider fixture provision, nhân sự thật, role/privilege và grant nurse/doctor; quyền API/search/download/print vẫn cần B5.
- Canonical identifier.system thực sự xuất qua FHIR2/projection; BP components/partial/search/derivedFrom/encounter trên runtime.
- LOINC release lookup/clinical equivalence/approver. Mapping đều disabled; SpO2 method confirmation không tự thay thế clinical approval.
- Thay đổi địa giới sau bản gốc 01/07/2025 và conversion cũ-mới từ nguồn có thẩm quyền; legacyMappings rỗng không có nghĩa không có tiền thân.
- Native Diagnosis/Allergy/DrugOrder, partial DOB registration, ICD-10/thuốc/dịch vụ/giá, form engine và workflow vận hành đầy đủ.

Ở bản 0.1.0 ngày 10/10/2026 từng gặp Docker engine không kết nối được; đó là ghi nhận lịch sử, không phải kết quả probe ngày hôm nay. Kết quả chạy B2/B3 được BE ghi trên nhánh của họ không chứng minh các adapter/field mới của 0.2.0 đã hoạt động.

## Lần kiểm chứng runtime tiếp theo

Theo [bàn giao B2/B3](METADATA_B2_B3.md#6-gói-update-và-cách-chạy-kiểm-chứng), dùng project/volume test riêng và dữ liệu giả. Ghi commit/version, logs import đã che credential, số entity/UUID trước-sau, round-trip, quyền và test overlay. `tools/metadata.py --verify-url` chỉ GET domain metadata, không thay thế nghiệm thu adapter/workflow/FHIR/quyền.
