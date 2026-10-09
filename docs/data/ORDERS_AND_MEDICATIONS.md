# Diễn biến, chỉ định và thuốc

[Quay lại hướng dẫn chung](../DATA_DICTIONARY.md).

Nguồn: **S01**, PDF mẫu 195 trang; số trang là trang vật lý của tệp, tính từ 1. Ngày rà soát: **09/10/2026**. Trạng thái: **bản đặc tả để nhóm rà soát**, chưa chốt phạm vi triển khai hay quy tắc chuyên môn.

**Cơ sở:** `Mẫu` = nhãn/ô/chỉ số có trong nguồn; `Tách` = tách từ đoạn văn, ô gộp, đồ thị hoặc nhãn; `Đề xuất` = bổ sung cho hệ thống. Cơ sở này không phải trạng thái duyệt.

**Bắt buộc, danh mục chuẩn, giới hạn giá trị, thuật toán và quyền:** tất cả còn **CXT - cần xác nhận** nếu chưa có quyết định được ghi trong bảng bàn giao. Kiểu dữ liệu ở đây là dự kiến. Ô trống, bị che và không đọc được phải giữ khác nhau. Không chép giá trị người bệnh thật vào fixture hoặc tài liệu Git.

Đọc theo thứ tự DR → YL → CD → RX → AD → IF. Tách ý định điều trị, yêu cầu dịch vụ, đơn thuốc, thực hiện thuốc và lần truyền dịch.

Có **132 dòng đặc tả**; cùng khái niệm có thể được tái sử dụng, không phải từng dòng là một cột database.

- [DR - Diễn biến và chỉ đạo điều trị](#dr)
- [YL - Dòng y lệnh và phiếu thực hiện y lệnh](#yl)
- [CD - Chỉ định dịch vụ, lấy mẫu và bảng tổng hợp](#cd)
- [RX - Đơn thuốc](#rx)
- [AD - Phiếu thực hiện thuốc/vật tư](#ad)
- [IF - Theo dõi truyền dịch](#if)

<a id="dr"></a>

## DR - Diễn biến và chỉ đạo điều trị

Trang nguồn: **6-63**. Một lần ghi diễn biến có thời điểm, tác giả và bối cảnh đợt điều trị; phần nối trang thuộc cùng lần ghi.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| DR001 | Ngày giờ ghi diễn biến | Ngày giờ | 6-63 | Mẫu | Thời điểm ở cột Ngày giờ; giữ riêng với thời gian in |
| DR002 | Ngày điều trị thứ | Số nguyên, ngày | 6-63 | Mẫu | Số ngày tương đối được in; cách đếm chờ xác nhận |
| DR003 | Diễn biến bệnh | Văn bản | 6-63 | Mẫu | Nội dung khám, triệu chứng, diễn tiến; giữ nguyên đoạn nguồn |
| DR004 | Ngày giờ khởi phát được kể lại | Ngày giờ hoặc văn bản | 8 | Tách | Tách từ bệnh sử khi xác nhận được; có thể khác ngày giờ ghi |
| DR005 | Thời điểm hoặc ngày dùng trong y lệnh | Ngày hoặc ngày giờ | 6-63 | Tách | Nguồn có nhãn Ngày sử dụng; không mặc định là giờ đã dùng thuốc |
| DR006 | Ngày giờ y lệnh thuốc | Ngày giờ | 6 | Tách | Có trong phần hướng dẫn của dòng thuốc; khác ngày giờ diễn biến |
| DR007 | Y lệnh văn bản | Văn bản | 6-63 | Mẫu | Giữ phần chỉ đạo ngoài các dòng thuốc có cấu trúc |
| DR008 | Ý kiến lãnh đạo khoa đi buồng | Văn bản | 41 | Mẫu | Có ở phần nối phiếu; không nhầm thành tên bác sĩ mới |
| DR009 | Người ghi/chỉ đạo và vai trò | Tham chiếu nhân sự | 6-63 | Tách | Đề xuất tách người từ chữ ký và ngữ cảnh; xác minh người ghi so với người ký |
| DR010 | Chẩn đoán tại thời điểm ghi | Văn bản và mã nếu có | 6-63 | Mẫu | Liên hệ K81-K87; không ghi đè chẩn đoán trước đó |
| DR011 | Bệnh kèm theo trên đầu phiếu | Văn bản hoặc danh sách | 6-63 | Mẫu | Liên hệ K84; ô trống giữ trạng thái chưa ghi |
| DR012 | Nội dung theo dõi | Văn bản hoặc danh sách | 6-63 | Tách | Tách khỏi y lệnh tổng; ví dụ danh sách chỉ số cần theo dõi |
| DR013 | Tần suất theo dõi | Số và đơn vị thời gian | 41, 47, 55 | Tách | Chỉ tách nếu ghi rõ; không tự lấy tần suất từ phiếu khác |
| DR014 | Phân cấp chăm sóc được chỉ định | Danh mục | 6-63 | Tách | Tách từ y lệnh; khác cấp chăm sóc do điều dưỡng ghi ở lần đánh giá |
| DR015 | Chế độ ăn được chỉ định | Văn bản/mã danh mục | 41 | Tách | Có mã trong nội dung; cần danh mục dinh dưỡng được duyệt |
| DR016 | Phục hồi chức năng được chỉ định | Văn bản | 41 | Tách | Tách nội dung chỉ đạo PHCN; không suy đã tập thực tế |
| DR017 | Liên kết lần khám/đợt điều trị | Tham chiếu | 6-63 | Đề xuất | BE chọn cách ánh xạ; không dùng số trang làm mã lần khám |

<a id="yl"></a>

## YL - Dòng y lệnh và phiếu thực hiện y lệnh

Trang nguồn: **6-63**. Một y lệnh có nhiều dòng thuốc/dịch vụ; các mục ký sáng, trưa, chiều, tối là các lần xác nhận riêng.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| YL001 | Số thứ tự dòng thuốc | Số nguyên | 6-63 | Mẫu | Thứ tự hiển thị, không phải mã thuốc |
| YL002 | Tên thuốc/hàm lượng nguyên văn | Văn bản | 6-63 | Mẫu | Giữ nhãn nguồn trước khi tách thuốc và hàm lượng |
| YL003 | Hoạt chất | Văn bản/danh mục | 6-63 | Tách | Nguồn có thể in trong ngoặc; không suy từ tên thương mại khi thiếu |
| YL004 | Hàm lượng/nồng độ | Văn bản hoặc số kèm đơn vị | 6-63 | Tách | Cùng tên thuốc có thể khác hàm lượng; tên gộp cần xác nhận |
| YL005 | Tên thương mại | Văn bản/danh mục | 6-63 | Tách | Tách khi được ghi rõ trong nhãn nguồn |
| YL006 | Số lượng thuốc chỉ định | Số thập phân | 6-63 | Mẫu | Số lượng dòng y lệnh; không đồng nghĩa liều mỗi lần |
| YL007 | Đơn vị số lượng | Danh mục | 6-63 | Mẫu | Viên, chai, ống... theo nhãn; giữ dạng bao bì nếu nguồn ghi |
| YL008 | Hướng dẫn sử dụng | Văn bản | 6-63 | Mẫu | Giữ câu gốc; không chuyển tự động thành chỉ dẫn điều trị |
| YL009 | Nguồn cấp | Danh mục/văn bản | 6-63 | Mẫu | Lĩnh tủ trực/khoa dược hoặc nhãn nguồn; cần xác nhận quy trình |
| YL010 | Đường dùng | Danh mục | 6-63 | Tách | Tách từ hướng dẫn khi ghi rõ; để chưa xác định khi thiếu |
| YL011 | Liều mỗi lần | Số kèm đơn vị hoặc văn bản | 6-63 | Tách | Khác số lượng cả dòng và hàm lượng chế phẩm |
| YL012 | Số lần/tần suất dùng | Số kèm khoảng thời gian hoặc văn bản | 6-63 | Tách | Không suy từ số lượng kê |
| YL013 | Giờ/buổi dự kiến dùng | Giờ hoặc danh mục/văn bản | 6-63 | Tách | Chỉ tách phần được ghi rõ; chưa phải thời gian thực hiện |
| YL014 | Tốc độ truyền trong hướng dẫn | Số kèm đơn vị | 129 | Tách | Nguồn có mL/h trong câu hướng dẫn; không đổi tự động sang giọt/phút |
| YL015 | Dịch pha/phối hợp được ghi | Văn bản hoặc quan hệ dòng thuốc | 6-63 | Tách | Cần chuyên môn xác nhận cách tách; không tự quy trình hóa cách pha |
| YL016 | Yêu cầu xét nghiệm | Danh sách chỉ định | 6-63 | Mẫu | Tách từng yêu cầu; panel có thể gồm nhiều chỉ số |
| YL017 | Yêu cầu chẩn đoán hình ảnh | Danh sách chỉ định | 6-63 | Mẫu | Một yêu cầu khác với báo cáo kết quả |
| YL018 | Yêu cầu thủ thuật | Danh sách chỉ định | 6-63 | Mẫu | Tách khỏi thuốc; việc ghi chỉ định chưa xác nhận đã làm |
| YL019 | Bác sĩ điều trị ký y lệnh | Tham chiếu nhân sự | 6-63 | Mẫu | Giữ vai trò, không lấy mọi tên trên trang làm bác sĩ kê |
| YL020 | Buổi xác nhận giao/nhận | Danh mục | 6-63 | Tách | Sáng/trưa/chiều/tối; lặp thành các mục xác nhận |
| YL021 | Người nhà xác nhận | Người và dấu ký | 6-63 | Tách | Nguồn ghi gia đình người bệnh ký; danh tính có thể không ghi rõ |
| YL022 | Người giao thuốc | Người và dấu ký | 6-63 | Tách | Cột giao thuốc; không suy từ người kê y lệnh |
| YL023 | Người nhận thuốc | Người và dấu ký | 6-63 | Tách | Cột nhận thuốc; cần xác nhận vai trò nhận |
| YL024 | Điều dưỡng thực hiện | Tham chiếu nhân sự | 6-63 | Mẫu | Không mặc định có giờ thực hiện cụ thể chỉ từ tên/chữ ký |
| YL025 | Trạng thái thực hiện từng dòng | Danh mục có quy tắc | 6-63 | Đề xuất | Cần BE/mentor chốt; không tự coi toàn bộ y lệnh đã thực hiện |

<a id="cd"></a>

## CD - Chỉ định dịch vụ, lấy mẫu và bảng tổng hợp

Trang nguồn: **64-73**. Một phiếu có nhiều khối y lệnh và nhiều dòng dịch vụ. Trang 71 có hai khối phòng thực hiện/SID; không ép một SID cho toàn trang.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| CD001 | Mã y lệnh | Chuỗi mã | 64-73 | Mẫu | Định danh yêu cầu; khác số thứ tự hàng đợi |
| CD002 | Mã lượt chỉ định | Chuỗi mã | 70-72 | Mẫu | Nguồn có nhãn riêng; chưa khẳng định bằng mã y lệnh |
| CD003 | Mã SID trên phiếu chỉ định | Chuỗi mã | 70-72 | Mẫu | Cần hệ thống nguồn xác nhận nghĩa và quan hệ với mẫu |
| CD004 | Số thứ tự trên đầu phiếu | Số hoặc chuỗi | 64-73 | Mẫu | Có thể là số hàng đợi; xác nhận khác số dòng |
| CD005 | Lần in | Số nguyên | 64-73 | Mẫu | Thông tin xuất phiếu, không tạo y lệnh mới |
| CD006 | Loại thẻ | Chuỗi/danh mục nguồn | 64-73 | Mẫu | Nhãn tại chân phiếu; chưa xác nhận ý nghĩa nghiệp vụ |
| CD007 | Ưu tiên cấp cứu/thường | Danh mục | 64-73 | Mẫu | Mức ưu tiên yêu cầu dịch vụ, khác trạng thái nhập viện |
| CD008 | Địa điểm thực hiện/tiếp đón | Tham chiếu địa điểm | 64-73 | Mẫu | Giữ nhãn; có thể khác phòng kỹ thuật thực hiện |
| CD009 | Địa điểm lấy mẫu | Tham chiếu địa điểm | 70-72 | Mẫu | Có trên phiếu xét nghiệm |
| CD010 | Nơi chỉ định | Tham chiếu khoa/phòng | 64-73 | Mẫu | Nguồn yêu cầu; không nhầm với nơi thực hiện |
| CD011 | Khoa thực hiện | Tham chiếu khoa | 64-73 | Mẫu | Có thể có nhiều khối trên cùng trang |
| CD012 | Phòng thực hiện | Tham chiếu phòng | 70-72 | Mẫu | Mỗi khối có yêu cầu/SID riêng |
| CD013 | Giờ lấy mẫu bệnh phẩm | Ngày giờ hoặc giờ | 70-72 | Mẫu | Ô có thể trống; không dùng giờ in thay |
| CD014 | Người lấy mẫu bệnh phẩm | Tham chiếu nhân sự | 70-72 | Mẫu | Ô có thể trống |
| CD015 | Đúng tuyến | Trạng thái có/không/chưa ghi | 64-73 | Mẫu | Ô không chọn chưa chứng minh đúng hay sai tuyến |
| CD016 | Đối tượng thanh toán đầu phiếu | Danh mục/văn bản | 64-73 | Mẫu | Giữ mức hưởng nếu có; có thể khác từng dòng |
| CD017 | Yêu cầu dịch vụ | Văn bản/danh mục | 64-73 | Mẫu | Dòng yêu cầu; tách danh mục và điều kiện thực hiện được in |
| CD018 | Ghi chú dòng yêu cầu | Văn bản | 64-73 | Mẫu | Không trộn vào tên dịch vụ |
| CD019 | Số lượng dịch vụ | Số thập phân | 64-73 | Mẫu | Khác giá trị kết quả xét nghiệm |
| CD020 | Đối tượng thanh toán dòng | Danh mục/văn bản | 64-73 | Mẫu | Nguồn có cột riêng |
| CD021 | Phụ thu | Văn bản hoặc tiền | 64-73 | Tách | Nhận diện trong cột gộp Đối tượng TT/Phụ thu; chưa tự suy số tiền |
| CD022 | Đơn giá bệnh viện | Số thập phân, tiền | 64-73 | Mẫu | Đơn vị tiền theo phiếu; quy tắc tính chờ chốt |
| CD023 | Bảo hiểm trả | Số thập phân, tiền | 64-73 | Mẫu | Số tiền dòng; không đồng nhất với phần trăm mức hưởng |
| CD024 | Thành tiền dòng | Số thập phân, tiền | 64-73 | Mẫu | Giữ giá trị nguồn; cách tính cần xác minh |
| CD025 | Tổng cộng/tổng tiền thanh toán | Số thập phân, tiền | 64-73 | Mẫu | Có thể tổng từng khối, không chỉ tổng toàn trang |
| CD026 | Đơn vị tiền tệ | Danh mục | 64-73 | Tách | Nguồn ghi VNĐ/VND; BE chốt mã dùng trong hệ thống |
| CD027 | Ngày/giờ lập chỉ định | Ngày hoặc ngày giờ | 64-73 | Mẫu | Giữ độ chính xác nguồn; khác thời gian in |
| CD028 | Người in phiếu | Tham chiếu người dùng | 64-73 | Mẫu | Vai trò khác bác sĩ ký |
| CD029 | Nhóm dịch vụ ở bảng tổng hợp | Danh mục | 73 | Tách | Ví dụ siêu âm/chẩn đoán hình ảnh; không phải kết quả riêng |
| CD030 | Mã y lệnh liên quan ở bảng tổng hợp | Chuỗi/tham chiếu | 73 | Mẫu | Liên kết dịch vụ gốc, không tạo thêm yêu cầu |
| CD031 | Trình tự thực hiện | Số/văn bản | 73 | Mẫu | Cột có thể để trống |
| CD032 | Giờ dự kiến có kết quả | Ngày giờ/giờ | 73 | Mẫu | Chưa phải thời gian có kết quả thực tế |
| CD033 | Đã nộp tiền | Trạng thái theo nguồn | 73 | Mẫu | Trống là chưa ghi; không suy chưa thanh toán |
| CD034 | Số thứ tự đọc kết quả | Chuỗi/số | 73 | Mẫu | Khác mã y lệnh và số hàng đợi thực hiện |
| CD035 | Lời hướng dẫn dịch vụ | Văn bản, gắn phiên bản | 73 | Mẫu | Nội dung hướng dẫn in; không tự dùng làm quy trình được duyệt |
| CD036 | Phương pháp chuẩn bị được ghi thêm | Văn bản | 73 | Mẫu | Nguồn có ô phương pháp làm sạch; có thể trống |

<a id="rx"></a>

## RX - Đơn thuốc

Trang nguồn: **115-123**. Một đơn có nhiều thuốc. Dòng thuốc chuẩn hóa phải giữ nhãn/hướng dẫn gốc và liên kết tới người bệnh, đợt điều trị.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| RX001 | Mã đơn thuốc điện tử | Chuỗi mã | 115-122 | Mẫu | Nhãn riêng trong một số đơn; không thay bằng mã y lệnh |
| RX002 | Mã y lệnh trên đơn | Chuỗi mã | 115-123 | Mẫu | Liên hệ yêu cầu kê thuốc |
| RX003 | Mã xuất | Chuỗi mã | 123 | Mẫu | Có nhãn trên đơn; cần xác nhận nghĩa cấp phát |
| RX004 | Loại đơn in trên phiếu | Danh mục/văn bản | 115-123 | Mẫu | Cấp phát BHYT/tự túc...; không suy đối tượng chi trả từ tên phiếu |
| RX005 | Ngày kê đơn | Ngày | 115-123 | Mẫu | Nếu chỉ có ngày, không bổ sung giờ giả |
| RX006 | Người kê/ký đơn | Tham chiếu nhân sự | 115-123 | Mẫu | Giữ người và vai trò; nhiều dấu ký cần xác nhận |
| RX007 | Kết quả cận lâm sàng trên đơn | Văn bản | 123 | Mẫu | Có ô riêng; không tạo kết quả số chỉ từ đoạn tóm tắt |
| RX008 | Số thứ tự thuốc | Số nguyên | 115-123 | Mẫu | Thứ tự hiển thị |
| RX009 | Tên thuốc nguyên văn | Văn bản | 115-123 | Mẫu | Tái sử dụng YL khi chuẩn hóa; giữ nhãn đầy đủ của chế phẩm |
| RX010 | Hoạt chất/biệt dược/hàm lượng | Các trường YL002-YL005 | 115-123 | Tách | Tái sử dụng cấu trúc dòng thuốc; không tạo một chuỗi mã duy nhất từ nhãn |
| RX011 | Số lượng kê | Số thập phân | 115-123 | Mẫu | Khác liều mỗi lần |
| RX012 | Đơn vị kê/cấp | Danh mục | 115-123 | Mẫu | Nguồn ghi đơn vị gắn số lượng |
| RX013 | Hướng dẫn dùng nguyên văn | Văn bản | 115-123 | Mẫu | Tái sử dụng các phần tách YL010-YL015 khi nguồn đủ rõ |
| RX014 | Điều kiện trước/sau ăn | Danh mục/văn bản | 123 | Tách | Tách từ hướng dẫn; không suy khi thiếu |
| RX015 | Lời dặn bác sĩ | Văn bản | 115-123 | Mẫu | Khác hướng dẫn in cố định |
| RX016 | Khoảng thời gian khám lại | Số và đơn vị hoặc văn bản | 123 | Tách | Tách khi lời dặn có khoảng thời gian; chưa phải ngày hẹn xác định |
| RX017 | Điều kiện khám lại | Văn bản | 123 | Tách | Giữ nội dung có trong lời dặn |
| RX018 | Người bệnh xác nhận | Người và chữ ký | 115-123 | Mẫu | Mục ký không nhất thiết có tên/giờ |
| RX019 | Người giao thuốc | Người và chữ ký | 115-123 | Mẫu | Phân biệt người kê |
| RX020 | Khoa dược xác nhận | Người/đơn vị và chữ ký | 115-123 | Mẫu | Không tự suy đã cấp đủ các thuốc nếu thiếu bằng chứng |
| RX021 | Hướng dẫn/quy định in trên đơn | Văn bản, phiên bản mẫu | 115-123 | Tách | Thời hạn/điều kiện in sẵn cần xác nhận trước khi làm logic |
| RX022 | Mã QR ứng dụng/khảo sát | Tài liệu/đường dẫn theo mẫu | 115-123 | Tách | Không dùng QR quảng bá làm mã đơn hay trường lâm sàng |
| RX023 | Thời gian bắt đầu/kết thúc dùng thuốc | Ngày giờ hoặc ngày | 115-123 | Đề xuất | Chỉ ghi khi được kê/xác nhận; không suy từ số lượng thuốc |

<a id="ad"></a>

## AD - Phiếu thực hiện thuốc/vật tư

Trang nguồn: **128-146**. Một phiếu theo ngày/ca có nhiều dòng thuốc/vật tư; liên kết với y lệnh khi được xác nhận.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| AD001 | Mã phiếu thực hiện | Chuỗi mã | 128-146 | Mẫu | Định danh phiếu, khác y lệnh trong ghi chú |
| AD002 | Ngày áp dụng | Ngày | 128-146 | Mẫu | Không đồng nhất với giờ ký/giờ xuất phiếu |
| AD003 | Ca áp dụng | Danh mục | 128-146 | Mẫu | Sáng/chiều... theo nguồn; danh mục đầy đủ chờ chốt |
| AD004 | Tên thuốc/vật tư | Văn bản/danh mục | 128-146 | Mẫu | Tách loại thuốc hay vật tư nếu có nguồn xác nhận |
| AD005 | Đơn vị tính | Danh mục | 128-146 | Mẫu | Đơn vị của số lượng thực hiện ghi trên phiếu |
| AD006 | Số lượng dòng | Số thập phân | 128-146 | Mẫu | Không đồng nghĩa liều thực nhận khi nghiệp vụ chưa xác nhận |
| AD007 | Cách dùng | Văn bản | 128-146 | Mẫu | Giữ hướng dẫn, tách đường dùng/giờ/liều nếu rõ |
| AD008 | Ghi chú | Văn bản | 128-146 | Mẫu | Nguồn có mã ở cột này; chưa mặc định mọi mã là mã y lệnh |
| AD009 | Mã tham chiếu trong ghi chú | Chuỗi mã | 128-146 | Tách | Xác minh loại mã và quan hệ trước khi liên kết |
| AD010 | Tổng số khoản | Số nguyên | 128-146 | Mẫu | Số dòng/khoản, không phải tổng số viên/ống |
| AD011 | Gia đình người bệnh ký | Người/dấu ký | 128-146 | Mẫu | Danh tính/quan hệ có thể chưa rõ |
| AD012 | Điều dưỡng thực hiện ký | Tham chiếu nhân sự/dấu ký | 128-146 | Mẫu | Vai trò thực hiện khác bác sĩ kê |
| AD013 | Ngày giờ ở cuối phiếu | Ngày giờ | 128-146 | Mẫu | Nhãn không giải thích rõ là giờ lập/ký/thực hiện; cần xác minh |
| AD014 | Giờ thực tế dùng từng dòng | Ngày giờ | 128-146 | Đề xuất | Cần nghiệp vụ bổ sung; không lấy giờ cuối phiếu cho mọi thuốc |
| AD015 | Trạng thái từng lần thực hiện | Danh mục | 128-146 | Đề xuất | Đã dùng/không dùng/hoãn... cần mentor chốt, chưa được chứng minh bởi mẫu |

<a id="if"></a>

## IF - Theo dõi truyền dịch

Trang nguồn: **105-109**. Một dòng tương ứng một lần truyền; có dung dịch, lô, tốc độ và khoảng bắt đầu/kết thúc.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| IF001 | Số phiếu truyền dịch | Chuỗi mã | 105-109 | Mẫu | Định danh phiếu, không thay số vào viện |
| IF002 | Ngày tháng truyền | Ngày | 105-109 | Mẫu | Ngày của dòng truyền |
| IF003 | Tên dịch truyền/hàm lượng | Văn bản/danh mục | 105-109 | Mẫu | Giữ nhãn; tái sử dụng phần tách thuốc nếu phù hợp |
| IF004 | Số lượng dịch | Số thập phân | 105-109 | Mẫu | Khác thể tích thực truyền |
| IF005 | Đơn vị số lượng dịch | Danh mục | 105-109 | Tách | Tách từ cột số lượng, ví dụ chai/bao bì |
| IF006 | Thể tích chế phẩm | Số, mL nếu ghi | 105-109 | Tách | Tách từ nhãn chế phẩm; chưa chứng minh thể tích đã vào cơ thể |
| IF007 | Lô/số sản xuất | Chuỗi | 105-109 | Mẫu | Giữ chữ và số; không lấy làm mã thuốc |
| IF008 | Tốc độ truyền | Số | 105-109 | Tách | Giá trị của cột tốc độ |
| IF009 | Đơn vị tốc độ | Danh mục | 105-109 | Tách | Phiếu này ghi giọt/phút; giữ đúng đơn vị nguồn |
| IF010 | Thời điểm bắt đầu | Ngày giờ | 105-109 | Mẫu | Thời điểm ghi trong bảng; không thay bằng giờ in |
| IF011 | Thời điểm kết thúc | Ngày giờ | 105-109 | Mẫu | Thiếu là chưa có dữ liệu; không tự tính từ lượng/tốc độ |
| IF012 | Bác sĩ chỉ định | Tham chiếu nhân sự | 105-109 | Mẫu | Vai trò chỉ định |
| IF013 | Điều dưỡng thực hiện | Tham chiếu nhân sự | 105-109 | Mẫu | Vai trò thực hiện |
| IF014 | Người ký | Người/dấu ký | 105-109 | Mẫu | Có thể khác hoặc trùng người thực hiện; giữ vai trò |
| IF015 | Ngày giờ ở cuối phiếu | Ngày giờ | 105-109 | Mẫu | Ý nghĩa cần xác minh khi không có nhãn |
| IF016 | Thể tích thực truyền | Số, mL | 105-109 | Đề xuất | Cần xác nhận/bổ sung khi chức năng yêu cầu; chưa suy từ số chai |

## Khi bàn giao nhóm trường này

Ghi các mã đã chọn vào bảng bàn giao ở tài liệu chung, thống nhất tên trường kỹ thuật và nơi lưu cùng BE. Trường chưa chốt giữ CXT; không dùng đơn vị đoán, mặc định checkbox hoặc ngưỡng in sẵn để triển khai validation.
