# Build từ thư mục gốc repo để lấy metadata/vinshc/fields.csv:
#   docker build -f infra/agent/Dockerfile -t vinshc-agent .
# Bật adapter Claude (chỉ với dữ liệu synthetic hoặc đã duyệt): --build-arg AGENT_EXTRAS=anthropic
FROM python:3.12.15-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

ARG AGENT_EXTRAS=""
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VINSHC_AGENT_ASSET_ROOT=/app \
    VINSHC_AGENT_FIELDS_CSV=/app/metadata/fields.csv \
    VINSHC_AGENT_PATIENT_FIXTURE=/app/fixtures/patient_portal.demo.json

WORKDIR /app
COPY infra/agent/pyproject.toml infra/agent/constraints.txt ./
COPY infra/agent/src ./src
RUN pip install --no-cache-dir -c constraints.txt ".${AGENT_EXTRAS:+[$AGENT_EXTRAS]}" \
    && useradd --system --uid 10001 --no-create-home agent
COPY metadata/vinshc/fields.csv /app/metadata/fields.csv
COPY infra/agent/fixtures /app/fixtures
COPY infra/agent/knowledge /app/knowledge
COPY infra/agent/playground /app/playground

USER agent
EXPOSE 8000
CMD ["uvicorn", "--factory", "vinshc_agent.app:create_app", "--host", "0.0.0.0", "--port", "8000"]
