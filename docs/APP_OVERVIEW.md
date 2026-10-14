# Giới thiệu ứng dụng EHR VinSHC

## 1. EHR VinSHC là gì?

EHR VinSHC là hệ thống quản lý phòng khám được xây dựng trên **OpenMRS 3**, một nền tảng hồ sơ bệnh án điện tử mã nguồn mở.

Thay vì tự viết lại toàn bộ hệ thống từ đầu, dự án sử dụng OpenMRS làm nền móng, sau đó bổ sung module và giao diện riêng để phù hợp với quy trình của một phòng khám tại Việt Nam.

Có thể hình dung hệ thống gồm ba lớp:

```text
┌───────────────────────────────────────────────────────────────┐
│ Giao diện VinSHC                                             │
│ Tiếp đón · Điều dưỡng · Bác sĩ · CLS · Thu ngân · Dược...   │
├───────────────────────────────────────────────────────────────┤
│ Module VinSHC                                                │
│ Quy trình, API, phân quyền và dữ liệu riêng của phòng khám   │
├───────────────────────────────────────────────────────────────┤
│ Nền tảng OpenMRS                                             │
│ Bệnh nhân · lượt khám · encounter · observation · thuốc...  │
├───────────────────────────────────────────────────────────────┤
│ PostgreSQL và vùng lưu tệp                                   │
│ Dữ liệu thuộc về phòng khám, không nằm cố định trong image   │
└───────────────────────────────────────────────────────────────┘
```

## 2. OpenMRS cung cấp những gì?

Dự án đang sử dụng OpenMRS Reference Application 3.7.1 và OpenMRS Core 2.8.8.

Các Docker image OpenMRS được kéo về đã cung cấp phần nền tảng chung của một hệ thống bệnh án điện tử, gồm:

- Quản lý người dùng, đăng nhập, role và privilege.
- Hồ sơ bệnh nhân và thông tin định danh.
- Lượt khám và encounter.
- Observation và dữ liệu lâm sàng.
- Chẩn đoán, dị ứng và đơn thuốc.
- Lịch hẹn và hàng đợi.
- Chỉ định và kết quả cận lâm sàng.
- File đính kèm và tài liệu bệnh nhân.
- Billing, kho và báo cáo ở mức nền tảng.
- REST API và FHIR API.
- Công cụ quản trị, cấu hình và metadata.

OpenMRS cũng đi kèm nhiều backend module và frontend module có sẵn. Vì vậy, dự án không cần tự xây lại những khái niệm cơ bản như Patient, Visit, Encounter, Observation, User hoặc Role.

Các image này đóng vai trò như **bộ khung ứng dụng đã được đóng gói**. Image không phải nơi lưu lâu dài hồ sơ bệnh nhân và cũng không phải nơi duy nhất chứa code của VinSHC.

## 3. Vì sao vẫn cần module VinSHC?

OpenMRS là nền tảng dùng chung cho nhiều loại cơ sở y tế. Nó không thể biết sẵn quy trình cụ thể của từng phòng khám tại Việt Nam.

Module `vinshc` được dự án phát triển để nối các khả năng chung của OpenMRS thành quy trình phù hợp với phòng khám, ví dụ:

- Tìm kiếm và đăng ký bệnh nhân theo mã nội bộ, CCCD, BHYT, điện thoại hoặc tên tiếng Việt.
- Quản lý người liên hệ và địa chỉ Việt Nam có lịch sử thay đổi.
- Mở, theo dõi và kết thúc lượt khám.
- Tạo encounter đúng vai trò của bác sĩ hoặc điều dưỡng.
- Ghi, xem, đính chính và hủy sinh hiệu có lý do.
- Ghi phiếu khám, tiền sử, chẩn đoán, dị ứng và lời dặn.
- Kê thuốc, ngừng thuốc và theo dõi việc cấp thuốc.
- Đặt lịch, check-in và quản lý hàng đợi.
- Lập phiếu phí, thu tiền, xác nhận chuyển khoản và hoàn tiền.
- Tạo chỉ định CLS, phân công kỹ thuật viên, nhập và đính chính kết quả.
- Lưu file PDF/JPEG/PNG của kết quả.
- Phân quyền theo vai trò và cơ sở.
- Ghi nhật ký truy cập và thay đổi.
- Tổng hợp báo cáo hoạt động và thu/hoàn tiền.

Source code của module nằm trong:

```text
infra/backend/vinshc-module/
```

Khi build backend, source này được biên dịch thành file `vinshc.omod` và được ghép vào backend OpenMRS. Vì vậy, nhóm có thể sửa code VinSHC, chạy test và build lại image mà không phải chỉnh sửa trực tiếp container đang chạy.

## 4. Giao diện của VinSHC

Dự án có một frontend riêng tại:

```text
infra/frontend/
```

Frontend được chia theo nghiệp vụ:

- Bệnh nhân và hành chính.
- Lượt khám.
- Sinh hiệu.
- Khám và điều trị.
- Lịch hẹn và hàng đợi.
- Thu ngân.
- Chỉ định và kết quả.
- Dược.
- Báo cáo.
- Quản trị.
- Chứng từ.

Frontend này gọi các API của module VinSHC. Khi phát triển, giao diện chạy bằng Vite và có thể tự cập nhật khi sửa source.

Image frontend OpenMRS có sẵn vẫn hữu ích để tham khảo và sử dụng các màn hình chuẩn của OpenMRS. Tuy nhiên, giao diện chính dành cho quy trình riêng của phòng khám sẽ được build từ source frontend VinSHC.

## 5. Dữ liệu được lưu ở đâu?

Dữ liệu của phòng khám **không được lưu cố định trong Docker image**.

Hệ thống hiện sử dụng hai Docker volume chính:

| Volume | Nội dung chính |
| --- | --- |
| `postgres-data` | Tài khoản, role, bệnh nhân, lượt khám, encounter, sinh hiệu, chẩn đoán, đơn thuốc, lịch hẹn, hàng đợi, bill, payment, kết quả, audit và metadata |
| `openmrs-pg-data` | Cấu hình runtime, dữ liệu ứng dụng và các tệp như attachment/tài liệu được module lưu trên filesystem |

Trong container, hai vùng này được mount lần lượt vào:

```text
postgres-data   → /var/lib/postgresql/data
openmrs-pg-data → /openmrs/data
```

File đính kèm của VinSHC hiện được lưu dưới vùng:

```text
/openmrs/data/vinshc-attachments
```

Database giữ thông tin mô tả file, liên kết với bệnh nhân/chỉ định/kết quả, dung lượng và mã kiểm tra SHA-256.

## 6. Có thể xem và truy cập dữ liệu không?

Có. Dữ liệu thuộc về hệ thống của phòng khám và có thể được truy cập theo nhiều cách phù hợp với quyền của người sử dụng.

### Qua giao diện ứng dụng

Nhân viên đăng nhập bằng tài khoản được phân vai trò và chỉ thấy chức năng/dữ liệu thuộc quyền của mình.

Ví dụ:

- Tiếp đón xem và cập nhật thông tin hành chính.
- Điều dưỡng xem lượt khám và ghi sinh hiệu.
- Bác sĩ xem hồ sơ lâm sàng và kê đơn.
- Thu ngân xem phiếu phí và giao dịch.
- Quản lý chỉ xem báo cáo tổng hợp, không đọc hồ sơ lâm sàng chi tiết.

### Qua API

Frontend sử dụng REST API của OpenMRS và module VinSHC. API kiểm tra tài khoản, role, cơ sở, bệnh nhân và trạng thái bản ghi trước khi trả hoặc ghi dữ liệu.

API có thể được dùng để tích hợp thêm hệ thống khác, nhưng không nên cấp quyền truy cập trực tiếp rộng hơn mức cần thiết.

### Qua database

Người vận hành có quyền quản trị có thể sử dụng công cụ như PostgreSQL client, DBeaver hoặc pgAdmin để kiểm tra database, chạy báo cáo kỹ thuật và thực hiện backup.

Trong môi trường production, nhân viên bình thường không nên truy cập database trực tiếp. Họ chỉ nên sử dụng giao diện hoặc API để mọi thao tác được kiểm tra quyền và ghi audit.

### Về mật khẩu

Tài khoản người dùng được lưu trong PostgreSQL, nhưng mật khẩu không được lưu dưới dạng văn bản có thể đọc lại. Hệ thống lưu giá trị hash phục vụ xác thực.

Quản trị viên có thể đặt lại mật khẩu mới khi cần, nhưng không nên và không thể đọc lại mật khẩu cũ của người dùng.

## 7. Xóa hoặc thay image có làm mất dữ liệu không?

Thông thường là không, nếu các Docker volume vẫn được giữ nguyên.

Các thao tác sau không tự xóa dữ liệu trong named volume:

- Dừng container.
- Xóa container.
- Xóa image.
- Build image mới.
- Tạo lại container và tiếp tục gắn đúng volume cũ.

Tuy nhiên, lệnh có tùy chọn xóa volume như sau có thể làm mất dữ liệu:

```text
docker compose down -v
```

Không được chạy lệnh này trên hệ thống có dữ liệu cần giữ nếu chưa có backup được kiểm chứng.

Trước khi nâng cấp image, module hoặc database schema, cần backup cả:

1. PostgreSQL trong `postgres-data`.
2. Vùng `/openmrs/data` trong `openmrs-pg-data`.

Backup chỉ được coi là đạt khi đã restore thử sang một môi trường khác và đọc lại đúng dữ liệu cùng file đính kèm.

## 8. Cách phát triển và mở rộng hệ thống

Đối với một phòng khám, không cần clone và sửa toàn bộ OpenMRS.

Cách tiếp cận phù hợp là:

1. Giữ OpenMRS Core và các module chuẩn làm nền.
2. Dùng metadata/configuration để cấu hình các phần OpenMRS đã hỗ trợ.
3. Viết nghiệp vụ riêng trong module VinSHC.
4. Chỉ fork một module upstream khi thật sự phải thay đổi code bên trong module đó.
5. Build image VinSHC từ source và phiên bản đã khóa.
6. Giữ dữ liệu độc lập trong PostgreSQL và volume để có thể backup, restore hoặc chuyển máy.

Mô hình này giúp dự án vừa tận dụng được hệ sinh thái OpenMRS, vừa làm chủ phần code và dữ liệu đặc thù của phòng khám.

## 9. Các vai trò sử dụng hệ thống

Phạm vi hiện tại có 8 vai trò nhân viên:

1. Tiếp đón.
2. Điều dưỡng.
3. Bác sĩ.
4. Kỹ thuật viên cận lâm sàng.
5. Thu ngân.
6. Dược/quầy thuốc.
7. Quản lý.
8. Quản trị.

Hệ thống đang tiếp tục được hoàn thiện để bổ sung:

- Quản lý tài khoản/provider/cơ sở đầy đủ trên frontend.
- Đính chính việc cấp thuốc và tích hợp tồn kho.
- Quy trình duyệt kết quả CLS chặt chẽ hơn.
- Cơ chế công bố lời dặn, đơn thuốc và kết quả cho bệnh nhân.
- Liên kết an toàn giữa tài khoản đăng nhập và hồ sơ bệnh nhân.
- Portal bệnh nhân.
- Chatbot hỗ trợ bác sĩ và bệnh nhân với phạm vi chỉ đọc, có nguồn và kiểm tra quyền.

Danh sách kỹ thuật chi tiết nằm trong `docs/CLINIC_COMPLETION_CHECKLIST.md`.

## 10. Trạng thái hiện tại

Hệ thống đã có nền tảng và phần lớn luồng nghiệp vụ cho nhân viên phòng khám trên dữ liệu synthetic. Tuy nhiên, hệ thống hiện vẫn đang trong giai đoạn phát triển và chưa được phê duyệt để lưu dữ liệu bệnh nhân thật.

Trước khi sử dụng thực tế cần hoàn thành và nghiệm thu:

- Danh mục thuốc, dịch vụ, giá và thuật ngữ chuyên môn.
- Tài khoản, provider và cấu hình cơ sở production.
- HTTPS, quản lý secret và database user quyền tối thiểu.
- Backup tự động và diễn tập restore.
- Bảo mật upload/download file.
- Audit, monitoring và xử lý sự cố.
- Mẫu in, chữ ký và yêu cầu pháp lý.
- Kiểm thử bảo mật và nghiệm thu của người dùng phòng khám.

## 11. Tóm tắt

- **OpenMRS image** cung cấp nền tảng EHR và các module chức năng chung.
- **Module VinSHC** bổ sung quy trình, API, phân quyền và dữ liệu phù hợp với phòng khám.
- **Frontend VinSHC** cung cấp giao diện riêng cho từng vai trò.
- **PostgreSQL và Docker volume** lưu dữ liệu của phòng khám độc lập với image.
- Dữ liệu có thể xem qua giao diện, API hoặc công cụ quản trị database theo đúng quyền.
- Có thể thay hoặc build lại image mà vẫn giữ dữ liệu nếu không xóa volume và migration tương thích.
- Phòng khám làm chủ source VinSHC, image được build và toàn bộ database/attachment của mình.

