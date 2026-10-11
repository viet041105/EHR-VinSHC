# FHIR R4 mapping

Endpoint capability: `GET /openmrs/ws/fhir2/R4/metadata`. Runtime phải trả `CapabilityStatement` với `fhirVersion=4.0.1`.

| Resource | Capability công bố | Đã kiểm tra bằng fixture |
| --- | --- | --- |
| Patient | create/delete/patch/read/search/update | Read/search cùng UUID và identifier với REST |
| Encounter | create/delete/patch/read/search/update | B3 read cùng encounter UUID, đúng patient và period; resource này ánh xạ OpenMRS Encounter, không phải Visit |
| Observation | create/delete/patch/read/search/update | B3 read nhóm sinh hiệu và B4A read nhóm phiếu khám qua `hasMember`; parent có encounter, child liên kết qua parent group |
| Condition | create/delete/patch/read/search/update | Chưa; chờ ICD-10/mapping |
| AllergyIntolerance | create/delete/patch/read/search/update | Chưa; chờ metadata dị ứng |
| MedicationRequest | patch/read/search | Chưa; không công bố create/update |
| ServiceRequest | read/search | Chưa |

Tên interaction trong bảng được rút gọn từ `search-type` thành `search`. Báo cáo máy đọc giữ nguyên code do server công bố tại `.runtime/reports/smoke*.json`.

Giới hạn quan trọng:

- Visit OpenMRS không được coi là FHIR Encounter chỉ vì tên gần nhau.
- Capability công bố không chứng minh payload ghi, validation, quyền hoặc mapping nghiệp vụ đúng.
- B3/B4A đã xác nhận Encounter/Observation bằng metadata chính thức. Code hiện vẫn là UUID OpenMRS do chưa nạp mapping thuật ngữ đã thẩm định; huyết áp chưa được biểu diễn thành panel/components chuẩn.
- Sửa/void được kiểm tra qua REST Core; chưa tuyên bố tương đương update/delete qua FHIR. Mapping đầy đủ, provenance và nhiều lượt khám thuộc B7.
