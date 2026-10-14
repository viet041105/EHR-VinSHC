# Đối chiếu backend và quyền vào FE

Kiểm tra ngày 12/10/2026, Asia/Ho_Chi_Minh. Backend được đối chiếu với
`main`/`origin/main` sau fetch: `d9d5b957223f6bc73db173dbbc1d413910689526`.
Đây là kiểm tra khả năng tích hợp và cấu hình, không phải audit bảo mật toàn bộ OpenMRS.

## Cập nhật sau khi được yêu cầu cấu hình

Tài khoản `admin` đã được thêm role `VinSHC App: admin` và một assignment active tại
VinSHC Development Clinic bằng API BE sẵn có; role Core và mật khẩu cũ được giữ nguyên.
FE đã có form tìm user/thêm role cho System Developer và assign/revoke/evaluate/audit.
Kiểm thử trình duyệt thật đã mở workspace admin, tìm user, đọc audit và báo cáo ngày.
Mọi 56 mapping VinSHC đã có caller FE, gồm các endpoint trước đó chưa nối.
Các giới hạn patient/visit/vitals/list-search/dispensing vẫn còn như bảng bên dưới.

Các số liệu 0 assignment và mô tả FE chưa có form ở phần kiểm tra dưới đây là
snapshot trước cấu hình, được giữ để giải thích nguyên nhân ban đầu.

## Kết luận về đăng nhập admin (trước cấu hình)

BE đã có session, phân quyền, assignment user–role–facility và kiểm tra workspace.
Không thiếu package npm, schema hoặc module phân quyền trên stack đang chạy.

- Session thật của `admin` trả `authenticated=true`, roles: `System Developer`, `Provider`.
- DB đã nạp đủ 8 `VinSHC App: <role>` và 69 scoped privileges.
- Cơ sở `VinSHC Development Clinic` tồn tại, không retired.
- `vinshc_workspace_assignment` có **0 assignment active**; không có tài khoản nghiệp vụ.
- FE `packages/core/src/metadata.js::assignedRoles` chỉ cho chọn các role `VinSHC App` có tên trong session.
  `shell/src/app.js` (trước là `connected.js`) vì vậy không hiện lựa chọn workspace cho root admin hiện tại.
- Gọi thật `GET /vinshc/authorization/workspace` không header: HTTP 403,
  `Privileges required: active role workspace`.
- Gọi cùng endpoint bằng admin với header role `admin` và cơ sở đúng: HTTP 403,
  `Privileges required: workspace assignment`.

Quyền system administrator và quyền workspace ứng dụng là hai cơ chế khác nhau.
Root admin có thể quản trị nhiều API Core; FE vẫn kiểm tra role ứng dụng cụ thể.
Muốn có tài khoản vào workspace, cần provision role ứng dụng và assignment phù hợp.
Có thể dùng user quản trị ứng dụng riêng; không cần viết BE phân quyền mới.

API đã tồn tại:

- `POST /openmrs/ws/rest/v1/vinshc/authorization/assignment`
  với `{user: <userUuid>, role: <roleCode>, facility: <locationUuid>}`.
- `DELETE .../assignment`, `GET .../workspace`, `GET .../evaluate`, `GET .../audit`.
- OpenMRS Core có API user/role; VinSHC chưa có CRUD tài khoản scoped riêng.

FE hiện có đọc cấu hình/audit nhưng chưa nối form gán/thu hồi assignment hay quản lý user.
Đợt kiểm tra này không tạo user, gán role hoặc sửa assignment.

## Những phần BE đã có và khoảng trống khi nối FE

| Phần | Hiện trạng BE | Điểm còn thiếu cho FE |
| --- | --- | --- |
| Session, phân quyền, audit | B5 có 8 role, workspace, scope cơ sở, assignment/revoke, audit và đánh giá ma trận quyền | Chưa provision tài khoản; FE chưa có giao diện cấu hình quyền ban đầu |
| Tìm/tạo/sửa bệnh nhân, mã hồ sơ | Core patient/person REST và IDGen; VinSHC identity/contact/field-state/address có validation, history | App roles không được gọi Core trực tiếp; VinSHC chưa có patient CRUD/search scoped tương đương. Identity không trả đầy đủ Person Core |
| Mở/kết thúc lượt khám, tạo encounter | Core visit/encounter REST đã có | Chưa có endpoint VinSHC scoped để app roles thực hiện lifecycle này |
| Sinh hiệu | VinSHC validated write; Core obs/FHIR hỗ trợ đọc/correction/void với quyền Core | Chưa có API VinSHC scoped cho danh sách nhóm đo và correction/void; clinical-summary hiện không trả vitals |
| Phiếu khám, ICD, dị ứng, đơn thuốc | VinSHC consultation/correction/finalize, clinical-summary, diagnosis, allergy, DrugOrder/discontinue | Cần patient/visit/encounter/provider hợp lệ; danh mục hiện là test, chưa production |
| Lịch hẹn, hàng đợi, thu tiền, CLS | B8 có create/read-by-UUID/transition, bill/receipt/settle/refund/cancel, order/result/revision/attachment | Controller chưa có list/search cho các danh sách B8; FE còn phải nhập UUID |
| Mẫu in, báo cáo | Document DTO, số chứng từ; báo cáo ngày aggregate | FE còn phần render/UX mẫu in; document GET có thể tạo snapshot chứng từ nên không dùng trong lần kiểm tra chỉ đọc này |
| Kho, cấp thuốc | Module Stock Management có cài; cơ sở dữ liệu qua kiểm tra | Chưa chứng minh nghiệp vụ dispensing đầy đủ; chưa có API VinSHC dispensing |
| Tích hợp ngoài | Manifest/contract BHYT, HĐĐT, đơn thuốc quốc gia, LIS/PACS | Connector thật chưa triển khai; mặc định disabled |
| Vận hành, FHIR | Có runbook backup/restore, migration PostgreSQL, mapping FHIR và kiểm thử | FHIR còn gap thuật ngữ/profile/provenance; HTTPS, secret store, DB least privilege và nghiệm thu production còn mở |

Đã kiểm kê cả 4 controller nghiệp vụ VinSHC (56 mapping), đối chiếu các service
Authorization/Vinshc/Clinical/Operations, interceptor quyền, config/migration,
baseline Docker, metadata, test fixture và tài liệu bàn giao. Không review lại toàn bộ
mã nguồn của 29 module upstream hay tuyên bố mọi luồng ghi đã chạy trên máy này.

## Vì sao báo cáo BE pass nhưng chưa có tài khoản dùng FE?

B2/B3 dùng `EHR_ADMIN_USERNAME` để tạo patient/visit/encounter/obs bằng API Core.
B5 tạo từng tài khoản bằng mật khẩu ngẫu nhiên trong bộ nhớ, gán workspace, kiểm tra
ma trận 896 ô, rồi retire user/void Person sau test. B5 cũng kiểm tra app roles
bị từ chối khi gọi Core patient REST trực tiếp.

Vì vậy các test chứng minh từng hợp đồng và ranh giới quyền, không chứng minh nhân viên
có thể thực hiện từ đăng ký bệnh nhân đến kết thúc lượt khám qua FE hiện tại.
Tài khoản fixture trong CI cũng không được chuyển vào database local này.

## Bằng chứng kiểm tra hiện tại

| Kiểm tra trên máy này | Kết quả |
| --- | --- |
| Docker | Cả db/backend/frontend/gateway healthy sau restart, giữ nguyên volume |
| Database verifier | PostgreSQL 16.15, UTF8, 253 bảng, đủ extension, 118 FK Stock Management, 2 cột BYTEA đúng |
| Smoke không tạo fixture | 8 check đạt: readiness, O3/gateway, authentication, module/version, location, từ chối credential sai/ẩn danh, REST search/FHIR capabilities, FHIR search |
| Module runtime | 29 module upstream started và đúng version; thêm `vinshc` 0.3.0 thành tổng 30 module started |
| Migration VinSHC | Có workspace/operations và cả `vinshc-0.3.1-review-fixes`, `vinshc-0.3.1-timestamptz`; version OMOD vẫn là 0.3.0 |
| Metadata runtime chỉ đọc | 78/78 identity nền đúng UUID, kiểu dữ liệu, unit và concept set; test-only catalogue có phạm vi kiểm chứng riêng |
| Metadata structural | 205 field, 234 identity, 22 output đồng bộ; PASS |
| Metadata unit tests | 65/65 đạt |
| Tooling unit tests | 27/27 đạt |
| Cấu hình API thật | ICD ready; các concept set dị ứng/đơn thuốc ready; 8 drug, 3 order frequency; 3.356 entry địa chỉ; 2 workflow, VND, Asia/Ho_Chi_Minh |
| Báo cáo ngày API thật | Trả 200; số lượt mở/đóng, gross/refund/net ngày 12/10/2026 đều 0 |
| Dữ liệu/credential | Không tạo clinical/user fixtures; không đưa mật khẩu hoặc hash vào báo cáo |

Báo cáo JSON runtime: `.runtime/backend/.runtime/reports/current-smoke.json` và
`current-metadata.json`, không commit. Bộ metadata verifier kiểm tra danh mục nền;
bộ test-only catalogue được đối chiếu thêm qua clinical-configuration, không coi
việc ready là nghiệm thu nghiệp vụ production.

## Báo cáo nguồn và CI

Đã đọc/đối chiếu `docs/BACKEND.md`, `BACKEND_HANDOFF.md`, `REVIEW_BE.md` (đặc biệt mục 9),
`VALIDATION.md`, `METADATA_VALIDATION.md`, `PILOT_READINESS.md`, `CI.md`,
`docs/api/*`, test B2/B3/B5 và inventory controller/service tại commit trên.

CI của đúng commit main đã kiểm tra qua GitHub API:
[run 38263645897](https://github.com/viet041105/EHR-VinSHC/actions/runs/38263645897).
Hai job `Configuration and tooling` và `B1-B9 PostgreSQL, API, FHIR, restart and restore`
đều `success`; các bước ordered B1–B8, restart, backup, restore, handoff và review
regressions đều `success`. Run hoàn tất lúc 21:43 ngày 12/10/2026 (UTC+7).
Không tải artifact để khẳng định lại mọi assertion riêng lẻ.

Báo cáo review nguồn ghi local B1–B8 53/53, B9 restart 4/4 và restore 4/4,
B10 regression 16/16, Java unit 18/18. Đợt này không chạy lại các integration test
đó trên DB local vì chúng tạo dữ liệu giả. CI success đã có, dù một số đoạn tài liệu
vẫn ghi chưa commit/chưa chạy GitHub Actions; không dùng các đoạn đó làm trạng thái hiện tại.
`PILOT_READINESS.md` vẫn kết luận NOT APPROVED FOR REAL DATA; CI success không thay
thế nghiệm thu trình duyệt, danh mục production và xác nhận của owner.

Lưu ý branch: nhánh `fe` còn source BE cũ ở gốc checkout; stack được dựng từ bản
main nguyên bản xuất vào `infra/frontend/.runtime/backend`, đúng commit hiện tại.
Không dùng sự vắng mặt của module ở gốc nhánh `fe` để kết luận Docker thiếu module.

## Thứ tự xử lý phù hợp

1. Provision tài khoản/role/assignment và nối giao diện quản trị với API phân quyền
   đã có. Đây là nguyên nhân trực tiếp chưa mở được workspace.
2. Bổ sung hợp đồng/API scoped cho patient và visit/encounter, đọc/sửa vitals,
   list/search B8; hoặc chốt một phương án phân quyền tương đương được BE kiểm chứng.
   Không giải quyết bằng cách cấp quyền Core rộng cho mọi nhân viên.
3. Kiểm thử luồng bằng tài khoản nghiệp vụ trên FE sau khi đủ API; giữ tách biệt
   với test bằng system admin và với các gate production.

Không chỉnh BE, metadata ngoài FE hoặc quyền tài khoản trong lần kiểm tra này.
