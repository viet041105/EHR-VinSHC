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
  unlinkPortal: action("Thu hồi truy cập cổng bệnh nhân", "metadata_admin", "update", [id("user", "Mã tài khoản bệnh nhân")], d => "portal/accounts/"+uuid(d.user), () => undefined, {method:"DELETE",systemOnly:true}),
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
        "Kiểm tra xem vai trò đang dùng có được phép thực hiện công việc đã chọn hay không.",
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
        "Tài khoản cần có vai trò tương ứng. Chọn cơ sở mà nhân viên sẽ làm việc.",
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
      notice: "Thu hồi quyền làm việc tại cơ sở đã chọn. Tài khoản và vai trò vẫn được giữ.",
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
  systemUsers: action(
    "Tìm tài khoản OpenMRS",
    "metadata_admin",
    "read",
    [
      optional("query", "Tên đăng nhập cần tìm"),
      F("startIndex", "Bỏ qua số tài khoản", "number", {
        min: 0,
        step: 1,
        value: "0",
      }),
    ],
    (d) =>
      "user?" +
      new URLSearchParams({
        v: userView,
        limit: "50",
        startIndex: d.startIndex,
        ...(d.query ? { q: d.query } : {}),
      }),
    null,
    {
      method: "GET",
      adminCore: true,
      systemOnly: true,
      notice:
        "Tìm tài khoản theo tên đăng nhập. Cần quyền quản trị hệ thống để sử dụng.",
    },
  ),
  grantAppRole: action(
    "Đổi vai trò VinSHC của tài khoản",
    "metadata_admin",
    "update",
    [
      id("user", "Mã tài khoản (UUID)"),
      choice("role", "Role VinSHC mới", roleChoices),
    ],
    (d) => "user/" + uuid(d.user),
    null,
    {
      adminCore: true,
      systemOnly: true,
      notice:
        "Thay role VinSHC hiện tại bằng một role mới. Các role hệ thống/Core như System Developer được giữ nguyên. Sau đó phân công cơ sở làm việc.",
      async send({ client }, { path, data }) {
        const user = await client.request(
          path + "?v=custom:(uuid,retired,roles:(uuid,name))",
          { adminCore: true },
        );
        if (user.retired)
          throw new BackendError("Tài khoản đã ngừng hoạt động.");
        const appRoleIds = new Set(
          Object.values(m.permissions.roles).map((role) => role.openmrs.uuid),
        );
        return client.request(path, {
          method: "POST",
          body: {
            roles: [
              ...new Set([
                ...user.roles.map((r) => r.uuid).filter((roleId) => !appRoleIds.has(roleId)),
                m.permissions.roles[data.role].openmrs.uuid,
              ]),
            ],
          },
          adminCore: true,
        });
      },
    },
  ),
};

function directory(ctx) {
  return (
    `<section class="panel admin-directory"><div class="workspace-heading"><div><h2>Tài khoản và phân quyền</h2><p>Phân công vai trò và cơ sở cho tài khoản nhân viên đã có.</p></div>${CONNECTED_BADGE}</div><div class="role-tags">${Object.values(
      m.permissions.roles,
    )
      .map((role) => `<span>${esc(role.label)}</span>`)
      .join(
        "",
      )}</div><div class="context-links">${ctx.canAction("systemUsers") ? openButton("admin", "systemUsers", "Tìm tài khoản") : ""}${ctx.canAction("grantAppRole") ? openButton("admin", "grantAppRole", "Đổi vai trò VinSHC") : ""}${openButton("admin", "assignWorkspace", "Phân công cơ sở")}${openButton("admin", "workspace", "Kiểm tra phân công")}${openButton("admin", "audit", "Nhật ký truy cập")}</div></section>` +
    preparationPanel(
      "Tạo tài khoản nhân viên",
      "Chức năng tạo tài khoản chưa khả dụng. Hiện chỉ phân công được tài khoản đã có.",
      [
        F("username", "Tên đăng nhập"),
        F("fullName", "Họ tên nhân viên"),
        choice("role", "Vai trò ứng dụng", roleChoices),
      ],
      ctx.field,
      "Tạo tài khoản",
    ) +
    preparationPanel(
      "Thiết lập cơ sở và biểu mẫu",
      "Có thể xem cấu hình hiện tại. Chức năng thay đổi cơ sở và biểu mẫu chưa khả dụng.",
      [
        F("facilityName", "Tên cơ sở"),
        F("facilityAddress", "Địa chỉ cơ sở", "textarea"),
        F("facilityPhone", "Điện thoại", "tel", { required: false }),
        choice("workflow", "Quy trình", workflowConfigOptions()),
        F("formVersion", "Phiên bản biểu mẫu", "text", { required: false }),
      ],
      ctx.field,
      "Lưu thiết lập",
    )
  );
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
      actions: ["linkPortal", "unlinkPortal",
        "configuration",
        "audit",
        "workspace",
        "evaluate",
        "assignWorkspace",
        "revokeWorkspace",
        "systemUsers",
        "grantAppRole",
      ],
      note: "Phân công nhân viên và xem nhật ký hoạt động. Một số công việc cần quyền quản trị hệ thống.",
      icon: "⚙",
      partial: "Một số mục chưa khả dụng",
      footer: directory,
    },
  ],
  actions,
});
