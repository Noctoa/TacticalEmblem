#!/usr/bin/env python3
"""
Plugin « Monstres » (plugins/monstres/) : sprites de map et animations de combat des monstres de FE-Repo.

Sources (dossiers FE-Repo, passés en arguments) :
  --map     <Map Sprites/Monsters - Basic Types>  <Map Sprites/Monsters - Dragons and Special> …
            « <Nom>-stand.png » + « <Nom>-walk.png » (conversion : tools/build_generator_sprites.py)
  --combat  <Battle Animations/Monsters - Basic Types>  <dossier contenant les [Monster-Custom]> …
            un dossier par animation, un sous-dossier par arme (« 1. Sword », « 8. Monster »…) avec ses images
            et son script FEditor (conversion : tools/build_generator_battlers.py) ; dans un dossier mélangé
            (« Mounted - Dismounted, Monsters, Misc »), seuls les dossiers « [Monster-…] » sont pris.

Sortie : plugins/monstres/
  plugin.json        kind « ressources », liens vers les classes monstres FE8 du pack de classes (champs vides seulement)
  CREDITS.md         auteurs de chaque sprite et animation
  ressources/personnages/Monstres/<Famille>/map_<nom>.png + .json      sprite de map
  ressources/personnages/Monstres/<Famille>/combat_<nom>[_<arme>].png + .json   animation de combat (une par arme)

  python3 tools/build_monsters_plugin.py --map "<…>/Map Sprites/Monsters - Basic Types" "<…>/Monsters - Dragons and Special" \
      --combat "<…>/Battle Animations/Monsters - Basic Types" "<…>/Battle Animations/Mounted - Dismounted, Monsters, Misc"
"""
import importlib.util, json, os, re, shutil, sys, tempfile, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'plugins', 'monstres')
BASE = 'ressources/personnages/Monstres'


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPR = load('build_generator_sprites')
BAT = load('build_generator_battlers')

# Famille (dossier) d'un monstre : premier mot(s) du nom de sprite ou étiquette [Famille-…] de l'animation
FAMILY = {
    'spider': 'Bael', 'bael': 'Bael', 'bael widow': 'Bael',
    'skeleton': 'Bonewalker', 'bonewalker': 'Bonewalker',
    'zombie': 'Zombie', 'zombie lich': 'Zombie', 'lich': 'Zombie', 'gore': 'Zombie',
    'centaur': 'Tarvos', 'tarvos': 'Tarvos', 'tarvos armor promo': 'Tarvos',
    'cyclops': 'Cyclops', 'femclops': 'Cyclops',
    'gorgon': 'Gorgon', 'gorgon egg': 'Gorgon', 'lamia': 'Gorgon',
    'goyle': 'Gargoyle', 'gargoyle': 'Gargoyle',
    'mogall': 'Mogall', 'wolf': 'Wolf', 'wolf winged': 'Wolf', 'berserker wolf': 'Wolf', 'phantom': 'Phantom',
    'dragon': 'Dragon', 'dracozombie': 'Dragon', 'feral dragon': 'Dragon', 'blight dragon': 'Dragon', 'duma': 'Dragon',
    'half dragon': 'Dragon', 'dragon horse': 'Dragon',
    'manakete': 'Manakete', 'tiki': 'Manakete',
    'wild wyvern': 'Wyvern', 'wyvern wild': 'Wyvern', 'tamed drake': 'Wyvern', 'improved wild wyvern': 'Wyvern',
    'wild wyvern knight': 'Wyvern', 'wild fellbeast': 'Wyvern',
    'ghost': 'Ghost', 'ghost axe': 'Ghost', 'ghost bow': 'Ghost', 'ghost lance': 'Ghost', 'ghost sword': 'Ghost', 'ghost tome': 'Ghost',
    'living armor': 'Living Armor', 'living armor blue flame': 'Living Armor', 'living armor red flame': 'Living Armor',
    'minotaur': 'Minotaur', 'salamander': 'Salamander', 'skibidi toilet': 'Skibidi Toilet', 'shield': 'Shield', 'shield blank': 'Shield',
    'mermaid': 'Mermaid', 'faoladh': 'Faoladh', 'laguz': 'Laguz', 'djinn': 'Djinn', 'tome': 'Tome',
}

# Classes monstres FE8 (pack de classes) → sprite de map et animation d'origine (Intelligent Systems)
# map : (famille, début du libellé, auteur exigé ou None) ; combat : (dossier d'animation, arme préférée)
CLASSES = {
    'fe8_revenant':       (('Zombie', 'Zombie (U)', 'IS'), ('[Zombie-Base] [U] Revenant Vanilla +Weapons', 'monster')),
    'fe8_entombed':       (('Zombie', 'Zombie (U) Entombed', 'IS'), ('[Zombie-Base] [U] Vanilla Entombed +Ranged', 'monster')),
    'fe8_bonewalker':     (('Bonewalker', 'Bonewalker (U) Sword', 'IS'), ('[Skeleton-Base] [U] Bonewalker Vanilla +Weapons', 'sword')),
    'fe8_bonewalker_arc': (('Bonewalker', 'Bonewalker (U) Bow', 'IS'), ('[Skeleton-Base] [U] Bonewalker Vanilla +Weapons', 'bow')),
    'fe8_wight':          (('Bonewalker', 'Bonewalker (U) Wight Sword', 'IS'), ('[Skeleton-Base] [U] Wight Repal by Teraspark +Weapons', 'sword')),
    'fe8_wight_arc':      (('Bonewalker', 'Bonewalker (U) Wight Bow', 'IS'), ('[Skeleton-Base] [U] Wight Repal by Teraspark +Weapons', 'bow')),
    'fe8_mogall':         (('Mogall', 'Mogall (U)', 'IS'), ('[Mogall-Base] [U] Vanilla FE8 Arch Mogall', 'magic')),
    'fe8_arch_mogall':    (('Mogall', 'Mogall (U) Arch Mogall', 'IS'), ('[Mogall-Base] [U] Vanilla FE8 Arch Mogall', 'magic')),
    'fe8_gargoyle':       (('Gargoyle', 'Goyle (U) T1 Lance', 'IS'), ('[Goyle-Base] [U] Vanilla FE8 Deathgoyle', 'lance')),
    'fe8_deathgoyle':     (('Gargoyle', 'Goyle (U) T2 Lance', 'IS'), ('[Goyle-Base] [U] Vanilla FE8 Deathgoyle', 'lance')),
    'fe8_bael':           (('Bael', 'Bael (U)', 'IS'), ('[Spider-Base] [U] Vanilla FE8 Bael', 'monster')),
    'fe8_elder_bael':     (('Bael', 'Bael (U) Elder', 'IS'), ('[Spider-Base] [U] Elder Bael Vanilla', 'monster')),
    'fe8_mauthe_doog':    (('Wolf', 'Wolf (U) Mauthe Doog', None), ('[Wolf-Base] [U] Hellhound Vanilla', 'monster')),
    'fe8_gwyllgi':        (('Wolf', 'Wolf (U) Gwyllgi', 'IS'), ('[Wolf-Base] [U] Gwyllgi Vanilla', 'monster')),
    'fe8_tarvos':         (('Tarvos', 'Tarvos (M) Axe', 'IS'), ('[Centaur-Base] [M] Vanilla FE8 Maelduin', 'axe')),
    'fe8_maelduin':       (('Tarvos', 'Tarvos (M) Maelduin Axe', 'IS'), ('[Centaur-Base] [M] Vanilla FE8 Maelduin', 'axe')),
    'fe8_gorgon_egg':     (('Gorgon', 'Gorgon Egg (U) Black', 'IS'), ('[Gorgon-Custom] [U] Gorgon Eggs by Ryn', 'monster')),
    'fe8_gorgon':         (('Gorgon', 'Gorgon (U)', 'IS'), ('[Gorgon-Base] [F] Vanilla', 'magic')),
    'fe8_cyclops':        (('Cyclops', 'Cyclops (U) Axe', 'IS'), ('[Cyclops-Base] [U] Vanilla +Bow', 'axe')),
    'fe8_draco_zombie':   (('Dragon', 'Dracozombie (U)', 'IS'), None),
    'fe8_phantom':        (('Phantom', 'Phantom (U)', 'IS'), None),
    'fe8_demon_king':     (('Demon King', 'Demon King (U) Stationary', 'IS'), None),
}


def fold(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower().strip()


def family_of(name):
    n = re.sub(r'\s*[\(\{\[].*$', '', name)
    n = re.sub(r'\s+\d+x\d+\b.*$', '', n, flags=re.I).strip()  # « … 32x32 » : taille, pas un monstre
    f = fold(n)
    if f in FAMILY:
        return FAMILY[f]
    first = f.split(' ')[0]
    return FAMILY.get(first) or (n.title() if n else 'Divers')


def safe(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Za-z0-9]+', '', s.title())[:48] or 'Sprite'


def unique(path, used):
    base, n = path, 2
    while path in used:
        path = f'{base}{n}'; n += 1
    used.add(path)
    return path


def build_maps(dirs, used, credits):
    out = []
    for src in dirs:
        # scan() lit <SRC>/<catégorie>/<dossier>/… : un dossier temporaire ne contenant que celui-ci
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, 'cat'))
        os.symlink(os.path.abspath(src), os.path.join(tmp, 'cat', os.path.basename(src.rstrip('/'))))
        SPR.SRC = tmp
        for e in SPR.scan('cat'):
            r = SPR.convert(e)
            if not r:
                print('  map ignoré :', e['stem']); continue
            img, meta, _, _ = r
            fam = family_of(e['label'])
            # nom du fichier : le libellé sans le sexe (« Bael (U) Elder » → map_BaelElder),
            # puis l'auteur si deux sprites portent le même nom (map_Bael_Pikmin…)
            name = safe(re.sub(r'\s*[\(\[\{][MFU][\)\]\}]\s*', ' ', e['label']))
            ref = f'{BASE}/{fam}/map_{name}'
            if ref in used and e['credits']:
                ref += '_' + safe(e['credits'][0])
            ref = unique(ref, used)
            d = os.path.join(OUT, os.path.dirname(ref)); os.makedirs(d, exist_ok=True)
            img.save(os.path.join(OUT, ref + '.png'), optimize=True)
            json.dump(meta, open(os.path.join(OUT, ref + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            out.append({'family': fam, 'label': e['label'], 'credits': e['credits'], 'ref': ref})
            credits.append(('Sprite de map', fam, e['label'], ', '.join(e['credits']) or '—'))
    return out


def anim_dirs(src):
    for d in sorted(os.listdir(src)):
        p = os.path.join(src, d)
        if not os.path.isdir(p) or d.startswith('[AAA]'):
            continue
        if os.path.basename(src.rstrip('/')).startswith('Monsters') or d.startswith('[Monster'):
            yield d, p


def build_combat(dirs, used, credits):
    out = []
    arrows = set()
    for src in dirs:
        for folder, adir in anim_dirs(src):
            m = re.match(r'^\[([^\]-]+)', folder)
            tag = m.group(1) if m else folder
            name = re.sub(r'^(\[[^\]]*\]\s*|\([^)]*\)\s*)+', '', folder)  # sans [Famille-Type] [M]
            name = re.sub(r'\s*\bby\b.*$', '', name).strip() or tag
            fam = family_of(name) if tag.lower() == 'monster' else FAMILY.get(tag.lower(), tag.title())
            who = BAT.credits_of(adir, folder)
            for wdir in BAT.weapon_dirs(adir):
                kind = BAT.kind_of(wdir) or 'monster'
                wname = re.sub(r'^\d+\.\s*', '', wdir)
                label = f'{name} — {wname}'
                try:
                    r = BAT.convert(os.path.join(adir, wdir), label, kind)
                except Exception as ex:  # images ou script illisibles
                    print('  combat ignoré :', folder, '/', wdir, '→', ex); continue
                if not r:
                    print('  combat ignoré :', folder, '/', wdir); continue
                img, meta = r
                meta['source'] = 'FE-Repo — ' + (', '.join(who) or 'communauté Fire Emblem')
                ref = unique(f'{BASE}/{fam}/combat_{safe(name)}_{safe(wname)}', used)
                d = os.path.join(OUT, os.path.dirname(ref)); os.makedirs(d, exist_ok=True)
                img.save(os.path.join(OUT, ref + '.png'), optimize=True)
                if meta.get('projectiles'):
                    a = os.path.join(d, 'arrow.png')
                    if a not in arrows:
                        BAT.arrow().save(a); arrows.add(a)
                json.dump(meta, open(os.path.join(OUT, ref + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                out.append({'family': fam, 'folder': folder, 'kind': kind, 'weapon': wname, 'ref': ref})
                credits.append(('Animation de combat', fam, label, ', '.join(who) or '—'))
    return out


def class_links(maps, combats):
    links = {}
    for cid, (mp, cb) in CLASSES.items():
        a = {}
        fam, start, who = mp
        cands = [m for m in maps if m['label'].startswith(start) and (who is None or who in m['credits'])]
        if cands:  # libellé le plus proche (le plus court qui commence pareil)
            a['mapSprite'] = min(cands, key=lambda m: len(m['label']))['ref']
        if cb:
            folder, kind = cb
            cs = [c for c in combats if c['folder'] == folder]
            best = [c for c in cs if c['kind'] == kind] or cs
            if best:
                a['battler'] = min(best, key=lambda c: len(c['weapon']))['ref']
        if a:
            links[cid] = a
    return links


def main():
    args = sys.argv[1:]
    if '--map' not in args and '--combat' not in args:
        sys.exit(__doc__)
    groups, cur = {'--map': [], '--combat': []}, None
    for a in args:
        if a in groups:
            cur = a
        elif cur:
            groups[cur].append(a)
    shutil.rmtree(os.path.join(OUT, 'ressources'), ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    used, credits = set(), []
    maps = build_maps(groups['--map'], used, credits)
    combats = build_combat(groups['--combat'], used, credits)
    links = class_links(maps, combats)
    fams = sorted({x['family'] for x in maps + combats})
    mfile = os.path.join(OUT, 'plugin.json')
    m = json.load(open(mfile, encoding='utf-8')) if os.path.exists(mfile) else {}
    m.update({
        'id': 'monstres', 'name': m.get('name', 'Monstres'), 'version': m.get('version', '1.0.0'), 'kind': 'ressources',
        'description': f'Sprites de map ({len(maps)}) et animations de combat ({len(combats)}) des monstres de FE-Repo, '
                       f'rangés par famille ({", ".join(fams)}) dans ressources/personnages/Monstres/. '
                       'Les classes monstres FE8 du pack de classes (Bael, Gorgon, Mogall, Wight, Revenant…) reçoivent leurs sprites d\'origine.',
        'author': m.get('author', 'Tactical Emblem (conversion) — sprites et animations : FE-Repo (Klokinator) et leurs auteurs, voir CREDITS.md'),
        'notice': 'Ressources de fans (Nintendo / Intelligent Systems et communauté) : usage personnel, crédits à conserver.',
        'ressources': 'ressources',
    })
    m.setdefault('links', {})['classes'] = links
    json.dump(m, open(mfile, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    lines = ['# Monstres — crédits', '',
             'Sprites et animations issus de FE-Repo (https://github.com/Klokinator/FE-Repo), auteurs ci-dessous',
             '(« IS » = Intelligent Systems, sprites d\'origine). Garder ces crédits dans le jeu si ces ressources y sont utilisées.', '',
             '| Type | Famille | Ressource | Auteurs |', '|---|---|---|---|']
    lines += [f'| {t} | {f} | {l} | {a} |' for t, f, l, a in sorted(credits, key=lambda c: (c[1], c[0], c[2]))]
    open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{len(maps)} sprites de map, {len(combats)} animations de combat, {len(fams)} familles, {len(links)} classes reliées')
    missing = [c for c in CLASSES if c not in links]
    if missing:
        print('classes sans lien :', missing)


if __name__ == '__main__':
    main()
