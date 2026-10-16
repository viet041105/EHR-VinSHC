# Sơ đồ toàn hệ thống VinSHC

Tài liệu gom các sơ đồ Mermaid mô tả hệ thống ở trạng thái hiện tại của `main` (16/10/2026): bối cảnh, triển khai Docker, thành phần backend/frontend/agent, phân quyền, luồng nghiệp vụ, database và CI. Lộ trình tầng 2–3 ở cuối là **kế hoạch**, chưa triển khai.

Mục lục:

1. [Bối cảnh hệ thống](#1-bối-cảnh-hệ-thống)
2. [Triển khai Docker Compose](#2-triển-khai-docker-compose)
3. [Thành phần backend](#3-thành-phần-backend)
4. [Thành phần frontend](#4-thành-phần-frontend)
5. [Trợ lý AI (agent)](#5-trợ-lý-ai-agent)
6. [Các lớp bảo mật và phân quyền](#6-các-lớp-bảo-mật-và-phân-quyền)
7. [Luồng một lần khám](#7-luồng-một-lần-khám)
8. [Luồng bác sĩ hỏi trợ lý](#8-luồng-bác-sĩ-hỏi-trợ-lý)
9. [Luồng công bố hồ sơ cho người bệnh](#9-luồng-công-bố-hồ-sơ-cho-người-bệnh)
10. [Database: bảng VinSHC và liên kết với OpenMRS](#10-database-bảng-vinshc-và-liên-kết-với-openmrs)
11. [Build và CI](#11-build-và-ci)
12. [Lộ trình mở rộng](#12-lộ-trình-mở-rộng)

---

## 1. Bối cảnh hệ thống

```mermaid
flowchart LR
    subgraph Users["Người dùng"]
        Staff["Nhân viên phòng khám<br/>lễ tân · thu ngân · điều dưỡng · bác sĩ<br/>KTV xét nghiệm · dược · quản lý · admin"]
        Patient["Người bệnh"]
        Dev["Quản trị kỹ thuật<br/>(System Developer)"]
    end

    subgraph VinSHC["Hệ thống VinSHC (một phòng khám, tầng 1)"]
        ClinicApp["Clinic app + Cổng người bệnh<br/>(SPA tự viết)"]
        Agent["Trợ lý AI chỉ đọc<br/>(FastAPI + LangGraph)"]
        EMR["OpenMRS 3.7.1 + module VinSHC"]
        DB[("PostgreSQL 16")]
    end

    LLM["Nhà cung cấp LLM<br/>Claude · Gemini · OpenAI<br/>(hoặc model fake offline)"]

    subgraph Future["Tích hợp ngoài (khung, đang tắt)"]
        BHYT["BHYT"]
        HDDT["Hóa đơn điện tử"]
        DTQG["Đơn thuốc quốc gia"]
        LIS["LIS"]
        PACS["PACS"]
    end

    Staff --> ClinicApp
    Patient --> ClinicApp
    Dev --> EMR
    ClinicApp --> EMR
    ClinicApp --> Agent
    Agent -->|"REST bằng phiên của người hỏi"| EMR
    Agent -.->|"chỉ khi cho phép model ngoài"| LLM
    EMR --> DB
    EMR -.->|"integrations/ disabled"| Future
```

## 2. Triển khai Docker Compose

`compose.yaml` là baseline OpenMRS; `compose.agent.yaml` thêm agent và clinic app. Chỉ hai cổng mở ra máy host, đều bind `127.0.0.1`.

```mermaid
flowchart TB
    Browser["Trình duyệt"]

    subgraph Host["Máy host (127.0.0.1)"]
        P5173["cổng VINSHC_APP_PORT<br/>mặc định 5173"]
        P8080["cổng EHR_HTTP_PORT<br/>mặc định 8080"]
    end

    subgraph Compose["Docker network: ehr-vinshc"]
        Clinic["clinic<br/>nginx + SPA build<br/>ehr-vinshc-clinic:0.2.0"]
        Gateway["gateway<br/>O3 gateway nginx 3.7.1"]
        Frontend["frontend<br/>O3 reference SPA 3.7.1<br/>(giao diện OpenMRS gốc)"]
        Backend["backend<br/>OpenMRS 3.7.1 + VinSHC 0.3.0<br/>Tomcat :8080"]
        AgentSvc["agent<br/>Python :8000<br/>ehr-vinshc-agent:0.1.0"]
        Db[("db<br/>postgres:16.15<br/>database openmrs, UTF8")]
    end

    VolPg[("volume postgres-data")]
    VolOmrs[("volume openmrs-pg-data<br/>runtime, module, file đính kèm")]
    InitDb["infra/postgres/initdb<br/>fuzzystrmatch, uuid-ossp"]

    Browser --> P5173 --> Clinic
    Browser --> P8080 --> Gateway
    Clinic -->|"/api/ → /openmrs/ws/rest/v1/"| Gateway
    Clinic -->|"/agent/ → agent:8000"| AgentSvc
    Gateway -->|"/openmrs/spa"| Frontend
    Gateway -->|"/openmrs"| Backend
    AgentSvc -->|"http://backend:8080/openmrs/ws/rest/v1"| Backend
    Backend -->|"JDBC, dialect VinSHCPostgreSQLDialect"| Db
    Db --- VolPg
    Backend --- VolOmrs
    InitDb -.->|"lần khởi tạo đầu"| Db

    classDef store fill:#eef,stroke:#669
    class Db,VolPg,VolOmrs store
```

Thứ tự khởi động theo healthcheck: `db` (pg_isready) → `backend` (`/openmrs/health/started`) → `frontend` → `gateway` → `agent` → `clinic`.

## 3. Thành phần backend

```mermaid
flowchart TB
    subgraph Image["Image backend: ehr-vinshc-backend:3.7.1-postgresql"]
        subgraph Core["OpenMRS Core 2.8.8 + 29 module upstream"]
            REST["webservices.rest"]
            FHIR["FHIR2 4.2.0"]
            Init["Initializer 2.12.0<br/>(parser person attribute đã vá)"]
            Upstream["idgen · emrapi · appointments* · queue<br/>billing · stockmanagement* · attachments<br/>reporting* · openconceptlab* · ..."]
            Liquibase["Liquibase Core + module"]
        end

        subgraph PgFix["Bản vá PostgreSQL (infra/backend/postgresql)"]
            Dialect["VinSHCPostgreSQLDialect<br/>TEXT/BYTEA thay OID, identity column"]
            SeqFix["vinshc-postgresql-sequences.xml<br/>đẩy sequence sau seed ID"]
            Bytea["reporting / OCL: OID → BYTEA"]
            ApptMig["Appointments: migration PostgreSQL"]
            StockPre["Stock: precondition FK theo catalog"]
        end

        subgraph VinMod["Module VinSHC 0.3.0 (infra/backend/vinshc-module)"]
            subgraph Web["Controller /ws/rest/v1/vinshc/..."]
                C1["VinshcController · CareController<br/>bệnh nhân, lượt khám, sinh hiệu, danh sách"]
                C2["ClinicalController<br/>chẩn đoán, dị ứng, đơn thuốc, chốt phiếu"]
                C3["OperationsController /operations<br/>lịch hẹn, hàng đợi, hóa đơn, thanh toán,<br/>chỉ định, kết quả, đính kèm, phiếu in, báo cáo"]
                C4["PharmacyController /pharmacy<br/>cấp thuốc, sửa, hủy"]
                C5["PortalController /portal<br/>cổng người bệnh"]
                C6["AuthorizationController · StaffAccountController<br/>DirectoryController · FormWorkflowController<br/>PatientAccessController · NotificationController"]
            end
            subgraph Guard["Lớp chặn"]
                Scoped["ScopedCorePrivilegeInterceptor<br/>cấp quyền Core tạm thời theo request"]
                PortalIso["PortalIsolationInterceptor"]
                FhirGuard["PortalFhirGuardFilter"]
            end
            subgraph Svc["Service (@Transactional, JDBC thuần)"]
                AuthSvc["AuthorizationService<br/>role × facility, audit đọc"]
                Domain["CareService · ClinicalService · OperationsService<br/>PharmacyService · PortalService · DirectoryService<br/>StaffAccountService · FormWorkflowService<br/>PatientAccessService · NotificationService"]
                Locks["TransactionLocks<br/>pg_advisory_xact_lock"]
                Events["ClinicalEvents<br/>nhật ký ghi lâm sàng"]
            end
            ModLiquibase["liquibase.xml<br/>25 bảng vinshc_*"]
        end

        subgraph Meta["Metadata đóng gói vào image"]
            InitCfg["openmrs_config/ (Initializer)<br/>concept, encounter type, visit type, role,<br/>privilege, location, identifier, địa giới"]
            Catalog["vinshc_metadata/<br/>facilities.json · services.json · prices.json<br/>workflow.json · printing-reporting.json<br/>b4-b9.json · address-vn-19-2025.json"]
        end
    end

    Db[("PostgreSQL<br/>~240 bảng OpenMRS + 25 bảng vinshc_*")]

    Web --> Guard --> Svc
    Svc -->|"Context API: Patient, Visit, Encounter, Obs, Order"| Core
    Svc -->|"SQL trên session Hibernate"| Db
    Svc --> Catalog
    Init --> InitCfg
    Core --> Db
    Liquibase --> Db
    ModLiquibase --> Db
    PgFix -.-> Core
```

`*` là module có bản vá PostgreSQL. Lịch hẹn, hàng đợi, billing và cấp thuốc của ứng dụng dùng bảng `vinshc_*`; module upstream tương ứng vẫn khởi động nhưng không là hợp đồng của ứng dụng.

## 4. Thành phần frontend

```mermaid
flowchart TB
    subgraph Pages["Trang (infra/frontend)"]
        Landing["landing/ · index.html<br/>trang giới thiệu"]
        StaffPage["connected.html<br/>app nhân viên"]
        PortalPage["portal.html<br/>cổng người bệnh"]
    end

    subgraph Shell["shell/src"]
        Main["main.js · app.js<br/>đăng nhập, chọn workspace, điều hướng"]
        Loader["module-loader.js"]
        Screens["screens.js · worklist-view.js<br/>result-view.js · task-guide.js · page-design.js"]
        Doctor["doctor-workspace.js<br/>doctor-assistant.js"]
        Chat["agent-chat.js<br/>khung chat + nguồn trích dẫn"]
        Notif["notifications.js · patient-access.js"]
        PortalJs["portal.js"]
    end

    subgraph Modules["modules/*/src (theo vai trò)"]
        M1["patients · visits · vitals"]
        M2["clinical · orders · documents"]
        M3["scheduling · billing · pharmacy"]
        M4["reports · admin"]
    end

    subgraph CorePkg["packages/core"]
        Client["client API /api/ (REST VinSHC)"]
        Model["workspace-model.js · permissions"]
        CoreMeta["metadata/ catalogues + contracts<br/>(bản sao metadata dùng ở FE)"]
    end

    Styles["styles/ · assets/<br/>token và component dùng chung"]
    Nginx["nginx.conf<br/>/ static · /api/ → gateway · /agent/ → agent"]

    StaffPage --> Main --> Loader --> Modules
    Main --> Screens
    Main --> Doctor --> Chat
    Main --> Notif
    PortalPage --> PortalJs --> Chat
    Modules --> CorePkg
    Shell --> CorePkg
    Pages --> Styles
    Client --> Nginx
    Chat -->|"/agent/v1/doctor/chat<br/>/agent/v1/patient/chat"| Nginx
```

## 5. Trợ lý AI (agent)

```mermaid
flowchart TB
    In["POST /v1/doctor/chat hoặc /v1/patient/chat<br/>(kèm phiên đăng nhập của người hỏi)"]

    subgraph App["app.py (FastAPI)"]
        AuthN["Xác thực qua backend<br/>vai trò lấy từ danh tính, không từ client"]
        Rate["Giới hạn tần suất"]
        Conv["Hội thoại trong bộ nhớ<br/>theo phiên, có giới hạn"]
    end

    subgraph Graph["agent.py (LangGraph)"]
        Screen["screen<br/>guardrails.py: prompt injection, hồ sơ người khác,<br/>dấu hiệu cấp cứu, ẩn CCCD/SĐT/email"]
        Think["think<br/>prompts.py + LLM"]
        Act["act<br/>chỉ tool trong allowlist của vai trò"]
        Check["check<br/>validate.py: mỗi câu phải trích dữ kiện,<br/>số khớp nguồn, không khuyên điều trị"]
    end

    subgraph Tools["tools/"]
        TDoc["doctor.py<br/>bệnh nhân, lần khám, sinh hiệu, dị ứng,<br/>cận lâm sàng, đơn thuốc, lịch hẹn"]
        TPat["patient.py<br/>bản công bố, đơn đã xác nhận, lịch hẹn"]
        TTime["timeline.py · conversation.py"]
        TKnow["knowledge.py → retrieval.py<br/>BM25 offline / embedding tùy chọn"]
    end

    subgraph Data["Nguồn dữ liệu"]
        BackendCli["backend.py<br/>client chỉ đọc, đường dẫn cố định"]
        PortalCli["portal.py<br/>HTTP / Fixture / Disabled"]
        Mock["mock.py + fixtures/<br/>dữ liệu giả cho dev và test"]
        KB["knowledge/documents + manifest.json"]
        Facts["records.py · facts.py<br/>payload → dữ kiện F… có mã nguồn E…/V…/R…"]
    end

    subgraph LLMs["llm/"]
        Claude["claude.py"]
        Gemini["gemini.py"]
        OpenAI["openai.py"]
        Fake["fake.py"]
    end

    Out["Phản hồi: câu trả lời + nguồn (UUID, trường, thời điểm)<br/>+ thông tin thiếu + lưu ý + disclaimer"]
    BE["Backend VinSHC REST"]

    In --> AuthN --> Rate --> Screen
    Screen -->|"từ chối / cấp cứu: trả ngay, không gọi model"| Out
    Screen --> Think
    Think <--> Act
    Act --> Tools
    TDoc & TTime --> BackendCli
    TPat --> PortalCli
    TKnow --> KB
    BackendCli & PortalCli --> Facts
    BackendCli --> BE
    PortalCli --> BE
    Mock -.->|"VINSHC_AGENT_DATA_PROVIDER=mock"| Facts
    Think --> LLMs
    Think --> Check --> Out
    Conv -.-> Think
```

Agent không có database riêng và không ghi gì vào hồ sơ.

## 6. Các lớp bảo mật và phân quyền

```mermaid
flowchart LR
    Req["Request từ trình duyệt"]

    subgraph L1["Lớp mạng"]
        Bind["Chỉ bind 127.0.0.1"]
        Proxy["nginx clinic / gateway"]
    end

    subgraph L2["Lớp xác thực"]
        Session["Phiên OpenMRS (JSESSIONID)"]
        PortalAcc["vinshc_portal_account<br/>+ portal_link_event (xác minh)"]
    end

    subgraph L3["Lớp phân quyền VinSHC"]
        Role["Ma trận vai trò × thao tác<br/>requireOperation"]
        Workspace["vinshc_workspace_assignment<br/>một role + một cơ sở / tài khoản"]
        Scope["Phạm vi cơ sở<br/>bệnh nhân có visit/registration tại cây location"]
        Enc["Phạm vi encounter<br/>location của encounter thuộc cơ sở"]
        Agentscope["Gán bệnh nhân cho agent<br/>requireAgentAssignment"]
    end

    subgraph L4["Chặn đường vòng"]
        CoreBlock["Core REST/FHIR trực tiếp: 403 với role ứng dụng"]
        TempPriv["Quyền Core chỉ cấp tạm trong request /vinshc/**"]
        PortalBlock["Tài khoản người bệnh chỉ vào /vinshc/portal"]
    end

    subgraph L5["Kiểm toán"]
        AccessEv["vinshc_access_event<br/>mọi lần đọc hồ sơ"]
        ClinEv["vinshc_clinical_event<br/>mọi lần ghi / sửa / hủy"]
        AdminEv["vinshc_admin_event<br/>quản trị tài khoản, cơ sở"]
    end

    Req --> L1 --> L2 --> L3 --> L4
    L3 --> L5
```

## 7. Luồng một lần khám

Các điểm hàng đợi theo `workflow.json`. Cơ sở chọn một trong hai quy trình: `STANDARD_POSTPAY` hoặc `COMPACT_PREPAY` (`vinshc_facility_workflow`).

```mermaid
flowchart LR
    Appt["Đặt lịch hẹn<br/>vinshc_appointment"] -.-> Reception
    Walkin["Khách vãng lai"] --> Reception

    subgraph Visit["Một lượt khám (visit)"]
        Reception["RECEPTION<br/>Lễ tân: tìm / đăng ký bệnh nhân,<br/>mở visit, cấp số"]
        Nurse["NURSE<br/>Điều dưỡng: sinh hiệu"]
        Doctor["DOCTOR<br/>Bác sĩ: khám, chẩn đoán, dị ứng,<br/>chỉ định, kê đơn, chốt phiếu"]
        Lab["LAB<br/>KTV: nhận chỉ định, nhập kết quả,<br/>đính kèm; người duyệt xác nhận"]
        Cashier["CASHIER<br/>Thu ngân: hóa đơn, thanh toán,<br/>hoàn tiền, phiếu thu"]
        Pharmacy["PHARMACY<br/>Dược: cấp thuốc theo đơn"]
    end

    Close["Đóng visit"]
    Publish["Công bố hồ sơ cho người bệnh<br/>vinshc_portal_publication"]
    Left["left (rời hàng đợi, có lý do)"]

    Reception --> Nurse --> Doctor
    Doctor -->|"có chỉ định CLS"| Lab --> Doctor
    Doctor --> Cashier --> Pharmacy --> Close
    Doctor -.->|"COMPACT_PREPAY: thu trước"| Cashier
    Close --> Publish
    Reception & Nurse & Doctor & Lab & Cashier & Pharmacy -.-> Left
```

## 8. Luồng bác sĩ hỏi trợ lý

```mermaid
sequenceDiagram
    autonumber
    actor BS as Bác sĩ
    participant FE as Clinic app (agent-chat.js)
    participant NG as nginx clinic
    participant AG as Agent
    participant BE as Backend VinSHC
    participant DB as PostgreSQL
    participant LLM as LLM provider

    BS->>FE: Hỏi về bệnh nhân / lần khám đang mở
    FE->>NG: POST /agent/v1/doctor/chat (cookie phiên)
    NG->>AG: POST /v1/doctor/chat
    AG->>BE: Xác thực phiên, lấy vai trò và workspace
    BE-->>AG: doctor @ cơ sở X
    AG->>AG: screen: injection, hồ sơ khác, ẩn định danh
    loop think ⇄ act (giới hạn số vòng)
        AG->>LLM: prompt + tool được phép
        LLM-->>AG: gọi tool
        AG->>BE: GET /vinshc/... bằng phiên bác sĩ
        BE->>BE: kiểm tra role, phạm vi cơ sở, encounter
        BE->>DB: đọc dữ liệu
        BE->>DB: ghi vinshc_access_event
        BE-->>AG: payload
        AG->>AG: chuyển thành dữ kiện F… có nguồn
    end
    AG->>AG: check: trích dẫn, số liệu, không khuyên điều trị
    AG-->>FE: câu trả lời + nguồn + thông tin thiếu
    FE-->>BS: Hiển thị, bấm nguồn để mở bản ghi gốc
```

## 9. Luồng công bố hồ sơ cho người bệnh

```mermaid
sequenceDiagram
    autonumber
    actor BS as Bác sĩ
    actor AD as Admin / lễ tân
    actor BN as Người bệnh
    participant BE as Backend VinSHC
    participant DB as PostgreSQL
    participant AG as Agent

    BS->>BE: Yêu cầu tạo tài khoản người bệnh
    BE->>DB: vinshc_patient_access_request (pending)
    BE->>DB: vinshc_notification cho người xử lý
    AD->>BE: Xác minh danh tính, tạo tài khoản
    BE->>DB: users + vinshc_portal_account + vinshc_portal_link_event
    BS->>BE: Chốt phiếu khám (finalize)
    BE->>DB: vinshc_clinical_event consultation_finalized
    BS->>BE: Công bố lượt khám
    BE->>DB: vinshc_portal_publication (snapshot payload_json, version)
    BE->>DB: vinshc_portal_publication_event (published)
    BN->>BE: Đăng nhập portal.html, xem bản công bố
    BN->>AG: Hỏi về lời dặn / đơn thuốc
    AG->>BE: GET /vinshc/portal/... bằng phiên người bệnh
    BE-->>AG: chỉ bản đã công bố của chính người đó
    AG-->>BN: Giải thích có trích nguồn
```

## 10. Database: bảng VinSHC và liên kết với OpenMRS

Bảng viết hoa là bảng gốc OpenMRS (chỉ liệt kê cột khóa). Chi tiết cột ở `infra/backend/vinshc-module/api/src/main/resources/liquibase.xml`.

```mermaid
erDiagram
    PATIENT {
        int patient_id PK
    }
    VISIT {
        int visit_id PK
        int patient_id FK
        int location_id FK
    }
    ENCOUNTER {
        int encounter_id PK
        int visit_id FK
    }
    ORDERS {
        int order_id PK
        int encounter_id FK
    }
    LOCATION {
        int location_id PK
        int parent_location FK
    }
    USERS {
        int user_id PK
    }
    PROVIDER {
        int provider_id PK
    }

    PATIENT ||--o{ VISIT : has
    VISIT ||--o{ ENCOUNTER : has
    ENCOUNTER ||--o{ ORDERS : has
    LOCATION ||--o{ VISIT : at

    vinshc_contact {
        bigint contact_id PK
        varchar row_key
        int version_number
        int patient_id FK
        boolean is_current
        varchar status
    }
    vinshc_field_state {
        bigint field_state_id PK
        int patient_id FK
        varchar field_code
        varchar data_status
        boolean is_current
    }
    vinshc_address_snapshot {
        bigint address_id PK
        varchar row_key
        int patient_id FK
        varchar province_code
        varchar commune_code
        boolean is_current
    }
    vinshc_patient_registration {
        bigint registration_id PK
        int patient_id FK
        int facility_location_id FK
        varchar idempotency_key UK
    }
    PATIENT ||--o{ vinshc_contact : "liên hệ"
    PATIENT ||--o{ vinshc_field_state : "trạng thái trường"
    PATIENT ||--o{ vinshc_address_snapshot : "địa chỉ"
    PATIENT ||--o{ vinshc_patient_registration : "đăng ký tại"
    LOCATION ||--o{ vinshc_patient_registration : "cơ sở"

    vinshc_business_facility {
        varchar facility_uuid PK
        int location_id FK
        varchar facility_code UK
        varchar timezone
        boolean active
    }
    vinshc_workspace_assignment {
        bigint assignment_id PK
        int user_id FK
        varchar role_name
        int facility_location_id FK
        boolean active
    }
    vinshc_provider_link {
        varchar link_uuid PK
        int user_id FK
        int provider_id FK
        int facility_location_id FK
    }
    vinshc_facility_workflow {
        int facility_location_id PK
        varchar workflow_code
    }
    vinshc_form_definition {
        varchar form_uuid PK
        varchar form_code
        int facility_location_id FK
        int version_number
        varchar state
    }
    LOCATION ||--o| vinshc_business_facility : "pháp nhân"
    LOCATION ||--o| vinshc_facility_workflow : "quy trình"
    LOCATION ||--o{ vinshc_form_definition : "biểu mẫu"
    USERS ||--o{ vinshc_workspace_assignment : "làm việc tại"
    USERS ||--o{ vinshc_provider_link : "là provider"
    PROVIDER ||--o{ vinshc_provider_link : "liên kết"

    vinshc_appointment {
        bigint appointment_id PK
        int patient_id FK
        int visit_id FK
        int provider_id FK
        timestamptz start_at
        timestamptz end_at
        varchar status
    }
    vinshc_queue_item {
        bigint queue_item_id PK
        int visit_id FK
        varchar point_code
        int iteration
        int queue_number
        varchar state
    }
    PATIENT ||--o{ vinshc_appointment : "hẹn"
    VISIT |o--o{ vinshc_appointment : "check-in"
    VISIT ||--o{ vinshc_queue_item : "hàng đợi"

    vinshc_bill {
        bigint bill_id PK
        int visit_id FK
        varchar facility_uuid
        text lines_json
        bigint total_vnd
        varchar status
    }
    vinshc_payment {
        bigint payment_id PK
        bigint bill_id FK
        varchar kind
        bigint original_payment_id FK
        bigint amount_vnd
        varchar status
    }
    VISIT ||--o{ vinshc_bill : "hóa đơn"
    vinshc_bill ||--o{ vinshc_payment : "thanh toán"
    vinshc_payment |o--o{ vinshc_payment : "hoàn tiền của"

    vinshc_service_order {
        bigint service_order_id PK
        int order_id FK
        int encounter_id FK
        bigint bill_id FK
        varchar service_code
        varchar state
    }
    vinshc_result_revision {
        bigint result_id PK
        bigint service_order_id FK
        int version_number
        bigint previous_result_id FK
        varchar state
    }
    vinshc_attachment {
        bigint attachment_id PK
        bigint service_order_id FK
        bigint result_id FK
        varchar storage_key UK
        varchar sha256
    }
    ORDERS ||--o| vinshc_service_order : "chỉ định dịch vụ"
    vinshc_bill |o--o{ vinshc_service_order : "tính tiền"
    vinshc_service_order ||--o{ vinshc_result_revision : "kết quả"
    vinshc_result_revision |o--o{ vinshc_result_revision : "sửa từ"
    vinshc_service_order ||--o{ vinshc_attachment : "file"

    vinshc_dispense {
        bigint dispense_id PK
        int order_id FK
        numeric quantity
        varchar batch_number
        varchar status
    }
    vinshc_dispense_revision {
        bigint revision_id PK
        bigint dispense_id FK
        int version_number
        varchar action
    }
    ORDERS ||--o{ vinshc_dispense : "cấp thuốc"
    vinshc_dispense ||--o{ vinshc_dispense_revision : "sửa / hủy"

    vinshc_document {
        bigint document_id PK
        varchar template_code
        varchar source_uuid
        varchar document_number UK
        text payload_json
    }

    vinshc_portal_account {
        int user_id PK
        int patient_id FK
        boolean active
    }
    vinshc_portal_link_event {
        bigint event_id PK
        int user_id FK
        int patient_id FK
        int version_number
        varchar status
    }
    vinshc_portal_publication {
        bigint publication_id PK
        int visit_id FK
        int encounter_id FK
        int version
        text payload_json
        boolean active
    }
    vinshc_portal_publication_event {
        bigint event_id PK
        bigint publication_id FK
        varchar status
    }
    vinshc_patient_access_request {
        varchar request_uuid PK
        varchar request_type
        int patient_id FK
        int requester FK
        varchar status
    }
    vinshc_notification {
        bigint notification_id PK
        int recipient_id FK
        varchar event_key
        timestamptz read_at
    }
    USERS ||--o| vinshc_portal_account : "tài khoản người bệnh"
    PATIENT ||--o{ vinshc_portal_account : "thuộc về"
    USERS ||--o{ vinshc_portal_link_event : "xác minh"
    VISIT ||--o{ vinshc_portal_publication : "công bố"
    vinshc_portal_publication ||--o{ vinshc_portal_publication_event : "vòng đời"
    PATIENT ||--o{ vinshc_patient_access_request : "yêu cầu"
    USERS ||--o{ vinshc_notification : "nhận"

    vinshc_clinical_event {
        bigint event_id PK
        varchar event_type
        int patient_id FK
        int encounter_id FK
    }
    vinshc_access_event {
        bigint event_id PK
        varchar resource_type
        int patient_id FK
        varchar action
    }
    vinshc_admin_event {
        bigint event_id PK
        varchar action
        varchar entity_uuid
    }
    PATIENT ||--o{ vinshc_clinical_event : "nhật ký ghi"
    PATIENT |o--o{ vinshc_access_event : "nhật ký đọc"
    USERS ||--o{ vinshc_admin_event : "thực hiện"
```

Nhóm bảng theo chức năng:

```mermaid
flowchart LR
    subgraph B2["Hành chính bệnh nhân"]
        a1["vinshc_contact"]
        a2["vinshc_field_state"]
        a3["vinshc_address_snapshot"]
        a4["vinshc_patient_registration"]
    end
    subgraph Dir["Danh mục và phân quyền"]
        d1["vinshc_business_facility"]
        d2["vinshc_workspace_assignment"]
        d3["vinshc_provider_link"]
        d4["vinshc_facility_workflow"]
        d5["vinshc_form_definition"]
    end
    subgraph Ops["Vận hành phòng khám"]
        o1["vinshc_appointment"]
        o2["vinshc_queue_item"]
        o3["vinshc_bill"]
        o4["vinshc_payment"]
        o5["vinshc_service_order"]
        o6["vinshc_result_revision"]
        o7["vinshc_attachment"]
        o8["vinshc_document"]
    end
    subgraph Ph["Dược"]
        p1["vinshc_dispense"]
        p2["vinshc_dispense_revision"]
    end
    subgraph Po["Cổng người bệnh"]
        q1["vinshc_portal_account"]
        q2["vinshc_portal_link_event"]
        q3["vinshc_portal_publication"]
        q4["vinshc_portal_publication_event"]
        q5["vinshc_patient_access_request"]
        q6["vinshc_notification"]
    end
    subgraph Au["Kiểm toán (chỉ thêm)"]
        e1["vinshc_clinical_event"]
        e2["vinshc_access_event"]
        e3["vinshc_admin_event"]
    end
    Core[("Bảng OpenMRS<br/>patient · person · visit · encounter<br/>obs · orders · drug_order · allergy<br/>location · users · provider · concept")]
    B2 & Dir & Ops & Ph & Po & Au --> Core
```

## 11. Build và CI

```mermaid
flowchart TB
    subgraph Repo["Repo"]
        Src["vinshc-module (Maven)"]
        PgSrc["infra/backend/postgresql"]
        MetaSrc["metadata/vinshc · infra/backend/configuration"]
        FeSrc["infra/frontend (Vite)"]
        AgSrc["infra/agent (Python)"]
        Baseline["config/baseline.json<br/>phiên bản + digest image"]
    end

    subgraph BuildBE["infra/backend/Dockerfile"]
        Mvn["maven:3.9.9 → vinshc-0.3.0.omod"]
        Patch["Kiểm SHA-256 OMOD gốc,<br/>vá resource, biên dịch dialect"]
        BEImg["ehr-vinshc-backend:3.7.1-postgresql"]
    end
    subgraph BuildFE["infra/frontend/Dockerfile"]
        Npm["node:22 → npm ci && build"]
        FEImg["nginx + dist → ehr-vinshc-clinic"]
    end
    AGImg["infra/agent/Dockerfile → ehr-vinshc-agent"]

    subgraph CI[".github/workflows"]
        ci1["ci.yml<br/>check_config · check_p0 · unittest<br/>DB sạch: compose up, check_p0 --runtime,<br/>check_database, smoke REST/FHIR"]
        ci2["agent.yml<br/>pytest agent · agent_review offline<br/>docker build agent · FE test + build<br/>Playwright agent-browser"]
    end

    Src --> Mvn --> Patch --> BEImg
    PgSrc --> Patch
    MetaSrc --> BEImg
    FeSrc --> Npm --> FEImg
    AgSrc --> AGImg
    Baseline --> ci1
    BEImg --> ci1
    AGImg & FEImg --> ci2
```

## 12. Lộ trình mở rộng

Theo [ARCHITECTURE.md](ARCHITECTURE.md). Chỉ tầng 1 đã triển khai.

```mermaid
flowchart BT
    subgraph T1["Tầng 1: một phòng khám (đang làm)"]
        t1a["OpenMRS + module VinSHC"]
        t1b["Clinic app + cổng người bệnh"]
        t1c["Trợ lý AI chỉ đọc"]
        t1d[("PostgreSQL")]
    end
    subgraph T2["Tầng 2: phòng khám đa khoa / chuỗi (kế hoạch)"]
        t2a["LIS (OpenELIS / HL7)"]
        t2b["PACS (Orthanc)"]
        t2c["Adapter BHYT · HĐĐT · đơn thuốc quốc gia"]
        t2d["ERP (Odoo / ERPNext)"]
        t2e["Báo cáo tập trung"]
    end
    subgraph T3["Tầng 3: bệnh viện / liên thông (kế hoạch)"]
        t3a["OpenHIM"]
        t3b["OpenCR (MPI)"]
        t3c["OCL terminology"]
        t3d["EHRbase (openEHR)"]
        t3e["Data warehouse + AI dài hạn"]
    end
    T1 -->|"REST / FHIR / HL7 qua adapter"| T2
    T2 -->|"FHIR R4 / openEHR"| T3
```
