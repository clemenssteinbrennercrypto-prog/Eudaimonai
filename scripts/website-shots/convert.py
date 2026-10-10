"""Convert the website screenshots from shoot.mjs into the WebP assets the
landing page imports. Needs Pillow with WebP support (pip install pillow).

    python3 scripts/website-shots/convert.py [.website-shots]
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.website-shots'
TARGET = ROOT / 'src' / 'web' / 'landing' / 'assets'

# name -> output width in pixels (2x the largest size the page shows it at)
WIDTHS = {
    'lab': 2400,
    'lab-score': 1400,
    'session-report': 1800,
    'session-planner': 2000,
    'week-review': 1800,
    'best-hours': 1800,
    'workspace': 2000,
}

TARGET.mkdir(parents=True, exist_ok=True)
for name, width in WIDTHS.items():
    image = Image.open(SOURCE / f'{name}.png').convert('RGB')
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    out = TARGET / f'{name}.webp'
    image.save(out, 'WEBP', quality=82, method=6)
    print(f'{out.relative_to(ROOT)}  {image.width}x{image.height}  {out.stat().st_size // 1024} kB')
