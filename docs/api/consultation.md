# Phiếu khám B4A

B4A kiểm chứng phần phiếu khám đã đủ metadata bằng OpenMRS REST trên local/CI. Chẩn đoán ICD-10, Allergy chi tiết và DrugOrder không thuộc hợp đồng đã hoàn thành này.

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

OpenMRS Core lưu coded Obs nhưng không tự thực thi toàn bộ quan hệ điều kiện trên. Adapter finalization vẫn phải chặn `present` thiếu nội dung và các tổ hợp mâu thuẫn.

## Sửa và lịch sử

`POST /obs/{uuid}` tạo UUID thay thế và void Obs cũ. B4A xác nhận child thay thế vẫn thuộc đúng consultation group, bản cũ còn đọc được với `voided=true`. Hai lượt khám của cùng patient dùng visit, encounter và group riêng nên dữ liệu lượt hai không ghi đè lượt đầu.

FHIR2 đọc parent group thành Observation có đúng `subject`, `encounter` và `hasMember`. Visit OpenMRS không được ánh xạ thành FHIR Encounter. Mapping ICD-10/Condition, AllergyIntolerance và MedicationRequest chờ B4 đầy đủ.

Bằng chứng: `tests/integration/test_b4a_consultation.py` và `.runtime/reports/b4a-integration.json`.
