# Giao diện nhân viên — cập nhật 16/10/2026

Áp dụng cho `connected.html`. Landing giữ nguyên; portal giữ giao diện riêng. Plan đầy đủ: [plann 15-10.md](../plann%2015-10.md).

## Trang mặc định và công việc

| Vai trò | Trang sau đăng nhập | Công việc |
| --- | --- | --- |
| Tiếp đón | Bệnh nhân | Tìm theo tên, tiếp nhận/mở lượt và xếp hàng từ hồ sơ đã chọn. |
| Điều dưỡng | Lượt khám | Mở lần đo đúng lượt, nhập sinh hiệu, chuyển điểm phục vụ. |
| Bác sĩ | Lượt khám | Danh sách bên trái, hồ sơ bên phải; tab phiếu khám, sinh hiệu, CLS, chẩn đoán/thuốc, lịch sử. |
| KTV CLS | Chỉ định và kết quả | Nhận việc, thực hiện, ghi/duyệt kết quả và hoàn tất theo trạng thái. |
| Thu ngân | Thu ngân | Thu từ phiếu phí, xác nhận chuyển khoản, in chứng từ từ giao dịch. |
| Quầy thuốc | Quầy thuốc | Chọn người bệnh/dòng thuốc để cấp và xem lịch sử. |
| Quản lý | Báo cáo | Tự tải báo cáo hôm nay; chọn ngày/khoảng ngày. |
| Quản trị | Nhân viên | Quản lý nhân viên, cơ sở, lịch sử; công cụ cấu hình riêng. |

Đã bỏ khối hướng dẫn lặp, form “Chọn hồ sơ bằng mã” và dropdown “Tất cả thao tác”. Nghiệp vụ phụ vẫn có trong “Thao tác khác” theo quyền. Bấm tên/dòng hoặc nút hành động mở đúng form, không tự ghi dữ liệu.

## Hồ sơ bác sĩ

- Danh sách tự tải, có lọc ngày/trạng thái và tải thêm. Chọn tên để đọc chi tiết lượt, sinh hiệu, chỉ định, lịch sử và phiếu khám.
- Chọn encounter theo liên kết provider của bác sĩ hiện tại; không dùng UUID user thay provider, không lấy encounter sinh hiệu hay phiếu của bác sĩ khác.
- Form ghi khám, chẩn đoán, thuốc và chốt nằm trong hồ sơ. Đổi tab không phải chọn lại bệnh nhân.
- Sinh hiệu dùng nhãn/đơn vị từ danh mục, giữ riêng từng lần đo. Bấm kết quả CLS để đọc nội dung từ endpoint kết quả.
- Bản nháp trong bộ nhớ tách theo phiên/người bệnh/lượt/hành động/bản ghi/bước trạng thái. Lưu thành công đóng form; đổi tab giữ bản nháp; đăng xuất xóa phiên.
- Phản hồi chậm không được chèn vào hồ sơ hoặc phiên khác. Lỗi từng nguồn hiển thị riêng, không làm mất nội dung đã tải được.

## Phạm vi dữ liệu

UUID được gửi nội bộ từ bản ghi đã chọn, không có ô gõ UUID trong form thường dùng. Lựa chọn khác được chọn theo tên từ nguồn đã tải hợp lệ. Chưa có nguồn thì hiển thị phần thiếu, không dựng dữ liệu hoặc yêu cầu chép mã.

Backend vẫn kiểm tra role, cơ sở, liên kết và trạng thái. Quản trị ứng dụng không đồng nghĩa có quyền System Developer. Quản lý không được đọc bệnh án cá nhân.

`/visits` hiện lọc theo cơ sở, chưa có tham số bác sĩ. UI ghi “Lượt khám tại cơ sở”, không gọi toàn bộ đó là “Bệnh nhân của tôi”. Danh sách phân công/lịch sử bệnh nhân đầy đủ theo bác sĩ còn cần API và quyền server tương ứng. Chọn đúng encounter chưa có nghĩa yêu cầu danh sách này đã hoàn tất.

Không dùng một trang lịch hẹn làm danh sách tất cả bác sĩ. Quầy thuốc chưa đối chiếu tồn kho. Chuỗi nhiều API có thể thành công một phần; FE không tự tạo transaction/rollback giả.

## Kiểm tra

```bash
npm test
npm run test:api
npm run build
npm run test:roles
npm run test:pages
npm run test:browser
npm run test:agent-browser
```

Các test trình duyệt thông thường dùng API mock, không ghi DB thật. `test:roles` kiểm tra 8 trang mặc định, bác sĩ desktop/mobile, provider, bản nháp, response chậm và không ghi khi điều hướng. `test:pages` duyệt trang/form theo quyền, hành chính/lịch hẹn và portal.

`npm run test:live` đọc backend thật: đăng nhập admin, workspace, danh mục, tìm nhân viên, audit và báo cáo. Không tạo tài khoản, bệnh nhân hay giao dịch. Các script live khác có thể cần fixture riêng; không tự chạy tạo dữ liệu vào DB đang dùng.
