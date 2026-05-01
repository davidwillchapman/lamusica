#!/usr/bin/env python3
"""xml_to_schema.py — Infer an XSD schema from an XML file.

Usage:
    python xml_to_schema.py input.xml [output.xsd]

Output goes to stdout when no output path is given.
Requires only the Python standard library.
"""

import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict


# ── type inference ─────────────────────────────────────────────────────────

_LADDER = ["xs:boolean", "xs:integer", "xs:decimal", "xs:date", "xs:dateTime", "xs:string"]


def _detect(value: str) -> str:
    v = value.strip()
    if not v:
        return "xs:string"
    if v.lower() in ("true", "false"):
        return "xs:boolean"
    if re.fullmatch(r"-?\d+", v):
        return "xs:integer"
    if re.fullmatch(r"-?\d*\.\d+", v):
        return "xs:decimal"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return "xs:date"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T[\d:.Z+-]+", v):
        return "xs:dateTime"
    return "xs:string"


def _widen(a: str, b: str) -> str:
    ia = _LADDER.index(a) if a in _LADDER else len(_LADDER)
    ib = _LADDER.index(b) if b in _LADDER else len(_LADDER)
    return _LADDER[max(ia, ib)]


def _collapse(types: set) -> str:
    if not types:
        return "xs:string"
    t = _LADDER[0]
    for x in types:
        t = _widen(t, x)
    return t


# ── schema node ────────────────────────────────────────────────────────────

class _Node:
    __slots__ = ("total", "parents_seen", "text_types", "attr_types", "children", "child_order")

    def __init__(self):
        self.total = 0
        self.parents_seen = 0       # number of parent instances that had ≥1 of this child
        self.text_types: set = set()
        self.attr_types: dict = defaultdict(set)
        self.children: dict = {}
        self.child_order: list = []

    def record(self, el: ET.Element):
        self.total += 1
        text = (el.text or "").strip()
        if text:
            self.text_types.add(_detect(text))
        for k, v in el.attrib.items():
            self.attr_types[k].add(_detect(v))

    def text_xsd(self) -> str:
        return _collapse(self.text_types)

    def attr_xsd(self, name: str) -> str:
        return _collapse(self.attr_types[name])


# ── analysis ───────────────────────────────────────────────────────────────

def _strip_ns(tag: str) -> str:
    return re.sub(r"\{[^}]*\}", "", tag)


def _walk(el: ET.Element, node: _Node) -> None:
    node.record(el)
    seen = set()
    for child in el:
        tag = _strip_ns(child.tag)
        if tag not in node.children:
            node.children[tag] = _Node()
            node.child_order.append(tag)
        child_node = node.children[tag]
        if tag not in seen:
            child_node.parents_seen += 1
            seen.add(tag)
        _walk(child, child_node)


# ── XSD emission ───────────────────────────────────────────────────────────

def _emit(tag: str, node: _Node, parent_total: int, depth: int) -> list:
    p = "  " * depth
    lines = []

    if parent_total == 0:
        occ = ""  # top-level xs:schema children cannot carry occurrence constraints
    else:
        mn = "1" if node.parents_seen >= parent_total else "0"
        mx = "unbounded" if node.total > node.parents_seen else "1"
        occ = f' minOccurs="{mn}" maxOccurs="{mx}"'

    has_children = bool(node.children)
    has_text = bool(node.text_types)
    text_type = node.text_xsd() if has_text else None
    attrs = list(node.attr_types)

    if not has_children and not attrs:
        # pure simple element
        lines.append(f'{p}<xs:element name="{tag}" type="{text_type or "xs:string"}"{occ}/>')

    elif not has_children and not has_text:
        # complex type with only attributes, no text
        lines.append(f'{p}<xs:element name="{tag}"{occ}>')
        lines.append(f'{p}  <xs:complexType>')
        for a in attrs:
            lines.append(f'{p}    <xs:attribute name="{a}" type="{node.attr_xsd(a)}"/>')
        lines.append(f'{p}  </xs:complexType>')
        lines.append(f'{p}</xs:element>')

    elif not has_children:
        # text + attributes → simpleContent extension
        lines.append(f'{p}<xs:element name="{tag}"{occ}>')
        lines.append(f'{p}  <xs:complexType>')
        lines.append(f'{p}    <xs:simpleContent>')
        lines.append(f'{p}      <xs:extension base="{text_type}">')
        for a in attrs:
            lines.append(f'{p}        <xs:attribute name="{a}" type="{node.attr_xsd(a)}"/>')
        lines.append(f'{p}      </xs:extension>')
        lines.append(f'{p}    </xs:simpleContent>')
        lines.append(f'{p}  </xs:complexType>')
        lines.append(f'{p}</xs:element>')

    else:
        # complex type with child elements (and optionally attributes)
        mixed = ' mixed="true"' if has_text else ""
        lines.append(f'{p}<xs:element name="{tag}"{occ}>')
        lines.append(f'{p}  <xs:complexType{mixed}>')
        lines.append(f'{p}    <xs:sequence>')
        for child_tag in node.child_order:
            lines.extend(_emit(child_tag, node.children[child_tag], node.total, depth + 3))
        lines.append(f'{p}    </xs:sequence>')
        for a in attrs:
            lines.append(f'{p}    <xs:attribute name="{a}" type="{node.attr_xsd(a)}"/>')
        lines.append(f'{p}  </xs:complexType>')
        lines.append(f'{p}</xs:element>')

    return lines


# ── public API ─────────────────────────────────────────────────────────────

def generate(xml_path: str) -> str:
    """Parse *xml_path* and return an inferred XSD schema string."""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    root_tag = _strip_ns(root.tag)

    root_node = _Node()
    _walk(root, root_node)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">',
        "",
    ]
    lines.extend(_emit(root_tag, root_node, 0, depth=1))
    lines += ["", "</xs:schema>"]
    return "\n".join(lines)


# ── entry point ────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: xml_to_schema.py <input.xml> [output.xsd]")

    xsd = generate(sys.argv[1])

    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            f.write(xsd)
        print(f"Written to {sys.argv[2]}", file=sys.stderr)
    else:
        print(xsd)


if __name__ == "__main__":
    main()
