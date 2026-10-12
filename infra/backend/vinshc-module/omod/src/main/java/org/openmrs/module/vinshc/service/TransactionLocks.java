package org.openmrs.module.vinshc.service;

import java.sql.PreparedStatement;

import org.hibernate.SessionFactory;

/**
 * PostgreSQL transaction-scoped advisory locks taken on the Hibernate session connection, so the
 * lock is held until the surrounding Spring transaction commits or rolls back.
 */
final class TransactionLocks {
	
	private TransactionLocks() {
	}
	
	static void lock(SessionFactory sessionFactory, String key) {
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))")) {
				statement.setString(1, key);
				statement.execute();
			}
		});
	}
}
