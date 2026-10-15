/*
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at http://mozilla.org/MPL/2.0/. OpenMRS is also distributed under
 * the terms of the Healthcare Disclaimer located at http://openmrs.org/license.
 *
 * Copyright (C) OpenMRS Inc. OpenMRS is a registered trademark and the OpenMRS
 * graphic logo is a trademark of OpenMRS Inc.
 */
package org.openmrs.module.vinshc.web;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.openmrs.User;
import org.openmrs.api.context.Context;
import org.openmrs.module.vinshc.service.PortalService;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Portal accounts cannot use staff/Core/FHIR APIs even if a broad inherited role is added by
 * mistake.
 */
public class PortalIsolationInterceptor implements HandlerInterceptor {

	static boolean isPortalAccount(User user) {
		// ignoreSuperUser: User.hasRole(name) is true for every role name when the user is a superuser,
		// which would lock System Developer accounts (admin) out of every non-portal API.
		return user != null && user.hasRole(PortalService.ROLE, true);
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
		if (!Context.isAuthenticated() || !isPortalAccount(Context.getAuthenticatedUser()))
			return true;
		String uri = request.getRequestURI();
		response.setHeader("Cache-Control", "no-store");
		boolean allowed = uri.matches(".*/rest/v1/session/?")
		        || ("POST".equals(request.getMethod()) && uri.matches(".*/rest/v1/vinshc/portal/password/?"))
		        || ("GET".equals(request.getMethod()) && uri.matches(
		            ".*/rest/v1/vinshc/portal/(session|me|visits|visits/[0-9a-fA-F-]{36}|visits/[0-9a-fA-F-]{36}/instructions|prescriptions|prescriptions/[0-9a-fA-F-]{36}|results|results/[0-9a-fA-F-]{36}|attachments/[0-9a-fA-F-]{36}/content|appointments)/?"));
		if (!allowed) {
			response.setStatus(403);
			response.setContentType("application/json");
			response.getWriter().write("{\"error\":\"forbidden\"}");
		}
		return allowed;
	}
}
