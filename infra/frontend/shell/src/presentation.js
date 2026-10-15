// Product copy and navigation belong to the shell, independently of the service adapter.
import { esc } from "@vinshc/core";

export const SECTION_COPY = {
  overview: ["Tổng quan công việc", "Chọn công việc để bắt đầu ca làm việc."],
  patients: ["Bệnh nhân", "Tìm hồ sơ trước khi đăng ký mới. Chọn bệnh nhân để tiếp tục."],
  identity: ["Thông tin hành chính", "Thông tin cá nhân, địa chỉ và người liên hệ của bệnh nhân."],
  visits: ["Lượt khám", "Theo dõi lượt đang mở, tiếp nhận và kết thúc khám."],
  vitals: ["Sinh hiệu", "Ghi mạch, huyết áp, nhiệt độ và các chỉ số đo của người bệnh."],
  clinical: ["Khám và điều trị", "Phiếu khám, chẩn đoán, đơn thuốc và lời dặn."],
  appointments: ["Lịch hẹn", "Đặt lịch, xác nhận và tiếp nhận bệnh nhân đến khám."],
  queue: ["Hàng đợi", "Gọi bệnh nhân, theo dõi phục vụ và chuyển đến bước tiếp theo."],
  billing: ["Thu ngân", "Phiếu phí, thu tiền, xác nhận chuyển khoản và hoàn tiền."],
  orders: ["Chỉ định và kết quả", "Xét nghiệm, siêu âm và các dịch vụ cận lâm sàng (CLS) được bác sĩ yêu cầu."],
  pharmacy: ["Quầy thuốc", "Xem đơn chờ cấp, ghi nhận số lượng và lịch sử cấp thuốc."],
  reports: ["Báo cáo", "Xem số liệu hoạt động và thu chi theo ngày hoặc khoảng ngày."],
  admin: ["Quản trị", "Thêm nhân viên, phân công nơi làm việc và xem lịch sử thay đổi."],
  documents: ["Chứng từ", "Chọn phiếu hoặc đơn đã có để xem và in."],
};
export const ROLE_START = {
  reception: ["Tiếp nhận bệnh nhân", "Tìm hồ sơ, mở lượt khám và xếp hàng cho bệnh nhân.", "patients"],
  nurse: ["Theo dõi và ghi sinh hiệu", "Chọn lượt đang mở để bắt đầu lần đo.", "visits"],
  doctor: ["Bắt đầu khám bệnh", "Chọn lượt khám để xem hồ sơ, ghi nhận khám và điều trị.", "visits"],
  lab: ["Thực hiện chỉ định", "Mở danh sách chỉ định để nhận việc và cập nhật kết quả.", "orders"],
  cashier: ["Theo dõi các khoản thu", "Chọn phiếu phí để thu tiền hoặc xác nhận giao dịch.", "billing"],
  pharmacy: ["Cấp thuốc theo đơn", "Kiểm tra đơn chờ cấp và số lượng thuốc còn lại.", "pharmacy"],
  manager: ["Theo dõi hoạt động cơ sở", "Chọn khoảng thời gian để xem báo cáo tổng hợp.", "reports"],
  admin: ["Quản lý hoạt động hệ thống", "Phân công nhân viên và kiểm tra nhật ký hoạt động.", "admin"],
};
export const PRIMARY_ACTIONS = {
  patients: ["registerPatient", "patientProfile", "updatePatient"],
  identity: ["identity", "contact", "address"],
  visits: ["openVisit", "closeVisit"],
  vitals: ["startVitalsEncounter", "vitalsHistory"],
  clinical: ["startConsultation", "consultation", "diagnosis", "prescription", "finalize"],
  appointments: ["book", "appointmentTransition"],
  queue: ["enqueue"],
  billing: ["bill"],
  orders: ["createOrder"],
  pharmacy: [],
  reports: ["report", "rangeReport"],
  admin: ["systemUsers", "assignWorkspace", "audit", "configuration"],
};
const TITLES = {
  startVitalsEncounter: 'Bắt đầu lần đo', startConsultation: 'Bắt đầu khám',
  consultation: 'Ghi phiếu khám', prescription: 'Kê thuốc', finalize: 'Kiểm tra và chốt phiếu',
  patientProfile: "Xem hồ sơ bệnh nhân", configuration: "Cấu hình hoạt động", workspace: "Xem phân công hiện tại",
  evaluate: "Kiểm tra quyền", systemUsers: "Tìm nhân viên", grantAppRole: "Đổi vai trò VinSHC",
  assignWorkspace: "Phân công nhân viên", revokeWorkspace: "Thu hồi phân công",
  clinicalConfiguration: "Danh mục khám và điều trị", identity: "Xem thông tin hành chính",
  summary: "Xem hồ sơ khám", bills: "Xem phiếu phí", payment: "Xem giao dịch",
  order: "Xem chỉ định", result: "Xem kết quả", vitalsHistory: "Xem lịch sử đo",
};
export const actionTitle = (key, action) => TITLES[key] || plainText(action.title);
export function submitLabel(key, action) {
  if (action.binary) return "Tải tệp";
  if (action.document) return "Xem bản in";
  if (action.method === "GET") return "Xem thông tin";
  if (key === "receipt") return "Xác nhận thu tiền";
  if (key === "refund") return "Xác nhận hoàn tiền";
  if (key === "settle") return "Xác nhận đã nhận tiền";
  if (key === "dispense") return "Xác nhận cấp thuốc";
  if (key === "registerPatient") return "Đăng ký bệnh nhân";
  if (key === "openVisit") return "Mở lượt khám";
  if (key === "finalize") return "Chốt phiếu khám";
  const labels = { startVitalsEncounter: 'Bắt đầu lần đo', startConsultation: 'Bắt đầu khám', consultation: 'Lưu phiếu khám', diagnosis: 'Lưu chẩn đoán', prescription: 'Xác nhận kê thuốc', createOrder: 'Gửi chỉ định', saveResult: 'Lưu kết quả', correctResult: 'Lưu bản đính chính', bill: 'Lập phiếu phí', enqueue: 'Xác nhận xếp hàng', advance: 'Chuyển người bệnh', queueTransition: 'Xác nhận trạng thái', orderTransition: 'Xác nhận trạng thái', closeVisit: 'Xác nhận kết thúc lượt' };
  if (labels[key]) return labels[key];
  if (action.method === "DELETE") return "Xác nhận hủy";
  return "Lưu thông tin";
}
export const plainText = (text = "") => String(text)
  .replace(/\s*\(UUID\)\s*/gi, " ")
  .replace(/OpenMRS/gi, "hệ thống")
  .replace(/backend/gi, "hệ thống")
  .replace(/workspace/gi, "không gian làm việc")
  .replace(/encounter/gi, "lần khám")
  .replace(/provider/gi, "người hành nghề")
  .replace(/metadata/gi, "danh mục")
  .replace(/\bCore\b/g, "hệ thống")
  .replace(/\bAPI\b/g, "kết nối")
  .replace(/System Developer/g, "quản trị hệ thống")
  .replace(/[ \t]+/g, " ").trim();
const PATHS = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  patients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3a4 4 0 0 1 0 8",
  identity: "M4 4h16v16H4z M8 8h8 M8 12h4 M8 16h6",
  visits: "M8 3v4 M16 3v4 M3 10h18 M3 5h18v16H3z M8 14h3 M8 17h7",
  vitals: "M2 12h4l3-7 5 14 3-7h5",
  clinical: "M8 3h8v4H8z M8 5H4v16h16V5h-4 M8 12h8 M8 16h6",
  appointments: "M8 3v4 M16 3v4 M3 10h18 M3 5h18v16H3z M8 15h8",
  queue: "M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1",
  billing: "M3 6h18v14H3z M3 10h18 M7 15h3",
  orders: "M9 3h6 M10 3v6L5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2L14 9V3 M8 15h8",
  pharmacy: "M8 4h8v4H8z M6 8h12v13H6z M9 14h6 M12 11v6",
  reports: "M4 3v18h17 M8 17v-5 M13 17V7 M18 17v-8",
  admin: "M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z M8 12l3 3 5-6",
  documents: "M14 2H6v20h14V8z M14 2v6h6 M9 12h6 M9 16h6",
};
export const sectionIcon = (id) => `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${esc(PATHS[id] || PATHS.documents)}"/></svg>`;
