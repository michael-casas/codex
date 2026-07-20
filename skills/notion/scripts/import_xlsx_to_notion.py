#!/usr/bin/env python3
"""Parse an Excel workbook and emit Notion-ready row payloads.

This helper is intentionally lightweight:
- it reads workbook XML directly so it does not depend on openpyxl
- it preserves sparse columns and sheet-specific row shapes
- it normalizes Excel serial dates to ISO strings when requested

The script is meant to be imported or extended by an agent, not used as a
fully opinionated importer.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def excel_serial_to_iso(serial: str | int | float | None) -> str | None:
    if serial in (None, ""):
        return None
    try:
        value = float(serial)
    except Exception:
        return None
    epoch = date(1899, 12, 30)
    return (epoch + timedelta(days=value)).isoformat()


def load_shared_strings(zf: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for si in root.findall("a:si", NS):
        strings.append("".join(t.text or "" for t in si.iterfind(".//a:t", NS)))
    return strings


def read_sheet_rows(xlsx_path: str | Path, sheet_name: str):
    xlsx_path = Path(xlsx_path)
    with ZipFile(xlsx_path) as zf:
        shared = load_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        target = None
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            if sheet.attrib["name"] == sheet_name:
                rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
                target = rid_to_target[rid]
                break
        if target is None:
            raise ValueError(f"Sheet not found: {sheet_name}")

        sheet_xml = ET.fromstring(zf.read("xl/" + target))
        for row in sheet_xml.findall(".//a:sheetData/a:row", NS):
            values: dict[str, str] = {}
            for cell in row.findall("a:c", NS):
                ref = cell.attrib["r"]
                col = "".join(ch for ch in ref if ch.isalpha())
                kind = cell.attrib.get("t")
                v = cell.find("a:v", NS)
                is_text = cell.find("a:is/a:t", NS)
                if kind == "s" and v is not None:
                    values[col] = shared[int(v.text)]
                elif is_text is not None:
                    values[col] = is_text.text or ""
                else:
                    values[col] = v.text if v is not None else ""
            yield row.attrib["r"], values


if __name__ == "__main__":
    raise SystemExit(
        "Import this helper from a Notion import script or agent workflow instead of running it standalone."
    )
