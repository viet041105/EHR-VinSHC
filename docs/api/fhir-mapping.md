# FHIR R4 mapping

Endpoint capability: `GET /openmrs/ws/fhir2/R4/metadata`. Runtime phải trả `CapabilityStatement` với `fhirVersion=4.0.1`.

| Resource | Capability công bố | Đã kiểm tra bằng fixture |
| --- | --- | --- |
| Patient | create/delete/patch/read/search/update | Read/search cùng UUID và identifier với REST |
| Encounter | create/delete/patch/read/search/update | Read cùng encounter UUID và đúng patient |
| Observation | create/delete/patch/read/search/update | Read cùng obs UUID, patient, encounter, value/unit hoặc text |
| Condition | create/delete/patch/read/search/update | Chưa; chờ ICD-10/mapping |
| AllergyIntolerance | create/delete/patch/read/search/update | Chưa; chờ metadata dị ứng |
| MedicationRequest | patch/read/search | Chưa; không công bố create/update |
| ServiceRequest | read/search | Chưa |

Tên interaction trong bảng được rút gọn từ `search-type` thành `search`. Báo cáo máy đọc giữ nguyên code do server công bố tại `.runtime/reports/smoke*.json`.

Giới hạn quan trọng:

- Visit OpenMRS không được coi là FHIR Encounter chỉ vì tên gần nhau.
- Capability công bố không chứng minh payload ghi, validation, quyền hoặc mapping nghiệp vụ đúng.
- B1 mới xác nhận Patient/Encounter/Observation synthetic. Mapping đầy đủ, provenance, timezone, sửa/void và nhiều lượt khám thuộc B7.
