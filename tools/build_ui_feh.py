#!/usr/bin/env python3
"""
Découpe les planches « Fire Emblem Heroes » fournies (tools/ui-feh/) en pièces utilisées par le jeu :

  chiffres.png → src/renderer/img/feh/digits-<style>.png + digits.js (largeurs des chiffres)
                 crit (grands, rouges), dmg (moyens, rouges), small (petits, rouges), heal (verts)
  statuts.png  → src/renderer/img/feh/banner.png    bandeau turquoise (attaques spéciales, compétences)
                 src/renderer/img/feh/bubble.png    bulle de dialogue (conversation disponible au camp)
                 plugins/invocations/img/weapons.png icônes de types d'arme (épée, lance, hache, arc,
                                                     anima, lumière, ténèbres, bâton), 56 × 56

  python3 tools/build_ui_feh.py
"""
import json
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'ui-feh')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'feh')
PLUGIN = os.path.join(ROOT, 'plugins', 'invocations', 'img')


def digits():
    im = Image.open(os.path.join(SRC, 'chiffres.png')).convert('RGBA')
    a = np.array(im)
    lab, _ = ndimage.label(a[..., 3] > 20)
    boxes = [(s[0].start, s[1].start, s[0].stop, s[1].stop) for s in ndimage.find_objects(lab) if s[0].stop - s[0].start > 8]
    rows = {}
    for b in boxes:
        rows.setdefault(min(rows, key=lambda y: abs(y - b[0])) if rows and min(abs(y - b[0]) for y in rows) < 20 else b[0], []).append(b)
    names = ['crit', 'dmg', 'small', 'heal']
    meta = {}
    for name, (y, row) in zip(names, sorted(rows.items())):
        row.sort(key=lambda b: b[1])
        assert len(row) == 10, (name, len(row))
        top = min(b[0] for b in row) - 2
        bottom = max(b[2] for b in row) + 2
        pad = 2
        cells, x = [], 0
        sheet = Image.new('RGBA', (sum(b[3] - b[1] + 2 * pad for b in row), bottom - top))
        for b in row:
            w = b[3] - b[1] + 2 * pad
            sheet.paste(im.crop((b[1] - pad, top, b[3] + pad, bottom)), (x, 0))
            cells.append([x, w])
            x += w
        sheet.save(os.path.join(OUT, f'digits-{name}.png'), optimize=True)
        meta[name] = {'h': bottom - top, 'cells': cells}
    # données lues par src/renderer/feh-digits.js (script : pas de chargement de fichier à faire)
    with open(os.path.join(OUT, 'digits.js'), 'w') as f:
        f.write('/* Généré par tools/build_ui_feh.py : chiffres « Fire Emblem Heroes » (img/feh/digits-<style>.png). */\n')
        f.write('self.FEH_DIGITS = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
    return meta


def statuses():
    im = Image.open(os.path.join(SRC, 'statuts.png')).convert('RGBA')
    im.crop((2, 116, 1196, 268)).save(os.path.join(OUT, 'banner.png'), optimize=True)
    im.crop((1215, 116, 1340, 240)).save(os.path.join(OUT, 'bubble.png'), optimize=True)
    # icônes de types d'arme : une case de 56 px, dans l'ordre de la planche
    cell = lambda i: im.crop((1 + 56 * i, 57, 57 + 56 * i, 113))
    order = {'sword': 0, 'lance': 1, 'axe': 2, 'bow': 6, 'anima': 11, 'light': 12, 'dark': 13, 'staff': 15}
    sheet = Image.new('RGBA', (56 * len(order), 56))
    for k, i in enumerate(order.values()):
        sheet.paste(cell(i), (56 * k, 0))
    os.makedirs(PLUGIN, exist_ok=True)
    sheet.save(os.path.join(PLUGIN, 'weapons.png'), optimize=True)
    return list(order)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print('chiffres :', {k: v['h'] for k, v in digits().items()})
    print('icônes :', statuses())
