# Kết quả kiểm chứng Docker và CI baseline

**Ngày kiểm chứng:** 07/10/2026, múi giờ UTC+7.

Docker baseline đã được chạy thật trên máy phát triển và trên một Compose project độc lập có database mới, mật khẩu mới và cổng riêng. Báo cáo này ghi nhận kiểm chứng local đã đạt; trạng thái workflow trên GitHub được theo dõi riêng trong [GitHub Actions](https://github.com/viet041105/EHR-VinSHC/actions).

## Môi trường đã chạy

| Thành phần | Phiên bản |
| --- | --- |
| Máy host | Windows, Docker Engine chạy Linux containers |
| Docker CLI | 28.4.0 |
| Docker Compose | 2.39.4 |
| Python | 3.11.9 |
| Reference Application | 3.7.1; image upstream khóa digest |
| MariaDB | 10.11.19; image khóa digest |
| OpenMRS Core qua API | 2.8.8 |
| REST module qua API | 3.5.0.69fa31 |
| FHIR2 module qua API | 4.2.0 |
| Initializer module qua API | 2.12.0 |

REST module báo thêm mã build `69fa31` so với phiên bản `3.5.0` trong manifest distro. Smoke kiểm tra **phiên bản runtime đầy đủ**, được ghi trong `config/baseline.json`.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Compose: nguồn image/build, readiness, localhost binding và named volumes | Đạt |
| Regression test của các công cụ | 15/15 đạt |
| Workflow qua actionlint 1.7.12 | Đạt |
| Archive actionlint Linux tải thật khớp SHA-256 trong workflow | Đạt |
| Khởi tạo database mới và nạp metadata tối thiểu | Đạt |
| Bốn service cùng healthy | Đạt |
| O3 HTML/import map và JavaScript app shell/login qua gateway | Đạt |
| Đăng nhập REST và chọn VinSHC Development Clinic trong session | Đạt |
| Mật khẩu sai bị từ chối; tra cứu Patient REST/FHIR không đăng nhập bị từ chối | Đạt |
| Core/REST/FHIR2/Initializer đúng baseline và các module cần thiết đã started | Đạt |
| FHIR R4 CapabilityStatement, quảng bá read cho Patient/Encounter/Observation | Đạt |
| REST patient search và FHIR Patient search trả đúng cấu trúc | Đạt |
| Tạo bệnh nhân giả qua REST, đọc đúng UUID/mã qua REST và FHIR | Đạt |
| Dựng lại container, giữ volume và đọc chính hồ sơ trước đó | Đạt trên cả instance local và instance mới độc lập |
| Mật khẩu cấu hình không xuất hiện trong báo cáo/log đã thu thập | Đạt |

Instance độc lập vượt qua **9 nhóm smoke check trước restart và 9 nhóm sau restart**. Fixture sau restart được đọc lại, không tạo lại để che mất dữ liệu.

Bản backend ban đầu chứa bộ demo lớn mất nhiều thời gian nhập dữ liệu. Bản cuối dùng lớp Dockerfile từ release cố định, bỏ nội dung `referenceapplication-demo` và module sinh demo, giữ metadata nền, thêm một location giả có UUID ổn định bằng Initializer. Cấu hình frontend demo được tắt.

Các báo cáo local nằm dưới `.runtime/reports/`: `ci-local-before.json`, `ci-local-after.json`, `ci-local-compose.log`, `ci-local-containers.json`. Thư mục này được Git bỏ qua. Instance kiểm chứng tạm đã được dọn; instance phát triển chính và hai volume của nó được giữ lại.

## Giới hạn cần đọc cùng kết quả

- Báo cáo này chưa bao gồm kết quả runner GitHub. Cần kiểm tra cả hai job trong tab Actions; báo cáo local không thay thế run đó.
- Kiểm tra giao diện hiện tải HTML, import map và JavaScript; chưa thao tác toàn bộ luồng qua trình duyệt. Công cụ điều khiển browser của phiên này không khởi tạo được, nên không ghi nhận E2E trình duyệt là đạt.
- Chưa nghiệm thu đăng ký/khám ngoại trú xuyên suốt, biểu mẫu và metadata Việt Nam, phân quyền nghiệp vụ, mapping Encounter/Observation hoặc liên thông hai cơ sở. Các phần này tiếp tục theo `PROJECT_PLAN.md`.
- Log upstream còn thông báo về thiếu cấu hình Address Hierarchy, thư mục cấu hình Tomcat và xác thực XML module. Các kiểm tra trên vẫn đạt, nhưng chưa thể kết luận toàn bộ module của distro hoạt động đầy đủ. Nhóm cần đối chiếu và xử lý các thông báo này khi triển khai chức năng phụ thuộc; log đã được giữ trong báo cáo diagnostics.
- Kiểm chứng giữ volume sau restart khác với kiểm chứng backup–restore; backup–restore chưa được nghiệm thu.

Hướng dẫn tái hiện nằm trong [DEVELOPMENT.md](DEVELOPMENT.md); phạm vi và trigger workflow nằm trong [CI.md](CI.md).
