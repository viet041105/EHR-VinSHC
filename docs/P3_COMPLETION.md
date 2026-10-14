# P3 — Công bố hồ sơ và liên kết tài khoản bệnh nhân

> Phạm vi: clinic-node OpenMRS 3 + PostgreSQL, kiểm thử bằng dữ liệu **synthetic**.
> **Chưa được sử dụng trên bệnh nhân thật** khi chưa qua `docs/PILOT_READINESS.md`.

## 1. Liên kết người dùng và bệnh nhân có xác minh

OpenMRS User/Person và Patient vẫn là định danh gốc. VinSHC dùng `vinshc_portal_account`
làm projection trạng thái active và bảng **append-only**
`vinshc_portal_link_event` làm lịch sử version theo User. Trạng thái:
`pending` → `active` (sau verify) → `revoked`, có actor/time, phương pháp
xác minh, reason/version. Link không dựa trên CCCD, tên, số điện thoại,
email hoặc danh sách liên hệ.

Một User chỉ liên kết tối đa một Patient; Person phải trùng chính Patient,
không suy quyền đại diện từ quan hệ gia đình. Không được đổi sang Patient
khác bằng cách sửa UUID request. `self()` chỉ cấp quyền đọc khi tài khoản
đang hoạt động, có portal role, không mang staff role, và **link event mới nhất
là active**. Account mới tạo link đang pending sẽ nhận 403 cho các API đọc.

Cho đến khi có ma trận ủy quyền xác minh theo cơ sở, **chỉ System Developer**
được tạo, xác minh và thu hồi account link. Không có auto-verification.

### API quản trị (prefix `/openmrs/ws/rest/v1/vinshc/portal`)

| Method | Path | Mục đích |
|---|---|---|
| POST | `/accounts` | Tạo link pending (userUuid, patientUuid) |
| POST | `/accounts/{userUuid}/verify` | Kích hoạt với verificationMethod |
| POST | `/accounts/{userUuid}/revoke` | Thu hồi với reason |
| GET | `/accounts/{userUuid}/history` | Lịch sử actor, version, state, reason |

Verification allowlist: `in_person_document`, `verified_eid`,
`verified_clinic_record`. Đây là khai báo về cách đối chiếu, **không phải
tích hợp kỹ thuật với VNeID/CCCD**.

## 2. Công bố hồ sơ có chọn lọc

Chỉ bác sĩ thuộc workspace và có quyền finalize lâm sàng mới được dùng API
công bố cho encounter trong phạm vi cơ sở. Finalize consultation **không tự
đồng nghĩa publish**. POST bắt buộc chọn `sections` trong
`instructions`, `prescriptions`, `results`. Nguồn đã review được
snapshot theo patient, visit, encounter, facility, source type/UUID/revision
và publication version.

- `instructions`: whitelisted `exam.loi_dan`, `followup.ngay_tai_kham`,
  `followup.loi_dan`. Không bao gồm bệnh sử, liên hệ, CCCD hoặc nội dung
  chart nội bộ.
- `prescriptions`: chỉ đơn thuốc đang active; giữ thuốc, liều, đơn vị,
  thời lượng, hướng dẫn, trạng thái. Đơn discontinued/voided không được đưa
  vào snapshot mới.
- `results`: chỉ revision **mới nhất** có state final/corrected,
  reviewer, reviewedAt, và service order completed gắn với đúng encounter.
  Giữ mã kết quả, mã order, đơn vị, giá trị, state và version. Tuyệt đối
  **không** đưa byte/file đính kèm chưa scan vào publication.
- `appointments` và tài liệu đã ký: **chưa được phê duyệt và chưa hỗ trợ
  publish**; API appointments trả danh sách rỗng thay vì rò rỉ lịch hẹn
  vận hành không được công bố.

Bảng `vinshc_portal_publication` giữ bản snapshot/version; bảng
`vinshc_portal_publication_event` ghi `published`, `superseded`,
`revoked`, actor/time/reason. Dữ liệu snapshot không bị UPDATE đè.
Nếu nguồn clinical đổi revision, projection cũ không còn được trả về;
cần bác sĩ lựa chọn và publish phiên bản mới. Revoke yêu cầu reason.

| Method | Path | Mục đích |
|---|---|---|
| POST | `/visits/{visitUuid}/publication` | Publish sections, encounterUuid |
| POST | `/visits/{visitUuid}/publication/revoke` | Thu hồi với reason |
| GET | `/visits/{visitUuid}/publication/history` | Actor/time, source revision và trạng thái |

Hiện API bác sĩ dùng quyền finalize lâm sàng (cộng workspace doctor, scope
encounter); **resource/privilege chuyên biệt `record_publication` trong
permission matrix và cấu hình production vẫn cần bổ sung sau khi owner duyệt**.

## 3. Projection cho bệnh nhân

Chỉ lấy dữ liệu từ publication còn hiệu lực, kiểm tra lại source_revision
và account link server-side. Các API GET yêu cầu session patient; không
nhận patientUuid tự khai làm bằng chứng phân quyền:

- `/session`: persona và patientUuid tối thiểu.
- `/visits?limit=30&offset=0`: danh sách lượt đã publish; `hasMore`.
- `/visits/{visitUuid}/instructions`: lời dặn whitelisted.
- `/prescriptions?visit={visitUuid}&limit=30&offset=0`: đơn đã publish.
- `/results?visit={visitUuid}&limit=30&offset=0`: kết quả CLS đã publish.
- `/appointments`: rỗng nếu chưa có mô hình công bố lịch hẹn được duyệt.

Pagination với giới hạn 1–100 và offset 0–1.000.000; prescription/result
được phân trang theo **publication snapshot** để không trộn revision.
Projection chỉ trả UUID nguồn cho ứng dụng, không phát Core REST/FHIR URL để
người dùng tự đổi patient UUID.

## 4. Kiểm thử và giới hạn

Bộ regression: `tests/integration/test_b12_agent_portal.py`: **6/6 PASS**
trên OpenMRS/PostgreSQL và agent/clinic synthetic (15/10/2026). Bao gồm
pending 403, active sau verify, cross-patient 403, manager không publish/link,
thiếu sections 400, pagination, selected-only publication, supersede,
revoke có lý do, account retired không liên kết lại, lịch sử sự kiện,
kết quả CLS đã review có đơn vị/version, và patient/doctor agent qua proxy.

- `mvn -q -f infra/backend/vinshc-module/pom.xml test`: PASS.
- `npm --prefix infra/frontend test`: 22/22 PASS; `npm ... run build`: PASS.
- `python -m unittest discover -s metadata/tests -q`: 65/65 PASS.
- `docs/CLINIC_COMPLETION_CHECKLIST.md` P3: **29/32 tick**; 3 điều kiện
  còn lại được giữ ở trạng thái chưa hoàn thành để không suy diễn production readiness.

Chỉ chạy trên Compose project synthetic `ehr-p1-local`, không dùng dữ liệu
bệnh nhân thật. CI có bước B12 sau khi dựng agent/clinic; local PASS không
tự đồng nghĩa GitHub Actions đã PASS.

### Chưa hoàn tất để nghiệm thu production

1. Approval ma trận quyền mới, chính sách bác sĩ phụ trách ký/công bố và
   quyền xác minh tài khoản phân quyền theo từng cơ sở.
2. Chính sách công bố lịch hẹn và tài liệu đã ký, malware scan
   (P2), digital signature pháp lý, bảo quản/tái xuất bản kết quả.
3. Kiểm thử mở rộng cross-facility, tài khoản retired, lifecycle migration
   account legacy và backup–restore độc lập; kiểm toán triển khai nhiều cơ sở.
4. Test CI thực tế, log retention, chính sách tài khoản bệnh nhân (P4) và
   toàn bộ gate bảo mật/pilot readiness trước production.
