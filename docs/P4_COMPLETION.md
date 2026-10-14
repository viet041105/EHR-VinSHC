# P4 — Portal bệnh nhân (synthetic acceptance)

> Trạng thái: implemented core patient session, safe reads, frontend and identity controls.
> Phải dùng project test `ehr-p1-local`, **không dùng dữ liệu bệnh nhân thật**.
> P3 publication gate vẫn là nguồn sự thật của portal.

## Xác thực & boundary

- OpenMRS user có role riêng `VinSHC Portal: patient`. Không tự gán role nhân viên.
- Login bằng HTTP Basic qua same-origin OpenMRS, token lưu **chỉ trong memory** `BackendClient`; fetch dùng `credentials:omit`, `redirect:error`, `cache:no-store`. Không dùng cookie session để cấp quyền ghi qua portal.
- Backend suy `patient` từ authenticated user và active verified link; không chấp nhận header role/facility hoặc patient UUID client gửi để phân quyền.
- `GET /portal/me` chỉ trả `persona,userUuid,patientUuid,linkStatus,verified`; `GET /portal/session` vẫn giữ tương thích.
- `POST /portal/password` bắt buộc verified link và mật khẩu hiện tại, dùng `StaffAccountService.changeOwnPassword` cùng validation (không trả lại password). Quyền OpenMRS `Edit User Passwords` chỉ được cấp proxy **trong đúng request self-service** bằng `ScopedCorePrivilegeInterceptor`, không gắn thường trực vào User.
- Retired account hoặc pending/revoked link nhận 403 khi đọc; user thuộc workspace nhân viên không thể đọc qua patient portal.
- `PortalIsolationInterceptor` mặc định từ chối mọi Core REST/FHIR, route nhân viên và thao tác write đối với patient-role; allowlist duy nhất GET route portal public-safe và POST self-password.

## Projection và API

Tất cả path có prefix `/openmrs/ws/rest/v1/vinshc`.

| Method | Path | Ý nghĩa |
|---|---|---|
| GET | `portal/me` | Identity tối thiểu |
| POST | `portal/password` | Đổi mật khẩu của chính mình |
| GET | `portal/visits?limit=&offset=` | Danh sách lượt khám đã công bố |
| GET | `portal/visits/{visitUuid}` | Snapshot đã công bố của chính bệnh nhân |
| GET | `portal/visits/{visitUuid}/instructions` | Lời dặn được chọn |
| GET | `portal/prescriptions?visit=&limit=&offset=` | Đơn theo snapshot, phân trang |
| GET | `portal/prescriptions/{publicationUuid}` | Đơn trong publication chính xác |
| GET | `portal/results?visit=&limit=&offset=` | CLS đã duyệt theo snapshot |
| GET | `portal/results/{publicationUuid}` | CLS trong publication chính xác |
| GET | `portal/appointments` | **Danh sách rỗng** cho tới khi có cơ chế publication lịch hẹn |
| GET | `portal/attachments/{publicationUuid}/content` | **403 fail-closed** (chưa có malware scanning và publication file được duyệt) |

Mọi lần đọc xác nhận lại active account–patient link và active publication/sourceRevision tại request-time. UUID khác bệnh nhân, không published hoặc revoked đều từ chối mà không trả metadata hồ sơ hay Core link. Phần DTO chỉ là projection whitelisted đã công bố, không tái sử dụng chart DTO.

## Frontend

`infra/frontend/portal.html` và `shell/src/portal.js` có login, logout, kiểm tra `/portal/me`, danh sách lượt khám và phân trang, lời dặn/đơn/CLS, cảnh báo chưa có lịch được publish, đổi mật khẩu, loading/error/empty. Mỗi lần chuyển lượt/đổi trang/logout hoặc đổi account sẽ bỏ cached record và response đến muộn; `BackendClient.clear()` hủy token trong memory. Không lưu credential hay dữ liệu khám vào localStorage/sessionStorage.

Frontend không có form nhập patientUUID/encounterUUID để tùy ý chọn hồ sơ. Khi link bị revoke hoặc session không hợp lệ, backend trả 403 và frontend xóa context.

## Test

- Java: `mvn -q -f infra/backend/vinshc-module/pom.xml test`.
- FE: `npm --prefix infra/frontend test` và `run build`.
- Browser route smoke: `node infra/frontend/tests/browser/agent-check.cjs` (mock data, **không thay thế browser thật**).
- Real backend: `python -m unittest -v tests.integration.test_b12_agent_portal`: **9/9 PASS** trên OpenMRS, PostgreSQL, agent và clinic synthetic (15/10/2026). Trong đó có **13 URL/UUID/header attacks bị chặn**, sửa `?patient=` không đổi phạm vi, pending/active/revoked, đổi mật khẩu (secret cũ không còn hợp lệ), publish chọn lọc, kết quả CLS và cross-user isolation.
- Playwright trên **backend thật**: `infra/frontend/tests/browser/live-portal-check.cjs` được B12 gọi với secret fixture qua environment (không ghi file). Đã PASS 2 tài khoản ở 2 tab cùng origin, frontend desktop/mobile 390 px, logout xóa context và không có credential/hồ sơ trong browser localStorage/sessionStorage.
- Browser route mock: `node infra/frontend/tests/browser/agent-check.cjs` cũng PASS; vẫn duy trì để test late responses và agent chat.
- `npm --prefix infra/frontend test`: **22/22 PASS**; `npm --prefix infra/frontend run build`: PASS. `mvn test`: PASS.
- Checklist: **24/35** mục được đánh dấu sau khi kiểm thử; **11 mục** chờ chính sách/hạ tầng/nghiệm thu.

## Còn chờ, không được tick

- Login rate limiting/throttling/lockout và login failure audit tại authentication boundary: phụ thuộc OpenMRS/gateway config và policy, chưa được nghiệm thu.
- Session fixation/CSRF browser production audit (client hiện dùng Basic memory-only + credentials omit; vẫn cần penetration test).
- Policy reset mật khẩu ngoài session, xác minh danh tính, MFA, quản trị khóa tài khoản và automatic expiry theo cơ sở.
- Appointment publication chưa được phê duyệt từ P3; attachment phải qua antivirus/malware scanner và signed document workflow.
- Playwright desktop/mobile và 2 tab trên backend thật đã PASS; vẫn cần mở rộng kiểm thử session fixation, truy cập song song dài hạn, bàn phím/screen reader, và kiểm toán cache/log/browser history nâng cao.
- Backup/restore độc lập cho P4 publication/link và CI remote sau merge chưa nghiệm thu. CI đã bổ sung bước cài Playwright Chromium trước B12, nhưng chưa có kết quả GitHub Actions cho commit mới. Cổng người bệnh **chưa production-ready**.
