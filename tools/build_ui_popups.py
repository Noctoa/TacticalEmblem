#!/usr/bin/env python3
"""
Annonces de phase, flèche de déplacement et fond d'interface (tools/ui-popups/) :

  phase-joueur/ennemie/alliee.png → src/renderer/img/ui/phase-player|enemy|ally.png   (Lukiroh, recadrées)
  fleche.png                      → src/renderer/img/ui/arrow.png   16 cases de 16 px (Squidjees, fond vert retiré) :
      0-3 départ vers droite / bas / gauche / haut, 4-7 coins (droite+bas, gauche+bas, haut+droite, haut+gauche),
      8-11 pointe vers droite / bas / gauche / haut, 12-13 vertical, 14-15 horizontal
  fond.png                        → src/renderer/img/ui/background.png  fond des écrans qui n'en ont pas

  python3 tools/build_ui_popups.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ui-popups')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'ui')


def keyed(name, key=None):
    a = np.array(Image.open(os.path.join(SRC, name)).convert('RGBA'))
    if key:
        a[(a[..., 0] == key[0]) & (a[..., 1] == key[1]) & (a[..., 2] == key[2])] = 0
    return a


if __name__ == '__main__':
    for src, dst in (('phase-joueur.png', 'phase-player.png'), ('phase-ennemie.png', 'phase-enemy.png'), ('phase-alliee.png', 'phase-ally.png')):
        a = keyed(src, (112, 128, 160))
        ys, xs = np.nonzero(a[..., 3] > 0)
        crop = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        Image.fromarray(crop, 'RGBA').save(os.path.join(OUT, dst), optimize=True)
        print(dst, crop.shape[1], '×', crop.shape[0])
    Image.fromarray(keyed('fleche.png', (160, 216, 168)), 'RGBA').save(os.path.join(OUT, 'arrow.png'), optimize=True)
    Image.open(os.path.join(SRC, 'fond.png')).convert('RGB').save(os.path.join(OUT, 'background.png'), optimize=True)
    print('→', OUT)
