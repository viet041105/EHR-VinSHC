# Ma trận khả năng backend

Tài liệu này là đầu ra B0: đối chiếu nhu cầu phòng khám với module/API đang có, metadata cần thiết, mức đã kiểm tra và khoảng trống. Đây không phải tuyên bố nghiệm thu nghiệp vụ. Một module `started` chỉ chứng minh module đã khởi động; một endpoint trả dữ liệu chỉ chứng minh API ở mức được nêu; chỉ cột **Mức đã thử** mới mô tả luồng đã chạy bằng dữ liệu giả.

## Quy ước trạng thái

| Trạng thái | Ý nghĩa |
| --- | --- |
| `Baseline` | Module có trong `config/baseline.json`, đúng phiên bản và `started=true` khi `scripts/smoke.py` chạy. |
| `API đã thử` | Request cụ thể đã chạy trên instance PostgreSQL và cấu trúc/kết quả tối thiểu đã được kiểm tra. |
| `Fixture đã thử` | Có tạo rồi đọc lại dữ liệu giả và kiểm tra quan hệ hoặc giá trị. |
| `Chưa thử nghiệp vụ` | Chưa có bằng chứng cho state transition, quyền, validation hoặc luồng end-to-end. |
| `Chờ metadata` | Có thể khảo sát kỹ thuật, nhưng chưa thể nghiệm thu bằng UUID/danh mục chính thức. |

Báo cáo `.runtime/reports/smoke.json` ghi phiên bản Reference Application/Core, trạng thái `started` và phiên bản của 29 module, cùng toàn bộ resource/interaction từ FHIR `CapabilityStatement`. Báo cáo `.runtime/reports/database.json` ghi phiên bản PostgreSQL, UTF8, extension và tình trạng schema. Hai báo cáo không chứa credential và được tạo lại bằng các lệnh ở cuối tài liệu.

## MVP-1 — lõi lâm sàng

| Nghiệp vụ | Module/API hiện có | Metadata cần | Mức đã thử | Khoảng trống / bước tiếp theo |
| --- | --- | --- | --- | --- |
| Đăng nhập và chọn cơ sở | Core session REST; Initializer 2.12.0 | Location đăng nhập/cơ sở; baseline có location synthetic UUID ổn định | **API đã thử:** đăng nhập, từ chối mật khẩu sai, chọn location trong session | Chưa có 8 role, privilege tối thiểu và test từng role. |
| Tìm/tạo bệnh nhân và mã hồ sơ | Core patient REST; FHIR2 Patient; idgen 5.0.4 | Identifier type nội bộ, CCCD, BHXH/BHYT; quy tắc sinh mã; location | **Fixture đã thử:** tạo/đọc bệnh nhân synthetic qua REST, tìm Patient, đọc cùng UUID/identifier qua FHIR | Chưa thử idgen, mã trùng, cập nhật, phân trang, tên tiếng Việt có dấu hoặc quyền nghiệp vụ. Chờ metadata định danh chính thức. |
| Mở/kết thúc lượt khám | Core visit REST; encounter REST; FHIR2 Encounter | Visit type, encounter type, location | **Fixture đã thử:** tạo/đọc visit và encounter, kiểm tra liên kết patient/visit; đọc encounter qua FHIR | Chưa thử kết thúc visit, lịch sử nhiều lượt, trạng thái sai hoặc quyền. Visit OpenMRS chưa được coi là Encounter FHIR tương đương. |
| Ghi sinh hiệu | Core obs/encounter REST; FHIR2 Observation | Concept sinh hiệu, datatype, đơn vị UCUM, khoảng hợp lệ, encounter type | **Fixture đã thử:** observation số 36.7 `degC` và text tiếng Việt; kiểm tra patient/encounter/value/unit/time qua REST/FHIR | Dùng concept synthetic. Chưa thử bộ sinh hiệu và validation chính thức; **chờ metadata**. |
| Khám và biểu mẫu | o3forms 2.3.0; Core encounter/obs REST | Concept bệnh sử/khám, form, encounter type | `Baseline`; obs text synthetic đã lưu được | Chưa thử form, version form, dữ liệu thiếu, sửa/void hoặc quyền. |
| Dị ứng | Core/FHIR2 tùy capability runtime | Concept/phân loại dị ứng và quy tắc trạng thái | `Baseline`; capability chỉ được ghi nhận tự động nếu server công bố | Chưa có fixture/API contract hay mapping được kiểm tra. |
| Chẩn đoán ICD-10 | emrapi 3.4.0; Core REST; FHIR2 Condition tùy capability | Danh mục ICD-10 có nguồn/phiên bản, concept mapping | `Baseline`; capability chỉ được ghi nhận tự động nếu server công bố | Chưa có fixture, validation, mapping hoặc test quyền. |
| Kê đơn | Core orders/drug; ordertemplates 2.2.0; FHIR2 MedicationRequest tùy capability | Danh mục thuốc, liều, đơn vị, đường dùng, tần suất, người kê | `Baseline`; capability chỉ được ghi nhận tự động nếu server công bố | Chưa thử tạo/đọc đơn, trạng thái, in đơn, quyền hoặc mapping FHIR. |
| Xem lại lịch sử | Core patient/visit/encounter/obs REST; FHIR2 | Cùng metadata của các dòng trên | Fixture đơn lẻ được đọc lại sau restart trong CI | Chưa thử nhiều lượt khám, sửa/void, lọc thời gian và hiển thị lịch sử nghiệp vụ. |

## MVP-2 — vận hành phòng khám

| Nghiệp vụ | Module/API hiện có | Metadata/cấu hình cần | Mức đã thử | Khoảng trống / bước tiếp theo |
| --- | --- | --- | --- | --- |
| Lịch hẹn | appointments 2.1.0 | Appointment service, service type, provider/location, slot, timezone | `Baseline`; module đúng phiên bản và started | **Chưa thử nghiệp vụ:** tạo/xác nhận/hủy, slot trùng, quyền và API schema. Bản vá migration PostgreSQL đã chạy. |
| Hàng đợi | queue 3.0.0 | Service, queue, location, provider, priority và state model | `Baseline`; module đúng phiên bản và started | **Chưa thử nghiệp vụ:** cấp số, chuyển bước, bỏ về, cạnh tranh cập nhật và quyền. |
| Bảng giá và thu tiền | billing 2.3.0 | Danh mục dịch vụ, bảng giá theo cơ sở, VND, phương thức thu | `Baseline`; module đúng phiên bản và started | **Chưa thử nghiệp vụ:** báo giá/thu/hoàn/hủy, trả trước/sau, tổng tiền, người thu và API. |
| Kho và cấp thuốc | stockmanagement 3.0.0; Core drug/order | Danh mục thuốc/vật tư, kho, lô/hạn dùng nếu đưa vào pilot | `Baseline`; 118 khóa ngoại Stock Management được kiểm tra trên PostgreSQL | **Chưa thử nghiệp vụ:** nhập/xuất/cấp theo đơn, tồn, quyền. Dispensing chưa được chứng minh bởi module backend riêng trong baseline. |
| Tệp đính kèm | attachments 4.0.0 | Loại tài liệu, MIME/kích thước, nguồn và liên kết visit/order | `Baseline`; module đúng phiên bản và started | **Chưa thử nghiệp vụ:** upload/download, BYTEA/complex obs, giới hạn file, quyền và nội dung sau restart/restore. |
| Tài liệu bệnh nhân | patientdocuments 1.1.0 | Loại tài liệu, encounter/visit/source, retention | `Baseline`; module đúng phiên bản và started | **Chưa thử nghiệp vụ:** tạo, tìm, tải, phân loại, quyền và provenance. |
| Báo cáo ngày | reporting 2.1.0; reportingrest 2.0.0; billing/visit aggregate | Định nghĩa báo cáo, ngày theo Asia/Ho_Chi_Minh, scope cơ sở | `Baseline`; module đúng phiên bản và started | Chưa thử số lượt/doanh thu, đối soát dữ liệu giả và tách quyền quản lý khỏi bệnh án. |
| Mẫu in | Dữ liệu từ Core/billing/order/document API; FE-08 | Thông tin cơ sở/người hành nghề, template và trường bắt buộc | Chưa thử | Chưa chốt API dữ liệu cho đơn thuốc, phiếu thu, chỉ định, kết quả và giấy hẹn. |

## Thành phần hỗ trợ và giới hạn baseline

| Thành phần | Quyết định B0 | Bằng chứng hiện có | Khi nào cần code |
| --- | --- | --- | --- |
| OpenMRS Core, REST, FHIR2 | Giữ upstream, khóa phiên bản | Core/REST/FHIR version và API tối thiểu được smoke kiểm tra | Chỉ sửa/fork khi có ca tái hiện, test thất bại và extension/config không giải quyết được. |
| Initializer | Dùng để nạp metadata version hóa với UUID ổn định | Location synthetic được nạp và chọn trong session | Thêm cấu hình metadata trước; chưa cần module Java. |
| Module nghiệp vụ đã có | Khảo sát API và cấu hình trước khi viết mới | Tất cả module trong baseline phải `started=true` | Viết module VinSHC khi luồng cụ thể không thể đáp ứng bằng API/metadata/configuration và có test chứng minh khoảng trống. |
| PostgreSQL | Giữ schema do OpenMRS/module sở hữu; không tạo hồ sơ bằng SQL | Version, UTF8, extension, bảng và migration quan trọng được kiểm tra | Chỉ thêm migration cho phần mở rộng do dự án sở hữu; không thiết kế lại bảng Core. |
| Adapter bên ngoài | Sau pilot: BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS | Chưa triển khai | Đặt trong `integrations/`, bật/tắt độc lập sau khi có contract được duyệt. |

## Phạm vi đã chốt

Phạm vi sau được xác nhận ngày 10/10/2026, dựa trên `PROJECT_PLAN.md` và `CLINIC_WORKFLOW.md`:

- MVP-1: đăng nhập → tìm/tạo bệnh nhân → mở visit → ghi sinh hiệu → khám/chẩn đoán/kê đơn → kết thúc visit → xem lịch sử.
- MVP-2 trước pilot: lịch hẹn, hàng đợi, thu tiền, chỉ định CLS, mẫu in, báo cáo ngày, tái khám.
- Sau pilot: kho/lô/hạn dùng đầy đủ, BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS/PACS và nhắc lịch SMS/Zalo.

Các biến thể trả trước/trả sau, có/không điều dưỡng và có/không quầy thuốc phải được hỗ trợ bằng cấu hình. Việc chốt phạm vi không đồng nghĩa các luồng đã được nghiệm thu; mức kiểm chứng thực tế vẫn theo các bảng capability ở trên.

## Tạo lại bằng chứng B0

Chạy trên instance local/test; không dùng database chứa dữ liệu thật:

```powershell
python scripts/check_config.py
python -m unittest discover -s tests -v
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py --report .runtime/reports/smoke.json
```

Để chứng minh fixture còn sau restart, dùng quy trình `--create-fixture` / `--require-fixture` trong `docs/DEVELOPMENT.md`. Khi đưa kết quả vào issue/PR, ghi commit, ngày chạy, môi trường, hai file báo cáo, giới hạn chưa thử và xác nhận rằng không có credential/dữ liệu bệnh nhân thật.
