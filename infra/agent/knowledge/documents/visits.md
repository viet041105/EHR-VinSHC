# Lượt khám và nguồn hồ sơ

## Patient, Visit và Encounter
Patient là bệnh nhân. Visit là một lượt đến khám. Một Visit có thể chứa nhiều Encounter, như tiếp nhận, đo sinh hiệu và khám bác sĩ. Hồ sơ của bệnh nhân gồm nhiều lượt khám; một Encounter không đại diện cho toàn bộ lịch sử bệnh nhân.

## Ngữ cảnh của trợ lý bác sĩ
Trợ lý lấy bệnh nhân, cơ sở và lần khám từ ngữ cảnh đã kiểm tra ở server. Tool tóm tắt đọc Encounter đang mở; tool lịch sử đọc các Visit thuộc cùng bệnh nhân được phép xem. Model dùng mã tham chiếu do tool cấp, không chọn bệnh nhân hoặc cơ sở khác qua nội dung câu hỏi.

## Dữ kiện có nguồn
Một dữ kiện cần giữ bản ghi nguồn, fieldCode, thời điểm và trạng thái. Dữ liệu nháp, đã ngừng, bị đính chính hoặc thiếu giá trị cần được nêu đúng trạng thái. Tài liệu tham khảo chỉ mô tả cách dùng hệ thống, không được dùng để điền một giá trị còn thiếu trong hồ sơ.
