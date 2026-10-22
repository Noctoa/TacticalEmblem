#!/usr/bin/env python3
"""
Découpe les planches d'interface « style GBA » (tools/ui-gba/) en pièces utilisées par le jeu (src/renderer/img/ui/) :

  hud-combat.png  → plaques de nom, encadrés PRÉC/DGT/CRIT (une couleur par camp), panneaux d'arme et de PV
  etiquettes.png  → étiquettes HIT / DMG / CRT
  fenetre.png     → fenêtre bleue à cadre brun (menus, fenêtres d'information)
  fiche.png       → fenêtre dorée, cadre de portrait, plaque rouge (fiche d'unité)
  + icônes de types d'arme (dessinées ici, 16×16)

  python3 tools/build_ui_gba.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ui-gba')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'ui')
KEY = (112, 128, 160)  # fond des planches (transparent)


def load(name):
    return np.array(Image.open(os.path.join(SRC, name)).convert('RGBA'))


def save(arr, name):
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(os.path.join(OUT, name), optimize=True)


def keyed(arr):
    a = arr.copy()
    m = (a[..., 0] == KEY[0]) & (a[..., 1] == KEY[1]) & (a[..., 2] == KEY[2])
    a[m, 3] = 0
    return a


def outside_keyed(arr):
    """Rend transparent le fond qui touche les bords (les coins arrondis), pas celui de l'intérieur."""
    a = arr.copy()
    hgt, wid = a.shape[:2]
    isk = (a[..., 0] == KEY[0]) & (a[..., 1] == KEY[1]) & (a[..., 2] == KEY[2])
    seen = np.zeros((hgt, wid), bool)
    stack = [(y, x) for y in range(hgt) for x in (0, wid - 1)] + [(y, x) for x in range(wid) for y in (0, hgt - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= hgt or x >= wid or seen[y, x] or not isk[y, x]:
            continue
        seen[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    a[seen, 3] = 0
    return a


def recolor(arr, mapping):
    a = arr.copy()
    for src, dst in mapping.items():
        m = (a[..., 0] == src[0]) & (a[..., 1] == src[1]) & (a[..., 2] == src[2])
        a[m, 0], a[m, 1], a[m, 2] = dst
    return a


# couleurs de camp des planches (plaque : clair/foncé ; encadré : liseré clair/foncé)
RED = {'p1': (168, 32, 48), 'p2': (152, 24, 40), 's1': (136, 16, 32), 's2': (88, 8, 24)}
BLUE = {'p1': (32, 80, 160), 'p2': (24, 72, 152), 's1': (16, 64, 144), 's2': (8, 48, 112)}
TEAMS = {
    'red': RED, 'blue': BLUE,
    'green': {'p1': (40, 144, 72), 'p2': (32, 128, 64), 's1': (24, 112, 56), 's2': (8, 72, 32)},
    'gray': {'p1': (104, 112, 120), 'p2': (88, 96, 104), 's1': (96, 104, 112), 's2': (56, 60, 72)},
}


def team_variants(piece, base, prefix):
    """piece : pièce à la couleur `base` (côté gauche) → <prefix>-<camp>.png (le côté droit est retourné en CSS)."""
    for team, pal in TEAMS.items():
        save(recolor(piece, {base[k]: pal[k] for k in base}), f'{prefix}-{team}.png')


def hud():
    a = load('hud-combat.png')
    team_variants(keyed(a[6:27, 5:66]), RED, 'plate')            # plaque de nom 61×21 (ornement à droite)
    team_variants(keyed(a[108:138, 5:51]), RED, 'stats')         # encadré PRÉC/DGT/CRIT 46×30
    save(keyed(a[118:138, 50:128]), 'weapon.png')                # panneau d'arme 78×20 (côté gauche)
    save(keyed(a[138:160, 5:128]), 'hp.png')                     # panneau des PV 123×22 (côté gauche)
    lab = load('etiquettes.png')
    lab = keyed(recolor(lab, {tuple(int(v) for v in lab[0, 255, :3]): KEY}))
    for name, x0, x1 in (('hit', 1, 14), ('dmg', 25, 40), ('crt', 49, 62)):
        save(lab[0:8, x0:x1], f'label-{name}.png')


def windows():
    f = load('fenetre.png')
    save(outside_keyed(f[2:157, 3:141]), 'window.png')            # fenêtre bleue 138×155, cadre de 4 px
    g = load('fiche.png')
    save(g[0:160, 97:240], 'window-gold.png')                    # fenêtre dorée 143×160
    save(g[0:81, 0:97], 'portrait-frame.png')                    # cadre de portrait 97×81
    save(g[81:98, 0:97], 'nameplate-red.png')                    # plaque de nom rouge 97×17


# ---------------------------------------------------------------------------
# icônes de types d'arme (dessins originaux, 16×16)
PAL = {
    'k': (24, 16, 24), 'w': (240, 244, 248), 'm': (168, 180, 200), 'd': (96, 104, 128),
    'b': (168, 112, 56), 'n': (104, 64, 32), 'g': (248, 208, 72), 'c': (248, 240, 216),
    'R': (216, 72, 40), 'r': (144, 40, 24), 'Y': (240, 208, 88), 'y': (176, 136, 40),
    'P': (128, 72, 176), 'p': (72, 40, 104), 'B': (96, 168, 248), 'e': (56, 96, 200),
}
ICONS = {
    'sword': """
................
.............kk.
............kwk.
...........kwmk.
..........kwmk..
.........kwmk...
........kwmk....
...k...kwmk.....
..kgk.kwmk......
...kgkwmk.......
....kgkk........
....kngk........
...knk.kgk......
..knk...k.......
..kk............
................""",
    'lance': """
................
...........kkkk.
...........kwwk.
..........kwmmk.
.........kwmdk..
........knkdk...
.......knk.k....
......knk.......
.....knk........
....knk.........
...knk..........
..knk...........
.knk............
.kk.............
................
................""",
    'axe': """
................
......kkk.......
.....kwwmk......
....kwmmmdk.....
....kwmkknbk....
....kwk.knbk....
.....k..knk.....
.......knk......
......knk.......
.....knk........
....knk.........
...knk..........
..knk...........
..kk............
................
................""",
    'bow': """
................
......kk........
.....knbk.......
.....kbk.k......
....kbk..k......
....kbk..k......
...kbk...k......
...kgk...k......
...kgk...k......
...kbk...k......
....kbk..k......
....kbk..k......
.....kbk.k......
.....knbk.......
......kk........
................""",
    'staff': """
................
..........kkk...
.........kBwBk..
.........kBBek..
..........kek...
.........kgk....
........knk.....
.......knk......
......knk.......
.....knk........
....knk.........
...knk..........
..knk...........
..kk............
................
................""",
}
TOME = """
................
................
...kkkkkkkkkk...
..kXXXXXXXXXck..
..kXXXXXXXXXck..
..kXXXgggXXXck..
..kXXgXXXgXXck..
..kXXgXXXgXXck..
..kXXXgggXXXck..
..kXXXXXXXXXck..
..kXXXXXXXXXck..
..kxxxxxxxxxck..
...kccccccccck..
....kkkkkkkkkk..
................
................"""
for name, (c1, c2) in (('anima', ('R', 'r')), ('light', ('Y', 'y')), ('dark', ('P', 'p'))):
    ICONS[name] = TOME.replace('X', c1).replace('x', c2)


def icons():
    names = ['sword', 'lance', 'axe', 'bow', 'anima', 'light', 'dark', 'staff']
    sheet = np.zeros((16, 16 * len(names), 4), np.uint8)
    for i, n in enumerate(names):
        rows = [r for r in ICONS[n].strip('\n').split('\n')]
        for y, row in enumerate(rows[:16]):
            for x, ch in enumerate(row[:16]):
                if ch in PAL:
                    sheet[y, i * 16 + x] = PAL[ch] + (255,)
    save(sheet, 'weapon-icons.png')
    return names


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    hud()
    windows()
    print('icônes :', ', '.join(icons()))
    print('→', OUT, ':', len(os.listdir(OUT)), 'fichiers')
