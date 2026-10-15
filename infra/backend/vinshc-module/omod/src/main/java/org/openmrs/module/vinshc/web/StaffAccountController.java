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
import org.openmrs.module.vinshc.service.StaffAccountService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

/** System Developer only. Never exposes Core User credentials or accepts arbitrary privileges. */
@Controller
@RequestMapping("/rest/v1/vinshc/staff")
@ResponseBody
public class StaffAccountController extends BaseVinshcController {

	private final StaffAccountService service;

	@Autowired
	public StaffAccountController(StaffAccountService service) {
		this.service = service;
	}

	@GetMapping("/audit")
	public Map<String, Object> audit(@RequestParam(required = false) Integer limit) {
		return service.auditEvents(limit);
	}

	@PostMapping("/users")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> create(@RequestBody Map<String, Object> body) {
		return service.create(body);
	}

	@GetMapping("/users")
	public Map<String, Object> search(@RequestParam(required = false) String q,
	        @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset) {
		return service.search(q, limit, offset);
	}

	@PostMapping("/users/{uuid}/state")
	public Map<String, Object> state(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.changeState(uuid, body);
	}

	@PostMapping("/users/{uuid}/username")
	public Map<String, Object> username(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.rename(uuid, body);
	}

	@PostMapping("/users/{uuid}/password")
	public Map<String, Object> password(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.resetPassword(uuid, body);
	}

	@PostMapping("/me/password")
	public Map<String, Object> ownPassword(@RequestBody Map<String, Object> body) {
		return service.changeOwnPassword(body);
	}

	@PostMapping("/users/{uuid}/roles")
	public Map<String, Object> role(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.grantRole(uuid, body);
	}
}
