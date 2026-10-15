# Thao tác demo trên giao diện có hướng dẫn

Đối chiếu với `docs/DEMO_SCRIPT.md` và `docs/DEMO_FLOW_THUC_TE.md` ở gốc dự án. Landing page giữ nguyên; các thay đổi áp dụng cho `connected.html`.

## Cách dùng chung

- Khung **Làm theo từng bước** chỉ đường cho vai trò đang đăng nhập. Số bước là thứ tự hướng dẫn, không phải xác nhận rằng người bệnh đã được chăm sóc xong.
- Bấm thao tác ngay trên dòng người bệnh, lượt khám hoặc phiếu. Hồ sơ được chọn cùng lúc; không cần sao chép UUID.
- Biểu mẫu đang làm nằm trước danh sách. Các mã nội bộ được thu vào **Hồ sơ và người thực hiện**; vẫn có thể mở để kiểm tra hoặc nhập mã khi hỗ trợ kỹ thuật.
- Sau khi máy chủ xác nhận đã lưu, biểu mẫu vừa xong được đóng và khung **Đã lưu thành công** đưa ra nút cho bước tiếp theo. Bấm nút chỉ mở công việc, không tự lưu hay chuyển trạng thái.
- Nếu lưu thất bại, biểu mẫu giữ thông tin đã nhập và đưa thông báo lỗi vào vùng nhìn thấy. Không tạo bản ghi thay thế hoặc tự thử lại thao tác ghi.

## Luồng chính

| Vai trò | Thao tác |
| --- | --- |
| Tiếp đón | Tìm bệnh nhân → đăng ký nếu chưa có → **Tiếp theo: mở lượt khám** → **Tiếp theo: xếp hàng**. Chọn quy trình phù hợp, điểm đầu là Điều dưỡng trong kịch bản chuẩn. |
| Điều dưỡng | Hàng đợi: **Gọi bệnh nhân** → xác nhận → **Bắt đầu phục vụ** → xác nhận. Trong Lượt khám, bấm **Ghi sinh hiệu** → **Bắt đầu lần đo**. Các ô số đo hiện ngay sau khi bắt đầu thành công. Lưu xong, dùng nút **Tiếp theo: chuyển sang bác sĩ**. |
| Bác sĩ | Lượt khám → **Khám** → **Bắt đầu khám**. Biểu mẫu ghi phiếu mở ngay. Lưu xong có nút chỉ định CLS hoặc ghi chẩn đoán. Đọc kết quả từ dòng chỉ định. Tìm chẩn đoán theo mã/tên, kê từng thuốc theo ba nhóm thông tin, kiểm tra và chốt phiếu. |
| KTV CLS | **Nhận chỉ định** → xác nhận; **Bắt đầu thực hiện** → xác nhận; **Ghi kết quả**. Nếu có trách nhiệm duyệt, chủ động đánh dấu **Tôi là người duyệt kết quả này** để điền người duyệt và thời điểm. Sau khi lưu kết quả chính thức, dòng chỉ định có nút **Hoàn tất chỉ định**. |
| Thu ngân | Lượt khám → **Lập phiếu phí**. Sau khi lập, bấm **Thu tiền phiếu vừa lập**; số còn phải thu lấy từ phản hồi máy chủ. Chọn phương thức và xác nhận. Thu tiền mặt thành công có nút **In phiếu thu vừa lập**. Chuyển khoản có bước xác nhận khi tiền đã về. |
| Quầy thuốc | Dòng đơn → **Cấp thuốc**; kiểm tra số lượng còn phải cấp đã điền sẵn, ghi số lô/hạn dùng và xác nhận. Đối chiếu thuốc tại quầy vì hệ thống chưa kiểm tra tồn kho. |
| Tiếp đón / Bác sĩ | Sau khi hoàn tất dịch vụ và thanh toán, kết thúc lượt từ dòng lượt khám. Máy chủ vẫn kiểm tra điều kiện kết thúc. |
| Quản lý | **Báo cáo ngày** hoặc **Báo cáo nhiều ngày**. Chỉ hiển thị số liệu tổng hợp. |
| Quản trị | Dùng các tab Nhân viên, Cơ sở và Lịch sử thay đổi trong màn hình quản trị hiện có. |

Không tự chọn chẩn đoán, thuốc, liều, tình trạng tiền sử hoặc dị ứng. Giao diện hỗ trợ thao tác; thông tin chuyên môn vẫn phải do người phụ trách nhập và kiểm tra.

## Kiểm thử

Từ `infra/frontend`, khi FE đang chạy:

```bash
QA_BASE_URL=http://127.0.0.1:5173 npm run test:demo
```

Bài kiểm thử chạy luồng đăng ký → lượt khám → hàng đợi → sinh hiệu → phiếu khám → CLS → chẩn đoán → thuốc → hai phiếu thu → cấp thuốc → kết thúc lượt → báo cáo, ở màn hình 1440px và 390px. Mọi request được chặn bằng API giả lập có trạng thái; không kết nối hay ghi dữ liệu vào DB thật. Đây là kiểm chứng giao diện và payload, không thay thế kiểm thử tích hợp với backend đang chạy.
