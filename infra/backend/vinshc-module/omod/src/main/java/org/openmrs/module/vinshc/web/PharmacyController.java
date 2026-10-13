package org.openmrs.module.vinshc.web;

import java.util.Map;

import org.openmrs.module.vinshc.service.PharmacyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

/** Pharmacy worklist and dispensing mounted at /ws/rest/v1/vinshc/pharmacy. Contract: docs/api/care.md. */
@Controller
@RequestMapping("/rest/v1/vinshc/pharmacy")
@ResponseBody
public class PharmacyController extends BaseVinshcController {

	private final PharmacyService service;

	@Autowired
	public PharmacyController(PharmacyService service) {
		this.service = service;
	}

	@GetMapping("/prescriptions")
	public Map<String, Object> prescriptions(@RequestParam(required = false) String status,
	        @RequestParam(required = false) String patient, @RequestParam(required = false) String date,
	        @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
		return service.prescriptions(status, patient, date, limit, offset);
	}

	@GetMapping("/prescriptions/{orderUuid}")
	public Map<String, Object> prescription(@PathVariable String orderUuid) {
		return service.prescription(orderUuid);
	}

	@PostMapping("/dispenses")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> dispense(@RequestBody Map<String, Object> body) {
		return service.dispense(body);
	}

	@GetMapping("/dispenses/{uuid}")
	public Map<String, Object> dispenseRecord(@PathVariable String uuid) {
		return service.dispenseRecord(uuid);
	}
}
