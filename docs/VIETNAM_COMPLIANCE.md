# Checklist yêu cầu tại Việt Nam

**Trạng thái:** Bản nháp để rà soát. **Đây không phải tư vấn pháp lý.** Danh sách văn bản được lập từ hiểu biết của nhóm tại thời điểm soạn. Trước khi đưa một mục vào phạm vi, người phụ trách phải đối chiếu văn bản đang có hiệu lực trên nguồn chính thức (Cổng thông tin Bộ Y tế, Công báo, CSDL quốc gia về văn bản pháp luật) và cập nhật cột "Đã xác minh".

MVP chạy trên dữ liệu giả. Các yêu cầu dưới đây quyết định thiết kế ngay từ đầu, vì sửa lại sau khi có dữ liệu thật tốn kém hơn nhiều.

## 1. Văn bản cần đối chiếu

| Lĩnh vực | Văn bản tham chiếu (cần xác minh hiệu lực) | Ảnh hưởng tới hệ thống | Tầng | Đã xác minh |
| --- | --- | --- | --- | --- |
| Khám chữa bệnh | Luật Khám bệnh, chữa bệnh số 15/2023/QH15 và văn bản hướng dẫn | Hồ sơ bệnh án, người hành nghề, quyền của người bệnh | 1 | ☐ |
| Hồ sơ bệnh án điện tử | Thông tư 46/2018/TT-BYT; văn bản thay thế/hướng dẫn mới về HSBA điện tử (nhóm cần xác nhận số hiệu, lộ trình áp dụng cho phòng khám) | Chữ ký số, lưu trữ, nhật ký, sao lưu, điều kiện bỏ bệnh án giấy | 1 → pilot | ☐ |
| Kê đơn thuốc | Thông tư 52/2017/TT-BYT và các văn bản sửa đổi/thay thế | Thông tin bắt buộc trên đơn, mẫu đơn, kê đơn điện tử | 1 | ☐ |
| Liên thông đơn thuốc | Hướng dẫn của Bộ Y tế về đơn thuốc điện tử quốc gia | Mã cơ sở, mã người kê đơn, gửi đơn lên hệ thống quốc gia | 2 | ☐ |
| Dược | Luật Dược và văn bản sửa đổi | Quầy thuốc, tồn kho, hạn dùng, thuốc kiểm soát đặc biệt | 2 | ☐ |
| Dữ liệu cá nhân | Luật Bảo vệ dữ liệu cá nhân (2025) và Nghị định 13/2023/NĐ-CP (cần xác nhận quan hệ thay thế) | Dữ liệu sức khỏe là dữ liệu nhạy cảm: đồng ý, mục đích, nhật ký, đánh giá tác động, thông báo vi phạm | 1 | ☐ |
| Giao dịch điện tử | Luật Giao dịch điện tử 2023 | Chữ ký điện tử/chữ ký số trên hồ sơ | pilot | ☐ |
| An toàn thông tin | Quy định về bảo đảm an toàn hệ thống thông tin theo cấp độ | Phân loại hệ thống, biện pháp kỹ thuật | pilot | ☐ |
| BHYT | Quyết định 130/QĐ-BYT và các văn bản sửa đổi (chuẩn dữ liệu XML) | Xuất dữ liệu đề nghị thanh toán BHYT | 2, tùy chọn | ☐ |
| Hóa đơn | Nghị định 123/2020/NĐ-CP và văn bản sửa đổi | Kết nối nhà cung cấp hóa đơn điện tử | 2, tùy chọn | ☐ |
| Địa giới hành chính | Các nghị quyết sắp xếp đơn vị hành chính năm 2025 (mô hình tỉnh → xã từ 01/7/2025) | Danh mục địa chỉ, đối chiếu địa chỉ cũ trên giấy tờ | 1 | ☐ |
| Danh mục chuyên môn | Danh mục ICD-10 do Bộ Y tế ban hành; danh mục dùng chung về thuốc, dịch vụ kỹ thuật, vật tư | Mã chẩn đoán, mã thuốc, mã dịch vụ | 1 | ☐ |

## 2. Yêu cầu thiết kế rút ra

Các mục này áp dụng ngay cả khi chỉ chạy dữ liệu giả, vì chúng quyết định mô hình dữ liệu và quyền:

- [ ] **Định danh người bệnh:** hỗ trợ CCCD, mã BHXH/BHYT, mã nội bộ của phòng khám. Mỗi loại mã có cơ sở cấp. Không tự gộp hồ sơ khi chỉ trùng họ tên.
- [ ] **Người hành nghề:** lưu số chứng chỉ/giấy phép hành nghề và phạm vi chuyên môn của bác sĩ để in lên đơn và dùng khi liên thông.
- [ ] **Thông tin cơ sở:** tên, địa chỉ, số giấy phép hoạt động và mã cơ sở được cấu hình, không viết cứng trong mẫu in.
- [ ] **Chẩn đoán:** mã ICD-10 theo danh mục Bộ Y tế, kèm tên tiếng Việt và phiên bản danh mục.
- [ ] **Đơn thuốc:** đủ trường bắt buộc theo quy định kê đơn; phân biệt thuốc thường và thuốc kiểm soát đặc biệt.
- [ ] **Nhật ký:** ghi ai xem, ai sửa hồ sơ, lúc nào. Không ghi đè mất dấu bản cũ.
- [ ] **Đồng ý của người bệnh:** có chỗ ghi nhận đồng ý xử lý dữ liệu và đồng ý chia sẻ (khi liên thông).
- [ ] **Địa chỉ:** dùng danh mục tỉnh → xã hiện hành; cho phép nhập địa chỉ cũ dạng văn bản để đối chiếu giấy tờ.
- [ ] **Sao lưu và lưu trữ:** có quy trình backup–restore và thời hạn lưu trữ hồ sơ theo quy định.
- [ ] **Mã hóa đường truyền:** HTTPS khi triển khai ngoài máy local.
- [ ] **Tách tích hợp:** BHYT, HĐĐT, đơn thuốc quốc gia là adapter tùy chọn, có thể tắt.

## 3. Trước khi pilot với dữ liệu thật

Một mốc riêng, không thuộc MVP:

1. Đối chiếu lại toàn bộ bảng mục 1 và ghi kết quả.
2. Đánh giá tác động xử lý dữ liệu cá nhân.
3. Kiểm thử bảo mật cơ bản: phân quyền API, phiên đăng nhập, cấu hình HTTPS.
4. Thử backup–restore trên bản sao.
5. Có thỏa thuận với phòng khám về trách nhiệm dữ liệu, hỗ trợ và giới hạn của phần mềm.
6. Có quy trình xử lý sự cố và người liên hệ.
