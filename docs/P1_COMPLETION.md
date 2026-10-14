# P1 — Tài khoản, provider, cơ sở, biểu mẫu và workflow

**Trạng thái:** Đã có API và kiểm thử tích hợp với dữ liệu synthetic. Chưa phê duyệt xử lý hồ sơ thật.

## Kiến trúc triển khai

- OpenMRS User, Person, Provider và Location là dữ liệu định danh gốc. `vinshc_business_facility` có business UUID riêng và ánh xạ duy nhất sang Location.
- `vinshc_provider_link` ghi user–provider–facility; chỉ một provider active theo user/facility. Tạo encounter lâm sàng có kiểm tra assignment phía backend.
- `vinshc_form_definition` lưu schema JSON, SHA-256, mã form, version, state draft/active/retired; chỉ kích hoạt bản nháp; phiên bản active cũ chuyển retired chứ không sửa nội dung.
- `vinshc_facility_workflow` lưu lựa chọn STANDARD_POSTPAY hoặc COMPACT_PREPAY theo cơ sở với expectedVersion để phát hiện cập nhật cạnh tranh.
- `vinshc_admin_event` là log append-only actor, time, action, target, không chứa mật khẩu/hash.

## API mới (gốc `/openmrs/ws/rest/v1/vinshc`)

| Method | Endpoint | Quyền |
|---|---|---|
| POST/GET | `staff/users` | System Developer |
| POST | `staff/users/{uuid}/roles`, `/state`, `/password` | System Developer |
| POST | `staff/me/password` | User đang đăng nhập và bị yêu cầu đổi mật khẩu |
| GET | `staff/audit` | System Developer |
| POST | `directory/providers`, `/providers/{uuid}`, `/providers/link`, `/providers/unlink`, `/providers/{uuid}/retire` | System Developer |
| GET | `directory/users/{uuid}/providers` | System Developer |
| POST/GET | `directory/facilities` | System Developer |
| GET/POST | `directory/facilities/{uuid}` | System Developer |
| POST | `directory/facilities/{uuid}/retire` | System Developer |
| GET/POST | `admin-configuration/forms` | metadata_admin read/update (workspace cơ sở) |
| GET | `admin-configuration/forms/{uuid}` | metadata_admin read (workspace cơ sở) |
| POST | `admin-configuration/forms/{uuid}/activate`, `/retire` | metadata_admin update |
| GET/POST | `admin-configuration/workflow/{locationUuid}` và `/workflow` | metadata_admin read/update |

Password khởi tạo hoặc reset chỉ được nhận qua POST, không bao giờ xuất lại trong DTO. API không nhận danh sách Core privileges. User mới hoặc vừa được reset có property `forcePassword=true`; mọi API VinSHC từ chối user này cho tới khi họ gọi `staff/me/password` bằng mật khẩu hiện tại và mật khẩu mới hợp lệ. Response chỉ công bố cờ `mustChangePassword`, không công bố secret/hash/salt. Mọi user được tạo bằng role trong VinSHC allowlist, System Developer không nhận thêm role lâm sàng chỉ để mở trang admin.

## Kiểm thử

Chỉ sử dụng Compose project `ehr-p1-local` (cổng `18084`) và tài khoản/Person/Provider synthetic. `python -m unittest -v tests.integration.test_p1_admin` kiểm tra 6 nhóm: tạo đủ 8 role và buộc đổi mật khẩu đầu tiên, từ chối privilege injection, validate/reset/retire/activate, create/update/retire provider và chống giả mạo Person/cơ sở, CRUD business facility, form list/versioning, workflow optimistic version và audit.

Báo cáo mặc định: `.runtime/reports/p1-acceptance.json`; có thể tách project bằng `VINSHC_TEST_REPORT_DIR`. Lệnh không sử dụng dữ liệu hoặc volume của project chính. Kiểm thử persistence đọc lại 8 tài khoản/role, liên kết provider, business facility đã retire và form version. CI chạy kiểm tra này sau recreate container và sau restore PostgreSQL sang project/volume mới; chỉ đánh dấu gate persistence hoàn tất khi run CI tương ứng xanh.

## Vấn đề chưa đóng — không tick cho đến khi có bằng chứng

- **Mẫu form production:** `metadata/vinshc/forms.json` là handoff, không phải O3 Form Engine schema. Form versioning mới là kho schema VinSHC, chưa được FE lâm sàng/O3 form renderer tiêu thụ.
- **Workflow runtime:** mã STANDARD_POSTPAY/COMPACT_PREPAY hiện lưu và đổi version theo cơ sở, nhưng `OperationsService` vẫn sử dụng các rule nghiệp vụ hiện tại; chưa thể nói cấu hình mới đã chi phối mọi transition.
- **Người dùng/cơ sở thực tế:** chưa có mã định danh pháp lý, thông tin hành chính, phân cấp location, mẫu biểu và người phê duyệt; không dựng dữ liệu production từ fixture synthetic.
- **Security sâu:** vẫn cần bằng chứng độc lập rằng access log/CI artifact không lộ credential, cùng test multi-location đầy đủ cho assignment, báo cáo và visit. Backup–restore P1 đã được đưa vào workflow nhưng cần một run CI xanh trước khi đóng gate.

**Không sử dụng hồ sơ thật cho tới khi P7 được nghiệm thu.**
