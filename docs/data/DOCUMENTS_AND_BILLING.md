# Hội chẩn, cam kết, ra viện, viện phí và tài liệu

[Quay lại hướng dẫn chung](../DATA_DICTIONARY.md).

Nguồn: **S01**, PDF mẫu 195 trang; số trang là trang vật lý của tệp, tính từ 1. Ngày rà soát: **09/10/2026**. Trạng thái: **bản đặc tả để nhóm rà soát**, chưa chốt phạm vi triển khai hay quy tắc chuyên môn.

**Cơ sở:** `Mẫu` = nhãn/ô/chỉ số có trong nguồn; `Tách` = tách từ đoạn văn, ô gộp, đồ thị hoặc nhãn; `Đề xuất` = bổ sung cho hệ thống. Cơ sở này không phải trạng thái duyệt.

**Bắt buộc, danh mục chuẩn, giới hạn giá trị, thuật toán và quyền:** tất cả còn **CXT - cần xác nhận** nếu chưa có quyết định được ghi trong bảng bàn giao. Kiểu dữ liệu ở đây là dự kiến. Ô trống, bị che và không đọc được phải giữ khác nhau. Không chép giá trị người bệnh thật vào fixture hoặc tài liệu Git.

CO/CS/RS/SR/DC/SM mô tả giấy tờ nghiệp vụ; FI mô tả tài chính; DOC là metadata tài liệu dùng chung. Các mục in sẵn và vị trí ký không tự chứng minh người bệnh đã chọn, đã ký hoặc dịch vụ đã thực hiện.

Có **236 dòng đặc tả**; cùng khái niệm có thể được tái sử dụng, không phải từng dòng là một cột database.

- [CO - Hội chẩn](#co)
- [CS - Cam kết thủ thuật/phẫu thuật/gây mê](#cs)
- [RS - Bảng kiểm an toàn điện quang](#rs)
- [SR - Giấy khám/chữa bệnh theo yêu cầu](#sr)
- [DC - Giấy ra viện](#dc)
- [SM - Tóm tắt hồ sơ và tổng kết bệnh án](#sm)
- [FI - Tạm ứng, thanh toán và bảng kê viện phí](#fi)
- [DOC - Metadata tài liệu và dữ liệu trích từ PDF](#doc)

<a id="co"></a>

## CO - Hội chẩn

Trang nguồn: **110-114**. Một cuộc hội chẩn có một biên bản, nhiều người tham gia và có thể nhiều trang. Trang 111-112 là phần của cùng biên bản; không tạo hai sự kiện chỉ vì ngắt trang.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| CO001 | Loại hội chẩn | Danh mục và nhãn nguồn | 110-114 | Mẫu | Giữ nhãn cấp cứu/liên khoa/chuyên khoa theo từng phiếu |
| CO002 | Chủ đề/chuyên khoa hội chẩn | Văn bản hoặc tham chiếu | 110-114 | Mẫu | Giữ nội dung yêu cầu; không suy chuyên khoa chỉ từ người ký |
| CO003 | Điều trị từ ngày | Ngày | 110-114 | Mẫu | Khoảng điều trị in trong biên bản; không thay thời điểm bắt đầu hội chẩn |
| CO004 | Điều trị đến ngày | Ngày | 110-114 | Mẫu | Có thể chưa điền; phân biệt ngày lập và ngày kết thúc điều trị |
| CO005 | Thời điểm hội chẩn | Ngày hoặc ngày giờ | 110-114 | Mẫu | Giữ độ chính xác thực tế; một số bản chỉ ghi ngày |
| CO006 | Địa điểm hội chẩn | Văn bản/tham chiếu | 110-114 | Mẫu | Tách khỏi khoa của bệnh nhân |
| CO007 | Chẩn đoán tại hội chẩn | Văn bản và mã nếu có | 110-114 | Tách | Tái sử dụng cách lưu K81-K87, gắn bối cảnh hội chẩn |
| CO008 | Tóm tắt diễn biến bệnh | Văn bản | 110-114 | Mẫu | Nội dung có thể bao gồm khám, tiền sử và kết quả trước hội chẩn |
| CO009 | Họ tên người tham gia | Văn bản/tham chiếu, lặp | 110-114 | Tách | Mỗi thành viên là một dòng; không dùng tên làm khóa duy nhất |
| CO010 | Vai trò của người tham gia | Danh mục và nhãn nguồn, lặp | 110-114 | Tách | Chủ tọa/thư ký/thành viên theo nhãn nguồn |
| CO011 | Đơn vị của người tham gia | Văn bản/tham chiếu, lặp | 110-114 | Tách | Chỉ điền khi có bằng chứng; không suy từ chức danh |
| CO012 | Kết luận hội chẩn | Văn bản | 110-114 | Mẫu | Giữ bản gốc; chẩn đoán trong kết luận có thể khác chẩn đoán trước hội chẩn |
| CO013 | Hướng điều trị tiếp | Văn bản | 110-114 | Mẫu | Khác thuốc thực tế đã cấp hoặc đã dùng |
| CO014 | Yêu cầu theo dõi/hội chẩn lại | Văn bản | 110-114 | Tách | Tách từ kết luận khi cần, chưa tự tạo lịch hoặc cảnh báo |
| CO015 | Ngày lập biên bản | Ngày | 110-114 | Mẫu | Khác thời điểm diễn ra hội chẩn |
| CO016 | Người ký biên bản và vai trò | Danh sách người/vai trò | 110-114 | Mẫu | Phân biệt vị trí ký, tên in và dấu ký thấy trên nguồn |
| CO017 | Liên kết yêu cầu hội chẩn | Tham chiếu chỉ định | 110-114 | Đề xuất | BE chốt cách nối yêu cầu với biên bản; PDF chưa chứng minh mọi liên kết |

<a id="cs"></a>

## CS - Cam kết thủ thuật/phẫu thuật/gây mê

Trang nguồn: **124-125**. Một giấy gồm phần giải thích của bác sĩ và quyết định của người bệnh/thân nhân. Dấu chọn xác nhận nội dung tư vấn không chứng minh tai biến đó đã xảy ra.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| CS001 | Mức độ khẩn của thủ thuật | Danh mục theo dấu chọn | 124 | Mẫu | Cấp cứu/bán cấp/chương trình; bỏ trống là chưa xác định |
| CS002 | Tên bác sĩ | Văn bản/tham chiếu, lặp | 124-125 | Mẫu | Có nhiều người và vị trí ký khác nhau |
| CS003 | Chức danh bác sĩ | Văn bản/danh mục, lặp | 124 | Mẫu | Giữ nhãn nguồn; không mặc định chức danh là chuyên khoa |
| CS004 | Khoa của bác sĩ | Văn bản/tham chiếu, lặp | 124 | Mẫu | Khác khoa đang điều trị của người bệnh |
| CS005 | Vai trò bác sĩ | Danh mục, lặp | 124-125 | Tách | Chỉ định/thực hiện/gây mê theo phần và vị trí ký |
| CS006 | Chẩn đoán được tư vấn | Văn bản và mã nếu có | 124 | Tách | Nối bối cảnh cam kết; không sửa chẩn đoán gốc |
| CS007 | Đã giải thích chẩn đoán | Trạng thái checkbox | 124 | Mẫu | Ghi nhận dấu chọn của nội dung giải thích |
| CS008 | Đã giải thích lý do thực hiện | Trạng thái checkbox | 124 | Mẫu | Không mặc định đoạn lý do đã có nội dung đầy đủ |
| CS009 | Đã giải thích nguy cơ nếu không thực hiện | Trạng thái checkbox | 124 | Mẫu | Là nội dung tư vấn |
| CS010 | Đã giải thích kết quả dự kiến | Trạng thái checkbox | 124 | Mẫu | Không phải kết quả sau thủ thuật |
| CS011 | Phương pháp phẫu thuật/thủ thuật dự kiến | Danh sách lựa chọn | 124 | Mẫu | Mở/nội soi/thủ thuật/khác, giữ các ô thực tế được chọn |
| CS012 | Phương pháp khác - mô tả | Văn bản | 124 | Mẫu | Không mất phần tự ghi kèm ô khác |
| CS013 | Phương pháp gây mê dự kiến | Danh sách lựa chọn | 124 | Mẫu | Giữ các lựa chọn gây mê/gây tê in trên mẫu; chưa chốt danh mục sản phẩm |
| CS014 | Gây mê khác - mô tả | Văn bản | 124 | Mẫu | Ô khác có nội dung riêng |
| CS015 | Có phương pháp điều trị khác | Trạng thái checkbox | 124 | Mẫu | Có/Không/Chưa trả lời; cần xem hình gốc |
| CS016 | Phương pháp điều trị khác - chi tiết | Văn bản | 124 | Mẫu | Đi kèm lựa chọn Có nếu được ghi |
| CS017 | Đã tư vấn nguy cơ phản ứng thuốc | Trạng thái checkbox | 124 | Mẫu | Không dùng làm chẩn đoán dị ứng |
| CS018 | Đã tư vấn nguy cơ suy hô hấp/tuần hoàn | Trạng thái checkbox | 124 | Mẫu | Nguồn gộp hai nguy cơ trong một nhãn |
| CS019 | Đã tư vấn nguy cơ chảy máu | Trạng thái checkbox | 124 | Mẫu | Không phải biến cố thực tế |
| CS020 | Đã tư vấn nguy cơ nhiễm trùng | Trạng thái checkbox | 124 | Mẫu | Không phải kết quả xét nghiệm |
| CS021 | Đã tư vấn nguy cơ tử vong | Trạng thái checkbox | 124 | Mẫu | Không phải tình trạng tử vong |
| CS022 | Đã tư vấn nguy cơ khác | Trạng thái checkbox | 124 | Mẫu | Giữ phần văn bản bổ sung nếu có |
| CS023 | Nguy cơ khác - chi tiết | Văn bản | 124 | Mẫu | Không tự điền các nguy cơ thường gặp |
| CS024 | Họ tên người bệnh | Tham chiếu K04 và bản ghi nguồn | 125 | Mẫu | Tên trên giấy thuộc ngữ cảnh ký cam kết |
| CS025 | Năm sinh/ngày sinh người bệnh | Giá trị nguồn và độ chính xác | 125 | Mẫu | Nhãn ghi năm sinh nhưng có bản in đầy đủ ngày; không ép mất phần ngày |
| CS026 | Họ tên thân nhân | Văn bản/tham chiếu | 125 | Mẫu | Có thể là người đại diện ký |
| CS027 | Năm sinh thân nhân | Năm hoặc giá trị nguồn | 125 | Mẫu | Không tự bổ sung ngày sinh |
| CS028 | Quan hệ với người bệnh | Danh mục/văn bản | 125 | Mẫu | Tái sử dụng K30 |
| CS029 | Quyết định đồng ý/không đồng ý | Văn bản tự viết và trạng thái xác minh | 125 | Mẫu | Các câu in sẵn là hướng dẫn; dòng tự viết trống không chứng minh đã đồng ý |
| CS030 | Ngày ghi cam kết | Ngày | 125 | Mẫu | Không dùng ngày ký bác sĩ thay ngày quyết định nếu chưa chứng minh |
| CS031 | Người bệnh/thân nhân ký | Người, vai trò và bằng chứng ký | 125 | Mẫu | Phải xác định người ký; ảnh chữ ký không tự thành chữ ký điện tử hợp lệ |
| CS032 | Bác sĩ chỉ định ký | Người và bằng chứng ký | 125 | Mẫu | Tách với người thực hiện |
| CS033 | Bác sĩ thực hiện ký | Người và bằng chứng ký | 125 | Mẫu | Không gộp vị trí ký còn trống |
| CS034 | Bác sĩ gây mê ký | Người và bằng chứng ký | 125 | Mẫu | Có thể chưa điền |
| CS035 | Liên kết thủ thuật được chấp thuận | Tham chiếu chỉ định/thủ thuật | 124-125 | Đề xuất | Nhóm chốt phạm vi áp dụng và quy tắc phiên bản giấy cam kết |

<a id="rs"></a>

## RS - Bảng kiểm an toàn điện quang

Trang nguồn: **126-127**. Một bảng kiểm cho một bối cảnh yêu cầu/thực hiện. Hai bản không tự thay thế nhau. Mỗi câu giữ Có/Không/Chưa trả lời/Không đọc được; không suy đáp án từ việc trích xuất được chữ Có hoặc Không.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| RS001 | Thai/có thể có thai/cho con bú | Trạng thái câu hỏi gộp | 126-127 | Mẫu | Nhãn nguồn gộp ba nội dung; tách thành ba câu cần mentor duyệt |
| RS002 | Đã từng tiêm thuốc cản quang/đối quang | Trạng thái câu hỏi | 126-127 | Mẫu | Không suy từ việc có chỉ định CT |
| RS003 | Tiền sử dị ứng cản quang/đối quang | Trạng thái câu hỏi | 126-127 | Mẫu | Khác với dị ứng thuốc nói chung |
| RS004 | Tiền sử dị ứng thuốc | Trạng thái câu hỏi | 126-127 | Mẫu | Giữ câu trả lời và mức chắc chắn |
| RS005 | Tên thuốc gây dị ứng | Văn bản | 126-127 | Mẫu | Chỉ lấy nội dung được ghi, không lấy ví dụ in sẵn |
| RS006 | Dị ứng thức ăn/côn trùng | Trạng thái câu hỏi gộp | 126-127 | Mẫu | Nguồn gộp; không tự phân biệt tác nhân nếu chưa ghi |
| RS007 | Chi tiết dị ứng thức ăn/côn trùng | Văn bản | 126-127 | Tách | Chỉ tách khi có phần viết thêm |
| RS008 | Hen phế quản/viêm mũi dị ứng | Trạng thái câu hỏi gộp | 126-127 | Mẫu | Chưa đủ để tạo hai chẩn đoán |
| RS009 | Đã điều trị dị ứng khác | Trạng thái câu hỏi | 126-127 | Mẫu | Chưa có danh mục loại dị ứng đầy đủ |
| RS010 | Bệnh tim mạch | Trạng thái câu hỏi | 126-127 | Mẫu | Tên bệnh trong ngoặc là ví dụ của câu hỏi, không phải bệnh đã xác nhận |
| RS011 | Bệnh thận | Trạng thái câu hỏi | 126-127 | Mẫu | Khác kết quả creatinine/eGFR |
| RS012 | Đang dùng nhóm thuốc điều trị tiểu đường được hỏi | Trạng thái câu hỏi | 126-127 | Mẫu | Tên thuốc in trong câu hỏi là ví dụ; không chứng minh đã dùng |
| RS013 | Đã từng chụp MRI | Trạng thái câu hỏi | 126-127 | Mẫu | Thuộc phần riêng cho MRI |
| RS014 | Đã phẫu thuật có cấy ghép | Trạng thái câu hỏi | 126-127 | Mẫu | Giữ câu chữ nguồn; không tự sửa thuật ngữ cấy ghép |
| RS015 | Máy tạo nhịp/thiết bị điện tử cấy ghép | Trạng thái câu hỏi gộp | 126-127 | Mẫu | Nguồn liệt kê nhiều thiết bị trong một câu |
| RS016 | Kẹp mạch/stent/răng giả | Trạng thái câu hỏi gộp | 126-127 | Mẫu | Chưa phân biệt loại, vị trí và điều kiện sử dụng MRI |
| RS017 | Dị vật kim loại | Trạng thái câu hỏi | 126-127 | Mẫu | Không suy vị trí dị vật từ lựa chọn Có |
| RS018 | Quyết định chụp có tiêm thuốc | Văn bản và trạng thái xác minh | 126-127 | Mẫu | Dòng đồng ý/không đồng ý cần người bệnh/thân nhân điền |
| RS019 | Người bệnh/thân nhân ký | Người, vai trò, bằng chứng ký | 126-127 | Mẫu | Không tự coi tên liên hệ là người ký |
| RS020 | Bác sĩ chỉ định ký | Người và bằng chứng ký | 126-127 | Mẫu | Tách tên in, dấu ký và thời điểm nếu có |
| RS021 | Liên kết chỉ định điện quang | Tham chiếu yêu cầu | 126-127 | Đề xuất | BE cần đối chiếu mã bệnh nhân, mã điều trị, thời điểm |
| RS022 | Phiên bản bảng kiểm | Tham chiếu phiên bản biểu mẫu | 126-127 | Đề xuất | Mã mẫu in sẵn là metadata, chưa xác nhận quy trình hiện hành |

<a id="sr"></a>

## SR - Giấy khám/chữa bệnh theo yêu cầu

Trang nguồn: **149-150**. Lưu mỗi bản giấy và trạng thái xác minh; không tự tạo hai giao dịch dịch vụ vì có hai trang cùng mẫu.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| SR001 | Nơi nhận đề nghị | Văn bản/tham chiếu cơ sở | 149-150 | Mẫu | Giữ cơ sở được ghi trong giấy |
| SR002 | Người làm đề nghị | Văn bản/tham chiếu | 149-150 | Mẫu | Có thể là người bệnh hoặc đại diện |
| SR003 | Nhãn tuổi và giá trị in tại ô | Giá trị nguồn | 149-150 | Mẫu | Ô ghi Tuổi nhưng in dạng ngày sinh; không ép thành số tuổi |
| SR004 | Loại giấy tờ định danh | Danh mục/văn bản | 149-150 | Mẫu | CCCD/hộ chiếu theo nhãn nguồn |
| SR005 | Số giấy tờ | Chuỗi | 149-150 | Mẫu | Không dùng số nguyên hoặc làm khóa duy nhất |
| SR006 | Ngày cấp giấy tờ | Ngày hoặc thiếu thông tin | 149-150 | Mẫu | Nguồn có ô, có thể bỏ trống |
| SR007 | Nơi cấp giấy tờ | Văn bản/danh mục | 149-150 | Mẫu | Không tự bổ sung |
| SR008 | Người bệnh được đại diện | Văn bản/tham chiếu | 149-150 | Mẫu | Quan hệ người đề nghị - người bệnh phải được xác minh |
| SR009 | Người liên hệ và quan hệ | Tham chiếu K27-K30 | 149-150 | Mẫu | Tái sử dụng cấu trúc người liên hệ, giữ bản nguồn |
| SR010 | Cơ sở đang khám/chữa bệnh | Văn bản/tham chiếu | 149-150 | Mẫu | Khác nơi nhận nếu có nhiều cơ sở |
| SR011 | Yêu cầu bác sĩ khám/điều trị/chăm sóc | Văn bản hoặc trạng thái theo nguồn | 149-150 | Mẫu | Đoạn cam kết liệt kê dịch vụ; không mặc định mọi dịch vụ được đặt |
| SR012 | Yêu cầu điều dưỡng tại giường | Văn bản hoặc trạng thái theo nguồn | 149-150 | Mẫu | Không phải bản ghi thực hiện chăm sóc |
| SR013 | Yêu cầu dùng thuốc theo chỉ định | Văn bản cam kết | 149-150 | Mẫu | Không tạo đơn thuốc từ câu in sẵn |
| SR014 | Loại buồng theo yêu cầu | Văn bản/danh mục | 149-150 | Mẫu | Lấy nội dung tự điền; bỏ trống không phải buồng mặc định |
| SR015 | Tiện nghi buồng theo yêu cầu | Danh sách/văn bản | 149-150 | Mẫu | Tiện nghi được nêu trong mẫu chưa đủ chứng minh lựa chọn thực tế |
| SR016 | Tiền đề nghị ứng trước | Số thập phân, đồng | 149-150 | Mẫu | Ô đề nghị khác giao dịch tạm ứng đã thu |
| SR017 | Tiền ứng trước bằng chữ | Văn bản | 149-150 | Mẫu | Giữ bản in/tự viết, đối chiếu khi đã có số |
| SR018 | Ngày làm giấy | Ngày và phần ngày nguồn | 149-150 | Mẫu | Năm in sẵn cần xác minh; không tự dùng làm ngày giao dịch |
| SR019 | Lãnh đạo đơn vị duyệt | Người và bằng chứng ký | 149-150 | Mẫu | Tách thời điểm duyệt nếu được ghi |
| SR020 | Người bệnh/đại diện ký | Người, vai trò, bằng chứng ký | 149-150 | Mẫu | Xác minh quan hệ đại diện |
| SR021 | Người bệnh ký | Người và bằng chứng ký | 149-150 | Mẫu | Nguồn có thêm vị trí này; không tự gộp hai ô ký |
| SR022 | Liên kết dịch vụ theo yêu cầu | Danh sách yêu cầu dịch vụ | 149-150 | Đề xuất | Chỉ tạo sau khi có yêu cầu cụ thể và quy tắc nhóm thống nhất |

<a id="dc"></a>

## DC - Giấy ra viện

Trang nguồn: **183**. Một giấy thuộc một đợt điều trị, có số giấy và ngày cấp. Trường người bệnh, vào/ra viện và chẩn đoán dùng lại K01-K30, K36/K49, K83-K87 nhưng vẫn giữ nội dung trên giấy.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| DC001 | Số giấy ra viện | Chuỗi | 183 | Mẫu | Giữ dấu phân cách/số 0 đầu |
| DC002 | Số lưu trữ | Chuỗi | 183 | Mẫu | Khác số giấy và mã người bệnh |
| DC003 | Mã/phiên bản mẫu | Chuỗi metadata | 183 | Mẫu | Không coi mã mẫu là mã hồ sơ |
| DC004 | Mã BHXH/thẻ BHYT tại ô gộp | Chuỗi và nhãn nguồn | 183 | Mẫu | Chưa tự quyết định là cùng một loại mã |
| DC005 | Loại giấy tờ tùy thân | Danh mục/văn bản | 183 | Mẫu | Theo nhãn/lựa chọn nguồn |
| DC006 | Số giấy tờ tùy thân | Chuỗi | 183 | Mẫu | Tái sử dụng K21 kèm loại |
| DC007 | Ngày cấp giấy tờ | Ngày | 183 | Mẫu | Ô có thể chưa ghi |
| DC008 | Phương pháp điều trị | Văn bản | 183 | Mẫu | Tóm tắt trên giấy khác bản ghi thuốc/thủ thuật chi tiết |
| DC009 | Lời dặn | Văn bản | 183 | Mẫu | Có thể liên quan thuốc, sinh hoạt hoặc tái khám; chưa tự biến thành lịch |
| DC010 | Ngày cấp giấy ra viện | Ngày | 183 | Mẫu | Khác thời điểm kết thúc điều trị |
| DC011 | Đại diện cơ sở ký | Người/vai trò/bằng chứng ký | 183 | Mẫu | Giữ tên in và dấu ký |
| DC012 | Bác sĩ điều trị ký | Người/vai trò/bằng chứng ký | 183 | Mẫu | Khác đại diện cơ sở |
| DC013 | QR hướng dẫn ứng dụng/khảo sát | Tham chiếu tệp hoặc loại mã | 183 | Mẫu | Metadata tài liệu; không lưu làm kết quả lâm sàng |
| DC014 | Liên kết bản giấy được cấp | Tham chiếu phiên bản tài liệu | 183 | Đề xuất | BE chốt cách quản lý cấp lại/bổ sung |

<a id="sm"></a>

## SM - Tóm tắt hồ sơ và tổng kết bệnh án

Trang nguồn: **191-195**. Trang 191-192 và 193-194 là hai bản riêng; trang 195 là tổng kết/giao nhận. Không ghi đè dữ liệu gốc từ văn bản tóm tắt hoặc tự quyết định bản nào có hiệu lực.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| SM001 | Số bản tóm tắt | Chuỗi | 191-194 | Mẫu | Giữ số nguồn, không tự coi là mã bệnh nhân |
| SM002 | Mã mẫu/phiên bản in trên tóm tắt | Chuỗi metadata | 191-194 | Mẫu | Không kết luận mẫu hiện hành chỉ từ mã in |
| SM003 | Chẩn đoán lúc vào viện | Danh sách tên/mã/vai trò | 191-194 | Tách | Tái sử dụng K81-K87 với bối cảnh bản tóm tắt |
| SM004 | Chẩn đoán lúc ra viện | Danh sách tên/mã/vai trò | 191-194 | Tách | Không lấy mã cuối ghi đè mọi giai đoạn |
| SM005 | Lý do vào viện | Văn bản | 191-194 | Mẫu | Tham chiếu K52, giữ bản được tóm tắt |
| SM006 | Quá trình bệnh lý và diễn biến lâm sàng | Văn bản | 191-195 | Mẫu | Không tự coi là các ghi chép theo thời gian đã đầy đủ |
| SM007 | Tiền sử bệnh | Văn bản | 191-194 | Mẫu | Giữ nội dung, chưa tự tách thành chẩn đoán có xác nhận |
| SM008 | Dấu hiệu lâm sàng chính | Văn bản | 191-194 | Mẫu | Các số đo trong đoạn văn cần bối cảnh trước khi cấu trúc hóa |
| SM009 | Tóm tắt kết quả cận lâm sàng | Văn bản | 192, 194-195 | Mẫu | Có xung đột đơn vị với phiếu gốc; không ghi đè kết quả gốc |
| SM010 | Điều trị nội khoa - lựa chọn | Trạng thái nguồn | 192, 194 | Mẫu | Dấu chọn khác nội dung điều trị |
| SM011 | Điều trị nội khoa - nội dung | Văn bản | 192, 194 | Mẫu | Không tạo thuốc đã thực hiện từ tóm tắt |
| SM012 | Phẫu thuật/thủ thuật - lựa chọn | Trạng thái nguồn | 192, 194 | Mẫu | Giữ từng nhãn nếu nguồn có |
| SM013 | Phẫu thuật/thủ thuật - nội dung | Văn bản | 192, 194-195 | Mẫu | Nối bản thủ thuật khi xác minh được |
| SM014 | Tình trạng/kết quả ra viện | Danh mục và văn bản nguồn | 192, 194-195 | Mẫu | Các lựa chọn trên tóm tắt có thể khác K94; không tự gộp danh mục |
| SM015 | Hướng điều trị và chế độ tiếp theo | Văn bản | 192, 194-195 | Mẫu | Chưa tự thành quy tắc kê thuốc hay theo dõi |
| SM016 | Glasgow trong đoạn tóm tắt | Điểm và bối cảnh thời điểm | 191, 193, 195 | Tách | Chỉ cấu trúc khi đọc rõ điểm và thời điểm, không thay lần đánh giá khác |
| SM017 | NIHSS trong đoạn tóm tắt | Điểm và bối cảnh thời điểm | 193, 195 | Tách | Phải giữ thang điểm, trạng thái xác minh và phiên bản chờ duyệt |
| SM018 | mRS trong đoạn tóm tắt | Điểm và bối cảnh thời điểm | 193, 195 | Tách | Không tính lại từ diễn biến hoặc sức cơ |
| SM019 | Ngày lập bản tóm tắt/tổng kết | Ngày hoặc ngày giờ | 192, 194-195 | Mẫu | Giữ thời điểm in, lập và ký riêng; bản khác có thể khác thời điểm |
| SM020 | Người ký và vai trò | Danh sách người/vai trò/bằng chứng ký | 192, 194-195 | Mẫu | Không suy người tạo từ người ký |
| SM021 | Loại tài liệu giao nhận | Danh mục, lặp | 195 | Mẫu | X-quang/CT/siêu âm/xét nghiệm/khác theo bảng nguồn |
| SM022 | Số tờ theo loại | Số nguyên và nhãn nguồn, lặp | 195 | Mẫu | Khác số trang PDF, không tự quy đổi |
| SM023 | Tổng số tờ hồ sơ | Số nguyên nguồn | 195 | Mẫu | Tổng 117 tờ in trên giấy không đồng nghĩa PDF phải có 117 trang |
| SM024 | Người giao hồ sơ | Văn bản/tham chiếu/bằng chứng ký | 195 | Mẫu | Không lấy bác sĩ điều trị thay thế |
| SM025 | Người nhận hồ sơ | Văn bản/tham chiếu/bằng chứng ký | 195 | Mẫu | Không tự mặc định người nhận là bệnh nhân |
| SM026 | Quan hệ bản tóm tắt bổ sung/thay thế | Tham chiếu tài liệu và trạng thái | 191-194 | Đề xuất | Cần mentor xác định; chỉ khác nội dung chưa chứng minh đã thay thế |

<a id="fi"></a>

## FI - Tạm ứng, thanh toán và bảng kê viện phí

Trang nguồn: **147, 184-190**. Tách giao dịch thu/hoàn tiền, phiếu thanh toán, dòng chi phí và bản in. Liên 1/liên 2 là bản của tài liệu; một dòng thuốc/vật tư trong bảng kê chưa chứng minh đã sử dụng. Bản scan 187 cần đối chiếu bản 186 trước khi liên kết.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| FI001 | Loại chứng từ | Danh mục và nhãn nguồn | 147, 184-190 | Mẫu | Tạm ứng/thanh toán/bảng kê/thống kê khoa |
| FI002 | Quyển sổ thu/tạm ứng | Chuỗi | 147, 184-185 | Mẫu | Một phiếu có thể tham chiếu nhiều quyển sổ |
| FI003 | Số chứng từ | Chuỗi | 147, 184-185 | Mẫu | Không dùng số nguyên hoặc coi là duy nhất mọi cơ sở |
| FI004 | Mã giao dịch | Chuỗi | 147, 184-185 | Mẫu | Giữ mã của giao dịch, không trộn mã điều trị |
| FI005 | Mã vạch trên chứng từ | Giá trị nguồn và loại mã | 147, 184-185 | Mẫu | Đối chiếu nội dung mã; có thể mã hóa mã điều trị |
| FI006 | Loại liên | Danh mục/văn bản | 147, 184-185 | Mẫu | Liên lưu/giao người mua; tránh tạo thêm lần thu |
| FI007 | Số lần in | Số nguyên nguồn | 147 | Mẫu | Metadata bản in, không phải số lần thu |
| FI008 | Ngày giờ thu/lập chứng từ | Ngày hoặc ngày giờ | 147, 184-185 | Mẫu | Không dùng thời gian in thay thời điểm thu khi khác |
| FI009 | Hình thức/sổ thu liên quan QR | Nhãn nguồn | 147 | Mẫu | Tên sổ có QR chưa đủ chứng minh phương thức giao dịch thực tế |
| FI010 | Phân loại tạm ứng/ký quỹ | Nhãn nguồn | 147, 184-185 | Tách | Giữ loại giao dịch và mô tả gốc |
| FI011 | Lý do/nội dung thu | Văn bản | 147 | Mẫu | Khác chẩn đoán |
| FI012 | Số tiền thu | Số thập phân, đồng | 147 | Mẫu | Giá trị tiền của chứng từ; không tính thành tổng điều trị |
| FI013 | Số tiền bằng chữ | Văn bản | 147, 186-190 | Mẫu | Giữ để đối chiếu, không dùng thay kiểu số |
| FI014 | Nợ/Có tài khoản | Chuỗi hoặc chưa điền | 147 | Mẫu | Ô của chứng từ kế toán, không tự xác định tài khoản |
| FI015 | Người nộp tiền | Văn bản/tham chiếu/bằng chứng ký | 147, 184-185 | Mẫu | Có thể khác người bệnh |
| FI016 | Điện thoại người nộp | Chuỗi | 184-185 | Mẫu | Ô có thể bỏ trống; không bổ sung từ người nhà |
| FI017 | Quan hệ người nộp với bệnh nhân | Danh mục/văn bản | 184-185 | Mẫu | Không suy từ họ tên |
| FI018 | Người thu/lập bảng kê | Người và vai trò | 147, 184-190 | Mẫu | Tách các vai trò, tên in và dấu ký |
| FI019 | Mã số thuế | Chuỗi | 184-185 | Mẫu | Thuộc thông tin hóa đơn/chứng từ, không phải CCCD |
| FI020 | Tên đơn vị xuất thông tin thanh toán | Văn bản | 184-185 | Mẫu | Theo phần hành chính chứng từ |
| FI021 | Mã khu vực K1/K2/K3 | Chuỗi/danh mục | 186-190 | Mẫu | Giữ nhãn nguồn; nghiệp vụ BHYT cần xác nhận |
| FI022 | Mức hưởng BHYT | Số thập phân, % | 184-190 | Mẫu | Khác tỷ lệ thanh toán của từng dịch vụ |
| FI023 | Nơi đăng ký KCB ban đầu | Tham chiếu cơ sở và nhãn | 186-190 | Mẫu | Khác cơ sở đang điều trị |
| FI024 | Mã nơi đăng ký KCB ban đầu | Chuỗi | 186-190 | Mẫu | Có hệ mã riêng, giữ số 0 đầu |
| FI025 | Thời điểm đủ 5 năm liên tục | Ngày | 186-190 | Mẫu | Không tự tính từ một thẻ hiện tại |
| FI026 | Ngày miễn cùng chi trả | Ngày hoặc chưa ghi | 186-190 | Mẫu | Không tự suy từ mức hưởng |
| FI027 | Cấp cứu - dấu trên bảng kê | Trạng thái checkbox | 186-190 | Mẫu | Tái sử dụng ngữ cảnh tiếp nhận, giữ dấu nguồn |
| FI028 | Đúng tuyến | Trạng thái checkbox | 186-190 | Mẫu | Không suy từ tên nơi chuyển đến |
| FI029 | Thông tuyến | Trạng thái checkbox | 186-190 | Mẫu | Không gộp với đúng tuyến khi chưa xác nhận |
| FI030 | Trái tuyến | Trạng thái checkbox | 186-190 | Mẫu | Bỏ trống không tự coi là Không |
| FI031 | Nơi chuyển đến từ | Văn bản/tham chiếu | 186-190 | Mẫu | Giữ cơ sở giới thiệu theo chứng từ |
| FI032 | Nơi chuyển đi | Văn bản/tham chiếu | 188-190 | Mẫu | Khác nơi chuyển đến từ |
| FI033 | Tình trạng ra viện - mã trên bảng kê | Chuỗi mã và nhãn gốc | 188 | Mẫu | Chưa suy enum từ một mã số |
| FI034 | Khoảng ngày tính chi phí - từ | Ngày | 188-190 | Mẫu | Khác ngày thực hiện từng dịch vụ |
| FI035 | Khoảng ngày tính chi phí - đến | Ngày | 188-190 | Mẫu | Không tự tính khoảng điều trị từ bảng kê |
| FI036 | Tên phẫu thuật/thủ thuật của gói chi phí | Văn bản/tham chiếu | 186-187 | Mẫu | Chỉ là mục bảng kê; nối biên bản khi xác minh |
| FI037 | Phòng thực hiện thủ thuật | Văn bản/tham chiếu | 186-187 | Mẫu | Khác buồng bệnh |
| FI038 | Ngày thực hiện thủ thuật trên bảng kê | Ngày | 186-187 | Mẫu | Không tự thêm giờ |
| FI039 | Đơn giá thủ thuật trên bảng kê | Số thập phân, đồng | 186-187 | Mẫu | Khác tổng vật tư trong gói |
| FI040 | Nhóm chi phí | Nhãn nguồn và mã nếu có | 184-190 | Mẫu | Giường/xét nghiệm/thuốc/vật tư/suất ăn…; phân biệt nhóm với dòng |
| FI041 | Dòng chi phí trong/ngoài gói | Nhãn nguồn | 186-187 | Mẫu | Giữ cấu trúc nhóm trong gói phẫu thuật nếu có |
| FI042 | Tên khoản mục/dịch vụ | Văn bản | 186-190 | Mẫu | Có thể chứa kích thước/hàm lượng; giữ toàn bộ nhãn |
| FI043 | Đơn vị tính khoản mục | Chuỗi/danh mục | 186-190 | Mẫu | Lần/ngày/cái/viên/suất…; không tự quy đổi |
| FI044 | Số lượng khoản mục | Số thập phân | 186-190 | Mẫu | Khác số lần thực hiện đã xác minh |
| FI045 | Đơn giá bệnh viện | Số thập phân, đồng | 186-190 | Mẫu | Khác đơn giá bảo hiểm |
| FI046 | Đơn giá bảo hiểm | Số thập phân, đồng | 186-190 | Mẫu | Giá 0 không chứng minh chưa thực hiện dịch vụ |
| FI047 | Tỷ lệ thanh toán theo dịch vụ | Số thập phân, % | 186-190 | Mẫu | Theo cột in trên nguồn; quy tắc tính chờ chốt |
| FI048 | Thành tiền bệnh viện | Số thập phân, đồng | 186-190 | Mẫu | Giữ giá trị báo cáo; kết quả tính lại lưu riêng |
| FI049 | Tỷ lệ thanh toán BHYT | Số thập phân và đơn vị nhãn nguồn | 186-190 | Mẫu | Nhãn có chỗ in đồng dù số mang dạng tỷ lệ; cần xác minh, không tự chuẩn hóa |
| FI050 | Thành tiền bảo hiểm | Số thập phân, đồng | 186-190 | Mẫu | Khác số quỹ BHYT chi thực tế |
| FI051 | Quỹ BHYT thanh toán | Số thập phân, đồng | 184-190 | Mẫu | Theo dòng/nhóm/tổng, giữ phạm vi tính |
| FI052 | Người bệnh cùng chi trả | Số thập phân, đồng | 184-190 | Mẫu | Khác ngoài danh mục/tự trả |
| FI053 | Nguồn khác thanh toán | Số thập phân, đồng | 184-190 | Mẫu | Không gộp với miễn giảm |
| FI054 | Người bệnh tự trả/ngoài danh mục | Số thập phân, đồng và nhãn | 184-190 | Mẫu | Hai nhãn xuất hiện ở các mẫu; ánh xạ cần nghiệp vụ xác nhận |
| FI055 | Tổng theo nhóm/cột | Số thập phân, đồng, phạm vi tổng | 184-190 | Tách | Không cộng nhóm và dòng lần nữa |
| FI056 | Tổng chi phí cả lần khám/đợt điều trị | Số thập phân, đồng | 188-190 | Mẫu | Phân biệt tổng bệnh viện với phần bệnh nhân phải trả |
| FI057 | Tổng người bệnh phải trả | Số thập phân, đồng | 184-190 | Mẫu | Theo chứng từ; chưa tự tính từ công thức in |
| FI058 | Tổng tạm ứng đã thu | Số thập phân, đồng | 184-185, 190 | Mẫu | Có danh sách giao dịch thành phần; tránh thu trùng |
| FI059 | Ngày giờ giao dịch tạm ứng thành phần | Ngày giờ, lặp | 184-185 | Tách | Mỗi dòng có thể có mã giao dịch và loại ký quỹ |
| FI060 | Mã giao dịch tạm ứng thành phần | Chuỗi, lặp | 184-185 | Tách | Liên kết giao dịch đã có, không tạo mới nếu trùng |
| FI061 | Số tiền tạm ứng thành phần | Số thập phân, đồng, lặp | 184-185 | Tách | Đối chiếu tổng; không ghi đè tiền trên phiếu gốc |
| FI062 | Tổng tiền đã nhận lại/hoàn ứng | Số thập phân, đồng | 184-185, 190 | Mẫu | Lưu ý nhãn và chiều dòng tiền |
| FI063 | Miễn giảm | Số thập phân, đồng | 184-185 | Mẫu | Khác nguồn bảo hiểm trả |
| FI064 | Bảo lãnh viện phí | Số thập phân, đồng hoặc chưa ghi | 184-185 | Mẫu | Ô trống không mặc định 0 |
| FI065 | Tiền còn phải nộp | Số thập phân, đồng | 184-185, 190 | Mẫu | Giữ số nguồn; công thức dòng D cần xác minh V07 |
| FI066 | Công thức thanh toán in trên giấy | Văn bản metadata | 184-185 | Mẫu | Chưa dùng làm công thức tự động |
| FI067 | Kế toán viện phí ký | Người/vai trò/bằng chứng ký | 186-190 | Mẫu | Tách người lập, kế toán, bác sĩ |
| FI068 | Bác sĩ điều trị ký bảng kê | Người/vai trò/bằng chứng ký | 186-187 | Mẫu | Không thay chữ ký lâm sàng ở phiếu khác |
| FI069 | Người bệnh xác nhận bảng kê | Người/vai trò/bằng chứng ký | 186-190 | Mẫu | Có thêm chỗ xác nhận nhận phim; giữ riêng |
| FI070 | Giám định BHYT ký | Người/vai trò/bằng chứng ký | 190 | Mẫu | Không suy trạng thái duyệt từ tên vị trí ký |
| FI071 | Số phim người bệnh đã nhận | Số và loại phim | 190 | Mẫu | Theo lời xác nhận, không lấy số tờ giao nhận 195 |
| FI072 | Mã tra cứu hóa đơn/QR | Chuỗi và loại mã | 184-185 | Mẫu | Metadata tài chính, không dùng làm mã hồ sơ duy nhất |
| FI073 | Thời gian in | Ngày giờ | 147, 184-190 | Mẫu | Khác thời điểm thu/kết toán |
| FI074 | Người in | Người/tài khoản và nhãn nguồn | 147, 184-190 | Mẫu | Có thể khác người lập |
| FI075 | Máy in/máy trạm | Chuỗi metadata | 147, 186 | Mẫu | Không chuyển thành dữ liệu bệnh nhân |
| FI076 | Công thức đối soát được duyệt | Quy tắc và phiên bản | 147, 184-190 | Đề xuất | Chỉ triển khai sau khi xác nhận ý nghĩa cột, nguồn và làm tròn |

<a id="doc"></a>

## DOC - Metadata tài liệu và dữ liệu trích từ PDF

Trang nguồn: **1-195**. Các dòng Đề xuất dưới đây phục vụ truy vết và làm việc với BE; chưa phải những cột bắt buộc do mentor duyệt. Tệp gốc riêng tư, ảnh/đồ thị/chữ ký chỉ tham chiếu theo quyền truy cập.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| DOC001 | Tên/loại phiếu theo nguồn | Văn bản/danh mục | 1-195 | Mẫu | Giữ tên tài liệu để xác định biểu mẫu; không dùng tên làm mã duy nhất |
| DOC002 | Mã mẫu in trên phiếu | Chuỗi metadata | 1-195 | Mẫu | Khác mã tài liệu nghiệp vụ/mã điều trị |
| DOC003 | Số trang in trên phiếu và tổng trang | Số hoặc chuỗi nguồn | 1-195 | Mẫu | Khác số trang 1-195 trong tệp PDF |
| DOC004 | Nội dung ký/in hiển thị | Bằng chứng và nhãn nguồn | 1-195 | Mẫu | Tên in, chữ ký ảnh, thời điểm hiển thị không chứng minh hiệu lực ký điện tử |
| DOC005 | Mã tài liệu nội bộ | Chuỗi/UUID | 1-195 | Đề xuất | BE cấp, khác ID trong PDF |
| DOC006 | Mã nguồn và dấu vân tay tệp | Chuỗi và SHA-256 | 1-195 | Đề xuất | Định danh tệp khảo sát, không lấy thông tin người bệnh làm tên công khai |
| DOC007 | Trang PDF bắt đầu/kết thúc | Số nguyên hoặc danh sách trang | 1-195 | Đề xuất | Giữ trang vật lý 1-195 để đối chiếu |
| DOC008 | Liên kết người bệnh | Tham chiếu patient | 1-195 | Đề xuất | Chỉ nối sau đối chiếu hệ thống cấp mã; xung đột đưa vào cần xác minh |
| DOC009 | Liên kết lần khám/đợt điều trị | Tham chiếu encounter/episode | 1-195 | Đề xuất | Không lấy một trang làm một lần khám |
| DOC010 | Loại bản tài liệu | Danh mục | 1-195 | Đề xuất | Bản điện tử/scan/bản ký/liên in cần đối chiếu |
| DOC011 | Phiên bản và tài liệu liên quan | Tham chiếu và quan hệ | 1-195 | Đề xuất | Bổ sung/thay thế/bản in cùng nguồn phải có bằng chứng |
| DOC012 | Trạng thái nhập/xác minh | Danh mục dự kiến | 1-195 | Đề xuất | Nháp/đã đối chiếu/cần xác minh; nhóm chốt quy trình |
| DOC013 | Vị trí trường trong nguồn | Trang, vùng ảnh hoặc nhãn | 1-195 | Đề xuất | Giúp kiểm tra lại OCR và dấu chọn |
| DOC014 | Giá trị nguyên bản | Văn bản hoặc tham chiếu nguồn | 1-195 | Đề xuất | Giữ nguyên để sửa ánh xạ, không đưa giá trị người bệnh vào tài liệu công khai |
| DOC015 | Giá trị cấu trúc đã xác nhận | Số/chuỗi/danh mục theo trường | 1-195 | Đề xuất | Khác nguyên bản; không tự chấp nhận suy đoán |
| DOC016 | Trạng thái thiếu/không rõ | Danh mục | 1-195 | Đề xuất | Trống/bị che/không đọc được/chưa xác minh/không áp dụng cần phân biệt |
| DOC017 | Đơn vị nguyên bản và chuẩn hóa | Chuỗi có hệ mã nếu được duyệt | 1-195 | Đề xuất | Không mất đơn vị nguồn; đổi đơn vị cần quy tắc có phiên bản |
| DOC018 | Thời điểm dữ liệu và độ chính xác | Ngày giờ hoặc phần ngày, độ chính xác | 1-195 | Đề xuất | Không tự thêm giờ; giữ thời điểm đo/lập/ký/in khác nhau |
| DOC019 | Người và phương pháp nhập | Người, thủ công/OCR/API | 1-195 | Đề xuất | Không suy người nhập từ bác sĩ ký |
| DOC020 | Thời điểm nhập/chỉnh sửa | Ngày giờ hệ thống | 1-195 | Đề xuất | Khác thời điểm lâm sàng và không lấy từ thời gian in |
| DOC021 | Lý do sửa và lịch sử thay đổi | Văn bản/sự kiện | 1-195 | Đề xuất | Giữ giá trị trước/sau, tác giả và nguồn đối chiếu |
| DOC022 | Tệp đính kèm và phân loại nội dung | Tham chiếu tệp | 1-195 | Đề xuất | Ảnh, đồ thị, waveform, scan; không coi PNG báo cáo là dữ liệu thiết bị gốc |
| DOC023 | Mức xác minh và người xác minh | Danh mục/người/thời điểm | 1-195 | Đề xuất | Tách sự tự tin OCR khỏi việc chuyên môn đã xác nhận |
| DOC024 | Quyền truy cập tài liệu | Tham chiếu quy tắc được nhóm chốt | 1-195 | Đề xuất | Phân biệt metadata công khai với hồ sơ thật và các tệp gốc |

## Khi bàn giao nhóm trường này

Ghi các mã đã chọn vào bảng bàn giao ở tài liệu chung, thống nhất tên trường kỹ thuật và nơi lưu cùng BE. Trường chưa chốt giữ CXT; không dùng đơn vị đoán, mặc định checkbox hoặc ngưỡng in sẵn để triển khai validation.
