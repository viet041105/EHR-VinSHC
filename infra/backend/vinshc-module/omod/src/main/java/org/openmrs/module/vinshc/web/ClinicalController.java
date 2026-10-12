package org.openmrs.module.vinshc.web;

import java.util.Collections;
import java.util.Map;

import org.openmrs.module.vinshc.service.ClinicalService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

/** B4 clinical endpoints mounted at /ws/rest/v1/vinshc. Contract: docs/api/consultation.md. */
@Controller
@RequestMapping("/rest/v1/vinshc")
@ResponseBody
public class ClinicalController extends BaseVinshcController {
	
	private final ClinicalService service;
	
	@Autowired
	public ClinicalController(ClinicalService service) {
		this.service = service;
	}
	
	@PostMapping("/consultation")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createConsultation(@RequestBody Map<String, Object> body) {
		return service.createConsultation(body);
	}
	
	@PostMapping("/consultation/{groupUuid}")
	public Map<String, Object> correctConsultation(@PathVariable String groupUuid, @RequestBody Map<String, Object> body) {
		return service.correctConsultation(groupUuid, body);
	}
	
	@PostMapping("/encounter/{encounterUuid}/finalize")
	public Map<String, Object> finalizeConsultation(@PathVariable String encounterUuid) {
		return service.finalizeConsultation(encounterUuid);
	}
	
	@GetMapping("/encounter/{encounterUuid}/clinical-summary")
	public Map<String, Object> summary(@PathVariable String encounterUuid) {
		return service.summary(encounterUuid);
	}
	
	@PostMapping("/diagnosis")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> recordDiagnosis(@RequestBody Map<String, Object> body) {
		return service.recordDiagnosis(body);
	}
	
	@PostMapping("/diagnosis/{uuid}")
	public Map<String, Object> replaceDiagnosis(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.replaceDiagnosis(uuid, body);
	}
	
	@DeleteMapping("/diagnosis/{uuid}")
	public Map<String, Object> voidDiagnosis(@PathVariable String uuid, @RequestParam String reason) {
		return service.voidDiagnosis(uuid, reason);
	}
	
	@GetMapping("/allergy")
	public Map<String, Object> allergies(@RequestParam String patient) {
		return service.allergies(patient);
	}
	
	@PostMapping("/allergy")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> recordAllergy(@RequestBody Map<String, Object> body) {
		return service.recordAllergy(body);
	}
	
	@DeleteMapping("/allergy/{uuid}")
	public Map<String, Object> voidAllergy(@PathVariable String uuid, @RequestParam String reason) {
		return service.voidAllergy(uuid, reason);
	}
	
	@PostMapping("/drug-order")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> prescribe(@RequestBody Map<String, Object> body) {
		return service.prescribe(body);
	}
	
	@PostMapping("/drug-order/{uuid}/discontinue")
	public Map<String, Object> discontinue(@PathVariable String uuid,
	        @RequestBody(required = false) Map<String, Object> body) {
		return service.discontinue(uuid, body == null ? Collections.<String, Object> emptyMap() : body);
	}
	
	@GetMapping("/clinical-configuration")
	public Map<String, Object> configurationStatus() {
		return service.configurationStatus();
	}
}
