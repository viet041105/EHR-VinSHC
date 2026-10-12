# Bàn giao backend phòng khám

Tài liệu này là gói bàn giao kỹ thuật cho backend dùng dữ liệu synthetic. Nó không phải biên bản nghiệm thu của phòng khám và không cho phép dùng dữ liệu thật.

## Thành phần bàn giao

- Cấu hình dựng: `compose.yaml`, `.env.example`, `config/baseline.json` và Dockerfile backend.
- Metadata: `metadata/vinshc/pack.json`, các CSV Initializer, catalogue và contract version `0.3.0`.
- Module: VinSHC `0.3.0`, được build thành OMOD trong image; OpenMRS Reference Application `3.7.1`, Core `2.8.8`, PostgreSQL `16.15`.
- Hợp đồng API: `docs/api/README.md` và các tài liệu liên kết từ đó.
- Vận hành: `docs/DEVELOPMENT.md`, `docs/RECOVERY_RUNBOOK.md`, `docs/CI.md`.
- Tích hợp ngoài: `integrations/manifest.json`; tất cả adapter mặc định tắt.

## Quy trình kiểm chứng tái lập

CI tạo project riêng từ source của commit, build image, dựng database sạch và chạy theo thứ tự B1–B8. Sau đó CI:

1. Dừng/dựng lại container nhưng giữ volume, xác minh metadata được nạp lại idempotent và chạy `test_b9_persistence` ở phase `restart`.
2. Backup PostgreSQL và `/openmrs/data` khi application services đã dừng.
3. Restore vào project/volume mới trên cổng khác, kiểm tra database/smoke, metadata và chạy lại verifier ở phase `restore`.
4. Tạo `.runtime/reports/b9-handoff.json` từ các report đã pass. Report không chứa credential hay dump database.

Lệnh integration bắt buộc:

```powershell
$env:VINSHC_B4_CATALOGUE='metadata'
python -m unittest -v tests.integration.test_b1_contract tests.integration.test_b2_patient tests.integration.test_b3_vitals tests.integration.test_b23_extensions tests.integration.test_b4a_consultation tests.integration.test_b4b_clinical tests.integration.test_b5_authorization tests.integration.test_b7_fhir tests.integration.test_b8_operations
$env:VINSHC_ACCEPTANCE_PHASE='restart'
python -m unittest -v tests.integration.test_b9_persistence
```

Chi tiết backup/restore và project isolation nằm trong workflow [CI](../.github/workflows/ci.yml) và [runbook](RECOVERY_RUNBOOK.md). Không chạy fixture ghi dữ liệu lên instance ngoài local/CI.

## Tiêu chí bàn giao và giới hạn

Backend được coi là sẵn sàng cho nghiệm thu synthetic khi hosted CI pass, một người khác dựng lại được và ký xác nhận kết quả. Các giới hạn bắt buộc giữ trong biên bản:

- Chưa có bằng chứng E2E trên trình duyệt/FE cho toàn bộ MVP-1/MVP-2.
- Catalogue, cơ sở và người hành nghề hiện là synthetic, không dùng production.
- Upload production tắt đến khi có malware scanning và private object storage được duyệt.
- BHYT, hóa đơn điện tử, đơn thuốc quốc gia, LIS và PACS chỉ có contract, chưa có connector thật.
- HTTPS, secrets manager, least-privilege DB user, monitoring/incident response và kiểm thử bảo mật staging chưa hoàn tất.
- FHIR chỉ dùng các interaction đã kiểm chứng; không suy hỗ trợ create/update từ CapabilityStatement.

Biên bản cuối cần ghi commit, run URL, người kiểm chứng, ngày, kết quả, giới hạn chấp nhận và chữ ký/ý kiến của owner. Không ghi mật khẩu hoặc dữ liệu bệnh nhân thật.
