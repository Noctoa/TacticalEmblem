"""
Associe chaque sprite de combat du générateur (img/generator/parts.js › token) à une animation de combat du dossier
« Battle Animations » de FE-Repo : classe (et sexe, arme) d'après le nom, ou personnage du même nom.
Écrit attribution.json (lu par tools/build_generator_battlers.py). À relancer après avoir ajouté des sprites de combat.

  python3 tools/battle-animations/associer.py
"""
import os
import json, re
CAT = {
 'bard': 'Bards, Dancers, Suppliers, Misc', 'brig': 'Infantry - (Axe) Brigs, Pirates, Zerkers', 'fight': 'Infantry - (Axe) Fighters and Warriors',
 'arch': 'Infantry - (Bow) Archers and Hunters', 'snip': 'Infantry - (Bow) Snipers and Ballistae', 'lnc': 'Infantry - (Lnc) Soldiers, Halberdiers',
 'merc': 'Infantry - (Swd) Mercenaries and Heroes', 'myrm': 'Infantry - (Swd) Myrms and Swordmasters', 'thief': 'Infantry - (Swd) Thieves, Rogues, Assassins',
 'knight': 'Infantry - Knights, Generals, Armors', 'lord': 'Lords - Vanilla and Custom', 'dark': 'Magi - Dark-Type', 'holy': 'Magi - Holy-Type',
 'nat': 'Magi - Nature-Type', 'spec': 'Magi - Special', 'cav': 'Mounted - Cavs, Paladins, Rangers', 'misc': 'Mounted - Dismounted, Monsters, Misc',
 'peg': 'Mounted - Pegs, Wyverns, Griffons', 'valk': 'Mounted - Valks, MKs, Magi'}
# classe → (dossier M, dossier F, arme par défaut)
CLASSES = {
 'archer': (('arch', '[Archer-Base] Vanilla FE7 + Magic [M] by Merpin'), ('arch', '[Archer-Base] Vanilla FE6 Alt1 + Magic [F] by Merpin'), 'bow'),
 'assassin': (('thief', '[Assassin-Base] Jaffar Vanilla +Weapons [M]'), ('thief', '[Assassin-Reskin] Ponytail +skirt Vanilla Desgin [F]'), 'sword'),
 'fighter': (('fight', '[Fighter-Base] Vanilla + Weapons [M]'), ('fight', '[Fighter-Reskin] FEGirls Vanilla-Style [F]'), 'axe'),
 'brigand': (('brig', '[Brigand-Base] Vanilla +Magic Anims [M]'), ('brig', '[Brigand-Reskin] Barbarian [F] by eCut'), 'axe'),
 'bard': (('bard', '[Bard-Base] [M] Elffin +Weapons'), ('bard', '[Bard-Reskin] [F] Nils Generic'), 'staff'),
 'berserker': (('brig', '[Berserker-Base] Vanilla +Magic [M]'), ('brig', '[Berserker-Reskin] FEGirls Baeserker [F]'), 'axe'),
 'bishop': (('holy', '[T2 Bishop-Base] Vanilla FE6 [M]'), ('holy', '[T2 Bishop-Base] Vanilla FE6-8 [F]'), 'magic'),
 'bow knight': (('cav', '[Paladin-Custom] [M] Bow Knight by Spud'), ('cav', '[Paladin-Variant] Jugdral Bow Knight [F] by CelestiaHeart'), 'bow'),
 'cavalier': (('cav', '[Cavalier-Base] [M] Vanilla +Weapons'), ('cav', '[Cavalier-Base] [F] Vanilla +Bow'), 'lance'),
 'cleric': (None, ('holy', '[T1 Cleric-Base] Vanilla FE6 +Weapons [F]'), 'staff'),
 'dancer': (('bard', '[Dancer-Reskin] [M] Tethys-Style Shirtless by L95'), ('bard', '[Dancer-Base] [F] Vanilla FE8 Tethys +Weapons'), 'dance'),
 'dark knight': (('valk', "[Dark-Knight] Leo's Dark Knight [M] by Leo_Link 3"), ('valk', "[Dark-Knight] Leo's Dark Knight [F] by Leo_Link 2"), 'sword'),
 'druid': (('dark', '[T2 Druid-Base] Vanilla FE6-8 [M]'), ('dark', '[T2 Druid-Base] Vanilla FE6 [F]'), 'magic'),
 'falcon knight': (('peg', '[Peg T2 Reskin] [M] Male Repal Falcoknight by CelestiaHeart'), ('peg', '[Peg T2 Base] [F] Vanilla +Weapons'), 'lance'),
 'pegasus knight': (('peg', '[Peg T1 Reskin] [M] Male Repal by CelestiaHeart'), ('peg', '[Peg T1 Base] [F] Vanilla +Weapons'), 'lance'),
 'general': (('knight', '[General-Base] Vanilla +Weapons [U]'), ('knight', '[General-Reskin] Female General [F] by RiriK'), 'lance'),
 'great knight': (('cav', '[GK-Base] [U] Vanilla +Weapons'), ('cav', '[GK-Reskin] [F] Ponytail by RiriK'), 'lance'),
 'halberdier': (('lnc', '[Custom Halb] Halberdier +Axes [M] by TBA'), ('lnc', '[Recruit-Amelia] T2 Halberdier [F] by Spud'), 'lance'),
 'hero': (('merc', '[Hero-Base] Vanilla FE7-8 +Weapons [M]'), ('merc', '[Hero-Base] Vanilla FE6 Echidna +Lance [F]'), 'sword'),
 'journeyman': (('fight', '[Journeyman-Base] Vanilla +Weapons [M]'), ('fight', '[Journeyman-Reskin] Long-Haired [F] by Gav333'), 'axe'),
 'knight': (('knight', '[Knight-Base] Vanilla +Weapons [U]'), ('knight', '[Knight-Reskin] Ponytail Repal [F] by Alice'), 'lance'),
 'lord': (('lord', '[FE7 Eliwood-Base] T1 Vanilla +Weapons [M]'), ('lord', '[FE7 Lyn-Base] T1 Vanilla +Axes [F] by Vilkalizer'), 'sword'),
 'mage': (('nat', '[Mage-Base] Vanilla FE7-8 +Fix [M] by Shin19'), ('nat', '[Mage-Base] Vanilla FE7-8 +Fix [F] by Shin19'), 'magic'),
 'light mage': (('nat', '[Mage-Custom] Light Mage [M] by L95'), ('nat', '[Mage-Custom] Light Mage [F] by L95'), 'magic'),
 'mage knight': (('valk', '[MK-Base] Vanilla +Weapons [M]'), ('valk', '[MK-Base] Vanilla +Weapons [F]'), 'magic'),
 'mercenary': (('merc', '[Mercenary-Base] Vanilla FE7-8 +Weapons [M]'), ('merc', '[Mercenary-Variant] Mercenary [F] by SALVAGED'), 'sword'),
 'monk': (('holy', '[Monk-Base] Vanilla FE6-8 [M]'), ('holy', '[Monk-Base] Repal V2 [F]'), 'magic'),
 'myrmidon': (('myrm', '[Myrmidon-Base] Vanilla FE6-8 Generic [M]'), ('myrm', '[Myrmidon-Base] Vanilla FE6 Ponytail +Bow [F]'), 'sword'),
 'necromancer': (('dark', '[T3 Necromancer-Base] Vanilla FE8 Lyon +Weapons [M]'), ('dark', '[T3 Necromancer-Reskin] [F] by TytheBub'), 'magic'),
 'ninja': (('thief', '[Sword Custom] Ninja [M] by Pikmin and Der'), ('thief', '[Sword Custom] Ninja - Kagerou [F] by SteamingTofu'), 'sword'),
 'nomad': (('cav', '[Nomad-Base] [M] Vanilla'), ('cav', '[Nomad-Base] [F] Vanilla'), 'bow'),
 'nomad trooper': (('cav', '[Nomad Trooper Base] [M] FE7 Vanilla +Fix'), ('cav', '[Nomad Trooper Base] [F] Vanilla FE6 +Fix'), 'sword'),
 'oni': (('brig', '[Axe-Custom] Oni Chieftain [M] by Dora Drago'), ('brig', '[Axe-Custom] Oni Chieftain [F] by Dora Drago'), 'axe'),
 'paladin': (('cav', '[Paladin-Base] [M] Vanilla +Weapons'), ('cav', '[Paladin-Base] [F] Vanilla +Weapons'), 'lance'),
 'pirate': (('brig', '[Pirate-Base] Vanilla +Sword [M] by Pimpstick'), ('brig', '[Pirate-Reskin] Variant [F] by Nuramon'), 'axe'),
 'priest': (('holy', '[T1 Priest-Base] Vanilla Priest +Magic [M]'), ('holy', '[T1 Cleric-Base] Vanilla FE6 +Weapons [F]'), 'staff'),
 'pupil': (('nat', '[Pupil-Base] Vanilla FE8 +Staff [M] by Citrus'), ('nat', '[Pupil-Reskin] [F] by SaintRubenio'), 'magic'),
 'ranger': (('cav', '[Ranger-Base] [M] Vanilla +Lance'), ('cav', '[Ranger-Base] [F] Vanilla'), 'sword'),
 'rogue': (('thief', '[Rogue-Base] Vanilla +Staff [M]'), ('thief', '[Rogue-Reskin] Ponytail [F] by Temp'), 'sword'),
 'sage': (('nat', '[Sage-Base] Vanilla FE8 [M]'), ('nat', '[Sage-Base] Vanilla FE8 Lute +Fixes [F]'), 'magic'),
 'shaman': (('dark', '[Shaman-Base] Vanilla +Staff [M]'), ('dark', '[Shaman-Base] Vanilla FE8 [F]'), 'magic'),
 'sniper': (('snip', '[Sniper-Base] Vanilla FE7 + magic [M] by Merpin'), ('snip', '[Sniper-Base] Vanilla FE7 + magic [F] by Merpin'), 'bow'),
 'soldier': (('lnc', '[Soldier-Base] Vanilla +Weapons [M]'), ('lnc', '[Recruit-Amelia] T1 Soldier [F] by Spud'), 'lance'),
 'squire': (('fight', "[Journeyman-Type] Waleed's Squire [M]"), None, 'axe'),
 'summoner': (('dark', '[T2 Summoner-Base] Vanilla +Axes [M]'), ('dark', '[T2 Summoner-Reskin] Generic [F] by Velvet'), 'magic'),
 'swordmaster': (('myrm', '[Swordmaster-Base] Vanilla FE6 [M]'), ('myrm', '[Swordmaster-Base] Vanilla FE7 [F]'), 'sword'),
 'thief': (('thief', '[Thief-Base] Vanilla FE7 Matthew [M]'), ('thief', '[Thief-Base] Cath Vanilla FE6 [F]'), 'sword'),
 'trickster': (('thief', '[Trickster] Trickster V.2 by Leo_Link [M]'), ('thief', '[Trickster] Trickster V.2 [F] by Leo_Link'), 'sword'),
 'troubadour': (('valk', '[Troubadour-Reskin] Deacon v2 Repal +Weapons [M]'), ('valk', '[Troubadour-Base] Vanilla Ponytail +Magic [F]'), 'staff'),
 'valkyrie': (('valk', '[Valkyrie-Reskin] Templar [M] by GabrielKnight'), ('valk', '[Valkyrie-Base] Vanilla +Alt [F]'), 'magic'),
 'villager': (('merc', '[Villager-Custom] Villager [M] by Nuramon'), ('merc', '[Villager-Custom] Villager [F] by Nuramon'), 'sword'),
 'warrior': (('fight', '[Warrior-Base] Vanilla +Magic [M]'), ('fight', '[Warrior-Reskin] Original [F] by Temp'), 'axe'),
 'wyvern knight': (('peg', '[WK Base] [U] Vanilla'), ('peg', '[WK Reskin] [F] Long Hair by Nimbus'), 'lance'),
 'wyvern lord': (('peg', '[WL Base] [U] Vanilla +Weapons'), ('peg', '[WL Reskin] [F] Helmetless'), 'lance'),
 'tactician': (('spec', '[Tactician]  [M] Tactician Mark v1 by Marlon0024'), ('spec', '[Tactician] [F] Tactician Robin'), 'sword'),
}
# personnages (sprite de combat du même nom)
CHARS = {
 'eliwood': ('lord', '[FE7 Eliwood-Base] T1 Vanilla +Weapons [M]', 'sword'), 'eliwood greatlord': ('lord', '[FE7 Eliwood-Base] T2 Vanilla +Weapons [M]', 'sword'),
 'ephraim': ('lord', '[FE8 Ephraim-Base] T1 Vanilla Repack +Weapons +Manakete [M]', 'lance'), 'ephraim greatlord': ('lord', '[FE8 Ephraim-Base] T2 Vanilla +Weapons [M]', 'lance'),
 'erika': ('lord', '[FE8 Eirika-Base] T1 Vanilla +Weapons [F]', 'sword'), 'erika greatlord': ('lord', '[FE8 Eirika-Base] T2 Vanilla +Weapons [F]', 'sword'),
 'hector': ('lord', '[FE7 Hector-Base] T1 Vanilla +Weapons [M]', 'axe'), 'hector greatlord': ('lord', '[FE7 Hector-Base] T2 Vanilla +Magic [M] by Skitty', 'axe'),
 'lyn': ('lord', '[FE7 Lyn-Base] T1 Vanilla +Axes [F] by Vilkalizer', 'sword'), 'lyn greatlord': ('lord', '[FE7 Lyn-Base] T2 Vanilla +Weapons [F]', 'sword'),
 'roy': ('lord', '[FE6 Roy-Base] Vanilla +Magic [M] by Pikmin', 'sword'), 'lilina': ('nat', '[Mage-Base] Vanilla FE6 Lilina +Staff [F]', 'magic'),
 'ninian': ('bard', '[Dancer-Base] [F] Vanilla FE7 Ninian +Weapons', 'dance'), 'elphin': ('bard', '[Bard-Base] [M] Elffin +Weapons', 'staff'),
 'hawkeye': ('brig', '[Berserker-Hawkeye] Base-Vanilla +Weapons [M]', 'axe'), 'athos': ('nat', '[T3 FE7] Archsage Athos +Fixes [M]', 'magic'),
 'rath': ('cav', '[Nomad Trooper Base] [M] FE7 Vanilla +Fix', 'bow'), 'guy sword master': ('myrm', '[Swordmaster-Base] Vanilla FE7 Guy [M]', 'sword'),
 'loyd': ('myrm', '[Swordmaster-Base] Vanilla FE7 Lloyd +Alt Pal [M]', 'sword'),
 'ike lord': ('lord', '[FE9 Lord Custom] Ike Lord [M] by Ngo', 'sword'), 'ike greatlord': ('lord', '[FE10 Lord Custom] Vanguard Ike [M]', 'sword'),
 'chrom': ('lord', '[FE13 Lord Custom] Chrom [M] by Blaze King', 'sword'), 'lucina': ('lord', '[FE7 Eliwood-Variant] T1 Lucina Slash [F] by Caim Van Fang', 'sword'),
 'robin': ('spec', '[Tactician] [U] Tactician by SALVAGED', 'sword'), 'mia': ('myrm', '[Myrmidon-Custom] Mia [F] by Redbean', 'sword'),
 'nephenee': ('lnc', '[Custom Lance] Nephenee [F] by RedBean', 'lance'), 'boyd': ('fight', '[T3 Reaver] Boyd [M] by Mycahel', 'axe'),
 'tharja': ('dark', '[Custom DM] Dark Mage Tharja [F] by SteamingTofu', 'magic'), 'donnel': ('merc', '[Villager-Custom] Villager [M] by Nuramon', 'sword'),
}
ALIAS = {'acher': 'archer', 'cavelier': 'cavalier', 'solder': 'soldier', 'sword master': 'swordmaster', 'spear fighter': 'soldier', 'axe fighter': 'fighter',
         'bandit': 'brigand', 'priestess': 'priest', 'sorcerer': 'druid', 'zihark': 'myrmidon', 'shinon': 'sniper', 'tormod': 'mage', 'astrid': 'paladin',
         'gaius': 'thief', 'lucia': 'myrmidon', 'sword': 'mercenary', 'axe': 'fighter', 'warmage': 'sage', 'woodsman': 'fighter'}
WEAPON_WORDS = {'axe': 'axe', 'handaxe': 'handaxe', 'spear': 'lance', 'lance': 'lance', 'sword': 'sword', 'bow': 'bow', 'staff': 'staff', 'levin': 'magic', 'casting': 'magic'}

def resolve(label):
    l = re.sub(r'\(Iscaneus\)', '', label).strip()
    low = l.lower()
    female = 'female' in low or (re.match(r'(cleric|dancer|valkyrie|troubadour|falcon knight|pegasus|priestess|astrid|lucia)\b', low) is not None) \
        or (low.startswith('mage knight') and 'male' not in low.split())
    base = re.sub(r'\b(alt(ernate)?|female|male|box|\d+)\b', ' ', low)
    base = ' '.join(base.split())
    weapon = None
    for w, k in WEAPON_WORDS.items():
        if re.search(r'\b' + w + r'\b', base): weapon = k
    key = base
    if key in CHARS: c = CHARS[key]; return (c[0], c[1], weapon or c[2], 'char')
    # sans les mots d'arme
    k2 = ' '.join(w for w in base.split() if w not in WEAPON_WORDS or base in ('sword', 'axe', 'spear fighter', 'axe fighter', 'sword master'))
    for cand in (base, k2, ' '.join(k2.split()[:2]), k2.split()[0] if k2 else ''):
        cand = ALIAS.get(cand, cand)
        if cand in CHARS: c = CHARS[cand]; return (c[0], c[1], weapon or c[2], 'char')
        if cand in CLASSES:
            m, f, w0 = CLASSES[cand]
            pick = (f if female else m) or m or f
            return (pick[0], pick[1], weapon or w0, cand)
    return None

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    s = open(os.path.join(here, '..', '..', 'src', 'renderer', 'img', 'generator', 'parts.js'), encoding='utf-8').read()
    P = json.loads(s[s.index('{'):s.rindex('}') + 1])
    out, miss = {}, []
    for p in P['token']:
        r = resolve(p['label'])
        if r: out[p['id']] = {'label': p['label'], 'cat': CAT[r[0]], 'folder': r[1], 'weapon': r[2]}
        else: miss.append(p['label'])
    json.dump(out, open(os.path.join(here, 'attribution.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(len(out), 'sprites de combat associés,', len({(v['cat'], v['folder']) for v in out.values()}), 'animations ; sans correspondance :', miss)
