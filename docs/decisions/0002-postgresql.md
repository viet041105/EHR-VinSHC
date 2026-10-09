# ADR-0002: Dùng PostgreSQL làm database

- **Trạng thái:** Đã chấp nhận — đã triển khai trong baseline (BE-10)
- **Ngày:** 08/10/2026

## Bối cảnh

Cấu hình mặc định của OpenMRS 3 Reference Application dùng MariaDB. Nhóm chọn **PostgreSQL** vì:

- Một hệ quản trị dùng chung với các thành phần tầng sau: EHRbase (openEHR CDR), OpenCR, data warehouse và phần AI đều chạy tốt trên PostgreSQL.
- Có sẵn công cụ sao lưu, nhân bản, phân vùng và giám sát phù hợp khi mở rộng lên chuỗi phòng khám và bệnh viện.
- Hỗ trợ tốt JSON, tìm kiếm văn bản, mở rộng (ví dụ `pgvector` cho AI) và kiểm soát quyền chi tiết.

Thông tin kỹ thuật đã biết:

- OpenMRS Platform hỗ trợ PostgreSQL từ dòng 2.4, và ghi chú phát hành 2.8.0 nêu hỗ trợ PostgreSQL ngang MySQL. Baseline hiện chạy Core 2.8.8.
- Image Docker của OpenMRS Core chọn database bằng biến `OMRS_DB=postgresql` cùng `OMRS_DB_HOSTNAME`, `OMRS_DB_PORT`, `OMRS_DB_NAME`, `OMRS_DB_USERNAME`, `OMRS_DB_PASSWORD`. Các biến `OMRS_CONFIG_CONNECTION_*` đang dùng trong `compose.yaml` là dạng cũ.
- Phần lớn triển khai OpenMRS trong cộng đồng vẫn dùng MySQL/MariaDB. **Mỗi module của distro phải được kiểm chứng riêng**, vì changeset Liquibase hoặc truy vấn SQL viết riêng cho MySQL có thể lỗi trên PostgreSQL.

## Quyết định

1. PostgreSQL là database chính thức của dự án cho mọi tầng.
2. Việc chuyển đổi được làm trong một PR riêng (BE-10). PR đó cập nhật cùng lúc `compose.yaml`, `.env.example`, các script trong `scripts/`, test, CI, `config/baseline.json` và tài liệu.
3. Image PostgreSQL được khóa bằng digest giống các image khác. Phiên bản major được chốt trong BE-10 sau khi đối chiếu ma trận hỗ trợ của OpenMRS và các module. Bản đề xuất ban đầu là PostgreSQL 16.
4. Database dùng encoding `UTF8`, phù hợp tiếng Việt.
5. `compose.yaml` dùng PostgreSQL 16.15, image khóa digest. Bằng chứng kiểm chứng nằm trong [VALIDATION.md](../VALIDATION.md).

## Tiêu chí hoàn thành BE-10

- [x] Khởi tạo database mới trên PostgreSQL. Liquibase của Core và **mọi module trong distro 3.7.1** chạy hết, không lỗi.
- [x] Danh sách module được kiểm tra, ghi rõ module nào đạt, module nào lỗi và cách xử lý. Ưu tiên kiểm tra các module MVP-2 cần: idgen, emrapi, appointments, queue, billing, stock management, attachments.
- [ ] Initializer nạp metadata đạt, nạp lại không tạo bản trùng. *(Chuyển sang BE-04/DATA-06 khi có gói metadata Việt Nam.)*
- [x] `smoke.py` đạt trước và sau restart, giữ volume.
- [x] Healthcheck của service `db` dùng `pg_isready`. Volume trỏ tới thư mục dữ liệu PostgreSQL.
- [x] Biến môi trường chỉ dành cho PostgreSQL; không có biến MySQL/MariaDB. Script che mật khẩu được cập nhật theo.
- [x] Hướng dẫn backup–restore bằng `pg_dump` / `pg_restore` đã chạy thử. *(Đạt một lần local; runbook lặp lại được thuộc BE-07.)*
- [ ] CI chạy cả hai job trên PostgreSQL. *(Workflow đã cấu hình; chờ xác nhận run trên GitHub trong INT-07.)*

## Phương án đã cân nhắc

| Phương án | Ưu điểm | Nhược điểm |
| --- | --- | --- |
| Giữ MariaDB | Đúng mặc định upstream, cộng đồng dùng nhiều, đã kiểm chứng | Hai hệ database khi thêm EHRbase/OpenCR/warehouse ở tầng sau |
| **PostgreSQL (chọn)** | Một hệ database cho toàn bộ lộ trình; công cụ vận hành và mở rộng mạnh | Ít triển khai OpenMRS thực tế hơn; một số module có thể cần sửa hoặc thay |

## Hệ quả

- Nếu một module cần cho MVP không chạy được trên PostgreSQL, nhóm ghi lỗi, báo upstream và chọn một trong các cách: đóng góp bản sửa, thay module, hoặc lùi module đó khỏi MVP. Không âm thầm quay lại MariaDB; muốn đổi lại phải sửa ADR này.
