# Changelog metadata VinSHC

## 0.3.0 — 11/10/2026

- Đối chiếu `clinic-backend@6c407f1`, tích hợp nền `main@53ba380`; tăng 180→205 field, giữ mã/kiểu/path trường và mọi entity key/UUID cũ; thêm 156 identity test (tổng 234). Enum lifecycle được đồng bộ có policy cho mã cũ bên dưới.
- Danh mục máy đọc thuốc/units/allergen/services/prices/diagnostics/facilities/providers/workflow/ICD; nguồn/phạm vi/phiên bản/hiệu lực/test approval rõ. 6 nhãn sản phẩm và 4 giá lịch sử từ S01, supplement synthetic; không sao chép người bệnh/nhân sự/liều điều trị thật.
- ICD allowlist 9 dòng từ phụ lục 06/2026/TT-BYT hiệu lực 01/07/2026; hai category E11/M10.9 không selectable theo restriction flags. Không tuyên bố đã import toàn bộ ICD quốc gia.
- Chốt contract diagnosis/allergy lifecycle, screening giữ history, prescription snapshot/revision/discontinue và partial dispense idempotency, VND snapshot/refund/pre-postpay, order/result revisions và upload proposal.
- Đồng bộ enum pack với contract mới: prescription confirmed/discontinued, order assigned/entered-in-error, result draft/entered-in-error, appointment booked/confirmed/fulfilled/no_show và certainty lowercase ở DTO. Native certainty uppercase giữ nguyên; `legacyCodePolicy` hướng dẫn đọc lịch sử 0.2.0, không suy cấp thuốc từ dispensed hoặc tự chuyển result.cancelled thành entered-in-error.
- 896 ô quyền cho 8 role/16 resource/7 action; CSV 8 role và 69 privilege stable UUID/name không inherited/broad Core privilege; server scope/projection/assignment enforcement vẫn do BE triển khai.
- 10 FHIR resource mappings/field paths, namespaces/4 extension draft, provider UUID khác Person/Practitioner UUID; giữ LOINC pending và BP B3. Không bật FHIR write chưa được baseline hỗ trợ.
- 9 đặc tả form, queue/appointment 2 cấu hình, 6 print schemas/payloads, daily revenue theo settled receipts/refunds/ngày Việt Nam/facility; CSV test ngoài live configuration và manifest adapter provisioning/SHA.
- 159 fixture B4–B9, 5 backend acceptance scenarios, 21 regression test mới (65 metadata tests tổng); patch CI validator/unit tests được bàn giao riêng vì token thiếu scope workflow. Không đánh dấu runtime/E2E/clean install/reimport/update đã đạt.

## 0.3.1 — overlay thử cập nhật, chưa phải bản phát hành

Recipe hiện tại `fixtures/update-label.json` pin SHA chính xác của pack 0.3.0. `python tools/metadata.py --prepare-update .runtime/metadata-update-0.3.1` tạo bản riêng trong thư mục mới, đổi nhãn/note mạch thành “Mạch (lần/phút)”; giữ key/UUID/datatype/unit/member/answer/field và ý nghĩa. Package/contracts tăng version; pinned catalogue/terminology/extension/print-template versions không đổi. Không tự import hoặc chỉnh gói chính.

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

Recipe lịch sử 0.2.0→0.2.1 đổi label/note mạch và giữ key/UUID/datatype/unit/member/answer/field. Recipe trong checkout hiện tại đã thay bằng 0.3.0→0.3.1 ở trên; dùng checkout/tag cũ để tái hiện bản 0.2.1, không dùng lệnh cũ cho gói mới.

## 0.1.0 - 2026-10-10

- Cụ thể hóa 165 field MVP-1/MVP-2 từ phạm vi repo, giữ survey S01 riêng.
- Cấp 78 entity UUID, gồm location synthetic có sẵn, identifier/attribute/type, concept/answer/obsGroup.
- Sinh CSV Initializer, map 8 sinh hiệu khớp FE, bảng Markdown và CSV trường.
- Bàn giao form spec, 8-role access contract, catalogue contracts và 28 structural cases + workflow scenarios.
- Validation cấu trúc; kiểm chứng import/round-trip/native API/quyền được ghi riêng theo từng lần chạy.

Không đưa ICD-10, thuốc, dịch vụ/giá hoặc tỉnh/xã chưa có nguồn/phiên bản vào metadata runtime. Không có số liệu/danh tính người bệnh thật trong fixture.
