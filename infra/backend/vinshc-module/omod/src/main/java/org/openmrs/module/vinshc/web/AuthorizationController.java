package org.openmrs.module.vinshc.web;

import java.util.List;
import java.util.Map;

import org.openmrs.module.vinshc.service.AuthorizationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

@Controller
@RequestMapping("/rest/v1/vinshc/authorization")
@ResponseBody
public class AuthorizationController extends BaseVinshcController {
	private final AuthorizationService service;

	@Autowired
	public AuthorizationController(AuthorizationService service) {
		this.service = service;
	}

	@PostMapping("/assignment")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> assign(@RequestBody Map<String, Object> body) {
		return service.assign(body);
	}

	@DeleteMapping("/assignment")
	public Map<String, Object> revoke(@RequestBody Map<String, Object> body) {
		return service.revoke(body);
	}

	@GetMapping("/workspace")
	public Map<String, Object> workspace() {
		return service.workspace();
	}

	@GetMapping("/evaluate")
	public Map<String, Object> evaluate(@RequestParam String resource, @RequestParam String action) {
		return service.evaluate(resource, action);
	}

	@GetMapping("/audit")
	public List<Map<String, Object>> audit(@RequestParam(required = false) String patient,
	        @RequestParam(required = false) String encounter, @RequestParam(required = false) Integer limit,
	        @RequestParam(required = false) Integer offset) {
		return service.audit(patient, encounter, limit, offset);
	}
}
