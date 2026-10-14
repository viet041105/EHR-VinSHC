// @vinshc/admin: workspace assignments, permission checks, audit log and (System Developer only)
// Core account lookup and app-role grants. Contract: docs/api/authorization-audit.md.
import {
  defineModule,
  metadata as m,
  active,
  BackendError,
  uuid,
  action,
  F,
  choice,
  id,
  optional,
  workflowConfigOptions,
  esc,
  CONNECTED_BADGE,
  openButton,
  preparationPanel,
} from "@vinshc/core";

const roleChoices = Object.entries(m.permissions.roles).map(([k, v]) => [
  k,
  v.label,
]);
const assignmentFields = [
  id("user", "Mã tài khoản (UUID)"),
  choice("role", "Vai trò ứng dụng", roleChoices),
  choice(
    "facility",
    "Cơ sở được phân công",
    active(m.facilities.records).map((f) => [f.locationUuid, f.name]),
  ),
];
const userView =
  "custom:(uuid,username,systemId,display,retired,roles:(uuid,name))";

const actions = {
  linkPortal: action("Liên kết tài khoản bệnh nhân", "metadata_admin", "update", [id("user", "Mã tài khoản bệnh nhân"), id("patient", "Mã bệnh nhân")], () => "portal/accounts", d => ({userUuid:uuid(d.user),patientUuid:uuid(d.patient)}), {systemOnly:true}),
  portalLinkHistory: action(
    "Lịch sử xác minh và thu hồi liên kết", "metadata_admin", "read",
    [id("user","UUID tài khoản bệnh nhân")],
    d=>"portal/accounts/"+uuid(d.user)+"/history",null,
    {method:"GET",systemOnly:true},
  ),
  verifyPortal: action(
    "Xác minh danh tính bệnh nhân", "metadata_admin", "update",
    [id("user","UUID tài khoản"),
     choice("verificationMethod","Phương pháp đã xác minh",[
       ["in_person_document","Đối chiếu giấy tờ trực tiếp"],
       ["verified_eid","Định danh điện tử đã xác minh"],
       ["verified_clinic_record","Đối chiếu hồ sơ cơ sở đã xác minh"]
     ])],
    d=>"portal/accounts/"+uuid(d.user)+"/verify",
    d=>({verificationMethod:d.verificationMethod}),
    {systemOnly:true,confirm:"Xác nhận đã đối chiếu danh tính bệnh nhân? Thao tác sẽ kích hoạt quyền xem dữ liệu đã công bố."}
  ),
  unlinkPortal: action("Thu hồi truy cập cổng bệnh nhân", "metadata_admin", "update", [id("user", "Mã tài khoản bệnh nhân"), F("reason","Lý do thu hồi","textarea",{max:1000})], d => "portal/accounts/"+uuid(d.user)+"/revoke", d=>({reason:d.reason}), {systemOnly:true,confirm:"Thu hồi ngay quyền xem dữ liệu công bố?"}),
  configuration: action(
    "Kiểm tra cấu hình nghiệp vụ",
    "metadata_admin",
    "read",
    [],
    () => "operations/configuration",
    null,
    { method: "GET" },
  ),
  audit: action(
    "Nhật ký truy cập",
    "metadata_admin",
    "read",
    [
      id("patient", "Lọc theo bệnh nhân (UUID)", false),
      id("encounter", "Lọc theo lần khám (UUID)", false),
      F("limit", "Số dòng mỗi lần", "number", {
        min: 1,
        max: 1000,
        step: 1,
        value: "200",
      }),
      F("offset", "Bỏ qua số dòng", "number", { min: 0, step: 1, value: "0" }),
    ],
    (d) => "authorization/audit?" + new URLSearchParams(d),
    null,
    { method: "GET" },
  ),
  workspace: action(
    "Kiểm tra workspace hiện tại",
    "metadata_admin",
    "read",
    [],
    () => "authorization/workspace",
    null,
    { method: "GET" },
  ),
  evaluate: action(
    "Kiểm tra quyền trong workspace",
    "metadata_admin",
    "read",
    [
      choice(
        "resource",
        "Nhóm nghiệp vụ",
        [...new Set(m.permissions.matrix.map((r) => r.resource))].map((v) => [
          v,
          v,
        ]),
      ),
      choice(
        "action",
        "Thao tác",
        ["read", "create", "update", "void", "cancel", "print", "download"].map(
          (v) => [v, v],
        ),
      ),
    ],
    (d) => "authorization/evaluate?" + new URLSearchParams(d),
    null,
    {
      method: "GET",
      notice:
        "Backend trả 403 nếu workspace hiện tại không được phép thực hiện thao tác đã chọn.",
    },
  ),
  assignWorkspace: action(
    "Gán vai trò và cơ sở",
    "metadata_admin",
    "update",
    assignmentFields,
    () => "authorization/assignment",
    (d) => ({ ...d }),
    {
      notice:
        "User phải có role ứng dụng tương ứng. Chọn cơ sở cấp cho user, có thể khác cơ sở đang mở.",
    },
  ),
  revokeWorkspace: action(
    "Thu hồi phân công workspace",
    "metadata_admin",
    "void",
    assignmentFields,
    () => "authorization/assignment",
    (d) => ({ ...d }),
    {
      method: "DELETE",
      notice: "Thu hồi phân công đã chọn. Không xóa tài khoản hoặc role.",
      prepare(data, ctx) {
        if (
          data.user === ctx.client.user.uuid &&
          data.role === ctx.role &&
          data.facility === ctx.facility
        )
          throw new BackendError(
            "Đổi workspace trước khi thu hồi phân công đang sử dụng.",
          );
      },
    },
  ),
  staffAudit: action(
    "Lịch sử quản trị nhân viên", "metadata_admin", "read", [],
    ()=>"staff/audit?limit=100",null,{method:"GET",systemOnly:true},
  ),
  systemUsers: action(
    "Tìm tài khoản nhân viên", "metadata_admin", "read",
    [optional("q", "Tên đăng nhập"), F("offset", "Trang bắt đầu", "number", { min: 0, value: "0" })],
    d => "staff/users?" + new URLSearchParams({ q: d.q || "", offset: d.offset, limit: "25" }),
    null, { method: "GET", systemOnly: true },
  ),
  createStaff: action(
    "Tạo tài khoản nhân viên", "metadata_admin", "create",
    [F("username", "Tên đăng nhập"), F("givenName", "Tên"), F("familyName", "Họ"),
      choice("gender", "Giới tính", [["U", "Không rõ"], ["M", "Nam"], ["F", "Nữ"]]),
      choice("role", "Vai trò ứng dụng", roleChoices),
      F("password", "Mật khẩu khởi tạo (12+ ký tự)", "password", { min: 12 })],
    () => "staff/users",
    d => ({ username: d.username, givenName: d.givenName, familyName: d.familyName,
      gender: d.gender, role: d.role, password: d.password }),
    { systemOnly: true, sensitive: true,
      notice: "Chỉ System Developer. Giao mật khẩu tạm bằng kênh bảo mật; không lưu hoặc trả lại trong UI." },
  ),
  grantAppRole: action(
    "Thêm role ứng dụng", "metadata_admin", "update",
    [id("user", "UUID tài khoản"), choice("role", "Role được phép", roleChoices)],
    d => "staff/users/" + uuid(d.user) + "/roles",
    d => ({role:d.role}), {systemOnly:true,confirm:"Xác nhận cấp thêm role cho tài khoản đã chọn?"},
  ),
  retireUser: action(
    "Khóa tài khoản", "metadata_admin", "update",
    [id("user","UUID tài khoản"), F("reason","Lý do khóa")],
    d => "staff/users/"+uuid(d.user)+"/state",
    d => ({active:false,reason:d.reason}),
    { systemOnly:true, confirm:"Xác nhận khóa tài khoản? Các workspace và liên kết provider đang hoạt động sẽ bị thu hồi.", prepare(d, ctx) { if(d.user===ctx.client.user?.uuid)
      throw new BackendError("Không được tự khóa tài khoản quản trị đang dùng."); },
      notice:"Yêu cầu xác nhận trước khi khóa; dữ liệu lịch sử được giữ lại." },
  ),
  unretireUser: action(
    "Mở khóa tài khoản", "metadata_admin", "update",
    [id("user","UUID tài khoản")],
    d => "staff/users/"+uuid(d.user)+"/state",
    () => ({active:true}), {systemOnly:true},
  ),
  resetStaffPassword: action(
    "Đặt lại mật khẩu", "metadata_admin", "update",
    [id("user","UUID tài khoản"),F("password","Mật khẩu mới (12+ ký tự)","password")],
    d => "staff/users/"+uuid(d.user)+"/password",
    d => ({password:d.password}),
    {systemOnly:true,sensitive:true,confirm:"Xác nhận đặt lại mật khẩu tài khoản?",notice:"Mật khẩu mới chỉ được gửi tới server, không lưu ở trình duyệt hoặc trả về."},
  ),
  createProvider: action(
    "Tạo provider và gán cơ sở", "metadata_admin", "create",
    [id("userUuid","UUID tài khoản bác sĩ/điều dưỡng/KTV"),
      id("facilityLocationUuid","OpenMRS Location UUID"),
      F("identifier","Mã nhân viên chuyên môn")],
    () => "directory/providers", d=>d, {systemOnly:true},
  ),
  linkProvider: action(
    "Liên kết provider–user", "metadata_admin", "update",
    [id("userUuid","UUID tài khoản"),id("providerUuid","Provider UUID"),
      id("facilityLocationUuid","Location UUID")],
    () => "directory/providers/link", d=>d, {systemOnly:true},
  ),
  unlinkProvider: action(
    "Hủy liên kết provider", "metadata_admin", "void",
    [id("userUuid","UUID tài khoản"),id("providerUuid","Provider UUID"),
      id("facilityLocationUuid","Location UUID")],
    () => "directory/providers/unlink", d=>d, {systemOnly:true,confirm:"Xác nhận thu hồi liên kết provider–cơ sở?"},
  ),
  retireProvider: action(
    "Ngừng provider", "metadata_admin", "void",
    [id("providerUuid","Provider UUID"),F("reason","Lý do")],
    d=>"directory/providers/"+uuid(d.providerUuid)+"/retire",
    d=>({reason:d.reason}), {systemOnly:true,confirm:"Xác nhận ngừng provider?"},
  ),
  userProviders: action(
    "Đọc liên kết provider", "metadata_admin", "read",
    [id("userUuid","UUID tài khoản")],
    d=>"directory/users/"+uuid(d.userUuid)+"/providers",
    null, {method:"GET",systemOnly:true},
  ),
  createFacility: action(
    "Tạo cơ sở mới", "metadata_admin", "create",
    [F("code","Mã cơ sở"),F("name","Tên hiển thị"),F("legalName","Tên pháp lý"),
      F("address","Địa chỉ"),optional("phone","Số điện thoại","tel"),
      F("timezone","Múi giờ","text",{value:"Asia/Ho_Chi_Minh"}),
      F("effectiveFrom","Hiệu lực từ ngày","date")],
    ()=>"directory/facilities",d=>d,{systemOnly:true},
  ),
  facilities: action(
    "Danh sách cơ sở", "metadata_admin", "read", [],
    ()=>"directory/facilities", null, {method:"GET",systemOnly:true},
  ),
  updateFacility: action(
    "Sửa thông tin cơ sở", "metadata_admin", "update",
    [id("facilityUuid","Business facility UUID"),F("legalName","Tên pháp lý"),
     F("address","Địa chỉ"),optional("phone","Điện thoại","tel")],
    d=>"directory/facilities/"+uuid(d.facilityUuid),
    d=>({legalName:d.legalName,address:d.address,...(d.phone?{phone:d.phone}:{})}),
    {systemOnly:true},
  ),
  retireFacility: action(
    "Ngừng hoạt động cơ sở", "metadata_admin", "void",
    [id("facilityUuid","Business facility UUID"),F("reason","Lý do ngừng"),
     F("effectiveTo","Ngày kết thúc hiệu lực","date")],
    d=>"directory/facilities/"+uuid(d.facilityUuid)+"/retire",
    d=>({reason:d.reason,effectiveTo:d.effectiveTo}),{systemOnly:true,confirm:"Xác nhận ngừng hoạt động cơ sở? Không thể tạo lượt khám mới tại cơ sở này."},
  ),
  draftForm: action(
    "Tạo phiên bản biểu mẫu nháp", "metadata_admin", "create",
    [id("facilityLocationUuid","Location UUID"),F("code","Mã biểu mẫu"),
      F("schemaJson",'JSON form schema, ví dụ {"fields":[]}',"textarea")],
    ()=>"admin-configuration/forms",d=>d,
    {onlyRoles:["admin"],notice:"Schema VinSHC version hóa; không dùng metadata/forms.json handoff làm form production."},
  ),
  formDetail: action(
    "Đọc phiên bản biểu mẫu", "metadata_admin", "read",
    [id("formUuid","Form UUID")],
    d=>"admin-configuration/forms/"+uuid(d.formUuid),null,{method:"GET"},
  ),
  activateForm: action(
    "Kích hoạt phiên bản form", "metadata_admin", "update",
    [id("formUuid","Form UUID")],
    d=>"admin-configuration/forms/"+uuid(d.formUuid)+"/activate",()=>({}),
    {onlyRoles:["admin"],confirm:"Kích hoạt biểu mẫu mới và ngừng phiên bản active trước đó?"},
  ),
  retireForm: action(
    "Ngừng phiên bản form", "metadata_admin", "update",
    [id("formUuid","Form UUID")],
    d=>"admin-configuration/forms/"+uuid(d.formUuid)+"/retire",()=>({}),
    {onlyRoles:["admin"],confirm:"Xác nhận ngừng hiệu lực biểu mẫu này?"},
  ),
  readWorkflow: action(
    "Đọc workflow theo cơ sở", "metadata_admin", "read",
    [id("locationUuid","Location UUID")],
    d=>"admin-configuration/workflow/"+uuid(d.locationUuid),null,{method:"GET"},
  ),
  setWorkflow: action(
    "Đặt workflow theo cơ sở", "metadata_admin", "update",
    [id("facilityLocationUuid","Location UUID"),
     choice("workflowCode","Quy trình", workflowConfigOptions()),
     F("expectedVersion","Version hiện tại (0 nếu mới)","number",{min:0,value:"0"})],
    ()=>"admin-configuration/workflow",
    d=>({facilityLocationUuid:d.facilityLocationUuid,workflowCode:d.workflowCode,
      expectedVersion:Number(d.expectedVersion)}),
    {onlyRoles:["admin"],confirm:"Thay đổi cấu hình workflow của cơ sở? Kiểm tra với quản lý vận hành trước khi xác nhận.",notice:"Cấu hình metadata có version; các workflow thực thi phải được nghiệm thu riêng."},
  ),
};

function directory(ctx) {
  const shortcuts = [
    ["createStaff","Tạo tài khoản"],["systemUsers","Tìm tài khoản"],
    ["retireUser","Khóa tài khoản"],["resetStaffPassword","Reset mật khẩu"],
    ["assignWorkspace","Gán cơ sở"],["createProvider","Tạo provider"],
    ["linkProvider","Liên kết provider"],["retireProvider","Ngừng provider"],
    ["createFacility","Tạo cơ sở"],["facilities","Danh sách cơ sở"],
    ["draftForm","Tạo form nháp"],["activateForm","Kích hoạt form"],
    ["setWorkflow","Chọn workflow"],["readWorkflow","Đọc workflow"],
    ["audit","Nhật ký truy cập"],["staffAudit","Audit quản trị"],
  ].filter(([key])=>ctx.canAction(key))
    .map(([key,label])=>openButton("admin",key,label)).join("");
  return `<section class="panel admin-directory">
    <div class="workspace-heading"><div><h2>Quản trị nhân viên và cơ sở</h2>
    <p>Thao tác thật qua API VinSHC, không ghi trực tiếp Core REST từ giao diện.
    Mật khẩu khởi tạo/reset không được hiển thị lại.</p></div>${CONNECTED_BADGE}</div>
    <div class="role-tags">${Object.values(m.permissions.roles).map(r=>`<span>${esc(r.label)}</span>`).join("")}</div>
    <div class="context-links">${shortcuts}</div>
    </section>`;
}

export default defineModule({
  name: "admin",
  version: "0.1.0",
  order: 120,
  sections: [
    {
      id: "admin",
      title: "Quản trị",
      resource: "metadata_admin",
      order: 120,
      actions: ["linkPortal", "verifyPortal", "unlinkPortal", "portalLinkHistory",
        "configuration",
        "audit",
        "workspace",
        "evaluate",
        "assignWorkspace",
        "revokeWorkspace",
        "systemUsers", "staffAudit", "createStaff", "grantAppRole",
        "retireUser", "unretireUser", "resetStaffPassword",
        "createProvider", "linkProvider", "unlinkProvider", "retireProvider", "userProviders",
        "createFacility", "facilities", "updateFacility", "retireFacility",
        "draftForm", "formDetail", "activateForm", "retireForm", "readWorkflow", "setWorkflow",
      ],
      note: "Quản trị qua VinSHC API. System Developer quản lý tài khoản/provider/cơ sở; admin theo workspace quản lý biểu mẫu và workflow được cấp quyền.",
      icon: "⚙",
      footer: directory,
    },
  ],
  actions,
});
