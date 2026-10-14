# P2 — Dược, CLS và tệp đính kèm (nghiệm thu synthetic)

> Phạm vi triển khai hiện tại: OpenMRS/Core và PostgreSQL trên Compose project test; không xử lý hồ sơ thật trước các gate P7.

## 1. Đính chính cấp thuốc kiểu append-only

- ChangeSet mới `vinshc-p2-20261015-dispense-revisions` tạo `vinshc_dispense_revision`, chỉ INSERT; giữ nguyên `vinshc_dispense.quantity`, batch, expiry, creator và timestamp gốc.
- POST `/openmrs/ws/rest/v1/vinshc/pharmacy/dispenses/{uuid}/corrections`: `quantity` mới (>0), `reason`, `expectedVersion`, `idempotencyKey`; trả phiếu gốc cùng revision.
- POST `/openmrs/ws/rest/v1/vinshc/pharmacy/dispenses/{uuid}/void`: `reason`, `expectedVersion`, `idempotencyKey`; revision mới có `effective_quantity=0`; không UPDATE/DELETE bản ghi gốc.
- `pg_advisory_xact_lock` cùng khóa `dispense-order:` của thao tác cấp thuốc + version lạc quan ngăn quầy đồng thời cấp/đính chính vượt số đơn. Retry trùng key có cùng payload trả kết quả cũ; key dùng cho payload khác trả 409.
- Worklist và DTO phiếu tính tổng từ `effective_quantity` bản revision mới nhất của từng phiếu, nếu chưa có revision thì lấy bản gốc. Bản gốc và lịch sử reviewer/actor/time vẫn truy vấn được.
- **Chưa được mở cho quầy thuốc:** ma trận `dispensing update`/`dispensing void` vẫn DENY. Chỉ System Developer có thể thử endpoint trên dữ liệu synthetic, theo yêu cầu bắt buộc được owner phê duyệt trước khi cấp quyền nhân viên.

## 2. Tồn kho — quyết định phạm vi kỹ thuật cho bản này

Giữ chế độ **record-only**, chưa tích hợp Stock Management. Ghi số lô/hạn dùng không chứng minh có lô trong kho, không trừ tồn. Frontend dược và payload in đơn có `inventoryReconciled=false` và cảnh báo `KHÔNG ĐỐI CHIẾU TỒN KHO`.

Cần owner quyết định khi nào chuyển sang Stock Management, mapping drug/item/facility/batch và bảo đảm giao dịch kho/dispense đồng bộ trước khi bỏ cảnh báo. Không tick các tiêu chí kho nằm ngoài phạm vi record-only.

## 3. Duyệt kết quả CLS

- Phía backend kiểm tra `authorProvider` và `reviewerProvider` phải là provider đang active gán đúng user và đúng Location của order. Người dùng không được nhận quyền duyệt chỉ bằng cách truyền UUID provider khác.
- Final/corrected cần reviewer và reviewedAt; không được reviewedAt < recordedAt và hai timestamp không quá 5 phút trong tương lai; trạng thái completed của order cần **revision mới nhất** là final/corrected.
- Author và reviewer lưu riêng; người thực hiện/được phân công lưu trên service order. Thêm clinical events append-only cho đổi trạng thái order và ghi/duyệt revision, không ghi payload kết quả y tế vào audit.
- **Cần quyết định chuyên môn:** self-review (người nhập tự duyệt) hiện chưa có policy phê duyệt; không coi tên reviewer là chữ ký số pháp lý. Chỉ bật trong môi trường synthetic cho đến khi có chính sách cơ sở và quy trình ký riêng.

## 4. Attachment CLS

- Metadata SHA-256/MIME/storage_key được lưu riêng trong DB, byte lưu tại volume OpenMRS; có kiểm tra MIME magic, giới hạn mặc định 20 MiB, quyền facility và SHA-256 khi download.
- **Chưa production-ready:** chưa có scanner malware, object storage production, retention policy/automated expiry hoặc cấu hình giới hạn MIME/kích thước riêng từng cơ sở. Không công bố PDF sang bệnh nhân như một tài liệu đã được scan.
- Kiểm thử mẫu PDF synthetic 67 byte, xác nhận SHA-256 và byte trùng nhau ở nguồn; backup/restore độc lập được ghi vào `.runtime/p2-local/backup`, `.runtime/p2-restore.log` khi hoàn tất.

## 5. Kiểm thử

- Java Maven compile/unit test: PASS.
- `tests.integration.test_b11_care_workflow`: **15/15 PASS** trên OpenMRS thật sau rebuild cuối, gồm reviewer spoofing/timestamp, cảnh báo tồn kho trên phiếu in, idempotent retry, đính chính/hủy và 2 writer cạnh tranh cùng expectedVersion (một 200, một 409). Cùng với `test_p2_persistence`, **17/17 PASS**.
- `tests.integration.test_p2_persistence`: **2/2 PASS** sau restart cho revision ban đầu; chạy tiếp **2/2 PASS** sau kiểm thử concurrency với 3 revision ở phiếu đính chính.
- Frontend `npm test`: **22/22 PASS**, `npm run build`: PASS.
- Tạo PDF synthetic 67 byte, kiểm tra GET/download và SHA-256 `ef0c2dcb19c61511fda07ec791aba9edf11952f1e1ad4ab5f21ee24705e74bb9` trên nguồn port 18084.
- **Backup và restore độc lập PASS**: `scripts/recovery.py backup` trên `ehr-p1-local` (không dùng dữ liệu thật); `scripts/recovery.py restore` sang `ehr-p2-restore` (port 18086), PostgreSQL 16.15 với 263 bảng, PDF synthetic byte và SHA-256 trùng 100% sau restore. Báo cáo ở `.runtime/p2-local/backup/manifest.json` và `.runtime/p2-restore.log`.
- CI GitHub Actions chưa chạy cho commit P2 mới; không suy đoán thành công trên CI chỉ từ máy local.

## 6. Việc còn chờ để đóng P2

1. Người phụ trách dược duyệt ma trận quyền correction/void, yêu cầu thu hồi hàng thực tế và chính sách diễn giải tồn.
2. Chốt policy self-review, chức danh được ký, timezone tolerance, chữ ký điện tử và quy định CLS bắt buộc.
3. Tích hợp scanner thực tế (ClamAV/ICAP hoặc AV service đã được cơ sở duyệt) **fail closed**, scan status trước publish/download.
4. Chốt storage/retention/backup đối với file CLS, cấu hình giới hạn riêng từng facility, test adversarial MIME/scan/path.
5. CI, regression toàn bộ B1–B11 sau merge và chính sách dữ liệu thật theo `docs/PILOT_READINESS.md`.
