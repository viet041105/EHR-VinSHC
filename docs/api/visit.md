# Visit và lịch sử

OpenMRS Visit là lượt khám nghiệp vụ gom nhiều encounter; nó không mặc định tương đương một FHIR Encounter. B3 dùng visit type ngoại trú `20a5a7e6-76e0-584c-9b28-e1f637660fee` và location development `feae71be-957c-4f94-b100-d84bc6915574` từ metadata chính thức.

## Mở visit

`POST /openmrs/ws/rest/v1/visit` — HTTP 200/201.

```json
{
  "patient": "<patient-uuid>",
  "visitType": "20a5a7e6-76e0-584c-9b28-e1f637660fee",
  "location": "feae71be-957c-4f94-b100-d84bc6915574",
  "startDatetime": "2026-10-11T13:00:00+07:00"
}
```

Đọc lại `GET /openmrs/ws/rest/v1/visit/{uuid}?v=full` phải trả đúng patient, visit type, location và start time. Encounter tạo trong visit phải dùng cùng patient; Core từ chối liên kết chéo bằng HTTP 400 `Encounter.visit.patients.dontMatch`.

## Kết thúc visit

`POST /openmrs/ws/rest/v1/visit/{visitUuid}` — HTTP 200.

```json
{ "stopDatetime": "2026-10-11T13:30:00+07:00" }
```

Đọc lại cùng UUID phải có `stopDatetime`; thao tác không tạo visit mới. Lý do/ghi chú kết thúc đã có metadata nhưng workflow ghi các visit attribute này chưa nằm trong fixture B3.

## Đọc lịch sử

- `GET /openmrs/ws/rest/v1/visit/{visitUuid}?v=full`
- `GET /openmrs/ws/rest/v1/visit?patient={patientUuid}&v=full`

B3 xác nhận visit đã kết thúc chỉ xuất hiện trong lịch sử đúng patient, cùng encounter và hai nhóm đo sinh hiệu vẫn đọc lại được. UUID không tồn tại trả 404; payload thiếu trường bắt buộc trả 400. Phân trang nhiều lượt, nhiều visit đồng thời và quyền theo 8 role vẫn cần kiểm tra ở B5/B9.

FHIR2 4.2.0 chiếu cả OpenMRS Visit và OpenMRS Encounter thành tài nguyên FHIR `Encounter`, nhưng vẫn giữ hai lifecycle riêng: Visit có `meta.tag.code=visit`; encounter lâm sàng có `meta.tag.code=encounter` và `partOf` trỏ tới Visit. B7 đã đọc lại thành công bằng cả hai UUID; ứng dụng phải kiểm tra tag/quan hệ thay vì coi hai loại là một bản ghi.

Bộ kiểm thử và bằng chứng: `tests/integration/test_b3_vitals.py`, `.runtime/reports/b3-integration.json`.
