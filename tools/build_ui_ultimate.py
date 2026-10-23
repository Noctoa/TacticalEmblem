#!/usr/bin/env python3
"""
Ultimes (tools/ui-ultimate/ultimate.png, fond transparent) : l'icône d'ultime puis les chiffres 1 à 9.

  icon.png     icône d'ultime (prêt)
  digits.png   chiffres 1-9 en cases de CELL_W × CELL_H (chiffre centré, bas aligné) : case i = chiffre i + 1

  python3 tools/build_ui_ultimate.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ui-ultimate', 'ultimate.png')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'ui', 'ultimate')
CELL_W, CELL_H = 40, 52


def glyphs(im):
    alpha = im.split()[3]
    w, h = im.size
    cols = [any(alpha.getpixel((x, y)) > 40 for y in range(h)) for x in range(w)]
    runs, start = [], None
    for x, c in enumerate(cols + [False]):
        if c and start is None:
            start = x
        if not c and start is not None:
            runs.append((start, x))
            start = None
    out = []
    for a, b in runs:
        part = im.crop((a, 0, b, h))
        out.append(part.crop(part.getbbox()))
    return out


def main():
    im = Image.open(SRC).convert('RGBA')
    parts = glyphs(im)
    assert len(parts) == 10, len(parts)
    os.makedirs(OUT, exist_ok=True)
    parts[0].save(os.path.join(OUT, 'icon.png'))
    sheet = Image.new('RGBA', (CELL_W * 9, CELL_H))
    for i, g in enumerate(parts[1:]):
        sheet.alpha_composite(g, (i * CELL_W + (CELL_W - g.width) // 2, CELL_H - g.height))
    sheet.save(os.path.join(OUT, 'digits.png'))
    print('icône', parts[0].size, '· chiffres', [g.size for g in parts[1:]])


if __name__ == '__main__':
    main()
