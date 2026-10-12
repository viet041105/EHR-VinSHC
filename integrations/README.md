# Khung tích hợp VinSHC

Thư mục này là ranh giới cho các tích hợp sau pilot. B8 chỉ định nghĩa hợp đồng và cơ chế bật/tắt; không gửi dữ liệu thật ra hệ thống bên ngoài.

`manifest.json` là danh sách adapter được phép biết đến. Tất cả adapter mặc định `enabled: false`; cấu hình triển khai phải cấp endpoint và secret từ secret store, không lưu credential trong Git. Một adapter chỉ được bật sau khi owner nghiệp vụ duyệt mapping, bảo mật, môi trường thử và quy trình đối soát.

Mỗi adapter triển khai cùng một cổng logic:

- `health`: kiểm tra khả năng kết nối mà không gửi hồ sơ bệnh nhân.
- `capabilities`: công bố version hợp đồng, chiều dữ liệu và nghiệp vụ hỗ trợ.
- `submit`: nhận envelope có `eventId`, `occurredAt`, `facilityUuid`, `patientUuid` (khi cần), `payload` và `payloadSha256`.
- `status`: đọc trạng thái theo `eventId`/external reference.
- `cancel`: chỉ có khi hệ thống đích và hợp đồng nghiệp vụ cho phép.

Yêu cầu chung: idempotency theo `adapter + facility + eventId`; timeout hữu hạn; retry có backoff và giới hạn; lỗi hết retry vào dead-letter để operator xử lý; log/audit không chứa payload lâm sàng hay credential; TLS và xác thực riêng từng adapter; inbound phải xác minh chữ ký/replay window trước khi ghi. Không adapter nào được tự thay đổi trạng thái lâm sàng hoặc thanh toán chỉ vì transport thành công.

Các tích hợp hiện được giữ ở trạng thái hợp đồng: BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS và PACS. Triển khai connector thật thuộc M6/B9 và cần test contract riêng.
