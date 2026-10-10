# Encounter và observation

Các thao tác dưới đây đã chạy trong `scripts/smoke.py` bằng metadata synthetic.

## Tạo encounter

`POST /openmrs/ws/rest/v1/encounter` — HTTP 200/201.

```json
{
  "patient": "<patient-uuid>",
  "encounterType": "<loaded-encounter-type-uuid>",
  "location": "<loaded-location-uuid>",
  "visit": "<visit-uuid>",
  "encounterDatetime": "<ISO-8601-with-offset>"
}
```

Đọc lại: `GET /openmrs/ws/rest/v1/encounter/{uuid}?v=full`. Hậu điều kiện: patient và visit UUID phải khớp request.

## Tạo observation

`POST /openmrs/ws/rest/v1/obs` — HTTP 200/201.

```json
{
  "person": "<patient-uuid>",
  "encounter": "<encounter-uuid>",
  "concept": "<loaded-concept-uuid>",
  "location": "<loaded-location-uuid>",
  "obsDatetime": "<ISO-8601-with-offset>",
  "value": 36.7
}
```

Đọc lại: `GET /openmrs/ws/rest/v1/obs/{uuid}?v=full`. Smoke kiểm tra patient, encounter, concept, numeric value, thời gian; đồng thời thử observation text tiếng Việt dài.

FHIR read đã kiểm tra tại `Encounter/{uuid}` và `Observation/{uuid}` trên cùng UUID. Chưa kiểm tra update/void, pagination, quyền role, bộ concept sinh hiệu chính thức hoặc validation khoảng giá trị; các phần đó thuộc B3.
