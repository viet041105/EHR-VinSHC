# Changelog metadata VinSHC

## 0.2.0 — 11/10/2026

- Đối chiếu B2/B3 trên `origin/clinic-backend@9a16734`; tăng từ 165 lên 180 field, giữ toàn bộ 78 entity key/UUID và 8 unit/mã FE đang có.
- Chốt contacts[] 0..n, rowKey, primary/emergency/priority/void/Person link/provenance; code/name/version snapshot của quan hệ. 7 mã quan hệ là quy ước nội bộ version 1.0.0.
- Policy thiếu riêng cho 37 field patient/contact: forbidden / null_only / field_states; fieldCode/rowKey/context/source và không value+missing cùng lúc. Giữ PATCH omission.
- Giữ raw phone, chuẩn hóa riêng +84/international, không tự đoán bare digits/merge; chốt 4 identifier.system bằng URN UUID do dự án cấp.
- DATA-08: trích đủ bản gốc 34 tỉnh/thành + 3.321 đơn vị cấp xã từ hai phần Công báo 19/2025/QĐ-TTg; SHA/source/page/hiệu lực, giữ leading zeros và lịch sử. Chưa có conversion cũ-mới xác minh từ nguồn này; chưa chứng nhận mọi sửa đổi sau bản gốc.
- B3: 8 candidate LOINC đích 2.83, nguồn/type/method/ô duyệt; người dùng xác nhận pulse oximetry, vẫn chờ người duyệt thuật ngữ. Không nạp SAME-AS tự động.
- Chọn FHIR R4 BP panel/components; final R_NUM/R_POS/R_PERCENT/R_BP về cấu trúc/toán học; không thêm ngưỡng lâm sàng. Hai provider giả có identity/role/location/hiệu lực, chưa provision runtime.
- 47 ca giả B2/B3, validator cấu trúc và kiểm tra catalogue; overlay 0.2.0 -> 0.2.1 đổi label/note mạch có kiểm soát, giữ UUID/clinical semantics. CLI sinh lại CSV/map và các bảng; mọi thử clean/reimport/update runtime do BE nghiệm thu riêng.

## 0.2.1 — overlay thử cập nhật, chưa phải bản phát hành

Recipe tại `fixtures/update-label.json`, gắn hash chính xác của pack 0.2.0. `python tools/metadata.py --prepare-update .runtime/metadata-update-0.2.1` tạo bản riêng version 0.2.1; đổi label concept mạch thành “Mạch (lần/phút)” và note, giữ key/UUID/datatype/unit/member/answer/field. Thư mục đích phải mới. Không đổi gói chính hoặc đánh dấu Initializer update đã chạy.

## 0.1.0 - 2026-10-10

- Cụ thể hóa 165 field MVP-1/MVP-2 từ phạm vi repo, giữ survey S01 riêng.
- Cấp 78 entity UUID, gồm location synthetic có sẵn, identifier/attribute/type, concept/answer/obsGroup.
- Sinh CSV Initializer, map 8 sinh hiệu khớp FE, bảng Markdown và CSV trường.
- Bàn giao form spec, 8-role access contract, catalogue contracts và 28 structural cases + workflow scenarios.
- Validation cấu trúc; kiểm chứng import/round-trip/native API/quyền được ghi riêng theo từng lần chạy.

Không đưa ICD-10, thuốc, dịch vụ/giá hoặc tỉnh/xã chưa có nguồn/phiên bản vào metadata runtime. Không có số liệu/danh tính người bệnh thật trong fixture.
