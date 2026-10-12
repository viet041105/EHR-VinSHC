# Medication và order

FHIR runtime ngày 10/10/2026 chỉ công bố `read`, `search-type`, `patch` cho `MedicationRequest` và không công bố `create`/`update`. `ServiceRequest` chỉ có `read` và `search-type`. Vì vậy **kê đơn đi qua REST của module `vinshc`**; FHIR chỉ dùng để đọc lại.

Module `vinshc` 0.3.0 tạo `DrugOrder` native với kiểm tra dữ liệu. Test tích hợp đã chạy với `Drug`, đơn vị, đường dùng và tần suất từ catalogue test metadata 0.3.0; catalogue này giữ `productionEnabled=false`. Thiếu cấu hình thì endpoint trả 503. Điều kiện catalogue production: xem [B4_CATALOGUE_HANDOFF.md](../data/B4_CATALOGUE_HANDOFF.md).

## Kê một dòng thuốc

`POST /openmrs/ws/rest/v1/vinshc/drug-order`, privilege `VinSHC: Prescribe medication`.

```json
{
  "patient": "patient-uuid",
  "encounter": "consultation-encounter-uuid",
  "orderer": "provider-uuid",
  "drug": "drug-uuid",
  "dose": 1,
  "doseUnits": "tablet-concept-uuid",
  "route": "oral-concept-uuid",
  "frequency": "order-frequency-uuid",
  "duration": 5,
  "durationUnits": "day-concept-uuid",
  "quantity": 10,
  "quantityUnits": "tablet-concept-uuid",
  "numRefills": 0,
  "asNeeded": false,
  "dosingInstructions": "Uống sau ăn"
}
```

| Trường | Quy tắc |
| --- | --- |
| `encounter` | Encounter khám của đúng người bệnh |
| `orderer` | Provider có vai trò `encounter_role.clinician` trên chính encounter đó |
| `drug` | `Drug` tồn tại, chưa retire, có concept |
| `dose`, `quantity` | Số hữu hạn > 0 |
| `doseUnits` | Thuộc set `order.drugDosingUnitsConceptUuid` |
| `route` | Thuộc set `order.drugRoutesConceptUuid` |
| `frequency` | `OrderFrequency` chưa retire |
| `duration` / `durationUnits` | Không bắt buộc. Nếu có thì đi cùng nhau, `duration` là số nguyên 1–3650, đơn vị thuộc set `order.durationUnitsConceptUuid`. Đơn vị cần mapping `SAME-AS` sang SNOMED CT (ví dụ `258703001` = ngày) để Core tính `autoExpireDate` |
| `quantityUnits` | Thuộc set `order.drugDispensingUnitsConceptUuid` |
| `numRefills` | Số nguyên 0–12, mặc định 0 |
| `asNeededCondition` | Chỉ nhận khi `asNeeded=true` |
| `dosingInstructions` | Không bắt buộc, tối đa 1.024 ký tự (`rx.huong_dan_nguon`) |

Kiểm tra an toàn:

- **Đơn trùng:** đang có đơn active cùng concept thuốc thì từ chối; phải ngừng đơn cũ trước.
- **Dị ứng thuốc:** thuốc có concept trùng tác nhân của một dị ứng `DRUG` active thì từ chối, trừ khi gửi `allergyOverrideReason` (≥ 5 ký tự). Lý do được ghi vào sự kiện `drug_order_allergy_override`. Gửi lý do khi không có xung đột cũng bị từ chối.

Đơn được tạo qua endpoint này là đơn đã xác nhận (Core `Order.Action.NEW`, care setting ngoại trú). Bản nháp đơn thuộc FE; OpenMRS không có trạng thái nháp cho order.

## Ngừng thuốc

`POST /openmrs/ws/rest/v1/vinshc/drug-order/{uuid}/discontinue` với `{"orderer": "provider-uuid", "reason": "Hết triệu chứng"}`. Core tạo một order `DISCONTINUE`; response trả đơn gốc với `status=discontinued` và `discontinuationOrderUuid`.

## Đọc lại

- `clinical-summary` của encounter: mỗi đơn có `drug`, liều, đơn vị, đường dùng, tần suất, thời gian, số lượng, người kê, `dateActivated`, `autoExpireDate`, `dateStopped` và `status` (`active`/`discontinued`/`expired`).
- REST native `order/{uuid}` và FHIR `MedicationRequest/{uuid}` đọc được cùng UUID (test B4B).

## Còn thiếu cho mẫu in đơn thuốc

Số chứng chỉ hành nghề của người kê, thông tin cơ sở và lời dặn cấp đơn (`rx.loi_dan`) chưa có nơi lưu. Các mục này thuộc metadata nhân sự/cơ sở và B5/B8; không viết cứng vào FE.

Bằng chứng: `tests/integration/test_b4b_clinical.py`, báo cáo `.runtime/reports/b4b-clinical.json`.
