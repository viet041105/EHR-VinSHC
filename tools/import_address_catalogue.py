"""Extract the pinned QD 19/2025 catalogue from both official Cong Bao PDFs.

Optional authoring dependency: pdfplumber. Runtime metadata checks use stdlib.
The original PDFs stay outside Git. Never infer old-to-new commune mappings.
"""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata

VERSION = "VN-19-2025-2025-07-01"
SOURCE_PAGE = "https://congbao.chinhphu.vn/van-ban/quyet-dinh-so-19-2025-qd-ttg-45430.htm"


def extract_catalogue(paths):
    import pdfplumber

    records, provinces, counts, sources = [], {}, {}, []
    current = None
    for source_index, path in enumerate(map(Path, paths), 1):
        raw = path.read_bytes()
        if not raw.startswith(b"%PDF-"):
            raise ValueError("Input is not a PDF: " + path.name)
        source_id = "congbao-" + str(source_index)
        with pdfplumber.open(path) as pdf:
            sources.append({"id": source_id, "fileLabel": path.name,
                            "sha256": hashlib.sha256(raw).hexdigest(), "pages": len(pdf.pages),
                            "url": SOURCE_PAGE, "publication": "919+920" if source_index == 1 else "921+922"})
            for page_no, page in enumerate(pdf.pages, 1):
                for line in (page.extract_text() or "").splitlines():
                    line = unicodedata.normalize("NFC", line.strip())
                    province = re.fullmatch(r"\d+\s+(\d{2})\s+((?:Tỉnh|Thành phố) .+)", line)
                    if province and source_index == 1 and current is None:
                        code, name = province.groups()
                        if code in provinces:
                            raise ValueError("Duplicate province " + code)
                        provinces[code] = name
                        records.append(_record(code, name, None, "province", source_id, page_no))
                    heading = re.fullmatch(r"(\d{2})\. ((?:TỈNH|THÀNH PHỐ) .+)", line)
                    if heading:
                        current = heading[1]
                        if current not in provinces:
                            raise ValueError("Unknown province heading " + current)
                    declared = re.search(r"Tổng số đơn vị hành chính cấp xã:\s*(\d+)", line)
                    if declared:
                        if not current or current in counts:
                            raise ValueError("Missing/duplicate provincial commune count")
                        counts[current] = int(declared[1])
                    commune = re.fullmatch(r"(\d{5})\s+((?:Xã|Phường|Đặc khu) .+)", line)
                    if commune:
                        if not current:
                            raise ValueError("Commune has no province")
                        records.append(_record(commune[1], commune[2], current, "commune", source_id, page_no))
                    elif re.match(r"^\d{5}\s", line):
                        raise ValueError("Unparsed commune row: " + line)
    actual = Counter(r["parentCode"] for r in records if r["level"] == "commune")
    if len(provinces) != 34 or sum(actual.values()) != 3321 or dict(actual) != counts:
        raise ValueError("Catalogue count/parent mismatch: " + repr((len(provinces), sum(actual.values()), dict(actual), counts)))
    if len({r["code"] for r in records}) != len(records):
        raise ValueError("Duplicate administrative code")
    records = sorted(records, key=lambda r: (r["level"] != "province", r["parentCode"] or "", r["code"]))
    return {"schemaVersion": 1, "version": VERSION, "effectiveFrom": "2025-07-01",
            "sourceDocument": "19/2025/QĐ-TTg", "sourceUrl": SOURCE_PAGE,
            "retrievedOn": "2026-10-11", "status": "verified_original_snapshot",
            "currentness": "Pinned original annexes; later legal changes require a new reviewed version before pilot.",
            "legacyMappingStatus": "not_provided_by_this_source; empty arrays mean no verified conversion, not no predecessors",
            "sources": sources, "expectedCounts": {"province": 34, "commune": 3321},
            "declaredCommuneCounts": counts,
            "recordsSha256": hashlib.sha256(json.dumps(records, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
            "records": records}


def _record(code, name, parent, level, source_id, page_no):
    return {"code": code, "name": name, "parentCode": parent, "level": level,
            "version": VERSION, "effectiveFrom": "2025-07-01", "effectiveTo": None,
            "legacyMappings": [], "source": {"document": "19/2025/QĐ-TTg", "part": source_id, "pdfPage": page_no}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parts", nargs=2, type=Path, help="919+920 and 921+922 PDFs in that order")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalogue = extract_catalogue(args.parts)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": VERSION, "counts": catalogue["expectedCounts"], "status": "PASS source extraction"}))


if __name__ == "__main__":
    main()
