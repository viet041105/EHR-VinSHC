# Xử lý lỗi API

Các status dưới đây được kiểm tra trên runtime B1 ngày 10/10/2026:

| Status | Ca đã thử | Hành vi client |
| --- | --- | --- |
| 400 | `POST /patient` với `{}` | Hiển thị lỗi validation phù hợp; không retry tự động. |
| 401 | Tìm patient không gửi credential | Chuyển về luồng đăng nhập; không coi HTML/login redirect là JSON thành công. |
| 403 | User xác thực nhưng không có privilege đọc patient | Hiển thị không đủ quyền; không biến thành 404 hoặc tự thử bằng admin. |
| 404 | Đọc patient bằng UUID ngẫu nhiên không tồn tại | Hiển thị không tìm thấy/đã thay đổi; không tự tạo bản ghi thay thế. |

REST error có dạng rút gọn:

```json
{
  "error": {
    "message": "<runtime message>",
    "code": "<server component>"
  }
}
```

Không hiển thị `detail` stack trace cho người dùng cuối và không ghi credential vào log. Client dùng chung chỉ chấp nhận origin loopback HTTP, tắt proxy/redirect và yêu cầu content type JSON. Timeout/kết nối lỗi được báo kèm method/path nhưng không kèm Authorization header hay password.

Conflict 409, rate limit 429 và lỗi optimistic locking chưa có bằng chứng runtime trong B1; không giả định hành vi cho đến khi có test.
