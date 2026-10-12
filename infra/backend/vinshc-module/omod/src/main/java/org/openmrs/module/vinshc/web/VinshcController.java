package org.openmrs.module.vinshc.web;

import java.util.List;
import java.util.Map;

import org.openmrs.module.vinshc.service.VinshcService;
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

/** REST facade mounted by the OpenMRS web application at /ws/rest/v1/vinshc. */
@Controller
@RequestMapping("/rest/v1/vinshc")
@ResponseBody
public class VinshcController extends BaseVinshcController {
	
	private final VinshcService service;
	
	@Autowired
	public VinshcController(VinshcService service) {
		this.service = service;
	}
	
	@GetMapping("/identity/{patientUuid}")
	public Map<String, Object> identity(@PathVariable String patientUuid,
	        @RequestParam(defaultValue = "false") boolean includeHistory) {
		return service.identity(patientUuid, includeHistory);
	}
	
	@PostMapping("/contact")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createContact(@RequestBody Map<String, Object> body) {
		return service.saveContact(null, body);
	}
	
	@PostMapping("/contact/{rowKey}")
	public Map<String, Object> updateContact(@PathVariable String rowKey, @RequestBody Map<String, Object> body) {
		return service.saveContact(rowKey, body);
	}
	
	@DeleteMapping("/contact/{rowKey}")
	public Map<String, Object> voidContact(@PathVariable String rowKey, @RequestParam String reason) {
		return service.voidContact(rowKey, reason);
	}
	
	@PostMapping("/field-state")
	public Map<String, Object> saveFieldState(@RequestBody Map<String, Object> body) {
		return service.saveFieldState(body);
	}
	
	@DeleteMapping("/field-state")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void clearFieldState(@RequestParam String patient, @RequestParam String fieldCode, @RequestParam String context,
	        @RequestParam(required = false) String rowKey) {
		service.clearFieldState(patient, fieldCode, context, rowKey);
	}
	
	@PostMapping("/address")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createAddress(@RequestBody Map<String, Object> body) {
		return service.saveAddress(null, body);
	}
	
	@PostMapping("/address/{rowKey}")
	public Map<String, Object> updateAddress(@PathVariable String rowKey, @RequestBody Map<String, Object> body) {
		return service.saveAddress(rowKey, body);
	}
	
	@DeleteMapping("/address/{rowKey}")
	public Map<String, Object> voidAddress(@PathVariable String rowKey, @RequestParam String reason) {
		return service.voidAddress(rowKey, reason);
	}
	
	@GetMapping("/address-catalogue")
	public List<Map<String, Object>> addressCatalogue(@RequestParam(required = false) String parentCode) {
		return service.addressCatalogue(parentCode);
	}
	
	@GetMapping("/configuration-status")
	public Map<String, Object> configurationStatus() {
		return service.configurationStatus();
	}
	
	@PostMapping("/vitals")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> recordVitals(@RequestBody Map<String, Object> body) {
		return service.recordVitals(body);
	}
}
