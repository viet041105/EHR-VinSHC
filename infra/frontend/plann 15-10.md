# Plan chỉnh UI cho 8 role — 15/10/2026

## 1. Yêu cầu cần đạt

Người dùng mở trang là thấy việc cần làm và dữ liệu để làm việc. Bấm tên bệnh nhân, chỉ định, phiếu thu hoặc đơn thuốc để thao tác ngay trên bản ghi đó. Không phải biết mã bệnh nhân, UUID, encounter hay tên API.

Ưu tiên đầu tiên: bác sĩ thấy danh sách bệnh nhân/lượt khám ngay trong màn hình khám, bấm tên để mở hồ sơ, ghi khám và xem kết quả tại một nơi. Không bắt qua trang tìm bệnh nhân, chọn mã, chọn công việc rồi mới khám.

Không giải quyết việc khó dùng bằng cách thêm các bước hướng dẫn. Cần giảm số lần bấm, giảm chuyển trang, giảm phần nhập lại và đưa nút đúng vào nơi người dùng đang làm việc.

Đây là tài liệu bàn giao triển khai, chưa phải xác nhận UI đã được sửa theo thiết kế này.

## 2. Phạm vi và trạng thái local cần giữ

- Sửa UI của đủ 8 role: tiếp đón, điều dưỡng, bác sĩ, KTV CLS, thu ngân, quầy thuốc, quản lý, quản trị. Bao gồm các trang phụ, lịch hẹn, chứng từ, thông tin hành chính và màn hình lỗi có liên quan.
- Chỉ sửa mã và tài liệu trong `infra/frontend/`. Nếu cần sửa backend, metadata, test ngoài FE hoặc cấu hình root: liệt kê rõ file, mục đích và xin phép người dùng trước khi sửa.
- Giữ nguyên landing page: `index.html`, thư mục `landing/` và tài nguyên landing đang dùng. Không áp CSS mới toàn cục làm đổi landing.
- Giữ các chức năng, quyền và quy tắc nghiệp vụ hiện có. Đổi cách trình bày và cách đi tới chức năng; không bỏ nghiệp vụ chỉ vì khó thiết kế.
- Backend hiện vẫn là OpenMRS + module VinSHC, DB PostgreSQL. FE tiếp tục gọi `/api/vinshc/...` qua proxy. Không xóa tích hợp OpenMRS, không buộc nhân viên mở giao diện OpenMRS để làm các công việc này.
- Không tạo bệnh nhân, nhân viên hoặc giao dịch demo vào DB đang dùng. Dữ liệu mẫu phục vụ kiểm thử phải nằm trong mock/test cô lập.
- Khi lập plan, `fe` local đang có merge `main` tới `c8c2c95`, chưa commit, cùng các chỉnh sửa FE chưa commit. Backend Docker đã cập nhật; API nhân viên đã trả 200. AI triển khai phải đọc lại trạng thái thực tế, giữ thay đổi đang có; không reset/abort merge, không stage toàn repo hay commit/push merge khi chưa được cho phép.
- Cổng bệnh nhân không thuộc 8 role nhân viên. Không làm lại portal trong đợt này; nếu sửa component dùng chung thì phải kiểm tra portal không bị hỏng.

## 3. Vấn đề hiện tại cần bỏ

| Hiện tại | Thay bằng |
| --- | --- |
| Khối “Làm theo từng bước” xuất hiện trên nhiều trang | Trang công việc thật: danh sách, chi tiết, form và nút hành động theo trạng thái |
| “Cách dùng trang này — 3 bước hướng dẫn” chiếm chỗ | Nhãn rõ, form có bố cục dễ hiểu; chỉ chú thích ngắn ở trường dễ nhầm |
| Khối lớn “Chưa chọn bệnh nhân”, nút “Tìm bệnh nhân” và “Chọn hồ sơ bằng mã” | Danh sách bệnh nhân/lượt khám hiển thị ngay; vùng chi tiết gọn khi chưa chọn |
| Dropdown “Tất cả thao tác / Chọn công việc…” | Tab nghiệp vụ và nút đúng trên bản ghi đang xem |
| Chọn dòng rồi lại bấm nút xem hoặc chọn action | Bấm tên hoặc nút chính mở ngay chi tiết đúng bản ghi |
| Đổi qua nhiều menu để ghi khám, xem sinh hiệu, kê thuốc | Một màn hình hồ sơ, các tab nội dung trong cùng hồ sơ |
| Form đọc/ghi yêu cầu nhập mã bản ghi đã chọn | ID lấy từ context thực tế, không hiện ô nhập kỹ thuật trong luồng thường dùng |
| Kết quả API trình bày thành cây key/value | Bảng, phiếu, dòng thời gian hoặc phần nội dung có tên dễ hiểu |
| Nhiều nút “Lưu thông tin”, “Xem”, “Chọn” giống nhau | “Lưu sinh hiệu”, “Lưu phiếu khám”, “Xác nhận thu tiền”, “Mở hồ sơ”… |
| Cùng chức năng xuất hiện ở thẻ công việc, shortcut, dropdown và hướng dẫn | Một vị trí chính, nút phụ xuất hiện khi cần |

Ẩn một khối vào accordion vẫn chưa đạt yêu cầu nếu người dùng tiếp tục phải mở nó mới làm được việc. Không chuyển bảng hướng dẫn hiện tại sang popup rồi coi là đã sửa UX.

## 4. Bố cục chung cho các trang nhân viên

### 4.1. Đăng nhập và điều hướng

- Đăng nhập xong mở thẳng trang công việc chính của role, không bắt đi qua “Tổng quan công việc”. Quản lý vào báo cáo; quản trị vào nhân viên.
- Giữ tài khoản, vai trò hiện tại và cơ sở ở header. Sidebar chỉ có các mục có thể bấm; không thêm nhãn role giống nút.
- Một trang chỉ có một tiêu đề và một thanh công cụ chính. Bỏ các dòng giới thiệu, badge “Đã nối API” và lời giải thích kỹ thuật lặp trên từng trang.
- Cảnh báo cấu hình hoặc môi trường, nếu cần, đặt gọn một lần; lỗi đang chặn thao tác phải nằm sát thao tác đó.
- Menu phân theo công việc của role, không bắt người dùng hiểu cách backend chia module. Một trang UI được phép đọc nhiều API đang có.

### 4.2. Danh sách và chi tiết

- Tự tải danh sách ngay khi vào trang. Hiện tìm kiếm và bộ lọc gọn ở đầu danh sách.
- Desktop dùng danh sách bên trái và chi tiết bên phải cho các màn hình xử lý hồ sơ. Có thể thu gọn danh sách khi cần viết nội dung dài.
- Bấm dòng mở chi tiết; không cần bấm thêm “Chọn”, “Áp dụng”, “Xem hồ sơ” mới thấy nội dung.
- Danh tính bệnh nhân phải có họ tên và thông tin phân biệt thực tế: tuổi/năm sinh, giới tính, mã hồ sơ dạng dễ đọc khi cần. Không phân biệt người trùng tên chỉ bằng họ tên.
- UUID chỉ dùng nội bộ. Mã hồ sơ nghiệp vụ có thể hiện nhỏ để đối chiếu giấy tờ, không phải điều kiện để thao tác.
- Danh sách dài phải phân trang hoặc tải thêm theo `hasMore`. Không tải toàn DB để lọc ở browser. Không coi trang đầu là toàn bộ kết quả.
- Bộ lọc phạm vi toàn bộ danh sách phải có hỗ trợ backend. Nếu mới lọc dữ liệu đã tải, phải ghi đúng phạm vi, không đưa ra tổng số hoặc kết luận “không có” cho toàn hệ thống.
- Không tự chọn bệnh nhân đầu danh sách rồi mở form có thể ghi nhầm. Chỉ mở hồ sơ sau khi người dùng chọn một dòng; vùng trống chưa chọn chỉ cần một câu ngắn.
- Giữ lựa chọn, bộ lọc và vị trí cuộn khi quay lại danh sách, trong cùng phiên. Đổi role/cơ sở hoặc đăng xuất phải xóa dữ liệu và context cũ.

### 4.3. Form và thao tác

- Chỉ hiện các ô người dùng thực sự phải quyết định. Bệnh nhân, lượt, encounter, cơ sở, người thực hiện lấy từ context và tài khoản đã xác minh.
- Một nút chính cho hành động hiện tại. Nút phụ ít dùng đặt ở menu “Thao tác khác” của đúng bản ghi: hủy, đính chính, hoàn tiền, ngừng thuốc…
- Một nút có thể mở đúng form và chuẩn bị context. Không tự ghi dữ liệu chỉ vì mở trang, bấm tên hoặc đổi tab.
- Không thêm hộp xác nhận lặp sau mọi nút lưu. Các thao tác có tác động cần xem lại thông tin có thể dùng form xác nhận chính nó; hủy, hoàn tiền, chốt và cấp phát phải có nội dung đối chiếu rõ.
- Quy trình có nhiều API được gộp trong UI theo một mục đích, nhưng vẫn tuân thủ thứ tự backend. Hiện rõ thành công một phần, giữ ID đã tạo, cho tiếp tục từ bước lỗi; không báo thành công cho cả chuỗi khi mới xong bước đầu.
- Chống bấm hai lần, giữ idempotency key cho cùng lần gửi khi hợp đồng có hỗ trợ. Gặp 409 thì đọc lại trạng thái, không tự lặp thao tác ghi.
- Chỉ giữ cảnh báo nghiệp vụ cần thiết: dị ứng, trường bắt buộc còn thiếu, chỉ định chưa xong, số tiền/số thuốc vượt còn lại. Không biến chúng thành một bảng hướng dẫn chung.
- Không tự suy ra chẩn đoán, liều, dị ứng, người duyệt hoặc kết luận chuyên môn.

## 5. Bác sĩ — ưu tiên triển khai đầu tiên

### 5.1. Trang mặc định: Danh sách khám

Khi bác sĩ đăng nhập, tự tải danh sách có quyền xem. Danh sách phải xuất hiện ngay trên màn hình khám, không bắt nhập mã hoặc mở trang tìm kiếm khác.

```text
Danh sách khám                         Hồ sơ của người được chọn
[Tìm theo tên…] [Ngày]                 Họ tên · tuổi/năm sinh · giới tính
[Chờ khám] [Đang khám] [Tra cứu]        Dị ứng · sinh hiệu gần nhất

Tên người bệnh · trạng thái            [Phiếu khám] [Chỉ định & kết quả]
Tên người bệnh · trạng thái            [Chẩn đoán & thuốc] [Lịch sử]
Tên người bệnh · trạng thái
                                      Nội dung thật / form của tab đang mở
[Tải thêm]                            [Lưu phiếu khám]   [Kết thúc khám]
```

Đây là bố cục chức năng, không phải yêu cầu sao chép nguyên kích thước hay câu chữ. Trên mobile: danh sách → chi tiết → nút quay về danh sách, giữ bộ lọc và hồ sơ đã chọn.

### 5.2. Phải phân biệt đúng “bệnh nhân của bác sĩ”

Hiện trạng đọc từ code tại thời điểm lập plan:

- `GET /api/vinshc/visits?status=open&limit=&offset=` có dữ liệu tên bệnh nhân, lượt khám và encounter, lọc theo cơ sở. `CareService.visits(...)` chưa nhận bộ lọc provider/bác sĩ.
- `GET /api/vinshc/operations/queue?point=&state=&date=&limit=&offset=` có `providerUuid`, bệnh nhân và lượt; `queueList(...)` chưa nhận tham số lọc provider. Mã điểm bác sĩ lấy từ metadata đang có, không tự đặt chuỗi mới.
- `GET /api/vinshc/providers/me` xác định người hành nghề đang đăng nhập. Không giả định UUID user bằng UUID provider.
- `GET /api/vinshc/operations/appointments?...&provider=` hỗ trợ lọc provider cho lịch hẹn. Có lịch hẹn không có nghĩa đã có lượt khám hoặc đang được khám.
- Quy tắc `requireAgentAssignment(...)` liên quan request của trợ lý hồ sơ, không phải bằng chứng mọi danh sách FE đã lọc chính xác theo bác sĩ.

Thiết kế dữ liệu:

1. Mục tiêu đầy đủ là danh sách được backend phân quyền và xác định quan hệ với bác sĩ: được giao, đang khám, đã khám. Không lấy toàn bộ bệnh nhân ở cơ sở rồi đặt tên “Bệnh nhân của tôi”.
2. Với API hiện tại, có thể triển khai ngay danh sách khám từ các lượt/hàng đợi được phép đọc. Khi có `providerUuid` rõ ràng, tách “Được giao cho tôi” và “Chờ phân công”; không đưa phiếu giao cho bác sĩ khác vào nhóm của mình.
3. Quan hệ hồ sơ đã khám chỉ được xác định từ liên kết provider trong dữ liệu backend thực sự trả. Không đoán từ người đăng nhập, cùng cơ sở hoặc tên người tạo.
4. Nếu chưa có dữ liệu đầy đủ để phân loại, dùng tên trung thực như “Lượt khám tại cơ sở”; ghi phần backend còn thiếu trong bàn giao. Không yêu cầu người dùng nhập UUID để bù chỗ thiếu API.
5. Để đạt đúng “tất cả bệnh nhân của bác sĩ”, cần hợp đồng backend hỗ trợ danh sách theo bác sĩ hiện tại, phân trang, tra cứu và lịch sử với quyền ở server. Đây là nhu cầu backend phải báo riêng và xin phép trước khi sửa ngoài FE; không tự tạo endpoint giả trong FE.
6. Có bao nhiêu bản ghi được phép xem thì người dùng phải đi tới được bấy nhiêu qua phân trang; “tất cả” không có nghĩa tải tất cả hồ sơ chi tiết ngay khi đăng nhập.

### 5.3. Mở và làm việc trong một hồ sơ

- Bấm tên bệnh nhân: tải chi tiết lượt, sinh hiệu và phiếu khám đã có; hiện ngay thông tin có thể đọc, không yêu cầu tạo encounter trước mới được xem sinh hiệu.
- Nếu chưa bắt đầu khám: nút “Bắt đầu khám” ngay trong vùng chi tiết. Khi bấm, dùng API tạo/tiếp tục encounter theo provider hiện tại rồi mở form. Không yêu cầu người dùng tự tạo “Mã lần khám”.
- Nếu đã có encounter phù hợp của bác sĩ: mở đúng bản đó; không nhầm encounter sinh hiệu hoặc encounter của người khác. Không đủ dữ liệu xác định thì đọc thêm chi tiết hoặc báo giới hạn cụ thể.
- Tab Phiếu khám: lý do khám, bệnh sử, tiền sử, khám, hướng điều trị và lời dặn theo nhóm nội dung. Lưu xong vẫn ở hồ sơ này.
- Sinh hiệu và dị ứng hiện gọn ở đầu hồ sơ. Cảnh báo dị ứng phải thấy được khi kê thuốc; trạng thái chưa hỏi/không rõ khác với không có dị ứng.
- Tab Chỉ định & kết quả: chỉ định của đúng lượt, trạng thái và nội dung kết quả; nút “Thêm chỉ định” ngay tại đây. Tên dịch vụ chọn theo danh mục backend/metadata có sẵn.
- Tab Chẩn đoán & thuốc: tìm ICD bằng tên/mã chuyên môn; tên thuốc có hàm lượng, đơn vị và đường dùng. Thêm nhiều dòng thuốc trên cùng màn hình; sau mỗi API lưu phải phân biệt dòng đã lưu và dòng chưa gửi, không giả một transaction chung.
- Tab Lịch sử: dữ liệu trong phạm vi backend cho phép, phân biệt ngày khám và người thực hiện; không tự tổng hợp bệnh án mà API không trả.
- “Kết thúc khám”: mở phần xem lại của đúng encounter, chỉ rõ thiếu nội dung gì; gửi finalize sau xác nhận. Hiển thị rõ việc này chốt phiếu bác sĩ, chưa đồng nghĩa lượt đã thanh toán/xong thuốc/đóng lượt.
- Chuyển người bệnh tới điểm phục vụ tiếp theo chỉ khi có phiếu hàng đợi và transition hợp lệ. Không tự thay đổi queue khi chốt phiếu.
- In đơn và công bố dữ liệu cho bệnh nhân đặt trong đúng hồ sơ, chỉ hiện khi có quyền và đúng trạng thái. Không tự công bố toàn bộ bệnh án khi finalize.
- Trợ lý hồ sơ là khu vực phụ, có thể đóng; không che hồ sơ hoặc buộc người dùng hỏi AI để tìm dữ liệu.

### 5.4. Tiêu chí nghiệm thu bác sĩ

- Đăng nhập xong thấy danh sách hoặc trạng thái trống thật; không thấy form nhập mã để bắt đầu.
- Một lần bấm vào tên mở được vùng hồ sơ và bắt đầu tải nội dung. Nếu chưa có encounter, tối đa thêm một lần bấm “Bắt đầu khám”.
- Từ phiếu khám sang xem kết quả hoặc kê thuốc chỉ đổi tab trong cùng bệnh nhân; không tìm/chọn lại người bệnh.
- Không phải mở bảng hướng dẫn, dropdown action hay công cụ mã trong toàn luồng khám thông thường.
- Chuyển bệnh nhân A sang B không mang sinh hiệu, thuốc, kết quả, draft hoặc response chậm của A sang B. Draft chưa lưu phải được xử lý rõ trước khi rời hồ sơ.
- Nếu tab “Của tôi” chưa được backend hỗ trợ đầy đủ, báo đúng giới hạn trong bàn giao; không đánh dấu yêu cầu này đã hoàn tất chỉ vì lọc được một trang kết quả.

## 6. Tiếp đón

**Trang mặc định:** Tiếp nhận hôm nay. Có tìm bệnh nhân ở đầu trang, lịch hẹn trong ngày và danh sách đang chờ/đã tiếp nhận.

- Tìm bằng tên, điện thoại hoặc CCCD/mã nghiệp vụ nếu người dùng có sẵn; không bắt nhập mã nội bộ. Khớp quy tắc tìm thực tế của backend, không hứa hỗ trợ tìm một phần khi API chỉ hỗ trợ chính xác.
- Kết quả có tên, thông tin phân biệt và nút “Tiếp nhận”. Bấm mở form đã điền người bệnh, loại khám, quy trình và nơi tới đầu tiên.
- Chưa có hồ sơ: nút “Đăng ký bệnh nhân” ngay cạnh kết quả trống. Đăng ký, mở lượt và xếp hàng nằm trong một màn hình tiếp nhận; mỗi API vẫn theo đúng thứ tự và có xử lý lỗi một phần.
- Có lượt đang mở: cho tiếp tục lượt đó, không bắt thử tạo mới rồi mới biết trùng. Phản hồi 409 có hồ sơ tương tự phải hiển thị thành lựa chọn có tên.
- Lịch hẹn: danh sách theo ngày/bác sĩ/trạng thái được API hỗ trợ. “Tiếp nhận” trên lịch hẹn phải mang theo đúng lịch và bệnh nhân vào thao tác mở lượt.
- Thêm/sửa liên hệ, địa chỉ nằm trong tab “Thông tin cá nhân” của người bệnh, không thành form nhập UUID riêng.
- Đóng/hủy lượt là thao tác ở đúng dòng lượt; giữ các chặn dịch vụ chưa xong và phí chưa thu đủ.
- Chọn bác sĩ/cơ sở/quy trình theo tên từ nguồn hợp lệ. Nếu chưa có API danh sách bác sĩ phù hợp, ghi nhu cầu backend; không lấy vài tên trong trang lịch hẹn hiện tại làm danh sách đầy đủ.

**Nghiệm thu:** từ một bệnh nhân tìm được tới form tiếp nhận chỉ một lần bấm; từ hồ sơ vừa tạo tiếp tục mở lượt/xếp hàng mà không chọn lại hồ sơ. Không tạo lượt hay queue lần hai khi retry.

## 7. Điều dưỡng

**Trang mặc định:** Chờ đo sinh hiệu. Danh sách người bệnh tại điểm điều dưỡng, đúng cơ sở và phạm vi đang có.

- Hiện số thứ tự, tên, tuổi/năm sinh, giờ đến và trạng thái phục vụ.
- Bấm tên để xem thông tin chăm sóc được phép xem và form số đo. Nút gọi/bắt đầu phục vụ đặt ngay trên dòng hoặc header hồ sơ, đúng transition backend.
- Gộp việc bắt đầu lần ghi và nhập sinh hiệu trong một màn hình. Người dùng không phải mở menu Lượt khám rồi menu Sinh hiệu rồi tự tạo encounter bằng mã.
- Form chính có các ô số đo và đơn vị rõ. Tình trạng không đo được/không rõ đặt sát chỉ số, không để trường trắng đồng nghĩa bình thường.
- Sau lưu: hiện số đo đã lưu, giờ đo và nút “Chuyển sang bác sĩ” nếu queue hợp lệ. Lưu số đo không tự chuyển queue.
- Lịch sử đo ở cùng hồ sơ; đính chính/hủy mở từ đúng lần đo, có lý do và vẫn giữ bản gốc theo backend.

**Nghiệm thu:** chọn người bệnh → nhập số đo tại cùng một nơi; không gõ/chép ID; không ghi nhầm encounter khám bác sĩ.

## 8. KTV cận lâm sàng

**Trang mặc định:** Chỉ định cần thực hiện. Ba tab nghiệp vụ: Chưa nhận, Đang làm, Đã có kết quả, chỉ phân loại khi dữ liệu/API đủ.

- Dòng việc ưu tiên tên người bệnh, dịch vụ, thời điểm chỉ định và trạng thái; không lấy UUID hoặc tên API làm nội dung chính.
- Chỉ hiển thị dữ liệu trong phạm vi backend giao cho KTV hoặc cho phép nhận. Không tải toàn bộ bệnh án để bổ sung thông tin không cần thiết.
- Bấm dòng mở yêu cầu, thông tin lâm sàng của chỉ định và khu vực nhập kết quả. Nhận việc/bắt đầu thực hiện là nút theo trạng thái, không phải dropdown tất cả trạng thái.
- Tác giả lấy từ provider hiện tại đã xác minh. Người duyệt chọn theo danh sách hợp lệ nếu API có; tự duyệt phải là lựa chọn chủ động, backend cho phép mới gửi. Không yêu cầu sao chép UUID người nhập sang người duyệt.
- Nhập kết quả, đính kèm và xem file ngay trong chỉ định. Phân biệt sơ bộ, chính thức, đính chính bằng nhãn rõ.
- “Lưu kết quả chính thức” và “Hoàn tất chỉ định” chỉ được gộp thành một hành động người dùng khi đã có xác nhận phù hợp; nếu API sau lỗi thì hiện kết quả đã lưu và cho hoàn tất lại, không tạo kết quả trùng.
- Đính chính kết quả từ bản đang xem, hiện lý do và lịch sử phiên bản.

**Nghiệm thu:** nhận chỉ định, nhập/duyệt/xem kết quả không phải chọn lại bệnh nhân hoặc tra mã; không thể bấm hoàn tất khi kết quả chưa đạt điều kiện backend.

## 9. Thu ngân

**Trang mặc định:** Chờ thanh toán. Có tên người bệnh, tổng phí, đã thu, còn phải thu và trạng thái tiền.

- Các nhóm việc: Cần thu, Chờ xác nhận chuyển khoản, Đã thu. Mỗi nhóm có phạm vi ngày đúng theo API; chuyển khoản chờ không bị mất chỉ vì tạo hôm trước.
- Bấm người bệnh/phiếu mở chi tiết phí và khu vực thu tiền. Không nhập mã bill/payment.
- Nút “Lập phiếu phí” đi từ lượt đã chọn; dịch vụ chọn bằng tên, giá do backend cung cấp. Không tự sửa giá gốc hoặc đánh dấu đã thanh toán.
- Số tiền mặc định là số còn phải thu mới nhất, vẫn cho nhập số thu một phần nếu backend hỗ trợ.
- Tiền mặt và chuyển khoản có trạng thái rõ; gửi yêu cầu chuyển khoản không hiện như tiền đã về. Xác nhận tiền về phải là thao tác chủ động.
- Sau thành công hiện phiếu thu và nút in ngay. Không bắt mở trang Chứng từ rồi nhập lại mã.
- Hoàn tiền/hủy ở menu phụ của đúng phiếu/giao dịch, có lý do, số tiền và tình trạng đối chiếu. Xung đột 409 phải đọc lại, không lặp thu/hoàn tự động.

**Nghiệm thu:** từ dòng phiếu tới form thu tiền là một lần bấm; không chọn lại bệnh nhân; số tiền và chứng từ luôn thuộc đúng bill/payment.

## 10. Dược / quầy thuốc

**Trang mặc định:** Đơn chờ cấp. Hiện tên bệnh nhân, thời điểm kê, bác sĩ khi có dữ liệu, trạng thái cấp.

- Backend hiện có thể trả từng dòng thuốc. Có thể gom các dòng thành một nhóm người bệnh/lượt/đơn khi có khóa liên kết thật; không gọi một nhóm là “đơn đầy đủ” nếu mới tải một trang có vài dòng.
- Bấm mở danh sách thuốc với tên, hàm lượng, cách dùng, số phải cấp, đã cấp và còn lại.
- Form cấp thuốc nằm ngay trên dòng hoặc trong chi tiết đơn. Tự điền số còn cấp, người dùng xác nhận thuốc thực tế, số lượng, lô và hạn dùng theo hợp đồng.
- Cho cấp từng phần đúng khả năng backend. Nếu có nút cấp nhiều dòng, phải chỉ rõ đây là nhiều request, trạng thái từng dòng và cách tiếp tục khi một dòng lỗi.
- Đơn bị ngừng, lượt đã hủy, dòng đã cấp đủ không có nút cấp tiếp. Trạng thái phải lấy lại sau thao tác.
- Lịch sử, in đơn, đính chính/hủy lần cấp đi từ đúng đơn hoặc lần cấp. Không sửa DrugOrder qua màn hình cấp thuốc.
- Không tạo bảng tồn kho hoặc số lượng khả dụng giả; ghi rõ backend hiện chưa có đối chiếu tồn kho khi có liên quan tới quyết định cấp.

**Nghiệm thu:** chọn người bệnh/đơn → thấy thuốc và form cấp; không thao tác qua UUID; số còn lại đúng sau cấp một phần hoặc có xung đột.

## 11. Quản lý

**Trang mặc định:** Báo cáo hôm nay, tự tải số liệu tổng hợp có thật.

- Một hàng bộ lọc: cơ sở được cấp quyền, ngày/khoảng ngày và các nút Hôm nay, Hôm qua, 7 ngày, 30 ngày.
- Hiện các chỉ số API thực sự trả, cùng đơn vị và phạm vi thời gian. Không đặt tên “lợi nhuận”, “tồn kho” hoặc chỉ số chưa có dữ liệu.
- Bảng thu/hoàn/ròng và hoạt động đặt dưới chỉ số. Biểu đồ chỉ dùng khi giúp so sánh; không thêm chart trang trí.
- Đổi thời gian thì tải lại báo cáo, không cần chọn action rồi gửi một form generic khác.
- Không trả hoặc hiện danh sách tên bệnh nhân cho role quản lý. Xuất/in chỉ hiện khi có khả năng thật và đúng quyền; không thêm nút rỗng.
- Giữ giới hạn báo cáo nhiều ngày tối đa 31 ngày theo backend và ngày theo Asia/Ho_Chi_Minh.

**Nghiệm thu:** đăng nhập là thấy số liệu hoặc trạng thái lỗi/trống rõ; chọn khoảng thời gian là đủ để xem báo cáo; không có context bệnh nhân hoặc form mã hồ sơ.

## 12. Quản trị

**Trang mặc định:** Nhân viên. Điều hướng riêng cho Nhân viên, Cơ sở, Biểu mẫu & quy trình, Cổng bệnh nhân, Lịch sử.

- Danh sách nhân viên có tên, tài khoản, vai trò, cơ sở, trạng thái. Tìm/lọc theo dữ liệu thật, không tải credential/hashes về browser.
- “Thêm nhân viên” dùng form ngắn: họ tên, vai trò, nơi làm việc, thông tin đăng nhập. Không có bảng hướng dẫn 3 bước buộc người dùng đọc trước.
- Tạo tài khoản/phân công/provider được xử lý phía sau một lần gửi của người dùng theo API đang có. Chỉ hiện tiến trình từng bước khi đang xử lý hoặc lỗi một phần; cho tiếp tục đúng bước, không tạo tài khoản trùng.
- Chọn nhân viên mở chi tiết để đổi phân công, đổi mật khẩu, khóa/mở hoặc kiểm tra hồ sơ chuyên môn. Không yêu cầu điền UUID user/provider.
- Quyền System Developer và quyền quản trị ứng dụng phải phân biệt đúng. Thiếu quyền thì giải thích tại chức năng liên quan; không cho thấy nút như thể chắc chắn dùng được.
- Cơ sở: danh sách → chi tiết → sửa/ngừng. Tên và trạng thái từ API ưu tiên hơn metadata tĩnh; cơ sở đã ngừng không bị hiện lại như đang hoạt động.
- Biểu mẫu: danh sách phiên bản, bản nháp/đang dùng/đã ngừng và nút theo trạng thái. Có trình chỉnh nội dung theo cấu trúc cho phần schema hỗ trợ được; phần JSON chuyên sâu nằm riêng, không giả hỗ trợ mọi schema bằng vài ô đơn giản.
- Quy trình: chọn cơ sở theo tên, hiển thị điểm phục vụ và thời điểm thanh toán từ cấu hình thật; kiểm tra trước khi lưu, không tự viết mã cấu hình backend chưa định nghĩa.
- Liên kết cổng bệnh nhân: tìm/chọn đúng người bệnh và tài khoản, hiện trạng thái xác minh, cấp/thu hồi ở đúng liên kết. Không tự công bố hồ sơ lâm sàng từ thao tác tạo tài khoản.
- Lịch sử: bảng có thời gian, người thực hiện, hành động, đối tượng bằng tên khi có dữ liệu; ID chỉ trong chi tiết kỹ thuật cần thiết.
- Kiểm tra quyền/cấu hình và công cụ kỹ thuật có thể nằm trong khu vực nâng cao của quản trị, không rải xuống trang khám/thu ngân/điều dưỡng.

**Nghiệm thu:** quản trị tạo và phân công nhân viên theo tên/vai trò/cơ sở, không biết UUID; lỗi bước sau không buộc tạo lại user; quản trị không có quyền hệ thống không thấy trải nghiệm tạo Core user như đã được cấp quyền.

## 13. API, trạng thái và nguồn sự thật

- Trước khi sửa mỗi trang, đọc action/module FE và controller/service backend tương ứng. Tài liệu cũ có chỗ lỗi thời: ví dụ `docs/UI_BACKEND_MAP.md` trong FE còn nói API nhân viên chưa có, trong khi backend mới đã có. Không lấy một bảng cũ làm bằng chứng API chưa tồn tại.
- Gửi đúng header workspace role/facility; giữ client và kiểm tra quyền server đang có. Không gọi Core REST/FHIR để lách một API VinSHC còn thiếu.
- Đọc danh sách bằng GET; các nút ghi chỉ gửi sau hành động rõ của người dùng. Kết quả đọc không được biến thành thay đổi trạng thái.
- Khi một trang cần tên/provider hoặc quan hệ mà payload chưa có, ưu tiên API chi tiết hợp lệ; tránh N+1 tải hồ sơ lâm sàng hàng loạt chỉ để dựng danh sách.
- Mọi yêu cầu backend mới phải có bảng bàn giao: dữ liệu cần, endpoint hiện có, thiếu gì, hành vi mong muốn, phạm vi quyền và trang bị ảnh hưởng. Chưa có quyền sửa BE thì hoàn thiện phần FE độc lập và báo phần chưa đạt, không giả hoàn tất.
- Các trạng thái “chờ khám”, “chờ kết quả”, “đã khám” phải có quy tắc ánh xạ từ trường thật. Không suy từ việc đã mở một tab hoặc từ state chỉ tồn tại trên browser.
- Phản hồi 401 đưa về đăng nhập; 403 nói rõ thiếu quyền trong role/cơ sở; 404 không hiện thành “sai mật khẩu”; 409 giữ nội dung nhập và cho đọc lại; lỗi kết nối có nút thử lại, không xóa dữ liệu đã nhập.
- Có xử lý response chậm sau đổi hồ sơ/role/phiên, loading, trạng thái không có bản ghi và lỗi từng vùng. Không để toàn trang trắng chỉ vì một widget phụ lỗi.

## 14. Thiết kế hình ảnh

- Dùng lại nhận diện VinSHC, màu chính xanh và hệ font hiện có của workspace; không làm lại landing.
- Ưu tiên bảng dữ liệu, khoảng cách gọn, tiêu đề rõ và form thẳng hàng. Tránh mỗi nhóm dữ liệu lại có một card lớn, badge, gradient hoặc đoạn giới thiệu.
- Mỗi vùng chỉ cần nhấn mạnh một việc chính. Trạng thái có chữ, không chỉ màu; icon có nhãn khi ý nghĩa không rõ.
- Desktop kiểm tra ít nhất 1280 và 1440 px; mobile 390 px. Không có cuộn ngang toàn trang; danh sách chuyển thành thẻ hoặc màn hình riêng khi cần.
- Bàn phím dùng được: thứ tự focus, nhãn trường, tab chọn, đóng modal, focus sau lưu/lỗi. Không phụ thuộc hover để thấy chức năng quan trọng.
- Form dài không mở nhiều modal chồng nhau. Nội dung đang nhập chưa lưu phải được giữ trong phiên đúng hồ sơ hoặc cảnh báo trước khi bỏ; không lưu hồ sơ/credential vào localStorage để giải quyết việc này.

## 15. Thứ tự triển khai và các file bắt đầu

| Đợt | Công việc | Đầu ra để xem xét |
| --- | --- | --- |
| 1 | Rà permission, context, API danh sách; lập ma trận toàn bộ trang/action của 8 role và phân biệt phần BE còn thiếu | Bảng chức năng hiện có → vị trí UI mới → API/quyền → tiêu chí kiểm tra, đủ mọi action được cấp quyền |
| 2 | Bỏ khối hướng dẫn lặp và form chọn mã khỏi luồng thường dùng; dựng bố cục danh sách/chi tiết | Bác sĩ xem được danh sách và mở hồ sơ theo tên, các role khác không bị mất chức năng |
| 3 | Làm trọn màn hình bác sĩ: đọc hồ sơ, sinh hiệu, phiếu khám, chỉ định/kết quả, chẩn đoán/thuốc, chốt | Kịch bản bác sĩ chạy trên cùng hồ sơ không chọn lại context |
| 4 | Tiếp đón và điều dưỡng | Đăng ký/tiếp nhận/hàng đợi/đo sinh hiệu liền mạch, không nhập mã |
| 5 | KTV, thu ngân và quầy thuốc | Mỗi role xử lý từ danh sách tới kết quả/thu/cấp trên đúng bản ghi |
| 6 | Quản lý, quản trị, lịch hẹn, chứng từ và toàn bộ trang phụ | Không còn trang generic bắt chọn action/mã trong luồng thường dùng |
| 7 | Kiểm tra đủ 8 role, mobile, quyền, lỗi, payload và demo trọn lượt | Báo cáo kết quả thật, ảnh màn hình và danh sách giới hạn chưa xong |

File cần đọc/sửa có chọn lọc trong FE:

- `shell/src/app.js`: khởi tạo trang theo role, section rendering, action toolbar, form và phản hồi sau lưu.
- `shell/src/screens.js`: thay `contextPanel` hiện tại; bỏ chọn mã khỏi UI thường dùng, dùng header hồ sơ gọn.
- `shell/src/task-guide.js`, `shell/src/page-design.js`: bỏ việc render `taskGuide/pageHelp/taskDirectory` như lớp điều hướng chính; giữ validation/helper còn hữu ích, không xóa bừa logic dùng nơi khác.
- `shell/src/worklist-view.js`, `shell/src/result-view.js`: danh sách/chi tiết theo loại dữ liệu, loading/error, tab và nút trên bản ghi.
- `packages/core/src/workspace-model.js`, `packages/core/src/backend-client.js`: tái sử dụng mapping ID, context isolation, permission và client; không làm mất các bảo vệ đã có.
- `modules/*/src/index.js`, `modules/admin/src/console.js`: giữ hợp đồng action, bổ sung presentation/workspace riêng theo role thay vì ép tất cả qua một form renderer.
- `shell/src/presentation.js`, `styles/clinic-base.css`, `styles/connected.css`, `styles/workspace.css`, `styles/pages.css`: nhãn, bố cục và responsive dành cho trang chức năng.
- `tests/unit/`, `tests/browser/`: cập nhật kiểm thử theo hành vi mới. Các test đang đòi có khối hướng dẫn/action picker phải đổi, không giữ UI cũ chỉ để test cũ pass.
- `docs/WORKSPACE_UI.md` và tài liệu FE liên quan: sửa mô tả sau khi UI thực sự hoàn tất; ghi rõ phần phụ thuộc backend.

Không cần đổi framework hoặc viết lại toàn bộ app chỉ để bỏ các bước thừa. Có thể giữ registry/action API làm lớp dữ liệu, thay các màn hình theo công việc ở lớp UI.

## 16. Kiểm chứng và điều kiện hoàn thành

### 16.1. Kiểm tra tự động

- `npm test`, `npm run test:api`, `npm run build`.
- Các bộ browser theo scripts thực tế trong `package.json`, gồm các trang 8 role, chuỗi demo, trợ lý hồ sơ và portal khi component dùng chung bị ảnh hưởng.
- Browser test xác nhận việc mở trang/chọn hồ sơ/đổi tab không gửi request ghi; action có payload đúng patient/visit/encounter/bill/order/provider.
- Thêm tình huống trùng tên, nhiều trang kết quả, provider khác user, hai bác sĩ cùng cơ sở, queue chưa phân công, lỗi một phần khi tạo nhân viên hoặc tiếp nhận, 401/403/404/409, đổi role và response chậm của hồ sơ cũ.
- Không chỉ kiểm tra ảnh hoặc text. Phải kiểm tra UI không lộ ID cần nhập, nút chính tới đúng hồ sơ và các bước giảm thực sự.

### 16.2. Kiểm tra với backend

- Có kiểm tra GET qua FE → backend thật cho danh sách, chi tiết, metadata và workspace. Phân biệt rõ kết quả này với test mock.
- Chuỗi ghi đầy đủ chạy trên stack/DB kiểm thử riêng, được phép tạo dữ liệu test. Không chạy script tạo demo trên DB local hiện dùng khi chưa được người dùng cho phép.
- Chạy lại câu chuyện trong `../../docs/DEMO_SCRIPT.md` và `../../docs/DEMO_FLOW_THUC_TE.md` bằng UI mới. Hai tài liệu là tình huống nghiệp vụ để đối chiếu; các chỉ dẫn click UI cũ không phải thiết kế bắt buộc phải giữ.
- Không coi coverage API hoặc unit test pass là bằng chứng tất cả role đã thao tác thành công trên runtime.

### 16.3. Người mới dùng phải làm được

Cho người chưa quen phần mềm thực hiện theo tên mục/nút, không đưa bản hướng dẫn click chi tiết:

| Role | Việc phải làm được |
| --- | --- |
| Tiếp đón | Tìm/đăng ký bệnh nhân, tiếp nhận và đưa vào đúng hàng đợi |
| Điều dưỡng | Thấy người đang chờ, mở hồ sơ, lưu số đo và chuyển bác sĩ |
| Bác sĩ | Thấy danh sách, chọn tên, xem sinh hiệu, ghi khám, chỉ định, đọc kết quả, kê thuốc và chốt |
| KTV | Nhận chỉ định, thực hiện, nhập/duyệt kết quả và hoàn tất |
| Thu ngân | Mở phiếu cần thu, thu hoặc xác nhận chuyển khoản, in phiếu |
| Quầy thuốc | Mở đơn chờ, đối chiếu thuốc và xác nhận cấp |
| Quản lý | Xem báo cáo hôm nay và đổi khoảng ngày |
| Quản trị | Thêm/phân công nhân viên, xem cơ sở và lịch sử thay đổi |

“Dễ dùng” ở đây là dễ tìm đúng thao tác phần mềm. Hệ thống không thay việc người thực hiện có chuyên môn để quyết định khám, duyệt kết quả, kê đơn hoặc cấp thuốc.

### 16.4. Checklist bàn giao cho người dùng

- [ ] Đủ ma trận trang/action của 8 role; không mất chức năng cũ có quyền sử dụng.
- [ ] Không còn khối “Làm theo từng bước”, “3 bước hướng dẫn” và dropdown “Tất cả thao tác” trong luồng thường dùng.
- [ ] Không role nào cần gõ/copy UUID để hoàn thành quy trình thường ngày.
- [ ] Bác sĩ thấy danh sách ngay, chọn theo tên và làm việc trong cùng hồ sơ; phạm vi “của tôi” phản ánh đúng dữ liệu/quyền backend.
- [ ] Không còn khối context bệnh nhân trên báo cáo hoặc quản trị khi không liên quan.
- [ ] Các trang phụ, in chứng từ, đính chính, hoàn/hủy và lịch sử vẫn tới được từ đúng bản ghi.
- [ ] Lỗi một phần không gây tạo trùng, thu trùng, cấp trùng hoặc báo thành công sai.
- [ ] Có ảnh desktop/mobile của đủ 8 role và bảng trước/sau về số lần bấm/chuyển trang ở các tác vụ chính.
- [ ] Liệt kê riêng phần đã chạy bằng mock, bằng backend thật chỉ đọc, bằng stack test có ghi và phần còn thiếu API.
- [ ] Landing giữ nguyên; không có thay đổi ngoài FE khi chưa được cấp phép.
- [ ] Không tự commit/push hoặc chốt merge đang chờ; làm theo chỉ đạo mới nhất của người dùng.

## 17. Chỉ dẫn ngắn cho AI nhận triển khai

Đọc plan này cùng code hiện tại rồi triển khai từng đợt. Bắt đầu bằng màn hình bác sĩ vì đây là vấn đề người dùng nêu trực tiếp. Bản xem đầu tiên cần chứng minh được: danh sách hiện ngay, bấm tên mở hồ sơ, không nhập mã, không đi qua hướng dẫn hoặc dropdown công việc.

Đừng chỉ đổi màu, viết lại hướng dẫn hay thêm thẻ công việc. Mỗi thay đổi phải giúp bỏ một bước tìm/chọn/nhập lại hoặc đưa thông tin và hành động về đúng hồ sơ. Nếu API chưa đáp ứng danh sách “của tôi” đầy đủ, ghi rõ phần thiếu và đề xuất hợp đồng cụ thể, không dựng dữ liệu hay gắn nhãn sai để làm UI trông như đã xong.
