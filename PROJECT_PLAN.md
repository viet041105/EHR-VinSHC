# Kế hoạch triển khai EHR-VinSHC

**Ngày cập nhật:** 14/10/2026

**Nhóm:** 4 thành viên

**Mục đích:** Giúp thành viên mới hiểu sản phẩm cần làm, nhận đúng đầu việc và biết khi nào công việc được coi là hoàn thành.

> Mục tiêu là một bản phân phối OpenMRS 3 mã nguồn mở cho **phòng khám tư nhân tại Việt Nam**. Bản đầu tiên phục vụ một phòng khám với luồng ngoại trú, thu tiền, kê đơn, cận lâm sàng cơ bản và **trợ lý AI chỉ đọc cho bác sĩ và bệnh nhân**. Kiến trúc tách theo gói và adapter để sau này mở rộng lên chuỗi phòng khám và bệnh viện, liên thông dữ liệu và AI trên dữ liệu dài hạn.
>
> Repo đã có cấu hình Docker và workflow CI cho baseline. Xem [hướng dẫn môi trường](docs/DEVELOPMENT.md) và [phạm vi CI](docs/CI.md); theo dõi kết quả workflow trong [GitHub Actions](https://github.com/viet041105/EHR-VinSHC/actions).

**Tài liệu liên quan:**

| Tài liệu | Nội dung |
| --- | --- |
| [docs/CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md) | Vai trò, quy trình phòng khám tư, giấy tờ đầu ra, câu hỏi khảo sát |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Các tầng phòng khám → chuỗi → bệnh viện, phân loại module, mô hình triển khai |
| [docs/VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md) | Checklist pháp lý và yêu cầu thiết kế tại Việt Nam |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Từ điển dữ liệu MVP, ánh xạ OpenMRS / FHIR / openEHR |
| [docs/AGENT_PLAN.md](docs/AGENT_PLAN.md) | Thiết kế trợ lý AI: luồng bác sĩ (A), luồng bệnh nhân (P), dữ liệu, quyền, đánh giá |
| [docs/decisions/](docs/decisions/) | Các quyết định kiến trúc (ADR) |
| [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) | Quy tắc đóng góp và báo lỗ hổng |

## 1. Đọc nhanh trước khi bắt đầu

1. Dùng **OpenMRS 3 Reference Application** làm nền tảng, rồi tạo bản phân phối riêng cho phòng khám tư Việt Nam.
2. Ưu tiên cấu hình, metadata, biểu mẫu, mẫu in và module mở rộng. Chỉ fork repo upstream khi có nhu cầu sửa mã nguồn cụ thể.
3. Làm theo thứ tự: **lõi lâm sàng (MVP-1)** → **vận hành phòng khám (MVP-2)** → pilot → các module mở rộng. Phòng khám tư không dùng được hệ thống nếu thiếu thu tiền, hàng đợi và in đơn thuốc, nên MVP-2 là điều kiện trước pilot. **Trợ lý AI (MVP-3)** làm song song với MVP-2 trên dữ liệu giả và phải đạt trước bản demo M5.
4. Chuẩn hóa dữ liệu từ đầu: kiểu dữ liệu, đơn vị, mã định danh, thuật ngữ, nguồn tạo dữ liệu, và ánh xạ sẵn sang FHIR và openEHR.
5. Tách rõ ba loại phần riêng: **gói Việt Nam dùng chung**, **cấu hình từng cơ sở**, **adapter tích hợp tùy chọn** (BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS, PACS).
6. Giữ cách chia 4 người: backend; frontend; metadata, dữ liệu và trợ lý AI; API, tích hợp và kiểm thử.
7. Chốt với mentor vai trò của openEHR theo [ADR-0001](docs/decisions/0001-openmrs-openehr.md). Đề xuất hiện tại: OpenMRS là nơi lưu gốc ở tầng phòng khám; openEHR (EHRbase) được thêm ở tầng bệnh viện.
8. Trợ lý AI chỉ **đọc và giải thích** dữ liệu mà người hỏi được phép xem, mỗi câu trả lời có dẫn nguồn. Trợ lý không chẩn đoán, không kê đơn, không ghi hồ sơ. Model bên ngoài chỉ được dùng với dữ liệu giả cho tới khi qua gate AI trước pilot.

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
- Trợ lý AI cho bác sĩ và bệnh nhân, cổng bệnh nhân tối thiểu, bộ ca đánh giá synthetic và báo cáo giới hạn của AI.
- Tài liệu sử dụng, vận hành, tuân thủ và giới hạn của bản thử nghiệm.
- Hồ sơ open source: giấy phép, hướng dẫn đóng góp, chính sách bảo mật.

### 2.2. Đối tượng và vai trò

Phòng khám mục tiêu: một địa điểm, 1–5 bác sĩ, 20–150 lượt khám/ngày, có thể có cận lâm sàng cơ bản và quầy thuốc. Chi tiết trong [CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md).

Các role: **tiếp đón, thu ngân, điều dưỡng, bác sĩ, kỹ thuật viên CLS, dược/quầy thuốc, quản lý phòng khám, quản trị hệ thống**. Role được ghép từ privilege; một người có thể giữ nhiều role, vì phòng khám nhỏ thường kiêm nhiệm.

**Bệnh nhân** là người dùng của cổng bệnh nhân (MVP-3), không phải một role nhân viên. Bệnh nhân chỉ đọc phần hồ sơ **của chính mình đã được công bố**. Tài khoản bệnh nhân chỉ được liên kết với hồ sơ sau khi tiếp đón đối chiếu giấy tờ.

### 2.3. Luồng khám cần hoàn thành

```text
[Đặt lịch] → Tiếp đón: tìm/đăng ký bệnh nhân, mở lượt khám, cấp số
    → Thu phí khám (trả trước hoặc trả sau theo cấu hình)
    → Điều dưỡng ghi sinh hiệu → hàng đợi bác sĩ
    → Bác sĩ đọc hồ sơ (lần khám đang mở hoặc lần trước)
          └─ {Trợ lý AI bác sĩ: tóm tắt lần khám, hỏi đáp có dẫn nguồn}
    → Bác sĩ ghi bệnh sử, dị ứng, khám
    → [Chỉ định CLS → thu phí → KTV nhập kết quả → bác sĩ đọc]
    → Chẩn đoán ICD-10, kê đơn, hẹn tái khám, in đơn
    → Thu tiền thuốc → [quầy thuốc cấp thuốc]
    → Kết thúc lượt khám → xem lại lịch sử
    → Phần hồ sơ được công bố (lời dặn, đơn thuốc đã chốt, lịch hẹn)
          └─ Bệnh nhân xem trên cổng {Trợ lý AI bệnh nhân: giải thích có dẫn nguồn}
```

Bước trong `[ ]` tùy chọn theo cấu hình phòng khám. Bước trong `{ }` là trợ lý AI: có thể tắt, và khi tắt hoặc lỗi thì luồng khám vẫn chạy bình thường.

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

**MVP-3 — Trợ lý AI cho bác sĩ và bệnh nhân** (mốc M4A, làm song song MVP-2; thiết kế chi tiết trong [AGENT_PLAN.md](docs/AGENT_PLAN.md))

| Nhóm chức năng | Cần có | Bằng chứng hoàn thành |
| --- | --- | --- |
| Trợ lý bác sĩ (luồng A) | Tóm tắt **một lần khám được chọn**: lý do khám, bệnh sử, tiền sử, khám, chẩn đoán, thuốc, dị ứng, lời dặn, hẹn tái khám. Hỏi đáp trong phạm vi lần khám đó. Nêu thông tin thiếu theo đúng loại | Mỗi câu có nguồn mở lại được; không trộn bệnh nhân hay lần khám khi bác sĩ đổi hồ sơ; phân biệt "chưa hỏi", "không có" và "nguồn chưa cung cấp" |
| Cổng bệnh nhân tối thiểu | Liên kết tài khoản–hồ sơ do tiếp đón xác nhận; bệnh nhân đăng nhập; xem lần khám, lời dặn, đơn thuốc đã chốt và lịch hẹn **đã được công bố** | Bệnh nhân A không đọc được hồ sơ B kể cả khi sửa UUID; bản nháp và phần chỉ dành cho nhân viên không xuất hiện |
| Trợ lý bệnh nhân (luồng P) | Chat giải thích lời dặn, hướng dẫn trong đơn và lịch hẹn bằng ngôn ngữ dễ hiểu, có dẫn nguồn | Không tự thêm liều, giờ uống hay lời khuyên ngoài nguồn; câu ngoài phạm vi được từ chối và hướng dẫn bệnh nhân hỏi nhân viên y tế |
| An toàn | Chỉ có tool đọc; backend kiểm quyền ở mỗi lần đọc; câu không có nguồn bị loại; khi bệnh nhân mô tả dấu hiệu khẩn cấp, trợ lý trả một câu cố định (không qua model) khuyên gọi cấp cứu 115 hoặc liên hệ phòng khám; nội dung hồ sơ không điều khiển được agent | Toàn bộ ca sai quyền, đổi context, bệnh nhân A→B, bản nháp và prompt injection trong bộ đánh giá đều đạt |
| Vận hành | Bật/tắt bằng cấu hình; agent hoặc model lỗi thì luồng khám vẫn chạy; log không chứa nội dung hồ sơ; audit phân biệt lượt đọc do agent | Thử tắt agent và ngắt model trong lúc chạy kịch bản demo |
| Đánh giá | Bộ 10–20 ca synthetic ban đầu cho cả A và P, có expected output; bác sĩ hoặc mentor review cách diễn đạt | Báo cáo có mẫu số, commit, model, độ trễ, chi phí mỗi lượt và giới hạn |

**Trợ lý AI không làm trong MVP:** chẩn đoán mới, đề xuất điều trị, kê/đổi/ngừng thuốc, ghi hoặc chốt hồ sơ, đặt chỉ định, trả lời câu hỏi y khoa chung không dựa trên hồ sơ. Đặt/đổi lịch qua chat, nhắc lịch, đọc lịch sử nhiều lần khám và tra cứu tài liệu (RAG) thuộc giai đoạn sau ([mục 10.5](#105-ai-mở-rộng-sau-mvp-m8)).

**Dữ liệu dùng cho AI:** MVP-3 chạy bằng `FakeModel` hoặc model bên ngoài **chỉ với dữ liệu giả**. Với dữ liệu thật, trợ lý mặc định tắt cho tới khi qua [gate AI trước pilot](docs/VIETNAM_COMPLIANCE.md#4-trợ-lý-ai).

**Module mở rộng — bật theo phòng khám** (sau pilot)

Kho thuốc và cấp thuốc; adapter BHYT (XML theo QĐ 130 và văn bản sửa đổi); hóa đơn điện tử; liên thông đơn thuốc quốc gia; LIS/PACS; nhắc lịch SMS/Zalo. Mỗi module có thể tắt mà lõi vẫn chạy.

**Ngoài phạm vi tầng phòng khám:** nội trú, quản lý giường, phòng mổ, ERP đầy đủ. Các phần này thuộc tầng bệnh viện trong [ARCHITECTURE.md](docs/ARCHITECTURE.md).

**MVP được nghiệm thu bằng dữ liệu giả.** Việc dùng tại phòng khám thật cần một mốc đánh giá riêng về nghiệp vụ, vận hành, bảo mật và pháp lý, theo [VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật).

## 3. Kiến trúc và nguyên tắc kỹ thuật

### 3.1. Kiến trúc tầng phòng khám

```text
Người dùng       Nhân viên (8 role)                 Bệnh nhân
                      │                                │
                      ▼                                ▼
Giao diện        Giao diện nhân viên                Cổng bệnh nhân
                 + "Trợ lý hồ sơ"                   + "Trợ lý của tôi"
                      │          │                   │                │
Trợ lý AI             │          └──► Agent service ◄┘                │
                      │               (infra/agent, chỉ đọc)          │
                      │                   ├──► Model (Fake / LLM)     │
                      │                   │ phiên của người hỏi       │
                      ▼                   ▼                           ▼
Backend          OpenMRS + module VinSHC: REST / FHIR, kiểm quyền, audit
                      │                   │                   └──► Adapter tùy chọn
                      │                   │                        (BHYT, HĐĐT, đơn thuốc QG,
                      ▼                   ▼                        LIS, PACS)
Dữ liệu          PostgreSQL          FHIR2 API
                 (hồ sơ gốc)         (app O3, liên thông sau này)

Gói Việt Nam + cấu hình cơ sở được quản lý trong Git
              └── Nạp vào hệ thống bằng Initializer
```

Agent không có kho dữ liệu bệnh án riêng và không có tài khoản riêng. Mỗi lần đọc đi qua backend bằng phiên đăng nhập của người hỏi, nên quyền và audit giống như khi người đó tự mở hồ sơ.

Lộ trình lên chuỗi phòng khám và bệnh viện, cùng cách phân loại module, nằm trong [ARCHITECTURE.md](docs/ARCHITECTURE.md).

### 3.2. Các quyết định nền tảng

- **Bản phân phối:** Bắt đầu từ OpenMRS 3 Reference Application; lưu nguồn upstream và release/tag/commit làm nền (hiện tại 3.7.1, xem `config/baseline.json`).
- **Phiên bản:** Khóa bộ phiên bản tương thích, gồm image, module, package và công cụ build. Không phụ thuộc tag động như `latest`, `next` hoặc `qa`.
- **Backend:** Tái sử dụng API và mô hình của OpenMRS. Thêm module hoặc adapter khi xác định được khoảng trống cụ thể.
- **Frontend:** Tái sử dụng các app O3 (registration, patient chart, appointments, service queues, billing, dispensing, stock). Ưu tiên cấu hình, dịch thuật và biểu mẫu trước khi sửa core.
- **Database:** **PostgreSQL** theo [ADR-0002](docs/decisions/0002-postgresql.md), dùng chung hệ quản trị với EHRbase, OpenCR và kho dữ liệu ở tầng sau. Để OpenMRS quản lý schema. Chức năng mới thao tác qua API/service. Migration cho phần mở rộng được quản lý riêng và phải chạy trên PostgreSQL. Baseline trong `compose.yaml` dùng PostgreSQL 16.15; bản sửa tương thích nằm trong `infra/backend/postgresql/` và bằng chứng local trong `docs/VALIDATION.md`.
- **Metadata:** Lưu trong Git theo gói, dùng UUID ổn định, kiểm tra việc nạp lại và cập nhật.
- **Mỗi cơ sở một instance:** OpenMRS không hỗ trợ multi-tenant. Không dùng chung database giữa các pháp nhân.
- **Tích hợp:** Mọi kết nối hệ thống bên ngoài đi qua adapter có thể tắt.
- **openEHR:** Theo [ADR-0001](docs/decisions/0001-openmrs-openehr.md).
- **Trợ lý AI:** Service riêng `infra/agent/` (Python, FastAPI, LangGraph) theo [AGENT_PLAN.md](docs/AGENT_PLAN.md). Hai policy A (bác sĩ) và P (bệnh nhân) được chọn theo danh tính đã xác thực ở server, không theo nội dung câu hỏi. Chỉ có tool đọc trong allowlist. Model chỉ thấy dữ kiện đã chuẩn hóa, không thấy credential, UUID hay định danh cá nhân không cần thiết; validator loại câu không có nguồn hoặc có số không khớp bản ghi. Provider model cấu hình được: mặc định `FakeModel`; model bên ngoài phải bật cờ riêng và chỉ dùng với dữ liệu giả cho tới khi qua gate AI. MVP không lưu hội thoại. RAG/pgvector chỉ thêm ở giai đoạn sau, trong database riêng.
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
| Phạm vi công bố | Phân biệt dữ liệu chỉ dành cho nhân viên với phần đã công bố cho bệnh nhân; ghi ai công bố và lúc nào. Cổng bệnh nhân và trợ lý bệnh nhân chỉ đọc phần đã công bố |
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
| Trợ lý AI / Agent | Service đọc dữ liệu người hỏi được phép xem và trả lời có dẫn nguồn; không ghi hồ sơ |
| Dẫn nguồn | Mỗi câu trả lời gắn với bản ghi gốc (loại, UUID, trường, thời điểm) để người dùng mở lại đối chiếu |
| Cổng bệnh nhân | Giao diện để bệnh nhân đọc phần hồ sơ đã công bố của chính mình |
| Chính sách công bố | Quy tắc phần nào của hồ sơ được cung cấp cho bệnh nhân, ai quyết định và khi nào |

## 6. Các mốc triển khai và điều kiện chuyển bước

Các mốc quy định thứ tự và đầu ra, chưa ấn định số tuần. Nhóm bổ sung lịch và người thực hiện theo deadline và quỹ thời gian.

| Mốc | Công việc chính | Phụ trách | Điều kiện chuyển bước |
| --- | --- | --- | --- |
| M0 — Chốt nghiệp vụ | Khảo sát 1–2 phòng khám tư; chốt luồng, role, ma trận quyền, dữ liệu tối thiểu, mẫu giấy tờ; rà soát checklist pháp lý; chốt ADR-0001 và giấy phép | Cả nhóm + mentor | Có [CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md) đã xác nhận, ADR-0001 được chấp nhận, có `LICENSE` |
| M1 — Dựng baseline | Chọn release; dựng môi trường; kiểm tra đăng nhập, frontend, REST/FHIR; dữ liệu giả; baseline PostgreSQL (BE-10, đã đạt local) | Người 1 + 2; người 3 + 4 kiểm chứng | Một thành viên khác dựng lại được **trên PostgreSQL**. Baseline PostgreSQL có bằng chứng local ([VALIDATION.md](docs/VALIDATION.md)); mỗi môi trường và run CI vẫn phải được kiểm chứng |
| M2 — Repo và CI tối thiểu | Cấu trúc, lệnh chạy/build/test, PR; kiểm tra khả dụng trong CI | Người 4 + 1 | Pipeline chạy trên GitHub và lỗi làm check thất bại. **Workflow đã có**, cần xác nhận run trên GitHub |
| M3 — MVP-1 lõi lâm sàng | Gói metadata Việt Nam, biểu mẫu, Việt hóa, role, luồng khám, kiểm thử tích hợp | Cả 4 người | Chạy xuyên suốt kịch bản MVP-1 trên backend thật |
| M4 — MVP-2 vận hành phòng khám | Lịch hẹn, hàng đợi, bảng giá, thu tiền, chỉ định CLS, mẫu in, báo cáo, backup–restore | Cả 4 người | Chạy trọn quy trình mục 2.3 với dữ liệu giả, có in ấn và đối soát tiền |
| M4A — MVP-3 trợ lý AI | Chốt phạm vi A/P và contract dữ liệu; bộ ca đánh giá; agent A nối workspace bác sĩ; cổng bệnh nhân tối thiểu và agent P; kiểm thử quyền và an toàn; đưa agent vào Compose và CI | Người 3 chủ trì; người 1 (API, cổng bệnh nhân), người 2 (giao diện), người 4 (kiểm thử, CI) | Tiêu chí MVP-3 ở mục 9 đạt trên dữ liệu giả, chạy với backend thật |
| M5 — Demo và chuẩn bị pilot | Kiểm tra dữ liệu sai/thiếu, quyền, khởi động lại; đi qua checklist trước pilot, gồm gate AI; quyết định bật/tắt trợ lý AI với dữ liệu thật; tài liệu sử dụng; phát hành bản open source đầu tiên | Cả nhóm | Có bản demo tái lập được gồm MVP-1, MVP-2 và MVP-3; release có tag; báo cáo giới hạn và tuân thủ |
| M6 — Module mở rộng | Chọn theo phòng khám pilot: kho/cấp thuốc, BHYT, HĐĐT, đơn thuốc quốc gia, LIS/PACS | Theo phân công | Mỗi adapter bật/tắt được và có kiểm thử |
| M7 — Liên thông hai cơ sở | Hai instance độc lập; ánh xạ bệnh nhân; chia sẻ tập dữ liệu nhỏ; quyền và nguồn dữ liệu; thử EHRbase nếu theo ADR-0001 | Người 4 phối hợp cả nhóm | B truy cập đúng hồ sơ từ A; xử lý từ chối và nguồn không phản hồi |
| M8 — AI mở rộng | Lịch sử nhiều lần khám, sinh hiệu và kết quả CLS; tra cứu tài liệu được duyệt (RAG); nhắc lịch và gửi thông tin tự báo cáo; AI trên dữ liệu liên thông | Người 3 chủ trì; chốt phạm vi sau M5 | Mỗi chức năng mới có bộ đánh giá riêng, dẫn nguồn và tuân thủ quyền như MVP-3 |

**M4 và M4A chạy song song; M5 cần cả hai.** Trợ lý AI chỉ dùng API đã có của MVP-1 nên không phải chờ MVP-2 xong.

**Kiểm thử bắt đầu từ M1 và đi cùng từng chức năng.** Các mốc là điểm kiểm chứng; nhóm không chờ mọi màn hình hoàn tất mới nối frontend với backend. Spike nhỏ cho M6–M7 (ví dụ chạy thử EHRbase) có thể làm song song nếu không chặn MVP.

## 7. Phân công đầu việc cho 4 thành viên

Tên thành viên được điền sau. Mỗi người chịu trách nhiệm kiểm tra phần mình làm; người 4 kiểm chứng luồng ghép chung. Các mã đầu việc dùng để tạo issue.

**Điều chỉnh 09/10/2026:** Người 4 có nhiều thời gian nhất nên nhận thêm BE-03, BE-07, BE-09 của người 1 và FE-05, FE-07 của người 2. Mã đầu việc giữ nguyên để không phải đổi issue và liên kết. Phần triển khai ngoài local của BE-07 cũ tách thành BE-11 và ở lại người 1 vì phải sửa `compose.yaml`/`infra/`. BE-08 chia theo module: người 1 giữ billing, dispensing, stock management; appointments và service queues tách thành BE-12 cho người 4. FE-05 chỉ chuyển phần adapter dữ liệu; phần giao diện gọi adapter vẫn do người 2 làm. Mỗi việc chuyển đi có đầu ra nằm trong vùng file của người 4 ([mục 8.1](#81-vùng-file-phụ-trách)), nên không ai phải sửa cùng file với người khác.

**Bổ sung 14/10/2026:** Trợ lý AI được đưa vào MVP (MVP-3, mốc M4A). Người 3 chủ trì theo [AGENT_PLAN.md](docs/AGENT_PLAN.md) và nhận AI-01 đến AI-07. Phần backend, giao diện và kiểm thử được giao theo vùng file: BE-13, BE-14 cho người 1; FE-10, FE-11 cho người 2; INT-11 cho người 4.

### 7.1. Người 1 — Backend và nền tảng

**Mục tiêu:** Hệ thống OpenMRS chạy được, tái lập được và cung cấp đúng khả năng cần cho MVP-1 và MVP-2.

- [x] **BE-01 — Khảo sát và chọn baseline:** Nguồn upstream, release/tag/commit, bộ phiên bản, 29 module và phụ thuộc đã được khóa trong `config/baseline.json`; ma trận lựa chọn và giới hạn nằm trong [`docs/api/capabilities.md`](docs/api/capabilities.md).
- [x] **BE-02 — Dựng môi trường:** Cấu hình local, mẫu biến môi trường, khởi động/dừng, readiness, log và giữ dữ liệu sau restart đã được kiểm tra bằng Docker/PostgreSQL.
- [x] **BE-04 — Nạp metadata theo gói:** Initializer và các overlay metadata Việt Nam có UUID/version ổn định; nạp mới, nạp lại và cập nhật idempotent đã được kiểm tra trên database sạch. Việc phê duyệt catalogue production vẫn là gate riêng.
- [x] **BE-05 — Thực thi quyền và nhật ký:** Đã kiểm tra 8 role, 69 privilege và ma trận 896 trường hợp theo default-deny; write/correction/void và read qua adapter có audit. Tài khoản cá nhân production và gateway log cho break-glass vẫn là gate triển khai.
- [x] **BE-06 — Xử lý khoảng trống:** Các khoảng trống Core/module đã được ghi trong `docs/api/`; phần cần thiết được xử lý bằng metadata hoặc module/adapter VinSHC, không sửa OpenMRS Core. Giới hạn upstream và đường nâng cấp đã được tài liệu hóa.
- [ ] **BE-08 — Module thu tiền và thuốc (billing, dispensing, stock management):** **Đạt phần billing:** bảng giá theo cơ sở, thu một phần, trả trước/sau, pending/settled, hoàn/hủy, VND nguyên và actor trace đã được kiểm thử ở B8. **Còn mở:** chưa kiểm thử nghiệp vụ dispensing/`MedicationDispense`, nhập/xuất/tồn kho, lô/hạn dùng và quyền kho. Phạm vi đã chốt đưa kho đầy đủ sang M6 sau pilot; trước khi đóng BE-08 cần xác nhận cấp thuốc tối thiểu thuộc pilot hay M6. Kết quả hiện tại nằm trong `docs/api/capabilities.md`.
- [x] **BE-10 — Baseline PostgreSQL:** Stack chạy trên PostgreSQL 16.15 (Compose, biến môi trường, script, test, CI, `config/baseline.json`, tài liệu). Liquibase của Core và đủ 29 module chạy hết trên database trống; lỗi tương thích và cách sửa ghi trong [`infra/backend/postgresql/README.md`](infra/backend/postgresql/README.md). *(Đạt local, xem [VALIDATION.md](docs/VALIDATION.md). Các tiêu chí còn mở trong [ADR-0002](docs/decisions/0002-postgresql.md#tiêu-chí-hoàn-thành-be-10) đã giao cho việc khác: Initializer nạp lại không trùng → BE-04/DATA-06; run CI trên GitHub → INT-07.)*
- [ ] **BE-11 — Cấu hình triển khai ngoài local:** HTTPS ở gateway/reverse proxy, secrets ngoài Git, tách tài khoản database (migration/quản trị và ứng dụng quyền tối thiểu), hostname/cổng, kế hoạch nâng cấp image/module có đường lui. Khi đổi volume hoặc cấu hình ảnh hưởng backup, báo người 4 cập nhật runbook BE-07.
- [ ] **BE-13 — Backend cổng bệnh nhân:** Tài khoản bệnh nhân và liên kết tài khoản–hồ sơ do tiếp đón xác nhận sau khi đối chiếu giấy tờ; cơ chế đăng nhập của bệnh nhân; chính sách công bố (phần nào của lần khám, đơn thuốc, lịch hẹn được cung cấp, ai công bố, lúc nào); API chỉ đọc hồ sơ đã công bố và lịch hẹn của chính bệnh nhân. Bệnh nhân không chọn được hồ sơ khác bằng UUID; bản nháp và phần nội bộ không được trả về. Phối hợp người 4 viết test bệnh nhân A truy cập hồ sơ B.
- [ ] **BE-14 — API, audit và triển khai cho agent:** Bổ sung nguồn agent cần theo contract AI-02 (đơn vị, thời điểm, trạng thái/revision); đánh dấu lượt đọc do agent trong audit; chốt và thực thi điều kiện `assigned_patient` nếu ma trận quyền yêu cầu; thêm service agent vào `compose.yaml` (tắt mặc định, bật bằng profile) và biến môi trường mẫu. Không cấp tài khoản dùng chung cho agent.

*Đã chuyển sang người 4:* BE-03, BE-07 (backup–restore), BE-09, appointments và service queues của BE-08 (thành BE-12). Người 1 review khi các việc đó cần thay đổi trong vùng file của mình.

**Bàn giao:** Cấu hình môi trường, bảng phiên bản, hướng dẫn chạy, ma trận khả năng backend, phần mở rộng cần thiết.

**Việc tiếp theo:** Chốt phạm vi cấp thuốc tối thiểu của BE-08; nếu thuộc pilot thì triển khai/kiểm thử dispensing và quyền kho. Song song hoàn thiện BE-11 cho môi trường ngoài local. BE-01, BE-02, BE-04–BE-06 đã đạt ở mức backend synthetic/local; các phê duyệt metadata production vẫn theo checklist trước pilot.

### 7.2. Người 2 — Frontend và quy trình sử dụng

**Mục tiêu:** Các role thực hiện được quy trình phòng khám trên giao diện O3 bằng tiếng Việt.

- [ ] **FE-01 — Khảo sát luồng và app có sẵn:** Đi qua đăng nhập, đăng ký, tìm kiếm, patient chart, biểu mẫu, appointments, queue, billing, dispensing trên baseline. Ghi phần có sẵn, phần cấu hình được và phần cần phát triển.
- [ ] **FE-02 — Cấu hình bản phân phối frontend:** Chốt package/app shell tương thích với người 1. Quản lý cấu hình, module được dùng và cách build/chạy phần tùy biến.
- [ ] **FE-03 — Việt hóa:** Xác nhận cơ chế translation; dịch nhãn, danh mục, lỗi, thông báo trên luồng được chọn. Đóng góp bản dịch về upstream khi có thể; ghi danh sách phần còn thiếu.
- [ ] **FE-04 — Biểu mẫu ngoại trú:** Dùng dữ liệu và concept UUID của người 3. Có trường bắt buộc, đơn vị, lựa chọn, trạng thái thông tin thiếu và validation đã thống nhất.
- [ ] **FE-06 — Tình huống lỗi:** Loading, không có kết quả, mất kết nối, lưu thất bại, dữ liệu không hợp lệ, thao tác bị từ chối. Quyền trên giao diện khớp quyền backend.
- [ ] **FE-08 — Mẫu in:** Đơn thuốc, phiếu thu, phiếu chỉ định, phiếu kết quả, giấy hẹn. Thông tin cơ sở và người hành nghề lấy từ cấu hình, không viết cứng.
- [ ] **FE-09 — Cấu hình luồng vận hành:** Hàng đợi theo phòng/bác sĩ, trả trước/trả sau, có/không có điều dưỡng hoặc quầy thuốc theo [CLINIC_WORKFLOW.md](docs/CLINIC_WORKFLOW.md#các-biến-thể-cần-hỗ-trợ-bằng-cấu-hình).
- [ ] **FE-10 — Khung "Trợ lý hồ sơ" cho bác sĩ:** Theo [AGENT_PLAN.md mục 8](docs/AGENT_PLAN.md#8-fe-sẽ-hiển-thị-như-thế-nào): nút tóm tắt lần khám, ô hỏi đáp, kết quả chia mục có nguồn mở lại được qua API VinSHC, trạng thái thông tin thiếu/lỗi quyền/mất kết nối/model chưa sẵn sàng, nhãn "AI hỗ trợ — cần bác sĩ kiểm tra". Bỏ phản hồi đến muộn khi bác sĩ đã đổi hồ sơ. Thêm proxy `/agent` trong cấu hình dev.
- [ ] **FE-11 — Cổng bệnh nhân và "Trợ lý của tôi":** Đăng nhập, danh sách lần khám đã công bố, lời dặn, đơn thuốc, lịch hẹn và khung chat. Ngôn ngữ dễ hiểu, dùng tốt trên điện thoại, không có ô nhập UUID. Ghi rõ đây là trợ lý tự động, không thay nhân viên y tế; luôn hiện thông tin liên hệ phòng khám và số cấp cứu 115.

*Đã chuyển sang người 4:* FE-05 (adapter OpenMRS), FE-07. Người 2 vẫn chuyển các màn hình từ `DemoRepository` sang adapter của người 4 và xử lý trạng thái lỗi trên giao diện (FE-06); lỗi giao diện người 4 phát hiện được mở issue cho người 2.

**Bàn giao:** Cấu hình frontend, biểu mẫu, bản dịch, mẫu in, phần giao diện mở rộng, hướng dẫn quy trình.

**Bắt đầu ngay:** FE-01 trên baseline; FE-04 và FE-08 chỉ chốt sau khi có DATA-01, DATA-02 và mẫu giấy tờ từ khảo sát M0.

### 7.3. Người 3 — Metadata, dữ liệu lâm sàng và trợ lý AI

**Mục tiêu:** Mọi thành viên hiểu và ghi dữ liệu theo cùng quy ước; gói Việt Nam nạp lại được từ repo; trợ lý AI trả lời đúng nguồn và đúng quyền.

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

**Trợ lý AI (MVP-3)** — thiết kế chi tiết trong [AGENT_PLAN.md](docs/AGENT_PLAN.md):

- [ ] **AI-01 — Phạm vi trợ lý:** Chốt danh sách câu hỏi được hỗ trợ cho A và P, câu ngoài phạm vi, dấu hiệu khẩn cấp và câu trả lời cố định tương ứng. Mentor duyệt phần lâm sàng.
- [ ] **AI-02 — Contract dữ liệu và nguồn:** Bảng "dữ liệu cần → API đang có → trường/nguồn còn thiếu" cho A và P; gửi người 1 làm BE-13, BE-14.
- [ ] **AI-03 — Bộ đánh giá synthetic:** 10–20 ca ban đầu cho cả A và P theo [AGENT_PLAN.md mục 10](docs/AGENT_PLAN.md#10-đánh-giá-agent-bằng-cách-nào), có expected output, dùng dữ liệu của DATA-05. Viết trước khi tối ưu prompt hoặc chọn model.
- [ ] **AI-04 — Agent luồng A (bác sĩ):** Hoàn thiện service `infra/agent/` (đã có khung): xác thực workspace → đọc hồ sơ → tạo câu trả lời gắn mã dữ kiện → validator nguồn. Chạy với backend thật.
- [ ] **AI-05 — Agent luồng P (bệnh nhân):** Policy riêng, chỉ đọc API của BE-13; diễn đạt dễ hiểu; từ chối câu ngoài phạm vi; trả câu cố định (không qua model) khi bệnh nhân mô tả dấu hiệu khẩn cấp.
- [ ] **AI-06 — Chọn model:** Benchmark chất lượng, độ trễ và chi phí trên bộ AI-03; giữ `FakeModel` cho test và CI; ghi điều kiện dùng model bên ngoài và phương án model chạy tại chỗ nếu phòng khám không cho dữ liệu ra ngoài.
- [ ] **AI-07 — Báo cáo đánh giá:** Kết quả theo nhóm ca, mẫu số, commit, model, độ trễ p50/p95, chi phí mỗi lượt, lỗi còn lại và giới hạn; bác sĩ hoặc mentor review cách diễn đạt.

**Bàn giao:** Từ điển dữ liệu, gói metadata Việt Nam, bảng mapping, dữ liệu giả, hướng dẫn nạp/cập nhật; service agent, bộ đánh giá và báo cáo AI.

**Bắt đầu ngay:** DATA-01, khung DATA-02, DATA-05 và DATA-08; khảo sát mô hình OpenMRS cùng người 1 để tránh thiết kế trường không lưu được. Với trợ lý AI: AI-01, AI-02 và AI-03 trước khi tối ưu model.

### 7.4. Người 4 — API, tích hợp, kiểm thử và CI

**Mục tiêu:** Chứng minh các phần ghép lại đúng bằng kịch bản chạy trên hệ thống thật.

- [ ] **INT-01 — Kịch bản nghiệm thu:** Backend synthetic đã bao phủ quy trình mục 2.3, sai quyền, thông tin thiếu, bệnh nhân trùng tên, API lỗi, thu tiền sai và hủy lượt. Còn E2E trình duyệt với FE và người dùng nghiệp vụ trước khi đóng.
- [x] **INT-02 — Hợp đồng API:** Endpoint, xác thực, request/response, lỗi, tìm kiếm, phân trang và hậu điều kiện đã được xác nhận bằng request thật và ghi trong `docs/api/`.
- [ ] **INT-03 — Mock đúng hợp đồng:** Fixture/mock từ API đã thống nhất để frontend làm độc lập; chạy lại kịch bản trên backend thật; cập nhật khi hợp đồng đổi.
- [x] **INT-04 — Kiểm chứng FHIR:** Đã kiểm tra `CapabilityStatement` và fixture cho Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, ServiceRequest, Location và Practitioner; capability và giới hạn được ghi rõ.
- [x] **INT-05 — Mapping dữ liệu:** Đã đối chiếu OpenMRS–FHIR theo UUID nguồn, bệnh nhân, lượt khám, mã, đơn vị, thời gian, trạng thái và provenance. LOINC/BP panel được giữ là gate metadata production, không bị tuyên bố đạt.
- [ ] **INT-06 — Kiểm thử tích hợp:** API integration, quyền backend, restart và restore đã được tự động hóa. Còn Playwright/E2E trình duyệt với FE.
- [ ] **INT-07 — CI:** Workflow đã dựng toàn bộ stack PostgreSQL và chuỗi B1–B9, nhưng commit hiện tại chưa có GitHub-hosted run; cần mở PR, push `main` hoặc chạy `workflow_dispatch`, sau đó mới bật branch rule.
- [x] **INT-08 — Báo cáo demo:** Kịch bản đạt/chưa đạt, phiên bản, bằng chứng, cách chạy lại và giới hạn đã được tổng hợp trong `docs/BACKEND_HANDOFF.md` và `docs/PILOT_READINESS.md`.
- [ ] **INT-09 — Kiểm chứng tuân thủ:** Biến các mục thiết kế trong [VIETNAM_COMPLIANCE.md](docs/VIETNAM_COMPLIANCE.md#2-yêu-cầu-thiết-kế-rút-ra) thành kiểm tra được (trường bắt buộc trên đơn in, nhật ký, quyền).
- [x] **INT-10 — Hợp đồng adapter:** `integrations/` có manifest disabled-by-default và JSON Schema envelope cho BHYT, HĐĐT, đơn thuốc quốc gia, LIS và PACS; adapter thật thuộc M6.
- [ ] **INT-11 — Kiểm thử và CI cho trợ lý AI:** Job CI chạy test của `infra/agent/` với `FakeModel` (không gọi mạng, không cần API key). Test trên backend thật cho: sai quyền, sai cơ sở, đổi context, bệnh nhân A truy cập B, bản nháp chưa công bố, prompt injection trong nội dung hồ sơ, agent hoặc model lỗi. E2E bác sĩ và bệnh nhân khi FE-10, FE-11 xong.

**Nhận từ người 1:**

- [x] **BE-03 — Xác nhận API nền tảng:** Đăng nhập, patient, visit, encounter, observation, chẩn đoán, dị ứng và đơn thuốc đã được kiểm tra trên instance PostgreSQL thật; hợp đồng và giới hạn nằm trong `docs/api/`.
- [x] **BE-07 — Backup–restore và runbook:** `pg_dump`/`pg_restore` cùng OpenMRS data volume đã được backup và restore sang Compose project/volume tách biệt; dữ liệu và attachment được verifier đọc lại, quy trình đã vào CI và `docs/RECOVERY_RUNBOOK.md`. HTTPS/triển khai ngoài local vẫn thuộc BE-11.
- [x] **BE-09 — Khung adapter:** `integrations/` đã có cấu trúc, manifest bật/tắt, schema envelope và validation; chưa chứa credential hay adapter kết nối thật.
- [x] **BE-12 — Module lịch hẹn và hàng đợi:** B8 đã kiểm thử đặt lịch/idempotency/slot trùng, lifecycle lịch hẹn, cấp số, chuyển `RECEPTION → NURSE → DOCTOR → LAB → CASHIER → PHARMACY` và bệnh nhân bỏ về có lý do. Contract và giới hạn nằm trong `docs/api/clinic-operations.md` và `docs/api/capabilities.md`.

**Nhận từ người 2:**

- [ ] **FE-05 — Adapter OpenMRS cho FE:** Viết lớp dữ liệu thay `DemoRepository` cho từng dịch vụ trong [FRONTEND.md mục 3](docs/FRONTEND.md#3-bản-đồ-trang--dịch-vụ--modulebackend), theo DTO ở mục 4 và hợp đồng INT-02. Chỉ dùng method/path/schema đã kiểm chứng; không fallback sang demo khi API lỗi. Code nằm trong `infra/frontend/api.js`, `backend-mapping.js` và file adapter mới, có test chạy trên backend thật. Giữ export mà màn hình đang dùng; đổi giao diện adapter thì báo người 2 trước. Đạt khi ghi rồi đọc lại đúng bệnh nhân, visit và encounter.
- [ ] **FE-07 — Kiểm chứng cùng người dùng:** Cùng mentor hoặc nhân sự phòng khám đi qua kịch bản INT-01 trên FE; ghi vấn đề sử dụng, cập nhật hướng dẫn demo và chuyển vấn đề giao diện cho người 2.

**Bàn giao:** Tài liệu API/FHIR, mock/fixture, adapter OpenMRS cho FE, kịch bản và mã kiểm thử, CI (gồm test FE), runbook backup–restore, khung adapter tích hợp, báo cáo tích hợp và kiểm chứng người dùng.

**Việc tiếp theo:** Chạy workflow hiện tại bằng PR/`workflow_dispatch` và xác nhận hosted CI; hoàn thiện INT-03/FE-05, Playwright/E2E cho INT-01/INT-06, kiểm chứng tuân thủ INT-09 và UAT FE-07. BE-03, BE-07, BE-09, BE-12 cùng INT-02, INT-04, INT-05, INT-08 và INT-10 đã có bằng chứng backend synthetic.

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
| Adapter OpenMRS cho FE và các export của nó | Người 4 | Người 2 | Theo đợt F1–F3 trong [FRONTEND.md](docs/FRONTEND.md#8-thứ-tự-nối-backend-và-tiêu-chí-nghiệm-thu) |
| Backup–restore và runbook vận hành | Người 4 | Người 1 | M4 |
| Cấu hình triển khai ngoài local (HTTPS, secrets, tài khoản DB) | Người 1 | Người 4 | Trước M5 |
| Kịch bản demo xuyên suốt | Người 4 | Cả nhóm | Bản nháp M0; chạy thật từ M1 |
| Contract dữ liệu và nguồn cho trợ lý AI | Người 3 | Người 1 + 2 + 4 | Trước AI-04, AI-05 |
| Chính sách công bố hồ sơ cho bệnh nhân | Người 3 + mentor | Người 1 + 2 | Trước BE-13 |
| Liên kết tài khoản bệnh nhân và đăng nhập cổng | Người 1 | Người 2 + 4 | M4A |
| Quyết định kiến trúc (ADR) | Người đề xuất | Cả nhóm + mentor | Trước khi làm phần phụ thuộc |

Quy tắc làm việc (chi tiết trong [CONTRIBUTING.md](CONTRIBUTING.md)):

1. Mỗi đầu việc có issue, một người chịu trách nhiệm, đầu ra và tiêu chí hoàn thành.
2. Làm trên nhánh riêng và gửi PR vào `main`; người liên quan review.
3. Khi đổi API, UUID, form, mẫu in hoặc phiên bản, cập nhật tài liệu/fixture và báo người dùng phần đó.
4. PR ghi rõ thay đổi, cách kiểm chứng và giới hạn. Check CI bắt buộc phải đạt trước khi merge.
5. Quyết định ảnh hưởng nhiều phần được ghi thành ADR trong `docs/decisions/`.
6. Một chức năng hoàn thành khi đã tích hợp và được người khác kiểm chứng, không chỉ chạy trên máy tác giả.
7. Không đưa dữ liệu bệnh nhân thật vào repo, issue, PR hoặc ảnh chụp.

### 8.1. Vùng file phụ trách

Mỗi vùng file có một người chủ. Người khác cần sửa file trong vùng đó thì mở issue hoặc gửi PR nhỏ và yêu cầu chủ vùng review, không sửa song song trên nhánh riêng. Cách này tránh conflict khi merge và tránh hai người đổi cùng cấu hình theo hai hướng.

| Người chủ | Vùng file |
| --- | --- |
| Người 1 | `compose.yaml`, `.env.example`, `config/baseline.json`, `infra/backend/Dockerfile`, `infra/backend/postgresql/`, `infra/postgres/`, `modules/`, `scripts/bootstrap.py`, `scripts/check_config.py`, `scripts/check_database.py`, `scripts/common.py`, `docs/DEVELOPMENT.md` |
| Người 2 | `infra/frontend/` trừ các file adapter của người 4; `package.json` ở gốc; `docs/FRONTEND.md`, `docs/FRONTEND_SCOPE.md`, `docs/ROLE_WORKFLOWS.md` |
| Người 3 | `infra/backend/configuration/` (gói metadata) trừ thư mục cấu hình appointments/queue của người 4, `docs/DATA_DICTIONARY.md`, dữ liệu giả của DATA-05 |
| Người 4 | `infra/frontend/api.js`, `infra/frontend/packages/core/src/backend-mapping.js` và file adapter OpenMRS mới; thư mục cấu hình appointments/queue trong `infra/backend/configuration/`; `tests/` (API, integration, E2E, fixture); `scripts/smoke.py`, script backup/restore; `.github/workflows/`; `docs/api/`, `docs/CI.md`, `docs/VALIDATION.md`, runbook vận hành; `integrations/` |

Test FE hiện có (`verify.mjs`, `browser-check.cjs`, `design-check.cjs`) thuộc người 2; người 4 chỉ gọi chúng trong CI. Tài liệu chung (`PROJECT_PLAN.md`, `docs/BACKEND.md`, `README.md`) sửa bằng PR nhỏ, chỉ đụng mục liên quan. Khi một việc cần thay đổi ở hai vùng, tách thành hai PR theo chủ vùng và ghi liên kết giữa chúng.

### Cấu trúc repo dự kiến

```text
EHR-VinSHC/
├── README.md, PROJECT_PLAN.md, CONTRIBUTING.md, SECURITY.md, LICENSE
├── docs/                        # Quy trình, kiến trúc, dữ liệu, tuân thủ, API, vận hành
│   └── decisions/               # ADR
├── config/                      # Baseline đã khóa
├── infra/backend/configuration/ # Gói Việt Nam + cấu hình cơ sở mẫu (Initializer)
├── infra/frontend/              # Cấu hình, bản dịch, mẫu in, phần frontend tùy biến
├── infra/agent/                 # Trợ lý AI chỉ đọc (FastAPI + LangGraph), test với FakeModel
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
- [x] Bộ phiên bản, cấu hình và dữ liệu giả dùng cho demo được xác định rõ.
- [x] Tiếp đón đăng ký/tìm đúng bệnh nhân bằng mã nội bộ, CCCD hoặc tên; hồ sơ cùng tên không bị tự gộp.
- [ ] Địa chỉ dùng danh mục hành chính hiện hành.
- [x] Điều dưỡng ghi sinh hiệu; bác sĩ ghi và đọc lại hồ sơ theo đúng quyền trên backend synthetic.
- [x] Biểu mẫu ghi dữ liệu vào đúng bệnh nhân, visit/encounter và concept.
- [x] Chẩn đoán ICD-10, đơn thuốc và dị ứng giữ đúng ý nghĩa/trạng thái đã thống nhất trong catalogue synthetic.
- [x] Có kiểm tra trường bắt buộc, dữ liệu không hợp lệ và thông tin thiếu.
- [x] API từ chối thao tác vượt quyền cho cả 8 role; có báo cáo phần nhật ký đã có và còn thiếu.
- [x] REST và tập dữ liệu FHIR đã chọn được kiểm tra trên backend thật, có bảng mapping và giới hạn.

### MVP-2 (M4)

- [x] Quy trình mục 2.3 chạy trọn trên backend với dữ liệu giả, gồm hàng đợi, thu tiền, CLS và tái khám; E2E giao diện còn thuộc INT-01/FE-07.
- [x] Hai biến thể cấu hình (trả trước/trả sau; có/không có quầy thuốc) chạy được trên backend.
- [ ] Đơn thuốc in ra đủ thông tin bắt buộc đã đối chiếu.
- [x] Phiếu thu và báo cáo doanh thu ngày khớp dữ liệu; hoàn/hủy truy vết được.
- [x] Dữ liệu còn sau khởi động lại; backup–restore đã thử thành công trên project/volume cô lập.

### MVP-3 (M4A)

- [ ] Bác sĩ tóm tắt và hỏi đáp một lần khám trên giao diện; mỗi câu có nguồn mở lại được; thông tin thiếu được nêu đúng loại.
- [ ] Bệnh nhân đăng nhập cổng và chỉ thấy phần hồ sơ đã công bố của chính mình; trợ lý giải thích lời dặn, đơn thuốc và lịch hẹn có dẫn nguồn.
- [ ] Toàn bộ ca sai quyền, đổi context, bệnh nhân A→B, bản nháp và prompt injection trong bộ đánh giá đều đạt.
- [ ] Không có câu trả lời nào trình bày thông tin không có nguồn như dữ kiện; trợ lý không chẩn đoán, kê đơn hay ghi hồ sơ.
- [ ] Mô tả dấu hiệu khẩn cấp nhận câu trả lời cố định; câu ngoài phạm vi được từ chối kèm hướng dẫn liên hệ nhân viên y tế.
- [ ] Tắt agent hoặc ngắt model không làm gián đoạn luồng khám.
- [ ] Báo cáo đánh giá AI-07 đã được bác sĩ hoặc mentor review.

### Trước pilot (M5)

- [ ] Hoàn thành checklist [trước pilot](docs/VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật).
- [ ] Có quyết định bật hay tắt trợ lý AI với dữ liệu thật, dựa trên [gate AI](docs/VIETNAM_COMPLIANCE.md#4-trợ-lý-ai).
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

### 10.5. AI mở rộng sau MVP (M8)

MVP-3 chỉ đọc một lần khám (bác sĩ) và phần đã công bố (bệnh nhân). Các bước mở rộng theo [AGENT_PLAN.md](docs/AGENT_PLAN.md#3-các-phạm-vi-triển-khai):

- **Giai đoạn B — lịch sử bệnh nhân:** đọc nhiều lần khám, lập timeline, thêm sinh hiệu và kết quả CLS. Cần API danh sách lượt khám/encounter có lọc, phân trang và kiểm quyền.
- **Giai đoạn C — tài liệu tham khảo (RAG):** tra cứu hướng dẫn đã được nhóm duyệt, có phiên bản và nguồn; tách rõ nguồn tài liệu với dữ liệu bệnh án. Dùng pgvector trong database riêng, không chung database OpenMRS.
- **Bệnh nhân mở rộng:** nhắc lịch, gửi yêu cầu đặt/đổi lịch, gửi thông tin tự báo cáo. Mọi thao tác gửi cần bệnh nhân xác nhận; thông tin tự báo cáo là bản ghi riêng, không tự thành chẩn đoán hay phiếu khám.
- **Bản nháp cho bác sĩ duyệt** (ví dụ lời dặn dễ hiểu cho bệnh nhân): chỉ làm sau khi bản đọc đã được nghiệm thu, có quy trình duyệt và đánh giá riêng.
- **Vai trò khác** (ví dụ điều dưỡng) chỉ mở sau khi chốt dữ liệu và quyền cho từng nhiệm vụ.
- **AI trên dữ liệu liên thông (M7)** phải theo chính sách chia sẻ và đồng ý của người bệnh.

Đề xuất điều trị hoặc hỗ trợ ra quyết định lâm sàng không nằm trong lộ trình hiện tại. Nếu muốn làm, cần phạm vi, đánh giá lâm sàng và đánh giá pháp lý riêng.

## 11. Các quyết định cần chốt với mentor/nhóm trưởng

| Quyết định | Giả định hiện tại để lập kế hoạch | Thời điểm cần chốt |
| --- | --- | --- |
| Phòng khám mục tiêu và quy trình | Phòng khám tư một địa điểm, ngoại trú, có CLS cơ bản; xác nhận qua khảo sát | M0 |
| Role và ma trận quyền | 8 role ghép từ privilege | M0 |
| Bộ dữ liệu và biểu mẫu | Tập tối thiểu theo [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md); mentor xác nhận | Trước DATA-01 và FE-04 |
| Vai trò openEHR | Theo đề xuất ADR-0001 | M0, trước M3 |
| Database | PostgreSQL 16.15 ([ADR-0002](docs/decisions/0002-postgresql.md)) | Đã quyết định và dựng baseline; xác nhận run CI trước M3 |
| Giấy phép open source | Tương thích MPL 2.0 | M0 |
| Tên dự án khi công bố | Chưa xác nhận | Trước M5 |
| Module mở rộng ưu tiên | Theo phòng khám pilot | Trước M6 |
| Phạm vi triển khai | Demo dữ liệu giả trước; pilot là mốc riêng | Trước M5 |
| Deadline và thời gian thành viên | Chưa ấn định lịch tuần | Khi phân công issue |
| Cách chia sẻ dữ liệu ở M7 | Dữ liệu gốc tại cơ sở; bắt đầu với tập nhỏ và chính sách rõ | Trước M7 |
| Chính sách công bố hồ sơ cho bệnh nhân | Đề xuất công bố lời dặn, đơn thuốc đã chốt và lịch hẹn; chẩn đoán và kết quả CLS chỉ công bố khi bác sĩ chọn | Trước BE-13 |
| Cách bệnh nhân đăng nhập cổng | Tài khoản do tiếp đón kích hoạt sau khi đối chiếu giấy tờ; OTP SMS, Zalo hoặc VNeID để sau | Trước BE-13 |
| Model AI và nơi xử lý dữ liệu | `FakeModel` cho test; model bên ngoài chỉ với dữ liệu giả; chốt model sau AI-06 | Trước M5 |
| Bật trợ lý AI khi pilot | Mặc định tắt với dữ liệu thật cho tới khi qua gate AI | Trước M5 |

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
- WHO, [Ethics and governance of artificial intelligence for health](https://www.who.int/publications/i/item/9789240029200) (2021) và [hướng dẫn cho mô hình lớn đa phương thức](https://www.who.int/publications/i/item/9789240084759) (2025): nguyên tắc dùng AI trong y tế, trách nhiệm con người, minh bạch và an toàn.
