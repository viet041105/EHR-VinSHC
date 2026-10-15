# Trường dữ liệu và trạng thái thiếu

## not_recorded, not_asked và unknown
not_recorded là chưa ghi nhận giá trị. not_asked là chưa hỏi hoặc chưa khai thác. unknown là đã khai thác nhưng chưa biết hoặc không xác định được. Các trạng thái này không có nghĩa là bình thường, âm tính hoặc không có bệnh. Đây là giải thích contract dữ liệu dùng để phát triển, không phải hướng dẫn chẩn đoán.

## Các trạng thái thiếu khác
refused là từ chối cung cấp; not_applicable là không áp dụng; masked là dữ liệu bị che; unreadable là không đọc được nguồn. Mỗi trường chỉ được dùng những trạng thái mà metadata của trường đó cho phép. Không tự gán một trạng thái cho tất cả các trường.

## fieldStates và hàng lặp
Không lưu đồng thời một giá trị và một trạng thái thiếu cho cùng trường, cùng hàng và cùng ngữ cảnh. fieldStates cần gắn fieldCode, rowKey, context và source. Với hàng lặp, rowKey là UUID ổn định của hàng, không dùng vị trí trong mảng. Cần giữ nguồn và thời điểm ghi nhận để kiểm tra lại dữ liệu.
