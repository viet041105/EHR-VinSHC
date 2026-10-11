# Metadata chi tiết cho MVP ngoại trú

File sinh từ [pack.json](../../metadata/vinshc/pack.json); sửa nguồn rồi chạy `python tools/metadata.py --write`.

Nguồn S01 là nhãn/cấu trúc liên quan, không chứng minh field hệ thống tồn tại nguyên dạng trên PDF. `adapter_contract` là DTO bàn giao, chưa phải schema REST đã chạy.

Đọc cùng [hướng dẫn metadata](../METADATA.md) để hiểu required, trạng thái thiếu, validation, quan hệ và các phụ thuộc danh mục.

## patient

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `patient.uuid`<br>UUID bệnh nhân | uuid | server_generated / 1 | native: Patient.uuid | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `patient.ma_noi_bo`<br>Mã bệnh nhân nội bộ | text | on_create / 1 | identifier: Patient.identifiers[]<br>`ca12ea64-d279-5cce-a2a9-e2c46446ac34` | —<br>R_ID | K01 (tr. 1, 5) |
| `patient.cccd`<br>Số CCCD | text | optional / 0..1 | identifier: Patient.identifiers[]<br>`4e5406dc-8ff9-5486-98fa-5d95c6fe8233` | —<br>R_ID | K21 (tr. 1, 183) |
| Ghi chú | Chỉ loại CCCD 12 số; CMND/hộ chiếu là identifier type khác nếu nhóm mở rộng. | | | | |
| `patient.ma_bhxh`<br>Mã BHXH | text | optional / 0..1 | identifier: Patient.identifiers[]<br>`d7902062-a695-5bf3-8764-acf7f43e3238` | —<br>R_ID | MVP / hệ thống bổ sung |
| Ghi chú | Tách riêng BHXH và số thẻ BHYT; chưa hardcode quy tắc nghiệp vụ khi chưa có danh mục phiên bản. | | | | |
| `patient.ma_bhyt`<br>Số thẻ BHYT | text | optional / 0..n | identifier: Patient.identifiers[]<br>`e2b901c3-d442-565b-bff5-841aff260d2d` | —<br>R_ID | K24 (tr. 1, 5) |
| `patient.ho_ten`<br>Họ tên đầy đủ | text | on_create / 1 | native: Person.names[] | —<br>R_TEXT, R_ID | K04 (tr. 1, 5) |
| Ghi chú | Giữ tên hiển thị; adapter tách familyName/givenName/middleName, không đảo từ và không dùng tên làm khóa. | | | | |
| `patient.gioi_tinh`<br>Giới tính hành chính | coded | on_create / 1 | native: Person.gender | gender<br>R_CHOICE | K08 (tr. 1, 5) |
| Ghi chú | Adapter xác nhận M/F/O/U trên baseline; không suy từ tên. FHIR male/female/other/unknown là mapping đích. | | | | |
| `patient.ngay_sinh`<br>Ngày sinh đủ ngày | date | if_birth_precision_day / 0..1 | native: Person.birthdate | —<br>R_DATE, R_DOB | K05 (tr. 1) |
| `patient.ngay_sinh_uoc_luong`<br>Cờ ngày sinh ước lượng | boolean | optional / 0..1 | native: Person.birthdateEstimated | —<br>R_DOB | MVP / hệ thống bổ sung |
| `patient.ngay_sinh_nguon`<br>Ngày sinh nguyên văn | text | optional / 0..1 | person_attribute: person.attributes[].value<br>`a4e0addf-5506-52d0-a6a8-d139d663d251` | —<br>R_DOB | K05 (tr. 1); K06 (tr. 5) |
| `patient.do_chinh_xac_ngay_sinh`<br>Độ chính xác ngày sinh | coded | on_create / 1 | person_attribute: person.attributes[].value<br>`6abda66e-da8a-5cd6-bd91-fa4199332d9f` | birth_precision<br>R_CHOICE, R_DOB | K05 (tr. 1); K06 (tr. 5) |
| `patient.nam_sinh`<br>Năm sinh | integer | if_birth_precision_year_or_month / 0..1 | person_attribute: person.attributes[].value<br>`e87a0244-d7e5-5f32-915c-96be9320a0bb` | —<br>R_DOB | K06 (tr. 5) |
| `patient.thang_sinh`<br>Tháng sinh | integer | if_birth_precision_month / 0..1 | person_attribute: person.attributes[].value<br>`8a36009d-bebd-5d87-b625-f35f55e165d3` | —<br>R_DOB | K05 (tr. 1) |
| `patient.dien_thoai`<br>Điện thoại người bệnh | text | optional / 0..1 | person_attribute: person.attributes[].value<br>`1aeef034-d2a0-56b4-a4c8-d856f17dc261` | —<br>R_ID | MVP / hệ thống bổ sung |
| Ghi chú | Không lấy điện thoại người nhà K29 thay điện thoại người bệnh; chuỗi giữ +/0, xác minh riêng. | | | | |
| `patient.nghe_nghiep`<br>Nghề nghiệp nguyên văn | text | optional / 0..1 | person_attribute: person.attributes[].value<br>`f3dbdece-1705-5587-a3f9-eb492606fc8b` | —<br>R_TEXT | K09 (tr. 1, 5) |
| `patient.dia_chi`<br>Địa chỉ có cấu trúc | object | optional / 0..n | native: Person.addresses[] | —<br>R_ADDRESS | K15 (tr. 1); K16 (tr. 1); K17 (tr. 1); K19 (tr. 1) |
| Ghi chú | address1/cityVillage/stateProvince tương thích Core; mã tỉnh/xã và phiên bản cần extension/hierarchy được BE kiểm chứng. | | | | |
| `patient.dia_chi_nguon`<br>Địa chỉ nguyên văn | text | optional / 0..1 | person_attribute: person.attributes[].value<br>`b0591671-9096-5c68-a12b-a334646b8856` | —<br>R_ADDRESS | K20 (tr. 5) |
| `patient.dia_chi_cu`<br>Địa chỉ theo giấy tờ cũ | text | optional / 0..1 | person_attribute: person.attributes[].value<br>`3437b782-2af8-5e10-85fb-87b8335b0821` | —<br>R_ADDRESS | K18 (tr. 1); K20 (tr. 5) |
## contact

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `contact.ho_ten`<br>Tên người liên hệ | text | optional / 0..n | adapter_contract: PatientIdentity.contacts[].ho_ten | —<br>R_TEXT | K27 (tr. 1, 5) |
| Ghi chú | Quan hệ/contact lặp cần B2 chốt module/extension; không tạo Patient chỉ vì tên người nhà. | | | | |
| `contact.quan_he`<br>Quan hệ với bệnh nhân | text | optional / 0..n | adapter_contract: PatientIdentity.contacts[].quan_he | —<br>R_TEXT | K30 (tr. 125, 149) |
| Ghi chú | Quan hệ/contact lặp cần B2 chốt module/extension; không tạo Patient chỉ vì tên người nhà. | | | | |
| `contact.dien_thoai`<br>Điện thoại người liên hệ | text | optional / 0..n | adapter_contract: PatientIdentity.contacts[].dien_thoai | —<br>R_TEXT | K29 (tr. 1, 5) |
| Ghi chú | Quan hệ/contact lặp cần B2 chốt module/extension; không tạo Patient chỉ vì tên người nhà. | | | | |
| `contact.dia_chi`<br>Địa chỉ người liên hệ | text | optional / 0..n | adapter_contract: PatientIdentity.contacts[].dia_chi | —<br>R_TEXT | K28 (tr. 1, 5) |
| Ghi chú | Quan hệ/contact lặp cần B2 chốt module/extension; không tạo Patient chỉ vì tên người nhà. | | | | |
## visit

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `visit.uuid`<br>UUID lượt khám | uuid | server_generated / 1 | native: Visit.uuid | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `visit.patient_uuid`<br>Bệnh nhân của lượt | uuid | on_create / 1 | native: Visit.patient | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `visit.loai`<br>Loại lượt khám | coded | on_create / 1 | native: Visit.visitType | —<br>R_UUID | MVP / hệ thống bổ sung |
| `visit.co_so_uuid`<br>Cơ sở lượt khám | uuid | on_create / 1 | native: Visit.location | —<br>R_UUID, R_LINK | K31 (tr. 1, 5) |
| `visit.bat_dau`<br>Thời điểm bắt đầu lượt | datetime | on_create / 1 | native: Visit.startDatetime | —<br>R_TIME | K35 (tr. 5) |
| `visit.ket_thuc`<br>Thời điểm kết thúc lượt | datetime | on_close / 0..1 | native: Visit.stopDatetime | —<br>R_TIME | K49 (tr. 1, 183) |
| Ghi chú | Chỉ đóng sau xử lý workflow; stop không trước start. | | | | |
| `visit.trang_thai`<br>Đang mở / đã đóng | coded | optional / 0..1 | native: Derived from Visit.stopDatetime | —<br>R_FINAL | MVP / hệ thống bổ sung |
| Ghi chú | Trường suy ra, không ghi song song trạng thái khác với native stopDatetime. | | | | |
| `visit.ly_do_kham`<br>Lý do khám | text | on_consultation_finalize / 0..1 | obs: obs.value<br>`ce6ac27d-a555-5ddd-bd82-6dd575066adc` | —<br>R_TEXT, R_LINK | K52 (tr. 3, 5) |
| Ghi chú | Lưu trong encounter khám; tiếp đón dùng projection theo quyền, không đọc cả chart. | | | | |
| `visit.ly_do_ket_thuc`<br>Lý do kết thúc lượt | coded | on_close / 0..1 | obs: obs.value<br>`e54c1088-b2ad-534d-923e-8fb82019751f` | visit_close_reason<br>R_CHOICE, R_LINK | K50 (tr. 1) |
| `visit.ghi_chu_ket_thuc`<br>Ghi chú kết thúc/bỏ về/hủy | text | if_close_reason_not_completed / 0..1 | obs: obs.value<br>`b3ccfa9b-2d9e-5f86-8816-70a74f30e6cf` | —<br>R_TEXT, R_LINK | K50 (tr. 1) |
## encounter

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `encounter.uuid`<br>UUID lần ghi nhận | uuid | server_generated / 1 | native: Encounter.uuid | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `encounter.patient_uuid`<br>Bệnh nhân | uuid | on_create / 1 | native: Encounter.patient | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `encounter.visit_uuid`<br>Lượt khám | uuid | on_create / 1 | native: Encounter.visit | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `encounter.location_uuid`<br>Địa điểm ghi nhận | uuid | on_create / 1 | native: Encounter.location | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `encounter.loai`<br>Loại lần ghi nhận | coded | on_create / 1 | native: Encounter.encounterType | —<br>R_UUID, R_LINK | MVP / hệ thống bổ sung |
| `encounter.thoi_diem`<br>Thời điểm khám/đo | datetime | on_create / 1 | native: Encounter.encounterDatetime | —<br>R_TIME | K35 (tr. 5); DR001 (tr. 6-63) |
| `encounter.provider_uuid`<br>Người thực hiện chuyên môn | uuid | for_clinical_encounters / 1..n | native: Encounter.encounterProviders[].provider | —<br>R_UUID | K102 (tr. 2, 4, 5) |
| Ghi chú | Provider khác user tài khoản; mỗi dòng có encounterRole. | | | | |
| `encounter.role_uuid`<br>Vai trò người thực hiện | uuid | with_provider / 0..1 | native: Encounter.encounterProviders[].encounterRole | —<br>R_UUID | K102 (tr. 2, 4, 5) |
## vitals

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `vitals.mach`<br>Mạch | number / /min | optional / 0..1 | obs: obs.value<br>`263e4d0b-61d2-5517-bcb1-992cfb60675b` | —<br>R_NUM, R_POS | K72 (tr. 3, 5) |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.mach_trang_thai`<br>Mạch - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`1452453f-cf72-5b97-b366-7541414f42c9` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.ha_tam_thu`<br>Huyết áp tâm thu | number / mm[Hg] | optional / 0..1 | obs: obs.value<br>`f8da18ad-2e26-55cd-954b-51d6e0738815` | —<br>R_NUM, R_POS, R_BP | K74 (tr. 3, 5) |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.ha_tam_thu_trang_thai`<br>Huyết áp tâm thu - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`a0e3f46e-b74e-5bcd-85b5-c8a3a385b964` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.ha_tam_truong`<br>Huyết áp tâm trương | number / mm[Hg] | optional / 0..1 | obs: obs.value<br>`f97478e4-cce6-5cc5-89fa-cfd10bfe8794` | —<br>R_NUM, R_POS, R_BP | K75 (tr. 3, 5) |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.ha_tam_truong_trang_thai`<br>Huyết áp tâm trương - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`3f3c8a87-d446-59ba-a877-c03a1dcf82c0` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.nhiet_do`<br>Nhiệt độ | number / Cel | optional / 0..1 | obs: obs.value<br>`55a6de05-e371-5a48-9440-a81d7ef2e364` | —<br>R_NUM, R_NUM | K73 (tr. 3, 5) |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.nhiet_do_trang_thai`<br>Nhiệt độ - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`78f5da85-8751-5492-a6a5-e5bdb1d61ea3` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.nhip_tho`<br>Nhịp thở | number / /min | optional / 0..1 | obs: obs.value<br>`b82f1a4a-bbc9-55f0-8204-079bf1130457` | —<br>R_NUM, R_POS | K76 (tr. 3, 5) |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.nhip_tho_trang_thai`<br>Nhịp thở - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`d3aa7eda-24b2-573b-91ad-1c8c4cdf8f57` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.spo2`<br>SpO2 | number / % | optional / 0..1 | obs: obs.value<br>`4ebf4ddf-fcbe-5bed-893b-114d6ec5f739` | —<br>R_NUM, R_PERCENT | MVP / hệ thống bổ sung |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. Mã 59408-5 chỉ phù hợp pulse oximetry; xác nhận phương pháp trước mapping SAME-AS, không suy từ nhãn SpO2. | | | | |
| `vitals.spo2_trang_thai`<br>SpO2 - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`7002d377-77a5-5914-bcbc-90ddd8c5d47e` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.can_nang`<br>Cân nặng | number / kg | optional / 0..1 | obs: obs.value<br>`88853161-b7db-5a20-b5c5-666b69999a25` | —<br>R_NUM, R_POS | K77 (tr. 3, 5) |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.can_nang_trang_thai`<br>Cân nặng - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`6ad2f977-bd1a-5a3e-9f61-53a13c624a38` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.chieu_cao`<br>Chiều cao | number / cm | optional / 0..1 | obs: obs.value<br>`e13865bd-3100-5aca-8e82-e8a6fb58321d` | —<br>R_NUM, R_POS | MVP / hệ thống bổ sung |
| Ghi chú | Lặp theo nhóm/lần đo; ngưỡng bình thường/cảnh báo không cấu hình khi chưa có quy tắc lâm sàng. | | | | |
| `vitals.chieu_cao_trang_thai`<br>Chiều cao - trạng thái dữ liệu | coded | optional / 0..1 | obs: obs.value<br>`a66b0680-1700-587e-9293-f62634761b4c` | data_status<br>R_CHOICE, R_MISSING | MVP / hệ thống bổ sung |
| Ghi chú | Đi với giá trị cùng nhóm. Không có obs giá trị khi trạng thái khác recorded. | | | | |
| `vitals.thoi_diem_do`<br>Thời điểm đo | datetime | with_vitals_group / 1 | native: Obs.obsDatetime | —<br>R_TIME | K72 (tr. 3, 5); K73 (tr. 3, 5) |
| Ghi chú | Cùng thời điểm cho nhóm và các thành viên; tách dateCreated. | | | | |
## history

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `history.benh_su`<br>Bệnh sử / quá trình bệnh lý | text | optional / 0..1 | obs: obs.value<br>`c331d296-34b5-55ba-891f-094eadc1a2fc` | —<br>R_TEXT, R_LINK | K54 (tr. 3, 5) |
| `history.tien_su_ban_than_trang_thai`<br>Trạng thái tiền sử bản thân | coded | optional / 0..1 | obs: obs.value<br>`784c30c7-ccfc-5cf8-acb8-fbd50a583950` | history_status<br>R_CHOICE, R_HISTORY | K55 (tr. 3, 5) |
| `history.tien_su_ban_than`<br>Tiền sử bản thân | text | if_personal_history_present / 0..1 | obs: obs.value<br>`93f6d05e-cddd-5583-a22a-9f9e42ece100` | —<br>R_HISTORY | K55 (tr. 3, 5) |
| `history.tien_su_gia_dinh_trang_thai`<br>Trạng thái tiền sử gia đình | coded | optional / 0..1 | obs: obs.value<br>`93c7f2b7-2d10-5f92-a0c1-7ef3fa25a504` | history_status<br>R_CHOICE, R_HISTORY | K56 (tr. 3, 5) |
| `history.tien_su_gia_dinh`<br>Tiền sử gia đình | text | if_family_history_present / 0..1 | obs: obs.value<br>`4ebc119d-8d35-5473-9260-1c916d3b5bca` | —<br>R_HISTORY | K56 (tr. 3, 5) |
## exam

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `exam.trieu_chung`<br>Triệu chứng người bệnh kể | text | optional / 0..1 | obs: obs.value<br>`7e32942f-1118-517c-ada7-4792b19ad7a5` | —<br>R_TEXT, R_LINK | K54 (tr. 3, 5) |
| `exam.toan_than`<br>Khám toàn thân | text | optional / 0..1 | obs: obs.value<br>`796a194b-2788-5425-8246-2cfee4a22361` | —<br>R_TEXT, R_LINK | K60 (tr. 3, 5) |
| `exam.bo_phan`<br>Khám các bộ phận | text | optional / 0..1 | obs: obs.value<br>`11b9a3fe-13aa-5b06-912a-da794a785771` | —<br>R_TEXT, R_LINK | K71 (tr. 5) |
| Ghi chú | Bản MVP văn bản, không tự triển khai thang điểm/tất cả chuyên khoa trong S01. | | | | |
| `exam.tom_tat`<br>Tóm tắt kết quả khám | text | optional / 0..1 | obs: obs.value<br>`bd983586-db24-5e35-9822-d08ea8ebbf30` | —<br>R_TEXT, R_LINK | K78 (tr. 4, 5) |
| `exam.huong_dieu_tri`<br>Hướng điều trị | text | optional / 0..1 | obs: obs.value<br>`3c89f03a-d6b8-5dcc-941d-b57af6718eb2` | —<br>R_TEXT, R_LINK | K93 (tr. 4) |
| `exam.loi_dan`<br>Lời dặn | text | optional / 0..1 | obs: obs.value<br>`d4b6c86d-4dd7-5339-b4de-2c75b267e2bd` | —<br>R_TEXT, R_LINK | RX015 (tr. 115-123) |
## allergy

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `allergy.trang_thai`<br>Trạng thái sàng lọc dị ứng | coded | on_consultation_finalize / 0..1 | obs: obs.value<br>`2351112f-d130-58d9-a55b-8d1f7d6872eb` | allergy_status<br>R_CHOICE, R_ALLERGY | K57 (tr. 3); K58 (tr. 3) |
| `allergy.uuid`<br>UUID dị ứng | uuid | optional / 0..n | adapter_contract: Allergy.uuid | —<br>R_ALLERGY, R_LINK | K57 (tr. 3) |
| Ghi chú | Mã severity/reaction từ dictionary đã duyệt; không tự tạo từ triệu chứng hay chấm mức độ. | | | | |
| `allergy.tac_nhan`<br>Tác nhân dị ứng | object | if_allergy_present / 0..n | adapter_contract: Allergy.allergen | —<br>R_ALLERGY, R_LINK | K57 (tr. 3) |
| Ghi chú | Mã severity/reaction từ dictionary đã duyệt; không tự tạo từ triệu chứng hay chấm mức độ. | | | | |
| `allergy.phan_ung`<br>Phản ứng ghi nhận | array | optional / 0..n | adapter_contract: Allergy.reactions | —<br>R_ALLERGY, R_LINK | K57 (tr. 3) |
| Ghi chú | Mã severity/reaction từ dictionary đã duyệt; không tự tạo từ triệu chứng hay chấm mức độ. | | | | |
| `allergy.muc_do`<br>Mức độ ghi nhận | object | optional / 0..n | adapter_contract: Allergy.severity | —<br>R_ALLERGY, R_LINK | K57 (tr. 3) |
| Ghi chú | Mã severity/reaction từ dictionary đã duyệt; không tự tạo từ triệu chứng hay chấm mức độ. | | | | |
| `allergy.ghi_chu`<br>Ghi chú dị ứng | text | optional / 0..n | adapter_contract: Allergy.comment | —<br>R_ALLERGY, R_LINK | K57 (tr. 3) |
| Ghi chú | Mã severity/reaction từ dictionary đã duyệt; không tự tạo từ triệu chứng hay chấm mức độ. | | | | |
## dx

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `dx.chinh`<br>Chẩn đoán chính | object | on_consultation_finalize / 0..1 | adapter_contract: Diagnosis.primary | —<br>R_DX, R_LINK | K83 (tr. 1, 4) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. Chính/kèm theo là DTO ứng dụng; native Diagnosis có một bản ghi mỗi dòng và primary/rank phải được adapter xác nhận. | | | | |
| `dx.kem_theo`<br>Chẩn đoán kèm theo | array | optional / 0..n | adapter_contract: Diagnosis.secondary[] | —<br>R_DX, R_LINK | K84 (tr. 1, 4) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. | | | | |
| `dx.ma`<br>Mã chẩn đoán | text | optional / 0..1 | adapter_contract: Diagnosis.diagnosis.coded | —<br>R_DX, R_LINK | K87 (tr. 1, 5) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. | | | | |
| `dx.ten_nguon`<br>Tên chẩn đoán nguồn | text | optional / 0..1 | adapter_contract: Diagnosis.diagnosis.nonCoded | —<br>R_DX, R_LINK | K81 (tr. 1); K82 (tr. 1, 4) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. | | | | |
| `dx.he_ma`<br>Hệ mã và phiên bản | object | optional / 0..1 | adapter_contract: Diagnosis.codeSystem | —<br>R_DX, R_LINK | K87 (tr. 1, 5) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. | | | | |
| `dx.do_chac_chan`<br>Mức chắc chắn | coded | on_consultation_finalize / 0..1 | adapter_contract: Diagnosis.certainty | diagnosis_certainty<br>R_DX, R_LINK | K85 (tr. 4) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. | | | | |
| `dx.vai_tro`<br>Chính/kèm theo | coded | on_consultation_finalize / 0..1 | adapter_contract: Diagnosis.rank | diagnosis_rank<br>R_DX, R_LINK | K83 (tr. 1, 4); K84 (tr. 1, 4) |
| Ghi chú | Dùng diagnosis native sau B4, không lưu chẩn đoán xác định bằng free-text obs để thay API diagnosis. | | | | |
## followup

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `followup.ngay_tai_kham`<br>Ngày dự kiến tái khám | date | optional / 0..1 | obs: obs.value<br>`16686840-88fc-514a-b30a-81bc1c7650c9` | —<br>R_DATE, R_LINK | RX016 (tr. 123) |
| Ghi chú | Ngày đã chọn rõ; chưa có giờ/slot không tạo Appointment. | | | | |
| `followup.loi_dan`<br>Điều kiện/lời dặn tái khám | text | optional / 0..1 | obs: obs.value<br>`3dcc4c83-5342-5adc-87da-b8e9783bd367` | —<br>R_TEXT, R_LINK | RX017 (tr. 123) |
## rx

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `rx.uuid`<br>UUID dòng thuốc | uuid | optional / 0..n | adapter_contract: DrugOrder.uuid | —<br>R_RX, R_LINK | RX002 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.thuoc`<br>Chế phẩm thuốc | uuid | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.drug | —<br>R_RX, R_LINK | RX009 (tr. 115-123); RX010 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.lieu_dung`<br>Liều mỗi lần | number | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.dose | —<br>R_RX, R_POS, R_LINK | YL011 (tr. 6-63) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.don_vi_lieu`<br>Đơn vị liều | uuid | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.doseUnits | —<br>R_RX, R_LINK | YL011 (tr. 6-63) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.duong_dung`<br>Đường dùng | uuid | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.route | —<br>R_RX, R_LINK | YL010 (tr. 6-63) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.tan_suat`<br>Tần suất | uuid | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.frequency | —<br>R_RX, R_LINK | YL012 (tr. 6-63) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.huong_dan_nguon`<br>Hướng dẫn dùng nguyên văn | text | optional / 0..n | adapter_contract: DrugOrder.dosingInstructions | —<br>R_RX, R_LINK | RX013 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.so_luong`<br>Số lượng kê/cấp | number | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.quantity | —<br>R_RX, R_POS, R_LINK | RX011 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.don_vi_so_luong`<br>Đơn vị cấp | uuid | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.quantityUnits | —<br>R_RX, R_LINK | RX012 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.so_ngay`<br>Thời gian dùng | integer | optional / 0..n | adapter_contract: DrugOrder.duration | —<br>R_RX, R_LINK, R_POS | RX023 (tr. 115-123) |
| Ghi chú | Số ngày = duration + durationUnits ngày; không suy từ số viên. | | | | |
| `rx.don_vi_thoi_gian`<br>Đơn vị thời gian dùng | uuid | optional / 0..n | adapter_contract: DrugOrder.durationUnits | —<br>R_RX, R_LINK | RX023 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.bat_dau`<br>Thời điểm bắt đầu dùng | datetime | optional / 0..n | adapter_contract: DrugOrder.dateActivated | —<br>R_RX, R_LINK | RX023 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.ket_thuc`<br>Thời điểm kết thúc kê | datetime | optional / 0..n | adapter_contract: DrugOrder.autoExpireDate | —<br>R_RX, R_LINK | RX023 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.nguoi_ke_uuid`<br>Người kê | uuid | on_prescription_confirm / 0..n | adapter_contract: DrugOrder.orderer | —<br>R_RX, R_LINK | RX006 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.loi_dan`<br>Lời dặn đơn thuốc | text | optional / 0..1 | adapter_contract: PrescriptionSnapshot.note | —<br>R_RX, R_LINK | RX015 (tr. 115-123) |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
| `rx.trang_thai`<br>Trạng thái đơn | coded | optional / 0..1 | adapter_contract: PrescriptionSnapshot.status | prescription_status<br>R_RX, R_LINK | MVP / hệ thống bổ sung |
| Ghi chú | Schema native DrugOrder cần B4 xác nhận với careSetting, orderType, urgency, dosingType. | | | | |
## order

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `order.uuid`<br>UUID chỉ định | uuid | on_order_create / 0..1 | adapter_contract: Order.uuid | —<br>R_ORDER, R_LINK | CD001 (tr. 64-73) |
| `order.dich_vu`<br>Mã dịch vụ | uuid | on_order_create / 0..1 | adapter_contract: Order.concept | —<br>R_ORDER, R_LINK | CD017 (tr. 64-73) |
| `order.patient_uuid`<br>Bệnh nhân của chỉ định | uuid | on_order_create / 0..1 | adapter_contract: Order.patient | —<br>R_ORDER, R_LINK | MVP / hệ thống bổ sung |
| `order.encounter_uuid`<br>Lần khám ra chỉ định | uuid | on_order_create / 0..1 | adapter_contract: Order.encounter | —<br>R_ORDER, R_LINK | MVP / hệ thống bổ sung |
| `order.thoi_diem`<br>Thời điểm chỉ định | datetime | on_order_create / 0..1 | adapter_contract: Order.dateActivated | —<br>R_ORDER, R_LINK, R_TIME | LB008 (tr. 102-104) |
| `order.uu_tien`<br>Ưu tiên chỉ định | coded | on_order_create / 0..1 | adapter_contract: Order.urgency | priority<br>R_ORDER, R_LINK | LB004 (tr. 100-101) |
| `order.nguoi_thuc_hien_uuid`<br>KTV/đơn vị được giao | uuid | on_order_create / 0..1 | adapter_contract: OrderAssignment.assignee | —<br>R_ORDER, R_LINK | MVP / hệ thống bổ sung |
| `order.trang_thai`<br>Trạng thái thực hiện | coded | on_order_create / 0..1 | adapter_contract: OrderExecution.status | order_status<br>R_ORDER, R_LINK | MVP / hệ thống bổ sung |
## result

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `result.order_uuid`<br>Chỉ định liên quan | uuid | on_result_save / 0..n | adapter_contract: Result.order | —<br>R_ORDER, R_FINAL | LB003 (tr. 100-101) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.chi_so`<br>Concept chỉ số | uuid | on_result_save / 0..n | adapter_contract: Obs.concept | —<br>R_ORDER, R_FINAL | LB016 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.kieu_gia_tri`<br>Kiểu giá trị | coded | on_result_save / 0..n | adapter_contract: Result.valueType | result_type<br>R_ORDER, R_FINAL | LB018 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.gia_tri_so`<br>Kết quả số | number | optional / 0..n | adapter_contract: Obs.valueNumeric | —<br>R_ORDER, R_FINAL, R_NUM | LB019 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.gia_tri_nguon`<br>Kết quả nguyên văn | text | optional / 0..n | adapter_contract: Result.rawValue | —<br>R_ORDER, R_FINAL | LB017 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.don_vi`<br>Đơn vị nguồn và mã UCUM | object | optional / 0..n | adapter_contract: Result.unit | —<br>R_ORDER, R_FINAL | LB020 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.khoang_tham_chieu`<br>Khoảng tham chiếu theo phiếu | text | optional / 0..n | adapter_contract: Result.referenceText | —<br>R_ORDER, R_FINAL | LB021 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.lay_mau_luc`<br>Thời điểm lấy mẫu | datetime | optional / 0..n | adapter_contract: Result.collectedAt | —<br>R_ORDER, R_FINAL, R_TIME | LB010 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.ket_qua_luc`<br>Thời điểm kết quả | datetime | optional / 0..n | adapter_contract: Obs.obsDatetime | —<br>R_ORDER, R_FINAL, R_TIME | LB014 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.nguoi_duyet_uuid`<br>Người duyệt kết quả | uuid | optional / 0..n | adapter_contract: Result.verifiedBy | —<br>R_ORDER, R_FINAL | LB013 (tr. 100-104) |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.trang_thai`<br>Trạng thái kết quả | coded | optional / 0..n | adapter_contract: Result.status | result_status<br>R_ORDER, R_FINAL | MVP / hệ thống bổ sung |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
| `result.tep_uuid`<br>Tài liệu kết quả | uuid | optional / 0..n | adapter_contract: Result.document | —<br>R_ORDER, R_FINAL | MVP / hệ thống bổ sung |
| Ghi chú | Khoảng tham chiếu thuộc phiếu/phương pháp, không phải giới hạn nhập hoặc kết luận của hệ thống. | | | | |
## document

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `document.uuid`<br>UUID tài liệu | uuid | optional / 0..1 | adapter_contract: ClinicalDocument.uuid | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.patient_uuid`<br>Bệnh nhân tài liệu | uuid | on_upload / 0..1 | adapter_contract: ClinicalDocument.patient_uuid | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.visit_uuid`<br>Lượt khám liên quan | uuid | optional / 0..1 | adapter_contract: ClinicalDocument.visit_uuid | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.loai`<br>Loại tài liệu | text | optional / 0..1 | adapter_contract: ClinicalDocument.loai | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.mime`<br>MIME type | text | on_upload / 0..1 | adapter_contract: ClinicalDocument.mime | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.kich_thuoc`<br>Kích thước byte | integer | on_upload / 0..1 | adapter_contract: ClinicalDocument.kich_thuoc | —<br>R_FILE, R_PROVENANCE, R_FINAL, R_POS | MVP / hệ thống bổ sung |
| `document.sha256`<br>Hash SHA-256 | text | on_upload / 0..1 | adapter_contract: ClinicalDocument.sha256 | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.trang_thai`<br>Trạng thái tài liệu | coded | optional / 0..1 | adapter_contract: ClinicalDocument.trang_thai | document_status<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `document.phien_ban`<br>Phiên bản tài liệu | text | optional / 0..1 | adapter_contract: ClinicalDocument.phien_ban | —<br>R_FILE, R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
## appointment

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `appointment.uuid`<br>UUID lịch hẹn | uuid | on_appointment_create / 0..1 | adapter_contract: Appointment.uuid | —<br>R_UUID, R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
| `appointment.patient_uuid`<br>Bệnh nhân lịch hẹn | uuid | on_appointment_create / 0..1 | adapter_contract: Appointment.patient_uuid | —<br>R_UUID, R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
| `appointment.provider_uuid`<br>Người khám | uuid | on_appointment_create / 0..1 | adapter_contract: Appointment.provider_uuid | —<br>R_UUID, R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
| `appointment.location_uuid`<br>Cơ sở/phòng | uuid | on_appointment_create / 0..1 | adapter_contract: Appointment.location_uuid | —<br>R_UUID, R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
| `appointment.bat_dau`<br>Giờ bắt đầu hẹn | datetime | on_appointment_create / 0..1 | adapter_contract: Appointment.bat_dau | —<br>R_TIME, R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
| `appointment.ket_thuc`<br>Giờ kết thúc hẹn | datetime | on_appointment_create / 0..1 | adapter_contract: Appointment.ket_thuc | —<br>R_TIME, R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
| `appointment.trang_thai`<br>Trạng thái lịch hẹn | coded | on_appointment_create / 0..1 | adapter_contract: Appointment.trang_thai | appointment_status<br>R_CHOICE | MVP / hệ thống bổ sung |
| Ghi chú | Tên DTO, không giả là endpoint/enum native Appointments. Người 4 sở hữu cấu hình dịch vụ/queue và slot. | | | | |
## bill

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `bill.uuid`<br>UUID phiếu phí | uuid | on_bill_create / 1 | adapter_contract: Bill.uuid | —<br>R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.patient_uuid`<br>Người bệnh thanh toán | uuid | on_bill_create / 1 | adapter_contract: Bill.patient_uuid | —<br>R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.visit_uuid`<br>Lượt của phiếu phí | uuid | on_bill_create / 1 | adapter_contract: Bill.visit_uuid | —<br>R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.dich_vu`<br>Mã dịch vụ dòng phí | uuid | on_bill_create / 1..n | adapter_contract: Bill.dich_vu | —<br>R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.ten_snapshot`<br>Tên dịch vụ lúc lập phí | text | on_bill_create / 1..n | adapter_contract: Bill.ten_snapshot | —<br>R_NATIVE | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.so_luong`<br>Số lượng dịch vụ | number | on_bill_create / 1..n | adapter_contract: Bill.so_luong | —<br>R_POS | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.don_gia`<br>Đơn giá VND snapshot | integer | on_bill_create / 1..n | adapter_contract: Bill.don_gia | —<br>R_MONEY | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.so_tien`<br>Thành tiền VND | integer | on_bill_create / 1 | adapter_contract: Bill.so_tien | —<br>R_MONEY | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
| `bill.trang_thai`<br>Trạng thái thu | coded | on_bill_create / 1 | adapter_contract: Bill.trang_thai | bill_status<br>R_CHOICE, R_PAY | MVP / hệ thống bổ sung |
| Ghi chú | Snapshot giá có hiệu lực lúc lập; quy tắc làm tròn khi số lượng lẻ do cơ sở chốt, không hardcode. | | | | |
## payment

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `payment.uuid`<br>UUID giao dịch | uuid | server_generated / 0..1 | adapter_contract: PaymentTransaction.uuid | —<br>R_PAY | FI004 (tr. 147, 184-185) |
| `payment.bill_uuid`<br>Phiếu phí liên quan | uuid | on_payment / 0..1 | adapter_contract: PaymentTransaction.bill_uuid | —<br>R_PAY | MVP / hệ thống bổ sung |
| `payment.loai`<br>Thu / hoàn | coded | on_payment / 0..1 | adapter_contract: PaymentTransaction.loai | payment_kind<br>R_PAY | FI010 (tr. 147, 184-185) |
| `payment.so_tien`<br>Tiền giao dịch VND | integer | on_payment / 0..1 | adapter_contract: PaymentTransaction.so_tien | —<br>R_PAY, R_MONEY | FI012 (tr. 147) |
| `payment.thoi_diem`<br>Thời điểm giao dịch | datetime | on_payment / 0..1 | adapter_contract: PaymentTransaction.thoi_diem | —<br>R_PAY, R_TIME | FI008 (tr. 147, 184-185) |
| Ghi chú | Server ghi thời điểm giao dịch; không tin thời gian khách tự gửi làm timestamp thu tiền. | | | | |
| `payment.giao_dich_goc_uuid`<br>Giao dịch bị hoàn | uuid | if_refund / 0..1 | adapter_contract: PaymentTransaction.giao_dich_goc_uuid | —<br>R_PAY | MVP / hệ thống bổ sung |
| `payment.ly_do`<br>Lý do hoàn/hủy | text | if_refund / 0..1 | adapter_contract: PaymentTransaction.ly_do | —<br>R_PAY | FI011 (tr. 147) |
| `payment.idempotency_key`<br>Khóa chống giao dịch trùng | text | on_payment / 0..1 | adapter_contract: PaymentTransaction.idempotency_key | —<br>R_PAY | MVP / hệ thống bổ sung |
## dispense

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `dispense.uuid`<br>UUID lần cấp thuốc | uuid | on_dispense_confirm / 0..1 | adapter_contract: Dispense.uuid | —<br>R_RX, R_PAY, R_LINK | MVP / hệ thống bổ sung |
| Ghi chú | Không sửa đơn bác sĩ; cấp một lần theo snapshot MVP hiện có. Cấp một phần/lô/tồn cần hợp đồng mở rộng. | | | | |
| `dispense.drug_order_uuid`<br>Dòng đơn đã xác nhận | uuid | on_dispense_confirm / 0..1 | adapter_contract: Dispense.drug_order_uuid | —<br>R_RX, R_PAY, R_LINK | MVP / hệ thống bổ sung |
| Ghi chú | Không sửa đơn bác sĩ; cấp một lần theo snapshot MVP hiện có. Cấp một phần/lô/tồn cần hợp đồng mở rộng. | | | | |
| `dispense.so_luong`<br>Số lượng thực cấp | number | on_dispense_confirm / 0..1 | adapter_contract: Dispense.so_luong | —<br>R_RX, R_PAY, R_LINK, R_POS | MVP / hệ thống bổ sung |
| Ghi chú | Không sửa đơn bác sĩ; cấp một lần theo snapshot MVP hiện có. Cấp một phần/lô/tồn cần hợp đồng mở rộng. | | | | |
| `dispense.nguoi_cap_uuid`<br>Người cấp | uuid | on_dispense_confirm / 0..1 | adapter_contract: Dispense.nguoi_cap_uuid | —<br>R_RX, R_PAY, R_LINK | MVP / hệ thống bổ sung |
| Ghi chú | Không sửa đơn bác sĩ; cấp một lần theo snapshot MVP hiện có. Cấp một phần/lô/tồn cần hợp đồng mở rộng. | | | | |
| `dispense.thoi_diem`<br>Thời điểm cấp | datetime | on_dispense_confirm / 0..1 | adapter_contract: Dispense.thoi_diem | —<br>R_RX, R_PAY, R_LINK, R_TIME | MVP / hệ thống bổ sung |
| Ghi chú | Không sửa đơn bác sĩ; cấp một lần theo snapshot MVP hiện có. Cấp một phần/lô/tồn cần hợp đồng mở rộng. | | | | |
| `dispense.idempotency_key`<br>Khóa chống cấp trùng | text | on_dispense_confirm / 0..1 | adapter_contract: Dispense.idempotency_key | —<br>R_RX, R_PAY, R_LINK | MVP / hệ thống bổ sung |
| Ghi chú | Không sửa đơn bác sĩ; cấp một lần theo snapshot MVP hiện có. Cấp một phần/lô/tồn cần hợp đồng mở rộng. | | | | |
## provenance

| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |
| --- | --- | --- | --- | --- | --- |
| `provenance.nguoi_nhap_uuid`<br>Người nhập | uuid | optional / 0..1 | adapter_contract: Audit.creator | —<br>R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `provenance.nhap_luc`<br>Thời điểm nhập | datetime | optional / 0..1 | adapter_contract: Audit.dateCreated | —<br>R_PROVENANCE, R_FINAL, R_TIME | MVP / hệ thống bổ sung |
| `provenance.nguon_tai_lieu_uuid`<br>Tài liệu nguồn | uuid | optional / 0..1 | adapter_contract: Provenance.document | —<br>R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `provenance.trang_nguon`<br>Trang vật lý trong nguồn | integer | optional / 0..1 | adapter_contract: Provenance.page | —<br>R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `provenance.ma_truong_nguon`<br>Mã khảo sát trường nguồn | text | optional / 0..1 | adapter_contract: Provenance.sourceField | —<br>R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `provenance.trang_thai_xac_minh`<br>Trạng thái xác minh | coded | optional / 0..1 | adapter_contract: Provenance.reviewStatus | review_status<br>R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
| `provenance.ly_do_sua`<br>Lý do sửa | text | optional / 0..1 | adapter_contract: Audit.reason | —<br>R_PROVENANCE, R_FINAL | MVP / hệ thống bổ sung |
