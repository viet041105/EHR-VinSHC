# Stable upstream binary release; only reference demo content is removed.
FROM openmrs/openmrs-reference-application-3-backend:3.7.1@sha256:929cfe5dca5f221460e0f4a57abb9294614df5f74fbb3bb865e01b8dfe7a985b

USER root
RUN test -d /openmrs/distribution/openmrs_config \
    && find /openmrs/distribution/openmrs_config -type d -name referenceapplication-demo -prune -exec rm -rf -- {} + \
    && rm -f /openmrs/distribution/openmrs_modules/referencedemodata-*.omod \
    && sed -i '/^content.referenceapplication-demo=/d; /^omod.referencedemodata=/d' /openmrs/distribution/openmrs-distro.properties
COPY --chown=1001:0 configuration/ /openmrs/distribution/openmrs_config/
USER 1001
