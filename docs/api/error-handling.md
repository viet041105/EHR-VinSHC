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

## FHIR2 trả 500 khi thiếu quyền (quyết định cho MVP)

FHIR2 4.2.0 từ chối đúng user thiếu privilege nhưng trả **HTTP 500** `OperationOutcome` thay vì 403 (khóa bằng `test_b2_patient.py::test_04`). Quyết định ngày 11/10/2026: **giữ nguyên hành vi upstream cho MVP**, không backport exception mapper và không đổi 500 → 403 ở gateway (gateway không phân biệt được 500 thật với 500 do thiếu quyền).

Client FHIR phải:

1. Coi response là lỗi quyền khi `status == 500`, `resourceType == "OperationOutcome"` và `issue[].diagnostics` chứa `Privileges required`.
2. Hiển thị như 403, **không retry** và không thử lại bằng tài khoản khác.
3. Coi mọi 500 khác là lỗi server thật.

Xem lại quyết định khi nâng FHIR2 lên bản trả 403; khi đó cập nhật test B2 và bỏ quy tắc 1.

## Endpoint VinSHC (`/ws/rest/v1/vinshc/...`)

Mọi endpoint của module VinSHC dùng chung một dạng lỗi `{"error": "<thông điệp>"}`:

| Status | Ý nghĩa | Hành vi client |
| --- | --- | --- |
| 400 | Payload sai contract hoặc vi phạm quy tắc nghiệp vụ (kể cả `ValidationException` của Core) | Hiển thị thông điệp cho người nhập; không retry. |
| 403 | Thiếu privilege `VinSHC: ...` tương ứng | Hiển thị không đủ quyền. |
| 503 | Metadata hoặc danh mục bắt buộc chưa cấu hình (ví dụ ICD-10, danh mục thuốc) | Báo quản trị; không cho nhập text tự do thay thế. |

Conflict 409, rate limit 429 và lỗi optimistic locking chưa có bằng chứng runtime trong B1; không giả định hành vi cho đến khi có test.
