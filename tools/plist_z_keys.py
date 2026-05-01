#!/usr/bin/env python3
"""plist_z_keys.py — Find all unique keys across Z-level dicts in a plist XML.

Expected structure:

    <dict>                       ← X  (top-level dict)
      <key>TARGET_KEY</key>
      <dict>                     ← Y
        <key>id1</key>
        <dict> … </dict>         ← Z  (one per entry)
        <key>id2</key>
        <dict> … </dict>         ← Z
        …
      </dict>
      …other top-level keys…
    </dict>

Usage:
    python plist_z_keys.py library.xml
    python plist_z_keys.py library.xml --key Tracks
    python plist_z_keys.py library.xml --key Playlists --count
"""

import argparse
import sys
import xml.etree.ElementTree as ET


# ── plist helpers ──────────────────────────────────────────────────────────

def _pairs(dict_el):
    """Yield (key_str, value_el) pairs from a plist <dict> element."""
    it = iter(dict_el)
    for child in it:
        if child.tag == "key":
            yield (child.text or ""), next(it, None)


def _find(dict_el, target_key):
    """Return the value element for *target_key* inside a plist <dict>, or None."""
    for k, v in _pairs(dict_el):
        if k == target_key:
            return v
    return None


def _keys(dict_el):
    """Return the set of key strings that appear directly inside a plist <dict>."""
    return {k for k, _ in _pairs(dict_el)}


# ── main ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Report every unique key that can appear in a Z-level plist dict."
    )
    ap.add_argument("xml_file", help="Path to the plist XML file")
    ap.add_argument(
        "--key", default="Tracks",
        help="Key under X whose value is the Y dict (default: Tracks)"
    )
    ap.add_argument(
        "--count", action="store_true",
        help="Also show how many Z-dicts each key appears in"
    )
    args = ap.parse_args()

    tree = ET.parse(args.xml_file)
    root = tree.getroot()

    # plist files wrap everything in <plist>; unwrap if present
    x = root.find("dict") if root.tag == "plist" else root
    if x is None or x.tag != "dict":
        sys.exit("error: expected a <dict> at the top level")

    y = _find(x, args.key)
    if y is None:
        sys.exit(f"error: key '{args.key}' not found in the top-level dict")
    if y.tag != "dict":
        sys.exit(f"error: value under '{args.key}' is <{y.tag}>, expected <dict>")

    from collections import Counter
    key_counts: Counter = Counter()
    z_count = 0

    for _, z in _pairs(y):
        if z is not None and z.tag == "dict":
            key_counts.update(_keys(z))
            z_count += 1

    if not z_count:
        sys.exit(f"warning: no <dict> values found under '{args.key}'")

    all_keys = sorted(key_counts)
    print(f"Y key : '{args.key}'")
    print(f"Z dicts found : {z_count}")
    print(f"Unique keys across all Z dicts: {len(all_keys)}\n")

    if args.count:
        width = max(len(k) for k in all_keys)
        for k in all_keys:
            print(f"  {k:<{width}}  ({key_counts[k]}/{z_count})")
    else:
        for k in all_keys:
            print(f"  {k}")


if __name__ == "__main__":
    main()
