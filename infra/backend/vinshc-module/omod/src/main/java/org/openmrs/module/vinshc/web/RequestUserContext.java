package org.openmrs.module.vinshc.web;

import java.util.Locale;

import org.openmrs.Location;
import org.openmrs.User;
import org.openmrs.api.context.Authenticated;
import org.openmrs.api.context.AuthenticationScheme;
import org.openmrs.api.context.ContextAuthenticationException;
import org.openmrs.api.context.Credentials;
import org.openmrs.api.context.UserContext;

/**
 * Request-private view of the HTTP-session UserContext. OpenMRS keeps one UserContext per HTTP
 * session and shares it between concurrent requests, so proxy privileges added to it would also be
 * visible to a parallel Core REST/FHIR request of the same session. This view delegates identity,
 * locale and location to the session context but keeps its own proxy-privilege list (inherited
 * field, consulted first by {@link UserContext#hasPrivilege(String)}).
 */
class RequestUserContext extends UserContext {
	
	private static final long serialVersionUID = 1L;
	
	private final UserContext session;
	
	RequestUserContext(UserContext session, AuthenticationScheme scheme) {
		super(scheme);
		this.session = session;
	}
	
	UserContext getSessionContext() {
		return session;
	}
	
	@Override
	public Authenticated authenticate(Credentials credentials) throws ContextAuthenticationException {
		return session.authenticate(credentials);
	}
	
	@Override
	public void refreshAuthenticatedUser() {
		session.refreshAuthenticatedUser();
	}
	
	@Override
	public User becomeUser(String systemId) throws ContextAuthenticationException {
		return session.becomeUser(systemId);
	}
	
	@Override
	public User getAuthenticatedUser() {
		return session.getAuthenticatedUser();
	}
	
	@Override
	public boolean isAuthenticated() {
		return session.isAuthenticated();
	}
	
	@Override
	public void logout() {
		session.logout();
	}
	
	@Override
	public void setLocale(Locale locale) {
		session.setLocale(locale);
	}
	
	@Override
	public Locale getLocale() {
		return session.getLocale();
	}
	
	@Override
	public Integer getLocationId() {
		return session.getLocationId();
	}
	
	@Override
	public void setLocationId(Integer locationId) {
		session.setLocationId(locationId);
	}
	
	@Override
	public Location getLocation() {
		return session.getLocation();
	}
	
	@Override
	public void setLocation(Location location) {
		session.setLocation(location);
	}
}
