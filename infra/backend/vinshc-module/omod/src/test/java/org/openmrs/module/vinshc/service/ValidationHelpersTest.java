package org.openmrs.module.vinshc.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Date;

import org.junit.jupiter.api.Test;

class ValidationHelpersTest {

	@Test
	void strictIntAcceptsIntegralJsonNumbers() {
		assertEquals(5, VinshcService.strictInt(5, "n"));
		assertEquals(5, VinshcService.strictInt(5L, "n"));
		assertEquals(5, VinshcService.strictInt(5.0d, "n"));
		assertEquals(0, VinshcService.strictInt(0.0d, "n"));
		assertEquals(-12, VinshcService.strictInt(-12, "n"));
	}

	@Test
	void strictIntRejectsValuesThatWouldTruncateOrWrap() {
		// 4294967297 used to become 1 through Number.intValue(), passing a 1..3650 duration check.
		assertThrows(VinshcExceptions.BadRequest.class, () -> VinshcService.strictInt(4294967297L, "duration"));
		assertThrows(VinshcExceptions.BadRequest.class, () -> VinshcService.strictInt(4294967296L, "numRefills"));
		assertThrows(VinshcExceptions.BadRequest.class, () -> VinshcService.strictInt(1.5d, "n"));
		assertThrows(VinshcExceptions.BadRequest.class, () -> VinshcService.strictInt(true, "n"));
		assertThrows(VinshcExceptions.BadRequest.class, () -> VinshcService.strictInt("5", "n"));
		assertThrows(VinshcExceptions.BadRequest.class, () -> VinshcService.strictInt(null, "n"));
	}

	@Test
	void moneyRejectsBigIntegerThatWouldWrapIntoRange() {
		BigInteger wrapsTo100 = BigInteger.ONE.shiftLeft(64).add(BigInteger.valueOf(100));
		assertEquals(100L, wrapsTo100.longValue(), "precondition: the raw value wraps to 100");
		assertThrows(VinshcExceptions.BadRequest.class, () -> OperationsService.money(wrapsTo100, "amountVnd", false));
		assertEquals(44400L, OperationsService.money(BigInteger.valueOf(44400), "amountVnd", false));
		assertEquals(44400L, OperationsService.money(44400, "amountVnd", false));
	}

	@Test
	void moneyKeepsZeroAndRangeRules() {
		assertEquals(0L, OperationsService.money(0, "discountVnd", true));
		assertThrows(VinshcExceptions.BadRequest.class, () -> OperationsService.money(0, "amountVnd", false));
		assertThrows(VinshcExceptions.BadRequest.class, () -> OperationsService.money(-1, "amountVnd", true));
		assertThrows(VinshcExceptions.BadRequest.class, () -> OperationsService.money(1.5d, "amountVnd", true));
		assertThrows(VinshcExceptions.BadRequest.class,
		    () -> OperationsService.money(9007199254740992L, "amountVnd", true));
	}

	@Test
	void uuidIsCanonicalAndErrorsNameTheField() {
		assertEquals("0f8fad5b-d9cb-469f-a165-70867728950e",
		    VinshcService.canonicalUuid("0F8FAD5B-D9CB-469F-A165-70867728950E", "sourceUuid"));
		VinshcExceptions.BadRequest error = assertThrows(VinshcExceptions.BadRequest.class,
		    () -> VinshcService.canonicalUuid("not-a-uuid", "patient"));
		assertEquals("patient must be a UUID", error.getMessage());
	}

	@Test
	void attachmentSniffingUsesContentNotClaimedType() {
		assertEquals("application/pdf", OperationsService.sniff("%PDF-1.4\n".getBytes()));
		assertEquals("image/png",
		    OperationsService.sniff(new byte[] { (byte) 137, 80, 78, 71, 13, 10, 26, 10, 0 }));
		assertEquals("image/jpeg", OperationsService.sniff(new byte[] { (byte) 255, (byte) 216, (byte) 255, 0 }));
		assertThrows(VinshcExceptions.BadRequest.class, () -> OperationsService.sniff("<html>".getBytes()));
	}

	@Test
	void encounterDateIsTheClinicCalendarDateNotTheJvmDate() {
		// 06:30 on 12 Oct in Ho Chi Minh City is still 11 Oct in UTC.
		Date encounter = Date.from(Instant.parse("2026-10-11T23:30:00Z"));
		assertEquals(LocalDate.of(2026, 10, 12), ClinicalService.clinicDate(encounter));
		assertTrue(LocalDate.of(2026, 10, 11).isBefore(ClinicalService.clinicDate(encounter)),
		    "a follow-up on 11 Oct must be rejected for this encounter");
	}
}
