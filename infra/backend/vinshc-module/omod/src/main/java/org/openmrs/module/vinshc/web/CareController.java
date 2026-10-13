package org.openmrs.module.vinshc.web;

import java.util.Map;

import org.openmrs.module.vinshc.service.CareService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

/** Staff patient, visit and encounter lifecycle mounted at /ws/rest/v1/vinshc. Contract: docs/api/care.md. */
@Controller
@RequestMapping("/rest/v1/vinshc")
@ResponseBody
public class CareController extends BaseVinshcController {

	private final CareService service;

	@Autowired
	public CareController(CareService service) {
		this.service = service;
	}

	@GetMapping("/patients")
	public Map<String, Object> searchPatients(@RequestParam(required = false) String q,
	        @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
		return service.searchPatients(q, limit, offset);
	}

	@PostMapping("/patients")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> registerPatient(@RequestBody Map<String, Object> body) {
		return service.registerPatient(body);
	}

	@GetMapping("/patients/{uuid}")
	public Map<String, Object> patient(@PathVariable String uuid) {
		return service.patient(uuid);
	}

	@PostMapping("/patients/{uuid}")
	public Map<String, Object> updatePatient(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.updatePatient(uuid, body);
	}

	@GetMapping("/visits")
	public Map<String, Object> visits(@RequestParam(required = false) String patient,
	        @RequestParam(required = false) String status, @RequestParam(required = false) String date,
	        @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
		return service.visits(patient, status, date, limit, offset);
	}

	@PostMapping("/visits")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> openVisit(@RequestBody Map<String, Object> body) {
		return service.openVisit(body);
	}

	@GetMapping("/visits/{uuid}")
	public Map<String, Object> visit(@PathVariable String uuid) {
		return service.visit(uuid);
	}

	@PostMapping("/visits/{uuid}/close")
	public Map<String, Object> closeVisit(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.closeVisit(uuid, body);
	}

	/** 201 when the encounter was created, 200 when the caller's existing encounter is returned. */
	@PostMapping("/visits/{uuid}/encounters")
	public ResponseEntity<Map<String, Object>> ensureEncounter(@PathVariable String uuid,
	        @RequestBody Map<String, Object> body) {
		Map<String, Object> encounter = service.ensureEncounter(uuid, body);
		return ResponseEntity.status(Boolean.TRUE.equals(encounter.get("created")) ? HttpStatus.CREATED : HttpStatus.OK)
		        .body(encounter);
	}

	@GetMapping("/providers/me")
	public Map<String, Object> myProviders() {
		return service.myProviders();
	}
}
