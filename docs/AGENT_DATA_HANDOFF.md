# Agent độc lập với BE — bản nháp 0.1.0

> Đã ghép BE/FE của PR #21 vào nhánh agent. Xem [hướng dẫn kết nối](AGENT_BE_FE_INTEGRATION.md)
> để chạy với backend thật; các lệnh mock bên dưới vẫn dành cho phát triển độc lập.

Gói này giúp người làm agent tiếp tục phát triển trong lúc nhóm xây lại BE/FE. BE chưa cần chốt API ngay.
Hồ sơ tự tạo dựa trên các trường và đơn vị trong metadata VinSHC 0.3.0; khi BE có thiết kế, hai bên đối chiếu và sửa adapter.

## 1. Chạy thử

Từ gốc repo:

```powershell
npm run agent:setup       # lần đầu hoặc khi dependency thay đổi
npm run agent:dev         # hồ sơ giả + model theo infra/agent/.env
```

Service: **http://127.0.0.1:8001**, tài liệu API **/docs**, tình huống **/dev/cases**.
Không khởi động Docker, OpenMRS, database hay FE nghiệp vụ; không sửa file `.env` hiện có.
Môi trường Python riêng ở `.runtime/agent-venv`, tách khỏi `.venv` đang dùng cho công việc khác.

Mở terminal thứ hai:

```powershell
npm run agent:chat
```

Hỏi `Tóm tắt lần khám`, `Sinh hiệu?`, `Đơn thuốc?`, `Dị ứng?`, `Kết quả xét nghiệm?`, `Lịch hẹn?`.
Kết quả gồm câu trả lời, nguồn, thông tin thiếu và tool đã gọi. `/new` xóa lịch sử; `/quit` thoát chat.
**Ctrl+C** ở terminal chạy `agent:dev` dừng service.

```powershell
npm run agent:chat -- --case 2                          # phiếu nháp/thiếu thông tin
npm run agent:chat -- --case 3                          # bác sĩ A bị từ chối đọc hồ sơ C
npm run agent:chat -- --case 3 --identity doctor-other  # bác sĩ B được đọc hồ sơ C
npm run agent:chat -- --persona patient                 # hồ sơ công bố của bệnh nhân A
npm run agent:chat -- --persona patient --case 2        # chưa công bố, vẫn hỏi được lịch hẹn
```

## 2. Dữ liệu giả và model giả là hai lựa chọn riêng

| Lựa chọn | Ý nghĩa |
| --- | --- |
| `data_provider=mock` | Tool đọc JSON synthetic, mô phỏng danh tính/quyền/bản công bố. |
| `data_provider=http` | Tool gọi adapter VinSHC/OpenMRS hiện có. Đây vẫn là mặc định của hệ thống cũ. |
| `model_provider=gemini` hoặc `anthropic` | Model thật chọn tool/dữ kiện; cần cấu hình và key như trước. |
| `model_provider=fake` | Model theo kịch bản để kiểm tra kỹ thuật; không phản ánh chất lượng AI thật. |

`agent:dev` chọn dữ liệu mock nhưng giữ model trong `.env`; với cấu hình Gemini đã có, lệnh dùng Gemini thật.
`agent:demo` chọn cả dữ liệu và model giả, chạy offline sau khi cài dependency. Lỗi model trả `limited`;
service không tự đổi sang fake hoặc model khác.

```powershell
npm run agent:demo                  # demo kỹ thuật, không gọi model ngoài
npm run agent:check -- --model fake # kiểm tra fixture/cấu hình, không mở service
npm run agent:test                  # toàn bộ test agent, không gọi API model thật
```

## 3. Hồ sơ mẫu

Nguồn: [clinical.demo.json](../infra/agent/fixtures/clinical.demo.json). Fixture có version và SHA-256 của
`metadata/vinshc/fields.csv`. Service kiểm tra mã trường, nguồn và liên kết khi khởi động.
Khi metadata thay đổi, đối chiếu fixture rồi cập nhật provenance tương ứng.

| Hồ sơ | Tình huống |
| --- | --- |
| A — đầy đủ | Hai lượt khám, sinh hiệu/đơn vị/thời điểm, bệnh sử, chẩn đoán đã ghi, thuốc đang hiệu lực/đã ngừng, dị ứng, kết quả xét nghiệm và lịch hẹn. Lượt hiện tại đã công bố; bản công bố lượt cũ bị stale và ẩn ở portal. |
| B — còn thiếu | Phiếu nháp; tiền sử `unknown`/`not_asked`, SpO₂ `not_recorded`; chưa ghi khám, thuốc, chẩn đoán và lời dặn. Chưa có hồ sơ công bố nhưng có lịch hẹn. |
| C — ngoài quyền | Thuộc cơ sở/bác sĩ khác: bác sĩ A bị từ chối, bác sĩ B được đọc. Bản công bố đã thu hồi nên bệnh nhân C chưa xem được. |

Mọi tên, số đo, thuốc, chẩn đoán và hướng dẫn đều mô phỏng, không dùng cho điều trị.
Không chứa hồ sơ bệnh nhân thật, password hoặc API key. Không suy “bình thường” hoặc “không dị ứng” từ dữ liệu thiếu.
Chỉ kiểm tra tính hợp lệ toán học của sinh hiệu; không đặt khoảng lâm sàng bình thường/nguy hiểm.

## 4. Danh tính giả lập

| Authorization giả lập | Quyền |
| --- | --- |
| `Bearer demo-doctor` | Bác sĩ A, cơ sở A, hồ sơ A/B. |
| `Bearer demo-doctor-other` | Bác sĩ B, cơ sở B, hồ sơ C. |
| `Bearer demo-nurse` | Điều dưỡng; không được giả vai bác sĩ để gọi doctor chat. |
| `Bearer demo-patient-a` / `Bearer demo-patient-b` / `Bearer demo-patient-c` | Bệnh nhân tương ứng; liên kết hồ sơ được xác định phía server. |

Đây là tên tình huống công khai, không phải token production và không cần tạo user OpenMRS.
Launcher chỉ lắng nghe loopback; service mock cũng chặn kết nối bên ngoài.

Bác sĩ dùng hai header workspace của API chat hiện có. Mock kiểm tra danh tính, cơ sở, bệnh nhân được
phân công và liên kết patient–visit–encounter trước model: sai quyền trả 403, sai liên kết trả 400.
Mỗi lần tool đọc dữ liệu tiếp tục kiểm tra quyền.

Bệnh nhân được xác định từ phiên, không nhận `patientUuid` trong body. Chỉ đọc lời dặn/đơn đã công bố
từ phiếu đã chốt, còn hiệu lực và đúng phiên bản nguồn. Draft, revoked, stale và lượt của người khác
không được trả. Lịch hẹn riêng được đọc độc lập với việc công bố hồ sơ.

## 5. Nối BE mới

```text
FE mới → API chat → LangGraph / guardrail / tool → interface dữ liệu
                                                    ├─ MockBackend / MockPortal
                                                    └─ Adapter BE mới
```

- [backend.py](../infra/agent/src/vinshc_agent/backend.py): `ClinicalDataProvider` cho dữ liệu bác sĩ; `DoctorContextAuthorizer` cho kiểm tra ngữ cảnh trước model. `VinshcBackend` giữ kết nối HTTP hiện có.
- [portal.py](../infra/agent/src/vinshc_agent/portal.py): `PatientPortal` cho danh tính và hồ sơ bệnh nhân đã công bố.
- [mock.py](../infra/agent/src/vinshc_agent/mock.py): fixture, quyền giả lập, `MockBackend`, `MockPortal`.
- [app.py](../infra/agent/src/vinshc_agent/app.py): chọn nguồn; inject `backend`, `portal`, `context_authorizer` để nối adapter khác.
- [records.py](../infra/agent/src/vinshc_agent/records.py): dữ liệu chuẩn hóa → dữ kiện có nguồn và trạng thái thiếu.
- [data-provider.v0.1.json](../infra/agent/contracts/data-provider.v0.1.json): manifest interface nội bộ để đối chiếu.

**Schema mock là dạng nội bộ agent đang hiểu, chưa phải API bắt buộc cho BE mới.** BE tự chọn database,
tên bảng, URL và response. Adapter ánh xạ dữ liệu mới; thay đổi ý nghĩa dữ liệu cần sửa parser/tool và test cùng nhau.
API chat hiện nhận UUID để tương thích MVP. Nếu BE dùng ID khác, thống nhất ánh xạ mã ổn định hoặc sửa
DTO/validation trước khi ghép. Chỉ đổi backend URL sẽ chưa đủ.

Khi BE có thiết kế, đối chiếu: xác thực/token và quyền; mã bệnh nhân/lượt/phiếu; trường/đơn vị/thời điểm/
trạng thái thiếu; nguồn và phiên bản để FE đối chiếu; quy tắc công bố/thu hồi; lỗi/timeout và thay đổi phiên.
Sau đó kiểm thử với BE thật. Quyền giả lập không chứng minh quyền của BE mới đã đúng.

## 6. Phạm vi

Đã chuẩn bị hạ tầng phát triển và kiểm tra kỹ thuật cho các tool/MVP hiện có. Đã thêm RAG tài liệu bản đầu:
corpus mẫu, tìm có nguồn, kiểm quyền và adapter embedding tùy chọn; xem [AGENT_RAG.md](AGENT_RAG.md).
Đã thêm timeline/so sánh, phiên nhớ, streaming, RAG nâng cao và baseline synthetic; xem
[AGENT_ADVANCED.md](AGENT_ADVANCED.md). RAG tài liệu tách với hồ sơ bệnh nhân của BE. Chất lượng model thật
và quyền BE mới cần kiểm khi provider/API sẵn sàng.

Tin nhắn gửi nhóm:

> Mình đã có hồ sơ giả và lớp lấy dữ liệu riêng để làm agent trong lúc BE/FE triển khai lại.
> Anh em cứ thiết kế; khi có API và đăng nhập, hai bên đối chiếu dữ liệu/quyền rồi mình nối adapter vào.
> Schema mock hiện tại là bản nháp nội bộ, không bắt buộc BE giữ cấu trúc OpenMRS.
