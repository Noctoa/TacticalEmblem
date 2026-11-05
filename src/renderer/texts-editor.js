/*
 * Outil « Textes » (barre d'icônes › T), inspiré de Pokémon Studio : fichiers de textes rangés par type de donnée
 * et par personnage, une colonne par langue, enregistrés en CSV dans textes/ (voir src/shared/texts.js).
 *
 *   TextsEditor.open(fileId?) / close()
 *   TextsEditor.pick() → Promise<'fichier#id' | null>   choix d'un texte (bouton « ＋ Texte » des dialogues)
 *
 * Onglet Textes : liste éditable (langue choisie), recherche, ajout, import CSV, remplissage depuis la base ;
 * pour un fichier de personnage, la ligne choisie s'affiche dans une boîte de dialogue avec son portrait.
 * Onglet Traduction : langue source à gauche, langue cible à droite.
 */
(function () {
  'use strict';
  const { h } = UI;
  const $ = (s) => document.querySelector(s);
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; };
  const S = { file: store('tf.textsFile') || '', tab: 'texts', lang: '', src: '', dst: '', query: '', row: '' };

  const texts = () => { const p = Editor.project(); p.texts = Texts.normalize(p.texts); return p.texts; };
  const db = () => Editor.db();
  const change = () => Editor.markDirty();
  const kindOf = (id) => Texts.KINDS.find(k => k.id === id) || Texts.KINDS[Texts.KINDS.length - 1];
  const curFile = () => texts().files.find(f => f.id === S.file) || null;
  const langName = (code) => (texts().languages.find(l => l.code === code) || { name: code }).name;

  function open(fileId) {
    if (!Editor.project()) return;
    if (window.DBEditor && !$('#db').classList.contains('hidden')) DBEditor.close();
    if (fileId) S.file = fileId;
    const t = texts();
    // un texte de la base créé ou modifié depuis : sa ligne apparaît tout de suite
    const sync = Texts.syncDb(t, db(), Editor.project().meta);
    if (sync.added || sync.removed) change();
    if (!t.files.some(f => f.id === S.file)) S.file = t.files[0] ? t.files[0].id : '';
    if (!t.languages.some(l => l.code === S.lang)) S.lang = t.main;
    $('#texts').classList.remove('hidden');
    document.body.dataset.view = 'texts';
    render();
  }
  function close() {
    $('#texts').classList.add('hidden');
    if (document.body.dataset.view === 'texts') document.body.dataset.view = 'map';
  }
  const isOpen = () => !$('#texts').classList.contains('hidden');
  function select(id) { S.file = id; S.row = ''; store('tf.textsFile', id); render(); }

  // ---------- rendu ----------
  function render() {
    renderNav();
    const body = $('#tx-body');
    const keep = body.querySelector('.db-form');
    const scroll = keep ? keep.scrollTop : 0;
    body.replaceChildren(topBar(), content());
    const pane = body.querySelector('.db-form');
    if (pane && keep) pane.scrollTop = scroll;
  }

  /** Groupes de fichiers : une catégorie par liste de la base (Unités : Noms, Descriptions, Épilogues…), puis les types de fichiers. */
  function groups(t) {
    const out = Texts.baseGroups(t).map(g => ({ id: 'base:' + g.list, name: g.name, base: true, files: g.files }));
    for (const k of Texts.KINDS) if (k.id !== 'base') out.push({ id: k.id, name: k.name, files: t.files.filter(f => f.kind === k.id) });
    return out;
  }
  const shortName = (f) => f.kind === 'base' && f.field ? ((Texts.DB_TEXT_FIELDS.find(x => x[0] === f.field) || [])[1] || f.name) : f.name;
  const fileOptions = (t) => groups(t).filter(g => g.files.length).map(g => h('optgroup', { label: g.name }, g.files.map(x => h('option', { value: x.id }, x.name))));

  function renderNav() {
    const nav = $('#tx-nav'); nav.replaceChildren();
    nav.append(h('h2', {}, 'Textes'));
    const t = texts(), all = groups(t);
    if (all.some(g => g.base)) nav.append(h('div', { class: 'tx-nav-section' }, 'Base de données'));
    let others = false;
    for (const g of all) {
      if (!g.files.length && g.id !== 'character') continue;
      if (!g.base && !others) { others = true; nav.append(h('div', { class: 'tx-nav-section' }, 'Fichiers de textes')); }
      nav.append(h('div', { class: 'db-nav-group', 'data-text-group': g.id }, g.name));
      if (!g.files.length) nav.append(h('p', { class: 'tx-nav-empty' }, 'Aucun fichier.'));
      for (const f of g.files) nav.append(h('button', { class: 'tx-nav-file' + (f.id === S.file ? ' on' : ''), 'data-text-file': f.id, title: f.name, onclick: () => select(f.id) },
        h('span', {}, shortName(f)), h('span', { class: 'tx-count' }, String(f.rows.length))));
    }
    const missing = db().units.filter(u => !t.files.some(f => f.kind === 'character' && f.ref === u.id));
    nav.append(h('div', { class: 'tx-nav-actions' },
      missing.length ? h('button', { class: 'small', 'data-texts-characters': true, title: 'Un fichier de textes par personnage de la base', onclick: () => {
        for (const u of missing) Texts.create(t, { name: u.name, kind: 'character', ref: u.id });
        change(); if (!S.file) S.file = t.files[0].id; render(); UI.toast(missing.length + ' fichier(s) de personnage créé(s).');
      } }, '＋ Fichiers des personnages (' + missing.length + ')') : null,
      h('button', { class: 'small', 'data-texts-move-lines': true, title: 'Chaque réplique écrite d’une unité dans les dialogues (événements, camp, soutiens…) part dans le fichier de textes de ce personnage, traductions comprises ; le dialogue y renvoie.', onclick: async () => {
        if (!(await UI.confirm('Ranger toutes les répliques des personnages écrites dans les dialogues de la base dans leurs fichiers de textes ?\nLes dialogues renverront à ces répliques (@fichier#id) ; les traductions déjà saisies suivent.', { ok: 'Importer' }))) return;
        const n = Texts.moveToCharacters(t, db(), Editor.project().meta);
        change(); render(); UI.toast(n ? n + ' réplique(s) importée(s) dans les fichiers des personnages.' : 'Aucune réplique de personnage à importer.');
      } }, 'Importer les répliques dans les personnages'),
      h('button', { class: 'small ghost', title: 'Les fichiers CSV sont écrits à l’enregistrement du projet', onclick: () => tf.openResourceFolder(Editor.dir(), 'textes') }, 'Ouvrir le dossier textes')));
  }

  function topBar() {
    const t = texts(), f = curFile();
    const sel = h('select', { class: 'tx-file-select', 'data-text-select': true, onchange: () => select(sel.value) }, fileOptions(t));
    sel.value = S.file;
    return h('div', { class: 'studio-top' },
      h('div', { class: 'studio-top-left' },
        h('button', { class: 'studio-new', 'data-texts-new': true, html: Icons.icon('plus'), onclick: newFile }, 'Nouveau fichier de textes'),
        h('button', { class: 'small', 'data-texts-languages': true, onclick: manageLanguages }, 'Gérer les langues')),
      h('div', { class: 'studio-top-centre' }, t.files.length ? h('label', { class: 'studio-picker tx-picker' }, h('span', { class: 'studio-picker-kind' }, 'Fichier de textes'), sel) : null),
      h('div', { class: 'studio-top-right' }, f && f.kind !== 'base' ? h('button', { class: 'small danger', title: 'Supprimer ce fichier de textes', html: Icons.icon('trash'), 'data-texts-delete': true, onclick: async () => {
        if (!(await UI.confirm(`Supprimer le fichier de textes « ${f.name} » (${f.rows.length} texte(s)) ?\nLes dialogues qui y renvoient afficheront « texte manquant ».`, { danger: true, ok: 'Supprimer' }))) return;
        t.files.splice(t.files.indexOf(f), 1); S.file = t.files[0] ? t.files[0].id : ''; change(); render();
      } }) : null));
  }

  function content() {
    const pane = h('div', { class: 'db-form' });
    const col = h('div', { class: 'studio-col' });
    pane.append(col);
    const f = curFile();
    if (!f) {
      col.append(h('section', { class: 'studio-hero' },
        h('div', { class: 'hero-text' }, h('h2', {}, 'Textes et dialogues'),
          h('p', { class: 'hero-desc' }, 'Range les textes du jeu par type (armes, compétences, interface…) et par personnage, traduis-les en plusieurs langues, puis appelle-les dans les dialogues des événements avec le bouton « ＋ Texte » (référence @fichier#id). Les fichiers sont enregistrés en CSV dans le dossier textes/ du projet.')),
        h('div', { class: 'hero-badges' }, h('button', { class: 'primary', onclick: newFile }, 'Créer un fichier de textes'))));
      return pane;
    }
    col.append(hero(f), tabs(), S.tab === 'translate' ? translateCard(f) : textsCard(f));
    return pane;
  }

  function hero(f) {
    const t = texts(), st = Texts.stats(f, t), kind = kindOf(f.kind);
    const fields = f.kind === 'base' ? h('p', { class: 'form-info tx-settings' }, 'Tenu à jour automatiquement : chaque texte de la base de données (noms, descriptions, biographies, dialogues…) a sa ligne, créée dès que l’élément existe. Le texte de la langue principale (' + langName(t.main) + ') est celui de la base : le modifier ici le modifie aussi dans la base. Les autres colonnes sont ses traductions.') : h('div', { class: 'form-row tx-settings' },
      field('Nom', h('input', { type: 'text', value: f.name, 'data-text-name': true, onchange: (e) => { f.name = e.target.value || f.name; change(); render(); } })),
      field('Type de donnée', (() => { const s = h('select', { onchange: () => { f.kind = s.value; if (f.kind !== 'character') f.ref = ''; change(); render(); } }, Texts.KINDS.filter(k => k.id !== 'base').map(k => h('option', { value: k.id }, k.one))); s.value = f.kind; return s; })()),
      f.kind === 'character' ? field('Personnage (portrait et nom des répliques)', (() => {
        const s = h('select', { 'data-text-ref': true, onchange: () => { f.ref = s.value; change(); render(); } }, [h('option', { value: '' }, '— aucun —')].concat(db().units.map(u => h('option', { value: u.id }, u.name))));
        s.value = f.ref || ''; return s;
      })()) : null);
    return h('section', { class: 'studio-hero' },
      h('div', { class: 'hero-main' }, f.kind === 'character' ? h('div', { class: 'hero-visual' }, faceOf(f, 'bust')) : null,
        h('div', { class: 'hero-text' }, h('div', { class: 'hero-kicker' }, f.kind === 'base' && f.group ? kind.one + ' · ' + f.group : kind.one),
          h('h2', {}, f.name, h('span', { class: 'id' }, f.id)),
          h('div', { class: 'tx-facts' },
            h('div', {}, h('span', {}, 'Contient'), h('b', {}, st.rows + ' texte' + (st.rows > 1 ? 's' : ''))),
            h('div', {}, h('span', {}, 'Traduit en'), h('b', {}, st.translated + ' / ' + t.languages.length + ' langue' + (t.languages.length > 1 ? 's' : ''))),
            h('div', {}, h('span', {}, 'Référence'), h('b', { class: 'tx-mono' }, '@' + f.id + '#…'))))),
      fields);
  }
  const field = (label, input) => h('div', { class: 'field' }, h('label', { class: 'field-label' }, label), input);

  function tabs() {
    const b = (id, label) => h('button', { class: S.tab === id ? 'on' : '', 'data-text-tab': id, onclick: () => { S.tab = id; render(); } }, label);
    return h('div', { class: 'studio-tabs' }, b('texts', 'Textes'), b('translate', 'Traduction'));
  }

  function langSelect(value, onPick, attrs) {
    const s = h('select', Object.assign({ onchange: () => onPick(s.value) }, attrs || {}), texts().languages.map(l => h('option', { value: l.code }, l.name + ' (' + l.code + ')')));
    s.value = value; return s;
  }
  function matches(r) {
    const q = S.query.trim().toLowerCase();
    if (!q) return true;
    return r.id.toLowerCase().includes(q) || Object.values(r.t || {}).some(v => String(v).toLowerCase().includes(q));
  }

  function textsCard(f) {
    const t = texts(), auto = f.kind === 'base';
    if (!t.languages.some(l => l.code === S.lang)) S.lang = t.main;
    const list = h('div', { class: 'tx-rows' });
    const isDlg = auto && (f.field === 'dialogues' || f.field === 'conversations');
    const preview = f.kind === 'character' || isDlg ? h('div', { class: 'tx-preview', 'data-text-preview': true }) : null;
    const showPreview = (r) => { if (preview) preview.replaceChildren(...dialogueBox(f, r ? (r.t[S.lang] || Texts.lookup(t, f.id + '#' + r.id, S.lang) || '') : '', isDlg ? (r && r.who) || '' : undefined)); };
    const fill = () => {
      list.replaceChildren();
      const rows = f.rows.filter(matches);
      if (!rows.length) list.append(h('p', { class: 'db-empty' }, f.rows.length ? 'Aucun texte ne correspond.' : 'Aucun texte. Ajoute-en un ou importe un CSV.'));
      for (const r of rows) {
        const ta = h('textarea', { rows: 1, spellcheck: false, placeholder: Texts.lookup(t, f.id + '#' + r.id, t.main) || '…', 'data-text-row': r.id });
        ta.value = r.t[S.lang] || '';
        const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(36, ta.scrollHeight + 2) + 'px'; };
        ta.addEventListener('input', () => {
          if (auto && S.lang === t.main) { if (!ta.value.trim()) return; Texts.setDbText(t, db(), Editor.project().meta, f.id, r.id, ta.value); }
          if (ta.value) r.t[S.lang] = ta.value; else delete r.t[S.lang];
          change(); grow(); if (S.row === r.id) showPreview(r);
        });
        const choose = () => { if (S.row === r.id && row.classList.contains('on')) return; S.row = r.id; list.querySelectorAll('.tx-row.on').forEach(x => x.classList.remove('on')); row.classList.add('on'); showPreview(r); };
        ta.addEventListener('focus', choose);
        ta.addEventListener('mousedown', choose);
        const id = isDlg ? h('span', { class: 'tx-id ro tx-id-who', title: r.id }, h('b', { 'data-text-who': r.id }, r.who || 'Narration'), h('small', {}, r.id)) : auto ? h('span', { class: 'tx-id ro', title: r.id }, r.id) : h('input', { type: 'text', class: 'tx-id', value: r.id, title: 'Identifiant (référence @' + f.id + '#' + r.id + ')', onchange: (e) => {
          const v = e.target.value.trim().replace(/[\s#]+/g, '_');
          if (!v || f.rows.some(x => x !== r && x.id === v)) { e.target.value = r.id; return UI.toast('Identifiant vide ou déjà utilisé.', 'warn'); }
          r.id = v; e.target.value = v; change();
        } });
        const row = h('div', { class: 'tx-row' + (S.row === r.id ? ' on' : '') }, id, ta,
          h('button', { class: 'mini', title: 'Copier la référence pour un dialogue', html: Icons.icon('copy'), onclick: () => { copy('@' + f.id + '#' + r.id); } }),
          auto ? h('span', {}) : h('button', { class: 'mini', title: 'Supprimer ce texte', html: Icons.icon('trash'), onclick: () => { f.rows.splice(f.rows.indexOf(r), 1); change(); render(); } }));
        list.append(row);
        requestAnimationFrame(grow);
      }
    };
    fill();
    const search = h('input', { type: 'search', class: 'tx-search', placeholder: 'Rechercher un texte ou un ID…', value: S.query, oninput: (e) => { S.query = e.target.value; fill(); } });
    const csv = h('input', { type: 'file', accept: '.csv,text/csv', class: 'hidden', onchange: async () => {
      const file = csv.files[0]; if (!file) return;
      const n = Texts.importCsv(f, t, await file.text());
      if (auto) { for (const r of f.rows) if (r.t[t.main]) Texts.setDbText(t, db(), Editor.project().meta, f.id, r.id, r.t[t.main]); Texts.syncDb(t, db(), Editor.project().meta); }
      change(); render(); UI.toast(n + ' texte(s) importé(s).');
    } });
    const card = h('section', { class: 'studio-card wide tx-card' },
      h('div', { class: 'tx-card-head' }, h('h3', { class: 'studio-card-title' }, 'Textes'),
        t.languages.length > 1 ? langSelect(S.lang, (v) => { S.lang = v; render(); }, { title: 'Langue affichée et modifiée', 'data-text-lang': true }) : null, search),
      preview, h('div', { class: 'tx-cols' }, h('span', {}, 'ID'), h('span', {}, 'Texte' + (t.languages.length > 1 ? ' — ' + langName(S.lang) : ''))),
      list,
      h('div', { class: 'tx-foot' },
        auto ? h('span', { class: 'form-info' }, 'Les lignes suivent la base de données : ajoute ou supprime l’élément dans la base.') : h('button', { class: 'small danger', 'data-texts-clear': true, html: Icons.icon('trash'), disabled: !f.rows.length, onclick: async () => {
          if (!(await UI.confirm(`Effacer les ${f.rows.length} textes de « ${f.name} » ?`, { danger: true, ok: 'Tout effacer' }))) return;
          f.rows = []; change(); render();
        } }, 'Tout effacer'),
        h('span', { class: 'tb-spacer' }),
        h('button', { class: 'small', onclick: () => csv.click() }, 'Importer des textes (CSV)'), csv,
        auto ? null : h('button', { class: 'small studio-new', 'data-texts-add': true, html: Icons.icon('plus'), onclick: () => {
          const r = Texts.addRow(f); S.row = r.id; S.query = ''; change(); render();
          const el = document.querySelector(`[data-text-row="${CSS.escape(r.id)}"]`); if (el) el.focus();
        } }, 'Ajouter un texte')));
    if (preview) showPreview(f.rows.find(r => r.id === S.row) || f.rows[0]);
    return card;
  }

  function translateCard(f) {
    const t = texts();
    if (t.languages.length < 2) {
      return h('section', { class: 'studio-card wide' }, h('h3', { class: 'studio-card-title' }, 'Traduction'),
        h('p', { class: 'form-info' }, 'Ajoute une deuxième langue pour traduire ce fichier.'),
        h('button', { class: 'small', onclick: manageLanguages }, 'Gérer les langues'));
    }
    if (!t.languages.some(l => l.code === S.src)) S.src = t.main;
    if (!t.languages.some(l => l.code === S.dst) || S.dst === S.src) S.dst = (t.languages.find(l => l.code !== S.src) || {}).code;
    const done = f.rows.filter(r => String(r.t[S.dst] || '').trim()).length;
    const rows = h('div', { class: 'tx-rows' }, f.rows.filter(matches).map(r => {
      const ta = h('textarea', { rows: 1, spellcheck: false, 'data-text-translate': r.id, placeholder: 'Traduction…' });
      ta.value = r.t[S.dst] || '';
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(36, ta.scrollHeight + 2) + 'px'; };
      ta.addEventListener('input', () => { if (ta.value) r.t[S.dst] = ta.value; else delete r.t[S.dst]; change(); grow(); });
      requestAnimationFrame(grow);
      return h('div', { class: 'tx-row tx-row-tr' }, h('span', { class: 'tx-id ro' }, r.id), h('div', { class: 'tx-src' + (r.t[S.src] ? '' : ' muted') }, r.t[S.src] || '(vide)'), ta);
    }));
    return h('section', { class: 'studio-card wide tx-card' },
      h('div', { class: 'tx-card-head' }, h('h3', { class: 'studio-card-title' }, 'Traduction'),
        h('span', { class: 'tx-progress' }, done + ' / ' + f.rows.length + ' traduits'),
        langSelect(S.src, (v) => { S.src = v; render(); }, { title: 'Langue source' }), h('span', { class: 'muted' }, '→'),
        langSelect(S.dst, (v) => { S.dst = v; render(); }, { title: 'Langue cible', 'data-text-dst': true }),
        h('input', { type: 'search', class: 'tx-search', placeholder: 'Rechercher…', value: S.query, oninput: (e) => { S.query = e.target.value; render(); } })),
      h('div', { class: 'tx-cols tr' }, h('span', {}, 'ID'), h('span', {}, langName(S.src)), h('span', {}, langName(S.dst))),
      rows);
  }

  // ---------- aperçu : boîte de dialogue avec le portrait du personnage ----------
  function faceOf(f, mode, who) {
    const u = who !== undefined ? unitNamed(who) : f && db().units.find(x => x.id === f.ref);
    const box = h('div', { class: 'tx-face' + (mode === 'bust' ? ' bust' : '') });
    if (!u || !u.portrait) { box.append(h('div', { class: 'hero-initial', style: { background: (u && u.color) || '' } }, ((who !== undefined ? who : Texts.speakerOf(f, db())) || '?').slice(0, 1).toUpperCase())); return box; }
    Render.loadImage(Editor.baseUrl(), u.portrait).then(img => box.replaceChildren(Faces.element(img, Render.imageUrl(Editor.baseUrl(), u.portrait), mode || 'main') || '')).catch(() => {});
    return box;
  }
  const unitNamed = (name) => { const n = String(name || '').trim().toLowerCase(); return n ? db().units.find(u => String(u.name || '').trim().toLowerCase() === n) : null; };
  /** Boîte de dialogue d'aperçu ; who : orateur d'une réplique (sinon le personnage du fichier). */
  function dialogueBox(f, text, who) {
    const name = who !== undefined ? who : Texts.speakerOf(f, db());
    return [h('div', { class: 'tx-dlg' }, h('div', { class: 'tx-dlg-face' }, faceOf(f, 'main', who)),
      h('div', { class: 'tx-dlg-box' }, h('div', { class: 'tx-dlg-name' }, name || '—'), h('div', { class: 'tx-dlg-text' }, text || h('span', { class: 'muted' }, 'Choisis un texte pour le voir dans la boîte de dialogue.'))))];
  }
  function copy(s) {
    try { navigator.clipboard.writeText(s); } catch (e) { /* presse-papiers indisponible */ }
    UI.toast('Référence copiée : ' + s + ' (à coller dans un dialogue, seule sur sa ligne)');
  }

  // ---------- fenêtres ----------
  async function newFile() {
    const t = texts();
    const model = { name: '', kind: 'character', ref: '' };
    const ok = await UI.modal((box, closeModal) => {
      const refRow = h('div', {});
      const fillRef = () => {
        refRow.replaceChildren();
        if (model.kind !== 'character') return;
        const s = h('select', { onchange: () => { model.ref = s.value; const u = db().units.find(x => x.id === s.value); if (u && !name.value) name.value = u.name; } },
          [h('option', { value: '' }, '— choisir —')].concat(db().units.map(u => h('option', { value: u.id }, u.name))));
        s.value = model.ref;
        refRow.append(field('Personnage', s));
      };
      const kind = h('select', { 'data-new-text-kind': true, onchange: () => { model.kind = kind.value; fillRef(); } }, Texts.KINDS.filter(k => k.id !== 'base').map(k => h('option', { value: k.id }, k.one)));
      kind.value = model.kind;
      const name = h('input', { type: 'text', placeholder: 'ex. Eliwood, Armes, Menus…', 'data-new-text-name': true });
      fillRef();
      box.append(h('h3', {}, 'Nouveau fichier de textes'),
        h('div', { class: 'form' }, field('Type de donnée', kind), refRow, field('Nom', name)),
        h('div', { class: 'modal-actions' }, h('button', { onclick: () => closeModal(false) }, 'Annuler'),
          h('button', { class: 'primary', onclick: () => { model.name = name.value.trim() || (model.kind === 'character' && model.ref ? db().units.find(u => u.id === model.ref).name : kindOf(model.kind).one); closeModal(true); } }, 'Créer')));
    }, { enter: (c) => c(true) });
    if (!ok) return;
    if (!model.name) model.name = kindOf(model.kind).one;
    const f = Texts.create(t, model);
    change(); select(f.id);
  }

  function manageLanguages() {
    const t = texts();
    return UI.modal((box, closeModal) => {
      const list = h('div', { class: 'tx-langs' });
      const fill = () => {
        list.replaceChildren(...t.languages.map(l => h('div', { class: 'tx-lang' },
          h('input', { type: 'radio', name: 'tx-main', checked: t.main === l.code, title: 'Langue principale (utilisée si une traduction manque)', onchange: () => { t.main = l.code; Texts.applyMain(t, db(), Editor.project().meta); change(); } }),
          h('input', { type: 'text', value: l.name, onchange: (e) => { l.name = e.target.value || l.code; change(); } }),
          h('span', { class: 'tx-mono muted' }, l.code),
          h('button', { class: 'mini', title: 'Retirer cette langue (ses traductions sont effacées)', html: Icons.icon('trash'), disabled: t.languages.length < 2, onclick: async () => {
            if (!(await UI.confirm(`Retirer « ${l.name} » ? Ses textes seront effacés de tous les fichiers.`, { danger: true, ok: 'Retirer' }))) return;
            t.languages.splice(t.languages.indexOf(l), 1); for (const f of t.files) for (const r of f.rows) delete r.t[l.code];
            if (t.main === l.code) t.main = t.languages[0].code; change(); fill();
          } }))));
      };
      fill();
      const code = h('select', { 'data-lang-code': true }, Object.entries(Texts.LANG_NAMES).map(([c, n]) => h('option', { value: c }, n + ' (' + c + ')')));
      box.append(h('h3', {}, 'Langues du jeu'),
        h('p', { class: 'form-info' }, 'Chaque langue est une colonne des fichiers CSV. La langue principale (pastille) sert quand une traduction manque.'),
        list, h('div', { class: 'form-row' }, code, h('button', { class: 'small', 'data-lang-add': true, onclick: () => {
          if (t.languages.some(l => l.code === code.value)) return UI.toast('Cette langue est déjà là.');
          t.languages.push({ code: code.value, name: Texts.LANG_NAMES[code.value] }); change(); fill();
        } }, 'Ajouter')),
        h('div', { class: 'modal-actions' }, h('button', { class: 'primary', onclick: () => closeModal(true) }, 'Fermer')));
    }).then(() => { if (isOpen()) render(); });
  }

  /** Choix d'un texte à insérer dans un dialogue : fichier, recherche, aperçu ; renvoie « fichier#id ». */
  function pick() {
    const t = texts();
    if (!t.files.length) { UI.alert('Aucun texte', 'Crée d’abord un fichier de textes (barre d’icônes › Textes).'); return Promise.resolve(null); }
    let file = curFile() || t.files[0], query = '';
    return UI.modal((box, closeModal) => {
      const list = h('div', { class: 'tx-pick-list' });
      const prev = h('div', { class: 'tx-preview' });
      const sel = h('select', { 'data-pick-file': true, onchange: () => { file = t.files.find(f => f.id === sel.value); fill(); } },
        fileOptions(t));
      sel.value = file.id;
      const fill = () => {
        list.replaceChildren();
        const q = query.toLowerCase();
        for (const r of file.rows.filter(r => !q || r.id.toLowerCase().includes(q) || Object.values(r.t).some(v => String(v).toLowerCase().includes(q)))) {
          const txt = Texts.lookup(t, file.id + '#' + r.id, t.main) || '';
          list.append(h('button', { class: 'tx-pick-row', 'data-pick-row': r.id, onmouseenter: () => prev.replaceChildren(...(file.kind === 'character' ? dialogueBox(file, txt) : [h('div', { class: 'tx-dlg-text' }, txt)])),
            onclick: () => closeModal(file.id + '#' + r.id) }, h('span', { class: 'tx-id ro' }, r.id), h('span', {}, txt.split('\n')[0] || '(vide)')));
        }
        if (!list.childNodes.length) list.append(h('p', { class: 'db-empty' }, 'Aucun texte.'));
        prev.replaceChildren();
      };
      fill();
      box.append(h('h3', {}, 'Insérer un texte'), h('div', { class: 'form-row' }, sel, h('input', { type: 'search', placeholder: 'Rechercher…', oninput: (e) => { query = e.target.value; fill(); } })),
        prev, list, h('div', { class: 'modal-actions' }, h('button', { onclick: () => closeModal(null) }, 'Annuler')));
    }, { wide: true });
  }
  // bouton « ＋ Texte » sous les champs de dialogue (ui.js)
  UI.textPicker = async (textarea) => {
    const ref = await pick();
    if (!ref) return null;
    const v = textarea.value, at = textarea.selectionStart === undefined ? v.length : textarea.selectionStart;
    const before = v.slice(0, at), after = v.slice(at);
    const line = (before && !before.endsWith('\n') ? '\n' : '') + '@' + ref + (after && !after.startsWith('\n') ? '\n' : '');
    textarea.value = before + line + after;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    return ref;
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !document.querySelector('.modal-back')) { e.preventDefault(); close(); }
  });
  window.TextsEditor = { open, close, pick, isOpen, render };
})();
