# Luồng thực tế một lượt khám và ma trận quyền

Tài liệu này mô tả đúng những gì giao diện và backend hiện cho phép làm. Nội dung đối chiếu từ `infra/frontend/modules`, `infra/frontend/shell`, `permissions.json`, `OperationsService.java` và `CareService.java`. Phần nào khác với [DEMO_SCRIPT.md](DEMO_SCRIPT.md) được đánh dấu ⚠.

- **Quy trình:** *Có điều dưỡng, trả sau* (`STANDARD_POSTPAY`): Tiếp đón → Điều dưỡng → Bác sĩ → CLS → Thu ngân → Quầy thuốc.
- **Bệnh nhân mẫu:** Trần Văn Demo, đau thượng vị. Bác sĩ chỉ định siêu âm ổ bụng, chẩn đoán K29.7 và kê Pantoloc 20mg.

---

## 0. Quy tắc chung cần biết trước

1. **Nút trên dòng danh sách tự chọn hồ sơ.** Bấm bất kỳ nút nào trên một dòng (Ghi sinh hiệu, Khám, Thu tiền…) thì bệnh nhân và lượt khám của dòng đó được chọn luôn, không cần bấm **Chọn** trước.
2. **Ô "Mã … (UUID)" là ô nhập mã, không có danh sách để chọn.** Ô bắt buộc được tự điền khi đã chọn hồ sơ. Ô không bắt buộc (ví dụ "Mã bác sĩ") thì **để trống**.
3. **Hàng đợi chuyển từng bậc:**

   ```
   Đang chờ → Đã gọi → Đang phục vụ → (Chuyển điểm tiếp theo | Hoàn tất)
   ```

   Danh sách chọn hiện đủ mọi trạng thái, nhưng chọn nhảy bậc sẽ bị lỗi `invalid queue transition`. Nút **Chuyển điểm tiếp theo** chỉ hiện khi phiếu đang ở **Đang phục vụ**. Bấm nút này thì phiếu hiện tại được đóng (Hoàn tất) và một phiếu mới *Đang chờ* được tạo ở điểm sau.
4. **Hàng đợi không tự chạy.** Lưu sinh hiệu, chốt phiếu khám hay trả kết quả đều **không** tự chuyển bệnh nhân sang điểm tiếp theo. Người dùng phải tự chuyển.
5. **Không nhấn F5.** Tải lại trang là bị đăng xuất.

---

## 1. Luồng thực tế theo 7 vai trò

### 1.1. 🧾 Tiếp đón (`letan.lan`)

Màn hình mở đầu: **Bệnh nhân**.

| # | Màn hình | Thao tác |
|---|---|---|
| 1 | Bệnh nhân | Gõ `Demo` hoặc số CCCD vào ô tìm kiếm. Luôn tìm trước khi đăng ký |
| 2 | Bệnh nhân | Không có kết quả thì bấm **Đăng ký bệnh nhân mới** → điền thông tin → **Đăng ký bệnh nhân**. Nếu hiện bảng *Hồ sơ tương tự đã có* thì chọn hồ sơ cũ |
| 3 | Bệnh nhân | Dòng bệnh nhân → **Mở lượt khám** → Loại lượt: *Khám ngoại trú* → **Mở lượt khám** |
| 4 | Lượt khám | Dòng lượt → **Xếp hàng** → Quy trình: **Có điều dưỡng, trả sau**; Điểm phục vụ: **Điều dưỡng**; Mã bác sĩ: để trống → **Lưu thông tin** |

### 1.2. 🩺 Điều dưỡng (`dieuduong.hoa`)

Màn hình mở đầu: **Lượt khám**.

| # | Màn hình | Thao tác |
|---|---|---|
| 1 | Hàng đợi | Dòng *Số x · Điều dưỡng · Trần Văn Demo* → **Chuyển trạng thái** → **Đã gọi** → Lưu |
| 2 | Hàng đợi | Cùng dòng → **Chuyển trạng thái** → **Đang phục vụ** → Lưu |
| 3 | Lượt khám | Dòng *Trần Văn Demo* → nút **Ghi sinh hiệu** |
| 4 | Sinh hiệu | ⚠ **Cuộn xuống cuối trang** tới form *Bắt đầu / tiếp tục đo sinh hiệu* → **Lưu thông tin** |
| 5 | Sinh hiệu | Cuộn lên form **Ghi lần đo sinh hiệu**. Ô *Lần khám sinh hiệu* phải hiện "đã chọn". Nhập Mạch 82, HA 125/80, Nhiệt độ 37, Nhịp thở 18, SpO₂ 98, Cân nặng 68, Chiều cao 170 → **Lưu sinh hiệu** |
| 6 | Hàng đợi | Dòng của bệnh nhân → **Chuyển điểm tiếp theo** → Điểm tiếp theo: **Bác sĩ**; Mã bác sĩ: để trống → Lưu |

> ⚠ **Lỗi hay gặp:** điền form "Ghi lần đo" trước khi làm bước 4. Lúc đó ô *Lần khám sinh hiệu* đang "Chưa chọn", nên bấm **Lưu sinh hiệu** không có phản ứng gì. Hãy làm bước 4 trước.
>
> Nếu bước 4 báo `one active provider assigned at facility` thì tài khoản chưa có hồ sơ chuyên môn. Quản trị tạo lại tài khoản bằng **＋ Thêm nhân viên**.

### 1.3. 👨‍⚕️ Bác sĩ (`bs.minh`): khám lần 1

Màn hình mở đầu: **Lượt khám**.

| # | Màn hình | Thao tác |
|---|---|---|
| 1 | Hàng đợi | Dòng *Bác sĩ · Trần Văn Demo* → **Chuyển trạng thái** → **Đã gọi** → Lưu; làm lại với **Đang phục vụ**. ⚠ Không chuyển thẳng sang Đang phục vụ được |
| 2 | Lượt khám | Dòng bệnh nhân → nút **Khám** → form *Bắt đầu / tiếp tục phiếu khám* → **Lưu thông tin** |
| 3 | Sinh hiệu | Xem lần đo của điều dưỡng (chỉ đọc) |
| 4 | Khám và điều trị | **Lưu phiếu khám**: Lý do khám; Bệnh sử; Tiền sử bản thân và gia đình: *Không ghi nhận*; Dị ứng: *Không ghi nhận dị ứng*; Khám bộ phận |
| 5 | Chỉ định và kết quả | **Tạo chỉ định CLS** → Dịch vụ: *Siêu âm ổ bụng*; Quy trình: *Có điều dưỡng, trả sau*; Thông tin lâm sàng → Lưu |

### 1.4. 🧪 KTV CLS (`ktv.tuan`)

Màn hình mở đầu: **Chỉ định và kết quả**.

| # | Thao tác |
|---|---|
| 1 | Danh sách *Chỉ định CLS*, lọc **Đang xử lý** → dòng *Siêu âm ổ bụng · Trần Văn Demo* |
| 2 | **Cập nhật trạng thái** → **Đã phân công**. Mã KTV tự điền → Lưu |
| 3 | **Cập nhật trạng thái** → **Đang thực hiện** → Lưu |
| 4 | **Ghi kết quả** → Loại: **Chính thức**; Kết quả văn bản; Thời điểm ghi. Mã người duyệt: mở "Đổi lựa chọn bằng mã" ở ô *Mã người nhập*, sao chép mã sang ô người duyệt; Thời điểm duyệt → Lưu |
| 5 | **Cập nhật trạng thái** → **Hoàn tất** → Lưu. Chỉ hoàn tất được khi đã có kết quả chính thức |

KTV không có quyền xem Hàng đợi, nên không cần thao tác hàng đợi ở bước này.

### 1.5. 👨‍⚕️ Bác sĩ (`bs.minh`): khám lần 2

| # | Màn hình | Thao tác |
|---|---|---|
| 1 | Chỉ định và kết quả | Dòng siêu âm → **Xem** kết quả |
| 2 | Khám và điều trị | **Ghi chẩn đoán** → K29.7, loại *Chính*, mức chắc chắn *Xác định* |
| 3 | Khám và điều trị | **Xác nhận một dòng thuốc** → Pantoloc 20mg, 1 viên, uống, 1 lần/ngày, 14 ngày, số lượng 14 viên |
| 4 | Khám và điều trị | **Chốt phiếu khám**. Cần đủ lý do khám, trạng thái dị ứng và một chẩn đoán chính. Chốt phiếu **không** kết thúc lượt khám |
| 5 | Hàng đợi | *(Tùy chọn)* Dòng bệnh nhân → **Chuyển điểm tiếp theo** → **Thu ngân**. Thu ngân không xem được hàng đợi, nên phiếu này chỉ để minh họa và sẽ tự đóng khi kết thúc lượt |

### 1.6. 💳 Thu ngân (`thungan.mai`)

Màn hình mở đầu: **Thu ngân**.

| # | Thao tác |
|---|---|
| 1 | Menu **Lượt khám** → dòng *Trần Văn Demo* → **Chọn** |
| 2 | Menu **Thu ngân** → **Lập phiếu phí** → *Khám ngoại trú kiểm thử*, số lượng 1, giảm giá 0, **Trả sau** → Lưu |
| 3 | Lập thêm một phiếu phí cho *Siêu âm ổ bụng* |
| 4 | Danh sách *Phiếu phí* → từng dòng → **Thu tiền** → Số tiền bằng tổng phiếu; Phương thức: Tiền mặt → **Xác nhận thu tiền** |
| 5 | Dòng phiếu → **In phiếu thu** |

### 1.7. 💊 Quầy thuốc (`duoc.nam`)

Màn hình mở đầu: **Quầy thuốc**.

| # | Thao tác |
|---|---|
| 1 | Danh sách *Đơn thuốc cần cấp* → dòng *Pantoloc 20mg · Trần Văn Demo* → **Cấp thuốc** |
| 2 | Số lượng 14; Số lô `LOT-DEMO-01`; Hạn dùng 1 năm sau → **Xác nhận cấp thuốc** |
| 3 | *(Tùy chọn)* **In đơn** |

### Kết thúc lượt khám: Tiếp đón hoặc Bác sĩ

Menu **Lượt khám** → dòng lượt → **Kết thúc lượt** → Lý do: *Kết thúc khám* → Lưu.

Hệ thống từ chối nếu còn chỉ định CLS chưa hoàn tất hoặc phiếu phí chưa thu đủ. Các phiếu hàng đợi còn mở được đóng tự động.

### 📊 Quản lý (`quanly.thao`)

Menu **Báo cáo** → **Báo cáo ngày**, chọn hôm nay → **Xem thông tin**. Quản lý thấy số liệu tổng hợp, không thấy tên người bệnh.

---

## 2. Ma trận quyền

Nguồn: `infra/frontend/packages/core/metadata/permissions.json`. Backend cũng kiểm tra theo ma trận này, không chỉ ẩn nút.

Ký hiệu: R = đọc · C = tạo · U = cập nhật · X = hủy (cancel/void) · P = in · D = tải tệp · — = không có quyền.

| Tài nguyên | Tiếp đón | Điều dưỡng | Bác sĩ | KTV CLS | Thu ngân | Quầy thuốc | Quản lý | Quản trị |
|---|---|---|---|---|---|---|---|---|
| Hồ sơ hành chính (`patient_identity`) | R C U | R | R | R | R | R | — | — |
| Lượt khám (`visit`) | R C U X | R | R U | — | R | — | — | — |
| Lịch hẹn (`appointment`) | R C U X P | — | R C U X P | — | — | — | — | — |
| Hàng đợi (`queue`) | R C U X | R U | R U | — | — | — | — | — |
| Sinh hiệu (`vitals`) | — | R C U X | R | — | — | — | — | — |
| Bệnh án (`clinical_chart`) | — | R | R P D | — | — | — | — | — |
| Chẩn đoán (`diagnosis`) | — | — | R C U X | — | — | — | — | — |
| Dị ứng (`allergy`) | — | — | R C U X | — | — | — | — | — |
| Đơn thuốc (`prescription`) | — | — | R C U X P D | — | — | R P | — | — |
| Chỉ định CLS (`diagnostic_order`) | — | — | R C U X P D | R U | — | — | — | — |
| Kết quả CLS (`diagnostic_result`) | — | — | R U P D | R C U X P D | — | — | — | — |
| Phiếu phí (`billing`) | — | — | — | — | R C X P D | — | — | — |
| Thanh toán (`payment`) | — | — | — | — | R C P D | — | — | — |
| Cấp thuốc (`dispensing`) | — | — | — | — | — | R C P D | — | — |
| Báo cáo (`reports`) | — | — | — | — | — | — | R P D | R |
| Cấu hình, danh mục (`metadata_admin`) | — | — | — | — | — | — | — | R C U X |

### Hệ quả cần nhớ khi demo

- **Ai chuyển hàng đợi được:** Tiếp đón, Điều dưỡng, Bác sĩ. Thêm phiếu mới vào hàng đợi thì **chỉ Tiếp đón** làm được. KTV, Thu ngân và Quầy thuốc không xem được hàng đợi.
- **Ai kết thúc lượt khám được:** Tiếp đón (`visit: U X`) và Bác sĩ (`visit: U`).
- **Ghi sinh hiệu:** chỉ Điều dưỡng. Bác sĩ chỉ xem. Quy trình *gọn, trả trước* không có bước điều dưỡng và cần cấp quyền riêng cho bác sĩ.
- **Ghi lâm sàng cần hồ sơ người hành nghề** gắn với cơ sở: điều dưỡng (sinh hiệu), bác sĩ (phiếu khám, chỉ định, đơn), KTV (kết quả). Tài khoản tạo bằng **＋ Thêm nhân viên** đã có sẵn hồ sơ này.
- **KTV** chỉ thấy chỉ định giao cho mình hoặc chưa ai nhận.
- **Quản lý** chỉ xem báo cáo tổng hợp, không truy cập hồ sơ bệnh nhân.
