#!/usr/bin/env python3
"""Textures de météo (src/renderer/img/weather) à partir des planches fournies (tools/weather) :
  snow.png : flocons blancs sur fond transparent (alpha = luminosité de la planche, fond noir supprimé)
  fog.png  : brume blanche, alpha = luminosité de la planche de bruit (zones claires = brouillard épais)
Les deux planches se répètent sans couture : le jeu les fait défiler en motif (weather-fx.js)."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'tools' / 'weather', ROOT / 'src' / 'renderer' / 'img' / 'weather'
OUT.mkdir(parents=True, exist_ok=True)

snow = Image.open(SRC / 'snow-source.png').convert('L')
a = snow.point(lambda v: 0 if v < 24 else min(255, int((v - 24) * 255 / 231)))
img = Image.new('RGBA', snow.size, (255, 255, 255, 0)); img.putalpha(a)
img.save(OUT / 'snow.png', optimize=True)

fog = Image.open(SRC / 'fog-source.png').convert('L')
lo, hi = fog.getextrema()
a = fog.point(lambda v: int(max(0, (v - lo) / max(1, hi - lo)) ** 1.6 * 255))
img = Image.new('RGBA', fog.size, (236, 242, 245, 0)); img.putalpha(a)
img.save(OUT / 'fog.png', optimize=True)
print('ok', (OUT / 'snow.png').stat().st_size, (OUT / 'fog.png').stat().st_size)
