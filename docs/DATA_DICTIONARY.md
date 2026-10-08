# Từ điển dữ liệu MVP

**Người chủ trì:** Người 3 (DATA-01). **Trạng thái:** Khung ban đầu. Nội dung lâm sàng cần mentor xác nhận trước khi chốt biểu mẫu (FE-04).

Mỗi trường được ghi một lần ở đây. Backend, biểu mẫu, API test và mapping FHIR/openEHR đều tham chiếu tới tài liệu này. Khi thêm hoặc đổi trường, cập nhật bảng và báo những người dùng trường đó.

## 1. Quy ước

| Cột | Ý nghĩa |
| --- | --- |
| Mã trường | Tên ổn định, dạng `nhom.ten_truong`, không đổi khi đổi nhãn hiển thị |
| Kiểu | `text`, `numeric`, `coded`, `date`, `datetime`, `boolean` |
| Đơn vị | Đơn vị UCUM khi là số đo |
| Bắt buộc | `B` bắt buộc, `T` tùy chọn, `Đk` có điều kiện |
| OpenMRS | Đối tượng lưu: patient, person attribute, identifier, obs (concept UUID), order, allergy, condition, diagnosis |
| FHIR R4 | Resource và path |
| openEHR | Archetype tham chiếu trên CKM, để ánh xạ khi thêm EHRbase ([ADR-0001](decisions/0001-openmrs-openehr.md)) |
| Thiếu dữ liệu | Cách biểu diễn "chưa hỏi", "không rõ", "không có" |

Concept UUID được điền khi DATA-02 tạo metadata. Không dùng UUID tạm trên biểu mẫu đã merge.

## 2. Bệnh nhân và định danh

| Mã trường | Nhãn | Kiểu | Bắt buộc | OpenMRS | FHIR R4 | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `patient.ma_noi_bo` | Mã bệnh nhân | text | B | identifier (loại nội bộ) | Patient.identifier | Hệ thống tự sinh; có cơ sở cấp |
| `patient.cccd` | Số CCCD | text | T | identifier | Patient.identifier | Kiểm tra định dạng 12 chữ số |
| `patient.ma_bhxh` | Mã BHXH/BHYT | text | T | identifier | Patient.identifier | |
| `patient.ho_ten` | Họ và tên | text | B | person name | Patient.name | Thứ tự họ – đệm – tên kiểu Việt Nam; xác định cách tách trường |
| `patient.gioi_tinh` | Giới tính | coded | B | gender | Patient.gender | |
| `patient.ngay_sinh` | Ngày sinh | date | B | birthdate (+ cờ ước lượng) | Patient.birthDate | Cho phép chỉ biết năm sinh |
| `patient.dien_thoai` | Điện thoại | text | T | person attribute | Patient.telecom | |
| `patient.dia_chi` | Địa chỉ | text/coded | T | person address | Patient.address | Tỉnh → xã theo danh mục hiện hành; số nhà dạng text |
| `patient.dia_chi_cu` | Địa chỉ theo giấy tờ cũ | text | T | person attribute | Patient.address (period) | Đối chiếu sau sắp xếp hành chính 2025 |

## 3. Sinh hiệu

| Mã trường | Nhãn | Kiểu | Đơn vị | Bắt buộc | OpenMRS | FHIR R4 | openEHR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `vitals.mach` | Mạch | numeric | /min | Đk | obs | Observation (LOINC 8867-4) | `openEHR-EHR-OBSERVATION.pulse.v2` |
| `vitals.ha_tam_thu` | HA tâm thu | numeric | mm[Hg] | Đk | obs | Observation (85354-9, component 8480-6) | `openEHR-EHR-OBSERVATION.blood_pressure.v2` |
| `vitals.ha_tam_truong` | HA tâm trương | numeric | mm[Hg] | Đk | obs | Observation (85354-9, component 8462-4) | `openEHR-EHR-OBSERVATION.blood_pressure.v2` |
| `vitals.nhiet_do` | Nhiệt độ | numeric | Cel | Đk | obs | Observation (8310-5) | `openEHR-EHR-OBSERVATION.body_temperature.v2` |
| `vitals.nhip_tho` | Nhịp thở | numeric | /min | T | obs | Observation (9279-1) | `openEHR-EHR-OBSERVATION.respiration.v2` |
| `vitals.spo2` | SpO₂ | numeric | % | T | obs | Observation (59408-5) | `openEHR-EHR-OBSERVATION.pulse_oximetry.v1` |
| `vitals.can_nang` | Cân nặng | numeric | kg | T | obs | Observation (29463-7) | `openEHR-EHR-OBSERVATION.body_weight.v2` |
| `vitals.chieu_cao` | Chiều cao | numeric | cm | T | obs | Observation (8302-2) | `openEHR-EHR-OBSERVATION.height.v2` |

Tập sinh hiệu bắt buộc và ngưỡng hợp lệ do mentor chốt. Giữ thời điểm đo tách biệt với thời điểm nhập. Phiên bản archetype và mã LOINC phải được kiểm tra lại trên CKM/LOINC khi chốt.

## 4. Khám và kết luận

| Mã trường | Nhãn | Kiểu | Bắt buộc | OpenMRS | FHIR R4 | openEHR | Thiếu dữ liệu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `visit.ly_do_kham` | Lý do khám | text | B | obs | Encounter.reasonCode / Observation | `EVALUATION.reason_for_encounter.v1` | |
| `exam.trieu_chung` | Triệu chứng | coded + text | T | obs | Observation / Condition | `CLUSTER.symptom_sign.v2` | |
| `allergy.trang_thai` | Tình trạng dị ứng | coded | B | allergy (hoặc obs trạng thái) | AllergyIntolerance | `EVALUATION.adverse_reaction_risk.v1`, `EVALUATION.exclusion_specific.v1` | Phân biệt: chưa hỏi / đã hỏi, không ghi nhận / có dị ứng |
| `allergy.tac_nhan` | Tác nhân dị ứng | coded | Đk | allergy | AllergyIntolerance.code | `EVALUATION.adverse_reaction_risk.v1` | |
| `dx.chinh` | Chẩn đoán chính | coded (ICD-10) | B | diagnosis | Condition (encounter-diagnosis) | `EVALUATION.problem_diagnosis.v1` | |
| `dx.kem_theo` | Chẩn đoán kèm theo | coded (ICD-10) | T | diagnosis | Condition | `EVALUATION.problem_diagnosis.v1` | |
| `dx.do_chac_chan` | Mức độ chắc chắn | coded | B | diagnosis certainty | Condition.verificationStatus | | Sơ bộ / xác định |
| `followup.ngay_tai_kham` | Ngày tái khám | date | T | appointment hoặc obs | Appointment | | |

## 5. Chỉ định, đơn thuốc và thanh toán

| Mã trường | Nhãn | Kiểu | Bắt buộc | OpenMRS | FHIR R4 | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `order.cls` | Chỉ định CLS | coded | Đk | test order | ServiceRequest | Danh mục dịch vụ có mã dùng chung khi có |
| `result.cls` | Kết quả CLS | numeric/text/file | Đk | obs / attachment | Observation / DiagnosticReport | Đơn vị và khoảng tham chiếu |
| `rx.thuoc` | Thuốc | coded | B | drug order | MedicationRequest.medication | Tên hoạt chất, hàm lượng, dạng bào chế |
| `rx.lieu_dung` | Liều, cách dùng | structured + text | B | drug order | MedicationRequest.dosageInstruction | |
| `rx.so_luong` | Số lượng | numeric | B | drug order | MedicationRequest.dispenseRequest | |
| `rx.so_ngay` | Số ngày dùng | numeric | B | drug order | MedicationRequest.dispenseRequest | |
| `rx.loi_dan` | Lời dặn | text | T | obs / order | MedicationRequest.note | |
| `bill.dich_vu` | Dịch vụ tính phí | coded | B | billing line item | ChargeItem (nếu dùng) | Bảng giá do từng cơ sở cấu hình |
| `bill.so_tien` | Số tiền | numeric | B | billing | | Đơn vị VND, không có phần thập phân |
| `bill.trang_thai` | Trạng thái thanh toán | coded | B | billing | | Chưa thu / đã thu / hoàn / hủy |

## 6. Việc tiếp theo

- [ ] Mentor xác nhận tập trường sinh hiệu, khám, dị ứng.
- [ ] Chọn danh mục ICD-10, thuốc, dịch vụ và ghi nguồn/phiên bản (DATA-03).
- [ ] Điền concept UUID sau DATA-02.
- [ ] Người 4 kiểm tra cột FHIR bằng dữ liệu thật trên instance (INT-05).
- [ ] Đối chiếu cột openEHR trên CKM (DATA-10).
