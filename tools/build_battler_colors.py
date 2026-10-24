#!/usr/bin/env python3
"""
Couleurs modifiables des animations de combat du générateur (peau, cheveux, métal, ornements, cuir).

Les animations FE GBA ont une palette de 16 couleurs dont l'ordre suit le plus souvent la même convention
(1 reflet, 2-4 peau, 5-7 cheveux, 8-10 équipement, 11-14 couleurs d'équipe, 15 contour). On part de cette
convention, on vérifie chaque couleur (teinte / saturation), puis on applique les corrections faites à la main
(battler-colors-overrides.json) pour les animations qui ne la suivent pas.

Le tissu n'est pas traité ici : ce sont les couleurs d'équipe, détectées en jeu (shared/palettes.js) et recolorées
avec le dégradé « Tissu » de l'onglet Combat.

Entrées :
  tools/battle-animations/palettes.json            palette d'origine (ordre des index) de chaque animation
  tools/battle-animations/battler-colors-overrides.json   { id : { groupe : [index…] } } (remplace le groupe)
  src/renderer/img/generator/battlers/<id>.png     planches construites (pour retrouver les couleurs d'équipe)
Sortie :
  src/renderer/img/generator/battler-colors.js     self.GENERATOR_BATTLER_COLORS = { id : { skin: ['#…' clair → foncé], hair, metal, trim, leather } }

  python3 tools/build_battler_colors.py [--preview dossier]
"""
import colorsys, json, math, os, sys
from collections import Counter
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'battle-animations')
GEN = os.path.join(ROOT, 'src', 'renderer', 'img', 'generator')
GROUPS = ['skin', 'hair', 'metal', 'trim', 'leather']


def rgb(h):
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return h * 360, s, v


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def hue_dist(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def detect_team(counts):
    """Même détection que Palettes.detect (shared/palettes.js) : couleurs d'équipe de la planche."""
    bins = [0.0] * 36
    cand = []
    for c, n in counts.items():
        h, s, v = hsv(c)
        if s < 0.25 or v < 0.18 or max(c) - min(c) < 28:
            continue
        if 12 <= h <= 60:
            continue
        cand.append((c, h))
        bins[int(h // 10) % 36] += n * s
    if not cand:
        return set()
    best = max(range(36), key=lambda i: bins[(i + 35) % 36] + bins[i] + bins[(i + 1) % 36])
    center = best * 10 + 5
    return {c for c, h in cand if hue_dist(h, center) <= 45}


def skin_like(c):
    h, s, v = hsv(c)
    return 5 <= h <= 45 and 0.12 <= s <= 0.72 and v >= 0.3


def equipment(c):
    """Groupe d'une couleur d'équipement (index 8-14 hors couleurs d'équipe) ; None = on n'y touche pas."""
    h, s, v = hsv(c)
    if s < 0.3:
        return 'metal'
    if 38 <= h <= 65 and s >= 0.35 and v >= 0.55:
        return 'trim'
    if 8 <= h <= 45:
        return 'leather'
    if 180 <= h <= 250 and s < 0.5:
        return 'metal'
    return None


def classify(pal, team):
    cols = [rgb(x) for x in pal]
    skip = lambda i: (cols[i] in team or hsv(cols[i])[2] < 0.2 or (hsv(cols[i])[1] < 0.1 and hsv(cols[i])[2] > 0.9))
    g = {k: [] for k in GROUPS}
    skin = [i for i in (2, 3, 4) if not skip(i) and skin_like(cols[i])]
    if len(skin) >= 2:
        g['skin'] = skin
    hair = [i for i in (5, 6, 7) if not skip(i)]
    # une couleur grise au milieu de cheveux colorés (lame de hache…) n'en fait pas partie
    sat = sorted(hsv(cols[i])[1] for i in hair)
    if sat and sat[-1] > 0.3:
        for i in [i for i in hair if hsv(cols[i])[1] < 0.15]:
            hair.remove(i)
            k = equipment(cols[i])
            if k:
                g[k].append(i)
    if len(hair) >= 2:
        g['hair'] = hair
    for i in range(8, 15):
        if skip(i):
            continue
        k = equipment(cols[i])
        if k:
            g[k].append(i)
    return g


def main():
    pals = json.load(open(os.path.join(SRC, 'palettes.json')))
    ov_path = os.path.join(SRC, 'battler-colors-overrides.json')
    overrides = json.load(open(ov_path)) if os.path.exists(ov_path) else {}
    out, idx = {}, {}
    for bid, pal in sorted(pals.items()):
        sheet = Image.open(os.path.join(GEN, 'battlers', bid + '.png')).convert('RGBA')
        counts = Counter(px[:3] for px in sheet.getdata() if px[3] >= 128)
        team = detect_team(counts)
        g = classify(pal, team)
        for k, v in (overrides.get(bid) or {}).items():
            if k in GROUPS:
                g[k] = list(v)
        idx[bid] = g
        used = set(counts)
        entry = {}
        for k in GROUPS:
            cs = sorted({rgb(pal[i]) for i in g[k]} & used - team, key=lambda c: -lum(c))
            if cs:
                entry[k] = ['#%02x%02x%02x' % c for c in cs]
        out[bid] = entry
    with open(os.path.join(GEN, 'battler-colors.js'), 'w') as f:
        f.write('/* Généré par tools/build_battler_colors.py — ne pas modifier à la main (corrections : '
                'tools/battle-animations/battler-colors-overrides.json). */\n')
        f.write('self.GENERATOR_BATTLER_COLORS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print(len(out), 'animations')
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], out)


def preview(dest, out):
    """Planche de contrôle : garde de chaque animation, d'origine puis recolorée avec des couleurs criardes."""
    os.makedirs(dest, exist_ok=True)
    loud = {'skin': [(120, 255, 120), (40, 200, 40), (0, 110, 0)], 'hair': [(255, 140, 255), (230, 0, 230), (120, 0, 120)],
            'metal': [(255, 200, 120), (255, 140, 0), (150, 70, 0)], 'trim': [(140, 255, 255), (0, 210, 210), (0, 110, 110)],
            'leather': [(255, 255, 140), (230, 220, 0), (130, 120, 0)]}
    txt = open(os.path.join(GEN, 'battlers.js'), encoding='utf-8').read()
    B = json.loads(txt[txt.index('= ') + 2:].rstrip().rstrip(';'))
    metas = {b['id']: b['meta'] for b in B['list']}
    ids = sorted(out)
    from PIL import ImageDraw
    cw, ch, cols_, per = 110, 96, 5, 25
    for page in range(0, len(ids), per):
        part = ids[page:page + per]
        rows = (len(part) + cols_ - 1) // cols_
        im = Image.new('RGB', (cols_ * cw * 2, rows * (ch + 14)), (60, 60, 70))
        d = ImageDraw.Draw(im)
        for n, bid in enumerate(part):
            m = metas[bid]
            w, hh = m['cell']
            src = Image.open(os.path.join(GEN, 'battlers', bid + '.png')).convert('RGBA').crop((0, 0, w, hh))
            rec = src.copy()
            px = rec.load()
            table = {}
            for k, cols in out[bid].items():
                for j, c in enumerate(cols):
                    t = 0 if len(cols) == 1 else j * 2 / (len(cols) - 1)
                    a2, b2 = loud[k][math.floor(t)], loud[k][math.ceil(t)]
                    f = t - math.floor(t)
                    table[rgb(c)] = tuple(round(a2[q] + (b2[q] - a2[q]) * f) for q in range(3))
            for y in range(hh):
                for x in range(w):
                    p = px[x, y]
                    if p[3] and p[:3] in table:
                        px[x, y] = table[p[:3]] + (p[3],)
            X, Y = (n % cols_) * cw * 2, (n // cols_) * (ch + 14)
            for col, s_ in enumerate((src, rec)):
                bb = s_.getbbox() or (0, 0, w, hh)
                s2 = s_.crop(bb)
                k2 = min(2, cw / s2.width, ch / s2.height)
                s2 = s2.resize((max(1, int(s2.width * k2)), max(1, int(s2.height * k2))), Image.NEAREST)
                im.paste(s2, (X + col * cw + (cw - s2.width) // 2, Y + ch - s2.height), s2)
            d.text((X + 2, Y + ch + 1), '%d %s' % (page + n, bid[:30]), fill='white')
        im.save(os.path.join(dest, 'battler_colors_%d.png' % (page // per)))

if __name__ == '__main__':
    main()
