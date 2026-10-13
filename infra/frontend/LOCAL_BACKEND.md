# Backend và database local đang nối với FE

Đã đối chiếu container thực tế ngày 13/10/2026. Hướng dẫn này dành cho project Docker
`vinshc-fe-local`, được quản lý bằng các lệnh `npm run backend:*` trong `infra/frontend`.

## Mã nguồn và công nghệ

- Source backend trong repo: `infra/backend/`, module Java tại
  `infra/backend/vinshc-module/`. Backend dùng OpenMRS Core 2.8.8 và module VinSHC.
- Metadata nguồn: `metadata/vinshc/`; bản FE dùng nằm ở `infra/frontend/metadata/`.
- Từ khi BE đã merge vào `main`, `npm run backend:build` build trực tiếp từ working tree
  (`compose.yaml` ở gốc repo + overlay `infra/frontend/compose.local.yaml`), image
  `vinshc-fe-local-backend:dev`. Sửa source BE cần chạy lại `backend:build` rồi `backend:up`.
  Thư mục `infra/frontend/.runtime/backend/` của quy trình cũ (xuất commit đã khóa) không còn được dùng.
- Database thật của stack là PostgreSQL 16.15, database `openmrs`; không phải
  localStorage hay dữ liệu JSON trong FE.
- Backend, PostgreSQL, giao diện OpenMRS O3 và gateway đều chạy trong Docker Desktop
  trên máy local. FE VinSHC chạy riêng bằng Vite.

## Truy cập dịch vụ

| Thành phần | Địa chỉ từ máy Mac | Container |
| --- | --- | --- |
| FE VinSHC | http://127.0.0.1:5173/connected.html | Vite chạy trên máy |
| Gateway / OpenMRS O3 | http://127.0.0.1:8080/openmrs/spa/ | `vinshc-fe-local-gateway-1` và `vinshc-fe-local-frontend-1` |
| REST API | http://127.0.0.1:8080/openmrs/ws/rest/v1/ | `vinshc-fe-local-backend-1` qua gateway |
| API VinSHC | http://127.0.0.1:8080/openmrs/ws/rest/v1/vinshc/ | Cùng backend |
| PostgreSQL | Mac: `127.0.0.1:15432`; nội bộ Docker: `db:5432`; database `openmrs` | `vinshc-fe-local-db-1` |

Vite chuyển tiếp `/openmrs` sang gateway cổng 8080. Overlay FE `compose.local.yaml`
mở PostgreSQL tại `127.0.0.1:15432` để DBeaver/pgAdmin trên máy Mac kết nối. Cổng
chỉ bind loopback, không mở trên mạng LAN. Các service trong Docker vẫn dùng
`db:5432`. Cấu hình baseline ở root giữ nguyên.

## Kết nối bằng DBeaver trên Mac

Chọn **New Database Connection → PostgreSQL**, nhập:

| Trường | Giá trị |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `15432` |
| Database | `openmrs` |
| Username | Giá trị `OMRS_DB_USER` trong `.env` ở gốc repo |
| Password | Giá trị `OMRS_DB_PASSWORD` trong cùng file `.env` |
| SSL | Tắt cho PostgreSQL local hiện tại |

Chọn **Test Connection**, tải PostgreSQL JDBC driver nếu DBeaver yêu cầu, rồi
**Finish**. JDBC URL tương ứng: `jdbc:postgresql://127.0.0.1:15432/openmrs`.
Trong Database Navigator mở **openmrs → Schemas → public → Tables** để xem bảng.
Credentials DB khác tài khoản admin dùng để đăng nhập FE.

Nếu dựng lại stack, chạy `npm run backend:up` trong `infra/frontend` để áp dụng
overlay này. Dữ liệu tiếp tục dùng volume PostgreSQL hiện có.

## Dữ liệu được lưu ở đâu?

| Dữ liệu | Named volume thực tế | Đường dẫn trong container |
| --- | --- | --- |
| Hồ sơ, tài khoản/role, metadata, audit, giao dịch | `vinshc-fe-local_postgres-data` | `/var/lib/postgresql/data` trong DB |
| Dữ liệu ứng dụng OpenMRS, runtime properties, module/cache, file đính kèm | `vinshc-fe-local_openmrs-pg-data` | `/openmrs/data` trong backend |

File đính kèm VinSHC được cấu hình tại `/openmrs/data/vinshc-attachments`.
Đây là dữ liệu bền vững trong volume; dừng hoặc tạo lại container vẫn giữ dữ liệu
nếu giữ volume. `npm run backend:down` giữ các volume này.

Trên macOS, volume nằm trong máy ảo Linux của Docker Desktop, không phải thư mục
database trong repo. Có thể xem tên và dung lượng ở **Docker Desktop → Volumes**.
Đường dẫn `/var/lib/docker/volumes/...` là đường dẫn phía Docker, không phải Finder.

Xem vị trí mount, không xuất biến môi trường/mật khẩu:

```sh
docker inspect vinshc-fe-local-db-1 vinshc-fe-local-backend-1 \
  --format '{{.Name}} {{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} => {{.Destination}}; {{end}}{{end}}'
```

## Mở database bằng terminal

Khi Docker đang chạy, lệnh sau mở `psql` ngay trong container, với phiên mặc định chỉ đọc:

```sh
docker exec -it vinshc-fe-local-db-1 sh -c \
  'PGOPTIONS="-c default_transaction_read_only=on" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Các lệnh có thể dùng trong `psql`:

```sql
\conninfo
\dt
SHOW server_version;
SELECT user_id, username, system_id, retired FROM users ORDER BY user_id;
SELECT COUNT(*) AS patient_count FROM patient;
SELECT COUNT(*) AS visit_count FROM visit;
\q
```

`\dt` liệt kê các bảng; `\d ten_bang` xem cấu trúc một bảng. Truy vấn tài khoản ở
trên chỉ lấy định danh/trạng thái, không lấy hash mật khẩu.

Thông tin DB cấu hình bằng `OMRS_DB_USER` / `OMRS_DB_PASSWORD` trong
`.env` ở gốc repo (do `npm run backend:prepare` / `scripts/bootstrap.py` tạo). Đây là tài khoản PostgreSQL, khác tài khoản
đăng nhập ứng dụng `EHR_ADMIN_USERNAME` / `EHR_ADMIN_PASSWORD`. File này chỉ ở máy
local, bị Git bỏ qua; không dùng `.env` của một project Docker khác để suy ra
credentials của `vinshc-fe-local`.

## Kiểm tra backend và kết nối API

Chạy từ thư mục `infra/frontend`:

```sh
npm run backend:status
docker logs --tail 100 vinshc-fe-local-backend-1
```

Kiểm tra session bằng tài khoản admin hiện có; curl sẽ hỏi mật khẩu trong terminal:

```sh
curl --user admin http://127.0.0.1:8080/openmrs/ws/rest/v1/session
```

API nghiệp vụ còn yêu cầu role/cơ sở hợp lệ và workspace headers do FE gửi sau khi
mở không gian làm việc. Hợp đồng nằm trong
[session-auth.md](../../docs/api/session-auth.md) và
[UI_BACKEND_MAP.md](UI_BACKEND_MAP.md).

Khi FE cũng đang chạy, `npm run test:live` kiểm tra đăng nhập và đọc API thật qua
Vite → gateway → OpenMRS → PostgreSQL, không tạo hồ sơ demo.

## Tài liệu có sẵn trong dự án

- [DEVELOPMENT.md](../../docs/DEVELOPMENT.md): dựng stack baseline, cổng, biến môi
  trường, healthcheck và log. Các lệnh `docker compose` ở đó dành cho cấu hình
  baseline tại root; với stack FE hiện tại dùng `npm run backend:*` để chọn đúng
  project, runtime và các compose overlay.
- [BACKEND.md](../../docs/BACKEND.md): phạm vi và tiến độ module backend.
- [POSTGRESQL_MIGRATION.md](../../docs/POSTGRESQL_MIGRATION.md): chuyển baseline
  từ MariaDB sang PostgreSQL và phân biệt các volume cũ/mới.
- [RECOVERY_RUNBOOK.md](../../docs/RECOVERY_RUNBOOK.md): sao lưu DB bằng `pg_dump`,
  sao lưu volume ứng dụng và quy trình phục hồi/kiểm tra.

Các tài liệu trên đã mô tả hạ tầng và vận hành. Trang này bổ sung tên container,
volume và cách xem/kết nối cụ thể cho môi trường FE đang chạy trên máy này.
