package org.openmrs.module.vinshc.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.lang.reflect.Method;
import java.sql.SQLException;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.APIException;
import org.openmrs.module.vinshc.service.OperationsService.OperationsConflictException;
import org.openmrs.module.vinshc.service.VinshcExceptions;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

/** Resolves handlers exactly as Spring MVC does for every VinSHC controller. */
class ErrorContractTest {

	private final BaseVinshcController controller = new BaseVinshcController() {};

	private final ExceptionHandlerMethodResolver resolver = new ExceptionHandlerMethodResolver(BaseVinshcController.class);

	@Test
	void intentionalValidationKeepsItsMessage() throws Exception {
		assertResponse(new VinshcExceptions.BadRequest("priority must be between 1 and 9999"), 400,
		    "priority must be between 1 and 9999");
	}

	@Test
	void unexpectedArgumentErrorDoesNotLeakInternals() throws Exception {
		assertResponse(new IllegalArgumentException("Parameter value [secret-internal] did not match"), 400,
		    "invalid request");
	}

	@Test
	void unauthenticatedIs401AndMissingPrivilegeIs403() throws Exception {
		assertResponse(new VinshcExceptions.NotAuthenticated(), 401, "unauthenticated");
		assertResponse(new APIAuthenticationException("Privileges required: same_facility"), 403, "forbidden");
	}

	@Test
	void missingConfigurationIs503() throws Exception {
		assertResponse(new VinshcExceptions.Configuration("catalogue not configured: x"), 503,
		    "catalogue not configured: x");
	}

	@Test
	void unexpectedStateIs500WithGenericMessage() throws Exception {
		assertResponse(new IllegalStateException("attachment path escaped storage root"), 500, "internal server error");
		assertResponse(new NullPointerException(), 500, "internal server error");
	}

	@Test
	void stateConflictsAndLostConstraintRacesAre409() throws Exception {
		assertResponse(new OperationsConflictException("payment exceeds outstanding bill balance"), 409,
		    "payment exceeds outstanding bill balance");
		assertResponse(new DataIntegrityViolationException("duplicate key"), 409,
		    "conflicting concurrent change; reload and retry");
		assertResponse(new RuntimeException("wrapped", new SQLException("duplicate key", "23505")), 409,
		    "conflicting concurrent change; reload and retry");
	}

	@Test
	void openmrsRuleViolationIs400() throws Exception {
		assertResponse(new APIException("Order.cannot.discontinue"), 400, "Order.cannot.discontinue");
	}

	@Test
	void sqlStateOutsideIntegrityClassIsNotAConflict() {
		assertFalse(BaseVinshcController.isConstraintViolation(new RuntimeException(new SQLException("x", "40001"))));
	}

	@SuppressWarnings("unchecked")
	private void assertResponse(Throwable error, int status, String message) throws Exception {
		Method method = resolver.resolveMethodByThrowable(error);
		assertNotNull(method, "no handler for " + error.getClass());
		Object argument = error;
		for (Throwable cause = error; cause != null; cause = cause.getCause())
			if (method.getParameterTypes()[0].isInstance(cause)) {
				argument = cause;
				break;
			}
		ResponseEntity<Map<String, String>> response = (ResponseEntity<Map<String, String>>) method.invoke(controller,
		    argument);
		assertEquals(status, response.getStatusCodeValue(), error.toString());
		assertEquals(message, response.getBody().get("error"));
	}
}
