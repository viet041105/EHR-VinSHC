# Kết quả cận lâm sàng và can thiệp

[Quay lại hướng dẫn chung](../DATA_DICTIONARY.md).

Nguồn: **S01**, PDF mẫu 195 trang; số trang là trang vật lý của tệp, tính từ 1. Ngày rà soát: **09/10/2026**. Trạng thái: **bản đặc tả để nhóm rà soát**, chưa chốt phạm vi triển khai hay quy tắc chuyên môn.

**Cơ sở:** `Mẫu` = nhãn/ô/chỉ số có trong nguồn; `Tách` = tách từ đoạn văn, ô gộp, đồ thị hoặc nhãn; `Đề xuất` = bổ sung cho hệ thống. Cơ sở này không phải trạng thái duyệt.

**Bắt buộc, danh mục chuẩn, giới hạn giá trị, thuật toán và quyền:** tất cả còn **CXT - cần xác nhận** nếu chưa có quyết định được ghi trong bảng bàn giao. Kiểu dữ liệu ở đây là dự kiến. Ô trống, bị che và không đọc được phải giữ khác nhau. Không chép giá trị người bệnh thật vào fixture hoặc tài liệu Git.

LB là cấu trúc chung của kết quả xét nghiệm; LA là các loại chỉ số thấy trên phiếu. IM dùng chung cho báo cáo hình ảnh; EC/DP/HL/PR bổ sung chi tiết theo loại. HIV Ag/Ab thấy trong y lệnh trang 6-7; chưa thấy kết quả tương ứng ở trang 100-104, nên không liệt kê như kết quả đã có.

Có **342 dòng đặc tả**; cùng khái niệm có thể được tái sử dụng, không phải từng dòng là một cột database.

- [LB - Phiếu xét nghiệm và từng kết quả](#lb)
- [LA - Danh sách từng chỉ số có phiếu kết quả](#la)
- [IM - Báo cáo hình ảnh và kết luận](#im)
- [EC - Siêu âm tim: số đo và mô tả riêng](#ec)
- [DP - Doppler mạch và siêu âm mô tả](#dp)
- [HL - Holter: kết luận, báo cáo thiết bị và bảng theo thời gian](#hl)
- [PR - Biên bản can thiệp](#pr)

<a id="lb"></a>

## LB - Phiếu xét nghiệm và từng kết quả

Trang nguồn: **100-104**. Một phiếu có một hoặc nhiều panel; một panel gồm nhiều chỉ số. Mỗi chỉ số có giá trị, đơn vị, phương pháp và nguồn kết quả riêng.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| LB001 | SID | Chuỗi mã | 100-104 | Mẫu | Xác minh định danh mẫu/phiếu trong phân hệ; giữ nguồn cấp |
| LB002 | PID/mã bệnh nhân nguồn | Chuỗi mã | 100-104 | Mẫu | Liên kết mã định danh đã kiểm tra, không tự đổi sang SID |
| LB003 | Mã y lệnh liên quan | Chuỗi/tham chiếu | 100-101 | Mẫu | Có trên phiếu huyết học/đông máu; không suy khi phiếu khác thiếu |
| LB004 | Mức ưu tiên | Danh mục | 100-101 | Mẫu | Cấp cứu/thường theo dấu chọn |
| LB005 | Loại mẫu | Danh mục/văn bản | 100-104 | Mẫu | Máu/máu tĩnh mạch theo phiếu; chưa suy vị trí lấy mẫu |
| LB006 | Chất lượng/tình trạng mẫu | Danh mục/văn bản | 100-104 | Mẫu | Đạt hoặc nhãn nguồn; ô trống giữ chưa ghi |
| LB007 | Tình trạng lấy mẫu | Danh mục/văn bản | 100-101 | Mẫu | Nguồn có Đói; không đồng nhất với chất lượng mẫu |
| LB008 | Thời gian chỉ định | Ngày giờ | 102-104 | Mẫu | Ô trên phiếu hóa sinh; khác thời gian lấy mẫu |
| LB009 | Người lấy mẫu | Tham chiếu nhân sự | 100-104 | Mẫu | Có thể để trống |
| LB010 | Thời gian lấy mẫu | Ngày giờ | 100-104 | Mẫu | Không dùng thời gian nhận mẫu để thay |
| LB011 | Người nhận mẫu | Tham chiếu nhân sự | 100-104 | Mẫu | Khác người lấy/duyệt |
| LB012 | Thời gian nhận mẫu | Ngày giờ | 100-104 | Mẫu | Cần quan hệ với mẫu/phiếu |
| LB013 | Người duyệt kết quả | Tham chiếu nhân sự | 100-104 | Mẫu | Khác người chỉ định |
| LB014 | Thời gian duyệt kết quả | Ngày giờ | 100-104 | Mẫu | Không đồng nhất với ngày ký nếu hai mốc có khác biệt |
| LB015 | Nhóm/panel xét nghiệm | Văn bản/danh mục | 100-104 | Mẫu | Huyết học, đông máu, điện giải...; kết quả con tách riêng |
| LB016 | Tên chỉ số nguồn | Văn bản | 100-104 | Mẫu | Tên/viết tắt trên dòng kết quả, dùng danh sách LA bên dưới |
| LB017 | Kết quả nguyên văn | Văn bản | 100-104 | Mẫu | Giữ dấu thập phân, ký hiệu và biểu diễn gốc |
| LB018 | Kiểu giá trị kết quả | Danh mục | 100-104 | Tách | Số/văn bản/có mã...; không coi mọi xét nghiệm đều là số |
| LB019 | Giá trị số chuẩn hóa | Số thập phân | 100-104 | Tách | Chỉ tạo khi parse/xác nhận đúng; giữ nguyên văn song song |
| LB020 | Đơn vị kết quả | Danh mục và nhãn gốc | 100-104 | Mẫu | Không tự sửa theo bản tóm tắt |
| LB021 | Khoảng tham chiếu nguyên văn | Văn bản | 100-104 | Mẫu | Theo phiếu/phương pháp; không coi là giới hạn nhập toàn hệ thống |
| LB022 | Cận dưới khoảng tham chiếu | Số | 100-104 | Tách | Chỉ tách khi rõ; các dạng một phía hoặc văn bản cần giữ riêng |
| LB023 | Cận trên khoảng tham chiếu | Số | 100-104 | Tách | Không tự bổ sung cận không được ghi |
| LB024 | Toán tử khoảng tham chiếu | Danh mục | 100-104 | Tách | Dấu nhỏ hơn/lớn hơn hoặc dạng khoảng phải được giữ |
| LB025 | Quy trình/phương pháp | Chuỗi/văn bản | 100-104 | Mẫu | Có thể là mã SOP, tên phương pháp hoặc công thức ghi trên phiếu |
| LB026 | Máy xét nghiệm | Chuỗi/tham chiếu thiết bị | 100-104 | Mẫu | Giữ mã máy nguồn; không coi là mã chỉ số |
| LB027 | Nhận xét phiếu | Văn bản | 100-104 | Mẫu | Khác từng giá trị chỉ số |
| LB028 | Dấu/cờ kết quả từ bản trình bày | Trạng thái và bằng chứng nguồn | 100-104 | Tách | Cần ảnh/cờ được xác nhận; căn trái/phải không đủ cho parser chữ |
| LB029 | Dấu chú thích của chỉ số | Chuỗi/chú giải | 100-104 | Tách | Ví dụ dấu (*); không phải giá trị xét nghiệm |
| LB030 | Trạng thái duyệt/phiên bản kết quả | Danh mục và lịch sử | 100-104 | Đề xuất | BE chốt trạng thái; phiếu ký không chứng minh mọi phiên bản trước/sau |

<a id="la"></a>

## LA - Danh sách từng chỉ số có phiếu kết quả

Trang nguồn: **100-104**. Mỗi dòng sau là một loại chỉ số, có nhiều kết quả theo lần xét nghiệm; tái sử dụng cấu trúc LB cho từng kết quả.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| LA001 | RBC - số lượng hồng cầu | Số; T/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA002 | HGB - hemoglobin | Số; g/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA003 | HCT - hematocrit | Số; L/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA004 | MCV - thể tích trung bình hồng cầu | Số; fL | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA005 | MCH - lượng HGB trung bình hồng cầu | Số; pg | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA006 | MCHC - nồng độ HGB trung bình hồng cầu | Số; g/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA007 | RDW-CV - phân bố kích thước hồng cầu | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA008 | PLT - số lượng tiểu cầu | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA009 | MPV - thể tích trung bình tiểu cầu | Số; fL | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA010 | WBC - số lượng bạch cầu | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA011 | NEUT% - tỷ lệ theo nhãn nguồn | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA012 | EO% - tỷ lệ theo nhãn nguồn | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA013 | BASO% - tỷ lệ theo nhãn nguồn | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA014 | MONO% - tỷ lệ theo nhãn nguồn | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA015 | LYM% - tỷ lệ theo nhãn nguồn | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA016 | NEUT# - số lượng theo nhãn nguồn | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA017 | EO# - số lượng theo nhãn nguồn | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA018 | BASO# - số lượng theo nhãn nguồn | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA019 | MONO# - số lượng theo nhãn nguồn | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA020 | LYM# - số lượng theo nhãn nguồn | Số; G/L | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA021 | Tế bào bất thường | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA022 | Tế bào kích thích | Số; % | 100 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA023 | PT theo giây | Số; giây | 101 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA024 | PT theo phần trăm | Số; % | 101 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA025 | PT-INR | Số; không in đơn vị | 101 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA026 | APTT theo giây | Số; giây | 101 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA027 | APTT bệnh/chứng | Số; không in đơn vị | 101 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA028 | Fibrinogen | Số; g/l theo nguồn | 101 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA029 | Urê | Số; mmol/L | 102, 104 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA030 | Glucose | Số; mmol/L | 102 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA031 | Creatinin | Số; µmol/L | 102, 104 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA032 | eGFR - mức lọc cầu thận ước tính | Số; mL/phút/1.73 m² | 102, 104 | Mẫu | Nguồn ghi phương pháp CKD-EPI 2009; không tự tính lại hoặc nâng phiên bản |
| LA033 | AST (GOT) | Số; U/L | 102 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA034 | ALT (GPT) | Số; U/L | 102 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA035 | Natri | Số; mmol/L | 102, 104 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA036 | Kali (P) | Số; mmol/L | 102, 104 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA037 | Clo | Số; mmol/L | 102, 104 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA038 | Troponin T hs | Số; ng/L | 102 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA039 | Cholesterol toàn phần | Số; mmol/L | 103 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA040 | Triglycerid | Số; mmol/L | 103 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA041 | HDL-C | Số; mmol/L | 103 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA042 | LDL_C | Số; mmol/L | 103 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |
| LA043 | Acid uric | Số; µmol/L | 104 | Mẫu | Giữ giá trị, đơn vị, khoảng tham chiếu và phương pháp của đúng lần xét nghiệm |

<a id="im"></a>

## IM - Báo cáo hình ảnh và kết luận

Trang nguồn: **74-99**. Một báo cáo có thể nhiều trang và có ảnh đính kèm. CT 93-94 và biên bản 96-97 là các cụm nối trang.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| IM001 | Loại khảo sát | Danh mục/văn bản | 74-99 | Mẫu | Siêu âm/CT/MRI/X-quang/Holter theo loại báo cáo; không suy từ tên tệp |
| IM002 | Kỹ thuật/phương pháp khảo sát | Văn bản | 90-99 | Mẫu | Giữ kỹ thuật được ghi, không tự bổ sung tham số máy |
| IM003 | Chỉ định/chẩn đoán lâm sàng | Văn bản và mã nếu có | 74-99 | Mẫu | Bối cảnh yêu cầu, khác kết luận báo cáo |
| IM004 | Đơn vị chỉ định | Tham chiếu khoa/phòng | 74-99 | Mẫu | Khác nơi đọc/thực hiện báo cáo |
| IM005 | Bác sĩ chỉ định | Tham chiếu nhân sự | 74-99 | Mẫu | Không lấy người ký kết quả thay cho người chỉ định |
| IM006 | Mô tả kết quả | Văn bản | 74-99 | Mẫu | Các dòng cơ quan/vị trí có thể giữ theo nhóm hoặc tách được xác nhận |
| IM007 | Kết luận | Văn bản | 74-99 | Mẫu | Giữ đầy đủ; không biến kết luận thành một số đo |
| IM008 | Bác sĩ đọc/làm khảo sát | Tham chiếu nhân sự | 74-99 | Mẫu | Vai trò báo cáo |
| IM009 | Nhân viên đánh máy | Tham chiếu người dùng | 74-99 | Mẫu | Có nhãn trong mẫu; không coi là người kết luận |
| IM010 | Ngày giờ báo cáo | Ngày giờ hoặc ngày | 74-99 | Mẫu | Giữ độ chính xác nguồn |
| IM011 | Ngày giờ ký số | Ngày giờ | 74-99 | Mẫu | Nguồn có mốc ký; không thay ngày thực hiện |
| IM012 | Người ký số | Tham chiếu người/dấu ký | 74-99 | Mẫu | Giữ vai trò và bằng chứng tài liệu |
| IM013 | Người in báo cáo | Tham chiếu người dùng | 74-99 | Mẫu | Khác người ký |
| IM014 | Ngày giờ in | Ngày giờ | 74-99 | Mẫu | Thông tin xuất bản |
| IM015 | Vị trí/bên của mô tả | Danh mục/văn bản | 74-99 | Tách | Tách khi nguồn có trái/phải/cơ quan rõ; không đoán từ chẩn đoán |
| IM016 | Liên kết chỉ định gốc | Tham chiếu | 74-99 | Đề xuất | Chỉ nối khi có mã/bằng chứng; không ghép bằng tên dịch vụ đơn thuần |
| IM017 | Tệp/ảnh gắn với báo cáo | Tham chiếu tài liệu | 74-99 | Đề xuất | Giữ ảnh, đồ thị, phần scan; không coi PDF là dữ liệu ảnh gốc từ máy |

<a id="ec"></a>

## EC - Siêu âm tim: số đo và mô tả riêng

Trang nguồn: **74-76**. Một lần khảo sát có nhiều số đo. Mỗi số đo giữ nhãn, đơn vị, phương pháp/pha/vị trí được nguồn ghi; ô trống là chưa có dữ liệu.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| EC001 | Chiều cao ở đầu phiếu (T) | Số, cm | 74-76 | Mẫu | Nhãn có đơn vị; giá trị có thể trống |
| EC002 | Cân nặng ở đầu phiếu (P) | Số, kg | 74-76 | Mẫu | Khác thể tích tim; liên hệ lần đo nếu xác nhận được |
| EC003 | BSA | Số, m² | 74-76 | Mẫu | Ô có nhãn; chưa tự tính khi trống |
| EC004 | Nhĩ trái | Số, mm | 74-76 | Mẫu | Số đo trong bảng; không chép khoảng tham chiếu thành kết quả |
| EC005 | Động mạch chủ | Số, mm | 74-76 | Mẫu | Số đo tại bảng đầu, khác các đoạn mạch mô tả dưới |
| EC006 | Dd | Số, mm | 74-76 | Mẫu | Giữ nhãn viết tắt nguồn; chuyên môn xác nhận tên chuẩn |
| EC007 | Ds | Số, mm | 74-76 | Mẫu | Giữ nhãn và pha của số đo |
| EC008 | Vd | Số, mL | 74-76 | Mẫu | Số đo bảng đầu; khác Vd theo Simpson |
| EC009 | Vs | Số, mL | 74-76 | Mẫu | Số đo bảng đầu; khác Vs theo Simpson |
| EC010 | %D | Số; đơn vị cần xác nhận theo nhãn | 74-76 | Mẫu | Nguồn in %D; không tự đặt công thức |
| EC011 | EF (Teich) | Số, % | 74-76 | Mẫu | Phương pháp Teich được ghi rõ |
| EC012 | EF Biplane | Số, % | 74-76 | Mẫu | Giữ phương pháp, không gộp với Teich |
| EC013 | Bề dày VLT tâm trương | Số, mm | 74-76 | Mẫu | Phân biệt pha tâm trương/tâm thu |
| EC014 | Bề dày VLT tâm thu | Số, mm | 74-76 | Mẫu | Giữ nhãn VLT và pha |
| EC015 | Bề dày TSTT tâm trương | Số, mm | 74-76 | Mẫu | Giữ nhãn TSTT và pha |
| EC016 | Bề dày TSTT tâm thu | Số, mm | 74-76 | Mẫu | Không thay cho số đo tâm trương |
| EC017 | Vd Simpson 4B | Số, mL | 74-76 | Mẫu | Phương pháp và mặt cắt riêng |
| EC018 | Vs Simpson 4B | Số, mL | 74-76 | Mẫu | Phương pháp và mặt cắt riêng |
| EC019 | EF Simpson 4B | Số, % | 74-76 | Mẫu | Không gộp với EF của bảng đầu |
| EC020 | Vd Simpson 2B | Số, mL | 74-76 | Mẫu | Có ô dù giá trị trống |
| EC021 | Vs Simpson 2B | Số, mL | 74-76 | Mẫu | Có ô dù giá trị trống |
| EC022 | EF Simpson 2B | Số, % | 74-76 | Mẫu | Có ô dù giá trị trống |
| EC023 | Vdi | Số, mL/m² | 74-76 | Mẫu | Giữ nhãn; không tự tính lại khi thiếu |
| EC024 | LVM | Số, g/m² theo nhãn nguồn | 74-76 | Mẫu | Chuyên môn xác nhận cách đặt tên/chỉ số trước khi chuẩn hóa |
| EC025 | E | Số; chưa in đơn vị | 74-76 | Mẫu | Không suy đơn vị từ số điền |
| EC026 | A | Số; chưa in đơn vị | 74-76 | Mẫu | Giữ nhãn, cần chuyên môn chốt đơn vị |
| EC027 | e' (VLT) | Số; chưa in đơn vị | 74-76 | Mẫu | Giữ vị trí theo nhãn |
| EC028 | e' (TB) | Số; chưa in đơn vị | 74-76 | Mẫu | Giữ vị trí theo nhãn |
| EC029 | VmaxTR | Số, m/s | 74-76 | Mẫu | Đơn vị có in trên bảng |
| EC030 | LAV index biplane | Số; chưa in đơn vị | 74-76 | Mẫu | Không tự dùng đơn vị của số đo bên cạnh |
| EC031 | TAPSE | Số, mm | 74-76 | Mẫu | Theo nhãn bảng |
| EC032 | D1 | Số, mm | 74-76 | Mẫu | Giữ vị trí theo bảng chức năng thất phải |
| EC033 | D2 | Số, mm | 74-76 | Mẫu | Số đo khác D1 |
| EC034 | D3 | Số, mm | 74-76 | Mẫu | Số đo khác D1/D2 |
| EC035 | ĐK.TP trục dọc | Số; chưa in đơn vị tại ô | 74-76 | Mẫu | Giữ nhãn; cần xác nhận đơn vị |
| EC036 | FAC | Số, % | 74-76 | Mẫu | Theo nhãn bảng |
| EC037 | E/A | Số; đơn vị/định nghĩa cần chốt | 74-76 | Mẫu | Ô có nhãn, không tính tự động từ số E/A chưa xác nhận |
| EC038 | E/e'TB | Số; đơn vị/định nghĩa cần chốt | 74-76 | Mẫu | Giữ nhãn nguồn; cần chốt phương pháp |
| EC039 | Đường kính TMC dưới khi hít vào | Số, mm | 74-76 | Mẫu | Tách theo hai thì được nhãn ghi |
| EC040 | Đường kính TMC dưới khi thở ra | Số, mm | 74-76 | Mẫu | Khác số đo hít vào |
| EC041 | Dạng di động van hai lá | Văn bản/danh mục | 74-76 | Mẫu | Mô tả theo nguồn |
| EC042 | Khoảng cách hai bờ van hai lá | Số, mm | 74-76 | Mẫu | Ô có nhãn dù trống |
| EC043 | Tình trạng van/dây chằng hai lá | Văn bản | 74-76 | Mẫu | Nguồn gộp hai cấu trúc; giữ mô tả, tách sâu khi chuyên môn duyệt |
| EC044 | Mép van hai lá | Văn bản | 74-76 | Mẫu | Có nhãn, có thể trống |
| EC045 | Huyết khối nhĩ trái/tiểu nhĩ trái | Văn bản/trạng thái theo nguồn | 74-76 | Mẫu | Nguồn gộp hai vị trí; chưa tự phân bố kết luận cho mỗi vị trí |
| EC046 | Gradient hai lá tối đa | Số, mmHg | 74-76 | Mẫu | Khác gradient trung bình |
| EC047 | Gradient hai lá trung bình | Số, mmHg | 74-76 | Mẫu | Theo nhãn nhĩ-thất trái |
| EC048 | Mức hở van hai lá | Văn bản/danh mục | 74-76 | Mẫu | Nguồn có mức và thang /4; cần chuyên môn chốt mã |
| EC049 | ShoHL theo TD | Số, cm² | 74-76 | Mẫu | Giữ viết tắt và phương pháp TD |
| EC050 | ShoHL theo 2B | Số, cm² | 74-76 | Mẫu | Phương pháp riêng |
| EC051 | ShoHL theo 4B | Số, cm² | 74-76 | Mẫu | Phương pháp riêng |
| EC052 | Diện tích lỗ van hai lá 2D | Số, cm² | 74-76 | Mẫu | Giữ phương pháp |
| EC053 | Diện tích lỗ van hai lá PHT | Số, cm² | 74-76 | Mẫu | Giữ phương pháp |
| EC054 | VC (MR) | Số, mm | 74-76 | Mẫu | Giữ nhãn, không mở rộng thuật ngữ bằng suy đoán |
| EC055 | Tình trạng van động mạch chủ | Văn bản | 74-76 | Mẫu | Mô tả nguồn |
| EC056 | ĐKHoC/ĐRTT | Số, mm; nhãn gộp cần xác nhận | 74-76 | Mẫu | Không tự coi hai viết tắt là hai giá trị đã ghi độc lập |
| EC057 | STJ | Số, mm | 74-76 | Mẫu | Giữ nhãn theo mẫu |
| EC058 | Động mạch chủ lên | Số, mm | 74-76 | Mẫu | Số đo một đoạn mạch |
| EC059 | Quai động mạch chủ | Số, mm | 74-76 | Mẫu | Số đo đoạn khác |
| EC060 | Động mạch chủ xuống | Số, mm | 74-76 | Mẫu | Số đo đoạn khác |
| EC061 | Chênh áp qua eo ĐMC | Số, mmHg | 74-76 | Mẫu | Không suy từ gradient qua van |
| EC062 | Gradient van ĐMC tối đa | Số, mmHg | 74-76 | Mẫu | Theo nhãn thất trái-đmc |
| EC063 | Gradient van ĐMC trung bình | Số, mmHg | 74-76 | Mẫu | Khác tối đa |
| EC064 | Mức hở van ĐMC | Văn bản/danh mục | 74-76 | Mẫu | Cần danh mục/thang được duyệt |
| EC065 | PHT van ĐMC | Số, ms | 74-76 | Mẫu | Theo nhãn PHT trong phần hở van |
| EC066 | Vmax phần van ĐMC | Số, m/s | 74-76 | Mẫu | Khác VmaxTR |
| EC067 | VTILVO | Số, cm | 74-76 | Mẫu | Giữ nhãn viết tắt |
| EC068 | VC (AR) | Số, mm | 74-76 | Mẫu | Khác VC (MR) |
| EC069 | Diện tích lỗ van ĐMC VTI | Số, cm² | 74-76 | Mẫu | Giữ phương pháp VTI |
| EC070 | Tình trạng van động mạch phổi | Văn bản | 74-76 | Mẫu | Mô tả nguồn |
| EC071 | Đường kính gốc ĐMP | Số, mm | 74-76 | Mẫu | Theo nhãn |
| EC072 | Đường kính thân ĐMP | Số, mm | 74-76 | Mẫu | Khác gốc |
| EC073 | Đường kính nhánh ĐMP phải | Số, mm | 74-76 | Mẫu | Giữ bên |
| EC074 | Đường kính nhánh ĐMP trái | Số, mm | 74-76 | Mẫu | Giữ bên |
| EC075 | Gradient van ĐMP tối đa | Số, mmHg | 74-76 | Mẫu | Theo nhãn |
| EC076 | Gradient van ĐMP trung bình | Số, mmHg | 74-76 | Mẫu | Khác tối đa |
| EC077 | Mức hở van ĐMP | Văn bản/danh mục | 74-76 | Mẫu | Không suy từ số gradient |
| EC078 | Áp lực ĐMP tâm thu ước tính | Số, mmHg | 74-76 | Mẫu | Giữ tính chất ước tính của nhãn |
| EC079 | Áp lực ĐMP cuối tâm trương | Số, mmHg | 74-76 | Mẫu | Pha riêng |
| EC080 | Áp lực ĐMP trung bình | Số, mmHg | 74-76 | Mẫu | Giữ loại số đo |
| EC081 | Tình trạng van ba lá | Văn bản | 74-76 | Mẫu | Mô tả nguồn |
| EC082 | Mức hở van ba lá | Văn bản/danh mục | 74-76 | Mẫu | Nguồn có thang /4; cần chốt danh mục |
| EC083 | ShoBL | Số, cm² | 74-76 | Mẫu | Giữ nhãn |
| EC084 | Gradient ba lá tâm thu tối đa | Số, mmHg | 74-76 | Mẫu | Theo nhãn |
| EC085 | Màng ngoài tim | Văn bản | 74-76 | Mẫu | Mô tả; không tự tạo lượng dịch từ kết luận |
| EC086 | Nhận xét khác | Văn bản | 75 | Mẫu | Nội dung bổ sung |
| EC087 | Vùng vận động thành thất trái | Mã/vị trí vùng, lặp | 75 | Tách | Nguồn có sơ đồ; cần chuyên môn chốt quy ước vùng |
| EC088 | Mức vận động của vùng | Danh mục theo chú giải | 75 | Tách | Gắn đúng vùng; sơ đồ trống không chứng minh mức bình thường |
| EC089 | Vùng tưới máu/động mạch vành theo sơ đồ | Mã/vị trí và tài liệu | 75 | Tách | Giữ sơ đồ/chú giải; chưa chuyển tự động thành chẩn đoán |
| EC090 | Kết luận siêu âm | Văn bản | 75 | Mẫu | Tái sử dụng IM007 |
| EC091 | Ảnh đo/sóng từ máy siêu âm | Tham chiếu tệp | 75-76 | Tách | Giữ ảnh và quan hệ báo cáo; không nhập số từ ảnh khi chưa xác minh |

<a id="dp"></a>

## DP - Doppler mạch và siêu âm mô tả

Trang nguồn: **90-92**. Bảng Doppler có một hàng theo mạch và cột theo bên. Một số đo phải giữ cả mạch, bên và nhãn chỉ số.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| DP001 | Loại mạch được đo | Danh mục/văn bản, lặp | 90 | Mẫu | Giữ nhãn mạch ở hàng của bảng |
| DP002 | Bên đo | Danh mục trái/phải | 90 | Mẫu | Là thuộc tính của từng số đo, không phải giới tính |
| DP003 | Vs theo mạch và bên | Số; đơn vị chưa in | 90 | Mẫu | Cần chuyên môn xác nhận đơn vị trước khi chuẩn hóa |
| DP004 | Vd theo mạch và bên | Số; đơn vị chưa in | 90 | Mẫu | Không lấy đơn vị của kết quả siêu âm tim |
| DP005 | RI theo mạch và bên | Số; đơn vị cần xác nhận | 90 | Mẫu | Giữ nhãn, không tự tính lại |
| DP006 | Mô tả bên phải | Văn bản | 90 | Mẫu | Không gộp với bên trái |
| DP007 | Mô tả bên trái | Văn bản | 90 | Mẫu | Giữ vị trí theo mô tả |
| DP008 | Cơ quan/vùng mô tả siêu âm bụng | Danh mục/văn bản, lặp | 91 | Tách | Nguồn ghi theo cơ quan; cần tách khi chọn cấu trúc chi tiết |
| DP009 | Mô tả từng cơ quan/vùng bụng | Văn bản | 91 | Tách | Gắn với cơ quan/vùng đúng nguồn |
| DP010 | Loại mạch/vùng chi dưới trong mô tả | Danh mục/văn bản | 92 | Tách | Khác bảng mạch cảnh; không tạo số đo không có trong phiếu |
| DP011 | Mô tả mạch chi dưới theo vị trí/bên | Văn bản | 92 | Tách | Giữ ngữ cảnh hai bên nếu nội dung gộp |
| DP012 | Kết luận khảo sát | Văn bản | 90-92 | Mẫu | Tái sử dụng IM007 |

<a id="hl"></a>

## HL - Holter: kết luận, báo cáo thiết bị và bảng theo thời gian

Trang nguồn: **77-89**. Một đợt ghi có báo cáo thiết bị 12 trang, bảng theo khoảng thời gian, đoạn sóng và kết luận người đọc. Cùng loại chỉ số ở phần tổng/hàng giờ phải giữ phạm vi thời gian; không nhân bản thành nhiều người bệnh.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| HL001 | Kết luận bác sĩ | Văn bản | 77 | Mẫu | Kết luận lâm sàng tách khỏi thống kê máy |
| HL002 | Ngày giờ phiếu kết luận | Ngày giờ | 77 | Mẫu | Giữ mốc nguồn, xác minh quan hệ với thời gian ghi/phân tích |
| HL003 | Bác sĩ trả kết quả | Tham chiếu nhân sự | 77 | Mẫu | Khác Reading Physician có thể chưa điền ở báo cáo máy |
| HL004 | Serial của báo cáo máy | Chuỗi | 78-89 | Mẫu | Nhận diện theo nhãn Serial; chưa khẳng định là serial thiết bị đeo |
| HL005 | Version của báo cáo/phần mềm | Chuỗi phiên bản | 78-89 | Mẫu | Giữ nhãn Version, không dùng làm phiên bản hồ sơ bệnh nhân |
| HL006 | Số trang trong báo cáo máy | Số nguyên | 78-89 | Mẫu | Page ... of ...; khác số trang PDF chung |
| HL007 | Tổng số trang báo cáo máy | Số nguyên | 78-89 | Mẫu | Bộ nguồn có 12 trang; liên kết cùng báo cáo |
| HL008 | Last Name từ thiết bị | Văn bản nguồn | 78 | Mẫu | Có cách nhập khác tên hành chính; cần đối chiếu, không tự tách tên pháp lý |
| HL009 | First Name từ thiết bị | Văn bản nguồn | 78 | Mẫu | Giữ nhãn/giá trị riêng, không suy là tên gọi hành chính |
| HL010 | Middle Initial từ thiết bị | Văn bản nguồn | 78 | Mẫu | Có ô dù trống |
| HL011 | ID Number từ thiết bị | Chuỗi nguồn | 78 | Mẫu | Cần xác nhận ý nghĩa; không mặc định là mã bệnh nhân |
| HL012 | Date of Birth từ thiết bị | Ngày/văn bản nguồn | 78 | Mẫu | Có ô dù trống; không thay bằng ngày xét nghiệm |
| HL013 | Sex từ thiết bị | Danh mục nguồn | 78 | Mẫu | Cần mapping được xác nhận trước khi gộp K08 |
| HL014 | Source | Văn bản/chuỗi nguồn | 78 | Mẫu | Nhãn máy chưa đủ để xác định cơ sở cấp mã |
| HL015 | Billing Code | Chuỗi nguồn | 78 | Mẫu | Không tự coi là số tiền hoặc mã BHYT |
| HL016 | Recorder Format | Văn bản/phiên bản | 78 | Mẫu | Định dạng bộ ghi theo nhãn |
| HL017 | Reason for Test | Văn bản | 78 | Mẫu | Có ô dù trống; không suy từ chẩn đoán ở phiếu khác |
| HL018 | Medications trên máy | Văn bản | 78 | Mẫu | Danh sách khai trên máy, khác đơn thuốc có cấu trúc |
| HL019 | Physician trên máy | Văn bản/tham chiếu | 78 | Mẫu | Tên có thể viết tắt; xác minh trước khi liên kết nhân sự |
| HL020 | Scanned By | Văn bản/tham chiếu | 78 | Mẫu | Giữ vai trò theo nhãn máy |
| HL021 | Reading Physician | Văn bản/tham chiếu | 78 | Mẫu | Khác Physician; có thể trống |
| HL022 | Test Date | Ngày | 78 | Mẫu | Không tự coi là ngày phân tích |
| HL023 | Analysis Date | Ngày | 78 | Mẫu | Ngày phân tích theo máy |
| HL024 | Hookup Time | Giờ | 78 | Mẫu | Giờ bắt đầu gắn/ghi theo nhãn; cần ngày và múi giờ nếu chuẩn hóa |
| HL025 | Recording Time | Khoảng thời gian | 78 | Mẫu | Thời lượng ghi, không phải timestamp |
| HL026 | Analysis Time | Khoảng thời gian | 78 | Mẫu | Thời lượng được phân tích, khác Recording Time |
| HL027 | User Field 1 | Văn bản nguồn | 78 | Mẫu | Chưa xác định ý nghĩa, không tạo trường lâm sàng bắt buộc |
| HL028 | User Field 2 | Văn bản nguồn | 78 | Mẫu | Chưa xác định ý nghĩa |
| HL029 | Total Beats | Số nguyên, nhịp | 78 | Mẫu | Tổng của phạm vi báo cáo máy |
| HL030 | Beat analyzed percentage | Số, % | 78 | Mẫu | Tỷ lệ được phân tích, khác số nhịp |
| HL031 | Min HR | Số, BPM | 78-83 | Mẫu | Nhịp nhỏ nhất theo báo cáo; khác từng khoảng thời gian |
| HL032 | Thời điểm Min HR | Giờ | 78 | Mẫu | Có trong phần tổng; cần kết hợp ngày đúng khoảng ghi |
| HL033 | Avg HR | Số, BPM | 78-83 | Mẫu | Nhịp trung bình của phạm vi thời gian |
| HL034 | Max HR | Số, BPM | 78-83 | Mẫu | Nhịp lớn nhất của phạm vi thời gian |
| HL035 | Thời điểm Max HR | Giờ | 78 | Mẫu | Nguồn phần tổng ghi giờ riêng |
| HL036 | ASDNN 5 | Số, msec | 78 | Mẫu | Giữ viết tắt và phương pháp báo cáo |
| HL037 | SDANN 5 | Số, msec | 78 | Mẫu | Chỉ số riêng theo nhãn |
| HL038 | SDNN | Số, msec | 78 | Mẫu | Không gộp với SDANN |
| HL039 | RMSSD | Số, msec | 78 | Mẫu | Giữ nhãn |
| HL040 | QT Min | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Dấu '-' là chưa có kết quả, không phải 0 |
| HL041 | QT Avg | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Cần quy ước nguồn |
| HL042 | QT Max | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Cần quy ước nguồn |
| HL043 | QTc Min | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Khác QT Min |
| HL044 | QTc Avg | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Khác QT Avg |
| HL045 | QTc Max | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Khác QT Max |
| HL046 | QTc vượt ngưỡng máy | Giá trị/thống kê nguồn | 78 | Mẫu | Ngưỡng nằm trong nhãn máy; chưa đủ xác định đơn vị thống kê hoặc quy tắc cảnh báo |
| HL047 | Kênh ST | Danh mục Ch1/Ch2/Ch3 | 78 | Mẫu | Thuộc từng số đo ST |
| HL048 | Min ST Level | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Lặp theo kênh |
| HL049 | Max ST Level | Số hoặc dấu thiếu; đơn vị cần chốt | 78 | Mẫu | Lặp theo kênh |
| HL050 | ST Episodes | Số đợt hoặc giá trị nguồn | 78 | Mẫu | Lặp theo kênh; dấu thiếu giữ riêng |
| HL051 | Sinus Beats trong Pacer Analysis | Số/giá trị nguồn | 78 | Mẫu | Không suy từ Total Beats |
| HL052 | Paced Beats | Số/giá trị nguồn | 78 | Mẫu | Giữ nhãn máy |
| HL053 | Atrial Paced | Số/giá trị nguồn | 78 | Mẫu | Giữ nhãn máy |
| HL054 | Ventricular Paced | Số/giá trị nguồn | 78 | Mẫu | Giữ nhãn máy |
| HL055 | Dual Paced Beats | Số/giá trị nguồn | 78 | Mẫu | Giữ nhãn máy |
| HL056 | Fusion Beats | Số/giá trị nguồn | 78 | Mẫu | Giữ nhãn máy |
| HL057 | FTO | Giá trị nguồn | 78 | Mẫu | Chưa diễn giải viết tắt, cần tài liệu thiết bị nếu tích hợp |
| HL058 | FTS | Giá trị nguồn | 78 | Mẫu | Chưa diễn giải viết tắt |
| HL059 | FTC | Giá trị nguồn | 78 | Mẫu | Chưa diễn giải viết tắt |
| HL060 | Total VE Beats | Số nhịp | 78, 83 | Mẫu | Khác VE theo từng khoảng |
| HL061 | Tỷ lệ Total VE Beats | Số, % | 78 | Mẫu | Tách tỷ lệ khỏi số nhịp trong một ô |
| HL062 | Vent Runs/VRun Events | Số đợt | 78, 83 | Mẫu | Giữ phạm vi tổng hoặc hàng giờ |
| HL063 | VRun Beats | Số nhịp | 78, 83 | Mẫu | Số nhịp thuộc các đợt, khác số đợt |
| HL064 | VRun Longest/Max Len | Số/độ dài theo nguồn | 78, 83 | Mẫu | Đơn vị cần xác nhận theo báo cáo |
| HL065 | VRun Fastest/Max BPM | Số, BPM | 78, 83 | Mẫu | Giữ phạm vi đo |
| HL066 | Triplets/Tplt | Số sự kiện | 78, 83 | Mẫu | Tên máy, chưa dùng làm chẩn đoán |
| HL067 | Couplets/Cplt | Số sự kiện | 78, 83 | Mẫu | Không gộp với Atrial Pairs |
| HL068 | Single PVC | Số nhịp | 78, 83 | Mẫu | Tách phần Single trong ô gộp |
| HL069 | Interpolated PVC | Số nhịp | 78, 83 | Mẫu | Tách phần Interp trong ô gộp |
| HL070 | R on T | Giá trị/count theo nguồn | 78, 83 | Mẫu | Cột hàng giờ có nhãn Rate; đơn vị/định nghĩa cần chốt |
| HL071 | Single VE | Số nhịp | 78, 83 | Mẫu | Tách từ Single/Late VE |
| HL072 | Late VE | Số nhịp | 78, 83 | Mẫu | Giữ tham số phân loại máy |
| HL073 | Ventricular bigeminy beats | Số nhịp | 78, 83 | Mẫu | Tách từ Bi/Trigeminy; có Setting trong bảng |
| HL074 | Ventricular trigeminy beats | Số nhịp | 78, 83 | Mẫu | Khác bigeminy |
| HL075 | Total SVE Beats | Số nhịp | 78, 80 | Mẫu | Tổng hoặc hàng giờ theo phạm vi |
| HL076 | Tỷ lệ Total SVE Beats | Số, % | 78 | Mẫu | Tách phần trăm trong ô gộp |
| HL077 | Atrial Runs/ARun Events | Số đợt | 78, 81 | Mẫu | Tách số đợt và số nhịp |
| HL078 | ARun Beats | Số nhịp | 78, 81 | Mẫu | Không gộp với số đợt |
| HL079 | ARun Longest/Max Len | Số/độ dài theo nguồn | 78, 81 | Mẫu | Đơn vị cần chốt |
| HL080 | ARun Fastest/Max BPM | Số, BPM | 78, 81 | Mẫu | Giữ phạm vi |
| HL081 | Atrial Pairs | Số sự kiện | 78, 80 | Mẫu | Giữ nhãn, khác ventricular couplets |
| HL082 | Drop Beats | Số nhịp | 78, 80 | Mẫu | Tách từ Drop/Late ở phần tổng |
| HL083 | Late Beats trên thất | Số nhịp | 78, 80 | Mẫu | Tách phần Late, giữ loại sự kiện |
| HL084 | Longest R-R/RR Max | Số, giây ở phần tổng | 78, 80 | Mẫu | Giữ phạm vi và đơn vị của bảng khi xác nhận |
| HL085 | Thời điểm Longest R-R | Giờ | 78 | Mẫu | Không diễn giải thành sự kiện lâm sàng chưa được đọc duyệt |
| HL086 | NN Max | Số; đơn vị cần chốt theo máy | 79-80 | Mẫu | Cột ở bảng theo giờ, có mô tả trong narrative |
| HL087 | Single PAC | Số nhịp | 78, 80 | Mẫu | Giữ nhãn máy |
| HL088 | Atrial bigeminy beats | Số nhịp | 78, 80 | Mẫu | Giữ loại sự kiện |
| HL089 | Atrial trigeminy beats | Số nhịp | 78, 80 | Mẫu | Giữ loại sự kiện |
| HL090 | AFib Beats | Số nhịp | 78, 80 | Mẫu | Không tự kết luận chẩn đoán từ thống kê |
| HL091 | Tỷ lệ AFib Beats | Số, % | 78 | Mẫu | Phần trăm tách số nhịp |
| HL092 | AFib Duration | Khoảng thời gian | 78, 80 | Mẫu | Phần tổng ghi phút; bảng theo giờ dùng dạng thời gian |
| HL093 | AFib Events | Số đợt | 78 | Mẫu | Khác số nhịp và thời lượng |
| HL094 | Brady Events | Số đợt | 81 | Mẫu | Giữ Setting và phạm vi bảng |
| HL095 | Brady Duration | Khoảng thời gian | 79, 81 | Mẫu | Phân biệt thời lượng từng khoảng và tổng |
| HL096 | Tachy Events | Số đợt | 81 | Mẫu | Không lấy ngưỡng in làm quy tắc cảnh báo chung |
| HL097 | Tachy Duration | Khoảng thời gian | 81 | Mẫu | Giữ phạm vi thời gian |
| HL098 | Time Ending của khoảng thống kê | Giờ | 80-81, 83 | Mẫu | Cần ngày/ranh giới qua nửa đêm để chuẩn hóa |
| HL099 | Setting của loại thống kê | Văn bản/số và đơn vị theo nguồn | 80-81, 83 | Mẫu | Cấu hình máy: ngưỡng, số chu kỳ...; không phải kết quả bệnh nhân |
| HL100 | Narrative Summary | Văn bản | 79 | Mẫu | Tóm tắt tự động máy, khác kết luận bác sĩ |
| HL101 | Interpretation | Văn bản | 78 | Mẫu | Giữ nội dung nguồn và người duyệt nếu xác minh |
| HL102 | Ngày/dấu ký trong báo cáo máy | Ngày/dấu ký nguồn | 78 | Mẫu | Ô Signed/Date có thể trống; không suy từ lịch sử Printed |
| HL103 | Morphology Index: thời điểm | Giờ | 85, 87-88 | Mẫu | Thuộc từng cụm hình thái |
| HL104 | Morphology Index: nhãn phân loại | Văn bản/danh mục máy | 85, 87-88 | Mẫu | Không dùng làm tên bệnh nhân hay chẩn đoán |
| HL105 | Morphology Index: số nhịp | Số nhịp | 85, 87-88 | Mẫu | Thuộc một nhóm hình thái |
| HL106 | Morphology Index: BPM | Số, BPM hoặc dấu thiếu | 85, 87-88 | Mẫu | Dấu thiếu giữ riêng |
| HL107 | Strip Index: thời điểm | Giờ | 85-86 | Mẫu | Mốc của đoạn sóng được chọn |
| HL108 | Strip Index: nhãn sự kiện | Văn bản/danh mục | 85-86 | Mẫu | Max HR/PAC/Min HR hoặc nhãn nguồn |
| HL109 | Strip Index: số thứ tự đoạn | Số nguyên | 85-88 | Mẫu | Không phải mã lần khám |
| HL110 | Strip Index: tổng số đoạn | Số nguyên | 85-88 | Mẫu | Giữ nhóm strips hoặc morphology riêng |
| HL111 | Strip Index: kích cỡ/scale | Văn bản theo máy | 85-86 | Mẫu | Giữ nhãn Size; chưa dùng làm số đo bệnh nhân |
| HL112 | Đồ thị/sóng điện tim | Tham chiếu tài liệu/đoạn | 82, 84, 86-88 | Tách | Giữ tệp/ảnh nguồn và vị trí, không OCR toàn bộ sóng thành số |
| HL113 | Annotation | Chuỗi mã ký hiệu | 89 | Mẫu | Chú giải máy, không phải ghi nhận một sự kiện cụ thể |
| HL114 | Sample Color | Chuỗi/danh mục màu | 89 | Mẫu | Metadata chú giải |
| HL115 | Beat Classification | Văn bản/danh mục máy | 89 | Mẫu | Mapping của ký hiệu, phải gắn phiên bản |
| HL116 | Report Change History: User ID | Chuỗi nguồn | 89 | Mẫu | Không tự liên kết với tài khoản dự án |
| HL117 | Report Change History: Date | Ngày giờ theo nguồn | 89 | Mẫu | Lịch sử thay đổi báo cáo |
| HL118 | Report Change History: Reason | Văn bản/danh mục máy | 89 | Mẫu | Saved/Edited/Printed... là sự kiện báo cáo |
| HL119 | Report Change History: Comment | Văn bản | 89 | Mẫu | Có thể trống |

<a id="pr"></a>

## PR - Biên bản can thiệp

Trang nguồn: **96-97**. Một thủ thuật có nhiều mốc và nội dung chuyên môn. Các trường nằm trong đoạn văn được đánh dấu Tách; cách diễn giải phải được chuyên môn xác nhận.

| Mã | Trường / ý nghĩa | Kiểu dự kiến / đơn vị | Trang PDF | Cơ sở | Cách ghi / cần chốt |
| --- | --- | --- | --- | --- | --- |
| PR001 | Tên thủ thuật thực hiện | Văn bản/danh mục | 96-97 | Mẫu | Khác chỉ định dự kiến |
| PR002 | Ngày vào viện trong biên bản | Ngày | 96-97 | Mẫu | Liên hệ K36, giữ độ chính xác nguồn |
| PR003 | Số HSBA | Chuỗi mã | 96-97 | Mẫu | Xác minh loại mã; không tự coi là số vào viện hay mã điều trị |
| PR004 | Thời gian khởi phát | Ngày giờ hoặc văn bản | 96-97 | Mẫu | Giữ riêng các nguồn khi có khác biệt |
| PR005 | Thời gian nhập viện trong biên bản | Ngày giờ | 96-97 | Mẫu | Không âm thầm ghi đè thời gian ở phiếu hành chính |
| PR006 | NIHSS | Số điểm | 96-97 | Mẫu | Giữ thời điểm và người đánh giá; không chốt thuật toán từ mẫu |
| PR007 | Triệu chứng thần kinh khu trú | Văn bản | 96-97 | Mẫu | Nguồn có nhãn TKKT, cần xác nhận tên chuẩn |
| PR008 | Thuốc r-tPA đã ghi | Văn bản/trạng thái | 96-97 | Tách | Không tự suy đã dùng từ việc nhãn có trên phiếu |
| PR009 | Liều r-tPA được ghi | Số kèm đơn vị/văn bản | 96-97 | Tách | Chỉ tách nếu ghi rõ; không điền từ phác đồ |
| PR010 | Thời gian bắt đầu r-tPA | Ngày giờ/văn bản | 96-97 | Tách | Chỉ khi nguồn cung cấp |
| PR011 | Hình ảnh CLVT/MRI được tóm tắt | Văn bản | 96-97 | Mẫu | Liên hệ báo cáo gốc khi có bằng chứng |
| PR012 | ASPECTS được ghi trong mô tả | Số điểm | 96-97 | Tách | Giữ nguồn/thời điểm; chưa xác nhận thang phiên bản |
| PR013 | Giờ bắt đầu can thiệp | Giờ | 96-97 | Mẫu | Cần ngày để chuẩn hóa, không tự lấy giờ nhập viện |
| PR014 | Giờ kết thúc can thiệp | Giờ | 96-97 | Mẫu | Giữ riêng với giờ ký biên bản |
| PR015 | Phương pháp vô cảm | Văn bản/danh mục | 96-97 | Mẫu | Thực tế ghi trong biên bản, khác dự kiến trong cam kết |
| PR016 | Cách thức tiến hành | Văn bản | 96-97 | Mẫu | Giữ đoạn nguồn; không tạo quy trình điều trị tự động |
| PR017 | Vị trí/bên đường vào | Danh mục/văn bản | 96-97 | Tách | Tách từ mô tả chỉ khi rõ |
| PR018 | Thiết bị/vật tư trong can thiệp | Văn bản/danh sách | 96-97 | Tách | Cần đối chiếu chứng từ vật tư trước khi gán mã kho |
| PR019 | Số lần thao tác được ghi | Số và loại thao tác | 96-97 | Tách | Phân biệt từng thao tác; không cộng tổng khác loại |
| PR020 | Kết quả tái thông | Văn bản | 96-97 | Mẫu | Giữ kết luận nguồn |
| PR021 | TICI được ghi | Số/mã thang điểm | 96-97 | Tách | Giữ tên thang, cần chuyên môn duyệt mapping |
| PR022 | Tình trạng trong/sau thủ thuật | Văn bản | 96-97 | Mẫu | Phân biệt trước, trong và sau nếu nguồn rõ |
| PR023 | Biến chứng trong/ngay sau thủ thuật | Văn bản/trạng thái | 96-97 | Mẫu | Khác biến chứng xuất hiện về sau |
| PR024 | Đóng đường vào | Văn bản/danh mục | 96-97 | Mẫu | Giữ phương pháp/vật tư được ghi |
| PR025 | Theo dõi tại bệnh phòng | Văn bản | 96-97 | Mẫu | Không mặc định các yêu cầu đã được thực hiện |
| PR026 | Mốc bắt đầu và thời lượng theo dõi | Ngày giờ/khoảng thời gian | 96-97 | Tách | Tách khi có nguồn rõ; chưa biến thành lịch tự động |
| PR027 | Kết luận biên bản | Văn bản | 96-97 | Mẫu | Khác từng thống kê/thang điểm |
| PR028 | Yêu cầu kiểm tra lại | Văn bản/khoảng thời gian | 96-97 | Tách | Là kế hoạch/chỉ định, không chứng minh đã có kết quả |
| PR029 | Ngày giờ ký/lập biên bản | Ngày giờ theo nguồn | 97 | Mẫu | Phần cuối trang 97 thuộc cùng biên bản |
| PR030 | Người ký/thực hiện | Tham chiếu nhân sự | 97 | Mẫu | Xác minh vai trò, không suy từ tên trên trang khác |

## Khi bàn giao nhóm trường này

Ghi các mã đã chọn vào bảng bàn giao ở tài liệu chung, thống nhất tên trường kỹ thuật và nơi lưu cùng BE. Trường chưa chốt giữ CXT; không dùng đơn vị đoán, mặc định checkbox hoặc ngưỡng in sẵn để triển khai validation.
