export class BackendError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.details = details;
  }
}
// Public service entry point; upstream routing is configured outside the product UI.
const ROOT = "/api/";
const messages = {
  400: "Thông tin chưa hợp lệ. Kiểm tra các trường đã nhập.",
  401: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
  403: "Tài khoản không có quyền trong vai trò/cơ sở đã chọn.",
  404: "Không tìm thấy thông tin hoặc chức năng chưa sẵn sàng.",
  409: "Dữ liệu đã thay đổi hoặc thao tác không phù hợp trạng thái hiện tại.",
  503: "Dịch vụ chưa sẵn sàng cho chức năng này. Vui lòng thử lại sau.",
};
// Mirrors StaffAccountService.validPassword: length only (6-256), no character-class rules.
// The BE trims the value before storing it, so edge whitespace would make the new token wrong.
export function passwordRules(password, label = "Mật khẩu mới") {
  if (password !== password.trim())
    return label + " không được bắt đầu hoặc kết thúc bằng dấu cách.";
  if (password.length < 6 || password.length > 256)
    return label + " cần từ 6 đến 256 ký tự.";
  return "";
}
export function passwordProblem(current, next) {
  if (!current) return "Nhập mật khẩu hiện tại.";
  const rules = passwordRules(next);
  if (rules) return rules;
  if (next === current) return "Mật khẩu mới phải khác mật khẩu hiện tại.";
  return "";
}
// Backend pattern allows 3-60 chars but OpenMRS core rejects usernames over 50: 3-50 chars, starts with a letter or digit.
export function usernameProblem(username) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$/.test(username.trim())
    ? ""
    : "Tên đăng nhập cần 3-50 ký tự, bắt đầu bằng chữ hoặc số, chỉ gồm chữ/số không dấu và . _ - (không dấu cách, không chữ có dấu, không @).";
}
export const isSystemAdministrator = (user) =>
  (user?.roles || []).some(
    (r) =>
      (typeof r === "string" ? r : r.name || r.display) === "System Developer",
  );
export class BackendClient {
  #token = null;
  #username = null;
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
      signal,
    } = {},
  ) {
    if (adminCore) {
      if (
        !isSystemAdministrator(this.user) ||
        !/^user(?:\/[0-9a-f-]{36})?(?:\?|$)/i.test(path) ||
        !["GET", "POST"].includes(method)
      )
        throw new BackendError(
          "Công việc này cần quyền quản trị hệ thống.",
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
          "Chỉ có thể phân công vai trò cho tài khoản đã có.",
        );
      scoped = false;
    } else if (!/^(session(?:\?|$)|vinshc\/)/.test(path) || path.includes(".."))
      throw new BackendError("Chức năng này chưa được hỗ trợ.");
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
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new BackendError(
        "Chưa kết nối được dịch vụ phòng khám. Vui lòng thử lại hoặc liên hệ quản trị.",
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
          "Dịch vụ chưa phản hồi hợp lệ. Vui lòng thử lại hoặc liên hệ quản trị.",
        response.status,
      );
    let data;
    try {
      data = await response.json();
    } catch {
      throw new BackendError(
        "Chưa đọc được thông tin từ dịch vụ. Vui lòng thử lại.",
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
      // 400/409 bodies carry {error: reason}; show it so users can see which field was refused.
      const reason =
        !detail &&
        [400, 409].includes(response.status) &&
        typeof data.error === "string" &&
        data.error.length < 200 &&
        !/[\r\n]/.test(data.error)
          ? " (" + data.error + ")"
          : "";
      throw new BackendError(
        (messages[response.status] ||
          "Dịch vụ trả lỗi " + response.status + ".") + detail + reason,
        response.status,
        data,
      );
    }
    return data;
  }
  async chat(persona, body, { signal } = {}) {
    return this.#agentRequest(persona, "chat", { body, signal });
  }
  async readKnowledgeChunk(persona, chunkUuid, { signal } = {}) {
    return this.#agentRequest(persona, "knowledge/chunks/" + uuid(chunkUuid), { signal });
  }
  async #agentRequest(persona, path, { body, signal } = {}) {
    if (!["doctor", "patient"].includes(persona) || !this.#token)
      throw new BackendError("Cần đăng nhập đúng tài khoản để dùng trợ lý.", 401);
    if (persona === "doctor" && this.workspace?.role !== "doctor")
      throw new BackendError("Chọn vai trò bác sĩ trước khi dùng trợ lý.", 403);
    const generation = this.generation;
    const headers = { Authorization: "Basic " + this.#token, Accept: "application/json", "Content-Type": "application/json" };
    if (persona === "doctor") {
      headers["X-VinSHC-Workspace-Role"] = this.workspace.role;
      headers["X-VinSHC-Workspace-Facility"] = this.workspace.facility;
    }
    let response;
    try {
      response = await this.fetcher("/agent/v1/" + persona + "/" + path, {
        method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "omit", redirect: "error", cache: "no-store",
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
    if (!response.ok) throw new BackendError(data.detail || messages[response.status] || "Trợ lý chưa sẵn sàng.", response.status, data);
    return data;
  }
  async login(username, password) {
    this.clear();
    if (!username.trim() || !password)
      throw new BackendError("Cần tên đăng nhập và mật khẩu.");
    this.#username = username.trim();
    this.#token = btoa(
      String.fromCharCode(
        ...new TextEncoder().encode(this.#username + ":" + password),
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
  // Replaces the temporary password, then signs in again with the new one so the token is verified
  // by the server. Passwords are never kept after the call.
  async changeOwnPassword(current, next) {
    const username = this.#username;
    if (!this.#token || !username) throw new BackendError(messages[401], 401);
    const problem = passwordProblem(current, next);
    if (problem) throw new BackendError(problem);
    try {
      await this.request("vinshc/staff/me/password", {
        method: "POST",
        scoped: false,
        body: { currentPassword: current, newPassword: next },
      });
    } catch (error) {
      const reason = error.details?.error;
      if (error.status === 400 && typeof reason === "string" && reason.length < 300 && !/[\r\n]/.test(reason))
        throw new BackendError(
          "Không đổi được mật khẩu (kiểm tra mật khẩu hiện tại và yêu cầu mật khẩu mới): " + reason,
          400,
          error.details,
        );
      throw error;
    }
    return this.login(username, next);
  }
  async selectWorkspace(role, facility) {
    this.generation++;
    this.workspace = { role, facility };
    try {
      const workspace = await this.request("vinshc/authorization/workspace");
      if (workspace.role !== role || workspace.facilityUuid !== facility)
        throw new BackendError("Chưa xác nhận được vai trò và cơ sở đã chọn.");
      return workspace;
    } catch (error) {
      this.workspace = null;
      throw error;
    }
  }
  clear() {
    this.#token = null;
    this.#username = null;
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
    throw new BackendError("Chọn hồ sơ hợp lệ trong danh sách trước khi tiếp tục.");
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
