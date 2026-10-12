package org.openmrs.module.vinshc.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.openmrs.api.context.AuthenticationScheme;
import org.openmrs.api.context.Context;
import org.openmrs.api.context.ContextAuthenticationException;
import org.openmrs.api.context.UserContext;

/**
 * OpenMRS keeps one UserContext per HTTP session and shares it between concurrent requests. The
 * adapter's proxy privileges must therefore never be added to that shared object.
 */
class ScopedCorePrivilegeInterceptorTest {

	private static final AuthenticationScheme SCHEME = credentials -> {
		throw new ContextAuthenticationException("not used");
	};

	private final ScopedCorePrivilegeInterceptor interceptor = new ScopedCorePrivilegeInterceptor();

	@AfterEach
	void clear() {
		Context.clearUserContext();
	}

	@Test
	void proxyPrivilegesStayOnARequestPrivateContext() throws Exception {
		UserContext session = new UserContext(SCHEME);
		Context.setUserContext(session);
		HttpServletRequest request = request();

		interceptor.preHandle(request, null, null);

		UserContext scoped = Context.getUserContext();
		RequestUserContext requestContext = assertInstanceOf(RequestUserContext.class, scoped);
		assertSame(session, requestContext.getSessionContext());
		assertTrue(proxies(scoped).containsAll(ScopedCorePrivilegeInterceptor.PRIVILEGES));
		assertTrue(proxies(session).isEmpty(), "a parallel Core request of this session must not see the proxies");

		interceptor.afterCompletion(request, null, null, null);

		assertSame(session, Context.getUserContext());
		assertTrue(proxies(session).isEmpty());
	}

	@Test
	void sessionContextIsRestoredEvenWhenTheHandlerFailed() throws Exception {
		UserContext session = new UserContext(SCHEME);
		Context.setUserContext(session);
		HttpServletRequest request = request();
		interceptor.preHandle(request, null, null);
		interceptor.afterCompletion(request, null, null, new IllegalStateException("handler failed"));
		assertSame(session, Context.getUserContext());
		assertNull(request.getAttribute(ScopedCorePrivilegeInterceptor.SESSION_CONTEXT_ATTRIBUTE));
	}

	@Test
	void identityAndLocationAreDelegatedToTheSessionContext() {
		UserContext session = new UserContext(SCHEME);
		RequestUserContext scoped = new RequestUserContext(session, SCHEME);
		scoped.setLocationId(42);
		assertEquals(Integer.valueOf(42), session.getLocationId());
		assertNull(scoped.getAuthenticatedUser());
		assertEquals(session.isAuthenticated(), scoped.isAuthenticated());
	}

	@SuppressWarnings("unchecked")
	private static List<String> proxies(UserContext context) throws Exception {
		Field field = UserContext.class.getDeclaredField("proxies");
		field.setAccessible(true);
		return (List<String>) field.get(context);
	}

	private static HttpServletRequest request() {
		Map<String, Object> attributes = new HashMap<>();
		return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
		    new Class<?>[] { HttpServletRequest.class }, (proxy, method, args) -> {
			    switch (method.getName()) {
				    case "setAttribute":
					    attributes.put((String) args[0], args[1]);
					    return null;
				    case "getAttribute":
					    return attributes.get(args[0]);
				    case "removeAttribute":
					    attributes.remove(args[0]);
					    return null;
				    default:
					    throw new UnsupportedOperationException(method.getName());
			    }
		    });
	}
}
