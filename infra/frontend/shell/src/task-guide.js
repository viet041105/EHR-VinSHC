import { esc } from "@vinshc/core";

// Navigation guidance, not a clinical record or a checklist of completed care.
export const ROLE_STEPS = {
  reception: [
    ["patients", null, "Tìm bệnh nhân", "Tìm bằng tên hoặc CCCD. Chỉ đăng ký mới khi chưa có hồ sơ."],
    ["visits", "openVisit", "Mở lượt khám", "Chọn bệnh nhân rồi mở lượt khám; dùng lại lượt đang mở nếu đã có."],
    ["queue", "enqueue", "Xếp hàng", "Chọn quy trình và nơi người bệnh sẽ đến đầu tiên."],
    ["visits", "closeVisit", "Kết thúc lượt", "Chỉ làm sau khi đã hoàn tất chỉ định và thanh toán."],
  ],
  nurse: [
    ["queue", null, "Gọi người bệnh", "Trên dòng hàng đợi: Gọi bệnh nhân → Bắt đầu phục vụ."],
    ["visits", null, "Chọn lượt khám", "Tìm đúng người bệnh rồi bấm Ghi sinh hiệu trên dòng đó."],
    ["vitals", null, "Nhập số đo", "Bắt đầu lần đo, nhập chỉ số rồi lưu. Có hướng dẫn ngay trên biểu mẫu."],
    ["queue", null, "Chuyển sang bác sĩ", "Ở phiếu đang phục vụ, bấm Chuyển điểm tiếp theo và chọn Bác sĩ."],
  ],
  doctor: [
    ["visits", null, "Chọn người bệnh", "Bấm Khám hoặc Hồ sơ khám trên lượt của người bệnh."],
    ["clinical", "consultation", "Ghi phiếu khám", "Ghi lý do đến khám, bệnh sử, tiền sử, khám và tình trạng dị ứng."],
    ["orders", null, "Chỉ định / xem kết quả", "Chỉ định xét nghiệm, siêu âm… khi cần. Quay lại đây để xem kết quả."],
    ["clinical", "diagnosis", "Chẩn đoán", "Chọn chẩn đoán, phân biệt chẩn đoán chính và kèm theo."],
    ["clinical", "prescription", "Kê thuốc", "Nếu có thuốc: kiểm tra tên, liều, đường dùng và thời gian dùng."],
    ["clinical", "finalize", "Chốt phiếu khám", "Kiểm tra hồ sơ trước khi chốt. Thanh toán và cấp thuốc là các bước sau."],
  ],
  lab: [
    ["orders", null, "Nhận chỉ định", "Tìm đúng người bệnh; bấm Nhận chỉ định để phân công cho mình."],
    ["orders", null, "Bắt đầu thực hiện", "Chỉ định đã nhận mới được chuyển sang Đang thực hiện."],
    ["orders", null, "Ghi kết quả", "Nhập kết quả và chọn sơ bộ hoặc chính thức. Kết quả chính thức cần người duyệt."],
    ["orders", null, "Hoàn tất", "Sau khi lưu kết quả chính thức, bấm Hoàn tất chỉ định."],
  ],
  cashier: [
    ["visits", null, "Chọn lượt khám", "Tìm người bệnh rồi bấm Lập phiếu phí trên dòng lượt khám."],
    ["billing", "bill", "Lập phiếu phí", "Chọn dịch vụ, số lượng và thời điểm thu. Giá do hệ thống cung cấp."],
    ["billing", null, "Thu tiền", "Bấm Thu tiền trên phiếu; kiểm tra số còn phải thu và phương thức."],
    ["billing", null, "In phiếu thu", "Sau khi thu thành công, mở bản in. Chuyển khoản cần xác nhận tiền đã về."],
  ],
  pharmacy: [
    ["pharmacy", null, "Chọn đơn thuốc", "Tìm đúng người bệnh trong danh sách Đơn thuốc cần cấp."],
    ["pharmacy", null, "Kiểm tra thuốc", "Xem tên thuốc, cách dùng và số lượng còn phải cấp trước khi giao."],
    ["pharmacy", null, "Ghi nhận cấp thuốc", "Bấm Cấp thuốc; kiểm tra số lượng, nhập số lô và hạn dùng khi có."],
  ],
  manager: [
    ["reports", "report", "Xem báo cáo ngày", "Chọn ngày cần xem; mặc định biểu mẫu là ngày hôm nay."],
    ["reports", "rangeReport", "So sánh nhiều ngày", "Chọn khoảng tối đa 31 ngày để xem số liệu tổng hợp."],
  ],
  admin: [
    ["admin", null, "Chuẩn bị nhân viên", "Trong tab Nhân viên, thêm tài khoản và chọn đúng vai trò, cơ sở."],
    ["admin", null, "Kiểm tra phân công", "Nhân viên chuyên môn cần hồ sơ người hành nghề tại cơ sở."],
    ["admin", null, "Xem lịch sử", "Dùng tab Lịch sử thay đổi để kiểm tra các thao tác quản trị."],
  ],
};

export function taskGuide(role, section, action, canNavigate, prefill = {}) {
  const steps = (ROLE_STEPS[role] || []).filter(([section, action]) => canNavigate({ section, action }));
  let active = steps.findIndex(([s, a]) => s === section && (!a || a === action));
  if (role === 'lab' && section === 'orders') {
    if (['saveResult', 'correctResult', 'result'].includes(action)) active = 2;
    if (action === 'orderTransition') active = { assigned: 0, in_progress: 1, completed: 3 }[prefill.state] ?? active;
  }
  if (role === 'pharmacy' && action === 'dispense') active = 2;
  return `<section class="role-guide" aria-label="Hướng dẫn công việc"><div class="guide-heading"><strong>Làm theo từng bước</strong><span>Chọn bước để mở công việc · không tự thực hiện thao tác lưu</span></div><ol>${steps.map(([s, a, title, hint], i) => `<li><button type="button" data-guide-section="${s}" ${a ? `data-guide-action="${a}"` : ''} ${i === active ? 'aria-current="step"' : ''}><span class="guide-number">${i + 1}</span><span><strong>${esc(title)}</strong><small>${esc(hint)}</small></span></button></li>`).join('')}</ol></section>`;
}

export const TASK_HELP = {
  openVisit: "Kiểm tra đúng người bệnh, chọn loại lượt rồi mở lượt khám. Đây là lần người bệnh đến cơ sở hôm nay.",
  closeVisit: "Chỉ kết thúc sau khi đã hoàn tất chỉ định và thu đủ phí. Hệ thống sẽ kiểm tra lại trước khi lưu.",
  enqueue: "Chọn quy trình áp dụng, sau đó chọn nơi tiếp nhận đầu tiên. Trong kịch bản có điều dưỡng, người bệnh đến Điều dưỡng trước.",
  startVitalsEncounter: "Bấm nút bên dưới để mở lần ghi sinh hiệu. Sau đó biểu mẫu số đo sẽ xuất hiện ngay tại đây.",
  startConsultation: "Bấm Bắt đầu khám để mở phiếu của bạn. Sau khi thành công, hệ thống mở ngay biểu mẫu ghi phiếu khám.",
  consultation: "Ghi thông tin đã hỏi và đã khám. Với tiền sử và dị ứng, chọn đúng tình trạng; không có thông tin không đồng nghĩa với không có bệnh hay dị ứng.",
  diagnosis: "Chọn theo mã ICD hoặc tên bệnh. Phiếu cần một chẩn đoán chính trước khi chốt.",
  prescription: "Mỗi lần lưu là một dòng thuốc. Kiểm tra toàn bộ thông tin trước khi xác nhận; thêm dòng khác nếu đơn có nhiều thuốc.",
  createOrder: "Chọn dịch vụ cần thực hiện và quy trình thanh toán. Nếu trả trước, chọn phiếu phí đã thanh toán phù hợp.",
  saveResult: "Chọn loại kết quả rồi nhập kết quả văn bản hoặc kết quả số. Với kết quả số, điền cả đơn vị.",
  finalize: "Chốt sau khi đã kiểm tra phiếu khám, chẩn đoán và đơn thuốc. Việc này chưa kết thúc lượt khám của người bệnh.",
  bill: "Mỗi lần lập là một phiếu cho dịch vụ đã chọn. Giá lấy từ bảng giá của cơ sở; không cần nhập đơn giá.",
  receipt: "Đối chiếu số tiền với người bệnh trước khi xác nhận. Chuyển khoản chỉ hoàn tất sau khi xác nhận tiền đã về.",
  dispense: "Số lượng được điền từ số còn phải cấp. Kiểm tra thuốc và lô thực tế tại quầy; hệ thống chưa kiểm tra tồn kho.",
};
