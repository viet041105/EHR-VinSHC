# ADR-0001: Vai trò của OpenMRS và openEHR

- **Trạng thái:** Đề xuất — chờ mentor xác nhận ở M0
- **Ngày:** 08/10/2026

## Bối cảnh

Nhóm đang tham khảo cả OpenMRS và openEHR.

- **OpenMRS 3** có sẵn giao diện, quy trình, phân quyền, form engine, REST và FHIR2. Hệ sinh thái có nhiều app phục vụ ngoại trú: appointments, queue, billing, dispensing, stock. Mô hình dữ liệu là concept/obs của OpenMRS, không phải openEHR.
- **openEHR** là đặc tả mô hình dữ liệu lâm sàng (reference model, archetype, template) cùng kho dữ liệu (CDR, ví dụ EHRbase). Nó phù hợp cho hồ sơ sức khỏe dài hạn, có phiên bản, độc lập với ứng dụng. Nhưng openEHR không cung cấp sẵn giao diện và quy trình của một phòng khám.

Dùng cả hai làm nơi lưu trữ gốc song song ngay từ MVP sẽ dẫn tới đồng bộ hai chiều, xung đột dữ liệu và gấp đôi công kiểm thử. Nhóm 4 người không đủ nguồn lực cho việc này.

## Quyết định đề xuất

1. **Tầng 1–2 (phòng khám, chuỗi):** OpenMRS là hệ thống tác nghiệp và là nơi lưu hồ sơ gốc. FHIR R4 dùng để trao đổi dữ liệu.
2. **Từ M0:** từ điển dữ liệu ghi archetype openEHR tương ứng cho từng trường lâm sàng ([DATA_DICTIONARY.md](../DATA_DICTIONARY.md)). Khi chọn cấu trúc trường, ưu tiên cách tương thích với archetype trên CKM.
3. **Tầng 3 (bệnh viện, liên thông):** thêm EHRbase làm kho dữ liệu lâm sàng dài hạn. Một adapter đẩy dữ liệu **một chiều** từ OpenMRS sang EHRbase, kèm nguồn và phiên bản. AI tra cứu và báo cáo đọc từ kho này.
4. Không coi việc bật FHIR2 là đã đáp ứng openEHR.

## Phương án đã cân nhắc

| Phương án | Ưu điểm | Nhược điểm |
| --- | --- | --- |
| A. Chỉ OpenMRS | Nhanh, ít rủi ro | Không đáp ứng nếu openEHR là yêu cầu bắt buộc |
| **B. OpenMRS trước, ánh xạ sẵn, EHRbase ở tầng 3 (đề xuất)** | Đưa được MVP cho phòng khám; vẫn giữ đường sang openEHR | Ánh xạ cần được duy trì; phần openEHR có hiệu lực từ tầng 3 |
| C. openEHR là nơi lưu gốc, tự viết frontend | Đúng chuẩn openEHR từ đầu | Phải tự xây toàn bộ giao diện, quy trình, quyền, thu tiền; vượt sức nhóm cho MVP |
| D. Lưu song song hai hệ thống từ MVP | Có cả hai ngay | Đồng bộ hai chiều phức tạp, khó kiểm chứng |

## Hệ quả

- M3–M5 tập trung vào OpenMRS. Người 3 thêm việc ánh xạ archetype (DATA-10).
- Nếu mentor yêu cầu openEHR là nơi lưu gốc từ MVP, chuyển sang phương án C và **lập lại kế hoạch trước M3**.
- Thử nghiệm EHRbase có thể chạy sớm như một spike độc lập, không chặn MVP.
