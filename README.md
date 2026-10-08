# EHR-VinSHC

Dự án phát triển bản phân phối OpenMRS phù hợp với luồng khám ngoại trú tại một cơ sở, sau đó mở rộng liên thông hồ sơ và AI tra cứu/tóm tắt có dẫn nguồn.

## Bắt đầu tại đây

Đọc [kế hoạch triển khai và phân công công việc](PROJECT_PLAN.md) để nắm phạm vi MVP, đầu việc của 4 thành viên, thứ tự phối hợp và tiêu chí nghiệm thu.

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

Baseline dùng OpenMRS Reference Application 3.7.1 và PostgreSQL 16.15. Backend được build từ image upstream đã khóa digest, giữ metadata nền và bỏ bộ demo lớn. Metadata và biểu mẫu Việt Nam tiếp tục làm theo kế hoạch.
