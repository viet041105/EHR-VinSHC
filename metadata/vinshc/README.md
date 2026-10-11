# Metadata VinSHC 0.3.0

Đọc [hướng dẫn tổng thể](../../docs/METADATA.md) và [bàn giao B4–B9](../../docs/METADATA_B4_B9.md).

- `pack.json`: nguồn trường/UUID/code lists và tham chiếu contract/catalogue.
- `catalogues/`, `contracts/`, `permissions.json`, `forms.json`: nguồn máy đọc; dữ liệu bổ sung B4–B9 chỉ dùng test.
- `initializer-test/`, `import-manifest.json`: CSV và kế hoạch provision trên instance test riêng; chưa tự nạp vào runtime.
- `fixtures/b4-b9.json`: 159 ca contract test; `backend-acceptance.json`: 5 scenario cần BE chạy thật; `print-examples.json`: 6 payload phiếu giả.
- `fields.csv`, `frontend-map.json`, `permission-matrix.csv`: file sinh, không sửa tay.

Tại gốc repo: `python tools/metadata.py --write`, rồi `python tools/metadata.py` và `python -m unittest discover -s metadata/tests -v`.

Package patch test: `python tools/metadata.py --prepare-update .runtime/metadata-update-0.3.1` với thư mục mới. UUID/ý nghĩa lâm sàng và pinned catalogue versions giữ nguyên. Xem `CHANGELOG.md`, `sources.json` và hướng dẫn để biết nguồn/hiệu lực/điều kiện còn cần duyệt.
