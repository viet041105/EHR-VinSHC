# Vai trò và quy trình phòng khám tư nhân

**Trạng thái:** Bản nháp để khảo sát và chốt ở M0. Cập nhật sau khi đi thực tế 1–2 phòng khám và được mentor xác nhận.

Tài liệu này mô tả phòng khám tư nhân mà dự án nhắm tới. Các thành viên dùng nó để cấu hình role, biểu mẫu, hàng đợi, thu tiền và viết kịch bản kiểm thử. Phạm vi kỹ thuật và lộ trình mở rộng nằm trong [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Phòng khám mục tiêu

| Đặc điểm | Giả định ban đầu |
| --- | --- |
| Loại cơ sở | Phòng khám đa khoa hoặc chuyên khoa tư nhân, một địa điểm |
| Quy mô | 1–5 bác sĩ, 20–150 lượt khám/ngày |
| Nhân sự | Một người có thể kiêm nhiều vai trò, ví dụ lễ tân kiêm thu ngân hoặc bác sĩ tự nhập sinh hiệu |
| Cận lâm sàng | Xét nghiệm cơ bản, siêu âm, điện tim; có thể làm tại chỗ hoặc gửi ra ngoài |
| Thuốc | Có hoặc không có quầy thuốc đi kèm |
| Thanh toán | Chủ yếu tự chi trả; BHYT là tùy chọn khi phòng khám có hợp đồng |
| Hạ tầng | Một máy chủ tại chỗ hoặc VPS; mạng có thể chập chờn |

Bệnh viện, nội trú và chuỗi nhiều cơ sở thuộc các tầng sau. Thiết kế ở tầng phòng khám không được chặn đường mở rộng đó.

## 2. Vai trò

Hệ thống cấu hình **role ghép từ privilege**. Một tài khoản có thể giữ nhiều role. Không viết logic gắn cứng "mỗi người một vai trò".

| Role | Việc chính | Không được làm (mặc định) |
| --- | --- | --- |
| Tiếp đón | Đăng ký, tìm bệnh nhân, đặt lịch, cấp số, mở lượt khám | Xem nội dung khám, chẩn đoán, kết quả CLS |
| Thu ngân | Thu phí dịch vụ/thuốc, in phiếu thu, hoàn/hủy theo quy định | Sửa nội dung lâm sàng |
| Điều dưỡng | Đo và ghi sinh hiệu, sàng lọc ban đầu, hỗ trợ thủ thuật | Kê đơn, ghi chẩn đoán xác định |
| Bác sĩ | Khám, ghi bệnh sử, dị ứng, chẩn đoán ICD-10, chỉ định CLS, kê đơn, hẹn tái khám | Sửa phiếu thu |
| Kỹ thuật viên CLS | Xem chỉ định được giao, nhập/đính kèm kết quả | Xem toàn bộ hồ sơ ngoài phạm vi chỉ định |
| Dược / quầy thuốc | Xem đơn đã kê, cấp thuốc, quản lý tồn kho | Sửa đơn của bác sĩ |
| Quản lý phòng khám | Báo cáo lượt khám, doanh thu, công suất | Đọc chi tiết bệnh án nếu không đồng thời là bác sĩ |
| Quản trị hệ thống | Tài khoản, role, cấu hình, sao lưu | Mặc định không dùng tài khoản này để khám bệnh |

Ma trận quyền chi tiết là đầu ra của DATA-04. Quyền phải được thực thi trên backend/API. Ẩn nút trên giao diện chưa đủ.

## 3. Quy trình khám ngoại trú

```text
[Đặt lịch]* ──► Tiếp đón: tìm/đăng ký bệnh nhân, mở lượt khám, cấp số
                     │
                     ▼
              Thu phí khám (trả trước hoặc trả sau theo cấu hình)
                     │
                     ▼
              Điều dưỡng: sinh hiệu ──► Hàng đợi bác sĩ
                     │
                     ▼
              Bác sĩ: bệnh sử, dị ứng, khám
                     │
         ┌───────────┴─────────────┐
         │ Cần cận lâm sàng?       │
         ▼                         │
   Chỉ định CLS ─► Thu phí ─► KTV thực hiện, trả kết quả
         │                         │
         └──────────► Bác sĩ đọc kết quả ◄┘
                     │
                     ▼
              Chẩn đoán ICD-10, kê đơn, hẹn tái khám
                     │
                     ▼
              In đơn thuốc / phiếu kết quả
                     │
                     ▼
              Thu tiền thuốc ─► [Quầy thuốc cấp thuốc]*
                     │
                     ▼
              Kết thúc lượt khám
```

`*` là bước tùy chọn theo phòng khám.

### Các biến thể cần hỗ trợ bằng cấu hình

- **Trả trước hoặc trả sau:** có phòng khám thu tiền khám trước, có phòng khám thu một lần cuối buổi.
- **Không có điều dưỡng:** bác sĩ tự ghi sinh hiệu.
- **Không có quầy thuốc:** chỉ in đơn, bệnh nhân mua thuốc bên ngoài.
- **CLS gửi ngoài:** nhập kết quả tay hoặc đính kèm file PDF/ảnh.
- **Khách vãng lai và tái khám:** tái khám mở lượt mới, liên kết với lần trước.
- **Hủy lượt hoặc bệnh nhân bỏ về giữa chừng:** lượt khám được đóng kèm lý do; phiếu thu đã phát sinh được xử lý theo quy trình hoàn/hủy.

## 4. Giấy tờ đầu ra

| Giấy tờ | Tầng | Ghi chú |
| --- | --- | --- |
| Đơn thuốc | MVP-2 | Theo mẫu và thông tin bắt buộc của quy định kê đơn hiện hành |
| Phiếu thu | MVP-2 | Không thay thế hóa đơn điện tử |
| Phiếu chỉ định CLS | MVP-2 | |
| Phiếu kết quả CLS | MVP-2 | |
| Giấy hẹn tái khám | MVP-2 | |
| Tóm tắt lượt khám | MVP-2 | |
| Hóa đơn điện tử | Mở rộng | Qua nhà cung cấp HĐĐT |
| Hồ sơ XML BHYT | Mở rộng | Chỉ khi có hợp đồng BHYT |

Mẫu in được quản lý trong Git như metadata. Nội dung bắt buộc phải đối chiếu [VIETNAM_COMPLIANCE.md](VIETNAM_COMPLIANCE.md).

## 5. Câu hỏi khảo sát tại phòng khám

1. Một ngày có bao nhiêu lượt khám, vào giờ cao điểm nào? Bao nhiêu người làm việc cùng lúc?
2. Ai làm bước nào? Có ai kiêm nhiệm vai trò không?
3. Thu tiền vào lúc nào? Có những loại giá nào (khám, dịch vụ, gói)? Có giảm giá hay miễn phí không?
4. Có nhận BHYT không? Có xuất hóa đơn điện tử không, qua nhà cung cấp nào?
5. Dùng những xét nghiệm/CLS nào? Làm tại chỗ hay gửi ngoài, trả kết quả dưới dạng gì?
6. Có quầy thuốc không? Quản lý tồn kho và hạn dùng như thế nào?
7. Hiện đang dùng những mẫu giấy tờ nào? Xin bản mẫu đã xóa thông tin bệnh nhân.
8. Phần mềm hiện tại là gì, cần chuyển dữ liệu cũ không?
9. Mạng và máy tính thế nào? Có cần chạy khi mất Internet không?
10. Chủ phòng khám cần xem báo cáo gì hằng ngày, hằng tháng?

Ghi kết quả khảo sát vào `docs/decisions/` hoặc issue. Không lưu thông tin bệnh nhân thật trong repo.
