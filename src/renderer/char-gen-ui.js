/*
 * Fenêtre du générateur de personnage (éditeur : fiche d'une unité ; jeu : création du protagoniste).
 * Calculs dans shared/char-gen.js ; pièces dans img/generator (tools/build_generator_parts.py).
 *
 *   CharGenUI.open({ recipe, name, askName, title, game, cancel: true }) → Promise<null | {
 *     recipe, name, faceset: canvas 128×112, portrait: canvas 96×96, map: { canvas, meta } }>
 *   CharGenUI.render(recipe, { name }) → Promise<même résultat sans fenêtre> (jeu : recette sauvegardée)
 *   CharGenUI.load() → Promise<parts> (planches chargées)
 */
(function (root) {
  'use strict';
  const C = root.CharGen;
  const KINDS = [['hair', 'Cheveux'], ['face', 'Visage'], ['armor', 'Tenue'], ['token', 'Figurine (sprite de map)']];
  const OFFSET_KINDS = [['hair', 'Cheveux'], ['face', 'Visage'], ['armor', 'Tenue']];
  const SHEETS = ['hair', 'hairb', 'face', 'armor', 'token'];
  let loading = null;
  const pixels = {}; // feuille → { data, width }
  const h = (tag, attrs, ...children) => UI.h(tag, attrs, ...children);

  function load() {
    if (loading) return loading;
    const parts = root.GENERATOR_PARTS;
    if (!parts) return Promise.reject(new Error('Pièces du générateur absentes (img/generator/parts.js).'));
    loading = Promise.all(SHEETS.map(name => new Promise((resolve, reject) => {
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
  /** Pixels RGBA d'une case (pièce n° index de la feuille). */
  function cell(sheet, index, size) {
    const P = pixels[sheet], cols = root.GENERATOR_PARTS.cols;
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
    const map = C.mapSprite(token, { name: name || 'Personnage généré', teamColors: C.teamColors(recipe) });
    return { recipe, name, portrait: toCanvas(portrait, 96, 96), faceset: toCanvas(fs.data, fs.width, fs.height),
      map: { canvas: toCanvas(map.data, map.width, map.height), meta: map.meta }, token: toCanvas(token, 64, 64) };
  }
  async function render(recipe, opts = {}) {
    const parts = await load();
    return build(C.normalize(recipe, parts), opts.name);
  }

  /** Vignette d'une pièce recolorée avec les couleurs de la recette. */
  function thumb(kind, index, recipe, size) {
    const cv = document.createElement('canvas');
    if (kind === 'token') {
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
        for (const el of win.querySelectorAll('[data-cg-label]')) { const k = el.dataset.cgLabel, p = parts[k].find(x => x.id === recipe[k]); el.textContent = p ? p.label : 'Aucun'; }
        for (const el of win.querySelectorAll('[data-cg-color]')) el.value = recipe.colors[el.dataset.cgColor];
        for (const el of win.querySelectorAll('[data-cg-offset]')) { const [k, a] = el.dataset.cgOffset.split(':'); el.textContent = String(recipe.offsets[k][+a]); }
      };
      // sprite animé (marche vers le bas puis repos)
      const t0 = performance.now();
      const tick = (t) => {
        if (!back.isConnected) return;
        if (sheet) {
          const g = sprite.getContext('2d'), m = sheet.meta, anim = Math.floor((t - t0) / 2400) % 2 ? m.anims.down : m.anims.idle;
          const total = anim.durations.reduce((a, b) => a + b, 0); let k = (t - t0) % total, f = 0;
          for (let i = 0; i < anim.frames.length; i++) { if (k < anim.durations[i]) { f = anim.frames[i]; break; } k -= anim.durations[i]; }
          g.clearRect(0, 0, 64, 64); g.drawImage(sheet.canvas, f * 64, anim.row * 64, 64, 64, 0, 0, 64, 64);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const set = (k, v) => { recipe[k] = v; refresh(); };
      const step = (k, d) => {
        const list = k === 'hair' ? parts.hair.filter(p => p.front) : parts[k];
        const i = list.findIndex(p => p.id === recipe[k]);
        set(k, list[(i + d + list.length) % list.length].id);
      };
      const picker = (k, label) => {
        const list = k === 'hair' ? parts.hair.filter(p => p.front) : parts[k];
        const grid = h('div', { class: 'cg-grid' });
        const search = h('input', { type: 'search', class: 'cg-search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher une pièce' });
        const pop = h('div', { class: 'cg-pop', 'data-cg-picker': k }, h('div', { class: 'cg-pop-head' }, h('b', {}, label), search,
          k !== 'token' ? h('button', { class: 'cg-btn small', onclick: () => { set(k, ''); pop.remove(); } }, 'Aucun') : null,
          h('button', { class: 'cg-btn small', onclick: () => pop.remove() }, 'Fermer')), grid);
        const fill = () => {
          const q = search.value.trim().toLowerCase();
          grid.replaceChildren(...list.filter(p => !q || p.label.toLowerCase().includes(q)).map(p => {
            const b = h('button', { class: 'cg-cell' + (p.id === recipe[k] ? ' on' : ''), title: p.label, 'data-cg-part': p.id, onclick: () => { set(k, p.id); pop.remove(); } },
              thumb(k, parts[k].indexOf(p), recipe, 64), h('span', {}, p.label));
            return b;
          }));
        };
        search.addEventListener('input', fill);
        fill(); win.append(pop); setTimeout(() => search.focus(), 10);
      };
      const partRows = h('div', { class: 'cg-section' }, h('div', { class: 'cg-title' }, 'Pièces'),
        KINDS.map(([k, label]) => h('div', { class: 'cg-row' }, h('span', { class: 'cg-lbl' }, label),
          h('button', { class: 'cg-btn arrow', title: 'Précédent', 'data-cg-prev': k, onclick: () => step(k, -1) }, '◀'),
          h('button', { class: 'cg-btn cg-choice', 'data-cg-choose': k, onclick: () => picker(k, label) }, h('span', { 'data-cg-label': k }, '')),
          h('button', { class: 'cg-btn arrow', title: 'Suivant', 'data-cg-next': k, onclick: () => step(k, 1) }, '▶'))));
      const colorRows = h('div', { class: 'cg-section' }, h('div', { class: 'cg-title' }, 'Couleurs'),
        C.GROUPS.map(gp => h('div', { class: 'cg-row cg-colors' }, h('span', { class: 'cg-lbl' }, gp.label),
          h('input', { type: 'color', 'data-cg-color': gp.id, 'aria-label': gp.label, oninput: (e) => { recipe.colors[gp.id] = e.target.value; refresh(); } }),
          h('span', { class: 'cg-swatches' }, C.SWATCHES[gp.id].map(c => h('button', { class: 'cg-swatch', title: c, style: { background: c }, 'data-cg-swatch': gp.id + ':' + c,
            onclick: () => { recipe.colors[gp.id] = c; refresh(); } }))))));
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
            h('button', { class: 'cg-btn', 'data-cg-random': true, onclick: () => { recipe = C.normalize(C.random(parts), parts); refresh(); } }, '🎲 Aléatoire'),
            h('button', { class: 'cg-btn', 'data-cg-random-colors': true, onclick: () => { recipe.colors = C.random(parts).colors; refresh(); } }, '🎨 Couleurs au hasard')),
          h('div', { class: 'cg-controls' }, partRows, colorRows, offRows)),
        h('div', { class: 'cg-foot' }, h('small', {}, 'Pièces : FE Character Creator (TheFlyingMinotaur) et la communauté Fire Emblem.'),
          opts.cancel !== false ? h('button', { class: 'cg-btn', 'data-cg-cancel': true, onclick: () => close(null) }, 'Annuler') : null,
          h('button', { class: 'cg-btn primary', 'data-cg-ok': true, onclick: confirm }, opts.okLabel || 'Valider')));
      (document.getElementById('modal-root') || document.body).append(back);
      refresh();
      if (nameInput) setTimeout(() => nameInput.focus(), 10);
    }));
  }
  /** Canvas → base64 PNG (sans l'en-tête data:). */
  const base64 = (cv) => cv.toDataURL('image/png').split(',')[1];

  root.CharGenUI = { load, open, render, build, base64 };
})(self);
