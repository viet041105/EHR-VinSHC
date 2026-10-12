package org.openmrs.module.vinshc.service;

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
	
	/** The request reached the adapter without an authenticated OpenMRS user (HTTP 401). */
	public static class NotAuthenticated extends APIAuthenticationException {
		
		private static final long serialVersionUID = 1L;
		
		public NotAuthenticated() {
			super("Authentication required");
		}
	}
}
