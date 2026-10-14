FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
COPY infra/frontend/ ./
RUN npm ci --no-audit --no-fund && npm run build
FROM nginx:stable-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94
ENV VINSHC_BACKEND_ORIGIN=http://gateway \
    VINSHC_API_UPSTREAM_PATH=/openmrs/ws/rest/v1 \
    VINSHC_AGENT_ORIGIN=http://agent:8000
COPY infra/frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
