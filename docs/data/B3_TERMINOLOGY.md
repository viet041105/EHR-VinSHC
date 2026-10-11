# B3: mapping thuật ngữ sinh hiệu

Mapping dự kiến, chưa nạp SAME-AS. Mỗi dòng cần xác nhận phương pháp và người chuyên môn duyệt; `enabledForImport=false` trong contract.

| Trường | OpenMRS UUID | LOINC dự kiến | Phiên bản / quan hệ dự kiến | UCUM | Phương pháp | Phê duyệt | Nguồn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `vitals.mach` | `263e4d0b-61d2-5517-bcb1-992cfb60675b` | 8867-4 | 2.83 / SAME-AS | /min | awaiting_measurement_confirmation: Confirm heart rate vs palpated peripheral pulse; choose code based on actual measurement | awaiting_clinical_approval | [LOINC](https://loinc.org/8867-4) |
| `vitals.ha_tam_thu` | `f8da18ad-2e26-55cd-954b-51d6e0738815` | 8480-6 | 2.83 / SAME-AS | mm[Hg] | awaiting_measurement_confirmation: Keep cuff/device/site/body position if known; no invented method | awaiting_clinical_approval | [LOINC](https://loinc.org/8480-6) |
| `vitals.ha_tam_truong` | `f97478e4-cce6-5cc5-89fa-cfd10bfe8794` | 8462-4 | 2.83 / SAME-AS | mm[Hg] | awaiting_measurement_confirmation: Same measurement episode/method as systolic | awaiting_clinical_approval | [LOINC](https://loinc.org/8462-4) |
| `vitals.nhiet_do` | `55a6de05-e371-5a48-9440-a81d7ef2e364` | 8310-5 | 2.83 / SAME-AS | Cel | awaiting_measurement_confirmation: Keep oral/axillary/rectal/forehead site and device if known; do not infer | awaiting_clinical_approval | [LOINC](https://loinc.org/8310-5) |
| `vitals.nhip_tho` | `b82f1a4a-bbc9-55f0-8204-079bf1130457` | 9279-1 | 2.83 / SAME-AS | /min | awaiting_measurement_confirmation: Keep counting/device method if known | awaiting_clinical_approval | [LOINC](https://loinc.org/9279-1) |
| `vitals.spo2` | `4ebf4ddf-fcbe-5bed-893b-114d6ec5f739` | 59408-5 | 2.83 / SAME-AS | % | confirmed_by_project_user: pulse_oximetry | awaiting_clinical_approval | [LOINC](https://loinc.org/59408-5) |
| `vitals.can_nang` | `88853161-b7db-5a20-b5c5-666b69999a25` | 29463-7 | 2.83 / SAME-AS | kg | awaiting_measurement_confirmation: Keep scale/device/clothing context if known | awaiting_clinical_approval | [LOINC](https://loinc.org/29463-7) |
| `vitals.chieu_cao` | `e13865bd-3100-5aca-8e82-e8a6fb58321d` | 8302-2 | 2.83 / SAME-AS | cm | awaiting_measurement_confirmation: Confirm standing stature vs recumbent length; review more-specific code if needed | awaiting_clinical_approval | [LOINC](https://loinc.org/8302-2) |

Coding system: `http://loinc.org`. Đây là release đích 2.83; cần lookup theo release trước khi nạp. SpO2 đã được người dùng xác nhận pulse oximetry ngày 11/10/2026, vẫn chờ người duyệt. FHIR R4 dùng oxygen saturation 2708-6 và có thể thêm 59408-5 khi xác nhận phương pháp.

BP: xuất panel 85354-9 với hai component 8480-6 và 8462-4; component thiếu dùng dataAbsentReason, giữ source state nội bộ. Native group.vitals hiện tại được giữ, BE/B7 cần triển khai và kiểm thử projection.

[Contract B3](../../metadata/vinshc/contracts/b3.json) · [FHIR R4 BP](https://hl7.org/fhir/R4/bp.html) · [FHIR R4 Vital Signs](https://hl7.org/fhir/R4/observation-vitalsigns.html)
