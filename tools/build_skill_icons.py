#!/usr/bin/env python3
"""
Icônes de compétences (pixel art 16 × 16, communauté Fire Emblem / FE-Repo) : tools/skill-icons/*.png
Le nom d'un fichier donne l'icône : « {Crédits} (Groupe) Nom.png » ; « Nom.png » sans crédits = doublon d'une icône créditée.

  python3 tools/build_skill_icons.py

→ src/renderer/img/skills/icons.png   planche (cases de 16 × 16, 16 par ligne), fond transparent
→ src/renderer/img/skills/index.js    self.SKILL_ICONS = { cell, cols, list: [{ id, label, group, credits }] }
→ tools/skill-icons/CREDITS.txt       crédits

Une compétence y renvoie par « icon:<id> » (ex. icon:luna) : champ « image » de la fiche. Les images identiques ne
sont gardées qu'une fois (celle qui a des crédits) ; les cases vides (fond seul) sont écartées.
"""
import collections, hashlib, json, os, re, unicodedata
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'skill-icons')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'skills')
CELL, COLS = 16, 16
BGS = [(192, 248, 200), (197, 255, 205)]  # fonds vert d'eau des planches d'origine (deux teintes selon les artistes)


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def parse(name):
    stem = name[:-4]
    credits, group = [], ''
    m = re.match(r'^\{([^}]*)\}\s*', stem)
    if m:
        credits = [c.strip() for c in m.group(1).split(',') if c.strip()]
        stem = stem[m.end():]
    m = re.match(r'^\(([^)]*)\)\s*', stem)
    if m:
        group = m.group(1).strip(); stem = stem[m.end():]
    stem = re.sub(r'\s*\[F2E\]\s*', ' ', stem).strip()
    stem = re.sub(r'^\[(.*)\]$', r'\1', stem)
    return stem.strip(), group, credits


def load(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (CELL, CELL):
        im = im.resize((CELL, CELL), Image.NEAREST)
    a = np.array(im)
    for bg in BGS: a[(a[..., :3] == bg).all(2), 3] = 0
    return a


def main():
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.png'))
    entries = collections.OrderedDict()  # empreinte → icône
    for f in sorted(files, key=lambda f: (not f.startswith('{'), f.lower())):  # icônes créditées d'abord
        a = load(os.path.join(SRC, f))
        if not a[..., 3].any():
            continue  # case vide
        key = hashlib.sha1(a.tobytes()).hexdigest()
        label, group, credits = parse(f)
        if key in entries:
            continue
        entries[key] = {'label': label, 'group': group or (credits[0] if credits else 'Fire Emblem'), 'credits': credits or ['Intelligent Systems'], 'px': a, 'file': f}
    ids, out = collections.Counter(), []
    for e in entries.values():
        base = slug(e['label']) or 'icone'
        sid = base if not ids[base] else f"{base}-{slug(e['group'])}"
        while sid in [o['id'] for o in out]:
            sid += '-2'
        ids[base] += 1
        e['id'] = sid; out.append(e)
    rows = (len(out) + COLS - 1) // COLS
    sheet = np.zeros((rows * CELL, COLS * CELL, 4), np.uint8)
    for i, e in enumerate(out):
        r, c = divmod(i, COLS)
        sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = e['px']
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):  # anciennes planches
        if re.match(r'^skills-\d+\.png$', f):
            os.remove(os.path.join(OUT, f))
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'icons.png'), optimize=True)
    lst = [{'id': e['id'], 'label': e['label'], 'group': e['group'], 'credits': e['credits']} for e in out]
    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as fh:
        fh.write('/* Généré par tools/build_skill_icons.py : icônes de compétences 16 × 16 (img/skills/icons.png). */\nself.SKILL_ICONS = ')
        json.dump({'cell': CELL, 'cols': COLS, 'list': lst}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    by = collections.Counter(c for e in out for c in e['credits'])
    lines = ['Crédits des icônes de compétences (pixel art 16 × 16, communauté Fire Emblem / FE-Repo)', '',
             f'Artistes ({len(by)}) :'] + [f'  {n} ({k} icônes)' for n, k in sorted(by.items(), key=lambda x: (-x[1], x[0].lower()))] + ['', 'Icônes :']
    lines += [f"  icon:{e['id']} — {e['label']} [{e['group']}] : {', '.join(e['credits'])}" for e in out]
    open(os.path.join(SRC, 'CREDITS.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{len(out)} icônes ({len(files)} fichiers, doublons et cases vides écartés)')


if __name__ == '__main__':
    main()
