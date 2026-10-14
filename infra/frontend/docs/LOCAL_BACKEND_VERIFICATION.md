# Đối chiếu bản sửa BE trên máy local

Kiểm tra ngày 13/10/2026, sau khi fetch `origin/main`. Chỉ thêm tài liệu trong FE;
không sửa source BE, metadata nguồn hoặc cấu hình baseline tại root.

## Bản đang chạy

- `origin/main`: `d9d5b957223f6bc73db173dbbc1d413910689526`, commit
  `fix(backend): harden VinSHC adapter after backend review (#12)`.
- Commit này chứa bản sửa của review `873e37d`, đúng báo cáo
  [REVIEW_BE.md mục 9](../../docs/REVIEW_BE.md#9-kết-quả-khắc-phục).
- Runtime `infra/frontend/.runtime/backend` và nguồn metadata FE khóa cùng commit.
- Image đang chạy: `vinshc-fe-local-backend:main-d9d5b95`, image ID
  `sha256:ec11f26aca66c6a31992b30cf08e947fce685e3caa4cb91ae881e9bc88740aa8`.
- Module `/openmrs/data/modules/vinshc-0.3.0.omod` có SHA-256
  `a5481f05cfe1ab754d713011a81e8b15c7a332057e6f9c580277cd3d8f335557`,
  trùng file module trong `/openmrs/distribution/openmrs_modules/` của image.
  Tên module `0.3.0` không có nghĩa đang chạy code trước bản sửa `0.3.1`.

## Kiểm tra trực tiếp trên stack đang dùng

| Kiểm tra | Kết quả |
| --- | --- |
| Liquibase `vinshc-0.3.1-review-fixes` | `EXECUTED` |
| Liquibase `vinshc-0.3.1-timestamptz` | `EXECUTED` |
| Index mới từ changeset review | Đủ 9/9 |
| `vinshc_service_order.state_reason` | Đã tồn tại |
| `date_created` của contact, field_state, address_snapshot | Cả 3 là `timestamp with time zone` |
| GET `/vinshc/operations/configuration` không đăng nhập | HTTP 401, `error=unauthenticated` |
| GET `/vinshc/identity/{uuid}` không đăng nhập | HTTP 401, `error=unauthenticated` |
| `npm run test:live` | PASS: FE → gateway → OpenMRS → PostgreSQL, admin/workspace, tìm user, audit, báo cáo và metadata |
| `npm run test:api` | Caller FE bao phủ 56/56 mapping VinSHC hiện có |

Các kiểm tra DB/API trực tiếp trên stack đang dùng chỉ đọc dữ liệu nghiệp vụ.
Sau khi dọn stack thử nghiệm, cả 4 dịch vụ thật vẫn healthy, cổng PostgreSQL
`127.0.0.1:15432` vẫn mở và `npm run test:live` tiếp tục PASS. DB đang sử dụng
vẫn có 0 patient, visit, encounter và obs; không có fixture từ đợt kiểm tra này.

## Chạy hồi quy bằng cùng image trên stack riêng

Source main được xuất nguyên bản vào `infra/frontend/.runtime/local-review-20261013`.
Project `vinshc-review-local-20261013`, gateway `127.0.0.1:18082`, credentials và
hai volume riêng. Image ID backend của stack kiểm thử trùng image ID đang chạy.
Fixture bệnh nhân/tài khoản/giao dịch chỉ tạo trong DB kiểm thử này.

| Bộ kiểm tra | Kết quả |
| --- | --- |
| Build module từ main, JUnit trong Docker | BUILD SUCCESS, 18/18; 0 failure/error/skipped |
| PostgreSQL/schema/extensions | PASS |
| Metadata qua API | PASS |
| Smoke tạo fixture riêng | PASS |
| B1–B8 theo thứ tự CI trên volume sạch | PASS 53/53 |
| B10 review regressions | PASS 16/16 |
| FE điều dưỡng ghi sinh hiệu thật, đọc lại DB qua API | PASS: 8/8 giá trị trùng khớp, không mock |

Kết quả B10 xác nhận trực tiếp các lỗi nghiêm trọng:

- H-1: thu ngân khác cơ sở đọc bill, đọc payment, in receipt và refund đều HTTP 403.
- H-2: 8 vòng thu tiền/settle đồng thời, số đã thu luôn bằng tổng bill, không thu vượt.
- H-3: settle bill đã hủy trả HTTP 409; bill giữ `cancelled`.
- H-4: 240 request Core chạy cùng session với adapter, không có request nào rò quyền.

Phép thử FE dùng tài khoản mới chỉ có app-role điều dưỡng và phân công workspace,
đăng nhập qua trình duyệt, chọn workspace, điền form và POST `/vinshc/vitals`.
Backend lưu một nhóm có 16 observation: 8 giá trị số và 8 trạng thái ghi nhận.
Đọc lại nhóm qua Core API bằng admin cho đúng patient/encounter và đủ 8 giá trị;
chính điều dưỡng đọc trực tiếp Core `/patient` vẫn nhận HTTP 403. Phép thử dùng
visit fixture đang mở và một encounter mới trong khoảng thời gian hợp lệ của visit.
Không dùng tài khoản admin để thay thế quyền điều dưỡng trong thao tác ghi FE.

Log và JSON chi tiết nằm trong `.runtime/local-review-20261013/.runtime/reports/`,
bị Git bỏ qua cùng runtime và credentials.

Lần B1–B8 đầu có 52/53 đạt, một lỗi B5 ghi diagnosis I10 do lần kiểm tra thiếu
`VINSHC_B4_CATALOGUE=metadata`. B4 mặc định dùng danh mục synthetic và thay global
properties, trong khi B5 lấy concept I10 của metadata dự án. Đây là thiếu sót cấu
hình của lần kiểm tra, không phải bằng chứng cần sửa BE. Lần chạy lại bổ sung biến
này đúng như `.github/workflows/ci.yml`; test B5 bị lỗi ban đầu đã PASS.
Chạy B8 hai lần trên cùng DB test còn làm tổng tiền fixture cộng dồn; xóa trực tiếp
fixture trong SQL cũng để lại search index cũ. Vì vậy kết quả cuối được chạy lại
trên hai volume kiểm thử mới hoàn toàn, với `VINSHC_B4_CATALOGUE=metadata` ngay từ đầu.
Không thay assertion, source BE hay metadata để làm test pass; log các lần thiết lập
chưa đúng vẫn được giữ để đối chiếu.

## Phân biệt kiểm chứng BE với hoàn thiện FE

Bộ test BE thực hiện request HTTP trực tiếp. Ví dụ
[test_b4b_clinical.py](../../tests/integration/test_b4b_clinical.py) tạo patient,
visit và encounter qua Core API bằng tài khoản admin để chuẩn bị ngữ cảnh test.
[test_b5_authorization.py](../../tests/integration/test_b5_authorization.py) đồng thời
yêu cầu nhân viên app-role bị từ chối khi đọc Core `/patient` trực tiếp (HTTP 403).

Vì vậy, BE có các luồng API ghi/đọc được kiểm thử, nhưng điều đó chưa chứng minh
FE đã có toàn bộ màn hình và quyền phù hợp để nhân viên tự thực hiện trọn luồng.
Các màn hình **Chờ backend** cần hợp đồng ứng dụng scoped cho tìm/tạo bệnh nhân,
lifecycle visit/encounter, danh sách/search nghiệp vụ, đọc/sửa sinh hiệu và cấp thuốc.
Core đã có một số khả năng này; chưa có adapter scoped tương ứng để FE nhân viên
gọi theo mô hình phân quyền hiện tại. Chi tiết ở [UI_BACKEND_MAP.md](UI_BACKEND_MAP.md).

## Giới hạn lần kiểm tra này

- Không chạy lại bản cũ `873e37d` để tái xác nhận con số 15/16 fail trước sửa.
- Không chạy lại B9 restart/backup/restore và handoff trong lần này; kết quả trong
  báo cáo BE là bằng chứng từ đợt chạy khác, không phải kết quả mới của lần kiểm tra này.
- Không dựng lại kịch bản nâng cấp DB 0.3.0 có dữ liệu. DB local hiện đã migration;
  kiểm tra schema không thay thế kiểm thử bảo toàn dữ liệu khi nâng cấp.
- Chỉ nghiệm thu một form ghi sinh hiệu qua FE, chưa nghiệm thu luồng khám đầy đủ
  từ tiếp nhận đến thanh toán/cấp thuốc. Không tạo tài khoản test hoặc fixture trong
  DB đang sử dụng; stack kiểm thử và hai volume riêng được xóa sau kiểm tra.
