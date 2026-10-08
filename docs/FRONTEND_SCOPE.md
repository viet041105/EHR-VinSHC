# Phạm vi FE sau đối chiếu báo cáo

Ngày đối chiếu: 08/10/2026. Nguồn: `Electronic Heath Record.pdf`, 45 trang, đặc biệt sơ đồ trang 4, danh sách thành phần trang 5 và phân công trang 6; đối chiếu `PROJECT_PLAN.md`, `config/baseline.json` và mã hiện có.

Báo cáo là tài liệu khảo sát/định hướng. Các phần nghiên cứu EHR quốc gia và câu hỏi nghiên cứu không được coi là yêu cầu đã chốt cho MVP hoặc bằng chứng module đã hoạt động. Lựa chọn của nhóm trong phiên làm việc này: tự xây FE độc lập, tái sử dụng backend OpenMRS.

## Kết luận trước khi chỉnh

FE trước đó có trang chủ, danh sách bệnh nhân, sinh hiệu, phiếu khám gộp dị ứng/chẩn đoán/thuốc và lịch sử. Chưa đủ các nhóm màn hình trong báo cáo: thiếu active visits, queue, appointments, chart sections riêng, orders/tests, attachments/documents, form library/builder và quản trị. Backend thật, quyền và metadata chưa được kết nối/kiểm chứng bởi FE.

## Mapping 13 thành phần backend sang FE

| Thành phần báo cáo | Vai trò BE dự kiến | Phần FE đã chuẩn bị | Điểm cần xác nhận khi nối API |
| --- | --- | --- | --- |
| openmrs-core | Bệnh nhân, visit, encounter, obs, order, người dùng/quyền | Hồ sơ, lượt đang khám, phiếu khám, sinh hiệu, lịch sử, chỉ định | Schema runtime, UUID, dịch vụ và quyền |
| webservices.rest | API phục vụ UI | Hợp đồng màn hình; adapter kiểm tra REST session | Endpoint, authentication, pagination, lỗi và CORS |
| emrapi | Các dịch vụ nghiệp vụ EMR | Tổng quan hồ sơ và thông tin lượt khám | Khả năng API được expose thực tế; không giả định một API cho mọi chart section |
| fhir2 | API trao đổi FHIR | Thiết kế nguồn/time/identity cho bản ghi | CapabilityStatement và mapping được INT-04/05 kiểm chứng; chưa có màn hình liên thông |
| initializer | Nạp metadata từ repo | Thư viện/nháp biểu mẫu, concept UUID | Metadata loader và schema; FE không sửa DB/Initializer trực tiếp |
| idgen | Cấp identifier | Mã riêng cho hồ sơ demo, kiểm tra nghi trùng | Thay mã demo bằng identifier backend và nguồn cấp mã |
| queue | Hàng đợi | Danh sách, khu vực, chờ/đang phục vụ/tạm vắng | Queue/service/provider/location UUID và state transitions |
| authentication | Xác thực theo triển khai module | UI kiểm tra đăng nhập OpenMRS, trạng thái chờ/lỗi; phiên demo | Không suy ra SSO/MFA hoặc quyền lâm sàng từ một request session thành công |
| o3forms | Backend biểu mẫu | Phiếu sinh hiệu/ngoại trú, form library và bản ghi tùy chỉnh demo | Format O3 và lifecycle phiên bản; chưa import/export O3 schema |
| appointments | Lịch hẹn | Tạo lịch, đã đến, hủy; kiểm tra slot trùng | Service/provider/timezone/slot và API phiên bản đang dùng |
| addresshierarchy | Danh mục địa chỉ | Trường địa chỉ Việt Nam hiện nhập văn bản | Chưa có danh mục tỉnh/xã có nguồn/phiên bản; chưa tuyên bố hierarchy chuẩn hóa |
| attachments | Tệp đính kèm | Upload/xem PDF, PNG, JPEG mẫu có visit/source | API upload, storage, MIME/size và quyền thực tế |
| patientdocuments | Tài liệu bệnh nhân | Tab Tài liệu, tên, loại, người ghi, thời điểm, lượt | Phân loại tài liệu và khả năng module thực tế |

Danh sách trong báo cáo có 13 mục gồm core và module, không phải 13 module độc lập. Module hiện diện trong distro không đồng nghĩa mọi nghiệp vụ/API được nghiệm thu. Không cần một trang UI riêng cho các module hạ tầng như Initializer/FHIR2/idgen.

## Nhóm màn hình tương ứng frontend trong báo cáo

| Nhóm báo cáo | FE độc lập hiện có |
| --- | --- |
| esm-core / shell | Điều hướng, layout responsive, phiên demo, giao diện kiểm tra session local |
| patient-management Home/Registration/Search | Trang chủ đã duyệt, tìm và tiếp nhận bệnh nhân |
| Appointments / Active Visits / Queue | Ba màn hình nghiệp vụ riêng, có thao tác demo |
| patient-chart / Vitals | Tổng quan hành chính/lâm sàng theo vai trò, nhập sinh hiệu |
| Conditions / Allergies / Medications | Tab riêng; chẩn đoán/thuốc lấy từ phiếu khám; dị ứng cập nhật theo lượt |
| Notes | Ghi chú chăm sóc có tác giả/thời điểm/lượt |
| Orders / Tests | Tạo/hủy chỉ định, kết quả sơ bộ/đã xác nhận mẫu; chưa kết nối LIS/PACS |
| form-engine-lib | Phiếu dựng sẵn và render bản nháp text/number theo định nghĩa demo |
| form-builder | Tạo nháp, kiểm tra mã trường/UUID, xem trước, điền và lưu bản ghi demo |

Không import package O3 vào FE này. Các tên esm trong báo cáo xác định nhóm nghiệp vụ được đối chiếu; FE tự xây không tự có API/schema/tính năng của package upstream.

## Vai trò và giới hạn

Vẫn là 4 vai trò của PROJECT_PLAN, không tự thêm bệnh nhân, dược sĩ hoặc kỹ thuật viên từ phần nghiên cứu quốc gia.

- Lễ tân: tìm/đăng ký, mở lượt, hẹn và điều phối. Hồ sơ chỉ hiển thị hành chính và lịch sử tiếp nhận, không hiện nội dung khám.
- Điều dưỡng: xem chart, ghi sinh hiệu/ghi chú/tài liệu; nhập kết quả chỉ là công cụ thử dữ liệu demo, không tự gán quyền xác nhận lab production cho điều dưỡng.
- Bác sĩ: xem chart, ghi khám/dị ứng/thuốc/ghi chú, chỉ định/tài liệu, kết thúc lượt có phiếu khám.
- Quản trị: chức năng demo, tài khoản, ma trận và nhật ký; tạo nháp biểu mẫu. Quyền lâm sàng của quản trị thật cần chốt riêng, không mặc định theo demo.

Ma trận chính nằm ở `frontend/workflow.js`, chỉ là kiểm soát giao diện. Đổi role hoặc tài khoản demo không xác thực/ủy quyền server. Khóa tài khoản demo chỉ ảnh hưởng danh sách chọn phiên, không phải khóa tài khoản OpenMRS.

## Trạng thái nhiệm vụ FE

| Nhiệm vụ | Kết quả hiện tại | Còn lại để nghiệm thu |
| --- | --- | --- |
| FE-01 | Đã map báo cáo thành nhóm màn hình và chức năng demo | Đi qua baseline thật để xác nhận module/API dùng được |
| FE-02 | Có FE độc lập, cách chạy và mã nguồn trong repo | Adapter backend và build/deploy theo môi trường được chọn |
| FE-03 | UI đang làm bằng tiếng Việt | Mentor review thuật ngữ và danh mục; không tuyên bố toàn distro Việt hóa |
| FE-04 | Form khám/sinh hiệu và bản nháp tùy chỉnh có validation | DATA-01/02, concept/drug/dictionary, schema O3 và nghiệm thu nghiệp vụ |
| FE-05 | Luồng demo nhiều module, giữ dữ liệu và đúng visit demo; có kiểm tra REST session riêng | Repository đọc/ghi OpenMRS thật, mapping chuẩn và lỗi API |
| FE-06 | Empty/readonly/permission guards, lỗi validation/storage; trạng thái loading/network/401/server cho session | Các request lâm sàng, pagination, unsaved changes, retry/conflict khi có API |
| FE-07 | Bản giao diện có thể walkthrough | Mentor/người dùng thực tế xác nhận, ghi và xử lý vấn đề |

## Kiểm chứng lượt chỉnh này

- `node frontend/verify.mjs`: persistence/migration, bệnh nhân trùng tên mã khác, role guards, closed-visit, mapping order/result, chỉ định hủy, kết quả cần xác nhận, slot hẹn trùng, form key/concept.
- Browser Chromium headless: landing; order/result; notes; lễ tân không thấy clinical tabs/results; appointments; queue; form draft/fill; file upload/view; reload; admin account; closed-visit read-only; desktop 1440px/mobile 390px, không overflow trang.
- API session adapter được test bằng phản hồi giả 401/JSON thành công; kiểm tra xóa mật khẩu sau submit và không lưu vào localStorage. Chưa kiểm tra đăng nhập trên backend đang chạy.
- Đã xem ảnh chụp trang chủ/workspace/admin/mobile. Các bảng dài dùng cuộn ngang trong vùng bảng.
- Chưa kiểm thử backend production, module đủ chức năng, liên thông, chữ ký điện tử hoặc đạt quy chuẩn y khoa/pháp lý Việt Nam.

Kết luận: phủ rộng hơn các màn hình FE trong báo cáo bằng bản demo có tương tác. Chưa đủ điều kiện đánh dấu toàn bộ nhiệm vụ FE hoàn thành theo tiêu chí tích hợp/nghiệm thu của kế hoạch.
