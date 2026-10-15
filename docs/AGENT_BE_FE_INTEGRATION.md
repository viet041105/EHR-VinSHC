# Agent kết nối BE/FE của PR #21

Nhánh làm việc: `feature/mvp3-agent-chatbot`. Đã lấy BE/FE tại commit
`a03049f` của PR #21 vào nhánh này và ghép lại phần agent đang phát triển.
Không cần tạo repo hoặc nhánh agent mới. Backend hiện vẫn là module Java VinSHC
trên OpenMRS, lưu PostgreSQL; FE đọc API VinSHC cùng origin.

## Luồng đã nối

```text
Đăng nhập bác sĩ → chọn bệnh nhân/lượt/phiếu khám → nút Trợ lý bác sĩ
    → /agent/v1/doctor/chat → LangGraph và tool chỉ đọc
    → API VinSHC bằng phiên và cơ sở của bác sĩ → PostgreSQL
```

- Chat nổi có trên mọi màn bác sĩ, giữ hội thoại khi đổi màn và xóa khi đổi hồ sơ/phiên.
- Agent nhận thông tin xác thực từ người hỏi; không dùng tài khoản admin chung.
- Nguồn hồ sơ đi qua API BE, nguồn tài liệu đi qua API agent và kiểm tra phiên bản.
- Khung chat hỗ trợ dừng chờ, thử lại, giữ bản nháp và bỏ phản hồi nguồn đến muộn.
- Portal bệnh nhân giữ phân trang, đổi mật khẩu và chỉ đọc bản công bố của chính mình.
- Compose chọn `data_provider=http`; launcher `agent:dev`/`agent:demo` vẫn dùng hồ sơ giả riêng.
- Timeline, so sánh và cơ chế nâng cao được bật trong Compose. RAG chỉ được bật
  khi cấu hình `VINSHC_AGENT_KNOWLEDGE_ENABLED=true` trong môi trường agent.
  Corpus hiện có là tài liệu metadata synthetic, chưa phải tài liệu y khoa đã được duyệt.
  Muốn thử corpus này qua BE HTTP synthetic phải bật thêm
  `VINSHC_AGENT_KNOWLEDGE_ALLOW_DEVELOPMENT=true`; mặc định tắt.

## Chạy local

### Database hiện có trên máy

File `.env` của repo chọn Compose project `ehr-vinshc`, BE tại cổng `8080`.
Agent Docker gọi `http://backend:8080/openmrs/ws/rest/v1` trong cùng project;
FE tại cổng `5173` gọi cùng BE qua `/api`. Hai volume dữ liệu đang dùng là
`ehr-vinshc_postgres-data` và `ehr-vinshc_openmrs-pg-data`.

Đã kiểm tra đăng nhập bằng tài khoản bác sĩ có sẵn, chọn hồ sơ có sẵn trên FE và
đọc clinical summary qua adapter. Gemini đang chạy trong container đã gọi
`get_encounter_summary` trên DB này, trả 7 ý được giữ lại với nguồn; validator
loại 3 ý `no_source` nên phản hồi có trạng thái `limited`, không phải lỗi kết nối.
Ca được dùng để thử model là hồ sơ đã được đánh dấu synthetic từ lần tạo trước.
Số lượng bệnh nhân/lượt/encounter/observation sau chuyển kết nối vẫn giữ nguyên.

Ngày 15/10/2026 đã kết nối lại đúng các volume tồn tại từ 08/10, có sẵn 4 bệnh nhân,
3 lượt khám, 4 encounter và 25 observation. Đây là dữ liệu đã lưu trong DB local,
không phải file JSON mock. Việc nằm trong DB không xác nhận đó là bệnh án người thật;
hồ sơ demo đã tạo trước đây cũng vẫn nằm ở đó. Không nhập thêm hồ sơ giả khi chuyển kết nối.

Đã tạo backup trước khi khởi động bản BE mới tại
`.runtime/backups/before-agent-live-20261015T053944Z/`, gồm PostgreSQL dump và volume OpenMRS.
Database trên máy của thành viên khác không được đồng bộ bằng Git; muốn dùng chung
phải có URL BE hoặc cơ chế đồng bộ dữ liệu riêng.

`npm run agent:dev` và `npm run agent:demo` vẫn là công cụ phát triển bằng hồ sơ mock.
Muốn dùng DB hiện có, chạy bộ `mvp` và mở trang bác sĩ như bên dưới.

Từ gốc repo, sau khi cập nhật code:

```powershell
npm run mvp:build       # build lại BE, FE và agent khi source thay đổi
npm run mvp:up          # những lần chạy sau, dùng image đã build
npm run mvp:stop        # dừng, giữ dữ liệu
```

Giao diện: http://127.0.0.1:5173/connected.html.
Đăng nhập quản trị bằng tài khoản trong `.env`, tạo nhân viên bác sĩ ở trang
Quản trị; tạo hồ sơ, lượt và phiếu khám để có ngữ cảnh hỏi.

Model đọc từ `infra/agent/.env`, độc lập với nguồn hồ sơ. `fake` chỉ kiểm tra kỹ thuật;
Gemini cần khóa/cấu hình hợp lệ và dịch vụ model hoạt động. Lỗi model được hiển thị,
không tự đổi sang model giả. Không đưa khóa vào frontend.

## Kiểm tra

- Unit test agent, unit/build FE và browser regression cho chat bác sĩ/portal.
- `tests/integration/test_b12_agent_portal.py` có phần kiểm tra agent nâng cao
  bằng BE/PostgreSQL thật khi đặt `VINSHC_TEST_AGENT_ADVANCED=true`.
- Dùng overlay `tests/integration/compose.agent-advanced.yaml` cho nghiệm thu synthetic:
  model fake, RAG offline, timeline, so sánh thiếu lần trước, memory theo tài khoản,
  nguồn tài liệu và SSE đã qua validator. CI dùng cùng overlay.
- Kiểm tra model thật và chất lượng câu trả lời là bước riêng; test fake không chứng minh
  độ chính xác lâm sàng hoặc khả năng phục vụ của Gemini.

Các kiểm tra ghi dữ liệu phải chạy trên Compose project/volume synthetic riêng.
Không dùng `down -v` với dữ liệu cần giữ.

## Bằng chứng local ngày 15/10/2026

- Unit FE: 30/30; build và kiểm tra mapping API đạt.
- Cả 7 bộ browser FE đạt; thêm kiểm tra chat nâng cao ở 1440px/390px đạt.
- Unit agent: 244/244 ở lượt chạy toàn bộ; thay đổi CLI cuối cùng được kiểm tra
  lại bằng 62/62 test liên quan. Baseline offline 24/24 ca synthetic đạt.
- Backend B11: 15/15. B12 mở rộng: 11/11, gồm chat bác sĩ desktop/mobile
  gọi trực tiếp web → agent → OpenMRS/PostgreSQL, kiểm quyền và mở nguồn.
  Timeline/RAG/memory/SSE trong B12 dùng model fake, tài liệu và hồ sơ synthetic.
- Cấu hình/tooling: 46/46; kiểm tra PostgreSQL 16.15, schema, smoke và actionlint đạt.
- Gemini: Models API nhận khóa/model hợp lệ; một ca smoke với hồ sơ mock đạt.
  Một lần smoke trên môi trường test riêng kết hợp Gemini + adapter HTTP nhận `http_503` ở vòng model đầu,
  trả `limited`, chưa gọi tool. Không tự fallback sang model fake.

Log/report nằm trong `.runtime/pr21-acceptance.log`,
`.runtime/pr21-portal-acceptance.log`, `.runtime/pr21-reports/` và
`.runtime/reports/agent-advanced-live.json`. Đây là bằng chứng local;
CI chỉ có kết quả mới sau khi commit/push.
