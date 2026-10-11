package org.openmrs.module.vinshc.web;

import java.util.Collections;
import java.util.Map;

import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.ValidationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;

/**
 * Shared error contract: 400 validation, 403 missing privilege, 503 missing metadata or catalogue.
 */
public abstract class BaseVinshcController {
	
	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException error) {
		return ResponseEntity.badRequest().body(Collections.singletonMap("error", error.getMessage()));
	}
	
	@ExceptionHandler(ValidationException.class)
	public ResponseEntity<Map<String, String>> coreValidation(ValidationException error) {
		return ResponseEntity.badRequest().body(Collections.singletonMap("error", error.getMessage()));
	}
	
	@ExceptionHandler(APIAuthenticationException.class)
	public ResponseEntity<Map<String, String>> forbidden(APIAuthenticationException error) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Collections.singletonMap("error", "forbidden"));
	}
	
	@ExceptionHandler(IllegalStateException.class)
	public ResponseEntity<Map<String, String>> configurationError(IllegalStateException error) {
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
		        .body(Collections.singletonMap("error", error.getMessage()));
	}
}
