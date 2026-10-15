import { esc } from '@vinshc/core';
import { actionTitle, plainText } from './presentation.js';

// Organize every registered action by the user's purpose. Unknown future actions stay reachable.
export const TASK_GROUPS = {
  patients: [
    ['Tiếp nhận người bệnh', 'Tìm trước khi tạo hồ sơ mới.', ['registerPatient', 'patientProfile']],
    ['Cập nhật thông tin', 'Sửa thông tin cá nhân khi đã đối chiếu hồ sơ.', ['updatePatient']],
  ],
  visits: [['Trong lượt khám', 'Kiểm tra lượt đang mở trước khi mở lượt mới.', ['openVisit', 'visitDetail']], ['Kết thúc khám', 'Chỉ kết thúc sau khi các dịch vụ và phí đã hoàn tất.', ['closeVisit']]],
  identity: [
    ['Liên hệ và địa chỉ', 'Thông tin để liên lạc với người bệnh hoặc người thân.', ['identity', 'contact', 'address']],
    ['Sửa thông tin đã lưu', 'Chọn đúng dòng liên hệ hoặc địa chỉ; dữ liệu cũ được giữ trong lịch sử.', ['updateContact', 'updateAddress', 'voidContact', 'voidAddress']],
    ['Thông tin chưa đầy đủ', 'Ghi rõ chưa hỏi, không rõ hay người bệnh từ chối cung cấp.', ['fieldState', 'clearFieldState', 'identityConfiguration']],
  ],
  vitals: [['Đo và xem số đo', 'Bắt đầu lần đo trước khi nhập chỉ số.', ['startVitalsEncounter', 'vitalsHistory']], ['Sửa lần đo sai', 'Đính chính hoặc hủy phải có lý do.', ['correctVitals', 'voidVitals']]],
  clinical: [
    ['Khám người bệnh', 'Mở phiếu, hỏi bệnh và ghi kết quả khám.', ['startConsultation', 'summary', 'consultation', 'correction']],
    ['Chẩn đoán và dị ứng', 'Ghi thông tin đã được người phụ trách chuyên môn xác nhận.', ['diagnosis', 'allergy', 'allergies', 'replaceDiagnosis', 'voidDiagnosis', 'voidAllergy']],
    ['Thuốc và kết thúc phiếu', 'Kiểm tra đơn trước khi chốt; chốt phiếu chưa kết thúc lượt khám.', ['prescription', 'discontinue', 'finalize']],
    ['Chia sẻ với người bệnh', 'Chỉ công bố phần hồ sơ đã được duyệt.', ['publishPortal', 'publicationHistory', 'revokePortal', 'clinicalConfiguration']],
  ],
  appointments: [['Đặt và xem lịch', 'Chọn người bệnh, bác sĩ và thời gian còn phù hợp.', ['book', 'appointments']], ['Cập nhật lịch đã đặt', 'Xác nhận, ghi nhận đã đến hoặc hủy lịch có lý do.', ['appointmentTransition']]],
  queue: [['Tiếp nhận vào hàng đợi', 'Chọn điểm phục vụ đầu tiên theo quy trình.', ['enqueue', 'queue']], ['Gọi và chuyển người bệnh', 'Ưu tiên nút thao tác ngay trên từng dòng hàng đợi.', ['queueTransition', 'advance']]],
  billing: [
    ['Lập phí và thu tiền', 'Giá do cơ sở cung cấp. Kiểm tra phiếu và số tiền trước khi thu.', ['bill', 'bills', 'receipt']],
    ['Chuyển khoản', 'Chỉ xác nhận khi đã kiểm tra tiền vào tài khoản.', ['payment', 'settle']],
    ['Điều chỉnh khoản thu', 'Hoàn tiền và hủy phiếu đều cần đối chiếu và ghi lý do.', ['refund', 'cancelBill']],
  ],
  orders: [
    ['Chỉ định và nhận việc', 'Chọn đúng người bệnh và dịch vụ cần thực hiện.', ['createOrder', 'order', 'orderTransition']],
    ['Kết quả chuyên môn', 'Kết quả chính thức cần người duyệt và thời điểm duyệt.', ['saveResult', 'result', 'correctResult']],
    ['Tệp đính kèm', 'Tải lên hoặc mở báo cáo của đúng chỉ định.', ['upload', 'attachment', 'download']],
  ],
  pharmacy: [['Cấp thuốc theo đơn', 'Đối chiếu thuốc thực tế và số còn phải cấp.', ['dispense', 'prescriptionDetail', 'printPrescription']], ['Tra cứu và điều chỉnh', 'Bản gốc và lịch sử cấp thuốc được giữ lại.', ['dispenseRecord', 'correctDispense', 'voidDispense']]],
  reports: [['Theo dõi hoạt động', 'Số liệu tổng hợp của cơ sở, không có bệnh án cá nhân.', ['report', 'rangeReport']]],
  documents: [['Chọn bản in', 'Chọn phiếu hoặc đơn đã có; mở nội dung để kiểm tra trước khi in.', ['printReceipt', 'printRefund', 'printAppointment', 'printOrder', 'printResult', 'printPrescription']]],
  admin: [
    ['Nhân viên và phân công', 'Dùng các tab quản trị phía trên cho công việc thường ngày.', ['systemUsers', 'createStaff', 'renameStaff', 'resetStaffPassword', 'retireUser', 'unretireUser', 'assignWorkspace', 'revokeWorkspace', 'grantAppRole', 'workspace']],
    ['Hồ sơ người hành nghề', 'Liên kết nhân viên chuyên môn với đúng cơ sở.', ['createProvider', 'linkProvider', 'unlinkProvider', 'retireProvider', 'userProviders']],
    ['Cơ sở khám', 'Tạo, cập nhật thông tin và ngừng cơ sở.', ['facilities', 'createFacility', 'updateFacility', 'retireFacility']],
    ['Biểu mẫu và quy trình', 'Cấu hình áp dụng tại cơ sở. Kiểm tra bản nháp trước khi kích hoạt.', ['listForms', 'draftForm', 'formDetail', 'activateForm', 'retireForm', 'readWorkflow', 'setWorkflow']],
    ['Tài khoản người bệnh', 'Liên kết và xác minh danh tính trước khi cấp quyền xem hồ sơ.', ['linkPortal', 'verifyPortal', 'unlinkPortal', 'portalLinkHistory']],
    ['Kiểm tra và lịch sử', 'Tra cứu phân quyền, cấu hình và các thao tác đã ghi nhận.', ['audit', 'staffAudit', 'configuration', 'evaluate']],
  ],
};

export function actionGroups(section, choices) {
  const remaining = new Set(choices), groups = [];
  for (const [title, hint, keys] of TASK_GROUPS[section] || []) {
    const actions = keys.filter(key => remaining.delete(key));
    if (actions.length) groups.push({ title, hint, actions });
  }
  if (remaining.size) groups.push({ title: 'Công việc bổ sung', hint: 'Các thao tác khác được phân công cho bạn.', actions: [...remaining] });
  return groups;
}
export const isDestructive = (key, action) => action.method === 'DELETE' || /^(void|cancel|retire|unlink|revoke|discontinue|refund)/.test(key);
export function taskDirectory(section, choices, actions, primary = []) {
  return `<section class="page-tasks" aria-label="Chọn công việc trên trang">${actionGroups(section, choices).map((group, i) => `<details class="task-group" ${i === 0 ? 'open' : ''}><summary><span><strong>${esc(group.title)}</strong><small>${esc(group.hint)}</small></span><span class="task-group-count">${group.actions.length} việc</span></summary><div class="page-task-grid">${group.actions.map(key => {
    const a = actions[key], kind = a.document ? 'Bản in' : a.method === 'GET' ? 'Xem' : isDestructive(key, a) ? 'Điều chỉnh' : 'Nhập thông tin';
    return `<button type="button" data-task-action="${key}" ${primary.includes(key) ? `data-go-section="${section}" data-go-action="${key}"` : ''} class="page-task ${isDestructive(key, a) ? 'task-caution' : ''}"><span>${esc(actionTitle(key, a))}</span><small>${kind}</small><span aria-hidden="true">→</span></button>`;
  }).join('')}</div></details>`).join('')}</section>`;
}

const PAGE_HELP = {
  patients: ['Nhập tên, CCCD, số điện thoại hoặc mã hồ sơ để tìm.', 'Kiểm tra thông tin trên dòng kết quả, rồi chọn việc cần làm.', 'Chỉ đăng ký hồ sơ mới khi chưa tìm thấy người bệnh.'],
  identity: ['Chọn người bệnh ở danh sách Bệnh nhân.', 'Mở thông tin hành chính để xem liên hệ và địa chỉ hiện tại.', 'Chọn đúng dòng cần sửa. Để trống thông tin cập nhật nghĩa là giữ nguyên theo hướng dẫn của từng biểu mẫu.'],
  visits: ['Tìm người bệnh trong danh sách lượt đang mở.', 'Bấm thao tác ngay trên dòng: sinh hiệu, khám, xếp hàng hoặc lập phí.', 'Kết thúc lượt sau khi hoàn tất các dịch vụ và khoản thu.'],
  vitals: ['Chọn đúng lượt khám, rồi bắt đầu lần đo.', 'Nhập số đo; nếu chưa đo được, ghi lý do ở mục bên dưới.', 'Kiểm tra và lưu. Lần đo sai được đính chính hoặc hủy kèm lý do.'],
  clinical: ['Chọn lượt khám, bắt đầu phiếu hoặc mở hồ sơ đã có.', 'Ghi phiếu, chẩn đoán, dị ứng và thuốc theo thông tin chuyên môn đã xác nhận.', 'Kiểm tra kết quả, đơn thuốc và chốt phiếu khi hoàn tất.'],
  appointments: ['Chọn người bệnh và bác sĩ phù hợp.', 'Chọn dịch vụ, giờ bắt đầu và giờ kết thúc; không đặt lịch trùng.', 'Dùng nút trên lịch đã đặt để xác nhận, tiếp nhận hoặc hủy.'],
  queue: ['Lọc theo điểm phục vụ nếu cần.', 'Gọi bệnh nhân, sau đó bắt đầu phục vụ đúng thứ tự.', 'Khi đang phục vụ, chuyển tới điểm tiếp theo hoặc hoàn tất.'],
  billing: ['Chọn lượt khám và lập phiếu cho dịch vụ đã sử dụng.', 'Bấm Thu tiền trên đúng phiếu, đối chiếu số còn phải thu.', 'Kiểm tra tiền mặt hoặc chuyển khoản, rồi mở bản in phiếu thu.'],
  orders: ['Tìm đúng chỉ định của người bệnh.', 'KTV nhận việc, bắt đầu thực hiện và ghi kết quả.', 'Duyệt kết quả chính thức trước khi hoàn tất chỉ định.'],
  pharmacy: ['Tìm đơn của người bệnh và kiểm tra cách dùng.', 'Đối chiếu thuốc tại quầy, số lượng, số lô và hạn dùng.', 'Xác nhận cấp và xem lại lịch sử khi cần. Hệ thống chưa đối chiếu tồn kho.'],
  reports: ['Chọn báo cáo ngày hoặc khoảng ngày.', 'Kiểm tra cơ sở và ngày cần xem; khoảng ngày tối đa 31 ngày.', 'Đọc số lượt khám và số liệu thu chi từ hệ thống.'],
  documents: ['Chọn loại phiếu hoặc đơn muốn in.', 'Chọn bản ghi đã mở, hoặc quay về danh sách nghiệp vụ để chọn đúng phiếu.', 'Mở bản in, kiểm tra nội dung rồi bấm In chứng từ.'],
  admin: ['Dùng tab Nhân viên để thêm và phân công tài khoản.', 'Dùng tab Cơ sở và Lịch sử thay đổi để kiểm tra hoạt động.', 'Mở nhóm cấu hình bên dưới khi cần quản lý biểu mẫu, quy trình hoặc cổng người bệnh.'],
};
export function pageHelp(section) {
  const steps = PAGE_HELP[section];
  return steps ? `<details class="page-help"><summary>Cách dùng trang này <span>3 bước hướng dẫn</span></summary><ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>` : '';
}

export const FIELD_HINTS = {
  cccd: 'Gồm đúng 12 chữ số. Đối chiếu giấy tờ trước khi nhập.',
  birthPrecision: 'Chọn mức thông tin bạn thực sự biết để hiện đúng ô ngày sinh.',
  includeHistory: 'Bật khi cần xem cả dữ liệu đã được thay thế hoặc ngừng sử dụng.',
  config: 'Quy trình quyết định thứ tự khám và thời điểm thanh toán.',
  paymentTiming: 'Trả trước: thu trước dịch vụ. Trả sau: thu sau khi sử dụng dịch vụ.',
  expectedVersion: 'Lấy từ phiếu vừa đọc. Nếu phiếu đã thay đổi, mở lại trước khi điều chỉnh.',
  batchNumber: 'Đối chiếu số lô trên bao bì thuốc thực tế.',
  expiryDate: 'Đối chiếu hạn dùng thực tế; không nhập lô đã hết hạn.',
  schemaJson: 'Nội dung cấu hình biểu mẫu dạng JSON. Kiểm tra cú pháp và lưu bản nháp trước khi kích hoạt.',
  amountVnd: 'Nhập số nguyên đồng, không dùng dấu chấm hoặc dấu phẩy ngăn cách.',
  discountVnd: 'Số tiền giảm cho dòng dịch vụ, tính bằng đồng.',
  verificationMethod: 'Chỉ xác nhận sau khi đã đối chiếu danh tính ngoài hệ thống.',
};

const ERROR_HINTS = [
  [/invalid queue transition|only an in_service queue item/i, 'Hàng đợi chưa ở bước phù hợp. Gọi bệnh nhân → Bắt đầu phục vụ, rồi mới chuyển điểm tiếp theo.'],
  [/one active provider|provider.*linked|assigned at facility/i, 'Tài khoản chưa có đúng hồ sơ người hành nghề tại cơ sở. Nhờ quản trị kiểm tra phân công chuyên môn.'],
  [/overlap|appointment.*conflict|slot.*taken/i, 'Khung giờ đã có lịch trùng. Chọn lại bác sĩ hoặc thời gian khác.'],
  [/result already exists/i, 'Chỉ định đã có kết quả. Mở kết quả hiện tại và dùng chức năng đính chính phù hợp.'],
  [/latest result.*final|complete unless/i, 'Cần lưu kết quả chính thức đã duyệt trước khi hoàn tất chỉ định.'],
  [/visit is closed/i, 'Lượt khám đã kết thúc. Mở danh sách để chọn lượt còn đang khám.'],
  [/bill.*cancelled/i, 'Phiếu phí đã hủy. Kiểm tra lại danh sách phiếu trước khi thu hoặc xác nhận tiền.'],
];
export function userError(error) {
  const reason = [error?.message, error?.details?.reason, error?.details?.error].filter(s => typeof s === 'string').join(' ');
  return ERROR_HINTS.find(([pattern]) => pattern.test(reason))?.[1] || plainText(error?.message || 'Chưa thực hiện được. Vui lòng thử lại.');
}

export function reportPreset(date, days, yesterday = false) {
  const end = new Date(date + 'T00:00:00Z');
  if (yesterday) end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
