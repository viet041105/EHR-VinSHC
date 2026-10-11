# Diagnosis và allergy

## Trạng thái sau B4A

FHIR R4 `CapabilityStatement` runtime ngày 10/10/2026 công bố `create`, `delete`, `patch`, `read`, `search-type`, `update` cho `Condition` và `AllergyIntolerance`. Đây chỉ là capability được công bố; B1 chưa gửi request ghi cho hai resource này.

Nguồn OpenMRS dự kiến là diagnosis/condition và allergy gắn với patient/encounter. Contract request, status nghiệp vụ, quyền, search parameter và hậu điều kiện chỉ được chốt sau khi có:

- concept ICD-10 và mapping có nguồn/phiên bản;
- concept/phân loại dị ứng và quy tắc “chưa hỏi” so với “không có”;
- encounter type và role/privilege chính thức;
- fixture ghi rồi đọc lại qua REST/FHIR.

B4A đã kiểm tra coded Obs `allergy.trang_thai` trong `group.consultation`: `no_known_allergy`, `unknown` và lịch sử hai lượt khám được giữ riêng. Đây là **sàng lọc**, không phải native Allergy và không được dùng để xóa allergy list cũ.

FE không được dựa vào tên endpoint hoặc CapabilityStatement để tự suy ra payload. Diagnosis/Condition và Allergy/AllergyIntolerance chi tiết vẫn là **khảo sát capability, chưa nghiệm thu API ghi** cho tới khi có catalogue ICD-10, tác nhân, phản ứng, mức độ và quy tắc đồng bộ được duyệt. Xem [consultation.md](consultation.md) cho phạm vi đã chạy thật.
