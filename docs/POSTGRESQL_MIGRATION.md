# Chuyển baseline MariaDB sang PostgreSQL

Baseline hiện tại dùng **PostgreSQL 16.15**, không còn service MariaDB. Phiên bản OpenMRS Reference Application 3.7.1, Core 2.8.8 và 29 module được giữ; Docker backend bổ sung bản sửa PostgreSQL cho migration Appointments, đọc/ghi TEXT/BYTEA và cấp ID. Nguồn và cách build được ghi trong [postgresql/README.md](../infra/backend/postgresql/README.md). Image PostgreSQL được khóa bằng tag và digest trong `config/baseline.json`.

## Thành viên chưa chạy bản cũ

Làm theo [DEVELOPMENT.md](DEVELOPMENT.md). Không phải cài PostgreSQL trên máy host: DB chạy trong Docker.

## Thành viên đã có MariaDB

Các nhánh công việc như `fe` cần nhận thay đổi từ `main` (ví dụ `git fetch origin` rồi `git merge origin/main` trên nhánh đang làm việc) trước khi chạy baseline mới. Không tự ghi đè thay đổi chưa commit của thành viên khác.

Đây là thay đổi engine và khởi tạo database mới, **không phải công cụ chuyển toàn bộ dữ liệu bệnh án**. Không dùng MariaDB SQL dump hoặc volume `/var/lib/mysql` để nạp trực tiếp vào PostgreSQL. Với dữ liệu cần giữ, phải có kế hoạch xuất/nhập qua OpenMRS API hoặc công cụ chuyển đổi đã kiểm chứng; giữ nguyên UUID và các quan hệ, rồi đối chiếu dữ liệu sau chuyển.

1. Dừng backend để dữ liệu không thay đổi trong lúc sao lưu.
2. Sao lưu MariaDB, cấu hình `.env`, metadata tùy biến và file đính kèm trong volume OpenMRS. Đặt bản sao dưới `.runtime/` hoặc nơi riêng, không commit hay upload lên CI.
3. Dừng stack cũ bằng `docker compose down` với cấu hình MariaDB cũ, **không thêm `--volumes`**. Giữ bản cấu hình cũ để có thể chạy lại đúng các volume cũ.
4. Pull phiên bản repo PostgreSQL, giữ thông tin đăng nhập hiện có hoặc tạo `.env` mới. `MYSQL_ROOT_PASSWORD` không còn được sử dụng và có thể bỏ khỏi `.env`; không đổi mật khẩu để reset DB đã tồn tại.
5. Chạy các lệnh dựng baseline mới trong [DEVELOPMENT.md](DEVELOPMENT.md). PostgreSQL dùng volume `postgres-data`; backend dùng `openmrs-pg-data`. Các volume MariaDB `db-data` và OpenMRS cũ `openmrs-data` không được tái sử dụng hay tự xóa.
6. Tạo fixture mới hoặc nhập dữ liệu đã kiểm chứng. File `.runtime/smoke-fixture.json` cũ thuộc DB cũ: sao lưu nó trước, rồi dùng `--fixture` khác cho DB mới. Không sửa fixture để che lỗi mất dữ liệu.
7. Chạy `check_database.py`, smoke REST/FHIR, kiểm tra đủ module, rồi kiểm chứng cùng hồ sơ còn sau `docker compose down`/`up`.

Sau khi chuyển xong, MariaDB không cần chạy nữa. Chỉ xóa các volume cũ khi đã đối chiếu dữ liệu và có bản sao lưu cần thiết; không dùng `docker system prune` để dọn stack này.

## Phạm vi dữ liệu của lần chuyển trên máy phát triển

Trước khi chuyển ngày 08/10/2026, instance local có 239 bảng MariaDB, một bệnh nhân giả của smoke test, không có visit, encounter hoặc observation. Không có dữ liệu bệnh án thật được chuyển từ `Sample_Data/`. SQL dump, cấu hình cũ và dữ liệu kiểm thử được lưu riêng dưới `.runtime/mariadb-backup-20261008/`; hai volume cũ được giữ lại.

Các thành viên có dữ liệu khác trên máy mình phải kiểm tra và sao lưu riêng. Bản sao lưu của một máy không đại diện cho dữ liệu trên máy khác.

## Tại sao dùng volume OpenMRS mới?

Volume ứng dụng chứa runtime properties, cache/index, module và trạng thái nạp metadata. Dùng volume mới giúp khởi tạo lại đúng JDBC PostgreSQL và metadata trên DB mới, đồng thời giữ nguyên bộ volume cũ để phục hồi khi cần. File đính kèm cũ cần được chuyển cùng hồ sơ theo kế hoạch riêng.

## Nguồn kỹ thuật

- [OpenMRS Core 2.8 release notes](https://github.com/openmrs/openmrs-core/releases/tag/2.8.0): hỗ trợ PostgreSQL trong cài đặt và sửa lỗi tương thích.
- [PostgreSQL official Docker image](https://hub.docker.com/_/postgres): khởi tạo DB, credentials, volume và script initdb.
- `config/baseline.json`: phiên bản, digest và danh sách module của bản đang được kiểm chứng.
