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
7. Nếu bật trợ lý AI với dữ liệu thật: qua gate AI ở mục 4.

## 4. Trợ lý AI

Trợ lý AI (MVP-3, [AGENT_PLAN.md](AGENT_PLAN.md)) được nghiệm thu trên dữ liệu giả. Với dữ liệu thật, trợ lý **mặc định tắt** cho tới khi qua gate dưới đây. Nếu chưa qua gate, phần còn lại của hệ thống vẫn có thể pilot, chỉ là không có trợ lý.

### 4.1. Vấn đề cần đối chiếu

| Vấn đề | Văn bản tham chiếu (cần xác minh hiệu lực) | Ảnh hưởng tới hệ thống | Đã xác minh |
| --- | --- | --- | --- |
| Gửi dữ liệu sức khỏe tới model | Luật Bảo vệ dữ liệu cá nhân (2025), Nghị định 13/2023/NĐ-CP | Mục đích xử lý, căn cứ/đồng ý, đánh giá tác động. Nếu nhà cung cấp model xử lý ở nước ngoài thì có thể là chuyển dữ liệu ra nước ngoài, cần hồ sơ riêng | ☐ |
| Trợ lý có bị coi là trang thiết bị y tế (phần mềm) không | Nghị định 98/2021/NĐ-CP về quản lý trang thiết bị y tế và văn bản sửa đổi | Phần mềm hỗ trợ chẩn đoán/điều trị có thể phải phân loại và đăng ký. Giữ phạm vi đọc và giải thích giúp giảm rủi ro nhưng vẫn cần xác nhận | ☐ |
| Quy định về trí tuệ nhân tạo | Luật Công nghiệp công nghệ số (2025) và văn bản riêng về AI nếu đã ban hành | Minh bạch, ghi nhãn nội dung do AI tạo, phân loại rủi ro | ☐ |

### 4.2. Yêu cầu thiết kế

Áp dụng ngay trong MVP-3, kể cả khi chỉ chạy dữ liệu giả:

- [ ] **Chỉ đọc:** agent không có tool ghi, chốt hồ sơ, kê đơn hay đặt chỉ định.
- [ ] **Quyền của người hỏi:** mỗi lần đọc dùng phiên đăng nhập của người hỏi; backend kiểm quyền và ghi audit; audit phân biệt lượt đọc do agent.
- [ ] **Tối thiểu dữ liệu:** chỉ gửi tới model dữ liệu cần cho câu hỏi; không gửi CCCD, số điện thoại, địa chỉ, credential.
- [ ] **Dẫn nguồn và nhãn AI:** mỗi câu trả lời có nguồn mở lại được và ghi rõ do AI tạo.
- [ ] **Bệnh nhân:** chỉ đọc phần đã công bố của chính mình; dấu hiệu khẩn cấp nhận câu trả lời cố định khuyên gọi 115 hoặc liên hệ phòng khám.
- [ ] **Log:** không chứa nội dung hồ sơ hoặc câu hỏi; MVP không lưu hội thoại.
- [ ] **Bật/tắt:** cấu hình theo cơ sở; tắt mặc định với dữ liệu thật; model bên ngoài cần cờ cho phép riêng.

### 4.3. Gate trước khi bật với dữ liệu thật

1. Đánh giá tác động xử lý dữ liệu cá nhân có phần AI. Nếu dùng model bên ngoài: hợp đồng xử lý dữ liệu với nhà cung cấp, nơi xử lý, chính sách lưu và không dùng dữ liệu để huấn luyện, và hồ sơ chuyển dữ liệu ra nước ngoài nếu áp dụng. Phương án thay thế là model chạy tại chỗ.
2. Xác nhận phân loại pháp lý của trợ lý ở bảng 4.1.
3. Thông báo cho nhân viên và bệnh nhân về trợ lý, phạm vi, giới hạn và cách không dùng.
4. Kết quả đánh giá (AI-07) đạt trên bộ ca mở rộng gần với dữ liệu thực tế; bác sĩ của phòng khám pilot review cách diễn đạt.
5. Có kênh báo câu trả lời sai và người xử lý.
6. Có theo dõi sau khi bật: tỷ lệ câu bị validator loại, câu bị từ chối, phản hồi của người dùng.
