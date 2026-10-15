# Kịch bản demo VinSHC: một lượt khám trọn vẹn

Kịch bản đi theo một bệnh nhân từ lúc bước vào cửa phòng khám tới lúc cầm thuốc ra về. Mỗi bước được làm bằng đúng tài khoản của người phụ trách: tiếp đón, điều dưỡng, bác sĩ, kỹ thuật viên cận lâm sàng (KTV CLS), thu ngân, quầy thuốc. Cuối cùng là quản lý và quản trị xem lại toàn bộ.

- **Thời lượng:** khoảng 30 phút (phần chính 25 phút, phần tùy chọn 5 phút).
- **Quy trình dùng trong demo:** *Có điều dưỡng, trả sau* (`STANDARD_POSTPAY`): Tiếp đón → Điều dưỡng → Bác sĩ → CLS (nếu có chỉ định) → Thu ngân → Quầy thuốc (nếu có đơn).
- **Dữ liệu:** toàn bộ là dữ liệu giả. Danh mục dịch vụ, thuốc và chẩn đoán là danh mục kiểm thử, không phải tư vấn y khoa.

---

## 1. Câu chuyện

> Anh **Trần Văn Demo**, 36 tuổi, đến phòng khám vì **đau vùng thượng vị 3 ngày, đau tăng sau ăn**. Anh chưa có hồ sơ ở phòng khám.
>
> Tiếp đón lập hồ sơ và mở lượt khám. Điều dưỡng đo sinh hiệu. Bác sĩ khám và cho **siêu âm ổ bụng**. KTV làm siêu âm và trả kết quả. Bác sĩ chẩn đoán **viêm dạ dày (K29.7)** và kê **Pantoloc 20mg**. Anh Demo thanh toán, nhận thuốc rồi ra về.

---

## 2. Chuẩn bị (làm trước buổi demo 30 phút)

### 2.1. Bật hệ thống

```bash
cd infra/frontend
npm run backend:up     # bật backend + DB (dữ liệu cũ được giữ)
npm run dev            # bật giao diện tại http://127.0.0.1:5173
```

Mở `http://127.0.0.1:5173/connected.html` và đăng nhập bằng tài khoản quản trị (`EHR_ADMIN_USERNAME` / `EHR_ADMIN_PASSWORD` trong file `.env`).

### 2.2. Tạo 7 tài khoản nhân viên

Vào **Quản trị → tab Nhân viên → ＋ Thêm nhân viên** và tạo lần lượt 7 tài khoản. Mỗi lần tạo, hệ thống tự làm đủ 3 bước: tạo tài khoản, phân công nơi làm việc, tạo hồ sơ chuyên môn (với bác sĩ, điều dưỡng, KTV).

| Nhân vật | Vai trò (thẻ cần chọn) | Tên đăng nhập gợi ý | Mật khẩu gợi ý |
| --- | --- | --- | --- |
| Chị Lan | 🧾 Tiếp đón | `letan.lan` | `demo123` |
| Chị Hoa | 🩺 Điều dưỡng | `dieuduong.hoa` | `demo123` |
| BS. Minh | 👨‍⚕️ Bác sĩ | `bs.minh` | `demo123` |
| Anh Tuấn | 🧪 Kỹ thuật viên CLS | `ktv.tuan` | `demo123` |
| Chị Mai | 💳 Thu ngân | `thungan.mai` | `demo123` |
| Anh Nam | 💊 Dược/quầy thuốc | `duoc.nam` | `demo123` |
| Chị Thảo | 📊 Quản lý | `quanly.thao` | `demo123` |

- Mật khẩu chỉ cần từ 6 ký tự. Nhân viên đăng nhập là vào thẳng màn hình làm việc, không phải đổi mật khẩu.
- Nếu tên đăng nhập đã có người dùng, thêm số vào cuối (ví dụ `bs.minh2`) hoặc dùng nút **Đổi tên đăng nhập**.
- Tất cả chọn cùng một cơ sở: **VinSHC Development Clinic**.

### 2.3. Bố trí màn hình

- Mở **mỗi vai trò trong một cửa sổ riêng**, hoặc dùng cửa sổ ẩn danh hay profile trình duyệt khác. Mỗi cửa sổ đăng nhập một tài khoản.
- Hệ thống **không lưu đăng nhập vào trình duyệt**: tải lại trang (F5) thì phải đăng nhập lại. Khi demo tránh bấm F5.
- Nếu chỉ có một màn hình: dùng một cửa sổ, đến mỗi cảnh thì **Đăng xuất** rồi đăng nhập tài khoản tiếp theo.

### 2.4. Chạy thử một lần

Chạy trọn kịch bản một lượt trước buổi demo, dùng một bệnh nhân khác (ví dụ "Lê Thị Thử"). Lần chạy thử giúp phát hiện sớm các lỗi cấu hình (xem mục 6). Sau đó có thể đóng lượt khám đó lại.

### 2.5. Thông tin bệnh nhân mẫu (dữ liệu giả)

| Trường | Giá trị |
| --- | --- |
| Họ / Tên đệm / Tên | Trần / Văn / Demo |
| Giới tính | Nam |
| Mức đầy đủ ngày sinh | Đủ ngày tháng năm |
| Ngày sinh | 15/03/1990 |
| Số CCCD (12 số) | `079090001234` (số giả; nếu báo trùng thì đổi 4 số cuối) |
| Điện thoại | `0900000000` |
| Nghề nghiệp | Nhân viên văn phòng |

---

## 3. Cách dùng chung (nói với mentor ở cảnh đầu tiên)

1. **Chọn trước, làm sau.** Mỗi màn hình có một danh sách: bệnh nhân, lượt khám, hàng đợi, chỉ định, phiếu phí, đơn thuốc. Bấm **Chọn** ở một dòng thì khung **"BỆNH NHÂN ĐANG CHỌN"** hiện tên người bệnh. Các biểu mẫu phía dưới **tự điền mã hồ sơ**, nên không phải gõ mã.
2. **Mỗi vai trò chỉ thấy việc của mình.** Menu bên trái thay đổi theo tài khoản: thu ngân không thấy bệnh án, KTV chỉ thấy chỉ định của mình. Quyền được kiểm tra ở máy chủ, không chỉ ẩn nút.
3. **Mọi thao tác lưu đều có xác nhận và được ghi lịch sử.** Ai làm, lúc nào, trên hồ sơ nào đều truy được.

---

## 4. Kịch bản chi tiết

### Cảnh 1. Tiếp đón: bệnh nhân bước vào cửa (4 phút)

**Đăng nhập:** `letan.lan` → màn hình mở thẳng **Tổng quan công việc** của vai trò Tiếp đón.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Bệnh nhân** → ô tìm kiếm trong danh sách **Tìm bệnh nhân** | Gõ `Demo` hoặc số CCCD |
| 2 | Chưa có kết quả → bấm **Đăng ký bệnh nhân mới** | Điền theo bảng 2.5 → **Đăng ký bệnh nhân** |
| 3 | Hồ sơ mới hiện trong danh sách → bấm **Chọn** | Khung "Bệnh nhân đang chọn": *Trần Văn Demo* |
| 4 | Ở dòng bệnh nhân → **Mở lượt khám** | Loại lượt: **Khám ngoại trú** → **Mở lượt khám** |
| 5 | Menu **Hàng đợi** → **Thêm vào hàng đợi** | Quy trình: **Có điều dưỡng, trả sau**; Điểm phục vụ: **Điều dưỡng** → **Lưu thông tin** |

**Điểm nhấn với mentor**
- Bước 1: luôn **tìm trước khi đăng ký**. Nếu nhập trùng CCCD hoặc họ tên và ngày sinh, hệ thống hiện **"Hồ sơ tương tự đã có"** để chọn lại hồ sơ cũ, tránh tạo trùng.
- Bước 4: mỗi bệnh nhân **chỉ có một lượt đang mở**.
- *(Tùy chọn)* Menu **Thông tin hành chính** cho phép thêm người liên hệ khẩn cấp và địa chỉ theo danh mục 34 tỉnh/thành mới.

### Cảnh 2. Điều dưỡng: đo sinh hiệu (3 phút)

**Đăng nhập:** `dieuduong.hoa`.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Hàng đợi** → dòng *Trần Văn Demo* → **Chuyển trạng thái** | Trạng thái tiếp theo: **Đã gọi**, lưu; rồi làm lại với **Đang phục vụ** |
| 2 | Menu **Lượt khám** → dòng lượt của *Trần Văn Demo* → **Chọn** | Khung "Bệnh nhân đang chọn" báo đã chọn lượt khám |
| 3 | Menu **Sinh hiệu** → **Bắt đầu / tiếp tục đo sinh hiệu** | Mã lượt khám đã tự điền → **Lưu thông tin** |
| 4 | Form **Ghi lần đo sinh hiệu** | Mạch `82`, HA tâm thu `125`, HA tâm trương `80`, Nhiệt độ `37`, Nhịp thở `18`, SpO₂ `98`, Cân nặng `68`, Chiều cao `170` → **Lưu sinh hiệu** |
| 5 | Menu **Hàng đợi** → **Chuyển điểm phục vụ** | Điểm tiếp theo: **Bác sĩ** (chọn BS. Minh nếu có ô bác sĩ) → **Lưu thông tin** |

**Điểm nhấn:** số đo ngoài ngưỡng cho phép bị chặn ngay khi nhập. Nếu đo sai thì dùng **Đính chính** hoặc **Hủy lần đo** kèm lý do; bản gốc vẫn được giữ.

### Cảnh 3. Bác sĩ: khám và cho chỉ định siêu âm (5 phút)

**Đăng nhập:** `bs.minh`.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Hàng đợi** → dòng *Trần Văn Demo* → **Chuyển trạng thái** → **Đang phục vụ** | |
| 2 | Menu **Lượt khám** → dòng lượt → **Chọn** | |
| 3 | Menu **Sinh hiệu** → xem lần đo điều dưỡng vừa ghi | Chỉ đọc |
| 4 | Menu **Khám và điều trị** → **Bắt đầu / tiếp tục phiếu khám** → **Lưu thông tin** | Tạo phiếu khám của bác sĩ |
| 5 | **Lưu phiếu khám** | Lý do khám: *Đau thượng vị 3 ngày*; Bệnh sử: *Đau âm ỉ, tăng sau ăn, không sốt*; Tiền sử bản thân: **Không ghi nhận**; Tiền sử gia đình: **Không ghi nhận**; Trạng thái dị ứng: **Không ghi nhận dị ứng**; Khám bộ phận: *Ấn đau nhẹ thượng vị* |
| 6 | Menu **Chỉ định và kết quả** → **Tạo chỉ định CLS** | Dịch vụ: **Siêu âm ổ bụng (gan mật, tụy, lách, thận)**; Quy trình: **Có điều dưỡng, trả sau**; Thông tin lâm sàng: *Đau thượng vị* → **Lưu thông tin** |

**Điểm nhấn**
- Mã bác sĩ trên phiếu, chỉ định và đơn thuốc **tự điền theo tài khoản đang đăng nhập**. Bác sĩ không thể ký thay người khác.
- *(Tùy chọn, mục 5.1)* Khung **Trợ lý hồ sơ** bên cạnh trả lời câu hỏi về hồ sơ của chính bệnh nhân đang chọn.

### Cảnh 4. KTV CLS: làm siêu âm, trả kết quả (4 phút)

**Đăng nhập:** `ktv.tuan`.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Chỉ định và kết quả** → danh sách **Chỉ định CLS** (lọc **Đang xử lý**) | Thấy dòng *Siêu âm ổ bụng · Trần Văn Demo* |
| 2 | Dòng chỉ định → **Cập nhật trạng thái** | **Đã phân công**. Ô "Mã KTV" tự điền chính KTV đang đăng nhập → **Lưu thông tin** |
| 3 | Làm lại **Cập nhật trạng thái** | **Đang thực hiện** → lưu |
| 4 | **Ghi kết quả CLS** | Loại kết quả: **Chính thức**; Kết quả văn bản: *Gan, mật, tụy, lách, thận chưa ghi nhận bất thường*; Thời điểm ghi: hiện tại. Ô **Mã người duyệt**: mở mục "Đổi lựa chọn bằng mã" ở ô **Mã người nhập**, sao chép mã, dán sang ô người duyệt; Thời điểm duyệt: hiện tại → **Lưu thông tin** |
| 5 | **Cập nhật trạng thái** | **Hoàn tất** → lưu |

**Điểm nhấn**
- KTV **chỉ thấy chỉ định giao cho mình hoặc chưa ai nhận**.
- Kết quả có thể **đính kèm PDF/ảnh** (**Đính kèm báo cáo CLS**). Kết quả sai thì dùng **Đính chính** kèm lý do; bản cũ được giữ.

### Cảnh 5. Bác sĩ: đọc kết quả, chẩn đoán, kê đơn (4 phút)

Quay lại cửa sổ `bs.minh`.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Chỉ định và kết quả** → dòng siêu âm → **Xem** / **Xem kết quả** | Kết quả của KTV Tuấn |
| 2 | Menu **Khám và điều trị** → **Ghi chẩn đoán** | Chẩn đoán: **K29.7 · Viêm dạ dày, không xác định**; Loại: **Chính**; Mức chắc chắn: **Xác định** |
| 3 | **Xác nhận một dòng thuốc** | Thuốc: **Pantoloc 20mg**; Liều `1` **Viên**; Đường dùng **Uống**; Tần suất **Một lần/ngày**; Thời gian `14` **Ngày**; Số lượng `14` **Viên**; Hướng dẫn: *Uống trước ăn sáng 30 phút* |
| 4 | **Chốt phiếu khám** | Hệ thống kiểm tra đã có lý do khám, trạng thái dị ứng và **một chẩn đoán chính** |
| 5 | Menu **Hàng đợi** → **Chuyển điểm phục vụ** | **Thu ngân** |
| 6 | *(Tùy chọn)* Menu **Chứng từ** → **Xem đơn thuốc** → **In chứng từ** | Bản in đơn thuốc |

**Điểm nhấn:** **Chốt phiếu khám không kết thúc lượt khám**: bệnh nhân vẫn còn phải thanh toán và nhận thuốc. Đơn đã chốt được giữ nguyên bản; sửa sau đó phải đính chính kèm lý do.

### Cảnh 6. Thu ngân: lập phí và thu tiền (3 phút)

**Đăng nhập:** `thungan.mai`.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Lượt khám** → dòng lượt của *Trần Văn Demo* → **Chọn** | |
| 2 | Menu **Thu ngân** → **Lập phiếu phí** | Dịch vụ: **Khám ngoại trú kiểm thử**; Số lượng `1`; Giảm giá `0`; Thời điểm thu: **Trả sau** → **Lưu thông tin** |
| 3 | Lặp lại **Lập phiếu phí** | Dịch vụ: **Siêu âm ổ bụng…**; Số lượng `1`; Giảm giá `0`; **Trả sau** |
| 4 | Danh sách **Phiếu phí** → từng phiếu → **Chọn** → **Thu tiền** | Số tiền: đúng tổng của phiếu; Phương thức: **Tiền mặt** → **Xác nhận thu tiền** |
| 5 | Menu **Chứng từ** → **Xem phiếu thu** → **In chứng từ** | |

**Điểm nhấn**
- **Giá lấy từ bảng giá hiện hành**, thu ngân không sửa được giá.
- Thanh toán **chuyển khoản** ghi nhận trước, sau đó **Xác nhận chuyển khoản** khi tiền về.
- **Hoàn tiền** bắt buộc nhập lý do.

### Cảnh 7. Quầy thuốc: cấp thuốc (2 phút)

**Đăng nhập:** `duoc.nam`.

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Quầy thuốc** → danh sách **Đơn thuốc cần cấp** → dòng *Pantoloc 20mg · Trần Văn Demo* → **Chọn** | |
| 2 | **Ghi cấp thuốc** | Số lượng cấp `14`; Số lô `LOT-DEMO-01`; Hạn dùng: 1 năm sau → **Xác nhận cấp thuốc** |
| 3 | *(Tùy chọn)* Dòng đơn → **In đơn** | |

**Điểm nhấn:** hệ thống **chặn cấp vượt số lượng bác sĩ kê**, đơn đã ngừng, lượt đã hủy và lô hết hạn. *(Nói thẳng nếu được hỏi: chưa đối chiếu tồn kho, mới ghi nhận số lô/hạn dùng.)*

### Cảnh 8. Kết thúc lượt khám: bệnh nhân ra về (1 phút)

Quay lại cửa sổ `letan.lan`, hoặc `bs.minh` (bác sĩ cũng có quyền này).

| # | Thao tác | Nhập / chọn |
| --- | --- | --- |
| 1 | Menu **Lượt khám** → dòng lượt → **Chọn** | |
| 2 | **Kết thúc lượt khám** | Lý do kết thúc: **Kết thúc khám** → **Lưu thông tin** |

**Điểm nhấn:** hệ thống **từ chối kết thúc khi còn chỉ định CLS chưa xong hoặc phiếu phí chưa thu đủ**. Có thể cố ý thử kết thúc trước Cảnh 6 để mentor thấy quy tắc này. Phiếu hàng đợi còn mở được đóng tự động.

### Cảnh 9. Quản lý: xem báo cáo trong ngày (1 phút)

**Đăng nhập:** `quanly.thao` → menu **Báo cáo** → **Báo cáo ngày**, chọn hôm nay → **Xem thông tin**.

**Điểm nhấn:** quản lý thấy **số lượt mở / hoàn tất, tổng thu, hoàn, thu ròng**, nhưng **không thấy tên người bệnh hay bệnh án**.

### Cảnh 10. Quản trị: ai đã làm gì (1 phút)

**Đăng nhập:** tài khoản quản trị → **Quản trị** → tab **🕘 Lịch sử thay đổi** (các tài khoản đã tạo, đổi tên, cấp lại mật khẩu…). Có thể mở **Công cụ nâng cao → Nhật ký truy cập** để xem ai đã đọc hồ sơ bệnh nhân.

---

## 5. Phần tùy chọn (nếu còn thời gian)

### 5.1. Trợ lý hồ sơ cho bác sĩ

Cần bật thêm dịch vụ trợ lý: `npm run mvp:up` ở thư mục gốc repo, xem [AGENT_MVP_HANDOFF.md](AGENT_MVP_HANDOFF.md).

1. Trên mọi màn hình của bác sĩ có nút **🩺 Trợ lý bác sĩ** ở góc dưới bên phải. Bấm để mở khung chat; trên màn hình rộng, trang tự dồn sang trái để vừa xem hồ sơ vừa hỏi.
2. Nếu chưa đủ ngữ cảnh, khung chat chỉ ra bước còn thiếu kèm nút đi tới: *Mở danh sách lượt khám* hoặc *Bắt đầu phiếu khám*.
3. Sau Cảnh 3 bước 4 (đã có phiếu khám), bấm gợi ý **📋 Tóm tắt lần khám**, rồi gõ *"Sinh hiệu gần nhất?"* và nhấn Enter.
4. Bấm nhãn **📎 nguồn** dưới câu trả lời để mở đúng bản ghi trong hồ sơ, cho mentor thấy trợ lý **trả lời có trích dẫn** và không bịa.

Trợ lý chỉ đọc hồ sơ bác sĩ đang có quyền xem, không chẩn đoán hay kê đơn thay bác sĩ. Hội thoại được giữ khi chuyển giữa các màn hình và tự xóa khi đổi bệnh nhân.

### 5.2. Cổng bệnh nhân xem kết quả

Phần này cần chuẩn bị riêng, vì tài khoản bệnh nhân **chưa tạo được từ trang Quản trị mới**:

1. Tạo một người dùng OpenMRS gắn với đúng Person của bệnh nhân, bằng giao diện quản trị OpenMRS hoặc Core user API. Xem [api/patient-portal.md](api/patient-portal.md).
2. Quản trị → **Công cụ nâng cao** → **Liên kết tài khoản bệnh nhân**, rồi **Xác minh danh tính bệnh nhân**.
3. Bác sĩ → **Khám và điều trị** → **Công bố dữ liệu được chọn cho bệnh nhân** → chọn *Lời dặn, đơn thuốc và kết quả CLS đã duyệt*.
4. Mở `http://127.0.0.1:5173/portal.html`, đăng nhập bằng tài khoản bệnh nhân để xem lượt khám, đơn thuốc và kết quả đã công bố.

---

## 6. Xử lý sự cố khi demo

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Đăng nhập báo "Tài khoản chưa được phân công vai trò và cơ sở" | Tài khoản chưa có nơi làm việc | Quản trị → dòng nhân viên → **Phân công** |
| Bác sĩ/KTV lưu bị báo chưa liên kết hồ sơ người hành nghề | Tài khoản tạo trước khi có tính năng tạo hồ sơ chuyên môn tự động | Tạo lại tài khoản bằng **＋ Thêm nhân viên**, hoặc dùng **Công cụ nâng cao → Tạo người hành nghề và gán cơ sở** |
| Biểu mẫu báo "Chọn hồ sơ hợp lệ trong danh sách trước khi tiếp tục" | Chưa bấm **Chọn** ở bệnh nhân/lượt khám | Quay lại danh sách, bấm **Chọn** |
| Không mở được lượt khám mới | Bệnh nhân còn lượt đang mở | Dùng lượt đang mở, hoặc **Kết thúc lượt khám** cũ |
| KTV không thấy chỉ định | Chỉ định đã giao cho KTV khác, hoặc bộ lọc khác **Đang xử lý** | Đổi bộ lọc sang **Tất cả**; kiểm tra tên KTV trên dòng chỉ định |
| Ghi kết quả **Chính thức** bị từ chối | Thiếu mã hoặc thời điểm người duyệt | Điền đủ ô người duyệt (Cảnh 4 bước 4), hoặc ghi **Sơ bộ** rồi đính chính sau |
| **Chuyển điểm phục vụ** bị từ chối | Hàng đợi chưa ở trạng thái phù hợp | Chuyển trạng thái **Đang phục vụ** trước; hàng đợi chỉ để điều phối, không chặn việc khám |
| **Kết thúc lượt khám** bị từ chối | Còn chỉ định CLS chưa hoàn tất hoặc phí chưa thu đủ | Hoàn tất CLS (Cảnh 4) và thu đủ tiền (Cảnh 6) |
| Mọi thao tác báo lỗi dịch vụ / 502 | Backend chưa bật hoặc đang khởi động | `npm run backend:status`; chờ backend báo *healthy* (OpenMRS cần vài phút) |
| Lỡ tải lại trang và bị đăng xuất | Hệ thống không lưu đăng nhập vào trình duyệt (có chủ đích) | Đăng nhập lại, bấm **Chọn** lại bệnh nhân |

---

## 7. Sau buổi demo

- Khóa các tài khoản demo nếu không dùng nữa: Quản trị → dòng nhân viên → **Khóa** (có thể mở khóa lại sau).
- Dữ liệu bệnh nhân giả vẫn nằm trong DB local; không đưa DB này vào môi trường thật.
- Tắt hệ thống: `npm run backend:down` trong `infra/frontend` (dữ liệu được giữ trong volume Docker).

---

## 8. Checklist một trang (in ra cầm tay)

- [ ] Backend *healthy*, `npm run dev` đang chạy
- [ ] Đủ 7 tài khoản, tất cả **Đang hoạt động** tại *VinSHC Development Clinic*
- [ ] Đã chạy thử trọn một lượt khám trước buổi demo
- [ ] Mỗi vai trò một cửa sổ, đã đăng nhập sẵn
- [ ] Cảnh 1 Tiếp đón: tìm → đăng ký → mở lượt → hàng đợi *Điều dưỡng*
- [ ] Cảnh 2 Điều dưỡng: gọi → sinh hiệu → chuyển *Bác sĩ*
- [ ] Cảnh 3 Bác sĩ: phiếu khám → chỉ định *Siêu âm ổ bụng*
- [ ] Cảnh 4 KTV: phân công → thực hiện → kết quả chính thức → hoàn tất
- [ ] Cảnh 5 Bác sĩ: xem kết quả → K29.7 → Pantoloc 20mg → chốt phiếu → chuyển *Thu ngân*
- [ ] Cảnh 6 Thu ngân: 2 phiếu phí → thu tiền → in phiếu thu
- [ ] Cảnh 7 Quầy thuốc: cấp 14 viên, số lô, hạn dùng
- [ ] Cảnh 8 Kết thúc lượt khám
- [ ] Cảnh 9 Quản lý: báo cáo ngày
- [ ] Cảnh 10 Quản trị: lịch sử thay đổi
