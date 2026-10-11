# Mở rộng hành chính bệnh nhân VinSHC

Module Java `vinshc` bổ sung schema mà OpenMRS Core không có sẵn cho B2 và lớp ghi sinh hiệu có validation cho B3. Các endpoint nằm dưới `/openmrs/ws/rest/v1/vinshc`, chỉ nhận JSON và dùng authenticated user của OpenMRS làm actor audit.

## Quyền

| Privilege | Phạm vi |
| --- | --- |
| `VinSHC: Read patient administration` | Đọc aggregate hành chính, catalogue và trạng thái cấu hình |
| `VinSHC: Write patient administration` | Tạo/cập nhật/void contact, field-state và address snapshot |
| `VinSHC: Record vitals` | Ghi group sinh hiệu qua adapter có validation |

Controller kiểm tra privilege trực tiếp trên authenticated user. User không có privilege nhận HTTP 403; không dựa vào validation ở FE.

## Aggregate hành chính

`GET /identity/{patientUuid}?includeHistory=false` trả `contacts`, `fieldStates` và `addresses`. Mặc định chỉ trả phiên bản hiện hành; `includeHistory=true` trả toàn bộ phiên bản audit.

Mỗi contact/address có `row_key` UUID bất biến, `version_number` tăng dần và đúng một bản ghi `is_current=true`. Update dùng `POST /contact/{rowKey}` hoặc `POST /address/{rowKey}`; property bị bỏ qua được giữ nguyên. Void dùng `DELETE ...?reason=...`, tạo phiên bản `status=void`, không hard-delete.

## Người liên hệ

Tạo contact:

```http
POST /openmrs/ws/rest/v1/vinshc/contact
```

```json
{
  "patient": "patient-uuid",
  "fullName": "Nguyễn Văn Liên Hệ",
  "relationshipCode": "FATHER",
  "phone": "0901 234 567",
  "addressText": "Địa chỉ nguyên văn",
  "priority": 1,
  "isPrimary": true,
  "emergencyContact": true,
  "linkedPersonUuid": null,
  "source": { "kind": "api", "sourceReference": "registration:123" },
  "recordedAt": "2026-10-11T17:00:00+07:00"
}
```

`relationshipCode` phải thuộc catalogue 7 mã đã review; server lưu snapshot `relationship_name` và `relationship_version`. Mỗi patient chỉ có tối đa một contact chính và priority không trùng giữa các contact active. Phone luôn giữ raw; số hợp lệ được chuẩn hóa riêng sang E.164. Input manual sai cú pháp bị từ chối, import cũ sai cú pháp giữ raw với trạng thái `needs_review`. Contact không tự tạo Person/Patient và không dùng tên/số điện thoại để merge hồ sơ.

## Trạng thái thông tin thiếu

```http
POST /openmrs/ws/rest/v1/vinshc/field-state
```

```json
{
  "patient": "patient-uuid",
  "fieldCode": "contact.dien_thoai",
  "rowKey": "contact-row-uuid",
  "context": "contact",
  "dataStatus": "unknown",
  "source": { "kind": "api" },
  "recordedAt": "2026-10-11T17:00:00+07:00"
}
```

Server đọc trực tiếp 37 policy `b2Missing` từ metadata pack: field `forbidden`/`null_only` không được tạo sidecar; context, yêu cầu rowKey và tập trạng thái được kiểm tra theo từng field. Với contact/address, server từ chối state nếu giá trị đang tồn tại và tự đóng state hiện hành khi PATCH ghi lại giá trị. Xóa state bằng `DELETE /field-state?patient=...&fieldCode=...&context=...&rowKey=...`.

## Địa chỉ DATA-08

`GET /address-catalogue` trả 34 tỉnh/thành; thêm `parentCode={provinceCode}` để lấy xã/phường thuộc tỉnh. Tạo snapshot bằng `POST /address`:

```json
{
  "patient": "patient-uuid",
  "addressText": "Số 12, đường Hoa",
  "legacyAddressText": "Địa chỉ trên giấy tờ cũ",
  "provinceCode": "01",
  "communeCode": "00004",
  "catalogueVersion": "VN-19-2025-2025-07-01",
  "addressAsOfDate": "2026-10-11",
  "source": { "kind": "paper", "documentUuid": "uuid", "page": "1" },
  "recordedAt": "2026-10-11T17:00:00+07:00"
}
```

Server xác minh code/version/ngày hiệu lực và quan hệ xã → tỉnh, rồi đóng băng cả code, label, raw, legacy và version. Raw-only được phép khi không có code/version giả. Catalogue đồng thời được nạp vào Address Hierarchy bằng Initializer với 3.356 entry có `userGeneratedId` ổn định (`VN`, 34 mã tỉnh, 3.321 mã xã).

## Ghi sinh hiệu đã validation

```http
POST /openmrs/ws/rest/v1/vinshc/vitals
```

```json
{
  "patient": "patient-uuid",
  "encounter": "vitals-encounter-uuid",
  "measuredAt": "2026-10-11T17:00:00+07:00",
  "values": {
    "vitals.ha_tam_thu": 120,
    "vitals.ha_tam_truong": 80,
    "vitals.spo2": 98
  },
  "states": {}
}
```

Adapter thực thi `R_NUM`, `R_POS`, `R_PERCENT` và `R_BP`, xác minh patient/encounter/type rồi ghi group Obs native cùng companion status. Huyết áp thiếu một vế bắt buộc có state thiếu tường minh. Tâm thu ≤ tâm trương vẫn được lưu nhưng response trả `needsVerification=true`; không tự sửa hay áp ngưỡng lâm sàng.

## Provenance và lỗi

Record mới bắt buộc có `source` và `recordedAt`. `paper` bắt buộc `documentUuid/page`; `legacy_import` và `migration` bắt buộc `sourceReference`. Mọi phiên bản giữ actor/time và provenance; schema dùng bảng append-only, không lưu JSON ghép.

Payload sai contract trả 400, thiếu privilege trả 403, metadata runtime bắt buộc bị thiếu trả 503. Test: `tests/integration/test_b23_extensions.py`; báo cáo local: `.runtime/reports/b23-extension-integration.json` và `.runtime/reports/b23-clean-acceptance.json`.
