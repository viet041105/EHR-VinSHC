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
import org.openmrs.module.vinshc.service.DirectoryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

/** Administrative provider links and new business facilities (not Core REST pass-through). */
@Controller
@RequestMapping("/rest/v1/vinshc/directory")
@ResponseBody
public class DirectoryController extends BaseVinshcController {

	private final DirectoryService service;

	@Autowired
	public DirectoryController(DirectoryService service) {
		this.service = service;
	}

	@PostMapping("/providers")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createProvider(@RequestBody Map<String, Object> body) {
		return service.createProvider(body);
	}

	@PostMapping("/providers/link")
	public Map<String, Object> linkProvider(@RequestBody Map<String, Object> body) {
		return service.linkProvider(body);
	}

	@PostMapping("/providers/{uuid}")
	public Map<String, Object> updateProvider(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.updateProvider(uuid, body);
	}

	@PostMapping("/providers/unlink")
	public Map<String, Object> unlinkProvider(@RequestBody Map<String, Object> body) {
		return service.unlinkProvider(body);
	}

	@PostMapping("/providers/{uuid}/retire")
	public Map<String, Object> retireProvider(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.retireProvider(uuid, body);
	}

	@GetMapping("/users/{uuid}/providers")
	public Map<String, Object> links(@PathVariable String uuid) {
		return service.providerLinks(uuid);
	}

	@PostMapping("/facilities")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createFacility(@RequestBody Map<String, Object> body) {
		return service.createFacility(body);
	}

	@GetMapping("/facilities")
	public Map<String, Object> facilities() {
		return service.facilities();
	}

	@GetMapping("/facilities/{uuid}")
	public Map<String, Object> facility(@PathVariable String uuid) {
		return service.facilityRecord(uuid);
	}

	@PostMapping("/facilities/{uuid}")
	public Map<String, Object> updateFacility(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.updateFacility(uuid, body);
	}

	@PostMapping("/facilities/{uuid}/retire")
	public Map<String, Object> retireFacility(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.retireFacility(uuid, body);
	}
}
