# Diagnosis và allergy

## Trạng thái B1

FHIR R4 `CapabilityStatement` runtime ngày 10/10/2026 công bố `create`, `delete`, `patch`, `read`, `search-type`, `update` cho `Condition` và `AllergyIntolerance`. Đây chỉ là capability được công bố; B1 chưa gửi request ghi cho hai resource này.

Nguồn OpenMRS dự kiến là diagnosis/condition và allergy gắn với patient/encounter. Contract request, status nghiệp vụ, quyền, search parameter và hậu điều kiện chỉ được chốt sau khi có:

- concept ICD-10 và mapping có nguồn/phiên bản;
- concept/phân loại dị ứng và quy tắc “chưa hỏi” so với “không có”;
- encounter type và role/privilege chính thức;
- fixture ghi rồi đọc lại qua REST/FHIR.

FE không được dựa vào tên endpoint hoặc CapabilityStatement để tự suy ra payload. Cho đến B4, trạng thái hỗ trợ là **khảo sát capability, chưa nghiệm thu API ghi**.
