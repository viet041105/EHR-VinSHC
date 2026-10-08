# Stable upstream release with checked-in PostgreSQL compatibility resources.
FROM openmrs/openmrs-reference-application-3-backend:3.7.1@sha256:929cfe5dca5f221460e0f4a57abb9294614df5f74fbb3bb865e01b8dfe7a985b

USER root
COPY postgresql/ /tmp/vinshc-postgresql/
RUN set -eu; \
    echo '602e16960918893ca9b54b9b23e0a0cd0cc59c078b9d19189cf2f430b3082acd  /openmrs/distribution/openmrs_modules/appointments-2.1.0.omod' | sha256sum -c -; \
    echo '110f8dc3f5b6483547f1d82795c12d21914e5293ee3dfd5ee7fa162501c71568  /openmrs/distribution/openmrs_modules/stockmanagement-3.0.0.omod' | sha256sum -c -; \
    echo 'acb5c6ce4041c1ebe1a66818fb91435c81fc87fca98b74584822c36a4f33ce28  /openmrs/distribution/openmrs_modules/reporting-2.1.0.omod' | sha256sum -c -; \
    echo 'f45b04b30cc296bf23b92ec9bec3716c346d11337a23e0dbebaf4692795f00c6  /openmrs/distribution/openmrs_modules/openconceptlab-3.1.0.omod' | sha256sum -c -; \
    mkdir -p /tmp/vinshc-war /tmp/vinshc-module /tmp/vinshc-stock /tmp/vinshc-classes /tmp/vinshc-build; \
    cd /tmp/vinshc-war; \
    jar xf /openmrs/distribution/openmrs_core/openmrs.war; \
    echo '5d5c613488d44bbc947615bb500721ffcc4acb2d8e24864170f977dbe4f305fd  WEB-INF/lib/openmrs-api-2.8.8.jar' | sha256sum -c -; \
    mkdir -p /tmp/vinshc-core; \
    cd /tmp/vinshc-core; \
    jar xf /tmp/vinshc-war/WEB-INF/lib/openmrs-api-2.8.8.jar org/openmrs/liquibase/updates/liquibase-update-to-latest-2.8.x.xml; \
    sed -i '/<\/databaseChangeLog>/i\    <include file="vinshc-postgresql-sequences.xml"/>' org/openmrs/liquibase/updates/liquibase-update-to-latest-2.8.x.xml; \
    cp /tmp/vinshc-postgresql/vinshc-postgresql-sequences.xml .; \
    jar uf /tmp/vinshc-war/WEB-INF/lib/openmrs-api-2.8.8.jar org/openmrs/liquibase/updates/liquibase-update-to-latest-2.8.x.xml vinshc-postgresql-sequences.xml; \
    cd /tmp/vinshc-war; \
    javac --release 8 -proc:none -cp 'WEB-INF/lib/*' -d /tmp/vinshc-classes /tmp/vinshc-postgresql/VinSHCPostgreSQLDialect.java; \
    jar cf WEB-INF/lib/vinshc-postgresql.jar -C /tmp/vinshc-classes .; \
    jar uf /openmrs/distribution/openmrs_core/openmrs.war WEB-INF/lib/vinshc-postgresql.jar WEB-INF/lib/openmrs-api-2.8.8.jar; \
    cd /tmp/vinshc-module; \
    jar xf /openmrs/distribution/openmrs_modules/appointments-2.1.0.omod; \
    cp /tmp/vinshc-postgresql/appointments/* .; \
    jar uf lib/appointments-api-2.1.0.jar liquibase.xml patientPastAppointmentsPostgreSql.sql; \
    jar uf /openmrs/distribution/openmrs_modules/appointments-2.1.0.omod liquibase.xml patientPastAppointmentsPostgreSql.sql lib/appointments-api-2.1.0.jar; \
    javac --release 8 -d /tmp/vinshc-build /tmp/vinshc-postgresql/ScopedStockPreconditions.java; \
    cd /tmp/vinshc-stock; \
    jar xf /openmrs/distribution/openmrs_modules/stockmanagement-3.0.0.omod; \
    jar xf lib/stockmanagement-api-3.0.0.jar liquibase.xml; \
    java -cp /tmp/vinshc-build org.vinshc.build.ScopedStockPreconditions liquibase.xml; \
    jar uf lib/stockmanagement-api-3.0.0.jar liquibase.xml; \
    jar uf /openmrs/distribution/openmrs_modules/stockmanagement-3.0.0.omod lib/stockmanagement-api-3.0.0.jar; \
    for artifact in reporting-2.1.0 openconceptlab-3.1.0; do \
        module="${artifact%-*}"; version="${artifact##*-}"; \
        mkdir -p "/tmp/vinshc-${module}"; cd "/tmp/vinshc-${module}"; \
        jar xf "/openmrs/distribution/openmrs_modules/${artifact}.omod"; \
        jar xf "lib/${module}-api-${version}.jar" liquibase.xml; \
        sed -i "/<\/databaseChangeLog>/i\    <include file=\"vinshc-${module}-bytea.xml\"/>" liquibase.xml; \
        cp "/tmp/vinshc-postgresql/vinshc-${module}-bytea.xml" .; \
        jar uf "lib/${module}-api-${version}.jar" liquibase.xml "vinshc-${module}-bytea.xml"; \
        jar uf "/openmrs/distribution/openmrs_modules/${artifact}.omod" liquibase.xml "vinshc-${module}-bytea.xml" "lib/${module}-api-${version}.jar"; \
    done; \
    rm -rf /tmp/vinshc-war /tmp/vinshc-core /tmp/vinshc-module /tmp/vinshc-stock /tmp/vinshc-classes /tmp/vinshc-build /tmp/vinshc-postgresql /tmp/vinshc-reporting /tmp/vinshc-openconceptlab
RUN test -d /openmrs/distribution/openmrs_config \
    && find /openmrs/distribution/openmrs_config -type d -name referenceapplication-demo -prune -exec rm -rf -- {} + \
    && rm -f /openmrs/distribution/openmrs_modules/referencedemodata-*.omod \
    && sed -i '/^content.referenceapplication-demo=/d; /^omod.referencedemodata=/d' /openmrs/distribution/openmrs-distro.properties
COPY --chown=1001:0 configuration/ /openmrs/distribution/openmrs_config/
USER 1001
