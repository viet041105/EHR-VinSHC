# Hợp đồng API backend

Các tài liệu trong thư mục này mô tả hành vi đã quan sát trên OpenMRS Reference Application 3.7.1/Core 2.8.8 của VinSHC. Base path REST là `/openmrs/ws/rest/v1`; FHIR là `/openmrs/ws/fhir2/R4`. Request ghi chỉ được chạy trên instance local/CI với dữ liệu synthetic.

| Tài liệu | Mức kiểm chứng B1 |
| --- | --- |
| [Session và xác thực](session-auth.md) | Runtime: đăng nhập, location, 401 |
| [Patient và identifier](patient-identifier.md) | B2 runtime: IDGen, CRUD/search/phân trang, tên có dấu, trùng mã/tên, thuộc tính, REST–FHIR và sai quyền |
| [Mở rộng hành chính VinSHC](patient-administration.md) | B2/B3: contacts, fieldStates, DATA-08, provenance, privilege và validated vital write |
| [Visit và lịch sử](visit.md) | B3 runtime: mở/kết thúc, encounter, provider, lịch sử và cô lập patient |
| [Encounter và observation](encounter-obs.md) | B3 runtime: bộ sinh hiệu chính thức, nhóm/trạng thái thiếu, sửa/void và REST–FHIR |
| [Phiếu khám B4A](consultation.md) | B4A runtime: encounter bác sĩ, Obs khám, trạng thái thiếu, sửa và hai lượt khám |
| [Diagnosis và allergy](diagnosis-allergy.md) | Capability mới; chưa có fixture nghiệp vụ |
| [Medication và order](medication-order.md) | Capability mới; chưa có fixture nghiệp vụ |
| [Xử lý lỗi](error-handling.md) | Runtime: 400/401/403/404 |
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
| Metadata Việt Nam 0.1.0 | Đã nạp và kiểm tra runtime 78/78 identity; catalogue ICD-10/thuốc/dịch vụ/địa giới vẫn chưa bàn giao |

## Chạy kiểm chứng B1–B4A

```powershell
python -m unittest discover -s tests/integration -v
```

Test chỉ chấp nhận HTTP loopback, không theo redirect và từ chối HTML thay cho JSON. Báo cáo nằm tại `.runtime/reports/b1-integration.json`, `b2-integration.json`, `b23-extension-integration.json`, `b3-integration.json` và `b4a-integration.json`; fixture tương ứng nằm trong `.runtime/fixtures/`. B3/B4A dùng hai patient synthetic của B2. Nếu file fixture có nhưng dữ liệu tương ứng mất, test fail thay vì tạo lại để che mất lỗi persistence.
