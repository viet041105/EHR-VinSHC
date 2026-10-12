package org.openmrs.module.vinshc.web;

import java.util.LinkedHashMap;
import java.util.Map;

import org.openmrs.module.vinshc.service.OperationsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MultipartFile;

/** B8 operational APIs mounted at /ws/rest/v1/vinshc/operations. */
@Controller
@RequestMapping("/rest/v1/vinshc/operations")
@ResponseBody
public class OperationsController extends BaseVinshcController {

	private final OperationsService service;

	@Autowired
	public OperationsController(OperationsService service) {
		this.service = service;
	}

	@GetMapping("/configuration")
	public Map<String, Object> configuration() {
		return service.configuration();
	}

	@PostMapping("/appointments")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createAppointment(@RequestBody Map<String, Object> body) {
		return service.createAppointment(body);
	}

	@GetMapping("/appointments/{uuid}")
	public Map<String, Object> appointment(@PathVariable String uuid) {
		return service.appointment(uuid);
	}

	@PostMapping("/appointments/{uuid}/transition")
	public Map<String, Object> transitionAppointment(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.transitionAppointment(uuid, body);
	}

	@PostMapping("/queue")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createQueue(@RequestBody Map<String, Object> body) {
		return service.createQueue(body);
	}

	@GetMapping("/queue/{uuid}")
	public Map<String, Object> queue(@PathVariable String uuid) {
		return service.queue(uuid);
	}

	@PostMapping("/queue/{uuid}/transition")
	public Map<String, Object> transitionQueue(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.transitionQueue(uuid, body);
	}

	@PostMapping("/queue/{uuid}/advance")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> advanceQueue(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.advanceQueue(uuid, body);
	}

	@PostMapping("/bills")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createBill(@RequestBody Map<String, Object> body) {
		return service.createBill(body);
	}

	@GetMapping("/bills/{uuid}")
	public Map<String, Object> bill(@PathVariable String uuid) {
		return service.bill(uuid);
	}

	@PostMapping("/bills/{uuid}/cancel")
	public Map<String, Object> cancelBill(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.cancelBill(uuid, body);
	}

	@PostMapping("/bills/{uuid}/receipts")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> receipt(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.receipt(uuid, body);
	}

	@GetMapping("/payments/{uuid}")
	public Map<String, Object> payment(@PathVariable String uuid) {
		return service.payment(uuid);
	}

	@PostMapping("/payments/{uuid}/settle")
	public Map<String, Object> settle(@PathVariable String uuid) {
		return service.settlePayment(uuid);
	}

	@PostMapping("/payments/{uuid}/refunds")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> refund(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.refund(uuid, body);
	}

	@PostMapping("/service-orders")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createServiceOrder(@RequestBody Map<String, Object> body) {
		return service.createServiceOrder(body);
	}

	@GetMapping("/service-orders/{uuid}")
	public Map<String, Object> serviceOrder(@PathVariable String uuid) {
		return service.serviceOrder(uuid);
	}

	@PostMapping("/service-orders/{uuid}/transition")
	public Map<String, Object> transitionServiceOrder(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.transitionServiceOrder(uuid, body);
	}

	@PostMapping("/service-orders/{uuid}/results")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> createResult(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.createResult(uuid, body);
	}

	@GetMapping("/results/{uuid}")
	public Map<String, Object> result(@PathVariable String uuid) {
		return service.result(uuid);
	}

	@PostMapping("/results/{uuid}/corrections")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> correctResult(@PathVariable String uuid, @RequestBody Map<String, Object> body) {
		return service.correctResult(uuid, body);
	}

	@PostMapping(path = "/service-orders/{uuid}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, Object> upload(@PathVariable String uuid, @RequestParam(required = false) String result,
	        @RequestPart("file") MultipartFile file) throws java.io.IOException {
		return service.upload(uuid, result, file.getOriginalFilename(), file.getContentType(), file.getBytes());
	}

	@GetMapping("/attachments/{uuid}")
	public Map<String, Object> attachment(@PathVariable String uuid) {
		return service.attachment(uuid, false);
	}

	@GetMapping("/attachments/{uuid}/content")
	public ResponseEntity<byte[]> download(@PathVariable String uuid) {
		Map<String, Object> attachment = service.attachment(uuid, true);
		byte[] bytes = (byte[]) attachment.remove("bytes");
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.parseMediaType(attachment.get("mimeType").toString()));
		headers.setContentLength(bytes.length);
		headers.set(HttpHeaders.CONTENT_DISPOSITION,
		    "attachment; filename=\"" + safeFilename(attachment.get("filename").toString()) + "\"");
		headers.set("X-Content-SHA256", attachment.get("sha256").toString());
		return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
	}

	@GetMapping("/documents/{template}/{sourceUuid}")
	public Map<String, Object> document(@PathVariable String template, @PathVariable String sourceUuid) {
		return service.document(template, sourceUuid);
	}

	@GetMapping("/reports/daily")
	public Map<String, Object> daily(@RequestParam String date, @RequestParam String facility) {
		return service.dailyReport(date, facility);
	}

	private static String safeFilename(String value) {
		return value.replaceAll("[\\r\\n\\\"\\\\]", "_");
	}
}
