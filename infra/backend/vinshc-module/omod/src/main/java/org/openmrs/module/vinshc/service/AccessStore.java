package org.openmrs.module.vinshc.service;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.hibernate.SessionFactory;

/** Uses the caller's Hibernate transaction, including Core User and portal-link changes. */
final class AccessStore {

    final SessionFactory sessions;

    AccessStore(SessionFactory sessions) { this.sessions = sessions; }

    List<Map<String, Object>> query(String sql, Object... args) {
        return sessions.getCurrentSession().doReturningWork(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
                List<Map<String, Object>> rows = new ArrayList<>();
                try (ResultSet rs = statement.executeQuery()) {
                    while (rs.next()) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++)
                            row.put(rs.getMetaData().getColumnLabel(i), rs.getObject(i));
                        rows.add(row);
                    }
                }
                return rows;
            }
        });
    }

    Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = query(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    int update(String sql, Object... args) {
        return sessions.getCurrentSession().doReturningWork(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
                return statement.executeUpdate();
            }
        });
    }

    static Map<String, Object> map(Object... args) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < args.length; i += 2) out.put(args[i].toString(), args[i + 1]);
        return out;
    }

    static int number(Object value) { return ((Number) value).intValue(); }
    static Timestamp now() { return Timestamp.from(Instant.now()); }
    static Object time(Object value) { return value instanceof Timestamp ? ((Timestamp) value).toInstant().toString() : value; }

    static int limit(Integer value) {
        if (value != null && (value < 1 || value > 100)) throw VinshcService.bad("limit must be 1..100");
        return value == null ? 20 : value;
    }

    static int offset(Integer value) {
        if (value != null && (value < 0 || value > 100000)) throw VinshcService.bad("offset must be 0..100000");
        return value == null ? 0 : value;
    }
}
