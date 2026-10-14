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

import java.util.Arrays;
import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.openmrs.api.context.Context;
import org.openmrs.api.context.UserContext;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Lets the validated VinSHC adapter call Core services without granting those broad privileges to
 * app accounts. Direct Core REST/FHIR requests never pass through this interceptor. The privileges
 * live on a request-private {@link RequestUserContext}, never on the session-wide UserContext that
 * concurrent requests of the same HTTP session share.
 */
public class ScopedCorePrivilegeInterceptor implements HandlerInterceptor {

	static final String SESSION_CONTEXT_ATTRIBUTE = ScopedCorePrivilegeInterceptor.class.getName() + ".sessionContext";

	static final List<String> PRIVILEGES = Arrays.asList("Get Patients", "Get Visits", "Get Encounters", "Get Observations",
	    "Get Diagnoses", "Get Allergies", "Get Orders", "Get Concepts", "Get Providers", "Get Concept Sources",
	    "Get Concept Reference Terms", "Get Concept Map Types", "Get Concept Classes", "Get Concept Datatypes",
	    "Get Locations", "Get Encounter Types", "Get Encounter Roles", "Get Visit Types", "Get Order Frequencies",
	    "Get Order Types", "Add Observations", "Edit Observations", "Delete Observations", "Add Diagnoses", "Edit Diagnoses",
	    "Delete Diagnoses", "Add Allergies", "Edit Allergies", "Remove Allergies", "Add Orders", "Edit Orders",
	    "Delete Orders", "Add Patients", "Edit Patients", "Get Patient Identifiers", "Add Patient Identifiers",
	    "Edit Patient Identifiers", "Get Identifier Types", "Get Patient Identifier Types", "Get People", "Add People",
	    "Edit People", "Get Person Attribute Types", "Add Visits", "Edit Visits", "Get Visit Attribute Types",
	    "Add Encounters", "Edit Encounters", "Get Identifier Sources", "Generate Batch of Identifiers",
	    "Get Autogeneration Options", "Get Care Settings",
	    // bedmanagement registers Visit/Encounter SaveHandlers that check bed assignments on every save
	    // (requireAll=true pairs). The adapter never calls bed APIs itself; outpatients hold no beds.
	    "Get Beds", "Get Admission Locations", "Assign Beds", "Edit Admission Locations",
	    // queue's Visit SaveHandler/validator look up native queue entries of the visit (VinSHC keeps its own).
	    "Get Queue Entries", "Get Users", "Get Roles", "Manage Roles", "Edit Users");

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		UserContext session = Context.getUserContext();
		RequestUserContext scoped = new RequestUserContext(session, Context.getAuthenticationScheme());
		scoped.addProxyPrivilege(PRIVILEGES.toArray(new String[0]));
		// Password privilege is request-local and only for the authenticated
		// self-service endpoint. Never grant it for arbitrary staff/Core APIs.
		if ("POST".equals(request.getMethod())
		        && request.getRequestURI().matches(".*/rest/v1/vinshc/(portal/password|staff/me/password)/?"))
			scoped.addProxyPrivilege("Edit User Passwords");
		request.setAttribute(SESSION_CONTEXT_ATTRIBUTE, session);
		Context.setUserContext(scoped);
		return true;
	}

	@Override
	public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception error) {
		Object session = request.getAttribute(SESSION_CONTEXT_ATTRIBUTE);
		if (session instanceof UserContext) {
			Context.setUserContext((UserContext) session);
			request.removeAttribute(SESSION_CONTEXT_ATTRIBUTE);
		}
	}
}
