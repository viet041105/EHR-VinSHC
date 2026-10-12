package org.openmrs.module.vinshc.web;

import java.util.Arrays;
import java.util.List;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.openmrs.api.context.Context;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Lets the validated VinSHC adapter call Core services without granting those broad privileges to
 * app accounts. Direct Core REST/FHIR requests never pass through this interceptor.
 */
public class ScopedCorePrivilegeInterceptor implements HandlerInterceptor {
	private static final List<String> PRIVILEGES = Arrays.asList("Get Patients", "Get Visits", "Get Encounters",
	    "Get Observations", "Get Diagnoses", "Get Allergies", "Get Orders", "Get Concepts", "Get Providers",
	    "Get Concept Sources", "Get Concept Reference Terms", "Get Concept Map Types", "Get Concept Classes",
	    "Get Concept Datatypes", "Get Locations", "Get Encounter Types", "Get Encounter Roles", "Get Visit Types", "Get Order Frequencies",
	    "Get Order Types", "Add Observations", "Edit Observations", "Delete Observations", "Add Diagnoses",
	    "Edit Diagnoses", "Delete Diagnoses", "Add Allergies", "Edit Allergies", "Remove Allergies", "Add Orders",
	    "Edit Orders", "Delete Orders");

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		for (String privilege : PRIVILEGES)
			Context.addProxyPrivilege(privilege);
		return true;
	}

	@Override
	public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception error) {
		for (String privilege : PRIVILEGES)
			Context.removeProxyPrivilege(privilege);
	}
}
