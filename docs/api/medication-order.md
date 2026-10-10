# Medication và order

## Trạng thái B1

FHIR runtime ngày 10/10/2026 công bố `read`, `search-type`, `patch` cho `MedicationRequest`; không công bố `create` hoặc `update`. `ServiceRequest` chỉ công bố `read` và `search-type`. Vì vậy FE không dùng FHIR để tạo đơn/chỉ định ở B1.

OpenMRS Core có REST cho `order`/`drugorder`, và baseline có `ordertemplates`, nhưng chưa có fixture kiểm tra đầy đủ danh mục thuốc, liều, đơn vị, đường dùng, tần suất, số ngày, số lượng, trạng thái và người kê.

Contract ghi chỉ được chốt ở B4 sau khi metadata thuốc và privilege được bàn giao. Khi đó phải ghi request/response thực tế, UUID nguồn, lỗi validation, hậu điều kiện qua API và mapping FHIR đọc lại. Hiện trạng: **module/capability hiện diện, chưa nghiệm thu luồng kê đơn**.
