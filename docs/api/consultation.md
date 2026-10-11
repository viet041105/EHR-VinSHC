# Phiếu khám B4

Có hai lớp:

- **B4A:** ghi phiếu khám thẳng bằng OpenMRS REST `/obs`. Đây là bằng chứng nền về cách lưu (mục dưới), nhưng Core **không** kiểm tra các quy tắc VinSHC.
- **B4 (module `vinshc` 0.3.0):** endpoint ghi có kiểm tra dữ liệu, chốt phiếu và nhật ký. **FE phải dùng lớp này**; không ghi phiếu khám bằng `/obs` trực tiếp.

Chẩn đoán, dị ứng và đơn thuốc: xem [diagnosis-allergy.md](diagnosis-allergy.md) và [medication-order.md](medication-order.md).

## API ghi có kiểm tra (B4)

Base: `/openmrs/ws/rest/v1/vinshc`. Lỗi theo [error-handling.md](error-handling.md#endpoint-vinshc-wsrestv1vinshc).

| Method và path | Privilege | Việc làm |
| --- | --- | --- |
| `POST /consultation` | `VinSHC: Record consultation` | Tạo phiếu (một nhóm `group.consultation` cho mỗi encounter khám) |
| `POST /consultation/{groupUuid}` | `VinSHC: Record consultation` | Sửa một phần; giá trị `null` là xóa trường |
| `POST /encounter/{encounterUuid}/finalize` | `VinSHC: Finalize consultation` (cần cả quyền đọc) | Chốt phiếu sau khi kiểm tra đủ |
| `GET /encounter/{encounterUuid}/clinical-summary` | `VinSHC: Read clinical record` | Đọc lại toàn bộ lần khám |
| `GET /clinical-configuration` | `VinSHC: Read clinical record` | Kiểm tra danh mục B4 đã cấu hình hay chưa |

### Tạo phiếu

```json
{
  "patient": "patient-uuid",
  "encounter": "consultation-encounter-uuid",
  "values": {
    "visit.ly_do_kham": "Sốt và ho hai ngày",
    "history.tien_su_ban_than_trang_thai": "present",
    "history.tien_su_ban_than": "Hen phế quản",
    "history.tien_su_gia_dinh_trang_thai": "not_asked",
    "allergy.trang_thai": "unknown",
    "followup.ngay_tai_kham": "2026-10-18"
  }
}
```

Trường hợp lệ: 11 trường text (`visit.ly_do_kham`, `history.benh_su`, `history.tien_su_ban_than`, `history.tien_su_gia_dinh`, `exam.trieu_chung`, `exam.toan_than`, `exam.bo_phan`, `exam.tom_tat`, `exam.huong_dieu_tri`, `exam.loi_dan`, `followup.loi_dan`), hai trạng thái tiền sử (`not_asked`, `none_reported`, `present`, `unknown`), `allergy.trang_thai` (`not_asked`, `no_known_allergy`, `present`, `unknown`) và `followup.ngay_tai_kham` (`yyyy-MM-dd`). Trạng thái gửi bằng **mã**, không gửi UUID concept; server tự ánh xạ sang concept trong `frontend-map.json`.

Server từ chối (400):

- trường lạ, giá trị không phải chuỗi, chuỗi rỗng hoặc chỉ có khoảng trắng, text dài quá 4.000 ký tự;
- text tiền sử khi trạng thái tương ứng khác `present`, hoặc trạng thái `present` mà thiếu text;
- `allergy.trang_thai=no_known_allergy` khi người bệnh đang có dị ứng active;
- ngày tái khám trước ngày của encounter;
- encounter không thuộc người bệnh hoặc không phải encounter khám;
- encounter đã có phiếu (phải sửa phiếu cũ).

Response trả `groupUuid`, `values` (mã/ISO date) và `memberUuids` để đối chiếu với Obs native.

### Sửa phiếu

`POST /consultation/{groupUuid}` với `{"values": {...}, "reason": "..."}`. Server gộp thay đổi vào giá trị hiện hành rồi kiểm tra lại toàn bộ quy tắc trên. Obs bị đổi được void và thay bằng Obs mới trong cùng group (giống B4A). Phiếu đã chốt thì **bắt buộc có `reason`** và vẫn phải giữ các điều kiện chốt. Thay đổi không làm khác giá trị nào sẽ bị từ chối.

### Chốt phiếu

Điều kiện chốt: có phiếu, có `visit.ly_do_kham`, có `allergy.trang_thai`, `present` thì phải có ít nhất một dị ứng active, và có **đúng một chẩn đoán chính**. Mỗi encounter chỉ chốt được một lần (unique index trong DB). Sau khi chốt:

- sửa phiếu và đổi/thêm chẩn đoán cần `reason`;
- không void được chẩn đoán chính, chỉ thay thế được.

Chưa có thao tác mở lại phiếu đã chốt; khi cần thì phải bổ sung kèm quyền riêng.

### Đọc lại và nhật ký

`clinical-summary` trả `status` (`draft`/`final`), `finalization`, `consultation`, `diagnoses` active, `drugOrders` (đơn NEW kèm `status` `active`/`discontinued`/`expired`), `allergies` của người bệnh và `events`.

Mỗi lần ghi B4 thêm một dòng vào `vinshc_clinical_event` **trong cùng transaction** với dữ liệu: `consultation_created`, `consultation_corrected`, `consultation_finalized`, `diagnosis_recorded`, `diagnosis_replaced`, `diagnosis_voided`, `allergy_recorded`, `allergy_voided`, `drug_order_created`, `drug_order_allergy_override`, `drug_order_discontinued`. Mỗi dòng có người ghi, thời điểm, UUID bản ghi và lý do. Bảng này chỉ ghi thêm, chưa phải audit truy cập/xem hồ sơ (B5).

## Hành vi lưu trữ đã kiểm chứng ở B4A

B4A kiểm chứng phần phiếu khám đã đủ metadata bằng OpenMRS REST trên local/CI.

## Encounter khám

Tạo `POST /openmrs/ws/rest/v1/encounter` với:

- encounter type `encounter.consultation` (`c3dba376-453f-5f2c-bee7-70c09a2d5f61`);
- provider synthetic và role `encounter_role.clinician` (`21dc99b5-a544-5c12-9dcc-3d12fe1d164b`);
- patient, visit, location và `encounterDatetime` cùng ngữ cảnh.

Provider trong fixture chỉ chứng minh quan hệ API. Provider production, chứng chỉ hành nghề và privilege thuộc B5.

## Nhóm dữ liệu khám

Mỗi phiếu là một parent Obs concept `group.consultation` (`7e49bbc6-53c8-59aa-b2f0-6e1f247d701b`) thuộc encounter khám. Payload giống grouped Obs B3: parent có encounter/location/time; từng child bắt buộc có `person`, `obsDatetime`, concept và value.

Các child đã ghi/đọc thật gồm:

- lý do khám, bệnh sử;
- trạng thái và nội dung tiền sử bản thân/gia đình;
- triệu chứng, khám toàn thân, khám bộ phận, tóm tắt;
- hướng điều trị và lời dặn;
- trạng thái sàng lọc dị ứng;
- ngày và lời dặn tái khám.

Text tiếng Việt được giữ nguyên. Date Obs đọc lại theo ngày đã chọn; ghi ngày/lời dặn tái khám không tự tạo Appointment.

## Trạng thái thiếu

- `present` cần child nội dung tương ứng theo contract ứng dụng.
- `none_reported`, `not_asked` và `unknown` là ba trạng thái khác nhau; không tạo child text giả hoặc chuỗi rỗng.
- `no_known_allergy` khác `unknown`. Lượt khám sau chưa biết/không hỏi không được xóa kết quả sàng lọc hoặc allergy list từ lượt trước.

OpenMRS Core lưu coded Obs nhưng không tự thực thi các quy tắc trên. Từ module 0.3.0, `POST /vinshc/consultation` và bước chốt phiếu đã chặn `present` thiếu nội dung và các tổ hợp mâu thuẫn.

## Sửa và lịch sử

`POST /obs/{uuid}` tạo UUID thay thế và void Obs cũ. B4A xác nhận child thay thế vẫn thuộc đúng consultation group, bản cũ còn đọc được với `voided=true`. Hai lượt khám của cùng patient dùng visit, encounter và group riêng nên dữ liệu lượt hai không ghi đè lượt đầu.

FHIR2 đọc parent group thành Observation có đúng `subject`, `encounter` và `hasMember`. Visit OpenMRS không được ánh xạ thành FHIR Encounter. Mapping ICD-10/Condition, AllergyIntolerance và MedicationRequest chờ B4 đầy đủ.

Bằng chứng: `tests/integration/test_b4a_consultation.py` (`.runtime/reports/b4a-integration.json`) cho lưu trữ native; `tests/integration/test_b4b_clinical.py` (`.runtime/reports/b4b-clinical.json`) cho API có kiểm tra, chốt phiếu, chẩn đoán, dị ứng, đơn thuốc và quyền.
