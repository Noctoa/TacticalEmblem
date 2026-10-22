#!/usr/bin/env python3
"""
Écran de sauvegarde et menus façon Fire Emblem GBA (planches de tools/ui-save/, fond (112, 128, 160) = transparent) :

  slot-on-*.png / slot-off-*   barre verte d'un emplacement (choisi / non choisi) en 5 morceaux : l, ml, c, mr, r
                               (bouts et centre orné fixes, milieux étirés : la barre prend toute largeur sans se déformer)
  menu-on-*.png                barre verte d'une entrée de menu choisie (mêmes morceaux) ; menu-off.png : barre bleue
  hand.png / hand-green.png    main-curseur
  playtime.png                 cadre « PLAYTIME » ; digits.png : chiffres 0-9 et « : » (cases de 8 × 10)

  python3 tools/build_ui_save.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ui-save')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'ui', 'save')
KEY = (112, 128, 160)


def load(name):
    a = np.array(Image.open(os.path.join(SRC, name)).convert('RGBA'))
    k = (a[..., 0] == KEY[0]) & (a[..., 1] == KEY[1]) & (a[..., 2] == KEY[2])
    a[k] = 0
    return a


def save(a, name):
    Image.fromarray(a.astype(np.uint8), 'RGBA').save(os.path.join(OUT, name), optimize=True)


def slices(a, cap, x0, x1, prefix):
    """Barre en 5 morceaux : bouts (fixes), milieux (étirés), centre orné (fixe) — rien n'est déformé."""
    W = a.shape[1]
    parts = {'l': a[:, :cap], 'ml': a[:, cap:x0], 'c': a[:, x0:x1], 'mr': a[:, x1:W - cap], 'r': a[:, W - cap:]}
    for k, v in parts.items():
        save(v, f'{prefix}-{k}.png')
    return {k: v.shape[1] for k, v in parts.items()}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    on, off = load('slot-on.png')[0:32, 0:192], load('slot-off.png')[0:32, 0:192]
    print('emplacement', slices(on, 14, 79, 113, 'slot-on'), slices(off, 14, 79, 113, 'slot-off'))
    mode = load('mode.png')
    print('menu', slices(mode[0:32, 0:128], 4, 48, 80, 'menu-on'))
    menu = load('menu.png')
    save(menu[5:27, 72:160], 'menu-off.png')  # partie sombre de la barre bleue (entrée non choisie)
    save(menu[4:27, 224:256], 'hand.png')
    save(mode[4:27, 224:256], 'hand-green.png')
    save(menu[82:107, 176:256], 'playtime.png')
    save(menu[102:112, 48:136], 'digits.png')
    print('→', OUT)
