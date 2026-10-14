package org.vinshc.security;

import java.io.IOException;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletResponse;
import org.openmrs.api.context.Context;

/** Runs on the authenticated forward to HAPI, which bypasses Spring MVC interceptors. */
public class PortalFhirGuardFilter implements Filter {
	
	@Override
	public void init(FilterConfig config) {
	}
	
	@Override
	public void destroy() {
	}
	
	@Override
	public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
	        throws IOException, ServletException {
		if (Context.isAuthenticated() && Context.getAuthenticatedUser().getRoles().stream()
		        .anyMatch(role -> "VinSHC Portal: patient".equals(role.getRole()))) {
			HttpServletResponse http = (HttpServletResponse) response;
			http.setStatus(403);
			http.setContentType("application/json");
			http.setHeader("Cache-Control", "no-store");
			http.getWriter().write("{\"error\":\"forbidden\"}");
			return;
		}
		chain.doFilter(request, response);
	}
}
