# Chính sách bảo mật

## Phạm vi hỗ trợ

Dự án đang ở giai đoạn phát triển và chỉ được kiểm chứng với dữ liệu giả. **Chưa có phiên bản nào được khuyến nghị cho dữ liệu bệnh nhân thật.** Các điều kiện trước khi pilot nằm trong [docs/VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật).

## Báo lỗ hổng

- Dùng tính năng **Report a vulnerability** (private vulnerability reporting) trong tab Security của repo GitHub. Không mở issue công khai.
- Mô tả: phiên bản/commit, cách tái hiện, ảnh hưởng dự kiến. Không gửi kèm dữ liệu bệnh nhân thật.
- Nhóm sẽ xác nhận đã nhận báo cáo và thông báo hướng xử lý. Thời hạn phản hồi cụ thể được chốt khi dự án có người trực bảo mật.

Lỗ hổng thuộc thành phần upstream (OpenMRS Core, các module, app O3, PostgreSQL) nên được báo đồng thời cho dự án gốc theo chính sách của họ.

## Nguyên tắc trong repo

- Bí mật không nằm trong Git; `.env` được tạo local bằng `scripts/bootstrap.py`.
- Gateway chỉ bind `127.0.0.1` trong cấu hình phát triển; database và backend không publish cổng ra host.
- Báo cáo và log được che mật khẩu cấu hình trước khi lưu.
- Image và GitHub Actions được khóa bằng digest/commit SHA.
