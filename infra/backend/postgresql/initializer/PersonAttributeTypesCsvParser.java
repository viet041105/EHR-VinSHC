package org.openmrs.module.initializer.api.pat;

import org.apache.commons.lang.StringUtils;
import org.openmrs.PersonAttributeType;
import org.openmrs.api.PersonService;
import org.openmrs.module.initializer.Domain;
import org.openmrs.module.initializer.api.BaseLineProcessor;
import org.openmrs.module.initializer.api.CsvLine;
import org.openmrs.module.initializer.api.CsvParser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

/** Compatibility replacement for Initializer 2.12.0 on OpenMRS Core 2.8.8. */
@Component
public class PersonAttributeTypesCsvParser
        extends CsvParser<PersonAttributeType, BaseLineProcessor<PersonAttributeType>> {

    private final PersonService personService;

    @Autowired
    public PersonAttributeTypesCsvParser(@Qualifier("personService") PersonService personService,
            PersonAttributeTypeLineProcessor processor) {
        super(processor);
        this.personService = personService;
    }

    @Override
    public Domain getDomain() {
        return Domain.PERSON_ATTRIBUTE_TYPES;
    }

    @Override
    public PersonAttributeType bootstrap(CsvLine line) throws IllegalArgumentException {
        String uuid = line.getUuid();
        String name = line.getName();
        PersonAttributeType type = personService.getPersonAttributeTypeByUuid(uuid);
        if (type == null && StringUtils.isEmpty(uuid) && !StringUtils.isEmpty(name)) {
            type = personService.getPersonAttributeTypeByName(name);
        }
        if (type == null) {
            type = new PersonAttributeType();
            if (!StringUtils.isEmpty(uuid)) {
                type.setUuid(uuid);
            }
            // Core 2.8.8 compares sort weights while saving and unboxes this value.
            // Initializer 2.12.0 does not expose a CSV header for it, so null causes NPE.
            type.setSortWeight(0.0);
        }
        return type;
    }

    @Override
    public PersonAttributeType save(PersonAttributeType instance) {
        if (instance.getSortWeight() == null) {
            instance.setSortWeight(0.0);
        }
        return personService.savePersonAttributeType(instance);
    }
}
