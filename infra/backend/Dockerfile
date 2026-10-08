# Stable upstream release with checked-in PostgreSQL compatibility resources.
FROM openmrs/openmrs-reference-application-3-backend:3.7.1@sha256:929cfe5dca5f221460e0f4a57abb9294614df5f74fbb3bb865e01b8dfe7a985b

USER root
COPY postgresql/ /tmp/vinshc-postgresql/
RUN set -eu; \
    echo '602e16960918893ca9b54b9b23e0a0cd0cc59c078b9d19189cf2f430b3082acd  /openmrs/distribution/openmrs_modules/appointments-2.1.0.omod' | sha256sum -c -; \
    mkdir -p /tmp/vinshc-war /tmp/vinshc-module /tmp/vinshc-classes; \
    cd /tmp/vinshc-war; \
    jar xf /openmrs/distribution/openmrs_core/openmrs.war; \
    javac --release 8 -cp 'WEB-INF/lib/*' -d /tmp/vinshc-classes /tmp/vinshc-postgresql/VinSHCPostgreSQLDialect.java; \
    jar cf WEB-INF/lib/vinshc-postgresql.jar -C /tmp/vinshc-classes .; \
    jar uf /openmrs/distribution/openmrs_core/openmrs.war WEB-INF/lib/vinshc-postgresql.jar; \
    cd /tmp/vinshc-module; \
    jar xf /openmrs/distribution/openmrs_modules/appointments-2.1.0.omod; \
    cp /tmp/vinshc-postgresql/appointments/* .; \
    jar uf lib/appointments-api-2.1.0.jar liquibase.xml patientPastAppointmentsPostgreSql.sql; \
    jar uf /openmrs/distribution/openmrs_modules/appointments-2.1.0.omod liquibase.xml patientPastAppointmentsPostgreSql.sql lib/appointments-api-2.1.0.jar; \
    rm -rf /tmp/vinshc-war /tmp/vinshc-module /tmp/vinshc-classes /tmp/vinshc-postgresql
RUN test -d /openmrs/distribution/openmrs_config \
    && find /openmrs/distribution/openmrs_config -type d -name referenceapplication-demo -prune -exec rm -rf -- {} + \
    && rm -f /openmrs/distribution/openmrs_modules/referencedemodata-*.omod \
    && sed -i '/^content.referenceapplication-demo=/d; /^omod.referencedemodata=/d' /openmrs/distribution/openmrs-distro.properties
COPY --chown=1001:0 configuration/ /openmrs/distribution/openmrs_config/
USER 1001
