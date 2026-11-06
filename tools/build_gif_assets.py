#!/usr/bin/env python3
"""
Livraison « dossiers a/ » : portraits (Face/), sprites de map (Map/) et animations de combat en GIF (Battle Animation/)
rangés par univers, à ajouter aux plugins de personnages.

  python3 tools/build_gif_assets.py <dossier contenant Face/, Map/ et Battle Animation/>

- Face/<Univers>/<Nom>.png (128×112)             → portrait du personnage
- Map/<Univers>/<Nom>.png (32 × 480, 15 images)  → sprite de map (planche « marche » GBA : gauche, bas, haut, sélection)
- Battle Animation/<Univers>/<Nom>.gif           → animation de combat. Les modes sont trouvés dans l'enregistrement :
  l'unité revient à sa pose de repos entre deux actions ; les longues séquences sont l'attaque puis le critique (puis
  l'attaque à distance), une courte séquence est l'esquive. Un GIF « <Nom>_crit » ou « <Nom>dodge » / « <Nom>_dodge »
  complète l'animation <Nom> (critique, esquive). Le coup porté est l'image où l'unité va le plus loin vers l'ennemi.

Le tableau CIBLES dit dans quel plugin et sous quel nom de personnage va chaque fichier ; un fichier absent du tableau
va dans le plugin de son dossier, au personnage de même nom (créé s'il n'existe pas).
"""
import hashlib, importlib.util, json, os, re, sys
import numpy as np
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.path.join(ROOT, 'plugins')
COLS = 12

UNIVERS = {  # dossier de la livraison → plugin
    'FE 1': 'fe-1-3-11-12', 'FE 13': 'fe-13-awakening', 'FE 16 Three Houses': 'fe-16-three-houses',
    'FE 2-15 Echoes': 'fe-2-15-echoes', 'FE 4-5': 'fe-4-5', 'FE 6-7': 'fe-6-7-blazing-blade',
    'FE 6-7 Blazing Blade': 'fe-6-7-blazing-blade', 'FE 8 Sacred Stone': 'fe-8-sacred-stone',
    'FE 9-10 Radiance': 'fe-9-10-radiance', 'Final_Fantasy': 'final-fantasy', 'Genshin': 'hoyoverse',
    'Gundam': 'gundam', 'Monstre': 'monstres', 'Nintendo': 'random', 'Mario': 'random', 'Pokemon': 'pokemon',
    'Random': 'random', 'Sword Art Online': 'anime', 'Zelda': 'zelda', '.': 'generic-characters',
}
# fichier (sans extension, chemin depuis le dossier de type) → (plugin ou None = celui du dossier, personnage, libellé)
CIBLES = {
    'Map/FE 8 Sacred Stone/Erika': (None, 'Eirika', ''),
    'Map/FE 9-10 Radiance/Ike Moving': (None, 'Ike', ''),
    'Map/FE 13/Darean_f': (None, 'Darean', 'F'),
    'Map/Mario/Peach_1': (None, 'Peach', '2'),
    'Map/Pokemon/trainer': (None, 'Pokemon Trainer', ''),
    'Map/Random/ice Climbers': (None, 'Ice Climbers', ''),
    'Map/dancer': (None, 'Dancer', ''),
    'Face/Random/Richter': (None, 'Richter Belmont', ''),
    'Face/Random/Terry': (None, 'Terry Bogard', ''),
    'Face/Zelda/Young_Link': (None, 'Young Link', ''),
    'Battle Animation/FE 13/Darean_Magic_f': (None, 'Darean', 'Magic F'),
    'Battle Animation/FE 13/Darean_Sword_f': (None, 'Darean', 'Sword F'),
    'Battle Animation/FE 2-15 Echoes/black_knight_v2_by_sjrainey1_dmq7uft': ('fe-9-10-radiance', 'Black Knight', 'v2 (sjrainey1) 1'),
    'Battle Animation/FE 2-15 Echoes/dmq7uft-20b9b3da-b8e0-4e60-814f-b87e81f22cec': ('fe-9-10-radiance', 'Black Knight', 'v2 (sjrainey1) 2'),
    'Battle Animation/FE 2-15 Echoes/dmq7uft-56d13d32-eba1-40b1-8a0d-3275ae137f40': ('fe-9-10-radiance', 'Black Knight', 'v2 (sjrainey1) 3'),
    'Battle Animation/FE 2-15 Echoes/dmq7uft-7717eb37-b8d7-435c-90ef-08da9182a965': ('fe-9-10-radiance', 'Black Knight', 'v2 (sjrainey1) 4'),
    'Battle Animation/FE 6-7 Blazing Blade/dmeaz3k-c2183967-c500-4856-a6d5-496b1cc903d4': (None, 'Epeiste vert (a identifier)', '1'),
    'Battle Animation/FE 6-7 Blazing Blade/dmeaz3k-d98f273a-3dcb-471b-aebb-17a457792b7d': (None, 'Epeiste vert (a identifier)', '2'),
    'Battle Animation/FE 6-7 Blazing Blade/lugh': (None, 'Lugh', ''),
    'Battle Animation/FE 8 Sacred Stone/Ike': ('fe-9-10-radiance', 'Ike', 'FE8'),
    'Battle Animation/FE 8 Sacred Stone/Ike_1': ('fe-9-10-radiance', 'Ike', 'FE8 2'),
    'Battle Animation/FE 9-10 Radiance/Ike_Axe': (None, 'Ike', 'Axe'),
    'Battle Animation/FE 9-10 Radiance/Ike_Handaxe': (None, 'Ike', 'Handaxe'),
    'Battle Animation/FE 9-10 Radiance/Ike_Ragnell': (None, 'Ike', 'Ragnell'),
    'Battle Animation/FE 9-10 Radiance/Ike_Sword': (None, 'Ike', 'Sword'),
    'Battle Animation/Gundam/Gubdam GP01': (None, 'Gundam GP01', ''),
    'Battle Animation/Monstre/18ff82e5e4a789156126c14367aed89131dcc914': (None, 'Divers', 'Chevalier au bouclier'),
    'Battle Animation/Monstre/4c8ba4d06002deb52e669d66554b32420c1a6804': (None, 'Tarvos', 'Centauresse'),
    'Battle Animation/Monstre/56f11ecffe7131bbb43064257d18a8f69da2ee68': (None, 'Divers', 'Griffon'),
    'Battle Animation/Monstre/65ece8ac3bd21d64a547ea112f7f8cb6e8c936e0': (None, 'Divers', 'Chevalier a la hache'),
    'Battle Animation/Monstre/6ec4ee2ec9f4e44a188debd3dde0fa910e13172d': (None, 'Divers', 'Chevalier a la lance'),
    'Battle Animation/Nintendo/Ice_Climbers': (None, 'Ice Climbers', ''),
    'Battle Animation/Nintendo/Ice_Climbers_axe': (None, 'Ice Climbers', 'Axe'),
    'Battle Animation/Nintendo/Ice_Climbers_noweapon': (None, 'Ice Climbers', 'Unarmed'),
    'Battle Animation/Random/King_Dedede': (None, 'King Dedede', ''),
    'Battle Animation/Random/Richter': (None, 'Richter Belmont', ''),
    'Battle Animation/Sword Art Online/dmeiuh4-580d0624-d74c-4f91-bf81-2824d2ab198f': (None, 'Sword Art Online (a identifier)', '1'),
    'Battle Animation/Sword Art Online/dmeiuh4-b13cdf46-9887-4b48-8c44-cf23120e47bb': (None, 'Sword Art Online (a identifier)', '2'),
    'Battle Animation/Sword Art Online/dmeiuh4-d5da798e-e5a5-4ac6-ab8b-082e5445cfa3': (None, 'Sword Art Online (a identifier)', '3'),
}
COMPANION = re.compile(r'(?i)[ _-]?(crit|dodge)$')  # Roy_crit, Peachdodge, Malon_dodge
POKEMON = re.compile(r'(?i)^trainer_?(.*)$')       # trainer_pikachu → Pokemon Trainer, « Pikachu »


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPR = load('build_generator_sprites')


def safe(s):
    return re.sub(r'[^A-Za-z0-9]+', '', str(s).title())[:48] or 'X'


def univers_dir(plugin):
    b = os.path.join(PLUGINS, plugin, 'ressources', 'personnages')
    ds = [d for d in sorted(os.listdir(b)) if os.path.isdir(os.path.join(b, d))] if os.path.isdir(b) else []
    return ds[0] if ds else plugin


def char_dir(plugin, name):
    u = univers_dir(plugin)
    base = os.path.join(PLUGINS, plugin, 'ressources', 'personnages', u)
    os.makedirs(base, exist_ok=True)
    for d in os.listdir(base):  # personnage existant (casse, espaces, tirets bas)
        if re.sub(r'[\s_]+', ' ', d).lower() == re.sub(r'[\s_]+', ' ', name).lower():
            return u, d
    os.makedirs(os.path.join(base, name), exist_ok=True)
    return u, name


def target(kind, folder, stem):
    key = f'{kind}/{folder}/{stem}' if folder != '.' else f'{kind}/{stem}'
    plugin = UNIVERS.get(folder)
    if key in CIBLES:
        p, name, label = CIBLES[key]
        return p or plugin, name, label
    if folder == 'Pokemon' and POKEMON.match(stem):
        return plugin, 'Pokemon Trainer', ''
    if '_' in stem:  # Roy_1, Roy_magic : variante d'un personnage existant
        head, tail = stem.rsplit('_', 1)
        u = univers_dir(plugin)
        if os.path.isdir(os.path.join(PLUGINS, plugin, 'ressources', 'personnages', u, head)):
            return plugin, head, tail.title()
    return plugin, stem.replace('_', ' ').strip().title() if stem.islower() else stem.replace('_', ' ').strip(), ''


# ---------- animations de combat (GIF) ----------

def gif_frames(path):
    im = Image.open(path)
    raw = [(np.array(f.convert('RGBA')), int(f.info.get('duration') or 50)) for f in ImageSequence.Iterator(im)]
    out = []
    for a, d in raw:
        a = a.copy()
        bg = a[0, 0, :3].copy()  # fond uni : couleur du coin haut gauche (image par image : certains GIF la changent)
        a[..., 3] = np.where((a[..., :3] == bg).all(2) | (a[..., 3] == 0), 0, 255)
        if a.shape[1] == 248:          # bande de palette des exports FEditor
            a = a[:, :240].copy()
            a[:8, 232:] = 0
        out.append((a, d))
    return out


def rest_index(frames):
    """pose de repos : première image « pleine » (les enregistrements commencent parfois par un fondu)"""
    # l'image la plus fréquente (silhouette identique) est la pose de repos
    seen = {}
    for i, (f, _) in enumerate(frames):
        m = f[..., 3] > 0
        if m.sum() < 20:
            continue
        k = hashlib.sha1(np.packbits(m).tobytes()).hexdigest()
        seen.setdefault(k, []).append(i)
    return max(seen.values(), key=len)[0]


def segments(frames):
    """séquences d'action : images qui s'écartent de la pose de repos"""
    st = frames[rest_index(frames)][0][..., 3] > 0
    n0 = max(1, st.sum())
    rest = [((f[..., 3] > 0) ^ st).sum() / n0 < 0.04 for f, _ in frames]
    segs, cur, gap = [], None, 0
    for i, r in enumerate(rest):
        if not r:
            if cur is None:
                cur = [max(0, i - 1), i]
            cur[1] = i; gap = 0
        elif cur is not None:
            gap += 1
            if gap > 3:
                segs.append((cur[0], min(len(frames) - 1, cur[1] + 1))); cur = None; gap = 0
    if cur is not None:
        segs.append((cur[0], min(len(frames) - 1, cur[1] + 1)))
    return [s for s in segs if s[1] - s[0] >= 3]


def hit_of(frames, s):
    """image où l'unité (tournée vers la gauche) va le plus loin vers l'ennemi"""
    best, bx = s[0], 10 ** 9
    for i in range(s[0], s[1] + 1):
        xs = np.nonzero((frames[i][0][..., 3] > 0).any(0))[0]
        if len(xs) and xs.min() < bx:
            bx, best = xs.min(), i
    return best - s[0]


def battler(gifs, name, source):
    """gifs : [(chemin, rôle)] rôle = 'base' | 'crit' | 'dodge'"""
    allf, secs = [], {}
    for path, role in gifs:
        fr = gif_frames(path)
        off = len(allf)
        allf += fr
        segs = segments(fr)
        if not segs:
            continue
        if role == 'base':
            secs.setdefault('stance', [off + rest_index(fr)])
            longs = [s for s in segs if s[1] - s[0] >= 10]
            shorts = [s for s in segs if s[1] - s[0] < 10]
            for k, s in zip(['attack', 'critical', 'ranged', 'rangedCritical'], longs):
                secs.setdefault(k, (s[0] + off, s[1] + off, hit_of(fr, s)))
            if shorts and 'dodge' not in secs:
                s = shorts[-1]; secs['dodge'] = (s[0] + off, s[1] + off, None)
            if not longs and segs:
                s = max(segs, key=lambda s: s[1] - s[0]); secs.setdefault('attack', (s[0] + off, s[1] + off, hit_of(fr, s)))
        else:
            s = max(segs, key=lambda s: s[1] - s[0])
            k = 'critical' if role == 'crit' else 'dodge'
            secs[k] = (s[0] + off, s[1] + off, hit_of(fr, s) if k == 'critical' else None)
            secs.setdefault('stance', [off + rest_index(fr)])
    if 'attack' not in secs:
        return None
    lists = {k: (v if k == 'stance' else list(range(v[0], v[1] + 1))) for k, v in secs.items()}
    used = sorted({i for l in lists.values() for i in l})
    occ = np.zeros(allf[0][0].shape[:2], bool)
    for i in used:
        occ |= allf[i][0][..., 3] > 0
    ys, xs = np.nonzero(occ)
    h, w = occ.shape
    x0, y0, x1, y1 = max(0, xs.min() - 1), max(0, ys.min() - 1), min(w, xs.max() + 2), min(h, ys.max() + 2)
    cw, ch = int(x1 - x0), int(y1 - y0)
    st = allf[lists['stance'][0]][0][..., 3] > 0
    sy, sx = np.nonzero(st)
    feet = sy.max(); low = sx[sy >= feet - 2]
    ax, ay = int(round((low.min() + low.max() + 1) / 2 - x0)), int(feet + 1 - y0)
    tiles, index = [], {}
    for i in used:
        t = allf[i][0][y0:y1, x0:x1]
        k = hashlib.sha1(t.tobytes()).hexdigest()
        if k not in index:
            index[k] = len(tiles); tiles.append(t)
        index[i] = index[k]
    rows = (len(tiles) + COLS - 1) // COLS
    sheet = np.zeros((rows * ch, COLS * cw, 4), np.uint8)
    for n, t in enumerate(tiles):
        sheet[(n // COLS) * ch:(n // COLS + 1) * ch, (n % COLS) * cw:(n % COLS + 1) * cw] = t
    anims = {}
    for k, l in lists.items():
        a = {'frames': [index[i] for i in l], 'durations': [max(16, allf[i][1]) for i in l]}
        if k == 'stance':
            a = {'frames': a['frames'][:1], 'durations': [500], 'loop': True}
        elif k != 'dodge':
            a['hit'] = int(secs[k][2])
        anims[k] = a
    meta = {'type': 'battler', 'name': name, 'facing': 'left', 'cell': [cw, ch], 'anchor': [ax, ay], 'columns': COLS,
            'count': len(tiles), 'anims': anims, 'source': source}
    return Image.fromarray(sheet, 'RGBA'), meta


def main(src):
    done = []
    # portraits
    for folder in sorted(os.listdir(os.path.join(src, 'Face'))) if os.path.isdir(os.path.join(src, 'Face')) else []:
        for f in sorted(os.listdir(os.path.join(src, 'Face', folder))):
            stem = os.path.splitext(f)[0]
            p, name, _ = target('Face', folder, stem)
            u, c = char_dir(p, name)
            Image.open(os.path.join(src, 'Face', folder, f)).convert('RGBA').save(
                os.path.join(PLUGINS, p, 'ressources', 'personnages', u, c, stem + '.png'))
            done.append((p, c, 'Portrait', f))
    # sprites de map (planche « marche » 32 × 480)
    mroot = os.path.join(src, 'Map')
    for dirpath, _, files in os.walk(mroot):
        folder = os.path.relpath(dirpath, mroot)
        for f in sorted(files):
            if not f.lower().endswith('.png'):
                continue  # .jpg : capture d'écran, pas une planche
            stem = os.path.splitext(f)[0]
            p, name, label = target('Map', folder, stem)
            im = Image.open(os.path.join(dirpath, f)).convert('RGBA')
            if im.width != 32 or im.height < 480:
                print('  map ignorée (format) :', f); continue
            tmp = os.path.join('/tmp', 'walk.png'); im.crop((0, 0, 32, 480)).save(tmp)
            r = SPR.convert({'files': {'walk': tmp}, 'label': f'{name} {label}'.strip(), 'credits': []})
            if not r:
                continue
            img, meta, _, _ = r
            meta['source'] = 'Livraison Tactical Emblem'
            u, c = char_dir(p, name)
            out = os.path.join(PLUGINS, p, 'ressources', 'personnages', u, c, f'map_{safe(name)}{safe(label) if label else ""}Perso')
            img.save(out + '.png', optimize=True)
            json.dump(meta, open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            done.append((p, c, 'Sprite de map', f))
    # animations de combat (GIF)
    broot = os.path.join(src, 'Battle Animation')
    for folder in sorted(os.listdir(broot)) if os.path.isdir(broot) else []:
        fdir = os.path.join(broot, folder)
        gifs = sorted(f for f in os.listdir(fdir) if f.lower().endswith('.gif'))
        stems = {os.path.splitext(f)[0]: f for f in gifs}
        for stem, f in stems.items():
            if folder == 'Pokemon' and stem.lower().startswith('trainer_'):
                print('  ignoré (attaque du Pokémon seule, sans unité) :', f); continue
            m = COMPANION.search(stem)
            if m and COMPANION.sub('', stem) in stems:
                continue  # complète une autre animation
            parts = [(os.path.join(fdir, f), 'base')]
            for s2, f2 in stems.items():
                m2 = COMPANION.search(s2)
                if m2 and COMPANION.sub('', s2) == stem:
                    parts.append((os.path.join(fdir, f2), m2.group(1).lower()))
            p, name, label = target('Battle Animation', folder, stem)
            try:
                r = battler(parts, f'{name} {label}'.strip(), 'Livraison Tactical Emblem — ' + ', '.join(os.path.basename(x) for x, _ in parts))
            except Exception as ex:
                print('  combat ignoré :', folder, f, '→', ex); continue
            if not r:
                print('  combat ignoré :', folder, f); continue
            img, meta = r
            u, c = char_dir(p, name)
            out = os.path.join(PLUGINS, p, 'ressources', 'personnages', u, c, f'combat_{safe(name)}{safe(label) if label else ""}Perso')
            img.save(out + '.png', optimize=True)
            json.dump(meta, open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            done.append((p, c, 'Animation de combat', ' + '.join(os.path.basename(x) for x, _ in parts) + ' : ' + ', '.join(meta['anims'])))
    # fiches : version, crédits de la livraison
    from collections import defaultdict
    per = defaultdict(list)
    for row in done:
        per[row[0]].append(row[1:])
        print(' | '.join(row))
    for plugin, rows in per.items():
        mfile = os.path.join(PLUGINS, plugin, 'plugin.json')
        m = json.load(open(mfile, encoding='utf-8'))
        major, minor, _ = (m.get('version', '0.1.0').split('.') + ['0', '0'])[:3]
        m['version'] = f'{major}.{int(minor) + 1}.0'  # une exécution par livraison (partir des fiches commitées)
        json.dump(m, open(mfile, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        cfile = os.path.join(PLUGINS, plugin, 'CREDITS.md')
        text = open(cfile, encoding='utf-8').read() if os.path.exists(cfile) else f'# {m["name"]} — crédits\n'
        text = text.split('\n## Livraison personnelle')[0].rstrip() + '\n'
        text += ('\n## Livraison personnelle (portraits, sprites de map, animations GIF)\n\n'
                 'Ressources fournies par l\'équipe Tactical Emblem ; auteurs d\'origine à compléter.\n\n'
                 '| Personnage | Type | Fichier |\n|---|---|---|\n')
        text += ''.join(f'| {c} | {t} | {f} |\n' for c, t, f in sorted(rows))
        open(cfile, 'w', encoding='utf-8').write(text)
    return done


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
