#!/usr/bin/env python3
"""
Icônes de compétences façon Fire Emblem Heroes : planches 1024 × 1024 (13 × 13 icônes de 76 px, décalage 2 px),
« Mobile - Fire Emblem Heroes - UI - Skills » (Skill_Passive1.png … Skill_Passive9.png).

  python3 tools/build_skill_icons.py DOSSIER_DES_PLANCHES

→ src/renderer/img/skills/skills-<n>.png   les planches (toutes les icônes : celles qui ne servent pas restent disponibles)
→ src/renderer/img/skills/index.js         icônes réelles par planche (les cases vides grises sont écartées)

Une compétence y renvoie par « feh:<planche>-<case> » (ex. feh:2-45) : champ « image » de la fiche.
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'skills')
CELL, OFF, COLS = 76, 2, 13


def main(src):
    os.makedirs(OUT, exist_ok=True)
    sheets = {}
    n = 1
    while os.path.exists(os.path.join(src, f'Skill_Passive{n}.png')):
        im = Image.open(os.path.join(src, f'Skill_Passive{n}.png')).convert('RGBA')
        a = np.array(im).astype(float)
        ok = []
        for i in range(COLS * COLS):
            r, c = divmod(i, COLS)
            core = a[OFF + CELL * r + 22:OFF + CELL * r + 54, OFF + CELL * c + 22:OFF + CELL * c + 54]
            if core[..., 3].mean() < 128 or core[..., :3].reshape(-1, 3).std(0).mean() < 12:
                continue  # case vide (cercle gris uni)
            ok.append(i)
        im.save(os.path.join(OUT, f'skills-{n}.png'), optimize=True)
        sheets[n] = ok
        print(f'planche {n} : {len(ok)} icônes')
        n += 1
    with open(os.path.join(OUT, 'index.js'), 'w') as f:
        f.write('/* Généré par tools/build_skill_icons.py : icônes de compétences façon Heroes (img/skills/skills-<n>.png). */\n')
        f.write(f'self.SKILL_ICON_SHEETS = {{ cell: {CELL}, offset: {OFF}, cols: {COLS}, size: 1024, sheets: {{\n')
        f.write(',\n'.join(f'  {k}: [{",".join(map(str, v))}]' for k, v in sheets.items()))
        f.write('\n} };\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'ui-feh', 'competences'))
