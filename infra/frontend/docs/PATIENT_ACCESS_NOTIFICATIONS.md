# Tài khoản bệnh nhân, yêu cầu cấp quyền và chuông thông báo

## Phạm vi đã chốt ngày 16-10-2026

Người dùng chọn **chỉ làm FE, để phần lưu/gửi chờ backend**. Không sửa backend, migration hoặc dữ liệu. Luồng phía dưới mô tả cả phần UI hiện có và phần nghiệp vụ cần backend thực hiện sau; không phải xác nhận backend đã có các API đề xuất.

FE thêm lối vào portal, nút tài khoản trong hồ sơ bác sĩ, mục yêu cầu trong quản trị và chuông cho nhân viên/người bệnh. API portal cũ vẫn dùng để đăng nhập, xem hồ sơ công bố và tự đổi mật khẩu. Chưa tạo role bệnh nhân mới trong DB vì `VinSHC Portal: patient` đã tồn tại.

Yêu cầu mới và thông báo chỉ đọc từ API. Chưa có API thì hiện trạng thái chờ, không tạo dữ liệu mẫu, không gửi ngầm. Quyền gửi/cấp/từ chối yêu cầu chỉ bật khi GET trả `capabilities` tương ứng bằng `true`; quản trị vẫn cần `System Developer` để xử lý. Thông báo chưa đọc chỉ hiện badge khi có `unreadCount` hợp lệ từ server.

## Luồng cần bổ sung

1. Nhân viên đăng nhập ở `connected.html`; người bệnh có lối đăng nhập riêng tới `portal.html`. Dùng role `VinSHC Portal: patient` đang có, không thêm patient vào 8 workspace nhân viên.
2. Bác sĩ mở đúng hồ sơ, chọn Yêu cầu tài khoản bệnh nhân hoặc Yêu cầu đặt lại mật khẩu. Gửi yêu cầu gắn với patient/visit hiện tại, không nhập mã.
3. Quản trị nhận thông báo chuông và mở mục Yêu cầu tài khoản. Xem người gửi, bệnh nhân, thời gian và trạng thái; xác minh danh tính trước khi cấp/đặt lại.
4. Cấp tài khoản gắn cùng Person với Patient, chỉ mang quyền portal; xác minh liên kết theo quy tắc hiện có. Quản trị tự chọn tên đăng nhập và mật khẩu, chuyển riêng cho người bệnh. Không gửi mật khẩu trong thông báo.
5. Người bệnh đăng nhập và chỉ xem dữ liệu đã được bác sĩ công bố. Không tự công bố hồ sơ khi tạo tài khoản hoặc chốt phiếu khám.
6. Bác sĩ nhận thông báo khi hàng đợi được gán cho provider của mình. Người gửi nhận thông báo yêu cầu đã được xử lý/từ chối. Người bệnh có thể nhận thông báo tài khoản/hồ sơ của chính mình theo API cho phép.

## UI

- Chuông SVG ở header, có tên truy cập và badge số chưa đọc. Bấm mở danh sách, trạng thái tải/trống/lỗi, tải thêm và nút đánh dấu đã đọc.
- Bấm thông báo chỉ mở đúng công việc sau kiểm tra quyền; không tự tạo tài khoản, đổi mật khẩu hoặc mở encounter.
- Làm mới khi mở chuông và polling nhẹ khi tab đang hiển thị. Dừng polling khi logout/đổi phiên/ẩn tab. Không dùng localStorage chứa credential, hồ sơ hoặc trạng thái đọc để giả đồng bộ.
- Nếu API chưa triển khai, hiện chức năng chưa sẵn sàng; không báo gửi thành công và không tạo thông báo demo.
- Form bác sĩ có bệnh nhân đã chọn, loại yêu cầu và ghi chú. Có chống gửi lặp/idempotency.
- Form quản trị tách cấp mới, đặt lại, từ chối. Gặp thành công một phần phải đọc lại, không tự tạo user trùng.
- Chưa đăng nhập: hướng dẫn người quên mật khẩu liên hệ phòng khám; không thêm API công khai dò tài khoản hoặc tự cấp mật khẩu.

## Hợp đồng API đề xuất — chưa phải endpoint đã có

Prefix FE `/api/vinshc`. Tên/DTO dưới đây cần đối chiếu triển khai backend, không tự suy rằng đã tồn tại.

| Method | Route | Nội dung |
| --- | --- | --- |
| GET | `/patient-access/requests?status=&limit=&offset=` | Bác sĩ xem yêu cầu của mình; quản trị xem yêu cầu được phép xử lý |
| GET | `/patient-access/requests/{uuid}` | Đọc đúng yêu cầu từ thông báo, kiểm tra quyền trên server |
| POST | `/patient-access/requests` | `{type: patient_account_create|patient_password_reset, patientUuid, visitUuid?, note?, idempotencyKey}` |
| POST | `/patient-access/requests/{uuid}/fulfill` | `{username?, password, verificationMethod, idempotencyKey}`; chỉ quản trị hệ thống, không trả secret |
| POST | `/patient-access/requests/{uuid}/reject` | `{reason}`; giữ lịch sử, không xóa yêu cầu |
| GET | `/notifications?limit=&offset=` | `{results,hasMore,unreadCount}`; từng dòng `{uuid,type,title,message,createdAt,readAt,target}` |
| POST | `/notifications/{uuid}/read` | Đánh dấu đã đọc, chỉ người nhận; idempotent |
| POST | `/notifications/read-all` | Đánh dấu các thông báo hiện có của người nhận; không đánh dấu thông báo đến sau mốc server |

`target` dùng `{kind:"patient_access_request",requestUuid}` cho quản trị, `{kind:"visit",visitUuid}` cho bác sĩ, `{kind:"portal_visit",visitUuid}` cho người bệnh. Chỉ dùng allowlist: yêu cầu quản trị hoặc lượt khám. Không nhận URL tùy ý. Payload thông báo không chứa bệnh sử, nội dung khám, mật khẩu, token hoặc hash. Đọc thông báo phải kiểm tra lại tài khoản/role/cơ sở và không cho phép đọc thông báo của người khác.

Danh sách yêu cầu trả `{results,hasMore,capabilities:{request:boolean,fulfill:boolean,reject:boolean}}`. Các quyền này do backend tính từ phiên hiện tại; FE không mặc định cho phép ghi khi GET thành công. Yêu cầu trả `{uuid,type,status,patientUuid,patientName,visitUuid,requesterName,createdAt,note?,processedAt?,reason?,username?}`. Trạng thái `pending|fulfilled|rejected`. Server quyết định phạm vi, khóa xử lý đồng thời, từ chối user trùng và không cấp thêm staff/System Developer cho người bệnh.

## Phần ngoài FE cần người dùng cho phép

Chưa sửa các đường dẫn dưới đây khi chưa có xác nhận vì người dùng đã giới hạn chỉ sửa FE.

- `infra/backend/vinshc-module/api/src/main/resources/liquibase.xml`: migration thêm bảng yêu cầu và thông báo, index và ràng buộc duy nhất/idempotency. Giữ nguyên bảng/dữ liệu hiện có.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/PatientAccessController.java` và `NotificationController.java`: các route theo quyền.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/PatientAccessService.java` và `NotificationService.java`: lưu/xử lý yêu cầu, cấp/reset tài khoản bệnh nhân có xác minh, đọc/đánh dấu thông báo theo người nhận.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/PortalService.java` nếu cần tái sử dụng luồng cấp/liên kết/xác minh; không nới phạm vi portal.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java`: phát thông báo khi tạo/chuyển phiếu hàng đợi có gán provider bác sĩ. Người nhận lấy từ liên kết provider–user tại cơ sở, không suy từ UUID giống nhau.
- `infra/backend/vinshc-module/omod/src/main/resources/moduleApplicationContext.xml`: đăng ký service mới.
- `infra/backend/vinshc-module/omod/src/test/` và `tests/integration/test_patient_access_notifications.py`: test quyền, người nhận, idempotency, xử lý đồng thời, tạo/reset không cấp nhầm quyền và dữ liệu nhạy cảm không xuất hiện trong notification.
- `docs/api/patient-access-notifications.md`: ghi hợp đồng triển khai và cách kiểm tra.

Sau khi được cho phép: build backend, sao lưu DB và áp dụng migration thêm mới trên stack local; không reset volume, không tạo bộ dữ liệu demo. Các kiểm thử tạo dữ liệu chạy trên môi trường test riêng.

## Điều kiện hoàn thành sau khi backend bổ sung

- Bệnh nhân có lối đăng nhập rõ ràng, không được chọn role nhân viên để tăng quyền.
- Bác sĩ gửi yêu cầu thành công qua backend, quản trị tài khoản khác nhận được và có thể xử lý; reload/đăng xuất không mất yêu cầu.
- Provider nhận đúng thông báo phân công; không có thông báo gán của bác sĩ/cơ sở khác.
- Trạng thái chưa đọc được lưu theo người nhận; logout/đổi người dùng không để lộ danh sách cũ hoặc response trễ.
- Không có mật khẩu/token trong danh sách, thông báo, log, storage hoặc nội dung audit. Không tự đánh dấu xác minh danh tính.
- UI desktop/mobile, bàn phím, lỗi 401/403/404/409, gửi lặp và xử lý đồng thời được kiểm tra; phân biệt test mock và runtime thật.

## Kiểm chứng FE ngày 16-10-2026

- `npm run test:patient-access`: desktop 1440 px và mobile 390 px. Kiểm tra lối vào portal, API thiếu thì khóa gửi, gửi yêu cầu, xác minh trước khi cấp, quyền ghi từ server, chuông/đánh dấu đọc, chặn target URL tùy ý, mở đúng công việc và loại bỏ response của phiên trước. Toàn bộ API ghi trong bộ này được mock, không tạo dữ liệu thật.
- `npm run test:roles`: cả 8 vai trò; `npm run test:pages`: 46 trang/148 form trên mỗi kích thước, hành chính/lịch hẹn và portal đều qua. Unit 39/39, build và kiểm tra ánh xạ 127 route backend hiện có đều qua. Kiểm tra route hiện có không xác nhận các endpoint đề xuất đã tồn tại.
- `npm run test:live`: đăng nhập, workspace, danh mục, tìm nhân viên, audit và báo cáo trên stack local thật đều qua, chỉ đọc.
- Đọc trực tiếp trên backend local: `GET /notifications` và `GET /patient-access/requests` đều **404**. Chưa có luồng gửi/nhận liên tài khoản, cấp/reset từ yêu cầu hay thông báo phân công thật; phần này đang chờ backend theo lựa chọn của người dùng.
- Không sửa backend, migration, DB hoặc landing trong lượt bổ sung này; chưa commit/push.

Xem UI bằng `npm run dev`: nhân viên tại `/connected.html`, người bệnh tại `/portal.html`. Bác sĩ mở hồ sơ rồi chọn **Tài khoản người bệnh**; quản trị mở tab **Yêu cầu tài khoản bệnh nhân**; chuông nằm cạnh thông tin tài khoản ở thanh đầu trang.
