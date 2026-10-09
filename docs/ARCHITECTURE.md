# Kiến trúc và lộ trình mở rộng

**Trạng thái:** Đề xuất. Các quyết định lớn được ghi riêng trong [docs/decisions/](decisions/).

Mục tiêu là làm tốt cho **một phòng khám tư** trước. Đồng thời giữ ranh giới module đủ rõ để sau này ghép thêm chuỗi phòng khám và bệnh viện mà không phải viết lại.

## 1. Nguyên tắc

1. **Không fork core khi chưa bắt buộc.** Phần riêng của dự án nằm ở metadata, cấu hình, mẫu in, bản dịch, module mở rộng và adapter tích hợp.
2. **Tách theo gói (pack).** Mỗi phòng khám chọn bật gói cần dùng. Gói Việt Nam dùng chung cho mọi cơ sở. Cấu hình của từng cơ sở nằm riêng.
3. **Mỗi cơ sở giữ hồ sơ gốc của mình.** Liên thông dùng chuẩn FHIR. Không chia sẻ database giữa các cơ sở.
4. **Tích hợp bên ngoài qua adapter.** BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS và PACS không được đi thẳng vào logic lâm sàng. Mỗi tích hợp có thể tắt mà phần còn lại vẫn chạy.
5. **Một hệ database cho mọi tầng.** OpenMRS, EHRbase, OpenCR, kho dữ liệu và phần AI cùng dùng PostgreSQL, mỗi thành phần một database riêng ([ADR-0002](decisions/0002-postgresql.md)).
6. **Dữ liệu chuẩn hóa từ đầu.** Từ điển dữ liệu ánh xạ sẵn sang FHIR và archetype openEHR ([DATA_DICTIONARY.md](DATA_DICTIONARY.md)), để sau này có thể thêm kho dữ liệu lâm sàng mà không phải làm lại.

## 2. Các tầng triển khai

| Tầng | Đối tượng | Thành phần |
| --- | --- | --- |
| **1. Phòng khám** (trọng tâm hiện tại) | Một phòng khám tư | OpenMRS 3 (Core, REST, FHIR2, Initializer), các app O3: đăng ký, patient chart, form, appointments, service queues, billing, dispensing, stock; gói Việt Nam |
| **2. Phòng khám đa khoa / chuỗi** | Nhiều phòng, nhiều cơ sở | Tầng 1 + LIS (OpenELIS hoặc HL7 với máy xét nghiệm), PACS (Orthanc), adapter BHYT / HĐĐT / đơn thuốc quốc gia, ERP (Odoo hoặc ERPNext) cho kế toán và kho chuyên sâu, báo cáo tập trung |
| **3. Bệnh viện / liên thông** | Bệnh viện, mạng lưới cơ sở | Tầng 2 + nội trú/giường, MPI (OpenCR), interoperability layer (OpenHIM), terminology server (OCL), kho dữ liệu lâm sàng openEHR (EHRbase), data warehouse, HA và giám sát |

Mô hình tham khảo cho tầng 2–3 là **Bahmni** (OpenMRS + Odoo + OpenELIS + PACS) và kiến trúc **OpenHIE**. Nhóm học cách ghép thành phần từ hai mô hình này, không bắt buộc dùng nguyên bộ.

```text
                    ┌──────────────── Tầng 3 ─────────────────┐
                    │ OpenHIM · OpenCR (MPI) · OCL · EHRbase  │
                    │ Data warehouse · AI tra cứu có dẫn nguồn│
                    └───────────────▲─────────────────────────┘
                                    │ FHIR R4 / openEHR
┌────────────── Tầng 2 ─────────────┴──────────────────────────┐
│ LIS · PACS · ERP · Adapter BHYT / HĐĐT / Đơn thuốc quốc gia  │
└───────────────▲──────────────────────────────────────────────┘
                │ REST / FHIR / HL7 qua adapter
┌────────────── Tầng 1: một phòng khám ────────────────────────┐
│ O3 frontend ── OpenMRS Core + REST + FHIR2 + Initializer     │
│ Gói VN: metadata, ICD-10, thuốc, dịch vụ, địa chỉ, mẫu in,   │
│ bản dịch, role                                               │
│ PostgreSQL (hồ sơ gốc của cơ sở)                             │
└──────────────────────────────────────────────────────────────┘
```

## 3. Phân loại module

| Nhóm | Ví dụ | Nơi phát triển |
| --- | --- | --- |
| Upstream giữ nguyên | Core, REST, FHIR2, Initializer, các app O3 | Chỉ khóa phiên bản; lỗi chung được báo hoặc đóng góp ngược về OpenMRS |
| Gói Việt Nam dùng chung | Concept, ICD-10, danh mục thuốc/dịch vụ, identifier type (CCCD, mã BHXH), địa giới hành chính mới, role mẫu, bản dịch, mẫu in | Repo này, dạng cấu hình Initializer |
| Cấu hình của từng cơ sở | Location, bảng giá, tài khoản, logo, thông tin in | Ngoài Git công khai hoặc dùng file mẫu; không chứa bí mật |
| Module mở rộng | Phần nghiệp vụ còn thiếu sau khi đã đánh giá cấu hình | `modules/`, mỗi module có lý do và kiểm thử |
| Adapter tích hợp | BHYT XML, HĐĐT, đơn thuốc quốc gia, LIS, PACS, openEHR | `integrations/`, bật/tắt độc lập |

Bản dịch tiếng Việt cho app O3 nên đóng góp ngược về upstream (OpenMRS dùng Transifex). Repo chỉ giữ phần bổ sung chưa được nhận, để giảm chi phí khi nâng phiên bản.

## 4. Mô hình triển khai

| Trường hợp | Cách triển khai | Ghi chú |
| --- | --- | --- |
| Một phòng khám | Một instance OpenMRS và một database, đặt tại chỗ hoặc trên VPS | Mặc định của dự án |
| Chuỗi phòng khám | Mỗi cơ sở một instance, hoặc một instance nhiều location nếu cùng pháp nhân và cùng chính sách dữ liệu | Quyết định theo pháp nhân và chính sách chia sẻ |
| Nhà cung cấp dịch vụ cho nhiều phòng khám (SaaS) | Mỗi khách hàng một instance riêng | **OpenMRS không hỗ trợ multi-tenant**; không chia sẻ database giữa các pháp nhân |
| Bệnh viện | Instance riêng, có HA, backup và giám sát; ERP/LIS/PACS tách riêng | OpenMRS đóng vai trò EMR lâm sàng, không phải toàn bộ HIS |

## 5. Yêu cầu vận hành theo tầng

| Yêu cầu | Tầng 1 | Tầng 2–3 |
| --- | --- | --- |
| Sao lưu | Backup hằng ngày bằng `pg_dump`, đã thử restore | Backup liên tục (WAL archiving / point-in-time recovery), có bản ngoài cơ sở, RPO/RTO được thống nhất |
| Database | Một PostgreSQL trên cùng máy chủ | Nhân bản (streaming replication), bản sao chỉ đọc cho báo cáo, connection pooling |
| Bảo mật | HTTPS, mật khẩu mạnh, phân quyền, nhật ký truy cập | + SSO, 2FA, giám sát, quy trình xử lý sự cố |
| Sẵn sàng | Khởi động lại trong vài phút | HA, failover |
| Nâng cấp | Theo release có khóa phiên bản, thử trên bản sao dữ liệu | + môi trường staging, kế hoạch rollback |
| Hiệu năng | Vài chục người dùng | Cần đo tải; báo cáo đọc từ bản sao hoặc kho dữ liệu, không đọc database tác nghiệp |
| Mất mạng | Chạy trong mạng LAN của phòng khám | Thiết kế đồng bộ và hàng đợi cho tích hợp |

## 6. openEHR

Đề xuất trong [ADR-0001](decisions/0001-openmrs-openehr.md): OpenMRS là hệ thống tác nghiệp ở tầng 1–2. Từ điển dữ liệu ánh xạ sẵn sang archetype openEHR. EHRbase được thêm ở tầng 3 làm kho dữ liệu lâm sàng dài hạn, nhận dữ liệu một chiều qua adapter. Nếu mentor yêu cầu openEHR là nơi lưu trữ gốc ngay từ MVP, ADR phải được xem lại trước khi làm M3.
