package org.openmrs.module.vinshc.web;

import java.util.Map;
import org.openmrs.module.vinshc.service.PatientAccessService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/rest/v1/vinshc/patient-access/requests")
@ResponseBody
public class PatientAccessController extends BaseVinshcController {
    private final PatientAccessService service;
    @Autowired
    public PatientAccessController(PatientAccessService service) { this.service = service; }
    @GetMapping("")
    public Map<String, Object> list(@RequestParam(required=false) String status, @RequestParam(required=false) String patientUuid,
            @RequestParam(required=false) Integer limit, @RequestParam(required=false) Integer offset) {
        return service.list(status, patientUuid, limit, offset);
    }
    @GetMapping("/{uuid}")
    public Map<String, Object> get(@PathVariable String uuid) { return service.get(uuid); }
    @PostMapping("")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody Map<String, Object> body) { return service.create(body); }
    @PostMapping("/{uuid}/fulfill")
    public Map<String, Object> fulfill(@PathVariable String uuid, @RequestBody Map<String, Object> body) { return service.fulfill(uuid, body); }
    @PostMapping("/{uuid}/reject")
    public Map<String, Object> reject(@PathVariable String uuid, @RequestBody Map<String, Object> body) { return service.reject(uuid, body); }
}
