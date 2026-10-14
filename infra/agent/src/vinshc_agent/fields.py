"""Nhãn tiếng Việt và đơn vị UCUM lấy từ metadata/vinshc/fields.csv (nguồn chung với BE/FE)."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

# clinical-summary trả giá trị sinh hiệu không kèm đơn vị; đơn vị lấy theo concept trong fields.csv.
UNIT_DISPLAY = {"/min": "lần/phút", "mm[Hg]": "mmHg", "Cel": "°C", "%": "%", "kg": "kg", "cm": "cm"}


@dataclass(frozen=True)
class FieldMeta:
    code: str
    label: str
    type: str
    unit: str | None

    @property
    def unit_display(self) -> str | None:
        return None if self.unit is None else UNIT_DISPLAY.get(self.unit, self.unit)


class FieldCatalog:
    def __init__(self, fields: dict[str, FieldMeta]):
        self._fields = fields

    @classmethod
    def load(cls, path: Path) -> "FieldCatalog":
        with path.open(encoding="utf-8-sig", newline="") as handle:
            rows = csv.DictReader(handle)
            fields = {
                row["field_code"]: FieldMeta(
                    code=row["field_code"],
                    label=row["label_vi"],
                    type=row["type"],
                    unit=row["unit_ucum"] or None,
                )
                for row in rows
                if row.get("field_code")
            }
        return cls(fields)

    def get(self, code: str) -> FieldMeta:
        return self._fields.get(code) or FieldMeta(code=code, label=code, type="text", unit=None)
