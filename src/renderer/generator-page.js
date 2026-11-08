/* Section Générateur (barre d'icônes) : créer des personnages avec le générateur et exporter leurs images en PNG,
 * sans les ajouter au projet (pour les retoucher dans un logiciel de dessin, les partager, les réutiliser ailleurs).
 *
 * Les créations (nom + recette) sont gardées sur cet ordinateur (localStorage tf.generator.creations), pas dans le projet.
 * Export : <dossier choisi>/<Nom>/ → face set, portrait, sprite de map (+ .json), animation de combat (+ .json), recette.
 */
(function () {
  'use strict';
  const { h } = UI;
  const $ = (s) => document.querySelector(s);
  const KEY = 'tf.generator.creations';
  const S = { sel: '', cache: new Map(), exports: { faceset: true, portrait: true, map: true, combat: true, recipe: true } };

  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(c => c && c.id && c.recipe) : []; } catch (e) { return []; } };
  const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { UI.toast('Impossible de garder cette création sur cet ordinateur.', 'warn'); } };
  try { const e = JSON.parse(localStorage.getItem('tf.generator.exports') || 'null'); if (e) Object.assign(S.exports, e); } catch (e) { /* défaut */ }
  const keepExports = () => { try { localStorage.setItem('tf.generator.exports', JSON.stringify(S.exports)); } catch (e) { /* facultatif */ } };
  const uid = () => 'gen_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /** Nom de fichier sûr (sans accents ni espaces). */
  const slug = (s) => String(s || 'Personnage').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Personnage';

  /** Images d'une création (portrait, face set, sprite de map, animation de combat), recalculées si la recette change. */
  function images(c) {
    const k = c.id + ':' + JSON.stringify(c.recipe) + ':' + c.name;
    if (!S.cache.has(k)) S.cache.set(k, CharGenUI.render(c.recipe, { name: c.name }));
    return S.cache.get(k);
  }
  const combatCanvas = (r) => {
    if (!r.battler) return null;
    const pal = window.CharGen && CharGen.battlePalette(r.recipe);
    return pal && window.Sprites ? Sprites.tinted(r.battler.canvas, r.battler.meta, pal) : r.battler.canvas;
  };
  /** Copie agrandie (pixels nets) d'un canvas pour l'affichage. */
  function scaled(src, z, cls) {
    const cv = h('canvas', { class: cls || 'gen-img', width: src.width * z, height: src.height * z });
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }

  /** Vignette : le visage du portrait (32 × 32). */
  function faceThumb(portrait) {
    const cv = h('canvas', { class: 'gen-thumb-img', width: 32, height: 32 }), g = cv.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(portrait, 26, 14, 44, 44, 0, 0, 32, 32);
    return cv;
  }
  /** Première image de l'animation de combat, agrandie. */
  function combatFrame(src, meta, z) {
    const [w, hgt] = (meta && meta.cell) || [src.width, src.height];
    const cv = h('canvas', { class: 'gen-img', width: w * z, height: hgt * z }), g = cv.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, w, hgt, 0, 0, w * z, hgt * z);
    return cv;
  }

  function open() {
    if (window.DBEditor && !$('#db').classList.contains('hidden')) DBEditor.close();
    if (window.TextsEditor) TextsEditor.close();
    $('#generator').classList.remove('hidden');
    document.body.dataset.view = 'generator';
    const list = load();
    if (!list.some(c => c.id === S.sel)) S.sel = list[0] ? list[0].id : '';
    render();
  }
  function close() {
    const el = $('#generator'); if (!el) return;
    el.classList.add('hidden');
    if (document.body.dataset.view === 'generator') document.body.dataset.view = 'map';
  }
  const isOpen = () => !$('#generator').classList.contains('hidden');

  async function edit(c) {
    if (!window.CharGenUI) return UI.alert('Générateur indisponible', 'Les pièces du générateur sont absentes de cette installation.');
    let r;
    try {
      r = await CharGenUI.open({ recipe: c && c.recipe, name: c ? c.name : '', askName: true, title: c ? 'Retoucher le personnage' : 'Nouveau personnage',
        subtitle: 'Générateur · images exportées, non ajoutées au projet', okLabel: c ? 'Enregistrer' : 'Créer' });
    } catch (e) { return UI.alert('Générateur indisponible', e.message); }
    if (!r) return;
    const list = load();
    let cur = c && list.find(x => x.id === c.id);
    if (!cur) { cur = { id: uid(), created: Date.now() }; list.unshift(cur); }
    Object.assign(cur, { name: r.name || cur.name || 'Personnage', recipe: r.recipe, updated: Date.now() });
    save(list); S.sel = cur.id; render();
  }

  async function exportImages(c) {
    const r = await images(c), base = slug(c.name), files = [], ex = S.exports;
    if (ex.faceset) files.push({ name: base + '_faceset.png', base64: CharGenUI.base64(r.faceset) });
    if (ex.portrait) files.push({ name: base + '_portrait.png', base64: CharGenUI.base64(r.portrait) });
    if (ex.map) files.push({ name: base + '_map.png', base64: CharGenUI.base64(r.map.canvas) },
      { name: base + '_map.json', json: Object.assign({}, r.map.meta, { image: base + '_map.png', name: c.name }) });
    const combat = ex.combat && combatCanvas(r);
    if (combat) {
      const meta = Object.assign({}, r.battler.meta, { image: base + '_combat.png', name: c.name });
      if (r.battler.arrow) { files.push({ name: base + '_combat_arrow.png', base64: CharGenUI.base64(r.battler.arrow) }); meta.projectiles = { arrow: base + '_combat_arrow.png' }; }
      else delete meta.projectiles;
      files.push({ name: base + '_combat.png', base64: CharGenUI.base64(combat) }, { name: base + '_combat.json', json: meta });
    }
    if (ex.recipe) files.push({ name: base + '_recette.json', json: { generator: 'Tactical Emblem', name: c.name, recipe: c.recipe } });
    if (!files.length) return UI.toast('Coche au moins une image à exporter.', 'warn');
    let out;
    try { out = await tf.exportGenerated(c.name, files); } catch (e) { return UI.alert('Export impossible', e.message); }
    if (!out) return;
    S.lastExport = out;
    UI.toast(`${out.files.length} fichier(s) exporté(s) dans ${out.dir}`);
    const st = $('[data-gen-export-status]');
    if (st) st.replaceChildren(h('span', {}, 'Exporté dans ' + out.dir + ' '), h('button', { class: 'small ghost', type: 'button', onclick: () => tf.openFolder(out.dir) }, 'Ouvrir le dossier'));
  }

  async function importRecipe() {
    try {
      const imported = await CharGenUI.pickRecipe(); if (!imported) return;
      const list = load(), c = { id: uid(), ...imported, created: Date.now(), updated: Date.now() };
      list.unshift(c); save(list); S.sel = c.id; render();
      UI.toast('Personnage importé : ' + c.name);
    } catch (e) { UI.alert('Import impossible', e.message); }
  }

  // ---------- rendu ----------
  function render() { renderNav(); renderBody(); }
  function renderNav() {
    const nav = $('#gen-nav'), list = load();
    nav.replaceChildren(h('h2', {}, 'Générateur'),
      h('button', { class: 'primary gen-new', 'data-gen-new': true, html: Icons.icon('plus'), onclick: () => edit(null) }, 'Nouveau personnage'),
      h('button', { class: 'gen-import', 'data-gen-import': true, html: Icons.icon('import'), title: 'Choisir le fichier _recette.json d’un personnage exporté', onclick: importRecipe }, 'Importer un personnage…'),
      h('div', { class: 'db-nav-group' }, 'Mes personnages'));
    if (!list.length) nav.append(h('p', { class: 'tx-nav-empty' }, 'Aucun personnage pour l’instant.'));
    for (const c of list) {
      const thumb = h('span', { class: 'gen-thumb' });
      images(c).then(r => thumb.replaceChildren(faceThumb(r.portrait))).catch(() => {});
      nav.append(h('button', { class: 'tx-nav-file gen-item' + (c.id === S.sel ? ' on' : ''), 'data-gen-item': c.id, onclick: () => { S.sel = c.id; render(); } }, thumb, h('span', {}, c.name)));
    }
    nav.append(h('p', { class: 'form-info gen-note' }, 'Ces personnages sont gardés sur cet ordinateur, pas dans le projet.'));
  }
  function renderBody() {
    const body = $('#gen-body'), list = load(), c = list.find(x => x.id === S.sel);
    const col = h('div', { class: 'db-form studio-col' });
    body.replaceChildren(col);
    if (!c) {
      col.append(h('section', { class: 'studio-hero gen-empty' }, h('div', { class: 'hero-text' },
        h('div', { class: 'hero-kicker' }, 'Générateur de personnages'),
        h('h2', {}, 'Crée un personnage, exporte ses images'),
        h('p', { class: 'hero-desc' }, 'Compose un portrait et un sprite à partir de pièces façon Fire Emblem GBA, puis exporte le face set, le portrait, le sprite de map et l’animation de combat en PNG. Rien n’est ajouté au projet : pour donner ces images à une unité, utilise plutôt Base de données › Unités › « Créer avec le générateur ».'),
        h('div', { class: 'gen-actions' }, h('button', { class: 'primary', 'data-gen-new': true, onclick: () => edit(null) }, 'Nouveau personnage'), h('button', { 'data-gen-import': true, onclick: importRecipe }, 'Importer un personnage…')))));
      return;
    }
    const heroImg = h('div', { class: 'hero-visual gen-hero-visual' });
    const name = h('input', { type: 'text', class: 'gen-name', value: c.name, 'data-gen-name': true, spellcheck: false, onchange: () => {
      const l = load(), x = l.find(y => y.id === c.id); if (!x) return;
      x.name = name.value.trim() || x.name; x.updated = Date.now(); save(l); render();
    } });
    col.append(h('section', { class: 'studio-hero' }, heroImg, h('div', { class: 'hero-text' },
      h('div', { class: 'hero-kicker' }, 'Générateur · hors projet'), name,
      h('p', { class: 'hero-desc' }, 'Images exportées en PNG dans le dossier de ton choix (un sous-dossier au nom du personnage). Elles ne sont pas ajoutées au projet.'),
      h('div', { class: 'gen-actions' },
        h('button', { class: 'primary', 'data-gen-export-btn': true, html: Icons.icon('import'), onclick: () => exportImages(c) }, 'Exporter les images…'),
        h('button', { 'data-gen-import': true, html: Icons.icon('import'), title: 'Choisir le fichier _recette.json d’un personnage exporté', onclick: importRecipe }, 'Importer un personnage…'),
        h('button', { 'data-gen-edit': true, html: Icons.icon('pencil'), onclick: () => edit(c) }, 'Retoucher'),
        h('button', { class: 'ghost', 'data-gen-duplicate': true, html: Icons.icon('copy'), onclick: () => {
          const l = load(), d = { id: uid(), name: c.name + ' (copie)', recipe: JSON.parse(JSON.stringify(c.recipe)), created: Date.now(), updated: Date.now() };
          l.splice(l.findIndex(x => x.id === c.id) + 1, 0, d); save(l); S.sel = d.id; render();
        } }, 'Dupliquer'),
        h('button', { class: 'ghost danger', 'data-gen-delete': true, html: Icons.icon('trash'), onclick: async () => {
          if (!(await UI.confirm(`Supprimer « ${c.name} » du générateur ?\nLes images déjà exportées restent dans leur dossier.`, { ok: 'Supprimer', danger: true }))) return;
          const l = load().filter(x => x.id !== c.id); save(l); S.sel = l[0] ? l[0].id : ''; render();
        } }, 'Supprimer')),
      h('div', { class: 'gen-export-status form-info', 'data-gen-export-status': true }))));
    const grid = h('div', { class: 'studio-grid gen-grid' });
    col.append(h('section', { class: 'studio-card wide' }, h('h3', { class: 'studio-card-title' }, 'Images à exporter'), grid));
    images(c).then(r => {
      heroImg.replaceChildren(scaled(r.faceset, 1, 'gen-hero-img'));
      const combat = combatCanvas(r);
      const items = [
        ['faceset', 'Face set', r.faceset, 2, '128 × 112 : portrait de dialogue, avec la bouche et les yeux animés'],
        ['portrait', 'Portrait', r.portrait, 2, '96 × 96 : buste seul'],
        ['map', 'Sprite de map', r.map.canvas, 2, 'Planche d’animation de la map (+ fichier .json des animations)'],
        ['combat', 'Animation de combat', combat, 1, combat ? 'Planche complète de l’animation de combat (+ fichier .json) ; ici sa première image' : 'Pas d’animation de combat pour cette figurine'],
        ['recipe', 'Recette', null, 1, 'Fichier .json pour réimporter et retoucher ce personnage plus tard']];
      grid.replaceChildren(...items.map(([k, label, src, z, info]) => {
        const box = h('input', { type: 'checkbox', 'data-gen-export': k, disabled: k === 'combat' && !combat, onchange: () => { S.exports[k] = box.checked; keepExports(); } });
        box.checked = !!S.exports[k] && !(k === 'combat' && !combat);
        const view = !src ? null : k === 'combat' ? combatFrame(src, r.battler.meta, 3) : scaled(src, z);
        return h('figure', { class: 'gen-fig' + (src ? '' : ' empty') }, h('div', { class: 'gen-fig-img' }, view || h('span', { class: 'muted' }, k === 'recipe' ? '{ … }' : '—')),
          h('label', { class: 'gen-fig-label' }, box, h('b', {}, label)), h('small', {}, info));
      }));
    }).catch(e => grid.replaceChildren(h('p', { class: 'muted' }, 'Aperçu indisponible : ' + e.message)));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !document.querySelector('.modal-back, .cg-back')) close();
  });
  window.GeneratorPage = { open, close, isOpen, render, _images: images };
})();
