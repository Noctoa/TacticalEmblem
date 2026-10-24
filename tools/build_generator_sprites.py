#!/usr/bin/env python3
"""
Map sprites Fire Emblem (FE-Repo, sprites de la communauté) triés dans tools/map-sprites/ :

  generateur/<catégorie>/…               sprites génériques (classes, monstres…) : proposés par le générateur de personnage
  personnages-principaux/<catégorie>/…   personnages nommés de la série : convertis à part, prêts à l'emploi
  objets-et-poses/<catégorie>/…          objets, décors, poses (mort, à terre…) : gardés tels quels, non convertis

Un sprite = « <Nom>-stand.png » (immobile, 3 images de 16×16, 16×32 ou 32×32) et/ou « <Nom>-walk.png » (en mouvement,
15 images de 32×32 : gauche ×4, bas ×4, haut ×4, sélection ×3) ; même nom = même personnage. Le texte entre accolades
{…} donne les crédits. Un « walk » sans « stand » du même nom reprend le « stand » de la même classe (nom plus court,
mêmes crédits), comme les sprites d'origine (un « stand » par classe, un « walk » par arme).

Sortie (planches au format du jeu : 4 colonnes × 6 lignes de 32×32 — repos, gauche, droite, bas, haut, sélection) :
  src/renderer/img/generator/sprites/<id>.png      sprites du générateur
  src/renderer/img/generator/sprites-thumbs.png    vignettes (une case de 32×32 par sprite, 32 par ligne)
  src/renderer/img/generator/sprites.js            self.GENERATOR_SPRITES = { cols, list: [{ id, label, group, credits }] }
  assets/library/personnages-principaux/<id>.png + .json   sprites de map prêts à copier dans ressources/personnages/<Nom>/
  tools/map-sprites/CREDITS.txt                    crédits (artistes et sprites)
  tools/map-sprites/exclus.txt                     sprites à ne pas proposer dans le générateur (identifiants)

  python3 tools/build_generator_sprites.py
"""
import collections, json, os, re, shutil, unicodedata
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'map-sprites')
OUT_GEN = os.path.join(ROOT, 'src', 'renderer', 'img', 'generator')
OUT_LIB = os.path.join(ROOT, 'assets', 'library', 'personnages-principaux')
THUMB_COLS = 32
KIND = re.compile(r'\s*-?\s*(stand|walk|move|moving)\b[^/]*$', re.I)
CATEGORIES = {'generateur': 'Générateur de personnage', 'personnages-principaux': 'Personnages principaux de la série', 'objets-et-poses': 'Objets, décors et poses'}


def stem_of(name):
    s = re.sub(r'\.(png|bmp)$', '', name, flags=re.I)
    m = KIND.search(s)
    if not m:
        return s.strip(), None
    return s[:m.start()].strip(), 'stand' if m.group(1).lower() == 'stand' else 'walk'


def credits_of(stem):
    out = []
    for m in re.finditer(r'[\{\(]([^{}()\[\]]*)\}', stem):
        out += [c.strip() for c in m.group(1).split(',')]
    for m in re.finditer(r'\[([^\]]+)\]', stem):
        if not re.fullmatch(r'[MFU]', m.group(1)):
            out += [c.strip() for c in m.group(1).split(',')]
    return [c for c in out if c and not re.fullmatch(r'[MFU]', c)]


def label_of(stem):
    s = re.sub(r'\s*[\{\(][^{}()]*\}', '', stem)
    s = re.sub(r'\s*\[(?![MFU]\])[^\]]+\]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60] or 'sprite'


def scan(category):
    base = os.path.join(SRC, category)
    entries = collections.OrderedDict()
    if not os.path.isdir(base):
        return []
    for folder in sorted(os.listdir(base)):
        d = os.path.join(base, folder)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not re.search(r'\.(png|bmp)$', f, re.I):
                continue
            stem, kind = stem_of(f)
            e = entries.setdefault((folder, stem), {'folder': folder, 'stem': stem, 'label': label_of(stem), 'files': {}, 'credits': credits_of(stem)})
            e['files'].setdefault(kind or 'unknown', os.path.join(d, f))
    entries = list(entries.values())
    known = set(c.lower() for e in entries for c in e['credits'])  # sans tenir compte des majuscules
    for e in entries:  # crédits entre parenthèses ( … ) faits de noms déjà connus
        for m in re.finditer(r'\(([^()]*)\)', e['stem']):
            parts = [p.strip() for p in m.group(1).split(',')]
            if parts and all(p.lower() in known and not re.fullmatch(r'[MFU]', p) for p in parts):
                e['credits'] += [p for p in parts if p not in e['credits']]
                e['label'] = re.sub(r'\s*\(' + re.escape(m.group(1)) + r'\)', '', e['label']).strip()
    # « walk » seul : « stand » de la même classe (libellé plus court, mêmes crédits, même dossier)
    stands = [e for e in entries if 'stand' in e['files'] and 'walk' not in e['files']]
    used = set()
    for e in entries:
        if 'walk' in e['files'] and 'stand' not in e['files']:
            cands = [s for s in stands if s['folder'] == e['folder'] and s['credits'] == e['credits']
                     and (e['label'] + ' ').startswith(s['label'].rstrip() + ' ')]
            if cands:
                s = max(cands, key=lambda c: len(c['label']))
                e['files']['stand'] = s['files']['stand']; used.add(id(s))
    return [e for e in entries if id(e) not in used and ('stand' in e['files'] or 'walk' in e['files'])]


SKIP = {'oracle-v2'}  # planche de marche mal découpée dans la source
# sprites retirés à la main du générateur : tools/map-sprites/exclus.txt (un identifiant par ligne, # = commentaire)
_ex = os.path.join(SRC, 'exclus.txt')
if os.path.exists(_ex):
    SKIP |= {l.strip() for l in open(_ex, encoding='utf-8') if l.strip() and not l.lstrip().startswith('#')}


def rgba(path):
    out = _rgba(path)
    # fonds « sales » : les teintes à peine différentes de la couleur du fond deviennent transparentes aussi
    if out[0, 0, 3] == 0:
        bg = out[0, 0, :3].astype(int)
        if bg.any():
            near = (np.abs(out[..., :3].astype(int) - bg).max(2) <= 12)
            out[near, 3] = 0
    return out


def _rgba(path):
    im = Image.open(path)
    if im.mode == 'P':
        a = np.array(im); pal = np.array(im.getpalette()[:768]).reshape(-1, 3)
        trans = im.info.get('transparency')
        out = np.zeros(a.shape + (4,), np.uint8); out[..., :3] = pal[a]
        if isinstance(trans, bytes):
            alpha = np.array([trans[i] if i < len(trans) else 255 for i in range(256)], np.uint8)[a]
        else:
            alpha = np.where(a == (trans if isinstance(trans, int) else a[0, 0]), 0, 255).astype(np.uint8)  # sinon : couleur du coin haut gauche
        out[..., 3] = alpha
        if alpha[0, 0]:  # index transparent déclaré mais fond opaque : le coin haut gauche fait foi
            out[(out[..., :3] == out[0, 0, :3]).all(2), 3] = 0
        return out
    if im.mode in ('RGBA', 'LA'):
        out = np.array(im.convert('RGBA'))
        out[out[..., 3] < 128, 3] = 0; out[out[..., 3] > 0, 3] = 255
        if out[0, 0, 3]:  # fond opaque : la couleur du coin haut gauche devient transparente
            out[(out[..., :3] == out[0, 0, :3]).all(2), 3] = 0
        return out
    a = np.array(im.convert('RGB'))
    out = np.zeros(a.shape[:2] + (4,), np.uint8); out[..., :3] = a
    out[..., 3] = np.where((a == a[0, 0]).all(2), 0, 255)
    return out


def stand_frames(a):
    """3 images de repos, posées dans des cases de 32×32 (pieds en bas, au centre)."""
    h, w = a.shape[:2]
    fh = h // 3
    if w not in (16, 32) or fh not in (16, 32) or h % 3:
        return None
    frames = []
    for i in range(3):
        f = a[i * fh:(i + 1) * fh]
        t = np.zeros((32, 32, 4), np.uint8)
        x0 = (32 - w) // 2
        t[32 - fh:32, x0:x0 + w] = f
        frames.append(t)
    return frames


def walk_frames(a):
    if a.shape[1] != 32 or a.shape[0] < 480:
        return None
    return [a[i * 32:(i + 1) * 32] for i in range(15)]


def convert(e):
    stand = stand_frames(rgba(e['files']['stand'])) if 'stand' in e['files'] else None
    walk = walk_frames(rgba(e['files']['walk'])) if 'walk' in e['files'] else None
    if not stand and not walk:
        return None
    if walk:
        left, down, up, focus = walk[0:4], walk[4:8], walk[8:12], walk[12:15]
    else:
        left = down = up = stand; focus = stand
    idle = stand or [down[0]]
    right = [np.ascontiguousarray(f[:, ::-1]) for f in left]
    rows = [idle, left, right, down, up, focus]
    sheet = np.zeros((6 * 32, 4 * 32, 4), np.uint8)
    for r, fr in enumerate(rows):
        for c, f in enumerate(fr[:4]):
            sheet[r * 32:(r + 1) * 32, c * 32:(c + 1) * 32] = f
    n = lambda fr: len(fr[:4])
    loop = lambda k: [0, 1, 2, 1] if k == 3 else list(range(k))
    anims = {'idle': {'row': 0, 'frames': loop(n(idle)), 'durations': ([500, 80, 500, 80] if n(idle) == 3 else [500] * n(idle))}}
    for i, k in enumerate(['left', 'right', 'down', 'up']):
        anims[k] = {'row': i + 1, 'frames': list(range(n(rows[i + 1]))), 'durations': [110] * n(rows[i + 1])}
    anims['focus'] = {'row': 5, 'frames': loop(n(focus)), 'durations': ([160, 100, 160, 100] if n(focus) == 3 else [160] * n(focus))}
    meta = {'type': 'mapsprite', 'name': e['label'], 'frame': [32, 32], 'anchor': [16, 32], 'base': 16, 'anims': anims,
            'source': 'FE-Repo' + (' — ' + ', '.join(e['credits']) if e['credits'] else '')}
    thumb = (stand or [down[0]])[0]
    counts = [n(idle), n(left), n(focus)]  # nombre d'images : repos, marche, sélection (CharGen.spriteMeta)
    return Image.fromarray(sheet, 'RGBA'), meta, thumb, counts


def ids_for(entries):
    seen = collections.Counter(); out = []
    for e in entries:
        base = slug(e['label']); seen[base] += 1
        out.append(base if seen[base] == 1 else f'{base}-{seen[base]}')
    return out


def main():
    gen, lib = scan('generateur'), scan('personnages-principaux')
    # générateur
    sdir = os.path.join(OUT_GEN, 'sprites')
    shutil.rmtree(sdir, ignore_errors=True); os.makedirs(sdir)
    lst, thumbs = [], []
    for e, sid in zip(gen, ids_for(gen)):
        if sid in SKIP:
            continue
        r = convert(e)
        if not r:
            print('  ignoré (format inconnu) :', e['label']); continue
        img, meta, thumb, counts = r
        img.save(os.path.join(sdir, sid + '.png'), optimize=True)
        lst.append({'id': sid, 'label': e['label'], 'group': e['folder'], 'credits': e['credits'], 'f': counts})
        thumbs.append(thumb)
    rows = (len(thumbs) + THUMB_COLS - 1) // THUMB_COLS
    atlas = np.zeros((max(1, rows) * 32, THUMB_COLS * 32, 4), np.uint8)
    for i, t in enumerate(thumbs):
        atlas[(i // THUMB_COLS) * 32:(i // THUMB_COLS + 1) * 32, (i % THUMB_COLS) * 32:(i % THUMB_COLS + 1) * 32] = t
    Image.fromarray(atlas, 'RGBA').save(os.path.join(OUT_GEN, 'sprites-thumbs.png'), optimize=True)
    with open(os.path.join(OUT_GEN, 'sprites.js'), 'w', encoding='utf-8') as f:
        f.write('/* Généré par tools/build_generator_sprites.py — ne pas modifier à la main. */\nself.GENERATOR_SPRITES = ')
        json.dump({'cols': THUMB_COLS, 'source': 'FE-Repo (Klokinator) — sprites de la communauté Fire Emblem', 'list': lst}, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    # personnages principaux : sprites de map prêts à l'emploi
    shutil.rmtree(OUT_LIB, ignore_errors=True); os.makedirs(OUT_LIB)
    nlib = 0
    for e, sid in zip(lib, ids_for(lib)):
        r = convert(e)
        if not r:
            continue
        img, meta, _, _ = r
        img.save(os.path.join(OUT_LIB, sid + '.png'), optimize=True)
        json.dump(meta, open(os.path.join(OUT_LIB, sid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        nlib += 1
    write_credits()
    print(f'générateur : {len(lst)} sprites · personnages principaux : {nlib}')


def write_credits():
    by_cat = {}
    artists = collections.Counter()
    for cat in CATEGORIES:
        es = scan(cat)
        by_cat[cat] = es
        for e in es:
            for c in e['credits']:
                artists[c] += 1
    # même artiste écrit avec des majuscules différentes (MeatOfJustice / MeatofJustice) : regroupé sous l'écriture la plus fréquente
    merged = collections.Counter()
    for key in {c.lower() for c in artists}:
        names = [c for c in artists if c.lower() == key]
        merged[max(names, key=lambda c: artists[c])] = sum(artists[c] for c in names)
    artists = merged
    lines = ['Crédits des map sprites (FE-Repo, Klokinator — sprites de la communauté Fire Emblem)',
             'Les noms entre accolades {…} dans les noms de fichiers. « IS » = Intelligent Systems (sprites d\'origine).', '',
             f'Artistes ({len(artists)}), par nombre de sprites :']
    for name, n in sorted(artists.items(), key=lambda x: (-x[1], x[0].lower())):
        lines.append(f'  {name} ({n})')
    lines += ['', 'Liste alphabétique :', '  ' + ', '.join(sorted(artists, key=str.lower)), '']
    for cat, label in CATEGORIES.items():
        lines += [f'== {label} ({len(by_cat[cat])} sprites) — tools/map-sprites/{cat}/']
        for e in sorted(by_cat[cat], key=lambda e: (e['folder'], e['label'].lower())):
            lines.append(f"  [{e['folder']}] {e['label']} : {', '.join(e['credits']) or 'non crédité'}")
        lines.append('')
    open(os.path.join(SRC, 'CREDITS.txt'), 'w', encoding='utf-8').write('\n'.join(lines))


if __name__ == '__main__':
    main()
