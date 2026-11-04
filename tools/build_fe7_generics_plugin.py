#!/usr/bin/env python3
"""
Plugin « Fire Emblem 7 — Unités génériques » (plugins/fe7-unites-generiques/) : animations de combat, sprites de map
et portraits des classes génériques de FE7 (+ Soldat, Sceau magique, Sonia), pris dans le dossier de travail du pack
FE GBA (build/fe-gba, produit par tools/build_fe_gba_pack.py --only "Blazing Blade") à partir des planches
The Spriters Resource de tools/sprite-sources/fe-gba/.

Corrections (FIXES) : étiquettes des planches (« Attacking », « Dodge »…) ou pose voisine restées dans une case.

Liens : classes d'exemple (archer, knight…) et classes FE7 du pack de classes (fe7_archer_m…), champs vides seulement.

  python3 tools/build_fe_gba_pack.py --only "Blazing Blade"   (si build/fe-gba est absent)
  python3 tools/build_fe7_generics_plugin.py
"""
import json, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGE = os.path.join(ROOT, 'build', 'fe-gba', 'ressources', 'personnages')
OUT = os.path.join(ROOT, 'plugins', 'fe7-unites-generiques')
RP = 'ressources/personnages/'

# dossier -> (fichiers à garder : préfixes) ; FE7 seulement (le pirate n'a de sprite de map que dans FE6)
FOLDERS = {  # animations de combat (+ portrait) prises dans le dossier de travail
    'Archer': ['combat_FE7'], 'Assassin': ['combat_FE7'], 'Berserker': ['combat_FE7'], 'Cavalier': ['combat_FE7'],
    'Dancer': ['combat_FE7'], 'Druid': ['combat_FE7'], 'Fighter': ['combat_FE7'], 'General': ['combat_FE7'],
    'Knight': ['combat_FE7'], 'Mage': ['combat_FE7'], 'Magic Seal': ['combat_FE7'], 'Mercenary': ['combat_FE7'],
    'Monk': ['combat_FE7'], 'Myrmidon': ['combat_FE7'], 'Nomad': ['combat_FE7'], 'Paladin': ['combat_FE7'],
    'Pirate': ['combat_FE7'], 'Sage': ['combat_FE7'], 'Shaman': ['combat_FE7'], 'Sniper': ['combat_FE7Male', 'combat_FE7Female'],
    'Soldier': ['combat_FE7'], 'Sonia': ['combat'], 'Thief': ['combat_FE7'], 'Troubadour': ['combat_FE7'], 'Warrior': ['combat_FE7'],
    'Cleric': [], 'Wyvern Rider': [],  # portrait seulement
}
MAP_SHEET = os.path.join(ROOT, 'tools', 'sprite-sources', 'fe-gba', 'Game Boy Advance - Fire Emblem_ The Blazing Blade - Miscellaneous - Map Sprites.png')
# sections de la planche « Map Sprites » de FE7, de haut en bas : (bloc de gauche, bloc de droite) = (dossier, variante)
# ou None (seigneurs : ressources de base ; personnages uniques ; cases irrégulières)
MAP_SECTIONS = [
    None, None, None,                                                       # Eliwood, Lyn, Hector
    (('Mercenary', 'FE7'), ('Hero', 'FE7')),
    (('Mercenary', 'FE7B'), ('Hero', 'FE7Female')),                         # mercenaire « bêta », héroïne (inutilisée)
    (('Thief', 'FE7'), ('Assassin', 'FE7')),
    (('Myrmidon', 'FE7Male'), ('Swordmaster', 'FE7Male')),
    (('Myrmidon', 'FE7Female'), ('Swordmaster', 'FE7Female')),
    (('Fighter', 'FE7'), ('Warrior', 'FE7')),
    (('Knight', 'FE7'), ('General', 'FE7')),
    (('Archer', 'FE7Male'), ('Sniper', 'FE7Male')),
    (('Archer', 'FE7Female'), ('Sniper', 'FE7Female')),
    (('Monk', 'FE7'), ('Bishop', 'FE7Male')),
    (('Cleric', 'FE7'), ('Bishop', 'FE7Female')),
    (('Mage', 'FE7Male'), ('Sage', 'FE7Male')),
    (('Mage', 'FE7Female'), ('Sage', 'FE7Female')),
    (('Shaman', 'FE7Male'), ('Druid', 'FE7Male')),
    (('Shaman', 'FE7Female'), ('Druid', 'FE7Female')),
    (('Cavalier', 'FE7'), ('Paladin', 'FE7')),
    (('Troubadour', 'FE7'), ('Valkyrie', 'FE7')),
    (('Nomad', 'FE7Male'), ('Nomad Trooper', 'FE7Male')),
    (('Nomad', 'FE7Female'), ('Nomad Trooper', 'FE7Female')),
    (('Pegasus Knight', 'FE7'), ('Falcon Knight', 'FE7')),
    (('Wyvern Rider', 'FE7'), ('Wyvern Lord', 'FE7')),
    (('Pirate', 'FE7'), ('Berserker', 'FE7')),
    (('Brigand', 'FE7'), ('Soldier', 'FE7')),
    (('Dancer', 'FE7'), ('Bard', 'FE7')),
    (('Archsage', 'FE7'), ('Dark Druid', 'FE7')),
    (('Magic Seal', 'FE7'), None),                                          # Bramimond : personnage unique
    (('Ballista', 'FE7'), ('Ballista', 'FE7B')),                            # baliste niveau 1, niveau 2
    (('Tactician', 'FE7'), ('Transporter', 'FE7')),
    (('Prince', 'FE7'), ('King', 'FE7')),
    (('Princess', 'FE7'), ('Queen', 'FE7')),
    (('Boy', 'FE7'), ('Man', 'FE7')),
    (('Girl', 'FE7'), ('Woman', 'FE7')),
]
MAP_LABELS = {'Mercenary': 'Mercenaire', 'Hero': 'Héros', 'Thief': 'Voleur', 'Assassin': 'Assassin', 'Myrmidon': 'Myrmidon',
              'Swordmaster': 'Maître d\'armes', 'Fighter': 'Guerrier', 'Warrior': 'Combattant', 'Knight': 'Chevalier', 'General': 'Général',
              'Archer': 'Archer', 'Sniper': 'Sniper', 'Monk': 'Moine', 'Bishop': 'Évêque', 'Cleric': 'Prêtresse', 'Mage': 'Mage',
              'Sage': 'Sage', 'Shaman': 'Shaman', 'Druid': 'Druide', 'Cavalier': 'Cavalier', 'Paladin': 'Paladin',
              'Troubadour': 'Troubadour', 'Valkyrie': 'Valkyrie', 'Nomad': 'Nomade', 'Nomad Trooper': 'Cavalier nomade',
              'Pegasus Knight': 'Chevalier pégase', 'Falcon Knight': 'Chevalier faucon', 'Wyvern Rider': 'Chevalier wyverne',
              'Wyvern Lord': 'Seigneur wyverne', 'Pirate': 'Pirate', 'Berserker': 'Berserker', 'Brigand': 'Brigand', 'Soldier': 'Soldat',
              'Dancer': 'Danseuse', 'Bard': 'Barde', 'Archsage': 'Archisage', 'Dark Druid': 'Druide noir', 'Magic Seal': 'Sceau magique',
              'Ballista': 'Baliste', 'Tactician': 'Stratège', 'Transporter': 'Chariot', 'Prince': 'Prince', 'King': 'Roi',
              'Princess': 'Princesse', 'Queen': 'Reine', 'Boy': 'Garçon', 'Man': 'Homme', 'Girl': 'Fille', 'Woman': 'Femme'}
# classe -> (dossier, combat, map)
C = lambda folder, combat=None, mp=None: {k: v for k, v in (('folder', folder), ('battler', combat and RP + folder + '/' + combat), ('mapSprite', mp and RP + folder + '/' + mp)) if v}
SAMPLE = {
    'archer': C('Archer', 'combat_FE7', 'map_FE7Male'), 'knight': C('Knight', 'combat_FE7', 'map_FE7'),
    'mage': C('Mage', 'combat_FE7', 'map_FE7Male'), 'cavalier': C('Cavalier', 'combat_FE7', 'map_FE7'),
    'fighter': C('Fighter', 'combat_FE7', 'map_FE7'), 'mercenary': C('Mercenary', 'combat_FE7', 'map_FE7'),
    'fe_myrmidon': C('Myrmidon', 'combat_FE7', 'map_FE7Male'), 'fe_swordmaster': C('Swordmaster', None, 'map_FE7Male'),
    'warrior': C('Warrior', 'combat_FE7', 'map_FE7'), 'hero': C('Hero', None, 'map_FE7'), 'paladin': C('Paladin', 'combat_FE7', 'map_FE7'),
    'general': C('General', 'combat_FE7', 'map_FE7'), 'thief': C('Thief', 'combat_FE7', 'map_FE7'), 'cleric': C('Cleric', None, 'map_FE7'),
    'pegasus': C('Pegasus Knight', None, 'map_FE7'), 'fe_falcon': C('Falcon Knight', None, 'map_FE7'),
    'fe_wyvern': C('Wyvern Rider', None, 'map_FE7'), 'soldier': C('Soldier', 'combat_FE7', 'map_FE7'), 'brigand': C('Brigand', None, 'map_FE7'),
    'fe_berserker': C('Berserker', 'combat_FE7', 'map_FE7'), 'fe_dancer': C('Dancer', 'combat_FE7', 'map_FE7'),
    'fe_troubadour': C('Troubadour', 'combat_FE7', 'map_FE7'), 'fe_valkyrie': C('Valkyrie', None, 'map_FE7'),
    'fe_monk': C('Monk', 'combat_FE7', 'map_FE7'), 'fe_bishop': C('Bishop', None, 'map_FE7Male'),
    'fe_shaman': C('Shaman', 'combat_FE7', 'map_FE7Male'), 'fe_druid': C('Druid', 'combat_FE7', 'map_FE7Male'),
    'fe_sage': C('Sage', 'combat_FE7', 'map_FE7Male'), 'fe_sniper': C('Sniper', 'combat_FE7Male', 'map_FE7Male'),
    'fe_nomad': C('Nomad', 'combat_FE7', 'map_FE7Male'), 'fe_assassin': C('Assassin', 'combat_FE7', 'map_FE7'),
    'pirate': C('Pirate', 'combat_FE7', 'map_FE7'),
}
# pack de classes (Base de données › Classes › « Ajouter des classes de la série ») : FE7
M_F = lambda folder, combat, male, female: (C(folder, combat, male), C(folder, combat, female or male))
PACK = {'fe7_soldier': C('Soldier', 'combat_FE7', 'map_FE7'), 'fe7_dancer': C('Dancer', 'combat_FE7', 'map_FE7'),
        'fe7_assassin': C('Assassin', 'combat_FE7', 'map_FE7'), 'fe7_bard': C('Bard', None, 'map_FE7'), 'fe7_monk': C('Monk', 'combat_FE7', 'map_FE7'),
        'fe7_cleric': C('Cleric', None, 'map_FE7'), 'fe7_fighter': C('Fighter', 'combat_FE7', 'map_FE7'),
        'fe7_warrior': C('Warrior', 'combat_FE7', 'map_FE7'), 'fe7_brigand': C('Brigand', None, 'map_FE7'),
        'fe7_pirate': C('Pirate', 'combat_FE7', 'map_FE7'), 'fe7_corsair': C('Pirate', None, 'map_FE7'),
        'fe7_berserker': C('Berserker', 'combat_FE7', 'map_FE7'), 'fe7_pegasus_knight': C('Pegasus Knight', None, 'map_FE7'),
        'fe7_falcoknight': C('Falcon Knight', None, 'map_FE7'), 'fe7_troubadour': C('Troubadour', 'combat_FE7', 'map_FE7'),
        'fe7_valkyrie': C('Valkyrie', None, 'map_FE7')}
for base, args in {'cavalier': ('Cavalier', 'combat_FE7', 'map_FE7', None), 'paladin': ('Paladin', 'combat_FE7', 'map_FE7', None),
                   'knight': ('Knight', 'combat_FE7', 'map_FE7', None), 'general': ('General', 'combat_FE7', 'map_FE7', None),
                   'mercenary': ('Mercenary', 'combat_FE7', 'map_FE7', None), 'hero': ('Hero', None, 'map_FE7', 'map_FE7Female'),
                   'myrmidon': ('Myrmidon', 'combat_FE7', 'map_FE7Male', 'map_FE7Female'), 'swordmaster': ('Swordmaster', None, 'map_FE7Male', 'map_FE7Female'),
                   'thief': ('Thief', 'combat_FE7', 'map_FE7', None), 'archer': ('Archer', 'combat_FE7', 'map_FE7Male', 'map_FE7Female'),
                   'nomad': ('Nomad', 'combat_FE7', 'map_FE7Male', 'map_FE7Female'), 'nomad_trooper': ('Nomad Trooper', None, 'map_FE7Male', 'map_FE7Female'),
                   'wyvern_rider': ('Wyvern Rider', None, 'map_FE7', None), 'wyvern_lord': ('Wyvern Lord', None, 'map_FE7', None), 'mage': ('Mage', 'combat_FE7', 'map_FE7Male', 'map_FE7Female'),
                   'sage': ('Sage', 'combat_FE7', 'map_FE7Male', 'map_FE7Female'), 'bishop': ('Bishop', None, 'map_FE7Male', 'map_FE7Female'),
                   'shaman': ('Shaman', 'combat_FE7', 'map_FE7Male', 'map_FE7Female'), 'druid': ('Druid', 'combat_FE7', 'map_FE7Male', 'map_FE7Female')}.items():
    PACK['fe7_' + base + '_m'], PACK['fe7_' + base + '_f'] = M_F(*args)
PACK['fe7_sniper_m'] = C('Sniper', 'combat_FE7Male', 'map_FE7Male')
PACK['fe7_sniper_f'] = C('Sniper', 'combat_FE7Female', 'map_FE7Female')


# corrections des cases mal découpées (vues une à une) : solo = une seule silhouette dans la case (sans les
# étiquettes ni la pose voisine) ; replace = case qui n'est qu'une étiquette, remplacée par une autre dans les animations
FIXES = {
    'Berserker/combat_FE7': {'solo': [7, 18, 19]},
    'Cavalier/combat_FE7': {'solo': [15]},
    'General/combat_FE7': {'solo': [18, 19]},
    'Nomad/combat_FE7': {'solo': [36], 'replace': {1: 0}},
    'Pirate/combat_FE7': {'replace': {13: 0}},
}


def fix_battler(png, meta, fix):
    im = np.array(Image.open(png).convert('RGBA'))
    cw, ch = meta['cell']
    cols = meta['columns']
    ax = meta['anchor'][0]
    for k in fix.get('solo', []):
        x0, y0 = (k % cols) * cw, (k // cols) * ch
        cell = im[y0:y0 + ch, x0:x0 + cw]
        on = cell[..., 3] > 0
        lab, n = ndi.label(on, structure=np.ones((3, 3)))
        sizes = ndi.sum(on, lab, range(1, n + 1))
        objs = ndi.find_objects(lab)
        big = [i for i in range(1, n + 1) if sizes[i - 1] >= 0.3 * sizes.max()]
        keep = min(big, key=lambda i: abs((objs[i - 1][1].start + objs[i - 1][1].stop) / 2 - ax))
        near = ndi.binary_dilation(lab == keep, iterations=6)
        for i in range(1, n + 1):
            if i == keep:
                continue
            h = objs[i - 1][0].stop - objs[i - 1][0].start
            if i in big or (h <= 14 and not (near & (lab == i)).any()):
                cell[lab == i] = 0
    Image.fromarray(im).save(png, optimize=True)
    rep = {int(a): int(b) for a, b in fix.get('replace', {}).items()}
    for anim in meta['anims'].values():
        anim['frames'] = [rep.get(f, f) for f in anim['frames']]
    return meta


CELL_BG = (128, 160, 128)
MAP_LAYOUT = [('idle', 0, [1, 2, 3]), ('left', 1, [0, 1, 2, 3]), ('right', 1, [0, 1, 2, 3]),
              ('down', 2, [0, 1, 2, 3]), ('up', 3, [0, 1, 2, 3]), ('focus', 4, [1, 2, 3])]


def map_cells(rgb):
    """Cases de la planche (intérieur des cadres noirs), groupées en sections de 4 rangées, de haut en bas."""
    from collections import Counter
    inner = ~(rgb == 0).all(2)
    lab, _ = ndi.label(inner)
    cells = []
    for sl in ndi.find_objects(lab):
        ys, xs = sl
        w, h = xs.stop - xs.start, ys.stop - ys.start
        if 28 <= w <= 40 and 28 <= h <= 44 and (rgb[ys, xs] == np.array(CELL_BG)).all(2).mean() > 0.3:
            cells.append((xs.start, ys.start, w, h))
    cnt = Counter(c[1] for c in cells)
    rowy = sorted(y for y, k in cnt.items() if k >= 3)
    groups, cur = [], [rowy[0]]
    for y in rowy[1:]:
        if y - cur[-1] <= 36:
            cur.append(y)
        else:
            groups.append(cur)
            cur = [y]
    groups.append(cur)
    sections = [g[i:i + 4] for g in groups for i in range(0, len(g) - 3, 4)]
    return cells, sections


def build_map_sprites():
    a = np.array(Image.open(MAP_SHEET).convert('RGB')).astype(int)
    ally = [tuple(int(v) for v in a[5294, 397 + 8 * i]) for i in range(15)]
    enemy = [tuple(int(v) for v in a[5310, 397 + 8 * i]) for i in range(15)]
    team = sorted({'#%02x%02x%02x' % c for c, e in zip(ally, enemy) if c != e})
    cells, sections = map_cells(a)
    assert len(sections) >= len(MAP_SECTIONS), (len(sections), len(MAP_SECTIONS))
    made = []
    for sec, pair in zip(sections, MAP_SECTIONS):
        if not pair:
            continue
        rows = []  # rangée -> 2 blocs -> cases (x, y, w, h) ; rangée du haut : 3 + 3 cases, les autres : 5 + 5
        for ry in sec:
            # tolérance : les cases de la colonne « sélection » sont parfois décalées de quelques pixels
            rc = sorted((c for c in cells if abs(c[1] - ry) <= 10), key=lambda c: c[0])
            half = len(rc) // 2
            assert len(rc) in (6, 10), (pair, ry, len(rc))
            rows.append([rc[:half], rc[half:]])
        for bi, who in enumerate(pair):
            if not who:
                continue
            folder, variant = who
            out = Image.new('RGBA', (4 * 32, len(MAP_LAYOUT) * 32), (0, 0, 0, 0))
            for ri, (anim, col, rws) in enumerate(MAP_LAYOUT):
                for fi, r in enumerate(rws):
                    blk = rows[r][bi]
                    c = blk[col - 1] if r == 0 else blk[col]  # rangée du haut : colonnes 1 à 3 seulement
                    x, y, w, h = c
                    cell = a[y:y + h, x:x + w]
                    rgba = np.zeros((h, w, 4), np.uint8)
                    rgba[..., :3] = cell
                    rgba[..., 3] = np.where((cell == np.array(CELL_BG)).all(2), 0, 255)
                    # case de 32 × 32 comme l'intérieur d'un cadre normal (31 × 31 en haut à gauche) ; une case plus
                    # haute (arme levée) garde son bas, une plus large est centrée
                    tile = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
                    tile.paste(Image.fromarray(rgba, 'RGBA'), (0 if w <= 32 else (32 - w) // 2, min(0, 31 - h)))
                    if anim == 'right':
                        tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
                    out.paste(tile, (fi * 32, ri * 32))
            dst = os.path.join(OUT, 'ressources', 'personnages', folder)
            os.makedirs(dst, exist_ok=True)
            out.save(os.path.join(dst, f'map_{variant}.png'), optimize=True)
            label = MAP_LABELS.get(folder, folder) + {'FE7Male': ' (homme)', 'FE7Female': ' (femme)', 'FE7B': ' (variante)'}.get(variant, '')
            meta = {'type': 'mapsprite', 'name': label + ' — FE7', 'frame': [32, 32], 'anchor': [16, 23], 'base': 16, 'teamColors': team,
                    'anims': {'idle': {'row': 0, 'frames': [0, 1, 2, 1], 'durations': [500, 80, 500, 80]},
                              'left': {'row': 1, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'right': {'row': 2, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'down': {'row': 3, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'up': {'row': 4, 'frames': [0, 1, 2, 3], 'durations': [110] * 4},
                              'focus': {'row': 5, 'frames': [0, 1, 2, 1], 'durations': [160, 100, 160, 100]}},
                    'source': 'Fire Emblem 7 — map sprites (rip : Lexou, The Spriters Resource)'}
            json.dump(meta, open(os.path.join(dst, f'map_{variant}.json'), 'w'), indent=1, ensure_ascii=False)
            made.append(folder + '/map_' + variant)
    return made


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    files = 0
    for folder, keep in FOLDERS.items():
        src = os.path.join(STAGE, folder)
        dst = os.path.join(OUT, 'ressources', 'personnages', folder)
        os.makedirs(dst, exist_ok=True)
        for f in sorted(os.listdir(src)):
            stem = os.path.splitext(f)[0]
            if f == 'portrait.png' or any(stem == p or stem == p + '_arrow' for p in keep):  # sprites de map : planche FE7 (plus bas)
                shutil.copyfile(os.path.join(src, f), os.path.join(dst, f))
                files += 1
        for p in keep:
            fix = FIXES.get(folder + '/' + p)
            if fix:
                jp = os.path.join(dst, p + '.json')
                meta = fix_battler(os.path.join(dst, p + '.png'), json.load(open(jp)), fix)
                json.dump(meta, open(jp, 'w'), indent=1, ensure_ascii=False)
                print(f'  {folder}/{p} corrigé')
    maps = build_map_sprites()
    files += 2 * len(maps)
    print(f'  {len(maps)} sprites de map (planche FE7)')
    # contrôle : chaque lien pointe vers un fichier copié
    links = {'classes': {**SAMPLE, **PACK},
             'characters': {'fe7:Sonia': {'folder': 'Sonia', 'portrait': RP + 'Sonia/portrait.png', 'battler': RP + 'Sonia/combat'}},
             'battlebacks': {}}
    for group in ('classes', 'characters'):
        for key, a in links[group].items():
            for field in ('battler', 'mapSprite', 'portrait'):
                if field in a:
                    p = os.path.join(OUT, a[field] + ('' if field == 'portrait' else '.json'))
                    assert os.path.exists(p), (key, field, p)
    manifest = {
        'id': 'fe7-unites-generiques', 'name': 'Fire Emblem 7 — Unités génériques', 'version': '1.0.0', 'kind': 'ressources',
        'description': "Animations de combat, sprites de map et portraits des unités génériques de Fire Emblem 7 (soldat, chevalier, mage, "
                       "archer, pirate, général…), reliés aux classes d'exemple et aux classes FE7 du pack de classes.",
        'author': 'Tactical Emblem (découpe) — planches : The Spriters Resource (Grim, Bonzai et leurs auteurs)',
        'notice': 'Ressources de fans (Nintendo / Intelligent Systems) : usage personnel.',
        'ressources': 'ressources', 'links': links, 'scripts': []}
    json.dump(manifest, open(os.path.join(OUT, 'plugin.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{files} fichiers, {len(links["classes"])} classes reliées')


if __name__ == '__main__':
    main()
