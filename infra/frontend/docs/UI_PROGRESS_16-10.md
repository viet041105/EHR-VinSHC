# Tiến độ UI ngày 16/10/2026

## Khi tiếp nhận từ AI trước

Đã có bản đầu màn hình bác sĩ: danh sách lượt bên trái, các tab hồ sơ bên phải, chọn bằng tên; bác sĩ/quản lý/quản trị vào trang chính sau đăng nhập. Chưa tìm thấy bàn giao kiểm chứng cho bản này. Các thay đổi còn trong working tree, merge main chưa commit.

Chưa đạt: ghi khám đi sang trang generic cũ, sinh hiệu dựng từ object chưa đúng, lấy consultation đầu tiên thay vì đối chiếu provider; các role khác vẫn có hướng dẫn/dropdown/nhập mã.

## Đã tiếp tục triển khai

- Hoàn thiện danh sách/hồ sơ bác sĩ; đọc đúng phiếu của provider hiện tại, hiển thị cấu trúc diagnosis/drug/vitals thực tế.
- Form ghi khám/chẩn đoán/thuốc/chốt nằm trong hồ sơ. Thêm đọc kết quả CLS, phân trang chỉ định/lịch sử và lỗi riêng từng nguồn.
- Bỏ hướng dẫn lặp và chọn mã khỏi luồng thường dùng của 8 role; dropdown công việc chuyển thành các nút có tên. Tất cả role có trang mặc định, quản lý tự tải báo cáo hôm nay.
- Bấm tên mở thao tác chính, chỉ ghi khi gửi form. Nút Gọi/Nhận chỉ định có trạng thái cụ thể, không yêu cầu chọn lại trạng thái.
- Bản nháp tách theo hồ sơ/hành động/bước; sửa lỗi bản nháp trạng thái trước ghi đè bước mới; đóng form sau lưu thành công.
- Cập nhật test cũ theo điều hướng mới và bổ sung bộ kiểm chứng role/doctor riêng.

## Chưa được coi là hoàn tất

- API danh sách phân trang theo quan hệ bác sĩ–bệnh nhân đầy đủ còn thiếu. UI hiện ghi đúng phạm vi cơ sở; không coi việc chọn đúng encounter là đã có tất cả bệnh nhân của tôi.
- Gộp tiếp nhận/mở lượt/xếp hàng thành transaction server, danh sách provider đầy đủ theo cơ sở và thay hợp đồng backend không nằm trong thay đổi FE này.
- Chưa kiểm chứng mọi thao tác ghi với DB thật. Test ghi dùng mock; không thêm dữ liệu demo vào DB local.
- Merge và thay đổi có trước được giữ nguyên, chưa commit/push; không chỉnh backend, metadata hoặc root.

Đọc [WORKSPACE_UI.md](WORKSPACE_UI.md) để biết hành vi và lệnh test. Tiếp tục đối chiếu [plan](../plann%2015-10.md); đổi điều hướng chưa đồng nghĩa đã hoàn tất mọi yêu cầu chi tiết trong plan.

## Kết quả kiểm tra trong lượt này

- Unit test: 39/39; build thành công; kiểm tra ánh xạ FE phủ 127 route VinSHC có ghi rõ các ngoại lệ.
- Bộ `test:browser` đã qua: landing, client/quyền, quản trị, danh sách/biểu mẫu, module lỗi, UI 8 role, trợ lý bác sĩ, demo trọn lượt và màn hình theo role. Luồng ghi dùng mock.
- Bộ `test:pages` đã qua: 46 trang/148 form được cấp quyền trên mỗi kích thước 1440 và 390 px; hành chính/lịch hẹn và portal cùng qua trên hai kích thước này.
- `test:agent-browser` qua desktop/mobile: nguồn đọc, response chậm, bản nháp, stop/retry, đổi ngữ cảnh, phiên và nội dung tài liệu.
- Kiểm tra riêng màn hình bác sĩ qua desktop/mobile: provider khác user, không chọn phiếu người khác, nhiều lần đo, giữ bản nháp theo người bệnh, đổi người bệnh khi request cũ còn chạy, mở bản in từ thuốc và xóa UI ngay khi backend trả 401. Sau bổ sung menu thao tác lượt khám, đã chạy lại test role, unit và build.
- `test:live` qua backend/PostgreSQL thật: admin login, workspace, danh mục, tìm nhân viên, audit và báo cáo. Chỉ đọc, không tạo dữ liệu.
- Landing và index merge main được đối chiếu giữ nguyên; không có chỉnh sửa mã ngoài FE và không commit/push.

Ảnh mock UI được ghi vào thư mục tạm của máy: `vinshc-role-home-<role>-<1440|390>.png` và `vinshc-pages-<role>-<1440|390>.png`. Ảnh dùng dữ liệu kiểm thử, không phải hồ sơ thật trong DB local.
