# Kiểm chứng baseline PostgreSQL

**Ngày kiểm chứng local:** 08/10/2026, UTC+7. Trạng thái từng run trên GitHub được ghi riêng tại [GitHub Actions](https://github.com/viet041105/EHR-VinSHC/actions).

## Phiên bản

| Thành phần | Phiên bản |
| --- | --- |
| Host | Windows, Docker chạy Linux containers |
| Docker CLI / Compose | 28.4.0 / 2.39.4 |
| Python | 3.11.9 |
| Reference Application / Core | 3.7.1 / 2.8.8 |
| PostgreSQL | 16.15-bookworm; image khóa digest |
| REST / FHIR2 / Initializer | 3.5.0.69fa31 / 4.2.0 / 2.12.0 |
| Module | Đủ 29 module started, phiên bản khớp `config/baseline.json` |

Backend được build từ release upstream đã khóa digest, bỏ demo lớn, giữ metadata nền và thêm location giả. Phiên bản component gốc được giữ; bản sửa tương thích được lưu cùng nguồn trong [postgresql/README.md](../infra/backend/postgresql/README.md).

## Các lỗi phát hiện và đã xử lý

Đổi image database đơn thuần chưa đủ. Lần dựng PostgreSQL mới phát hiện SQL `AUTO_INCREMENT` trong Appointments, Hibernate đọc `TEXT` như OID và cấp ID qua `hibernate_sequence` không tồn tại. Bản cuối backport migration PostgreSQL của Appointments và bổ sung dialect Hibernate dùng TEXT/BYTEA cùng identity theo bảng. Không bỏ module để làm smoke vượt qua.

Stock Management có nhiều migration và truy vấn metadata; lần khởi tạo đầu trên máy này mất khoảng 25 phút. CI/local cho phép chờ 2.400 giây; khởi động lại với schema đã có dùng 600 giây. Không bỏ qua changeset hay vô hiệu hóa migration để giảm thời gian.

## Kết quả local

| Kiểm chứng | Kết quả |
| --- | --- |
| Compose, digest/build, dialect, localhost binding và volume | Đạt |
| Regression tests của công cụ | 21/21 đạt |
| Workflow qua actionlint 1.7.12 | Đạt |
| PostgreSQL thật: 16.15, UTF8, fuzzystrmatch, uuid-ossp, schema 239 bảng | Đạt |
| Bốn service healthy và đủ 29 module started | Đạt |
| O3 HTML/import map và JavaScript app shell/login qua gateway | Đạt |
| REST authentication và chọn VinSHC Development Clinic | Đạt |
| Từ chối mật khẩu sai và truy cập Patient REST/FHIR không đăng nhập | Đạt |
| FHIR R4 capabilities và tìm Patient qua REST/FHIR | Đạt |
| Tạo/đọc bệnh nhân giả, visit, encounter, observation số 36.7 với đơn vị degC | Đạt |
| Quan hệ Patient/Visit/Encounter/Observation và thời gian | Đạt |
| Observation tiếng Việt dài và mô tả concept; đọc qua REST/FHIR | Đạt |
| Dựng lại container, giữ volume, đọc chính fixture trước đó | Đạt trên project PostgreSQL độc lập |
| Giữ UUID/mã bệnh nhân giả cũ từ MariaDB và xác nhận qua REST/FHIR | Đạt |
| Dump PostgreSQL và restore sang volume của project chính | Đạt; API và schema được kiểm tra lại sau restore |

Môi trường kiểm chứng độc lập dùng project, volume, cổng và mật khẩu DB riêng. Project chính dùng `postgres-data` / `openmrs-pg-data`; mật khẩu admin hiện có được giữ. Chuyển sang project chính bằng dump PostgreSQL đã kiểm chứng giúp đồng thời kiểm tra backup–restore. Đây là database phát triển chứa dữ liệu giả, không phải bài kiểm thử phục hồi production hoặc chuyển bệnh án thật.

Bản sao MariaDB, `.env`/Compose cũ và fixture cũ nằm trong `.runtime/mariadb-backup-20261008/`. Hai volume MariaDB/OpenMRS cũ được giữ nguyên, không còn được dùng bởi Compose mới. Bản dump PostgreSQL nằm dưới `.runtime/postgres-backup-20261008/`. Các file riêng này được Git bỏ qua; CI không upload chúng.

Báo cáo REST/FHIR local nằm trong `.runtime/reports/`: `postgres-before.json`, `postgres-after.json`, `postgres-main-before.json`, `postgres-main-after.json`, cùng báo cáo database và diagnostics đã che credentials. Fixture mới gồm dữ liệu số và văn bản; kiểm tra sau restart dùng `--require-fixture`, không tạo lại dữ liệu bị mất.

## Giới hạn

- Các kết quả trên là kiểm chứng local. Workflow GitHub dựng database mới từ đầu; xem run tương ứng trong Actions để biết kết quả runner.
- Chưa nghiệm thu E2E trên trình duyệt, toàn bộ nghiệp vụ của 29 module, biểu mẫu Việt Nam, phân quyền nghiệp vụ, đầy đủ mapping FHIR hoặc agent/pgvector.
- Kiểm tra TEXT đã chạy qua API thật. Luồng tải file/complex observation và dữ liệu BLOB nghiệp vụ chưa được nghiệm thu.
- Upstream vẫn có thông báo cấu hình Address Hierarchy/XML module và cảnh báo của Tomcat/FHIR. Module đã started và các API nêu trên đạt; chức năng phụ thuộc các cấu hình này cần được nhóm kiểm chứng riêng.
- Không dùng MariaDB SQL dump trực tiếp cho PostgreSQL. Dữ liệu khác trên máy thành viên cần kế hoạch chuyển và đối chiếu riêng theo [POSTGRESQL_MIGRATION.md](POSTGRESQL_MIGRATION.md).

Hướng dẫn chạy nằm trong [DEVELOPMENT.md](DEVELOPMENT.md); phạm vi workflow nằm trong [CI.md](CI.md).
