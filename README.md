# EHR-VinSHC

**OpenMRS 3 distribution for private clinics in Vietnam.**

EHR-VinSHC adapts the open-source OpenMRS platform to Vietnamese clinic workflows.
The repository combines a reproducible OpenMRS baseline, Vietnamese metadata and
clinic configuration, and a separate VinSHC frontend. The architecture is
organized around packages and adapters so integrations can be added as the
project grows.

> **Development status:** This project is under active development and has been
> validated with synthetic data only. Do not use real patient data. The planned
> AI assistant is read-only, permission-scoped, and expected to cite its sources;
> it is not a diagnostic or prescribing system.

## Start here

| If you want to… | Start with |
| --- | --- |
| Run the OpenMRS baseline | [Development setup](docs/DEVELOPMENT.md) |
| Run the VinSHC frontend | [Frontend guide](infra/frontend/README.md) |
| Understand scope and milestones | [Project plan](PROJECT_PLAN.md) |
| Find fields and source-page references | [Data dictionary](docs/DATA_DICTIONARY.md) |
| Review the architecture | [Architecture](docs/ARCHITECTURE.md) |
| Check what has been verified | [Validation report](docs/VALIDATION.md) |
| Contribute or report a vulnerability | [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) |

## What is in the repository

- **OpenMRS 3 baseline:** A Docker Compose environment based on Reference
  Application 3.7.1 and PostgreSQL 16.15, with pinned upstream images.
- **VinSHC clinic frontend:** A Vietnamese interface organized as
  business-focused microfrontends, connected to OpenMRS through the local
  gateway and VinSHC APIs.
- **Vietnamese metadata:** A versioned metadata package, field mappings, and
  validation tooling.
- **Integration and operations groundwork:** Configuration, scripts, CI checks,
  synthetic fixtures, and implementation documentation.
- **AI assistant design:** A read-only, source-cited direction documented for
  future development; it must remain optional and must not write to the medical
  record.

## Repository map

```text
config/             Locked baseline and environment configuration
docs/               Architecture, workflows, metadata, validation, and guides
infra/              Frontend, OpenMRS build, and local infrastructure
integrations/        Optional integration adapters
metadata/            Vietnamese metadata package
scripts/             Bootstrap, checks, and development helpers
tests/               Automated and integration checks
tools/               Metadata and project utilities
PROJECT_PLAN.md      Scope, milestones, ownership, and acceptance criteria
```

## Run the OpenMRS baseline

### Requirements

- Docker Desktop with Linux containers, or Docker Engine
- Docker Compose v2
- Python 3.11 or newer

From the repository root, run:

```powershell
python scripts/bootstrap.py
python scripts/check_config.py
docker compose pull --quiet --ignore-buildable
docker compose build --pull backend
docker compose up -d --wait --wait-timeout 2400
python scripts/check_database.py
python scripts/smoke.py
```

Open [http://127.0.0.1:8080/openmrs/spa/](http://127.0.0.1:8080/openmrs/spa/).
Use the local admin credentials generated into `.env`; do not share or commit
that file. Select **VinSHC Development Clinic** when prompted for a location.

The first start can take several minutes while images are downloaded and the
database initializes. For day-to-day commands, persistence checks, and
troubleshooting, see the [development guide](docs/DEVELOPMENT.md).

## Run the VinSHC frontend

The standalone frontend requires Node.js 22.12 or newer and npm:

```powershell
npm --prefix infra/frontend install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). To run only the frontend
against its local mock mode or connect it to the OpenMRS environment, follow
[the frontend guide](infra/frontend/README.md).

## Vietnamese metadata

The metadata package is versioned independently and includes a handoff guide,
MVP field set, supplemental catalogs, and validation results:

- [Metadata overview](docs/METADATA.md)
- [MVP fields](docs/data/MVP_METADATA_FIELDS.md)
- [Validation report](docs/METADATA_VALIDATION.md)

Run the metadata checks with:

```powershell
python tools/metadata.py
python scripts/check_p0.py
```

## Safety and data handling

- Use synthetic records for development and demonstrations.
- Keep `.env`, credentials, tokens, and patient data out of Git.
- Treat the AI assistant as a future, optional, read-only feature with source
  citations and role-based access.
- Review the [Vietnam compliance checklist](docs/VIETNAM_COMPLIANCE.md) before
  making claims about deployment or regulatory readiness.

## Further reading

| Document | Description |
| --- | --- |
| [Clinic workflow](docs/CLINIC_WORKFLOW.md) | Roles, visit flow, and clinic outputs |
| [Architecture](docs/ARCHITECTURE.md) | Boundaries and expansion path |
| [Vietnam compliance](docs/VIETNAM_COMPLIANCE.md) | Design checklist and open questions |
| [CI guide](docs/CI.md) | Automated checks and integration validation |
| [AI assistant plan](docs/AGENT_PLAN.md) | Scope, access, data, and evaluation approach |
| [Decisions](docs/decisions/) | Architecture decision records |
