# ADR-0002: Dùng PostgreSQL làm database

- **Trạng thái:** Đã chấp nhận — chờ kiểm chứng kỹ thuật (BE-10)
- **Ngày:** 08/10/2026

## Bối cảnh

Baseline ban đầu dùng MariaDB 10.11, theo cấu hình mặc định của OpenMRS 3 Reference Application. Nhóm quyết định chuyển sang **PostgreSQL** vì:

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
5. Cho tới khi BE-10 được merge, `compose.yaml` vẫn dùng MariaDB. Kết quả trong [VALIDATION.md](../VALIDATION.md) là kết quả trên MariaDB.

## Tiêu chí hoàn thành BE-10

- [ ] Khởi tạo database mới trên PostgreSQL. Liquibase của Core và **mọi module trong distro 3.7.1** chạy hết, không lỗi.
- [ ] Danh sách module được kiểm tra, ghi rõ module nào đạt, module nào lỗi và cách xử lý. Ưu tiên kiểm tra các module MVP-2 cần: idgen, emrapi, appointments, queue, billing, stock management, attachments.
- [ ] Initializer nạp metadata đạt, nạp lại không tạo bản trùng.
- [ ] `smoke.py` đạt trước và sau restart, giữ volume.
- [ ] Healthcheck của service `db` dùng `pg_isready`. Volume trỏ tới thư mục dữ liệu PostgreSQL.
- [ ] Biến môi trường mới (ví dụ `POSTGRES_PASSWORD`) thay cho `MYSQL_ROOT_PASSWORD`. Script che mật khẩu được cập nhật theo.
- [ ] Hướng dẫn backup–restore bằng `pg_dump` / `pg_restore` đã chạy thử.
- [ ] CI chạy cả hai job trên PostgreSQL.

## Phương án đã cân nhắc

| Phương án | Ưu điểm | Nhược điểm |
| --- | --- | --- |
| Giữ MariaDB | Đúng mặc định upstream, cộng đồng dùng nhiều, đã kiểm chứng | Hai hệ database khi thêm EHRbase/OpenCR/warehouse ở tầng sau |
| **PostgreSQL (chọn)** | Một hệ database cho toàn bộ lộ trình; công cụ vận hành và mở rộng mạnh | Ít triển khai OpenMRS thực tế hơn; một số module có thể cần sửa hoặc thay |

## Hệ quả

- Nếu một module cần cho MVP không chạy được trên PostgreSQL, nhóm ghi lỗi, báo upstream và chọn một trong các cách: đóng góp bản sửa, thay module, hoặc lùi module đó khỏi MVP. Không âm thầm quay lại MariaDB; muốn đổi lại phải sửa ADR này.
- Dữ liệu giả và fixture hiện có trên MariaDB không chuyển sang. Database PostgreSQL được khởi tạo mới.
- Thành viên cần xóa volume MariaDB cũ hoặc dùng `COMPOSE_PROJECT_NAME` khác khi chuyển. Không dùng lại volume `db-data` cũ.
