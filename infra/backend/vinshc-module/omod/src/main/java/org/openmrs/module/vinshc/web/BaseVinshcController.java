package org.openmrs.module.vinshc.web;

import java.sql.SQLException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.servlet.ServletException;

import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.APIException;
import org.openmrs.api.ValidationException;
import org.openmrs.module.vinshc.service.OperationsService.OperationsConflictException;
import org.openmrs.module.vinshc.service.VinshcExceptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.multipart.MultipartException;

/**
 * Shared error contract: 400 invalid input, 401 unauthenticated, 403 missing privilege or scope,
 * 409 state conflict (including a concurrent write that hit a database constraint), 503 missing
 * metadata or catalogue, 500 anything unexpected. Only intentional VinSHC/OpenMRS validation
 * messages are returned to the client; unexpected errors are logged with their stack trace and
 * answered with a generic message.
 */
public abstract class BaseVinshcController {
	
	private static final Logger log = LoggerFactory.getLogger(BaseVinshcController.class);
	
	private static final String UNIQUE_OR_FK_VIOLATION = "23";
	
	@ExceptionHandler(OperationsConflictException.class)
	public ResponseEntity<Map<String, String>> conflict(OperationsConflictException error) {
		return error(HttpStatus.CONFLICT, error.getMessage());
	}
	
	@ExceptionHandler(VinshcExceptions.Conflict.class)
	public ResponseEntity<Map<String, Object>> conflictWithMatches(VinshcExceptions.Conflict error) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("error", error.getMessage());
		body.put("matches", error.getMatches());
		return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
	}

	@ExceptionHandler(VinshcExceptions.BadRequest.class)
	public ResponseEntity<Map<String, String>> badRequest(VinshcExceptions.BadRequest error) {
		return error(HttpStatus.BAD_REQUEST, error.getMessage());
	}
	
	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<Map<String, String>> unexpectedArgument(IllegalArgumentException error) {
		log.warn("VinSHC request rejected by an unexpected argument error", error);
		return error(HttpStatus.BAD_REQUEST, "invalid request");
	}
	
	@ExceptionHandler(ValidationException.class)
	public ResponseEntity<Map<String, String>> coreValidation(ValidationException error) {
		return error(HttpStatus.BAD_REQUEST, error.getMessage());
	}
	
	@ExceptionHandler(VinshcExceptions.NotAuthenticated.class)
	public ResponseEntity<Map<String, String>> unauthenticated(VinshcExceptions.NotAuthenticated error) {
		return error(HttpStatus.UNAUTHORIZED, "unauthenticated");
	}
	
	@ExceptionHandler(APIAuthenticationException.class)
	public ResponseEntity<Map<String, String>> forbidden(APIAuthenticationException error) {
		Map<String, String> body = new LinkedHashMap<>();
		body.put("error", "forbidden");
		body.put("detail", error.getMessage());
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
	}
	
	/** OpenMRS API rule violations (for example an order that cannot be discontinued). */
	@ExceptionHandler(APIException.class)
	public ResponseEntity<Map<String, String>> coreRule(APIException error) {
		log.warn("VinSHC request rejected by an OpenMRS API rule", error);
		return error(HttpStatus.BAD_REQUEST, error.getMessage());
	}
	
	@ExceptionHandler(VinshcExceptions.Configuration.class)
	public ResponseEntity<Map<String, String>> configurationError(VinshcExceptions.Configuration error) {
		log.error("VinSHC configuration is incomplete", error);
		return error(HttpStatus.SERVICE_UNAVAILABLE, error.getMessage());
	}
	
	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<Map<String, String>> integrity(DataIntegrityViolationException error) {
		log.warn("VinSHC write lost a concurrent constraint check", error);
		return concurrentChange();
	}
	
	@ExceptionHandler({ ServletException.class, HttpMessageNotReadableException.class, TypeMismatchException.class,
	        MultipartException.class })
	public ResponseEntity<Map<String, String>> malformedRequest(Exception error) {
		return error(HttpStatus.BAD_REQUEST, error.getMessage());
	}
	
	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	public ResponseEntity<Map<String, String>> unsupportedMediaType(HttpMediaTypeNotSupportedException error) {
		return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, error.getMessage());
	}
	
	@ExceptionHandler(Exception.class)
	public ResponseEntity<Map<String, String>> unexpected(Exception error) {
		if (isConstraintViolation(error)) {
			log.warn("VinSHC write lost a concurrent constraint check", error);
			return concurrentChange();
		}
		log.error("Unexpected VinSHC server error", error);
		return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal server error");
	}
	
	/** PostgreSQL SQLSTATE class 23 = integrity constraint violation, possibly wrapped by Hibernate. */
	static boolean isConstraintViolation(Throwable error) {
		for (Throwable cause = error; cause != null; cause = cause.getCause() == cause ? null : cause.getCause()) {
			if (cause instanceof org.hibernate.exception.ConstraintViolationException)
				return true;
			if (cause instanceof SQLException) {
				String state = ((SQLException) cause).getSQLState();
				if (state != null && state.startsWith(UNIQUE_OR_FK_VIOLATION))
					return true;
			}
		}
		return false;
	}
	
	private static ResponseEntity<Map<String, String>> concurrentChange() {
		return error(HttpStatus.CONFLICT, "conflicting concurrent change; reload and retry");
	}
	
	private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
		return ResponseEntity.status(status).body(Collections.singletonMap("error", message));
	}
}
