# Visit và lịch sử

Visit của OpenMRS là lượt khám nghiệp vụ; không mặc định tương đương FHIR Encounter.

## Mở visit

`POST /openmrs/ws/rest/v1/visit` — runtime chấp nhận HTTP 200/201.

```json
{
  "patient": "<created-patient-uuid>",
  "visitType": "<loaded-visit-type-uuid>",
  "location": "<loaded-location-uuid>",
  "startDatetime": "2026-10-10T15:00:00.000+07:00"
}
```

Hậu điều kiện: response có visit UUID; đọc lại visit phải trỏ đúng patient và visit type. UUID patient lấy từ response tạo/fixture; visit type synthetic và location phải tồn tại trên instance test.

## Kết thúc visit

`POST /openmrs/ws/rest/v1/visit/{visitUuid}` — runtime trả HTTP 200.

```json
{ "stopDatetime": "2026-10-10T15:30:00.000+07:00" }
```

Hậu điều kiện: đọc lại chính UUID có `stopDatetime`, không tạo visit mới.

## Đọc lịch sử

- `GET /openmrs/ws/rest/v1/visit/{visitUuid}?v=full`
- `GET /openmrs/ws/rest/v1/visit?patient={patientUuid}&v=full`

Test xác nhận UUID visit vừa kết thúc xuất hiện trong `results` của đúng patient. `limit`/`startIndex`, lọc theo khoảng ngày, nhiều lượt đồng thời và quyền role thuộc B2/B3.

## Lỗi liên quan

UUID không tồn tại trả HTTP 404 với JSON `error.message`. Payload thiếu trường bắt buộc trả HTTP 400. Quyền tạo/sửa/kết thúc theo 8 role chưa được chốt; không dùng quyền admin của test làm contract production.
