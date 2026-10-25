#!/usr/bin/env python3
"""
Animation de combat (format du jeu) à partir d'un GIF d'animation FE GBA (enregistrement 240 × 160 ou 248 × 160
façon FEditor, une seule unité, fond uni).

Un GIF n'a pas de repères de modes (attaque, critique…) : on les donne dans un fichier de réglage .json qui
découpe le GIF par numéros d'images (0 = première image du GIF) :

  {
   "name": "Roy (Seigneur)",
   "source": "FE-Repo — …",
   "facing": "left",
   "stance":   { "frames": [0] },
   "attack":   { "from": 0,  "to": 32, "hit": 7 },
   "critical": { "from": 34, "to": 79, "hit": 20 },
   "ranged":   { "from": 81, "to": 86, "hit": 2 },
   "dodge":    { "frames": [100, 101, 102, 103] }
  }

  from / to : images du GIF incluses ; frames : liste explicite ; hit : indice (dans la section) du coup porté ;
  durées reprises du GIF (ms).

Sortie : <sortie>.png (planche, cases communes, 12 colonnes) et <sortie>.json (méta « battler »).
Les déplacements (ruée vers l'ennemi) sont déjà dans les images : pas d'« approach ».

  python3 tools/gif_to_battler.py animation.gif reglage.json sortie/combat
"""
import hashlib, json, os, sys
import numpy as np
from PIL import Image, ImageSequence

COLS = 12
SECTIONS = ('stance', 'attack', 'critical', 'ranged', 'rangedCritical', 'dodge')


def gif_frames(path):
    im = Image.open(path)
    out = []
    for f in ImageSequence.Iterator(im):
        a = np.array(f.convert('RGBA'))
        out.append((a, int(f.info.get('duration') or 50)))
    bg = out[0][0][0, 0, :3].copy()  # fond : couleur du coin haut gauche
    frames = []
    for a, d in out:
        a = a.copy()
        a[..., 3] = np.where((a[..., :3] == bg).all(2) | (a[..., 3] == 0), 0, 255)
        a = a[:, :240].copy()  # bande de palette des exports FEditor (240..247)
        a[:8, 232:] = 0
        frames.append((a, d))
    return frames


def section_list(spec):
    if 'frames' in spec:
        return list(spec['frames'])
    return list(range(spec['from'], spec['to'] + 1))


def convert(gif, spec):
    frames = gif_frames(gif)
    secs = {k: section_list(spec[k]) for k in SECTIONS if k in spec}
    if 'stance' not in secs:
        secs['stance'] = [secs['attack'][0]]
    used = sorted({i for s in secs.values() for i in s})
    bad = [i for i in used if i >= len(frames)]
    if bad:
        raise SystemExit(f'images absentes du GIF ({len(frames)} images) : {bad}')
    occ = np.zeros(frames[0][0].shape[:2], bool)
    for i in used:
        occ |= frames[i][0][..., 3] > 0
    ys, xs = np.nonzero(occ)
    h, w = occ.shape
    x0, y0, x1, y1 = max(0, xs.min() - 1), max(0, ys.min() - 1), min(w, xs.max() + 2), min(h, ys.max() + 2)
    cw, ch = int(x1 - x0), int(y1 - y0)
    st = frames[secs['stance'][0]][0][..., 3] > 0
    sy, sx = np.nonzero(st)
    feet = sy.max()
    low = sx[sy >= feet - 2]
    ax, ay = int(round((low.min() + low.max() + 1) / 2 - x0)), int(feet + 1 - y0)
    tiles, index = [], {}
    for i in used:
        t = frames[i][0][y0:y1, x0:x1]
        k = hashlib.sha1(t.tobytes()).hexdigest()
        if k not in index:
            index[k] = len(tiles)
            tiles.append(t)
        index[i] = index[k]
    rows = (len(tiles) + COLS - 1) // COLS
    sheet = np.zeros((rows * ch, COLS * cw, 4), np.uint8)
    for n, t in enumerate(tiles):
        sheet[(n // COLS) * ch:(n // COLS + 1) * ch, (n % COLS) * cw:(n % COLS + 1) * cw] = t
    anims = {}
    for name, lst in secs.items():
        a = {'frames': [index[i] for i in lst], 'durations': [max(16, frames[i][1]) for i in lst]}
        if name == 'stance':
            a = {'frames': a['frames'][:1], 'durations': [500], 'loop': True}
        elif name != 'dodge':
            a['hit'] = int(spec[name].get('hit', len(lst) // 2))
            if not 0 <= a['hit'] < len(lst):
                raise SystemExit(f'{name} : hit {a["hit"]} hors de la section ({len(lst)} images)')
        anims[name] = a
    meta = {'type': 'battler', 'name': spec.get('name', os.path.basename(gif)), 'facing': spec.get('facing', 'left'),
            'cell': [cw, ch], 'anchor': [ax, ay], 'columns': COLS, 'count': len(tiles), 'anims': anims}
    if spec.get('source'):
        meta['source'] = spec['source']
    return Image.fromarray(sheet, 'RGBA'), meta


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    gif, spec_path, out = sys.argv[1:]
    img, meta = convert(gif, json.load(open(spec_path, encoding='utf-8')))
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    img.save(out + '.png', optimize=True)
    with open(out + '.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    print(f'{out}.png : {meta["count"]} images de {meta["cell"][0]}×{meta["cell"][1]}, animations : {", ".join(meta["anims"])}')


if __name__ == '__main__':
    main()
