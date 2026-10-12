# Trường nền tảng: người bệnh, tiếp nhận, khám và chẩn đoán

[Quay lại hướng dẫn chung](../DATA_DICTIONARY.md).

Nguồn: **S01**, PDF mẫu 195 trang; số trang là trang vật lý của tệp, tính từ 1. Ngày rà soát: **09/10/2026**. Trạng thái: **bản đặc tả để nhóm rà soát**, chưa chốt phạm vi triển khai hay quy tắc chuyên môn.

**Cơ sở:** `Mẫu` = nhãn/ô/chỉ số có trong nguồn; `Tách` = tách từ đoạn văn, ô gộp, đồ thị hoặc nhãn; `Đề xuất` = bổ sung cho hệ thống. Cơ sở này không phải trạng thái duyệt.

**Bắt buộc, danh mục chuẩn, giới hạn giá trị, thuật toán và quyền:** tất cả còn **CXT - cần xác nhận** nếu chưa có quyết định được ghi trong bảng bàn giao. Kiểu dữ liệu ở đây là dự kiến. Ô trống, bị che và không đọc được phải giữ khác nhau. Không chép giá trị người bệnh thật vào fixture hoặc tài liệu Git.

Đây là **104 dòng nền tảng**, chủ yếu từ trang 1-5; quan hệ người đại diện và giấy tờ được đối chiếu thêm trang 125, 149, 183. Tái sử dụng các khái niệm này trong các nhóm còn lại, giữ bối cảnh tài liệu, thời điểm và giai đoạn chẩn đoán.

Một trường tên/mã chẩn đoán cần cấu trúc tên, mã, hệ mã/phiên bản, vai trò và giai đoạn. Một số đo cần giá trị, đơn vị và thời điểm. Một người tham gia cần định danh, nhãn tên và vai trò. Các cấu trúc này do BE và người 3 chốt, chưa ấn định thành cột database.

## 1. Người bệnh, địa chỉ, bảo hiểm và liên hệ

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| K01 | Mã bệnh nhân / Mã BN | Chuỗi | 1, 5 | Mẫu | Giữ số 0 đầu; cần hệ thống/cơ sở cấp mã. Mã ở báo cáo điện quang khác mã hành chính |
| K02 | Mã điều trị / Mã ĐT | Chuỗi | 1, 5 | Mẫu | Không gộp với mã bệnh nhân; cần BE xác nhận nghĩa nghiệp vụ |
| K03 | Mã VV / Số vào viện | Chuỗi | 5, 7 | Mẫu | Không tự coi là K01 hoặc K02 |
| K04 | Họ và tên người bệnh | Văn bản | 1, 5 | Mẫu | Không dùng tên để tự gộp người bệnh |
| K05 | Ngày tháng năm sinh | Ngày | 1 | Mẫu | Cần quy ước khi chỉ biết một phần ngày sinh |
| K06 | Năm sinh | Số nguyên | 5 | Mẫu | Có mẫu chỉ ghi năm; không tự tạo ngày 01/01 |
| K07 | Tuổi in trên phiếu | Số và bối cảnh thời điểm | 1, 5 | Mẫu | Nếu tính lại tuổi, cần thời điểm tính và phân biệt tuổi đã in |
| K08 | Giới tính | Danh mục | 1, 5 | Mẫu | Nhãn nguồn có Nam/Nữ; các giá trị khác cần thống nhất |
| K09 | Nghề nghiệp | Danh mục hoặc văn bản | 1, 5 | Mẫu | Xác nhận danh mục và giá trị “không xác định” |
| K10 | Mã nghề nghiệp | Chuỗi mã | 1 | Mẫu | Mã tách khỏi nhãn, cần nguồn danh mục |
| K11 | Dân tộc | Danh mục | 1, 5 | Mẫu | Cần nguồn/phiên bản danh mục |
| K12 | Mã dân tộc | Chuỗi mã | 1 | Mẫu | Không suy mã chỉ bằng tên |
| K13 | Quốc tịch / Ngoại kiều | Danh mục | 1, 5 | Mẫu | Xác nhận hai nhãn dùng cùng danh mục hay khác ý nghĩa |
| K14 | Mã quốc tịch/ngoại kiều | Chuỗi mã | 1 | Mẫu | Cần nguồn danh mục |
| K15 | Số nhà | Văn bản | 1 | Mẫu | Cho phép chữ, ký hiệu; không dùng kiểu số |
| K16 | Thôn, phố | Văn bản | 1 | Mẫu | Không tự phân tích từ một địa chỉ tự do nếu chưa xác nhận |
| K17 | Xã, phường | Danh mục và nhãn nguồn | 1 | Mẫu | Danh mục có phiên bản theo thời điểm |
| K18 | Huyện, quận, thị xã | Danh mục và nhãn nguồn | 1 | Mẫu | Nguồn có trường này; việc dùng trong hệ thống cần chốt theo phạm vi |
| K19 | Tỉnh, thành phố | Danh mục và nhãn nguồn | 1 | Mẫu | Giữ địa chỉ tại thời điểm ghi hồ sơ |
| K20 | Địa chỉ ghi thành một dòng | Văn bản | 5 | Mẫu | Phân biệt bản hiển thị với các phần địa chỉ đã tách |
| K21 | CCCD / giấy tờ định danh | Chuỗi | 1, 183 | Mẫu | Không làm khóa bệnh nhân duy nhất khi chưa thống nhất nghiệp vụ |
| K22 | Nơi làm việc | Văn bản | 5 | Mẫu | Khác với nghề nghiệp |
| K23 | Đối tượng chi trả | Danh mục | 1, 5 | Mẫu | Nguồn có BHYT/thu phí/miễn/khác; có thể đổi theo dịch vụ |
| K24 | Số thẻ BHYT | Chuỗi | 1, 5 | Mẫu | Không dùng kiểu số; có thể có nhiều thẻ/lần hiệu lực |
| K25 | BHYT có giá trị từ ngày | Ngày | 5 | Mẫu | Ô có trong mẫu dù giá trị bị che |
| K26 | BHYT có giá trị đến ngày | Ngày | 1, 5 | Mẫu | Cần phân biệt thiếu thông tin với thẻ hết hạn |
| K27 | Tên người nhà cần báo tin | Văn bản, lặp theo người liên hệ | 1, 5 | Tách | Không tạo người bệnh mới chỉ vì tên xuất hiện ở đây |
| K28 | Địa chỉ người nhà cần báo tin | Văn bản | 1, 5 | Tách | Nguồn gộp tên và địa chỉ trong một nhãn; cần tách khi nhập |
| K29 | Điện thoại người nhà | Chuỗi | 1, 5 | Mẫu | Giữ đầu số/ký hiệu; không dùng kiểu số |
| K30 | Quan hệ với người bệnh | Danh mục/văn bản | 125, 149 | Mẫu | Trường bổ sung từ phiếu khác; không tự suy ra từ họ tên |

## 2. Tiếp nhận và đợt điều trị

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| K31 | Cơ sở khám chữa bệnh | Tham chiếu cơ sở | 1, 5 | Mẫu | Cơ sở cấp mã và thực hiện dịch vụ có thể khác nhau |
| K32 | Khoa | Tham chiếu đơn vị | 1, 5 | Mẫu | Khoa ở đầu phiếu không đại diện mọi thời điểm của đợt điều trị |
| K33 | Buồng/phòng | Tham chiếu vị trí | 7, 73 | Mẫu | Không trộn với phòng thực hiện xét nghiệm/siêu âm |
| K34 | Giường | Tham chiếu vị trí | 1, 7 | Mẫu | Có thể thay đổi; thuộc nội trú |
| K35 | Thời điểm đến khám | Ngày giờ | 5 | Mẫu | Khác thời gian in phiếu |
| K36 | Thời điểm vào viện | Ngày giờ | 1 | Mẫu | Định nghĩa khác/giống K35 cần xác nhận |
| K37 | Trực tiếp vào qua đâu | Danh mục | 1 | Mẫu | Cấp cứu/KKB/khoa điều trị là các lựa chọn nguồn |
| K38 | Tình trạng cấp cứu lúc tiếp nhận | Danh mục | 5 | Mẫu | Khác mức ưu tiên của từng chỉ định |
| K39 | Nơi giới thiệu | Danh mục và cơ sở liên quan | 1 | Mẫu | Nguồn có cơ quan y tế/tự đến/khác |
| K40 | Chẩn đoán của nơi giới thiệu | Văn bản và mã nếu có | 5 | Mẫu | Khác chẩn đoán sau khám |
| K41 | Vào viện do bệnh này lần thứ mấy | Số nguyên | 1 | Mẫu | Không đồng nghĩa tổng số lần khám của bệnh nhân |
| K42 | Khoa được cho vào điều trị | Tham chiếu khoa | 5 | Mẫu | Phân biệt với khoa đang in ở đầu phiếu |
| K43 | Thời điểm vào khoa | Ngày giờ, lặp | 1 | Mẫu | Từng lần vào/chuyển khoa là một sự kiện |
| K44 | Khoa chuyển đến | Tham chiếu khoa, lặp | 1 | Mẫu | Không ghi đè làm mất lịch sử vị trí |
| K45 | Thời điểm chuyển khoa | Ngày giờ, lặp | 1 | Mẫu | Liên kết với K44 |
| K46 | Số ngày điều trị tại khoa | Số nguyên hoặc giá trị báo cáo | 1 | Mẫu | Cách tính theo ngày/giờ phải được chốt |
| K47 | Loại chuyển viện | Danh mục | 1 | Mẫu | Tuyến trên/tuyến dưới/chuyên khoa trong nguồn |
| K48 | Cơ sở chuyển đến | Tham chiếu/văn bản | 1 | Mẫu | Không nhầm với khoa chuyển đến |
| K49 | Thời điểm ra viện | Ngày giờ | 1, 183 | Mẫu | Khác ngày lập giấy và ngày ký |
| K50 | Hình thức kết thúc đợt điều trị | Danh mục | 1 | Mẫu | Ra viện/xin về/bỏ về/hẹn khám/chuyển viện theo nguồn |
| K51 | Tổng số ngày điều trị | Số nguyên hoặc giá trị báo cáo | 1 | Mẫu | Chưa dùng làm công thức tự động |

## 3. Hỏi bệnh và khám

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| K52 | Lý do vào viện | Văn bản | 3, 5 | Mẫu | Không tự đồng nhất với tên chẩn đoán |
| K53 | Vào ngày thứ mấy của bệnh | Số nguyên, ngày | 3 | Mẫu | Khác ngày thứ mấy của đợt điều trị |
| K54 | Quá trình bệnh lý | Văn bản | 3, 5 | Mẫu | Lưu diễn biến/khởi phát/điều trị trước đó theo nội dung nguồn |
| K55 | Tiền sử bản thân | Văn bản | 3, 5 | Mẫu | Nếu tách bệnh nền thành danh mục cần chuyên môn xác nhận |
| K56 | Tiền sử gia đình | Văn bản | 3, 5 | Mẫu | Để trống không có nghĩa không có tiền sử |
| K57 | Loại đặc điểm liên quan bệnh | Danh mục, lặp | 3 | Mẫu | Dị ứng/ma túy/rượu bia/thuốc lá/thuốc lào/khác |
| K58 | Ký hiệu/trạng thái của đặc điểm | Giá trị theo quy ước nguồn | 3 | Mẫu | Nguồn ghi “ký hiệu”; chưa đủ để chốt Có/Không hoặc thuật ngữ dị ứng |
| K59 | Thời gian có đặc điểm | Số, tháng | 3 | Mẫu | Cần xác nhận cách tính và cách xử lý không biết |
| K60 | Khám toàn thân | Văn bản | 3, 5 | Mẫu | Khác các số đo sinh hiệu |
| K61 | Khám tuần hoàn | Văn bản | 3 | Mẫu | Không dùng đoạn này thay cho giá trị huyết áp |
| K62 | Khám hô hấp | Văn bản | 3 | Mẫu | - |
| K63 | Khám tiêu hóa | Văn bản | 3 | Mẫu | - |
| K64 | Khám thận, tiết niệu, sinh dục | Văn bản | 3 | Mẫu | Có thể tách khi chọn biểu mẫu chính thức |
| K65 | Khám thần kinh | Văn bản | 3 | Mẫu | Có điểm/số đo trong đoạn văn; không tự tạo mọi trường thang điểm từ một ví dụ |
| K66 | Khám cơ, xương, khớp | Văn bản | 3 | Mẫu | - |
| K67 | Khám tai, mũi, họng | Văn bản | 3 | Mẫu | - |
| K68 | Khám răng, hàm, mặt | Văn bản | 3 | Mẫu | - |
| K69 | Khám mắt | Văn bản | 3-4 | Mẫu | Nhãn ở trang 3, nội dung nối trang 4 |
| K70 | Khám nội tiết, dinh dưỡng và bệnh lý khác | Văn bản | 4 | Mẫu | - |
| K71 | Khám các bộ phận, dạng gộp | Văn bản | 5 | Mẫu | Không có các ô cơ quan riêng như trang 3 |
| K72 | Mạch | Số, lần/phút | 3, 5 | Mẫu | Lặp theo thời điểm đo; giới hạn nhập chờ duyệt |
| K73 | Nhiệt độ | Số thập phân, °C | 3, 5 | Mẫu | Lưu đơn vị; chưa suy phương pháp/vị trí đo |
| K74 | Huyết áp tâm thu | Số, mmHg | 3, 5 | Tách | Đề xuất tách từ cặp huyết áp của nguồn |
| K75 | Huyết áp tâm trương | Số, mmHg | 3, 5 | Tách | Cùng lần đo với K74 |
| K76 | Nhịp thở | Số, lần/phút | 3, 5 | Mẫu | Khác số điểm của thành phần MEWS |
| K77 | Cân nặng | Số thập phân, kg | 3, 5 | Mẫu | Cần thời điểm đo, không ghi đè mọi lần cân |
| K78 | Tóm tắt bệnh án/kết quả lâm sàng | Văn bản | 4, 5 | Mẫu | Bản tóm tắt khác dữ liệu gốc |
| K79 | Cận lâm sàng cần làm | Danh sách yêu cầu | 4 | Mẫu | Đây là đề nghị/chỉ định, không phải kết quả |
| K80 | Xử lý đã thực hiện trước nhập khoa | Văn bản hoặc sự kiện liên quan | 5 | Mẫu | Nguồn có ô; để trống không chứng minh chưa làm gì |

## 4. Chẩn đoán, kế hoạch và kết thúc điều trị

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| K81 | Chẩn đoán tại KKB/cấp cứu | Văn bản và mã, lặp | 1 | Mẫu | Giữ bối cảnh giai đoạn chẩn đoán |
| K82 | Chẩn đoán khi vào khoa điều trị | Văn bản và mã, lặp | 1, 4 | Mẫu | Có thể khác K81 |
| K83 | Bệnh chính | Văn bản và mã | 1, 4 | Mẫu | Giữ vai trò bệnh chính trong từng bối cảnh |
| K84 | Bệnh kèm theo | Văn bản và mã, lặp | 1, 4 | Mẫu | Không nhét nhiều bệnh vào một mã duy nhất |
| K85 | Chẩn đoán phân biệt | Văn bản hoặc danh sách | 4 | Mẫu | Không mặc định là chẩn đoán đã xác nhận |
| K86 | Chẩn đoán ra viện | Văn bản và mã, lặp | 1, 183 | Mẫu | Có bệnh chính và bệnh kèm theo |
| K87 | Mã chẩn đoán | Chuỗi mã | 1, 5 | Mẫu | Tách mã khỏi nhãn; cần hệ mã/phiên bản và giai đoạn |
| K88 | Có thủ thuật | Trạng thái theo mẫu | 1 | Mẫu | Nguồn có mục này; chi tiết thủ thuật nằm ở phiếu khác |
| K89 | Có phẫu thuật | Trạng thái theo mẫu | 1 | Mẫu | Không tự gộp với thủ thuật |
| K90 | Tai biến | Trạng thái/nội dung cần chốt | 1 | Mẫu | Ô trống không mặc định không có |
| K91 | Biến chứng | Trạng thái/nội dung cần chốt | 1 | Mẫu | Phân biệt với K90 |
| K92 | Tiên lượng | Văn bản/danh mục | 4 | Mẫu | Chưa đủ mẫu để chốt danh mục chính thức |
| K93 | Hướng điều trị | Văn bản | 4 | Mẫu | Khác đơn thuốc hoặc thuốc đã dùng |
| K94 | Kết quả điều trị | Danh mục | 2 | Mẫu | Khỏi/đỡ giảm/không thay đổi/nặng hơn/tử vong trong mẫu |
| K95 | Giải phẫu bệnh khi sinh thiết | Danh mục | 2 | Mẫu | Chỉ có bối cảnh phù hợp; không yêu cầu mọi lần khám |
| K96 | Nhóm nguyên nhân tử vong | Danh mục | 2 | Mẫu | Trường có điều kiện, không thuộc luồng khám thông thường |
| K97 | Trong/sau 24 giờ vào viện | Danh mục | 2 | Mẫu | Thuộc phần tử vong; cần chuyên môn xác nhận cách dùng |
| K98 | Nguyên nhân chính tử vong | Văn bản/mã | 2 | Mẫu | Trường có điều kiện |
| K99 | Khám nghiệm tử thi | Trạng thái theo mẫu | 2 | Mẫu | Trường có điều kiện |
| K100 | Chẩn đoán giải phẫu tử thi | Văn bản/mã | 2 | Mẫu | Trường có điều kiện |
| K101 | Ngày lập bệnh án/phiếu | Ngày hoặc ngày giờ đúng nguồn | 2, 4 | Mẫu | Không giả thêm giờ khi nguồn chỉ có ngày |
| K102 | Bác sĩ khám/làm bệnh án/điều trị | Tham chiếu người và vai trò | 2, 4, 5 | Mẫu | Các vai trò này không nhất thiết cùng một người |
| K103 | Người duyệt/lãnh đạo đơn vị | Tham chiếu người và vai trò | 2 | Mẫu | Phân biệt người nhập và người ký duyệt |
| K104 | Thời gian in | Ngày giờ | 5 | Mẫu | Thông tin xuất bản phiếu, không phải thời điểm khám |

**Các dòng trên là kiểm kê nền tảng, không phải 104 trường đều phải xuất hiện trên một màn hình.** Một số dòng là cùng một khái niệm ở các giai đoạn khác nhau; BE và người phụ trách metadata cần thống nhất cách tái sử dụng.

## Việc cần chốt trước khi cấu hình metadata

Thống nhất hệ thống cấp từng mã người bệnh/điều trị/vào viện; độ chính xác ngày sinh; cách ghi thông tin thiếu; các loại lượt và lần ghi nhận; đơn vị sinh hiệu; danh mục chẩn đoán và trạng thái dị ứng. Khám nội trú, chuyển khoa, tử vong và giải phẫu bệnh là các bối cảnh riêng, không tự đưa vào màn hình ngoại trú.
