# Từ điển dữ liệu và khảo sát hồ sơ mẫu

**Ngày rà soát:** 09/10/2026. **Nguồn:** S01, PDF mẫu mentor gửi gồm 195 trang. **Trạng thái:** bản đặc tả để nhóm kiểm tra và chọn phạm vi; phần sử dụng từ bộ mẫu S01 còn cần mentor xác nhận.

Tài liệu này trả lời: mẫu có những trường gì, chúng xuất hiện ở đâu, nên ghi theo kiểu/đơn vị nào và điểm nào còn cần xác nhận. Bản tổng quan trước đã kiểm kê toàn bộ 195 trang và chi tiết 104 dòng nền tảng. Bộ này mở rộng các nhóm còn lại thành **983 dòng đặc tả**, gồm cả trường nguồn, trường tách và metadata đề xuất.

**983 dòng không phải 983 cột database hay 983 ô cần xây ngay.** Một khái niệm có thể dùng trong nhiều tài liệu; một dòng có thể mô tả cấu trúc tái sử dụng. Việc đọc hết nguồn cũng không có nghĩa số hóa toàn bộ nội trú trong MVP. [Kế hoạch dự án](../PROJECT_PLAN.md) hiện chọn phòng khám tư với MVP-1 lõi lâm sàng và MVP-2 vận hành; việc bổ sung nhóm nội trú cần quyết định chung.

Khung trường MVP từ bản `main` mới nhất được giữ tại **mục 10**. Mã kỹ thuật dạng `patient.ma_noi_bo` trong khung MVP và mã khảo sát như K01 có vai trò khác nhau; người 3 cùng BE sẽ ghi ánh xạ khi chọn trường. Các cột B/T/Đk, FHIR và openEHR của khung là đề xuất cần xác nhận, chưa chứng minh API hỗ trợ trên baseline.

## Metadata triển khai sau khi chốt với BE (10/10/2026)

Bộ MVP `0.1.0` đã được cụ thể hóa tại [METADATA.md](METADATA.md) và [bảng 165 trường](data/MVP_METADATA_FIELDS.md). Nguồn máy đọc nằm ở `metadata/vinshc/pack.json`; UUID, enum, required theo nghiệp vụ, validation và CSV Initializer được quản lý tại đó. Khảo sát 983 dòng S01 bên dưới vẫn giữ nguyên để tra nguồn; các CXT ở khảo sát không thay thế contract triển khai mới.

BE bắt đầu bằng identifier/attribute/type/concept đã cấp UUID và map 8 sinh hiệu khớp FE. Các danh mục ICD-10, thuốc, dịch vụ/giá, tỉnh/xã còn cần nguồn/phiên bản; form/role/DTO cần được FE/BE và người 4 tích hợp, không được tự coi là đã triển khai vì có file đặc tả. Kết quả kiểm chứng thực tế ghi tại [METADATA_VALIDATION.md](METADATA_VALIDATION.md).

## 1. Người 3 nên đọc và làm gì trước

1. Đọc mục 2 để hiểu cách đọc bảng, rồi đọc [trường nền tảng](data/CORE_FIELDS.md). Kiểm tra tên trường và ý nghĩa cùng BE, ưu tiên người bệnh, lượt khám, sinh hiệu, bệnh sử và chẩn đoán.
2. Đọc [diễn biến, chỉ định và thuốc](data/ORDERS_AND_MEDICATIONS.md), bắt đầu nhóm DR/YL. Thống nhất diễn biến khác chỉ định, đơn thuốc và thuốc đã dùng.
3. Đưa các nhóm dự kiến dùng vào bảng mục 7; trạng thái chưa có quyết định để **CXT**. Bản nháp này có thể bàn giao BE ngay để kiểm tra cách lưu.
4. Cùng mentor chọn phần triển khai trước và duyệt quy tắc bắt buộc/danh mục/đơn vị. Cùng BE chốt tên trường kỹ thuật và cách lưu; cùng FE chốt form.
5. Sau khi chốt, tạo metadata và dữ liệu giả theo các mã đã chọn, kiểm tra lưu rồi đọc lại trên backend thật. Các đầu việc DATA-01 đến DATA-10 tiếp tục theo [kế hoạch](../PROJECT_PLAN.md).

| Phần tra cứu | Mã nhóm | Dòng đặc tả | Nội dung |
| --- | --- | --- | --- |
| [Trường nền tảng](data/CORE_FIELDS.md) | K01-K104 | 104 | Người bệnh, địa chỉ, bảo hiểm, tiếp nhận, khám, chẩn đoán, kết thúc |
| [Diễn biến, chỉ định và thuốc](data/ORDERS_AND_MEDICATIONS.md) | DR, YL, CD, RX, AD, IF | 132 | Ghi chép, yêu cầu dịch vụ, kê đơn, thực hiện, truyền dịch |
| [Kết quả và can thiệp](data/DIAGNOSTIC_RESULTS.md) | LB, LA, IM, EC, DP, HL, PR | 342 | Xét nghiệm, hình ảnh, siêu âm tim/Doppler, Holter, biên bản can thiệp |
| [Chăm sóc và đánh giá](data/CARE_AND_ASSESSMENTS.md) | NU, SC, FL, NT, SW | 169 | Chăm sóc theo thời điểm, điểm đánh giá, dịch vào/ra, dinh dưỡng, nuốt |
| [Giấy tờ và viện phí](data/DOCUMENTS_AND_BILLING.md) | CO, CS, RS, SR, DC, SM, FI, DOC | 236 | Hội chẩn, cam kết, an toàn, ra viện, tóm tắt, tài chính, nguồn/phiên bản |

## 2. Cách đọc một dòng

| Cột | Ý nghĩa |
| --- | --- |
| Mã | Mã thảo luận nội bộ, ví dụ K73 hoặc YL008; không phải UUID/concept/mã chuẩn hay mã bệnh nhân |
| Trường / ý nghĩa | Tên thông tin cần phân biệt. Tên kỹ thuật/API sẽ được chốt với BE |
| Kiểu dự kiến / đơn vị | Gợi ý cách biểu diễn để tránh mất dữ liệu; chưa phải schema đã được duyệt |
| Trang PDF | Trang vật lý của S01, tính từ 1; khác số trang của báo cáo con in trên phiếu |
| Cơ sở | Mẫu, Tách hoặc Đề xuất như bảng dưới |
| Cách ghi / cần chốt | Bối cảnh, quan hệ, thông tin thiếu và giới hạn cần kiểm tra |

| Cơ sở | Cách hiểu |
| --- | --- |
| Mẫu | Có nhãn, ô hoặc chỉ số nhìn thấy trong nguồn. Không đồng nghĩa bắt buộc hoặc có giá trị đã điền |
| Tách | Tách từ ô gộp/đoạn văn/đồ thị. Chỉ nhận giá trị cấu trúc khi có bằng chứng và đã đối chiếu |
| Đề xuất | Nhóm bổ sung để truy vết, liên kết, phiên bản hoặc xác minh; không giả là trường có sẵn trên mẫu |

**CXT = cần xác nhận.** Các dòng khảo sát S01 chưa chốt trường bắt buộc, giới hạn giá trị, mã chuẩn, phiên bản thang điểm, thuật toán, quyền và tập được chọn cho MVP. Khung MVP ở mục 10 có B/T/Đk và mapping dự kiến từ bản khung trên `main`; các giá trị này vẫn cần duyệt và kiểm chứng. Một ô điền trên hồ sơ này không chứng minh bắt buộc cho mọi người bệnh. Các lựa chọn in sẵn không chứng minh đó là toàn bộ danh mục của hệ thống.

Kiểu “điểm và nhãn” là cấu trúc gồm giá trị điểm, nhãn nguồn, tên/phiên bản thang, thời điểm và trạng thái xác minh. Kiểu “văn bản và mã” cần giữ văn bản, mã, hệ mã/phiên bản và vai trò. Kiểu “người/vai trò” cần giữ định danh người, tên hiển thị và vai trò trong đúng sự kiện. Không ghép những phần này thành một chuỗi mất cấu trúc.

## 3. Quy tắc dữ liệu cần thống nhất với BE

| Chủ đề | Quy tắc làm việc đề xuất | Điểm cần chốt |
| --- | --- | --- |
| Mã định danh | Lưu chuỗi, giữ số 0 đầu; kèm loại mã và hệ thống/cơ sở cấp. Không gộp theo tên | Mã nào xác định patient, episode, encounter và tài liệu trong instance |
| Một hồ sơ theo thời gian | Một người có nhiều lượt/đợt; mỗi lượt có nhiều lần ghi nhận, chỉ định, kết quả, thuốc và tài liệu | BE xác nhận loại đối tượng và liên kết thực tế của baseline |
| Trường lặp | Mỗi thuốc/chỉ số/người tham gia/chuyển khoa/lần đo là một phần tử có bối cảnh | Khóa dòng, thứ tự, cách sửa và giữ lịch sử |
| Thời gian | Tách khởi phát, đo, chỉ định, lấy/nhận mẫu, thực hiện, lập, ký và in. Giữ độ chính xác ngày/giờ nguồn | Múi giờ, cách lưu thời gian chưa đầy đủ; không tự thêm 00:00 |
| Đơn vị | Giữ đơn vị nguyên bản; giá trị chuẩn hóa lưu riêng khi có quy tắc được duyệt | Hệ mã đơn vị, đổi đơn vị, độ chính xác và cách làm tròn |
| Thiếu thông tin | Tách chưa trả lời, bị che, không đọc được, không áp dụng, chưa xác minh | Danh mục trạng thái và cách hiển thị; không thay thiếu bằng 0/Không |
| Checkbox | Đọc dấu chọn từ hình; chỉ có chữ Có/Không chưa phải đáp án | Quy tắc câu chọn một/chọn nhiều, lựa chọn mâu thuẫn và ô trống |
| Kết quả và khoảng tham chiếu | Giữ giá trị, kiểu giá trị, đơn vị, phương pháp/máy và khoảng tham chiếu theo phiếu | Khoảng tham chiếu khác giới hạn nhập và thuật toán cảnh báo |
| Thuốc | Tách nhãn, hoạt chất, hàm lượng, số lượng, đơn vị, liều/đường/tần suất/thời điểm khi đọc rõ | Danh mục thuốc; không suy hoạt chất/liều từ tên thương mại |
| Bản in và phiên bản | Liên in, scan, trang nối tiếp không tự thành sự kiện mới. Giữ mỗi bản có nguồn | Quy tắc đối chiếu bản trùng/bổ sung/thay thế và bản được duyệt |
| Chữ ký | Giữ người/vai trò, thời điểm nếu có và bằng chứng ký trong tài liệu | Quy trình ký điện tử; ảnh chữ ký hoặc tên in không tự xác nhận hiệu lực |
| Tài liệu có xung đột | Giữ từng nguồn và trạng thái cần xác minh; ghi lý do khi sửa | Người có thẩm quyền quyết định; không mặc định bản mới nhất đúng |
| Điểm và hướng dẫn in sẵn | Giữ tổng/thành phần/nhãn/thời điểm riêng, metadata hướng dẫn riêng | Phiên bản và thuật toán mentor duyệt; chưa tự chấm từ triệu chứng |
| Tệp gốc | Tham chiếu tài liệu theo quyền; lưu vị trí nguồn cho từng trường cần đối chiếu | Quyền đọc/ghi/xác minh, nơi lưu tệp và quy trình truy vết |

Ví dụ dễ hiểu: một lần xét nghiệm có thể có một phiếu chỉ định và một phiếu kết quả với nhiều chỉ số. Đơn thuốc là điều được kê; phiếu thực hiện là điều được ghi nhận đã dùng. Bảng kê chi phí là điều được tính tiền. Không tự coi ba loại là cùng một sự kiện.

## 4. Kiểm kê nguồn: toàn bộ 195 trang

Bảng này giúp tìm đúng mẫu. Các trang cuối của phiếu, ảnh và scan được giữ trong phạm vi rà soát, kể cả khi rất ít chữ trích xuất được. Mỗi cụm trang ở đây có nhóm đặc tả trong các tài liệu mục 1.

| Trang PDF | Loại tài liệu | Nhận xét để tránh hiểu sai |
| --- | --- | --- |
| 1-2 | Bệnh án nội khoa: hành chính, quản lý người bệnh, chẩn đoán, tình trạng ra viện | Một phần hồ sơ, có bảng chuyển khoa và các mục chỉ dùng trong trường hợp đặc biệt |
| 3-4 | Hỏi bệnh, khám, tóm tắt, chẩn đoán, tiên lượng, hướng điều trị | Sinh hiệu có số và đơn vị; nhiều nội dung khác là đoạn văn |
| 5 | Phiếu khám bệnh vào viện | Có thông tin tiếp nhận cấp cứu; nhiều trường trùng nhóm hành chính |
| 6-63 | Tờ điều trị và phiếu thực hiện y lệnh | Lặp theo thời điểm/ngày; có trang nối tiếp. Ghi diễn biến khác với chỉ định và thực hiện |
| 64-72 | Phiếu chỉ định | Gồm các yêu cầu dịch vụ khác nhau; một phiếu có thể có nhiều dòng yêu cầu |
| 73 | Phiếu tổng hợp chỉ định và hướng dẫn bệnh nhân | Tổng hợp các yêu cầu; không tạo thêm kết quả xét nghiệm chỉ vì dịch vụ xuất hiện lại |
| 74-76 | Siêu âm tim Doppler | Số đo, phương pháp đo, sơ đồ, kết luận và ảnh đính kèm |
| 77 | Phiếu trả kết quả Holter điện tâm đồ | Báo cáo kết luận của người đọc kết quả |
| 78-89 | Báo cáo Holter từ thiết bị | Bộ báo cáo 12 trang: số liệu, bảng, đồ thị, điện tim, chú giải; không phải 12 lần khám |
| 90 | Siêu âm Doppler mạch cảnh | Bảng theo bên trái/phải và loại mạch; không thấy đơn vị Vs/Vd in trong bảng |
| 91 | Siêu âm ổ bụng | Mô tả theo cơ quan và kết luận |
| 92 | Siêu âm Doppler động mạch/tĩnh mạch chi dưới | Mô tả và kết luận |
| 93-94 | Báo cáo CT mạch máu não | Một báo cáo nối sang trang 94 |
| 95 | Báo cáo CT sọ não | Báo cáo riêng, cần thời điểm và yêu cầu liên quan |
| 96-97 | Biên bản can thiệp | Trang 97 là phần cuối/ký của biên bản |
| 98 | Báo cáo MRI | Mô tả, kết luận và ký |
| 99 | Phiếu chụp X-quang | Mô tả, kết luận và ký |
| 100-104 | Phiếu kết quả xét nghiệm | Huyết học, đông máu, hóa sinh/miễn dịch; có nhiều lần lấy mẫu và nhiều chỉ số |
| 105-109 | Phiếu theo dõi truyền dịch | Từng lần truyền, tốc độ, thời điểm bắt đầu/kết thúc, lô và người thực hiện |
| 110-114 | Biên bản hội chẩn | Hội chẩn cấp cứu/liên khoa/chuyên khoa; trang 111-112 là một biên bản nhiều trang |
| 115-123 | Đơn thuốc | Nhiều đơn; trang 123 có lời dặn khám lại và thuốc sau điều trị |
| 124-125 | Giấy cam kết chấp thuận phẫu thuật, thủ thuật và gây mê hồi sức | Một cam kết có phần bác sĩ và người bệnh/thân nhân |
| 126-127 | Bảng kiểm an toàn điện quang | Hai bản có bối cảnh chẩn đoán khác nhau; nhiều câu chưa đánh dấu trả lời |
| 128-146 | Phiếu thực hiện thuốc | Lặp theo ngày/ca; có thuốc và vật tư, người thực hiện, người nhà ký |
| 147 | Phiếu thu tạm ứng viện phí | Một giao dịch tạm ứng, khác với tổng chi phí điều trị |
| 148 | Đánh giá rối loạn nuốt tại giường | Phiếu scan, nhiều checkbox và chữ viết tay; không được bỏ qua vì ít chữ trích xuất |
| 149-150 | Giấy khám bệnh theo yêu cầu | Hai bản cùng loại; có phần lựa chọn dịch vụ và cam kết thanh toán |
| 151-177 | Phiếu chăm sóc cấp 2-3 | Nhiều thời điểm trên một bảng; mỗi phiếu kéo dài 3-4 trang |
| 178 | Sàng lọc dinh dưỡng nội trú — điều dưỡng | Cân nặng, chiều cao, BMI, câu hỏi sàng lọc |
| 179-181 | Đánh giá dinh dưỡng nội trú — bác sĩ | Gồm sàng lọc, đánh giá, kế hoạch và hướng dẫn; trang 181 là hướng dẫn tiếp |
| 182 | Sàng lọc dinh dưỡng nội trú — điều dưỡng | Một lần sàng lọc khác; không tự gộp với trang 178 |
| 183 | Giấy ra viện | Chẩn đoán, điều trị, ngày vào/ra viện, số giấy và ký |
| 184-185 | Phiếu thanh toán chi phí khám chữa bệnh | Liên 1 lưu và liên 2 giao cho người mua; không tính thành hai khoản thu |
| 186 | Phiếu thống kê chi phí khoa | Chi phí can thiệp, vật tư và nguồn thanh toán |
| 187 | Phiếu thống kê chi phí khoa — bản scan | Hình thức giống trang 186; phải kiểm tra quan hệ bản điện tử/bản ký |
| 188-190 | Bảng kê chi phí điều trị nội trú | Một bảng kê nhiều trang, có danh sách khoản mục và tổng |
| 191-192 | Bản tóm tắt hồ sơ bệnh án | Một bản tóm tắt hai trang |
| 193-194 | Bản tóm tắt hồ sơ bệnh án khác | Nội dung và thời điểm khác bản 191-192; cần giữ lịch sử phiên bản |
| 195 | Tổng kết bệnh án và giao nhận hồ sơ | Tổng kết, tình trạng ra viện, bảng số tờ, người giao/nhận |

## 5. Những điểm cần hỏi hoặc đối chiếu

| Mã | Quan sát từ nguồn | Trang | Việc cần xác minh |
| --- | --- | --- | --- |
| V01 | Mẫu chứa nội trú, chuyển khoa, cấp cứu, can thiệp, chăm sóc và viện phí; kế hoạch hiện tại là ngoại trú | 1-195; `PROJECT_PLAN.md` mục 2 | Mentor muốn lấy mẫu để tham khảo trường chung, hay đổi phạm vi sản phẩm? |
| V02 | Mã BN ở báo cáo điện quang khác mã BN hành chính, trong khi mã điều trị được lặp lại | 1, 90-92 | Mã cục bộ của phân hệ hay lỗi xuất/ghép hồ sơ? Không tự sửa hoặc gộp |
| V03 | Đơn vị acid uric trên phiếu xét nghiệm là **µmol/L**, còn bản tóm tắt ghi **mmol/L** | 104, 193 | Xác nhận đơn vị và tài liệu gốc có thẩm quyền; không tự chuyển hay lấy tóm tắt ghi đè |
| V04 | Bản tóm tắt có các dòng xét nghiệm với đơn vị viết khác phiếu kết quả | 102-104, 193-194 | Kiểm tra từng chỉ số/đơn vị và thời điểm; không coi mọi khác biệt là cùng một lần xét nghiệm |
| V05 | Có hai bản tóm tắt với nội dung và thời điểm khác nhau | 191-194 | Bản bổ sung/thay thế hay hai cách xuất? Cần quan hệ phiên bản và trạng thái duyệt |
| V06 | Mã chẩn đoán có mức chi tiết khác nhau giữa các biểu mẫu/giai đoạn | 1, 5, 183, 191-194 | Giữ giai đoạn, mã và nhãn gốc; chuyên môn quyết định mã nào sử dụng, không tự “chuẩn hóa” bằng suy đoán |
| V07 | Dòng D của phiếu thanh toán in công thức **D = B − A − C**, trong khi các khoản in không khớp cách biểu diễn đó | 184-185 | Xác nhận ý nghĩa A/B/C/D và công thức với nghiệp vụ; không sao chép công thức vào code |
| V08 | Giấy khám theo yêu cầu có ô ngày với năm in sẵn **2024**, khác năm của đợt điều trị | 149-150 | Lỗi mẫu cũ hay quy ước tài liệu? Không tự thay ngày ký bằng ngày nhập viện |
| V09 | Bảng giao nhận ghi số tờ hồ sơ khác số trang PDF | 195 | Cách đếm hồ sơ giấy và xuất PDF; không kết luận mất trang chỉ từ hai con số |
| V10 | Bảng kiểm điện quang có nhiều ô Có/Không chưa chọn; bản trích chữ vẫn đọc ra cả hai nhãn | 126-127 | Trạng thái chưa trả lời; phải xem dấu chọn, không suy câu trả lời từ việc có nhãn “Không” |
| V11 | Đồ thị chăm sóc có trục số; bảng dịch có ô tổng 0 dù thành phần có thể trống | 151-177 | Tách kết quả thật khỏi trục/thang vẽ và giá trị mặc định của báo cáo |
| V12 | Có chuỗi kỹ thuật ký/xuất PDF như `SignLibrary.SplitPdfHeaderKey`, `SINGLE_KEY__COMMENT_SIGN`, `aa`, `Text` | 6-63, 191-194 | Loại khỏi dữ liệu lâm sàng; chỉ giữ ở tài liệu gốc nếu cần |
| V13 | Có hướng dẫn, ngưỡng thang điểm, thời hạn in sẵn trên các mẫu | 115-127, 148, 151-182 | Phiên bản/quy trình nào được mentor duyệt? Không dùng mẫu này làm nguồn duy nhất cho logic tự động |
| V14 | HIV Ag/Ab được ghi trong y lệnh, nhưng chưa thấy phiếu kết quả tương ứng trong bộ nguồn | 6-7, 100-104 | Phân biệt đã chỉ định với đã có kết quả; không tự thêm kết quả âm/dương hoặc trạng thái đã thực hiện |
| V15 | Tốc độ truyền ghi theo giọt/phút ở phiếu theo dõi; hướng dẫn thuốc có nơi ghi mL/h | 105-109, 129 | Giữ số và đơn vị của từng nguồn; không tự đổi khi thiếu quy ước dụng cụ |
| V16 | Có mốc khởi phát trong lời kể mang năm khác phần tiếp nhận của đợt điều trị | 5, 8 | Đối chiếu lời kể/mốc gốc; không tự sửa năm bằng năm nhập viện |
| V17 | Nhãn thiết bị Holter và giá trị in có chỗ không phù hợp để ánh xạ thẳng thành định danh bệnh nhân | 78 | Đối chiếu Last/First/Middle Name, ID Number và nguồn cấp mã trước khi nối patient |
| V18 | Cột tỷ lệ BHYT có chỗ ghi đơn vị đồng trên đầu cột | 186, 188-190 | Xác minh nghĩa cột/tỷ lệ và cách làm tròn trước khi tự tính tiền |


Các điểm trên là vấn đề dữ liệu và phạm vi. Bản khảo sát không kết luận tình trạng bệnh hay đánh giá quyết định điều trị trong hồ sơ.

Ưu tiên chốt **V01, V02, V03, V10** trước khi chốt mô hình và nhập liệu. Các điểm tài chính/ngưỡng/phiên bản chỉ cần triển khai khi nhóm đó được đưa vào phạm vi. Không cần chờ xử lý mọi nhóm để cùng BE kiểm tra các trường nền tảng.

## 6. Phạm vi đã làm và giới hạn kiểm chứng

- Đã kiểm kê 195 trang, xem bản dựng hình của toàn bộ nguồn để nhận diện các cụm tài liệu; đối chiếu chữ và xem lại các trang bảng/scan/đồ thị, dấu chọn và trường phức tạp.
- Đã mở rộng từ 104 dòng nền tảng sang các nhóm diễn biến, dịch vụ, thuốc, kết quả, chăm sóc, đánh giá, giấy tờ và tài chính. Các trang lặp dùng chung đặc tả, giữ lần ghi nhận riêng.
- Đã phân biệt trường thấy trong nguồn, tách từ nội dung và đề xuất hệ thống; ghi trang và điều cần chốt cho từng dòng.
- Bản này kiểm kê cấu trúc và trường, **không phải bộ dữ liệu đã nhập toàn bộ giá trị của người bệnh**. Chữ viết tay, ký hiệu khó đọc và điểm đồ thị cần xác minh khi nhập thực tế.
- Ảnh siêu âm, sóng điện tim, biểu đồ và hình scan được mô tả bằng tham chiếu tệp/đoạn nguồn; chưa chuyển thành dữ liệu thiết bị gốc hay tọa độ số đầy đủ.
- PDF có phần che thông tin nhưng vẫn còn thông tin nhận dạng. Các tệp gốc, ảnh và chữ trích nằm ngoài Git theo cấu hình repo. Các tài liệu bàn giao chỉ chứa trường, nhãn và quan sát cấu trúc.
- Chưa chốt tính bắt buộc, danh mục chuyên môn, ngưỡng/thuật toán, schema, endpoint/API hoặc mapping FHIR; chưa kiểm chứng việc lưu các trường mới trên backend. Đây là phần phối hợp sau khi chọn phạm vi.

Nguồn S01 có **195 trang**, không có trường AcroForm tương tác. Dấu vân tay SHA-256 để kiểm tra đang dùng đúng bản: `557e41ae324a6ffb1f109db74e650e9b1d5de3b140105e47dc2825ff55deb1d4`. Không suy kết luận từ việc trích xuất thiếu chữ; trang scan vẫn cần xem hình.

## 7. Bảng bàn giao và ghi quyết định

Phần khảo sát S01 là đầu vào cho DATA-01. Khung MVP của nhóm được giữ ở mục 10. Người 3 quản lý nội dung; BE kiểm tra cách lưu; FE kiểm tra cách nhập/hiển thị; người 4 kiểm tra hợp đồng API và mapping. Mentor chốt phạm vi và nghiệp vụ. Các vai trò giữ theo [phân công hiện tại](../PROJECT_PLAN.md), không đổi qua tài liệu này.

### 7.1. Hàng đợi review

| Ưu tiên | Nhóm cần review | Người phối hợp | Kết quả cần ghi | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Chọn trường S01 phù hợp MVP-1/MVP-2; nhóm nội trú cần quyết định riêng | Người 3 + mentor + cả nhóm | Nhóm được làm trước; nhóm để sau; lý do | CXT |
| 2 | K01-K30, K31-K51 và các mã khác của phân hệ | Người 3 + BE | Mã cấp từ đâu, nhận diện đúng người, liên kết lượt/đợt | CXT |
| 3 | K52-K80, K81-K94 và sinh hiệu theo thời điểm | Người 3 + BE + FE + mentor | Trường form, kiểu/đơn vị, danh mục, bắt buộc và quyền | CXT |
| 4 | DR/YL/CD/RX và AD/IF nếu được chọn | Người 3 + BE + mentor | Phân biệt chỉ định/kê đơn/thực hiện và cấu trúc dòng thuốc | CXT |
| 5 | LB/LA/IM và kết quả chuyên biệt nếu được chọn | Người 3 + BE + người 4 | Liên kết yêu cầu, nguồn kết quả, đơn vị, phiên bản | CXT |
| 6 | NU/SC/FL/NT/SW nếu được chọn | Người 3 + mentor + FE | Nhãn, cách đánh giá, phiên bản, từng thời điểm và dữ liệu thiếu | CXT |
| 7 | CO/CS/RS/SR/DC/SM/FI/DOC theo phạm vi | Người 3 + BE + mentor | Quy tắc giấy tờ, phiên bản, bằng chứng ký, tài chính và quyền | CXT |
| 8 | API/mapping cho tập đã chọn | BE + người 3 + người 4 | Request/response thật, nơi lưu, giới hạn và kiểm tra đọc lại | CXT |

### 7.2. Mẫu chốt cho từng trường được chọn

Mỗi dòng dưới là gợi ý review; **CXT chưa phải quyết định của mentor/BE**. Sao chép dòng và bổ sung các mã khi nhóm thống nhất. Không đổi mã đặc tả đã được dùng để review; thêm mã mới nếu bổ sung.

| Mã đặc tả | Nhãn form dự kiến | Tên kỹ thuật / nơi lưu | Kiểu / đơn vị chuẩn | Danh mục / nguồn mã | Bắt buộc / khi nào | Thiếu hoặc sai xử lý thế nào | Phạm vi | Quyền | Trạng thái / người duyệt / ngày |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K01 | Mã bệnh nhân | CXT với BE | Chuỗi, giữ số 0 đầu | CXT hệ thống cấp | CXT | Không tự tạo từ tên | CXT | CXT | CXT |
| K05-K06 | Ngày/năm sinh | CXT với BE | Ngày hoặc năm và độ chính xác | Không áp dụng mã chuyên môn | CXT | Không tự thêm ngày 01/01 | CXT | CXT | CXT |
| K35-K36 | Đến khám / vào viện | CXT với BE | Ngày giờ theo nguồn | CXT loại sự kiện | CXT | Không lấy thời gian in thay thế | CXT | CXT | CXT |
| K73 | Nhiệt độ | CXT với BE | Số thập phân; °C nguồn | CXT mã khái niệm/đơn vị | CXT | Không thay ô trống bằng 0 | CXT | CXT | CXT |
| YL008 | Hướng dẫn dùng thuốc | CXT với BE | Văn bản nguyên bản | CXT cách cấu trúc phần tách | CXT | Không tự tính liều từ số lượng | CXT | CXT | CXT |

BE bổ sung ánh xạ vào mô hình/API thật và tài liệu kiểm chứng riêng khi đã chọn trường. Nếu một dòng ánh xạ thành nhiều đối tượng hoặc không được baseline hỗ trợ, ghi rõ lựa chọn và giới hạn. Chỉ nói “đã hỗ trợ” sau khi lưu/đọc lại bằng API thật.

### 7.3. Tiêu chí phần bàn giao dùng được để bắt đầu triển khai

- [ ] Mỗi trường được chọn có mã đặc tả và trang nguồn.
- [ ] Mentor xác nhận nhóm trong phạm vi, trường bắt buộc và quy tắc chuyên môn cần dùng.
- [ ] BE xác nhận kiểu, quan hệ, tên kỹ thuật, nơi lưu và cách cập nhật.
- [ ] FE dùng cùng nhãn/danh mục/đơn vị và cách hiển thị thiếu thông tin.
- [ ] Có danh mục/mã/phiên bản và kế hoạch nạp metadata tái lập được cho tập đã chọn.
- [ ] Có dữ liệu giả và tiêu chí kiểm tra; các mã và nguồn thật không bị đưa vào fixture.
- [ ] Người 4 và BE kiểm tra lưu/đọc lại cùng dữ liệu, thời điểm, đơn vị, trạng thái và quyền.
- [ ] Điểm chưa giải quyết có người phụ trách; tính năng phụ thuộc được giữ CXT.

Hoàn thành khảo sát nguồn không đồng nghĩa đã hoàn thành cả DATA-01 đến DATA-07. Phần metadata triển khai, mapping, fixture và kiểm chứng backend còn cần làm cho tập được nhóm chọn.

## 8. Tình huống dữ liệu giả để kiểm tra sau khi chốt

Chỉ dùng ID tự tạo như `NB-GIA-001`, `DOT-GIA-001`; đây là tiêu chí kiểm tra, chưa phải fixture/API đã chạy.

| Tình huống | Kết quả cần kiểm tra |
| --- | --- |
| Hai người cùng tên, mã khác | Không tự gộp; dữ liệu gắn đúng patient |
| Một người có hai lượt/đợt | Mỗi lần đo/thuốc/kết quả đúng lượt; lịch sử không bị ghi đè |
| Mã có số 0 đầu | Lưu và đọc lại giữ nguyên chuỗi |
| Chỉ biết năm sinh | Không tự biến thành một ngày sinh đầy đủ |
| Nguồn chỉ có ngày, phiếu khác có ngày giờ | Giữ độ chính xác khác nhau; không tự thêm giờ |
| Ô dị ứng/checkbox trống | Hiển thị chưa trả lời, khác đã hỏi và trả lời Không |
| Kết quả bị che/không đọc được | Giữ trạng thái tương ứng; không thay bằng 0 |
| Có chỉ định nhưng chưa có kết quả | Không tạo giá trị âm/dương, không tự đánh dấu hoàn tất |
| Hai kết quả cùng loại ở hai thời điểm | Giữ hai bản ghi với đơn vị/phương pháp/nguồn riêng |
| Phiếu gốc và tóm tắt khác đơn vị | Báo cần xác minh; không ghi đè hoặc tự đổi |
| Một thuốc có số lượng, liều và hướng dẫn | Không nhầm số lượng cấp thành liều mỗi lần |
| Một tốc độ theo giọt/phút, một theo mL/h | Giữ đơn vị nguồn, không đổi khi thiếu quy tắc |
| Tổng điểm có nhưng thành phần thiếu | Giữ tổng nguồn; không tự điền các thành phần |
| Hai liên in hoặc một phiếu nhiều trang | Không tăng số giao dịch/lần khám vì số trang |
| Hai bản tóm tắt khác nhau | Giữ nguồn/quan hệ phiên bản chờ xác minh |
| Người dùng vượt quyền đọc/sửa | BE/API áp dụng quyền đã chốt; FE hiển thị phù hợp |

## 9. Kiểm tra tài liệu và cập nhật về sau

Đã kiểm tra cấu trúc bảng Markdown, tính duy nhất và liên tục của mã dòng, tham chiếu mã trong ghi chú, trang nguồn trong khoảng 1-195, bảng kiểm kê phủ đủ 195 trang và các liên kết nội bộ. Đã kiểm tra nội dung bàn giao để tránh chép định danh người bệnh; đối chiếu các điểm dễ nhầm như HIV chỉ được chỉ định, đơn vị xét nghiệm, đơn vị tốc độ truyền và ô chưa chọn.

Khi bổ sung, giữ mã cũ, ghi nguồn/trạng thái cho trường mới và cập nhật bảng bàn giao. Nếu mentor chọn phạm vi khác, cập nhật quyết định và tập metadata/API tương ứng; không đổi toàn bộ kế hoạch chỉ vì nguồn có thêm một loại giấy.

## 10. Khung dữ liệu MVP của nhóm

Phần này giữ khung đã có trên `origin/main` tại commit `631f89e`, gồm tên kỹ thuật và mapping dự kiến. Việc tích hợp ở đây bảo toàn đầu vào của nhóm; không xác nhận lại các quy tắc lâm sàng hoặc mapping bằng khảo sát PDF. Các dòng S01 ở phần trước cung cấp nguồn để cùng review, không tự thay thế các quyết định MVP.

**Người chủ trì:** Người 3 (DATA-01). **Trạng thái:** Khung ban đầu. Nội dung lâm sàng cần mentor xác nhận trước khi chốt biểu mẫu (FE-04).

Mỗi trường MVP được ghi một lần trong khung này. Backend, biểu mẫu, API test và mapping FHIR/openEHR đều tham chiếu tới tài liệu này. Khi thêm hoặc đổi trường, cập nhật bảng và báo những người dùng trường đó.

### 10.1. Quy ước

| Cột | Ý nghĩa |
| --- | --- |
| Mã trường | Tên ổn định, dạng `nhom.ten_truong`, không đổi khi đổi nhãn hiển thị |
| Kiểu | `text`, `numeric`, `coded`, `date`, `datetime`, `boolean` |
| Đơn vị | Đơn vị UCUM khi là số đo |
| Bắt buộc | `B` bắt buộc, `T` tùy chọn, `Đk` có điều kiện |
| OpenMRS | Đối tượng lưu: patient, person attribute, identifier, obs (concept UUID), order, allergy, condition, diagnosis |
| FHIR R4 | Resource và path |
| openEHR | Archetype tham chiếu trên CKM, để ánh xạ khi thêm EHRbase ([ADR-0001](decisions/0001-openmrs-openehr.md)) |
| Thiếu dữ liệu | Cách biểu diễn "chưa hỏi", "không rõ", "không có" |

Concept UUID được điền khi DATA-02 tạo metadata. Không dùng UUID tạm trên biểu mẫu đã merge.

### 10.2. Bệnh nhân và định danh

| Mã trường | Nhãn | Kiểu | Bắt buộc | OpenMRS | FHIR R4 | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `patient.ma_noi_bo` | Mã bệnh nhân | text | B | identifier (loại nội bộ) | Patient.identifier | Hệ thống tự sinh; có cơ sở cấp |
| `patient.cccd` | Số CCCD | text | T | identifier | Patient.identifier | Kiểm tra định dạng 12 chữ số |
| `patient.ma_bhxh` | Mã BHXH/BHYT | text | T | identifier | Patient.identifier | |
| `patient.ho_ten` | Họ và tên | text | B | person name | Patient.name | Thứ tự họ – đệm – tên kiểu Việt Nam; xác định cách tách trường |
| `patient.gioi_tinh` | Giới tính | coded | B | gender | Patient.gender | |
| `patient.ngay_sinh` | Ngày sinh | date | B | birthdate (+ cờ ước lượng) | Patient.birthDate | Cho phép chỉ biết năm sinh |
| `patient.dien_thoai` | Điện thoại | text | T | person attribute | Patient.telecom | |
| `patient.dia_chi` | Địa chỉ | text/coded | T | person address | Patient.address | Tỉnh → xã theo danh mục hiện hành; số nhà dạng text |
| `patient.dia_chi_cu` | Địa chỉ theo giấy tờ cũ | text | T | person attribute | Patient.address (period) | Đối chiếu sau sắp xếp hành chính 2025 |

### 10.3. Sinh hiệu

| Mã trường | Nhãn | Kiểu | Đơn vị | Bắt buộc | OpenMRS | FHIR R4 | openEHR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `vitals.mach` | Mạch | numeric | /min | Đk | obs | Observation (LOINC 8867-4) | `openEHR-EHR-OBSERVATION.pulse.v2` |
| `vitals.ha_tam_thu` | HA tâm thu | numeric | mm[Hg] | Đk | obs | Observation (85354-9, component 8480-6) | `openEHR-EHR-OBSERVATION.blood_pressure.v2` |
| `vitals.ha_tam_truong` | HA tâm trương | numeric | mm[Hg] | Đk | obs | Observation (85354-9, component 8462-4) | `openEHR-EHR-OBSERVATION.blood_pressure.v2` |
| `vitals.nhiet_do` | Nhiệt độ | numeric | Cel | Đk | obs | Observation (8310-5) | `openEHR-EHR-OBSERVATION.body_temperature.v2` |
| `vitals.nhip_tho` | Nhịp thở | numeric | /min | T | obs | Observation (9279-1) | `openEHR-EHR-OBSERVATION.respiration.v2` |
| `vitals.spo2` | SpO₂ | numeric | % | T | obs | Observation (59408-5) | `openEHR-EHR-OBSERVATION.pulse_oximetry.v1` |
| `vitals.can_nang` | Cân nặng | numeric | kg | T | obs | Observation (29463-7) | `openEHR-EHR-OBSERVATION.body_weight.v2` |
| `vitals.chieu_cao` | Chiều cao | numeric | cm | T | obs | Observation (8302-2) | `openEHR-EHR-OBSERVATION.height.v2` |

Tập sinh hiệu bắt buộc và ngưỡng hợp lệ do mentor chốt. Giữ thời điểm đo tách biệt với thời điểm nhập. Phiên bản archetype và mã LOINC phải được kiểm tra lại trên CKM/LOINC khi chốt.

### 10.4. Khám và kết luận

| Mã trường | Nhãn | Kiểu | Bắt buộc | OpenMRS | FHIR R4 | openEHR | Thiếu dữ liệu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `visit.ly_do_kham` | Lý do khám | text | B | obs | Encounter.reasonCode / Observation | `EVALUATION.reason_for_encounter.v1` | |
| `exam.trieu_chung` | Triệu chứng | coded + text | T | obs | Observation / Condition | `CLUSTER.symptom_sign.v2` | |
| `allergy.trang_thai` | Tình trạng dị ứng | coded | B | allergy (hoặc obs trạng thái) | AllergyIntolerance | `EVALUATION.adverse_reaction_risk.v1`, `EVALUATION.exclusion_specific.v1` | Phân biệt: chưa hỏi / đã hỏi, không ghi nhận / có dị ứng |
| `allergy.tac_nhan` | Tác nhân dị ứng | coded | Đk | allergy | AllergyIntolerance.code | `EVALUATION.adverse_reaction_risk.v1` | |
| `dx.chinh` | Chẩn đoán chính | coded (ICD-10) | B | diagnosis | Condition (encounter-diagnosis) | `EVALUATION.problem_diagnosis.v1` | |
| `dx.kem_theo` | Chẩn đoán kèm theo | coded (ICD-10) | T | diagnosis | Condition | `EVALUATION.problem_diagnosis.v1` | |
| `dx.do_chac_chan` | Mức độ chắc chắn | coded | B | diagnosis certainty | Condition.verificationStatus | | Sơ bộ / xác định |
| `followup.ngay_tai_kham` | Ngày tái khám | date | T | appointment hoặc obs | Appointment | | |

### 10.5. Chỉ định, đơn thuốc và thanh toán

| Mã trường | Nhãn | Kiểu | Bắt buộc | OpenMRS | FHIR R4 | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `order.cls` | Chỉ định CLS | coded | Đk | test order | ServiceRequest | Danh mục dịch vụ có mã dùng chung khi có |
| `result.cls` | Kết quả CLS | numeric/text/file | Đk | obs / attachment | Observation / DiagnosticReport | Đơn vị và khoảng tham chiếu |
| `rx.thuoc` | Thuốc | coded | B | drug order | MedicationRequest.medication | Tên hoạt chất, hàm lượng, dạng bào chế |
| `rx.lieu_dung` | Liều, cách dùng | structured + text | B | drug order | MedicationRequest.dosageInstruction | |
| `rx.so_luong` | Số lượng | numeric | B | drug order | MedicationRequest.dispenseRequest | |
| `rx.so_ngay` | Số ngày dùng | numeric | B | drug order | MedicationRequest.dispenseRequest | |
| `rx.loi_dan` | Lời dặn | text | T | obs / order | MedicationRequest.note | |
| `bill.dich_vu` | Dịch vụ tính phí | coded | B | billing line item | ChargeItem (nếu dùng) | Bảng giá do từng cơ sở cấu hình |
| `bill.so_tien` | Số tiền | numeric | B | billing | | Đơn vị VND, không có phần thập phân |
| `bill.trang_thai` | Trạng thái thanh toán | coded | B | billing | | Chưa thu / đã thu / hoàn / hủy |

### 10.6. Việc tiếp theo

- [ ] Mentor xác nhận tập trường sinh hiệu, khám, dị ứng.
- [ ] Chọn danh mục ICD-10, thuốc, dịch vụ và ghi nguồn/phiên bản (DATA-03).
- [ ] Điền concept UUID sau DATA-02.
- [ ] Người 4 kiểm tra cột FHIR bằng dữ liệu thật trên instance (INT-05).
- [ ] Đối chiếu cột openEHR trên CKM (DATA-10).
