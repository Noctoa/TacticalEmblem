#!/usr/bin/env python3
"""
Construit les ressources par défaut (assets/default/) à partir des planches rippées
de tools/sprite-sources/ :

  img/characters/<nom>.png + .json   sprites de map (4 palettes : allié, ennemi, neutre, gris)
  img/battlers/<nom>.png + .json     animations de combat, frames normalisées sur une grille
  img/faces/<nom>.png                portraits (buste découpé dans la pose de garde)

Usage : python3 tools/build_default_resources.py [--preview dossier]
Dépendances : Pillow, numpy
"""
import json, shutil, os, sys, hashlib
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'sprite-sources')
OUT = os.path.join(ROOT, 'assets', 'default')
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None


def load(name):
    return np.array(Image.open(os.path.join(SRC, name)).convert('RGB')).astype(np.int16)


# ======================================================================
# Sprites de map (planche « Map Sprites » de FE7)
# ======================================================================
MAP_BG = (128, 160, 128)
# Palettes de la planche (index 1..15 ; 0 = transparent)
PAL_Y = {'ally': 5294, 'enemy': 5310, 'neutral': 5326, 'gray': 5341}
PAL_X0 = 397
LEFT_COLS = [188, 221, 254, 287, 320]
RIGHT_COLS = [367, 400, 433, 466, 499]
# première ligne de grille (haut de la rangée 1) de chaque section
SECTION = {'eliwood': 40, 'lyn': 172, 'hector': 304, 'brigand': 3362}

MAP_SPRITES = [
    # nom du fichier, section, bloc (gauche = classe de base, droite = promue), libellé
    ('Eliwood_Lord', 'eliwood', 'left', 'Eliwood — Seigneur'),
    ('Eliwood_KnightLord', 'eliwood', 'right', 'Eliwood — Chevalier-Seigneur'),
    ('Lyn_Lord', 'lyn', 'left', 'Lyn — Seigneur'),
    ('Lyn_BladeLord', 'lyn', 'right', 'Lyn — Lame-Seigneur'),
    ('Hector_Lord', 'hector', 'left', 'Hector — Seigneur'),
    ('Hector_GreatLord', 'hector', 'right', 'Hector — Grand Seigneur'),
    ('Brigand', 'brigand', 'left', 'Brigand'),
]
# colonne de la planche -> animation ; rangées utilisées
MAP_LAYOUT = [
    ('idle', 0, [1, 2, 3]),
    ('left', 1, [0, 1, 2, 3]),
    ('right', 1, [0, 1, 2, 3]),   # = gauche en miroir
    ('down', 2, [0, 1, 2, 3]),
    ('up', 3, [0, 1, 2, 3]),
    ('focus', 4, [1, 2, 3]),
]


def build_map_sprites(sheet):
    pals = {}
    for k, y in PAL_Y.items():
        pals[k] = [tuple(int(c) for c in sheet[y, PAL_X0 + 8 * i]) for i in range(15)]
    order = ['ally', 'enemy', 'neutral', 'gray']
    ally_index = {c: i for i, c in enumerate(pals['ally'])}
    made = []
    for fname, section, block, label in MAP_SPRITES:
        g0 = SECTION[section]
        rows_y = [g0 - 32, g0, g0 + 32, g0 + 64]
        cols = LEFT_COLS if block == 'left' else RIGHT_COLS
        W = 4 * 32; H = len(MAP_LAYOUT) * 32
        out = Image.new('RGBA', (W, H * len(order)), (0, 0, 0, 0))
        unknown = set()
        for pi, pal in enumerate(order):
            for ri, (anim, col, rows) in enumerate(MAP_LAYOUT):
                for fi, r in enumerate(rows):
                    x0, y0 = cols[col], rows_y[r]
                    cell = sheet[y0 + 1:y0 + 32, x0 + 1:x0 + 32]
                    img = np.zeros((32, 32, 4), np.uint8)
                    for yy in range(31):
                        for xx in range(31):
                            c = tuple(int(v) for v in cell[yy, xx])
                            if c == MAP_BG:
                                continue
                            idx = ally_index.get(c)
                            if idx is None:
                                unknown.add(c); col_out = c
                            else:
                                col_out = pals[pal][idx]
                            img[yy, xx] = (*col_out, 255)
                    im = Image.fromarray(img, 'RGBA')
                    if anim == 'right':
                        im = im.transpose(Image.FLIP_LEFT_RIGHT)
                    out.paste(im, (fi * 32, pi * H + ri * 32))
        os.makedirs(os.path.join(OUT, 'img', 'characters'), exist_ok=True)
        out.save(os.path.join(OUT, 'img', 'characters', fname + '.png'))
        meta = {
            'type': 'mapsprite', 'name': label, 'frame': [32, 32], 'anchor': [16, 23], 'base': 16,
            'palettes': order, 'paletteHeight': H,
            'anims': {
                'idle': {'row': 0, 'frames': [0, 1, 2, 1], 'durations': [500, 80, 500, 80]},
                'left': {'row': 1, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                'right': {'row': 2, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                'down': {'row': 3, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                'up': {'row': 4, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                'focus': {'row': 5, 'frames': [0, 1, 2, 1], 'durations': [160, 100, 160, 100]}
            },
            'source': 'Fire Emblem 7 — map sprites (rip : Lexou)'
        }
        json.dump(meta, open(os.path.join(OUT, 'img', 'characters', fname + '.json'), 'w'), indent=1, ensure_ascii=False)
        made.append(fname)
        if unknown:
            print('  ', fname, ':', len(unknown), 'couleurs hors palette conservées')
    return made


# Planches custom : une rangée par animation, frames découpées automatiquement
CUSTOM_MAP_SPRITES = [
    {'name': 'Cloud', 'label': 'Cloud', 'file': 'cloud.gif', 'bg': (0, 57, 198),
     'rows': {'idle': [35, 53, 465, 600], 'up': [57, 78, 465, 600], 'down': [81, 101, 465, 600],
              'left': [106, 126, 465, 600], 'focus': [130, 162, 465, 600]}},
]


def build_custom_map_sprites(fe_sheet):
    pals = {k: [tuple(int(c) for c in fe_sheet[y, PAL_X0 + 8 * i]) for i in range(15)] for k, y in PAL_Y.items()}
    ally_index = {c: i for i, c in enumerate(pals['ally'])}
    order = ['ally', 'enemy', 'neutral', 'gray']
    made = []
    for sp in CUSTOM_MAP_SPRITES:
        a = load(sp['file']); bg = sp['bg']
        rgba = np.zeros((a.shape[0], a.shape[1], 4), np.uint8)
        rgba[..., :3] = a.astype(np.uint8); rgba[..., 3] = np.where(is_bg(a, bg), 0, 255)
        cells = {}
        for anim, (y0, y1, x0, x1) in sp['rows'].items():
            out = []
            for f in segment(a, bg, y0, y1, x0, x1, 1):
                fx0, fy0, fx1, fy1 = f
                crop = rgba[fy0:fy1 + 1, fx0:fx1 + 1]
                m = crop[..., 3] > 0; ys, xs = np.where(m)
                bottom_xs = xs[ys >= ys.max() - 1]
                cx = (bottom_xs.min() + bottom_xs.max() + 1) / 2.0
                tile = np.zeros((32, 32, 4), np.uint8)
                px = int(round(16 - cx)); py = 23 - (fy1 - fy0 + 1)
                for yy in range(crop.shape[0]):
                    for xx in range(crop.shape[1]):
                        ty, tx = py + yy, px + xx
                        if 0 <= ty < 32 and 0 <= tx < 32 and crop[yy, xx, 3]:
                            tile[ty, tx] = crop[yy, xx]
                out.append(tile)
            cells[anim] = out
        cells['right'] = [np.ascontiguousarray(t[:, ::-1]) for t in cells['left']]
        layout = ['idle', 'left', 'right', 'down', 'up', 'focus']
        H = len(layout) * 32
        sheet = Image.new('RGBA', (4 * 32, H * len(order)), (0, 0, 0, 0))

        def recolor(t, pal):
            o = t.copy()
            for yy in range(32):
                for xx in range(32):
                    if not o[yy, xx, 3]:
                        continue
                    c = tuple(int(v) for v in o[yy, xx, :3])
                    if pal == 'gray':
                        l = int(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]); o[yy, xx, :3] = (l, l, l)
                    elif c in ally_index and pal != 'ally':
                        o[yy, xx, :3] = pals[pal][ally_index[c]]
            return o
        for pi, pal in enumerate(order):
            for ri, anim in enumerate(layout):
                for fi, t in enumerate(cells[anim][:4]):
                    sheet.paste(Image.fromarray(recolor(t, pal), 'RGBA'), (fi * 32, pi * H + ri * 32))
        sheet.save(os.path.join(OUT, 'img', 'characters', sp['name'] + '.png'))
        n = {k: len(v) for k, v in cells.items()}
        idle = list(range(n['idle'])) + ([1] if n['idle'] == 3 else [])
        meta = {
            'type': 'mapsprite', 'name': sp['label'], 'frame': [32, 32], 'anchor': [16, 23], 'base': 16,
            'palettes': order, 'paletteHeight': H,
            'anims': {
                'idle': {'row': 0, 'frames': idle, 'durations': [500, 80, 500, 80][:len(idle)]},
                'left': {'row': 1, 'frames': list(range(n['left'])), 'durations': [110] * n['left']},
                'right': {'row': 2, 'frames': list(range(n['right'])), 'durations': [110] * n['right']},
                'down': {'row': 3, 'frames': list(range(n['down'])), 'durations': [110] * n['down']},
                'up': {'row': 4, 'frames': list(range(n['up'])), 'durations': [110] * n['up']},
                'focus': {'row': 5, 'frames': [0, 1, 2, 1][:max(1, n['focus'] + (1 if n['focus'] == 3 else 0))], 'durations': [160, 100, 160, 100][:max(1, n['focus'] + (1 if n['focus'] == 3 else 0))]}
            },
            'source': 'Cloud — sprite FE custom par Lord Zymeth'
        }
        json.dump(meta, open(os.path.join(OUT, 'img', 'characters', sp['name'] + '.json'), 'w'), indent=1, ensure_ascii=False)
        made.append(sp['name'])
        print('  ', sp['name'], n)
    return made


# ======================================================================
# Animations de combat
# ======================================================================
def is_bg(a, bg):
    return (np.abs(a - np.array(bg)).sum(2) == 0)


def segment(a, bg, y0, y1, x0, x1, gap=2):
    m = ~is_bg(a[y0:y1 + 1, x0:x1 + 1], bg)
    occ = m.any(0)
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
        ys = np.where(m[:, sx:ex + 1].any(1))[0]
        out.append([x0 + sx, y0 + int(ys.min()), x0 + ex, y0 + int(ys.max())])
    return out


def shadow_center(a, bg, f):
    """Centre de l'ombre au sol (longue rangée de gris foncé en bas de la frame), sinon None."""
    x0, y0, x1, y1 = f
    for y in range(y1, max(y0, y1 - 4) - 1, -1):
        row = a[y, x0:x1 + 1]
        dark = (row.max(1) < 75) & (np.abs(row[:, 0] - row[:, 2]) < 12) & ~is_bg(row[None], bg)[0]
        xs = np.where(dark)[0]
        if len(xs) >= 8:
            # plus longue suite continue
            best, cur, start, bs = 0, 0, 0, 0
            for i in range(len(xs)):
                if i and xs[i] == xs[i - 1] + 1:
                    cur += 1
                else:
                    cur = 1; start = xs[i]
                if cur > best:
                    best, bs = cur, start
            if best >= 8:
                return x0 + bs + best / 2.0
    return None


def feet_center(a, bg, f):
    x0, y0, x1, y1 = f
    m = ~is_bg(a[y0:y1 + 1, x0:x1 + 1], bg)
    ys, xs = np.where(m)
    sel = ys >= ys.max() - 6
    return x0 + float(xs[sel].mean())


R = lambda a, b: list(range(a, b + 1))

BATTLERS = {
    'Cloud': {
        'file': 'cloud.gif', 'bg': [0, 57, 198], 'facing': 'left', 'label': 'Cloud (Mercenaire)',
        'credit': 'Cloud : édition FE par Lord Zymeth (base Mercenaire FE, personnage Square Enix)',
        'erase': [[290, 178, 385, 200], [300, 376, 372, 399], [218, 443, 234, 458], [405, 476, 490, 503]],
        'anims': {
            'stance': {'bands': [[38, 108, 40, 104]]},
            'attack': {'bands': [[38, 108, 40, 440], [112, 172, 40, 440]], 'hit': 6, 'approach': [2, 4], 'retreat': [9, 10], 'slow': [0, 1]},
            # [2..7] répétées 3 fois (« x3 » sur la planche)
            'critical': {'bands': [[190, 282, 0, 642], [300, 365, 90, 520]],
                         'pick': [0, 1] + R(2, 7) * 3 + R(8, 13) + R(14, 20), 'hit': 25, 'approach': [20, 23], 'retreat': [28, 29]},
            'ranged': {'bands': [[372, 458, 30, 620]], 'release': 11, 'projectile': 'wave', 'slow': [4, 10]},
            # magie critique : insérée à l'endroit de la flèche (après la 4e frame)
            'rangedCritical': {'bands': [[372, 458, 30, 620], [484, 550, 100, 370]], 'pick': R(0, 3) + R(14, 19) + R(4, 13), 'release': 17, 'projectile': 'wave', 'slow': [4, 16]},
            'dodge': {'bands': [[478, 552, 405, 500]], 'durations': [260, 120]},
        },
    },
    'Eliwood': {
        'file': 'eliwood.png', 'bg': [157, 187, 97], 'facing': 'left', 'label': 'Eliwood (Seigneur)', 'face': [37, 65, 16],
        'anims': {
            'stance': {'bands': [[30, 63, 0, 60]]},
            'attack': {'bands': [[94, 127], [136, 200], [203, 247]], 'hit': 13, 'approach': [4, 6], 'retreat': [20, 24]},
            'critical': {'bands': [[277, 322], [330, 385], [400, 448], [471, 502], [506, 604], [619, 696], [717, 750]],
                         'hit': 55, 'approach': [36, 38], 'retreat': [59, 63], 'slow': [0, 16]},
            'ranged': {'bands': [[783, 826]], 'hit': 7},
            'rangedCritical': {'bands': [[860, 905], [914, 959, 0, 240]], 'hit': 13, 'slow': [4, 11]},
            'dodge': {'bands': [[990, 1030, 0, 270]]},
        }
    },
    'Hector': {
        'file': 'hector.png', 'bg': [157, 187, 97], 'facing': 'left', 'label': 'Hector (Seigneur)', 'face': [27, 26, 16],
        'anims': {
            'stance': {'bands': [[26, 61, 0, 95]], 'durations': [400, 400]},
            'attack': {'bands': [[94, 148, 0, 312, 1], [155, 212], [220, 267], [280, 315]], 'hit': 13, 'approach': [6, 9], 'retreat': [19, 21]},
            'critical': {'bands': [[353, 395, 0, 312, 1], [399, 456, 0, 312, 1], [463, 517], [521, 582], [591, 624], [632, 667]],
                         'hit': 24, 'approach': [17, 20], 'retreat': [30, 32], 'slow': [0, 15]},
            'ranged': {'bands': [[704, 740], [748, 782], [790, 825]], 'release': 5, 'catch': 10, 'projectile': 'axe'},
            'rangedCritical': {'bands': [[862, 898], [909, 954], [962, 1007], [1017, 1051], [1060, 1095]], 'release': 14, 'catch': 19, 'projectile': 'axe', 'slow': [5, 13]},
            'dodge': {'bands': [[1127, 1171]]},
        }
    },
    'Lyn': {
        'file': 'lyn.gif', 'bg': [0, 56, 200], 'facing': 'left', 'label': 'Lyn (Lame-Seigneur)', 'face': [39, 18, 14],
        'anims': {
            'stance': {'bands': [[22, 60, 0, 40]]},
            'attack': {'bands': [[22, 60, 0, 225], [12, 60, 226, 520], [66, 111], [119, 166]], 'hit': 9, 'approach': [4, 6], 'retreat': [19, 25]},
            'critical': {'bands': [[213, 247], [262, 305, 0, 205]], 'then': ['attack', 5, None], 'hit': 17, 'approach': [12, 14], 'retreat': [27, 33], 'slow': [0, 12]},
            'bow': {'bands': [[490, 545, 0, 530]], 'release': 11, 'projectile': 'arrow', 'slow': [7, 11]},
            'bowCritical': {'bands': [[590, 641], [659, 711, 0, 440], [659, 711, 485, 600]], 'release': 21, 'projectile': 'arrow', 'slow': [5, 20]},
            'dodge': {'bands': [[1312, 1362, 205, 300]], 'durations': [260, 120]},
        },
        'extra': {'arrow': [450, 680, 485, 700]},
        'ignore': [[0, 192, 0]]
    },
    'Brigand': {
        'file': 'brigand.gif', 'bg': [0, 156, 255], 'facing': 'right', 'label': 'Brigand', 'face': [25, 17, 17], 'faceFrame': ['attack', 11],
        'anims': {
            'stance': {'bands': [[60, 97, 0, 50]]},
            'attack': {'bands': [[60, 97, 0, 95], [34, 110, 96, 470], [100, 147, 0, 95]], 'hit': 7, 'approach': [1, 4], 'retreat': [8, 10]},
            'ranged': {'bands': [[172, 216]], 'release': 1, 'catch': 3, 'projectile': 'axe', 'durations': [120, 90, 400, 90, 120]},
        }
    },
}


def extract_battler(name, spec):
    a = load(spec['file']); bg = spec['bg']
    for c in spec.get('ignore', []):  # texte des planches
        a[(a == np.array(c)).all(2)] = bg
    for x0, y0, x1, y1 in spec.get('erase', []):  # zones de texte à effacer
        a[y0:y1 + 1, x0:x1 + 1] = bg
    rgba = np.zeros((a.shape[0], a.shape[1], 4), np.uint8)
    rgba[..., :3] = a.astype(np.uint8)
    rgba[..., 3] = np.where(is_bg(a, bg), 0, 255)
    frames = []  # dicts : bbox, anchor_x, ground
    anim_frames = {}
    for anim, an in spec['anims'].items():
        idx = []
        for band in an['bands']:
            y0, y1 = band[0], band[1]
            x0 = band[2] if len(band) > 2 else 0
            x1 = band[3] if len(band) > 3 else a.shape[1] - 1
            fr = segment(a, bg, y0, y1, x0, x1, band[4] if len(band) > 4 else 2)
            if not fr:
                continue
            bottoms = [f[3] for f in fr]
            ground = max(set(bottoms), key=bottoms.count)
            for f in fr:
                sc = shadow_center(a, bg, f)
                ax = sc if sc is not None else feet_center(a, bg, f)
                frames.append({'bbox': f, 'ax': ax, 'ground': ground})
                idx.append(len(frames) - 1)
        anim_frames[anim] = idx
    # « pick » : ordre explicite des frames découpées (répétitions, frames à ignorer)
    for anim, an in spec['anims'].items():
        if 'pick' in an:
            base = anim_frames[anim]
            anim_frames[anim] = [base[i] for i in an['pick']]
    # « then » : enchaîne la fin d'une autre animation
    for anim, an in spec['anims'].items():
        if 'then' in an:
            src, s, e = an['then']
            anim_frames[anim] = anim_frames[anim] + anim_frames[src][s:e]

    # cellule commune
    L = R = U = D = 0
    for f in frames:
        x0, y0, x1, y1 = f['bbox']
        L = max(L, f['ax'] - x0); R = max(R, x1 + 1 - f['ax'])
        U = max(U, f['ground'] - y0 + 1); D = max(D, y1 - f['ground'])
    L, R, U, D = int(np.ceil(L)) + 1, int(np.ceil(R)) + 1, int(U) + 1, int(D) + 1
    cw, ch = L + R, U + D
    ax, ay = L, U  # point d'ancrage (sol, centre) dans la cellule

    # dédoublonnage des frames identiques
    tiles, keymap, remap = [], {}, {}
    for i, f in enumerate(frames):
        x0, y0, x1, y1 = f['bbox']
        crop = rgba[y0:y1 + 1, x0:x1 + 1]
        tile = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        px = int(round(ax - (f['ax'] - x0))); py = ay - (f['ground'] - y0 + 1)
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
    os.makedirs(os.path.join(OUT, 'img', 'battlers'), exist_ok=True)
    sheet.save(os.path.join(OUT, 'img', 'battlers', name + '.png'), optimize=True)

    anims = {}
    for anim, an in spec['anims'].items():
        seq = [remap[i] for i in anim_frames[anim]]
        d = {'frames': seq}
        if 'durations' in an:
            d['durations'] = an['durations']
        else:
            dur = [55] * len(seq)
            if 'slow' in an:
                for k in range(an['slow'][0], min(len(seq), an['slow'][1] + 1)):
                    dur[k] = 75
            d['durations'] = dur
        for k in ('hit', 'approach', 'retreat', 'projectile', 'release', 'catch'):
            if k in an:
                d[k] = an[k]
        if 'hit' in d and d['hit'] >= len(seq):
            print('  ⚠', name, anim, 'hit hors limites', d['hit'], len(seq)); d['hit'] = len(seq) // 2
        anims[anim] = d
        if anim == 'stance':
            d['loop'] = True
    meta = {'type': 'battler', 'name': spec['label'], 'facing': spec['facing'], 'cell': [cw, ch], 'anchor': [ax, ay],
            'columns': cols, 'count': len(tiles), 'anims': anims,
            'source': 'Fire Emblem 7 — battle sprites (rip : Lexou / Grim & Bonzai)'}
    # projectiles intégrés (flèche de Lyn)
    if 'extra' in spec:
        meta['projectiles'] = {}
        for pname, (x0, y0, x1, y1) in spec['extra'].items():
            crop = Image.fromarray(rgba[y0:y1 + 1, x0:x1 + 1], 'RGBA')
            bb = crop.getbbox(); crop = crop.crop(bb)
            p = os.path.join(OUT, 'img', 'battlers', f'{name}_{pname}.png'); crop.save(p)
            meta['projectiles'][pname] = f'img/battlers/{name}_{pname}.png'
    json.dump(meta, open(os.path.join(OUT, 'img', 'battlers', name + '.json'), 'w'), indent=1, ensure_ascii=False)
    # portrait : buste centré sur la tête, dans la pose de garde
    fa, fk = spec.get('faceFrame', ['stance', 0])
    st = tiles[remap[anim_frames[fa][fk]]]
    al = np.array(st)[..., 3] > 0
    ys, xs = np.where(al)
    top = ys.min()
    head = xs[ys <= top + 9]
    cx = int(round(head.mean()))
    if 'face' in spec:  # cadrage choisi à la main (coordonnées dans la cellule)
        fx, fy, size = spec['face']
        face = st.crop((fx, fy, fx + size, fy + size))
    else:
        size = 26
        face = st.crop((cx - size // 2, top - 3, cx + size // 2, top - 3 + size))
    if spec['facing'] == 'left':
        face = face.transpose(Image.FLIP_LEFT_RIGHT)  # regarde vers la droite dans la boîte de dialogue
    os.makedirs(os.path.join(OUT, 'img', 'faces'), exist_ok=True)
    # un vrai face set (planche 128x112 façon FE GBA) fourni dans sprite-sources remplace le buste découpé
    fs = os.path.join(SRC, name.lower() + '_faceset.png')
    if os.path.exists(fs):
        shutil.copyfile(fs, os.path.join(OUT, 'img', 'faces', name + '.png'))
    else:
        face.save(os.path.join(OUT, 'img', 'faces', name + '.png'))
    print(f'  {name} : {len(frames)} frames -> {len(tiles)} uniques, cellule {cw}x{ch}, ' + ', '.join(f'{k} {len(v["frames"])}' for k, v in anims.items()))
    if PREVIEW:
        preview(name, meta, sheet)
    return meta


def preview(name, meta, sheet):
    cw, ch = meta['cell']; ax, ay = meta['anchor']; cols = meta['columns']
    lines = []
    for anim, d in meta['anims'].items():
        lines.append((anim, d))
    per = 14
    H = sum(((len(d['frames']) + per - 1) // per) * (ch + 14) + 6 for _, d in lines)
    o = Image.new('RGB', (per * (cw + 2) + 80, H), (30, 30, 38)); dr = ImageDraw.Draw(o); y = 0
    for anim, d in lines:
        dr.text((2, y + 2), anim, fill=(255, 255, 255))
        for k, fi in enumerate(d['frames']):
            col, row = k % per, k // per
            x = 80 + col * (cw + 2); yy = y + row * (ch + 14)
            tile = sheet.crop(((fi % cols) * cw, (fi // cols) * ch, (fi % cols + 1) * cw, (fi // cols + 1) * ch))
            bgc = (70, 60, 40) if k == d.get('hit') else (48, 48, 60)
            if 'approach' in d and d['approach'][0] <= k <= d['approach'][1]: bgc = (40, 60, 90)
            if 'retreat' in d and d['retreat'][0] <= k <= d['retreat'][1]: bgc = (40, 80, 50)
            dr.rectangle([x, yy + 12, x + cw - 1, yy + 12 + ch - 1], fill=bgc)
            o.paste(tile, (x, yy + 12), tile)
            dr.line([x + ax, yy + 12, x + ax, yy + 12 + ch], fill=(255, 80, 80))
            dr.line([x, yy + 12 + ay, x + cw, yy + 12 + ay], fill=(80, 255, 80))
            dr.text((x + 1, yy), str(k), fill=(255, 220, 0))
        y += ((len(d['frames']) + per - 1) // per) * (ch + 14) + 6
    os.makedirs(PREVIEW, exist_ok=True)
    o.save(os.path.join(PREVIEW, f'battler_{name}.png'))


def main():
    print('Sprites de map')
    sheet = load('map_sheet.png')
    made = build_map_sprites(sheet) + build_custom_map_sprites(sheet)
    print('  ', ', '.join(made))
    if PREVIEW:
        ims = [Image.open(os.path.join(OUT, 'img', 'characters', m + '.png')) for m in made]
        o = Image.new('RGBA', (sum(i.width + 8 for i in ims), ims[0].height), (48, 48, 60, 255))
        x = 0
        for i in ims:
            o.paste(i, (x, 0), i); x += i.width + 8
        o = o.resize((o.width * 2, o.height * 2), Image.NEAREST); o.save(os.path.join(PREVIEW, 'mapsprites.png'))
    print('Animations de combat')
    for name, spec in BATTLERS.items():
        extract_battler(name, spec)


if __name__ == '__main__':
    main()
