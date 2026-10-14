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

### Job `B1-B9 PostgreSQL, API, FHIR, restart and restore`

1. Pull image đã khóa và build backend từ image release cố định, bỏ demo lớn và áp dụng bản sửa PostgreSQL đã lưu trong repo.
2. Dựng stack PostgreSQL trên runner mới và chờ các service khỏe; xác nhận version, UTF8, extension, schema OpenMRS, đủ 118 khóa ngoại Stock Management và hai cột nhị phân của module dùng BYTEA. Lệnh khởi tạo có giới hạn tổng 2.400 giây; dựng lại dùng 600 giây, để khi lỗi vẫn còn thời gian lấy diagnostics và dọn project.
3. Kiểm tra HTML/import map O3 và tải JavaScript app shell/login qua gateway.
4. Xác thực REST; xác nhận phiên bản Core và đủ 30 module của baseline (29 upstream cộng `vinshc`); kiểm tra location do Initializer nạp và chọn location trong session. Mật khẩu sai và truy cập bệnh nhân qua REST/FHIR không đăng nhập phải bị từ chối.
5. Kiểm tra REST patient search, FHIR R4 CapabilityStatement và FHIR Patient search. Báo cáo smoke ghi toàn bộ resource/interaction được server công bố và trạng thái `started`/version của từng module baseline để làm bằng chứng B0; việc được công bố không đồng nghĩa luồng nghiệp vụ đã được nghiệm thu.
6. Tạo bệnh nhân giả, visit, encounter, observation số và văn bản tiếng Việt dài; đối chiếu mã bệnh nhân, quan hệ, giá trị, đơn vị, thời gian và văn bản qua REST/FHIR.
7. Chạy có thứ tự toàn bộ contract B1–B8: hành chính, sinh hiệu, khám/đơn thuốc, quyền, FHIR và MVP-2. Unit test Java của module chạy trong bước build image (Dockerfile không còn `-DskipTests`).
8. Dừng và dựng lại container, giữ volume; xác minh metadata Initializer không đổi UUID/số lượng và đọc lại clinical/financial/order/file/document state bằng verifier B9 read-only.
9. Backup database và `/openmrs/data`, restore sang project/volume/cổng khác; kiểm tra database, smoke, metadata và cùng verifier B9, gồm byte/hash attachment.
10. Sau khi B9 restart/restore đã pass, chạy `test_b10_review_regressions` trên stack gốc cho các lỗi đã sửa từ [review backend](REVIEW_BE.md) (phạm vi cơ sở, race thanh toán, idempotency, rò proxy privilege, rollback, múi giờ, mã lỗi). Bước này phải đứng cuối vì nó tạo thêm giao dịch synthetic, còn B9 khẳng định dữ liệu không đổi kể từ B8.
11. Sinh report bàn giao đã che thông tin nhạy cảm, chỉ upload `.runtime/reports/`, rồi xóa volume của cả source và restore project.

Nếu backend không sẵn sàng, API trả HTML/redirect thay JSON, sai định danh hoặc mất hồ sơ sau restart, job phải thất bại.

## 3. Cách cô lập

- Mỗi run/attempt có `COMPOSE_PROJECT_NAME` riêng.
- Không cần secret deploy hoặc tài khoản của cơ sở y tế.
- GitHub Actions chỉ có quyền `contents: read`; checkout không lưu credential Git trong working tree.
- Actions được khóa bằng commit SHA; binary actionlint được kiểm tra SHA-256 trước khi chạy.
- Chỉ upload `.runtime/reports/`, giữ 7 ngày; không upload `.env`, database dump hoặc tài liệu nguồn ở `Sample_Data/`.
- Run cũ trên cùng ref được hủy khi có run mới; runner là môi trường tạm, không dùng database local của thành viên.

## 4. Giới hạn của CI hiện tại

Workflow hiện cấu hình stack PostgreSQL 16.15 theo [ADR-0002](decisions/0002-postgresql.md), gồm kiểm tra database và persistence. Cấu hình workflow không thay thế kết quả run thực tế; xem GitHub Actions và [VALIDATION.md](VALIDATION.md) để biết bằng chứng đã có.

CI kiểm chứng backend B1–B9 bằng dữ liệu synthetic, gồm metadata, ma trận quyền, mapping lâm sàng, MVP-2, restart và restore. CI vẫn chưa nghiệm thu E2E trên trình duyệt/FE, tải production, thông tin pháp lý thật hoặc triển khai production. Workflow chỉ tự chạy cho pull request hoặc push `main`; push riêng lên `clinic-backend` không tạo check nếu chưa có PR. Commit hiện tại cần được chạy bằng PR hoặc `workflow_dispatch`; local pass không được ghi thành GitHub Actions pass.

Repo build backend từ image upstream cố định, có lớp Hibernate, bản sửa migration Appointments, đồng bộ sequence sau dữ liệu nền của Core và kiểm tra khóa ngoại Stock Management theo từng bảng. Build biên dịch lớp Java và kiểm tra hash artifact gốc; smoke kiểm chứng qua API thật. Khi thêm chức năng Java/frontend của nhóm, bổ sung test phù hợp vào pipeline.

## 5. Kiểm tra trước khi mở PR

```powershell
python scripts/check_config.py
python -m unittest discover -s tests -v
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py --create-fixture --report .runtime/reports/smoke-before.json
python -m unittest -v tests.integration.test_b1_contract tests.integration.test_b2_patient tests.integration.test_b3_vitals tests.integration.test_b23_extensions tests.integration.test_b4a_consultation tests.integration.test_b4b_clinical tests.integration.test_b5_authorization tests.integration.test_b7_fhir tests.integration.test_b8_operations
docker compose down
docker compose up -d --wait --wait-timeout 600
python scripts/smoke.py --require-fixture --report .runtime/reports/smoke-after.json
$env:VINSHC_ACCEPTANCE_PHASE='restart'
python -m unittest -v tests.integration.test_b9_persistence
# Chạy cuối cùng: test này ghi thêm dữ liệu synthetic
python -m unittest -v tests.integration.test_b10_review_regressions
```

Để chạy B4–B9 bằng catalogue test, thêm `tests/integration/compose.b4-metadata.yaml` vào Compose và đặt `VINSHC_B4_CATALOGUE=metadata`. Backup/restore project thứ hai làm đúng các lệnh đã khóa trong workflow; không dùng `discover` vì thứ tự fixture có phụ thuộc được ghi rõ. Giữ fixture và volume của cùng một instance. Cách dựng môi trường, xem log và xử lý lỗi nằm trong [DEVELOPMENT.md](DEVELOPMENT.md).

Sau khi có run GitHub thành công, nhóm có thể cấu hình branch rules để yêu cầu hai check trên trước khi merge. Thiết lập branch rules là cấu hình repository riêng; file workflow không tự bật quy tắc đó.
