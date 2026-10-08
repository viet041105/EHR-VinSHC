# EHR-VinSHC

Bản phân phối OpenMRS 3 mã nguồn mở cho phòng khám tư nhân tại Việt Nam, thiết kế theo gói và adapter để mở rộng lên chuỗi phòng khám, bệnh viện, liên thông hồ sơ và AI tra cứu/tóm tắt có dẫn nguồn.

> Dự án đang phát triển và chỉ được kiểm chứng với dữ liệu giả. Chưa dùng cho dữ liệu bệnh nhân thật.

## Bắt đầu tại đây

Đọc [kế hoạch triển khai và phân công công việc](PROJECT_PLAN.md) để nắm phạm vi MVP, đầu việc của 4 thành viên, thứ tự phối hợp và tiêu chí nghiệm thu.

| Tài liệu | Nội dung |
| --- | --- |
| [Quy trình phòng khám](docs/CLINIC_WORKFLOW.md) | Vai trò, luồng khám, giấy tờ đầu ra |
| [Kiến trúc](docs/ARCHITECTURE.md) | Các tầng phòng khám → bệnh viện, phân loại module |
| [Tuân thủ Việt Nam](docs/VIETNAM_COMPLIANCE.md) | Checklist pháp lý và yêu cầu thiết kế |
| [Từ điển dữ liệu](docs/DATA_DICTIONARY.md) | Trường dữ liệu, ánh xạ FHIR/openEHR |
| [Quyết định kiến trúc](docs/decisions/) | ADR, gồm vai trò OpenMRS/openEHR |
| [Đóng góp](CONTRIBUTING.md) · [Bảo mật](SECURITY.md) | Quy tắc PR và báo lỗ hổng |

## Chạy baseline OpenMRS

Cần Docker đang chạy với Linux containers, Docker Compose v2 và Python 3.11+.

```powershell
python scripts/bootstrap.py
python scripts/check_config.py
docker compose pull --quiet --ignore-buildable
docker compose build --pull backend
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py
```

Mở **http://127.0.0.1:8080/openmrs/spa/**. Đăng nhập bằng `EHR_ADMIN_USERNAME` / `EHR_ADMIN_PASSWORD` trong file `.env` vừa được tạo; chọn **VinSHC Development Clinic** khi được hỏi location.

- [Hướng dẫn cho thành viên](docs/DEVELOPMENT.md): chạy/dừng, giữ dữ liệu, kiểm chứng restart và xử lý lỗi.
- [CI](docs/CI.md): các check trên PR và kiểm tra REST/FHIR/persistence.
- [Baseline được khóa](config/baseline.json): nguồn upstream, phiên bản và image digest.
- [Kết quả kiểm chứng](docs/VALIDATION.md): đã chạy thật những gì và các giới hạn còn lại.
- [Chuyển từ MariaDB sang PostgreSQL](docs/POSTGRESQL_MIGRATION.md): dành cho thành viên đã chạy baseline cũ.

Baseline dùng OpenMRS Reference Application 3.7.1 và PostgreSQL 16.15. Backend được build từ image upstream đã khóa digest và các bản sửa tương thích PostgreSQL; giữ metadata nền và bỏ bộ demo lớn. Xem [ADR-0002](docs/decisions/0002-postgresql.md) và [kết quả kiểm chứng](docs/VALIDATION.md).

## Frontend VinSHC độc lập

Giao diện tiếng Việt và các nghiệp vụ theo kế hoạch: xem [frontend/README.md](frontend/README.md) và [thiết kế/hợp đồng bàn giao FE–BE](docs/FRONTEND.md). Chạy `npm run dev` tại gốc repo, mở http://127.0.0.1:5173. Lệnh này dùng Node.js/npm và Python 3, không cần cài dependency để mở giao diện. Đây là dữ liệu giả; giao diện chưa đọc/ghi hồ sơ OpenMRS thật.
