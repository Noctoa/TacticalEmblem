#!/usr/bin/env python3
"""
Fiche de personnage façon Fire Emblem : Radiant Dawn (tools/ui-radiant/statut.png, 240 × 160 utiles) :

  src/renderer/img/ui/radiant/status.png        fond de la page Stats (traits des stats à gauche, lignes à droite)
  src/renderer/img/ui/radiant/status-blank.png  même fond sans les traits (pages Objets et Compétences)
  src/renderer/img/ui/radiant/panel.png         cadre des fenêtres et menus (9 parties de 8 px : liseré sombre / beige / brun,
                                                coin haut droit coupé en biais, centre sarcelle)

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

def panel(size=20, corner=5, inside=TEAL):
    """Cadre de fenêtre aux couleurs du panneau de droite : sombre, beige, brun, brun, puis sarcelle ; coin haut droit en biais."""
    band = [(64, 48, 32), (216, 192, 136), (144, 112, 72)]
    img = Image.new('RGBA', (size, size), inside + (255,))
    px = img.load()
    for y in range(size):
        for x in range(size):
            d = min(x, y, size - 1 - x, size - 1 - y)  # distance au bord
            # coin haut droit coupé : distance mesurée à la diagonale
            cx, cy = size - 1 - x, y
            if cx + cy < corner:
                px[x, y] = (0, 0, 0, 0)
                continue
            if cx + cy < corner + len(band):
                d = min(d, cx + cy - corner)
            if d < len(band):
                px[x, y] = band[d] + (255,)
    return img


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
    panel().save(os.path.join(OUT, 'panel.png'), optimize=True)
    # variantes pour la fenêtre d'une unité ennemie / alliée (même cadre, fond rouge / vert)
    panel(inside=(66, 22, 26)).save(os.path.join(OUT, 'panel-enemy.png'), optimize=True)
    panel(inside=(18, 70, 40)).save(os.path.join(OUT, 'panel-ally.png'), optimize=True)
    print('→', OUT)
