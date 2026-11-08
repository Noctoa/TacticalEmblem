/*
 * Textes du jeu (outil « Textes », façon Pokémon Studio) : fichiers de textes rangés par type de donnée
 * (personnage, armes, objets, compétences…), une ligne par texte, une colonne par langue.
 *
 *   project.texts = { languages: [{ code: 'fr', name: 'Français' }], main: 'fr',
 *                     files: [{ id, name, kind, ref, rows: [{ id: '0000', t: { fr: '…', en: '…' } }] }] }
 *   Sur le disque : textes/index.json (langues + fiches des fichiers) et textes/<id>.csv (id ; langues…).
 *
 *   parseCsv(text) / toCsv(file, languages)       lecture (séparateur « , » « ; » ou tabulation détecté) / écriture
 *   resolve(script, texts, lang, db)              remplace les références d'un dialogue par le texte :
 *       ligne « @fichier#id »   → la réplique (préfixée « Nom: » pour un fichier de personnage)
 *       « {@fichier#id} »        → le texte dans la phrase
 *   lookup(texts, 'fichier#id', lang)             texte d'une référence (langue → langue principale → première remplie)
 *   speakerOf(file, db)                           nom affiché d'un fichier de personnage
 *   create(texts, { name, kind, ref }) / addRow(file) / fillFromDb(file, db) / stats(file, texts) / validate(texts)
 *
 * Textes de la base (fichiers « base_… », tenus à jour tout seuls) : chaque texte du jeu (noms, descriptions,
 * biographies, dialogues des événements, villages, soutiens, camp…) a sa ligne, dans la langue principale = la valeur
 * de la base ; les autres colonnes sont ses traductions.
 *   syncDb(texts, db, meta, { csvWins })   ajoute / met à jour / retire les lignes ; csvWins (ouverture) : un texte
 *                                          principal modifié dans le CSV (Excel) remplace celui de la base
 *   setDbText(texts, db, meta, fileId, rowId, value)   écrit un texte principal dans la base
 *   localizeDb(texts, db, meta, lang)                  remplace les textes de la base par leur traduction (en jeu)
 *   applyMain(texts, db, meta)                         après un changement de langue principale
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Texts = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KINDS = [
    { id: 'base', name: 'Textes du jeu (base de données)', one: 'Base de données' },
    { id: 'character', name: 'Personnages', one: 'Personnage', db: 'units' },
    { id: 'weapon', name: 'Armes', one: 'Armes', db: 'weapons' },
    { id: 'item', name: 'Objets', one: 'Objets', db: 'items' },
    { id: 'skill', name: 'Compétences', one: 'Compétences', db: 'skills' },
    { id: 'class', name: 'Classes', one: 'Classes', db: 'classes' },
    { id: 'chapter', name: 'Chapitres', one: 'Chapitres', db: 'chapters' },
    { id: 'system', name: 'Interface', one: 'Interface' },
    { id: 'other', name: 'Autres', one: 'Autres' }
  ];
  const LANG_NAMES = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', ja: '日本語', ko: '한국어', zh: '中文', nl: 'Nederlands', pl: 'Polski', ru: 'Русский' };
  const FILE_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;

  function empty() { return { languages: [{ code: 'fr', name: 'Français' }], main: 'fr', files: [] }; }
  function normalize(t) {
    const out = t && typeof t === 'object' ? t : empty();
    if (!Array.isArray(out.languages) || !out.languages.length) out.languages = [{ code: 'fr', name: 'Français' }];
    out.languages = out.languages.filter(l => l && l.code).map(l => ({ code: String(l.code), name: l.name || LANG_NAMES[l.code] || l.code }));
    if (!out.languages.some(l => l.code === out.main)) out.main = out.languages[0].code;
    if (!Array.isArray(out.files)) out.files = [];
    for (const f of out.files) {
      if (!KINDS.some(k => k.id === f.kind)) f.kind = 'other';
      if (f.kind === 'base') f.auto = true;
      if (!Array.isArray(f.rows)) f.rows = [];
      for (const r of f.rows) if (!r.t || typeof r.t !== 'object') r.t = {};
    }
    return out;
  }
  function slug(s) {
    const base = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return base || 'textes';
  }
  function create(texts, o) { return create_(texts, o); }
  function create_(texts, o) {
    const base = slug(o.name || (o.kind === 'character' ? 'personnage' : o.kind));
    let id = base, i = 2;
    while (texts.files.some(f => f.id === id)) id = base + '_' + (i++);
    const file = { id, name: o.name || id, kind: o.kind || 'other', ref: o.ref || '', rows: [] };
    texts.files.push(file);
    return file;
  }
  function nextRowId(file) {
    let n = 0;
    for (const r of file.rows) if (/^\d+$/.test(r.id)) n = Math.max(n, Number(r.id) + 1);
    return String(n).padStart(4, '0');
  }
  function addRow(file, t, id) { const r = { id: id || nextRowId(file), t: Object.assign({}, t || {}) }; file.rows.push(r); return r; }

  /** Remplit un fichier d'armes, d'objets, de compétences ou de classes avec les noms et descriptions de la base. */
  function fillFromDb(file, db, lang) {
    const kind = KINDS.find(k => k.id === file.kind);
    const list = kind && kind.db ? (db[kind.db] || []) : [];
    let added = 0;
    for (const e of list) {
      for (const [suffix, field] of [['nom', 'name'], ['desc', 'description']]) {
        const id = e.id + '.' + suffix, value = e[field];
        if (!value || file.rows.some(r => r.id === id)) continue;
        addRow(file, { [lang]: String(value) }, id); added++;
      }
    }
    return added;
  }

  function speakerOf(file, db) {
    if (!file || file.kind !== 'character') return '';
    const u = db && (db.units || []).find(x => x.id === file.ref);
    return (u && u.name) || file.name;
  }
  function pick(row, texts, lang) {
    if (!row) return '';
    const t = row.t || {};
    if (t[lang]) return t[lang];
    if (t[texts.main]) return t[texts.main];
    for (const l of texts.languages) if (t[l.code]) return t[l.code];
    return '';
  }
  function find(texts, ref) {
    const m = /^([^#\s]+)#(\S+)$/.exec(String(ref || '').trim());
    if (!m || !texts) return null;
    const file = (texts.files || []).find(f => f.id === m[1]);
    const row = file && file.rows.find(r => r.id === m[2]);
    return row ? { file, row } : null;
  }
  function lookup(texts, ref, lang) { const f = find(texts, ref); return f ? pick(f.row, texts, lang) : null; }

  /** Références de noms : @A = protagoniste, @{id} = personnage stable de la base. */
  const characterNameRef = id => '@{' + id + '}';
  function resolveNames(text, db, context = {}) {
    const units = (db && db.units) || [];
    const avatarId = context.avatarId || (units.find(u => u.protagonist) || units[0] || {}).id;
    const src = String(text || ''), mapText = context.mapText || (value => value);
    let out = '', at = 0;
    for (const match of src.matchAll(/(?<![\p{L}\p{N}_@])@A(?![\p{L}\p{N}_#])|(?<!@)@\{([^{}\r\n]+)\}/gu)) {
      const [all, id] = match;
      const key = id === undefined ? avatarId : id;
      const unit = units.find(u => u.id === key);
      out += mapText(src.slice(at, match.index));
      out += unit ? unit.name : '[personnage manquant : ' + (id === undefined ? '@A' : id) + ']';
      at = match.index + all.length;
    }
    return out + mapText(src.slice(at));
  }

  function resolve(script, texts, lang, db) {
    const src = String(script || '');
    if (!texts || !texts.files || !/@/.test(src)) return src;
    const missing = (ref) => '[texte manquant : ' + ref + ']';
    const inline = (s) => s.replace(/\{@([^}\s#]+#[^}\s]+)\}/g, (all, ref) => { const v = lookup(texts, ref, lang); return v === null ? missing(ref) : v.split('\n')[0]; });
    return src.split('\n').map(line => {
      const m = /^\s*@([^#\s]+#\S+)\s*$/.exec(line);
      if (!m) return inline(line);
      const found = find(texts, m[1]);
      if (!found) return missing(m[1]);
      const text = inline(pick(found.row, texts, lang));
      const who = speakerOf(found.file, db);
      return text.split('\n').filter(l => l.trim()).map(l => who ? who + ': ' + l : l).join('\n');
    }).join('\n');
  }

  function stats(file, texts) {
    const rows = file.rows.length;
    const done = texts.languages.filter(l => rows && file.rows.every(r => String((r.t || {})[l.code] || '').trim()));
    return { rows, translated: done.length, languages: done.map(l => l.code) };
  }

  // ---------- CSV ----------
  function parseCsv(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const first = src.split(/\r?\n/, 1)[0] || '';
    const counts = [',', ';', '\t'].map(c => [c, first.split(c).length]);
    const sep = counts.sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }
  /** Lignes CSV → lignes de texte : l'en-tête donne les langues (première colonne : id). */
  function rowsFromCsv(text) {
    const table = parseCsv(text);
    if (!table.length) return { languages: [], rows: [] };
    const head = table[0].map(s => s.trim());
    const langs = head.slice(1).filter(Boolean);
    const rows = table.slice(1).filter(r => (r[0] || '').trim()).map(r => {
      const t = {};
      langs.forEach((l, i) => { if (r[i + 1] !== undefined && r[i + 1] !== '') t[l] = r[i + 1]; });
      return { id: r[0].trim(), t };
    });
    return { languages: langs, rows };
  }
  const esc = (s) => { const v = String(s === undefined || s === null ? '' : s); return /[",;\n\r\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function toCsv(file, languages) {
    const codes = languages.map(l => l.code || l);
    const lines = [['id', ...codes].map(esc).join(',')];
    for (const r of file.rows) lines.push([r.id, ...codes.map(c => (r.t || {})[c] || '')].map(esc).join(','));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
  /** Ajoute (ou met à jour) les lignes d'un CSV importé dans un fichier ; renvoie le nombre de lignes touchées. */
  function importCsv(file, texts, csv) {
    const { languages, rows } = rowsFromCsv(csv);
    for (const code of languages) if (!texts.languages.some(l => l.code === code)) texts.languages.push({ code, name: LANG_NAMES[code] || code });
    for (const r of rows) {
      const cur = file.rows.find(x => x.id === r.id);
      if (cur) Object.assign(cur.t, r.t); else file.rows.push(r);
    }
    return rows.length;
  }

  function validate(texts) {
    const errors = [];
    if (!texts) return errors;
    const seen = new Set();
    for (const f of texts.files || []) {
      if (!FILE_ID.test(f.id || '')) errors.push(`Textes : identifiant de fichier invalide « ${f.id} » (lettres minuscules, chiffres, _ ou -).`);
      if (seen.has(f.id)) errors.push(`Textes : deux fichiers ont l'identifiant « ${f.id} ».`);
      seen.add(f.id);
      const ids = new Set();
      for (const r of f.rows || []) {
        if (!String(r.id || '').trim() || /[\s#]/.test(r.id)) errors.push(`Textes « ${f.name} » : identifiant de texte invalide « ${r.id} ».`);
        else if (ids.has(r.id)) errors.push(`Textes « ${f.name} » : deux textes ont l'identifiant « ${r.id} ».`);
        ids.add(r.id);
      }
    }
    return errors;
  }

  // ---------- textes de la base ----------
  /** Catégories de la base : [liste, nom de la catégorie, complément pour le nom des fichiers]. */
  const DB_TEXT_FILES = [['units', 'Unités', 'des unités'], ['classes', 'Classes', 'des classes'], ['weapons', 'Armes', 'des armes'], ['items', 'Objets', 'des objets'],
    ['skills', 'Compétences', 'des compétences'], ['ultimates', 'Ultimes', 'des ultimes'], ['terrains', 'Terrains', 'des terrains'], ['arcs', 'Chapitres', 'des chapitres'],
    ['chapters', 'Actes', 'des actes'], ['talks', 'Conversations du camp', 'du camp'], ['supports', 'Affinités', 'des affinités'], ['system', 'Jeu (titre, camp, crédits)', 'du jeu']];
  /** Types de texte : un CSV par catégorie et par type (ex. « Noms des unités », « Épilogues des unités »). */
  const DB_TEXT_FIELDS = [['name', 'Noms'], ['description', 'Descriptions'], ['bio', 'Biographies'], ['ending', 'Épilogues'], ['quote', 'Citations'],
    ['title', 'Titres'], ['subtitle', 'Sous-titres'], ['objective', 'Objectifs'], ['label', 'Libellés'], ['dialogues', 'Dialogues'], ['conversations', 'Conversations'], ['credits', 'Crédits']];
  const TEXT_KEYS = new Set(['name', 'description', 'bio', 'ending', 'script', 'text', 'subtitle', 'credits', 'label', 'title', 'objective', 'quote']);
  const SKIP_KEYS = new Set(['generator', 'stats', 'growths', 'frames', 'battleColors', 'anims', 'statBonus', 'image', 'portrait', 'mapSprite', 'battler', 'audio', 'settings', 'music']);
  const baseFileId = (list, field) => 'base_' + list + (field ? '_' + field : '');
  /** Type de texte d'une entrée d'après son chemin (« c_eliwood.ending » → ending, « ….conversations.C » → conversations). */
  function fieldOf(path) {
    if (path.includes('conversations')) return 'conversations';
    if (path.includes('objective')) return 'objective';
    const k = path[path.length - 1];
    return k === 'script' || k === 'text' ? 'dialogues' : k;
  }
  function walk(node, path, out) {
    if (Array.isArray(node)) { node.forEach((x, i) => { if (x && typeof x === 'object') walk(x, path.concat(x.id ? String(x.id) : String(i)), out); }); return; }
    if (!node || typeof node !== 'object') return;
    const inConv = path[path.length - 1] === 'conversations';
    for (const k of Object.keys(node)) {
      if (SKIP_KEYS.has(k)) continue;
      const v = node[k];
      if (typeof v === 'string') { if ((TEXT_KEYS.has(k) || inConv) && v.trim()) out.push({ path: path.concat(k), get: () => node[k], set: (x) => { node[k] = x; } }); }
      else if (v && typeof v === 'object') walk(v, path.concat(k), out);
    }
  }
  /** Textes d'une liste de la base : [{ id, field, get, set }] (id = chemin, ex. « c_eliwood.bio », « ch_1.events.ev1.script »). */
  function collect(list, db, meta, raw) {
    let out = [];
    if (list === 'system') {
      const m = meta || {};
      if (typeof m.name === 'string' && m.name.trim()) out.push({ path: ['jeu', 'name'], get: () => m.name, set: (x) => { m.name = x; } });
      if (m.title) walk(m.title, ['titre'], out);
      if (typeof m.credits === 'string' && m.credits.trim()) out.push({ path: ['credits'], get: () => m.credits, set: (x) => { m.credits = x; } });
      if (m.lobby) walk({ name: m.lobby.name, board: m.lobby.board && { label: m.lobby.board.label } }, ['camp'], out);
      // le camp : valeurs recopiées (objet temporaire) → écritures redirigées
      for (const e of out) if (e.path[0] === 'camp') {
        if (e.path[1] === 'name') { e.get = () => m.lobby.name; e.set = (x) => { m.lobby.name = x; }; }
        else { e.get = () => m.lobby.board.label; e.set = (x) => { m.lobby.board.label = x; }; }
      }
    } else walk((db || {})[list] || [], [], out);
    for (const e of out) { e.field = fieldOf(e.path); e.id = e.path.join('.').replace(/[\s#]+/g, '_'); }
    // conversations : une ligne de CSV par réplique (sans le nom de l'orateur)
    if (!raw) out = out.flatMap(e => DIALOGUE_FIELDS.has(e.field) ? lineEntries(e) : [e]);
    const seen = new Set();
    for (const e of out) {
      let id = e.path.join('.').replace(/[\s#]+/g, '_'), base = id, i = 2;
      while (seen.has(id)) id = base + '~' + (i++);
      seen.add(id); e.id = id;
    }
    return out;
  }
  const DIALOGUE_FIELDS = new Set(['dialogues', 'conversations']);
  const REF_LINE = /^\s*@[^#\s]+#\S+\s*$/;
  /** « Nom: texte » → { who, text } (même règle que la boîte de dialogue du jeu). */
  function parseLine(line) {
    const l = String(line || '').trim();
    const m = /^([^:]{1,40}):\s*(.*)$/.exec(l);
    return m ? { who: m[1].trim(), text: m[2] } : { who: '', text: l };
  }
  const joinLine = (who, text) => (who ? who + ': ' : '') + String(text || '').replace(/\s*\n\s*/g, ' ');
  /** Répliques d'un dialogue : une entrée par ligne non vide (les lignes @fichier#id renvoient déjà à un CSV). */
  function lineEntries(e) {
    const out = [];
    let n = 0;
    String(e.get() || '').split('\n').forEach((line, idx) => {
      if (!line.trim() || REF_LINE.test(line)) return;
      n++;
      const at = () => String(e.get() || '').split('\n');
      out.push({ path: e.path.concat(String(n).padStart(2, '0')), field: e.field, parent: e, index: n - 1, who: parseLine(line).who,
        get: () => parseLine(at()[idx]).text,
        replace: (line) => { const ls = at(); ls[idx] = line; e.set(ls.join('\n')); },
        set: (x) => { const ls = at(); ls[idx] = joinLine(parseLine(ls[idx]).who, x); e.set(ls.join('\n')); } });
    });
    return out;
  }
  /** Textes (sans orateur) d'un ancien bloc de dialogue, pour répartir ses traductions réplique par réplique. */
  const blockLines = (text) => String(text || '').split('\n').filter(l => l.trim() && !REF_LINE.test(l)).map(l => parseLine(l).text);
  /** Renomme un orateur dans tous les dialogues de la base (nom d'unité changé, ou traduit en jeu). */
  function renameSpeaker(db, meta, from, to) {
    if (!from || !to || from === to) return 0;
    let n = 0;
    for (const [list] of DB_TEXT_FILES) for (const e of collect(list, db, meta, true)) {
      if (!DIALOGUE_FIELDS.has(e.field)) continue;
      const ls = String(e.get() || '').split('\n');
      let hit = false;
      for (let i = 0; i < ls.length; i++) { const p = parseLine(ls[i]); if (ls[i].trim() && p.who === from) { ls[i] = joinLine(to, p.text); hit = true; n++; } }
      if (hit) e.set(ls.join('\n'));
    }
    return n;
  }
  const fieldLabel = (field) => { const f = DB_TEXT_FIELDS.find(x => x[0] === field); return f ? f[1] : field.charAt(0).toUpperCase() + field.slice(1); };
  const fieldRank = (field) => { const i = DB_TEXT_FIELDS.findIndex(x => x[0] === field); return i < 0 ? 99 : i; };
  /**
   * Crée / met à jour les fichiers de la base : un par catégorie et type de texte (base_units_name, base_units_ending…).
   * Les anciens fichiers d'une seule pièce (base_units) sont répartis dans les nouveaux, traductions comprises.
   */
  function syncDb(texts, db, meta, opts) {
    const csvWins = !!(opts && opts.csvWins), main = texts.main;
    const res = { added: 0, updated: 0, removed: 0 };
    const oldBase = texts.files.filter(f => f.kind === 'base');
    const others = texts.files.filter(f => f.kind !== 'base');
    const base = [];
    for (const [list, group, suffix] of DB_TEXT_FILES) {
      const entries = collect(list, db, meta);
      // toutes les lignes connues de la catégorie (anciens fichiers compris), par identifiant
      const old = new Map();
      for (const f of oldBase) if (f.ref === list) for (const r of f.rows) if (!old.has(r.id)) old.set(r.id, r);
      const known = new Set(old.keys());
      // répliques : lignes connues par dialogue (une réplique déplacée garde ses traductions)
      const pools = new Map(), claimed = new Set();
      for (const r of old.values()) { const m = /^(.*)\.\d+$/.exec(r.id); if (m) { if (!pools.has(m[1])) pools.set(m[1], []); pools.get(m[1]).push(r); } }
      const rowFor = (e) => {
        let r = old.get(e.id);
        if (!e.parent) return r;
        const v = e.get();
        if (!csvWins && (!r || r.t[main] !== v || claimed.has(r))) {
          const cand = (pools.get(e.parent.id) || []).find(x => x.t[main] === v && !claimed.has(x));
          if (cand) r = cand;
          // la ligne de ce numéro appartient à une réplique déplacée : nouvelle ligne
          else if (r && r.t[main] !== v && blockLines(e.parent.get()).includes(r.t[main])) r = null;
        }
        if (r && claimed.has(r)) r = null;
        if (r) { claimed.add(r); if (r.id !== e.id) r = { id: e.id, t: Object.assign({}, r.t) }; return r; }
        // ancien format : tout le dialogue dans une seule ligne → traductions réparties par réplique
        const block = old.get(e.parent.id);
        if (block) {
          r = { id: e.id, t: {} };
          for (const [lang, text] of Object.entries(block.t || {})) { const ls = blockLines(text); if (ls[e.index] !== undefined) r.t[lang] = ls[e.index]; }
          r.legacy = true;
          return r;
        }
        return undefined;
      };
      const byField = new Map();
      for (const e of entries) { if (!byField.has(e.field)) byField.set(e.field, []); byField.get(e.field).push(e); }
      const fields = [...byField.keys()].sort((a, b) => fieldRank(a) - fieldRank(b));
      const parts = [];
      for (const field of fields) parts.push(...partsOf(list, field, byField.get(field), db, { name: fieldLabel(field) + ' ' + suffix, group }));
      for (const { field, part, name, group: g, entries: list_ } of parts) {
        const fid = part ? partFileId(list, field, part, parts) : baseFileId(list, field);
        const prev = oldBase.find(f => f.id === fid);
        // même objet d'une synchro à l'autre (l'éditeur garde ses références)
        const file = Object.assign(prev || {}, { id: fid, name, kind: 'base', ref: list, field, group: g, auto: true, rows: [] });
        if (part) file.part = part; else delete file.part;
        for (const e of list_) {
          let r = rowFor(e);
          if (r && r.legacy) { delete r.legacy; known.delete(e.parent.id); }
          if (!r) { r = { id: e.id, t: {} }; res.added++; }
          if (e.who) r.who = e.who; else delete r.who;
          known.delete(e.id);
          const v = e.get(), cur = r.t[main];
          if (csvWins && cur && cur !== v) { e.set(cur); res.updated++; }
          else if (cur !== v) r.t[main] = v;
          file.rows.push(r);
        }
        base.push(file);
      }
      res.removed += known.size;
    }
    texts.files = base.concat(others);
    return res;
  }
  /**
   * Découpage d'un type de texte en plusieurs CSV : les dialogues des niveaux (actes) sont rangés par chapitre
   * (Base de données › Chapitres et actes), un fichier par chapitre ; les actes hors chapitre ensemble.
   */
  function partsOf(list, field, entries, db, def) {
    if (list !== 'chapters' || field !== 'dialogues') return [Object.assign({ field, part: '', entries }, def)];
    const arcOf = new Map();
    for (const a of ((db || {}).arcs || [])) for (const id of (a.acts || [])) if (!arcOf.has(id)) arcOf.set(id, a);
    const parts = new Map();
    for (const e of entries) {
      const a = arcOf.get(e.path[0]), key = a ? a.id : '';
      if (!parts.has(key)) parts.set(key, { field, part: a ? String(a.id) : 'hors-chapitre', name: a ? (a.name || a.id) : 'Actes hors chapitre', group: 'Dialogues des chapitres', entries: [], order: a ? db.arcs.indexOf(a) : 1e9 });
      parts.get(key).entries.push(e);
    }
    return [...parts.values()].sort((x, y) => x.order - y.order);
  }
  function partFileId(list, field, part, parts) {
    const slug = String(part).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '_');
    let id = ('base_' + list + '_' + field + '_' + slug).slice(0, 48);
    const same = parts.filter(p => p.part && p.part !== part && ('base_' + list + '_' + field + '_' + String(p.part).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '_')).slice(0, 48) === id);
    if (same.length) id = id.slice(0, 44) + '_' + (parts.findIndex(p => p.part === part) + 1);
    return id;
  }
  // ---------- répliques des personnages ----------
  const unitByName = (db, name) => { const n = String(name || '').trim().toLowerCase(); return n ? ((db || {}).units || []).find(u => String(u.name || '').trim().toLowerCase() === n) : null; };
  /** Fichier de textes d'un personnage (créé au besoin). */
  function characterFile(texts, db, unitId, create) {
    let f = texts.files.find(x => x.kind === 'character' && x.ref === unitId);
    if (!f && create) { const u = ((db || {}).units || []).find(x => x.id === unitId); f = create_(texts, { name: (u && u.name) || unitId, kind: 'character', ref: unitId }); }
    return f || null;
  }
  /** Range une réplique dans le fichier du personnage (réutilise un texte identique) ; renvoie la référence « fichier#id ». */
  function storeLine(texts, db, unitId, text, translations) {
    const f = characterFile(texts, db, unitId, true), main = texts.main, v = String(text || '').trim();
    let row = f.rows.find(r => (r.t[main] || '').trim() === v);
    if (!row) row = addRow(f, Object.assign({}, translations || {}, { [main]: v }));
    else for (const [l, x] of Object.entries(translations || {})) if (x && !row.t[l]) row.t[l] = x;
    return f.id + '#' + row.id;
  }
  /** Traductions déjà saisies pour une réplique écrite dans un dialogue de la base (ligne du CSV « Dialogues … »). */
  function lineTranslations(texts, who, text) {
    const main = texts.main, v = String(text || '').trim();
    for (const f of texts.files) if (f.kind === 'base') for (const r of f.rows) {
      if (r.who === who && (r.t[main] || '').trim() === v) { const out = Object.assign({}, r.t); delete out[main]; return out; }
    }
    return {};
  }
  /**
   * Répliques des personnages : chaque réplique écrite d'un dialogue de la base dont l'orateur est une unité part dans le
   * fichier de textes de ce personnage (traductions comprises) et le dialogue y renvoie (@fichier#id).
   */
  function moveToCharacters(texts, db, meta) {
    let n = 0;
    const baseRows = new Map();
    for (const f of texts.files) if (f.kind === 'base') for (const r of f.rows) baseRows.set(f.ref + ':' + r.id, r);
    for (const [list] of DB_TEXT_FILES) for (const e of collect(list, db, meta)) {
      if (!e.parent) continue;
      const u = unitByName(db, e.who), text = e.get();
      if (!u || !String(text || '').trim()) continue;
      const row = baseRows.get(list + ':' + e.id), tr = row ? Object.assign({}, row.t) : {};
      delete tr[texts.main];
      e.replace('@' + storeLine(texts, db, u.id, text, tr));
      n++;
    }
    if (n) syncDb(texts, db, meta);
    return n;
  }

  /** Fichiers de la base groupés par catégorie : [{ list, name, files }]. */
  function baseGroups(texts) {
    const out = [], byName = new Map();
    for (const [list, name] of DB_TEXT_FILES) for (const f of texts.files) {
      if (f.kind !== 'base' || f.ref !== list) continue;
      const key = f.group || name;
      if (!byName.has(key)) { const g = { list, name: key, files: [] }; byName.set(key, g); out.push(g); }
      byName.get(key).files.push(f);
    }
    return out;
  }
  function setDbText(texts, db, meta, fileId, rowId, value) {
    const f = texts.files.find(x => x.id === fileId);
    if (!f || f.kind !== 'base') return false;
    const e = collect(f.ref, db, meta).find(x => x.id === rowId);
    if (!e || !value) return false;
    e.set(value);
    return true;
  }
  function localizeDb(texts, db, meta, lang) {
    if (!texts || !lang || lang === texts.main) return 0;
    let n = 0;
    const before = ((db || {}).units || []).map(u => [u, u.name]);
    for (const f of texts.files) {
      if (f.kind !== 'base') continue;
      const rows = new Map(f.rows.map(r => [r.id, r]));
      for (const e of collect(f.ref, db, meta)) { if (e.field !== f.field) continue; const r = rows.get(e.id), v = r && r.t[lang]; if (v) { e.set(v); n++; } }
    }
    // orateurs : le nom traduit de l'unité (la boîte de dialogue retrouve ainsi son portrait)
    for (const [u, name] of before) if (u.name !== name) renameSpeaker(db, meta, name, u.name);
    return n;
  }
  function applyMain(texts, db, meta) {
    for (const f of texts.files) {
      if (f.kind !== 'base') continue;
      const rows = new Map(f.rows.map(r => [r.id, r]));
      for (const e of collect(f.ref, db, meta)) { if (e.field !== f.field) continue; const r = rows.get(e.id), v = r && r.t[texts.main]; if (v) e.set(v); }
    }
    return syncDb(texts, db, meta);
  }

  return { characterNameRef, resolveNames, characterFile, storeLine, lineTranslations, moveToCharacters, unitByName, DB_TEXT_FILES, DB_TEXT_FIELDS, baseFileId, baseGroups, fieldOf, parseLine, joinLine, renameSpeaker, collect, syncDb, setDbText, localizeDb, applyMain, KINDS, LANG_NAMES, FILE_ID, empty, normalize, slug, create, nextRowId, addRow, fillFromDb, speakerOf, find, lookup, resolve, stats, parseCsv, rowsFromCsv, toCsv, importCsv, validate };
});
