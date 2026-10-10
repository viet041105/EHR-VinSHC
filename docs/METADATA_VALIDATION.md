# Kiểm chứng bộ metadata 0.1.0

**Ngày:** 10/10/2026 · **Baseline đối chiếu:** OpenMRS RefApp 3.7.1, Core 2.8.8, Initializer 2.12.0 · **Nhánh:** `role-3-metadata`.

## Đã chạy và đạt

| Kiểm tra | Kết quả |
| --- | --- |
| `python tools/metadata.py` | 165 field, 78 entity UUID, 11 file sinh đồng bộ, 28 fixture structural pass |
| `python -m unittest discover -s metadata/tests -v` | 18 test pass; bao gồm UUID đổi/duplicate, reference/member/source sai, unit lệch FE, thứ tự CSV, partial birthdate, trạng thái thiếu, value không hữu hạn, required, lý do đóng lượt và payload sai kiểu |
| `python scripts/check_config.py` | Pass baseline/config Docker đang giữ nguyên |
| `python -m unittest discover -s tests -v` | 21 regression test có sẵn pass |
| Đối chiếu Initializer upstream | Đã đọc docs/parser/test CSV tại tag 2.12.0, commit `3a970226eeb4b6233902f7b114a5e4616bf5a65a`; headers/domain/nested refs theo phiên bản đó |
| Đối chiếu FE | 8 mã field và UCUM unit khớp `VITAL_FIELD_MAP`; không sửa adapter/FE |
| Kiểm tra dữ liệu bàn giao | Fixture chỉ dùng dữ liệu giả. S01 chỉ dùng source row/nhãn/trang; PDF và giá trị người bệnh không đưa vào gói |

Gói tham chiếu một location có sẵn và sinh **77 đối tượng mới/quản lý bởi gói**: 4 identifier type, 2 visit type, 4 encounter type, 3 encounter role, 8 person attribute type và 56 concept (20 answer, 33 observation, 3 group). Concept UUID khác với UUID từng tên concept và không dùng database numeric ID.

## Chưa có bằng chứng runtime

Docker CLI không kết nối được engine Linux trên máy tại thời điểm kiểm tra; phép thử `docker version` timeout sau 15 giây. Không dựng project/volume kiểm chứng, không ghi hồ sơ lên instance đang dùng và không có báo cáo xác nhận Initializer import.

Những mục này **chưa đánh dấu đạt**:

- Nạp vào database mới, nạp lại không trùng, cập nhật nhãn và giữ UUID.
- Tạo/đọc lại patient–visit–encounter–obsGroup với dữ liệu giả; lịch sử qua restart.
- Native Diagnosis/Allergy/DrugOrder, partial birthdate trong luồng đăng ký thực tế.
- FHIR code/unit/time/BP panel và các resource ngoài smoke nền.
- 8 role/record-level scope/download/print; ma trận quyền là contract, không phải quyền đã được cấp.
- Form engine O3, catalogue ICD-10/thuốc/dịch vụ/địa giới và workflow MVP-2.

## Lần kiểm chứng tiếp theo

Theo [METADATA.md mục 7](METADATA.md#7-kiểm-tra-và-nạp), dùng Compose project test riêng. Sau khi build/khởi động, chạy `tools/metadata.py --verify-url` và ghi báo cáo dưới `.runtime/reports/`. Ghi thêm commit/version, số entity đọc lại, logs import đã che credential, test nạp lại/cập nhật và workflow pass/fail. Không dùng bảng structural pass ở trên để suy ra đã nghiệm thu nghiệp vụ.
