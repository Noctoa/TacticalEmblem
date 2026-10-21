#!/usr/bin/env python3
"""
Pack de ressources « Fire Emblem GBA » : découpe automatique des planches de tools/sprite-sources/fe-gba/
(rips The Spriters Resource de FE6 / FE7 / FE8 et customs « style FE GBA ») vers
assets/packs/fe-gba/ressources/personnages/<Perso ou classe>/ :

  combat_<variante>.png + .json   animation de combat (frames découpées, sections lues sur la planche)
  portrait.png                    face set 128×112 (planches « Mugshots ») ou buste découpé dans la garde
  map_<variante>.png + .json      sprite de map (planches « Map Sprites »)

Les sections des planches (« Melee Attack », « Critical », « Dodge »…) sont lues par OCR (tesseract) ;
ce qui n'est pas une animation (crédits, palettes, sprites de map, variantes ennemies) est ignoré.
Les réglages fins d'une planche se mettent dans OVERRIDES (même format que BATTLERS du script principal).

  python3 tools/build_fe_gba_pack.py [--only motclé] [--preview dossier]
"""
import json, os, re, sys, hashlib, shutil
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import pytesseract

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'sprite-sources', 'fe-gba')
OUT = os.path.join(ROOT, 'assets', 'packs', 'fe-gba')
PERSO = os.path.join(OUT, 'ressources', 'personnages')
ARROW = os.path.join(ROOT, 'assets', 'default', 'ressources', 'personnages', 'Lyn', 'combat_arrow.png')
ARG = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
PREVIEW = ARG('--preview')
ONLY = ARG('--only')

GAMES = {'The Binding Blade': 'FE6', 'The Blazing Blade': 'FE7', 'The Sacred Stones': 'FE8'}
FRANCHISE = {'Final Fantasy I': 'FF1', 'Final Fantasy VII': 'FF7', 'Kingdom Hearts': 'KH', 'The Legend of Zelda': 'Zelda'}


def safe(s):
    return re.sub(r'[^A-Za-z0-9]+', '', s.title()) if s else ''


def out_path(owner, prefix, variant, ext):
    d = os.path.join(PERSO, owner)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, prefix + ('_' + variant if variant else '') + ext)


# ----------------------------------------------------------------------
# Nom de fichier -> propriétaire / variante
# ----------------------------------------------------------------------
def parse_name(fname):
    base = os.path.splitext(fname)[0]
    parts = [p.strip() for p in base.split(' - ')]
    info = {'file': fname}
    if parts[0].startswith('Game Boy Advance'):
        title = parts[1].replace('Fire Emblem_ ', '').replace(' (JPN)', '')
        info['game'] = GAMES.get(title, title)
        info['category'] = parts[2]
        subject = ' - '.join(parts[3:])
    else:  # Custom _ Edited - <Franchise> Customs - <groupe> - <sujet>
        fr = parts[1].replace(' Customs', '')
        info['game'] = FRANCHISE.get(fr, safe(fr))
        info['category'] = 'Custom'
        subject = parts[-1]
    subject = re.sub(r'\((?:[^()]*,\s*)?Fire Emblem[^()]*\)', '', subject).strip()
    m = re.match(r'^(.*?)\s*\(([^()]*)\)\s*$', subject)
    name, paren = (m.group(1), m.group(2)) if m else (subject, '')
    info['subject'] = subject
    if info['category'] == 'Miscellaneous':
        info['kind'] = 'map' if 'Map Sprites' in subject else 'mugshots' if 'Mugshots' in subject else 'battlebacks' if 'Battle Backgrounds' in subject else 'other'
        return info
    info['kind'] = 'battler'
    if ' with ' in name:  # « Lyn with Durandal (Prototype) »
        name, extra = name.split(' with ', 1); paren = extra
    if info['category'] in ('Player Units',) or (info['category'] == 'Enemy Units' and not paren and name in ('Sonia',)):
        info['owner'] = name
        info['variant'] = safe(paren)
        info['character'] = True
    elif info['category'] == 'Custom':
        info['owner'] = name
        info['variant'] = info['game'] + (safe(paren) if paren else '')
        info['character'] = True
    else:  # classe générique (ou ennemi générique)
        info['owner'] = name
        info['variant'] = info['game'] + (safe(paren) if paren else '')
        info['character'] = False
    info['label'] = name + (f' ({paren})' if paren else '') + (f' — {info["game"]}' if not info.get('character') or info['category'] == 'Custom' else '')
    return info


# ----------------------------------------------------------------------
# Image, fond, composants
# ----------------------------------------------------------------------
def load(path):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
        a = np.array(im.convert('RGBA'))
    else:
        a = np.array(im.convert('RGB'))
        a = np.dstack([a, np.full(a.shape[:2], 255, np.uint8)])
    return a


def background(a):
    if (a[..., 3] == 0).mean() > 0.2:
        return None
    c = a[..., :3].reshape(-1, 3)
    v, n = np.unique(c, axis=0, return_counts=True)
    return tuple(int(x) for x in v[n.argmax()])


def mask_of(a, bg):
    if bg is None:
        return a[..., 3] > 0
    return (a[..., 3] > 0) & (np.abs(a[..., :3].astype(int) - np.array(bg)).sum(2) > 0)


def comps(m, dil=0):
    mm = ndi.binary_dilation(m, iterations=dil) if dil else m
    lab, n = ndi.label(mm, structure=np.ones((3, 3)))
    out = []
    for i, s in enumerate(ndi.find_objects(lab)):
        ys, xs = s
        inside = m[s] & (lab[s] == i + 1)
        out.append({'x0': xs.start, 'y0': ys.start, 'x1': xs.stop - 1, 'y1': ys.stop - 1, 'n': int(inside.sum()), 'id': i + 1})
    return out, lab


# ----------------------------------------------------------------------
# Texte : en-têtes de sections et crédits
# ----------------------------------------------------------------------
def text_lines(m):
    cs, lab = comps(m)
    cs = [c for c in cs if 3 <= c['y1'] - c['y0'] <= 13 and c['x1'] - c['x0'] <= 90 and c['n'] >= 3]
    cs.sort(key=lambda c: (c['y0'], c['x0']))
    lines = []
    for c in cs:
        cy = (c['y0'] + c['y1']) / 2
        for L in lines:
            if abs(L['cy'] - cy) <= 3 and c['x0'] - L['x1'] <= 14 and c['x0'] >= L['x0'] - 2:
                L['items'].append(c)
                L['x1'] = max(L['x1'], c['x1']); L['y0'] = min(L['y0'], c['y0']); L['y1'] = max(L['y1'], c['y1'])
                break
        else:
            lines.append({'cy': cy, 'x0': c['x0'], 'x1': c['x1'], 'y0': c['y0'], 'y1': c['y1'], 'items': [c]})
    lines = [L for L in lines if (len(L['items']) >= 3 or L['x1'] - L['x0'] >= 24) and L['x1'] - L['x0'] >= 18]
    return lines, lab


def ocr_line(a, m, lab, L):
    x0, y0 = max(0, L['x0'] - 2), max(0, L['y0'] - 2)
    x1, y1 = min(m.shape[1] - 1, L['x1'] + 2), min(m.shape[0] - 1, L['y1'] + 2)
    sub = np.zeros((y1 - y0 + 1, x1 - x0 + 1), bool)
    for c in L['items']:
        sl = lab[c['y0']:c['y1'] + 1, c['x0']:c['x1'] + 1] == c['id']
        sub[c['y0'] - y0:c['y1'] - y0 + 1, c['x0'] - x0:c['x1'] - x0 + 1] |= sl
    rgb = a[y0:y1 + 1, x0:x1 + 1, :3].astype(int)
    rgb = rgb[:sub.shape[0], :sub.shape[1]]
    bright = rgb.sum(2) > 300
    ink = sub & bright if (sub & bright).sum() > sub.sum() * 0.25 else sub
    img = Image.fromarray(np.where(ink, 0, 255).astype(np.uint8))
    img = img.resize((img.width * 5, img.height * 5), Image.NEAREST)
    pad = Image.new('L', (img.width + 40, img.height + 40), 255); pad.paste(img, (20, 20))
    return pytesseract.image_to_string(pad, config='--psm 7').strip()


def classify(text):
    t = text.lower().replace('|', 'l').replace('1', 'i')
    if not re.search(r'[a-z]{3}', t):
        return None
    has = lambda *ws: any(w in t for w in ws)
    if has('map', 'palet', 'altern', 'enem', 'ener', 'unarm', 'beta', 'unused', 'transform', 'promot'):
        return 'ignore'
    if has('credit', 'ripped', 'rippe', 'emblem', 'gba', 'please', 'permission', 'sprit', 'http', 'gmail', '.com', 'style', 'from',
           'version', 'by ', 'thank', 'use ', 'give', 'custom', 'edit', 'made'):
        return 'junk'
    far = has('distan', 'range', 'ranged', 'bow', 'long', 'throw', 'magic', 'spell', 'cast', 'tome', 'javelin', 'hand axe', 'arrow', 'staff', 'heal')
    if has('dodg', 'evad', 'avoid'):
        return 'dodge'
    if re.search(r'\bstan|idle|standing', t) and not far:
        return 'stance'
    if has('crit', 'special'):
        return 'rangedCritical' if far else 'critical'
    if far:
        return 'ranged'
    if has('attack', 'atack', 'attac', 'melee', 'normal', 'hit', 'strike', 'slash', 'sword', 'lance', 'axe'):
        return 'attack'
    return 'ignore'


# ----------------------------------------------------------------------
# Découpage d'une planche d'animation de combat
# ----------------------------------------------------------------------
def segment_band(m, y0, y1, x0, x1, gap=2):
    sub = m[y0:y1 + 1, x0:x1 + 1]
    occ = sub.any(0)
    segs, s, empty, last = [], None, 0, 0
    for x, v in enumerate(occ):
        if v:
            if s is None:
                s = x
            empty = 0; last = x
        elif s is not None:
            empty += 1
            if empty >= gap:
                segs.append((s, last)); s = None
    if s is not None:
        segs.append((s, last))
    out = []
    for sx, ex in segs:
        ys = np.where(sub[:, sx:ex + 1].any(1))[0]
        out.append([x0 + sx, y0 + int(ys.min()), x0 + ex, y0 + int(ys.max())])
    return out


def is_swatch(a, m, b):
    """Nuancier de palette : bloc fait de carrés unis (pixels dont les voisins ont la même couleur)."""
    x0, y0, x1, y1 = b['x0'], b['y0'], b['x1'], b['y1']
    if y1 - y0 > 60 or x1 - x0 > 160:
        return False
    c = a[y0:y1 + 1, x0:x1 + 1, :3].astype(int); mm = m[y0:y1 + 1, x0:x1 + 1]
    if mm.sum() < 20:
        return False
    same = np.ones(mm.shape, bool)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        sh = np.roll(np.roll(c, dy, 0), dx, 1)
        same &= (sh == c).all(2)
    return (same & mm).sum() / mm.sum() > 0.55


def feet_x(m, f):
    x0, y0, x1, y1 = f
    sub = m[y0:y1 + 1, x0:x1 + 1]
    ys, xs = np.where(sub)
    sel = ys >= ys.max() - 5
    return x0 + float(xs[sel].mean())


def analyze(path, info, clear=()):
    a = load(path); bg = background(a); m = mask_of(a, bg)
    for c in clear:  # fonds de cases à rendre transparents
        m &= ~(a[..., :3] == np.array(c)).all(2)
    m0 = m.copy()  # masque avant effacement du texte (zones choisies à la main)
    lines, lab = text_lines(m)
    headers = []
    for L in lines:
        t = ocr_line(a, m, lab, L)
        kind = classify(t)
        if kind is None:
            continue
        for c in L['items']:  # le texte sort du masque
            sl = lab[c['y0']:c['y1'] + 1, c['x0']:c['x1'] + 1] == c['id']
            m[c['y0']:c['y1'] + 1, c['x0']:c['x1'] + 1] &= ~sl
        headers.append({'text': t, 'kind': kind, 'x0': L['x0'], 'y0': L['y0'], 'x1': L['x1'], 'y1': L['y1']})
    blobs, _ = comps(m, dil=1)
    big = [b for b in blobs if b['y1'] - b['y0'] >= 14 and b['n'] >= 60 and not is_swatch(a, m, b)]
    # rangées : chevauchement vertical, coupées quand l'écart horizontal est grand (plusieurs colonnes)
    bl = sorted(big, key=lambda b: (b['y0'], b['x0']))
    rows = []
    for b in bl:
        for r in rows:
            ov = min(r['y1'], b['y1']) - max(r['y0'], b['y0'])
            gapx = max(b['x0'] - r['x1'], r['x0'] - b['x1'])
            if ov > 0.45 * min(r['y1'] - r['y0'], b['y1'] - b['y0']) and gapx < 70:
                r['y0'] = min(r['y0'], b['y0']); r['y1'] = max(r['y1'], b['y1'])
                r['x0'] = min(r['x0'], b['x0']); r['x1'] = max(r['x1'], b['x1']); r['blobs'].append(b); break
        else:
            rows.append({'y0': b['y0'], 'y1': b['y1'], 'x0': b['x0'], 'x1': b['x1'], 'blobs': [b]})
    rows.sort(key=lambda r: (r['y0'] // 8, r['x0']))
    for r in rows:
        for b in blobs:  # petits morceaux (effets, armes) dans la rangée
            if b in r['blobs'] or b['n'] < 4 or b in big:
                continue
            if b['y0'] >= r['y0'] - 2 and b['y1'] <= r['y1'] + 2 and b['x0'] >= r['x0'] - 10 and b['x1'] <= r['x1'] + 10:
                r['x0'] = min(r['x0'], b['x0']); r['x1'] = max(r['x1'], b['x1'])
        r['frames'] = [f for f in segment_band(m, r['y0'], r['y1'], r['x0'], r['x1'], 3) if (f[3] - f[1]) >= 12 and (f[2] - f[0]) >= 6]
        bottoms = [f[3] for f in r['frames']]
        r['ground'] = max(set(bottoms), key=bottoms.count) if bottoms else r['y1']

    def header_of(r):
        cands = [h for h in headers if h['kind'] != 'junk' and h['y0'] < r['y0'] + 4 and h['x0'] <= r['x0'] + 40]
        if not cands:
            return None
        top = max(h['y1'] for h in cands)
        near = [h for h in cands if h['y1'] >= top - 14]
        return max(near, key=lambda h: (h['x0'], h['y1']))
    for r in rows:
        h = header_of(r)
        r['header'] = h
        real = any(x['kind'] not in ('junk', 'ignore') for x in headers)
        r['kind'] = h['kind'] if h else ('ignore' if real else 'attack')
    return a, bg, m, rows, headers, m0


# ----------------------------------------------------------------------
# Construction de la planche + .json
# ----------------------------------------------------------------------
def ground_of(fr):
    bottoms = [f['bbox'][3] for f in fr]
    return max(set(bottoms), key=bottoms.count) if bottoms else 0


def build_battler(info, overrides):
    path = os.path.join(SRC, info['file'])
    ov = overrides.get(info['owner'] + '/' + info['variant'], {})
    a, bg, m, rows, headers, m0 = analyze(path, info, ov.get('clear', ()))
    if PREVIEW:
        overlay(info, a, rows, headers)
    # sections : rangées consécutives sous le même en-tête (ou choix à la main : numéros de rangées)
    anims_src = {}
    def from_boxes(spec_map):
        for k, spec in spec_map.items():
            fr = []
            for box in spec:
                x0, y0, x1, y1 = box[:4]
                got = [f for f in segment_band(m0, y0, min(y1, m.shape[0] - 1), x0, min(x1, m.shape[1] - 1), 3) if (f[3] - f[1]) >= 12 and (f[2] - f[0]) >= 6]
                if len(box) > 4:
                    got = [got[q] for q in box[4] if q < len(got)]
                bottoms = [f[3] for f in got]
                g = max(set(bottoms), key=bottoms.count) if bottoms else y1
                fr += [{'bbox': f, 'ground': g} for f in got]
            anims_src[k] = {'frames': fr}
    if 'rows' in ov or 'boxes' in ov:
        for k, spec in ov.get('rows', {}).items():
            fr = []
            for item in spec:
                ri, sel = (item, None) if isinstance(item, int) else (item[0], item[1:])
                if ri >= len(rows):
                    print('  ⚠', info['owner'], k, 'rangée', ri, 'absente'); continue
                r = rows[ri]
                picked = r['frames'] if sel is None else [r['frames'][q] for q in (range(sel[0], sel[1] + 1) if len(sel) == 2 else sel) if q < len(r['frames'])]
                fr += [{'bbox': f, 'ground': r['ground']} for f in picked]
            anims_src[k] = {'frames': fr}
    else:
        order = []
        for r in rows:
            if r['kind'] == 'ignore' or not r['frames']:
                continue
            key = id(r['header']) if r['header'] else None
            if order and order[-1][0] == key:
                order[-1][2].append(r)
            else:
                order.append((key, r['kind'], [r]))
        for key, k, rs in order:
            if k in anims_src:
                if k == 'stance':
                    continue
                k2 = {'attack': 'critical', 'ranged': 'rangedCritical'}.get(k)
                if not k2 or k2 in anims_src:
                    continue
                k = k2
            anims_src[k] = {'frames': [{'bbox': f, 'ground': r['ground']} for r in rs for f in r['frames']]}
    from_boxes(ov.get('boxes', {}))
    from_boxes(ov.get('boxes_extra', {}))
    # frames aberrantes (plusieurs sprites collés, grands effets seuls) : plus de 2,6× la largeur médiane
    for k, v in anims_src.items():
        ws = sorted(f['bbox'][2] - f['bbox'][0] for f in v['frames'])
        if len(ws) >= 3:
            med = ws[len(ws) // 2]
            v['frames'] = [f for f in v['frames'] if f['bbox'][2] - f['bbox'][0] <= max(2.6 * med, med + 40)]
        v['frames'] = [f for f in v['frames'] if f['bbox'][2] - f['bbox'][0] <= 220]
    anims_src = {k: v for k, v in anims_src.items() if v['frames']}
    if not anims_src:
        print('  ✗', info['file'], ': aucune animation trouvée'); return None
    if 'boxes' in ov or 'boxes_extra' in ov:
        m = m | m0  # les pixels des zones choisies à la main restent visibles
    rgba = a.copy(); rgba[..., 3] = np.where(m, 255, 0)
    frames, seqs = [], {}
    for k, s in anims_src.items():
        idx = []
        for f in s['frames']:
            fb = f['bbox']
            gy = max(f['ground'], fb[3]) if fb[3] - f['ground'] <= 3 else fb[3]
            frames.append({'bbox': fb, 'ax': feet_x(m, fb), 'ground': gy})
            idx.append(len(frames) - 1)
        seqs[k] = idx
    if 'stance' not in seqs:
        first = seqs.get('attack') or seqs.get('ranged') or next(iter(seqs.values()))
        seqs['stance'] = [first[0]]
    if 'attack' not in seqs:
        seqs['attack'] = seqs.get('ranged') or seqs.get('critical') or seqs['stance']
    # cellule commune
    L = R = U = D = 0
    for f in frames:
        x0, y0, x1, y1 = f['bbox']
        L = max(L, f['ax'] - x0); R = max(R, x1 + 1 - f['ax'])
        U = max(U, f['ground'] - y0 + 1); D = max(D, y1 - f['ground'])
    L, R, U, D = int(np.ceil(L)) + 1, int(np.ceil(R)) + 1, int(U) + 1, int(D) + 1
    cw, ch = L + R, U + D
    tiles, keymap, remap = [], {}, {}
    for i, f in enumerate(frames):
        x0, y0, x1, y1 = f['bbox']
        crop = rgba[y0:y1 + 1, x0:x1 + 1]
        tile = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        px = int(round(L - (f['ax'] - x0))); py = U - (f['ground'] - y0 + 1)
        tile.paste(Image.fromarray(crop, 'RGBA'), (px, py))
        k = hashlib.sha1(tile.tobytes()).hexdigest()
        if k not in keymap:
            keymap[k] = len(tiles); tiles.append(tile)
        remap[i] = keymap[k]
    cols = 12
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * cw, (i // cols) * ch))
    owner, variant = info['owner'], info['variant']
    sheet.save(out_path(owner, 'combat', variant, '.png'), optimize=True)
    # sens : l'arme dépasse du côté de l'adversaire sur la frame la plus large de l'attaque
    att = [frames[i] for i in seqs['attack']]
    wide = max(att, key=lambda f: f['bbox'][2] - f['bbox'][0])
    left_reach = wide['ax'] - wide['bbox'][0]; right_reach = wide['bbox'][2] - wide['ax']
    facing = ov.get('facing') or 'left'  # les animations GBA regardent toutes vers la gauche
    words = (info['subject'] + ' ' + ' '.join(h['text'] for h in headers)).lower()
    bow = any(w in info['subject'].lower() for w in ('archer', 'sniper', 'nomad', 'ranger', 'igrene', 'rebecca', 'wil')) or 'with bow' in words
    magic = any(w in words for w in ('mage', 'sage', 'shaman', 'druid', 'monk', 'bishop', 'cleric', 'troubadour', 'priest', 'magic', 'seal', 'necromancer', 'summoner'))
    anims = {}
    for k, idx in seqs.items():
        seq = [remap[i] for i in idx]
        n = len(seq)
        d = {'frames': seq, 'durations': [500] * n if k == 'stance' else [260, 120][:n] + [120] * max(0, n - 2) if k == 'dodge' else [60] * n}
        if k == 'stance':
            d['loop'] = True
        if k in ('attack', 'critical', 'ranged', 'rangedCritical'):
            lo, hi = int(n * 0.3), max(int(n * 0.85), int(n * 0.3) + 1)
            cand = list(range(lo, min(hi, n))) or [n // 2]
            widths = [frames[idx[i]]['bbox'][2] - frames[idx[i]]['bbox'][0] for i in cand]
            hit = cand[int(np.argmax(widths))]
            far = k.startswith('ranged') or magic or (bow and 'ranged' not in seqs)
            if far:
                d['release' if 'projectile' in d or bow or magic else 'hit'] = hit
                if bow and (k.startswith('ranged') or 'ranged' not in seqs):
                    d['projectile'] = 'arrow'
                elif magic:
                    d['projectile'] = 'wave'
            else:
                d['hit'] = hit
                if hit >= 2:
                    d['approach'] = [max(0, hit - 3), hit - 1]
                if n - hit > 4:
                    d['retreat'] = [n - 4, n - 2]
            if k in ('critical', 'rangedCritical'):
                for j in range(0, min(n, hit)):
                    d['durations'][j] = 75
        anims[k] = d
    if bow:  # les archers tirent aussi au corps à corps avec l'arc : « bow » = attaque
        anims['bow'] = dict(anims.get('ranged') or anims['attack'])
        if 'critical' in anims or 'rangedCritical' in anims:
            anims['bowCritical'] = dict(anims.get('rangedCritical') or anims['critical'])
    for k, v in ov.get('anims', {}).items():
        anims.setdefault(k, {}).update(v)
    src = 'Fire Emblem GBA — battle sprites (The Spriters Resource)' if info['category'] != 'Custom' else f'Custom « style FE GBA » ({info["game"]}) — crédits sur la planche d\'origine'
    meta = {'type': 'battler', 'name': info['label'], 'facing': facing, 'cell': [cw, ch], 'anchor': [L, U],
            'columns': cols, 'count': len(tiles), 'anims': anims, 'source': src}
    if bow:
        shutil.copyfile(ARROW, out_path(owner, 'combat', (variant + '_' if variant else '') + 'arrow', '.png'))
        meta['projectiles'] = {'arrow': os.path.basename(out_path(owner, 'combat', (variant + '_' if variant else '') + 'arrow', '.png'))}
    json.dump(meta, open(out_path(owner, 'combat', variant, '.json'), 'w'), indent=1, ensure_ascii=False)
    # buste de secours (remplacé par un vrai face set s'il y en a un)
    st = tiles[remap[seqs['stance'][0]]]
    al = np.array(st)[..., 3] > 0
    ys, xs = np.where(al)
    top = ys.min(); head = xs[ys <= top + 9]; cx = int(round(head.mean())); size = 26
    face = st.crop((cx - size // 2, top - 3, cx + size // 2, top - 3 + size))
    if facing == 'left':
        face = face.transpose(Image.FLIP_LEFT_RIGHT)
    bust = out_path(owner, 'buste', variant, '.png')
    face.save(bust)
    print(f'  {owner}/{variant or "-"} : ' + ', '.join(f'{k} {len(v["frames"])}' for k, v in anims.items()) + f' · cellule {cw}x{ch} · {facing}'
          + ('' if headers else ' · (sans en-têtes)'))
    if PREVIEW:
        preview(info, meta, sheet)
    return meta


def overlay(info, a, rows, headers):
    """Planche d'origine annotée : numéro de chaque rangée, type deviné, en-têtes lus."""
    os.makedirs(PREVIEW, exist_ok=True)
    im = Image.fromarray(a[..., :3].copy())
    dr = ImageDraw.Draw(im)
    for h in headers:
        dr.rectangle([h['x0'], h['y0'], h['x1'], h['y1']], outline=(255, 0, 255))
    for i, r in enumerate(rows):
        dr.rectangle([r['x0'] - 1, r['y0'] - 1, r['x1'] + 1, r['y1'] + 1], outline=(255, 255, 0) if r['kind'] != 'ignore' else (255, 0, 0))
        for f in r['frames']:
            dr.rectangle(f, outline=(0, 255, 255))
        lab = f'{i}:{r["kind"][:4]}:{len(r["frames"])}'
        dr.rectangle([r['x0'], r['y0'], r['x0'] + 6 * len(lab), r['y0'] + 10], fill=(0, 0, 0))
        dr.text((r['x0'] + 1, r['y0']), lab, fill=(255, 255, 0))
    im.save(os.path.join(PREVIEW, f'ov_{info["owner"]}_{info["variant"] or "x"}.png'))


def preview(info, meta, sheet):
    os.makedirs(PREVIEW, exist_ok=True)
    cw, ch = meta['cell']; cols = meta['columns']
    names = list(meta['anims'].keys())
    maxn = max(len(v['frames']) for v in meta['anims'].values())
    S = 2
    W = min(maxn, 16) * cw * S + 120
    rowsper = {k: (len(v['frames']) + 15) // 16 for k, v in meta['anims'].items()}
    H = sum(rowsper.values()) * (ch * S + 4) + 20
    o = Image.new('RGB', (W, H), (40, 44, 52)); dr = ImageDraw.Draw(o)
    y = 4
    for k in names:
        A = meta['anims'][k]
        dr.text((4, y + 4), k, fill=(255, 230, 120))
        for j, fi in enumerate(A['frames']):
            t = sheet.crop(((fi % cols) * cw, (fi // cols) * ch, (fi % cols + 1) * cw, (fi // cols + 1) * ch)).resize((cw * S, ch * S), Image.NEAREST)
            x = 120 + (j % 16) * cw * S; yy = y + (j // 16) * (ch * S + 4)
            o.paste(t, (x, yy), t)
            mark = (255, 80, 80) if j == A.get('hit', A.get('release', -1)) else (90, 96, 110)
            dr.rectangle([x, yy, x + cw * S - 1, yy + ch * S - 1], outline=mark)
        y += rowsper[k] * (ch * S + 4)
    o.save(os.path.join(PREVIEW, f'{info["owner"]}_{info["variant"] or "x"}.png'))


from fe_gba_overrides import OVERRIDES, MAP_NAMES, MUG_NAMES, NO_FACE, BATTLEBACK_NAMES, TERRAIN_BATTLEBACKS  # noqa: E402  (réglages planche par planche)
import cv2  # noqa: E402


# ----------------------------------------------------------------------
# Portraits (planches « Mugshots » : face sets 128×112 en grille)
# ----------------------------------------------------------------------
def mug_cells(info):
    a = np.array(Image.open(os.path.join(SRC, info['file'])).convert('RGB'))
    bg = a[0, 127].astype(int)
    cells = []
    for r in range(a.shape[0] // 112):
        for c in range(a.shape[1] // 128):
            cell = a[r * 112:(r + 1) * 112, c * 128:(c + 1) * 128]
            if (np.abs(cell.astype(int) - bg).sum(2) > 0).mean() < 0.05:
                continue
            cells.append({'index': len(cells) + 1, 'cell': cell, 'bg': bg})
    return cells


def save_mugshots(info, cells):
    folder = 'Portraits ' + info['game']
    for c in cells:
        rgba = np.dstack([c['cell'], np.full(c['cell'].shape[:2], 255, np.uint8)])
        Image.fromarray(rgba, 'RGBA').convert('RGB').save(out_path(folder, 'portrait', f'{c["index"]:03d}', '.png'))
    return folder


def face_regions(m):
    """Grands portraits dessinés sur une planche de personnage (zones d'au moins 80×64)."""
    bl, _ = comps(m, dil=1)
    return [b for b in bl if b['x1'] - b['x0'] >= 80 and b['y1'] - b['y0'] >= 64]


def match_face(sheet_rgb, regions, cells):
    """Numéro du face set dont le visage apparaît sur la planche (ou None)."""
    best = None
    for b in regions:
        crop = sheet_rgb[max(0, b['y0'] - 4):b['y1'] + 5, max(0, b['x0'] - 4):b['x1'] + 5]
        for c in cells:
            t = c['cell'][20:70, 20:76]
            if crop.shape[0] < t.shape[0] or crop.shape[1] < t.shape[1]:
                continue
            v = cv2.matchTemplate(crop, t, cv2.TM_SQDIFF).min() / t.size
            if best is None or v < best[0]:
                best = (v, c['index'])
    return best[1] if best and best[0] < 4000 else None


# ----------------------------------------------------------------------
# Sprites de map (planches « Map Sprites » : une section par classe, bloc gauche = classe, bloc droit = promotion)
# ----------------------------------------------------------------------
MAP_LAYOUT = [('idle', 0, [1, 2, 3]), ('left', 1, [0, 1, 2, 3]), ('right', 1, [0, 1, 2, 3]),
              ('down', 2, [0, 1, 2, 3]), ('up', 3, [0, 1, 2, 3]), ('focus', 4, [1, 2, 3])]
CELL_BG = (128, 160, 128)


CLASS_WORDS = ['Lord', 'Master Lord', 'Knight Lord', 'Great Lord', 'Blade Lord', 'Mercenary', 'Beta Mercenary', 'Hero', 'Myrmidon', 'Swordmaster',
               'Fighter', 'Warrior', 'Knight', 'General', 'Great Knight', 'Archer', 'Sniper', 'Ranger', 'Priest', 'Cleric', 'Bishop', 'Monk',
               'Mage', 'Sage', 'Mage Knight', 'Shaman', 'Druid', 'Summoner', 'Necromancer', 'Cavalier', 'Paladin', 'Troubadour', 'Valkyrie',
               'Nomad', 'Nomad Trooper', 'Nomadic Trooper', 'Pegasus Knight', 'Falcon Knight', 'Wyvern Rider', 'Wyvern Knight', 'Wyvern Lord',
               'Soldier', 'Brigand', 'Pirate', 'Corsair', 'Berserker', 'Thief', 'Assassin', 'Rogue', 'Bard', 'Dancer', 'Manakete', 'King',
               'Transporter', 'Boy', 'Civilian', 'Girl', 'Woman', 'Man', 'Old Man', 'Journeyman', 'Recruit', 'Pupil', 'Ballista', 'Iron Ballista',
               'Killer Ballista', 'Archsage', 'Dark Druid', 'Magic Seal', 'Light Mage', 'Revenant', 'Entombed', 'Bonewalker', 'Wight', 'Bael',
               'Elder Bael', 'Mogall', 'Arch Mogall', 'Gorgon', 'Tarvos', 'Maelduin', 'Mauthe Doog', 'Gwyllgi', 'Hellboar', 'Cyclops', 'Gargoyle',
               'Deathgoyle', 'Draco Zombie', 'Demon King', 'Fire Dragon', 'Prince', 'Princess', 'Queen', 'Lady', 'Peer', 'Tent', 'Phantom',
               'Eirika Lord', 'Ephraim Lord', 'Divine Dragon', 'Ice Dragon', 'Merlinus', 'Wagon']
PAREN_WORDS = ['Male', 'Female', 'Roy', 'Eliwood', 'Hector', 'Lyn', 'Eirika', 'Ephraim', 'Unused', 'Enemy', 'NPC', 'Ally', 'Unpromoted', 'Promoted', 'Mounted', 'Dismounted']


def clean_label(label):
    """Corrige la lecture OCR d'un libellé (« Hyrmi on (Fema e » -> « Myrmidon (Female) »)."""
    import difflib
    label = MAP_NAMES.get(label, label)
    t = label.replace('{', '(').replace('}', ')').replace('1', 'i').strip()
    m = re.match(r'^([^()]*)(?:\(([^()]*)\)?)?', t)
    name, paren = (m.group(1) or '').strip(), (m.group(2) or '').strip()
    norm = lambda w: re.sub(r'[^a-z]', '', w.lower())
    best = difflib.get_close_matches(norm(name), [norm(c) for c in CLASS_WORDS], n=1, cutoff=0.55)
    if best:
        name = next(c for c in CLASS_WORDS if norm(c) == best[0])
    if paren:
        pb = difflib.get_close_matches(norm(paren), [norm(c) for c in PAREN_WORDS], n=1, cutoff=0.5)
        if pb:
            paren = next(c for c in PAREN_WORDS if norm(c) == pb[0])
    return name + (f' ({paren})' if paren else '')


def label_owner(label, game):
    """« Lord (Roy) » -> (Roy, Lord) ; « Mercenary (Male) » -> (Mercenary, FE6Male) ; « Fighter » -> (Fighter, FE6)."""
    label = MAP_NAMES.get(label, label)
    m = re.match(r'^(.*?)\s*\(([^()]*)\)\s*$', label)
    name, paren = (m.group(1).strip(), m.group(2).strip()) if m else (label.strip(), '')
    if paren and paren.lower() not in ('male', 'female', 'unused', 'unpromoted', 'promoted', 'mounted', 'dismounted', 'f', 'm') and not paren.lower().startswith(('beta', 'npc', 'enemy', 'ally')):
        return paren, safe(name)  # personnage : dossier à son nom
    return name, game + safe(paren)


def build_map_sheet(info):
    a = load(os.path.join(SRC, info['file']))
    rgb = a[..., :3].astype(int)
    sheet_bg = background(a)
    inside = (np.abs(rgb - np.array(sheet_bg)).sum(2) > 0)
    # séparateurs des cases : fond de planche (s'il diffère du fond des cases), traits noirs, bordures
    seps = [c for c in (sheet_bg, (0, 0, 0), (0, 128, 64)) if tuple(c) != CELL_BG]
    cellmask = np.ones(rgb.shape[:2], bool)
    for c in seps:
        cellmask &= ~(rgb == np.array(c)).all(2)
    lab, n = ndi.label(cellmask)
    cells = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        ys, xs = sl
        w, h = xs.stop - xs.start, ys.stop - ys.start
        if 28 <= w <= 34 and 28 <= h <= 34 and (rgb[ys, xs] == np.array(CELL_BG)).all(2).mean() > 0.3:
            cells.append((xs.start, ys.start, w, h))
    if not cells:
        print('  ✗', info['file'], ': pas de cases'); return []
    cw = min(32, int(np.median([c[2] for c in cells]))); chh = min(32, int(np.median([c[3] for c in cells])))
    pitch = cw + 1
    # rangées de la grille (au moins 3 cases alignées), par groupes de 4 : rangée du haut + 3 rangées
    from collections import Counter
    cnt = Counter(c[1] for c in cells)
    rowy = sorted(y for y, k in cnt.items() if k >= 3)
    groups, cur = [], [rowy[0]]
    for y in rowy[1:]:
        if y - cur[-1] <= pitch + 3:
            cur.append(y)
        else:
            groups.append(cur); cur = [y]
    groups.append(cur)
    sections = []
    for g in groups:
        for i in range(0, len(g) - 3, 4):
            sections.append(g[i:i + 4])
    inside = ~(rgb == np.array(CELL_BG)).all(2) & ~(rgb == np.array((0, 128, 64))).all(2) & ~(rgb == np.array(sheet_bg)).all(2)  # texte (noir)
    raw, lab2 = text_lines(inside)
    lines = []
    for L in sorted(raw, key=lambda L: (L['y0'], L['x0'])):  # mots d'une même ligne réunis
        for M in lines:
            if abs(M['cy'] - L['cy']) <= 5 and L['x0'] - M['x1'] <= 20:
                M['items'] += L['items']; M['x0'] = min(M['x0'], L['x0']); M['x1'] = max(M['x1'], L['x1']); M['y0'] = min(M['y0'], L['y0']); M['y1'] = max(M['y1'], L['y1']); break
        else:
            lines.append(dict(L, items=list(L['items'])))
    made = []
    for sec in sections:
        cs = [c for c in cells if sec[1] - 3 <= c[1] <= sec[-1] + 3]
        xs = sorted(set(c[0] for c in cs))
        cols = []
        for x in xs:
            if not cols or x - cols[-1][-1] > 3:
                cols.append([x])
            else:
                cols[-1].append(x)
        cols = [int(np.median(c)) for c in cols]
        blocks, cb = [], [cols[0]]
        for x in cols[1:]:
            if x - cb[-1] <= pitch + 3:
                cb.append(x)
            else:
                blocks.append(cb); cb = [x]
        blocks.append(cb)
        blocks = [part for b in blocks for part in ([b[:5], b[5:]] if len(b) >= 10 else [b])]  # blocs collés (FE8)
        blocks = [b for b in blocks if len(b) >= 5]
        labels = []
        for L in lines:
            if L['x1'] < cols[0] and sec[0] - 4 <= L['y0'] <= sec[-1] + pitch:
                t = re.sub(r'\s+', ' ', ocr_line(a, inside, lab2, L)).strip()
                if re.search(r'[A-Za-z]{3}', t):
                    labels.append((L['y0'], clean_label(t)))
        labels = [t for _, t in sorted(labels)]
        if not labels:  # libellés sous chaque bloc (planche FE8)
            below = []
            for L in lines:
                if sec[-1] + chh - 2 <= L['y0'] <= sec[-1] + chh + 16:
                    for bi, b in enumerate(blocks[:2]):
                        if b[0] - 12 <= L['x0'] <= b[-1]:
                            t = re.sub(r'\s+', ' ', ocr_line(a, inside, lab2, L)).strip()
                            if re.search(r'[A-Za-z]{3}', t):
                                below.append((bi, L['x0'], clean_label(t)))
            labels = [t for _, _, t in sorted(below)]
        for bi, block in enumerate(blocks[:2]):
            if bi >= len(labels):
                break
            owner, variant = label_owner(labels[bi], info['game'])
            if not owner.strip():
                continue
            while any(o == owner and v == variant for o, v, _ in made):  # même libellé deux fois (variante)
                variant += 'B'
            W, H = 4 * 32, len(MAP_LAYOUT) * 32
            out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            for ri, (anim, col, rws) in enumerate(MAP_LAYOUT):
                for fi, r in enumerate(rws):
                    x0, y0 = block[col], sec[r]
                    cell = a[y0:y0 + chh, x0:x0 + cw].copy()
                    keep = ~(cell[..., :3] == np.array(CELL_BG)).all(2) & ~(np.abs(cell[..., :3].astype(int) - np.array(sheet_bg)).sum(2) == 0)
                    cell[..., 3] = np.where(keep, 255, 0)
                    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); im.paste(Image.fromarray(cell, 'RGBA'), (0, 0))
                    if anim == 'right':
                        im = im.transpose(Image.FLIP_LEFT_RIGHT)
                    out.paste(im, (fi * 32, ri * 32))
            out.save(out_path(owner, 'map', variant, '.png'))
            meta = {'type': 'mapsprite', 'name': labels[bi] + ' — ' + info['game'], 'frame': [32, 32], 'anchor': [16, 23], 'base': 16,
                    'anims': {'idle': {'row': 0, 'frames': [0, 1, 2, 1], 'durations': [500, 80, 500, 80]},
                              'left': {'row': 1, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'right': {'row': 2, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'down': {'row': 3, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'up': {'row': 4, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'focus': {'row': 5, 'frames': [0, 1, 2, 1], 'durations': [160, 100, 160, 100]}},
                    'source': f'Fire Emblem {info["game"][2:]} — map sprites (The Spriters Resource)'}
            json.dump(meta, open(out_path(owner, 'map', variant, '.json'), 'w'), indent=1, ensure_ascii=False)
            made.append((owner, variant, labels[bi]))
    print(f'  {info["game"]} : {len(made)} sprites de map')
    return made


def main():
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(('.png', '.gif')))
    if ONLY:
        files = [f for f in files if ONLY.lower() in f.lower()]
    infos = [parse_name(f) for f in files]
    print('Portraits')
    mugs = {}
    for info in infos:
        if info['kind'] == 'mugshots':
            cells = mug_cells(info)
            mugs[info['game']] = (cells, save_mugshots(info, cells))
            print(f'  {info["game"]} : {len(cells)} face sets')
    faces = {}  # propriétaire -> (jeu, numéro)
    print('Animations de combat')
    report = []
    for info in infos:
        if info['kind'] != 'battler':
            continue
        try:
            meta = build_battler(info, OVERRIDES)
            report.append((info['owner'], info['variant'], bool(meta)))
            g = info['game']
            if meta and info.get('character') and g in mugs and info['owner'] not in faces and info['owner'] not in NO_FACE:
                a = load(os.path.join(SRC, info['file']))
                m = mask_of(a, background(a))
                idx = MUG_NAMES.get((g, info['owner'])) or match_face(np.ascontiguousarray(a[..., :3]), face_regions(m), mugs[g][0])
                if idx:
                    faces[info['owner']] = (g, idx)
        except Exception as e:  # une planche illisible ne bloque pas les autres
            print('  ✗', info['file'], ':', e)
            report.append((info['owner'], info['variant'], False))
    for (g, who), idx in MUG_NAMES.items():  # portraits nommés à la main (personnages sans planche de combat)
        if g in mugs and who not in faces:
            faces[who] = (g, idx)
    for who, (g, idx) in faces.items():
        src = out_path(mugs[g][1], 'portrait', f'{idx:03d}', '.png')
        shutil.copyfile(src, out_path(who, 'portrait', '', '.png'))
    print(f'  portraits reliés : {len(faces)} ({", ".join(sorted(faces))})')
    # buste découpé seulement pour ceux qui n'ont pas de face set
    for d in os.listdir(PERSO):
        busts = sorted(f for f in os.listdir(os.path.join(PERSO, d)) if f.startswith('buste'))
        has = os.path.exists(os.path.join(PERSO, d, 'portrait.png'))
        for i, f in enumerate(busts):
            if not has and i == 0:
                os.replace(os.path.join(PERSO, d, f), os.path.join(PERSO, d, 'portrait.png'))
            else:
                os.remove(os.path.join(PERSO, d, f))
    print('Fonds de combat')
    for info in infos:
        if info['kind'] == 'battlebacks':
            build_battlebacks(info)
    print('Sprites de map')
    maps = []
    for info in infos:
        if info['kind'] == 'map':
            maps += build_map_sheet(info)
    json.dump([{'owner': o, 'variant': v, 'label': l} for o, v, l in maps], open(os.path.join(OUT, 'maps.json'), 'w'), indent=1, ensure_ascii=False)
    write_art_index()


PROMOTED = ('great', 'master', 'knightlord', 'swordmaster', 'druid', 'trooper', 'bishop', 'sniper', 'paladin', 'general', 'hero', 'warrior',
            'sage', 'valkyrie', 'falcon', 'wyvernlord', 'berserker', 'assassin', 'ranger')
GAME_ORDER = ['FE7', 'FE8', 'FE6']
FEMALE_CLASSES = ('cleric', 'pegasus', 'fe_troubadour', 'fe_valkyrie', 'fe_dancer', 'fe_falcon')


BB_DIR = os.path.join(OUT, 'ressources', 'fonds-combat')


def build_battlebacks(info):
    """Planche « Battle Backgrounds » : cases 240×160 séparées par des lignes ; on garde le décor (sans la bande noire du bas)."""
    a = np.array(Image.open(os.path.join(SRC, info['file'])).convert('RGB')).astype(int)
    line = a[0, 0]
    on = (np.abs(a - line).sum(2) == 0)
    xs = [x for x in range(a.shape[1]) if on[:, x].mean() > 0.8]
    ys = [y for y in range(a.shape[0]) if on[y, :].mean() > 0.8] + [a.shape[0]]
    spans = lambda v: [(v[i] + 1, v[i + 1]) for i in range(len(v) - 1) if v[i + 1] - v[i] > 100]
    names = BATTLEBACK_NAMES.get(info['game'], [])
    os.makedirs(BB_DIR, exist_ok=True)
    made = []
    for y0, y1 in spans(ys):
        for x0, x1 in spans(xs):
            cell = a[y0:y1, x0:x1]
            rows = np.where(cell.max(axis=(1, 2)) > 24)[0]  # lignes non noires
            if len(rows) < 20 or len(made) >= len(names):
                continue
            top = int(rows.min()) if rows.min() > 8 else 0  # bande noire en haut (volcan)
            img = Image.fromarray(cell[top:top + 104].astype(np.uint8))  # décor GBA : 104 lignes, sol en bas
            name = f'{info["game"].lower()}-{names[len(made)]}.png'
            img.save(os.path.join(BB_DIR, name))
            made.append(name)
    print(f'  {info["game"]} : {len(made)} fonds de combat')
    return made


def write_art_index():
    """src/shared/fe-gba-art.js : ressources du pack pour les personnages et les classes du pack de personnages FE."""
    from fe_gba_overrides import CHAR_NAMES, CLASS_IDS
    rp = 'ressources/personnages/'
    owners = {}
    for d in sorted(x for x in os.listdir(PERSO) if os.path.isdir(os.path.join(PERSO, x))):
        fs = os.listdir(os.path.join(PERSO, d))
        owners[d] = {
            'battlers': [f[:-5] for f in sorted(fs) if f.startswith('combat') and f.endswith('.json')],
            'maps': [f[:-5] for f in sorted(fs) if f.startswith('map') and f.endswith('.json')],
            'portrait': 'portrait.png' in fs,
        }

    def pick(keys, prefer_games=None, female=False):
        def score(k):
            low = k.lower()
            promoted = any(w in low for w in PROMOTED)
            g = next((i for i, x in enumerate(GAME_ORDER) if x.lower() in low), len(GAME_ORDER))
            sex = ('female' in low) != female
            return (promoted, sex, g if prefer_games else 0, len(k))
        return sorted(keys, key=score)[0] if keys else None
    characters, classes = {}, {}
    for owner, o in owners.items():
        if owner.startswith('Portraits'):
            continue
        name = CHAR_NAMES.get(owner)
        if not name:
            continue
        for key in ([name] if isinstance(name, str) else name):
            e = {'folder': owner, 'pack': 'fe-gba'}
            if o['portrait']:
                e['portrait'] = rp + owner + '/portrait.png'
            b = pick(o['battlers'])
            if b:
                e['battler'] = rp + owner + '/' + b
            mp = pick(o['maps'])
            if mp:
                e['mapSprite'] = rp + owner + '/' + mp
            characters[key] = e
    for label, cid in CLASS_IDS.items():
        o = owners.get(label)
        if not o:
            continue
        fem = cid in FEMALE_CLASSES
        e = {'folder': label, 'pack': 'fe-gba'}
        b = pick(o['battlers'], True, fem)
        if b:
            e['battler'] = rp + label + '/' + b
        mp = pick(o['maps'], True, fem)
        if mp:
            e['mapSprite'] = rp + label + '/' + mp
        if len(e) > 2:
            classes[cid] = e
    bbs = {}
    if os.path.isdir(BB_DIR):
        have = set(os.listdir(BB_DIR))
        for terrain, name in TERRAIN_BATTLEBACKS.items():
            if name in have:
                bbs[terrain] = 'ressources/fonds-combat/' + name
    body = json.dumps({'pack': 'fe-gba', 'characters': characters, 'classes': classes, 'battlebacks': bbs}, indent=1, ensure_ascii=False)
    js = ('/*\n * Généré par tools/build_fe_gba_pack.py : ressources du pack « Fire Emblem GBA » (assets/packs/fe-gba)\n'
          ' * pour les personnages (clé « jeu:Nom » du pack de personnages) et les classes. Ne pas modifier à la main.\n */\n'
          '(function (root, factory) {\n  const api = factory();\n  if (typeof module !== \'undefined\' && module.exports) module.exports = api;\n'
          '  else root.FEGbaArt = api;\n})(typeof self !== \'undefined\' ? self : this, function () {\n  \'use strict\';\n  return ' + body.replace('\n', '\n  ') + ';\n});\n')
    open(os.path.join(ROOT, 'src', 'shared', 'fe-gba-art.js'), 'w').write(js)
    print(f'Index : {len(characters)} personnages, {len(classes)} classes -> src/shared/fe-gba-art.js')


if __name__ == '__main__':
    main()
