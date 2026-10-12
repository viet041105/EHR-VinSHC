"""Generate the OpenMRS Address Hierarchy import from the pinned DATA-08 catalogue.

Uses only Python's standard library. The checked-in CSV is reproducible and keeps
the official administrative codes as AddressHierarchyEntry user-generated IDs.
"""

import argparse
import json
from pathlib import Path


def generate(catalogue_path: Path, output_path: Path) -> int:
    catalogue = json.loads(catalogue_path.read_text(encoding="utf-8"))
    records = catalogue["records"]
    provinces = {row["code"]: row for row in records if row["level"] == "province"}
    communes = [row for row in records if row["level"] == "commune"]

    expected = catalogue["expectedCounts"]
    if len(provinces) != expected["province"] or len(communes) != expected["commune"]:
        raise ValueError("DATA-08 record counts do not match expectedCounts")

    lines = []
    for commune in sorted(communes, key=lambda row: (row["parentCode"], row["code"])):
        province = provinces.get(commune["parentCode"])
        if province is None:
            raise ValueError(f"Unknown parentCode {commune['parentCode']} for {commune['code']}")
        cells = ("Việt Nam~VN", f"{province['name']}~{province['code']}", f"{commune['name']}~{commune['code']}")
        if any("," in cell or "\n" in cell or "\r" in cell or cell.count("~") != 1 for cell in cells):
            raise ValueError(f"Address Hierarchy delimiter collision in {commune['code']}")
        lines.append(",".join(cells))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalogue",
        type=Path,
        default=Path("metadata/vinshc/catalogues/address-vn-19-2025.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("infra/backend/configuration/addresshierarchy/addresshierarchy.csv"),
    )
    args = parser.parse_args()
    count = generate(args.catalogue, args.output)
    print(f"Generated {count} DATA-08 hierarchy paths in {args.output}")


if __name__ == "__main__":
    main()
