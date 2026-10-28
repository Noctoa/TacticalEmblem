#!/usr/bin/env python3
"""
Icônes d'armes et d'objets (pixel art 16 × 16 façon Fire Emblem GBA) : tools/item-icons/*.png (« Nom.png »).

  python3 tools/build_item_icons.py

→ src/renderer/img/items/icons.png   planche (cases de 16 × 16, 16 par ligne), fond transparent
→ src/renderer/img/items/index.js    self.ITEM_ICONS = { cell, cols, list: [{ id, label, group }] }

Une arme ou un objet y renvoie par « item:<id> » (ex. item:iron-sword) : champ « image » de la fiche. Les images
identiques ne sont gardées qu'une fois ; le groupe de chaque icône est donné par GROUPS ci-dessous (« Divers » sinon).
"""
import collections, hashlib, json, os, re, unicodedata
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'item-icons')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'items')
CELL, COLS = 16, 16
BGS = [(192, 248, 200), (197, 255, 205)]  # fond vert d'eau des planches d'origine

# noms de fichiers mal encodés ou mal écrits
FIX = {'G#U00e1ebolg': 'Gáebolg', 'Mj#U00f6lnir': 'Mjölnir', 'Return  Ring': 'Return Ring', 'Grafcalibar': 'Grafcalibur',
       'Saggitarius Shard': 'Sagittarius Shard', 'Thiefs Band': "Thief's Band", 'Thiefs Sword': "Thief's Sword",
       'Forsetti': 'Forseti', 'Lighting': 'Lightning', 'Gáebolg': 'Gaebolg', 'lightning_sword': 'Lightning Sword'}

GROUPS = collections.OrderedDict([
    ('Épées', ['Armorslayer', 'Balmung', 'Barrier Blade', "Beo's Sword", 'Berserk Sword', 'Blessed Sword', 'Bragi Sword', 'Brave Sword',
               'Broken Sword', 'Devil Sword', 'Earth Sword', 'Falchion', 'Flame Sword', 'Great Sword', 'Iron Blade', 'Iron Sword',
               'Killing Edge', 'King Maker', 'Ladyblade', 'Levin Sword', 'Light Brand', 'Lightning Sword', 'Long Sword', 'Loputo Sword',
               "Mareeta's Sword", 'Master Sword', 'Mercurius', 'Miracle Sword', 'Mystletainn', 'Paragon Sword', 'Poison Sword', 'Rapier',
               'Ridersbane', 'Shadow Sword', 'Short Sword', 'Silence Sword', 'Silver Blade', 'Silver Sword', 'Sleep Sword', 'Slim Sword',
               'Steel Blade', 'Steel Sword', 'Swordslayer', "Thief's Sword", 'Tyrfing', 'Wind Sword', 'Wyrmslayer', 'Circlet']),
    ('Lances', ['Brave Lance', 'Broken Lance', 'Darkness Lance', 'Dragon Lance', 'Gaebolg', 'Gáebolg', 'Gradivus', 'Great Lance', 'Gungnir',
                'Iron Lance', 'Javelin', 'Killer Lance', 'Knight Killer', 'Long Lance', 'Master Lance', 'Poison Lance', 'Riders Bane',
                'Safeguard', 'Short Lance', 'Silver Lance', 'Slim Lance', 'Steel Lance', 'Wing Clipper']),
    ('Haches', ['Battle Axe', 'Brave Axe', 'Broken Axe', 'Devil Axe', 'Hammer', 'Hand Axe', 'Helswath', 'Iron Axe', 'Killer Axe', 'Master Axe',
                'Poison Axe', 'Pole Axe', 'Pugi', 'Silver Axe', 'Steel Axe']),
    ('Arcs et balistes', ['Brave Bow', 'Broken Bow', 'Great Bow', 'Iron Bow', 'Killer Bow', 'Long Bow', 'Master Bow', 'Parthia', 'Poison Bow',
                          'Short Bow', 'Silver Bow', 'Steel Bow', 'Yewfelle', 'Arrowspate', 'Hoistflamme', 'Pachyderm', 'Stonehoist']),
    ('Magie anima', ['Blizzard', 'Bolganone', 'Bolting', 'Cutting Gale', 'Dire Thunder', 'Elfire', 'Elthunder', 'Elwind', 'Excalibur', 'Fire',
                     'Forseti', 'Forsetti', 'Grafcalibur', 'Meteor', 'Mjölnir', 'Thorhammer', 'Thoron', 'Thunder', 'Thunderbolt', 'Thunderstorm',
                     'Tornado', 'Valflame', 'Wind']),
    ('Magie de lumière', ['Aura', 'Lighting', 'Lightning', 'Naga', 'Nosferatu', 'Starlight']),
    ('Magie noire', ['Dulam', 'Fenrir', 'Hel', 'Imhullu', 'Jormungand', 'Loptous', 'Loputousu', 'Poison', 'Stone', 'Swarm', 'Yotsmungand']),
    ('Bâtons', ['Anew', 'Aum', 'Barrier', 'Fortify', 'Hammerne', 'Heal', 'Mend', 'Physic', 'Recover', 'Rescue', 'Silence', 'Thief', 'Unlock',
                'Warp', 'Watch']),
    ('Pierres et souffles', ['Divinestone', 'Earthstone', 'Firestone', 'Icestone', 'Magestone', 'Shadowstone', 'Wyvernstone', 'Dark Breath',
                             'Fire Breath', 'Fog Breath', 'Ice Breath']),
    ('Anneaux et boucliers', ['Bargain Band', 'Barrier Ring', "Bishop's Ring", 'Body Ring', 'Knight Ring', 'Leg Ring', 'Life Ring', 'Luck Ring',
                              'Magic Ring', 'Miracle Band', 'Paragon Ring', 'Power Ring', 'Pursuit', 'Recover Ring', 'Renewal Band', 'Return Ring',
                              'Shield Ring', 'Skill Ring', 'Speed Ring', "Thief's Band", 'Binding Shield', "Iote's Shield"]),
    ('Objets de stats', ['Boots', 'Dracoshield', 'Goddess Icon', 'Pure Water', 'Secret Book', 'Seraph Robe', 'Talisman', 'Vulnerary', 'Manual']),
    ('Sceaux et emblèmes', ['Fire Emblem', 'Hero Crest', 'Knight Crest', 'Knight Seal', "Orion's Bolt", 'Skydrake Whip']),
    ('Joyaux et orbes', ['Darksphere', 'Geosphere', 'Geosphere (Broken)', 'Lifesphere', 'Lightsphere', 'Starsphere', 'Aum Fragment',
                         'Aquarius Shard', 'Aries Shard', 'Cancer Shard', 'Capricorn Shard', 'Gemini Shard', 'Leo Shard', 'Libra Shard',
                         'Pisces Shard', 'Sagittarius Shard', 'Scorpio Shard', 'Taurus Shard', 'Virgo Shard']),
    ('Clés et cartes', ['Bridge Key', 'Chest Key', 'Door Key', 'Silver Key', 'Silver Card', 'VIP Card']),
])
GROUP_OF = {n: g for g, names in GROUPS.items() for n in names}
ORDER = {n: i for i, n in enumerate(n for names in GROUPS.values() for n in names)}


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def label(fname):
    stem = FIX.get(fname[:-4], fname[:-4]).replace('_', ' ').strip()
    stem = FIX.get(stem, stem)
    if stem[:1].islower():  # « great_sword », « berserk sword » → « Great Sword »
        stem = ' '.join(w[:1].upper() + w[1:] for w in stem.split(' '))
    return stem


def load(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (CELL, CELL):
        im = im.resize((CELL, CELL), Image.NEAREST)
    a = np.array(im)
    for bg in BGS: a[(a[..., :3] == bg).all(2), 3] = 0
    return a


def main():
    files = [f for f in os.listdir(SRC) if f.lower().endswith('.png')]
    # noms propres d'abord (« Gaebolg » plutôt que « G#U00e1ebolg »), dans l'ordre des groupes
    files.sort(key=lambda f: ('#' in f, f[:1].islower(), ORDER.get(label(f), 9999), label(f).lower()))
    seen, entries, ids, unknown = {}, [], set(), []
    for f in files:
        a = load(os.path.join(SRC, f))
        if not a[..., 3].any():
            continue
        h = hashlib.sha1(a.tobytes()).hexdigest()
        if h in seen:
            continue
        lab = label(f)
        if lab not in GROUP_OF: unknown.append(lab)
        grp = GROUP_OF.get(lab, 'Divers')
        i = slug(lab)
        if i in ids:  # même nom, autre dessin
            n = 2
            while f'{i}-{n}' in ids: n += 1
            i, lab = f'{i}-{n}', f'{lab} ({n})'
        ids.add(i); seen[h] = True
        entries.append({'id': i, 'label': lab, 'group': grp, 'img': a})
    groups = list(GROUPS) + ['Divers']
    entries.sort(key=lambda e: (groups.index(e['group']), ORDER.get(re.sub(r' \(\d+\)$', '', e['label']), 9999), e['label'].lower()))
    rows = (len(entries) + COLS - 1) // COLS
    sheet = np.zeros((rows * CELL, COLS * CELL, 4), np.uint8)
    for k, e in enumerate(entries):
        r, c = divmod(k, COLS)
        sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = e['img']
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'icons.png'), optimize=True)
    meta = {'cell': CELL, 'cols': COLS, 'list': [{k: e[k] for k in ('id', 'label', 'group')} for e in entries]}
    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as fh:
        fh.write('// Généré par tools/build_item_icons.py — ne pas modifier à la main.\n')
        fh.write('self.ITEM_ICONS = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(entries)} icônes ({len(files)} fichiers, doublons et cases vides écartés)')
    if unknown: print('sans groupe (Divers) :', ', '.join(unknown))


if __name__ == '__main__':
    main()
