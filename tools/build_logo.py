"""Logo de Tactical Emblem, tiré d'une planche de sprite de carte (cases de 32 × 32).

Les 3 dernières images de la planche (assets/icon/logo-sheet.png, dernière ligne) donnent :
  - src/renderer/img/logo.png : planche 32 × 96 animée (barre d'icônes, écran d'accueil) ;
  - assets/icon/icon.png (256 px) et assets/icon/icon.ico (16 à 256 px) : icône du .exe et des fenêtres.

Usage : python tools/build_logo.py [planche.png]"""
import sys
from PIL import Image

CELL = 32
src = Image.open(sys.argv[1] if len(sys.argv) > 1 else 'assets/icon/logo-sheet.png').convert('RGBA')
cols, rows = src.width // CELL, src.height // CELL
cells = [src.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL)) for r in range(rows) for c in range(cols)]
cells = [c for c in cells if c.getbbox()]
frames = cells[-3:]

strip = Image.new('RGBA', (CELL, CELL * 3), (0, 0, 0, 0))
for i, f in enumerate(frames):
    strip.paste(f, (0, i * CELL))
strip.save('src/renderer/img/logo.png')

# Icône : première des 3 images, recadrée sur le personnage, agrandie sans lissage et centrée
f = frames[0]
box = f.getbbox()
part = f.crop(box)
side = max(part.size)
scale = max(1, int(256 * 0.94) // side)
part = part.resize((part.width * scale, part.height * scale), Image.NEAREST)
icon = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
icon.paste(part, ((256 - part.width) // 2, (256 - part.height) // 2))
icon.save('assets/icon/icon.png')
icon.save('assets/icon/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('logo :', len(frames), 'images ; icône', part.size, 'x', scale)
