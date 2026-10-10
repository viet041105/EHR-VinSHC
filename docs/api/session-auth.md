# Session và xác thực

## Đọc session

`GET /openmrs/ws/rest/v1/session`

- Thành công: HTTP 200, `authenticated=true`, có `user.uuid`.
- Sai credential hoặc không gửi credential khi truy cập dữ liệu được bảo vệ: runtime trả HTTP 401; client cũng chấp nhận 403 ở ranh giới có thể thay đổi theo filter/module.
- Quyền: endpoint session dùng để xác nhận danh tính; quyền thao tác dữ liệu vẫn do privilege của user quyết định.

Response rút gọn đã ẩn danh:

```json
{
  "authenticated": true,
  "user": { "uuid": "<server-user-uuid>", "display": "<user>" },
  "sessionLocation": { "uuid": "<location-uuid>" }
}
```

## Chọn location cho session

`POST /openmrs/ws/rest/v1/session`

```json
{ "sessionLocation": "<initializer-location-uuid>" }
```

Runtime trả HTTP 200. Hậu điều kiện: `sessionLocation.uuid` trong response bằng UUID gửi lên. UUID local hiện lấy từ `config/baseline.json`; production phải lấy location đã nạp từ metadata cơ sở.

Test: `scripts/smoke.py` kiểm tra đăng nhập, mật khẩu sai và chọn location; `tests/integration/test_b1_contract.py` kiểm tra session xác thực.
