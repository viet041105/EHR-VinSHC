# Tài khoản bệnh nhân, yêu cầu cấp quyền và chuông thông báo

## Phạm vi đã chốt ngày 16-10-2026

Ban đầu chỉ làm FE. Sau khi chốt luồng lễ tân → bác sĩ → quản trị, người dùng đã **cho phép bổ sung BE, test và tài liệu cho luồng này**. Đã thêm mã API yêu cầu/thông báo và migration bổ sung bảng; kết quả chạy thực tế được ghi trong tài liệu API sau khi kiểm chứng. Không tạo dữ liệu demo trên DB local.

FE thêm lối vào portal, nút tài khoản trong hồ sơ bác sĩ, mục yêu cầu trong quản trị và chuông cho nhân viên/người bệnh. API portal cũ vẫn dùng để đăng nhập, xem hồ sơ công bố và tự đổi mật khẩu. Chưa tạo role bệnh nhân mới trong DB vì `VinSHC Portal: patient` đã tồn tại.

Yêu cầu mới và thông báo chỉ đọc từ API. Chưa có API thì hiện trạng thái chờ, không tạo dữ liệu mẫu, không gửi ngầm. Quyền gửi/cấp/từ chối yêu cầu chỉ bật khi GET trả `capabilities` tương ứng bằng `true`; quản trị vẫn cần `System Developer` để xử lý. Thông báo chưa đọc chỉ hiện badge khi có `unreadCount` hợp lệ từ server.

## Luồng đã triển khai

### Luồng người dùng chốt lại ngày 16-10-2026

**Lễ tân tiếp nhận hồ sơ → bác sĩ khám và gửi yêu cầu → quản trị tạo tài khoản.**

- Lễ tân dùng tiếp nhận/mở lượt/chuyển bác sĩ hiện có, không phải tạo tài khoản đăng nhập cho người bệnh.
- Bác sĩ mở hồ sơ đang khám và bấm **Yêu cầu tài khoản**, ghi chú nếu cần rồi **Gửi quản trị**. Mặc định là yêu cầu cấp mới; hỗ trợ mật khẩu là thao tác phụ. Yêu cầu chờ xử lý của đúng người bệnh phải được hiện lại để tránh gửi lặp.
- Quản trị mở yêu cầu từ chuông hoặc danh sách, nhập tên đăng nhập/mật khẩu và **Tạo tài khoản**. Đối chiếu đúng hồ sơ bác sĩ chuyển được xác nhận ngay trong form; không có trang xác minh riêng hoặc bước chọn phương pháp xác minh.
- Lệnh cấp tài khoản là một giao dịch backend: đọc patient từ yêu cầu, tạo User cùng Person, gán role portal, kích hoạt liên kết và hoàn tất yêu cầu. Không tạo lại hồ sơ bệnh nhân. Chỉ xác nhận theo hồ sơ cơ sở khi quản trị đã chủ động đối chiếu; FE không tự gán trạng thái xác minh.
- Tài khoản có sẵn hoặc yêu cầu đang chờ phải được backend kiểm tra chống trùng. Lỗi/tạo dở không được báo hoàn tất. Sau khi tạo, thông báo lại cho bác sĩ; không gửi mật khẩu qua chuông.

Đã được phép sửa ngoài FE cho đúng luồng này. Backend mới lưu/chuyển yêu cầu và cấp tài khoản bằng API, FE vẫn khóa khi kết nối tới một phiên bản backend chưa hỗ trợ.

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

## Hợp đồng API

Prefix FE `/api/vinshc`, backend `/openmrs/ws/rest/v1/vinshc`. API được triển khai trong `PatientAccessController` và `NotificationController`.

| Method | Route | Nội dung |
| --- | --- | --- |
| GET | `/patient-access/requests?status=&patientUuid=&limit=&offset=` | Bác sĩ xem yêu cầu của mình; quản trị xem yêu cầu được phép xử lý |
| GET | `/patient-access/requests/{uuid}` | Đọc đúng yêu cầu từ thông báo, kiểm tra quyền trên server |
| POST | `/patient-access/requests` | `{type: patient_account_create|patient_password_reset, patientUuid, visitUuid?, note?, idempotencyKey}` |
| POST | `/patient-access/requests/{uuid}/fulfill` | `{username?, password, verificationMethod, idempotencyKey}`; chỉ quản trị hệ thống, không trả secret |
| POST | `/patient-access/requests/{uuid}/reject` | `{reason}`; giữ lịch sử, không xóa yêu cầu |
| GET | `/notifications?limit=&offset=` | `{results,hasMore,unreadCount}`; từng dòng `{uuid,type,title,message,createdAt,readAt,target}` |
| POST | `/notifications/{uuid}/read` | Đánh dấu đã đọc, chỉ người nhận; idempotent |
| POST | `/notifications/read-all` | Đánh dấu các thông báo hiện có của người nhận; không đánh dấu thông báo đến sau mốc server |

`target` dùng `{kind:"patient_access_request",requestUuid}` cho quản trị, `{kind:"visit",visitUuid}` cho bác sĩ, `{kind:"portal_visit",visitUuid}` cho người bệnh. Chỉ dùng allowlist: yêu cầu quản trị hoặc lượt khám. Không nhận URL tùy ý. Payload thông báo không chứa bệnh sử, nội dung khám, mật khẩu, token hoặc hash. Đọc thông báo phải kiểm tra lại tài khoản/role/cơ sở và không cho phép đọc thông báo của người khác.

Danh sách yêu cầu trả `{results,hasMore,capabilities:{request:boolean,fulfill:boolean,reject:boolean}}`. Các quyền này do backend tính từ phiên hiện tại; FE không mặc định cho phép ghi khi GET thành công. Yêu cầu trả `{uuid,type,status,patientUuid,patientName,visitUuid,requesterName,createdAt,note?,processedAt?,reason?,username?}`. Trạng thái `pending|fulfilled|rejected`. Server quyết định phạm vi, khóa xử lý đồng thời, từ chối user trùng và không cấp thêm staff/System Developer cho người bệnh.

## Phạm vi ngoài FE đã được cho phép

Người dùng đã đồng ý phạm vi backend, test và tài liệu để luồng này chạy thật. Không thay đổi role nhân viên, Core REST/FHIR hoặc cơ chế công bố hồ sơ.

- `infra/backend/vinshc-module/api/src/main/resources/liquibase.xml`: migration thêm bảng yêu cầu và thông báo, index và ràng buộc duy nhất/idempotency. Giữ nguyên bảng/dữ liệu hiện có.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/PatientAccessController.java` và `NotificationController.java`: các route theo quyền.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/PatientAccessService.java` và `NotificationService.java`: lưu/xử lý yêu cầu, cấp/reset tài khoản bệnh nhân có xác minh, đọc/đánh dấu thông báo theo người nhận.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/PortalService.java` nếu cần tái sử dụng luồng cấp/liên kết/xác minh; không nới phạm vi portal.
- `infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/service/OperationsService.java`: phát thông báo khi tạo/chuyển phiếu hàng đợi có gán provider bác sĩ. Người nhận lấy từ liên kết provider–user tại cơ sở, không suy từ UUID giống nhau.
- `infra/backend/vinshc-module/omod/src/main/resources/moduleApplicationContext.xml`: đăng ký service mới.
- `infra/backend/vinshc-module/omod/src/test/` và `tests/integration/test_patient_access_notifications.py`: test quyền, người nhận, idempotency, xử lý đồng thời, tạo/reset không cấp nhầm quyền và dữ liệu nhạy cảm không xuất hiện trong notification.
- `docs/api/patient-access-notifications.md`: ghi hợp đồng triển khai và cách kiểm tra.

Đã build backend, sao lưu DB và áp dụng migration thêm mới trên stack local; không reset volume, không tạo bộ dữ liệu demo. Các kiểm thử tạo dữ liệu chạy trên môi trường test riêng.

## Tiêu chí kiểm chứng

- Bệnh nhân có lối đăng nhập rõ ràng, không được chọn role nhân viên để tăng quyền.
- Bác sĩ gửi yêu cầu thành công qua backend, quản trị tài khoản khác nhận được và có thể xử lý; reload/đăng xuất không mất yêu cầu.
- Provider nhận đúng thông báo phân công; không có thông báo gán của bác sĩ/cơ sở khác.
- Trạng thái chưa đọc được lưu theo người nhận; logout/đổi người dùng không để lộ danh sách cũ hoặc response trễ.
- Không có mật khẩu/token trong danh sách, thông báo, log, storage hoặc nội dung audit. Không tự đánh dấu xác minh danh tính.
- UI desktop/mobile, bàn phím, lỗi 401/403/404/409, gửi lặp và xử lý đồng thời được kiểm tra; phân biệt test mock và runtime thật.

## Kiểm chứng phiên bản chỉ có FE trước khi bổ sung backend

Mục này ghi lại lần triển khai FE trước đó; các kết quả 404 bên dưới không mô tả bản backend đã bổ sung ngày 16-10-2026.

- `npm run test:patient-access`: desktop 1440 px và mobile 390 px. Kiểm tra lối vào portal, API thiếu thì khóa gửi, gửi yêu cầu, xác minh trước khi cấp, quyền ghi từ server, chuông/đánh dấu đọc, chặn target URL tùy ý, mở đúng công việc và loại bỏ response của phiên trước. Toàn bộ API ghi trong bộ này được mock, không tạo dữ liệu thật.
- `npm run test:roles`: cả 8 vai trò; `npm run test:pages`: 46 trang/148 form trên mỗi kích thước, hành chính/lịch hẹn và portal đều qua. Unit 39/39, build và kiểm tra ánh xạ 127 route backend hiện có đều qua. Kiểm tra route hiện có không xác nhận các endpoint đề xuất đã tồn tại.
- `npm run test:live`: đăng nhập, workspace, danh mục, tìm nhân viên, audit và báo cáo trên stack local thật đều qua, chỉ đọc.
- Đọc trực tiếp trên backend local: `GET /notifications` và `GET /patient-access/requests` đều **404**. Chưa có luồng gửi/nhận liên tài khoản, cấp/reset từ yêu cầu hay thông báo phân công thật; phần này đang chờ backend theo lựa chọn của người dùng.
- Không sửa backend, migration, DB hoặc landing trong lượt bổ sung này; chưa commit/push.

Xem UI bằng `npm run dev`: nhân viên tại `/connected.html`, người bệnh tại `/portal.html`. Bác sĩ mở hồ sơ rồi chọn **Yêu cầu tài khoản**; quản trị mở tab **Yêu cầu tài khoản bệnh nhân**; chuông nằm cạnh thông tin tài khoản ở thanh đầu trang.

## Kiểm chứng FE + BE ngày 16-10-2026

- Backend build thành công, 22 unit test qua. FE có 39 unit test qua, build thành công và ánh xạ 135 route qua.
- Kiểm thử giao diện cả 8 vai trò, 46 trang/148 form trên mỗi kích thước 1440/390 px, cùng bộ kiểm tra tài khoản và chuông đều qua. Các bộ giao diện này dùng API mock.
- Bộ `tests/integration/test_patient_access_notifications.py` chạy thật trên stack test riêng: **8/8 qua**. Bao gồm tiếp nhận → phân bác sĩ → gửi yêu cầu → quản trị cấp tài khoản → bệnh nhân đăng nhập, reset/từ chối, phân quyền/cơ sở/người nhận, gửi đồng thời, rollback khi lỗi DB, tên bệnh nhân theo đúng thứ tự và UUID viết hoa. Luồng trình duyệt dùng API thật qua ở cả 1440 và 390 px.
- Backend chính được cập nhật cùng image đã kiểm thử. `npm run test:live` qua; đọc hai API mới qua FE cổng 5173 đều HTTP 200. DB chính trước/sau vẫn 3 user, 0 patient/visit/encounter; hai bảng mới chưa có bản ghi. Đã sao lưu trước migration; không reset volume, không đưa fixture test vào DB chính.
- Stack test riêng dùng cổng 17888, đã dừng sau kiểm thử và giữ volume. Backend chính vẫn qua gateway cổng 8080. Stack CI có sẵn không bị thay đổi.
- Đã fetch/pull kiểm tra `main`: `c8c2c95` đã có trong nhánh local; không có conflict cần xử lý. Landing được giữ nguyên.
