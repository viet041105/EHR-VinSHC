package org.openmrs.module.vinshc.service;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Collections;
import org.junit.jupiter.api.Test;

class PatientAccessValidationTest {
    @Test
    void portalPasswordMustPreserveExactCredentialAndHaveTwelveCharacters() {
        assertEquals("a-valid-pass-12", PatientAccessService.patientPassword(Collections.singletonMap("password", "a-valid-pass-12")));
        for (Object value : new Object[] {null, 123456789012L, "short", " leading-pass-42", "trailing-pass-42 "})
            assertThrows(VinshcExceptions.BadRequest.class,
                () -> PatientAccessService.patientPassword(Collections.singletonMap("password", value)));
    }

    @Test
    void unboundedNotificationAndRequestReadsAreRejected() {
        assertEquals(20, AccessStore.limit(null));
        assertEquals(0, AccessStore.offset(null));
        assertThrows(VinshcExceptions.BadRequest.class, () -> AccessStore.limit(0));
        assertThrows(VinshcExceptions.BadRequest.class, () -> AccessStore.limit(101));
        assertThrows(VinshcExceptions.BadRequest.class, () -> AccessStore.offset(-1));
        assertThrows(VinshcExceptions.BadRequest.class, () -> AccessStore.offset(100001));
    }
}
