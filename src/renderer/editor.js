/* Éditeur principal : projet, maps, calques, terrain, placements de chapitre. */
(function () {
  'use strict';
  const { h } = UI;
  const $ = (s) => document.querySelector(s);

  const S = {
    dir: null, baseUrl: '', project: null, dirty: false,
    mapId: null, chapterId: null,
    mode: 'tiles', tool: 'pencil', layerIndex: 0, zoom: 1, grid: true, dimOthers: false,
    brush: null, paletteTs: null, terrainBrush: 'plain',
    placeTool: null, selected: null, picking: null,
    undo: [], redo: [], stroke: null, hover: null, drag: null
  };
  window.EditorState = S; // utile pour le débogage

  const DB = () => S.project.db;
  const curMap = () => (S.project ? S.project.maps.find(m => m.id === S.mapId) || null : null);
  const chaptersOf = (map) => DB().chapters.filter(c => c.mapId === (map && map.id));
  const curChapter = () => { const c = DB().chapters.find(c => c.id === S.chapterId); return c && c.mapId === S.mapId ? c : null; };
  const byId = Rules.byId;
  function uid(prefix, list) { let i = list.length + 1; while (list.some(e => e.id === prefix + i)) i++; return prefix + i; }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function safe(fn) {
    try { return await fn(); } catch (e) { console.error(e); UI.alert('Erreur', e.message || String(e)); return null; }
  }

  // =====================================================================
  // Projet
  // =====================================================================
  function markDirty() {
    if (!S.dirty) { S.dirty = true; tf.setDirty(true); }
    updateTitle();
  }
  function updateTitle() {
    if (!S.project) { document.title = 'Tactics Forge'; return; }
    document.title = (S.dirty ? '● ' : '') + S.project.meta.name + ' — Tactics Forge';
    $('#st-project').textContent = S.project.meta.name + (S.dirty ? ' (modifié)' : '');
  }

  function migrate(p) {
    p.meta.settings = Object.assign({}, Rules.DEFAULT_SETTINGS, p.meta.settings || {});
    for (const k of ['terrains', 'weapons', 'items', 'classes', 'units', 'tilesets', 'chapters', 'supports', 'skills']) if (!Array.isArray(p.db[k])) p.db[k] = [];
    const uname = (id) => { const u = p.db.units.find(x => x.id === id); return u ? u.name : '?'; };
    for (const sp of p.db.supports) if (!sp.name) sp.name = `${uname(sp.a)} ♥ ${uname(sp.b)}`;
    p.meta.supports = Object.assign({}, Rules.DEFAULT_SUPPORT, p.meta.supports || {});
    for (const m of p.maps) {
      const n = m.width * m.height;
      if (!Array.isArray(m.terrain) || m.terrain.length !== n) m.terrain = new Array(n).fill('');
      if (!Array.isArray(m.objects)) m.objects = [];
      if (!Array.isArray(m.tilesets)) m.tilesets = [];
      if (!m.layers || !m.layers.length) m.layers = [{ id: 'l1', name: 'Sol', visible: true, data: new Array(n).fill(0) }];
      m.layers.forEach((l, i) => { if (!l.id) l.id = 'l' + (i + 1); if (l.visible === undefined) l.visible = true; });
    }
    for (const c of p.db.chapters) {
      c.players = c.players || []; c.enemies = c.enemies || []; c.events = c.events || []; c.allies = c.allies || [];
      c.objective = c.objective || { type: 'rout' };
    }
    for (const ts of p.db.tilesets) ts.tileTerrain = ts.tileTerrain || {};
    for (const c of p.db.classes) { if (c.mapSprite === undefined) c.mapSprite = ''; if (c.battler === undefined) c.battler = ''; }
    for (const u of p.db.units) { if (u.mapSprite === undefined) u.mapSprite = ''; if (u.battler === undefined) u.battler = ''; }
    p.resources = p.resources || { characters: {}, battlers: {}, faces: [], tilesets: [], system: [] };
  }

  async function applyProject(payload) {
    if (!payload) return;
    S.dir = payload.dir; S.baseUrl = payload.baseUrl; S.project = payload.project;
    migrate(S.project);
    S.mapId = S.project.maps[0] ? S.project.maps[0].id : null;
    const first = S.project.maps[0] ? chaptersOf(S.project.maps[0])[0] : null;
    S.chapterId = first ? first.id : null;
    S.undo = []; S.redo = []; S.selected = null; S.placeTool = null; S.layerIndex = 0;
    S.paletteTs = DB().tilesets[0] ? DB().tilesets[0].id : null;
    S.brush = S.paletteTs ? { tilesetId: S.paletteTs, x: 0, y: 0, w: 1, h: 1 } : null;
    S.terrainBrush = DB().terrains[0] ? DB().terrains[0].id : '';
    S.dirty = false; tf.setDirty(false);
    await Render.preloadTilesets(S.baseUrl, DB().tilesets);
    await preloadSprites();
    $('#welcome').classList.add('hidden');
    $('#app').classList.remove('no-project');
    fitZoom();
    renderAll();
    updateTitle();
    const mig = S.project.migration;
    if (mig) {
      delete S.project.migration;
      UI.alert('Ressources réorganisées', [
        `Ce projet utilisait l'ancienne organisation (img/, audio/). ${mig.moved} fichier(s) ont été rangés dans ressources/ :`,
        'ressources/personnages/<Nom>/ regroupe les sprites de map, l\'animation de combat et le portrait de chaque personnage ; tilesets, musiques, jingles et sons ont chacun leur dossier.',
        `Les références de la base de données ont été mises à jour. Copie des données d'avant : ${mig.backup}/`
      ]);
    }
  }

  async function preloadSprites() {
    const r = S.project.resources || {};
    const list = Object.values(r.characters || {}).map(m => m.image);
    await Promise.all(list.map(i => Render.loadImage(S.baseUrl, i)));
  }
  async function rescanResources() {
    const r = await safe(() => tf.scanResources(S.dir));
    if (r) { S.project.resources = r; await preloadSprites(); }
    return r;
  }

  async function confirmDiscard() {
    if (!S.dirty) return true;
    const c = await UI.choose('Modifications non enregistrées', [
      { value: 'save', label: 'Enregistrer puis continuer', primary: true },
      { value: 'discard', label: 'Continuer sans enregistrer' }
    ]);
    if (c === 'save') { await cmdSave(); return !S.dirty; }
    return c === 'discard';
  }

  async function cmdNew() {
    if (!(await confirmDiscard())) return;
    const name = await UI.prompt('Nouveau projet', 'Mon Tactical RPG', 'Nom du jeu');
    if (!name) return;
    const template = await UI.choose('Contenu de départ', [
      { value: 'sample', label: "Projet d'exemple", desc: 'Base de données complète + un chapitre jouable (5 unités, boss, renforts, dialogues).', primary: true },
      { value: 'empty', label: 'Projet vide', desc: 'Base de données par défaut (classes, armes, terrains), une map vierge.' }
    ]);
    if (!template) return;
    await safe(async () => applyProject(await tf.newProject({ name, template })));
  }

  async function cmdOpen(dir) {
    if (!(await confirmDiscard())) return;
    await safe(async () => applyProject(await tf.openProject(dir)));
  }

  async function cmdSave() {
    if (!S.project) return;
    await safe(async () => {
      await tf.saveProject(S.dir, S.project);
      S.dirty = false; await tf.setDirty(false); updateTitle();
      UI.toast('Projet enregistré', 'ok');
    });
  }

  async function renderRecent() {
    const list = await safe(() => tf.recent()) || [];
    const box = $('#recent-list');
    box.innerHTML = '';
    if (!list.length) { box.append(h('p', { class: 'muted' }, 'Aucun projet récent.')); return; }
    for (const r of list) box.append(h('div', { class: 'recent-item', onclick: () => cmdOpen(r.dir) }, h('b', {}, r.name), h('small', {}, r.dir)));
  }

  // =====================================================================
  // Tilesets / gids
  // =====================================================================
  function tsOf(id) { return byId(DB().tilesets, id); }
  function ensureTilesetRef(map, tsId) {
    const ref = map.tilesets.find(r => r.tilesetId === tsId);
    if (ref) return ref.firstgid;
    let next = 1;
    for (const r of map.tilesets) {
      const ts = tsOf(r.tilesetId);
      next = Math.max(next, r.firstgid + ((ts && ts.tileCount) || 1));
    }
    map.tilesets.push({ tilesetId: tsId, firstgid: next });
    return next;
  }
  function brushGid(map, i, j) {
    const b = S.brush; if (!b) return 0;
    const ts = tsOf(b.tilesetId); if (!ts) return 0;
    const first = ensureTilesetRef(map, ts.id);
    const bx = b.x + (((i % b.w) + b.w) % b.w), by = b.y + (((j % b.h) + b.h) % b.h);
    return first + by * ts.columns + bx;
  }

  // =====================================================================
  // Annuler / rétablir
  // =====================================================================
  function beginStroke() { S.stroke = { mapId: S.mapId, changes: new Map() }; }
  function setCell(map, target, idx, value) {
    const arr = target === 'terrain' ? map.terrain : map.layers[target].data;
    if (arr[idx] === value) return false;
    if (S.stroke) {
      const k = target + ':' + idx;
      if (!S.stroke.changes.has(k)) S.stroke.changes.set(k, { target, idx, before: arr[idx], after: value });
      else S.stroke.changes.get(k).after = value;
    }
    arr[idx] = value;
    return true;
  }
  function endStroke() {
    const st = S.stroke; S.stroke = null;
    if (!st || !st.changes.size) return;
    S.undo.push({ kind: 'cells', mapId: st.mapId, changes: [...st.changes.values()] });
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
    markDirty();
  }
  function snapshot(kind, ref) {
    // kind : 'map' (une map), 'chapter' (un chapitre), 'project' (maps + chapitres)
    let before;
    if (kind === 'map') before = clone(S.project.maps.find(m => m.id === ref));
    else if (kind === 'chapter') before = clone(DB().chapters.find(c => c.id === ref));
    else before = clone({ maps: S.project.maps, chapters: DB().chapters });
    S.undo.push({ kind, ref, before, sel: { mapId: S.mapId, chapterId: S.chapterId } });
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
    markDirty();
  }
  function restore(op) {
    let current;
    if (op.kind === 'map') {
      const i = S.project.maps.findIndex(m => m.id === op.ref);
      current = clone(S.project.maps[i]);
      S.project.maps[i] = op.before;
    } else if (op.kind === 'chapter') {
      const i = DB().chapters.findIndex(c => c.id === op.ref);
      current = i >= 0 ? clone(DB().chapters[i]) : null;
      if (i >= 0) DB().chapters[i] = op.before;
    } else {
      current = clone({ maps: S.project.maps, chapters: DB().chapters });
      S.project.maps = op.before.maps; DB().chapters = op.before.chapters;
    }
    return Object.assign({}, op, { before: current });
  }
  function applyHistory(from, to, undoing) {
    if (!S.project) return;
    const op = from.pop(); if (!op) return;
    if (op.kind === 'cells') {
      const map = S.project.maps.find(m => m.id === op.mapId);
      if (map) for (const c of op.changes) {
        const arr = c.target === 'terrain' ? map.terrain : (map.layers[c.target] && map.layers[c.target].data);
        if (arr) arr[c.idx] = undoing ? c.before : c.after;
      }
      to.push(op);
      if (map && S.mapId !== map.id) S.mapId = map.id;
    } else {
      to.push(restore(op));
      if (!S.project.maps.find(m => m.id === S.mapId)) S.mapId = S.project.maps[0] ? S.project.maps[0].id : null;
    }
    S.layerIndex = Math.min(S.layerIndex, Math.max(0, (curMap() ? curMap().layers.length : 1) - 1));
    if (S.selected && !findPlacement(S.selected)) S.selected = null;
    markDirty();
    renderAll();
  }
  const undo = () => applyHistory(S.undo, S.redo, true);
  const redo = () => applyHistory(S.redo, S.undo, false);

  // =====================================================================
  // Canvas de la map
  // =====================================================================
  const canvas = $('#map-canvas');
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');

  function cellSize() { const m = curMap(); return { w: m.tileWidth * S.zoom, h: m.tileHeight * S.zoom }; }

  function fitZoom() {
    const m = curMap(); if (!m) return;
    const wrap = $('#center');
    const fit = Math.min((wrap.clientWidth - 80) / (m.width * m.tileWidth), (wrap.clientHeight - 80) / (m.height * m.tileHeight));
    const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
    S.zoom = steps.filter(s => s <= Math.max(0.25, fit)).pop() || 0.25;
    if (S.zoom > 2) S.zoom = 2;
  }

  function rebuildBase() {
    const m = curMap(); if (!m) return;
    const cs = cellSize();
    canvas.width = base.width = Math.round(m.width * cs.w);
    canvas.height = base.height = Math.round(m.height * cs.h);
    ctx.imageSmoothingEnabled = bctx.imageSmoothingEnabled = false;
    paintBase();
    $('#zoom-label').textContent = Math.round(S.zoom * 100) + ' %';
  }

  function paintBase(area) {
    const m = curMap(); if (!m) return;
    const cs = cellSize();
    if (area) bctx.clearRect(area.x0 * cs.w, area.y0 * cs.h, (area.x1 - area.x0 + 1) * cs.w, (area.y1 - area.y0 + 1) * cs.h);
    else bctx.clearRect(0, 0, base.width, base.height);
    // fond en damier pour les cases vides
    const a = area || { x0: 0, y0: 0, x1: m.width - 1, y1: m.height - 1 };
    for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) {
      bctx.fillStyle = (x + y) % 2 ? '#1a1d23' : '#1e2128';
      bctx.fillRect(x * cs.w, y * cs.h, cs.w, cs.h);
    }
    bctx.save();
    bctx.beginPath(); bctx.rect(a.x0 * cs.w, a.y0 * cs.h, (a.x1 - a.x0 + 1) * cs.w, (a.y1 - a.y0 + 1) * cs.h); bctx.clip();
    Render.drawMap(bctx, m, { scale: S.zoom, baseUrl: S.baseUrl, tilesets: DB().tilesets, dimOthers: S.mode === 'tiles' && S.dimOthers ? S.layerIndex : null, area: expand(a, m) });
    bctx.restore();
  }
  // les tiles plus hauts que la grille débordent vers le haut : on redessine un peu autour
  function expand(a, m) { return { x0: Math.max(0, a.x0 - 1), y0: Math.max(0, a.y0 - 1), x1: Math.min(m.width - 1, a.x1 + 1), y1: Math.min(m.height - 1, a.y1 + 2) }; }

  function terrainGrid() {
    const m = curMap();
    return Rules.buildTerrainGrid(m, DB().tilesets, S.project.meta.defaultTerrain || 'plain');
  }

  function draw() {
    const m = curMap();
    $('#center-empty').classList.toggle('hidden', !!m);
    $('#canvas-wrap').classList.toggle('hidden', !m);
    if (!m) return;
    const cs = cellSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);

    if (S.mode === 'terrain') drawTerrainOverlay(m, cs);
    if (S.mode === 'units') drawUnitsOverlay(m, cs);

    if (S.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < m.width; x++) { ctx.moveTo(Math.round(x * cs.w) + .5, 0); ctx.lineTo(Math.round(x * cs.w) + .5, canvas.height); }
      for (let y = 1; y < m.height; y++) { ctx.moveTo(0, Math.round(y * cs.h) + .5); ctx.lineTo(canvas.width, Math.round(y * cs.h) + .5); }
      ctx.stroke();
    }
    drawHover(m, cs);
  }

  function drawTerrainOverlay(m, cs) {
    const grid = terrainGrid();
    const tmap = {}; DB().terrains.forEach(t => { tmap[t.id] = t; });
    ctx.font = `600 ${Math.max(8, Math.round(cs.h * 0.27))}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const i = y * m.width + x;
      const t = tmap[grid[i]];
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = t ? t.color : '#ff00ff';
      ctx.fillRect(x * cs.w, y * cs.h, cs.w, cs.h);
      ctx.globalAlpha = 1;
      if (m.terrain[i]) { // surcharge peinte
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
        ctx.strokeRect(x * cs.w + 2, y * cs.h + 2, cs.w - 4, cs.h - 4);
      }
      if (cs.w >= 22) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillText(t ? t.name.slice(0, 4) : '?', x * cs.w + cs.w / 2 + 1, y * cs.h + cs.h / 2 + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(t ? t.name.slice(0, 4) : '?', x * cs.w + cs.w / 2, y * cs.h + cs.h / 2);
      }
    }
  }

  function tokenColor(pl, kind) {
    if (kind === 'players') return '#3f7cf0';
    if (kind === 'allies') return '#22a35a';
    return pl.isBoss ? '#8b1e3f' : '#d9473d';
  }
  function tokenLabel(pl, kind) {
    if (kind === 'players' || kind === 'allies') { const u = byId(DB().units, pl.unitId); return u ? u.name : '?'; }
    return pl.name || ((byId(DB().classes, pl.classId) || {}).name) || '?';
  }

  /** Chemin du sprite de map d'un placement : surcharge de l'unité/placement, sinon celui de la classe. */
  function spritePathOf(pl, kind) {
    if (kind === 'players' || kind === 'allies') {
      const u = byId(DB().units, pl.unitId); if (!u) return '';
      const c = byId(DB().classes, u.classId);
      return u.mapSprite || (c && c.mapSprite) || '';
    }
    const c = byId(DB().classes, pl.classId);
    return pl.mapSprite || (c && c.mapSprite) || '';
  }
  function charMeta(path) { return path && S.project.resources && S.project.resources.characters[path]; }

  /** Palette d'un placement sur la map de l'éditeur (placement › unité › classe › réglage du projet). */
  const TEAM_OF = { players: 'player', allies: 'ally', enemies: 'enemy' };
  function paletteOf(pl, kind) {
    const settings = (S.project.meta.settings || {}).colors;
    let unitColors = '', clsColors = '';
    if (kind === 'players' || kind === 'allies') {
      const u = byId(DB().units, pl.unitId); const c = u && byId(DB().classes, u.classId);
      unitColors = u && u.colors; clsColors = c && c.colors;
    } else { const c = byId(DB().classes, pl.classId); clsColors = c && c.colors; }
    return Palettes.paletteFor(TEAM_OF[kind] || 'player', Palettes.resolveMode(pl.colors, unitColors, clsColors, settings), 'map', false);
  }
  /** Palette d'une icône de liste pour un camp, selon le réglage d'une unité / classe. */
  function iconPalette(team, ...modes) { return Palettes.paletteFor(team, Palettes.resolveMode(...modes, (S.project.meta.settings || {}).colors), 'map', false); }

  function drawPlacement(pl, kind, x, y, cs, opts) {
    const meta = charMeta(spritePathOf(pl, kind));
    const img = meta && Render.readyImage(S.baseUrl, meta.image);
    if (!img) {
      if (meta) Render.loadImage(S.baseUrl, meta.image).then(() => draw());
      return drawToken(x, y, cs, tokenColor(pl, kind), tokenLabel(pl, kind), opts);
    }
    const k = cs.w / (meta.base || 16);
    // repère d'équipe sous le sprite
    ctx.globalAlpha = opts.ghost ? 0.5 : 1;
    ctx.fillStyle = kind === 'players' ? 'rgba(63,124,240,.35)' : kind === 'allies' ? 'rgba(47,211,122,.45)' : 'rgba(217,71,61,.35)';
    ctx.fillRect(x * cs.w + 1, y * cs.h + 1, cs.w - 2, cs.h - 2);
    Sprites.drawMapSprite(ctx, meta, img, x * cs.w + cs.w / 2, (y + 1) * cs.h, k, { anim: 'idle', frame: 0, palette: paletteOf(pl, kind), alpha: opts.ghost ? 0.55 : 1 });
    ctx.globalAlpha = 1;
    if (kind === 'allies') { ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 2; ctx.strokeRect(x * cs.w + 1.5, y * cs.h + 1.5, cs.w - 3, cs.h - 3); }
    if (opts.boss) { ctx.strokeStyle = '#f2c46a'; ctx.lineWidth = 2; ctx.strokeRect(x * cs.w + 1.5, y * cs.h + 1.5, cs.w - 3, cs.h - 3); }
    if (opts.badge) {
      ctx.fillStyle = '#e3a83b'; const r = Math.max(6, cs.w * 0.2);
      ctx.beginPath(); ctx.arc((x + 1) * cs.w - r * 0.8, y * cs.h + r * 0.8, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1407'; ctx.font = `700 ${Math.max(7, Math.round(r * 1.1))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(opts.badge, (x + 1) * cs.w - r * 0.8, y * cs.h + r * 0.8 + 0.5);
    }
  }

  function drawToken(x, y, cs, color, label, opts) {
    const pad = Math.max(2, cs.w * 0.12);
    const px = x * cs.w + pad, py = y * cs.h + pad, w = cs.w - pad * 2, hh = cs.h - pad * 2;
    ctx.globalAlpha = opts.ghost ? 0.5 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(x * cs.w + cs.w / 2, y * cs.h + cs.h - pad * 0.8, w * 0.42, hh * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, px, py, w, hh * 0.92, Math.max(3, w * 0.22)); ctx.fill();
    ctx.lineWidth = opts.boss ? 2.5 : 1.5;
    ctx.strokeStyle = opts.boss ? '#f2c46a' : 'rgba(255,255,255,.85)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(8, Math.round(hh * 0.5))}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 1).toUpperCase(), px + w / 2, py + hh * 0.48);
    if (opts.badge) {
      ctx.fillStyle = '#e3a83b';
      const r = Math.max(6, cs.w * 0.2);
      ctx.beginPath(); ctx.arc(px + w, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1407'; ctx.font = `700 ${Math.max(7, Math.round(r * 1.1))}px sans-serif`;
      ctx.fillText(opts.badge, px + w, py + 0.5);
    }
    ctx.globalAlpha = 1;
  }
  function roundRect(c, x, y, w, hh, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r);
    c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function drawUnitsOverlay(m, cs) {
    const ch = curChapter();
    // objets Tiled non convertis
    ctx.globalAlpha = 0.55;
    for (const o of m.objects || []) {
      ctx.strokeStyle = '#c792ea'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.strokeRect(o.x * cs.w + 3, o.y * cs.h + 3, cs.w - 6, cs.h - 6);
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (!ch) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // case à prendre
    if (ch.objective && ch.objective.type === 'seize') {
      const { x, y } = ch.objective;
      ctx.fillStyle = 'rgba(227,168,59,.25)'; ctx.fillRect(x * cs.w, y * cs.h, cs.w, cs.h);
      ctx.strokeStyle = '#f2c46a'; ctx.lineWidth = 2; ctx.strokeRect(x * cs.w + 1, y * cs.h + 1, cs.w - 2, cs.h - 2);
    }
    for (const kind of ['enemies', 'allies', 'players']) {
      for (const pl of ch[kind]) {
        const sel = S.selected && S.selected.kind === kind && S.selected.id === pl.id;
        if (S.drag && S.drag.type === 'placement' && S.drag.id === pl.id && S.hover) continue;
        drawPlacement(pl, kind, pl.x, pl.y, cs, { boss: pl.isBoss, ghost: kind === 'enemies' && pl.appearTurn > 0, badge: kind === 'enemies' && pl.appearTurn > 0 ? String(pl.appearTurn) : null });
        if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(pl.x * cs.w + 1, pl.y * cs.h + 1, cs.w - 2, cs.h - 2); ctx.setLineDash([]); }
      }
    }
    if (S.drag && S.drag.type === 'placement' && S.hover) {
      const pl = findPlacement({ kind: S.drag.kind, id: S.drag.id });
      if (pl) drawPlacement(pl, S.drag.kind, S.hover.x, S.hover.y, cs, { boss: pl.isBoss });
    }
  }

  function drawHover(m, cs) {
    const hv = S.hover; if (!hv) return;
    if (S.mode === 'tiles' && S.drag && S.drag.type === 'rect') return drawRectPreview(cs);
    if (S.mode === 'terrain' && S.drag && S.drag.type === 'rect') return drawRectPreview(cs);
    if (S.mode === 'tiles' && S.brush && (S.tool === 'pencil' || S.tool === 'rect' || S.tool === 'fill')) {
      const ts = tsOf(S.brush.tilesetId); const img = ts && Render.readyImage(S.baseUrl, ts.image);
      const bw = S.tool === 'pencil' ? S.brush.w : 1, bh = S.tool === 'pencil' ? S.brush.h : 1;
      if (img) {
        ctx.globalAlpha = 0.6;
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
          const x = hv.x + i, y = hv.y + j; if (x >= m.width || y >= m.height) continue;
          Render.drawTile(ctx, img, ts, (S.brush.y + j) * ts.columns + S.brush.x + i, x * cs.w, y * cs.h, cs.w, cs.h, 0);
        }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = '#f2c46a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(hv.x * cs.w + .5, hv.y * cs.h + .5, bw * cs.w - 1, bh * cs.h - 1);
      return;
    }
    ctx.strokeStyle = S.mode === 'units' && S.placeTool ? ({ players: '#4f8cff', allies: '#2fd37a' }[S.placeTool.kind] || '#ec5a4f') : '#f2c46a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hv.x * cs.w + .5, hv.y * cs.h + .5, cs.w - 1, cs.h - 1);
  }
  function drawRectPreview(cs) {
    const r = rectOf(S.drag.start, S.hover);
    ctx.fillStyle = S.tool === 'eraser' ? 'rgba(236,90,79,.25)' : 'rgba(227,168,59,.22)';
    ctx.fillRect(r.x0 * cs.w, r.y0 * cs.h, (r.x1 - r.x0 + 1) * cs.w, (r.y1 - r.y0 + 1) * cs.h);
    ctx.strokeStyle = '#f2c46a'; ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x0 * cs.w + .5, r.y0 * cs.h + .5, (r.x1 - r.x0 + 1) * cs.w - 1, (r.y1 - r.y0 + 1) * cs.h - 1);
  }
  const rectOf = (a, b) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });

  // ---------- édition ----------
  function cellFromEvent(e) {
    const m = curMap(); const r = canvas.getBoundingClientRect(); const cs = cellSize();
    const x = Math.floor((e.clientX - r.left) / cs.w), y = Math.floor((e.clientY - r.top) / cs.h);
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
    return { x, y };
  }

  function stampAt(c, erase) {
    const m = curMap();
    let area = null;
    const touch = (x, y) => { area = area ? { x0: Math.min(area.x0, x), y0: Math.min(area.y0, y), x1: Math.max(area.x1, x), y1: Math.max(area.y1, y) } : { x0: x, y0: y, x1: x, y1: y }; };
    if (S.mode === 'terrain') {
      if (setCell(m, 'terrain', c.y * m.width + c.x, erase ? '' : S.terrainBrush)) touch(c.x, c.y);
    } else {
      const bw = erase ? 1 : S.brush ? S.brush.w : 1, bh = erase ? 1 : S.brush ? S.brush.h : 1;
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        const x = c.x + i, y = c.y + j; if (x >= m.width || y >= m.height) continue;
        const v = erase ? 0 : brushGid(m, i, j);
        if (setCell(m, S.layerIndex, y * m.width + x, v)) touch(x, y);
      }
    }
    if (area) { paintBase(area); draw(); }
  }

  function fillRect(r, erase) {
    const m = curMap();
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * m.width + x;
      if (S.mode === 'terrain') setCell(m, 'terrain', i, erase ? '' : S.terrainBrush);
      else setCell(m, S.layerIndex, i, erase ? 0 : brushGid(m, x - r.x0, y - r.y0));
    }
    paintBase(r); draw();
  }

  function floodFill(c, erase) {
    const m = curMap();
    const isTerrain = S.mode === 'terrain';
    const grid = isTerrain ? terrainGrid() : null;
    const arr = isTerrain ? null : m.layers[S.layerIndex].data;
    const valueAt = (i) => isTerrain ? grid[i] : arr[i];
    const target = valueAt(c.y * m.width + c.x);
    const repl = isTerrain ? (erase ? '' : S.terrainBrush) : (erase ? 0 : brushGid(m, 0, 0));
    if (!isTerrain && target === repl) return;
    if (isTerrain && !erase && target === repl) return;
    const seen = new Uint8Array(m.width * m.height);
    const stack = [[c.x, c.y]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
      const i = y * m.width + x;
      if (seen[i] || valueAt(i) !== target) continue;
      seen[i] = 1;
      if (isTerrain) setCell(m, 'terrain', i, repl); else setCell(m, S.layerIndex, i, repl);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    paintBase(); draw();
  }

  function pickAt(c) {
    const m = curMap();
    if (S.mode === 'terrain') { S.terrainBrush = terrainGrid()[c.y * m.width + c.x]; renderPalette(); return; }
    // calque courant, sinon le plus haut non vide
    let gid = m.layers[S.layerIndex].data[c.y * m.width + c.x];
    if (!gid) for (let l = m.layers.length - 1; l >= 0 && !gid; l--) gid = m.layers[l].data[c.y * m.width + c.x];
    const r = Rules.resolveGid(m, DB().tilesets, gid);
    if (!r) return;
    S.paletteTs = r.tileset.id;
    S.brush = { tilesetId: r.tileset.id, x: r.local % r.tileset.columns, y: Math.floor(r.local / r.tileset.columns), w: 1, h: 1 };
    if (S.tool === 'picker' || S.tool === 'eraser') setTool('pencil');
    renderPalette(); draw();
  }

  // ---------- placements ----------
  function findPlacement(sel) {
    const ch = curChapter(); if (!ch || !sel) return null;
    return (ch[sel.kind] || []).find(p => p.id === sel.id) || null;
  }
  function placementAt(ch, x, y) {
    for (const kind of ['players', 'allies', 'enemies']) {
      const list = ch[kind].filter(p => p.x === x && p.y === y);
      if (list.length) return { kind, pl: list[list.length - 1] };
    }
    return null;
  }

  function unitsMouseDown(e, c) {
    const ch = curChapter(); if (!ch) return;
    if (S.picking === 'seize') {
      snapshot('chapter', ch.id);
      ch.objective.x = c.x; ch.objective.y = c.y; S.picking = null;
      renderInspector(); draw(); return;
    }
    const hit = placementAt(ch, c.x, c.y);
    if (e.button === 2) {
      if (hit) {
        snapshot('chapter', ch.id);
        ch[hit.kind] = ch[hit.kind].filter(p => p !== hit.pl);
        if (S.selected && S.selected.id === hit.pl.id) S.selected = null;
        renderInspector(); renderPalette(); draw();
      }
      return;
    }
    if (hit) {
      S.selected = { kind: hit.kind, id: hit.pl.id };
      S.drag = { type: 'placement', kind: hit.kind, id: hit.pl.id, start: c, moved: false };
      renderInspector(); draw(); return;
    }
    if (S.placeTool) {
      snapshot('chapter', ch.id);
      if (S.placeTool.kind === 'players' || S.placeTool.kind === 'allies') {
        // une unité est soit dans l'équipe, soit alliée : on la retire de l'autre liste
        const kind = S.placeTool.kind, other = kind === 'players' ? 'allies' : 'players';
        ch[other] = ch[other].filter(p => p.unitId !== S.placeTool.unitId);
        const existing = ch[kind].find(p => p.unitId === S.placeTool.unitId);
        if (existing) { existing.x = c.x; existing.y = c.y; S.selected = { kind, id: existing.id }; }
        else {
          const pl = kind === 'players' ? { id: uid('p', ch.players), unitId: S.placeTool.unitId, x: c.x, y: c.y }
            : { id: uid('a', ch.allies), unitId: S.placeTool.unitId, x: c.x, y: c.y, control: 'player', ai: 'aggressive' };
          ch[kind].push(pl); S.selected = { kind, id: pl.id };
        }
      } else {
        const cls = byId(DB().classes, S.placeTool.classId);
        const pl = { id: uid('e', ch.enemies), name: cls ? cls.name : 'Ennemi', classId: S.placeTool.classId, level: S.placeTool.level || 1, x: c.x, y: c.y, ai: 'aggressive', appearTurn: 0, isBoss: false, inventory: [] };
        ch.enemies.push(pl); S.selected = { kind: 'enemies', id: pl.id };
      }
      renderInspector(); renderPalette(); draw();
    } else {
      S.selected = null; renderInspector(); draw();
    }
  }

  // ---------- événements souris ----------
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    const m = curMap(); if (!m) return;
    if (e.button === 1) return startPan(e);
    const c = cellFromEvent(e); if (!c) return;
    if (S.mode === 'units') return unitsMouseDown(e, c);
    if (e.button === 2) { // clic droit : pipette (tiles) / effacer la surcharge (terrain)
      if (S.mode === 'terrain') { beginStroke(); S.drag = { type: 'paint', erase: true }; stampAt(c, true); }
      else pickAt(c);
      return;
    }
    const erase = S.tool === 'eraser';
    switch (S.tool) {
      case 'picker': pickAt(c); break;
      case 'fill': beginStroke(); floodFill(c, false); endStroke(); break;
      case 'rect': S.drag = { type: 'rect', start: c }; S.hover = c; draw(); break;
      default:
        if (S.mode === 'tiles' && !erase && !S.brush) { UI.toast('Choisis un tile dans la palette'); return; }
        beginStroke(); S.drag = { type: 'paint', erase, last: c }; stampAt(c, erase);
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!curMap()) return;
    const c = cellFromEvent(e);
    const changed = !c || !S.hover || c.x !== S.hover.x || c.y !== S.hover.y;
    S.hover = c;
    if (!changed) return;
    if (S.drag && S.drag.type === 'paint' && c) stampAt(c, S.drag.erase);
    if (S.drag && S.drag.type === 'placement' && c) S.drag.moved = true;
    updateStatus();
    draw();
  });
  canvas.addEventListener('mouseleave', () => { S.hover = null; updateStatus(); draw(); });
  window.addEventListener('mouseup', () => {
    if (!S.drag) return;
    const d = S.drag; S.drag = null;
    if (d.type === 'paint') endStroke();
    else if (d.type === 'rect' && S.hover) { beginStroke(); fillRect(rectOf(d.start, S.hover), S.tool === 'eraser'); endStroke(); }
    else if (d.type === 'placement' && d.moved && S.hover) {
      const ch = curChapter(); const pl = findPlacement({ kind: d.kind, id: d.id });
      const occ = placementAt(ch, S.hover.x, S.hover.y);
      if (pl && (!occ || occ.pl === pl)) {
        snapshot('chapter', ch.id);
        pl.x = S.hover.x; pl.y = S.hover.y;
        renderInspector();
      } else if (occ) UI.toast('Case déjà occupée');
    }
    draw();
  });
  // Ctrl + molette = zoom ; molette centrale = déplacement
  $('#canvas-wrap').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  function startPan(e) {
    e.preventDefault();
    const wrap = $('#canvas-wrap');
    const sx = e.clientX, sy = e.clientY, l = wrap.scrollLeft, t = wrap.scrollTop;
    const mv = (ev) => { wrap.scrollLeft = l - (ev.clientX - sx); wrap.scrollTop = t - (ev.clientY - sy); };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }
  function zoomBy(dir) {
    const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
    let i = steps.findIndex(s => s >= S.zoom - 1e-6);
    if (i < 0) i = steps.length - 1;
    i = Math.max(0, Math.min(steps.length - 1, i + dir));
    S.zoom = steps[i];
    rebuildBase(); draw();
  }

  function updateStatus() {
    const m = curMap(), c = S.hover;
    $('#st-cell').textContent = m ? (c ? `x ${c.x} · y ${c.y}` : `${m.width} × ${m.height}`) : '';
    if (m && c) {
      const t = byId(DB().terrains, terrainGrid()[c.y * m.width + c.x]);
      $('#st-terrain').textContent = t ? `${t.name} — Déf ${t.def} · Esq ${t.avoid}${t.heal ? ' · Soin ' + t.heal + ' %' : ''}` : '';
    } else $('#st-terrain').textContent = '';
    const hints = {
      tiles: 'Clic : peindre · Clic droit : pipette · Ctrl+molette : zoom · Molette centrale : défiler',
      terrain: 'Peins les terrains (surcharge) · Clic droit : revenir au terrain du tile',
      units: S.picking === 'seize' ? 'Clique la case à prendre' : 'Clic : placer / sélectionner · Glisser : déplacer · Clic droit : retirer'
    };
    $('#st-hint').textContent = hints[S.mode] || '';
  }

  // =====================================================================
  // Palette (gauche)
  // =====================================================================
  const palCanvas = document.createElement('canvas');
  const pctx = palCanvas.getContext('2d');
  let palDrag = null;

  function renderPalette() {
    const box = $('#palette'); box.innerHTML = '';
    if (!S.project) return;
    if (S.mode === 'tiles') return renderTilePalette(box);
    if (S.mode === 'terrain') return renderTerrainPalette(box);
    return renderUnitPalette(box);
  }

  function renderTilePalette(box) {
    const tss = DB().tilesets;
    const sel = h('select', {}, tss.map(t => h('option', { value: t.id }, t.name)));
    if (S.paletteTs) sel.value = S.paletteTs;
    sel.addEventListener('change', () => { S.paletteTs = sel.value; S.brush = { tilesetId: sel.value, x: 0, y: 0, w: 1, h: 1 }; renderPalette(); });
    const add = h('button', { class: 'mini', title: 'Importer une image de tileset', html: Icons.icon('plus'), onclick: quickImportTileset });
    const edit = h('button', { class: 'mini', title: 'Terrains du tileset (base de données)', html: Icons.icon('terrain'), onclick: () => DBEditor.open('tilesets', S.paletteTs) });
    box.append(
      h('div', { class: 'section-head' }, h('h3', {}, 'Tileset'), h('div', { class: 'head-actions' }, edit, add)),
      tss.length ? h('div', { class: 'palette-tools' }, sel) : ''
    );
    const ts = tsOf(S.paletteTs);
    const scroll = h('div', { class: 'palette-scroll' });
    box.append(scroll);
    if (!ts) { scroll.append(h('div', { class: 'palette-empty' }, 'Aucun tileset. Importe une image ou une map Tiled.')); return; }
    const img = Render.readyImage(S.baseUrl, ts.image);
    if (!img) { Render.loadImage(S.baseUrl, ts.image).then(i => { if (i) renderPalette(); else scroll.append(h('div', { class: 'palette-empty' }, 'Image introuvable : ' + ts.image)); }); return; }
    const scale = img.width <= 140 ? 2 : 1;
    palCanvas.width = img.width * scale; palCanvas.height = img.height * scale;
    palCanvas.dataset.scale = scale;
    scroll.append(palCanvas);
    drawPalette();
  }

  function drawPalette() {
    const ts = tsOf(S.paletteTs); if (!ts) return;
    const img = Render.readyImage(S.baseUrl, ts.image); if (!img) return;
    const sc = Number(palCanvas.dataset.scale) || 1;
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, palCanvas.width, palCanvas.height);
    pctx.drawImage(img, 0, 0, img.width * sc, img.height * sc);
    pctx.strokeStyle = 'rgba(255,255,255,.07)'; pctx.lineWidth = 1;
    const m = ts.margin || 0, sp = ts.spacing || 0;
    const rows = Math.ceil(ts.tileCount / ts.columns);
    pctx.beginPath();
    for (let c = 0; c <= ts.columns; c++) { const x = (m + c * (ts.tileWidth + sp)) * sc + .5; pctx.moveTo(x, 0); pctx.lineTo(x, palCanvas.height); }
    for (let r = 0; r <= rows; r++) { const y = (m + r * (ts.tileHeight + sp)) * sc + .5; pctx.moveTo(0, y); pctx.lineTo(palCanvas.width, y); }
    pctx.stroke();
    const b = S.brush;
    if (b && b.tilesetId === ts.id) {
      pctx.fillStyle = 'rgba(227,168,59,.18)';
      const x = (m + b.x * (ts.tileWidth + sp)) * sc, y = (m + b.y * (ts.tileHeight + sp)) * sc;
      const w = (b.w * (ts.tileWidth + sp) - sp) * sc, hh = (b.h * (ts.tileHeight + sp) - sp) * sc;
      pctx.fillRect(x, y, w, hh);
      pctx.strokeStyle = '#f2c46a'; pctx.lineWidth = 2; pctx.strokeRect(x + 1, y + 1, w - 2, hh - 2);
    }
  }
  function palCell(e) {
    const ts = tsOf(S.paletteTs); const r = palCanvas.getBoundingClientRect(); const sc = Number(palCanvas.dataset.scale) || 1;
    const m = ts.margin || 0, sp = ts.spacing || 0;
    const x = Math.floor(((e.clientX - r.left) / sc - m) / (ts.tileWidth + sp));
    const y = Math.floor(((e.clientY - r.top) / sc - m) / (ts.tileHeight + sp));
    const rows = Math.ceil(ts.tileCount / ts.columns);
    return { x: Math.max(0, Math.min(ts.columns - 1, x)), y: Math.max(0, Math.min(rows - 1, y)) };
  }
  palCanvas.addEventListener('mousedown', (e) => {
    const c = palCell(e); palDrag = c;
    S.brush = { tilesetId: S.paletteTs, x: c.x, y: c.y, w: 1, h: 1 };
    if (S.tool === 'eraser' || S.tool === 'picker') setTool('pencil');
    drawPalette();
  });
  palCanvas.addEventListener('mousemove', (e) => {
    if (!palDrag) return;
    const c = palCell(e); const r = rectOf(palDrag, c);
    S.brush = { tilesetId: S.paletteTs, x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 };
    drawPalette();
  });
  window.addEventListener('mouseup', () => { palDrag = null; });

  async function quickImportTileset() {
    const rel = await safe(() => tf.importTilesetImage(S.dir)); if (!rel) return;
    const img = await Render.loadImage(S.baseUrl, rel);
    if (!img) return UI.alert('Image illisible', rel);
    const m = curMap();
    const size = await UI.prompt('Taille des tiles', String(m ? m.tileWidth : 32), 'Largeur = hauteur en pixels (ex. 16, 32, 48)');
    if (!size) return;
    const tw = Math.max(4, Number(size) || 32);
    const ts = {
      id: uid('ts_', DB().tilesets), name: rel.split('/').pop().replace(/\.\w+$/, ''), image: rel, tileWidth: tw, tileHeight: tw,
      margin: 0, spacing: 0, columns: Math.floor(img.width / tw), tileCount: Math.floor(img.width / tw) * Math.floor(img.height / tw),
      imageWidth: img.width, imageHeight: img.height, tileTerrain: {}
    };
    DB().tilesets.push(ts);
    S.paletteTs = ts.id; S.brush = { tilesetId: ts.id, x: 0, y: 0, w: 1, h: 1 };
    markDirty(); renderPalette();
    UI.toast('Tileset ajouté. Pense à lui assigner des terrains (icône montagne).');
  }

  function renderTerrainPalette(box) {
    box.append(h('div', { class: 'section-head' }, h('h3', {}, 'Terrains'),
      h('div', { class: 'head-actions' }, h('button', { class: 'mini', title: 'Éditer les terrains', html: Icons.icon('db'), onclick: () => DBEditor.open('terrains') }))));
    const list = h('div', { class: 'pick-list' });
    for (const t of DB().terrains) {
      list.append(h('div', { class: 'pick' + (S.terrainBrush === t.id ? ' on' : ''), onclick: () => { S.terrainBrush = t.id; if (S.tool === 'eraser' || S.tool === 'picker') setTool('pencil'); renderPalette(); } },
        h('span', { class: 'sw', style: { background: t.color } }), h('span', {}, t.name),
        h('span', { class: 'meta' }, `Déf ${t.def} · Esq ${t.avoid}`)));
    }
    box.append(list);
  }

  function renderUnitPalette(box) {
    const ch = curChapter();
    box.append(h('div', { class: 'section-head' }, h('h3', {}, 'Placer'),
      h('div', { class: 'head-actions' }, h('button', { class: 'mini', title: 'Base de données', html: Icons.icon('db'), onclick: () => DBEditor.open('units') }))));
    const list = h('div', { class: 'pick-list' });
    if (!ch) { list.append(h('p', { class: 'note' }, "Cette map n'a pas encore de chapitre. Crée-en un dans le panneau de droite.")); box.append(list); return; }
    list.append(h('div', { class: 'pick-group' }, 'Unités du joueur'));
    for (const u of DB().units) {
      const placed = ch.players.find(p => p.unitId === u.id);
      const on = S.placeTool && S.placeTool.kind === 'players' && S.placeTool.unitId === u.id;
      const cls = byId(DB().classes, u.classId);
      const meta = charMeta(u.mapSprite || (cls && cls.mapSprite));
      list.append(h('div', { class: 'pick' + (on ? ' on' : ''), onclick: () => { S.placeTool = on ? null : { kind: 'players', unitId: u.id }; renderPalette(); } },
        meta ? Sprites.icon(S.baseUrl, meta, iconPalette('player', u.colors, cls && cls.colors), 24) : h('span', { class: 'token player', style: { background: u.color || '' } }, u.name.slice(0, 1)),
        h('span', {}, u.name), h('span', { class: 'meta' }, placed ? `placé ${placed.x},${placed.y}` : (cls ? cls.name : ''))));
    }
    if (!DB().units.length) list.append(h('p', { class: 'note' }, 'Aucune unité. Crée tes personnages dans la base de données.'));
    list.append(h('div', { class: 'pick-group' }, 'Alliés (unités vertes)'));
    for (const u of DB().units) {
      const placed = ch.allies.find(p => p.unitId === u.id);
      const on = S.placeTool && S.placeTool.kind === 'allies' && S.placeTool.unitId === u.id;
      const cls = byId(DB().classes, u.classId);
      const meta = charMeta(u.mapSprite || (cls && cls.mapSprite));
      list.append(h('div', { class: 'pick' + (on ? ' on' : ''), onclick: () => { S.placeTool = on ? null : { kind: 'allies', unitId: u.id }; renderPalette(); } },
        meta ? Sprites.icon(S.baseUrl, meta, iconPalette('ally', u.colors, cls && cls.colors), 24) : h('span', { class: 'token ally' }, u.name.slice(0, 1)),
        h('span', {}, u.name), h('span', { class: 'meta' }, placed ? `allié ${placed.x},${placed.y}` : '')));
    }
    list.append(h('div', { class: 'pick-group' }, 'Ennemis (par classe)'));
    for (const c of DB().classes) {
      const on = S.placeTool && S.placeTool.kind === 'enemies' && S.placeTool.classId === c.id;
      const meta = charMeta(c.mapSprite);
      list.append(h('div', { class: 'pick' + (on ? ' on' : ''), onclick: () => { S.placeTool = on ? null : { kind: 'enemies', classId: c.id, level: 1 }; renderPalette(); } },
        meta ? Sprites.icon(S.baseUrl, meta, iconPalette('enemy', c.colors), 24) : h('span', { class: 'token enemy' }, c.name.slice(0, 1)), h('span', {}, c.name),
        h('span', { class: 'meta' }, (Rules.MOVE_TYPES.find(m => m.id === c.moveType) || {}).name || '')));
    }
    box.append(list);
  }

  // =====================================================================
  // Arbre du projet
  // =====================================================================
  function renderTree() {
    const box = $('#tree-list'); box.innerHTML = '';
    if (!S.project) return;
    for (const m of S.project.maps) {
      box.append(h('div', {
        class: 'tree-item' + (m.id === S.mapId && (S.mode !== 'units' || !curChapter()) ? ' on' : ''),
        onclick: () => selectMap(m.id), ondblclick: () => renameMap(m),
        html: Icons.icon('map')
      }, h('span', {}, m.name), h('span', { class: 'sub' }, `${m.width}×${m.height}`)));
      for (const c of chaptersOf(m)) {
        box.append(h('div', {
          class: 'tree-item child' + (c.id === S.chapterId && m.id === S.mapId && S.mode === 'units' ? ' on' : ''),
          onclick: () => selectChapter(c.id), html: Icons.icon('flag')
        }, h('span', {}, c.name), S.project.meta.startChapter === c.id ? h('span', { class: 'start-badge', title: 'Chapitre de départ' }, 'départ') : null));
      }
    }
    const orphans = DB().chapters.filter(c => !S.project.maps.some(m => m.id === c.mapId));
    for (const c of orphans) box.append(h('div', { class: 'tree-item', onclick: () => DBEditor.open('chapters', c.id), html: Icons.icon('flag') }, h('span', {}, c.name), h('span', { class: 'sub' }, 'sans map')));
  }

  function selectMap(id) {
    const changed = S.mapId !== id;
    S.mapId = id;
    const chs = chaptersOf(curMap());
    if (changed || !chs.find(c => c.id === S.chapterId)) S.chapterId = chs[0] ? chs[0].id : null;
    if (changed) { S.layerIndex = 0; S.selected = null; fitZoom(); }
    if (S.mode === 'units' && !changed) S.mode = 'tiles';
    renderAll();
  }
  function selectChapter(id) {
    const c = byId(DB().chapters, id); if (!c) return;
    if (S.mapId !== c.mapId) { S.mapId = c.mapId; S.layerIndex = 0; fitZoom(); }
    S.chapterId = id; S.selected = null;
    setMode('units');
  }
  async function renameMap(m) {
    const name = await UI.prompt('Renommer la map', m.name); if (!name) return;
    m.name = name; markDirty(); renderTree(); renderInspector();
  }

  async function newMap() {
    const data = { name: 'Map ' + (S.project.maps.length + 1), width: 20, height: 15, tile: (curMap() && curMap().tileWidth) || 32, tilesetId: S.paletteTs || '' };
    const ok = await UI.modal((box, close) => {
      box.append(h('h3', {}, 'Nouvelle map'), UI.form([
        { key: 'name', label: 'Nom', type: 'text' },
        { type: 'row', fields: [{ key: 'width', label: 'Largeur', type: 'number', min: 1, max: 500 }, { key: 'height', label: 'Hauteur', type: 'number', min: 1, max: 500 }, { key: 'tile', label: 'Tile (px)', type: 'number', min: 4, max: 256 }] },
        { key: 'tilesetId', label: 'Tile de fond (premier tile du tileset)', type: 'select', empty: '— vide —', options: DB().tilesets.map(t => ({ value: t.id, label: t.name })) }
      ], data, {}), h('div', { class: 'modal-actions' }, h('button', { onclick: () => close(false) }, 'Annuler'), h('button', { class: 'primary', onclick: () => close(true) }, 'Créer')));
    }, { escValue: false, enter: (c) => c(true) });
    if (!ok) return;
    snapshot('project');
    const w = Math.max(1, Math.min(500, data.width | 0)), hh = Math.max(1, Math.min(500, data.height | 0));
    const map = { id: uid('map_', S.project.maps), name: data.name || 'Map', width: w, height: hh, tileWidth: data.tile | 0 || 32, tileHeight: data.tile | 0 || 32, tilesets: [], layers: [], terrain: new Array(w * hh).fill(''), objects: [] };
    const first = data.tilesetId ? ensureTilesetRef(map, data.tilesetId) : 0;
    map.layers.push({ id: 'l1', name: 'Sol', visible: true, data: new Array(w * hh).fill(first || 0) });
    map.layers.push({ id: 'l2', name: 'Décor', visible: true, data: new Array(w * hh).fill(0) });
    S.project.maps.push(map);
    selectMap(map.id);
  }

  async function duplicateMap(m) {
    snapshot('project');
    const copy = clone(m); copy.id = uid('map_', S.project.maps); copy.name = m.name + ' (copie)'; delete copy.source;
    S.project.maps.splice(S.project.maps.indexOf(m) + 1, 0, copy);
    selectMap(copy.id);
  }
  async function deleteMap(m) {
    const chs = chaptersOf(m);
    const ok = await UI.confirm(`Supprimer « ${m.name} » ?` + (chs.length ? `\n${chs.length} chapitre(s) lié(s) seront aussi supprimés.` : ''), { danger: true, ok: 'Supprimer' });
    if (!ok) return;
    snapshot('project');
    S.project.maps = S.project.maps.filter(x => x !== m);
    DB().chapters = DB().chapters.filter(c => c.mapId !== m.id);
    S.mapId = S.project.maps[0] ? S.project.maps[0].id : null;
    S.chapterId = null; S.mode = 'tiles';
    renderAll();
  }
  function resizeMap(m, w, hh) {
    w = Math.max(1, Math.min(500, w | 0)); hh = Math.max(1, Math.min(500, hh | 0));
    if (w === m.width && hh === m.height) return;
    snapshot('map', m.id);
    const conv = (arr, fill) => { const out = new Array(w * hh).fill(fill); for (let y = 0; y < Math.min(hh, m.height); y++) for (let x = 0; x < Math.min(w, m.width); x++) out[y * w + x] = arr[y * m.width + x]; return out; };
    m.layers.forEach(l => { l.data = conv(l.data, 0); });
    m.terrain = conv(m.terrain, '');
    m.objects = m.objects.filter(o => o.x < w && o.y < hh);
    m.width = w; m.height = hh;
    rebuildBase(); renderAll();
  }

  // =====================================================================
  // Import Tiled
  // =====================================================================
  async function importTiled() {
    const results = await safe(() => tf.importTiled(S.dir, DB().terrains));
    if (!results) return;
    const report = [];
    let lastMap = null;
    for (const r of results) {
      const fname = r.file.split(/[\\/]/).pop();
      if (r.error) { report.push(`${fname} : échec — ${r.error}`); continue; }
      snapshot('project');
      // tilesets : on réutilise ceux qui pointent vers la même image
      const idMap = {};
      for (const ts of r.tilesets) {
        const ex = DB().tilesets.find(t => t.image === ts.image && t.tileWidth === ts.tileWidth && t.tileHeight === ts.tileHeight);
        if (ex) {
          idMap[ts.id] = ex.id;
          for (const [k, v] of Object.entries(ts.tileTerrain || {})) if (!ex.tileTerrain[k]) ex.tileTerrain[k] = v;
        } else {
          let id = ts.id; while (DB().tilesets.some(t => t.id === id)) id += '_';
          idMap[ts.id] = id; ts.id = id; DB().tilesets.push(ts);
        }
      }
      const map = r.map;
      map.tilesets = map.tilesets.map(ref => ({ tilesetId: idMap[ref.tilesetId] || ref.tilesetId, firstgid: ref.firstgid }));
      map.layers.forEach((l, i) => { l.id = 'l' + (i + 1); });
      const previous = S.project.maps.find(m => m.source && m.source.file === map.source.file);
      let replaced = false;
      if (previous) {
        const choice = await UI.choose(`« ${fname} » a déjà été importée`, [
          { value: 'replace', label: `Mettre à jour « ${previous.name} »`, desc: 'Garde les chapitres liés (et les surcharges de terrain si la taille est identique).', primary: true },
          { value: 'new', label: 'Créer une nouvelle map' }
        ]);
        if (!choice) { S.undo.pop(); continue; }
        if (choice === 'replace') {
          map.id = previous.id; map.name = previous.name;
          if (previous.width === map.width && previous.height === map.height) map.terrain = previous.terrain;
          S.project.maps[S.project.maps.indexOf(previous)] = map;
          replaced = true;
        }
      }
      if (!replaced) { map.id = uid('map_', S.project.maps); S.project.maps.push(map); }
      await Render.preloadTilesets(S.baseUrl, DB().tilesets);
      lastMap = map;
      report.push(`${fname} : ${map.width}×${map.height}, ${map.layers.length} calque(s), ${r.tilesets.length} tileset(s), ${map.objects.length} objet(s)`);
      for (const w of r.warnings) report.push('   ⚠ ' + w);
    }
    if (!lastMap) { if (report.length) UI.alert('Import Tiled', report); return; }
    selectMap(lastMap.id);
    await UI.alert('Import Tiled terminé', report);
    const unitObjs = lastMap.objects.filter(o => objectKind(o));
    if (unitObjs.length && !chaptersOf(lastMap).length) {
      if (await UI.confirm(`La map contient ${unitObjs.length} objet(s) d'unités (player / enemy / boss / seize).\nCréer un chapitre avec ces placements ?`, { ok: 'Créer le chapitre' })) {
        createChapter(lastMap, true);
      }
    }
  }

  function objectKind(o) {
    const t = norm(o.type || (o.properties && (o.properties.kind || o.properties.type)));
    if (['player', 'joueur', 'hero', 'heros'].includes(t)) return 'player';
    if (['ally', 'allie', 'npc', 'pnj', 'partner', 'green', 'vert'].includes(t)) return 'ally';
    if (['enemy', 'ennemi', 'foe'].includes(t)) return 'enemy';
    if (t === 'boss') return 'boss';
    if (['seize', 'prise', 'objectif', 'objective', 'throne', 'trone'].includes(t)) return 'seize';
    return null;
  }
  function matchClass(v) {
    const n = norm(v); if (!n) return null;
    const c = DB().classes.find(c => norm(c.id) === n || norm(c.name) === n);
    return c ? c.id : null;
  }
  function aiOf(v, boss) {
    const n = norm(v);
    if (['range', 'portee', 'attente', 'wait'].includes(n)) return 'range';
    if (['stationary', 'immobile', 'fixe', 'garde'].includes(n)) return 'stationary';
    if (['aggressive', 'agressif', 'charge'].includes(n)) return 'aggressive';
    return boss ? 'stationary' : 'aggressive';
  }

  function placementsFromObjects(map, ch) {
    let n = 0;
    const bool = (v) => v === true || v === 'true' || v === '1' || v === 1;
    for (const o of map.objects) {
      const k = objectKind(o); if (!k) continue;
      const p = o.properties || {};
      if (k === 'player' || k === 'ally') {
        const nm = norm(p.unit || p.unite || o.name);
        const u = DB().units.find(u => norm(u.id) === nm || norm(u.name) === nm);
        if (!u) continue;
        ch.players = ch.players.filter(x => x.unitId !== u.id);
        ch.allies = (ch.allies || []).filter(x => x.unitId !== u.id);
        if (k === 'player') ch.players.push({ id: uid('p', ch.players), unitId: u.id, x: o.x, y: o.y });
        else ch.allies.push({ id: uid('a', ch.allies), unitId: u.id, x: o.x, y: o.y, control: norm(p.control || p.controle) === 'ai' || norm(p.control || p.controle) === 'ia' ? 'ai' : 'player', ai: aiOf(p.ai || p.ia, false) });
        n++;
      } else if (k === 'enemy' || k === 'boss') {
        const classId = matchClass(p.class || p.classe) || matchClass(o.name) || (DB().classes[0] && DB().classes[0].id);
        const boss = k === 'boss' || bool(p.boss);
        const cls = byId(DB().classes, classId);
        ch.enemies.push({
          id: uid('e', ch.enemies), name: o.name || (cls ? cls.name : 'Ennemi'), classId,
          level: Number(p.level || p.niveau || p.lv) || 1, x: o.x, y: o.y, ai: aiOf(p.ai || p.ia, boss),
          appearTurn: Number(p.turn || p.tour || p.appearTurn) || 0, isBoss: boss, inventory: []
        });
        n++;
      } else if (k === 'seize') {
        ch.objective = Object.assign({}, ch.objective, { type: 'seize', x: o.x, y: o.y });
      }
    }
    if (ch.enemies.some(e => e.isBoss) && ch.objective.type === 'rout') ch.objective.type = 'boss';
    return n;
  }

  function createChapter(map, fromObjects) {
    snapshot('project');
    const ch = { id: uid('ch_', DB().chapters), name: 'Chapitre ' + (DB().chapters.length + 1), mapId: map.id, objective: { type: 'rout', turns: 10, x: 0, y: 0 }, players: [], enemies: [], events: [] };
    DB().chapters.push(ch);
    if (fromObjects) placementsFromObjects(map, ch);
    if (!S.project.meta.startChapter) S.project.meta.startChapter = ch.id;
    S.mapId = map.id; S.chapterId = ch.id;
    setMode('units');
    return ch;
  }

  // =====================================================================
  // Inspecteur (droite)
  // =====================================================================
  const section = (title, ...children) => h('div', { class: 'insp-section' }, h('div', { class: 'insp-title' }, h('h3', {}, title)), ...children);

  function renderInspector() {
    const box = $('#inspector'); box.innerHTML = '';
    const m = curMap();
    if (!S.project) return;
    if (!m) { box.append(section('Projet', h('p', { class: 'note' }, 'Aucune map. Crée une map (+) ou importe une map Tiled.'), h('div', { class: 'insp-actions' }, h('button', { onclick: newMap }, 'Nouvelle map'), h('button', { onclick: importTiled }, 'Importer Tiled')))); return; }
    if (S.mode === 'units') return renderChapterInspector(box, m);
    renderMapInspector(box, m);
  }

  function renderMapInspector(box, m) {
    const sz = { w: m.width, h: m.height };
    box.append(section('Map',
      UI.form([{ key: 'name', label: 'Nom', type: 'text' }], m, { onChange: () => { markDirty(); renderTree(); } }),
      h('div', { class: 'form-row' },
        UI.form([{ type: 'row', fields: [{ key: 'w', label: 'Largeur', type: 'number', min: 1, max: 500 }, { key: 'h', label: 'Hauteur', type: 'number', min: 1, max: 500 }] }], sz, {}),
        h('button', { class: 'small', onclick: () => resizeMap(m, sz.w, sz.h) }, 'Appliquer')),
      h('dl', { class: 'kv' }, h('dt', {}, 'Tiles'), h('dd', {}, `${m.tileWidth} × ${m.tileHeight} px`),
        m.source ? [h('dt', {}, 'Source Tiled'), h('dd', {}, m.source.file)] : null,
        h('dt', {}, 'Chapitres'), h('dd', {}, String(chaptersOf(m).length))),
      h('div', { class: 'insp-actions' },
        h('button', { class: 'small', onclick: () => createChapter(m, false), html: Icons.icon('flag') }, 'Nouveau chapitre'),
        h('button', { class: 'small', onclick: () => duplicateMap(m), html: Icons.icon('copy') }, 'Dupliquer'),
        h('button', { class: 'small danger', onclick: () => deleteMap(m), html: Icons.icon('trash') }, 'Supprimer'))
    ));

    if (S.mode === 'tiles') {
      const list = h('div', { class: 'layer-list' });
      // affichage du haut vers le bas (calque supérieur en premier)
      for (let i = m.layers.length - 1; i >= 0; i--) {
        const l = m.layers[i];
        const eye = h('button', { class: 'mini', title: l.visible ? 'Masquer' : 'Afficher', html: Icons.icon(l.visible ? 'eye' : 'eyeoff') });
        eye.addEventListener('click', (e) => { e.stopPropagation(); l.visible = !l.visible; markDirty(); paintBase(); draw(); renderInspector(); });
        list.append(h('div', {
          class: 'layer' + (i === S.layerIndex ? ' on' : '') + (l.visible ? '' : ' hidden-layer'),
          onclick: () => { S.layerIndex = i; renderInspector(); if (S.dimOthers) { paintBase(); draw(); } },
          ondblclick: async () => { const n = await UI.prompt('Renommer le calque', l.name); if (n) { l.name = n; markDirty(); renderInspector(); } }
        }, h('span', { class: 'name' }, l.name), eye));
      }
      const dim = { v: S.dimOthers };
      box.append(section('Calques', list,
        h('div', { class: 'insp-actions' },
          h('button', { class: 'small', title: 'Nouveau calque', onclick: addLayer, html: Icons.icon('plus') }, 'Ajouter'),
          h('button', { class: 'mini', title: 'Monter', onclick: () => moveLayer(1), html: Icons.icon('up') }),
          h('button', { class: 'mini', title: 'Descendre', onclick: () => moveLayer(-1), html: Icons.icon('down') }),
          h('button', { class: 'mini', title: 'Supprimer le calque', onclick: deleteLayer, html: Icons.icon('trash') })),
        UI.form([{ key: 'v', label: 'Atténuer les autres calques', type: 'checkbox' }], dim, { onChange: () => { S.dimOthers = dim.v; paintBase(); draw(); } })
      ));
      const used = m.tilesets.map(r => { const t = tsOf(r.tilesetId); return h('dd', {}, (t ? t.name : '⚠ ' + r.tilesetId) + ' · gid ' + r.firstgid); });
      box.append(section('Tilesets utilisés', used.length ? h('dl', { class: 'kv' }, used.map(d => [h('dt', {}, '•'), d])) : h('p', { class: 'muted' }, 'Aucun (peins un tile pour en ajouter).')));
    } else {
      box.append(section('Terrain',
        h('p', { class: 'note' }, "Le terrain d'une case vient du ", h('b', {}, 'tile'), ' (assigné dans Base de données › Tilesets, ou via la propriété « terrain » dans Tiled). Peindre ici crée une ', h('b', {}, 'surcharge'), ' (cadre blanc).'),
        h('div', { class: 'insp-actions' },
          h('button', { class: 'small', onclick: () => DBEditor.open('tilesets', S.paletteTs) }, 'Terrains des tiles…'),
          h('button', { class: 'small danger', onclick: () => {
            if (!m.terrain.some(Boolean)) return;
            beginStroke(); m.terrain.forEach((v, i) => setCell(m, 'terrain', i, '')); endStroke(); draw();
          } }, 'Effacer les surcharges'))));
    }
  }

  function addLayer() {
    const m = curMap(); snapshot('map', m.id);
    const l = { id: uid('l', m.layers), name: 'Calque ' + (m.layers.length + 1), visible: true, data: new Array(m.width * m.height).fill(0) };
    m.layers.splice(S.layerIndex + 1, 0, l); S.layerIndex++;
    paintBase(); draw(); renderInspector();
  }
  function moveLayer(dir) {
    const m = curMap(); const i = S.layerIndex, j = i + dir;
    if (j < 0 || j >= m.layers.length) return;
    snapshot('map', m.id);
    [m.layers[i], m.layers[j]] = [m.layers[j], m.layers[i]]; S.layerIndex = j;
    paintBase(); draw(); renderInspector();
  }
  async function deleteLayer() {
    const m = curMap(); if (m.layers.length <= 1) return UI.toast('Une map garde au moins un calque');
    if (!(await UI.confirm(`Supprimer le calque « ${m.layers[S.layerIndex].name} » ?`, { danger: true, ok: 'Supprimer' }))) return;
    snapshot('map', m.id);
    m.layers.splice(S.layerIndex, 1); S.layerIndex = Math.max(0, S.layerIndex - 1);
    paintBase(); draw(); renderInspector();
  }

  const OBJECTIVES = [
    { value: 'rout', label: 'Mettre en déroute (tous les ennemis)' },
    { value: 'boss', label: 'Vaincre le boss' },
    { value: 'seize', label: 'Prendre une case (personnages autorisés)' },
    { value: 'survive', label: 'Survivre X tours' }
  ];
  const AIS = [
    { value: 'aggressive', label: 'Agressif — fonce sur le joueur' },
    { value: 'range', label: 'À portée — attaque si on entre dans sa zone' },
    { value: 'stationary', label: 'Immobile — attaque sans bouger' }
  ];

  function renderChapterInspector(box, m) {
    const chs = chaptersOf(m);
    if (!chs.length) {
      box.append(section('Chapitre',
        h('p', { class: 'note' }, "Un chapitre = une bataille jouée sur cette map : unités du joueur, ennemis, objectif et dialogues."),
        h('div', { class: 'insp-actions' },
          h('button', { class: 'primary small', onclick: () => createChapter(m, false) }, 'Créer un chapitre'),
          m.objects.some(o => objectKind(o)) ? h('button', { class: 'small', onclick: () => createChapter(m, true) }, 'Depuis les objets Tiled') : null)));
      return;
    }
    const ch = curChapter() || chs[0];
    S.chapterId = ch.id;
    const meta = S.project.meta;
    const change = () => { markDirty(); renderTree(); draw(); };
    const top = [];
    if (chs.length > 1) {
      const sel = h('select', {}, chs.map(c => h('option', { value: c.id }, c.name)));
      sel.value = ch.id; sel.addEventListener('change', () => { S.chapterId = sel.value; S.selected = null; renderAll(); });
      top.push(h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Chapitre de cette map'), sel));
    }
    const isStart = { v: meta.startChapter === ch.id };
    box.append(section('Chapitre', ...top,
      UI.form([
        { key: 'name', label: 'Nom', type: 'text' },
        { key: 'objective.type', label: 'Objectif', type: 'select', options: OBJECTIVES }
      ], ch, { onChange: (k) => { change(); if (k === 'objective.type') renderInspector(); } }),
      ch.objective.type === 'survive' ? UI.form([{ key: 'objective.turns', label: 'Nombre de tours', type: 'number', min: 1, max: 99 }], ch, { onChange: change }) : null,
      ch.objective.type === 'seize' ? h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Case à prendre'), h('span', {}, `x ${ch.objective.x ?? 0} · y ${ch.objective.y ?? 0}`)),
        h('button', { class: 'small' + (S.picking === 'seize' ? ' primary' : ''), onclick: () => { S.picking = S.picking === 'seize' ? null : 'seize'; renderInspector(); updateStatus(); } }, S.picking === 'seize' ? 'Clique sur la map…' : 'Choisir sur la map')) : null,
      ch.objective.type === 'boss' && !ch.enemies.some(e => e.isBoss) ? h('p', { class: 'note' }, '⚠ Aucun ennemi n\'est marqué comme boss.') : null,
      ch.objective.type === 'seize' && !Mission.seizers(ch, DB()).length ? h('p', { class: 'note' }, '⚠ Aucun personnage autorisé à prendre le point. Configure les conditions du chapitre.') : null,
      h('p', { class: 'note' }, 'À protéger : ' + (Mission.required(ch, DB()).map(id => (byId(DB().units, id) || {}).name || id).join(', ') || 'personne') + ((ch.extraObjectives || []).length ? ' · Objectifs combinés' : '')),
      UI.form([{ key: 'v', label: 'Chapitre de départ du jeu', type: 'checkbox' }], isStart, { onChange: () => { meta.startChapter = isStart.v ? ch.id : ''; change(); } }),
      h('div', { class: 'insp-actions' },
        h('button', { class: 'small', onclick: () => DBEditor.open('chapters', ch.id), html: Icons.icon('chat') }, 'Conditions & événements'),
        h('button', { class: 'small primary', onclick: () => playtest(ch.id), html: Icons.icon('play') }, 'Tester'))
    ));

    // liste des placements
    const list = h('div', { class: 'placement-list' });
    const row = (kind, pl) => {
      const on = S.selected && S.selected.kind === kind && S.selected.id === pl.id;
      return h('div', { class: 'placement' + (on ? ' on' : ''), onclick: () => { S.selected = { kind, id: pl.id }; renderInspector(); draw(); } },
        charMeta(spritePathOf(pl, kind)) ? Sprites.icon(S.baseUrl, charMeta(spritePathOf(pl, kind)), paletteOf(pl, kind), 24)
          : h('span', { class: 'token ' + ({ players: 'player', allies: 'ally' }[kind] || (pl.isBoss ? 'boss' : 'enemy')), style: kind === 'players' ? { background: tokenColor(pl, kind) } : {} }, tokenLabel(pl, kind).slice(0, 1)),
        kind === 'allies' ? h('span', { class: 'turn ally' }, 'allié') : null,
        h('span', {}, tokenLabel(pl, kind) + (kind === 'enemies' ? ` Nv ${pl.level}` : '')),
        kind === 'enemies' && pl.appearTurn > 0 ? h('span', { class: 'turn' }, 'T' + pl.appearTurn) : null,
        h('span', { class: 'pos' }, `${pl.x},${pl.y}`));
    };
    ch.players.forEach(p => list.append(row('players', p)));
    ch.allies.forEach(p => list.append(row('allies', p)));
    ch.enemies.forEach(p => list.append(row('enemies', p)));
    box.append(section(`Placements — ${ch.players.length} joueur · ${ch.allies.length} allié · ${ch.enemies.length} ennemi`,
      (ch.players.length + ch.allies.length + ch.enemies.length) ? list : h('p', { class: 'muted' }, 'Choisis une unité à gauche puis clique sur la map.'),
      m.objects.some(o => objectKind(o)) ? h('div', { class: 'insp-actions' }, h('button', { class: 'small', onclick: () => { snapshot('chapter', ch.id); const n = placementsFromObjects(m, ch); UI.toast(n + ' placement(s) importé(s)'); renderAll(); } }, `Importer les objets Tiled (${m.objects.filter(o => objectKind(o)).length})`)) : null));

    // placement sélectionné
    const pl = findPlacement(S.selected);
    if (!pl) return;
    const onPl = (k) => { markDirty(); draw(); if (['classId', 'isBoss', 'name', 'unitId', 'appearTurn', 'level', 'colors'].includes(k)) { renderPalette(); renderInspector(); } };
    // couleurs du sprite pour ce placement seulement (sinon celles du personnage / de la classe)
    const colorsField = { key: 'colors', label: 'Couleurs', type: 'select', empty: 'Comme le personnage / la classe', options: Palettes.MODES };
    const snapOnce = (() => { let done = false; return () => { if (!done) { snapshot('chapter', ch.id); done = true; } }; })();
    const ctxF = { onChange: (k) => { snapOnce(); onPl(k); } };
    const del = h('button', { class: 'small danger', html: Icons.icon('trash'), onclick: () => { snapshot('chapter', ch.id); ch[S.selected.kind] = ch[S.selected.kind].filter(p => p !== pl); S.selected = null; renderAll(); } }, 'Retirer');
    if (S.selected.kind === 'allies') {
      box.append(section('Allié (unité verte)', UI.form([
        { key: 'unitId', label: 'Personnage', type: 'select', options: DB().units.map(u => ({ value: u.id, label: u.name })) },
        { key: 'control', label: 'Contrôle', type: 'select', options: [
          { value: 'player', label: 'Jouable — le joueur le dirige pendant la phase alliée' },
          { value: 'ai', label: 'IA — joue seul pendant la phase alliée' }] },
        { key: 'ai', label: 'Comportement (si IA)', type: 'select', options: AIS },
        colorsField,
        { type: 'info', text: `Position : x ${pl.x} · y ${pl.y}. La phase alliée se joue juste après la phase du joueur. Sa mort ne fait pas perdre la partie.` }
      ], pl, ctxF), h('div', { class: 'insp-actions' }, h('button', { class: 'small', onclick: () => DBEditor.open('units', pl.unitId) }, 'Fiche du personnage'), del)));
    } else if (S.selected.kind === 'players') {
      box.append(section('Unité du joueur', UI.form([
        { key: 'unitId', label: 'Personnage', type: 'select', options: DB().units.map(u => ({ value: u.id, label: u.name })) },
        colorsField,
        { type: 'info', text: `Position : x ${pl.x} · y ${pl.y}` }
      ], pl, ctxF), h('div', { class: 'insp-actions' }, h('button', { class: 'small', onclick: () => DBEditor.open('units', pl.unitId) }, 'Fiche du personnage'), del)));
    } else {
      const cls = byId(DB().classes, pl.classId);
      const prev = cls ? Rules.statsFromClass(cls, pl.level || 1) : null;
      box.append(section(pl.isBoss ? 'Boss' : 'Ennemi', UI.form([
        { key: 'name', label: 'Nom', type: 'text' },
        { type: 'row', fields: [
          { key: 'classId', label: 'Classe', type: 'select', options: DB().classes.map(c => ({ value: c.id, label: c.name })) },
          { key: 'level', label: 'Niveau', type: 'number', min: 1, max: 40, compact: true }] },
        { key: 'ai', label: 'Comportement', type: 'select', options: AIS },
        colorsField,
        { type: 'row', fields: [
          { key: 'appearTurn', label: 'Arrive au tour', type: 'number', min: 0, max: 99, help: '0 = présent dès le début. Sinon : renfort qui apparaît au début de la phase ennemie de ce tour.' },
          { key: 'isBoss', label: 'Boss', type: 'checkbox' }] },
        { key: 'inventory', label: 'Inventaire (vide = celui de la classe)', type: 'inventory', options: invOptions },
        { key: 'statBonus', label: 'Bonus de stats', type: 'stats', max: 99 }
      ], pl, ctxF),
      prev ? h('div', { class: 'note' }, 'Stats calculées : ' + Rules.STATS.map(k => `${Rules.STAT_LABELS[k]} ${prev[k] + ((pl.statBonus && pl.statBonus[k]) || 0)}`).join(' · ')) : null,
      h('div', { class: 'insp-actions' }, del)));
    }
  }

  function invOptions() {
    return DB().weapons.map(w => ({ value: w.id, label: '⚔ ' + w.name })).concat(DB().items.map(i => ({ value: i.id, label: '✚ ' + i.name })));
  }

  // =====================================================================
  // Modes, outils, rendu global
  // =====================================================================
  function setMode(mode) {
    S.mode = mode; S.picking = null; S.drag = null;
    document.querySelectorAll('#mode-group button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#tool-group').classList.toggle('disabled', mode === 'units');
    paintBase();
    renderAll();
  }
  function setTool(tool) {
    S.tool = tool;
    document.querySelectorAll('#tool-group button').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    draw();
  }

  function renderAll() {
    if (!S.project) return;
    document.querySelectorAll('#mode-group button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    $('#tool-group').classList.toggle('disabled', S.mode === 'units');
    $('#grid-btn').classList.toggle('on', S.grid);
    renderTree(); renderPalette(); renderInspector();
    if (curMap()) rebuildBase();
    draw(); updateStatus(); updateTitle();
  }

  async function playtest(chapterId) {
    const id = chapterId || (curChapter() && curChapter().id) || S.project.meta.startChapter || (DB().chapters[0] && DB().chapters[0].id);
    if (!id) return UI.alert('Rien à tester', "Crée d'abord un chapitre (mode Unités, F3).");
    const ch = byId(DB().chapters, id);
    if (!ch.players.length) return UI.alert('Chapitre incomplet', "Place au moins une unité du joueur.");
    const map = S.project.maps.find(m => m.id === ch.mapId);
    const errors = map ? Mission.validate(ch, DB(), map) : ['Map introuvable.'];
    if (errors.length) return UI.alert('Conditions du chapitre à corriger', errors);
    await cmdSave();
    if (S.dirty) return;
    await safe(() => tf.playtest(S.dir, id));
  }

  // ---------- commandes ----------
  const commands = {
    'new': cmdNew, 'open': () => cmdOpen(), 'save': cmdSave,
    'save-and-close': async () => { await cmdSave(); if (!S.dirty) tf.forceClose(); },
    'import-tiled': () => S.project && importTiled(),
    'open-folder': () => S.project && tf.openFolder(S.dir),
    'undo': () => { if (isTyping()) document.execCommand('undo'); else undo(); },
    'redo': () => { if (isTyping()) document.execCommand('redo'); else redo(); },
    'zoom-in': () => S.project && zoomBy(1), 'zoom-out': () => S.project && zoomBy(-1),
    'zoom-reset': () => { if (S.project) { S.zoom = 1; rebuildBase(); draw(); } },
    'toggle-grid': () => { S.grid = !S.grid; $('#grid-btn').classList.toggle('on', S.grid); draw(); },
    'mode-tiles': () => S.project && setMode('tiles'), 'mode-terrain': () => S.project && setMode('terrain'), 'mode-units': () => S.project && setMode('units'),
    'database': () => S.project && DBEditor.open(),
    'playtest': () => S.project && playtest(),
    'new-map': () => S.project && newMap()
  };
  function isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd],[data-mode],[data-tool]');
    if (!b) return;
    if (b.dataset.cmd && commands[b.dataset.cmd]) commands[b.dataset.cmd]();
    else if (b.dataset.mode) setMode(b.dataset.mode);
    else if (b.dataset.tool) setTool(b.dataset.tool);
  });
  tf.onMenu((cmd) => { if (commands[cmd]) commands[cmd](); });

  document.addEventListener('keydown', (e) => {
    if (!S.project || isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('#db').classList.contains('hidden') || document.querySelector('.modal-back')) return;
    const k = e.key.toLowerCase();
    const tools = { b: 'pencil', r: 'rect', f: 'fill', e: 'eraser', i: 'picker' };
    if (tools[k] && S.mode !== 'units') { setTool(tools[k]); e.preventDefault(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.mode === 'units' && S.selected) {
      const ch = curChapter(); const pl = findPlacement(S.selected);
      if (ch && pl) { snapshot('chapter', ch.id); ch[S.selected.kind] = ch[S.selected.kind].filter(p => p !== pl); S.selected = null; renderAll(); }
    }
    if (e.key === 'Escape') { S.placeTool = null; S.picking = null; S.selected = null; renderAll(); }
  });
  window.addEventListener('resize', UI.debounce(() => draw(), 100));

  // ---------- API pour la base de données ----------
  window.Editor = {
    get state() { return S; },
    db: () => DB(), project: () => S.project, baseUrl: () => S.baseUrl, dir: () => S.dir,
    markDirty, uid, invOptions, objectives: OBJECTIVES,
    refresh: async () => { await Render.preloadTilesets(S.baseUrl, DB().tilesets); renderAll(); },
    selectChapter, playtest, open: cmdOpen, rescanResources, resources: () => S.project.resources
  };

  // ---------- démarrage ----------
  Icons.hydrate();
  setTool('pencil');
  renderRecent();
})();
