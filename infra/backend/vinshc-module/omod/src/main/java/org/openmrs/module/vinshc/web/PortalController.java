package org.openmrs.module.vinshc.web;

import java.util.Map;
import org.openmrs.module.vinshc.service.PortalService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/rest/v1/vinshc/portal")
@ResponseBody
public class PortalController extends BaseVinshcController {
	
	private final PortalService service;
	
	@Autowired
	public PortalController(PortalService service) {
		this.service = service;
	}
	
	@GetMapping("/session")
	public Map<String, Object> session() {
		return service.session();
	}
	
	@GetMapping("/visits")
	public Map<String, Object> visits() {
		return service.visits();
	}
	
	@GetMapping("/visits/{uuid}/instructions")
	public Map<String, Object> instructions(@PathVariable String uuid) {
		return service.instructions(uuid);
	}
	
	@GetMapping("/prescriptions")
	public Map<String, Object> prescriptions(@RequestParam(required = false) String visit) {
		return service.prescriptions(visit);
	}
	
	@GetMapping("/appointments")
	public Map<String, Object> appointments() {
		return service.appointments();
	}
	
	@PostMapping("/accounts")
	public Map<String, Object> link(@RequestBody Map<String, Object> body) {
		return service.link(body);
	}
	
	@DeleteMapping("/accounts/{uuid}")
	public Map<String, Object> unlink(@PathVariable String uuid) {
		return service.unlink(uuid);
	}
	
	@PostMapping("/visits/{uuid}/publication")
	public Map<String, Object> publish(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.publish(uuid, body);
	}
	
	@DeleteMapping("/visits/{uuid}/publication")
	public Map<String, Object> revoke(@PathVariable String uuid) {
		return service.revoke(uuid);
	}
}
