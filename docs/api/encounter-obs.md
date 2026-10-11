# Encounter và observation sinh hiệu

Hợp đồng này đã được kiểm tra ở B3 trên OpenMRS Core 2.8.8/REST 3.5.0/FHIR2 4.2.0 với UUID từ `metadata/vinshc/frontend-map.json`. Chỉ dùng request ghi trên local/CI có dữ liệu giả.

## Tạo encounter sinh hiệu

`POST /openmrs/ws/rest/v1/encounter` — HTTP 200/201.

```json
{
  "patient": "<patient-uuid>",
  "visit": "<visit-uuid>",
  "encounterType": "8368ff74-1b50-592b-8e78-2f0f2ddc1e06",
  "location": "feae71be-957c-4f94-b100-d84bc6915574",
  "encounterDatetime": "<ISO-8601-with-offset>",
  "encounterProviders": [{
    "provider": "<provider-uuid>",
    "encounterRole": "3d09e225-5185-5db6-a9cc-89a6962dc014"
  }]
}
```

Đọc lại bằng `GET /openmrs/ws/rest/v1/encounter/{uuid}?v=full`. Core trả HTTP 400 và mã `Encounter.visit.patients.dontMatch` nếu patient của encounter khác patient của visit. Provider B3 là dữ liệu synthetic; metadata nhân sự và quyền điều dưỡng production thuộc B5.

## Ghi một lần đo sinh hiệu

Một lần đo là một parent Obs concept `group.vitals` (`7a7cebb3-1a82-5aab-975e-58d93c68eafc`). Mỗi giá trị numeric đi cùng companion coded Obs trạng thái `recorded`; parent và mọi child dùng cùng `obsDatetime`. Lần đo sau phải tạo parent group mới.

```json
{
  "person": "<patient-uuid>",
  "encounter": "<encounter-uuid>",
  "concept": "7a7cebb3-1a82-5aab-975e-58d93c68eafc",
  "location": "feae71be-957c-4f94-b100-d84bc6915574",
  "obsDatetime": "2026-10-11T13:00:00+07:00",
  "groupMembers": [
    {
      "person": "<patient-uuid>",
      "obsDatetime": "2026-10-11T13:00:00+07:00",
      "concept": "263e4d0b-61d2-5517-bcb1-992cfb60675b",
      "value": 80
    },
    {
      "person": "<patient-uuid>",
      "obsDatetime": "2026-10-11T13:00:00+07:00",
      "concept": "1452453f-cf72-5b97-b366-7541414f42c9",
      "value": "87756945-c977-581e-ac81-61886e594ff0"
    }
  ]
}
```

REST yêu cầu `person` và `obsDatetime` trên từng phần tử `groupMembers`; chỉ đặt hai trường ở parent sẽ trả HTTP 400. Trong response, child nối với parent qua `obsGroup`, còn `encounter` của child là `null`; encounter nằm trên parent group.

Các concept numeric và unit đã thử:

| Trường | Concept UUID | UCUM |
| --- | --- | --- |
| Mạch | `263e4d0b-61d2-5517-bcb1-992cfb60675b` | `/min` |
| Huyết áp tâm thu | `f8da18ad-2e26-55cd-954b-51d6e0738815` | `mm[Hg]` |
| Huyết áp tâm trương | `f97478e4-cce6-5cc5-89fa-cfd10bfe8794` | `mm[Hg]` |
| Nhiệt độ | `55a6de05-e371-5a48-9440-a81d7ef2e364` | `Cel` |
| Nhịp thở | `b82f1a4a-bbc9-55f0-8204-079bf1130457` | `/min` |
| SpO2 | `4ebf4ddf-fcbe-5bed-893b-114d6ec5f739` | `%` |
| Cân nặng | `88853161-b7db-5a20-b5c5-666b69999a25` | `kg` |
| Chiều cao | `e13865bd-3100-5aca-8e82-e8a6fb58321d` | `cm` |

FE nên lấy toàn bộ UUID, gồm companion status, từ `frontend-map.json`, không sao chép riêng bảng này thành nguồn cấu hình thứ hai.

## Dữ liệu thiếu, validation và chỉnh sửa

- Khi không biết một chỉ số, chỉ ghi companion status với answer `data_status.unknown`; không tạo numeric Obs. Thiếu cả value và status có nghĩa là chưa ghi, không tự đổi thành `unknown`.
- Core từ chối chuỗi không phải số bằng HTTP 400, nhưng vẫn nhận SpO2 101 và số âm. Vì vậy write adapter VinSHC phải thực thi `R_NUM`, `R_POS`, `R_PERCENT` và `R_BP` từ `metadata/vinshc/fields.csv`; FE validation không thay cho backend validation.
- `POST /obs/{uuid}` để sửa value tạo một Obs thay thế có UUID mới và void phiên bản cũ. Không sửa tại chỗ hoặc ghi đè lịch sử.
- `DELETE /obs/{uuid}?reason=...` trả HTTP 204 và void bản ghi. Không hard-delete dữ liệu lâm sàng.
- Metadata chưa định nghĩa ngưỡng bình thường/cảnh báo lâm sàng; backend không được tự suy diễn từ khoảng toán học.

## FHIR R4 đã quan sát

- `GET /openmrs/ws/fhir2/R4/Encounter/{encounterUuid}` trả đúng subject patient của OpenMRS Encounter. OpenMRS Visit không tự trở thành resource này.
- Parent `Observation/{groupUuid}` có `encounter` và danh sách `hasMember` trỏ tới các child.
- Numeric child có `valueQuantity.value`, `unit`, `system=http://unitsofmeasure.org` và UCUM `code`, nhưng không có `encounter` trực tiếp; client phải đi qua parent group.
- Coded status child có `valueCodeableConcept` với UUID answer.
- Chưa có mapping LOINC đã nạp nên `Observation.code` hiện là UUID concept OpenMRS. Huyết áp chưa được xuất thành panel/components chuẩn. Đây là khoảng trống B3/B7, không được FE giả định đã tương thích đầy đủ FHIR Vital Signs.

Bộ kiểm thử và bằng chứng: `tests/integration/test_b3_vitals.py`, `.runtime/reports/b3-integration.json`.
