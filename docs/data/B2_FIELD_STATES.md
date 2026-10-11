# B2: trạng thái thiếu theo từng trường

Sinh từ pack.json/b2Missing. `forbidden`: không được thiếu khi điều kiện bắt buộc áp dụng. `null_only`: null được phép, cấm fieldStates. `field_states`: null phải có lý do được phép.

Mỗi fieldState có fieldCode, rowKey, context, dataStatus, source và recordedAt. rowKey=null chỉ cho patient singleton; các dòng contact/identifier/address dùng UUID ổn định. PATCH bỏ trường là giữ nguyên.

| Trường | Chế độ | Trạng thái được phép | Context / rowKey | Bắt buộc |
| --- | --- | --- | --- | --- |
| `patient.uuid` | forbidden |  | patient/null | server_generated |
| `patient.ma_noi_bo` | forbidden |  | patient/null | on_create |
| `patient.cccd` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | patient/null | optional |
| `patient.ma_bhxh` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | patient/null | optional |
| `patient.ma_bhyt` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | identifier/UUID | optional |
| `patient.ho_ten` | forbidden |  | patient/null | on_create |
| `patient.gioi_tinh` | forbidden |  | patient/null | on_create |
| `patient.ngay_sinh` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | patient/null | if_birth_precision_day |
| `patient.ngay_sinh_uoc_luong` | forbidden |  | patient/null | optional |
| `patient.ngay_sinh_nguon` | field_states | not_recorded, not_asked, unknown, refused, masked, unreadable | patient/null | optional |
| `patient.do_chinh_xac_ngay_sinh` | forbidden |  | patient/null | on_create |
| `patient.nam_sinh` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | patient/null | if_birth_precision_year_or_month |
| `patient.thang_sinh` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | patient/null | if_birth_precision_month |
| `patient.dien_thoai` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | patient/null | optional |
| `patient.nghe_nghiep` | field_states | not_recorded, not_asked, unknown, refused, masked, unreadable | patient/null | optional |
| `patient.dia_chi` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | address/UUID | optional |
| `patient.dia_chi_nguon` | field_states | not_recorded, not_asked, unknown, refused, masked, unreadable | patient/null | optional |
| `patient.dia_chi_cu` | field_states | not_recorded, not_asked, unknown, refused, masked, unreadable | patient/null | optional |
| `patient.dien_thoai_chuan_hoa` | null_only |  | patient/null | optional |
| `patient.trang_thai_chuan_hoa_dien_thoai` | forbidden |  | patient/null | on_create |
| `contact.ho_ten` | forbidden |  | contact/UUID | on_contact_create |
| `contact.quan_he` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | contact/UUID | optional |
| `contact.dien_thoai` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | contact/UUID | optional |
| `contact.dia_chi` | field_states | not_recorded, not_asked, unknown, refused, not_applicable, masked, unreadable | contact/UUID | optional |
| `contact.row_key` | forbidden |  | contact/UUID | on_contact_create |
| `contact.dien_thoai_chuan_hoa` | null_only |  | contact/UUID | optional |
| `contact.trang_thai_chuan_hoa_dien_thoai` | forbidden |  | contact/UUID | on_contact_create |
| `contact.uu_tien` | forbidden |  | contact/UUID | on_contact_create |
| `contact.lien_he_chinh` | forbidden |  | contact/UUID | on_contact_create |
| `contact.lien_he_khan_cap` | forbidden |  | contact/UUID | on_contact_create |
| `contact.trang_thai` | forbidden |  | contact/UUID | on_contact_create |
| `contact.person_lien_ket_uuid` | null_only |  | contact/UUID | optional |
| `contact.nguon` | forbidden |  | contact/UUID | on_contact_create |
| `contact.thoi_diem_ghi_nhan` | forbidden |  | contact/UUID | on_contact_create |
| `contact.ly_do_void` | null_only |  | contact/UUID | if_contact_void |
| `contact.quan_he_phien_ban` | null_only |  | contact/UUID | optional |
| `contact.quan_he_nhan` | null_only |  | contact/UUID | optional |
