#!/usr/bin/env python3
"""
Range les ressources découpées par build_fe_gba_pack.py (dossier de travail build/fe-gba) en plugins séparés
par jeu, dans plugins/<id>/ :

  plugin.json            fiche du plugin (nom, version, description) + liens : personnages du pack de
                         personnages FE, classes, fonds de combat par terrain
  ressources/...         fichiers copiés dans le projet à l'installation (sans rien écraser)

  python3 tools/split_fe_gba_plugins.py
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from fe_gba_overrides import CHAR_NAMES, CLASS_IDS, TERRAIN_BATTLEBACKS  # noqa: E402

STAGE = os.path.join(ROOT, 'build', 'fe-gba')
PLUGINS = os.path.join(ROOT, 'plugins')
RP = 'ressources/personnages/'

PACKS = {
    'FE6': {'id': 'fe6-binding-blade', 'name': 'Fire Emblem 6 — The Binding Blade', 'game': 'fe6',
            'description': "Animations de combat, sprites de map, portraits et fonds de combat de Fire Emblem 6 (rips The Spriters Resource)."},
    'FE7': {'id': 'fe7-blazing-blade', 'name': 'Fire Emblem 7 — The Blazing Blade', 'game': 'fe7',
            'description': "Animations de combat, sprites de map et portraits de Fire Emblem 7 (rips The Spriters Resource)."},
    'FE8': {'id': 'fe8-sacred-stones', 'name': 'Fire Emblem 8 — The Sacred Stones', 'game': 'fe8',
            'description': "Animations de combat, sprites de map et portraits de Fire Emblem 8 (rips The Spriters Resource)."},
    'CUSTOM': {'id': 'customs-style-gba', 'name': 'Customs « style FE GBA » (Final Fantasy, Zelda, Kingdom Hearts)', 'game': '',
               'description': "Animations de combat de personnages d'autres séries redessinés façon Fire Emblem GBA (crédits sur les planches d'origine)."},
}
CODES = [('FE6', 'FE6'), ('FE7', 'FE7'), ('FE8', 'FE8'), ('FF1', 'CUSTOM'), ('FF7', 'CUSTOM'), ('KH', 'CUSTOM'), ('Zelda', 'CUSTOM')]
GAME_ORDER = ['FE7', 'FE8', 'FE6']
PROMOTED = ('great', 'master', 'knightlord', 'swordmaster', 'druid', 'trooper', 'bishop', 'sniper', 'paladin', 'general', 'hero', 'warrior',
            'sage', 'valkyrie', 'falcon', 'wyvernlord', 'berserker', 'assassin', 'ranger')
FEMALE_CLASSES = ('cleric', 'pegasus', 'fe_troubadour', 'fe_valkyrie', 'fe_dancer', 'fe_falcon')
VERSION = '1.0.0'


def code_in(text):
    for code, pack in CODES:
        if re.search(r'(?<![A-Za-z])' + code if code.startswith('FE') else code, text):
            return pack
    m = re.search(r'Fire Emblem (6|7|8)', text)
    return 'FE' + m.group(1) if m else None


def pack_of_file(owner, fname, folder):
    """Jeu d'un fichier : code dans le nom, sinon dans le .json voisin, sinon le jeu du personnage."""
    hit = code_in(fname)
    if hit:
        return hit
    stem = re.sub(r'(_arrow)?\.(png|json)$', '', fname)
    js = os.path.join(folder, stem + '.json')
    if os.path.exists(js):
        meta = json.load(open(js))
        hit = code_in(meta.get('name', '') + ' ' + meta.get('source', ''))
        if hit:
            return hit
    ch = CHAR_NAMES.get(owner)
    if ch:
        return ch.split(':')[0].upper()
    return None


def pick(keys, prefer_games=False, female=False):
    def score(k):
        low = k.lower()
        promoted = any(w in low for w in PROMOTED)
        g = next((i for i, x in enumerate(GAME_ORDER) if x.lower() in low), len(GAME_ORDER))
        sex = ('female' in low) != female
        return (promoted, sex, g if prefer_games else 0, len(k))
    return sorted(keys, key=score)[0] if keys else None


def main():
    if not os.path.isdir(STAGE):
        raise SystemExit(f'{STAGE} absent : lancer d\'abord tools/build_fe_gba_pack.py')
    perso = os.path.join(STAGE, 'ressources', 'personnages')
    files = {k: [] for k in PACKS}  # pack -> [(chemin relatif dans ressources/, source)]
    unknown = []
    for owner in sorted(os.listdir(perso)):
        folder = os.path.join(perso, owner)
        if not os.path.isdir(folder):
            continue
        if owner.startswith('Portraits '):
            pk = owner.split(' ')[1]
            for f in os.listdir(folder):
                files[pk].append(('personnages/' + owner + '/' + f, os.path.join(folder, f)))
            continue
        placed = {}
        for f in sorted(os.listdir(folder)):
            if f == 'portrait.png':
                continue
            pk = pack_of_file(owner, f, folder)
            if not pk:
                unknown.append(owner + '/' + f); continue
            files[pk].append(('personnages/' + owner + '/' + f, os.path.join(folder, f)))
            placed[pk] = True
        if os.path.exists(os.path.join(folder, 'portrait.png')):
            ch = CHAR_NAMES.get(owner)
            targets = [ch.split(':')[0].upper()] if ch and ch.split(':')[0].upper() in placed else list(placed) or ([ch.split(':')[0].upper()] if ch else [])
            for pk in targets:
                files[pk].append(('personnages/' + owner + '/portrait.png', os.path.join(folder, 'portrait.png')))
    bb = os.path.join(STAGE, 'ressources', 'fonds-combat')
    if os.path.isdir(bb):
        for f in os.listdir(bb):
            pk = code_in(f.upper()) or 'FE6'
            files[pk].append(('fonds-combat/' + f, os.path.join(bb, f)))
    if unknown:
        print('  ⚠ jeu inconnu (ignorés) :', ', '.join(unknown))

    for pk, spec in PACKS.items():
        out = os.path.join(PLUGINS, spec['id'])
        if os.path.isdir(out):
            shutil.rmtree(out)
        for rel, src in files[pk]:
            dst = os.path.join(out, 'ressources', rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
        # liens : personnages, classes, fonds de combat
        owners = {}
        for rel, _ in files[pk]:
            parts = rel.split('/')
            if parts[0] != 'personnages' or parts[1].startswith('Portraits '):
                continue
            o = owners.setdefault(parts[1], {'battlers': [], 'maps': [], 'portrait': False})
            name = parts[2]
            if name == 'portrait.png':
                o['portrait'] = True
            elif name.endswith('.json'):
                (o['battlers'] if name.startswith('combat') else o['maps']).append(name[:-5])
        characters, classes, battlebacks = {}, {}, {}
        for owner, o in owners.items():
            key = CHAR_NAMES.get(owner)
            if not key or (spec['game'] and not key.startswith(spec['game'] + ':')):
                continue
            e = {'folder': owner}
            if o['portrait']:
                e['portrait'] = RP + owner + '/portrait.png'
            if o['battlers']:
                e['battler'] = RP + owner + '/' + pick(o['battlers'])
            if o['maps']:
                e['mapSprite'] = RP + owner + '/' + pick(o['maps'])
            characters[key] = e
        for label, cid in CLASS_IDS.items():
            o = owners.get(label)
            if not o or CHAR_NAMES.get(label) or pk == 'CUSTOM':
                continue
            fem = cid in FEMALE_CLASSES
            e = {'folder': label}
            if o['battlers']:
                e['battler'] = RP + label + '/' + pick(o['battlers'], True, fem)
            if o['maps']:
                e['mapSprite'] = RP + label + '/' + pick(o['maps'], True, fem)
            if len(e) > 1 and cid not in classes:
                classes[cid] = e
        have = {rel.split('/', 1)[1] for rel, _ in files[pk] if rel.startswith('fonds-combat/')}
        for terrain, name in TERRAIN_BATTLEBACKS.items():
            if name in have:
                battlebacks[terrain] = 'ressources/fonds-combat/' + name
        manifest = {
            'id': spec['id'], 'name': spec['name'], 'version': VERSION, 'kind': 'ressources',
            'description': spec['description'],
            'author': 'Tactics Forge (découpe) — planches : The Spriters Resource et leurs auteurs',
            'notice': "Ressources de fans et de leurs éditeurs (Nintendo / Intelligent Systems, Square Enix) : usage personnel.",
            'ressources': 'ressources',
            'links': {'characters': characters, 'classes': classes, 'battlebacks': battlebacks},
            'scripts': []
        }
        os.makedirs(out, exist_ok=True)
        json.dump(manifest, open(os.path.join(out, 'plugin.json'), 'w'), indent=1, ensure_ascii=False)
        n = sum(1 for r, _ in files[pk])
        print(f'  {spec["id"]} : {n} fichiers, {len(characters)} personnages, {len(classes)} classes, {len(battlebacks)} fonds')


if __name__ == '__main__':
    main()
