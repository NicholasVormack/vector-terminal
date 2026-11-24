#!/usr/bin/env python3
"""Crop docs/social-card-raw.png to the 1200x630 GitHub social preview card.

The raw capture is the browser render of docs/social-preview.html at 2560x1440
(1280x720 CSS at 2x). The card is laid out at 1200x680 CSS in the top-left, so
this takes a 2400x1260 pixel window from (44, 100): x is chosen so the content's
left and right margins match, y skips the first 50 CSS pixels where the browser
draws its own overlay.

    preview the card at http://127.0.0.1:8899/social-preview.html (1200x726 viewport)
    screenshot it to docs/social-card-raw.png
    python3 scripts/social-preview.sh
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = ROOT / "docs" / "social-card-raw.png"
dst = ROOT / "docs" / "social-preview.png"

CARD = (44, 100, 44 + 2400, 100 + 1260)

with Image.open(src) as image:
    if image.size != (2560, 1440):
        raise SystemExit(f"expected a 2560x1440 capture, got {image.size}")
    image.crop(CARD).save(dst, optimize=True)

src.unlink()
print(f"wrote {dst.relative_to(ROOT)}")
