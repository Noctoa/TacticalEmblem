/*
 * Fenêtre de choix d'une image (nouveau tileset) : remplace la boîte de dialogue de Windows.
 *   • « Dans le projet » : les images déjà rangées dans ressources/tilesets, en vignettes, avec recherche ;
 *     celles qui servent déjà de tileset sont marquées (et masquables).
 *   • « Sur l'ordinateur » : raccourcis (Bureau, Documents, Images, Téléchargements, disques), dossier parent,
 *     chemin modifiable, vignettes, recherche par nom dans le dossier ET ses sous-dossiers ; le dernier dossier
 *     ouvert est retenu. L'image choisie est copiée dans le projet. « Explorateur Windows… » reste disponible.
 *
 *   FilePicker.pickImage({ title, kind: 'tilesets', dir, baseUrl, files: [chemins relatifs], used: Set }) → chemin relatif ou null
 */
(function (root) {
  'use strict';
  const { h } = root.UI;
  const KEY = 'tf.filePicker';
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const matches = (name, q) => { const words = fold(q).split(/\s+/).filter(Boolean); const n = fold(name); return words.every(w => n.includes(w)); };
  const base = (p) => String(p).split(/[\\/]/).pop();
  const stem = (p) => base(p).replace(/\.\w+$/, '');
  /** URL file:// d'un chemin absolu (Windows ou Unix). */
  function fileUrl(p) {
    let s = String(p).replace(/\\/g, '/');
    if (!s.startsWith('/')) s = '/' + s;
    return 'file://' + s.split('/').map(seg => encodeURIComponent(seg).replace(/%3A/i, ':')).join('/');
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(load(), v))); } catch (e) { /* stockage indisponible */ } }
  const sizeText = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko');

  function thumb(src) {
    const img = h('img', { class: 'fp-thumb', loading: 'lazy', decoding: 'async', draggable: false, alt: '' });
    img.src = src;
    img.addEventListener('error', () => img.classList.add('broken'));
    return img;
  }

  function pickImage(o) {
    const prefs = load();
    const st = { tab: prefs.tab === 'pc' ? 'pc' : 'project', hideUsed: !!prefs.hideUsed, cwd: prefs.cwd || '', listing: null, results: null, truncated: false, query: '', pcQuery: '', sel: null, busy: false, places: [] };
    if (!(o.files || []).length && !prefs.tab) st.tab = 'pc';
    const used = o.used || new Set();
    let searchToken = 0;

    return UI.modal((box, close) => {
      box.classList.add('fp-modal');
      const tabs = h('div', { class: 'fp-tabs' });
      const body = h('div', { class: 'fp-body' });
      const info = h('div', { class: 'fp-info' });
      const ok = h('button', { class: 'primary', 'data-fp-ok': true, disabled: true, onclick: () => choose() });
      const nativeBtn = h('button', { class: 'ghost', 'data-fp-native': true, title: 'Ouvrir la boîte de dialogue de Windows dans le dossier affiché',
        onclick: async () => {
          const f = await tf.nativePickFile(st.tab === 'pc' ? st.cwd : '').catch(err => { UI.toast(err.message, 'error'); return null; });
          if (f) { st.sel = { kind: 'pc', path: f, name: base(f) }; choose(); }
        } }, 'Explorateur Windows…');

      async function choose() {
        const s = st.sel; if (!s || st.busy) return;
        if (s.kind === 'project') { save({ tab: st.tab }); return close(s.rel); }
        st.busy = true; ok.disabled = true;
        try {
          const rel = await tf.importFile(o.dir, s.path, o.kind || 'tilesets');
          save({ tab: st.tab, cwd: st.cwd || s.path.replace(/[\\/][^\\/]*$/, '') });
          close(rel);
        } catch (err) { UI.toast(err.message, 'error'); st.busy = false; ok.disabled = false; }
      }
      function select(s, cell) {
        st.sel = s;
        box.querySelectorAll('.fp-cell.on').forEach(c => c.classList.remove('on'));
        if (cell) cell.classList.add('on');
        ok.disabled = !s;
        ok.textContent = s && s.kind === 'pc' ? 'Importer dans le projet' : 'Choisir';
        info.replaceChildren();
        if (!s) { info.append(h('span', { class: 'muted' }, 'Clique sur une image pour la choisir (double-clic : choisir tout de suite).')); return; }
        const img = cell && cell.querySelector('img');
        const dims = img && img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight} px` : '';
        info.append(h('b', {}, s.name), h('span', { class: 'muted' }, [dims, s.size ? sizeText(s.size) : '', s.kind === 'pc' ? s.path : s.rel].filter(Boolean).join(' · ')));
      }
      function cellFor(s, src, extra) {
        const cell = h('button', { class: 'fp-cell', title: s.kind === 'pc' ? s.path : s.rel, 'data-fp-file': s.kind === 'pc' ? s.path : s.rel,
          onclick: () => select(s, cell), ondblclick: () => { select(s, cell); choose(); } },
        h('div', { class: 'fp-frame' }, thumb(src)), h('small', {}, s.name), extra || null);
        if (st.sel && (st.sel.rel || st.sel.path) === (s.rel || s.path)) cell.classList.add('on');
        return cell;
      }

      function renderTabs() {
        tabs.replaceChildren(
          h('button', { class: 'small' + (st.tab === 'project' ? ' primary' : ''), 'data-fp-tab': 'project', onclick: () => { st.tab = 'project'; render(); } }, `Dans le projet (${(o.files || []).length})`),
          h('button', { class: 'small' + (st.tab === 'pc' ? ' primary' : ''), 'data-fp-tab': 'pc', onclick: () => { st.tab = 'pc'; render(); } }, 'Sur l’ordinateur'));
      }

      // ---------- images du projet ----------
      function renderProject() {
        const search = h('input', { type: 'search', placeholder: 'Rechercher une image du projet…', value: st.query, 'data-fp-search': true });
        const hide = h('label', { class: 'fp-check' }, h('input', { type: 'checkbox', checked: st.hideUsed, onchange: (e) => { st.hideUsed = e.target.checked; save({ hideUsed: st.hideUsed }); fill(); } }), 'Masquer celles déjà utilisées');
        const grid = h('div', { class: 'fp-grid' });
        const count = h('span', { class: 'muted fp-count' });
        const fill = () => {
          const list = (o.files || []).filter(rel => matches(rel, st.query) && !(st.hideUsed && used.has(rel)))
            .sort((a, b) => (used.has(a) - used.has(b)) || stem(a).localeCompare(stem(b), 'fr', { numeric: true, sensitivity: 'base' }));
          count.textContent = `${list.length} image(s)`;
          grid.replaceChildren(...(list.length ? list.map(rel => cellFor({ kind: 'project', rel, name: stem(rel) }, o.baseUrl + rel.split('/').map(encodeURIComponent).join('/'),
            used.has(rel) ? h('i', { class: 'fp-badge' }, 'déjà un tileset') : null))
            : [h('p', { class: 'fp-empty' }, (o.files || []).length ? 'Aucune image ne correspond.' : 'Aucune image dans ressources/tilesets. Va dans « Sur l’ordinateur ».')]));
        };
        search.addEventListener('input', () => { st.query = search.value; fill(); });
        fill();
        body.replaceChildren(h('div', { class: 'fp-bar' }, search, hide, count), grid);
        setTimeout(() => search.focus(), 10);
      }

      // ---------- ordinateur ----------
      async function go(dir, quiet) {
        try {
          st.listing = await tf.listFiles(dir); st.cwd = st.listing.path; st.results = null; st.pcQuery = '';
          save({ cwd: st.cwd });
        } catch (err) {
          if (quiet) return false;
          UI.toast('Dossier inaccessible : ' + (err.message || err), 'error');
          if (!st.listing) st.listing = { path: dir, parent: null, entries: [] };
        }
        if (st.tab === 'pc') renderPc(); // l'utilisateur a pu changer d'onglet pendant la lecture
        return true;
      }
      async function runSearch(q) {
        const token = ++searchToken;
        st.pcQuery = q;
        if (!q.trim()) { st.results = null; return renderGrid(); }
        gridBox.replaceChildren(h('p', { class: 'fp-empty' }, 'Recherche dans ' + st.cwd + ' et ses sous-dossiers…'));
        try {
          const r = await tf.searchFiles(st.cwd, q);
          if (token !== searchToken) return;
          st.results = r.results; st.truncated = r.truncated;
        } catch (err) { if (token === searchToken) { st.results = []; UI.toast(err.message, 'error'); } }
        if (token === searchToken) renderGrid();
      }
      let gridBox = h('div', { class: 'fp-grid' });
      function renderGrid() {
        const pcCount = box.querySelector('.fp-count');
        if (st.results) {
          const rootLen = st.cwd.replace(/[\\/]$/, '').length + 1;
          if (pcCount) pcCount.textContent = `${st.results.length} résultat(s)${st.truncated ? ' (recherche limitée : précise le nom)' : ''}`;
          gridBox.replaceChildren(...(st.results.length ? st.results.map(e => cellFor({ kind: 'pc', path: e.path, name: e.name, size: e.size }, fileUrl(e.path),
            h('i', { class: 'fp-where' }, e.path.slice(rootLen, e.path.length - e.name.length - 1) || '.')))
            : [h('p', { class: 'fp-empty' }, 'Aucune image trouvée dans ce dossier ni ses sous-dossiers.')]));
          return;
        }
        const entries = (st.listing && st.listing.entries) || [];
        const dirs = entries.filter(e => e.dir), imgs = entries.filter(e => !e.dir);
        if (pcCount) pcCount.textContent = `${dirs.length} dossier(s) · ${imgs.length} image(s)`;
        gridBox.replaceChildren(...dirs.map(e => h('button', { class: 'fp-cell fp-dir', title: e.path, 'data-fp-dir': e.path, ondblclick: () => go(e.path), onclick: () => go(e.path) },
          h('div', { class: 'fp-frame' }, h('span', { class: 'fp-folder' }, '📁')), h('small', {}, e.name))),
        ...imgs.map(e => cellFor({ kind: 'pc', path: e.path, name: e.name, size: e.size }, fileUrl(e.path))),
        ...(entries.length ? [] : [h('p', { class: 'fp-empty' }, 'Aucune image ni dossier ici.')]));
      }
      function renderPc() {
        const L = st.listing || { path: st.cwd, entries: [] };
        const places = h('div', { class: 'fp-places' }, st.places.map(p => h('button', { class: 'fp-place' + (L.path && L.path.toLowerCase() === p.path.toLowerCase() ? ' on' : ''), title: p.path, 'data-fp-place': p.path, onclick: () => go(p.path) }, p.label)));
        const pathInput = h('input', { type: 'text', class: 'fp-path', value: L.path || '', 'data-fp-path': true, title: 'Chemin du dossier (Entrée pour y aller ; on peut coller un chemin)' });
        pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(pathInput.value.trim().replace(/^"|"$/g, '')); } });
        const up = h('button', { class: 'small', title: 'Dossier parent', 'data-fp-up': true, disabled: !L.parent, onclick: () => go(L.parent) }, '↑');
        const search = h('input', { type: 'search', placeholder: 'Rechercher dans ce dossier et ses sous-dossiers…', value: st.pcQuery, 'data-fp-pcsearch': true });
        const debounced = UI.debounce((q) => runSearch(q), 300);
        search.addEventListener('input', () => debounced(search.value));
        search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); runSearch(search.value); } });
        gridBox = h('div', { class: 'fp-grid' });
        body.replaceChildren(h('div', { class: 'fp-pc' }, places,
          h('div', { class: 'fp-main' }, h('div', { class: 'fp-bar' }, up, pathInput), h('div', { class: 'fp-bar' }, search, h('span', { class: 'muted fp-count' })), gridBox)));
        renderGrid();
      }
      async function openPc() {
        if (!st.places.length) st.places = await tf.filePlaces().catch(() => []);
        if (!st.listing) {
          // dernier dossier ouvert (s'il existe encore), sinon Images, sinon le premier raccourci
          const starts = [st.cwd, (st.places.find(p => p.label.startsWith('Images')) || {}).path, ...st.places.map(p => p.path)].filter(Boolean);
          for (const start of starts) if (await go(start, true)) return;
        }
        if (st.tab === 'pc') renderPc();
      }

      function render() {
        renderTabs();
        st.sel = null; select(null);
        if (st.tab === 'pc') { body.replaceChildren(h('p', { class: 'fp-empty' }, 'Chargement…')); openPc(); }
        else renderProject();
        save({ tab: st.tab });
      }

      box.append(h('h3', {}, o.title || 'Choisir une image'), tabs, body, info,
        h('div', { class: 'modal-actions' }, nativeBtn, h('span', { class: 'fp-grow' }), h('button', { onclick: () => close(null) }, 'Annuler'), ok));
      render();
    }, { wide: true });
  }

  root.FilePicker = { pickImage, fileUrl, matches };
})(self);
