# Runbook sao lưu, phục hồi và nâng cấp

Runbook này áp dụng cho baseline Docker Compose local/staging của VinSHC. Kết quả ngày 12/10/2026 dùng hoàn toàn dữ liệu giả và hai project cô lập `ehr-vinshc-b6-source` / `ehr-vinshc-b6-restore`; không phải chứng nhận vận hành production.

## 1. Phạm vi dữ liệu

| Thành phần | Nội dung | Cơ chế bảo vệ |
| --- | --- | --- |
| PostgreSQL `postgres-data` | Hồ sơ patient/visit/encounter/obs, metadata, user/role, audit và dữ liệu module | `pg_dump` custom format, SHA-256, kiểm tra bằng `pg_restore` |
| `/openmrs/data` (`openmrs-pg-data`) | runtime properties, module runtime/cache và file do module lưu local; attachment/patient document có thể nằm tại đây tùy cấu hình module | archive `tar.gz` trực tiếp giữa Linux volume, giữ UID/GID/quyền, SHA-256 |
| Git/config/image | Compose, baseline, Dockerfile, overlay và image ID thực chạy | manifest bắt buộc khớp trước restore |

B8 đã nghiệm thu upload/download PDF thật và SHA-256 trong `/openmrs/data/vinshc-attachments`. B9 ngày 12/10/2026 đã backup stack synthetic đầy đủ rồi restore sang project/volume mới; verifier đọc lại đúng byte/hash attachment cùng patient, order/result, giao dịch VND, chứng từ và báo cáo. Việc này chứng minh quy trình kỹ thuật local, chưa thay thế lịch/retention/RPO-RTO và diễn tập do operator production ký.

Database/backend không publish cổng ra host; gateway local chỉ bind `127.0.0.1`. `check_config.py` kiểm tra volume, healthcheck, image và ranh giới cổng. `check_database.py` kiểm tra PostgreSQL 16.15, UTF8, extension, schema và migration nhị phân. Kiểm tra dung lượng trước backup bằng `docker system df -v`; không xóa/prune tài nguyên Docker để giải phóng dung lượng khi chưa xác định đúng owner.

## 2. Chính sách cần được owner phê duyệt

Đề xuất khởi điểm cho staging: backup mỗi ngày, giữ 7 bản ngày + 4 bản tuần + 12 bản tháng, một bản mã hóa ngoài máy chủ, restore drill hàng tháng. RPO mục tiêu 24 giờ và RTO mục tiêu 4 giờ chỉ có hiệu lực sau khi chủ hệ thống/pháp chế phê duyệt. Production cần PITR/WAL nếu RPO ngắn hơn 24 giờ.

- Operator: người vận hành được phân quyền, không dùng tài khoản ứng dụng.
- Nơi lưu: kho backup mã hóa, versioned/immutable, khác failure domain với máy chạy OpenMRS.
- Credential: lấy từ secret manager/runtime environment; không chép `.env`, mật khẩu hay Basic Auth vào backup/ticket.
- Retention/xóa: theo chính sách hồ sơ y tế được phê duyệt; log ai tạo, tải, restore và hủy bản sao.
- Giám sát: cảnh báo backup trễ/thất bại, dung lượng, checksum và restore drill quá hạn.

## 3. Tạo backup nhất quán

Điều kiện: bốn service healthy, không có migration đang chạy, đủ dung lượng. Công cụ đưa gateway/frontend/backend vào maintenance, giữ DB chạy để `pg_dump`, snapshot application volume, rồi luôn khởi động và chờ source healthy trong `finally`.

```powershell
python scripts/recovery.py backup `
  --project ehr-vinshc `
  --output D:\secure-backups\vinshc-YYYYMMDD-HHMMSS `
  --compose-file compose.yaml `
  --wait-timeout 1200
```

Không ghi đè thư mục đã tồn tại. Bản hợp lệ gồm `manifest.json`, `openmrs.pgdump`, `openmrs-data.tar.gz`. Manifest chứa checksum, kích thước, cấu hình và image ID, không chứa secret. Copy cả thư mục như một đơn vị; mã hóa trước khi chuyển ra ngoài máy.

## 4. Restore drill vào project mới

Không restore đè instance đang dùng. Tên target phải mới; công cụ từ chối nếu target có container hoặc volume, từ chối checksum sai, archive path traversal và config drift.

```powershell
python scripts/recovery.py restore `
  --project ehr-vinshc-restore-YYYYMMDD `
  --input D:\secure-backups\vinshc-YYYYMMDD-HHMMSS `
  --compose-file compose.yaml `
  --http-port 18084 `
  --fixture .runtime\smoke-fixture.json `
  --wait-timeout 1200 `
  --cleanup-on-failure
```

Thứ tự tự động: xác minh manifest → xác nhận target trống → khởi động DB mới → `pg_restore --clean --if-exists --exit-on-error` → tạo application volume có Compose labels → restore archive giữ ownership → khởi động/chờ toàn stack → `check_database.py` → `smoke.py --require-fixture`.

Smoke đọc đúng UUID của patient, visit, encounter và obs qua REST/FHIR; không tạo lại dữ liệu mất. Không có fixture thì bỏ `--fixture`, nhưng khi đó chỉ đạt kiểm tra database, chưa đủ nghiệm thu B6.

Sau thành công, kiểm tra thêm log Initializer/Liquibase và file nghiệp vụ nếu deployment có upload. Báo cáo nằm trong `.runtime/reports/b6-<project>-*.json`.

## 5. Rollback và cleanup

Restore không thay source nên rollback là giữ source ở maintenance/read-only, điều tra target, rồi xóa **đúng target cô lập** và thử lại từ backup đã xác minh. `--cleanup-on-failure` chỉ xóa project target mới. Không dùng `docker system prune`, không dùng `down -v` trên project nguồn.

Khi cutover production: giữ instance cũ nguyên trạng, chặn write, tạo backup cuối, restore/verify instance mới, đổi route sau phê duyệt. Nếu hậu kiểm fail, trả route về instance cũ; không cố downgrade schema trên database đã migrate.

## 6. Nâng cấp module/schema/image

1. Review release notes và từng patch trong `infra/backend/postgresql/`; cập nhật digest/baseline cùng PR.
2. Tạo backup nhất quán và restore drill bằng bản **hiện tại** để chứng minh đường lui.
3. Clone từ backup sang project upgrade cô lập; build image mới và chạy migration ở đó.
4. Chạy `check_config.py`, `check_database.py`, smoke có fixture và bộ integration B1–B5; đối chiếu module/version/metadata và log.
5. Chỉ lên lịch production sau review kết quả. Rollback bằng instance/backup trước nâng cấp, không reverse Liquibase thủ công.

## 7. Gate staging/production chưa được phép bỏ qua

- HTTPS/TLS tại reverse proxy, hostname và network policy được duyệt; DB/backend vẫn private.
- Secret manager hoặc Docker/Kubernetes secrets; không dùng `.env` trong artifact/deployment.
- Tách database owner/migration khỏi application role tối thiểu. Baseline local vẫn dùng `OMRS_DB_USER` là cluster-init admin và **không được mang nguyên trạng ra production**.
- Tài khoản admin/break-glass, audit tập trung, log retention/alerting, monitoring/health/disk và on-call owner.
- Lịch/retention/RPO/RTO, kho off-site/immutable và bằng chứng restore được owner/pháp chế ký duyệt.
- Attachment upload/download, antivirus/MIME/size policy phải có test recovery khi chức năng được bật.

## 8. Bằng chứng drill 12/10/2026

- Backup source cô lập: 95,172 giây, PostgreSQL custom dump và OpenMRS data archive có checksum.
- Restore target volume mới: 121,203 giây, PostgreSQL 16.15 UTF8, 245 bảng, 118 Stock Management foreign key.
- Đủ module/version và metadata location; cùng patient/visit/encounter/obs đọc lại qua REST và FHIR.
- File marker trong `/openmrs/data` giữ SHA-256 `eaed4f13af3348f085259ba03f595dd8ad288aac3c316a9b4945a56e6e36f912`.
- Sai khác: không có sai khác dữ liệu được phát hiện. Attachment nghiệp vụ chưa tồn tại nên không được tuyên bố đã test.
