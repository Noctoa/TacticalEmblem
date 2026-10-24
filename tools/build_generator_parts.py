#!/usr/bin/env python3
"""
Pièces du générateur de personnage (tools/generator-parts/, d'après « FE Character Creator » de TheFlyingMinotaur) :
planches regroupées par catégorie pour src/renderer/img/generator/.

  <Nom>_Hair.png / <Nom>_Hairb.png   cheveux (devant / derrière le visage), 96 × 96
  <Nom>_Face.png                     visage, 96 × 96
  <Nom>_Armor.png                    tenue, 96 × 96
  <Nom>_Token.png                    figurine de classe, 64 × 64 (devient le sprite de map)

Les pièces ne sont pas en couleurs finales : la composante rouge / 10 donne la teinte à appliquer
(0 contour, 1-3 cheveux, 4-8 peau, 9-11 métal, 12-14 ornements, 15-17 tissu, 18-20 cuir, au-delà blanc).

Sortie : hair.png, hairb.png, face.png, armor.png, token.png (cases alignées en grille) et parts.js
(self.GENERATOR_PARTS = …, lisible sans requête réseau) :
  { cell: { portrait: 96, token: 64 }, cols: 16, hair: [{ id, label, back }], face: [...], armor: [...], token: [...] }
  (back : le cheveu arrière existe ; case = index dans la liste)

  python3 tools/build_generator_parts.py
"""
import json, os, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'generator-parts')
OUT = os.path.join(ROOT, 'src', 'renderer', 'img', 'generator')
COLS = 16
PART = re.compile(r'^(.+)_(Hair|Hairb|Face|Armor|Token)\.png$')


def label(name):
    """« BowKnightAltIscaneus » → « Bow Knight Alt (Iscaneus) », « Peasant12 » → « Peasant 12 »."""
    artist = ''
    m = re.search(r'Iscaneus\d*$', name)
    if m:
        artist, name = ' (Iscaneus)', name[:m.start()] or 'Iscaneus'
    s = re.sub(r'_', ' ', name)
    s = re.sub(r'(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Za-z])', ' ', s)
    return (s[:1].upper() + s[1:]).strip() + artist


# sprites de combat montés (cheval, pégase, vouivre…) : la monture prend les teintes du cuir (CharGen.mountMask)
MOUNTED = re.compile(r'cavalier|cavelier|paladin|bow ?knight|dark ?knight|great ?knight|mage ?knight|nomad|ranger|troubadour|valkyrie|'
                     r'rath|astrid|falcon|pegas|wyvern|griffon|horse|eliwood ?greatlord|ephraim ?greatlord|erika ?greatlord|eirika ?greatlord', re.I)


def sheet(files, cell):
    rows = max(1, (len(files) + COLS - 1) // COLS)
    out = Image.new('RGBA', (COLS * cell, rows * cell))
    for i, f in enumerate(files):
        if f:
            out.paste(Image.open(os.path.join(SRC, f)).convert('RGBA'), ((i % COLS) * cell, (i // COLS) * cell))
    return out


def main():
    parts = {'Hair': {}, 'Hairb': {}, 'Face': {}, 'Armor': {}, 'Token': {}}
    for f in sorted(os.listdir(SRC), key=str.lower):
        m = PART.match(f)
        if m:
            parts[m.group(2)][m.group(1)] = f
    os.makedirs(OUT, exist_ok=True)
    key = lambda n: n.lower()
    hair_names = sorted(set(parts['Hair']) | set(parts['Hairb']), key=key)
    index = {'cell': {'portrait': 96, 'token': 64}, 'cols': COLS, 'source': 'FE Character Creator (TheFlyingMinotaur), pièces de la communauté Fire Emblem (FE-Repo)'}
    index['hair'] = [{'id': n, 'label': label(n), 'front': n in parts['Hair'], 'back': n in parts['Hairb']} for n in hair_names]
    sheet([parts['Hair'].get(n) for n in hair_names], 96).save(os.path.join(OUT, 'hair.png'), optimize=True)
    sheet([parts['Hairb'].get(n) for n in hair_names], 96).save(os.path.join(OUT, 'hairb.png'), optimize=True)
    for kind, cell in (('Face', 96), ('Armor', 96), ('Token', 64)):
        names = sorted(parts[kind], key=key)
        index[kind.lower()] = [dict({'id': n, 'label': label(n)}, **({'mount': True} if kind == 'Token' and MOUNTED.search(n) else {})) for n in names]
        sheet([parts[kind][n] for n in names], cell).save(os.path.join(OUT, kind.lower() + '.png'), optimize=True)
    with open(os.path.join(OUT, 'parts.js'), 'w', encoding='utf-8') as f:
        f.write('/* Généré par tools/build_generator_parts.py — ne pas modifier à la main. */\nself.GENERATOR_PARTS = ')
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print({k: len(v) for k, v in index.items() if isinstance(v, list)})


if __name__ == '__main__':
    main()
