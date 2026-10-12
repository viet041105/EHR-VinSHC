# Đánh giá trước pilot với dữ liệu thật

Kết luận hiện tại: **NOT APPROVED FOR REAL DATA**. B9 chỉ chứng minh backend bằng dữ liệu synthetic.

| Gate | Bằng chứng hiện có | Trạng thái / việc phải chốt |
| --- | --- | --- |
| Phân quyền API | B5 kiểm tra 8 role × 16 resource × 7 action, workspace facility và chặn Core/FHIR bypass | Đạt trên local/CI synthetic; cần pentest/staging và owner duyệt tài khoản thực |
| Audit truy cập | Có actor, time, action, target cho API VinSHC | Cần retention, giám sát, export/điều tra sự cố và owner vận hành |
| Backup–restore | PostgreSQL + `/openmrs/data`, checksum và restore project mới; B9 đối chiếu attachment thật | Cần lịch chạy, nơi lưu mã hóa, RPO/RTO, retention và diễn tập do operator ký |
| Bảo mật triển khai | Local chỉ bind `127.0.0.1`, không commit secret | Chặn pilot: HTTPS, reverse proxy, secret store, DB least privilege, hardening, monitoring và vá lỗi |
| Metadata/chuyên môn | Contract và catalogue synthetic `0.3.0` có version | Chặn pilot: phê duyệt danh mục thuốc/dịch vụ/giá, thuật ngữ và danh tính pháp lý cơ sở/người hành nghề |
| File/tài liệu | PDF/JPEG/PNG, 20 MiB, sniff/hash/RBAC đã thử; mẫu in trả DTO | Chặn pilot: malware scanner, object storage/retention, mẫu in và chữ ký pháp lý được duyệt |
| Tích hợp ngoài | Manifest/contract disabled-by-default | Chưa triển khai BHYT, HĐĐT, đơn thuốc quốc gia, LIS/PACS; đánh giá pháp lý/bảo mật riêng trước khi bật |
| Quy trình vận hành | Có development, CI và recovery runbook | Chặn pilot: incident response, người liên hệ, support/SLA, đào tạo và change management |
| Dữ liệu cá nhân | Không dùng dữ liệu thật trong test, report được giới hạn | Chặn pilot: DPIA/đánh giá tác động, mục đích/căn cứ xử lý, consent khi áp dụng, quyền chủ thể và thỏa thuận trách nhiệm |
| Nghiệm thu người dùng | Backend API có kịch bản synthetic | Chặn pilot: E2E trình duyệt với FE và biên bản chấp nhận giới hạn bằng văn bản |

## Xác nhận bắt buộc trước khi đổi trạng thái

- Owner phòng khám: _chưa chỉ định / chưa ký_.
- Owner chuyên môn: _chưa chỉ định / chưa ký_.
- Owner bảo mật và dữ liệu cá nhân: _chưa chỉ định / chưa ký_.
- Owner vận hành/backup: _chưa chỉ định / chưa ký_.
- Commit và GitHub Actions run được duyệt: _chưa có_.

Không đổi kết luận sang approved chỉ bằng cách tick tài liệu này. Mỗi gate phải dẫn đến bằng chứng staging và người chịu trách nhiệm xác nhận bằng văn bản theo [VIETNAM_COMPLIANCE.md](VIETNAM_COMPLIANCE.md#3-trước-khi-pilot-với-dữ-liệu-thật).
