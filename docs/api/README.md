# Hợp đồng API backend

Các tài liệu trong thư mục này mô tả hành vi đã quan sát trên OpenMRS Reference Application 3.7.1/Core 2.8.8 của VinSHC. Base path REST là `/openmrs/ws/rest/v1`; FHIR là `/openmrs/ws/fhir2/R4`. Request ghi chỉ được chạy trên instance local/CI với dữ liệu synthetic.

| Tài liệu | Mức kiểm chứng B1 |
| --- | --- |
| [Session và xác thực](session-auth.md) | Runtime: đăng nhập, location, 401 |
| [Patient và identifier](patient-identifier.md) | B2 runtime: IDGen, CRUD/search/phân trang, tên có dấu, trùng mã/tên, thuộc tính, REST–FHIR và sai quyền |
| [Mở rộng hành chính VinSHC](patient-administration.md) | B2/B3: contacts, fieldStates, DATA-08, provenance, privilege và validated vital write |
| [Visit và lịch sử](visit.md) | B3 runtime: mở/kết thúc, encounter, provider, lịch sử và cô lập patient |
| [Encounter và observation](encounter-obs.md) | B3 runtime: bộ sinh hiệu chính thức, nhóm/trạng thái thiếu, sửa/void và REST–FHIR |
| [Phiếu khám B4](consultation.md) | B4A runtime: Obs khám native. B4 (module 0.3.0): ghi có kiểm tra, chốt phiếu, clinical-summary, nhật ký |
| [Diagnosis và allergy](diagnosis-allergy.md) | B4 runtime với catalogue metadata 0.3.0: ICD-10 selectable, một chẩn đoán chính, dị ứng có mã, FHIR AllergyIntolerance |
| [Medication và order](medication-order.md) | B4 runtime với catalogue metadata 0.3.0: kê đơn có kiểm tra, xung đột dị ứng, ngừng thuốc, FHIR MedicationRequest đọc lại |
| [Xử lý lỗi](error-handling.md) | Runtime: 400/401/403/404/503; quy tắc FHIR 500 khi thiếu quyền |
| [FHIR mapping](fhir-mapping.md) | Runtime: Patient/Encounter/Observation; phần khác giới hạn rõ |
| [Ma trận capability](capabilities.md) | B0: module/API/metadata/mức thử/khoảng trống |

## Quy ước chung

- Xác thực local/CI hiện dùng HTTP Basic qua gateway. Không ghi credential vào tài liệu, report hoặc Git.
- `uuid` do server trả về là khóa để đọc lại. UUID metadata phải lấy từ gói Initializer/baseline đã nạp, không dùng UUID placeholder trong test.
- Timestamp gửi theo ISO 8601 có offset. Runtime lưu/trả thời gian chuẩn hóa; nghiệp vụ hiển thị theo `Asia/Ho_Chi_Minh`.
- List REST có dạng `{"results": [...], "links": [...]}`. Dùng `limit` và `startIndex` khi cần phân trang; từng endpoint phải được test riêng trước khi FE phụ thuộc.
- `v=full` chỉ dùng trong test/khảo sát khi cần kiểm tra quan hệ. FE nên chọn representation tối thiểu phù hợp thay vì phụ thuộc toàn bộ response `full`.
- FHIR `CapabilityStatement` chỉ là công bố của server, không phải bằng chứng create/update hoạt động đúng nghiệp vụ. Mức đã chạy thật được ghi riêng trong từng tài liệu.

## Nguồn UUID hiện dùng

| UUID | Nguồn |
| --- | --- |
| Location development | `config/baseline.json` và Initializer CSV |
| Patient identifier B2 | UUID chính thức từ `metadata/vinshc/frontend-map.json`; nguồn IDGen và autogeneration option trong cấu hình backend |
| Visit/encounter/role/concept B3 | UUID chính thức từ `metadata/vinshc/frontend-map.json`, đã đối chiếu runtime |
| Patient/visit/encounter/obs | Response của request tạo, sau đó lưu dưới `.runtime/` để đọc lại |
| Metadata Việt Nam 0.3.0 | 78 identity nền và catalogue test B4 đã nạp trên Docker cô lập; catalogue test giữ `productionEnabled=false` |

## Chạy kiểm chứng B1–B4

`test_b23_extensions.py` cần fixture của B2 và B3, nhưng `discover` chạy theo thứ tự tên file (`test_b23` đứng trước `test_b2_`). Trên database mới, chạy theo thứ tự:

```powershell
python -m unittest -v tests.integration.test_b1_contract tests.integration.test_b2_patient tests.integration.test_b3_vitals tests.integration.test_b23_extensions tests.integration.test_b4a_consultation tests.integration.test_b4b_clinical
```

Để dùng catalogue metadata 0.3.0 thay cho fallback synthetic, chạy Compose với `tests/integration/compose.b4-metadata.yaml` và đặt `$env:VINSHC_B4_CATALOGUE='metadata'`. Adapter sẽ từ chối catalogue nếu `productionEnabled=true`, tránh dùng nhầm dữ liệu production trong test.

Khi đã có fixture, `python -m unittest discover -s tests/integration -v` chạy lại được.

Test chỉ chấp nhận HTTP loopback, không theo redirect và từ chối HTML thay cho JSON. Báo cáo nằm tại `.runtime/reports/b1-integration.json`, `b2-integration.json`, `b23-extension-integration.json`, `b3-integration.json`, `b4a-integration.json` và `b4b-clinical.json`; fixture tương ứng nằm trong `.runtime/fixtures/`. B3/B4A dùng hai patient synthetic của B2; B4B tạo patient synthetic mới mỗi lần chạy và đọc lại encounter của lần trước. Nếu file fixture có nhưng dữ liệu tương ứng mất, test fail thay vì tạo lại để che mất lỗi persistence.
