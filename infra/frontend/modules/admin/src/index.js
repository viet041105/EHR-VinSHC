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
        "Chỉ System Developer có quyền đọc tài khoản Core. Dùng UUID trả về để cấp role và phân công workspace.",
    },
  ),
  grantAppRole: action(
    "Thêm role ứng dụng cho tài khoản",
    "metadata_admin",
    "update",
    [
      id("user", "Mã tài khoản (UUID)"),
      choice("role", "Role ứng dụng cần thêm", roleChoices),
    ],
    (d) => "user/" + uuid(d.user),
    null,
    {
      adminCore: true,
      systemOnly: true,
      notice:
        "Chỉ System Developer. Giữ nguyên mọi role đang có, thêm role ứng dụng; sau đó dùng Gán vai trò và cơ sở.",
      // Core replaces the whole role list, so read the current roles and add one.
      async send({ client }, { path, data }) {
        const user = await client.request(
          path + "?v=custom:(uuid,retired,roles:(uuid,name))",
          { adminCore: true },
        );
        if (user.retired)
          throw new BackendError("Tài khoản đã ngừng hoạt động.");
        return client.request(path, {
          method: "POST",
          body: {
            roles: [
              ...new Set([
                ...user.roles.map((r) => r.uuid),
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
    `<section class="panel admin-directory"><div class="workspace-heading"><div><h2>Tài khoản và phân quyền</h2><p>Vai trò được định nghĩa trong metadata; quyền sử dụng còn phụ thuộc phân công cơ sở của từng tài khoản.</p></div>${CONNECTED_BADGE}</div><div class="role-tags">${Object.values(
      m.permissions.roles,
    )
      .map((role) => `<span>${esc(role.label)}</span>`)
      .join(
        "",
      )}</div><div class="context-links">${ctx.canAction("systemUsers") ? openButton("admin", "systemUsers", "Tìm tài khoản") : ""}${ctx.canAction("grantAppRole") ? openButton("admin", "grantAppRole", "Thêm role cho tài khoản") : ""}${openButton("admin", "assignWorkspace", "Phân công cơ sở")}${openButton("admin", "workspace", "Kiểm tra phân công")}${openButton("admin", "audit", "Nhật ký truy cập")}</div></section>` +
    preparationPanel(
      "Tạo tài khoản nhân viên",
      "Chưa có luồng tạo tài khoản trên FE. Việc thêm role hiện tại chỉ áp dụng cho user đã tồn tại.",
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
      "Cấu hình hiện tại có thể đọc qua chức năng Kiểm tra cấu hình nghiệp vụ; backend chưa có API chỉnh cấu hình dành cho workspace.",
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
      actions: [
        "configuration",
        "audit",
        "workspace",
        "evaluate",
        "assignWorkspace",
        "revokeWorkspace",
        "systemUsers",
        "grantAppRole",
      ],
      note: "Quản lý phân công dùng API VinSHC. Tìm tài khoản và cấp role Core chỉ hiện cho System Developer; tài khoản quản trị ứng dụng vẫn bị backend kiểm tra quyền.",
      icon: "⚙",
      partial: "Một phần chờ backend",
      footer: directory,
    },
  ],
  actions,
});
