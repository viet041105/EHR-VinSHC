# Sinh hiệu trong metadata VinSHC

## Đơn vị tám sinh hiệu
Mạch và nhịp thở dùng /min. Huyết áp tâm thu và tâm trương dùng mm[Hg]. Nhiệt độ dùng Cel. SpO2 dùng %. Cân nặng dùng kg. Chiều cao dùng cm. Tool hồ sơ giữ giá trị và đơn vị backend trả về; tài liệu này mô tả metadata, không cung cấp kết quả đo của một bệnh nhân.

## SpO2 và phương pháp đo
Trường vitals.spo2 biểu diễn SpO2 theo phần trăm. Mapping LOINC 59408-5 chỉ phù hợp phương pháp pulse oximetry. Không suy phương pháp đo từ riêng nhãn SpO2. Contract B3 ghi nhận xác nhận pulse oximetry; các mapping còn cần thông tin người duyệt và phương pháp tương ứng trước khi dùng trong môi trường thật.

## Validation toán học
R_NUM yêu cầu số hữu hạn. R_POS yêu cầu mạch, nhịp thở, cân nặng, chiều cao và huyết áp lớn hơn 0. R_PERCENT yêu cầu SpO2 nằm trong khoảng 0 đến 100, gồm hai đầu mút. Đây là validation dữ liệu, không phải ngưỡng bình thường hay nguy hiểm và không dùng để đưa khuyến nghị điều trị.

## Cặp huyết áp R_BP
Hai thành phần huyết áp phải cùng patient, visit, encounter, group và measuredAt. Thiếu một thành phần phải có trạng thái thiếu rõ ràng cho thành phần đó. Nếu tâm thu nhỏ hơn hoặc bằng tâm trương thì đánh dấu needs_verification; không tự sửa hay tự loại phép đo. Contract chọn FHIR R4 BP panel với hai components; không ghép hai phép đo khác thời điểm thành một cặp.
