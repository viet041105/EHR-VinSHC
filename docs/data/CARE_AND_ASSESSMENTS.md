# Chăm sóc, thang điểm, dinh dưỡng và đánh giá nuốt

[Quay lại hướng dẫn chung](../DATA_DICTIONARY.md).

Nguồn: **S01**, PDF mẫu 195 trang; số trang là trang vật lý của tệp, tính từ 1. Ngày rà soát: **09/10/2026**. Trạng thái: **bản đặc tả để nhóm rà soát**, chưa chốt phạm vi triển khai hay quy tắc chuyên môn.

**Cơ sở:** `Mẫu` = nhãn/ô/chỉ số có trong nguồn; `Tách` = tách từ đoạn văn, ô gộp, đồ thị hoặc nhãn; `Đề xuất` = bổ sung cho hệ thống. Cơ sở này không phải trạng thái duyệt.

**Bắt buộc, danh mục chuẩn, giới hạn giá trị, thuật toán và quyền:** tất cả còn **CXT - cần xác nhận** nếu chưa có quyết định được ghi trong bảng bàn giao. Kiểu dữ liệu ở đây là dự kiến. Ô trống, bị che và không đọc được phải giữ khác nhau. Không chép giá trị người bệnh thật vào fixture hoặc tài liệu Git.

Các nhóm NU/SC/FL giữ từng lần ghi nhận trong cột ngày/giờ. NT và SW là các lần đánh giá riêng. Giá trị đo, điểm thành phần, tổng điểm, phân loại và hướng dẫn in sẵn phải phân biệt.

Có **169 dòng đặc tả**; cùng khái niệm có thể được tái sử dụng, không phải từng dòng là một cột database.

- [NU - Chăm sóc: bối cảnh, sinh hiệu và nhận định](#nu)
- [SC - Thang điểm chăm sóc: thành phần, tổng và phân loại](#sc)
- [FL - Cân bằng dịch và chăm sóc/giáo dục](#fl)
- [NT - Sàng lọc và đánh giá dinh dưỡng](#nt)
- [SW - Đánh giá rối loạn nuốt tại giường](#sw)

<a id="nu"></a>

## NU - Chăm sóc: bối cảnh, sinh hiệu và nhận định

Trang nguồn: **151-177**. Mỗi cột ngày/giờ là một lần ghi nhận. Cụm phiếu: 151-154, 155-157, 158-161, 162-165, 166-169, 170-173, 174-177. Các trường đầu phiếu liên hệ K; vị trí/tác giả gắn thời điểm.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| NU001 | Số phiếu chăm sóc | Chuỗi mã | 151-177 | Mẫu | Nhận diện cụm phiếu, không nhận diện từng bệnh nhân |
| NU002 | Ngày ghi nhận | Ngày | 151-177 | Mẫu | Mỗi cột có ngày riêng |
| NU003 | Giờ ghi nhận | Giờ | 151-177 | Mẫu | Ghép với ngày của đúng cột; không lấy ngày ở trang cuối |
| NU004 | Số ngày điều trị | Số nguyên, ngày | 151-177 | Mẫu | Giữ cách đếm nguồn, chờ chốt công thức |
| NU005 | Phân cấp chăm sóc | Danh mục | 151-177 | Mẫu | Cấp chăm sóc thực ghi, khác chỉ định chăm sóc |
| NU006 | Trạng thái dị ứng đầu phiếu | Trạng thái nguồn | 151-177 | Mẫu | Nguồn có Chưa phát hiện/Có; không tự đồng nghĩa với không dị ứng |
| NU007 | Chiều cao ghi trên phiếu | Số, cm | 151-177 | Mẫu | Giữ bối cảnh/thời điểm, khác chiều cao nhập một lần ở thông tin chung |
| NU008 | Cân nặng ghi trên phiếu | Số, kg | 151-177 | Mẫu | Không ghi đè các lần cân trước |
| NU009 | SpO2 của điểm đồ thị | Số; đơn vị % cần xác nhận nhãn | 151-177 | Tách | Lấy điểm đo/chú thích theo giờ; các số trục không phải quan sát bệnh nhân |
| NU010 | Mạch của điểm đồ thị | Số, lần/phút khi xác nhận | 151-177 | Tách | Liên kết với giờ đo; khác điểm MEWS |
| NU011 | Huyết áp tâm thu của điểm đồ thị | Số, mmHg khi xác nhận | 151-177 | Tách | Tách cặp số, giữ nguồn ảnh |
| NU012 | Huyết áp tâm trương của điểm đồ thị | Số, mmHg khi xác nhận | 151-177 | Tách | Cùng lần đo với tâm thu |
| NU013 | Nhiệt độ của điểm đồ thị | Số, °C khi xác nhận | 151-177 | Tách | Giữ chú thích giá trị; không đọc trục làm số đo |
| NU014 | Da/niêm mạc | Văn bản/danh mục | 151-177 | Mẫu | Nhận định theo thời điểm |
| NU015 | Liệt | Văn bản/danh mục | 151-177 | Mẫu | Giữ bên/vùng nếu được ghi rõ |
| NU016 | Cơ lực nguyên văn | Văn bản | 151-177 | Mẫu | Có thể gộp tay/chân trong một ô; chưa gán cho mọi chi |
| NU017 | Chi/vùng đánh giá cơ lực | Danh mục/văn bản | 151-177 | Tách | Tách khi nguồn chỉ rõ vùng và bên |
| NU018 | Giá trị cơ lực theo vùng | Văn bản/số điểm được duyệt | 151-177 | Tách | Giữ dạng thang gốc; không parse như phân số số học |
| NU019 | Vị trí loét | Văn bản/danh mục, lặp | 151-177 | Mẫu | Ô ghi Không khác ô trống |
| NU020 | Giai đoạn loét | Văn bản/danh mục | 151-177 | Mẫu | Gắn từng vị trí, danh mục cần chuyên môn duyệt |
| NU021 | Xử trí loét | Văn bản | 151-177 | Mẫu | Gắn vị trí và lần chăm sóc |
| NU022 | Vị trí vết thương/mổ/dẫn lưu | Văn bản/danh mục, lặp | 151-177 | Mẫu | Nguồn gộp loại vị trí, tách sâu khi xác nhận |
| NU023 | Thời gian vết thương/mổ/dẫn lưu | Ngày giờ/văn bản | 151-177 | Mẫu | Giữ loại mốc nếu được xác nhận |
| NU024 | Tình trạng vết thương/mổ/dẫn lưu | Văn bản | 151-177 | Mẫu | Gắn đúng vị trí/thời điểm |
| NU025 | Xử trí vết thương/mổ/dẫn lưu | Văn bản | 151-177 | Mẫu | Không suy thực hiện từ kế hoạch chưa có xác nhận |
| NU026 | Diễn biến bất thường | Văn bản | 151-177 | Mẫu | Giữ nhận định, thời điểm và tác giả |
| NU027 | Xử trí diễn biến bất thường | Văn bản | 151-177 | Tách | Tách nếu mô tả có hành động rõ; không thêm xử trí chưa ghi |
| NU028 | Tự thở khí trời | Trạng thái theo dấu chọn | 151-177 | Mẫu | Dấu X gắn đúng giờ, trống là chưa ghi |
| NU029 | Hỗ trợ thở | Văn bản/danh mục | 151-177 | Mẫu | Loại hỗ trợ theo nguồn; không suy máy/thông số |
| NU030 | Liều lượng oxy | Số, L/phút | 151-177 | Mẫu | Khác nhịp thở lần/phút |
| NU031 | Nhịp thở | Số, lần/phút | 151-177 | Mẫu | Giá trị đo, không phải số điểm MEWS |
| NU032 | Tính chất mạch | Văn bản/danh mục | 151-177 | Mẫu | Khác số lần/phút |
| NU033 | Vị trí phù | Văn bản/danh mục | 151-177 | Mẫu | Nguồn có ô vị trí, chưa tự tạo mức độ phù |
| NU034 | Catheter | Văn bản/danh mục | 151-177 | Mẫu | Giữ mô tả, không suy thời điểm đặt |
| NU035 | Đánh giá VIP | Điểm và nhãn theo nguồn | 151-177 | Mẫu | Mục đánh giá catheter; thuật toán/phiên bản cần chốt |
| NU036 | Tình trạng bụng | Văn bản/danh mục | 151-177 | Mẫu | Nhận định theo giờ |
| NU037 | Nôn/buồn nôn | Văn bản/trạng thái | 151-177 | Mẫu | Nguồn gộp hai triệu chứng; không tự cho cùng câu trả lời khi tách |
| NU038 | Đường nuôi dưỡng | Danh mục/văn bản | 151-177 | Mẫu | Khác chế độ ăn và lượng ăn |
| NU039 | Chế độ ăn nguyên văn | Văn bản | 151-177 | Mẫu | Có thể chứa mã, giờ ăn và lượng ăn trong một ô |
| NU040 | Mã/tên chế độ ăn | Danh mục/văn bản | 151-177 | Tách | Tách nếu có mã rõ; cần danh mục dinh dưỡng |
| NU041 | Thời điểm ăn | Giờ/ngày giờ | 151-177 | Tách | Chỉ tách khi ô có giờ ăn cụ thể |
| NU042 | Lượng/tỷ lệ suất ăn | Văn bản/số và đơn vị | 151-177 | Tách | Giữ mô tả nguồn; không tự đổi suất ăn thành mL |
| NU043 | Dịch tồn dư | Số, mL | 151-177 | Mẫu | Trống khác 0 |
| NU044 | Tình trạng đại tiện | Văn bản/danh mục | 151-177 | Mẫu | Không suy số lần từ câu chưa/đã đại tiện |
| NU045 | Màu phân | Văn bản/danh mục | 151-177 | Mẫu | Gắn đúng lần nhận định |
| NU046 | Số lượng đại tiện | Văn bản/số; đơn vị chưa ghi rõ | 151-177 | Mẫu | Xác nhận là lượng hay số lần trước khi chuẩn hóa |
| NU047 | Tính chất phân | Văn bản/danh mục | 151-177 | Mẫu | Khác màu |
| NU048 | Cách/tình trạng tiểu | Văn bản/danh mục | 151-177 | Mẫu | Giữ nhãn tự tiểu/bỉm hoặc mô tả nguồn; không suy ống thông |
| NU049 | Màu sắc nước tiểu | Văn bản/danh mục | 151-177 | Mẫu | Khác lượng nước tiểu ở bảng cân bằng dịch |
| NU050 | Tính chất nước tiểu | Văn bản/danh mục | 151-177 | Mẫu | Nhận định theo giờ |
| NU051 | Nhận định chuyên khoa | Văn bản | 151-177 | Mẫu | Có ô riêng dù trống |
| NU052 | Giấc ngủ | Văn bản/danh mục | 151-177 | Mẫu | Nhận định theo giờ |
| NU053 | Thời gian ngủ | Khoảng thời gian/văn bản | 151-177 | Mẫu | Đơn vị chỉ ghi khi nguồn rõ |
| NU054 | Tinh thần | Văn bản/danh mục | 151-177 | Mẫu | Khác điểm ý thức của MEWS/Glasgow |
| NU055 | Vận động | Văn bản/danh mục | 151-177 | Mẫu | Khác thành phần vận động của Glasgow |
| NU056 | Phục hồi chức năng | Văn bản | 151-177 | Mẫu | Ghi nhận chăm sóc, khác chỉ định PHCN |
| NU057 | Khoảng thời gian đo/tổng hợp | Bắt đầu và kết thúc | 151-177 | Đề xuất | Cần khi chức năng tính tổng lượng dịch; không suy ngày/ca từ một con số |

<a id="sc"></a>

## SC - Thang điểm chăm sóc: thành phần, tổng và phân loại

Trang nguồn: **151-177**. Mỗi thang điểm theo một lần đánh giá. Một ô có điểm + nhãn phải giữ cả hai; tổng ghi sẵn không chứng minh đủ thành phần. Ngưỡng và thuật toán chưa được duyệt.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| SC001 | MEWS - thành phần mạch | Điểm và nhãn | 151-177 | Tách | Giữ giá trị đo NU010/K72 riêng |
| SC002 | MEWS - thành phần huyết áp tâm thu | Điểm và nhãn | 151-177 | Tách | Khác mmHg đo |
| SC003 | MEWS - thành phần nhịp thở | Điểm và nhãn | 151-177 | Tách | Khác nhịp thở thực đo |
| SC004 | MEWS - thành phần nhiệt độ | Điểm và nhãn | 151-177 | Tách | Khác nhiệt độ đo |
| SC005 | MEWS - thành phần ý thức | Điểm/mã và nhãn | 151-177 | Tách | Không tự suy từ điểm Glasgow |
| SC006 | MEWS - điểm ghi trong ô phân loại | Số điểm | 151-177 | Tách | Nếu có trong nguồn; không tự tính từ các ô trống |
| SC007 | MEWS - phân loại nguy cơ | Văn bản/danh mục | 151-177 | Mẫu | Giữ nhãn, không áp dụng ngưỡng khi chưa duyệt |
| SC008 | MEWS - hướng/tần suất theo dõi in trong phân loại | Văn bản/khoảng thời gian | 151-177 | Tách | Nội dung nguồn cần chuyên môn xác nhận trước khi tự tạo lịch |
| SC009 | Glasgow - mắt | Điểm và nhãn | 151-177 | Mẫu | Có thành phần riêng |
| SC010 | Glasgow - vận động | Điểm và nhãn | 151-177 | Mẫu | Khác đánh giá vận động thông thường |
| SC011 | Glasgow - lời nói | Điểm và nhãn | 151-177 | Mẫu | Giữ nhãn gốc |
| SC012 | Glasgow - tổng điểm | Số điểm | 151-177 | Mẫu | Nếu thành phần trống vẫn giữ tổng là giá trị nguồn |
| SC013 | RASS | Điểm/mã theo nguồn | 151-177 | Mẫu | Phiên bản và cách chấm cần chuyên môn chốt |
| SC014 | VAS - điểm đau | Số điểm | 151-177 | Tách | Tách điểm khỏi nhãn; thang in trên mẫu, không tự thay thang |
| SC015 | VAS - nhãn mức đau | Văn bản/danh mục | 151-177 | Tách | Giữ nhãn nguồn; mapping cần duyệt |
| SC016 | BRADEN - nhận cảm/cảm giác | Điểm và nhãn | 151-177 | Mẫu | Nguồn gộp nhãn, chuyên môn xác nhận tên chuẩn |
| SC017 | BRADEN - độ ẩm | Điểm và nhãn | 151-177 | Mẫu | Không dùng nhãn làm mô tả da chung |
| SC018 | BRADEN - hoạt động | Điểm và nhãn | 151-177 | Mẫu | Khác thành phần di chuyển |
| SC019 | BRADEN - di chuyển | Điểm và nhãn | 151-177 | Mẫu | Khác hoạt động |
| SC020 | BRADEN - dinh dưỡng | Điểm và nhãn | 151-177 | Mẫu | Khác phiếu đánh giá dinh dưỡng NT |
| SC021 | BRADEN - ma sát/trầy xước | Điểm và nhãn | 151-177 | Mẫu | Giữ thành phần riêng |
| SC022 | BRADEN - tổng điểm | Số điểm | 151-177 | Mẫu | Không tự tính khi thiếu thành phần |
| SC023 | BRADEN - phân loại nguy cơ | Văn bản/danh mục | 151-177 | Mẫu | Giữ nguồn và phiên bản |
| SC024 | Nguy cơ ngã - thành phần tuổi | Điểm và nhãn nhóm tuổi | 151-177 | Mẫu | Khác tuổi thật K07 |
| SC025 | Nguy cơ ngã - tiền sử ngã | Điểm và nhãn | 151-177 | Mẫu | Không tự suy từ bệnh sử chung |
| SC026 | Nguy cơ ngã - bài tiết | Điểm và nhãn | 151-177 | Mẫu | Nguồn gộp đại/tiểu tiện, không tự chia đôi điểm |
| SC027 | Nguy cơ ngã - thuốc | Điểm và nhãn | 151-177 | Mẫu | Không tự chấm từ đơn thuốc nếu chưa có thuật toán được duyệt |
| SC028 | Nguy cơ ngã - đường truyền/dẫn lưu/sonde | Điểm và nhãn | 151-177 | Mẫu | Giữ tiêu chí gộp nguồn |
| SC029 | Nguy cơ ngã - cần vịn khi di chuyển | Điểm và nhãn | 151-177 | Mẫu | Một tiêu chí vận động |
| SC030 | Nguy cơ ngã - thiết bị/người trợ giúp | Điểm và nhãn | 151-177 | Mẫu | Tiêu chí khác cần vịn |
| SC031 | Nguy cơ ngã - thị/thính lực ảnh hưởng di chuyển | Điểm và nhãn | 151-177 | Mẫu | Không tự chia thành hai tiêu chí đã được chấm riêng |
| SC032 | Nguy cơ ngã - tâm thần | Điểm và nhãn | 151-177 | Mẫu | Khác nhận định tinh thần chung |
| SC033 | Nguy cơ ngã - tổng điểm | Số điểm | 151-177 | Mẫu | Giữ giá trị nguồn |
| SC034 | Nguy cơ ngã - phân loại/nhãn nguy cơ | Văn bản/danh mục | 151-177 | Mẫu | Có ngưỡng in; chưa chứng minh thuật toán/version chính thức |
| SC035 | VIP - điểm | Số điểm | 151-177 | Tách | Tách điểm từ nhãn tại dòng Đánh giá viêm Catheter |
| SC036 | VIP - nhãn nhận định | Văn bản/danh mục | 151-177 | Tách | Giữ tên và thời điểm đánh giá catheter |
| SC037 | Phiên bản thang điểm | Chuỗi/tham chiếu | 151-177 | Đề xuất | Mentor xác nhận bộ tiêu chí/ngưỡng, không đặt phiên bản giả |
| SC038 | Trạng thái kiểm tra tính tổng | Danh mục | 151-177 | Đề xuất | Thiếu thành phần/khớp/cần kiểm tra... là đề xuất kiểm dữ liệu, không kết luận lâm sàng |

<a id="fl"></a>

## FL - Cân bằng dịch và chăm sóc/giáo dục

Trang nguồn: **151-177**. Giá trị từng cột, tổng cả phiếu và khoảng tổng hợp là ba phạm vi khác nhau. Đơn vị mL được ghi tại một số dòng vào; đơn vị các dòng ra cần xác nhận.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| FL001 | Dịch thuốc vào | Số, mL | 151-177 | Mẫu | Theo cột thời điểm, không suy từ lượng kê |
| FL002 | Ăn/uống dạng dịch | Số, mL | 151-177 | Mẫu | Khác số suất ăn |
| FL003 | Dịch vào khác | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Nguồn chưa in lại đơn vị tại dòng |
| FL004 | Tổng dịch vào của cột | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Không mặc định tổng 0 chứng minh lượng thành phần là 0 |
| FL005 | Nước tiểu trong bảng dịch ra | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Khác màu/tính chất nước tiểu |
| FL006 | Dẫn lưu 1 | Văn bản/vị trí | 151-177 | Mẫu | Nguồn có dòng riêng, cần chốt cách xác định dẫn lưu |
| FL007 | Số lượng dẫn lưu 1 | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Gắn đúng dẫn lưu và thời điểm |
| FL008 | Dẫn lưu 2 | Văn bản/vị trí | 151-177 | Mẫu | Khác dẫn lưu 1 |
| FL009 | Số lượng dẫn lưu 2 | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Không gộp hai nguồn dẫn lưu |
| FL010 | Dịch ra khác | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Giữ thiếu dữ liệu riêng |
| FL011 | Tổng dịch ra của cột | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Theo khoảng của cột |
| FL012 | Dịch vào trừ dịch ra của cột | Số có dấu; đơn vị cần xác nhận | 151-177 | Mẫu | Âm có thể là kết quả tổng hợp, không đặt ràng buộc không âm |
| FL013 | Tổng dịch vào ở phần tổng phiếu | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Phạm vi toàn phiếu, không đồng nhất với một giờ |
| FL014 | Tổng dịch ra ở phần tổng phiếu | Số; đơn vị cần xác nhận | 151-177 | Mẫu | Giữ phạm vi tính |
| FL015 | Cân bằng dịch ở phần tổng phiếu | Số có dấu; đơn vị cần xác nhận | 151-177 | Mẫu | Không tính lại khi chưa xác nhận khoảng và đủ thành phần |
| FL016 | Chẩn đoán điều dưỡng | Văn bản/danh mục, lặp | 151-177 | Mẫu | Khác chẩn đoán bác sĩ |
| FL017 | Mục tiêu/lượng giá mục tiêu chăm sóc | Văn bản, lặp | 151-177 | Mẫu | Nguồn gộp; tách mục tiêu và lượng giá khi được ghi/xác nhận riêng |
| FL018 | Nội dung giáo dục sức khỏe | Văn bản/danh sách | 151-177 | Mẫu | Gắn giờ/người thực hiện |
| FL019 | Phương pháp giáo dục | Văn bản/danh mục | 151-177 | Mẫu | Như giải thích theo nhãn; cần danh mục được duyệt |
| FL020 | Điều dưỡng thực hiện từng cột | Tham chiếu nhân sự | 151-177 | Mẫu | Có thể nhiều người trong một phiếu |
| FL021 | Điều dưỡng ký cuối phiếu | Người/dấu ký | 151-177 | Mẫu | Không tự coi là tác giả tất cả các cột |
| FL022 | Lý do thành phần thiếu dữ liệu | Danh mục/văn bản | 151-177 | Đề xuất | Cần phân biệt chưa ghi, không đo, không áp dụng; không tự điền |

<a id="nt"></a>

## NT - Sàng lọc và đánh giá dinh dưỡng

Trang nguồn: **178-182**. Mỗi lần sàng lọc/đánh giá là một sự kiện riêng. Phần điều dưỡng được liên kết với phần bác sĩ khi có số phiếu hoặc bằng chứng.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| NT001 | Số phiếu sàng lọc/đánh giá | Chuỗi | 178-182 | Mẫu | Không dùng số phiếu như mã bệnh nhân |
| NT002 | Lần sàng lọc/đánh giá | Chuỗi/số | 178-182 | Tách | Tách từ nhãn số phiếu nếu xác nhận quy ước |
| NT003 | Số phiếu điều dưỡng liên quan | Chuỗi/tham chiếu | 179 | Mẫu | Có ở phiếu bác sĩ, cần xác nhận liên kết |
| NT004 | Vai trò loại phiếu | Danh mục điều dưỡng/bác sĩ | 178-182 | Mẫu | Không tự suy từ mọi chức danh trong dấu ký |
| NT005 | Cân nặng | Số, kg | 178-182 | Mẫu | Giữ thời điểm/nguồn số đo |
| NT006 | Chiều cao | Số, cm | 178-182 | Mẫu | Chuẩn hóa đơn vị nếu được duyệt, giữ nguồn |
| NT007 | BMI được ghi | Số, kg/m² | 178-182 | Mẫu | Không mặc định giá trị tính lại thay giá trị nguồn |
| NT008 | Câu trả lời tiêu chí BMI | Có/không/chưa trả lời | 178-182 | Mẫu | Ngưỡng là metadata của câu hỏi, không phải câu trả lời |
| NT009 | Sụt cân không chủ ý | Có/không/không biết/chưa trả lời | 178-182 | Mẫu | Giữ lựa chọn rõ |
| NT010 | Số kg sụt cân | Số, kg | 178-182 | Mẫu | Trống khác 0; dùng khi có bối cảnh phù hợp |
| NT011 | Khoảng thời gian sụt cân | Số, tháng | 178-182 | Mẫu | Không đồng nhất với thời điểm sàng lọc |
| NT012 | Giảm ăn trong khoảng trước đánh giá | Có/không/chưa trả lời | 178-182 | Mẫu | Giữ khoảng tham chiếu theo câu hỏi |
| NT013 | Bệnh nặng trong tiêu chí sàng lọc | Có/không/chưa trả lời | 178-182 | Mẫu | Không tự suy từ chẩn đoán |
| NT014 | Kết quả sàng lọc | Văn bản/trạng thái nguồn | 178-182 | Mẫu | Có thể chỉ có hướng dẫn in, cần xác định kết quả thực ghi |
| NT015 | Ngày sàng lọc | Ngày | 178-182 | Mẫu | Chỉ ngày nếu nguồn không có giờ |
| NT016 | Điều dưỡng sàng lọc/ký | Tham chiếu nhân sự | 178-182 | Mẫu | Khác bác sĩ đánh giá |
| NT017 | Mức tình trạng dinh dưỡng được chọn | Danh mục nguồn | 180 | Mẫu | Giữ dấu chọn và nhãn, cần phiên bản tiêu chí |
| NT018 | Điểm tình trạng dinh dưỡng | Số điểm | 180 | Tách | Tách từ mức khi quy tắc đã được duyệt |
| NT019 | Mức tình trạng bệnh lý được chọn | Danh mục nguồn | 180 | Mẫu | Không coi văn bản ví dụ của mức là chẩn đoán thực tế |
| NT020 | Điểm tình trạng bệnh lý | Số điểm | 180 | Tách | Tách theo nhãn nguồn, chờ duyệt mapping |
| NT021 | Tổng điểm đánh giá | Số điểm | 180 | Mẫu | Không tự tính khi thiếu phần đánh giá |
| NT022 | Kết quả/nguy cơ dinh dưỡng | Văn bản/danh mục | 180 | Mẫu | Giữ kết quả bác sĩ ghi |
| NT023 | Kế hoạch chăm sóc dinh dưỡng | Văn bản | 180 | Mẫu | Khác danh mục chế độ ăn trong y lệnh |
| NT024 | Khoảng đánh giá lại được ghi | Khoảng thời gian/văn bản | 180 | Tách | Chỉ tách từ kế hoạch thực ghi; không tự áp hướng dẫn chung |
| NT025 | Ngày đánh giá bác sĩ | Ngày | 180 | Mẫu | Khác ngày sàng lọc ban đầu |
| NT026 | Bác sĩ đánh giá/ký | Tham chiếu nhân sự | 180 | Mẫu | Vai trò xác nhận chuyên môn |
| NT027 | Hướng dẫn/công thức in trên mẫu | Tài liệu/phiên bản | 180-181 | Tách | BMI, sụt cân, cách chọn điểm; chưa duyệt cho logic tự động |
| NT028 | BMI tính lại và phương pháp | Số + phiên bản công thức | 178-182 | Đề xuất | Nếu triển khai tính toán, giữ riêng kết quả nguồn |

<a id="sw"></a>

## SW - Đánh giá rối loạn nuốt tại giường

Trang nguồn: **148**. Phiếu scan có checkbox và chữ viết tay. Danh sách dưới đây mô tả thông tin cần lưu, không hướng dẫn cách tiến hành đánh giá.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| SW001 | Mã bệnh án trên phiếu | Chuỗi nguồn | 148 | Mẫu | Xác minh nghĩa mã, không tự nối bằng họ tên |
| SW002 | Viện/trung tâm/khoa đánh giá | Văn bản/tham chiếu | 148 | Mẫu | Giữ nguồn chữ viết tay; không suy từ giấy phía sau ảnh |
| SW003 | Ngày/giờ đánh giá | Ngày giờ hoặc văn bản nguồn | 148 | Mẫu | Chỉ chuẩn hóa phần đọc được, giữ độ chính xác |
| SW004 | Người đánh giá | Văn bản/tham chiếu | 148 | Mẫu | Tên viết tay có thể cần người có quyền xác nhận |
| SW005 | Chiều cao | Số; đơn vị chưa ghi rõ | 148 | Mẫu | Không tự lấy đơn vị từ phiếu khác |
| SW006 | Cân nặng | Số; đơn vị chưa ghi rõ | 148 | Mẫu | Ô có thể trống |
| SW007 | Tỉnh/đáp ứng lời nói | Có/không/chưa xác định | 148 | Mẫu | Tiêu chí riêng theo dấu chọn |
| SW008 | Ngồi thẳng/kiểm soát đầu cổ | Có/không/chưa xác định | 148 | Mẫu | Nguồn gộp hai ý; không tự tách cùng kết quả cho hai câu |
| SW009 | Ho khi được đề nghị | Có/không/chưa xác định | 148 | Mẫu | Ghi kết quả tiêu chí, không mô tả thao tác hướng dẫn |
| SW010 | Kiểm soát nước bọt | Có/không/chưa xác định | 148 | Mẫu | Trống khác Không |
| SW011 | Đưa lưỡi theo tiêu chí | Có/không/chưa xác định | 148 | Mẫu | Giữ nhãn nguồn |
| SW012 | Hô hấp theo tiêu chí | Có/không/chưa xác định | 148 | Mẫu | Tiêu chí có ngưỡng in, chờ chuyên môn duyệt |
| SW013 | Giọng khàn/ướt | Có/không/chưa xác định | 148 | Mẫu | Giữ nguồn, không suy từ lời nói ở phiếu khác |
| SW014 | Số thứ tự lần thử nuốt | Số nguyên | 148 | Tách | Mẫu in nhiều lần; có nhãn không chứng minh đã thực hiện |
| SW015 | Lượng/đơn vị của lần thử | Số và đơn vị theo mẫu | 148 | Tách | Thông tin biểu mẫu khác lượng thực tế được xác nhận |
| SW016 | Kết quả dừng/tiếp tục | Trạng thái theo dấu ghi | 148 | Tách | Nguồn có cột; không suy khi trống |
| SW017 | Không nuốt/nước chảy ra | Trạng thái/văn bản | 148 | Mẫu | Dấu hiệu theo từng lần nếu nguồn đủ rõ |
| SW018 | Ho/sặc | Trạng thái/văn bản | 148 | Mẫu | Giữ tiêu chí gộp nguồn |
| SW019 | Khó thở | Trạng thái/văn bản | 148 | Mẫu | Giữ thời điểm/lần thử nếu xác định |
| SW020 | Giọng khàn/ướt sau đánh giá | Trạng thái/văn bản | 148 | Mẫu | Khác tiêu chí trước đánh giá |
| SW021 | Kết luận đường ăn | Danh mục theo dấu chọn | 148 | Mẫu | Đường miệng/qua thông/không chắc; ô trống giữ chưa xác định |
| SW022 | Người ký/dấu ký | Người và tài liệu | 148 | Mẫu | Đối chiếu người đánh giá, không mặc định mọi chữ viết tay đều đọc đúng |
| SW023 | Trạng thái xác minh ảnh/chữ viết tay | Danh mục | 148 | Đề xuất | Cần người kiểm tra khi đưa vào dữ liệu cấu trúc |
| SW024 | Phiên bản quy trình đánh giá nuốt | Tham chiếu | 148 | Đề xuất | Mentor/chuyên môn xác nhận trước khi làm quy tắc tự động |

## Khi bàn giao nhóm trường này

Ghi các mã đã chọn vào bảng bàn giao ở tài liệu chung, thống nhất tên trường kỹ thuật và nơi lưu cùng BE. Trường chưa chốt giữ CXT; không dùng đơn vị đoán, mặc định checkbox hoặc ngưỡng in sẵn để triển khai validation.
