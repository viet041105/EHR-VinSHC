# Kế hoạch triển khai EHR-VinSHC

**Ngày cập nhật:** 08/10/2026

**Nhóm:** 4 thành viên

**Mục đích:** Giúp thành viên mới hiểu sản phẩm cần làm, nhận đúng đầu việc và biết khi nào công việc được coi là hoàn thành.

> Bản đầu tiên là một hệ thống hồ sơ khám ngoại trú cho một phòng khám, dựa trên OpenMRS 3. Sau khi luồng này hoạt động ổn định, nhóm mở rộng sang chia sẻ dữ liệu giữa hai cơ sở, rồi thử nghiệm AI tra cứu và tóm tắt hồ sơ có dẫn nguồn.
>
> Repo đã có cấu hình Docker và workflow CI cho baseline. Xem [hướng dẫn môi trường](docs/DEVELOPMENT.md) và [phạm vi CI](docs/CI.md). Các đầu việc MVP vẫn được theo dõi theo tiêu chí bên dưới; theo dõi kết quả workflow trong [GitHub Actions](https://github.com/viet041105/EHR-VinSHC/actions).

## 1. Đọc nhanh trước khi bắt đầu

1. Dùng **OpenMRS 3 Reference Application** làm nền tảng, rồi tạo bản phân phối riêng cho EHR-VinSHC.
2. Ưu tiên cấu hình, metadata, biểu mẫu và module mở rộng. Chỉ fork repo upstream khi có nhu cầu sửa mã nguồn cụ thể.
3. Hoàn thành **một luồng khám ngoại trú xuyên suốt** trước khi mở rộng chức năng.
4. Chuẩn hóa dữ liệu từ đầu: kiểu dữ liệu, đơn vị, mã định danh, thuật ngữ và nguồn tạo dữ liệu.
5. Giữ cách chia 4 người: backend; frontend; metadata và dữ liệu; API, tích hợp và kiểm thử.
6. Chốt bộ khung chạy/build/test rồi xây CI tối thiểu. CI tiếp tục mở rộng cùng chức năng của nhóm.
7. Xác nhận với mentor liệu **lưu trữ theo openEHR có phải yêu cầu bắt buộc**. OpenMRS + FHIR không tự động đáp ứng yêu cầu đó.

**Cách đọc theo vai trò:** Đọc mục 2–6 để hiểu phần chung, tìm phần của mình trong mục 7, sau đó đọc mục 8–10 để biết cách phối hợp và nghiệm thu.

## 2. Mục tiêu và phạm vi sản phẩm đầu tiên

### 2.1. Mục tiêu

Tạo một bản phân phối OpenMRS phù hợp với luồng khám ngoại trú đã chọn, có thể dựng lại từ repo và dùng cùng bộ metadata, biểu mẫu, quy ước dữ liệu.

Các sản phẩm nhóm cần bàn giao gồm:

- Cấu hình và hướng dẫn dựng hệ thống.
- Danh sách phiên bản OpenMRS, module backend, package frontend và database đã kiểm chứng cùng nhau.
- Bộ metadata và biểu mẫu phục vụ MVP.
- Từ điển dữ liệu và tài liệu API/FHIR trong phạm vi hỗ trợ.
- Dữ liệu giả, kịch bản demo và kiểm tra tự động cho các luồng quan trọng.
- Tài liệu sử dụng, vận hành và giới hạn của bản thử nghiệm.

### 2.2. Luồng khám cần hoàn thành

```text
Đăng nhập theo vai trò
    → Đăng ký hoặc tìm bệnh nhân
    → Mở lượt đến khám
    → Điều dưỡng ghi sinh hiệu
    → Bác sĩ ghi triệu chứng, dị ứng, chẩn đoán và đơn thuốc
    → Kết thúc lượt khám
    → Xem lại lịch sử và dữ liệu đã ghi
```

### 2.3. Phạm vi MVP

| Nhóm chức năng | Cần có trong MVP | Bằng chứng hoàn thành |
| --- | --- | --- |
| Tài khoản và quyền | Lễ tân, điều dưỡng, bác sĩ, quản trị; tài khoản riêng | Thao tác đúng quyền; API từ chối thao tác vượt quyền |
| Bệnh nhân | Đăng ký, tìm kiếm, mã bệnh nhân nội bộ, kiểm tra trường hợp nghi trùng | Tìm lại đúng người; hai người cùng tên không bị tự gộp |
| Lượt khám | Mở/kết thúc lượt đến khám; các lần ghi nhận nằm đúng lượt | Lịch sử hiển thị đúng lần khám và thời điểm |
| Sinh hiệu | Một tập sinh hiệu được thống nhất với mentor | Giá trị số và đơn vị lưu đúng; dữ liệu không hợp lệ được xử lý |
| Khám ngoại trú | Biểu mẫu ghi triệu chứng, dị ứng, chẩn đoán và đơn thuốc | Ghi, lưu và mở lại không mất dữ liệu |
| Việt hóa | Các màn hình và danh mục dùng trong kịch bản MVP | Người dùng hiểu nhãn, thông báo và biểu mẫu |
| API | REST phục vụ ứng dụng; đọc dữ liệu FHIR đã kiểm chứng | Có ví dụ request/response và kiểm tra trên backend thật |
| Bàn giao | Hướng dẫn chạy, dữ liệu giả, kịch bản demo | Thành viên khác dựng và thực hiện lại được |

Lịch hẹn, hàng đợi, tệp đính kèm và xét nghiệm nhập tay được đưa vào đợt mở rộng nếu cần cho luồng đã chọn. Nội trú, viện phí, kho thuốc, kết nối LIS/PACS và máy xét nghiệm cần phạm vi riêng.

**MVP được nghiệm thu bằng dữ liệu giả.** Việc sử dụng tại cơ sở y tế thực tế cần một mốc đánh giá riêng về nghiệp vụ, vận hành, bảo mật và yêu cầu pháp lý áp dụng.

## 3. Kiến trúc và nguyên tắc kỹ thuật

### 3.1. Kiến trúc ban đầu

```text
Lễ tân / Điều dưỡng / Bác sĩ
              │
              ▼
       Giao diện OpenMRS 3
              │ REST / FHIR API theo app đang dùng
              ▼
  OpenMRS Core + các module đã chọn
       │                    │
       ▼                    ▼
    MariaDB             FHIR2 API
  Hồ sơ tại cơ sở     Phục vụ app O3 và thử nghiệm liên thông sau

Metadata và biểu mẫu được quản lý trong Git
              │
              └── Nạp vào hệ thống theo cấu hình đã kiểm chứng
```

### 3.2. Các quyết định nền tảng

- **Bản phân phối:** Bắt đầu từ OpenMRS 3 Reference Application; lưu nguồn upstream và release/tag/commit làm nền.
- **Phiên bản:** Khóa bộ phiên bản tương thích, bao gồm image, module, package và công cụ build. Bản dựng được nghiệm thu không phụ thuộc vào tag thay đổi như `latest`, `next` hoặc `qa`.
- **Backend:** Tái sử dụng API và mô hình của OpenMRS. Thêm module hoặc adapter khi xác định được khoảng trống cụ thể.
- **Frontend:** Tái sử dụng các app O3; ưu tiên cấu hình, dịch thuật và biểu mẫu trước khi sửa core.
- **Database:** Để OpenMRS quản lý schema của nền tảng. Chức năng mới thao tác qua API/service phù hợp; migration cho phần mở rộng phải được quản lý riêng.
- **Metadata:** Lưu cấu hình trong Git, dùng UUID ổn định cho các đối tượng được biểu mẫu/API tham chiếu, kiểm tra việc nạp lại và cập nhật.
- **Môi trường:** Có cấu hình chạy local và dữ liệu giả chung. Tài khoản demo chỉ dùng cho môi trường thử nghiệm; thông tin bí mật thực tế nằm ngoài Git.
- **Giấy phép:** Giữ thông tin nguồn và giấy phép của thành phần tái sử dụng; chốt giấy phép cho phần nhóm tự phát triển trước khi phát hành.

### 3.3. Cách sử dụng danh sách repo đã nghiên cứu

Danh sách repo backend/frontend của nhóm là **bản đồ thành phần để khảo sát**, không phải yêu cầu fork và build tất cả ngay từ đầu.

Người 1 và người 2 lập bảng lựa chọn thành phần, gồm: chức năng cần dùng, module/package tương ứng, phiên bản, phụ thuộc, lý do chọn và cách kiểm chứng. Có thể giữ thành phần mặc định trong giai đoạn khảo sát; việc thêm/bớt phải xét phụ thuộc của release đang dùng.

Các nhóm cần khảo sát trước là REST, FHIR2, Initializer, định danh bệnh nhân, đăng nhập, đăng ký/tìm kiếm, patient chart và form engine. Chọn appointments, queue, address hierarchy, attachments và patient documents theo nhu cầu thực tế và phụ thuộc đã xác nhận.

## 4. Chuẩn hóa dữ liệu ngay từ MVP

Người 3 quản lý từ điển dữ liệu chung. Người 1, 2 và 4 dùng cùng tài liệu để tránh backend, biểu mẫu và API hiểu khác nhau.

| Nội dung cần thống nhất | Ví dụ hoặc yêu cầu |
| --- | --- |
| Kiểu dữ liệu | Huyết áp gồm giá trị số theo mô hình được chọn; hạn chế lưu toàn bộ thông tin thành text |
| Đơn vị | Mỗi chỉ số có đơn vị rõ ràng; quy tắc đổi đơn vị chỉ được áp dụng khi đã thống nhất |
| Thuật ngữ | Concept/mã chẩn đoán, thuốc, xét nghiệm có nguồn và phiên bản danh mục |
| Định danh | Mã bệnh nhân có loại mã và cơ sở cấp; không tự gộp hồ sơ chỉ dựa vào họ tên |
| Thời gian | Phân biệt thời điểm đo/khám và thời điểm nhập; có quy ước timezone khi trao đổi |
| Nguồn dữ liệu | Biết bản ghi thuộc bệnh nhân, lượt khám, người ghi và cơ sở nào |
| Trạng thái | Phân biệt bản ghi đang có hiệu lực, đã sửa hoặc bị hủy theo mô hình của hệ thống |
| Thông tin thiếu | “Chưa hỏi dị ứng” khác “đã hỏi và không ghi nhận dị ứng” |
| Quyền sử dụng | Có ma trận đọc/ghi theo vai trò; quyền phải được thực thi trên backend/API |

FHIR cần có bảng ánh xạ và các quy ước/profile trong phạm vi dự án. Nhóm phải đối chiếu khả năng thực tế của FHIR2 trên instance đã chọn qua `CapabilityStatement`; không mặc định mọi resource và thao tác đều được hỗ trợ.

Phần xuất dữ liệu quản lý/thanh toán theo Quyết định 130 và các văn bản liên quan là một đầu việc mapping riêng khi được đưa vào phạm vi. Bộ trường đầu ra này không thay thế toàn bộ mô hình hồ sơ lâm sàng.

## 5. Các thuật ngữ mọi thành viên cần hiểu giống nhau

| Thuật ngữ | Cách hiểu trong dự án |
| --- | --- |
| EMR | Hồ sơ bệnh án điện tử phục vụ một cơ sở; MVP tập trung vào phần này |
| EHR | Hồ sơ sức khỏe theo thời gian, có thể tổng hợp thông tin từ nhiều cơ sở |
| Distribution / bản phân phối | Bộ OpenMRS, module, frontend, cấu hình và metadata được ghép để triển khai |
| Metadata | Các danh mục và cấu hình như concept, location, loại lượt khám, biểu mẫu, role và loại mã bệnh nhân |
| Concept | Khái niệm y tế được định nghĩa, ví dụ nhiệt độ hoặc một câu hỏi trên biểu mẫu |
| Visit | Đợt/lượt bệnh nhân đến cơ sở, có thể gồm nhiều lần ghi nhận |
| Encounter | Một lần tương tác hoặc ghi nhận trong quy trình, ví dụ ghi sinh hiệu hoặc khám bác sĩ |
| Observation / Obs | Thông tin quan sát được ghi, ví dụ nhiệt độ tại một thời điểm |
| REST API | API OpenMRS phục vụ nhiều thao tác của giao diện và ứng dụng |
| FHIR | Chuẩn trao đổi dữ liệu; cần thống nhất phiên bản, mapping và quy tắc sử dụng |
| openEHR / CDR | Mô hình/kiến trúc dữ liệu và kho lâm sàng theo openEHR; cần phần triển khai riêng nếu là yêu cầu bắt buộc |
| MPI / Record Locator | Cơ chế nhận biết cùng bệnh nhân / xác định cơ sở có hồ sơ; thuộc giai đoạn liên thông |

## 6. Các mốc triển khai và điều kiện chuyển bước

Các mốc dưới đây quy định thứ tự và đầu ra, chưa ấn định số tuần. Nhóm bổ sung lịch và người thực hiện cụ thể theo deadline, quỹ thời gian và kết quả dựng baseline.

| Mốc | Công việc chính | Phụ trách | Điều kiện chuyển bước |
| --- | --- | --- | --- |
| M0 — Chốt nghiệp vụ | Luồng ngoại trú, dữ liệu tối thiểu, ma trận quyền, yêu cầu openEHR, kịch bản demo | Cả nhóm + mentor | Có phạm vi và các quyết định được ghi lại |
| M1 — Dựng baseline | Chọn release; dựng môi trường; kiểm tra đăng nhập, frontend, REST/FHIR; có dữ liệu giả | Người 1 + 2; người 3 + 4 kiểm chứng | Một thành viên khác dựng lại được hệ thống |
| M2 — Repo và CI tối thiểu | Thống nhất cấu trúc, lệnh chạy/build/test, PR; đưa kiểm tra khả dụng vào CI | Người 4 + 1 | Pipeline kiểm tra được phần cấu hình/mã nguồn nhóm quản lý; lỗi làm check thất bại |
| M3 — MVP ngoại trú | Metadata, biểu mẫu, Việt hóa, quyền, luồng khám và kiểm thử tích hợp | Cả 4 người | Chạy xuyên suốt kịch bản MVP trên backend thật |
| M4 — Demo và chuẩn bị pilot | Kiểm tra dữ liệu sai/thiếu, quyền, khởi động lại, backup–restore; tài liệu sử dụng | Cả nhóm | Có bản demo tái lập được và báo cáo giới hạn |
| M5 — Liên thông hai cơ sở | Hai instance độc lập; ánh xạ bệnh nhân; chia sẻ tập dữ liệu nhỏ; quyền và nguồn dữ liệu | Người 4 phối hợp cả nhóm | B truy cập đúng hồ sơ từ A; xử lý từ chối và nguồn không phản hồi |
| M6 — AI có dẫn nguồn | Tra cứu/tóm tắt dữ liệu được phép xem; đánh giá sai sót, dữ liệu thiếu và mâu thuẫn | Phân công sau M5 | Kết quả truy về được bản ghi và tuân thủ quyền truy cập |

**Kiểm thử bắt đầu từ M1 và đi cùng từng chức năng.** Các mốc là điểm kiểm chứng; nhóm không chờ mọi màn hình hoàn tất mới nối frontend với backend.

## 7. Phân công đầu việc cho 4 thành viên

Tên thành viên được điền sau. Mỗi người chịu trách nhiệm kiểm tra phần mình làm; người 4 chịu trách nhiệm kiểm chứng luồng ghép chung. Các mã đầu việc dưới đây có thể dùng để tạo issue.

### 7.1. Người 1 — Backend và nền tảng

**Mục tiêu:** Hệ thống OpenMRS chạy được, tái lập được và cung cấp đúng khả năng cần cho MVP.

- [ ] **BE-01 — Khảo sát và chọn baseline:** Ghi nguồn upstream, release/tag/commit, bộ phiên bản, module cần dùng và các phụ thuộc. Phối hợp người 2 chốt frontend tương thích.
- [ ] **BE-02 — Dựng môi trường:** Chuẩn bị cấu hình local, mẫu biến môi trường, cách khởi động/dừng, kiểm tra readiness và đọc log. Kiểm tra database được giữ sau khi khởi động lại.
- [ ] **BE-03 — Xác nhận API nền tảng:** Cùng người 4 kiểm tra đăng nhập và API bệnh nhân, visit, encounter, observation, chẩn đoán và đơn thuốc trong phạm vi hỗ trợ.
- [ ] **BE-04 — Nạp metadata:** Cùng người 3 tích hợp Initializer/cơ chế cấu hình phù hợp. Kiểm tra nạp mới, nạp lại và cập nhật không tạo đối tượng trùng ngoài dự kiến.
- [ ] **BE-05 — Thực thi quyền và nhật ký:** Cùng người 3 chốt role/privilege; kiểm tra quyền trên API. Khảo sát nhật ký thay đổi và truy cập, ghi rõ phần sẵn có và phần cần bổ sung.
- [ ] **BE-06 — Xử lý khoảng trống:** Khi API hoặc nghiệp vụ thiếu, mô tả vấn đề và chọn cấu hình/module mở rộng/adapter. Mọi sửa đổi core phải có lý do, phạm vi và cách cập nhật upstream.
- [ ] **BE-07 — Chuẩn bị vận hành:** Tài liệu lưu trữ dữ liệu, backup–restore trên môi trường giả, cập nhật cấu hình và xử lý lỗi thường gặp. Phối hợp người 4 đưa lệnh kiểm tra vào CI.

**Bàn giao:** Bộ cấu hình môi trường, bảng phiên bản, hướng dẫn chạy, ma trận khả năng backend và các phần mở rộng cần thiết.

**Bắt đầu ngay:** BE-01; sau đó BE-02 và BE-03 với người 2 và 4.

### 7.2. Người 2 — Frontend và quy trình sử dụng

**Mục tiêu:** Lễ tân, điều dưỡng và bác sĩ thực hiện được luồng ngoại trú trên giao diện O3.

- [ ] **FE-01 — Khảo sát luồng và app có sẵn:** Đi qua đăng nhập, đăng ký, tìm kiếm, patient chart và biểu mẫu trên baseline. Ghi phần có sẵn, phần cấu hình được và phần cần phát triển.
- [ ] **FE-02 — Cấu hình bản phân phối frontend:** Chốt package/app shell tương thích với người 1. Quản lý cấu hình, module được sử dụng và cách build/chạy phần tùy biến.
- [ ] **FE-03 — Việt hóa phạm vi MVP:** Xác nhận cơ chế locale/translation của phiên bản đang dùng; dịch nhãn, danh mục, lỗi và thông báo trên luồng được chọn. Có danh sách phần còn thiếu bản dịch.
- [ ] **FE-04 — Làm biểu mẫu ngoại trú:** Dùng dữ liệu và concept UUID của người 3. Có trường bắt buộc, đơn vị, lựa chọn, trạng thái thông tin thiếu và validation được thống nhất.
- [ ] **FE-05 — Nối luồng thật:** Ghi và mở lại dữ liệu qua API thật; kiểm tra bản ghi vào đúng bệnh nhân và encounter. Hiển thị đúng lịch sử và trạng thái dữ liệu.
- [ ] **FE-06 — Hoàn thiện tình huống lỗi:** Xử lý loading, không có kết quả, mất kết nối, lưu thất bại, dữ liệu không hợp lệ và thao tác bị từ chối. Quyền trên giao diện phải phù hợp với quyền backend.
- [ ] **FE-07 — Kiểm chứng cùng người dùng:** Cùng mentor/người đại diện nghiệp vụ đi qua kịch bản; ghi vấn đề sử dụng và cập nhật hướng dẫn demo.

**Bàn giao:** Cấu hình frontend, biểu mẫu, bản dịch, phần giao diện mở rộng và hướng dẫn luồng khám.

**Bắt đầu ngay:** FE-01 trên baseline; FE-04 chỉ chốt sau khi có DATA-01 và DATA-02.

### 7.3. Người 3 — Metadata và dữ liệu lâm sàng

**Mục tiêu:** Mọi thành viên hiểu và ghi dữ liệu theo cùng quy ước; metadata có thể nạp lại từ repo.

- [ ] **DATA-01 — Từ điển dữ liệu MVP:** Với mỗi trường, ghi ý nghĩa, kiểu dữ liệu, bắt buộc/tùy chọn, đơn vị, danh mục, quy tắc kiểm tra và cách biểu diễn thông tin thiếu. Xin mentor xác nhận phần lâm sàng.
- [ ] **DATA-02 — Bộ metadata:** Chuẩn bị concept, location, visit type, encounter type, identifier type, drug và form metadata trong phạm vi đã chọn. Quản lý UUID ổn định và quan hệ tham chiếu.
- [ ] **DATA-03 — Danh mục và mapping:** Ghi nguồn, phiên bản, mã và tên tiếng Việt; lập mapping khi dùng mã bên ngoài. Danh mục địa chỉ phải phù hợp phạm vi và thời điểm áp dụng.
- [ ] **DATA-04 — Định danh và quyền:** Cùng người 1 và 4 thống nhất loại mã bệnh nhân, cơ sở cấp mã, trường hợp nghi trùng và ma trận quyền theo vai trò.
- [ ] **DATA-05 — Dữ liệu giả:** Có bệnh nhân khám nhiều lần, hai người cùng tên, thông tin thiếu, các trạng thái dị ứng và dữ liệu sai để kiểm tra validation. Ghi cách tạo lại dữ liệu; không dùng hồ sơ bệnh nhân thật.
- [ ] **DATA-06 — Kiểm tra nạp/cập nhật:** Cùng người 1 dựng database mới rồi nạp metadata, chạy lại, thử cập nhật và kiểm tra biểu mẫu vẫn tham chiếu đúng đối tượng.
- [ ] **DATA-07 — Phối hợp biểu mẫu và FHIR:** Cùng người 2 kiểm tra trường form; cùng người 4 kiểm tra dữ liệu nguồn, đơn vị, mã và trạng thái khi xuất FHIR.

**Bàn giao:** Từ điển dữ liệu, bộ metadata, bảng mapping, dữ liệu giả và hướng dẫn nạp/cập nhật.

**Bắt đầu ngay:** DATA-01, khung DATA-02 và DATA-05; khảo sát API/mô hình OpenMRS cùng người 1 để tránh thiết kế trường không lưu được.

### 7.4. Người 4 — API, tích hợp, kiểm thử và CI

**Mục tiêu:** Chứng minh các phần ghép lại đúng bằng kịch bản chạy trên hệ thống thật.

- [ ] **INT-01 — Kịch bản nghiệm thu:** Viết bước thực hiện và kết quả mong đợi cho luồng ở mục 2. Bổ sung tình huống sai quyền, thông tin thiếu, bệnh nhân trùng tên và API lỗi.
- [ ] **INT-02 — Hợp đồng API:** Ghi endpoint hiện có, cách xác thực, trường request/response, lỗi, tìm kiếm và phân trang cần dùng. Cùng người 1 và 2 xác nhận bằng request thật.
- [ ] **INT-03 — Mock đúng hợp đồng:** Tạo fixture/mock từ API đã thống nhất để frontend làm độc lập. Sau đó chạy cùng kịch bản trên backend thật; cập nhật mock khi hợp đồng thay đổi.
- [ ] **INT-04 — Kiểm chứng FHIR:** Đọc `CapabilityStatement`; lập bảng resource và thao tác thực sự hỗ trợ. Ưu tiên khảo sát Patient, Encounter, Observation; kiểm tra Condition, AllergyIntolerance và MedicationRequest theo nhu cầu MVP.
- [ ] **INT-05 — Mapping dữ liệu:** Cùng người 3 đối chiếu dữ liệu OpenMRS với kết quả FHIR: đúng bệnh nhân, lượt khám, mã, đơn vị, thời gian, trạng thái và nguồn. Ghi giới hạn hoặc phần cần adapter.
- [ ] **INT-06 — Kiểm thử tích hợp:** Tự động hóa kiểm tra quan trọng bằng công cụ phù hợp, ví dụ API test và Playwright cho luồng giao diện. Kiểm tra quyền trên API, không chỉ việc ẩn nút trên frontend.
- [ ] **INT-07 — CI tối thiểu:** Sau khi bộ khung và lệnh kiểm tra chạy local, cùng người 1 tạo CI cho PR. Đưa vào các kiểm tra có ý nghĩa, báo lỗi rõ ràng và lưu log/report cần cho sửa lỗi.
- [ ] **INT-08 — Báo cáo demo:** Ghi kịch bản đạt/chưa đạt, cách tái hiện lỗi, phiên bản đã kiểm tra và giới hạn. Chuẩn bị tài liệu cho mốc liên thông hai cơ sở.

**Bàn giao:** Tài liệu API/FHIR, mock/fixture, kịch bản và mã kiểm thử, CI khi tới M2, báo cáo tích hợp.

**Bắt đầu ngay:** INT-01; INT-02 và INT-04 làm cùng BE-03. Không chờ backend/frontend hoàn thiện toàn bộ.

## 8. Cách phối hợp và các điểm bàn giao

| Thứ cần thống nhất | Người chủ trì | Người cùng kiểm tra | Mốc cần có |
| --- | --- | --- | --- |
| Phiên bản và cách dựng hệ thống | Người 1 | Người 2 + 4 | M1 |
| Luồng khám và ma trận quyền | Người 3 + mentor | Cả nhóm | M0; kiểm chứng ở M3 |
| Concept, đơn vị và dữ liệu trường form | Người 3 | Người 2 + 4 | Trước khi chốt form và mapping |
| API và ví dụ request/response | Người 4 | Người 1 + 2 | M1; cập nhật khi thay đổi |
| Lệnh build/test và kiểm tra CI | Người 4 | Người 1 + 2 + 3 theo phần thay đổi | M2 |
| Kịch bản demo xuyên suốt | Người 4 | Cả nhóm | Có bản nháp M0; chạy thật từ M1 |

Quy tắc làm việc:

1. Mỗi đầu việc có issue hoặc mục theo dõi, một người chịu trách nhiệm, đầu ra và tiêu chí hoàn thành.
2. Làm trên nhánh riêng và gửi PR vào `main`; người liên quan đến điểm bàn giao review thay đổi.
3. Khi đổi API, UUID, form hoặc phiên bản, cập nhật tài liệu/fixture liên quan và báo thành viên sử dụng phần đó.
4. PR ghi rõ thay đổi, cách kiểm chứng và giới hạn còn lại. Khi CI đã thiết lập, các check bắt buộc cần đạt trước khi merge.
5. Mỗi đợt bàn giao demo một luồng chạy được trên cùng baseline; ghi lại blocker và người xử lý.
6. Một chức năng được đánh dấu hoàn thành khi đã tích hợp và được người khác kiểm chứng, không chỉ khi chạy trên máy tác giả.

### Cấu trúc repo dự kiến

```text
EHR-VinSHC/
├── README.md                    # Điểm bắt đầu và hướng dẫn chạy khi có baseline
├── PROJECT_PLAN.md              # Phạm vi, phân công và tiêu chí chung
├── docs/                        # Quyết định, dữ liệu, API, demo, vận hành
├── distro/                      # Cấu hình backend/metadata theo cấu trúc distro đã chọn
├── frontend/                    # Cấu hình, bản dịch và phần frontend tùy biến
├── modules/                     # Module riêng nếu có nhu cầu đã xác nhận
├── tests/                       # API test, integration/E2E và fixture giả
├── scripts/                     # Lệnh chạy, build, kiểm tra và tạo dữ liệu giả
└── .github/workflows/           # CI khi thực hiện M2
```

Đây là cấu trúc đề xuất. Người 1 và 2 điều chỉnh theo distribution đã chọn, giữ các quy ước upstream cần thiết. Không cần tạo thư mục rỗng hoặc đưa toàn bộ mã nguồn upstream vào repo.

## 9. Tiêu chí nghiệm thu MVP

- [ ] Một thành viên khác dựng hệ thống từ repo và tài liệu, không cần cấu hình miệng còn thiếu.
- [ ] Bộ phiên bản, cấu hình và dữ liệu giả dùng cho demo được xác định rõ.
- [ ] Lễ tân đăng ký/tìm đúng bệnh nhân; các hồ sơ cùng tên không bị tự gộp.
- [ ] Điều dưỡng ghi sinh hiệu; bác sĩ ghi và đọc lại hồ sơ theo đúng quyền.
- [ ] Biểu mẫu ghi dữ liệu vào đúng bệnh nhân, visit/encounter và concept.
- [ ] Chẩn đoán, đơn thuốc và dị ứng giữ đúng ý nghĩa/trạng thái đã thống nhất.
- [ ] Có kiểm tra trường bắt buộc, dữ liệu không hợp lệ và thông tin thiếu.
- [ ] Lịch sử cho biết lượt khám và thời gian; nguồn/người ghi có thể truy vết theo thiết kế đã chọn.
- [ ] API từ chối thao tác vượt quyền; có báo cáo phần nhật ký đã có và phần còn thiếu.
- [ ] REST và tập dữ liệu FHIR đã chọn được kiểm tra trên backend thật, có bảng mapping và giới hạn.
- [ ] Dữ liệu vẫn tồn tại sau khi khởi động lại; backup–restore được thử trước khi chuyển sang pilot.
- [ ] Có hướng dẫn demo, báo cáo lỗi còn lại và phạm vi chưa hỗ trợ.

Việc đạt MVP không đồng nghĩa đã hoàn thành hệ thống vận hành bệnh viện, chuẩn quốc gia hoặc yêu cầu pháp lý của bệnh án điện tử. Các mục tiêu đó có phạm vi và nghiệm thu riêng.

## 10. Phạm vi các giai đoạn sau

### 10.1. Liên thông hai cơ sở

- Dựng A và B bằng hai instance/database độc lập; mỗi cơ sở giữ hồ sơ gốc.
- Bắt đầu bằng ánh xạ bệnh nhân được xác nhận trên dữ liệu giả; xử lý trường hợp chưa xác định được cùng người.
- Chọn một tập dữ liệu nhỏ để chia sẻ, ví dụ dị ứng, chẩn đoán, thuốc và sinh hiệu.
- Chốt cơ chế xác thực giữa hệ thống, chính sách chia sẻ và nơi thực thi quyền. Nếu dùng bản ghi consent, phải có cơ chế áp dụng chính sách thực tế.
- B hiển thị rõ dữ liệu từ A, thời điểm và trạng thái; không tự ghi đè hồ sơ B.
- Kiểm tra từ chối truy cập, thu hồi quyền theo chính sách, bản ghi trùng, nguồn mất kết nối và dữ liệu chỉ nhận được một phần.
- Record Locator cần quy tắc cập nhật chỉ mục và kiểm soát quyền; bản thân thông tin “bệnh nhân có hồ sơ ở đâu” cũng cần được bảo vệ.
- Sau thử nghiệm hai OpenMRS, thêm một nguồn có mô hình khác để kiểm chứng mapping và khả năng liên thông khác phần mềm.

Sơ đồ National Layer là định hướng nghiên cứu. Bản thử nghiệm hai cơ sở cần chứng minh đúng người, đúng dữ liệu, đúng quyền và rõ nguồn trước khi mở rộng.

### 10.2. openEHR nếu mentor yêu cầu

Ghi lại quyết định ngay ở M0. Nếu bắt buộc, bổ sung một thử nghiệm có giới hạn: chọn dữ liệu lâm sàng, archetype/template và CDR; định nghĩa mapping, nguồn dữ liệu gốc, cách cập nhật và tiêu chí kiểm chứng. Điều chỉnh kế hoạch trước khi tùy biến sâu. Không coi việc bật FHIR2 là đã hoàn thành openEHR.

### 10.3. AI tra cứu và tóm tắt

- Chọn người dùng đầu tiên, ưu tiên bác sĩ đọc hồ sơ.
- Dùng cùng chính sách quyền với luồng đọc hồ sơ; truy xuất qua API/service được kiểm soát.
- Tóm tắt và dẫn về bản ghi, thời điểm, cơ sở tạo dữ liệu.
- Đánh giá các trường hợp sai bệnh nhân, thiếu dữ liệu, mâu thuẫn, thông tin cũ và câu trả lời không có nguồn.
- Giới hạn bản thử nghiệm đầu tiên ở đọc/tra cứu/tóm tắt; các hành động ghi hồ sơ hoặc đề xuất điều trị cần phạm vi và quy trình đánh giá riêng.

## 11. Các quyết định cần chốt với mentor/nhóm trưởng

| Quyết định | Giả định hiện tại để lập kế hoạch | Thời điểm cần chốt |
| --- | --- | --- |
| Cơ sở và quy trình đầu tiên | Một phòng khám, luồng ngoại trú cơ bản | M0 |
| Bộ dữ liệu và biểu mẫu | Tập tối thiểu phục vụ luồng khám; mentor xác nhận nghiệp vụ | Trước khi chốt DATA-01 và FE-04 |
| Vai trò openEHR | Có điểm quyết định riêng; chưa coi là yêu cầu đã được đáp ứng | M0, trước tùy biến sâu |
| Chuẩn/danh mục và đầu ra Việt Nam | Có từ điển dữ liệu; xuất dữ liệu quản lý/thanh toán khi được đưa vào phạm vi | Trước khi chốt mapping tương ứng |
| Phạm vi triển khai | Demo dữ liệu giả trước; pilot là mốc riêng | Trước M4 |
| Deadline và thời gian của thành viên | Chưa ấn định lịch tuần | Khi phân công issue và đánh giá baseline |
| Cách chia sẻ dữ liệu ở M5 | Dữ liệu gốc tại cơ sở; bắt đầu với tập dữ liệu nhỏ và chính sách rõ ràng | Trước M5 |

## 12. Tài liệu tham khảo

Các nguồn sau hỗ trợ quyết định kỹ thuật. Khi chọn baseline, ghi lại release/tag/commit thực tế; không mặc định nhánh `main`/`master` luôn tương thích với bản nhóm dùng.

- [OpenMRS 3 Reference Application](https://github.com/openmrs/openmrs-distro-referenceapplication): nền tảng distribution và cấu trúc triển khai.
- [Thiết lập instance O3](https://o3-docs.openmrs.org/en-US/docs/recipes/set-up-o3-instance/): dựng hệ thống và chọn phiên bản cố định.
- [Tạo O3 distribution](https://o3-docs.openmrs.org/en-US/docs/recipes/create-a-distribution/): assemble/build frontend và quản lý phiên bản.
- [OpenMRS Initializer](https://github.com/mekomsolutions/openmrs-module-initializer): metadata và cấu hình.
- [Quy ước CSV/UUID của Initializer](https://github.com/mekomsolutions/openmrs-module-initializer/blob/main/readme/csv_conventions.md): định danh đối tượng khi nạp/cập nhật.
- [OpenMRS FHIR2](https://github.com/openmrs/openmrs-module-fhir2) và [hướng dẫn FHIR](https://openmrs.atlassian.net/wiki/pages/viewpage.action?pageId=26935684&pageVersion=86): API FHIR và kiểm tra CapabilityStatement của instance.
- [FHIR R4 profiling](https://hl7.org/fhir/R4/profiling.html), [security](https://hl7.org/fhir/R4/security.html) và [Consent](https://hl7.org/fhir/R4/consent.html): quy ước trao đổi, quyền và biểu diễn sự cho phép chia sẻ.
- [openEHR Architecture Overview](https://specifications.openehr.org/releases/BASE/latest/architecture_overview.html): mô hình, archetype/template, phiên bản dữ liệu và kiến trúc openEHR.
- [Văn bản Bộ Y tế dẫn chiếu phạm vi Quyết định 130 và các văn bản sửa đổi](https://emohbackup.moh.gov.vn/publish/attach/getfile/412729): tham khảo phân biệt đầu ra quản lý/thanh toán với hồ sơ lâm sàng; cần đối chiếu văn bản áp dụng khi triển khai phần xuất dữ liệu.
