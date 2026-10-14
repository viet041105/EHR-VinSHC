package org.openmrs.module.vinshc.service;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.openmrs.api.APIAuthenticationException;

/**
 * Error types that the web layer maps to stable HTTP statuses. Only these carry client-facing
 * messages; any other runtime exception is treated as an unexpected server error.
 */
public final class VinshcExceptions {
	
	private VinshcExceptions() {
	}
	
	/** Invalid client input (HTTP 400). */
	public static class BadRequest extends IllegalArgumentException {
		
		private static final long serialVersionUID = 1L;
		
		public BadRequest(String message) {
			super(message);
		}
	}
	
	/** Required metadata, catalogue or deployment configuration is missing (HTTP 503). */
	public static class Configuration extends IllegalStateException {
		
		private static final long serialVersionUID = 1L;
		
		public Configuration(String message) {
			super(message);
		}
		
		public Configuration(String message, Throwable cause) {
			super(message, cause);
		}
	}
	
	/**
	 * State conflict (HTTP 409) that carries in-scope records the caller may act on instead, for
	 * example possible duplicate patients. Records outside the caller's facility are never listed.
	 */
	public static class Conflict extends IllegalStateException {

		private static final long serialVersionUID = 1L;

		private final List<Map<String, Object>> matches;

		public Conflict(String message, List<Map<String, Object>> matches) {
			super(message);
			this.matches = matches == null ? Collections.<Map<String, Object>> emptyList()
			        : Collections.unmodifiableList(matches);
		}

		public List<Map<String, Object>> getMatches() {
			return matches;
		}
	}

	/** The request reached the adapter without an authenticated OpenMRS user (HTTP 401). */
	public static class NotAuthenticated extends APIAuthenticationException {
		
		private static final long serialVersionUID = 1L;
		
		public NotAuthenticated() {
			super("Authentication required");
		}
	}
}
