package org.openmrs.module.vinshc.web;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.openmrs.api.context.Context;
import org.openmrs.module.vinshc.service.PortalService;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Portal accounts cannot use staff/Core/FHIR APIs even if a broad inherited role is added by
 * mistake.
 */
public class PortalIsolationInterceptor implements HandlerInterceptor {
	
	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
		if (!Context.isAuthenticated() || Context.getAuthenticatedUser().getRoles().stream()
		        .noneMatch(role -> PortalService.ROLE.equals(role.getRole())))
			return true;
		String uri = request.getRequestURI();
		response.setHeader("Cache-Control", "no-store");
		boolean allowed = uri.matches(".*/rest/v1/session/?") || ("GET".equals(request.getMethod()) && uri.matches(
		    ".*/rest/v1/vinshc/portal/(session|visits|visits/[0-9a-fA-F-]{36}/instructions|prescriptions|appointments)/?"));
		if (!allowed) {
			response.setStatus(403);
			response.setContentType("application/json");
			response.getWriter().write("{\"error\":\"forbidden\"}");
		}
		return allowed;
	}
}
