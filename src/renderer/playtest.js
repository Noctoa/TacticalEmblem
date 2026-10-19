/* Moteur de playtest : phase joueur / ennemie, combat, IA, événements, objectifs. */
(function () {
  'use strict';
  const { h } = UI;
  const R = Rules;
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms / (G.fast ? 2.5 : 1)));
  const key = R.key;

  const G = {
    project: null, db: null, map: null, chapter: null, settings: null, baseUrl: '',
    tgrid: [], terrains: {}, units: [], pending: [], turn: 1, phase: 'player', ui: 'idle',
    cursor: { x: 0, y: 0 }, mouseIn: false, mouse: { x: 0, y: 0 },
    sel: null, reach: null, atk: null, staffRange: null, origin: null, targets: [], tIndex: 0, wList: [], wIndex: 0,
    danger: false, dangerSet: null, enemyView: null, menu: null, fired: new Set(), over: false, busy: false,
    dialogue: null, fast: false, lost: [],
    mode: 'chapter', lobbyOn: false // mode : 'chapter' (combat) ou 'lobby' (camp entre deux chapitres)
  };
  window.PlaytestState = G;
  const V = { s: 2, camX: 0, camY: 0, w: 0, h: 0, dpr: 1, shake: 0 };
  const floats = [];

  const defaultHelp = $('#help').textContent;
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');

  // =====================================================================
  // Chargement
  // =====================================================================
  async function init() {
    try {
      G.busy = true;
      const payload = await tf.loadProject(params.get('dir'));
      G.project = payload.project; G.baseUrl = payload.baseUrl; G.db = G.project.db;
      G.resources = G.project.resources || { characters: {}, battlers: {} };
      G.settings = Object.assign({}, R.DEFAULT_SETTINGS, G.project.meta.settings || {});
      const cv = G.project.meta.convoy || {};
      G.convoyCap = cv.capacity || 100;
      G.convoy = (cv.items || []).map(e => {
        const d = R.getEntry(G.db, e.id); return d ? { id: e.id, uses: e.uses || d.def.uses || 0 } : null;
      }).filter(Boolean);
      const lobbyCfg = Lobby.defaults(G.project.meta.lobby);
      Music.setup(G.baseUrl, Object.assign({}, G.project.meta.audio || {}, { lobby: lobbyCfg.music || (G.project.meta.audio || {}).playerPhase || '' }));
      G.lobbyOn = lobby.enabled(G.project);
      G.supCfg = Object.assign({}, R.DEFAULT_SUPPORT, G.project.meta.supports || {});
      G.sup = R.initSupports(G.db, G.supCfg);
      G.db.terrains.forEach(t => { G.terrains[t.id] = t; });
      G.campaign = Campaign.create('classic');
      await Render.preloadTilesets(G.baseUrl, G.db.tilesets);
      await Promise.all(G.db.units.filter(u => u.portrait).map(u => Render.loadImage(G.baseUrl, u.portrait)));
      // sprites de map, battlers et projectiles utilisés par le projet
      const imgs = [];
      for (const m of Object.values(G.resources.characters)) imgs.push(m.image);
      for (const m of Object.values(G.resources.battlers)) { imgs.push(m.image); for (const p of Object.values(m.projectiles || {})) imgs.push(p); }
      await Promise.all(imgs.map(i => Render.loadImage(G.baseUrl, i)));
      const chId = params.get('chapter');
      let first = R.byId(G.db.chapters, chId) || R.byId(G.db.chapters, G.project.meta.startChapter) || G.db.chapters[0];
      if (!first) throw new Error('Aucun chapitre à jouer.');
      let saved = null;
      try { saved = await tf.loadCampaign(params.get('dir')); }
      catch (e) { await UI.alert('Sauvegarde non chargée', e.message); }
      const atLobby = (s) => s && s.chapterId === Lobby.LOBBY_SAVE;
      const camp = lobbyCfg.name || 'le camp';
      // avec un lobby : la partie commence au camp ; « Tester » un chapitre depuis l'éditeur peut aussi le lancer directement
      const direct = G.lobbyOn && chId && chId !== Lobby.LOBBY_SAVE && R.byId(G.db.chapters, chId);
      const choice = await UI.choose('Lancer une partie', [
        ...(saved ? [{ value: 'continue', label: 'Continuer la campagne', desc: atLobby(saved) ? camp + (G.lobbyOn ? '' : ' (lobby désactivé : premier chapitre)') : (R.byId(G.db.chapters, saved.chapterId) || {}).name || saved.chapterId }] : []),
        { value: 'classic', label: 'Nouvelle partie — Classique', desc: 'Mort définitive des unités vaincues. Les personnages à protéger restent obligatoires.' + (G.lobbyOn ? ` Départ : ${camp}.` : '') },
        { value: 'casual', label: 'Nouvelle partie — Détente', desc: 'Les unités vaincues reviennent au chapitre suivant. Les conditions de défaite restent actives.' + (G.lobbyOn ? ` Départ : ${camp}.` : '') },
        ...(direct ? [{ value: 'direct', label: `Tester « ${direct.name} » directement`, desc: 'Nouvelle partie Classique qui commence par ce chapitre ; la victoire ramène au camp.' }] : [])
      ], G.lobbyOn ? `Le jeu commence à ${camp} : chapitres, boutique et conversations.` : 'Nouvelle partie : ' + first.name + '. Les sauvegardes reprennent au début du chapitre.');
      if (!choice) { window.close(); return; }
      let toLobby = G.lobbyOn;
      if (choice === 'continue') {
        Object.assign(G, Campaign.restore(saved, G.sup));
        toLobby = G.lobbyOn && atLobby(saved);
        if (!toLobby && !atLobby(saved)) {
          first = R.byId(G.db.chapters, saved.chapterId);
          if (!first) throw new Error('Le chapitre sauvegardé a été supprimé du projet.');
        }
      } else {
        G.campaign = Campaign.create(choice === 'direct' ? 'classic' : choice, lobbyCfg.startGold);
        if (choice === 'direct') { toLobby = false; first = direct; }
      }
      requestAnimationFrame(loop);
      if (toLobby) await lobby.enter(); else await loadChapter(first);
    } catch (e) {
      console.error(e);
      await UI.alert('Impossible de lancer le playtest', e.message || String(e));
      window.close();
    }
  }

  /** Charge un chapitre. Les niveaux, objets, affinités et le convoi sont conservés d'un chapitre à l'autre. */
  async function loadChapter(ch) {
    if (G.mode === 'lobby') lobby.leave();
    G.mode = 'chapter';
    G.chapter = ch;
    G.map = G.project.maps.find(m => m.id === ch.mapId);
    if (!G.map) throw new Error(`La map du chapitre « ${ch.name} » est introuvable.`);
    const errors = Mission.validate(ch, G.db, G.map);
    if (errors.length) throw new Error(errors.join('\n'));
    G.checkpoint = Campaign.checkpoint(ch.id, G.campaign, G.convoy, G.sup);
    document.title = `Playtest — ${ch.name}`;
    G.tgrid = R.buildTerrainGrid(G.map, G.db.tilesets, G.project.meta.defaultTerrain || 'plain');
    Object.assign(G, { turn: 1, phase: 'player', ui: 'idle', over: false, busy: false, fired: new Set(), lost: [], sel: null,
      reach: null, atk: null, staffRange: null, enemyView: null, dangerSet: null, menu: null, targets: [], wList: [], seized: [] });
    hideMenu(); hideForecast();
    $('#convoy').classList.add('hidden');
    $('#epilogue').classList.add('hidden');
    $('#end').className = 'hidden'; $('#end').innerHTML = '';
    buildBase();
    setupUnits();
    resize();
    await startChapter();
  }

  /** Mémorise l'état des survivants pour le chapitre suivant. */
  function saveCampaign() {
    Campaign.commit(G.campaign, G.units);
  }
  function applyCampaign(u) {
    return Campaign.apply(G.campaign, u, G.db);
  }
  async function saveCheckpoint() {
    const wasBusy = G.busy; G.busy = true;
    try {
      const old = await tf.loadCampaign(params.get('dir'));
      if (old && !(await UI.confirm('Remplacer la sauvegarde de campagne par le début de ce chapitre ?'))) return;
      await tf.saveCampaign(params.get('dir'), G.checkpoint);
      UI.toast('Début du chapitre sauvegardé — ' + (G.campaign.mode === 'classic' ? 'Classique' : 'Détente'));
    } catch (e) { await UI.alert('Sauvegarde impossible', e.message); }
    finally { G.busy = wasBusy; }
  }
  async function restartChapter() {
    const wasBusy = G.busy; G.busy = true;
    if (!(await UI.confirm('Recommencer ce chapitre ? Les actions et pertes de cette tentative seront annulées.'))) { G.busy = wasBusy; return; }
    G.sup = R.initSupports(G.db, G.supCfg);
    Object.assign(G, Campaign.restore(G.checkpoint, G.sup));
    await loadChapter(G.chapter);
  }

  function buildBase() {
    const m = G.map;
    base.width = m.width * m.tileWidth; base.height = m.height * m.tileHeight;
    const b = base.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.fillStyle = '#14161b'; b.fillRect(0, 0, base.width, base.height);
    Render.drawMap(b, m, { scale: 1, baseUrl: G.baseUrl, tilesets: G.db.tilesets });
  }

  function setupUnits() {
    G.units = []; G.pending = [];
    const ch = G.chapter;
    for (const pl of ch.players) {
      const c = R.byId(G.db.units, pl.unitId);
      if (!c || G.campaign.dead.includes(pl.unitId)) continue;
      const u = applyCampaign(R.makeUnitFromCharacter(c, G.db, pl));
      G.units.push(prep(u));
    }
    for (const pl of ch.allies || []) {
      const c = R.byId(G.db.units, pl.unitId);
      if (!c || ch.players.some(p => p.unitId === pl.unitId)) continue;
      if (G.campaign.dead.includes(pl.unitId)) continue;
      const u = applyCampaign(R.makeUnitFromCharacter(c, G.db, pl, 'ally'));
      u.control = pl.control || 'player'; u.ai = pl.ai || 'aggressive'; u.convoy = false; u.isLord = false;
      G.units.push(prep(u));
    }
    for (const pl of ch.enemies) {
      const u = R.makeEnemyFromPlacement(pl, G.db, 'enemy');
      if (!u) continue;
      prep(u);
      if (pl.appearTurn > 0) G.pending.push(u); else G.units.push(u);
    }
    const lord = G.units.find(u => u.isLord) || G.units.find(u => u.team === 'player');
    if (lord) G.cursor = { x: lord.x, y: lord.y };
  }
  function prep(u) { u.rx = u.x; u.ry = u.y; u.ox = 0; u.oy = 0; u.alpha = 1; u.flash = 0; u.dead = false; u.bob = Math.random() * 6; return u; }

  // =====================================================================
  // Requêtes sur l'état
  // =====================================================================
  const alive = () => G.units.filter(u => !u.dead);
  const players = () => alive().filter(u => u.team !== 'enemy');      // joueur + alliés (camp ami)
  const team = (t) => alive().filter(u => u.team === t);
  /** Unité commandable maintenant : unités du joueur en phase joueur, alliés « jouables » en phase alliée. */
  const controllable = (u) => !!u && !u.dead && !u.done &&
    ((G.phase === 'player' && u.team === 'player') || (G.phase === 'ally' && u.team === 'ally' && u.control !== 'ai'));
  const enemies = () => alive().filter(u => u.team === 'enemy');
  const unitAt = (x, y) => alive().find(u => u.x === x && u.y === y) || null;
  const terrainAt = (x, y) => G.terrains[G.tgrid[y * G.map.width + x]] || null;
  const terrainOf = (u) => terrainAt(u.x, u.y);
  const rctx = () => ({ width: G.map.width, height: G.map.height, terrainAt, unitAt });
  const ropts = () => ({ db: G.db, settings: G.settings, ctx: rctx(), terrainOf, bonusOf, units: alive() });
  // ---------- affinités ----------
  const bonusOf = (u) => R.supportBonus(u, players(), G.sup, G.supCfg);
  const specialOf = (u) => R.supportSpecial(u, players(), G.sup, G.supCfg);
  const unitById = (sourceId) => players().find(u => u.sourceId === sourceId) || null;
  /** Un personnage a déjà un rang S avec quelqu'un d'autre ? */
  function sTaken(entry) {
    for (const e of Object.values(G.sup)) {
      if (e === entry || e.rank < 4) continue;
      if ([e.def.a, e.def.b].some(id => id === entry.def.a || id === entry.def.b)) return true;
    }
    return false;
  }
  function gainSupport(a, b, amount) {
    if (!a || !b || a.team === 'enemy' || b.team === 'enemy') return;
    if (R.addSupportPoints(G.sup, a.sourceId, b.sourceId, amount, G.supCfg, sTaken)) {
      float(a.x, a.y, '♥ Soutien !', '#ff9ecb'); float(b.x, b.y, '♥', '#ff9ecb');
    }
  }
  /** Partenaires adjacents avec une conversation de soutien disponible. */
  function supportsAvailable(u) {
    const out = [];
    for (const p of R.partnersOf(u, G.sup)) {
      const other = unitById(p.id);
      if (!other || R.dist(other, u) !== 1) continue;
      const next = R.pendingRank(p.entry, G.supCfg, sTaken);
      if (next) out.push({ other, entry: p.entry, next });
    }
    return out;
  }
  async function doSupport(u, s) {
    hideMenu();
    G.busy = true;
    const letter = R.SUPPORT_RANKS[s.next];
    const conv = (s.entry.def.conversations || {})[letter] || `${u.name}: …\n${s.other.name}: …`;
    await playDialogue(conv);
    s.entry.rank = s.next;
    float(u.x, u.y, `Affinité ${letter}`, '#ff9ecb', true); float(s.other.x, s.other.y, `♥ ${letter}`, '#ff9ecb');
    UI.toast(`${u.name} et ${s.other.name} : affinité ${letter}`);
    await sleep(500);
    G.busy = false;
    await finishAction(u);
  }
  /** Fin de la phase joueur : les paires côte à côte se rapprochent. */
  function adjacencyGains() {
    const g = Number(G.supCfg.gainAdjacent) || 0;
    if (!g) return;
    for (const e of Object.values(G.sup)) {
      const a = unitById(e.def.a), b = unitById(e.def.b);
      if (a && b && R.dist(a, b) === 1) gainSupport(a, b, g);
    }
  }
  function supportTags(u) {
    return R.partnersOf(u, G.sup).filter(p => p.entry.rank > 0 || R.pendingRank(p.entry, G.supCfg, sTaken))
      .map(p => {
        const c = R.byId(G.db.units, p.id); const pend = R.pendingRank(p.entry, G.supCfg, sTaken);
        return `${c ? c.name : p.id} ${R.SUPPORT_RANKS[p.entry.rank] || '–'}${pend ? '↑' : ''}`;
      });
  }
  const cls = (u) => R.byId(G.db.classes, u.classId);
  const wOf = (slot) => slot && R.byId(G.db.weapons, slot.id);
  const iOf = (slot) => slot && R.byId(G.db.items, slot.id);

  function attackTargetsFrom(u) {
    const res = [];
    for (const e of enemies()) {
      const d = R.dist(u, e);
      if (R.attackWeapons(u, G.db).some(w => d >= (w.weapon.minRange || 1) && d <= (w.weapon.maxRange || 1))) res.push(e);
    }
    return res;
  }
  function staffTargetsFrom(u) {
    const st = R.staves(u, G.db); if (!st.length) return [];
    return players().filter(p => p !== u && p.hp < p.stats.hp && st.some(s => { const d = R.dist(u, p); return d >= (s.weapon.minRange || 1) && d <= (s.weapon.maxRange || 1); }));
  }
  function rangesFor(u, list) {
    let min = 99, max = 0;
    list.forEach(w => { min = Math.min(min, w.weapon.minRange || 1); max = Math.max(max, w.weapon.maxRange || 1); });
    return list.length ? { min, max } : null;
  }

  // =====================================================================
  // Rendu
  // =====================================================================
  function resize() {
    V.dpr = window.devicePixelRatio || 1;
    V.w = window.innerWidth; V.h = window.innerHeight;
    canvas.width = Math.round(V.w * V.dpr); canvas.height = Math.round(V.h * V.dpr);
    if (!G.map) return;
    const mw = G.map.width * G.map.tileWidth, mh = G.map.height * G.map.tileHeight;
    const fit = Math.min((V.w - 40) / mw, (V.h - 40) / mh);
    V.s = Math.max(1, Math.min(3, fit >= 2 ? Math.floor(fit) : Math.floor(fit * 4) / 4));
    clampCam();
    focus(G.cursor.x, G.cursor.y, true);
  }
  const TW = () => G.map.tileWidth * V.s;
  const TH = () => G.map.tileHeight * V.s;
  function clampCam() {
    const mw = G.map.width * TW(), mh = G.map.height * TH();
    V.camX = mw <= V.w ? -(V.w - mw) / 2 : Math.max(0, Math.min(mw - V.w, V.camX));
    V.camY = mh <= V.h ? -(V.h - mh) / 2 : Math.max(0, Math.min(mh - V.h, V.camY));
  }
  function focus(x, y, instant) {
    const mw = G.map.width * TW(), mh = G.map.height * TH();
    const px = x * TW(), py = y * TH(), m = Math.max(TW(), TH()) * 2;
    if (mw > V.w) { if (px - V.camX < m) V.camX = px - m; if (px + TW() - V.camX > V.w - m) V.camX = px + TW() - V.w + m; }
    if (mh > V.h) { if (py - V.camY < m) V.camY = py - m; if (py + TH() - V.camY > V.h - m) V.camY = py + TH() - V.h + m; }
    clampCam();
  }

  function loop(t) {
    edgeScroll();
    draw(t);
    requestAnimationFrame(loop);
  }
  function edgeScroll() {
    if (!G.mouseIn || !G.map || G.mode === 'lobby') return;
    const mw = G.map.width * TW(), mh = G.map.height * TH(), e = 36, sp = 9;
    let moved = false;
    if (mw > V.w) { if (G.mouse.x < e) { V.camX -= sp; moved = true; } else if (G.mouse.x > V.w - e) { V.camX += sp; moved = true; } }
    if (mh > V.h) { if (G.mouse.y < e) { V.camY -= sp; moved = true; } else if (G.mouse.y > V.h - e) { V.camY += sp; moved = true; } }
    if (moved) clampCam();
  }

  function tileRect(x, y) { return [x * TW() - V.camX, y * TH() - V.camY, TW(), TH()]; }

  function fillTiles(set, color, alpha) {
    if (!set) return;
    ctx.fillStyle = color; ctx.globalAlpha = alpha;
    for (const k of set) {
      const [x, y] = k.split(',').map(Number);
      const [px, py, w, hh] = tileRect(x, y);
      ctx.fillRect(px + 1, py + 1, w - 2, hh - 2);
    }
    ctx.globalAlpha = 1;
  }

  function draw(t) {
    if (!G.map) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, V.w, V.h);
    let sx = 0, sy = 0;
    if (V.shake > 0) { sx = (Math.random() - .5) * V.shake; sy = (Math.random() - .5) * V.shake; V.shake *= 0.86; if (V.shake < .3) V.shake = 0; }
    ctx.translate(sx, sy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, -V.camX, -V.camY, base.width * V.s, base.height * V.s);

    const pulse = 0.38 + Math.sin(t / 260) * 0.07;
    if (G.danger && G.dangerSet) fillTiles(G.dangerSet, '#ff6a2a', 0.22);
    if (G.enemyView) { fillTiles(G.enemyView.move, '#4f8cff', 0.28); fillTiles(G.enemyView.atk, '#ff3b30', 0.32); }
    if (G.ui === 'moving' && G.reach) {
      const blue = new Set([...G.reach.values()].map(n => key(n.x, n.y)));
      fillTiles(blue, '#3b7bff', pulse);
      fillTiles(G.atk, '#ff3b30', pulse - 0.06);
      fillTiles(G.staffRange, '#3ddc84', pulse - 0.06);
      drawPath();
    }
    if (G.ui === 'target' || G.ui === 'staff') {
      const set = new Set(G.targets.map(u => key(u.x, u.y)));
      fillTiles(set, G.ui === 'staff' ? '#3ddc84' : '#ff3b30', pulse);
    }
    // case objectif
    for (const ob of G.chapter ? Mission.objectives(G.chapter).filter(o => o.type === 'seize') : []) {
      const [px, py, w, hh] = tileRect(ob.x, ob.y);
      ctx.strokeStyle = `rgba(242,213,138,${0.6 + Math.sin(t / 300) * 0.3})`; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, w - 4, hh - 4);
    }
    const z = G.chapter && G.chapter.defendZone;
    if (z && z.enabled) {
      const [px, py, w, hh] = tileRect(z.x, z.y);
      ctx.strokeStyle = '#ff7777'; ctx.lineWidth = 3; ctx.strokeRect(px + 2, py + 2, w * z.w - 4, hh * z.h - 4);
    }

    const list = G.units.filter(u => !u.dead || u.alpha > 0).sort((a, b) => a.ry - b.ry);
    for (const u of list) drawUnit(u, t);
    if (G.mode === 'lobby') lobby.drawOverlay(ctx, t);
    if (!G.busy && ['player', 'ally'].includes(G.phase) && !G.over && !G.dialogue) drawCursor(t);
    drawFloats(t);
  }

  function drawPath() {
    const n = G.reach.get(key(G.cursor.x, G.cursor.y));
    if (!n) return;
    const path = R.pathTo(G.reach, n.x, n.y);
    if (path.length < 2) return;
    ctx.strokeStyle = 'rgba(255,240,200,.9)'; ctx.lineWidth = Math.max(3, TW() * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((p, i) => { const [px, py, w, hh] = tileRect(p.x, p.y); const cx = px + w / 2, cy = py + hh / 2; if (i) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); });
    ctx.stroke();
    const last = path[path.length - 1], prev = path[path.length - 2];
    const [px, py, w, hh] = tileRect(last.x, last.y);
    const cx = px + w / 2, cy = py + hh / 2, ang = Math.atan2(last.y - prev.y, last.x - prev.x), s = TW() * 0.28;
    ctx.fillStyle = 'rgba(255,240,200,.95)';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * s, cy + Math.sin(ang) * s);
    ctx.lineTo(cx + Math.cos(ang + 2.4) * s, cy + Math.sin(ang + 2.4) * s);
    ctx.lineTo(cx + Math.cos(ang - 2.4) * s, cy + Math.sin(ang - 2.4) * s);
    ctx.closePath(); ctx.fill();
  }

  function roundRect(x, y, w, hh, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shade(hex, f) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || ''); if (!m) return hex;
    const c = [1, 2, 3].map(i => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * f))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function teamColor(u) {
    if (u.team === 'enemy') return u.isBoss ? '#a3243f' : '#d9473d';
    if (u.team === 'ally') return '#2fa866';
    return '#3f7cf0';
  }

  function mapSpriteOf(u) {
    const meta = u.mapSprite && G.resources.characters[u.mapSprite];
    const img = meta && Render.readyImage(G.baseUrl, meta.image);
    return meta && img ? { meta, img } : null;
  }
  /** Couleurs d'une unité : placement › unité › classe › réglage du projet. */
  function colorMode(u) { return Palettes.resolveMode(u.colorsOverride, u.colors, G.settings.colors); }
  function battlerOf(u) {
    const meta = u.battler && G.resources.battlers[u.battler];
    return meta && Render.readyImage(G.baseUrl, meta.image) ? meta : null;
  }

  function drawUnit(u, t) {
    if (u.team === 'ally' && u.alpha > 0) {
      const [px, py, w, hh] = tileRect(u.rx + u.ox, u.ry + u.oy);
      ctx.globalAlpha = u.alpha * (u.done && G.phase === 'ally' ? 0.25 : 0.42);
      ctx.fillStyle = '#2fd37a'; ctx.fillRect(px + 1, py + 1, w - 2, hh - 2);
      ctx.globalAlpha = u.alpha; ctx.strokeStyle = 'rgba(160,255,190,.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 1.5, py + 1.5, w - 3, hh - 3);
      ctx.globalAlpha = 1;
    }
    const sp = mapSpriteOf(u);
    if (sp) return drawSpriteUnit(u, t, sp);
    const tw = TW(), th = TH();
    const bob = (!u.done && !G.busy) ? Math.sin(t / 380 + u.bob) * tw * 0.025 : 0;
    const x = (u.rx + u.ox) * tw - V.camX, y = (u.ry + u.oy) * th - V.camY + bob;
    const pad = tw * 0.13, w = tw - pad * 2, hh = th - pad * 2;
    ctx.globalAlpha = u.alpha;
    // ombre
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(x + tw / 2, y + th - pad * 0.7 - bob, w * 0.42, hh * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    let col = teamColor(u);
    if (u.done && u.team !== 'enemy') col = '#6d7180';
    const top = y + pad - hh * 0.02, bh = hh * 0.86;
    const grad = ctx.createLinearGradient(0, top, 0, top + bh);
    grad.addColorStop(0, shade(col, 1.25)); grad.addColorStop(1, shade(col, 0.72));
    ctx.fillStyle = grad;
    roundRect(x + pad, top, w, bh, Math.max(3, w * 0.24)); ctx.fill();
    ctx.lineWidth = Math.max(1.5, tw * 0.05);
    ctx.strokeStyle = u.isBoss ? '#f2c46a' : 'rgba(255,255,255,.9)';
    ctx.stroke();
    // initiale de la classe
    const c = cls(u);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(bh * 0.5)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((u.team === 'enemy' && c ? c.name : u.name).slice(0, 1).toUpperCase(), x + tw / 2, top + bh * 0.47);
    // seigneur / boss
    if (u.isLord || u.isBoss) {
      ctx.fillStyle = '#f2c46a';
      const cx = x + tw / 2, cy = top - tw * 0.02, s = tw * 0.12;
      ctx.beginPath(); ctx.moveTo(cx - s * 1.4, cy + s * 0.6); ctx.lineTo(cx - s * 1.4, cy - s * 0.5); ctx.lineTo(cx - s * 0.6, cy); ctx.lineTo(cx, cy - s * 0.9);
      ctx.lineTo(cx + s * 0.6, cy); ctx.lineTo(cx + s * 1.4, cy - s * 0.5); ctx.lineTo(cx + s * 1.4, cy + s * 0.6); ctx.closePath(); ctx.fill();
    }
    // barre de PV
    const hp = u.dispHp !== undefined ? u.dispHp : u.hp;
    const ratio = Math.max(0, hp / u.stats.hp);
    const bx = x + pad, by = top + bh + th * 0.03, bw = w, bhh = Math.max(3, th * 0.07);
    ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bhh + 2);
    ctx.fillStyle = ratio > 0.5 ? '#6bdc7a' : ratio > 0.25 ? '#f0c34a' : '#ef5a43';
    ctx.fillRect(bx, by, bw * ratio, bhh);
    if (u.flash > performance.now()) {
      ctx.globalAlpha = 0.75 * u.alpha; ctx.fillStyle = '#fff';
      roundRect(x + pad, top, w, bh, Math.max(3, w * 0.24)); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSpriteUnit(u, t, sp) {
    const tw = TW(), th = TH();
    const k = tw / (sp.meta.base || 16);
    const cx = (u.rx + u.ox) * tw - V.camX + tw / 2;
    const bottom = (u.ry + u.oy + 1) * th - V.camY;
    let anim = 'idle';
    if (u.walkDir) anim = u.walkDir;
    else if (G.sel === u && ['moving', 'menu', 'items', 'target', 'staff'].includes(G.ui)) anim = 'down';
    else if (controllable(u) && !G.busy && G.cursor.x === u.x && G.cursor.y === u.y && G.ui === 'idle') anim = 'focus';
    const done = u.done && G.phase === (u.team === 'ally' ? 'ally' : 'player') && u.team !== 'enemy';
    const palette = Palettes.paletteFor(u.team, colorMode(u), 'map', done);
    ctx.globalAlpha = u.alpha;
    if (u.flash > performance.now()) ctx.filter = 'brightness(5) saturate(0)';
    Sprites.drawMapSprite(ctx, sp.meta, sp.img, cx, bottom, k, { anim, t, palette });
    ctx.filter = 'none';
    // boss : petite couronne
    if (u.isBoss) {
      ctx.fillStyle = '#f2c46a'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      const x0 = cx + tw * 0.18, y0 = bottom - th * 0.98, s = tw * 0.09;
      ctx.beginPath(); ctx.moveTo(x0 - s * 1.4, y0 + s * 0.6); ctx.lineTo(x0 - s * 1.4, y0 - s * 0.5); ctx.lineTo(x0 - s * 0.6, y0); ctx.lineTo(x0, y0 - s * 0.9);
      ctx.lineTo(x0 + s * 0.6, y0); ctx.lineTo(x0 + s * 1.4, y0 - s * 0.5); ctx.lineTo(x0 + s * 1.4, y0 + s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // PV : seulement si l'unité est blessée
    const hp = u.dispHp !== undefined ? u.dispHp : u.hp;
    if (hp < u.stats.hp) {
      const ratio = Math.max(0, hp / u.stats.hp);
      const bw = tw * 0.62, bx = cx - bw / 2, by = bottom - Math.max(3, th * 0.07) - 1, bh = Math.max(3, th * 0.07);
      ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = ratio > 0.5 ? '#6bdc7a' : ratio > 0.25 ? '#f0c34a' : '#ef5a43';
      ctx.fillRect(bx, by, bw * ratio, bh);
    }
    ctx.globalAlpha = 1;
  }

  function drawCursor(t) {
    const [px, py, w, hh] = tileRect(G.cursor.x, G.cursor.y);
    const o = 2 + Math.sin(t / 180) * 2, l = w * 0.3;
    ctx.strokeStyle = '#f7d77a'; ctx.lineWidth = Math.max(2, w * 0.07); ctx.lineCap = 'square';
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [[px - o, py - o, 1, 1], [px + w + o, py - o, -1, 1], [px - o, py + hh + o, 1, -1], [px + w + o, py + hh + o, -1, -1]]) {
      ctx.moveTo(cx, cy + dy * l); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * l, cy);
    }
    ctx.stroke();
  }

  function float(x, y, text, color, big) { floats.push({ x, y, text, color: color || '#fff', t0: performance.now(), big }); }
  function drawFloats(t) {
    const now = performance.now();
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; const k = (now - f.t0) / 1000;
      if (k > 1) { floats.splice(i, 1); continue; }
      const [px, py, w] = tileRect(f.x, f.y);
      ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) * 5;
      ctx.font = `900 ${Math.round(TW() * (f.big ? 0.62 : 0.46))}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = py - TH() * 0.1 - k * TH() * 0.7;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(f.text, px + w / 2, yy);
      ctx.fillStyle = f.color; ctx.fillText(f.text, px + w / 2, yy);
    }
    ctx.globalAlpha = 1;
  }

  // =====================================================================
  // Fenêtres d'information
  // =====================================================================
  /** mode : 'mini' (fenêtres), 'bust' (cases carrées), 'main' (dialogues). */
  function portraitEl(u, mode) {
    const c = R.byId(G.db.units, u.sourceId);
    const src = (c && c.portrait) || u.portrait;
    const col = (u.team !== 'enemy' && ((c && c.color) || u.color)) || teamColor(u);
    const el = h('div', { class: 'portrait', style: { background: `linear-gradient(160deg, ${shade(col, 1.2)}, ${shade(col, 0.6)})` } });
    if (src) {
      const face = Faces.element(Render.readyImage(G.baseUrl, src), Render.imageUrl(G.baseUrl, src), mode || 'mini');
      if (face.face) el.classList.add('has-faceset', 'fs-' + (mode || 'mini'));
      el.append(face);
    } else el.textContent = u.name.slice(0, 1);
    return el;
  }
  function hpBar(u, hp) {
    const r = Math.max(0, (hp === undefined ? u.hp : hp) / u.stats.hp);
    return h('div', { class: 'hpbar' + (r <= 0.3 ? ' low' : '') }, h('i', { style: { width: (r * 100) + '%' } }));
  }

  let lastInfoKey = '';
  function updateInfo() {
    if (!G.map) return;
    if (G.mode === 'lobby') { $('#terrain-win').innerHTML = ''; $('#unit-win').className = 'win'; lastInfoKey = ''; return; }
    const c = G.cursor;
    const t = terrainAt(c.x, c.y);
    const tw = $('#terrain-win');
    const leftHalf = (c.x * TW() - V.camX) < V.w / 2;
    const topHalf = (c.y * TH() - V.camY) < V.h / 2;
    tw.classList.toggle('right', leftHalf && topHalf);
    tw.innerHTML = '';
    if (t) tw.append(...[h('div', { class: 't-name' }, t.name), h('div', { class: 't-row' }, h('span', {}, 'DÉF'), String(t.def)), h('div', { class: 't-row' }, h('span', {}, 'ESQ'), String(t.avoid)), t.heal ? h('div', { class: 't-row' }, h('span', {}, 'SOIN'), t.heal + '%') : null].filter(Boolean));

    const u = (G.ui === 'menu' || G.ui === 'items') && G.sel ? G.sel : unitAt(c.x, c.y);
    const uw = $('#unit-win');
    const k = u ? [u.uid, u.hp, u.level, u.exp, u.x, u.y, u.inventory.map(s => s.id + s.uses).join(),
      u.personalSkill, (u.learnedSkills || []).join(), (u.equippedSkills || []).join(), G.busy, G.over, leftHalf, topHalf].join('|') : '';
    if (k === lastInfoKey) return;
    lastInfoKey = k;
    uw.innerHTML = '';
    uw.className = 'win' + (u ? ' show' : '') + (u && u.team === 'enemy' ? ' enemy' : '') + (u && u.team === 'ally' ? ' ally' : '') + (u && leftHalf && !topHalf ? ' right' : '');
    if (!u) return;
    const eq = R.equipped(u, G.db);
    const cl = cls(u);
    const stats = [];
    for (const s of R.STATS.slice(1)) stats.push(h('div', {}, h('span', {}, R.STAT_LABELS[s] + ' '), String(u.stats[s])));
    stats.push(h('div', {}, h('span', {}, 'Dép '), String(u.mov)));
    uw.append(portraitEl(u), h('div', {},
      h('div', { class: 'u-name' }, u.name),
      h('div', { class: 'u-class' }, `${cl ? cl.name : ''} · Nv ${u.level}` + (u.team !== 'enemy' ? ` · EXP ${u.exp}` : '')),
      h('div', { class: 'u-hp' }, h('span', {}, `PV ${u.hp}/${u.stats.hp}`), hpBar(u)),
      h('div', { class: 'u-weapon' }, eq ? `⚔ ${eq.weapon.name} (${u.inventory[eq.index].uses || '∞'})` : (R.staves(u, G.db)[0] ? '✚ ' + R.staves(u, G.db)[0].weapon.name : '— sans arme —')),
      unitTags(u),
      (u.personalSkill || (u.learnedSkills || []).length) ? h('button', { class: 'u-skill-button', disabled: G.busy || G.over,
        onmousedown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); showUnitSkills(u); } },
        `Compétences (${(u.personalSkill ? 1 : 0) + (u.equippedSkills || []).length})`) : null,
      h('button', { class: 'u-evolution-button', disabled: G.busy || G.over, onmousedown: e => e.stopPropagation(),
        onclick: e => { e.stopPropagation(); showEvolution(u); } }, 'Évolution')),
    h('div', { class: 'u-stats' }, stats));
  }

  async function showUnitSkills(unit) {
    if (G.busy || G.over) return;
    G.busy = true;
    try {
      await UI.modal((box, close) => {
        box.classList.add('skill-details-modal');
        const catalogue = G.db.skills || [];
        const set = Skills.loadout(unit, catalogue);
        const card = (id, label) => {
          const skill = R.byId(catalogue, id);
          return h('div', { class: 'game-skill-card' }, h('b', {}, label + ' — ' + (skill ? `${skill.icon} ${skill.name}` : 'Libre')),
            skill ? h('p', {}, Skills.describe(skill)) : null);
        };
        box.append(h('h3', {}, 'Compétences de ' + unit.name),
          h('p', {}, 'La personnelle et les compétences équipées sont actives lorsque leurs conditions sont remplies. Les compétences du répertoire non équipées restent inactives.'),
          card(set.personalSkill, 'Personnelle (fixe)'));
        for (let i = 0; i < Skills.EQUIPPED_SLOTS; i++) box.append(card(set.equippedSkills[i], 'Emplacement ' + (i + 1)));
        const inactive = set.learnedSkills.filter(id => id !== set.personalSkill && !set.equippedSkills.includes(id));
        if (inactive.length) box.append(h('p', {}, 'Apprises, non équipées : ' + inactive.map(id => (R.byId(catalogue, id) || {}).name).join(', ')));
        box.append(h('div', { class: 'modal-actions' }, h('button', { class: 'primary', onclick: () => close() }, 'Fermer')));
      }, { wide: true, enter: close => close() });
    } finally { G.busy = false; }
  }

  /** Badges : allié, chef d'escouade, bonus du terrain occupé. */
  function unitTags(u) {
    const tags = [];
    if (u.team === 'ally') tags.push(h('span', { class: 'tag ally' }, u.control === 'ai' ? 'Allié (IA)' : 'Allié'));
    if (u.convoy) tags.push(h('span', { class: 'tag convoy' }, 'Chef d\'escouade · convoi'));
    if (u.team !== 'enemy') for (const t of supportTags(u)) tags.push(h('span', { class: 'tag support' }, '♥ ' + t));
    const t = terrainOf(u);
    if (t && (Number(t.avoid) || Number(t.def))) {
      const parts = [];
      if (Number(t.avoid)) parts.push(`Esq ${t.avoid > 0 ? '+' : ''}${t.avoid}`);
      if (Number(t.def)) parts.push(`Déf ${t.def > 0 ? '+' : ''}${t.def}`);
      tags.push(h('span', { class: 'tag terrain' }, `${t.name} : ${parts.join(' · ')}`));
    }
    return tags.length ? h('div', { class: 'u-tags' }, tags) : '';
  }

  function updateObjective() {
    const result = Mission.evaluate(G.chapter, G.db, G);
    const left = enemies().length + G.pending.length;
    $('#objective').innerHTML = '';
    $('#objective').append(h('div', { class: 'lbl' }, 'Victoire — ' + (G.chapter.victoryMode === 'any' ? 'au moins une condition' : 'toutes les conditions')),
      ...Mission.objectives(G.chapter).map((ob, i) => h('div', { class: 'obj' }, (result.progress[i] ? '✓ ' : '○ ') + Mission.label(ob, G.chapter))),
      h('div', { class: 'turn' }, `Tour ${G.turn} · Ennemis ${left} · ${G.campaign.mode === 'classic' ? 'Classique' : 'Détente'}`));
    const protectedNames = Mission.required(G.chapter, G.db).map(id => (R.byId(G.db.units, id) || {}).name || id);
    if (protectedNames.length) $('#objective').append(h('div', { class: 'turn' }, 'À protéger : ' + protectedNames.join(', ')));
    if (G.chapter.turnLimit) $('#objective').append(h('div', { class: 'turn' }, 'Limite : ' + G.chapter.turnLimit + ' tours complets'));
    if (G.chapter.lossLimit) $('#objective').append(h('div', { class: 'turn' }, 'Défaite à ' + G.chapter.lossLimit + ' perte(s)'));
    if (G.chapter.defendZone && G.chapter.defendZone.enabled) $('#objective').append(h('div', { class: 'turn' }, 'Protéger la zone rouge'));
    if (G.lobbyOn) $('#objective').append(h('div', { class: 'turn' }, `Or : ${(G.campaign.gold || 0).toLocaleString('fr-FR')}`));
  }

  // =====================================================================
  // Menus
  // =====================================================================
  function showMenu(items, anchor, mode) {
    G.menu = { items, index: Math.max(0, items.findIndex(i => !i.disabled)) };
    G.ui = mode;
    const el = $('#menu');
    el.classList.remove('hidden');
    renderMenu();
    // position à côté de l'unité
    const [px, py, w] = tileRect(anchor.x, anchor.y);
    const right = px + w + 12 + 170 < V.w;
    el.style.left = (right ? px + w + 12 : Math.max(8, px - 12 - el.offsetWidth)) + 'px';
    el.style.top = Math.max(8, Math.min(V.h - el.offsetHeight - 8, py - 10)) + 'px';
  }
  function renderMenu() {
    const el = $('#menu'); el.innerHTML = '';
    G.menu.items.forEach((it, i) => {
      const b = h('button', { class: (i === G.menu.index ? 'on' : '') + (it.disabled ? ' disabled' : '') }, it.label, it.sub ? h('small', {}, it.sub) : null);
      b.addEventListener('mouseenter', () => { if (!it.disabled) { G.menu.index = i; renderMenu(); } });
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.button === 0 && !it.disabled) it.action(); if (e.button === 2) cancel(); });
      el.append(b);
    });
  }
  function hideMenu() { $('#menu').classList.add('hidden'); G.menu = null; }
  function menuMove(d) {
    if (!G.menu) return;
    const n = G.menu.items.length; let i = G.menu.index;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!G.menu.items[i].disabled) break; }
    G.menu.index = i; renderMenu();
  }

  function openActionMenu() {
    const u = G.sel;
    const items = [];
    if (Mission.canSeize(G.chapter, G.db, u) && !G.seized.includes(key(u.x, u.y))) items.push({ label: 'Prendre', action: () => { hideMenu(); seize(u); } });
    const targets = attackTargetsFrom(u);
    if (targets.length) items.push({ label: 'Attaquer', action: () => openTargets(u, targets, 'target') });
    const heals = staffTargetsFrom(u);
    if (heals.length) items.push({ label: 'Bâton', action: () => openTargets(u, heals, 'staff') });
    const usable = u.inventory.map((s, i) => ({ s, i, it: iOf(s) })).filter(x => x.it);
    if (usable.length) items.push({ label: 'Objet', action: () => openItems(u) });
    if (Promotions.branches(cls(u), G.db).length) items.push({ label: 'Promotion', action: () => openPromotion(u) });
    if (u.inventory.length > 1 && R.attackWeapons(u, G.db).length > 1) items.push({ label: 'Équiper', action: () => openEquip(u) });
    const sups = supportsAvailable(u);
    if (sups.length) items.push({ label: 'Soutien', sub: sups.map(x => x.other.name).join(', '), action: () => {
      if (sups.length === 1) return doSupport(u, sups[0]);
      hideMenu();
      showMenu(sups.map(x => ({ label: x.other.name, sub: 'rang ' + R.SUPPORT_RANKS[x.next], action: () => doSupport(u, x) })), u, 'items');
    } });
    if (canUseConvoy(u)) items.push({ label: 'Convoi', sub: u.convoy ? '' : 'via ' + convoyLeader().name, action: () => openConvoy(u) });
    items.push({ label: 'Attendre', action: () => { hideMenu(); finishAction(u); } });
    showMenu(items, u, 'menu');
  }

  // ---------- convoi ----------
  function convoyLeader() { return team('player').find(u => u.convoy) || null; }
  function canUseConvoy(u) {
    if (u.team !== 'player') return false;
    const lead = convoyLeader();
    if (!lead) return false;
    return lead === u || R.dist(lead, u) === 1;
  }
  function openConvoy(u) {
    hideMenu();
    G.ui = 'convoy';
    const el = $('#convoy');
    const label = (slot) => { const e = R.getEntry(G.db, slot.id); return e ? e.def.name : slot.id; };
    const kind = (slot) => { const e = R.getEntry(G.db, slot.id); return e && e.kind === 'weapon' ? (R.WEAPON_TYPES.find(t => t.id === e.def.type) || {}).name : 'Objet'; };
    const render = () => {
      el.innerHTML = '';
      const inv = h('div', { class: 'cv-col' }, h('h4', {}, `${u.name} — ${u.inventory.length}/5`),
        u.inventory.length ? u.inventory.map((slot, i) => h('button', { class: 'cv-item', disabled: G.convoy.length >= G.convoyCap,
          onmousedown: (e) => { e.stopPropagation(); G.convoy.push(u.inventory.splice(i, 1)[0]); lastInfoKey = ''; render(); } },
          h('span', {}, label(slot)), h('small', {}, `${kind(slot)} · ${slot.uses || '∞'}`), h('b', {}, 'Déposer →'))) : h('p', { class: 'cv-empty' }, 'Inventaire vide'));
      const list = G.convoy.map((slot, i) => ({ slot, i })).sort((a, b) => kind(a.slot).localeCompare(kind(b.slot)) || label(a.slot).localeCompare(label(b.slot)));
      const conv = h('div', { class: 'cv-col' }, h('h4', {}, `Convoi — ${G.convoy.length}/${G.convoyCap}`),
        h('div', { class: 'cv-scroll' }, list.length ? list.map(({ slot, i }) => h('button', { class: 'cv-item', disabled: u.inventory.length >= 5,
          onmousedown: (e) => { e.stopPropagation(); u.inventory.push(G.convoy.splice(i, 1)[0]); lastInfoKey = ''; render(); } },
          h('b', {}, '← Retirer'), h('span', {}, label(slot)), h('small', {}, `${kind(slot)} · ${slot.uses || '∞'}`))) : h('p', { class: 'cv-empty' }, 'Le convoi est vide')));
      el.append(h('div', { class: 'cv-head' }, h('h3', {}, 'Convoi'), h('span', {}, u.convoy ? 'Chef d\'escouade' : 'Adjacent à ' + convoyLeader().name)),
        h('div', { class: 'cv-cols' }, inv, conv),
        h('div', { class: 'cv-foot' }, h('button', { onmousedown: (e) => { e.stopPropagation(); closeConvoy(); } }, 'Retour (X)')));
    };
    render();
    el.classList.remove('hidden');
  }
  function closeConvoy() {
    $('#convoy').classList.add('hidden');
    G.ui = 'menu';
    lastInfoKey = '';
    openActionMenu();
  }

  function openItems(u) {
    hideMenu();
    const items = u.inventory.map((slot, i) => {
      const it = iOf(slot), w = wOf(slot);
      if (it) {
        if (it.effect === 'promotion') {
          const choices = Promotions.options(u, G.db, i), available = choices.some(o => o.available);
          return { label: it.name, sub: available ? `${slot.uses} · choisir une promotion` : choices.length ? choices[0].reasons.join(' ') : 'Aucune branche ne demande cet objet.',
            disabled: !available, action: () => openPromotion(u, i) };
        }
        const disabled = it.effect === 'heal' && u.hp >= u.stats.hp;
        return { label: it.name, sub: `${slot.uses}`, disabled, action: () => { hideMenu(); useItem(u, i); } };
      }
      return { label: w ? w.name : slot.id, sub: w ? `${slot.uses || '∞'}` : '', disabled: true, action: () => {} };
    });
    showMenu(items, u, 'items');
  }
  function openEquip(u) {
    hideMenu();
    const items = R.attackWeapons(u, G.db).map(w => ({ label: w.weapon.name, sub: `${u.inventory[w.index].uses || '∞'}`, action: () => { R.equip(u, w.index); hideMenu(); lastInfoKey = ''; openActionMenu(); } }));
    showMenu(items, u, 'items');
  }

  const weaponNames = cl => (cl.weapons || []).map(id => (R.WEAPON_TYPES.find(t => t.id === id) || {}).name || id).join(', ');
  function classSummary(cl) {
    if (!cl) return 'Classe introuvable.';
    return `${cl.description || ''}\nDéplacement : ${cl.mov} (${(R.MOVE_TYPES.find(t => t.id === cl.moveType) || {}).name || cl.moveType}). Armes : ${weaponNames(cl)}.\nPlafonds : ` +
      R.STATS.map(key => `${R.STAT_LABELS[key]} ${(cl.caps || {})[key] || 99}`).join(' · ');
  }
  async function showEvolution(unit) {
    const wasBusy = G.busy; G.busy = true;
    try {
      await UI.modal((box, close) => {
        box.classList.add('promotion-tree-modal');
        const info = h('p', { class: 'promotion-class-info' }, classSummary(cls(unit)));
        box.append(h('h3', {}, 'Évolution de ' + unit.name), h('p', {}, 'La classe actuelle est encadrée en or. Clique sur une classe ou un lien pour consulter ses détails.'),
          PromotionUI.graph(G.db, { rootId: unit.classId, currentId: unit.classId,
            onClass: cl => { info.textContent = cl.name + '\n' + classSummary(cl); },
            onEdge: edge => {
              const target = R.byId(G.db.classes, edge.to), item = R.byId(G.db.items, edge.row.itemId);
              info.textContent = `${(R.byId(G.db.classes, edge.from) || {}).name} → ${target.name}\nNiveau ${edge.row.minLevel} requis. ` +
                (item ? item.name + ' requis dans l’inventaire.' : 'Sans objet.') + '\n' + classSummary(target);
            } }), info, h('div', { class: 'modal-actions' }, h('button', { onclick: () => close() }, 'Fermer')));
      }, { wide: true });
    } finally { G.busy = wasBusy; }
  }
  async function openPromotion(unit, itemIndex) {
    hideMenu(); G.busy = true; G.ui = 'promotion';
    let completed = false;
    try {
      const options = Promotions.options(unit, G.db, itemIndex);
      const destination = await UI.modal((box, close) => {
        box.classList.add('promotion-choices');
        box.append(h('h3', {}, 'Promotion de ' + unit.name), h('p', {}, 'Compare les branches avant de confirmer. La promotion consomme l’action de cette unité.'),
          h('button', { onclick: () => showEvolution(unit) }, 'Voir l’arbre d’évolution'));
        for (const option of options) {
          const target = option.target, preview = Promotions.preview(unit, option, G.db);
          const item = R.byId(G.db.items, option.row.itemId);
          const character = R.byId(G.db.units, unit.sourceId) || {};
          const grants = preview ? [...new Set([...option.row.skills, ...Skills.combinedLearning(character, target, preview.level, G.db.skills).map(row => row.skillId)])]
            .filter(id => id !== unit.personalSkill && !unit.learnedSkills.includes(id)) : [];
          const button = h('button', { class: 'choice', disabled: !option.available, 'data-promote-to': option.row.classId, onclick: () => close(option.row.classId) },
            h('b', {}, target ? target.name : 'Classe introuvable'));
          if (preview) {
            if (target.description) button.append(h('p', {}, target.description));
            button.append(h('p', {}, R.STATS.map(key => `${R.STAT_LABELS[key]} ${unit.stats[key]} → ${preview.stats[key]} (+${preview.gains[key]})`).join(' · ')),
              h('p', {}, `Dép ${unit.mov} → ${preview.mov} · ${(R.MOVE_TYPES.find(t => t.id === target.moveType) || {}).name || target.moveType} · Armes : ${weaponNames(target)}`),
              h('p', {}, 'Plafonds : ' + R.STATS.map(key => `${R.STAT_LABELS[key]} ${(target.caps || {})[key] || 99}`).join(' · ')),
              h('p', {}, `Niveau ${unit.level} → ${preview.level} · ` + (option.row.resetLevel ? 'EXP remise à 0.' : 'EXP conservée.') + ' ' + (item ? `Coût : 1 utilisation de ${item.name}.` : 'Sans objet.')),
              h('p', {}, 'Compétences nouvelles : ' + (grants.map(id => (R.byId(G.db.skills, id) || {}).name || id).join(', ') || 'aucune')));
            const lost = unit.inventory.map(slot => wOf(slot)).filter(weapon => weapon && !(target.weapons || []).includes(weapon.type));
            if (lost.length) button.append(h('p', {}, 'Conservées mais inutilisables dans cette classe : ' + lost.map(w => w.name).join(', ')));
          }
          if (option.reasons.length) button.append(h('p', { class: 'promotion-lock' }, option.reasons.join(' ')));
          box.append(button);
        }
        if (!options.length) box.append(h('p', {}, 'Aucune promotion avec ces conditions.'));
        box.append(h('div', { class: 'modal-actions' }, h('button', { onclick: () => close(null) }, 'Annuler')));
      }, { wide: true });
      if (!destination) return;
      const option = options.find(o => o.row.classId === destination), item = R.byId(G.db.items, option.row.itemId);
      if (!(await UI.confirm(`Promouvoir ${unit.name} en ${option.target.name} ? ` + (item ? `Une utilisation de ${item.name} sera consommée. ` : '') + 'Cette action termine son tour.', { title: 'Confirmer la promotion', ok: 'Promouvoir' }))) return;
      const result = Promotions.apply(unit, destination, G.db, itemIndex);
      if (!result.ok) { await UI.alert('Promotion impossible', result.error); return; }
      completed = true; lastInfoKey = ''; refreshDanger();
      Music.me('levelUp');
      await UI.alert('Promotion réussie !', `${unit.name} devient ${result.target.name}.\n` +
        R.STATS.filter(key => result.gains[key]).map(key => `${R.STAT_LABELS[key]} +${result.gains[key]}`).join(' · '));
      for (const id of result.learnedSkills) await announceLearning(unit, id);
    } finally {
      G.busy = false;
      if (completed) await finishAction(unit);
      else { G.ui = 'menu'; openActionMenu(); }
    }
  }

  function openMapMenu() {
    const pending = alive().filter(controllable).length;
    showMenu([
      { label: G.phase === 'ally' ? 'Fin de la phase alliée' : 'Fin du tour', sub: pending ? `${pending} unité(s) libres` : '', action: () => { hideMenu(); G.ui = 'idle'; endCurrentPhase(); } },
      { label: 'Musique', sub: Music.muted ? 'coupée' : 'activée', action: () => { Music.toggleMute(); hideMenu(); G.ui = 'idle'; } },
      { label: 'Zone de danger', sub: G.danger ? 'activée' : 'désactivée', action: () => { toggleDanger(); hideMenu(); G.ui = 'idle'; } },
      { label: G.fast ? 'Vitesse normale' : 'Vitesse rapide', action: () => { G.fast = !G.fast; hideMenu(); G.ui = 'idle'; } },
      { label: 'Animations de combat', sub: G.settings.battleAnims !== false ? 'oui' : 'non', action: () => { G.settings.battleAnims = G.settings.battleAnims === false; hideMenu(); G.ui = 'idle'; UI.toast('Animations de combat : ' + (G.settings.battleAnims ? 'oui' : 'non')); } },
      { label: 'Sauvegarder', sub: 'début du chapitre', action: () => { hideMenu(); G.ui = 'idle'; saveCheckpoint(); } },
      { label: 'Recommencer', action: () => { hideMenu(); G.ui = 'idle'; restartChapter(); } },
      G.lobbyOn ? { label: 'Retour au camp', sub: 'abandonner le chapitre', action: () => { hideMenu(); G.ui = 'idle'; retreatToLobby(); } } : null,
      { label: 'Quitter le test', action: () => window.close() }
    ].filter(Boolean), G.cursor, 'mapmenu');
  }

  function toggleDanger() {
    G.danger = !G.danger;
    refreshDanger();
    UI.toast(G.danger ? 'Zone de danger affichée' : 'Zone de danger masquée');
  }
  function refreshDanger() {
    if (!G.danger) { G.dangerSet = null; return; }
    const set = new Set();
    for (const e of enemies()) for (const k of R.threatTiles(e, rctx(), G.db, e.ai === 'stationary')) set.add(k);
    G.dangerSet = set;
  }

  // =====================================================================
  // Sélection, déplacement, ciblage
  // =====================================================================
  function select(u) {
    G.sel = u; G.origin = { x: u.x, y: u.y };
    G.reach = R.reachable(u, rctx());
    const stops = [...G.reach.values()].filter(n => n.canStop);
    const blue = new Set([...G.reach.values()].map(n => key(n.x, n.y)));
    const atk = new Set(), heal = new Set();
    const ar = rangesFor(u, R.attackWeapons(u, G.db));
    const sr = rangesFor(u, R.staves(u, G.db));
    for (const s of stops) {
      if (ar) for (const t of R.tilesInRange(s.x, s.y, ar.min, ar.max, rctx())) { const k = key(t.x, t.y); if (!blue.has(k)) atk.add(k); }
      if (sr && !ar) for (const t of R.tilesInRange(s.x, s.y, sr.min, sr.max, rctx())) { const k = key(t.x, t.y); if (!blue.has(k)) heal.add(k); }
    }
    G.atk = atk; G.staffRange = heal;
    G.ui = 'moving';
    G.enemyView = null;
  }
  function deselect() { G.sel = null; G.reach = null; G.atk = null; G.staffRange = null; G.ui = 'idle'; }

  async function moveSelectedTo(n) {
    const u = G.sel;
    const path = R.pathTo(G.reach, n.x, n.y);
    G.busy = true;
    await animateMove(u, path);
    G.busy = false;
    openActionMenu();
  }

  async function animateMove(u, path) {
    if (!path || path.length < 2) return;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      u.walkDir = b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y > a.y ? 'down' : 'up';
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        u.rx = a.x + (b.x - a.x) * s / steps; u.ry = a.y + (b.y - a.y) * s / steps;
        await sleep(13);
      }
      focus(b.x, b.y);
    }
    const end = path[path.length - 1];
    u.x = end.x; u.y = end.y; u.rx = u.x; u.ry = u.y;
    u.walkDir = null;
  }

  function openTargets(u, list, mode) {
    hideMenu();
    G.targets = list; G.tIndex = 0; G.ui = mode;
    setCursor(list[0].x, list[0].y);
    if (mode === 'target') showForecast();
  }

  function currentTarget() {
    const t = G.targets.find(x => x.x === G.cursor.x && x.y === G.cursor.y);
    return t || null;
  }

  function weaponsFor(u, t) {
    const d = R.dist(u, t);
    return R.attackWeapons(u, G.db).filter(w => d >= (w.weapon.minRange || 1) && d <= (w.weapon.maxRange || 1));
  }

  function showForecast() {
    const el = $('#forecast');
    const t = currentTarget();
    if (!t) { el.classList.add('hidden'); return; }
    const u = G.sel;
    const ws = weaponsFor(u, t);
    if (!G.wList.length || G.wList.target !== t) { G.wList = ws; G.wList.target = t; G.wIndex = 0; }
    const w = G.wList[G.wIndex];
    const fc = R.forecast(u, w.index, t, ropts());
    const tri = (v) => v > 0 ? h('span', { class: 'tri-up' }, ' ▲') : v < 0 ? h('span', { class: 'tri-down' }, ' ▼') : null;
    const side = (unit, s, weapon, cl) => h('div', { class: 'fc-side ' + cl },
      h('div', { class: 'fc-name' }, unit.name),
      h('div', { class: 'fc-weap' }, weapon ? weapon.name : '—', s ? tri(s.tri) : null, s && s.effective ? h('span', { class: 'x2' }, ' ✦') : null),
      h('div', { class: 'fc-val' },
        h('div', {}, String(unit.hp)),
        h('div', {}, s ? String(s.dmg) : '--', s && s.count > 1 ? h('span', { class: 'x2' }, '×2') : null),
        h('div', {}, s ? String(s.hit) : '--'),
        h('div', {}, s ? String(s.crit) : '--')));
    const duo = R.supportDual(u, players(), G.sup, G.db);
    const sp = specialOf(u);
    const extra = [];
    if (fc.att.bonus) extra.push(h('div', {}, '♥ Bonus d\'affinité actif'));
    if (sp) extra.push(h('div', {}, `★ ${sp.name} (${sp.chance} %)`));
    if (duo) extra.push(h('div', {}, `⚔ Attaque duo avec ${duo.partner.name} : ${duo.name} (${duo.chance} %)`));
    const skillExtras = (unit, st, skills, aura) => {
      const passive = skills.filter(skill => ['hit', 'avoid', 'damage', 'guard'].includes(skill.effect));
      if (aura) passive.push(aura);
      if (passive.length) extra.push(h('div', { class: 'fc-skills' }, `${unit.name} : ` + passive.map(skill => `${skill.icon} ${skill.name}`).join(' · ')));
      const procs = skills.filter(skill => ['luna', 'sol', 'miracle'].includes(skill.effect));
      if (procs.length) extra.push(h('div', { class: 'fc-skills' }, `${unit.name} — ` + procs.map(skill => {
        const variant = st && st.procs.find(p => p.id === skill.id);
        return `${skill.icon} ${skill.name} ${skill.chance} %` + (skill.effect === 'luna' && variant ? ` → ${variant.dmg} DGT` : '');
      }).join(' · ')));
    };
    skillExtras(u, fc.att, fc.att.skills, fc.att.aura);
    skillExtras(t, fc.def, fc.defSkills, fc.defAura);
    if (fc.vantage) extra.push(h('div', { class: 'fc-skills' }, `${fc.vantage.icon} ${fc.vantage.name} : ${t.name} riposte en premier`));
    if ([...fc.att.skills, ...fc.defSkills].some(skill => ['luna', 'sol', 'miracle'].includes(skill.effect)))
      extra.push(h('div', { class: 'fc-skill-note' }, 'DGT hors déclenchements. Un seul effet offensif par coup : affinité, puis Luna, puis Sol.'));
    el.innerHTML = '';
    el.append(
      extra.length ? h('div', { class: 'fc-extra' }, extra) : '',
      h('div', { class: 'fc-grid' },
        side(u, fc.att, fc.att.weapon, 'p'),
        h('div', { class: 'fc-labels' }, h('div', {}, ' '), h('div', {}, ' '), h('div', {}, 'PV'), h('div', {}, 'DGT'), h('div', {}, 'PRÉC'), h('div', {}, 'CRIT')),
        side(t, fc.def, fc.def ? fc.def.weapon : null, 'e')),
      h('div', { class: 'fc-actions' },
        G.wList.length > 1 ? h('button', { onmousedown: (e) => { e.stopPropagation(); cycleWeapon(1); } }, '⇄ Arme') : null,
        h('button', { onmousedown: (e) => { e.stopPropagation(); cancel(); } }, 'Retour'),
        h('button', { class: 'go', onmousedown: (e) => { e.stopPropagation(); confirm(); } }, 'Attaquer')));
    el.classList.remove('hidden');
    const [px, py, tw] = tileRect(t.x, t.y);
    const right = px + tw + 16 + el.offsetWidth < V.w;
    el.style.left = (right ? px + tw + 16 : Math.max(8, px - 16 - el.offsetWidth)) + 'px';
    el.style.top = Math.max(8, Math.min(V.h - el.offsetHeight - 8, py - el.offsetHeight / 2)) + 'px';
  }
  function cycleWeapon(d) { if (G.wList.length < 2) return; G.wIndex = (G.wIndex + d + G.wList.length) % G.wList.length; showForecast(); }
  function hideForecast() { $('#forecast').classList.add('hidden'); G.wList = []; }

  // =====================================================================
  // Actions
  // =====================================================================
  async function attack(u, t) {
    const w = G.wList[G.wIndex] || weaponsFor(u, t)[0];
    hideForecast();
    R.equip(u, w.index);
    G.busy = true; G.ui = 'busy';
    await runCombat(u, 0, t);
    G.busy = false;
    await finishAction(u);
  }

  async function heal(u, t) {
    const st = R.staves(u, G.db).find(s => { const d = R.dist(u, t); return d >= (s.weapon.minRange || 1) && d <= (s.weapon.maxRange || 1); });
    if (!st) return;
    G.busy = true; G.ui = 'busy';
    const amount = (st.weapon.heal || 10) + u.stats.mag;
    const before = t.hp;
    await lunge(u, t);
    t.hp = Math.min(t.stats.hp, t.hp + amount);
    float(t.x, t.y, '+' + (t.hp - before), '#7dffa8');
    const slot = u.inventory[st.index];
    if (slot.uses > 0) { slot.uses--; if (!slot.uses) { u.inventory.splice(st.index, 1); float(u.x, u.y, 'Bâton brisé', '#ffb36b'); } }
    await sleep(500);
    if (u.team !== 'enemy') await grantExp(u, R.staffExp(u, G.db));
    G.busy = false;
    await finishAction(u);
  }

  async function useItem(u, index) {
    const slot = u.inventory[index]; const it = iOf(slot); if (!it) return;
    G.busy = true;
    if (it.effect === 'heal') {
      const before = u.hp; u.hp = Math.min(u.stats.hp, u.hp + (it.amount || 10));
      float(u.x, u.y, '+' + (u.hp - before), '#7dffa8');
    } else {
      if (it.stat === 'mov') u.mov += it.amount; else { u.stats[it.stat] += it.amount; if (it.stat === 'hp') u.hp += it.amount; }
      float(u.x, u.y, `${R.STAT_LABELS[it.stat] || it.stat} +${it.amount}`, '#f2d58a');
    }
    slot.uses--; if (slot.uses <= 0) u.inventory.splice(index, 1);
    await sleep(600);
    G.busy = false;
    await finishAction(u);
  }

  async function seize(u) {
    G.busy = true;
    float(u.x, u.y, 'Point pris !', '#f2d58a', true);
    await sleep(700);
    G.seized.push(key(u.x, u.y));
    G.busy = false;
    await finishAction(u);
  }

  async function finishAction(u) {
    u.done = true;
    deselect();
    lastInfoKey = '';
    await areaEvents(u);
    refreshDanger();
    if (await checkEnd()) return;
    if (!alive().some(controllable)) await endCurrentPhase();
  }

  async function endCurrentPhase() {
    if (G.over) return;
    if (G.phase === 'player') { adjacencyGains(); return startAllyPhase(); }
    if (G.phase === 'ally') return endPlayerPhase();
  }

  // =====================================================================
  // Combat
  // =====================================================================
  async function lunge(a, b) {
    const dx = Math.sign(b.x - a.x) * 0.28, dy = Math.sign(b.y - a.y) * 0.28;
    for (let i = 1; i <= 5; i++) { a.ox = dx * i / 5; a.oy = dy * i / 5; await sleep(14); }
    for (let i = 4; i >= 0; i--) { a.ox = dx * i / 5; a.oy = dy * i / 5; await sleep(18); }
  }

  function combatHud(a, b) {
    const el = $('#combat-hud'); el.innerHTML = '';
    const side = (u) => h('div', { class: 'win side ' + (u.team === 'enemy' ? 'e' : 'p') },
      h('div', { class: 'u-name' }, u.name),
      h('div', { class: 'u-hp' }, h('span', {}, `${u.dispHp}`), hpBar(u, u.dispHp)));
    const p = a.team === 'enemy' ? b : a, e = a.team === 'enemy' ? a : b;
    el.append(side(p), side(e));
    el.classList.remove('hidden');
  }

  async function runCombat(att, aIndex, def) {
    const hp0 = { [att.uid]: att.hp, [def.uid]: def.hp };
    const wAtt = wOf(att.inventory[aIndex]);
    const eqDef = R.equipped(def, G.db); const wDef = eqDef ? eqDef.weapon : null;
    const distance = R.dist(att, def);
    focus(def.x, def.y);
    const dual = att.team !== 'enemy' ? R.supportDual(att, players(), G.sup, G.db) : null;
    if (dual) hp0[dual.partner.uid] = dual.partner.hp;
    const res = R.resolveCombat(att, aIndex, def, { ...ropts(), rng: Math.random, specialOf, dual });
    const animate = G.settings.battleAnims !== false && battlerOf(att) && battlerOf(def);
    if (animate) {
      document.body.classList.add('in-battle');
      await BattleScene.play({
        baseUrl: G.baseUrl, battlerOf, att, def, hp0, strikes: res.strikes, forecast: res.forecast, distance,
        paletteOf: (u) => Palettes.paletteFor(u.team, colorMode(u), 'battle', false),
        partner: res.duo ? res.duo.partner : null,
        weaponOf: (u) => (u === att ? wAtt : wDef), terrainOf, background: base,
        projectileImg: (meta, name) => meta.projectiles && meta.projectiles[name] ? Render.readyImage(G.baseUrl, meta.projectiles[name]) : null
      });
      document.body.classList.remove('in-battle');
      lastInfoKey = '';
      for (const u of [att, def]) if (u.hp <= 0) await killUnit(u, true);
    } else {
      att.dispHp = hp0[att.uid]; def.dispHp = hp0[def.uid];
      combatHud(att, def);
      await sleep(250);
      const byUid = (id) => (id === att.uid ? att : id === def.uid ? def : res.duo.partner);
      for (const s of res.strikes) {
        const src = byUid(s.by), tgt = byUid(s.target);
        if (s.special) { float(src.x, src.y - 0.5, s.special, '#ff9ecb', true); await sleep(350); }
        if (s.dual) { float(src.x, src.y - 0.5, s.dual, '#ff9ecb', true); await sleep(350); }
        for (const skill of s.skills) {
          const owner = byUid(skill.by);
          float(owner.x, owner.y - 0.5, `${skill.icon} ${skill.name}`, '#f2d58a', true);
        }
        if (s.skills.length) await sleep(350);
        await lunge(src, tgt);
        if (s.hit) {
          tgt.flash = performance.now() + 120;
          tgt.dispHp = s.hpAfter;
          if (s.crit) { V.shake = 14; float(tgt.x, tgt.y, `Critique ! ${s.dmg}`, '#ffd24a', true); }
          else float(tgt.x, tgt.y, s.dmg ? String(s.dmg) : 'Aucun dégât', s.dmg ? '#ffffff' : '#bbbbbb');
        } else float(tgt.x, tgt.y, 'Raté', '#9ad0ff');
        if (s.heal) { src.dispHp = s.srcHpAfter; float(src.x, src.y, '+' + s.heal, '#7dffa8'); }
        if (s.broke) float(src.x, src.y - 0.4, 'Arme brisée !', '#ffb36b');
        combatHud(att, def);
        await sleep(420);
      }
      await sleep(250);
      $('#combat-hud').classList.add('hidden');
      delete att.dispHp; delete def.dispHp;
      lastInfoKey = '';
      for (const u of [att, def]) if (u.hp <= 0) await killUnit(u);
    }

    // affinités : combattre à côté de son partenaire rapproche
    for (const u of [att, def]) {
      if (u.team === 'enemy' || u.hp <= 0) continue;
      for (const p of R.partnersOf(u, G.sup)) {
        const o = unitById(p.id);
        if (o && R.dist(o, u) === 1) gainSupport(u, o, Number(G.supCfg.gainCombat) || 0);
      }
    }
    if (res.duo && res.duo.partner.hp > 0) gainSupport(att, res.duo.partner, Number(G.supCfg.gainCombat) || 0);

    // expérience
    const pl = att.team !== 'enemy' ? att : def.team !== 'enemy' ? def : null;
    if (pl && pl.hp > 0) {
      const foe = pl === att ? def : att;
      const side = pl === att ? 'a' : 'd';
      const xp = R.combatExp(pl, foe, res.dealt[side], foe.hp <= 0, G.db);
      await grantExp(pl, xp);
    }
    if (res.duo && res.duo.partner.hp > 0 && res.duo.partner.team !== 'enemy') {
      const last = res.strikes[res.strikes.length - 1];
      await grantExp(res.duo.partner, R.combatExp(res.duo.partner, def, res.duo.dmg > 0, def.hp <= 0 && last && last.dual, G.db));
    }
    return res;
  }

  async function grantExp(u, xp) {
    if (u.level >= G.settings.maxLevel) return;
    float(u.x, u.y, `+${xp} EXP`, '#c5a7ff');
    const ups = R.gainExp(u, xp, G.db, Math.random, G.settings);
    await sleep(500);
    for (const up of ups) {
      Music.me('levelUp'); await showLevelUp(u, up);
      for (const id of up.learnedSkills) await announceLearning(u, id);
    }
  }

  async function announceLearning(unit, id) {
    const skill = R.byId(G.db.skills || [], id);
    if (!skill) return;
    const body = `${unit.name} apprend ${skill.icon} ${skill.name} !\n${Skills.describe(skill)}`;
    if (Skills.equipLearned(unit, id)) {
      await UI.alert('Compétence apprise !', body + '\n\nElle est équipée dans un emplacement libre.');
    } else if (unit.equippedSkills.includes(id) || unit.personalSkill === id) {
      await UI.alert('Compétence apprise !', body);
    } else {
      const choice = await UI.choose('Compétence apprise !', [
        { value: 'keep', label: 'Garder dans le répertoire', desc: 'Conserver les cinq compétences actuellement équipées.' },
        ...unit.equippedSkills.map((oldId, index) => ({ value: String(index),
          label: 'Remplacer ' + ((R.byId(G.db.skills, oldId) || {}).name || oldId),
          desc: 'Emplacement ' + (index + 1) + ' — l’ancienne compétence restera apprise.' }))
      ], body + '\n\nLes cinq emplacements sont occupés. La personnelle reste fixe.', { wide: true, cancelLabel: 'Garder sans équiper' });
      if (choice !== null && choice !== 'keep') Skills.equipLearned(unit, id, Number(choice));
    }
    lastInfoKey = '';
  }

  async function killUnit(u, instant) {
    if (instant) u.alpha = 0;
    else for (let i = 10; i >= 0; i--) { u.alpha = i / 10; await sleep(35); }
    u.dead = true;
    if (u.team === 'enemy' && u.gold > 0) {
      G.campaign.gold = (G.campaign.gold || 0) + u.gold;
      float(u.x, u.y, `+${u.gold} or`, '#f2d58a', true);
      updateObjective();
    }
    if (u.team === 'player') G.lost.push(u.name);
    if (u.team === 'ally') float(u.x, u.y, 'Allié perdu', '#9be59b');
    await runEvents('death', { unit: u });
    if (u.team !== 'enemy' && !Campaign.permanent(G.campaign, u)) float(u.x, u.y, 'Retraite — retour au prochain chapitre', '#9be59b');
  }

  function showLevelUp(u, up) {
    return new Promise((resolve) => {
      const el = $('#levelup'); el.innerHTML = '';
      const rows = R.STATS.map(k => {
        const plus = h('span', { class: 'plus' }, up.gains[k] ? '+' + up.gains[k] : '');
        return { k, plus, el: h('div', { class: 'lv-row' }, h('span', {}, R.STAT_LABELS[k]), h('b', {}, String(u.stats[k]), plus)) };
      });
      el.append(h('h3', {}, `NIVEAU ${up.level} !`), h('div', { class: 'u-class', style: { textAlign: 'center', marginBottom: '8px' } }, u.name), h('div', { class: 'lv-grid' }, rows.map(r => r.el)));
      el.classList.remove('hidden');
      let i = 0;
      const tick = setInterval(() => { if (i >= rows.length) { clearInterval(tick); return; } if (rows[i].plus.textContent) rows[i].plus.classList.add('show'); i++; }, 110);
      const done = () => { clearInterval(tick); el.classList.add('hidden'); G.waitClick = null; resolve(); };
      setTimeout(() => { G.waitClick = done; }, 500);
      setTimeout(() => { if (G.waitClick === done) done(); }, 3200 / (G.fast ? 2 : 1));
    });
  }

  // =====================================================================
  // Tours et phases
  // =====================================================================
  function banner(text, cls) {
    const el = $('#banner');
    el.className = cls || '';
    el.innerHTML = ''; el.append(h('span', {}, text));
    return sleep(1150).then(() => el.classList.add('hidden'));
  }

  async function startChapter() {
    updateObjective();
    G.busy = true;
    await banner(G.chapter.name, 'ally');
    await runEvents('start', {});
    G.busy = false;
    await startPlayerPhase(true);
  }

  async function startPlayerPhase(first) {
    if (G.over) return;
    if (await checkEnd()) return;
    G.phase = 'player'; G.busy = true;
    updateObjective();
    Music.bgm('playerPhase');
    await banner('Phase joueur', '');
    for (const u of players()) u.done = false;
    await skillRecovery(team('player'));
    await terrainHeal(team('player'));
    await runEvents('turn', { turn: G.turn });
    if (await checkEnd()) return;
    G.busy = false; G.ui = 'idle';
    refreshDanger();
    const lord = team('player').find(u => u.isLord) || team('player')[0];
    if (lord && first) setCursor(lord.x, lord.y);
  }

  /** Phase alliée (unités vertes) : les alliés en IA jouent seuls, les alliés « jouables » sont commandés par le joueur. */
  async function startAllyPhase() {
    if (G.over || G.phase !== 'player') return;
    deselect(); hideMenu(); hideForecast();
    const allies = team('ally');
    if (!allies.length) return endPlayerPhase(true);
    G.phase = 'ally'; G.busy = true;
    Music.bgm('allyPhase');
    await banner('Phase alliée', 'ally');
    for (const u of allies) u.done = false;
    await skillRecovery(allies);
    await terrainHeal(allies);
    if (await aiTurn(allies.filter(u => u.control === 'ai'), () => team('enemy'))) return;
    G.busy = false; G.ui = 'idle';
    const first = alive().find(controllable);
    if (!first) return endPlayerPhase(true);
    setCursor(first.x, first.y);
    refreshDanger();
  }

  /** Fait jouer une liste d'unités par l'IA. Renvoie true si la partie est terminée. */
  async function aiTurn(list, foesFn) {
    for (const e of list) {
      if (G.over) return true;
      if (e.done || e.dead) continue;
      const plan = R.planEnemy(e, foesFn(), ropts());
      e.done = true;
      if (!plan) continue;
      focus(e.x, e.y);
      setCursor(e.x, e.y, true);
      await sleep(160);
      if (plan.path && plan.path.length > 1) await animateMove(e, plan.path);
      await areaEvents(e);
      if (await checkEnd()) return true;
      if (plan.target && !plan.target.dead) {
        R.equip(e, plan.weaponIndex);
        await sleep(160);
        await runCombat(e, 0, plan.target);
        refreshDanger();
        if (await checkEnd()) return true;
      }
      await sleep(80);
    }
    return false;
  }

  async function skillRecovery(list) {
    const events = R.phaseRecovery(list, ropts());
    for (const event of events) {
      float(event.unit.x, event.unit.y - 0.5, event.skills.map(skill => skill.name).join(' · '), '#f2d58a');
      float(event.unit.x, event.unit.y, '+' + event.heal, '#7dffa8');
    }
    if (events.length) { lastInfoKey = ''; await sleep(700); }
  }

  async function terrainHeal(list) {
    let any = false;
    for (const u of list) {
      const t = terrainOf(u);
      if (t && t.heal && u.hp < u.stats.hp) {
        const before = u.hp;
        u.hp = Math.min(u.stats.hp, u.hp + Math.max(1, Math.floor(u.stats.hp * t.heal / 100)));
        float(u.x, u.y, '+' + (u.hp - before), '#7dffa8'); any = true;
      }
    }
    if (any) await sleep(700);
  }

  async function endPlayerPhase() {
    if (G.over || !['player', 'ally'].includes(G.phase)) return;
    deselect(); hideMenu(); hideForecast();
    G.phase = 'enemy'; G.busy = true;
    Music.bgm('enemyPhase');
    await banner('Phase ennemie', 'enemy');
    // renforts
    const arriving = G.pending.filter(u => u.appearTurn <= G.turn);
    for (const u of arriving) {
      const spot = freeSpotNear(u.x, u.y, u);
      if (!spot) continue;
      G.pending.splice(G.pending.indexOf(u), 1);
      u.x = u.rx = spot.x; u.y = u.ry = spot.y; u.done = true; u.alpha = 0;
      G.units.push(u);
      if (await checkEnd()) return;
      focus(u.x, u.y);
      for (let i = 1; i <= 8; i++) { u.alpha = i / 8; await sleep(30); }
      float(u.x, u.y, 'Renfort !', '#ff9a8a');
      await sleep(250);
    }
    if (arriving.length) await sleep(300);
    updateObjective();
    for (const e of enemies()) if (!arriving.includes(e)) e.done = false;
    await skillRecovery(enemies());
    await terrainHeal(enemies());

    if (await aiTurn(enemies(), players)) return;
    for (const e of enemies()) e.done = false;
    G.turn++;
    G.busy = false;
    await startPlayerPhase();
  }

  function freeSpotNear(x, y, u) {
    const ok = (a, b) => a >= 0 && b >= 0 && a < G.map.width && b < G.map.height && !unitAt(a, b) && R.moveCost(terrainAt(a, b), u.moveType) < R.IMPASSABLE;
    if (ok(x, y)) return { x, y };
    for (let r = 1; r < 6; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(dx) + Math.abs(dy) !== r) continue;
      if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
    }
    return null;
  }

  // =====================================================================
  // Victoire / défaite
  // =====================================================================
  async function checkEnd() {
    if (G.over) return true;
    updateObjective();
    const result = Mission.evaluate(G.chapter, G.db, G);
    if (result.outcome === 'defeat') { await defeat(result.reason); return true; }
    if (result.outcome === 'victory') { await victory(); return true; }
    return false;
  }

  async function victory() {
    if (G.over) return;
    G.over = true; G.busy = true; deselect(); hideMenu(); hideForecast();
    Music.victory();
    await runEvents('victory', {});
    showEnd(true);
  }
  async function defeat(reason) {
    if (G.over) return;
    G.over = true; G.busy = true; deselect(); hideMenu(); hideForecast();
    Music.me('gameOver', { resume: false });
    showEnd(false, reason);
  }
  /** Victoire avec un lobby : survivants mémorisés, chapitre terminé, or de la récompense, retour au camp. */
  async function backToLobbyAfterVictory() {
    saveCampaign();
    const gold = Lobby.completeChapter(G.campaign, G.chapter);
    await lobby.enter();
    if (gold) UI.toast(`Récompense : +${gold} or`);
  }
  /** Défaite ou abandon : retour au camp dans l'état d'avant le chapitre. */
  async function retreatToLobby() {
    const wasBusy = G.busy; G.busy = true;
    if (!G.over && !(await UI.confirm("Abandonner ce chapitre et retourner au camp ? Ce qui s'est passé pendant le chapitre est annulé.", { ok: 'Retour au camp' }))) { G.busy = wasBusy; return; }
    G.sup = R.initSupports(G.db, G.supCfg);
    Object.assign(G, Campaign.restore(G.checkpoint, G.sup));
    await lobby.enter();
  }
  function showEnd(win, why) {
    const el = $('#end'); el.className = win ? 'win-screen' : 'lose';
    el.innerHTML = '';
    const reward = win && G.lobbyOn ? Lobby.goldFor(G.chapter, (G.campaign.cleared || []).includes(G.chapter.id)) : 0;
    el.append(h('div', { class: 'end-card' },
      h('h1', {}, win ? 'Victoire' : 'Défaite'),
      h('p', {}, why || `${G.chapter.name} terminé en ${G.turn} tour(s).` + (G.lost.length ? ` Pertes : ${G.lost.join(', ')}.` : ' Aucune perte.')),
      reward ? h('p', { class: 'end-reward' }, `Récompense : ${reward} or`) : null,
      h('div', { class: 'end-actions' },
        win && G.chapter.final ? h('button', { class: 'primary', onclick: () => { saveCampaign(); if (G.lobbyOn) Lobby.completeChapter(G.campaign, G.chapter); openEpilogue(); } }, 'Épilogue') : null,
        win && G.lobbyOn ? h('button', { class: G.chapter.final ? '' : 'primary', onclick: backToLobbyAfterVictory }, 'Retour au camp →') : null,
        !win && G.lobbyOn ? h('button', { class: 'primary', onclick: retreatToLobby }, 'Retour au camp') : null,
        win && !G.lobbyOn && G.chapter.next && R.byId(G.db.chapters, G.chapter.next) ? h('button', { class: 'primary', onclick: async () => {
          const next = R.byId(G.db.chapters, G.chapter.next);
          const map = G.project.maps.find(m => m.id === next.mapId);
          const errors = map ? Mission.validate(next, G.db, map) : ['Map du chapitre suivant introuvable.'];
          if (errors.length) return UI.alert('Chapitre suivant invalide', errors.join('\n'));
          saveCampaign(); await loadChapter(next);
        } }, 'Chapitre suivant →') : null,
        h('button', { class: (win && (G.chapter.final || G.chapter.next)) || G.lobbyOn ? '' : 'primary', onclick: restartChapter }, 'Recommencer ce chapitre'),
        h('button', { onclick: saveCheckpoint }, 'Sauvegarder le début du chapitre'),
        h('button', { onclick: () => window.close() }, 'Fermer'))));
  }

  // =====================================================================
  // Épilogue : chaque personnage principal choisit son partenaire parmi ses affinités les plus fortes
  // =====================================================================
  const GENDER = { homme: 'Homme', femme: 'Femme', autre: '' };
  function openEpilogue() {
    const minRank = R.rankIndex(G.supCfg.endingRank || 'A') || 3;
    const alive = (id) => !G.campaign.dead.includes(id) && R.byId(G.db.units, id);
    const mains = G.db.units.filter(u => u.protagonist && alive(u.id));
    const pairs = {};   // id -> id du partenaire choisi
    const el = $('#epilogue');
    el.classList.remove('hidden');
    document.body.classList.add('in-epilogue');
    const face = (u, small) => {
      const d = h('div', { class: 'ep-face' + (small ? ' small' : '') });
      if (u.portrait) d.append(Faces.element(Render.readyImage(G.baseUrl, u.portrait), Render.imageUrl(G.baseUrl, u.portrait), small ? 'mini' : 'bust'));
      else d.textContent = u.name.slice(0, 1);
      return d;
    };
    const candidatesOf = (u) => R.partnersOf({ sourceId: u.id }, G.sup)
      .filter(p => p.entry.rank >= minRank && alive(p.id))
      .map(p => ({ unit: R.byId(G.db.units, p.id), entry: p.entry }))
      .sort((a, b) => b.entry.rank - a.entry.rank || b.entry.points - a.entry.points);
    const renderChoices = () => {
      el.innerHTML = '';
      const cards = mains.map(u => {
        const taken = pairs[u.id];
        const chosenBy = Object.keys(pairs).find(k => pairs[k] === u.id);
        const head = h('div', { class: 'ep-head' }, face(u), h('div', {}, h('b', {}, u.name), h('small', {}, GENDER[u.gender] || '')));
        if (chosenBy) return h('div', { class: 'ep-card locked' }, head, h('p', {}, `Finit avec ${R.byId(G.db.units, chosenBy).name}.`));
        const cands = candidatesOf(u).filter(c => !Object.values(pairs).includes(c.unit.id) || pairs[u.id] === c.unit.id)
          .filter(c => !pairs[c.unit.id] || pairs[c.unit.id] === u.id);
        return h('div', { class: 'ep-card' }, head,
          cands.length ? h('div', { class: 'ep-cands' }, cands.map(c => h('button', {
            class: 'ep-cand' + (taken === c.unit.id ? ' on' : ''),
            onclick: () => { if (pairs[u.id] === c.unit.id) delete pairs[u.id]; else pairs[u.id] = c.unit.id; renderChoices(); }
          }, face(c.unit, true), h('span', {}, c.unit.name), h('small', {}, `${GENDER[c.unit.gender] || ''} · affinité ${R.SUPPORT_RANKS[c.entry.rank]}`))))
            : h('p', { class: 'ep-none' }, `Aucune affinité de rang ${R.SUPPORT_RANKS[minRank]} ou plus.`),
          h('button', { class: 'ep-cand solo' + (!taken ? ' on' : ''), onclick: () => { delete pairs[u.id]; renderChoices(); } }, h('span', {}, 'Seul(e)')));
      });
      el.append(h('div', { class: 'ep-wrap' },
        h('h1', {}, 'Épilogue'),
        h('p', { class: 'ep-sub' }, `Chaque personnage principal peut finir avec une personne dont l'affinité atteint le rang ${R.SUPPORT_RANKS[minRank]}.`),
        h('div', { class: 'ep-cards' }, cards),
        h('div', { class: 'end-actions' }, h('button', { class: 'primary', onclick: showEndings }, 'Voir les fins'))));
    };
    const showEndings = () => {
      const done = new Set(); const items = [];
      for (const [a, b] of Object.entries(pairs)) {
        const e = G.sup[R.pairKey(a, b)];
        const ua = R.byId(G.db.units, a), ub = R.byId(G.db.units, b);
        items.push({ faces: [ua, ub], title: `${ua.name} & ${ub.name}`, text: (e && e.def.ending) || `${ua.name} et ${ub.name} ne se quittèrent plus.` });
        done.add(a); done.add(b);
      }
      const seen = new Set(G.units.filter(u => u.team !== 'enemy').map(u => u.sourceId).concat(Object.keys(G.campaign.units)));
      for (const id of seen) {
        if (done.has(id)) continue;
        const u = R.byId(G.db.units, id); if (!u) continue;
        const dead = G.campaign.dead.includes(id);
        items.push({ faces: [u], title: u.name, text: dead ? `${u.name} tomba au combat.` : (u.ending || `${u.name} reprit le cours de sa vie.`), dead });
      }
      let i = 0;
      const show = () => {
        el.innerHTML = '';
        if (i >= items.length) {
          el.append(h('div', { class: 'ep-wrap center' }, h('h1', {}, 'Fin'), h('p', { class: 'ep-sub' }, G.project.meta.name),
            h('div', { class: 'end-actions' }, h('button', { class: 'primary', onclick: () => location.reload() }, 'Rejouer'), h('button', { onclick: () => window.close() }, 'Fermer'))));
          return;
        }
        const it = items[i];
        el.append(h('div', { class: 'ep-wrap center' + (it.dead ? ' dead' : '') },
          h('div', { class: 'ep-faces' }, it.faces.map(u => face(u))),
          h('h2', {}, it.title), h('p', { class: 'ep-text' }, it.text),
          h('div', { class: 'end-actions' }, h('button', { class: 'primary', onclick: () => { i++; show(); } }, i < items.length - 1 ? 'Suivant' : 'Terminer'))));
      };
      show();
    };
    renderChoices();
  }

  // =====================================================================
  // Événements et dialogues
  // =====================================================================
  function matchesUnit(target, u) {
    if (!target || !u) return false;
    if (target.startsWith('unit:')) return u.team !== 'enemy' && u.sourceId === target.slice(5);
    return u.sourceId === target;
  }

  async function runEvents(type, data) {
    for (const ev of G.chapter.events || []) {
      if (ev.once !== false && G.fired.has(ev.id)) continue;
      const tr = ev.trigger || {};
      if (tr.type !== type) continue;
      if (type === 'turn' && Number(tr.turn) !== data.turn) continue;
      if (type === 'death' && !matchesUnit(tr.target, data.unit)) continue;
      if (type === 'area') {
        const u = data.unit;
        if (!(u.x >= tr.x && u.y >= tr.y && u.x < tr.x + (tr.w || 1) && u.y < tr.y + (tr.h || 1))) continue;
      }
      G.fired.add(ev.id);
      await playDialogue(ev.script || '');
    }
  }
  async function areaEvents(u) { if (u.team !== 'enemy') await runEvents('area', { unit: u }); }

  function speakerUnit(name) {
    const n = name.trim().toLowerCase();
    return G.units.concat(G.pending).find(u => u.name.toLowerCase() === n)
      || (() => { const c = G.db.units.find(c => c.name.toLowerCase() === n); return c ? { name: c.name, sourceId: c.id, team: 'player', color: c.color, portrait: c.portrait } : null; })();
  }

  function playDialogue(script) {
    const lines = script.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = /^([^:]{1,40}):\s*(.*)$/.exec(l);
      return m ? { who: m[1].trim(), text: m[2] } : { who: '', text: l };
    });
    if (!lines.length) return Promise.resolve();
    const wasBusy = G.busy;
    G.busy = true;
    const el = $('#dialogue');
    el.classList.remove('hidden');
    document.body.classList.add('talking');
    return new Promise((resolve) => {
      let i = 0, typing = null, full = '';
      const textEl = el.querySelector('.dlg-text');
      const finish = () => {
        clearInterval(typing); el.classList.add('hidden'); document.body.classList.remove('talking'); G.dialogue = null; G.busy = wasBusy; resolve();
      };
      const show = () => {
        if (i >= lines.length) return finish();
        const ln = lines[i];
        const u = ln.who ? speakerUnit(ln.who) : null;
        const pEl = el.querySelector('.dlg-portrait'); pEl.innerHTML = '';
        if (ln.who) pEl.append(u ? portraitEl(Object.assign({ team: 'player' }, u), 'main') : h('div', { class: 'portrait', style: { background: '#444' } }, ln.who.slice(0, 1)));
        const faceCv = pEl.querySelector('canvas.faceset');
        const talk = (on) => { if (faceCv) faceCv.face.talking = on; };
        el.querySelector('.dlg-name').textContent = ln.who;
        full = ln.text; let n = 0;
        textEl.textContent = '';
        clearInterval(typing);
        talk(true);
        typing = setInterval(() => { n += G.fast ? 3 : 1; textEl.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; talk(false); } }, 18);
      };
      G.dialogue = {
        next: () => {
          if (typing) { clearInterval(typing); typing = null; textEl.textContent = full; const f = el.querySelector('.dlg-portrait canvas.faceset'); if (f) f.face.talking = false; return; }
          i++; show();
        },
        skip: finish
      };
      show();
    });
  }
  $('#dialogue .dlg-box').addEventListener('mousedown', (e) => { if (e.button === 0 && G.dialogue) G.dialogue.next(); });
  $('#dialogue .dlg-skip').addEventListener('mousedown', (e) => { e.stopPropagation(); if (G.dialogue) G.dialogue.skip(); });

  // =====================================================================
  // Entrées
  // =====================================================================
  function setCursor(x, y, silent) {
    x = Math.max(0, Math.min(G.map.width - 1, x)); y = Math.max(0, Math.min(G.map.height - 1, y));
    G.cursor = { x, y };
    if (!silent) focus(x, y);
    if (G.ui === 'target') showForecast();
    updateInfo();
  }

  function confirm(fromMouse) {
    if (G.waitClick) return G.waitClick();
    if (G.dialogue) return G.dialogue.next();
    if (G.mode === 'lobby' && !G.menu) { if (fromMouse === true) lobby.click(G.cursor.x, G.cursor.y); return; }
    if (G.busy || G.over || !['player', 'ally'].includes(G.phase)) return;
    const c = G.cursor;
    switch (G.ui) {
      case 'idle': {
        const u = unitAt(c.x, c.y);
        if (controllable(u)) return select(u);
        if (u && (u.team === 'enemy' || u.team === 'ally')) {
          if (G.enemyView && G.enemyView.unit === u) { G.enemyView = null; return; }
          const reach = u.ai === 'stationary' ? new Map([[key(u.x, u.y), { x: u.x, y: u.y, canStop: true }]]) : R.reachable(u, rctx());
          G.enemyView = { unit: u, move: new Set([...reach.keys()]), atk: R.threatTiles(u, rctx(), G.db, u.ai === 'stationary') };
          return;
        }
        G.enemyView = null;
        return openMapMenu();
      }
      case 'moving': {
        const n = G.reach.get(key(c.x, c.y));
        if (n && n.canStop) return moveSelectedTo(n);
        const u = unitAt(c.x, c.y);
        if (controllable(u) && u !== G.sel) return select(u);
        return deselect();
      }
      case 'menu': case 'mapmenu': case 'items': case 'lobbymenu': {
        const it = G.menu && G.menu.items[G.menu.index];
        if (it && !it.disabled) it.action();
        return;
      }
      case 'target': { const t = currentTarget(); if (t) attack(G.sel, t); return; }
      case 'staff': { const t = currentTarget(); if (t) heal(G.sel, t); return; }
    }
  }

  function cancel() {
    if (G.waitClick) return G.waitClick();
    if (G.dialogue) return G.dialogue.next();
    if (G.busy || G.over) return;
    switch (G.ui) {
      case 'moving': return deselect();
      case 'menu': {
        hideMenu();
        const u = G.sel;
        u.x = u.rx = G.origin.x; u.y = u.ry = G.origin.y;
        select(u); setCursor(u.x, u.y);
        return;
      }
      case 'items': hideMenu(); return openActionMenu();
      case 'convoy': return closeConvoy();
      case 'mapmenu': case 'lobbymenu': hideMenu(); G.ui = 'idle'; return;
      case 'target': case 'staff': hideForecast(); setCursor(G.sel.x, G.sel.y); return openActionMenu();
      default: G.enemyView = null;
    }
  }

  canvas.addEventListener('mousemove', (e) => {
    G.mouse = { x: e.clientX, y: e.clientY }; G.mouseIn = true;
    if (!G.map || G.busy) return;
    const x = Math.floor((e.clientX + V.camX) / TW()), y = Math.floor((e.clientY + V.camY) / TH());
    if (x < 0 || y < 0 || x >= G.map.width || y >= G.map.height) return;
    if (x !== G.cursor.x || y !== G.cursor.y) setCursor(x, y, true);
  });
  canvas.addEventListener('mouseleave', () => { G.mouseIn = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) confirm(true);
    else if (e.button === 2) { if (G.mode === 'lobby' && !G.menu && !G.dialogue) lobby.openMenu(); else cancel(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target === canvas) return;
    if (G.waitClick && e.button === 0) G.waitClick();
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back')) return;
    const k = e.key;
    if (BattleScene.isActive()) {
      e.preventDefault();
      if (['z', 'Z', 'Enter', ' '].includes(k)) BattleScene.setFast(true);
      if (['x', 'X', 'Escape', 'Backspace'].includes(k)) BattleScene.skip();
      return;
    }
    if (G.mode === 'lobby' && !G.dialogue && lobby.key(e)) return;
    if (['z', 'Z', 'Enter', ' '].includes(k)) { e.preventDefault(); return confirm(); }
    if (['x', 'X', 'Escape', 'Backspace'].includes(k)) { e.preventDefault(); return cancel(); }
    if ((k === 'd' || k === 'D') && !G.busy && !G.dialogue && G.mode !== 'lobby') return toggleDanger();
    if (k === 'm' || k === 'M') return Music.toggleMute();
    if (k === 'Shift') G.fast = true;
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[k]) {
      e.preventDefault();
      if (G.busy || G.dialogue) return;
      if (G.menu) return menuMove(dirs[k][1] || dirs[k][0]);
      if (G.ui === 'target' || G.ui === 'staff') {
        if (G.ui === 'target' && (k === 'ArrowLeft' || k === 'ArrowRight') && G.wList.length > 1 && e.ctrlKey) return cycleWeapon(dirs[k][0]);
        G.tIndex = (G.tIndex + (dirs[k][0] + dirs[k][1] > 0 ? 1 : -1) + G.targets.length) % G.targets.length;
        const t = G.targets[G.tIndex]; G.wList = []; return setCursor(t.x, t.y);
      }
      setCursor(G.cursor.x + dirs[k][0], G.cursor.y + dirs[k][1]);
    }
    if ((k === 'q' || k === 'Q') && G.ui === 'target') cycleWeapon(-1);
    if ((k === 'e' || k === 'E') && G.ui === 'target') cycleWeapon(1);
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') G.fast = false;
    lobby.keyup(e);
    if (['z', 'Z', 'Enter', ' '].includes(e.key)) BattleScene.setFast(false);
  });
  document.addEventListener('mousedown', (e) => {
    if (!BattleScene.isActive()) return;
    if (e.button === 0) BattleScene.setFast(true); else if (e.button === 2) BattleScene.skip();
  }, true);
  document.addEventListener('mouseup', () => BattleScene.setFast(false), true);
  window.addEventListener('resize', UI.debounce(resize, 80));

  // les fenêtres d'info suivent l'état en continu (léger)
  setInterval(() => { if (G.map) updateInfo(); }, 120);

  // ---------- lobby (camp entre deux chapitres) ----------
  const lobby = LobbyScene.create({
    G, h, R, $, Music, dir: params.get('dir'), defaultHelp,
    hideMenu, hideForecast, showMenu, buildBase, resize, focus, prep, applyCampaign, terrainAt, animateMove, playDialogue,
    float, banner, loadChapter, sTaken, tileRect, TW, TH
  });
  window.PlaytestLobby = lobby;
  window.PlaytestDebug = { checkEnd, killUnit }; // scénarios de test automatisés

  init();
})();
