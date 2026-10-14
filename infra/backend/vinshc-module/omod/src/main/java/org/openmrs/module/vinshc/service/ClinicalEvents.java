package org.openmrs.module.vinshc.service;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.openmrs.Encounter;
import org.openmrs.Patient;
import org.openmrs.api.context.Context;

/** Append-only write audit shared by the clinical, care and pharmacy adapters (vinshc_clinical_event). */
final class ClinicalEvents {

	private ClinicalEvents() {
	}

	static void record(SessionFactory sessionFactory, String type, Patient patient, Encounter encounter, String entityUuid,
	        String reason, String detail) {
		Integer patientId = patient.getPatientId();
		Integer encounterId = encounter == null ? null : encounter.getEncounterId();
		Integer creator = Context.getAuthenticatedUser().getUserId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(
			    "INSERT INTO vinshc_clinical_event(event_uuid,event_type,patient_id,encounter_id,entity_uuid,reason,detail,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?)")) {
				statement.setString(1, UUID.randomUUID().toString());
				statement.setString(2, type);
				statement.setInt(3, patientId);
				statement.setObject(4, encounterId);
				statement.setString(5, entityUuid);
				statement.setString(6, reason);
				statement.setString(7, detail == null ? null : detail.length() > 2000 ? detail.substring(0, 2000) : detail);
				statement.setInt(8, creator);
				statement.setTimestamp(9, Timestamp.from(Instant.now()));
				statement.executeUpdate();
			}
		});
	}
}
