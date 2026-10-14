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
import org.openmrs.module.vinshc.service.FormWorkflowService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

/** Versioned VinSHC-specific forms and facility workflow settings. */
@Controller
@RequestMapping("/rest/v1/vinshc/admin-configuration")
@ResponseBody
public class FormWorkflowController extends BaseVinshcController {

	private final FormWorkflowService service;

	@Autowired
	public FormWorkflowController(FormWorkflowService service) {
		this.service = service;
	}

	@PostMapping("/forms")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> draft(@RequestBody Map<String, Object> body) {
		return service.draft(body);
	}

	@GetMapping("/forms")
	public Map<String, Object> forms(@RequestParam String facilityLocationUuid, @RequestParam(required = false) String code,
	        @RequestParam(required = false) String state) {
		return service.forms(facilityLocationUuid, code, state);
	}

	@GetMapping("/forms/{uuid}")
	public Map<String, Object> form(@PathVariable String uuid) {
		return service.form(uuid);
	}

	@PostMapping("/forms/{uuid}/activate")
	public Map<String, Object> activate(@PathVariable String uuid) {
		return service.activate(uuid);
	}

	@PostMapping("/forms/{uuid}/retire")
	public Map<String, Object> retire(@PathVariable String uuid) {
		return service.retire(uuid);
	}

	@GetMapping("/workflow/{locationUuid}")
	public Map<String, Object> workflow(@PathVariable String locationUuid) {
		return service.workflow(locationUuid);
	}

	@PostMapping("/workflow")
	public Map<String, Object> setWorkflow(@RequestBody Map<String, Object> body) {
		return service.setWorkflow(body);
	}
}
