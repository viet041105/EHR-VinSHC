# API vận hành phòng khám B8

Base path: `/openmrs/ws/rest/v1/vinshc/operations`. API dùng Basic Auth và workspace headers như [hợp đồng phân quyền](authorization-audit.md). Mọi thao tác ghi đều kiểm tra privilege, facility scope, quan hệ patient/visit/encounter và state transition ở server.

## Ranh giới module

Các module appointments 2.1.0, queue 3.0.0 và billing 2.3.0 đã started nhưng schema/transition API của chúng không đủ ổn định để làm hợp đồng ứng dụng hiện tại. VinSHC dùng transaction adapter và bảng riêng có Liquibase migration, vẫn giữ OpenMRS là nguồn gốc patient/visit/encounter/provider. Chỉ định CLS tạo native `TestOrder`; cùng UUID đọc lại được qua FHIR `ServiceRequest`.

## Endpoint

| Nhóm | Endpoint | Hành vi chính |
| --- | --- | --- |
| Cấu hình | `GET /configuration` | Trả hai workflow metadata-driven, MIME/kích thước file và ranh giới production. |
| Lịch hẹn | `POST /appointments`; `GET /appointments/{uuid}`; `POST /appointments/{uuid}/transition` | Idempotency key, khóa trùng slot provider/location, state machine. |
| Hàng đợi | `POST /queue`; `GET /queue/{uuid}`; `POST /queue/{uuid}/transition`; `POST /queue/{uuid}/advance` | Số thứ tự theo điểm phục vụ/ngày/cơ sở, chuyển bước và lý do bỏ về. |
| Thu tiền | `POST /bills`; `GET /bills/{uuid}`; `POST /bills/{uuid}/cancel`; `POST /bills/{uuid}/receipts` | Snapshot giá, số nguyên VND, trả trước/trả sau, pending/settled. |
| Thanh toán | `GET /payments/{uuid}`; `POST /payments/{uuid}/settle`; `POST /payments/{uuid}/refunds` | Dấu vết người thu, hoàn tiền liên kết phiếu gốc, không xóa lịch sử. |
| CLS | `POST /service-orders`; `GET /service-orders/{uuid}`; `POST /service-orders/{uuid}/transition` | Native TestOrder + state adapter; prepay cần bill tương ứng đã thanh toán. |
| Kết quả | `POST /service-orders/{uuid}/results`; `GET /results/{uuid}`; `POST /results/{uuid}/corrections` | Kết quả số/văn bản, người nhập/duyệt, sửa bằng revision append-only. |
| File | `POST /service-orders/{uuid}/attachments?result={uuid}`; `GET /attachments/{uuid}`; `GET /attachments/{uuid}/content` | Multipart field `file`; PDF/JPEG/PNG, tối đa 20 MiB, sniff chữ ký file, SHA-256. |
| Mẫu in | `GET /documents/{template}/{sourceUuid}` | DTO cho `prescription`, `receipt`, `order`, `result`, `appointment`; số chứng từ ổn định. |
| Báo cáo | `GET /reports/daily?date=YYYY-MM-DD&facility={uuid}` | Tổng hợp lượt/doanh thu theo `Asia/Ho_Chi_Minh`, không trả định danh bệnh nhân. |

Các request tạo có `idempotencyKey` bắt buộc tại nơi phát sinh giao dịch. Cùng key và cùng payload trả lại bản ghi cũ; cùng key nhưng payload khác trả `409`. State transition không hợp lệ, slot trùng, thiếu thanh toán trả `409`; payload sai trả `400`; sai quyền/scope trả `403`.

## Giới hạn đã khóa

Catalogue hiện là synthetic và `productionEnabled=false`. Upload production vẫn tắt vì chưa có malware scanner/object storage; B8 chỉ nghiệm thu file private trong `/openmrs/data/vinshc-attachments`, kiểm tra byte/hash và quyền. Mẫu in trả DTO, không render PDF và không tuyên bố chữ ký điện tử hợp lệ pháp lý. BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS chỉ có hợp đồng disabled-by-default trong `integrations/`.

Kiểm chứng Docker nằm ở `tests/integration/test_b8_operations.py`; report local ở `.runtime/reports/b8-operations.json`.
