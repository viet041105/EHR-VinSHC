# Luồng nhân viên: bệnh nhân, lượt khám, sinh hiệu, danh sách và cấp thuốc

Các endpoint dưới đây nằm sau `/openmrs/ws/rest/v1/vinshc` và dành cho tài khoản ứng dụng. Mỗi request mang header
`X-VinSHC-Workspace-Role` và `X-VinSHC-Workspace-Facility`. Quyền được kiểm theo ma trận
`metadata/vinshc/permission-matrix.csv` (role × resource × action) và phạm vi cơ sở. Core REST/FHIR vẫn đóng với
role ứng dụng; adapter chỉ cấp proxy privilege Core trong request của chính nó.

Kiểm chứng runtime: `tests/integration/test_b11_care_workflow.py` (12 kiểm tra, tài khoản thật cho 7 role).

## Quy ước chung

- Danh sách trả `{"results": [...], "limit": n, "offset": n, "hasMore": bool}`; `limit` 1–100, mặc định 25.
- Ngày lọc (`date`, `from`, `to`) theo `YYYY-MM-DD` giờ `Asia/Ho_Chi_Minh`.
- Bản ghi trong danh sách chỉ thuộc cơ sở của workspace. System Developer không bị giới hạn phạm vi; nếu có header
  cơ sở thì header chỉ dùng làm bộ lọc hiển thị.
- 409 có thể kèm `matches`: bản ghi trong phạm vi để FE cho người dùng chọn thay vì tạo trùng. Bản ghi ngoài cơ sở
  không bao giờ được liệt kê.
- Mọi thao tác ghi được ghi vào `vinshc_clinical_event` (`patient_registered`, `patient_updated`, `visit_opened`,
  `visit_closed`, `encounter_created`, `vitals_corrected`, `vitals_voided`, `medication_dispensed`).

## Phạm vi bệnh nhân

Bệnh nhân thuộc phạm vi cơ sở khi được đăng ký qua adapter tại cơ sở đó (bảng `vinshc_patient_registration`) hoặc có
visit chưa void tại cơ sở/cơ sở con. Quy tắc này áp dụng cho mọi API cũ dùng `requirePatientScope`.

## Bệnh nhân (`patient_identity`)

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/patients?q=&limit=&offset=` | read | Tìm theo mã định danh (khớp chính xác), một phần họ tên đầy đủ theo thứ tự Việt Nam (không phân biệt dấu) hoặc ≥ 6 chữ số cuối điện thoại. `q` rỗng: hồ sơ đăng ký gần đây. |
| GET | `/patients/{uuid}` | read | Hồ sơ hành chính và lượt đang mở tại cơ sở. |
| POST | `/patients` | create | Đăng ký mới, idgen cấp mã nội bộ `VSHC-…`. |
| POST | `/patients/{uuid}` | update | Sửa một phần. |

Projection: tiếp đón và bác sĩ nhận `projection=administrative` (điện thoại, nghề nghiệp, các định danh). Thu ngân,
điều dưỡng, KTV, dược nhận `minimal` (mã hồ sơ, họ tên, giới tính, năm sinh/tuổi).

Đăng ký:

```json
{
  "familyName": "Nguyễn", "middleName": "Thị", "givenName": "Bình", "gender": "F",
  "birthPrecision": "year", "birthYear": 1990,
  "phone": "0912 345 678", "occupation": "Kỹ sư",
  "identifiers": [{"type": "cccd", "identifier": "001090000001"}],
  "address": {"addressText": "12 Hoa", "provinceCode": "01", "communeCode": "00004",
              "catalogueVersion": "VN-19-2025-2025-07-01", "addressAsOfDate": "2026-10-13"},
  "idempotencyKey": "reg-…"
}
```

- `gender`: `M`, `F`, `O`, `U`. `birthPrecision`: `day` (cần `birthdate`), `month` (`birthYear` + `birthMonth`),
  `year` (`birthYear`), `unknown` (không có ngày sinh). Tháng/năm lưu ngày đại diện và `birthdateEstimated=true`.
- Họ/tên ≤ 50 ký tự; thuộc tính (điện thoại, nghề nghiệp, ngày sinh nguyên văn) ≤ 50 ký tự theo cột Core.
- Khi `POST /patients`, bắt buộc có đúng một `identifiers` phần tử loại `cccd`, đủ 12 chữ số. BHXH/BHYT tùy chọn;
  hồ sơ cũ chưa có CCCD vẫn đọc/cập nhật được theo quy tắc trạng thái thiếu.
- `address` tùy chọn, chuyển cho `POST /address` trong cùng transaction.
- 409 khi định danh phụ đã thuộc hồ sơ khác (toàn hệ thống; `matches` chỉ gồm hồ sơ cùng cơ sở) hoặc có hồ sơ cùng họ
  tên không dấu, giới tính và năm sinh tại cơ sở. Gửi lại với `"allowPossibleDuplicate": true` sau khi đã kiểm tra.
- Gửi lại cùng `idempotencyKey` trả về đúng bệnh nhân đã tạo; khác nội dung → 409.

Sửa: chỉ gửi trường cần đổi. Đổi tên tạo tên ưu tiên mới và void tên cũ; giá trị thuộc tính/định danh cũ được void
kèm `reason`. `phone: null` xóa điện thoại. Không thay đổi gì → 400.

## Lượt khám (`visit`)

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/visits?patient=&status=open\|closed\|all&date=` | read | Mặc định lượt đang mở; kèm patient tối thiểu, encounter, lý do kết thúc. |
| GET | `/visits/{uuid}` | read | Chi tiết lượt. |
| POST | `/visits` | create | `{"patient","visitType":"outpatient\|followup","appointment"?,"startDatetime"?}` |
| POST | `/visits/{uuid}/close` | update (`cancelled`: cancel) | `{"closeReason","note"?,"stopDatetime"?}` |
| POST | `/visits/{uuid}/encounters` | theo loại | `{"encounterType":"vitals\|consultation\|administrative","provider"?,"encounterDatetime"?}` |
| GET | `/providers/me` | đăng nhập | Provider gắn với tài khoản đang đăng nhập. |

- Mỗi bệnh nhân chỉ có một lượt đang mở; lượt thứ hai → 409 kèm lượt đang mở trong `matches`. Lượt mở ở cơ sở khác
  → 409 không kèm chi tiết.
- Mỗi lượt trả `visitCode` dạng `VSHC-LK-########`, tạo xác định từ ID duy nhất do OpenMRS/PostgreSQL cấp.
- `appointment` (tùy chọn) phải cùng bệnh nhân/cơ sở, trạng thái `booked|confirmed|arrived` và chưa gắn lượt; lịch
  hẹn chuyển `arrived` và lưu `visit_id`.
- `closeReason`: `completed`, `left_early`, `cancelled`, `referred`. `note` bắt buộc trừ `completed`. Lý do và ghi chú
  lưu thành Obs `group.administrative` trong encounter hành chính tại thời điểm kết thúc.
- `completed` bị từ chối (409) khi còn chỉ định CLS `requested|assigned|in_progress` hoặc phiếu phí
  `unpaid|partially_paid`. Lý do khác vẫn đóng lượt và trả `warnings`.
- Phiếu hàng đợi còn mở của lượt được đóng: `completed` → `completed`; `left_early` → `left/patient_requested`;
  `referred` → `left/referred_elsewhere`; `cancelled` → `cancelled/other`.
- Encounter: `vitals` cần quyền ghi sinh hiệu (điều dưỡng), `consultation` cần quyền ghi phiếu khám (bác sĩ),
  `administrative` cần `visit update`. Encounter cùng loại của cùng provider trong lượt được dùng lại (HTTP 200);
  tạo mới trả 201. Provider phải là provider của tài khoản đang đăng nhập (403 nếu khác); không có hoặc có nhiều
  provider → 400. Lượt đã đóng → 409.

## Sinh hiệu (`vitals`)

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| POST | `/vitals` | ghi sinh hiệu | Không đổi hợp đồng; nhân viên workspace chỉ ghi được khi lượt còn mở (409). |
| GET | `/vitals?patient=&visit=&encounter=&includeVoided=` | read | Nhóm đo mới nhất trước: `values`, `states` (trạng thái thiếu), `needsVerification`, `voided`, `voidReason`. |
| POST | `/vitals/{groupUuid}/correction` | update | `{"values","states","measuredAt"?,"reason"}`; void nhóm cũ với lý do và tạo nhóm mới cùng encounter. Lượt đóng → 409. |
| DELETE | `/vitals/{groupUuid}?reason=` | void | Void nhóm đo và các thành phần. |

`clinical-summary` của encounter khám có thêm `vitals`: các nhóm đo chưa void trong cùng lượt.

## Danh sách vận hành (`/operations`)

| Method | Path | Quyền | Mặc định |
| --- | --- | --- | --- |
| GET | `/appointments?date=&provider=&patient=&status=` | appointment read | Ngày hôm nay nếu không lọc bệnh nhân. Kèm `patientName`, `patientIdentifier`, `providerName`, `serviceName`. |
| GET | `/queue?point=&state=active\|all\|…&date=` | queue read | Hôm nay, trạng thái chờ/gọi/đang phục vụ, theo số thứ tự. |
| GET | `/bills?status=open\|all\|…&patient=&visit=&date=` | billing read | Hôm nay nếu không lọc bệnh nhân/lượt. |
| GET | `/payments?status=pending\|settled\|cancelled\|all&bill=&date=` | payment read | `pending` không giới hạn ngày. |
| GET | `/service-orders?state=active\|all\|…&patient=&visit=&date=` | diagnostic_order read | KTV chỉ thấy chỉ định giao cho provider của mình và chỉ định `requested` chưa phân công. |
| GET | `/reports/range?from=&to=&facility=` | reports read | Tối đa 31 ngày; mỗi ngày như báo cáo ngày và `totals`. |

Mẫu in: `prescription` kiểm quyền `prescription print` (bác sĩ, dược) và `result` kiểm `diagnostic_result print`
(bác sĩ, KTV) thay cho `diagnostic_order print` trước đây.

## Quầy thuốc (`dispensing`, `/pharmacy`)

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/pharmacy/prescriptions?status=pending\|dispensed\|all&patient=&date=` | read | Dòng thuốc ngoại trú tại cơ sở. `pending`: còn hiệu lực và chưa cấp đủ. Hôm nay nếu không lọc bệnh nhân. |
| GET | `/pharmacy/prescriptions/{orderUuid}` | read | Kèm các lần cấp. |
| POST | `/pharmacy/dispenses` | create | `{"order","quantity","batchNumber"?,"expiryDate"?,"note"?,"idempotencyKey"}` |
| GET | `/pharmacy/dispenses/{uuid}` | read | Phiếu cấp kèm tình trạng dòng thuốc. |

- 409: tổng đã cấp vượt số lượng kê, đơn đã ngừng/hết hiệu lực, lượt đã đóng với lý do `cancelled`, hoặc
  `idempotencyKey` đã dùng cho nội dung khác. Gửi lại cùng khóa trả phiếu cũ.
- 400: số lượng ≤ 0, quá 4 chữ số thập phân hoặc > 100000; `expiryDate` trước hôm nay.
- Mỗi dòng có `dispensedQuantity`, `remainingQuantity`, `dispenseStatus` (`pending|partial|complete`),
  `consultationFinalized` và `visitCancelled`.
- Chưa trừ tồn kho Stock Management; số lô và hạn dùng chỉ được ghi theo lần cấp.

## Giới hạn còn lại

- Tạo/sửa tài khoản, provider và cấu hình cơ sở chưa có API ứng dụng; nhân viên lâm sàng cần quản trị liên kết
  provider với tài khoản trước khi tạo encounter.
- Bệnh nhân đăng ký ở cơ sở khác hoặc tạo trực tiếp qua Core (không có đăng ký/visit tại cơ sở) không tìm thấy và
  không mở lượt được từ workspace của cơ sở này.
- Không có API sửa/void phiếu cấp thuốc vì ma trận quyền chưa cấp `dispensing update/void`.
