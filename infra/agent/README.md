# Chatbot trợ lý hồ sơ (`infra/agent`)

Service Python (FastAPI + LangGraph) cho hai luồng trong [AGENT_PLAN.md](../../docs/AGENT_PLAN.md):

- **Bác sĩ (A):** hỏi đáp, tóm tắt về bệnh nhân và lần khám đang mở, đọc thêm các lần khám trước, sinh hiệu,
  dị ứng, cận lâm sàng và lịch hẹn qua API nhân viên của adapter VinSHC.
- **Bệnh nhân (P):** hiểu lời dặn, đơn thuốc đã xác nhận, lịch hẹn của chính mình. Có API cổng bệnh nhân trên BE; chế độ http xác nhận account–patient và chỉ đọc bản công bố. Chế độ fixture giữ lại cho test.

Agent chỉ đọc: không ghi, chốt phiếu, kê thuốc, đặt chỉ định hay chẩn đoán.

## Kiến trúc

```text
FE ──► API (xác thực, chọn vai trò từ danh tính, giới hạn tần suất)
         │
         ▼
   screen ── guardrail đầu vào: injection, hồ sơ khác, cấp cứu (bệnh nhân), ẩn CCCD/SĐT/email
         │ (từ chối / cấp cứu → trả ngay, không gọi model)
         ▼
   think ⇄ act ── model chọn tool trong allowlist của vai trò; tool đọc backend bằng credential người dùng,
         │        trả dữ kiện có mã F… và mã tham chiếu E…/V…/R…; giới hạn số vòng và số tool mỗi vòng
         ▼
   check ── mỗi câu phải trích dữ kiện có thật, số khớp nguồn, không khuyên điều trị/đổi thuốc, không lộ prompt
         ▼
   phản hồi: dữ kiện dựng từ nguồn + nguồn (UUID, field, thời điểm) + thông tin thiếu + lưu ý + disclaimer
```

## Cấu trúc

```text
infra/agent/
├── pyproject.toml                 # extra "anthropic" cho adapter Claude, "dev" cho pytest
├── Dockerfile, Dockerfile.dockerignore   # build từ gốc repo
├── .env.example
├── fixtures/patient_portal.demo.json      # dữ liệu synthetic cho luồng bệnh nhân (chế độ fixture)
├── src/main.py                            # điểm chạy local: nạp .env, kiểm tra cấu hình, chạy uvicorn
├── src/vinshc_agent/
│   ├── app.py          # FastAPI: /v1/doctor/chat, /v1/patient/chat, /healthz
│   ├── agent.py        # LangGraph screen → think ⇄ act → check, dựng phản hồi
│   ├── prompts.py      # system prompt bác sĩ/bệnh nhân, khối <context>, chuỗi canary
│   ├── guardrails.py   # guardrail đầu vào/đầu ra, ẩn định danh, giới hạn tần suất
│   ├── validate.py     # kiểm tra nguồn và số liệu từng câu
│   ├── tools/          # khung tool + tool bác sĩ (doctor.py) và bệnh nhân (patient.py)
│   ├── records.py      # payload backend → dữ kiện có nguồn, kiểm tra đúng bệnh nhân
│   ├── facts.py        # Fact/Gap, sổ dữ kiện và mã tham chiếu của một lượt hỏi
│   ├── backend.py      # client chỉ đọc tới adapter VinSHC (đường dẫn cố định)
│   ├── portal.py       # hợp đồng cổng bệnh nhân: DisabledPortal, FixturePortal
│   ├── llm/            # kiểu dữ liệu chung, FakeChatModel, ClaudeChatModel
│   ├── fields.py, text.py, config.py, schemas.py
└── tests/              # pytest với backend giả, fixture theo đúng dạng API thật
```

## Chạy local

Cần Python 3.11+ bản Windows chính thức hoặc Linux (Python của MSYS2 không cài được wheel pydantic).

```powershell
cd infra/agent
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"          # thêm ,anthropic để chạy adapter Claude
.venv\Scripts\python -m pytest -q
copy .env.example .env                                   # tùy chọn: sửa cấu hình trong .env
.venv\Scripts\python src\main.py --check                 # kiểm tra cấu hình rồi thoát
.venv\Scripts\python src\main.py --reload                # chạy tại http://127.0.0.1:8000
```

[src/main.py](src/main.py) nạp `infra/agent/.env` (không ghi đè biến môi trường đã đặt), kiểm tra cấu hình và
dừng với mã thoát 2 nếu sai, rồi chạy uvicorn. Tham số: `--host`, `--port`, `--env-file`, `--reload`,
`--log-level`, `--check`. Trong VS Code, chọn interpreter `infra/agent/.venv` để editor nhận các thư viện.

Docker (từ gốc repo):

```powershell
docker build -f infra/agent/Dockerfile -t vinshc-agent .
docker run --rm -p 8000:8000 --env-file infra/agent/.env vinshc-agent
```

## API

Agent không lưu hội thoại. FE gửi lại `history` (tối đa 12 lượt, xen kẽ `user`/`assistant`, dạng văn bản) và
mỗi lượt agent đọc lại dữ kiện qua tool; lịch sử chỉ giúp hiểu câu hỏi, không được dùng làm nguồn.

### `POST /v1/doctor/chat`

Header giống các request FE đang gửi cho backend VinSHC: `Authorization`, `X-VinSHC-Workspace-Role: doctor`,
`X-VinSHC-Workspace-Facility`. Agent gọi `authorization/workspace` để xác nhận workspace bác sĩ trước khi đọc.

```json
{
  "patientUuid": "…", "encounterUuid": "…", "visitUuid": null,
  "message": "Tóm tắt lần khám này giúp tôi",
  "history": [{"role": "user", "text": "…"}, {"role": "assistant", "text": "…"}]
}
```

Nút "Tóm tắt lần khám" trên FE chỉ cần gửi `message` như trên. Chuyển bệnh nhân/lần khám thì FE xóa `history`.

### `POST /v1/patient/chat`

Header `Authorization` của phiên cổng bệnh nhân; body `{"message", "history"}`. Bệnh nhân được xác định từ phiên,
không có tham số chọn hồ sơ.

### Phản hồi 200

```json
{
  "requestId": "…", "persona": "doctor", "status": "ok", "message": null,
  "answer": [{"text": "Nhiệt độ: 38.5 °C (đo lúc 08:50 13/10/2026)",
              "sources": [{"factId": "F9", "section": "vitals", "label": "Nhiệt độ", "kind": "vitals",
                           "uuid": "<obs group>", "field": "vitals.nhiet_do", "recordedAt": "…", "status": "recorded"}]}],
  "missing": [{"section": "history", "label": "Trạng thái tiền sử gia đình", "reason": "not_asked", "detail": "…"}],
  "notes": ["Danh sách dị ứng và trạng thái thuốc phản ánh thời điểm đọc, …"],
  "toolsUsed": ["get_encounter_summary"],
  "context": {"patientUuid": "…", "encounterUuid": "…", "visitUuid": null, "role": "doctor", "facilityUuid": "…"},
  "disclaimer": "AI hỗ trợ — cần bác sĩ kiểm tra lại với hồ sơ gốc.",
  "generatedAt": "…", "model": {"provider": "fake", "name": "scripted"}
}
```

| `status` | Ý nghĩa | FE hiển thị |
| --- | --- | --- |
| `ok` | Mọi câu đều qua kiểm tra | `answer` + nguồn |
| `limited` | Có câu bị loại, model lỗi hoặc vượt giới hạn tool | `message`, phần `answer` còn lại (nếu có) |
| `not_found` | Đã đọc nguồn nhưng không có dữ kiện phù hợp | `message`, `missing` |
| `out_of_scope` | Câu hỏi ngoài phạm vi hồ sơ | `message` (bệnh nhân: hướng tới nhân viên y tế) |
| `refused` | Guardrail chặn (injection, hồ sơ khác, lộ prompt) | `message` |
| `emergency` | Bệnh nhân mô tả dấu hiệu nguy hiểm | `message` hướng dẫn gọi 115, nổi bật |

FE so `context.encounterUuid` với hồ sơ đang mở và bỏ phản hồi đến muộn của hồ sơ đã đóng.

Lỗi trả `{"code", "detail", "requestId"}`, không kèm dữ liệu hồ sơ: 400 `invalid_uuid`; 401 `unauthenticated`;
403 `workspace_required`, `role_not_supported`, `workspace_mismatch`; 422 body sai (history không xen kẽ, câu
hỏi rỗng/quá 1000 ký tự); 429 `rate_limited`; 502 `context_mismatch`, `backend_error`; 503
`backend_unavailable`, `patient_portal_unavailable`; 504 `backend_timeout`.

## Tool

Mọi tool chỉ đọc. Bệnh nhân/lần khám lấy từ ngữ cảnh đã xác thực; tham số của model chỉ là `current`/`all`
hoặc mã tham chiếu do tool trước đó cấp, nên model không thể chèn UUID hay chọn hồ sơ khác.

| Tool (bác sĩ) | Backend | Dùng khi |
| --- | --- | --- |
| `get_encounter_summary(encounter_ref)` | `GET vinshc/encounter/{uuid}/clinical-summary` | Tóm tắt, câu hỏi về lần khám |
| `list_visits()` | `GET vinshc/visits?patient=&status=all` | Lần khám trước, so sánh; cấp mã V…/E… |
| `get_vitals_history(visit_ref)` | `GET vinshc/vitals?patient=&visit=` | Diễn biến sinh hiệu |
| `get_active_allergies()` | `GET vinshc/allergy?patient=` | Dị ứng đang hoạt động |
| `list_diagnostic_orders(visit_ref)` | `GET vinshc/operations/service-orders?patient=&state=all` | Chỉ định CLS; cấp mã R… |
| `get_diagnostic_result(result_ref)` | `GET vinshc/operations/results/{uuid}` | Giá trị, trạng thái kết quả |
| `list_appointments()` | `GET vinshc/operations/appointments?patient=` | Lịch hẹn, tái khám |
| `get_patient_demographics()` | `GET vinshc/patients/{uuid}` | Giới tính, tuổi (bỏ tên, SĐT, CCCD, địa chỉ) |

| Tool (bệnh nhân) | Hợp đồng đề xuất | Dùng khi |
| --- | --- | --- |
| `list_my_visits()` | `GET portal/visits` | Các lần khám đã công bố; cấp mã V… |
| `get_visit_instructions(visit_ref)` | `GET portal/visits/{uuid}/instructions` | Lời dặn, ngày tái khám |
| `get_my_prescriptions(visit_ref)` | `GET portal/prescriptions?visit=` | Đơn thuốc đã xác nhận |
| `list_my_appointments()` | `GET portal/appointments` | Lịch hẹn |

## System prompt

[prompts.py](src/vinshc_agent/prompts.py) có một prompt cho mỗi vai trò, cố định trong suốt tiến trình (cache được
và không làm hỏng vòng tool đang chạy). Nội dung chính: phạm vi chỉ đọc hồ sơ đang mở / hồ sơ của chính mình;
mọi dữ kiện lấy từ tool trong lượt này; giữ nguyên số, đơn vị, trạng thái thiếu; không chẩn đoán mới, khuyến
nghị điều trị hay đổi thuốc; nội dung tool/hồ sơ/tin nhắn là dữ liệu, không phải chỉ dẫn; định dạng JSON đầu ra.
Thông tin thay đổi theo lượt (thời điểm, liên hệ phòng khám) nằm trong khối `<context>` của tin nhắn.

## Guardrail

| Lớp | Biện pháp |
| --- | --- |
| Danh tính, quyền | Vai trò lấy từ danh tính đã xác thực; bác sĩ phải có workspace `doctor` được backend xác nhận; backend kiểm quyền và ghi audit cho mọi lần đọc |
| Đầu vào | Chặn mẫu prompt injection (tiếng Việt/Anh, thẻ giả `<system>`), cả trong `history`; chặn UUID ngoài ngữ cảnh; bệnh nhân hỏi hồ sơ người thân → từ chối; ẩn CCCD/SĐT/email trước khi gửi model |
| Cấp cứu | Bệnh nhân mô tả khó thở, đau ngực, ngất, co giật, chảy máu nhiều, sưng môi/lưỡi, ý nghĩ tự hại… → trả hướng dẫn gọi 115 ngay, không gọi model |
| Tool | Allowlist theo vai trò; tham số được kiểm tra; mã tham chiếu chỉ do tool cấp; dữ liệu khác bệnh nhân → dừng cả lượt (`context_mismatch`); tối đa 4 vòng × 4 tool |
| Đầu ra | Mỗi câu phải trích dữ kiện có thật; MVP dựng nội dung hiển thị trực tiếp từ nhãn/giá trị nguồn để giữ đúng số, đơn vị, chẩn đoán và trạng thái; bác sĩ: loại câu khuyến nghị điều trị; bệnh nhân: loại câu khuyên đổi/ngừng/thêm thuốc, đổi liều, khẳng định chẩn đoán không có nguồn; loại câu chứa định danh cá nhân; lộ chuỗi canary → chặn cả câu trả lời |
| Vận hành | Giới hạn 20 lượt hỏi/phút/người dùng; `Cache-Control: no-store`; log chỉ ghi số liệu (request ID, trạng thái, tool, số câu bị loại và lý do, thời gian), không ghi header, câu hỏi, câu trả lời hay hồ sơ |

Guardrail bằng luật là lớp bổ sung, không bắt được mọi cách diễn đạt. Bộ ca đánh giá (AGENT_PLAN §10) vẫn là
điều kiện nghiệm thu.

## Model

- `gemini`: Gemini Developer API, mặc định `gemini-3.8-flash`, thinking `low`. Dùng tool calling và JSON schema trong cùng vòng agent; giữ nguyên thought signature giữa các vòng. Free tier chỉ thử dữ liệu synthetic: Google không cho gửi thông tin nhạy cảm/cá nhân vào unpaid services ([điều khoản](https://ai.google.dev/gemini-api/terms)).
- `fake` (mặc định): chọn tool theo từ khóa và trả mỗi dữ kiện liên quan thành một câu. Dùng cho test, contract
  và demo; không phản ánh chất lượng ngôn ngữ của model thật.
- `anthropic`: Claude (`claude-opus-5-5`, effort `high`), tool `strict`, câu trả lời theo JSON schema, cache
  system prompt + tool, bật server-side fallback khi bộ lọc an toàn từ chối. **Chỉ dùng với dữ liệu synthetic**
  cho đến khi đánh giá tác động xử lý dữ liệu cá nhân ([VIETNAM_COMPLIANCE.md](../../docs/VIETNAM_COMPLIANCE.md))
  được duyệt.

### Test Gemini 3.8 Flash bằng Docker

Từ gốc repo, sao chép `infra/agent/gemini.env.example` thành `infra/agent/.env` và điền `GEMINI_API_KEY` lấy từ [Google AI Studio](https://aistudio.google.com/apikey). Giữ `VINSHC_AGENT_MODEL_PROVIDER=gemini` và `VINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true`. Docker đọc file này lúc chạy, không đóng gói key trong image.

```powershell
npm run mvp:agent-build
npm run mvp:model-check
npm run mvp:up
```

`agent-build` chỉ build agent, không build backend/frontend. `model-check` gọi Models API để xác nhận key/model, không gửi hồ sơ hoặc sinh câu trả lời. Sau lần build đầu, chạy lại bằng `mvp:up`; dừng bằng `mvp:stop`. Muốn trở về giả lập, đổi provider thành `fake` và `ALLOW_EXTERNAL_MODEL=false` trong file `.env` của agent rồi chạy lại `mvp:up`.

Mở `/connected.html` bằng tài khoản bác sĩ có workspace/provider và chọn hồ sơ synthetic/lần khám; hoặc `/portal.html` bằng tài khoản bệnh nhân được liên kết và có bản công bố. Hỏi tự nhiên để model chọn tool/dữ kiện. Nội dung lâm sàng hiển thị vẫn được dựng từ dữ kiện nguồn như contract MVP; bật model thật chưa bật suy luận chẩn đoán hay tư vấn điều trị tự do.

Mỗi lượt chat có thể gọi Gemini nhiều lần. HTTP 429 nghĩa là hết quota/giới hạn của project Google; không tự đổi sang model trả phí hoặc giả lập. Template Gemini tắt retry để hạn chế gọi lại khi test free tier. Model ID/thinking level đã đối chiếu [Google](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash): `gemini-3.8-flash`, thinking `low` (không hỗ trợ `minimal`).

### Gắn API key cho Claude

1. Cài SDK: `.venv\Scripts\python -m pip install -e ".[anthropic]"` (Docker: `--build-arg AGENT_EXTRAS=anthropic`).
2. Trong `infra/agent/.env` (đã nằm trong `.gitignore`), bật provider và cờ cho phép:

   ```dotenv
   VINSHC_AGENT_MODEL_PROVIDER=anthropic
   VINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true
   ```

3. Chọn **một** cách cung cấp credential:

   | Cách | Cấu hình | Dùng khi |
   | --- | --- | --- |
   | Biến môi trường | `ANTHROPIC_API_KEY=sk-ant-…` trong `infra/agent/.env` | Máy phát triển |
   | File khóa | `VINSHC_AGENT_ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key` (một dòng chứa khóa) | Docker secret, secret manager; được ưu tiên hơn biến môi trường |
   | Profile CLI | `ant auth login`, rồi `ANTHROPIC_PROFILE=<tên profile>` | Không muốn lưu khóa dạng văn bản |

4. Kiểm tra: `.venv\Scripts\python src\main.py --check-model`. Lệnh gọi Models API để xác nhận khóa và quyền dùng
   model (không tốn token, không gửi dữ liệu hồ sơ). Mã thoát 2: thiếu cấu hình/credential; 3: khóa sai, không có
   quyền hoặc model không tồn tại.

Docker:

```powershell
docker build -f infra/agent/Dockerfile --build-arg AGENT_EXTRAS=anthropic -t vinshc-agent .
docker run --rm -p 8000:8000 --env-file infra/agent/.env vinshc-agent
# hoặc gắn khóa bằng file thay vì biến môi trường:
docker run --rm -p 8000:8000 --env-file infra/agent/.env `
  -e VINSHC_AGENT_ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key `
  -v C:\secrets\anthropic_api_key:/run/secrets/anthropic_api_key:ro vinshc-agent
```

Service không khởi động khi thiếu SDK, thiếu cờ cho phép hoặc không có credential nào. Giá trị khóa không
được lưu trong cấu hình, không in ra màn hình và không ghi log; chỉ nguồn của khóa được hiển thị. Không dán khóa
vào chat, issue hay file được commit; nếu lộ, thu hồi khóa trên Anthropic Console và tạo khóa mới.

## Luồng bệnh nhân: API đã triển khai

`VINSHC_AGENT_PATIENT_PORTAL=http` nối API thật; disabled (mặc định khi chạy Python riêng) trả 503. `fixture` đọc
[patient_portal.demo.json](fixtures/patient_portal.demo.json) (token demo `Bearer demo-patient-binh`) để FE và
agent phát triển song song. Bản thật cần backend cung cấp, theo đề xuất:

- Đăng nhập bệnh nhân và liên kết tài khoản → bệnh nhân do backend xác nhận; agent chỉ chuyển tiếp phiên.
- `GET portal/visits` → `{"results": [{"uuid", "startDatetime", "facilityName", "serviceName"}]}`
- `GET portal/visits/{uuid}/instructions` → `{"visitUuid", "publishedAt", "items": [{"field", "label", "text"}]}`
- `GET portal/prescriptions?visit=` → `{"results": [{"uuid", "visitUuid", "drugName", "strength", "dose", "frequency", "route", "duration", "instructions", "status", "confirmedAt"}]}`
- `GET portal/appointments` → `{"results": [{"uuid", "startAt", "serviceName", "status"}]}`

Contract đã triển khai xem docs/api/patient-portal.md. Backend chỉ trả phần đã được bác sĩ/phòng khám công bố, không trả bản nháp hay ghi chú nội bộ. Lớp HttpPortal trong portal.py chuyển tiếp credential, không gửi cookie phiên từ người dùng khác. Không dùng API nhân viên hay tài khoản
dùng chung để đọc thay bệnh nhân.

## Nối với FE

FE đã gọi agent qua cùng origin, proxy `/agent` → `http://127.0.0.1:8000` trong `vite.config.mjs` (vùng file
của người 2), và gửi cùng header như `BackendClient`. Agent không bật CORS.

## Giới hạn và việc tiếp theo

- B12 đã kiểm tra OpenMRS thật với model fake. Đánh giá chất lượng/model thật và bộ 10–20 ca có expected output được để lại theo phạm vi đã chốt.
- Đơn vị sinh hiệu lấy từ `metadata/vinshc/fields.csv` vì API chưa trả `unit`.
- Audit backend đánh dấu agent: cho lượt đọc do service agent thực hiện; marker không cấp quyền.
- BE kiểm tra quan hệ provider–bệnh nhân cho lượt đọc của agent, cùng scope cơ sở/workspace.
- Giới hạn tần suất lưu trong bộ nhớ một tiến trình; chạy nhiều bản cần chuyển sang kho dùng chung (Redis…).
- CI tại .github/workflows/agent.yml và B12 trong CI hệ thống; Compose tại compose.agent.yaml.

## Tích hợp MVP

Xem ../../docs/AGENT_MVP_HANDOFF.md để chạy npm run mvp:up, mở trang bác sĩ/bệnh nhân và cấp liên kết tài khoản. PatientChatIn có visitUuid tùy chọn được BE kiểm tra trước khi gọi model. Câu trả lời MVP được dựng từ dữ kiện nguồn; diễn giải tự do sẽ được bổ sung sau đánh giá. HTTP client không chuyển cookie phiên giữa các user, và tracing LangSmith được tắt cho lượt hỏi. Dependency constraints được lưu trong constraints.txt.
