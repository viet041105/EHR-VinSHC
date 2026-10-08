# CI cho baseline OpenMRS

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## 1. Khi nào chạy?

- Khi có pull request.
- Khi push vào `main`.
- Khi chạy thủ công bằng `workflow_dispatch` trong tab GitHub Actions, sau khi workflow có trên nhánh mặc định.

Workflow cần được commit/push lên GitHub mới được chạy trên runner. Kiểm chứng local và trạng thái GitHub Actions là hai bằng chứng riêng.

Kết quả kiểm chứng local hiện có trong [VALIDATION.md](VALIDATION.md).

## 2. Những gì được kiểm tra

### Job `Configuration and tooling`

1. Tạo `.env` tạm với mật khẩu ngẫu nhiên.
2. Validate Compose và image digest khớp baseline.
3. Chạy regression test cho bootstrap, cấu hình, che credential và smoke failure handling.
4. Validate cú pháp/hành vi workflow bằng actionlint có phiên bản và checksum cố định.

### Job `PostgreSQL, OpenMRS REST, FHIR and persistence`

1. Pull image đã khóa và build backend từ image release cố định, bỏ demo lớn và áp dụng bản sửa PostgreSQL đã lưu trong repo.
2. Dựng stack PostgreSQL trên runner mới và chờ các service khỏe; xác nhận version, UTF8, extension, schema OpenMRS, đủ 118 khóa ngoại Stock Management và hai cột nhị phân của module dùng BYTEA. Lệnh khởi tạo có giới hạn tổng 2.400 giây; dựng lại dùng 600 giây, để khi lỗi vẫn còn thời gian lấy diagnostics và dọn project.
3. Kiểm tra HTML/import map O3 và tải JavaScript app shell/login qua gateway.
4. Xác thực REST; xác nhận phiên bản Core và đủ 29 module của baseline; kiểm tra location do Initializer nạp và chọn location trong session. Mật khẩu sai và truy cập bệnh nhân qua REST/FHIR không đăng nhập phải bị từ chối.
5. Kiểm tra REST patient search, FHIR R4 CapabilityStatement và FHIR Patient search.
6. Tạo bệnh nhân giả, visit, encounter, observation số và văn bản tiếng Việt dài; đối chiếu mã bệnh nhân, quan hệ, giá trị, đơn vị, thời gian và văn bản qua REST/FHIR.
7. Dừng và dựng lại container, giữ volume; đọc chính hồ sơ trước đó để kiểm chứng persistence.
8. Lưu báo cáo/log đã che mật khẩu cấu hình, gồm log OpenMRS trong application volume khi khởi tạo chưa xong, rồi xóa container/volume của chính project CI đó.

Nếu backend không sẵn sàng, API trả HTML/redirect thay JSON, sai định danh hoặc mất hồ sơ sau restart, job phải thất bại.

## 3. Cách cô lập

- Mỗi run/attempt có `COMPOSE_PROJECT_NAME` riêng.
- Không cần secret deploy hoặc tài khoản của cơ sở y tế.
- GitHub Actions chỉ có quyền `contents: read`; checkout không lưu credential Git trong working tree.
- Actions được khóa bằng commit SHA; binary actionlint được kiểm tra SHA-256 trước khi chạy.
- Chỉ upload `.runtime/reports/`, giữ 7 ngày; không upload `.env`, database dump hoặc tài liệu nguồn ở `Sample_Data/`.
- Run cũ trên cùng ref được hủy khi có run mới; runner là môi trường tạm, không dùng database local của thành viên.

## 4. Giới hạn của CI hiện tại

CI hiện dựng stack với MariaDB. Theo [ADR-0002](decisions/0002-postgresql.md), job `OpenMRS REST, FHIR and persistence` sẽ chuyển sang PostgreSQL cùng PR BE-10, và kiểm tra persistence phải đạt trên PostgreSQL.

CI kiểm chứng baseline chạy được và các API chính; chưa nghiệm thu biểu mẫu Việt Nam, ma trận quyền lễ tân/điều dưỡng/bác sĩ, toàn bộ mapping lâm sàng, E2E trên trình duyệt hoặc triển khai production.

Repo build backend từ image upstream cố định, có lớp Hibernate, bản sửa migration Appointments, đồng bộ sequence sau dữ liệu nền của Core và kiểm tra khóa ngoại Stock Management theo từng bảng. Build biên dịch lớp Java và kiểm tra hash artifact gốc; smoke kiểm chứng qua API thật. Khi thêm chức năng Java/frontend của nhóm, bổ sung test phù hợp vào pipeline.

## 5. Kiểm tra trước khi mở PR

```powershell
python scripts/check_config.py
python -m unittest discover -s tests -v
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py --create-fixture --report .runtime/reports/smoke-before.json
docker compose down
docker compose up -d --wait --wait-timeout 600
python scripts/smoke.py --require-fixture --report .runtime/reports/smoke-after.json
```

Giữ fixture và volume của cùng một instance. Cách dựng môi trường, xem log và xử lý lỗi nằm trong [DEVELOPMENT.md](DEVELOPMENT.md).

Sau khi có run GitHub thành công, nhóm có thể cấu hình branch rules để yêu cầu hai check trên trước khi merge. Thiết lập branch rules là cấu hình repository riêng; file workflow không tự bật quy tắc đó.
