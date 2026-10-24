#!/usr/bin/env python3
"""
Animations de combat Fire Emblem (FE-Repo, dossier « Battle Animations ») pour les sprites de combat du générateur.

Sources : tools/battle-animations/<catégorie>/<animation>/<n. Arme>/  (images 248×160 « Arme_000.png »… et script
FEditor « Arme.txt »), et tools/battle-animations/attribution.json : { id du sprite de combat : { cat, folder, weapon } }.
Chaque sprite de combat du générateur (img/generator/parts.js › token) reçoit l'animation de même nom.

Script FEditor : sections « /// - Mode N » (1 attaque, 3 critique, 5 à distance, 6 à distance critique, 7 esquive,
9 garde), lignes « durée p- image.png » (durée en images à 60 i/s) et commandes C.. : C1A / C0C = coup porté,
C05 = sort ou projectile lancé.

Sortie :
  src/renderer/img/generator/battlers/<id>.png   planche (cases communes, 12 colonnes) au format du jeu
  src/renderer/img/generator/battlers/arrow.png  flèche (animations d'arc)
  src/renderer/img/generator/battlers.js         self.GENERATOR_BATTLERS = { list: [{ id, label, weapon, credits, meta }], tokens: { tokenId: id } }

  python3 tools/build_generator_battlers.py
"""
import hashlib, json, os, re, shutil, unicodedata
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('TE_BATTLE_SRC') or os.path.join(ROOT, 'tools', 'battle-animations')
ATT = os.path.join(ROOT, 'tools', 'battle-animations', 'attribution.json')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'generator')
COLS = 12
WEAPON_DIRS = {  # mots-clés des dossiers d'arme
    'sword': ['sword', 'blade'], 'lance': ['lance', 'spear', 'javelin'], 'axe': ['axe'], 'handaxe': ['handaxe', 'hand axe'],
    'bow': ['bow'], 'magic': ['magic', 'anima', 'light', 'dark', 'tome', 'spell'], 'staff': ['staff'], 'dance': ['dance', 'play', 'sing'],
    'unarmed': ['unarmed', 'fist'],
}
FALLBACK = ['sword', 'lance', 'axe', 'magic', 'bow', 'handaxe', 'unarmed', 'staff', 'dance']


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def weapon_dirs(anim_dir):
    out = []
    for d in sorted(os.listdir(anim_dir)):
        p = os.path.join(anim_dir, d)
        if os.path.isdir(p) and any(f.lower().endswith('.txt') and 'without_comment' not in f.lower() for f in os.listdir(p)):
            out.append(d)
    return out


def kind_of(dirname):
    n = re.sub(r'^\d+\.\s*', '', dirname).lower()
    if 'hand' in n and 'axe' in n: return 'handaxe'
    for k, words in WEAPON_DIRS.items():
        if k != 'handaxe' and any(re.search(r'\b' + w, n) for w in words):
            return k
    return None


def pick_weapon(anim_dir, want):
    """Dossiers d'arme à essayer dans l'ordre : l'arme voulue (sans variante « Alt » d'abord), puis les autres armes de combat."""
    dirs = weapon_dirs(anim_dir)
    if not dirs:
        return None
    by = {}
    for d in dirs:
        k = kind_of(d)
        if k:
            by.setdefault(k, []).append(d)
    out = []
    for k in [want] + FALLBACK:  # l'arme voulue (versions de base d'abord), puis les autres
        for d in sorted(by.get(k, []), key=lambda d: (bool(re.search(r'alt|\(|range|repal', d, re.I)), len(d))):
            out.append((d, k))
    return out or [(dirs[0], kind_of(dirs[0]) or want)]


def parse_script(path):
    """{ mode: [ (images, nom) ou ('hit',) ou ('cast',) ] }"""
    modes, cur = {}, None
    for line in open(path, encoding='utf-8', errors='ignore'):
        line = line.split('#')[0].strip()
        if not line:
            continue
        m = re.match(r'^///\s*-\s*Mode\s*(\d+)', line, re.I)
        if m:
            cur = modes.setdefault(int(m.group(1)), []); continue
        if line.startswith('~~~'):
            cur = None; continue
        if cur is None:
            continue
        m = re.match(r'^(\d+)\s+p-\s+(.+?\.png)$', line, re.I)
        if m:
            cur.append((int(m.group(1)), m.group(2).strip())); continue
        c = line.upper()
        if c in ('C1A', 'C0C', 'C1F', 'C51'):
            cur.append(('hit',))
        elif c == 'C05':
            cur.append(('cast',))
    return modes


def load_frame(path):
    im = Image.open(path)
    if im.mode == 'P':
        a = np.array(im)
        pal = np.array(im.getpalette()[:768] + [0] * (768 - len(im.getpalette()[:768]))).reshape(-1, 3)
        rgba = np.zeros(a.shape + (4,), np.uint8); rgba[..., :3] = pal[a]; rgba[..., 3] = np.where(a == 0, 0, 255)
    else:
        rgba = np.array(im.convert('RGBA'))
        bg = rgba[0, 0, :3].copy()
        rgba[..., 3] = np.where((rgba[..., :3] == bg).all(2) | (rgba[..., 3] == 0), 0, 255)
    rgba = rgba[:, :240].copy()  # bande de palette à droite (240..247)
    rgba[:8, 232:] = 0
    return rgba


def seq_of(steps):
    """Images, durées (ms), indice du coup (hit) et du lancer (cast) d'une section."""
    frames, durs, hit, cast = [], [], None, None
    pend_hit = pend_cast = False
    for s in steps:
        if s[0] == 'hit': pend_hit = True; continue
        if s[0] == 'cast': pend_cast = True; continue
        n, img = s
        if pend_hit and hit is None: hit = len(frames)
        if pend_cast and cast is None: cast = len(frames)
        pend_hit = pend_cast = False
        frames.append(img); durs.append(max(16, round(n * 1000 / 60)))
    return frames, durs, hit, cast


def convert(wdir, label, kind):
    txt = [f for f in os.listdir(wdir) if f.lower().endswith('.txt') and 'without_comment' not in f.lower()]
    modes = parse_script(os.path.join(wdir, txt[0]))
    files = {f.lower(): f for f in os.listdir(wdir)}
    sections = {}
    for mode, name in ((9, 'stance'), (1, 'attack'), (3, 'critical'), (5, 'ranged'), (6, 'rangedCritical'), (7, 'dodge')):
        if mode in modes:
            sq = seq_of(modes[mode])
            if sq[0]:  # section vide (un arc n'a pas d'attaque au corps à corps)
                sections[name] = sq
    if 'stance' not in sections:
        a = sections.get('attack')
        if not a or not a[0]:
            return None
        sections['stance'] = ([a[0][0]], [500], None, None)
    used = sorted({f for s in sections.values() for f in s[0]})
    imgs = {}
    for f in used:
        real = files.get(f.lower())
        if not real:
            return None
        imgs[f] = load_frame(os.path.join(wdir, real))
    occ = np.zeros((160, 240), bool)
    for a in imgs.values():
        occ |= a[..., 3] > 0
    ys, xs = np.nonzero(occ)
    if not len(ys):
        return None
    x0, y0, x1, y1 = max(0, xs.min() - 1), max(0, ys.min() - 1), min(240, xs.max() + 2), min(160, ys.max() + 2)
    cw, ch = int(x1 - x0), int(y1 - y0)
    st = imgs[sections['stance'][0][0]][..., 3] > 0
    sy, sx = np.nonzero(st)
    feet = sy.max()
    low = sx[sy >= feet - 2]
    ax, ay = int(round((low.min() + low.max() + 1) / 2 - x0)), int(feet + 1 - y0)
    tiles, index = [], {}
    for f in used:
        t = imgs[f][y0:y1, x0:x1]
        k = hashlib.sha1(t.tobytes()).hexdigest()
        if k not in index:
            index[k] = len(tiles); tiles.append(t)
        index[f] = index[k]
    rows = (len(tiles) + COLS - 1) // COLS
    sheet = np.zeros((rows * ch, COLS * cw, 4), np.uint8)
    for i, t in enumerate(tiles):
        sheet[(i // COLS) * ch:(i // COLS + 1) * ch, (i % COLS) * cw:(i % COLS + 1) * cw] = t
    anims = {}
    for name, (fr, du, hit, cast) in sections.items():
        if not fr:
            continue
        a = {'frames': [index[f] for f in fr], 'durations': du}
        if name == 'stance':
            a = {'frames': a['frames'][:1], 'durations': [500], 'loop': True}
        elif name != 'dodge':
            h = hit if hit is not None else cast
            a['hit'] = h if h is not None else len(fr) // 2
        anims[name] = a
    if kind == 'bow':  # l'arc tire une flèche au lancer (C05) ; tir au corps à corps (mode 1) ou à distance (mode 5)
        for srcs, dst in ((('attack', 'ranged'), 'bow'), (('critical', 'rangedCritical'), 'bowCritical')):
            src = next((k for k in srcs if k in sections), None)
            if src:
                fr, du, hit, cast = sections[src]
                rel = cast if cast is not None else (hit if hit is not None else len(fr) // 2)
                anims[dst] = {'frames': [index[f] for f in fr], 'durations': du, 'projectile': 'arrow', 'release': min(rel, len(fr) - 1)}
        for k in ('ranged', 'rangedCritical'):
            anims.pop(k, None)
    if 'attack' not in anims:  # pas d'attaque au corps à corps : celle à distance (ou le tir) en tient lieu
        alt = anims.get('bow') or anims.get('ranged')
        if alt:
            anims['attack'] = {'frames': alt['frames'], 'durations': alt['durations'], 'hit': alt.get('release', alt.get('hit', len(alt['frames']) // 2))}
    meta = {'type': 'battler', 'name': label, 'facing': 'left', 'cell': [cw, ch], 'anchor': [ax, ay], 'columns': COLS, 'count': len(tiles), 'anims': anims}
    if kind == 'bow':
        meta['projectiles'] = {'arrow': 'arrow.png'}
    return Image.fromarray(sheet, 'RGBA'), meta


def arrow():
    a = np.zeros((3, 16, 4), np.uint8)
    a[1, 2:14] = (200, 170, 110, 255); a[0, 12] = a[2, 12] = (230, 230, 240, 255); a[1, 14:16] = (240, 240, 250, 255)
    a[0, 1] = a[2, 1] = a[0, 3] = a[2, 3] = (240, 240, 240, 255)
    return Image.fromarray(a[:, ::-1].copy(), 'RGBA')  # pointe vers la gauche (comme l'animation)


def credits_of(anim_dir, folder):
    names = []
    m = re.search(r'\bby\s+(.+)$', folder)
    if m:
        names += [n.strip() for n in re.split(r',| and |&', m.group(1)) if n.strip()]
    c = os.path.join(anim_dir, 'CREDITS.txt')
    if os.path.exists(c):
        text = open(c, encoding='utf-8', errors='ignore').read()
        for n in re.findall(r'\bby\s+([A-Za-z0-9_\'\-\. ]+?)(?:[\.\n,]|$)', text):
            n = n.strip()
            if n and n not in names and len(n) < 30:
                names.append(n)
        if re.search(r'\bIS\b|Intelligent Systems', text) and 'IS' not in names:
            names.insert(0, 'IS')
    return names


def main():
    att = json.load(open(ATT, encoding='utf-8'))
    odir = os.path.join(OUT, 'battlers')
    shutil.rmtree(odir, ignore_errors=True); os.makedirs(odir)
    arrow().save(os.path.join(odir, 'arrow.png'))
    done, lst, tokens, missing = {}, [], {}, []
    for tok, a in sorted(att.items()):
        anim_dir = os.path.join(SRC, a['cat'], a['folder'])
        if not os.path.isdir(anim_dir):
            missing.append(a['folder']); continue
        cands = pick_weapon(anim_dir, a['weapon'])
        if not cands:
            missing.append(a['folder']); continue
        key = (a['cat'], a['folder'], a['weapon'])
        if key not in done:
            r = None
            for wdir, kind in cands:  # première arme dont le script et toutes les images sont là
                label = re.sub(r'\s*\bby\b.*$', '', a['folder']).strip() + ' — ' + re.sub(r'^\d+\.\s*', '', wdir)
                r = convert(os.path.join(anim_dir, wdir), label, kind)
                if r:
                    break
            if not r:
                missing.append(a['folder']); done[key] = None; continue
            img, meta = r
            bid = slug(a['folder'] + '-' + re.sub(r'^\d+\.\s*', '', wdir))[:80]
            if any(x['id'] == bid for x in lst):  # même arme retenue pour deux demandes
                done[key] = bid; tokens[tok] = bid; continue
            img.save(os.path.join(odir, bid + '.png'), optimize=True)
            meta['source'] = 'FE-Repo — ' + (', '.join(credits_of(anim_dir, a['folder'])) or 'communauté Fire Emblem')
            lst.append({'id': bid, 'label': label, 'weapon': kind, 'src': [a['cat'], a['folder'], wdir], 'meta': meta})
            done[key] = bid
        if done[key]:
            tokens[tok] = done[key]
    with open(os.path.join(OUT, 'battlers.js'), 'w', encoding='utf-8') as f:
        f.write('/* Généré par tools/build_generator_battlers.py — ne pas modifier à la main. */\nself.GENERATOR_BATTLERS = ')
        json.dump({'source': 'FE-Repo (Klokinator) — animations de combat de la communauté Fire Emblem', 'list': lst, 'tokens': tokens}, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print(f'{len(lst)} animations, {len(tokens)} sprites de combat animés' + (f' ; introuvables : {sorted(set(missing))}' if missing else ''))


if __name__ == '__main__':
    main()
