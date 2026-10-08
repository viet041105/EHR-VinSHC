# Kế hoạch triển khai EHR-VinSHC

**Ngày cập nhật:** 08/10/2026

**Nhóm:** 4 thành viên

**Mục đích:** Giúp thành viên mới hiểu sản phẩm cần làm, nhận đúng đầu việc và biết khi nào công việc được coi là hoàn thành.

> Mục tiêu là một bản phân phối OpenMRS 3 mã nguồn mở cho **phòng khám tư nhân tại Việt Nam**. Bản đầu tiên phục vụ một phòng khám với luồng ngoại trú, thu tiền, kê đơn và cận lâm sàng cơ bản. Kiến trúc tách theo gói và adapter để sau này mở rộng lên chuỗi phòng khám và bệnh viện, liên thông dữ liệu và AI tra cứu có dẫn nguồn.
>
> Repo đã có cấu hình Docker và workflow CI cho baseline. Xem [hướng dẫn môi trường](docs/DEVELOPMENT.md) và [phạm vi CI](docs/CI.md); theo dõi kết quả workflow trong [GitHub Actions](https://github.com/viet041105/EHR-VinSHC/actions).

**Tài liệu liên quan:**

| Tài liệu | Nội dung |
| --- | --- |
| [docs/CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md) | Vai trò, quy trình phòng khám tư, giấy tờ đầu ra, câu hỏi khảo sát |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Các tầng phòng khám → chuỗi → bệnh viện, phân loại module, mô hình triển khai |
| [docs/VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md) | Checklist pháp lý và yêu cầu thiết kế tại Việt Nam |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Từ điển dữ liệu MVP, ánh xạ OpenMRS / FHIR / openEHR |
| [docs/decisions/](docs/decisions/) | Các quyết định kiến trúc (ADR) |
| [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) | Quy tắc đóng góp và báo lỗ hổng |

## 1. Đọc nhanh trước khi bắt đầu

1. Dùng **OpenMRS 3 Reference Application** làm nền tảng, rồi tạo bản phân phối riêng cho phòng khám tư Việt Nam.
2. Ưu tiên cấu hình, metadata, biểu mẫu, mẫu in và module mở rộng. Chỉ fork repo upstream khi có nhu cầu sửa mã nguồn cụ thể.
3. Làm theo thứ tự: **lõi lâm sàng (MVP-1)** → **vận hành phòng khám (MVP-2)** → pilot → các module mở rộng. Phòng khám tư không dùng được hệ thống nếu thiếu thu tiền, hàng đợi và in đơn thuốc, nên MVP-2 là điều kiện trước pilot.
4. Chuẩn hóa dữ liệu từ đầu: kiểu dữ liệu, đơn vị, mã định danh, thuật ngữ, nguồn tạo dữ liệu, và ánh xạ sẵn sang FHIR và openEHR.
5. Tách rõ ba loại phần riêng: **gói Việt Nam dùng chung**, **cấu hình từng cơ sở**, **adapter tích hợp tùy chọn** (BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS, PACS).
6. Giữ cách chia 4 người: backend; frontend; metadata và dữ liệu; API, tích hợp và kiểm thử.
7. Chốt với mentor vai trò của openEHR theo [ADR-0001](docs/decisions/0001-openmrs-openehr.md). Đề xuất hiện tại: OpenMRS là nơi lưu gốc ở tầng phòng khám; openEHR (EHRbase) được thêm ở tầng bệnh viện.

**Cách đọc theo vai trò:** Đọc mục 2–6 để hiểu phần chung, tìm phần của mình trong mục 7, sau đó đọc mục 8–10 để biết cách phối hợp và nghiệm thu.

## 2. Mục tiêu và phạm vi

### 2.1. Mục tiêu

Tạo một bản phân phối OpenMRS cho phòng khám tư nhân tại Việt Nam, có thể dựng lại từ repo, dùng chung bộ metadata, biểu mẫu, mẫu in và quy ước dữ liệu, và phát hành dưới dạng mã nguồn mở.

Các sản phẩm nhóm cần bàn giao gồm:

- Cấu hình và hướng dẫn dựng hệ thống.
- Danh sách phiên bản OpenMRS, module backend, package frontend và database đã kiểm chứng cùng nhau.
- Gói Việt Nam: metadata, danh mục, role mẫu, bản dịch, mẫu in.
- Từ điển dữ liệu và tài liệu API/FHIR trong phạm vi hỗ trợ.
- Dữ liệu giả, kịch bản demo và kiểm tra tự động cho các luồng quan trọng.
- Tài liệu sử dụng, vận hành, tuân thủ và giới hạn của bản thử nghiệm.
- Hồ sơ open source: giấy phép, hướng dẫn đóng góp, chính sách bảo mật.

### 2.2. Đối tượng và vai trò

Phòng khám mục tiêu: một địa điểm, 1–5 bác sĩ, 20–150 lượt khám/ngày, có thể có cận lâm sàng cơ bản và quầy thuốc. Chi tiết trong [CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md).

Các role: **tiếp đón, thu ngân, điều dưỡng, bác sĩ, kỹ thuật viên CLS, dược/quầy thuốc, quản lý phòng khám, quản trị hệ thống**. Role được ghép từ privilege; một người có thể giữ nhiều role, vì phòng khám nhỏ thường kiêm nhiệm.

### 2.3. Luồng khám cần hoàn thành

```text
[Đặt lịch] → Tiếp đón: tìm/đăng ký bệnh nhân, mở lượt khám, cấp số
    → Thu phí khám (trả trước hoặc trả sau theo cấu hình)
    → Điều dưỡng ghi sinh hiệu → hàng đợi bác sĩ
    → Bác sĩ ghi bệnh sử, dị ứng, khám
    → [Chỉ định CLS → thu phí → KTV nhập kết quả → bác sĩ đọc]
    → Chẩn đoán ICD-10, kê đơn, hẹn tái khám, in đơn
    → Thu tiền thuốc → [quầy thuốc cấp thuốc]
    → Kết thúc lượt khám → xem lại lịch sử
```

Bước trong `[ ]` tùy chọn theo cấu hình phòng khám.

### 2.4. Phạm vi theo tầng

**MVP-1 — Lõi lâm sàng** (mốc M3)

| Nhóm chức năng | Cần có | Bằng chứng hoàn thành |
| --- | --- | --- |
| Tài khoản và quyền | Đủ 8 role mẫu ghép từ privilege; tài khoản riêng | Thao tác đúng quyền; API từ chối thao tác vượt quyền |
| Bệnh nhân | Đăng ký, tìm kiếm, mã nội bộ, CCCD, mã BHXH; kiểm tra nghi trùng; địa chỉ theo danh mục hành chính hiện hành | Tìm lại đúng người; hai người cùng tên không bị tự gộp |
| Lượt khám | Mở/kết thúc lượt; các lần ghi nhận nằm đúng lượt | Lịch sử hiển thị đúng lần khám và thời điểm |
| Sinh hiệu | Tập sinh hiệu được thống nhất với mentor | Giá trị số và đơn vị lưu đúng; dữ liệu không hợp lệ được xử lý |
| Khám ngoại trú | Bệnh sử, dị ứng, chẩn đoán ICD-10, đơn thuốc | Ghi, lưu và mở lại không mất dữ liệu |
| Việt hóa | Màn hình và danh mục dùng trong kịch bản | Người dùng hiểu nhãn, thông báo và biểu mẫu |
| API | REST phục vụ ứng dụng; đọc dữ liệu FHIR đã kiểm chứng | Có ví dụ request/response và kiểm tra trên backend thật |
| Nhật ký | Ghi nhận ai xem/sửa hồ sơ trong phạm vi nền tảng hỗ trợ | Có báo cáo phần sẵn có và phần thiếu |

**MVP-2 — Vận hành phòng khám** (mốc M4, bắt buộc trước pilot)

| Nhóm chức năng | Cần có | Bằng chứng hoàn thành |
| --- | --- | --- |
| Đặt lịch và hàng đợi | Đặt lịch, cấp số, hàng đợi theo phòng/bác sĩ | Bệnh nhân đi đúng thứ tự qua các bước |
| Bảng giá và thu tiền | Danh mục dịch vụ, bảng giá theo cơ sở, thu/hoàn/hủy, phiếu thu | Tổng tiền đúng; trạng thái thanh toán truy vết được |
| Chỉ định CLS | Chỉ định, nhập kết quả tay hoặc đính kèm file | Kết quả gắn đúng chỉ định và lượt khám |
| Mẫu in | Đơn thuốc, phiếu thu, phiếu chỉ định, phiếu kết quả, giấy hẹn | Đủ thông tin bắt buộc theo [VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md) |
| Tái khám | Hẹn tái khám, liên kết lượt trước | Lịch hẹn xuất hiện đúng ngày |
| Báo cáo | Lượt khám, doanh thu theo ngày | Số liệu khớp dữ liệu giả |
| Vận hành | Backup–restore, khởi động lại, HTTPS khi triển khai ngoài local | Đã thử restore trên bản sao |

**Module mở rộng — bật theo phòng khám** (sau pilot)

Kho thuốc và cấp thuốc; adapter BHYT (XML theo QĐ 130 và văn bản sửa đổi); hóa đơn điện tử; liên thông đơn thuốc quốc gia; LIS/PACS; nhắc lịch SMS/Zalo. Mỗi module có thể tắt mà lõi vẫn chạy.

**Ngoài phạm vi tầng phòng khám:** nội trú, quản lý giường, phòng mổ, ERP đầy đủ. Các phần này thuộc tầng bệnh viện trong [ARCHITECTURE.md](docs/ARCHITECTURE.md).

**MVP được nghiệm thu bằng dữ liệu giả.** Việc dùng tại phòng khám thật cần một mốc đánh giá riêng về nghiệp vụ, vận hành, bảo mật và pháp lý, theo [VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật).

## 3. Kiến trúc và nguyên tắc kỹ thuật

### 3.1. Kiến trúc tầng phòng khám

```text
Tiếp đón / Thu ngân / Điều dưỡng / Bác sĩ / KTV / Dược / Quản lý
              │
              ▼
       Giao diện OpenMRS 3 (app O3 + cấu hình + bản dịch tiếng Việt)
              │ REST / FHIR API
              ▼
  OpenMRS Core + module đã chọn ──► Adapter tùy chọn
       │                    │       (BHYT, HĐĐT, đơn thuốc QG, LIS, PACS)
       ▼                    ▼
   PostgreSQL           FHIR2 API
  Hồ sơ gốc của cơ sở   Phục vụ app O3 và liên thông sau này

Gói Việt Nam + cấu hình cơ sở được quản lý trong Git
              └── Nạp vào hệ thống bằng Initializer
```

Lộ trình lên chuỗi phòng khám và bệnh viện, cùng cách phân loại module, nằm trong [ARCHITECTURE.md](docs/ARCHITECTURE.md).

### 3.2. Các quyết định nền tảng

- **Bản phân phối:** Bắt đầu từ OpenMRS 3 Reference Application; lưu nguồn upstream và release/tag/commit làm nền (hiện tại 3.7.1, xem `config/baseline.json`).
- **Phiên bản:** Khóa bộ phiên bản tương thích, gồm image, module, package và công cụ build. Không phụ thuộc tag động như `latest`, `next` hoặc `qa`.
- **Backend:** Tái sử dụng API và mô hình của OpenMRS. Thêm module hoặc adapter khi xác định được khoảng trống cụ thể.
- **Frontend:** Tái sử dụng các app O3 (registration, patient chart, appointments, service queues, billing, dispensing, stock). Ưu tiên cấu hình, dịch thuật và biểu mẫu trước khi sửa core.
- **Database:** **PostgreSQL** theo [ADR-0002](docs/decisions/0002-postgresql.md), dùng chung hệ quản trị với EHRbase, OpenCR và kho dữ liệu ở tầng sau. Để OpenMRS quản lý schema. Chức năng mới thao tác qua API/service. Migration cho phần mở rộng được quản lý riêng và phải chạy trên PostgreSQL. Baseline hiện tại vẫn chạy MariaDB cho tới khi BE-10 hoàn thành.
- **Metadata:** Lưu trong Git theo gói, dùng UUID ổn định, kiểm tra việc nạp lại và cập nhật.
- **Mỗi cơ sở một instance:** OpenMRS không hỗ trợ multi-tenant. Không dùng chung database giữa các pháp nhân.
- **Tích hợp:** Mọi kết nối hệ thống bên ngoài đi qua adapter có thể tắt.
- **openEHR:** Theo [ADR-0001](docs/decisions/0001-openmrs-openehr.md).
- **Môi trường:** Có cấu hình local và dữ liệu giả chung. Tài khoản demo chỉ dùng cho thử nghiệm; bí mật thực tế nằm ngoài Git.
- **Giấy phép:** Giữ thông tin nguồn và giấy phép của thành phần tái sử dụng. OpenMRS dùng MPL 2.0 kèm Healthcare Disclaimer; nhóm chọn giấy phép tương thích cho phần tự phát triển và thêm `LICENSE` trước khi công bố (OSS-01).

### 3.3. Cách dùng danh sách repo đã nghiên cứu

Danh sách repo backend/frontend của nhóm là **bản đồ thành phần để khảo sát**, không phải yêu cầu fork và build tất cả ngay từ đầu.

Người 1 và người 2 lập bảng lựa chọn thành phần: chức năng cần dùng, module/package tương ứng, phiên bản, phụ thuộc, lý do chọn và cách kiểm chứng.

Cần khảo sát trước: REST, FHIR2, Initializer, định danh bệnh nhân, đăng nhập, đăng ký/tìm kiếm, patient chart, form engine. Với MVP-2, khảo sát thêm appointments, service queues, billing, dispensing, stock management, attachments và address hierarchy. Kiểm tra app nào đã có trong import map của bản 3.7.1. Với tầng sau, tham khảo cách Bahmni ghép OpenMRS với Odoo, OpenELIS và PACS.

## 4. Chuẩn hóa dữ liệu ngay từ MVP

Người 3 quản lý [từ điển dữ liệu](docs/DATA_DICTIONARY.md). Người 1, 2 và 4 dùng cùng tài liệu để tránh backend, biểu mẫu và API hiểu khác nhau.

| Nội dung cần thống nhất | Ví dụ hoặc yêu cầu |
| --- | --- |
| Kiểu dữ liệu | Huyết áp gồm giá trị số theo mô hình được chọn; hạn chế lưu toàn bộ thành text |
| Đơn vị | Mỗi chỉ số có đơn vị UCUM rõ ràng; tiền tệ là VND |
| Thuật ngữ | ICD-10 theo danh mục Bộ Y tế; thuốc, dịch vụ, xét nghiệm có nguồn và phiên bản danh mục |
| Định danh | Mã nội bộ, CCCD, mã BHXH/BHYT; mỗi loại có cơ sở cấp; không tự gộp hồ sơ chỉ dựa vào họ tên |
| Địa chỉ | Danh mục tỉnh → xã theo địa giới sau sắp xếp năm 2025; cho phép ghi địa chỉ cũ để đối chiếu giấy tờ |
| Người hành nghề | Số chứng chỉ/giấy phép hành nghề và phạm vi chuyên môn của người kê đơn |
| Thời gian | Phân biệt thời điểm đo/khám và thời điểm nhập; múi giờ Asia/Ho_Chi_Minh, trao đổi theo ISO 8601 có offset |
| Nguồn dữ liệu | Biết bản ghi thuộc bệnh nhân, lượt khám, người ghi và cơ sở nào |
| Trạng thái | Phân biệt bản ghi đang có hiệu lực, đã sửa hoặc bị hủy |
| Thông tin thiếu | "Chưa hỏi dị ứng" khác "đã hỏi và không ghi nhận dị ứng" |
| Quyền sử dụng | Ma trận đọc/ghi theo role; quyền thực thi trên backend/API |
| Ánh xạ chuẩn | Mỗi trường lâm sàng có cột FHIR R4 và archetype openEHR tương ứng |

FHIR cần bảng ánh xạ và quy ước/profile trong phạm vi dự án. Nhóm đối chiếu khả năng thực tế của FHIR2 qua `CapabilityStatement`; không mặc định mọi resource và thao tác đều được hỗ trợ.

Xuất dữ liệu BHYT theo Quyết định 130 và văn bản sửa đổi là module adapter riêng, chỉ bật cho phòng khám có hợp đồng BHYT. Bộ trường này không thay thế mô hình hồ sơ lâm sàng.

## 5. Các thuật ngữ mọi thành viên cần hiểu giống nhau

| Thuật ngữ | Cách hiểu trong dự án |
| --- | --- |
| EMR | Hồ sơ bệnh án điện tử phục vụ một cơ sở; MVP tập trung vào phần này |
| EHR | Hồ sơ sức khỏe theo thời gian, có thể tổng hợp thông tin từ nhiều cơ sở |
| HIS | Hệ thống thông tin bệnh viện, gồm cả tài chính, kho, nhân sự; rộng hơn EMR |
| Distribution / bản phân phối | Bộ OpenMRS, module, frontend, cấu hình và metadata được ghép để triển khai |
| Gói (pack) | Bộ cấu hình/metadata dùng chung, ví dụ gói Việt Nam, có thể bật cho nhiều cơ sở |
| Adapter | Thành phần kết nối hệ thống bên ngoài (BHYT, HĐĐT, LIS…), có thể tắt |
| Metadata | Danh mục và cấu hình như concept, location, loại lượt khám, biểu mẫu, role, loại mã bệnh nhân |
| Concept | Khái niệm y tế được định nghĩa, ví dụ nhiệt độ hoặc một câu hỏi trên biểu mẫu |
| Visit | Lượt bệnh nhân đến cơ sở, có thể gồm nhiều lần ghi nhận |
| Encounter | Một lần tương tác hoặc ghi nhận trong quy trình, ví dụ ghi sinh hiệu hoặc khám bác sĩ |
| Observation / Obs | Thông tin quan sát được ghi, ví dụ nhiệt độ tại một thời điểm |
| REST API | API OpenMRS phục vụ nhiều thao tác của giao diện và ứng dụng |
| FHIR | Chuẩn trao đổi dữ liệu; cần thống nhất phiên bản, mapping và quy tắc sử dụng |
| openEHR / CDR | Mô hình dữ liệu lâm sàng (archetype/template) và kho lưu theo openEHR, ví dụ EHRbase |
| ADR | Bản ghi quyết định kiến trúc trong `docs/decisions/` |
| MPI / Record Locator | Cơ chế nhận biết cùng bệnh nhân / xác định cơ sở có hồ sơ; thuộc giai đoạn liên thông |

## 6. Các mốc triển khai và điều kiện chuyển bước

Các mốc quy định thứ tự và đầu ra, chưa ấn định số tuần. Nhóm bổ sung lịch và người thực hiện theo deadline và quỹ thời gian.

| Mốc | Công việc chính | Phụ trách | Điều kiện chuyển bước |
| --- | --- | --- | --- |
| M0 — Chốt nghiệp vụ | Khảo sát 1–2 phòng khám tư; chốt luồng, role, ma trận quyền, dữ liệu tối thiểu, mẫu giấy tờ; rà soát checklist pháp lý; chốt ADR-0001 và giấy phép | Cả nhóm + mentor | Có [CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md) đã xác nhận, ADR-0001 được chấp nhận, có `LICENSE` |
| M1 — Dựng baseline | Chọn release; dựng môi trường; kiểm tra đăng nhập, frontend, REST/FHIR; dữ liệu giả; chuyển sang PostgreSQL (BE-10) | Người 1 + 2; người 3 + 4 kiểm chứng | Một thành viên khác dựng lại được **trên PostgreSQL**. Bản MariaDB đã đạt local ([VALIDATION.md](docs/VALIDATION.md)); cần kiểm chứng lại sau BE-10 |
| M2 — Repo và CI tối thiểu | Cấu trúc, lệnh chạy/build/test, PR; kiểm tra khả dụng trong CI | Người 4 + 1 | Pipeline chạy trên GitHub và lỗi làm check thất bại. **Workflow đã có**, cần xác nhận run trên GitHub |
| M3 — MVP-1 lõi lâm sàng | Gói metadata Việt Nam, biểu mẫu, Việt hóa, role, luồng khám, kiểm thử tích hợp | Cả 4 người | Chạy xuyên suốt kịch bản MVP-1 trên backend thật |
| M4 — MVP-2 vận hành phòng khám | Lịch hẹn, hàng đợi, bảng giá, thu tiền, chỉ định CLS, mẫu in, báo cáo, backup–restore | Cả 4 người | Chạy trọn quy trình mục 2.3 với dữ liệu giả, có in ấn và đối soát tiền |
| M5 — Demo và chuẩn bị pilot | Kiểm tra dữ liệu sai/thiếu, quyền, khởi động lại; đi qua checklist trước pilot; tài liệu sử dụng; phát hành bản open source đầu tiên | Cả nhóm | Có bản demo tái lập được, release có tag, báo cáo giới hạn và tuân thủ |
| M6 — Module mở rộng | Chọn theo phòng khám pilot: kho/cấp thuốc, BHYT, HĐĐT, đơn thuốc quốc gia, LIS/PACS | Theo phân công | Mỗi adapter bật/tắt được và có kiểm thử |
| M7 — Liên thông hai cơ sở | Hai instance độc lập; ánh xạ bệnh nhân; chia sẻ tập dữ liệu nhỏ; quyền và nguồn dữ liệu; thử EHRbase nếu theo ADR-0001 | Người 4 phối hợp cả nhóm | B truy cập đúng hồ sơ từ A; xử lý từ chối và nguồn không phản hồi |
| M8 — AI có dẫn nguồn | Tra cứu/tóm tắt dữ liệu được phép xem; đánh giá sai sót, dữ liệu thiếu và mâu thuẫn | Phân công sau M7 | Kết quả truy về được bản ghi và tuân thủ quyền truy cập |

**Kiểm thử bắt đầu từ M1 và đi cùng từng chức năng.** Các mốc là điểm kiểm chứng; nhóm không chờ mọi màn hình hoàn tất mới nối frontend với backend. Spike nhỏ cho M6–M7 (ví dụ chạy thử EHRbase) có thể làm song song nếu không chặn MVP.

## 7. Phân công đầu việc cho 4 thành viên

Tên thành viên được điền sau. Mỗi người chịu trách nhiệm kiểm tra phần mình làm; người 4 kiểm chứng luồng ghép chung. Các mã đầu việc dùng để tạo issue.

### 7.1. Người 1 — Backend và nền tảng

**Mục tiêu:** Hệ thống OpenMRS chạy được, tái lập được và cung cấp đúng khả năng cần cho MVP-1 và MVP-2.

- [ ] **BE-01 — Khảo sát và chọn baseline:** Ghi nguồn upstream, release/tag/commit, bộ phiên bản, module cần dùng và các phụ thuộc. Phối hợp người 2 chốt frontend tương thích. *(Đã có baseline 3.7.1; còn bảng lựa chọn module.)*
- [ ] **BE-02 — Dựng môi trường:** Cấu hình local, mẫu biến môi trường, khởi động/dừng, readiness, log, giữ database sau restart. *(Đã đạt local.)*
- [ ] **BE-03 — Xác nhận API nền tảng:** Cùng người 4 kiểm tra đăng nhập và API bệnh nhân, visit, encounter, observation, chẩn đoán, đơn thuốc.
- [ ] **BE-04 — Nạp metadata theo gói:** Cùng người 3 tổ chức cấu hình Initializer thành gói Việt Nam và cấu hình cơ sở. Kiểm tra nạp mới, nạp lại và cập nhật không tạo đối tượng trùng.
- [ ] **BE-05 — Thực thi quyền và nhật ký:** Cùng người 3 chốt role/privilege cho 8 role; kiểm tra quyền trên API. Khảo sát nhật ký xem/sửa hồ sơ, ghi phần sẵn có và phần cần bổ sung.
- [ ] **BE-06 — Xử lý khoảng trống:** Khi API hoặc nghiệp vụ thiếu, mô tả vấn đề và chọn cấu hình/module/adapter. Mọi sửa đổi core phải có lý do, phạm vi và cách cập nhật upstream.
- [ ] **BE-07 — Chuẩn bị vận hành:** Backup–restore trên môi trường giả, cập nhật cấu hình, HTTPS khi triển khai ngoài local, xử lý lỗi thường gặp. Phối hợp người 4 đưa kiểm tra vào CI.
- [ ] **BE-08 — Module vận hành phòng khám:** Khảo sát và bật appointments, service queues, billing, dispensing, stock management; đánh giá billing có đáp ứng bảng giá, thu/hoàn/hủy hay cần mở rộng.
- [ ] **BE-09 — Khung adapter:** Đề xuất cấu trúc `integrations/` và cách bật/tắt adapter, chưa cần làm adapter thật.
- [ ] **BE-10 — Chuyển sang PostgreSQL:** Cùng người 4 thay MariaDB bằng PostgreSQL trong Compose, biến môi trường, script, test, CI, `config/baseline.json` và tài liệu. Kiểm chứng Liquibase của Core và mọi module trong distro; ghi module nào lỗi và cách xử lý. Tiêu chí đầy đủ trong [ADR-0002](docs/decisions/0002-postgresql.md#tiêu-chí-hoàn-thành-be-10).

**Bàn giao:** Cấu hình môi trường, bảng phiên bản, hướng dẫn chạy, ma trận khả năng backend, phần mở rộng cần thiết.

**Bắt đầu ngay:** BE-10 (chuyển PostgreSQL) vì mọi đầu việc sau dựng trên database này; song song hoàn tất bảng lựa chọn module (BE-01), BE-03 cùng người 4, khảo sát BE-08.

### 7.2. Người 2 — Frontend và quy trình sử dụng

**Mục tiêu:** Các role thực hiện được quy trình phòng khám trên giao diện O3 bằng tiếng Việt.

- [ ] **FE-01 — Khảo sát luồng và app có sẵn:** Đi qua đăng nhập, đăng ký, tìm kiếm, patient chart, biểu mẫu, appointments, queue, billing, dispensing trên baseline. Ghi phần có sẵn, phần cấu hình được và phần cần phát triển.
- [ ] **FE-02 — Cấu hình bản phân phối frontend:** Chốt package/app shell tương thích với người 1. Quản lý cấu hình, module được dùng và cách build/chạy phần tùy biến.
- [ ] **FE-03 — Việt hóa:** Xác nhận cơ chế translation; dịch nhãn, danh mục, lỗi, thông báo trên luồng được chọn. Đóng góp bản dịch về upstream khi có thể; ghi danh sách phần còn thiếu.
- [ ] **FE-04 — Biểu mẫu ngoại trú:** Dùng dữ liệu và concept UUID của người 3. Có trường bắt buộc, đơn vị, lựa chọn, trạng thái thông tin thiếu và validation đã thống nhất.
- [ ] **FE-05 — Nối luồng thật:** Ghi và mở lại dữ liệu qua API thật; kiểm tra bản ghi vào đúng bệnh nhân và encounter.
- [ ] **FE-06 — Tình huống lỗi:** Loading, không có kết quả, mất kết nối, lưu thất bại, dữ liệu không hợp lệ, thao tác bị từ chối. Quyền trên giao diện khớp quyền backend.
- [ ] **FE-07 — Kiểm chứng cùng người dùng:** Cùng mentor hoặc nhân sự phòng khám đi qua kịch bản; ghi vấn đề sử dụng và cập nhật hướng dẫn demo.
- [ ] **FE-08 — Mẫu in:** Đơn thuốc, phiếu thu, phiếu chỉ định, phiếu kết quả, giấy hẹn. Thông tin cơ sở và người hành nghề lấy từ cấu hình, không viết cứng.
- [ ] **FE-09 — Cấu hình luồng vận hành:** Hàng đợi theo phòng/bác sĩ, trả trước/trả sau, có/không có điều dưỡng hoặc quầy thuốc theo [CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md#các-biến-thể-cần-hỗ-trợ-bằng-cấu-hình).

**Bàn giao:** Cấu hình frontend, biểu mẫu, bản dịch, mẫu in, phần giao diện mở rộng, hướng dẫn quy trình.

**Bắt đầu ngay:** FE-01 trên baseline; FE-04 và FE-08 chỉ chốt sau khi có DATA-01, DATA-02 và mẫu giấy tờ từ khảo sát M0.

### 7.3. Người 3 — Metadata và dữ liệu lâm sàng

**Mục tiêu:** Mọi thành viên hiểu và ghi dữ liệu theo cùng quy ước; gói Việt Nam nạp lại được từ repo.

- [ ] **DATA-01 — Từ điển dữ liệu MVP:** Hoàn thiện [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md): ý nghĩa, kiểu, bắt buộc, đơn vị, danh mục, validation, cách biểu diễn thông tin thiếu. Xin mentor xác nhận phần lâm sàng.
- [ ] **DATA-02 — Bộ metadata:** Concept, location, visit type, encounter type, identifier type (mã nội bộ, CCCD, mã BHXH), drug, form, role. Quản lý UUID ổn định và quan hệ tham chiếu.
- [ ] **DATA-03 — Danh mục và mapping:** ICD-10 theo Bộ Y tế, thuốc, dịch vụ kỹ thuật; ghi nguồn, phiên bản, mã, tên tiếng Việt và mapping khi dùng mã bên ngoài.
- [ ] **DATA-04 — Định danh và quyền:** Cùng người 1 và 4 thống nhất loại mã, cơ sở cấp mã, trường hợp nghi trùng và ma trận quyền cho 8 role.
- [ ] **DATA-05 — Dữ liệu giả:** Bệnh nhân khám nhiều lần, hai người cùng tên, thông tin thiếu, các trạng thái dị ứng, dữ liệu sai, lượt có CLS, lượt bỏ về giữa chừng, thanh toán hoàn/hủy. Ghi cách tạo lại; không dùng hồ sơ thật.
- [ ] **DATA-06 — Kiểm tra nạp/cập nhật:** Cùng người 1 dựng database mới, nạp metadata, chạy lại, cập nhật và kiểm tra biểu mẫu vẫn tham chiếu đúng.
- [ ] **DATA-07 — Phối hợp biểu mẫu và FHIR:** Cùng người 2 kiểm tra trường form; cùng người 4 kiểm tra nguồn, đơn vị, mã và trạng thái khi xuất FHIR.
- [ ] **DATA-08 — Địa giới hành chính:** Danh mục tỉnh → xã theo địa giới hiện hành cho Address Hierarchy; cách lưu địa chỉ cũ để đối chiếu.
- [ ] **DATA-09 — Danh mục dịch vụ và bảng giá mẫu:** Danh mục dịch vụ khám, CLS, thủ thuật; bảng giá mẫu cho dữ liệu giả, tách khỏi gói dùng chung.
- [ ] **DATA-10 — Ánh xạ openEHR:** Đối chiếu từng trường lâm sàng với archetype trên CKM theo [ADR-0001](docs/decisions/0001-openmrs-openehr.md).

**Bàn giao:** Từ điển dữ liệu, gói metadata Việt Nam, bảng mapping, dữ liệu giả, hướng dẫn nạp/cập nhật.

**Bắt đầu ngay:** DATA-01, khung DATA-02, DATA-05 và DATA-08; khảo sát mô hình OpenMRS cùng người 1 để tránh thiết kế trường không lưu được.

### 7.4. Người 4 — API, tích hợp, kiểm thử và CI

**Mục tiêu:** Chứng minh các phần ghép lại đúng bằng kịch bản chạy trên hệ thống thật.

- [ ] **INT-01 — Kịch bản nghiệm thu:** Bước thực hiện và kết quả mong đợi cho quy trình mục 2.3. Bổ sung tình huống sai quyền, thông tin thiếu, bệnh nhân trùng tên, API lỗi, thu tiền sai, hủy lượt.
- [ ] **INT-02 — Hợp đồng API:** Endpoint, xác thực, request/response, lỗi, tìm kiếm, phân trang. Cùng người 1 và 2 xác nhận bằng request thật.
- [ ] **INT-03 — Mock đúng hợp đồng:** Fixture/mock từ API đã thống nhất để frontend làm độc lập; chạy lại kịch bản trên backend thật; cập nhật khi hợp đồng đổi.
- [ ] **INT-04 — Kiểm chứng FHIR:** Đọc `CapabilityStatement`; lập bảng resource và thao tác thực sự hỗ trợ. Ưu tiên Patient, Encounter, Observation; kiểm tra Condition, AllergyIntolerance, MedicationRequest, ServiceRequest.
- [ ] **INT-05 — Mapping dữ liệu:** Cùng người 3 đối chiếu OpenMRS với FHIR: đúng bệnh nhân, lượt khám, mã, đơn vị, thời gian, trạng thái, nguồn.
- [ ] **INT-06 — Kiểm thử tích hợp:** Tự động hóa kiểm tra quan trọng, ví dụ API test và Playwright. Kiểm tra quyền trên API, không chỉ ẩn nút.
- [ ] **INT-07 — CI:** Xác nhận run trên GitHub; chuyển CI sang PostgreSQL cùng BE-10; mở rộng check khi có metadata, biểu mẫu, mã tùy biến; bật branch rules sau run đầu thành công.
- [ ] **INT-08 — Báo cáo demo:** Kịch bản đạt/chưa đạt, cách tái hiện lỗi, phiên bản đã kiểm tra và giới hạn.
- [ ] **INT-09 — Kiểm chứng tuân thủ:** Biến các mục thiết kế trong [VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md#2-yêu-cầu-thiết-kế-rút-ra) thành kiểm tra được (trường bắt buộc trên đơn in, nhật ký, quyền).
- [ ] **INT-10 — Hợp đồng adapter:** Mô tả đầu vào/đầu ra cho adapter BHYT, HĐĐT, đơn thuốc quốc gia, LIS để M6 làm độc lập.

**Bàn giao:** Tài liệu API/FHIR, mock/fixture, kịch bản và mã kiểm thử, CI, báo cáo tích hợp.

**Bắt đầu ngay:** INT-01; INT-02 và INT-04 làm cùng BE-03; xác nhận run CI trên GitHub.

### 7.5. Việc chung — Open source

- [ ] **OSS-01 — Giấy phép:** Chọn giấy phép tương thích MPL 2.0 của OpenMRS, thêm `LICENSE` và ghi nguồn/giấy phép thành phần bên thứ ba.
- [ ] **OSS-02 — Tên và nhận diện:** Xác nhận quyền dùng tên dự án trước khi công bố rộng.
- [ ] **OSS-03 — Hồ sơ cộng đồng:** Issue/PR templates, quy tắc ứng xử, quy trình release và changelog. Đã có [CONTRIBUTING.md](CONTRIBUTING.md) và [SECURITY.md](SECURITY.md).

## 8. Cách phối hợp và các điểm bàn giao

| Thứ cần thống nhất | Người chủ trì | Người cùng kiểm tra | Mốc cần có |
| --- | --- | --- | --- |
| Phiên bản và cách dựng hệ thống | Người 1 | Người 2 + 4 | M1 |
| Quy trình, role và ma trận quyền | Người 3 + mentor | Cả nhóm | M0; kiểm chứng ở M3–M4 |
| Concept, đơn vị và trường form | Người 3 | Người 2 + 4 | Trước khi chốt form và mapping |
| Mẫu in và nội dung bắt buộc | Người 2 | Người 3 + 4 | Trước M4 |
| API và ví dụ request/response | Người 4 | Người 1 + 2 | M1; cập nhật khi thay đổi |
| Lệnh build/test và CI | Người 4 | Người 1 + 2 + 3 theo phần thay đổi | M2 |
| Kịch bản demo xuyên suốt | Người 4 | Cả nhóm | Bản nháp M0; chạy thật từ M1 |
| Quyết định kiến trúc (ADR) | Người đề xuất | Cả nhóm + mentor | Trước khi làm phần phụ thuộc |

Quy tắc làm việc (chi tiết trong [CONTRIBUTING.md](CONTRIBUTING.md)):

1. Mỗi đầu việc có issue, một người chịu trách nhiệm, đầu ra và tiêu chí hoàn thành.
2. Làm trên nhánh riêng và gửi PR vào `main`; người liên quan review.
3. Khi đổi API, UUID, form, mẫu in hoặc phiên bản, cập nhật tài liệu/fixture và báo người dùng phần đó.
4. PR ghi rõ thay đổi, cách kiểm chứng và giới hạn. Check CI bắt buộc phải đạt trước khi merge.
5. Quyết định ảnh hưởng nhiều phần được ghi thành ADR trong `docs/decisions/`.
6. Một chức năng hoàn thành khi đã tích hợp và được người khác kiểm chứng, không chỉ chạy trên máy tác giả.
7. Không đưa dữ liệu bệnh nhân thật vào repo, issue, PR hoặc ảnh chụp.

### Cấu trúc repo dự kiến

```text
EHR-VinSHC/
├── README.md, PROJECT_PLAN.md, CONTRIBUTING.md, SECURITY.md, LICENSE
├── docs/                        # Quy trình, kiến trúc, dữ liệu, tuân thủ, API, vận hành
│   └── decisions/               # ADR
├── config/                      # Baseline đã khóa
├── infra/backend/configuration/ # Gói Việt Nam + cấu hình cơ sở mẫu (Initializer)
├── frontend/                    # Cấu hình, bản dịch, mẫu in, phần frontend tùy biến
├── modules/                     # Module backend riêng khi có nhu cầu đã xác nhận
├── integrations/                # Adapter BHYT, HĐĐT, đơn thuốc QG, LIS, PACS, openEHR
├── tests/                       # API test, integration/E2E, fixture giả
├── scripts/                     # Lệnh chạy, build, kiểm tra, tạo dữ liệu giả
└── .github/workflows/           # CI
```

Đây là cấu trúc đề xuất. Người 1 và 2 điều chỉnh theo distribution, giữ quy ước upstream cần thiết. Chỉ tạo thư mục khi có nội dung.

## 9. Tiêu chí nghiệm thu

### MVP-1 (M3)

- [ ] Một thành viên khác dựng hệ thống từ repo và tài liệu, không cần hướng dẫn miệng.
- [ ] Bộ phiên bản, cấu hình và dữ liệu giả dùng cho demo được xác định rõ.
- [ ] Tiếp đón đăng ký/tìm đúng bệnh nhân bằng mã nội bộ, CCCD hoặc tên; hồ sơ cùng tên không bị tự gộp.
- [ ] Địa chỉ dùng danh mục hành chính hiện hành.
- [ ] Điều dưỡng ghi sinh hiệu; bác sĩ ghi và đọc lại hồ sơ theo đúng quyền.
- [ ] Biểu mẫu ghi dữ liệu vào đúng bệnh nhân, visit/encounter và concept.
- [ ] Chẩn đoán ICD-10, đơn thuốc và dị ứng giữ đúng ý nghĩa/trạng thái đã thống nhất.
- [ ] Có kiểm tra trường bắt buộc, dữ liệu không hợp lệ và thông tin thiếu.
- [ ] API từ chối thao tác vượt quyền cho cả 8 role; có báo cáo phần nhật ký đã có và còn thiếu.
- [ ] REST và tập dữ liệu FHIR đã chọn được kiểm tra trên backend thật, có bảng mapping và giới hạn.

### MVP-2 (M4)

- [ ] Quy trình mục 2.3 chạy trọn với dữ liệu giả, gồm hàng đợi, thu tiền, CLS và tái khám.
- [ ] Hai biến thể cấu hình (trả trước/trả sau; có/không có quầy thuốc) chạy được.
- [ ] Đơn thuốc in ra đủ thông tin bắt buộc đã đối chiếu.
- [ ] Phiếu thu và báo cáo doanh thu ngày khớp dữ liệu; hoàn/hủy truy vết được.
- [ ] Dữ liệu còn sau khởi động lại; backup–restore đã thử thành công.

### Trước pilot (M5)

- [ ] Hoàn thành checklist [trước pilot](docs/VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật).
- [ ] Có `LICENSE`, release có tag, hướng dẫn demo, báo cáo lỗi còn lại và phạm vi chưa hỗ trợ.

Đạt MVP không có nghĩa đã hoàn thành hệ thống vận hành bệnh viện, chuẩn quốc gia hoặc mọi yêu cầu pháp lý về bệnh án điện tử. Các mục tiêu đó có phạm vi và nghiệm thu riêng.

## 10. Phạm vi các giai đoạn sau

### 10.1. Module mở rộng cho phòng khám (M6)

Chọn theo nhu cầu phòng khám pilot. Mỗi module là adapter hoặc gói bật/tắt được:

- Kho thuốc, cấp thuốc, hạn dùng.
- Xuất dữ liệu BHYT theo chuẩn XML hiện hành.
- Hóa đơn điện tử qua nhà cung cấp.
- Liên thông đơn thuốc quốc gia.
- LIS (OpenELIS hoặc HL7 với máy xét nghiệm), PACS (Orthanc).
- Nhắc lịch qua SMS/Zalo.

### 10.2. Lên chuỗi phòng khám và bệnh viện

Theo [ARCHITECTURE.md](docs/ARCHITECTURE.md): mỗi cơ sở một instance; ERP cho kế toán và kho chuyên sâu; nội trú và giường; MPI, interoperability layer, terminology server; HA, giám sát. OpenMRS đóng vai trò EMR lâm sàng, không phải toàn bộ HIS.

### 10.3. Liên thông hai cơ sở (M7)

- Dựng A và B bằng hai instance/database độc lập; mỗi cơ sở giữ hồ sơ gốc.
- Bắt đầu bằng ánh xạ bệnh nhân được xác nhận trên dữ liệu giả; xử lý trường hợp chưa xác định được cùng người.
- Chọn tập dữ liệu nhỏ để chia sẻ, ví dụ dị ứng, chẩn đoán, thuốc, sinh hiệu.
- Chốt xác thực giữa hệ thống, chính sách chia sẻ, nơi thực thi quyền và cách ghi nhận đồng ý của người bệnh.
- B hiển thị rõ dữ liệu từ A, thời điểm và trạng thái; không tự ghi đè hồ sơ B.
- Kiểm tra từ chối truy cập, thu hồi quyền, bản ghi trùng, nguồn mất kết nối, dữ liệu chỉ nhận được một phần.
- Record Locator cần quy tắc cập nhật chỉ mục và kiểm soát quyền; thông tin "bệnh nhân có hồ sơ ở đâu" cũng cần được bảo vệ.
- Sau thử nghiệm hai OpenMRS, thêm một nguồn có mô hình khác (ví dụ EHRbase) để kiểm chứng mapping.

### 10.4. openEHR

Theo [ADR-0001](docs/decisions/0001-openmrs-openehr.md). Không coi việc bật FHIR2 là đã hoàn thành openEHR.

### 10.5. AI tra cứu và tóm tắt (M8)

- Người dùng đầu tiên là bác sĩ đọc hồ sơ.
- Dùng cùng chính sách quyền với luồng đọc hồ sơ; truy xuất qua API/service được kiểm soát.
- Tóm tắt và dẫn về bản ghi, thời điểm, cơ sở tạo dữ liệu.
- Đánh giá các trường hợp sai bệnh nhân, thiếu dữ liệu, mâu thuẫn, thông tin cũ và câu trả lời không có nguồn.
- Giới hạn ở đọc/tra cứu/tóm tắt; ghi hồ sơ hoặc đề xuất điều trị cần phạm vi và quy trình đánh giá riêng.
- Xử lý dữ liệu sức khỏe bằng AI phải tuân thủ quy định bảo vệ dữ liệu cá nhân, đặc biệt khi dùng dịch vụ bên ngoài.

## 11. Các quyết định cần chốt với mentor/nhóm trưởng

| Quyết định | Giả định hiện tại để lập kế hoạch | Thời điểm cần chốt |
| --- | --- | --- |
| Phòng khám mục tiêu và quy trình | Phòng khám tư một địa điểm, ngoại trú, có CLS cơ bản; xác nhận qua khảo sát | M0 |
| Role và ma trận quyền | 8 role ghép từ privilege | M0 |
| Bộ dữ liệu và biểu mẫu | Tập tối thiểu theo [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md); mentor xác nhận | Trước DATA-01 và FE-04 |
| Vai trò openEHR | Theo đề xuất ADR-0001 | M0, trước M3 |
| Database | PostgreSQL ([ADR-0002](docs/decisions/0002-postgresql.md)); phiên bản major chốt trong BE-10 | Đã quyết định; kiểm chứng trước M3 |
| Giấy phép open source | Tương thích MPL 2.0 | M0 |
| Tên dự án khi công bố | Chưa xác nhận | Trước M5 |
| Module mở rộng ưu tiên | Theo phòng khám pilot | Trước M6 |
| Phạm vi triển khai | Demo dữ liệu giả trước; pilot là mốc riêng | Trước M5 |
| Deadline và thời gian thành viên | Chưa ấn định lịch tuần | Khi phân công issue |
| Cách chia sẻ dữ liệu ở M7 | Dữ liệu gốc tại cơ sở; bắt đầu với tập nhỏ và chính sách rõ | Trước M7 |

## 12. Tài liệu tham khảo

Khi chọn baseline, ghi lại release/tag/commit thực tế; không mặc định nhánh `main`/`master` tương thích với bản nhóm dùng. Văn bản pháp lý Việt Nam được liệt kê và theo dõi xác minh trong [VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md).

- [OpenMRS 3 Reference Application](https://github.com/openmrs/openmrs-distro-referenceapplication): nền tảng distribution và cấu trúc triển khai.
- [Thiết lập instance O3](https://o3-docs.openmrs.org/en-US/docs/recipes/set-up-o3-instance/): dựng hệ thống và chọn phiên bản cố định.
- [Tạo O3 distribution](https://o3-docs.openmrs.org/en-US/docs/recipes/create-a-distribution/): assemble/build frontend và quản lý phiên bản.
- [OpenMRS Initializer](https://github.com/mekomsolutions/openmrs-module-initializer) và [quy ước CSV/UUID](https://github.com/mekomsolutions/openmrs-module-initializer/blob/main/readme/csv_conventions.md): metadata và cấu hình.
- [OpenMRS Platform 2.8.0 release notes](https://openmrs.atlassian.net/wiki/spaces/docs/pages/558891067/Platform+Release+Notes+2.8.0+2025-08) và [startup script của image Core](https://github.com/openmrs/openmrs-core/blob/2.8.x/startup-init.sh): hỗ trợ PostgreSQL và biến `OMRS_DB_*`.
- [OpenMRS FHIR2](https://github.com/openmrs/openmrs-module-fhir2) và [hướng dẫn FHIR](https://openmrs.atlassian.net/wiki/pages/viewpage.action?pageId=26935684&pageVersion=86): API FHIR và CapabilityStatement.
- [Bahmni](https://www.bahmni.org/): mô hình ghép OpenMRS với ERP, LIS, PACS cho bệnh viện.
- [OpenHIE](https://ohie.org/): kiến trúc liên thông (MPI, interoperability layer, terminology).
- [FHIR R4 profiling](https://hl7.org/fhir/R4/profiling.html), [security](https://hl7.org/fhir/R4/security.html) và [Consent](https://hl7.org/fhir/R4/consent.html).
- [openEHR Architecture Overview](https://specifications.openehr.org/releases/BASE/latest/architecture_overview.html), [Clinical Knowledge Manager](https://ckm.openehr.org/) và [EHRbase](https://github.com/ehrbase/ehrbase).
- [Văn bản Bộ Y tế dẫn chiếu phạm vi Quyết định 130](https://emohbackup.moh.gov.vn/publish/attach/getfile/412729): phân biệt đầu ra BHYT với hồ sơ lâm sàng.
