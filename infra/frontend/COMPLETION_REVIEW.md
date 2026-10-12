# Đánh giá mức hoàn thành BE và FE

Kiểm tra ngày 13/10/2026, Asia/Ho_Chi_Minh. Nhánh FE: `fe`; main mới nhất sau
`git fetch origin main`: `d9d5b957223f6bc73db173dbbc1d413910689526`, trùng bản BE
Docker xuất trong `.runtime/backend` và nguồn metadata FE. Không merge hoặc đổi BE.

## Kết luận

**BE và FE chưa hoàn thành toàn bộ ứng dụng phòng khám.** BE đã có nhiều API được
kiểm thử; FE đã có caller cho 56/56 mapping VinSHC hiện tại. Đây là độ phủ route,
không chứng minh mọi thao tác ghi thành công hoặc đủ nghiệp vụ MVP.
Chưa thể dùng tài khoản nhân viên thực hiện trọn tiếp nhận → khám → thanh toán →
cấp thuốc → kết thúc lượt chỉ qua FE. Không có cơ sở để báo một tỷ lệ hoàn thành
chung khi chưa chốt tiêu chí nghiệm thu từng luồng.

## Đã có

- BE: PostgreSQL/OpenMRS, metadata, session, workspace theo vai trò/cơ sở, audit;
  identity/contact/address/field-state; ghi sinh hiệu; phiếu khám/đính chính/chốt,
  chẩn đoán, dị ứng, kê/ngừng thuốc; lịch hẹn, hàng đợi, phí/thu/hoàn tiền,
  chỉ định/kết quả/tệp CLS, DTO chứng từ và báo cáo ngày.
- FE: đăng nhập/chọn workspace; lọc chức năng theo role; các form gọi API trên,
  validation cơ bản, xử lý lỗi, retry thủ công với cùng idempotency key;
  quản trị assignment/quyền, tìm tài khoản và thêm role cho System Developer.
  Đã có hiển thị và in chứng từ cơ bản từ DTO; chưa nghiệm thu mẫu chuyên môn.
- Docker hiện có bốn container healthy. Tài khoản admin có một assignment active
  tại VinSHC Development Clinic. Không cần cài thêm npm để giải quyết các API còn thiếu.

## Khoảng trống

| Phần | BE | FE / kiểm chứng còn thiếu |
| --- | --- | --- |
| Bệnh nhân | Core có patient/person CRUD/search, nhưng app roles bị chặn Core; chưa có VinSHC scoped tương đương, identity chưa chứa đầy đủ Person Core | Tìm kiếm, đăng ký, chỉnh hồ sơ và chọn bệnh nhân trong luồng tiếp nhận; hiện phải nhập UUID |
| Lượt khám | Core có visit/encounter lifecycle; chưa có adapter scoped cho nhân viên | Mở/đóng lượt, tạo/chọn encounter và chuyển ngữ cảnh giữa các bước |
| Sinh hiệu | Có ghi có validation; chưa có list/read/correction/void scoped; clinical-summary chưa trả vitals | Lịch sử đo, xem/sửa/hủy lần đo; hiện có form ghi |
| Danh sách vận hành | B8 có tạo, đọc theo UUID và chuyển trạng thái; chưa có list/search appointment, queue, bill/payment, service-order/result | Lịch làm việc, bảng hàng đợi, danh sách thu ngân/CLS có lọc, phân trang và chọn dòng thay UUID |
| Khám và kê thuốc | Các adapter chính đã có; cần patient/visit/encounter/provider hợp lệ | Hồ sơ/timeline dễ dùng, chuyển ngữ cảnh tự động, kiểm thử ghi thật bằng từng vai trò; hiện phần lớn là chọn thao tác và nhập form |
| Kho/cấp thuốc | Stock Management mới ở mức baseline; chưa có VinSHC dispensing và bằng chứng luồng nhập/xuất/cấp theo đơn | Quầy thuốc, tồn/lô/hạn dùng và xác nhận cấp thuốc |
| Tài khoản/cấu hình | Core có quản lý user; chưa có CRUD ứng dụng scoped cho user/form/cơ sở | Chưa có tạo tài khoản, đổi mật khẩu hoặc màn hình quản lý form/cơ sở. Tìm user/thêm role không phải CRUD đầy đủ |
| Chứng từ/báo cáo | Có DTO/số chứng từ và aggregate ngày; quyền document hiện dùng diagnostic_order print cả cho đơn/kết quả | Mẫu in riêng được duyệt, thử in qua từng role, dashboard/đối soát nhiều ngày; có nút in cơ bản, chưa nghiệm thu pháp lý/chữ ký |
| Tài liệu bệnh nhân | Patient Documents được cài nhưng chưa chứng minh quy trình riêng | Chưa có quản lý đầy đủ tài liệu bệnh nhân; tệp CLS không thay thế toàn bộ chức năng này |
| Tích hợp ngoài | BHYT, HĐĐT, đơn thuốc quốc gia, LIS/PACS chỉ có contract, connector disabled | Chưa có quy trình tích hợp thật |

Core API đã được thử bằng system admin không đồng nghĩa nhân viên workspace có
thể gọi được. Không cấp quyền Core rộng cho nhân viên để giả lập việc hoàn thành.
Một số việc FE như cải thiện trình bày và form quản trị Core có thể làm độc lập;
các màn hình tìm bệnh nhân/lượt khám/danh sách vẫn cần hợp đồng BE phù hợp.

## Kiểm tra chạy lại trong lần này

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 11/11 đạt |
| `npm run test:api` | Caller cho 56/56 mapping VinSHC |
| `npm run test:browser` | Hai bộ Playwright đạt; desktop/mobile, role scope và các form dùng mock, không ghi DB |
| `npm run test:live` | Đạt: Vite → gateway → OpenMRS; đăng nhập admin/mở workspace, tìm user, đọc audit/báo cáo, metadata; không tạo fixture |
| Docker | DB/backend/O3/gateway healthy |
| DB chỉ đọc | 2 user: admin và daemon nội bộ; 1 assignment admin active; 0 patient, 0 visit, 0 encounter, 0 obs |
| GitHub check-runs của main | Hai job configuration/tooling và B1–B9 đều success; hoàn tất 21:43 ngày 12/10/2026 UTC+7 |

CI: [run 38263645897](https://github.com/viet041105/EHR-VinSHC/actions/runs/38263645897).
Báo cáo BE nguồn ghi B1–B8 53/53, B9 restart/restore mỗi bộ 4/4, B10 16/16,
Java unit 18/18. Không chạy lại các bộ tạo fixture đó trên DB local trong lần này;
không coi mock hoặc CI bằng synthetic là nghiệm thu luồng nhân viên trên trình duyệt.
Chưa có tài khoản nghiệp vụ ngoài admin; daemon không dùng đăng nhập test.

## Thứ tự hoàn thiện

1. Chốt hợp đồng và bổ sung API scoped cho patient, visit/encounter, vitals và
   list/search B8. Đây là các điểm chặn chính của luồng FE.
2. Nối các màn hình tìm/chọn/danh sách và ngữ cảnh bệnh nhân/lượt khám; hoàn thiện
   giao diện theo công việc của từng vai trò, thay các bước nhập UUID thủ công.
3. Provision tài khoản nghiệp vụ theo yêu cầu riêng; kiểm thử end-to-end từng vai trò
   trên môi trường test riêng và giữ fixture khỏi DB hiện tại khi chưa được yêu cầu.
4. Hoàn thiện dispensing, mẫu in/báo cáo và các tính năng được chốt thuộc MVP.
5. Nghiệm thu danh mục, nghiệp vụ và vận hành trước khi dùng dữ liệu bệnh nhân thật.

`docs/PILOT_READINESS.md` của main vẫn kết luận **NOT APPROVED FOR REAL DATA**:
catalogue hiện test-only/productionEnabled=false; HTTPS, secret store, DB least
privilege, vận hành backup/monitoring, file scanner/storage và UAT/owner approval
còn mở. FHIR còn giới hạn thuật ngữ/profile; không suy tương thích đầy đủ từ module started.

Đợt này chỉ kiểm tra và ghi báo cáo trong FE, không tạo tài khoản/bệnh nhân,
không sửa BE. Các thay đổi BE ở bước 1/4 cần được người dùng xác nhận phạm vi riêng.
