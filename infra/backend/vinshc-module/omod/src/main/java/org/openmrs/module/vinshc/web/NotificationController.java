package org.openmrs.module.vinshc.web;

import java.util.Map;
import org.openmrs.module.vinshc.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/rest/v1/vinshc/notifications")
@ResponseBody
public class NotificationController extends BaseVinshcController {
    private final NotificationService service;
    @Autowired
    public NotificationController(NotificationService service) { this.service = service; }
    @GetMapping("")
    public Map<String, Object> list(@RequestParam(required=false) Integer limit, @RequestParam(required=false) Integer offset) {
        return service.list(limit, offset);
    }
    @PostMapping("/{uuid}/read")
    public Map<String, Object> read(@PathVariable String uuid) { return service.read(uuid); }
    @PostMapping("/read-all")
    public Map<String, Object> readAll() { return service.readAll(); }
}
