package org.vinshc.hibernate;

import java.sql.Types;
import org.hibernate.dialect.PostgreSQL82Dialect;
import org.hibernate.type.descriptor.sql.LongVarcharTypeDescriptor;
import org.hibernate.type.descriptor.sql.SqlTypeDescriptor;
import org.hibernate.type.descriptor.sql.VarbinaryTypeDescriptor;

/** Bind OpenMRS Liquibase TEXT/BYTEA columns directly, rather than as PostgreSQL OIDs. */
public final class VinSHCPostgreSQLDialect extends PostgreSQL82Dialect {
    public VinSHCPostgreSQLDialect() {
        registerColumnType(Types.CLOB, "text");
        registerColumnType(Types.BLOB, "bytea");
    }

    @Override
    public String getNativeIdentifierGeneratorStrategy() {
        // OpenMRS Liquibase creates per-table identity columns, not hibernate_sequence.
        return "identity";
    }

    @Override
    public SqlTypeDescriptor getSqlTypeDescriptorOverride(int sqlCode) {
        if (sqlCode == Types.CLOB) {
            return LongVarcharTypeDescriptor.INSTANCE;
        }
        if (sqlCode == Types.BLOB) {
            return VarbinaryTypeDescriptor.INSTANCE;
        }
        return super.getSqlTypeDescriptorOverride(sqlCode);
    }
}
