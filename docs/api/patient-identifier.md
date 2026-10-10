# Patient và identifier

## Tạo bệnh nhân synthetic

`POST /openmrs/ws/rest/v1/patient` — runtime chấp nhận HTTP 200/201 và trả patient có `uuid`.

```json
{
  "person": {
    "names": [{ "givenName": "Synthetic", "familyName": "VinSHC B1" }],
    "gender": "F",
    "birthdate": "2001-02-03"
  },
  "identifiers": [{
    "identifier": "VSHC-B1-<random>",
    "identifierType": "<loaded-identifier-type-uuid>",
    "location": "<loaded-location-uuid>",
    "preferred": true
  }]
}
```

Nguồn UUID: identifier type synthetic thực sự tồn tại trên instance test; location từ Initializer/baseline. Mã dùng UUID ngẫu nhiên để không trùng giữa các lần chạy. Quyền tối thiểu chưa được chốt theo role; user không có quyền xem patient đã nhận HTTP 403 trong test B1.

Hậu điều kiện được kiểm tra qua API:

- response có patient UUID;
- đọc đúng UUID trả về;
- identifier vừa tạo còn tồn tại;
- tìm đúng một patient theo chính identifier;
- FHIR Patient đọc cùng UUID/identifier trong smoke fixture.

## Đọc và tìm

- `GET /openmrs/ws/rest/v1/patient/{uuid}?v=full`
- `GET /openmrs/ws/rest/v1/patient?q={identifier}&v=full`

Response tìm kiếm:

```json
{
  "results": [{ "uuid": "<created-patient-uuid>", "identifiers": [] }],
  "links": []
}
```

`q` là tìm kiếm runtime tổng quát; hợp đồng chính xác cho CCCD/BHXH và tìm tên tiếng Việt thuộc B2. Phân trang REST dùng `limit`/`startIndex`, chưa nghiệm thu tải lớn trong B1.

## Giới hạn B1

Chưa chốt identifier type nội bộ/CCCD/BHXH chính thức, quy tắc unique, idgen, cập nhật hồ sơ, phát hiện nghi trùng hoặc test tên có dấu. Các nội dung này thuộc B2 và không được suy ra từ fixture synthetic.
