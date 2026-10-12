# Diagnosis và allergy

Module `vinshc` 0.3.0 có API ghi có kiểm tra cho chẩn đoán và dị ứng, lưu vào đối tượng native của OpenMRS (`Diagnosis`, `Allergy`). Test tích hợp chạy được với catalogue test metadata 0.3.0; catalogue này giữ `productionEnabled=false`. Khi chưa cấu hình, endpoint trả 503 thay vì nhận dữ liệu ngoài catalogue. Điều kiện catalogue production: xem [B4_CATALOGUE_HANDOFF.md](../data/B4_CATALOGUE_HANDOFF.md).

Base: `/openmrs/ws/rest/v1/vinshc`. Lỗi theo [error-handling.md](error-handling.md#endpoint-vinshc-wsrestv1vinshc).

## Chẩn đoán

| Method và path | Privilege | Việc làm |
| --- | --- | --- |
| `POST /diagnosis` | `VinSHC: Record diagnosis` | Thêm chẩn đoán vào encounter khám |
| `POST /diagnosis/{uuid}` | `VinSHC: Record diagnosis` | Thay thế (đổi concept, `rank` hoặc `certainty`); bắt buộc `reason` |
| `DELETE /diagnosis/{uuid}?reason=...` | `VinSHC: Record diagnosis` | Void |

```json
{
  "patient": "patient-uuid",
  "encounter": "consultation-encounter-uuid",
  "concept": "icd10-concept-uuid",
  "rank": "primary",
  "certainty": "confirmed"
}
```

- `rank`: `primary` (lưu `rank=1`) hoặc `secondary` (`rank=2`). `certainty`: `provisional` hoặc `confirmed`.
- `concept` phải có mapping `SAME-AS` tới source ở `vinshc.diagnosis.icd10ConceptSourceUuid`, đồng thời là member của set `vinshc.diagnosis.icd10SelectableConceptSetUuid`; catalogue phải có `vinshc.diagnosis.icd10CatalogueVersion`. Thiếu cấu hình thì trả 503.
- Từ chối `nonCoded` (text tự do), concept ngoài allowlist selectable, concept không có mapping, concept đã retire, chẩn đoán trùng trong cùng encounter và chẩn đoán chính thứ hai. Nhờ vậy category rộng như `E11` vẫn bị từ chối dù có mapping để phục vụ hiển thị/phân cấp.
- Thay thế là append-only: bản cũ void kèm `reason`, bản mới có UUID mới. Phiếu đã chốt thì thêm chẩn đoán cũng cần `reason`, và không void được chẩn đoán chính.

Response:

```json
{
  "uuid": "...", "patientUuid": "...", "encounterUuid": "...",
  "concept": {"uuid": "...", "display": "..."},
  "code": "J06.9",
  "system": {"uuid": "...", "name": "...", "uri": "...", "version": "..."},
  "rank": "primary", "certainty": "confirmed", "voided": false
}
```

**FHIR (runtime 11/10/2026):** FHIR2 4.2.0 trả chẩn đoán encounter active dưới dạng `Condition` có `category` = `encounter-diagnosis`, id bằng UUID chẩn đoán. Chẩn đoán đã void hoặc đã bị thay thế không xuất hiện (test B4B). Hai giới hạn quan sát được:

- `Condition?patient=...&category=encounter-diagnosis` trả 0 kết quả dù không lọc thì có. Không lọc theo `category` ở phía server; lọc ở client.
- REST `patientdiagnoses?patient=...` trả 0 kết quả. Đọc chẩn đoán lượt khám qua `clinical-summary`.

Chưa ghi chẩn đoán vào problem list (`conditions`); việc đó cần quyết định nghiệp vụ riêng.

## Dị ứng

| Method và path | Privilege | Việc làm |
| --- | --- | --- |
| `GET /allergy?patient=...` | `VinSHC: Read clinical record` | Danh sách dị ứng active |
| `POST /allergy` | `VinSHC: Record allergy` | Ghi dị ứng |
| `DELETE /allergy/{uuid}?reason=...` | `VinSHC: Record allergy` | Void |

```json
{
  "patient": "patient-uuid",
  "encounter": "consultation-encounter-uuid",
  "allergenType": "DRUG",
  "allergen": {"concept": "allergen-concept-uuid"},
  "severity": "severity-concept-uuid",
  "reactions": [{"concept": "reaction-concept-uuid"}],
  "comment": "Nổi mẩn sau uống thuốc năm 2020"
}
```

- `allergenType`: `DRUG`, `FOOD`, `ENVIRONMENT` (dị ứng có mã) hoặc `OTHER` (chỉ dùng với text tự do). `encounter` không bắt buộc, nhưng nếu gửi thì phải thuộc người bệnh.
- Tác nhân có mã phải nằm trong concept set của đúng loại (`vinshc.allergy.allergenConceptSetUuid.drug|food|environment`). Phản ứng và mức độ phải nằm trong `vinshc.allergy.reactionConceptSetUuid` và `vinshc.allergy.severityConceptSetUuid`.
- **Text tự do** (`{"nonCoded": "..."}` cho tác nhân hoặc phản ứng) chỉ được nhận khi `vinshc.allergy.allowNonCoded=true` **và** concept `allergy.concept.otherNonCoded` của Core tồn tại. Mặc định là `false` cho tới khi phòng khám quyết định chính sách.
- Từ chối tác nhân trùng với một dị ứng active, phản ứng lặp lại, và payload vừa có `concept` vừa có `nonCoded`.

**Quan hệ với Obs sàng lọc** (`allergy.trang_thai` trong phiếu khám):

- Sàng lọc không bao giờ tạo, sửa hoặc xóa danh sách dị ứng native.
- `no_known_allergy` bị từ chối khi đang có dị ứng active. Phải void dị ứng trước, kèm lý do.
- `present` chỉ chốt được khi có ít nhất một dị ứng active.
- `unknown` và `not_asked` không thay đổi danh sách.

**FHIR:** dị ứng native đọc lại được qua `AllergyIntolerance?patient=...` với id là UUID của dị ứng (test B4B).

Bằng chứng: `tests/integration/test_b4b_clinical.py`, báo cáo `.runtime/reports/b4b-clinical.json`.
