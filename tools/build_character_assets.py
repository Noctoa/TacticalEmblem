#!/usr/bin/env python3
"""
Ajoute aux plugins de portraits (plugins/<univers>/) les sprites de map et animations de combat de FE-Repo
qui portent le nom d'un de leurs personnages (« Lord (F) Lyn Sword », « [FE7 Lyn-Base] … », « Ephraim-Style »…).

  python3 tools/build_character_assets.py <dossier contenant « Map Sprites » et/ou « Battle Animations »>

Pour chaque personnage ressources/personnages/<Univers>/<Perso>/ d'un plugin (hors generic-characters et monstres) :
  map_<libellé>.png + .json                  sprite de map (tools/build_generator_sprites.py)
  combat_<animation>_<arme>.png + .json      animation de combat, une par arme (tools/build_generator_battlers.py)

Un sprite dont le nom correspond à des personnages de plusieurs plugins va dans les jeux Fire Emblem (fe-*) en priorité,
et dans celui dont le numéro de jeu est cité (« FE7 », « FE8 »…) quand il y en a un.
Les liens links.characters (« fe7:Lyn ») reçoivent mapSprite / battler s'ils n'en ont pas : le sprite d'origine (IS,
« Vanilla ») en priorité. Relancer le script remplace les map_* et combat_* générés, pas les portraits.
"""
import importlib.util, json, os, re, sys, tempfile, unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.path.join(ROOT, 'plugins')
SKIP_PLUGINS = {'generic-characters', 'monstres', 'invocations'}
# noms de personnages qui sont aussi des noms de classes, d'armes ou de couleurs : jamais pris seuls
STOP = set('''lance soldier fighter hero valkyrie swordmaster assassin villager dragon red blue legion rat link remake hoshidan
python wolf shield wyvern tome ghost phantom manakete knight mage archer thief cleric priest sage monk bard dancer general lord
king queen prince princess noble dead base custom vanilla repal generic green black white gold silver dark light fire ice wind
thunder axe sword bow staff magic naga'''.split())
WEAPON_ORDER = ['sword', 'lance', 'axe', 'bow', 'magic', 'staff', 'unarmed', 'monster', 'dance']


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPR = load('build_generator_sprites')
BAT = load('build_generator_battlers')


def fold(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()


def safe(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Za-z0-9]+', '', s.title())[:48] or 'Sprite'


def games_of(pid):
    """fe-6-7-blazing-blade → {6, 7} ; autres plugins → set()"""
    m = re.match(r'^fe-((?:\d+-)*\d+)', pid)
    return {int(x) for x in m.group(1).split('-')} if m else set()


def characters():
    chars = defaultdict(list)   # nom plié → [(plugin, univers, dossier)]
    for p in sorted(os.listdir(PLUGINS)):
        b = os.path.join(PLUGINS, p, 'ressources', 'personnages')
        if p in SKIP_PLUGINS or not os.path.isdir(b):
            continue
        for u in sorted(os.listdir(b)):
            for c in sorted(os.listdir(os.path.join(b, u))):
                if os.path.isdir(os.path.join(b, u, c)):
                    chars[fold(c)].append((p, u, c))
    return chars


class Matcher:
    def __init__(self, chars):
        self.chars = chars
        self.names = sorted((n for n in chars if len(n) >= 3 and n not in STOP), key=len, reverse=True)
        self.pat = {n: re.compile(r'(?<![a-z0-9])' + re.escape(n) + r"(?![a-z0-9]|'s\b)") for n in self.names}

    def find(self, label):
        label = re.sub(r"\b\w+_\w+'s\b|\bDer's\b|Strong Guy", ' ', label)  # noms d'auteurs, « costaud »
        f = fold(label).replace('_', ' ')
        hits = []
        for n in self.names:
            if self.pat[n].search(f) and not any(n in h for h in hits):
                hits.append(n)
        return hits

    def targets(self, label):
        """[(plugin, univers, dossier)] où ranger une ressource dont le libellé est label"""
        cited = {int(x) for x in re.findall(r'\bFE ?(\d{1,2})\b', label, re.I)}
        out = []
        for n in self.find(label):
            cands = self.chars[n]
            fe = [c for c in cands if games_of(c[0])]
            if fe:
                cands = fe
                hit = [c for c in cands if games_of(c[0]) & cited]
                if hit:
                    cands = hit
            out += [c for c in cands if c not in out]
        return out


def clean_generated(chars):
    for lst in chars.values():
        for p, u, c in lst:
            d = os.path.join(PLUGINS, p, 'ressources', 'personnages', u, c)
            for f in os.listdir(d):
                if (re.match(r'^(map|combat)_.*\.(png|json)$', f) and not re.search(r'Perso\.(png|json)$', f)) or f == 'arrow.png':
                    os.remove(os.path.join(d, f))


def main(src):
    chars = characters()
    M = Matcher(chars)
    clean_generated(chars)
    added = defaultdict(lambda: {'map': [], 'combat': []})   # (plugin, univers, dossier) → ressources
    credits = defaultdict(list)                              # plugin → lignes
    used = set()

    def place(t, kind, name, writer):
        p, u, c = t
        rel = f'ressources/personnages/{u}/{c}/{kind}_{name}'
        base, k = rel, 2
        while rel in used:
            rel = f'{base}{k}'; k += 1
        used.add(rel)
        writer(os.path.join(PLUGINS, p, rel))
        return rel

    # sprites de map
    msrc = os.path.join(src, 'Map Sprites')
    if os.path.isdir(msrc):
        SPR.SRC = os.path.dirname(msrc)
        for cat in sorted(os.listdir(msrc)):
            if not os.path.isdir(os.path.join(msrc, cat)):
                continue
            tmp = tempfile.mkdtemp(); os.makedirs(os.path.join(tmp, 'c'))
            os.symlink(os.path.join(msrc, cat), os.path.join(tmp, 'c', cat))
            SPR.SRC = tmp
            for e in SPR.scan('c'):
                ts = M.targets(e['label'])
                if not ts:
                    continue
                r = SPR.convert(e)
                if not r:
                    continue
                img, meta, _, _ = r
                name = safe(re.sub(r'\s*[\(\[\{][MFU][\)\]\}]\s*', ' ', e['label']))
                for t in ts:
                    def w(path, img=img, meta=meta):
                        img.save(path + '.png', optimize=True)
                        json.dump(meta, open(path + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                    rel = place(t, 'map', name, w)
                    added[t]['map'].append({'ref': rel, 'label': e['label'], 'credits': e['credits']})
                    credits[t[0]].append(('Sprite de map', t[2], e['label'], ', '.join(e['credits']) or '—'))

    # animations de combat
    bsrc = os.path.join(src, 'Battle Animations')
    if os.path.isdir(bsrc):
        for cat in sorted(os.listdir(bsrc)):
            cdir = os.path.join(bsrc, cat)
            if not os.path.isdir(cdir):
                continue
            for folder in sorted(os.listdir(cdir)):
                adir = os.path.join(cdir, folder)
                if not os.path.isdir(adir):
                    continue
                label = re.sub(r'\s*\bby\b.*$', '', folder)
                ts = M.targets(label)
                if not ts:
                    continue
                who = BAT.credits_of(adir, folder)
                title = re.sub(r'^(\[[^\]]*\]\s*)+', '', label).strip() or label
                for wdir in BAT.weapon_dirs(adir):
                    kind = BAT.kind_of(wdir) or 'unarmed'
                    wname = re.sub(r'^\d+\.\s*', '', wdir)
                    try:
                        r = BAT.convert(os.path.join(adir, wdir), f'{title} — {wname}', kind)
                    except Exception as ex:
                        print('  ignoré :', folder, '/', wdir, '→', ex); continue
                    if not r:
                        continue
                    img, meta = r
                    meta['source'] = 'FE-Repo — ' + (', '.join(who) or 'communauté Fire Emblem')
                    for t in ts:
                        def w(path, img=img, meta=meta):
                            img.save(path + '.png', optimize=True)
                            if meta.get('projectiles'):
                                BAT.arrow().save(os.path.join(os.path.dirname(path), 'arrow.png'))
                            json.dump(meta, open(path + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                        rel = place(t, 'combat', f'{safe(title)}_{safe(wname)}', w)
                        added[t]['combat'].append({'ref': rel, 'folder': folder, 'kind': kind, 'weapon': wname})
                        credits[t[0]].append(('Animation de combat', t[2], f'{folder} — {wname}', ', '.join(who) or '—'))

    # fiches des plugins : liens, description, version, crédits
    by_plugin = defaultdict(dict)
    for (p, u, c), a in added.items():
        by_plugin[p][(u, c)] = a
    for p, persos in sorted(by_plugin.items()):
        mfile = os.path.join(PLUGINS, p, 'plugin.json')
        m = json.load(open(mfile, encoding='utf-8'))
        nm = sum(len(a['map']) for a in persos.values()); nc = sum(len(a['combat']) for a in persos.values())
        m['description'] = re.sub(r'\s*Sprites de map et animations de combat (à venir|:[^.]*)\.?', '', m.get('description', '')).strip()
        m['description'] += f' Sprites de map ({nm}) et animations de combat ({nc}) de {len(persos)} personnage(s), d\'après FE-Repo.'
        if m.get('version', '0.1.0') < '0.2.0':
            m['version'] = '0.2.0'
        links = m.get('links', {}).get('characters', {})
        for a in links.values():  # liens posés par une exécution précédente : recalculés
            for f, pre in (('mapSprite', '/map_'), ('battler', '/combat_')):
                if pre in a.get(f, ''):
                    del a[f]
        for key, a in links.items():
            port = a.get('portrait', '')
            mm = re.match(r'^ressources/personnages/([^/]+)/([^/]+)/', port)
            got = persos.get((mm.group(1), mm.group(2))) if mm else None
            if not got:
                continue
            if got['map'] and not a.get('mapSprite'):
                best = sorted(got['map'], key=lambda x: ('dead' in x['label'].lower(), 'IS' not in x['credits'], len(x['label'])))[0]
                a['mapSprite'] = best['ref']
            if got['combat'] and not a.get('battler'):
                def rank(x):
                    k = x['kind'] if x['kind'] in WEAPON_ORDER else 'zz'
                    return ('vanilla' not in x['folder'].lower(), WEAPON_ORDER.index(k) if k in WEAPON_ORDER else 99, len(x['weapon']), x['folder'])
                a['battler'] = sorted(got['combat'], key=rank)[0]['ref']
        json.dump(m, open(mfile, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        open(mfile, 'a', encoding='utf-8').write('\n')
        cfile = os.path.join(PLUGINS, p, 'CREDITS.md')
        text = open(cfile, encoding='utf-8').read() if os.path.exists(cfile) else f'# {m["name"]} — crédits\n'
        text = text.split('\n## Sprites de map et animations de combat')[0].rstrip() + '\n'
        rows = sorted(set(credits[p]), key=lambda r: (fold(r[1]), r[0], r[2]))
        text += ('\n## Sprites de map et animations de combat\n\n'
                 'Issus de FE-Repo (https://github.com/Klokinator/FE-Repo) ; « IS » = Intelligent Systems.\n\n'
                 '| Type | Personnage | Ressource | Auteurs |\n|---|---|---|---|\n')
        text += ''.join(f'| {t} | {c} | {l} | {w} |\n' for t, c, l, w in rows)
        open(cfile, 'w', encoding='utf-8').write(text)
        print(f'{p:30} {len(persos):3} perso  {nm:4} map  {nc:4} combat')
    print('total :', sum(len(a['map']) for a in added.values()), 'sprites de map,',
          sum(len(a['combat']) for a in added.values()), 'animations de combat,', len(added), 'personnages')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
