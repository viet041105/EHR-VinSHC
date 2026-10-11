# Patient và identifier

Hợp đồng này đã được kiểm tra trên OpenMRS Core 2.8.8, REST 3.5.0, FHIR2 4.2.0 và IDGen 5.0.4 với PostgreSQL. UUID dùng từ `metadata/vinshc/frontend-map.json`; không hard-code UUID khác ở FE.

## Identifier chính thức

| Loại | UUID | Quy tắc runtime |
| --- | --- | --- |
| Mã hồ sơ nội bộ | `ca12ea64-d279-5cce-a2a9-e2c46446ac34` | Ứng dụng bắt buộc; unique theo location; server sinh `VSHC-########` |
| CCCD | `4e5406dc-8ff9-5486-98fa-5d95c6fe8233` | Tùy chọn; đúng 12 chữ số; không dùng để tự merge |
| BHXH | `d7902062-a695-5bf3-8764-acf7f43e3238` | Tùy chọn; 1–32 ký tự chữ/số/gạch nối |
| BHYT | `e2b901c3-d442-565b-bff5-841aff260d2d` | Tùy chọn; 1–32 ký tự chữ/số/gạch nối |

Location cấp mã hiện tại là `feae71be-957c-4f94-b100-d84bc6915574`. `Required=false` ở Core là chủ ý tương thích với dữ liệu/module upstream; API của ứng dụng vẫn phải lấy mã IDGen và gửi mã nội bộ khi tạo hồ sơ.

## Sinh mã nội bộ

`POST /openmrs/ws/rest/v1/idgen/identifiersource/3bfdfcf4-987a-521d-8e5d-7d60e782b6fa/identifier`

```json
{ "comment": "patient registration" }
```

Runtime trả HTTP 201:

```json
{ "identifier": "VSHC-00000001" }
```

Nguồn tuần tự và autogeneration option được Initializer nạp từ `infra/backend/configuration/idgen/` và `autogenerationoptions/`. Manual entry bị tắt, auto generation bật cho location phát triển. IDGen có thể tạo khoảng trống số khi request sinh mã thành công nhưng thao tác tạo patient sau đó thất bại; không được tái sử dụng mã đã cấp.

## Tạo bệnh nhân

`POST /openmrs/ws/rest/v1/patient` trả HTTP 201. Request tối thiểu của ứng dụng gồm tên, giới tính, ngày sinh theo mức dữ liệu hiện có, và mã nội bộ vừa được server sinh:

```json
{
  "person": {
    "names": [{ "givenName": "Bình", "middleName": "An", "familyName": "Nguyễn" }],
    "gender": "F",
    "birthdate": "1991-02-03"
  },
  "identifiers": [{
    "identifier": "VSHC-00000001",
    "identifierType": "ca12ea64-d279-5cce-a2a9-e2c46446ac34",
    "location": "feae71be-957c-4f94-b100-d84bc6915574",
    "preferred": true
  }]
}
```

CCCD/BHXH/BHYT được thêm vào cùng mảng `identifiers`; ba loại phụ không dùng `location`. Số điện thoại và nghề nghiệp Core dùng `person.attributes[]` với UUID trong frontend map. Dữ liệu B2 mở rộng (contacts, fieldStates, snapshot địa chỉ nguyên văn/cũ và DATA-08) dùng module/REST riêng trong [patient-administration.md](patient-administration.md); không tách một contact thành nhiều Person Attribute rời.

## Đọc, cập nhật, tìm kiếm và phân trang

- Đọc: `GET /openmrs/ws/rest/v1/patient/{uuid}?v=full`.
- Cập nhật trường Person: `POST /openmrs/ws/rest/v1/person/{patientUuid}`; B2 đã kiểm tra `birthdateEstimated`.
- Tìm theo mã nội bộ, CCCD hoặc tên: `GET /openmrs/ws/rest/v1/patient?q={url-encoded-query}&v=full`.
- Phân trang: thêm `limit` và `startIndex`.

B2 đã tạo hai patient cùng tên `Bình An Nguyễn`; tìm tên có dấu trả cả hai UUID riêng biệt và hai trang `limit=1` không trộn hồ sơ. Đây là danh sách nghi trùng để người dùng xử lý, không phải tín hiệu cho phép tự merge.

## FHIR R4

`GET /openmrs/ws/fhir2/R4/Patient/{patientUuid}` trả cùng `Patient.id`, tên và giá trị identifier. Initializer đã nạp bốn FHIR Patient Identifier System nên `identifier[].system` là namespace ổn định `urn:uuid:{identifierTypeUuid}`; `identifier[].type.coding[].code` vẫn là UUID identifier type. Location của mã nội bộ nằm trong extension của identifier. Person attributes được FHIR2 trả dưới extension `http://fhir.openmrs.org/ext/person-attribute`.

Contact, field-state và lịch sử address snapshot hiện đọc qua REST VinSHC. Việc chiếu đầy đủ các extension này vào FHIR Patient chưa được tuyên bố hoàn tất; không suy diễn dữ liệu bị thiếu từ việc extension chưa xuất hiện trong FHIR.

## Lỗi đã kiểm tra

- CCCD sai định dạng: REST HTTP 400 `Invalid Submission`.
- Mã nội bộ trùng tại cùng location: REST HTTP 400 với `already in use`; không tạo/merge patient.
- User đã đăng nhập nhưng không có `Get Patients`: REST HTTP 403.
- Cùng trường hợp qua FHIR2 4.2.0 bị từ chối nhưng module trả HTTP 500 `OperationOutcome` chứa `Privileges required: Get Patients`. Đây là lỗi ánh xạ status upstream, không được FE hiểu là lỗi server có thể retry.

Fixture và bằng chứng chạy nằm ở `.runtime/fixtures/b2-patients.json` và `.runtime/reports/b2-integration.json` (không commit dữ liệu runtime).
