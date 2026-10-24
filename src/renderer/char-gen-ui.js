/*
 * Fenêtre du générateur de personnage (éditeur : fiche d'une unité ; jeu : création du protagoniste).
 * Calculs dans shared/char-gen.js ; pièces dans img/generator (tools/build_generator_parts.py).
 *
 *   CharGenUI.open({ recipe, name, askName, title, game, cancel: true }) → Promise<null | {
 *     recipe, name, faceset: canvas 128×112, portrait: canvas 96×96, map: { canvas, meta } }>
 *   CharGenUI.render(recipe, { name }) → Promise<même résultat sans fenêtre> (jeu : recette sauvegardée)
 *   CharGenUI.load() → Promise<parts> (planches chargées ; parts.sprite = bibliothèque de sprites FE)
 */
(function (root) {
  'use strict';
  const C = root.CharGen;
  const KINDS = [['hair', 'Cheveux'], ['face', 'Visage'], ['armor', 'Tenue'], ['token', 'Figurine (sprite de map)'], ['sprite', 'Sprite de map animé (FE)']];
  const OFFSET_KINDS = [['hair', 'Cheveux'], ['face', 'Visage'], ['armor', 'Tenue']];
  const SHEETS = ['hair', 'hairb', 'face', 'armor', 'token', 'sprites-thumbs'];
  let loading = null;
  const pixels = {}; // feuille → { data, width }
  const h = (tag, attrs, ...children) => UI.h(tag, attrs, ...children);

  function load() {
    if (loading) return loading;
    const parts = root.GENERATOR_PARTS;
    if (!parts) return Promise.reject(new Error('Pièces du générateur absentes (img/generator/parts.js).'));
    parts.sprite = (root.GENERATOR_SPRITES && root.GENERATOR_SPRITES.list) || [];
    loading = Promise.all(SHEETS.filter(n => n !== 'sprites-thumbs' || parts.sprite.length).map(name => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        pixels[name] = { data: g.getImageData(0, 0, cv.width, cv.height).data, width: cv.width };
        resolve();
      };
      img.onerror = () => reject(new Error('Planche introuvable : img/generator/' + name + '.png'));
      img.src = 'img/generator/' + name + '.png';
    }))).then(() => parts);
    loading.catch(() => { loading = null; });
    return loading;
  }
  /** Planches des sprites FE déjà chargées : id → canvas 128 × 192. */
  const spriteSheets = {};
  /** Charge la planche d'un sprite FE (img/generator/sprites/<id>.png). */
  function loadSprite(id) {
    if (!id || spriteSheets[id]) return Promise.resolve(spriteSheets[id] || null);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0); spriteSheets[id] = cv; resolve(cv);
      };
      img.onerror = () => resolve(null); // sprite introuvable : on garde la figurine
      img.src = 'img/generator/sprites/' + id + '.png';
    });
  }
  /** Pixels RGBA d'une case (pièce n° index de la feuille). */
  function cell(sheet, index, size) {
    const P = pixels[sheet], cols = sheet === 'sprites-thumbs' ? root.GENERATOR_SPRITES.cols : root.GENERATOR_PARTS.cols;
    if (!P || index < 0) return null;
    const out = new Uint8ClampedArray(size * size * 4), x0 = (index % cols) * size, y0 = Math.floor(index / cols) * size;
    for (let y = 0; y < size; y++) out.set(P.data.subarray(((y0 + y) * P.width + x0) * 4, ((y0 + y) * P.width + x0 + size) * 4), y * size * 4);
    let any = false; for (let i = 3; i < out.length; i += 4) if (out[i]) { any = true; break; }
    return any ? out : null;
  }
  const indexOf = (kind, id) => (id ? root.GENERATOR_PARTS[kind].findIndex(p => p.id === id) : -1);
  function layers(recipe) {
    const i = indexOf('hair', recipe.hair);
    return { hair: cell('hair', i, 96), hairb: cell('hairb', i, 96), face: cell('face', indexOf('face', recipe.face), 96), armor: cell('armor', indexOf('armor', recipe.armor), 96) };
  }
  function toCanvas(data, w, hgt) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, hgt), 0, 0);
    return cv;
  }
  /** Portrait, face set et sprite de map d'une recette (planches déjà chargées). */
  function build(recipe, name) {
    const L = layers(recipe);
    const portrait = C.composePortrait(L, recipe);
    const fs = C.faceset(portrait, L.face);
    const token = C.composeToken(cell('token', indexOf('token', recipe.token), 64), recipe);
    const entry = recipe.sprite && root.GENERATOR_PARTS.sprite && root.GENERATOR_PARTS.sprite.find(p => p.id === recipe.sprite);
    let mapOut;
    if (entry && spriteSheets[entry.id]) { // sprite FE : sa planche telle quelle (couleurs d'équipe détectées en jeu)
      const src = spriteSheets[entry.id], cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      mapOut = { canvas: cv, meta: C.spriteMeta(entry, name || 'Personnage généré') };
    } else {
      const map = C.mapSprite(token, { name: name || 'Personnage généré', teamColors: C.teamColors(recipe) });
      mapOut = { canvas: toCanvas(map.data, map.width, map.height), meta: map.meta };
    }
    return { recipe, name, portrait: toCanvas(portrait, 96, 96), faceset: toCanvas(fs.data, fs.width, fs.height),
      map: mapOut, token: toCanvas(token, 64, 64) };
  }
  async function render(recipe, opts = {}) {
    const parts = await load();
    const r = C.normalize(recipe, parts);
    await loadSprite(r.sprite);
    return build(r, opts.name);
  }

  /** Vignette d'une pièce recolorée avec les couleurs de la recette. */
  function thumb(kind, index, recipe, size) {
    const cv = document.createElement('canvas');
    if (kind === 'sprite') {
      const t = cell('sprites-thumbs', index, 32);
      cv.width = 32; cv.height = 32; if (t) cv.getContext('2d').putImageData(new ImageData(t, 32, 32), 0, 0);
    } else if (kind === 'token') {
      const t = C.composeToken(cell('token', index, 64), recipe);
      cv.width = 64; cv.height = 64; cv.getContext('2d').putImageData(new ImageData(t, 64, 64), 0, 0);
    } else {
      const L = { hair: null, hairb: null, face: null, armor: null };
      if (kind === 'hair') { L.hair = cell('hair', index, 96); L.hairb = cell('hairb', index, 96); } else L[kind] = cell(kind, index, 96);
      const p = C.composePortrait(L, Object.assign({}, recipe, { offsets: { hair: [0, 0], face: [0, 0], armor: [0, 0] } }));
      cv.width = 96; cv.height = 96; cv.getContext('2d').putImageData(new ImageData(p, 96, 96), 0, 0);
    }
    cv.className = 'cg-thumb'; cv.style.width = cv.style.height = size + 'px';
    return cv;
  }

  function open(opts = {}) {
    return load().then(parts => new Promise((resolve) => {
      let recipe = C.normalize(opts.recipe || C.defaults(parts, opts.name), parts);
      let name = opts.name || '';
      const back = h('div', { class: 'cg-back' + (opts.game ? ' cg-game' : '') });
      const win = h('div', { class: 'cg-win', role: 'dialog', 'aria-label': opts.title || 'Générateur de personnage' });
      back.append(win);
      const big = h('canvas', { class: 'cg-portrait', width: 96, height: 80, 'data-cg-portrait': true });
      const sprite = h('canvas', { class: 'cg-sprite', width: 64, height: 64, 'data-cg-sprite': true });
      let result = null, sheet = null;
      const refresh = () => {
        result = build(recipe, name);
        const g = big.getContext('2d'); g.clearRect(0, 0, 96, 80); g.drawImage(result.portrait, 0, C.FACESET.top, 96, 80, 0, 0, 96, 80);
        sheet = result.map;
        for (const el of win.querySelectorAll('[data-cg-label]')) { const k = el.dataset.cgLabel, p = parts[k].find(x => x.id === recipe[k]); el.textContent = p ? p.label : (k === 'sprite' ? 'Aucun (figurine)' : 'Aucun'); }
        const tokRow = win.querySelector('[data-cg-row="token"]'); if (tokRow) tokRow.classList.toggle('cg-unused', !!(recipe.sprite && spriteSheets[recipe.sprite]));
        refreshColors();
        for (const el of win.querySelectorAll('[data-cg-offset]')) { const [k, a] = el.dataset.cgOffset.split(':'); el.textContent = String(recipe.offsets[k][+a]); }
      };
      /** État des couleurs : onglet, pastilles des teintes, dégradé choisi, aperçu du combat. */
      function refreshColors() {
        for (const el of win.querySelectorAll('[data-cg-tab]')) el.classList.toggle('on', el.dataset.cgTab === cstate.tab);
        const t = cstate.tab === 'battle' ? null : target();
        if (t) {
          const pal = C.palette(t.colors, t.ramps), eyes = C.eyePalette(t.colors, t.ramps);
          const current = (g) => (g === 'eyes' ? (eyes || pal.slice(1, 4)) : pal.slice(C.RAMP_INDEX[g], C.RAMP_INDEX[g] + C.RAMP_SIZE[g])).map(c => C.hex(c));
          for (const el of win.querySelectorAll('[data-cg-chip-sw]')) el.style.background = gradient(current(el.dataset.cgChipSw));
          for (const el of win.querySelectorAll('[data-cg-color]')) el.value = t.colors[el.dataset.cgColor] || t.colors.hair;
          const eh = win.querySelector('[data-cg-eyes-hair]'); if (eh) eh.classList.toggle('on', !t.colors.eyes);
        }
        for (const el of win.querySelectorAll('[data-cg-ramp]')) {
          const [g, i] = el.dataset.cgRamp.split(':'), list = g === 'skin' ? C.SKIN_RAMPS : C.HAIR_RAMPS;
          const chosen = g === 'battle' ? recipe.battle && recipe.battle.ramp : t && t.ramps && t.ramps[g];
          el.classList.toggle('on', !!(chosen && chosen.join() === list[+i].join()));
        }
        const bo = win.querySelector('[data-cg-battle-origin]'); if (bo) bo.classList.toggle('on', !recipe.battle);
        if (opts.battler && battleCv.isConnected) {
          const { meta, image } = opts.battler, g = battleCv.getContext('2d');
          g.clearRect(0, 0, battleCv.width, battleCv.height); g.imageSmoothingEnabled = false;
          const stance = (meta.anims && (meta.anims.stance || meta.anims.idle || Object.values(meta.anims)[0])) || { frames: [0] };
          const img = Sprites.tinted(image, meta, C.battlePalette(recipe) || 'original');
          const [cw, ch] = meta.cell || [96, 64], k = Math.min(2, (battleCv.width - 8) / cw, (battleCv.height - 8) / ch);
          Sprites.drawBattlerFrame(g, meta, img, stance.frames[0] || 0, battleCv.width / 2 + ((meta.anchor || [cw / 2])[0] - cw / 2) * k, battleCv.height - 4 - (ch - (meta.anchor || [0, ch])[1]) * k, k, false);
        }
      }
      // sprite animé (marche vers le bas puis repos)
      const t0 = performance.now();
      const tick = (t) => {
        if (!back.isConnected) return;
        if (sheet) {
          const g = sprite.getContext('2d'), m = sheet.meta, anim = Math.floor((t - t0) / 2400) % 2 ? m.anims.down : m.anims.idle;
          const total = anim.durations.reduce((a, b) => a + b, 0); let k = (t - t0) % total, f = 0;
          for (let i = 0; i < anim.frames.length; i++) { if (k < anim.durations[i]) { f = anim.frames[i]; break; } k -= anim.durations[i]; }
          const [fw, fh] = m.frame, z = 64 / fw; // les sprites FE (32 px) sont affichés au double
          g.imageSmoothingEnabled = false; g.clearRect(0, 0, 64, 64); g.drawImage(sheet.canvas, f * fw, anim.row * fh, fw, fh, 0, 64 - fh * z, fw * z, fh * z);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const set = (k, v) => { recipe[k] = v; if (k === 'sprite') { drawColors(); if (v && !spriteSheets[v]) loadSprite(v).then(() => { if (back.isConnected) refresh(); }); } refresh(); };
      const step = (k, d) => {
        const list = k === 'hair' ? parts.hair.filter(p => p.front) : parts[k];
        const i = list.findIndex(p => p.id === recipe[k]);
        set(k, list[(i + d + list.length) % list.length].id);
      };
      const picker = (k, label) => {
        const list = k === 'hair' ? parts.hair.filter(p => p.front) : parts[k];
        const grid = h('div', { class: 'cg-grid' + (k === 'sprite' ? ' cg-grid-sprites' : '') });
        const search = h('input', { type: 'search', class: 'cg-search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher une pièce' });
        // sprites FE : un filtre par catégorie (dossiers d'origine) et les crédits en infobulle
        const groups = k === 'sprite' ? [...new Set(list.map(p => p.group))] : [];
        const groupSel = groups.length ? h('select', { class: 'cg-search', 'data-cg-sprite-group': true, 'aria-label': 'Catégorie' },
          h('option', { value: '' }, 'Toutes les catégories'), groups.map(g => h('option', { value: g }, g))) : null;
        const pop = h('div', { class: 'cg-pop', 'data-cg-picker': k }, h('div', { class: 'cg-pop-head' }, ...[h('b', {}, label), groupSel, search,
          k !== 'token' ? h('button', { class: 'cg-btn small', onclick: () => { set(k, ''); pop.remove(); } }, k === 'sprite' ? 'Aucun (figurine)' : 'Aucun') : null,
          h('button', { class: 'cg-btn small', onclick: () => pop.remove() }, 'Fermer')].filter(Boolean)), grid,
          k === 'sprite' ? h('p', { class: 'cg-note' }, 'Sprites de la communauté Fire Emblem (FE-Repo) : ils gardent leurs couleurs ; le jeu les teinte selon le camp. Crédits dans l’infobulle et dans tools/map-sprites/CREDITS.txt.') : null);
        const fill = () => {
          const q = search.value.trim().toLowerCase(), g = groupSel ? groupSel.value : '';
          const shown = list.filter(p => (!g || p.group === g) && (!q || p.label.toLowerCase().includes(q) || (p.credits || []).some(c => c.toLowerCase().includes(q))));
          grid.replaceChildren(...shown.map(p => {
            const b = h('button', { class: 'cg-cell' + (p.id === recipe[k] ? ' on' : ''), title: p.label + (p.credits && p.credits.length ? ' — ' + p.credits.join(', ') : ''), 'data-cg-part': p.id, onclick: () => { set(k, p.id); pop.remove(); } },
              thumb(k, parts[k].indexOf(p), recipe, 64), h('span', {}, p.label));
            return b;
          }));
        };
        search.addEventListener('input', fill);
        if (groupSel) groupSel.addEventListener('change', fill);
        fill(); win.append(pop); setTimeout(() => search.focus(), 10);
      };
      const partRows = h('div', { class: 'cg-section' }, h('div', { class: 'cg-title' }, 'Pièces'),
        KINDS.filter(([k]) => k !== 'sprite' || parts.sprite.length).map(([k, label]) => h('div', { class: 'cg-row', 'data-cg-row': k }, h('span', { class: 'cg-lbl' }, label),
          h('button', { class: 'cg-btn arrow', title: 'Précédent', 'data-cg-prev': k, onclick: () => step(k, -1) }, '◀'),
          h('button', { class: 'cg-btn cg-choice', 'data-cg-choose': k, onclick: () => picker(k, label) }, h('span', { 'data-cg-label': k }, '')),
          h('button', { class: 'cg-btn arrow', title: 'Suivant', 'data-cg-next': k, onclick: () => step(k, 1) }, '▶'))));
      // ---------- couleurs : portrait (face set), carte (sprite de map), combat (animation de la classe)
      const cstate = { tab: 'portrait', group: 'hair' };
      const target = () => (cstate.tab === 'map' ? recipe.map : recipe); // { colors, ramps }
      const setColor = (g, c) => { const t = target(); t.colors[g] = c; if (t.ramps) delete t.ramps[g]; refresh(); };
      const setRamp = (g, ramp) => { const t = target(); t.ramps = Object.assign({}, t.ramps, { [g]: ramp.slice() }); t.colors[g] = ramp[1]; refresh(); };
      const gradient = (ramp) => `linear-gradient(to bottom, ${ramp.map((c, i) => `${c} ${i * 100 / ramp.length}% ${(i + 1) * 100 / ramp.length}%`).join(', ')})`;
      const rampGrid = (key, ramps, layout, pick) => h('div', { class: 'cg-ramps cg-ramps-' + (key === 'skin' ? 'skin' : 'wide') + (layout ? ' cg-ramps-grid' : '') },
        ramps.map((ramp, i) => {
          const pos = layout ? (i < layout.columns[0] * layout.rows ? [i % layout.columns[0], Math.floor(i / layout.columns[0])]
            : [layout.columns[0] + (i - layout.columns[0] * layout.rows) % layout.columns[1], Math.floor((i - layout.columns[0] * layout.rows) / layout.columns[1])]) : null;
          return h('button', { class: 'cg-ramp', title: ramp.join(' · '), 'data-cg-ramp': key + ':' + i, 'aria-label': `${key} ${i + 1}`,
            style: Object.assign({ background: gradient(ramp) }, pos ? { gridColumn: String(pos[0] + 1), gridRow: String(pos[1] + 1) } : {}),
            onclick: () => pick(ramp) });
        }));
      const battleCv = h('canvas', { class: 'cg-battler', width: 112, height: 96, 'data-cg-battler': true });
      const colorBox = h('div', { class: 'cg-colorbox' });
      const TABS = [['portrait', 'Portrait'], ['map', 'Carte'], ['battle', 'Combat']];
      const tabs = h('div', { class: 'cg-tabs' }, TABS.map(([id, label]) => h('button', { class: 'cg-tab', 'data-cg-tab': id, onclick: () => { cstate.tab = id; drawColors(); refresh(); } }, label)));
      function drawColors() {
        colorBox.replaceChildren();
        if (cstate.tab === 'battle') {
          colorBox.append(...[h('p', { class: 'cg-note' }, opts.battler
            ? 'L’animation de combat est celle de la classe (ou de l’unité) : seules les couleurs de sa tenue (couleurs d’équipe) changent.'
            : 'L’animation de combat vient de la classe : seules les couleurs de sa tenue (couleurs d’équipe) changeront. Aucun aperçu disponible ici.'),
          h('div', { class: 'cg-row cg-battle-row' }, opts.battler ? battleCv : null,
            h('button', { class: 'cg-btn small', 'data-cg-battle-origin': true, onclick: () => { recipe.battle = null; refresh(); } }, 'Couleurs d’origine de l’animation')),
          rampGrid('battle', C.HAIR_RAMPS, C.HAIR_LAYOUT, (ramp) => { recipe.battle = { ramp: ramp.slice() }; refresh(); })].filter(Boolean));
          return;
        }
        if (cstate.tab === 'map') {
          if (recipe.sprite) colorBox.append(h('p', { class: 'cg-note', 'data-cg-sprite-note': true }, 'Le sprite de map animé (FE) garde ses propres couleurs : ces réglages ne s’appliquent qu’à la figurine. En jeu, il est teinté selon le camp.'));
          colorBox.append(h('label', { class: 'cg-check' }, h('input', { type: 'checkbox', 'data-cg-map-linked': true, checked: !recipe.map,
            onchange: (e) => { recipe.map = e.target.checked ? null : C.normColors(recipe); drawColors(); refresh(); } }), ' Mêmes couleurs que le portrait'));
          if (!recipe.map) return;
        }
        const groups = C.GROUPS.filter(g => cstate.tab === 'portrait' || g.id !== 'eyes');
        if (!groups.some(g => g.id === cstate.group)) cstate.group = 'hair';
        const g = cstate.group;
        colorBox.append(...[h('div', { class: 'cg-chips' }, groups.map(gp => h('button', { class: 'cg-chip' + (gp.id === g ? ' on' : ''), 'data-cg-group': gp.id,
          onclick: () => { cstate.group = gp.id; drawColors(); refresh(); } }, h('i', { class: 'cg-chip-sw', 'data-cg-chip-sw': gp.id }), gp.label))),
        h('div', { class: 'cg-row cg-colors' }, h('span', { class: 'cg-lbl' }, 'Couleur libre'),
          h('input', { type: 'color', 'data-cg-color': g, 'aria-label': 'Couleur libre', oninput: (e) => setColor(g, e.target.value) }),
          g === 'eyes' ? h('button', { class: 'cg-btn small cg-eyes-hair', 'data-cg-eyes-hair': true, title: 'Les yeux prennent la couleur des cheveux (comme les portraits d’origine)',
            onclick: () => setColor('eyes', '') }, 'Comme les cheveux') : null),
        g === 'skin' ? rampGrid('skin', C.SKIN_RAMPS, null, (r) => setRamp('skin', r)) : rampGrid(g, C.HAIR_RAMPS, C.HAIR_LAYOUT, (r) => setRamp(g, r)),
        g === 'eyes' ? h('p', { class: 'cg-note' }, 'Les yeux se recolorent sur les visages dont l’iris est dessiné avec la teinte des cheveux (la plupart des portraits GBA).') : null].filter(Boolean)); // append écrirait « null »
      }
      const colorRows = h('div', { class: 'cg-section' }, h('div', { class: 'cg-title cg-title-tabs' }, h('span', {}, 'Couleurs'), tabs), colorBox);
      drawColors();
      const offRows = h('div', { class: 'cg-section' }, h('div', { class: 'cg-title' }, 'Position'),
        OFFSET_KINDS.map(([k, label]) => h('div', { class: 'cg-row cg-offsets' }, h('span', { class: 'cg-lbl' }, label),
          ...[[0, '↔'], [1, '↕']].map(([a, sym]) => h('span', { class: 'cg-off' }, h('i', {}, sym),
            h('button', { class: 'cg-btn small', onclick: () => { recipe.offsets[k][a] = Math.max(-48, recipe.offsets[k][a] - 1); refresh(); } }, '−'),
            h('b', { 'data-cg-offset': k + ':' + a }, '0'),
            h('button', { class: 'cg-btn small', onclick: () => { recipe.offsets[k][a] = Math.min(48, recipe.offsets[k][a] + 1); refresh(); } }, '+'))),
          h('button', { class: 'cg-btn small', title: 'Remettre en place', onclick: () => { recipe.offsets[k] = [0, 0]; refresh(); } }, '⟲'))));
      const nameInput = opts.askName ? h('input', { type: 'text', class: 'cg-name', value: name, maxlength: 20, placeholder: 'Nom', 'data-cg-name': true,
        oninput: (e) => { name = e.target.value; } }) : null;
      const close = (value) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(value); };
      const confirm = () => {
        const errs = C.validate(recipe, parts);
        if (opts.askName && !name.trim()) errs.unshift('Donne un nom à ton personnage.');
        if (errs.length) { UI.toast(errs[0]); return; }
        result = build(recipe, name.trim());
        close(Object.assign(result, { recipe: C.normalize(recipe, parts), name: name.trim() }));
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const pop = win.querySelector('.cg-pop'); if (pop) pop.remove(); else if (opts.cancel !== false) close(null); }
        else if (e.key === 'Enter' && !win.querySelector('.cg-pop') && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); confirm(); }
        else e.stopPropagation(); // le jeu ou l'éditeur derrière ne reçoit rien
      };
      document.addEventListener('keydown', onKey, true);
      win.append(h('div', { class: 'cg-head' }, h('b', {}, opts.title || 'Générateur de personnage'), opts.subtitle ? h('span', {}, opts.subtitle) : null),
        h('div', { class: 'cg-body' },
          h('div', { class: 'cg-preview' }, h('div', { class: 'cg-frame' }, big), h('div', { class: 'cg-map' }, sprite, h('small', {}, 'Sprite de map')),
            nameInput ? h('label', { class: 'cg-name-row' }, h('span', {}, 'Nom'), nameInput) : null,
            h('button', { class: 'cg-btn', 'data-cg-random': true, onclick: () => { recipe = C.normalize(Object.assign(C.random(parts), { sprite: recipe.sprite }), parts); refresh(); } }, '🎲 Aléatoire'),
            h('button', { class: 'cg-btn', 'data-cg-random-colors': true, onclick: () => { recipe.colors = C.random(parts).colors; refresh(); } }, '🎨 Couleurs au hasard')),
          h('div', { class: 'cg-controls' }, partRows, colorRows, offRows)),
        h('div', { class: 'cg-foot' }, h('small', {}, 'Pièces : FE Character Creator (TheFlyingMinotaur) et la communauté Fire Emblem · nuanciers de cheveux et de peau : Blade (corps : AK).'),
          opts.cancel !== false ? h('button', { class: 'cg-btn', 'data-cg-cancel': true, onclick: () => close(null) }, 'Annuler') : null,
          h('button', { class: 'cg-btn primary', 'data-cg-ok': true, onclick: confirm }, opts.okLabel || 'Valider')));
      (document.getElementById('modal-root') || document.body).append(back);
      refresh();
      if (recipe.sprite && !spriteSheets[recipe.sprite]) loadSprite(recipe.sprite).then(() => { if (back.isConnected) refresh(); });
      if (nameInput) setTimeout(() => nameInput.focus(), 10);
    }));
  }
  /** Canvas → base64 PNG (sans l'en-tête data:). */
  const base64 = (cv) => cv.toDataURL('image/png').split(',')[1];

  root.CharGenUI = { load, open, render, build, base64 };
})(self);
