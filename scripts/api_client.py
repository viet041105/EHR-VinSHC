"""Safe JSON client shared by local smoke and integration tests."""

import base64
import json
import urllib.error
import urllib.parse
import urllib.request


class ApiError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # A redirect/login page must not count as API success or receive credentials.
        return None


class Client:
    """HTTP client restricted to a loopback OpenMRS test instance."""

    def __init__(self, base_url, username, password):
        parsed = urllib.parse.urlsplit(base_url)
        if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or parsed.username or parsed.password or parsed.path not in {"", "/"}
                or parsed.query or parsed.fragment):
            raise ApiError("API tests accept only a local HTTP origin; use an isolated development database.")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, *, method="GET", payload=None, auth=True, password=None, timeout=10):
        headers = {"Accept": "application/json, application/fhir+json"}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if auth:
            token = base64.b64encode(f"{self.username}:{password or self.password}".encode()).decode()
            headers["Authorization"] = f"Basic {token}"
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=timeout) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise ApiError(f"{method} {path}: cannot reach local service.") from error

    def json(self, path, *, statuses=(200,), **kwargs):
        status, headers, body = self.request(path, **kwargs)
        if status not in statuses:
            raise ApiError(f"{kwargs.get('method', 'GET')} {path}: expected {statuses}, got HTTP {status}.")
        if "json" not in headers.get("Content-Type", "").lower():
            raise ApiError(f"{path}: expected JSON, not an HTML/login response.")
        try:
            result = json.loads(body)
        except (ValueError, UnicodeDecodeError) as error:
            raise ApiError(f"{path}: invalid JSON response.") from error
        if not isinstance(result, dict):
            raise ApiError(f"{path}: expected a JSON object.")
        return result


# Backwards-compatible name used by smoke.py and its existing tests.
SmokeError = ApiError
