# Hướng dẫn đóng góp

Cảm ơn bạn quan tâm tới EHR-VinSHC. Dự án đang ở giai đoạn đầu; tài liệu này áp dụng cho thành viên nhóm và người đóng góp bên ngoài.

## Trước khi bắt đầu

1. Đọc [PROJECT_PLAN.md](PROJECT_PLAN.md) và [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) để biết phạm vi và ranh giới module.
2. Dựng môi trường theo [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
3. Tìm hoặc tạo issue cho việc định làm. Thay đổi lớn (module mới, đổi baseline, đổi mô hình dữ liệu) cần thảo luận trong issue trước khi viết mã.

## Quy tắc bắt buộc

- **Không đưa dữ liệu bệnh nhân thật vào repo, issue, PR, log hoặc ảnh chụp màn hình.** Chỉ dùng dữ liệu giả.
- **Không commit bí mật:** mật khẩu, token, file `.env`, chứng chỉ, database dump.
- Ưu tiên cấu hình và metadata trước khi sửa mã. Không sửa mã upstream trong repo này. Lỗi chung của OpenMRS được báo hoặc đóng góp về dự án gốc.
- Khóa phiên bản; không dùng tag động như `latest`, `next`, `qa`.
- Metadata mới phải có UUID ổn định và được ghi trong [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) khi là trường lâm sàng.
- Tích hợp bên ngoài (BHYT, hóa đơn, đơn thuốc quốc gia, LIS, PACS) phải là adapter có thể tắt.
- Quyền truy cập phải được kiểm tra trên backend/API, không chỉ trên giao diện.

## Quy trình PR

1. Tạo nhánh từ `main`: `feature/<mã-đầu-việc>-<mô-tả>`, `fix/...` hoặc `docs/...`.
2. Chạy các kiểm tra trong [docs/CI.md](docs/CI.md#5-kiểm-tra-trước-khi-mở-pr) cho phần bị ảnh hưởng.
3. Mô tả PR gồm: thay đổi gì, vì sao, cách kiểm chứng, giới hạn còn lại, mã đầu việc liên quan.
4. Khi đổi API, UUID, biểu mẫu hoặc phiên bản: cập nhật tài liệu/fixture liên quan và báo người dùng phần đó.
5. Cần ít nhất một người review. Các check CI bắt buộc phải đạt trước khi merge.

## Bản dịch tiếng Việt

Bản dịch cho app OpenMRS 3 nên đóng góp về upstream qua Transifex của OpenMRS. Repo này chỉ giữ phần bổ sung chưa được upstream nhận, kèm ghi chú để gỡ khi upstream đã có.

## Báo lỗi bảo mật

Không mở issue công khai cho lỗ hổng bảo mật. Xem [SECURITY.md](SECURITY.md).
