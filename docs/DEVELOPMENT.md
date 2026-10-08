# Dựng môi trường OpenMRS cho nhóm

## 1. Bộ môi trường này làm gì?

Repo cung cấp cùng một cấu hình Docker Compose cho mọi thành viên. Mỗi người chạy một instance và database riêng trên máy của mình.

| Service | Vai trò |
| --- | --- |
| `gateway` | Điểm truy cập duy nhất từ trình duyệt; chuyển request đến frontend/backend |
| `frontend` | Giao diện OpenMRS 3 và các app từ baseline |
| `backend` | OpenMRS Core, REST, FHIR2, Initializer và các module của bản phân phối |
| `db` | PostgreSQL lưu hồ sơ và metadata |

Baseline dùng **Reference Application 3.7.1** và **PostgreSQL 16.15**. Frontend, gateway, PostgreSQL và image nền của backend được khóa digest. Backend của nhóm là một lớp build nhỏ từ image release đó. Thông tin nguồn, commit và phiên bản nằm trong [baseline.json](../config/baseline.json).

Backend giữ metadata nền của OpenMRS, bỏ các thư mục nội dung `referenceapplication-demo` và module sinh dữ liệu demo lớn. Cấu hình frontend demo cũng được tắt. Initializer nạp một location giả **VinSHC Development Clinic** với UUID ổn định và các tag Login/Facility/Visit từ `infra/backend/configuration/locations/vinshc/locations.csv`. Lớp build này không sửa mã Core/REST/FHIR2. Metadata và biểu mẫu Việt Nam thuộc các đầu việc tiếp theo trong [PROJECT_PLAN.md](../PROJECT_PLAN.md).

## 2. Chuẩn bị máy

- Git.
- Docker Desktop ở chế độ **Linux containers** trên Windows/macOS, hoặc Docker Engine trên Linux.
- Docker Compose v2 có các tùy chọn `--wait` và `--wait-timeout`.
- Python **3.11 trở lên**. Các script chỉ dùng thư viện chuẩn, không cần `pip install`.
- Dành đủ tài nguyên cho OpenMRS và database. Lần khởi tạo đầu gồm migration và nạp metadata, có thể mất nhiều phút. Máy kiểm chứng ban đầu cấp khoảng 8 GiB RAM cho Docker engine.

Kiểm tra trong terminal:

```powershell
docker version
docker compose version
python --version
```

`docker version` cần hiển thị cả Client và Server. Trên Windows, nếu engine chưa chạy, mở Docker Desktop hoặc dùng `docker desktop start` nếu CLI của máy có hỗ trợ. Python trên một số máy dùng lệnh `python3` hoặc `py`; thay `python` trong hướng dẫn bằng lệnh tương ứng.

## 3. Chạy lần đầu

Nếu đã chạy bản MariaDB trước đây, đọc [hướng dẫn chuyển PostgreSQL](POSTGRESQL_MIGRATION.md) trước. Bản này dùng volume DB và volume OpenMRS mới; nó không tự chuyển dữ liệu từ MariaDB.

Mở terminal tại thư mục repo rồi chạy lần lượt:

```powershell
python scripts/bootstrap.py
python scripts/check_config.py
docker compose pull --quiet --ignore-buildable
docker compose build --pull backend
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py
```

`bootstrap.py` tạo `.env` từ mẫu và sinh hai mật khẩu độc lập cho database và OpenMRS admin. Nếu `.env` đã có, script giữ nguyên file.

`check_config.py` kiểm tra image khớp baseline, digest, nguồn Dockerfile backend, readiness, volume và cổng localhost. Nó không in cấu hình đã nội suy mật khẩu.

`check_database.py` xác nhận DB đang chạy thật là PostgreSQL đúng phiên bản, dùng UTF8, có extension `fuzzystrmatch`/`uuid-ossp` và các bảng OpenMRS cần thiết. Extension được tạo khi DB mới khởi tạo từ `infra/postgres/initdb/001-openmrs-extensions.sql`.

`OMRS_DB_USER` là user khởi tạo của image PostgreSQL, có quyền quản trị cluster trong baseline local/CI này. Trước triển khai production cần tách quyền migration/quản trị khỏi tài khoản ứng dụng. Phần agent và `pgvector` chưa được triển khai; sau này dùng database riêng cho dữ liệu của agent.

Compose build backend từ Dockerfile của repo, chờ database khỏe, backend sẵn sàng, rồi khởi động frontend/gateway. `smoke.py` kiểm tra giao diện, đăng nhập, phiên bản các module cần thiết, từ chối truy cập trái phép, REST và FHIR trên hệ thống thật.

Truy cập **http://127.0.0.1:8080/openmrs/spa/**. Xem `EHR_ADMIN_USERNAME` và `EHR_ADMIN_PASSWORD` trong `.env` bằng editor để đăng nhập. Chọn **VinSHC Development Clinic** khi UI yêu cầu location.

Mật khẩu admin trong `.env` được dùng lúc tạo database lần đầu. Nếu sau đó đổi mật khẩu qua OpenMRS, cập nhật giá trị dùng cho smoke test trong `.env` cho phù hợp. Thay `.env` không phải cơ chế reset mật khẩu của database đã tồn tại.

## 4. Kiểm tra dữ liệu còn sau khi dựng lại container

Thực hiện trên instance local/test này:

```powershell
python scripts/smoke.py --create-fixture --report .runtime/reports/smoke-before.json
docker compose down
docker compose up -d --wait --wait-timeout 600
python scripts/smoke.py --require-fixture --report .runtime/reports/smoke-after.json
```

- Lần đầu tạo một bệnh nhân giả tên `Synthetic VinSHC Smoke`, một visit/encounter, observation số có đơn vị/thời gian và observation văn bản tiếng Việt dài, cùng metadata test cần thiết; UUID/mã được lưu vào `.runtime/smoke-fixture.json`.
- Lần sau đọc **chính hồ sơ đó** qua REST và FHIR, đối chiếu quan hệ, giá trị số, đơn vị, thời gian và văn bản; không tạo lại khi hồ sơ bị mất.
- `docker compose down` giữ hai named volume `postgres-data` và `openmrs-pg-data`.
- Các script smoke chỉ nhận địa chỉ HTTP loopback, để tránh gửi dữ liệu test tới hệ thống bên ngoài.

Khi muốn tạo môi trường thử nghiệm hoàn toàn khác, dùng một `COMPOSE_PROJECT_NAME` khác và đường dẫn `--fixture` khác. Database và fixture phải thuộc cùng instance.

## 5. Lệnh dùng thường xuyên

```powershell
# Trạng thái các service
docker compose ps --all

# Xem log backend; Ctrl+C để dừng theo dõi log
docker compose logs -f --tail 100 backend

# Dừng container, giữ dữ liệu
docker compose down

# Khởi động lại môi trường đã có
docker compose up -d --wait --wait-timeout 600

# Kiểm tra cấu hình và công cụ của repo
python scripts/check_config.py
python -m unittest discover -s tests -v

# Lưu log/status đã che mật khẩu cấu hình
python scripts/collect_diagnostics.py
```

Log và báo cáo nằm trong `.runtime/reports/`, được Git bỏ qua. Nếu chia sẻ log từ nguồn khác, kiểm tra nội dung trước khi gửi.

**Phân biệt dừng và xóa dữ liệu:** thêm `--volumes`/`-v` vào lệnh `down` sẽ xóa named volume của Compose project. Hướng dẫn local không tự thực hiện thao tác đó; CI chỉ xóa volume của project tạm thuộc chính lần chạy CI.

## 6. Các cấu hình thành viên có thể thay đổi

| Biến trong `.env` | Ý nghĩa |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | Tên instance và nhóm volume; mặc định `ehr-vinshc` |
| `EHR_HTTP_PORT` | Cổng trình duyệt trên localhost; mặc định `8080` |
| `OMRS_DB_USER`, `OMRS_DB_PASSWORD` | Thông tin khởi tạo database |
| `EHR_ADMIN_USERNAME`, `EHR_ADMIN_PASSWORD` | Tài khoản dùng cho kiểm chứng; username admin mặc định của baseline |
| `SPA_DEFAULT_LOCALE` | Locale frontend; baseline đang dùng `en` |

Nếu cổng 8080 đã dùng, đổi `EHR_HTTP_PORT`, chạy lại `check_config.py`, rồi `docker compose up -d --wait --wait-timeout 600`. Smoke tự đọc cổng mới.

Compose bind gateway vào `127.0.0.1`; database và backend không publish cổng ra máy host. Việc dựng một server dùng chung cho nhóm cần cấu hình và cách quản lý truy cập riêng.

Các mật khẩu sinh trong `.env` không chứa ký tự `$`, để tránh nội suy ngoài dự kiến của Compose. Khi tự thay mật khẩu, cần tuân theo cú pháp file env của Docker Compose.

## 7. Phát triển theo vai trò

| Thành viên | Cách bắt đầu |
| --- | --- |
| Người 1 — Backend | Dựng baseline, đọc danh sách module; bổ sung cơ chế build/load module riêng khi có đầu việc cần sửa |
| Người 2 — Frontend | Kiểm tra các app có sẵn; khi sửa mã frontend, dùng dev server của package được chọn và nối tới backend Docker |
| Người 3 — Metadata | Khảo sát metadata/form hiện có; chuẩn bị cấu hình có UUID ổn định, rồi cùng người 1 kiểm chứng cách nạp |
| Người 4 — Integration | Chạy smoke/fixture; bổ sung API test và E2E cho chức năng nhóm phát triển |

Frontend/gateway hiện dùng image upstream. Backend có Dockerfile riêng để tạo baseline nhẹ từ release ổn định. Metadata của nhóm dưới `infra/backend/configuration/` được copy vào cấu hình distribution khi build; sau khi sửa, chạy `docker compose build backend` rồi `docker compose up -d --wait --wait-timeout 600`. Initializer nạp thay đổi khi khởi động backend. Với mã frontend hoặc Java tùy biến, cần bổ sung cơ chế build/load tương ứng; tránh mount đè cả thư mục cấu hình upstream và mất metadata cần thiết.

CI hiện build lớp backend này rồi kiểm tra hệ thống chạy thật. Có lớp Hibernate và bản sửa migration Appointments cho PostgreSQL trong [postgresql/README.md](../infra/backend/postgresql/README.md); chưa có chức năng Java/frontend nghiệp vụ của nhóm. Khi nâng cấp upstream, phải kiểm chứng lại các bản sửa tương thích này.

## 8. Khi gặp lỗi

| Hiện tượng | Kiểm tra |
| --- | --- |
| Không kết nối được Docker engine | Docker Desktop/Engine đã chạy và dùng Linux containers chưa? |
| Pull image thất bại | Kết nối registry, proxy, dung lượng đĩa hoặc giới hạn pull; thử lại `docker compose pull --quiet --ignore-buildable` |
| `check_config.py` báo image khác baseline | Review thay đổi cùng `config/baseline.json`; không thay digest bằng tag động để bỏ qua kiểm tra |
| Backend còn `starting` | Xem log migration/Initializer; lần đầu nạp metadata lâu hơn những lần sau |
| Backend `unhealthy` hoặc timeout | Kiểm tra lỗi trong log và tài nguyên; chạy diagnostics trước khi thay cấu hình |
| Smoke đăng nhập thất bại | Đối chiếu mật khẩu của instance đang dùng với `.env`; giữ đúng Compose project |
| `--require-fixture` báo không tìm thấy hồ sơ | Kiểm tra đúng project/volume/fixture; đây là lỗi kiểm chứng cần điều tra |
| Cổng đã được dùng | Đổi `EHR_HTTP_PORT` và dựng lại gateway |

Không chạy lệnh prune toàn Docker engine để xử lý lỗi của repo: các project khác trên máy có thể đang dùng engine đó.

## 9. Thay phiên bản baseline

1. Chọn một release upstream và đọc thay đổi/phụ thuộc.
2. Xác minh image, tag và digest cho các kiến trúc cần dùng.
3. Cập nhật `compose.yaml`, `infra/backend/Dockerfile` và `config/baseline.json` cùng một PR.
4. Kiểm chứng trên database mới bằng một Compose project khác.
5. Kiểm chứng kế hoạch nâng cấp bằng dữ liệu giả đã tồn tại; backup trước khi đổi baseline của môi trường có dữ liệu cần giữ.
6. Cập nhật báo cáo và hướng dẫn nếu API hoặc cơ chế nạp cấu hình thay đổi.

Nguồn: [Reference Application 3.7.1](https://github.com/openmrs/openmrs-distro-referenceapplication/tree/3.7.1), [thiết lập O3](https://o3-docs.openmrs.org/en-US/docs/recipes/set-up-o3-instance/), [Initializer 2.12.0 — locations CSV](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.12.0/readme/loc.md), [phát triển module với Docker](https://openmrs.atlassian.net/wiki/spaces/docs/pages/1097891841/Backend+Module+Development+Using+Docker+No+SDK).
