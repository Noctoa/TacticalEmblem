#!/usr/bin/env python3
"""
Fiche de personnage façon Fire Emblem : Radiant Dawn (tools/ui-radiant/statut.png, 240 × 160 utiles) :

  src/renderer/img/ui/radiant/status.png        fond de la page Stats (traits des stats à gauche, lignes à droite)
  src/renderer/img/ui/radiant/status-blank.png  même fond sans les traits (pages Objets et Compétences)

  python3 tools/build_ui_radiant.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ui-radiant', 'statut.png')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'ui', 'radiant')
TEAL = (8, 64, 80)
LINES = {(16, 32, 40), (8, 24, 24)}
BOX = (166, 116, 239, 158)  # encadré du bas à droite, gardé sur toutes les pages

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert('RGBA').crop((0, 0, 240, 160))
    im.save(os.path.join(OUT, 'status.png'), optimize=True)
    blank = im.copy()
    px = blank.load()
    for y in range(22, 154):
        for x in range(100, 232):
            if BOX[0] <= x < BOX[2] and BOX[1] <= y < BOX[3]:
                continue
            if px[x, y][:3] in LINES:
                px[x, y] = TEAL + (255,)
    blank.save(os.path.join(OUT, 'status-blank.png'), optimize=True)
    print('→', OUT)
