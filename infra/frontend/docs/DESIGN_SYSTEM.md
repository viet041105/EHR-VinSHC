# Design system — app phòng khám và cổng người bệnh

Cập nhật 16/10/2026 trên nhánh `feature/ui-redesign` (thay đổi chưa commit).
Áp dụng cho `connected.html` (8 vai trò nhân viên) và `portal.html` (người bệnh).
Landing page (`index.html`, `styles/base.css`) **không** dùng hệ thống này và giữ nguyên.

## Nguyên tắc

- Giữ nguyên bảng màu: navy `#22577f` là màu chính, teal `#008e87` là màu nhấn, `--muted #687585`
  và các màu đỏ/xanh lá/vàng cho trạng thái không đổi. Chỉ gom các sắc xám/xanh gần giống nhau về
  giá trị dùng nhiều nhất, và chỉ gom trong cùng một tông màu.
- Font hệ thống, không có thư viện hay font tải ngoài.
- Chỉ đổi giao diện và markup; logic nghiệp vụ, API, routing và state giữ nguyên.
- Code mới dùng token và class chuẩn bên dưới, không viết cứng px/hex.

## Thứ tự nạp CSS

```text
tokens.css → clinic-base.css → connected.css → workspace.css → pages.css → patient-access.css
          → components.css → layout.css → roles.css          (agent-chat.css được nạp từ JS)
```

| File | Nội dung |
|---|---|
| `tokens.css` | Biến màu, chữ, khoảng cách, bo góc, bóng, focus. Nạp đầu tiên. |
| `clinic-base.css` … `patient-access.css` | Rule cũ theo trang. Đã chuyển sang token, không thêm rule mới vào đây. |
| `components.css` | Component dùng chung và alias cho tên class cũ. |
| `layout.css` | Header, role chip, sidebar, điều hướng mobile. |
| `roles.css` | Tinh chỉnh theo từng màn hình/vai trò, mỗi vai trò một mục. |

## Token

### Màu

| Nhóm | Token | Giá trị | Dùng cho |
|---|---|---|---|
| Thương hiệu | `--primary` | `#22577f` | Nút chính, chỉ báo đang chọn |
| | `--primary-hover` / `--primary-strong` | `#194565` / `#174f7c` | Hover; chữ link và nút phụ |
| | `--blue` | `#245b88` | Viền focus của ô nhập |
| | `--teal` / `--teal-hover` | `#008e87` / `#007872` | Màu nhấn |
| | `--accent-strong` | `#00776f` | **Chỉ** khi cần chữ trắng trên nền teal (đạt AA) |
| Chữ | `--ink` | `#253344` | Nội dung chính |
| | `--text-subtle` | `#566e84` | Nhãn, tiêu đề cột, eyebrow |
| | `--muted` | `#687585` | Mô tả, chú thích, thời gian |
| | `--text-faint` / `--text-placeholder` | `#7b8ba0` / `#8493a7` | Chỉ để trang trí (mũi tên, icon); dưới AA, không dùng cho nội dung |
| Nền và viền | `--white`, `--surface`, `--surface-raised`, `--surface-sunken` | `#fff`, `#f5f6f8`, `#f7f9fc`, `#edf0f3` | Thẻ, nền trang, hover, ô nhấn |
| | `--tint-primary` / `--tint-accent` | `#eef5fa` / `#eaf7f5` | Dòng đang chọn, chip |
| | `--line-soft`, `--line`, `--line-strong`, `--control-border` | `#e6ebef`, `#e0e5ea`, `#d5dce4`, `#cdd8e4` | Đường kẻ trong bảng → viền thẻ → viền ô nhập → viền nút |
| Trạng thái | `--success` / `--success-bg` | `#1d6b4f` / `#eef6f1` | Đã thu, hoàn tất |
| | `--warning` / `--warning-bg` | `#8a5a00` / `#fff9ec` | Chờ xử lý |
| | `--red` / `--danger-bg` | `#a93638` / `#fdecec` | Hủy, hoàn tiền, lỗi |

### Chữ

Font: `--font-sans` = Segoe UI, system-ui, -apple-system, Helvetica Neue, Roboto, Noto Sans, Arial
(tất cả hỗ trợ tiếng Việt đầy đủ). Sáu cỡ chữ, **không dùng cỡ dưới 12px**:

| Token | Cỡ | Dùng cho |
|---|---|---|
| `--fs-xs` | 12px | Metadata, tiêu đề cột, badge |
| `--fs-sm` | 13px | Nút, chữ phụ, nhãn field |
| `--fs-md` | 14px | Nội dung, ô nhập |
| `--fs-lg` | 16px | Tiêu đề thẻ, tên trên thẻ mobile |
| `--fs-xl` | 20px | Tiêu đề khu vực, tên người bệnh trong banner |
| `--fs-2xl` | 28px | Tiêu đề trang, số liệu thống kê |

Độ đậm: `--fw-regular` 400, `--fw-medium` 500, `--fw-semibold` 600, `--fw-bold` 700.
Dòng: `--lh-tight` 1.3, `--lh` 1.55. Số liệu dùng `font-variant-numeric: tabular-nums` (đã bật cho toàn app).

### Khoảng cách, bo góc, độ sâu

- Khoảng cách theo lưới 4px: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32.
- Bo góc: `--radius-sm` 4px (ô nhỏ), `--radius-md` 6px (nút, ô nhập), `--radius-lg` 10px (thẻ, panel),
  `--radius-full` (badge, chip). Hình tròn vẫn dùng `50%`.
- Bóng: `--shadow-sm` (thẻ), `--shadow-md` (menu thả xuống), `--shadow-lg` (dialog).
- Chiều cao control: `--control-h-sm` 32px (nút phụ, nút trong bảng), `--control-h` 40px (nút chính, ô nhập).
  Trên mobile mọi nút cao 40px.
- Focus: viền 2px `--primary` cách 2px; trong vùng cuộn (bảng, dải tab) viền nằm bên trong để không bị cắt.
- Khung trang: `--header-h` (64px, mobile 60px) và `--page-gutter` (28 → 20 → 16px theo breakpoint).

## Component

| Component | Class chuẩn | Class cũ còn được hỗ trợ | Ghi chú |
|---|---|---|---|
| Nút | `button` (mặc định là nút phụ), `.primary`, `.ghost`, `.danger`, `.primary.danger-fill` | — | Mỗi trang và mỗi dòng bảng chỉ có **một** nút `.primary`. Thao tác hủy, hoàn tiền, thu hồi, ngừng dùng `.danger`. |
| Field | `label > span.field-text + control`, `.field-optional`, `.field-hint`, `.form-legend`, `.field-error` | `.field-label` | Trường bắt buộc chỉ có `*`; form có chú thích "Trường có dấu * là bắt buộc." |
| Badge | `.badge` + `.badge-success` / `-warning` / `-danger` / `-neutral` | `.row-status[data-state]`, `.capability-badge` | `data-state` tự map tông: paid/settled/completed → xanh lá; unpaid/pending/requested → vàng; cancelled/refunded → đỏ |
| Tab | `.tabs` + `button[role=tab][aria-selected]` | `.doctor-tabs`, `.portal-tabs`, `.admin-tabs` (`.active`) | Kiểu gạch chân; trên mobile có hiệu ứng mờ ở mép để báo còn tab |
| Bảng | `.table` trong `.table-wrap` | `.workspace-table`, `.workspace-table-wrap`, `.admin-staff-table` | ≤760px mỗi dòng thành thẻ với nhãn từ `data-label` |
| Tiêu đề dòng | `.worklist-record-link` | — | Link chính của dòng, gạch chân khi hover/focus |
| Hành động dòng | `.row-primary` (1 nút), các nút phụ, `details.row-more` ("Khác") | — | Menu "Khác" mở ngay trong ô để không bị cắt khi bảng cuộn |
| Thẻ | `.panel`, `.card-title`, `.workspace-heading` | `.form-card` | |
| Trạng thái trống | `.empty-state` | `.workspace-empty`, `.section-empty`, `.record-empty`, `.portal-empty`, `.admin-empty`, `.notification-empty` | |
| Đang tải | `.list-loading[role=status][aria-busy=true]` + `.skeleton` | — | Xem mẫu bên dưới |
| Thanh hành động | `.record-toolbar`, `details.other-actions > .action-groups > .action-group` | — | "Thao tác khác" được nhóm theo `TASK_GROUPS` trong `shell/src/page-design.js` |
| Banner người bệnh | `.patient-banner`, `.patient-meta`, `.patient-flags` | `.doctor-profile-header` | Dị ứng luôn hiển thị; chưa có dữ liệu thì hiện "Dị ứng: Chưa ghi nhận" |

Mẫu trạng thái đang tải:

```html
<div class="list-loading" role="status" aria-busy="true">
  <span>Đang tải danh sách…</span>
  <span class="skeleton" aria-hidden="true"></span>
  <span class="skeleton" aria-hidden="true"></span>
</div>
```

### Lỗi theo từng field

`installFieldErrors()` trong `@vinshc/core` (`packages/core/src/field-errors.js`) được gọi một lần ở
`shell/src/main.js` và `shell/src/portal.js`. Khi trình duyệt phát sự kiện `invalid`, hàm chép
`validationMessage` gốc vào `<small class="field-error">` ngay sau field, đặt `aria-invalid="true"` và
thêm id vào `aria-describedby` (giữ nguyên id đã có). Khi field hợp lệ trở lại, các thuộc tính này
được gỡ bỏ. Hàm không thêm rule validate, không chặn hay thay đổi submit. Form dùng `novalidate`
(như form tạo nhân viên của admin) không bị ảnh hưởng.

## Layout

Vùng làm việc dùng **toàn bộ chiều rộng và chiều cao** cửa sổ. Không giới hạn `max-width`, không căn giữa;
lề hai bên lấy từ `--page-gutter` (28px, 20px khi ≤1100px, 16px khi ≤800px).

- **Header (`--header-h` = 64px, mobile 60px):** logo · role chip (`.role-chip`) · tên tài khoản (`.session-user`) ·
  chuông thông báo · Đăng xuất. Sidebar, `min-height` của trang và thanh tiêu đề của trợ lý bác sĩ đều tính từ
  `--header-h` để luôn khớp nhau. Từ 600px trở xuống ẩn tên tài khoản, chỉ giữ role chip.
- **Đầu trang:** eyebrow "Vai trò · Cơ sở", tiêu đề trang, mô tả, ngày.
- **Sidebar 220px:** mục đang chọn có nền `--tint-primary` và vạch `--primary` bên trái.
  Từ 800px trở xuống chuyển thành dải chip cuộn ngang, dính trên cùng và mờ ở mép.
- **Lấp chiều cao (>800px):** vùng nội dung là cột flex cao tối thiểu bằng cửa sổ. `section` cuối cùng giãn
  tới đáy, nên danh sách ngắn hay trạng thái trống vẫn chiếm hết panel thay vì để lại khoảng xám.
- **Worklist:** bộ lọc giữ độ rộng dễ đọc (180–280px mỗi ô, ô tìm bệnh nhân tới 880px) và nằm cạnh nút Tìm kiếm.
  Bảng chiếm toàn bộ chiều rộng; cột không còn bị chặn 260px. "Đang hiển thị N bản ghi" và "Cập nhật lúc…" nằm chung một hàng.
- **Hai danh sách trên một trang (≥1680px):** đặt cạnh nhau, ví dụ Thu ngân (Phiếu phí | Giao dịch) và Sinh hiệu
  (Lượt khám | Các lần đo).
- **Form (≥1400px):** tự xếp thành nhiều cột rộng tối thiểu 300px; ô văn bản dài chiếm 2 cột.
- **Bác sĩ (>1000px, cao ≥620px):** workspace vừa khít cửa sổ, trang không cuộn. Danh sách lượt khám và thân hồ sơ
  cuộn riêng. Banner người bệnh, tab và thanh "Lưu phiếu khám" luôn hiển thị; nút trợ lý nằm phía trên thanh lưu.
  Dưới ngưỡng này trang cuộn như bình thường.
- **Breakpoint:** 1680px (hai danh sách cạnh nhau), 1400px (form nhiều cột), 1100px (thu lề),
  1000px (bác sĩ một cột), 800px (một cột, điều hướng mobile), 600px (header và form tối giản).

## Mẫu theo vai trò (`roles.css`)

| Vai trò | Màn hình | Điểm riêng |
|---|---|---|
| Bác sĩ | Danh sách khám | Bộ lọc gọn; dòng đang chọn có vạch trái và cả dòng bấm được; banner người bệnh có badge lượt khám và dị ứng; workspace vừa khít màn hình với danh sách và hồ sơ cuộn riêng; thanh "Lưu phiếu khám" luôn ở đáy panel; nút trợ lý nằm trên thanh lưu |
| Tiếp đón | Bệnh nhân, Hàng đợi, Lịch hẹn | Ô tìm bệnh nhân cao 44px có icon; số thứ tự và giờ hẹn làm tiêu đề dòng |
| Thu ngân | Thu ngân | Số tiền dùng tabular-nums, không ngắt giữa số và "₫"; Hoàn tiền và Hủy phiếu dùng kiểu danger |
| Điều dưỡng | Sinh hiệu | Khi chưa chọn lượt khám, khung hướng dẫn là nút tô màu duy nhất; chỉ số sinh hiệu cỡ 16px đậm |
| KTV CLS | Chỉ định và kết quả | Hành động nhóm theo Chỉ định / Kết quả / Tệp; khối tự kiểm tra dùng token |
| Dược | Quầy thuốc | Số lượng dùng tabular-nums; hành động nhóm theo Cấp thuốc / Tra cứu |
| Quản lý | Báo cáo | Ô thống kê cỡ 28px; bảng chi tiết vẫn hiển thị bên dưới |
| Quản trị | Quản trị | Tab chỉ có chữ; khoảng 30 công cụ nhóm theo 6 nghiệp vụ; hành động nguy hiểm màu đỏ |
| Người bệnh | portal.html | Tab dùng chung kiểu; header một hàng trên mobile; kết quả đứng trước trợ lý |
| Đăng nhập | connected/portal | Thẻ bo 10px, nút đăng nhập rộng hết thẻ và cao 44px |

## Độ tương phản

Không đổi giá trị màu nào. Nội dung quan trọng (lưu ý của trợ lý, nhãn nguồn, ngày giờ, eyebrow,
các bước quy trình, nhãn thẻ mobile) đã chuyển từ các xám nhạt sang `--muted` hoặc `--text-subtle`
có sẵn. Các điểm còn lại **tồn đọng, quyết định màu ở giai đoạn sau**:

| Cặp màu | Tỷ lệ | Vị trí |
|---|---|---|
| `--muted` trên `--surface` | 4.34:1 | Mô tả đầu trang và chữ trên khối nền xám (đã tăng cỡ lên 13–14px) |
| Chữ trắng trên `--teal` | 4.02:1 | Hiện app chưa dùng; nếu cần thì dùng `--accent-strong` |
| `--text-faint`, `--text-placeholder`, `#879bb5`, `#8aa2b8`, `#95a3b4` | 2.6–3.5:1 | Icon và mũi tên trang trí, placeholder ô chat |
| Nút disabled (opacity .55) | dưới 3:1 | "Trang trước/sau", "Gửi" khi chưa nhập (WCAG miễn trừ phần tử không hoạt động) |

## Kiểm chứng

```sh
npm run build && npm test && npm run test:roles && npm run test:pages
```

Kết quả 16/10/2026:
- Build ổn; unit test 39/39 pass.
- `test:roles` và `test:pages` (8 vai trò, 46 trang, 148 form, 1440px và 390px) pass.
- `connected`, `product`, `landing`, `additional`, `microfrontend`, `demo-workflow`, `portal-pages` và `patient-access` cũng pass.
- `workspace-check` (thiếu mock `GET /api/vinshc/notifications`) và `doctor-assistant-check` (chờ chữ cũ
  "Bắt đầu phiếu khám") đã fail từ trước khi redesign, lý do không đổi.

| Chỉ số (CSS app) | Trước | Sau |
|---|---|---|
| Số cỡ chữ px khác nhau | 27 | 0 (6 token) |
| Khai báo cỡ chữ dưới 12px | 96 | 0 |
| Giá trị bo góc | 16 | 4 token (+50% cho hình tròn) |
| Mã màu hex khác nhau | 277 | 134 |

Ảnh chụp trước/sau nằm ở `docs/ui-redesign/before/` và `docs/ui-redesign/after/` (đã thêm vào `.gitignore`).
Ảnh `after/sections/` chụp mọi trang của 8 vai trò với dữ liệu mock có dòng, kèm trạng thái menu đang mở.

## Đề xuất cho phase sau

1. **R3:** gộp Lượt khám, Lịch hẹn và Hàng đợi của Tiếp đón thành một màn tiếp nhận (đổi routing).
2. **G17:** định dạng ngày dd/mm/yyyy cho ô nhập ngày (hiện theo locale trình duyệt).
3. Quyết định màu cho các cặp tương phản tồn đọng ở bảng trên.
4. **R2:** khóa "Xem hồ sơ" và "Sửa thông tin hành chính" cho đến khi đã chọn bệnh nhân (thay đổi hành vi).
5. **D6:** đưa nút "Trợ lý bác sĩ" vào banner người bệnh thay vì nút nổi (đổi chỗ mount trong JS).
6. **T2:** cột số tiền riêng, căn phải cho phiếu phí và giao dịch (đổi cấu trúc dòng trong module billing).
7. **T4:** chuyển giữa "Phiếu phí" và "Giao dịch" bằng tab trên mobile.
8. **Q1:** thu gọn bảng chi tiết báo cáo trùng với ô thống kê (cần cập nhật `connected-check`).
9. Thay emoji (thẻ vai trò của admin, trợ lý bác sĩ) bằng bộ icon SVG nét đơn đang dùng ở sidebar.
10. Dọn CSS cũ: chuyển markup của module sang class chuẩn rồi bỏ alias và rule cũ đã bị
    `components.css` thay thế (CSS app tăng từ 1.737 lên 2.588 dòng vì rule cũ vẫn được giữ).
11. Thêm Stylelint/ESLint (thư viện dev mới, cần duyệt).
12. Cập nhật 2 test đang fail từ trước: thêm mock notifications và cập nhật chữ mong đợi.
