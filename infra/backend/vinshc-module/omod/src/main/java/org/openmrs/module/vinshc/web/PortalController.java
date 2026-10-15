/*
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at http://mozilla.org/MPL/2.0/. OpenMRS is also distributed under
 * the terms of the Healthcare Disclaimer located at http://openmrs.org/license.
 *
 * Copyright (C) OpenMRS Inc. OpenMRS is a registered trademark and the OpenMRS
 * graphic logo is a trademark of OpenMRS Inc.
 */
package org.openmrs.module.vinshc.web;

import java.util.Map;
import org.openmrs.module.vinshc.service.PortalService;
import org.openmrs.module.vinshc.service.StaffAccountService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/rest/v1/vinshc/portal")
@ResponseBody
public class PortalController extends BaseVinshcController {

	private final PortalService service;

	private final StaffAccountService staff;

	@Autowired
	public PortalController(PortalService service, StaffAccountService staff) {
		this.service = service;
		this.staff = staff;
	}

	@GetMapping("/session")
	public Map<String, Object> session() {
		return service.session();
	}

	@PostMapping("/password")
	public Map<String, Object> password(@RequestBody Map<String, Object> body) {
		// Verify the patient link before allowing patient self-service password changes.
		service.me();
		return staff.changeOwnPassword(body);
	}

	@GetMapping("/me")
	public Map<String, Object> me() {
		return service.me();
	}

	@GetMapping("/visits/{uuid}")
	public Map<String, Object> visit(@PathVariable String uuid) {
		return service.publicationVisit(uuid);
	}

	@GetMapping("/prescriptions/{uuid}")
	public Map<String, Object> prescriptionPublication(@PathVariable String uuid) {
		return service.publicationItems(uuid, "prescriptions");
	}

	@GetMapping("/results/{uuid}")
	public Map<String, Object> resultPublication(@PathVariable String uuid) {
		return service.publicationItems(uuid, "results");
	}

	@GetMapping("/attachments/{uuid}/content")
	public void attachmentContent(@PathVariable String uuid) {
		service.denyUnscannedAttachment(uuid);
	}

	@GetMapping("/visits")
	public Map<String, Object> visits(@RequestParam(required = false) Integer limit,
	        @RequestParam(required = false) Integer offset) {
		return service.visits(limit, offset);
	}

	@GetMapping("/visits/{uuid}/instructions")
	public Map<String, Object> instructions(@PathVariable String uuid) {
		return service.instructions(uuid);
	}

	@GetMapping("/prescriptions")
	public Map<String, Object> prescriptions(@RequestParam(required = false) String visit,
	        @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
		return service.prescriptions(visit, limit, offset);
	}

	@GetMapping("/results")
	public Map<String, Object> results(@RequestParam(required = false) String visit,
	        @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
		return service.results(visit, limit, offset);
	}

	@GetMapping("/appointments")
	public Map<String, Object> appointments() {
		return service.appointments();
	}

	@PostMapping("/accounts")
	public Map<String, Object> link(@RequestBody Map<String, Object> body) {
		return service.link(body);
	}

	@GetMapping("/accounts/{uuid}/history")
	public Map<String, Object> linkHistory(@PathVariable String uuid) {
		return service.linkHistory(uuid);
	}

	@PostMapping("/accounts/{uuid}/verify")
	public Map<String, Object> verify(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.verify(uuid, body);
	}

	@PostMapping("/accounts/{uuid}/revoke")
	public Map<String, Object> unlink(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.unlink(uuid, body == null ? null : (String) body.get("reason"));
	}

	@PostMapping("/visits/{uuid}/publication")
	public Map<String, Object> publish(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.publish(uuid, body);
	}

	@GetMapping("/visits/{uuid}/publication/history")
	public Map<String, Object> history(@PathVariable String uuid) {
		return service.publicationHistory(uuid);
	}

	@PostMapping("/visits/{uuid}/publication/revoke")
	public Map<String, Object> revoke(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.revoke(uuid, body == null ? null : (String) body.get("reason"));
	}
}
