#!/usr/bin/env python3
"""
Plugins de ressources « un univers = un plugin », à partir d'un dossier de portraits rangé par univers
(un sous-dossier par jeu ou série, comme le Portrait Repository de FE-Repo).

    python3 tools/build_portrait_plugins.py <dossier Face> [plugins]

Pour chaque sous-dossier de <dossier Face>, crée ou met à jour plugins/<id>/ :
  plugin.json                                   kind « ressources », liens vers les personnages du pack FE
  CREDITS.md                                    auteur de chaque portrait (le {Nom} du fichier)
  ressources/personnages/<Univers>/<Perso>/     les portraits, sous leur nom d'origine

Rangement : les variantes d'un même personnage vont dans son dossier (Bartre.png, Bartre_1.png…).
Le nom du personnage est le nom du fichier sans {auteur}, [étiquettes], (variante) ni suffixe _1, _2…
Le dossier <Univers> évite les collisions avec les ressources de base (Lyn, Eliwood…) et entre plugins.

Relancer le script sur un plugin existant ne retire rien : les portraits sont recopiés, les champs
du plugin.json qui ne concernent pas les portraits (version, scripts, autres liens…) sont conservés.
Pour ajouter plus tard sprites de map ou animations de combat, les poser dans
ressources/personnages/<Univers>/<Perso>/ du plugin, puis compléter links (mapSprite, battler).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

IMAGE = re.compile(r'\.(png|gif|jpe?g|webp)$', re.I)

# Dossiers → jeux du pack « Personnages de la série » (src/shared/fe-pack.js) pour relier les portraits
GAMES_OF = {
    'FE 1-3-11-12': ['fe1'],
    'FE 2-15 Echoes': ['fe2'],
    'FE 4-5': ['fe4', 'fe5'],
    'FE 6-7 Blazing Blade': ['fe6', 'fe7'],
    'FE 8 Sacred Stone': ['fe8'],
    'FE 9-10 Radiance': ['fe9', 'fe10'],
    'FE 13 Awakening': ['fe13'],
    'FE 14 Fates': ['fe14'],
    'FE 16 Three Houses': ['fe16'],
    'FE 17 Engage': ['fe17'],
}
# Personnages du pack dont le portrait porte un autre nom dans le dossier (clé « jeu:Nom » → nom du dossier)
ALIASES = {
    'fe4:Ethlyn': 'Ethly', 'fe6:Ellen': 'Elen', "fe13:Lon'qu": 'Lonqu', 'fe13:Robin': 'Robinm',
    'fe14:Corrin': 'Corinm', 'fe16:Byleth': 'Byleth M Sothis', 'fe17:Alear': 'Alear M',
}
SPECIAL_IDS = {'FE +': 'fe-plus', 'FEH': 'fe-heroes', 'FE TCG': 'fe-tcg'}


def fold(s):
    s = unicodedata.normalize('NFD', str(s))
    return ''.join(c for c in s if not unicodedata.combining(c)).lower().strip()


def slug(folder):
    if folder in SPECIAL_IDS:
        return SPECIAL_IDS[folder]
    s = re.sub(r'\(.*?\)', '', folder)
    s = re.sub(r'[^a-z0-9]+', '-', fold(s).replace("'", '')).strip('-')
    return (s or 'univers')[:64]


def parse(filename):
    """« Clive Rosfield (Duke) {Fenriel} [F2E].png » → ('Clive Rosfield', 'Fenriel')"""
    stem = IMAGE.sub('', filename)
    artists = re.findall(r'\{([^}]*)\}', stem)
    name = re.sub(r'\{[^}]*\}|\[[^\]]*\]|\([^)]*\)', ' ', stem)
    name = re.sub(r'_\d+$|_\d+(?=\s*$)', '', name.strip())
    name = re.sub(r'[_\s]+', ' ', name).strip(' -.')
    name = re.sub(r'#U([0-9a-fA-F]{4})', lambda mm: chr(int(mm.group(1), 16)), name)  # Gr#U00e9goire → Grégoire
    name = re.sub(r'[\\/:*?"<>|]+', '', name) or 'Sans nom'
    return name, ', '.join(a.strip() for a in artists if a.strip())


def pack_names(repo):
    """{ 'fe7': ['Eliwood', ...] } lu dans fe-pack.js (node), ou {} si node manque."""
    try:
        out = subprocess.run(['node', '-e',
                              "const P=require('./src/shared/fe-pack.js');"
                              "console.log(JSON.stringify(Object.fromEntries(P.GAMES.map(g=>[g.id,g.characters.map(c=>c[0])]))))"],
                             cwd=repo, capture_output=True, text=True, check=True)
        return json.loads(out.stdout)
    except Exception as e:  # pragma: no cover
        print('  (pack FE illisible, pas de liens :', e, ')')
        return {}


def build(src, dest, repo):
    names = pack_names(repo)
    report = []
    for folder in sorted(os.listdir(src)):
        root = os.path.join(src, folder)
        if not os.path.isdir(root) or folder.startswith('.'):
            continue
        pid = slug(folder)
        pdir = os.path.join(dest, pid)
        base = os.path.join(pdir, 'ressources', 'personnages', folder)
        chars, credits = {}, []
        for dirpath, _, files in os.walk(root):
            sub = os.path.relpath(dirpath, root)
            for f in sorted(files):
                if not IMAGE.search(f):
                    continue
                name, artist = parse(f)
                rel_dir = name if sub == '.' else os.path.join(sub, name)
                out_dir = os.path.join(base, rel_dir)
                os.makedirs(out_dir, exist_ok=True)
                shutil.copy2(os.path.join(dirpath, f), os.path.join(out_dir, f))
                rel = '/'.join(['ressources', 'personnages', folder] + rel_dir.split(os.sep) + [f])
                chars.setdefault(name, []).append((f, rel))
                credits.append((rel_dir.replace(os.sep, ' / '), f, artist))

        # liens vers les personnages du pack : le portrait sans variante, sinon le premier
        links = {}
        for gid in GAMES_OF.get(folder, []):
            for pname in names.get(gid, []):
                want = ALIASES.get(gid + ':' + pname, pname)
                files = next((v for k, v in chars.items() if fold(k) == fold(want)), None)
                if not files:
                    continue
                plain = lambda f: re.sub(r'\{[^}]*\}|\[[^\]]*\]', '', IMAGE.sub('', f)).replace('_', ' ').strip()
                main = next((r for f, r in files if fold(plain(f)) == fold(want)), files[0][1])
                links[gid + ':' + pname] = {'portrait': main}

        n_img = sum(len(v) for v in chars.values())
        desc = (f'Portraits de {len(chars)} personnage(s) de « {folder} » ({n_img} image(s), face sets GBA 128×112). '
                'Sprites de map et animations de combat à venir.')
        mfile = os.path.join(pdir, 'plugin.json')
        m = {}
        if os.path.exists(mfile):
            with open(mfile, encoding='utf-8') as fh:
                m = json.load(fh)
        m.setdefault('id', pid)
        m.setdefault('name', folder)
        m.setdefault('version', '0.1.0')
        m.setdefault('kind', 'ressources')
        if not m.get('description') or str(m['description']).startswith('Portraits de '):
            m['description'] = desc
        m.setdefault('author', 'Portraits : FE-Repo (Klokinator) et leurs auteurs, voir CREDITS.md')
        m.setdefault('ressources', 'ressources')
        lk = m.setdefault('links', {})
        cl = lk.setdefault('characters', {})
        for k, v in links.items():
            cl.setdefault(k, {}).setdefault('portrait', v['portrait'])
        if not cl:
            lk.pop('characters')
        if not lk:
            m.pop('links')
        with open(mfile, 'w', encoding='utf-8') as fh:
            json.dump(m, fh, ensure_ascii=False, indent=1)
            fh.write('\n')

        lines = [f'# {m["name"]} — crédits', '',
                 'Portraits issus du Portrait Repository de FE-Repo (https://github.com/Klokinator/FE-Repo).',
                 'Auteur entre accolades dans le nom de chaque fichier ; « [F2E] » = libre d\'édition (Free to Edit).',
                 'Garder ces crédits dans le jeu (Système › Écran titre et crédits) si ces portraits y sont utilisés.', '',
                 '| Personnage | Fichier | Auteur |', '|---|---|---|']
        lines += [f'| {c} | {f} | {a or "—"} |' for c, f, a in sorted(credits, key=lambda t: (fold(t[0]), t[1]))]
        with open(os.path.join(pdir, 'CREDITS.md'), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines) + '\n')
        report.append((pid, folder, len(chars), n_img, len(links)))
    return report


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dest = sys.argv[2] if len(sys.argv) > 2 else os.path.join(repo, 'plugins')
    rows = build(sys.argv[1], dest, repo)
    for pid, folder, c, n, l in rows:
        print(f'{pid:32} {c:4} perso  {n:4} images  {l:3} liens  ({folder})')
    print(f'{len(rows)} plugins, {sum(r[3] for r in rows)} images')
