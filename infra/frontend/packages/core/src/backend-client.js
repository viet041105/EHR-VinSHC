export class BackendError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.details = details;
  }
}
const ROOT = "/openmrs/ws/rest/v1/";
const messages = {
  400: "Thông tin chưa hợp lệ. Kiểm tra các trường đã nhập.",
  401: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
  403: "Tài khoản không có quyền trong vai trò/cơ sở đã chọn.",
  404: "Không tìm thấy bản ghi hoặc API chưa được cài đặt.",
  409: "Dữ liệu đã thay đổi hoặc thao tác không phù hợp trạng thái hiện tại.",
  503: "Backend chưa có đủ cấu hình hoặc metadata cho chức năng này.",
};
export const isSystemAdministrator = (user) =>
  (user?.roles || []).some(
    (r) =>
      (typeof r === "string" ? r : r.name || r.display) === "System Developer",
  );
export class BackendClient {
  #token = null;
  constructor(fetcher = (...args) => globalThis.fetch(...args)) {
    this.fetcher = fetcher;
    this.workspace = null;
    this.user = null;
    this.generation = 0;
  }
  async request(
    path,
    {
      method = "GET",
      body,
      scoped = true,
      binary = false,
      adminCore = false,
    } = {},
  ) {
    if (adminCore) {
      if (
        !isSystemAdministrator(this.user) ||
        !/^user(?:\/[0-9a-f-]{36})?(?:\?|$)/i.test(path) ||
        !["GET", "POST"].includes(method)
      )
        throw new BackendError(
          "Chỉ quản trị hệ thống được dùng API tài khoản Core.",
          403,
        );
      if (
        method === "POST" &&
        (!/^user\/[0-9a-f-]{36}$/i.test(path) ||
          !body ||
          Object.keys(body).some((k) => k !== "roles") ||
          !Array.isArray(body.roles) ||
          body.roles.some((r) => !UUID_PATTERN.test(r)))
      )
        throw new BackendError(
          "Chỉ hỗ trợ cập nhật danh sách role của user hiện có.",
        );
      scoped = false;
    } else if (!/^(session(?:\?|$)|vinshc\/)/.test(path) || path.includes(".."))
      throw new BackendError("Đường dẫn API không được hỗ trợ.");
    const generation = this.generation,
      headers = { Accept: binary ? "*/*" : "application/json" };
    if (this.#token) headers.Authorization = "Basic " + this.#token;
    if (scoped && this.workspace) {
      headers["X-VinSHC-Workspace-Role"] = this.workspace.role;
      headers["X-VinSHC-Workspace-Facility"] = this.workspace.facility;
    }
    const multipart =
      typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !multipart)
      headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await this.fetcher(ROOT + path, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : multipart
              ? body
              : JSON.stringify(body),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BackendError(
        "Không kết nối được OpenMRS. Kiểm tra backend và cổng proxy trong hướng dẫn FE.",
      );
    }
    if (generation !== this.generation)
      throw new BackendError("Phiên đã thay đổi. Vui lòng thực hiện lại.");
    if (response.status === 401) this.clear();
    if (binary && response.ok) return response.blob();
    if (response.status === 204 && response.ok) return null;
    if (!response.headers.get("content-type")?.includes("json"))
      throw new BackendError(
        messages[response.status] ||
          "Backend không trả JSON. Kiểm tra gateway/module VinSHC.",
        response.status,
      );
    let data;
    try {
      data = await response.json();
    } catch {
      throw new BackendError(
        "Không đọc được phản hồi backend.",
        response.status,
      );
    }
    if (!response.ok) {
      const detail =
        typeof data.detail === "string" &&
        data.detail.length < 500 &&
        !/[\r\n]/.test(data.detail)
          ? " " + data.detail
          : "";
      throw new BackendError(
        (messages[response.status] ||
          "Backend trả lỗi HTTP " + response.status + ".") + detail,
        response.status,
        data,
      );
    }
    return data;
  }
  async chat(persona, body, { signal } = {}) {
    if (!["doctor", "patient"].includes(persona) || !this.#token)
      throw new BackendError("Cần đăng nhập đúng tài khoản để dùng trợ lý.", 401);
    if (persona === "doctor" && this.workspace?.role !== "doctor")
      throw new BackendError("Chọn workspace bác sĩ trước khi hỏi.", 403);
    const generation = this.generation;
    const headers = { Authorization: "Basic " + this.#token, Accept: "application/json", "Content-Type": "application/json" };
    if (persona === "doctor") {
      headers["X-VinSHC-Workspace-Role"] = this.workspace.role;
      headers["X-VinSHC-Workspace-Facility"] = this.workspace.facility;
    }
    let response;
    try {
      response = await this.fetcher("/agent/v1/" + persona + "/chat", {
        method: "POST", headers, body: JSON.stringify(body), credentials: "omit", redirect: "error", cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(95000)]) : AbortSignal.timeout(95000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new BackendError("Trợ lý chưa kết nối hoặc phản hồi quá lâu. Bạn vẫn có thể đọc hồ sơ trực tiếp.");
    }
    if (generation !== this.generation) throw new BackendError("Phiên đã thay đổi; bỏ phản hồi cũ.");
    if (response.status === 401) this.clear();
    let data;
    try { data = await response.json(); } catch { throw new BackendError("Trợ lý không trả dữ liệu hợp lệ.", response.status); }
    if (!response.ok) throw new BackendError(data.detail || messages[response.status] || "Trợ lý chưa sẵn sàng.", response.status);
    return data;
  }
  async login(username, password) {
    this.clear();
    if (!username.trim() || !password)
      throw new BackendError("Cần tên đăng nhập và mật khẩu.");
    this.#token = btoa(
      String.fromCharCode(
        ...new TextEncoder().encode(username.trim() + ":" + password),
      ),
    );
    try {
      const session = await this.request("session?v=full", { scoped: false });
      if (session.authenticated !== true || !session.user?.uuid)
        throw new BackendError(messages[401], 401);
      this.user = session.user;
      return session;
    } catch (error) {
      this.clear();
      throw error;
    }
  }
  async selectWorkspace(role, facility) {
    this.generation++;
    this.workspace = { role, facility };
    try {
      const workspace = await this.request("vinshc/authorization/workspace");
      if (workspace.role !== role || workspace.facilityUuid !== facility)
        throw new BackendError("Backend trả không gian làm việc không khớp.");
      return workspace;
    } catch (error) {
      this.workspace = null;
      throw error;
    }
  }
  clear() {
    this.#token = null;
    this.workspace = null;
    this.user = null;
    this.generation++;
  }
}
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuid = (value) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value || "",
    )
  )
    throw new BackendError("Cần mã UUID hợp lệ từ backend.");
  return value.toLowerCase();
};
export const instant = (value) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()))
    throw new BackendError("Thời điểm không hợp lệ.");
  return d.toISOString();
};
export function money(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new BackendError(
      "Số tiền phải là số nguyên VND dương trong phạm vi an toàn.",
    );
  return n;
}
// Inclusive input limits from VinshcService at metadata/source.json's commit; not clinical thresholds.
export const VITAL_LIMITS = {
  pulse: [1, 350],
  systolic: [1, 350],
  diastolic: [1, 300],
  temperature: [25, 46],
  respiratory: [1, 150],
  spo2: [0, 100],
  weight: [0.2, 650],
  height: [20, 300],
};
export function vitalsPayload(patient, encounter, data, fields) {
  const values = {},
    states = {};
  for (const field of fields) {
    const raw = data[field.key],
      state = data[field.key + "State"];
    if (raw !== "" && raw !== undefined && raw !== null) {
      const n = Number(raw);
      const [min, max] = VITAL_LIMITS[field.key];
      if (!Number.isFinite(n) || n < min || n > max)
        throw new BackendError("Kiểm tra " + field.label + ".");
      if (state)
        throw new BackendError(
          field.label + ": chọn giá trị hoặc trạng thái thiếu.",
        );
      values[field.code] = n;
    } else if (state) states[field.code] = state;
  }
  if (!Object.keys(values).length && !Object.keys(states).length)
    throw new BackendError("Cần ít nhất một giá trị hoặc trạng thái thiếu.");
  const a = "vitals.ha_tam_thu",
    b = "vitals.ha_tam_truong";
  if ((values[a] !== undefined) !== (values[b] !== undefined)) {
    const missing = values[a] === undefined ? a : b;
    if (!states[missing])
      throw new BackendError(
        "Huyết áp thiếu một vế cần ghi trạng thái thiếu tường minh.",
      );
  }
  return {
    patient: uuid(patient),
    encounter: uuid(encounter),
    measuredAt: instant(data.measuredAt),
    values,
    states,
  };
}
