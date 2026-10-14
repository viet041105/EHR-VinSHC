# Checklist hoàn thiện EHR VinSHC cho một phòng khám

**Trạng thái:** Backlog triển khai — chưa phê duyệt dùng dữ liệu bệnh nhân thật  
**Phạm vi:** Một phòng khám, 8 vai trò nhân viên và cổng bệnh nhân  
**Baseline:** OpenMRS Reference Application 3.7.1, Core 2.8.8, PostgreSQL 16.15, module VinSHC hiện tại  
**Mục tiêu:** Hoàn thiện code, kiểm thử, cấu hình và vận hành để các luồng dưới đây hoạt động bằng tài khoản thật, dữ liệu synthetic trước; chỉ chuyển sang dữ liệu thật sau khi toàn bộ gate production được chủ sở hữu ký duyệt.

Tài liệu này là backlog thực thi cho agent. Không được đánh dấu một mục hoàn thành chỉ vì đã tạo UI, endpoint trả HTTP 200 hoặc unit test mock đạt. Mỗi mục phải có migration/configuration nếu cần, kiểm tra quyền phía server, test âm tính, test persistence và tài liệu API tương ứng.

## 1. Nguồn sự thật và nguyên tắc bắt buộc

- [ ] Đọc và giữ tương thích với `compose.yaml`, `config/baseline.json` và `infra/backend/Dockerfile`.
- [ ] Đọc module hiện tại trong `infra/backend/vinshc-module/`; không tạo API trùng chức năng đã có.
- [ ] Đọc ma trận quyền `metadata/vinshc/permission-matrix.csv` và metadata frontend trong `infra/frontend/packages/core/metadata/`.
- [ ] Đọc các hợp đồng API trong `docs/api/`, đặc biệt `care.md`, `consultation.md`, `clinic-operations.md` và `authorization-audit.md`.
- [ ] Đọc `docs/PILOT_READINESS.md`, `docs/RECOVERY_RUNBOOK.md` và `docs/VIETNAM_COMPLIANCE.md` trước khi thay đổi lưu trữ, xác thực, audit hoặc dữ liệu bệnh nhân.
- [ ] Mọi thay đổi schema phải dùng Liquibase changeset mới; không sửa changeset đã chạy.
- [ ] Mọi API ứng dụng phải kiểm tra user, role, cơ sở, quan hệ đối tượng và trạng thái ở backend; FE guard không thay thế authorization.
- [ ] Không cho client tự khẳng định patient, provider, reviewer, role hoặc facility mà không đối chiếu session và assignment phía server.
- [ ] Không hard-delete hồ sơ lâm sàng, kết quả, cấp thuốc, công bố hoặc audit; dùng void/revision/revoke kèm lý do và actor/time.
- [ ] Không lưu password, token, secret, dữ liệu bệnh nhân thật, database dump hoặc prompt chứa dữ liệu nhạy cảm trong Git/log/CI artifact.
- [ ] Mọi test ghi dữ liệu chỉ dùng fixture synthetic và Compose project/volume riêng.
- [ ] Không dùng `docker compose down -v` trên project đang chứa dữ liệu cần giữ.
- [ ] Sau mỗi hạng mục, cập nhật API docs, permission matrix, metadata, test và tài liệu bàn giao trong cùng PR.

## 2. Hiện trạng cần giữ không bị regression

Các chức năng sau đã có trong source hiện tại. Agent không cần viết lại, nhưng phải giữ pass khi bổ sung chức năng mới.

- [x] Tiếp đón: tìm/đăng ký/sửa bệnh nhân, contact, địa chỉ, field-state, lịch hẹn, mở/đóng lượt và hàng đợi.
- [x] Điều dưỡng: encounter sinh hiệu, ghi/đọc/đính chính/hủy sinh hiệu và cập nhật hàng đợi.
- [x] Bác sĩ: phiếu khám, chẩn đoán, dị ứng, kê/ngừng thuốc, chỉ định CLS và chốt phiếu.
- [x] CLS: phân công, chuyển trạng thái, kết quả có revision, reviewer/time, attachment và in kết quả.
- [x] Thu ngân: bill, thu tiền, chuyển khoản pending/settled, hoàn tiền, hủy có điều kiện và phiếu thu.
- [x] Dược: danh sách đơn chờ cấp, cấp một phần/toàn phần, lô/hạn dùng, idempotency và lịch sử cấp.
- [x] Quản lý: báo cáo ngày/khoảng ngày tối đa 31 ngày, chỉ dữ liệu tổng hợp.
- [x] Quản trị: workspace, kiểm tra quyền, gán/thu hồi role tại cơ sở và đọc audit.
- [x] Phân vùng dữ liệu: PostgreSQL trong `postgres-data`; runtime/attachment trong `openmrs-pg-data`.

Regression bắt buộc:

- [x] Unit test Java hiện có tiếp tục đạt.
- [x] `npm --prefix infra/frontend test` tiếp tục đạt.
- [x] Test tích hợp B1–B11 tiếp tục đạt trên database sạch.
- [x] Restart container giữ nguyên dữ liệu và đọc lại đúng fixture.
- [x] Backup–restore sang Compose project mới đọc lại đúng database và attachment.

## 3. Thứ tự triển khai

Thực hiện theo thứ tự phụ thuộc sau:

1. P0 — Đồng bộ baseline, version và metadata production.
2. P1 — Quản trị tài khoản, provider, cơ sở và biểu mẫu.
3. P2 — Đính chính cấp thuốc và siết quy trình duyệt CLS.
4. P3 — Mô hình công bố hồ sơ và liên kết account–patient.
5. P4 — API và frontend portal bệnh nhân.
6. P5 — API tổng hợp hồ sơ và chatbot bác sĩ/bệnh nhân.
7. P6 — Đóng gói frontend/image do VinSHC kiểm soát.
8. P7 — Hardening, dữ liệu, backup, quan sát và nghiệm thu production.

Không triển khai chatbot bệnh nhân trước khi P3 và P4 có test chống truy cập chéo bệnh nhân.

---

## 4. P0 — Đồng bộ baseline và metadata production

### 4.1. Đồng bộ version

- [x] Chọn một version release VinSHC thống nhất cho backend module, metadata pack, frontend và print template.
- [x] Giải quyết chênh lệch hiện tại: module Maven `0.3.0`, metadata `0.3.0`, frontend `0.2.0`, trong khi Liquibase có changeset tên `0.4.0`.
- [x] Cập nhật `config/baseline.json` để phản ánh đúng metadata/module/frontend hiện tại.
- [x] Cập nhật số module runtime kỳ vọng: upstream bỏ demo cộng module `vinshc`; xác nhận bằng API module sau khi Docker chạy.
- [x] Sửa các mô tả lỗi thời trong README và tài liệu agent, ví dụ clinical summary hiện đã chứa sinh hiệu.
- [x] Thêm kiểm tra CI phát hiện version drift giữa POM, pack, frontend và image artifact.

> **Ghi chú P0 (14/10/2026):** Chọn release VinSHC `0.3.0` cho POM, metadata, frontend và hợp đồng mẫu in. ID Liquibase `vinshc-0.4.0-*` là lịch sử migration bất biến, **không đổi tên** để tránh chạy lại migration. `printing-reporting.json` vẫn đánh dấu `testOnly: true`, do đó đồng bộ version **không đồng nghĩa** mẫu in được phê duyệt cho dữ liệu thật.

### 4.2. Chuyển role/privilege khỏi metadata test

- [x] Không dùng `metadata/vinshc/initializer-test/roles` và `privileges` làm nguồn production.
- [x] Tạo cấu hình production version hóa dưới `infra/backend/configuration/privileges/vinshc/` và `roles/vinshc/`, hoặc một content package VinSHC riêng.
- [x] Provision đủ 8 role nhân viên: reception, nurse, doctor, lab, cashier, pharmacy, manager, admin.
- [x] Provision tất cả privilege trong `metadata/vinshc/permission-matrix.csv`.
- [x] Đối chiếu role CSV, ma trận quyền và privilege thực tế trong database; thất bại nếu thiếu hoặc dư quyền rộng.
- [x] Kiểm tra mỗi role không thể gọi trực tiếp Core REST/FHIR để vượt projection/scoping của VinSHC.
- [x] Test database sạch không cần overlay `tests/integration/compose.b4-metadata.yaml` vẫn tạo đủ role/privilege production.
- [x] Giữ tài khoản fixture/test ngoài cấu hình production.

### 4.3. Tiêu chí nghiệm thu P0

- [x] Database sạch khởi động thành công, đủ metadata bắt buộc và không có role test giả.
- [x] Bảng kiểm 8 role × resource × action khớp hoàn toàn permission matrix.
- [x] `scripts/check_config.py`, metadata validation, smoke và B1–B11 đạt.
- [x] Báo cáo ghi commit, image digest, module version, metadata version và số module started.

---

## 5. P1 — Quản trị tài khoản, provider, cơ sở và biểu mẫu

### 5.1. Tài khoản nhân viên

- [x] Thiết kế API ứng dụng dành riêng cho System Developer để tạo user OpenMRS.
- [x] Payload tạo user không cho client gửi privilege trực tiếp; chỉ chọn role VinSHC trong allowlist.
- [x] Hỗ trợ username, tên hiển thị, person, trạng thái active/retired và mật khẩu khởi tạo.
- [ ] Không trả password/hash/salt trong response hoặc log.
- [ ] Bắt buộc đổi mật khẩu lần đầu nếu OpenMRS baseline hỗ trợ; nếu không, ghi rõ cơ chế thay thế.
- [x] Thêm API khóa/mở hoặc retire user có audit và chặn tự khóa tài khoản quản trị cuối cùng.
- [x] Thêm API reset mật khẩu; không có API đọc lại mật khẩu cũ.
- [x] Chặn username trùng, user đã retired, role không hợp lệ và thao tác ngoài quyền.
- [x] Thêm tìm kiếm/phân trang user ở backend VinSHC thay vì mở rộng tùy ý Core API cho frontend.
- [ ] Thêm test không lộ credential trong response, exception, access log và CI report.

### 5.2. Provider và liên kết user–provider

- [ ] Tạo API tạo/sửa/retire provider.
- [x] Tạo hoặc chọn Person hợp lệ cho provider; không tự dùng Patient làm provider.
- [x] Tạo API liên kết/hủy liên kết user–provider.
- [ ] Ràng buộc tài khoản lâm sàng có đúng một provider active tại thời điểm tạo encounter/kê đơn/ghi kết quả, trừ khi workflow hỗ trợ chọn rõ nhiều provider.
- [x] Kiểm tra provider thuộc đúng cơ sở hoặc assignment chuyên môn trước khi sử dụng.
- [x] Không cho reception/cashier/pharmacy tự nhận provider nếu không cần nghiệp vụ.
- [ ] Ghi audit cho tạo, sửa, retire và liên kết provider.
- [ ] Test provider bị retire, nhiều provider, provider khác cơ sở và giả mạo UUID.

### 5.3. Cơ sở và location

- [x] Tạo API quản lý business facility và ánh xạ tới OpenMRS Location.
- [x] Phân biệt rõ business facility UUID với OpenMRS Location UUID trong DTO và database.
- [x] Hỗ trợ tên pháp lý, mã cơ sở, địa chỉ, điện thoại, timezone, active/effective dates và location hierarchy.
- [x] Không cho sửa UUID hoặc lịch sử snapshot đã được dùng trên chứng từ.
- [x] Khi retire cơ sở, chặn tạo mới nhưng vẫn đọc được dữ liệu lịch sử.
- [ ] Test assignment, báo cáo, visit và dữ liệu ngoài cơ sở sau khi cấu hình nhiều location con.

### 5.4. Biểu mẫu và cấu hình workflow

- [x] Chốt nguồn sự thật của form: O3 Form Engine schema hoặc schema VinSHC version hóa; không để `forms.json` chỉ là tài liệu mà UI hiểu như form production.
- [ ] Tạo CRUD/versioning cho form template với draft/active/retired.
- [x] Không cho sửa đè phiên bản form đã dùng trong hồ sơ.
- [ ] Cấu hình workflow `STANDARD_POSTPAY` và `COMPACT_PREPAY` theo cơ sở bằng metadata, không hardcode nhánh riêng.
- [x] Thêm API đọc configuration projection cho FE; API ghi chỉ dành cho admin đúng cơ sở.
- [ ] Test rollback/cấu hình thiếu và migration từ version cũ.

### 5.5. Frontend quản trị

- [x] Thay các form “Chờ backend” trong `modules/admin` bằng thao tác thật.
- [x] Thêm màn hình tạo/khóa/reset tài khoản.
- [x] Thêm màn hình role và facility assignment.
- [x] Thêm màn hình tạo/liên kết/retire provider.
- [x] Thêm màn hình cấu hình cơ sở và version biểu mẫu.
- [x] Yêu cầu xác nhận trước thao tác nhạy cảm; hiển thị actor/time/kết quả audit.
- [x] Không lưu password hoặc credential trong localStorage/sessionStorage.

### 5.6. Tiêu chí nghiệm thu P1

- [x] System Developer tạo được một tài khoản cho từng role mà không dùng SQL hoặc UI Legacy.
- [x] Bác sĩ/điều dưỡng/KTV sau khi liên kết provider tạo được encounter đúng provider của mình.
- [x] User không có quyền không thể tự cấp role/cơ sở/provider.
- [x] Admin ứng dụng không mặc nhiên đọc được hồ sơ lâm sàng.
- [ ] Restart/backup–restore giữ nguyên user, role, provider và assignment.

---

## 6. P2 — Hoàn thiện dược và CLS

### 6.1. Đính chính/hủy cấp thuốc

- [ ] Thiết kế dispense ledger append-only; không UPDATE số lượng/lô của bản đã xác nhận.
- [ ] Thêm privilege `dispensing update` và `dispensing void` chỉ sau khi owner duyệt ma trận quyền.
- [ ] Thêm endpoint correction/void với lý do bắt buộc, bản ghi gốc, actor và time.
- [ ] Tính lại tổng đã cấp và số còn lại từ các ledger entry còn hiệu lực.
- [ ] Chặn đính chính làm tổng cấp âm hoặc vượt số kê.
- [ ] Chặn sửa đơn đã hết hiệu lực theo cách che mất lịch sử; correction phải tạo revision/compensating entry.
- [ ] Thêm optimistic locking hoặc kiểm tra revision để tránh hai quầy cấp đồng thời vượt số lượng.
- [ ] Thêm UI lịch sử cấp, đính chính/hủy theo quyền và cảnh báo ảnh hưởng số còn lại.
- [ ] Test retry/idempotency, concurrent dispense, correction, void và restart.

### 6.2. Tồn kho

- [ ] Quyết định phạm vi: tiếp tục “ghi lô/hạn dùng không trừ kho” hay tích hợp Stock Management.
- [ ] Nếu chưa tích hợp, UI và phiếu phải hiển thị rõ “không đối chiếu tồn kho”.
- [ ] Nếu tích hợp, ánh xạ drug/item/location/batch và dùng transaction hoặc outbox để không cấp thuốc mà trừ kho thất bại âm thầm.
- [ ] Chặn cấp lô không tồn tại, hết hạn, không đủ tồn hoặc sai cơ sở.
- [ ] Có ledger nhập–xuất–điều chỉnh và kiểm kê; không tính tồn chỉ từ đơn thuốc.
- [ ] Test rollback khi một nửa giao dịch thất bại.

### 6.3. Duyệt kết quả CLS

- [ ] Không chỉ kiểm tra `reviewerProvider` tồn tại; xác minh reviewer là provider của user hoặc là người duyệt được ủy quyền tại đúng cơ sở.
- [ ] Tách rõ author, performer và reviewer nếu workflow yêu cầu.
- [ ] Không cho client ghi reviewer là người khác chỉ bằng UUID.
- [ ] Quy định reviewer có được duyệt kết quả do chính mình nhập hay không; mã hóa policy và test.
- [ ] Kết quả `final`/`corrected` bắt buộc reviewer, reviewedAt hợp lệ và quyền duyệt.
- [ ] Chặn `reviewedAt` vô lý so với recordedAt/thời điểm hiện tại theo policy đã chốt.
- [ ] Hoàn tất order chỉ khi revision cuối hợp lệ là final/corrected.
- [ ] Thêm audit cho phân công, bắt đầu, nhập kết quả, duyệt, sửa và hoàn tất.
- [ ] Nếu cần chữ ký chính thức, thiết kế chữ ký số/tài liệu ký riêng; không coi tên reviewer là chữ ký pháp lý.

### 6.4. Attachment CLS

- [ ] Chuyển hoặc chuẩn bị chuyển file production sang object storage riêng; database chỉ giữ metadata/hash/storage key.
- [ ] Thêm malware scan trước khi file được phát hành/download cho người dùng khác.
- [ ] Cấu hình size/MIME theo cơ sở thay vì chỉ hằng số code.
- [ ] Chặn path traversal, MIME giả, polyglot nếu scanner phát hiện, file trùng hash bất thường và download ngoài quyền.
- [ ] Có retention, backup, restore và kiểm tra checksum.
- [ ] Test file lỗi, file quá lớn, sai MIME, mất file, sai hash và quyền download.

### 6.5. Tiêu chí nghiệm thu P2

- [ ] Phiếu cấp sai được đính chính có lịch sử, tổng đã cấp đúng sau restart.
- [ ] KTV không thể tự khai reviewer tùy ý.
- [ ] Bác sĩ/KTV chỉ xem/in/download kết quả trong đúng phạm vi quyền.
- [ ] Attachment restore sang project mới vẫn đúng byte và SHA-256.

---

## 7. P3 — Công bố hồ sơ và liên kết tài khoản bệnh nhân

P3 là điều kiện bắt buộc trước portal và chatbot bệnh nhân.

### 7.1. Mô hình liên kết account–patient

- [ ] Thêm bảng version hóa liên kết OpenMRS User/Person với Patient.
- [ ] Một account bệnh nhân mặc định chỉ liên kết một patient; nếu hỗ trợ người giám hộ, dùng loại quan hệ/ủy quyền riêng.
- [ ] Lưu trạng thái pending/active/revoked, phương thức xác minh, actor xác minh, thời gian hiệu lực và lý do thu hồi.
- [ ] Không suy liên kết từ trùng tên, điện thoại, CCCD, email hoặc contact.
- [ ] Không coi contact/người nhà hiện có là người được quyền đọc hồ sơ.
- [ ] Chặn liên kết một user tới patient khác khi liên kết active còn tồn tại, trừ workflow chuyển có kiểm soát.
- [ ] Thêm audit cho tạo, xác minh, kích hoạt và thu hồi liên kết.
- [ ] Thêm API System Developer/admin được ủy quyền để quản lý liên kết.
- [ ] Thêm test giả mạo patient UUID, liên kết chéo cơ sở, account retired và link revoked.

### 7.2. Mô hình công bố

- [ ] Thêm entity/table publication append-only hoặc versioned.
- [ ] Công bố phải tham chiếu rõ patient, visit/encounter, loại tài liệu/bản ghi, UUID nguồn và revision/version.
- [ ] Lưu trạng thái draft/published/revoked/superseded.
- [ ] Lưu publishedBy/publishedAt, revokedBy/revokedAt/reason và facility.
- [ ] Quy định rõ các loại có thể công bố: lời dặn, đơn thuốc, kết quả CLS, lịch hẹn và tài liệu đã duyệt.
- [ ] Không tự công bố toàn bộ clinical summary.
- [ ] `consultation final` không tự đồng nghĩa `published`.
- [ ] Correction sau công bố không tự thay nội dung đã xem; tạo publication revision mới hoặc supersede rõ ràng.
- [ ] Không công bố draft, kết quả preliminary, đơn đã ngừng nếu policy không cho phép, hoặc attachment chưa scan.
- [ ] Thêm API publish/revoke/list history cho bác sĩ/người có quyền.
- [ ] Thêm privilege/resource/action mới vào permission matrix và configuration production.
- [ ] Audit mọi lần publish/revoke/read của bệnh nhân.

### 7.3. Projection bệnh nhân

- [ ] Tạo DTO patient-safe riêng; không tái sử dụng nguyên DTO nhân viên.
- [ ] Chỉ trả dữ liệu đã công bố và còn hiệu lực.
- [ ] Loại CCCD, số điện thoại người liên hệ, ghi chú nội bộ, audit nhân viên, dữ liệu draft và metadata không cần thiết.
- [ ] Trả source reference đủ để mở đúng phần đã công bố, nhưng không trả Core REST/FHIR URL có thể bị thay UUID.
- [ ] Giữ đúng đơn vị, thời gian, trạng thái thuốc/kết quả và revision.
- [ ] Thêm pagination cho danh sách lượt/tài liệu đã công bố.

### 7.4. Tiêu chí nghiệm thu P3

- [ ] Chốt phiếu nhưng chưa publish thì bệnh nhân không đọc được.
- [ ] Publish đúng một lời dặn/đơn thì bệnh nhân chỉ thấy phần đó.
- [ ] Revoke chặn lần đọc tiếp theo nhưng lịch sử audit vẫn còn.
- [ ] Patient A sửa URL/UUID sang Patient B luôn nhận 403/404 không rò rỉ sự tồn tại hoặc dữ liệu.
- [ ] Admin/manager không tự có quyền công bố hoặc đọc chart nếu permission matrix không cấp.

---

## 8. P4 — Portal bệnh nhân

### 8.1. Xác thực và phiên

- [ ] Tạo loại tài khoản/role bệnh nhân riêng, không dùng một trong 8 workspace nhân viên.
- [ ] Portal không yêu cầu header role/facility do client tự chọn; backend suy patient từ session và active account–patient link.
- [ ] Thêm endpoint `GET /vinshc/portal/me` trả identity tối thiểu và trạng thái liên kết.
- [ ] Thiết kế đổi/reset mật khẩu và khóa tài khoản; không trả password cũ.
- [ ] Có rate limit, lockout/throttling và audit login thất bại theo chính sách triển khai.
- [ ] Chống session fixation, CSRF (nếu dùng cookie) và open redirect.

### 8.2. API portal dự kiến

Tên endpoint có thể điều chỉnh trong bước chốt contract, nhưng phải giữ nguyên nguyên tắc không nhận patient UUID tùy ý.

- [ ] `GET /vinshc/portal/me` — tài khoản và patient projection.
- [ ] `GET /vinshc/portal/visits?limit=&offset=` — các lần khám có nội dung được công bố.
- [ ] `GET /vinshc/portal/visits/{visitUuid}` — nội dung được công bố của chính account.
- [ ] `GET /vinshc/portal/appointments` — lịch hẹn của chính patient.
- [ ] `GET /vinshc/portal/prescriptions/{publicationUuid}` — đơn đã công bố.
- [ ] `GET /vinshc/portal/results/{publicationUuid}` — kết quả đã công bố.
- [ ] `GET /vinshc/portal/attachments/{publicationUuid}/content` — download có quyền, scan và audit.
- [ ] Không có API portal nhận `?patient=<uuid>` từ client.
- [ ] Mọi endpoint đọc lại active link và publication ở thời điểm request, không chỉ lúc login.

### 8.3. Frontend portal

- [ ] Tạo `/portal.html` hoặc một entrypoint/package portal riêng.
- [ ] Màn hình đăng nhập/đăng xuất và trạng thái khóa/liên kết chưa xác minh.
- [ ] Danh sách lần khám đã công bố.
- [ ] Trang lời dặn, đơn thuốc, kết quả và lịch hẹn.
- [ ] Hiển thị rõ ngày, cơ sở, người công bố, phiên bản và trạng thái thu hồi/sửa đổi khi áp dụng.
- [ ] Không có ô nhập patient UUID, encounter UUID hoặc URL Core.
- [ ] Đổi account/logout phải xóa toàn bộ context và response cũ khỏi bộ nhớ trình duyệt.
- [ ] Không lưu hồ sơ/credential trong localStorage/sessionStorage.
- [ ] Responsive, keyboard accessible và có trạng thái loading/error/empty rõ ràng.

### 8.4. Kiểm thử portal

- [ ] Patient A không xem được Patient B bằng cách sửa mọi UUID/path/query/header.
- [ ] Account chưa link, link pending/revoked/expired bị từ chối.
- [ ] Draft/final chưa publish không xuất hiện.
- [ ] Publication revoked biến mất hoặc trả trạng thái phù hợp ngay sau revoke.
- [ ] Attachment ngoài publication bị từ chối.
- [ ] Không rò rỉ dữ liệu qua cache, log, error detail hoặc browser history.
- [ ] Test hai tab/hai account không trộn context.
- [ ] Test desktop/mobile bằng Playwright trên backend thật, không chỉ route mock.

### 8.5. Tiêu chí nghiệm thu P4

- [ ] Một bệnh nhân synthetic đăng nhập, xem đúng lời dặn/đơn/kết quả/lịch hẹn đã công bố.
- [ ] Ít nhất 10 ca tấn công quyền chéo đều bị chặn ở backend.
- [ ] Thu hồi link hoặc publication có hiệu lực ngay mà không cần rebuild frontend.

---

## 9. P5 — API tổng hợp và chatbot

### 9.1. Mở rộng nguồn đọc cho bác sĩ

- [ ] Mở rộng clinical summary hoặc tạo endpoint agent-read riêng gồm patient/visit/encounter context, consultation, diagnoses, allergies, medications, vitals, service orders, result revisions và attachment metadata.
- [ ] Không tự tải nội dung attachment trừ khi tool được yêu cầu và quyền cho phép.
- [ ] Mỗi dữ kiện cần source type, source UUID, revision/version, recordedAt/clinical time và trạng thái.
- [ ] Phân biệt dữ liệu không có, chưa hỏi, không rõ, bị từ chối, bị void và API không tải được.
- [ ] Có danh sách nhiều visit/encounter cho giai đoạn timeline; phân trang và scope đúng cơ sở.
- [ ] Đảm bảo clinical summary hiện tại không regression và tiếp tục chứa sinh hiệu.

### 9.2. Agent service

- [ ] Tạo `services/agent/` với service độc lập, healthcheck, Dockerfile và cấu hình provider/model qua secret.
- [ ] Xác thực người dùng qua backend/session; không dùng một tài khoản admin chung để đọc thay mọi người.
- [ ] Tách policy bác sĩ và policy bệnh nhân; model không tự chọn policy từ prompt.
- [ ] Tool allowlist MVP chỉ đọc; không có tool chốt phiếu, kê thuốc, publish, đặt chỉ định hay thanh toán.
- [ ] Tool bác sĩ chỉ đọc đúng patient/visit/encounter đã được backend xác nhận.
- [ ] Tool bệnh nhân chỉ đọc patient suy từ account và publication projection.
- [ ] Không đưa CCCD, điện thoại, địa chỉ, credential hoặc toàn hồ sơ vào prompt nếu câu hỏi không cần.
- [ ] Có giới hạn tool rounds, token, timeout, retry và kích thước context.
- [ ] Không log mặc định prompt hoặc payload bệnh án đầy đủ.
- [ ] Nội dung bệnh án/tệp được coi là dữ liệu, không phải chỉ thị điều khiển tool; thêm kiểm thử prompt injection.
- [ ] Khi model/API lỗi, trả trạng thái rõ ràng; không tự tạo dữ kiện thay thế.

### 9.3. Chatbot bác sĩ

- [ ] Tóm tắt một lần khám đang chọn.
- [ ] Trả lời dựa trên dữ liệu nguồn, có citation nội bộ tới phần hồ sơ ứng dụng được phép mở.
- [ ] Hiển thị thông tin thiếu và giới hạn nguồn.
- [ ] Không đưa ra chẩn đoán mới, thay thuốc hoặc kết luận không có dữ liệu khi API chưa cung cấp.
- [ ] Chuyển patient/visit/role/facility phải hủy context và bỏ response đến muộn.
- [ ] Lưu audit request ID, actor, context UUID, tool đã gọi, trạng thái, latency và model/version; không lưu toàn prompt nếu không được phép.

### 9.4. Chatbot bệnh nhân

- [ ] Chỉ giải thích lời dặn, đơn, kết quả và lịch hẹn đã công bố.
- [ ] Không đọc chart nhân viên hoặc bản draft dù frontend gửi UUID.
- [ ] Không tự suy giờ uống, đổi liều, ngừng thuốc hoặc bổ sung thuốc.
- [ ] Dùng ngôn ngữ dễ hiểu và luôn chỉ ra nội dung nào lấy từ nguồn nào.
- [ ] Khi thiếu thông tin, hướng dẫn hỏi phòng khám thay vì bịa câu trả lời.
- [ ] Không coi người thân/contact là người có quyền nếu chưa có authorization link riêng.

### 9.5. Bộ đánh giá agent

- [ ] Chuẩn bị tối thiểu 20 fixture synthetic với expected facts và expected citations.
- [ ] Bao phủ hồ sơ đủ, thông tin thiếu, nhiều visit, correction/void, thuốc ngừng, sai quyền, sai cơ sở, lỗi API/model và prompt injection.
- [ ] Bao phủ Patient A hỏi dữ liệu Patient B và hồ sơ chưa publish.
- [ ] Validator kiểm tra UUID/source thực sự tồn tại trong tool response.
- [ ] Đo factual correctness, citation coverage, unauthorized disclosure, p50/p95 latency, số tool/model call và cost.
- [ ] Không nghiệm thu chỉ bằng đánh giá chủ quan một vài câu trả lời.

### 9.6. Tiêu chí nghiệm thu P5

- [ ] Bác sĩ dùng chatbot trên encounter đang mở mà không trộn context.
- [ ] Bệnh nhân chỉ hỏi được nội dung đã công bố của chính mình.
- [ ] Không có ca sai quyền nào trả dữ liệu nhạy cảm trong bộ test.
- [ ] Mọi dữ kiện quan trọng trong câu trả lời có nguồn kiểm tra được hoặc được ghi rõ là chưa có nguồn.

---

## 10. P6 — Frontend và image do VinSHC kiểm soát

### 10.1. Frontend production

- [ ] Tạo Dockerfile multi-stage cho `infra/frontend`: npm install có lockfile, test, build và nginx runtime.
- [ ] Thêm service frontend VinSHC build từ working tree vào `compose.yaml` hoặc production compose overlay.
- [ ] Không tiếp tục dùng image O3 frontend kéo sẵn làm giao diện chính nếu mục tiêu là UI VinSHC.
- [ ] Có thể giữ O3 frontend dưới profile/cổng phụ trong giai đoạn đối chiếu.
- [ ] Gateway route frontend VinSHC và `/openmrs` backend trên cùng origin.
- [ ] Build output có content hash, CSP phù hợp và không chứa source secret.
- [ ] Healthcheck kiểm tra entrypoint và import map/module quan trọng.

### 10.2. Backend distribution tự build

- [ ] Fork/pin `openmrs-distro-referenceapplication` đúng commit baseline.
- [ ] Build backend distribution từ source/configuration do VinSHC kiểm soát thay vì chỉ phụ thuộc image backend đóng gói sẵn.
- [ ] Giữ `vinshc-module` là module riêng; không đưa nghiệp vụ phòng khám vào OpenMRS Core.
- [ ] Chỉ fork module upstream cần sửa: Appointments, Initializer, Stock Management, Reporting, Open Concept Lab và Core nếu thật sự cần.
- [ ] Build `.omod`/`.war` từ source fork thay cho sửa binary bằng `jar uf` khi fork đã sẵn sàng.
- [ ] Ghi upstream repo, tag/commit, license, patch và cách rebase/update cho từng fork.
- [ ] Sinh SBOM/danh sách dependency và khóa image digest/base image.
- [ ] Không commit `.omod`, `.war`, secret hoặc Maven/npm cache nếu chính sách repo không yêu cầu artifact.

### 10.3. Migration khỏi image hiện tại

- [ ] Backup `postgres-data` bằng `pg_dump` custom format.
- [ ] Archive `openmrs-pg-data` giữ UID/GID và SHA-256.
- [ ] Dựng image mới trên Compose project/volume mới.
- [ ] Restore và chạy migration trên bản sao.
- [ ] Đối chiếu user/role/provider, patient, visit, encounter, obs, bill/payment, result, publication và attachment.
- [ ] Chạy test E2E trước khi chuyển traffic.
- [ ] Giữ image/backup cũ và kế hoạch rollback; không chạy reverse migration trên dữ liệu chính.

### 10.4. Tiêu chí nghiệm thu P6

- [ ] Clone repo trên máy sạch có thể build toàn bộ image VinSHC từ source và lockfile.
- [ ] Sửa frontend/backend module rồi rebuild phản ánh đúng thay đổi, không cần sửa container đang chạy.
- [ ] Dữ liệu cũ đọc được sau khi đổi image.
- [ ] Tài liệu ghi rõ thành phần upstream và thành phần VinSHC sở hữu.

---

## 11. P7 — Production hardening và dữ liệu thật

### 11.1. Database và dữ liệu

- [ ] Tách database owner/migration role khỏi application role quyền tối thiểu.
- [ ] Không dùng cluster-init admin làm user ứng dụng production.
- [ ] Mã hóa backup và giới hạn quyền truy cập nơi lưu.
- [ ] Chốt RPO, RTO, lịch backup, retention và người chịu trách nhiệm.
- [ ] Diễn tập restore định kỳ và lưu bằng chứng kiểm tra API/file/hash.
- [ ] Theo dõi dung lượng PostgreSQL, WAL, volume attachment và object storage.
- [ ] Có quy trình export/di chuyển dữ liệu khi đổi nhà cung cấp hoặc ngừng hệ thống.

### 11.2. Bảo mật triển khai

- [ ] HTTPS ở gateway/reverse proxy; không dùng HTTP khi có dữ liệu thật.
- [ ] Secret manager hoặc Docker/Kubernetes secrets; không giữ secret production trong `.env` lâu dài.
- [ ] Chỉ expose gateway; database/backend nội bộ không publish công khai.
- [ ] Đổi/xóa tài khoản và mật khẩu mặc định.
- [ ] Có MFA/SSO hoặc quyết định rõ lý do chưa dùng cho vai trò nhạy cảm.
- [ ] Rate limit login, portal, download và chatbot.
- [ ] Security headers, CSP, cookie flags và CSRF protection phù hợp.
- [ ] Dependency/image vulnerability scan và quy trình vá lỗi.
- [ ] Pentest/staging test gồm IDOR, privilege escalation, UUID tampering, injection, upload và session leakage.

### 11.3. Audit và quan sát

- [ ] Audit login, logout, thất bại xác thực, đọc hồ sơ, download/in, publish/revoke, thay đổi role/provider và agent access.
- [ ] Chốt retention, export và quy trình điều tra sự cố.
- [ ] Log không chứa password/token hoặc payload bệnh án đầy đủ.
- [ ] Dashboard health, error rate, latency, DB pool, storage, failed jobs và backup status.
- [ ] Alert cho lỗi backup, dung lượng thấp, login bất thường, quyền bị từ chối tăng đột biến và checksum file lỗi.
- [ ] Có correlation/request ID xuyên gateway–frontend–backend–agent.

### 11.4. Danh mục và nghiệp vụ

- [ ] Owner chuyên môn duyệt ICD, thuốc, dị ứng, dịch vụ, giá, đơn vị và ngưỡng validation.
- [ ] Thay dữ liệu synthetic về facility/provider bằng danh tính pháp lý thực đã xác minh.
- [ ] Duyệt mẫu đơn thuốc, phiếu thu, phiếu kết quả, giấy hẹn và chữ ký.
- [ ] Chốt quy trình dữ liệu thiếu, correction, void, refund, dispense correction và result approval.
- [ ] Chốt chính sách công bố hồ sơ cho bệnh nhân và thời hạn thu hồi/sửa đổi.
- [ ] Không bật BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS trước khi adapter và pháp lý được nghiệm thu riêng.

### 11.5. Tuân thủ và vận hành

- [ ] Thực hiện đánh giá tác động dữ liệu cá nhân và xác định mục đích/căn cứ xử lý.
- [ ] Chốt consent/thông báo riêng tư, quyền chủ thể dữ liệu và đầu mối xử lý yêu cầu.
- [ ] Chốt hợp đồng/trách nhiệm dữ liệu với phòng khám và nhà cung cấp hạ tầng/model.
- [ ] Với chatbot, xác nhận phạm vi pháp lý, nhà cung cấp model, nơi xử lý dữ liệu và chính sách retention.
- [ ] Có incident response, support/SLA, change management và đào tạo người dùng.
- [ ] Chỉ định owner phòng khám, chuyên môn, bảo mật/dữ liệu cá nhân và vận hành/backup.

### 11.6. Tiêu chí nghiệm thu P7

- [ ] Tất cả gate trong `docs/PILOT_READINESS.md` có bằng chứng staging và người chịu trách nhiệm ký.
- [ ] E2E trình duyệt bằng tài khoản thật của 8 role nhân viên và bệnh nhân đạt trên staging synthetic.
- [ ] Backup–restore, fail/restart và rollback được diễn tập.
- [ ] Không còn blocker bảo mật, danh mục, pháp lý hoặc vận hành chưa có owner.
- [ ] Chỉ sau đó mới thay trạng thái `NOT APPROVED FOR REAL DATA`.

---

## 12. Ma trận E2E tối thiểu

### 12.1. Tiếp đón

- [ ] Tìm thấy hồ sơ theo mã/tên/CCCD/BHYT/điện thoại.
- [ ] 409 hồ sơ tương tự cho phép chọn hồ sơ có sẵn, không tạo trùng ngoài ý muốn.
- [ ] Đăng ký, contact, địa chỉ, mở lượt/check-in, xếp hàng và kết thúc lượt.
- [ ] Không kết thúc `completed` khi còn order active hoặc bill chưa thanh toán.

### 12.2. Điều dưỡng

- [ ] Chọn lượt/hàng đợi, tạo hoặc dùng lại encounter sinh hiệu.
- [ ] Ghi giá trị và trạng thái thiếu.
- [ ] Xem lịch sử, correction và void có lý do.
- [ ] Không ghi vào lượt đã đóng hoặc patient ngoài cơ sở.

### 12.3. Bác sĩ

- [ ] Tạo/tiếp tục phiếu khám, đọc sinh hiệu, ghi bệnh sử/khám.
- [ ] Chẩn đoán, dị ứng, thuốc, CLS, lời dặn/tái khám và finalize.
- [ ] Đọc kết quả CLS đúng revision.
- [ ] Publish/revoke đúng nội dung; chatbot chỉ đọc đúng context.

### 12.4. CLS

- [ ] KTV thấy order chưa phân công và order được giao.
- [ ] Assignment, in-progress, result draft/final, reviewer và complete.
- [ ] Correction append-only và attachment đúng hash.
- [ ] KTV khác hoặc reviewer giả bị từ chối.

### 12.5. Thu ngân

- [ ] Bill, thu tiền mặt, chuyển khoản pending/settled, thu một phần.
- [ ] Chặn overpayment; refund đúng giao dịch gốc và lý do.
- [ ] Hủy bill đúng điều kiện và in phiếu thu.

### 12.6. Dược

- [ ] Danh sách còn phải cấp, cấp một phần/toàn phần, lô/hạn dùng.
- [ ] Chặn vượt số kê, đơn hết hiệu lực, lượt hủy và retry khác payload.
- [ ] Correction/void cập nhật remaining quantity đúng và giữ lịch sử.
- [ ] Nếu bật kho, cấp thuốc và trừ kho nhất quán.

### 12.7. Quản lý

- [ ] Báo cáo ngày và 31 ngày đối chiếu đúng thu/hoàn/net.
- [ ] Không đọc được clinical summary hoặc patient identity chi tiết.

### 12.8. Quản trị

- [ ] Tạo/khóa/reset tài khoản, gán/thu hồi role và cơ sở.
- [ ] Tạo/liên kết provider, quản lý facility/form.
- [ ] Xem audit nhưng không đọc chart nếu không có quyền.
- [ ] Quản lý account–patient link có audit.

### 12.9. Bệnh nhân

- [ ] Đăng nhập portal, xem đúng publication và lịch hẹn của mình.
- [ ] Không xem draft hoặc dữ liệu bệnh nhân khác.
- [ ] Chatbot chỉ giải thích nguồn đã công bố.
- [ ] Revoke link/publication có hiệu lực ngay.

---

## 13. Yêu cầu cho mỗi PR/agent task

Mỗi task phải bàn giao đủ:

- [ ] Mô tả vấn đề và hành vi mong muốn.
- [ ] API contract/request/response và mã lỗi.
- [ ] Liquibase migration/configuration/metadata nếu có.
- [ ] Backend authorization và scope checks.
- [ ] Frontend loading/error/empty/permission states.
- [ ] Unit test và integration test dương tính.
- [ ] Test âm tính: sai quyền, sai cơ sở, sai patient/visit/encounter, sai trạng thái và payload lỗi.
- [ ] Test concurrent/idempotency với thao tác tài chính, cấp thuốc, công bố hoặc kết quả.
- [ ] Test restart/persistence nếu tạo dữ liệu mới.
- [ ] Cập nhật tài liệu API, permission matrix, metadata và changelog.
- [ ] Không chứa secret/PHI hoặc dữ liệu thật.
- [ ] Ghi lệnh kiểm thử đã chạy và kết quả, không chỉ ghi “đã test”.

## 14. Điều kiện hoàn thành toàn bộ

Chỉ coi backlog này hoàn thành khi:

- [ ] 8 vai trò nhân viên thực hiện trọn luồng của mình trên frontend VinSHC bằng tài khoản thật.
- [ ] Bệnh nhân đăng nhập portal và chỉ đọc dữ liệu đã công bố của chính mình.
- [ ] Chatbot bác sĩ và bệnh nhân có kiểm tra quyền, nguồn và context; không có tool ghi trong MVP.
- [ ] Tài khoản/provider/facility/form không còn cần thao tác SQL hoặc UI Legacy cho quy trình bình thường.
- [ ] Dispense correction, result approval và publication có audit/revision đầy đủ.
- [ ] Frontend/backend image được build tái lập từ source VinSHC.
- [ ] Database và attachment giữ đúng sau restart, backup–restore và đổi image.
- [ ] Toàn bộ unit/integration/browser/security test đạt trên staging synthetic.
- [ ] Mọi gate production có bằng chứng và owner ký trước khi dùng dữ liệu thật.

