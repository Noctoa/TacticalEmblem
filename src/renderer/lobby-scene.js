/*
 * Scène du lobby (playtest) : une map explorable où le héros se déplace librement.
 *
 *   Flèches / clic      se déplacer (un clic sur un personnage ou un comptoir y va et interagit)
 *   Z / Entrée          parler au personnage en face, consulter la table des chapitres, la boutique
 *   X / Échap           menu du camp (chapitres, boutique, sauvegarde, musique, quitter)
 *
 * Le moteur du playtest fournit le rendu de la map et des unités (api.*) ; ce module ajoute les
 * déplacements, les repères (table, boutique, « ! » des conversations) et les panneaux HTML.
 * La logique (chapitres débloqués, conversations, prix) est dans shared/lobby.js.
 */
(function (root) {
  'use strict';

  function create(api) {
    const { G, h, R, $ } = api;
    const S = { cfg: null, hero: null, npcs: [], members: [], facing: 'down', moving: false, held: [], panel: null, walkToken: 0 };
    const DIRS = { ArrowUp: [0, -1, 'up'], ArrowDown: [0, 1, 'down'], ArrowLeft: [-1, 0, 'left'], ArrowRight: [1, 0, 'right'] };
    const panelEl = () => $('#lobby-panel');

    // ------------------------------------------------------------------
    // Entrée dans le lobby
    // ------------------------------------------------------------------
    function enabled(project) {
      const cfg = Lobby.defaults(project.meta.lobby);
      return cfg.enabled && !Lobby.validate(cfg, project.db, project.maps).length;
    }

    async function enter() {
      const cfg = S.cfg = Lobby.defaults(G.project.meta.lobby);
      const map = G.project.maps.find(m => m.id === cfg.mapId);
      const errors = Lobby.validate(cfg, G.db, G.project.maps);
      if (errors.length) throw new Error(errors.join('\n'));
      G.mode = 'lobby'; G.chapter = null; G.map = map;
      Object.assign(G, { phase: 'lobby', ui: 'idle', over: false, busy: false, sel: null, reach: null, atk: null, staffRange: null,
        enemyView: null, dangerSet: null, danger: false, menu: null, targets: [], wList: [], pending: [], fired: new Set(), lost: [] });
      api.hideMenu(); api.hideForecast();
      for (const id of ['#convoy', '#epilogue']) $(id).classList.add('hidden');
      $('#end').className = 'hidden'; $('#end').innerHTML = '';
      document.body.classList.add('in-lobby');
      document.title = 'Playtest — ' + cfg.name;
      G.tgrid = R.buildTerrainGrid(map, G.db.tilesets, G.project.meta.defaultTerrain || 'plain');
      // héros et personnages présents, avec leur progression (niveau, classe, objets)
      const heroDef = Lobby.heroOf(cfg, G.db);
      S.hero = api.prep(api.applyCampaign(R.makeUnitFromCharacter(heroDef, G.db, { x: cfg.start.x, y: cfg.start.y })));
      S.npcs = Lobby.present(cfg, G.db, G.campaign).map(p => api.prep(api.applyCampaign(R.makeUnitFromCharacter(p.unit, G.db, { x: p.spot.x, y: p.spot.y }))));
      G.units = [S.hero, ...S.npcs];
      S.members = []; refreshMembers(); commit();
      S.facing = 'down'; S.held = []; S.moving = false;
      G.cursor = { x: S.hero.x, y: S.hero.y };
      api.buildBase(); api.resize(); api.focus(S.hero.x, S.hero.y, true);
      G.checkpoint = Campaign.checkpoint(Lobby.LOBBY_SAVE, G.campaign, G.convoy, G.sup);
      api.Music.bgm('lobby');
      refreshHud();
      await api.banner(cfg.name, 'ally');
    }

    function leave() {
      closePanel(true);
      document.body.classList.remove('in-lobby');
      $('#help').textContent = api.defaultHelp;
      S.held = [];
    }

    // ------------------------------------------------------------------
    // Carte : cases, déplacements
    // ------------------------------------------------------------------
    const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
    const npcAt = (x, y) => S.npcs.find(u => u.x === x && u.y === y) || null;
    const isBoard = (x, y) => S.cfg.board.x === x && S.cfg.board.y === y;
    const isShop = (x, y) => S.cfg.shop.enabled && S.cfg.shop.x === x && S.cfg.shop.y === y;
    function walkable(x, y) {
      if (x < 0 || y < 0 || x >= G.map.width || y >= G.map.height) return false;
      if (npcAt(x, y)) return false;
      const cost = R.moveCost(api.terrainAt(x, y), S.hero.moveType);
      return Number.isFinite(cost) && cost < R.IMPASSABLE;
    }
    /** Ce avec quoi on peut interagir sur une case : { kind: 'npc' | 'board' | 'shop', unit? }. */
    function thingAt(x, y) {
      const u = npcAt(x, y);
      if (u) return { kind: 'npc', unit: u };
      if (isBoard(x, y)) return { kind: 'board' };
      if (isShop(x, y)) return { kind: 'shop' };
      return null;
    }
    function facingTile() {
      const d = Object.values(DIRS).find(v => v[2] === S.facing);
      return { x: S.hero.x + d[0], y: S.hero.y + d[1] };
    }
    /** Interaction possible maintenant : en face, sinon sur la case du héros. */
    function target() {
      const f = facingTile();
      return thingAt(f.x, f.y) || thingAt(S.hero.x, S.hero.y);
    }

    async function step(dx, dy, dir) {
      S.facing = dir;
      const nx = S.hero.x + dx, ny = S.hero.y + dy;
      if (!walkable(nx, ny)) { S.hero.walkDir = null; refreshHint(); return false; }
      S.moving = true;
      await api.animateMove(S.hero, [{ x: S.hero.x, y: S.hero.y }, { x: nx, y: ny }], true);
      S.moving = false;
      G.cursor = { x: S.hero.x, y: S.hero.y };
      refreshHint();
      return true;
    }
    /** Marche tant qu'une flèche est tenue. */
    async function walkLoop() {
      if (S.moving) return;
      while (S.held.length && G.mode === 'lobby' && !G.dialogue && !G.menu && !S.panel && !G.busy) {
        const d = DIRS[S.held[S.held.length - 1]];
        if (!(await step(d[0], d[1], d[2]))) break;
      }
      S.hero.walkDir = null;
    }
    /** Chemin le plus court (cases franchissables) jusqu'à une case, ou jusqu'à côté d'elle (adjacent). */
    function pathTo(tx, ty, adjacent) {
      const start = { x: S.hero.x, y: S.hero.y };
      const goal = (x, y) => adjacent ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : x === tx && y === ty;
      if (goal(start.x, start.y)) return [start];
      const prev = new Map([[start.x + ',' + start.y, null]]);
      const queue = [start];
      while (queue.length) {
        const c = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = { x: c.x + dx, y: c.y + dy }, k = n.x + ',' + n.y;
          if (prev.has(k) || !walkable(n.x, n.y)) continue;
          prev.set(k, c);
          if (goal(n.x, n.y)) {
            const path = [n];
            for (let p = c; p; p = prev.get(p.x + ',' + p.y)) path.unshift(p);
            return path;
          }
          queue.push(n);
        }
      }
      return null;
    }
    async function walkPath(path) {
      const token = ++S.walkToken;
      for (let i = 1; i < path.length; i++) {
        if (token !== S.walkToken || G.mode !== 'lobby') return false;
        const a = path[i - 1], b = path[i];
        const dir = b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y > a.y ? 'down' : 'up';
        if (!(await step(b.x - a.x, b.y - a.y, dir))) return false;
      }
      S.hero.walkDir = null;
      return true;
    }
    function face(x, y) {
      const dx = x - S.hero.x, dy = y - S.hero.y;
      if (dx || dy) S.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }

    // ------------------------------------------------------------------
    // Interactions
    // ------------------------------------------------------------------
    async function interact(thing) {
      thing = thing || target();
      if (!thing) return;
      if (thing.kind === 'board') return openChapters();
      if (thing.kind === 'shop') return openShop();
      if (thing.kind === 'npc') return talkTo(thing.unit);
    }

    async function talkTo(u) {
      const list = Lobby.talks(S.cfg, G.db, G.campaign).filter(t => t.unit.id === u.sourceId);
      if (!list.length) { api.float(u.x, u.y, '…', '#e8e2cf'); return; }
      const t = list[0].talk;
      await api.playDialogue(t.script);
      Lobby.markTalk(G.campaign, t);
      const pts = Math.max(0, Math.floor(Number(t.points) || 0));
      const pair = [S.hero.sourceId, u.sourceId];
      const linked = Object.values(G.sup).some(e => pair.includes(e.def.a) && pair.includes(e.def.b));
      if (pts && linked) {
        R.addSupportPoints(G.sup, S.hero.sourceId, u.sourceId, pts, G.supCfg, api.sTaken);
        api.float(u.x, u.y, `♥ +${pts}`, '#ff9ecb');
        UI.toast(`Affinité ${S.hero.name} & ${u.name} : +${pts}`);
      }
      refreshHud();
    }

    // ------------------------------------------------------------------
    // Panneaux (chapitres, boutique)
    // ------------------------------------------------------------------
    function openPanel(title, build) {
      api.hideMenu();
      S.panel = { title, build, tab: S.panel && S.panel.title === title ? S.panel.tab : null };
      G.ui = 'lobbypanel';
      api.Music.se('confirm');
      renderPanel();
    }
    function renderPanel(focusIndex) {
      const el = panelEl();
      el.classList.toggle('team-panel', S.panel.build === teamPanel.render);
      el.classList.remove('hidden');
      el.innerHTML = '';
      const body = h('div', { class: 'lp-body' });
      el.append(h('div', { class: 'lp-head' }, h('h3', {}, S.panel.title), h('span', { class: 'lp-gold' }, goldLabel()),
        h('button', { class: 'lp-close lp-focus', onclick: () => closePanel() }, 'Fermer ✕')), body);
      S.panel.build(body);
      const items = [...el.querySelectorAll('.lp-focus:not([disabled])')];
      const i = focusIndex !== undefined ? Math.min(focusIndex, items.length - 1) : Math.min(1, items.length - 1);
      if (items[i]) items[i].focus();
    }
    function rerender() {
      const items = [...panelEl().querySelectorAll('.lp-focus:not([disabled])')];
      renderPanel(Math.max(0, items.indexOf(document.activeElement)));
    }
    function closePanel(silent) {
      if (!silent) api.Music.se('cancel');
      S.panel = null;
      panelEl().classList.add('hidden'); panelEl().innerHTML = '';
      if (!silent) { G.ui = 'idle'; refreshHud(); }
    }
    const goldLabel = () => `Or : ${(G.campaign.gold || 0).toLocaleString('fr-FR')}`;
    function tabs(list, cur, onPick) {
      return h('div', { class: 'lp-tabs' }, list.map(([v, label]) => h('button', { class: 'lp-tab lp-focus' + (v === cur ? ' on' : ''), onclick: () => onPick(v) }, label)));
    }

    // --- table des chapitres
    /** Tableau des quêtes : onglets Histoire / Évènements, une carte par chapitre, ses actes à jouer dans l'ordre. */
    function openChapters() {
      openPanel(S.cfg.board.label || 'Tableau des quêtes', (body) => {
        const all = Lobby.board(G.db, G.project.meta, G.campaign);
        const acts = Lobby.chapters(G.db, G.project.meta, G.campaign);
        const hasEvents = true; // les deux sections sont toujours affichées
        const tab = S.panel.tab = S.panel.tab || 'story';
        if (hasEvents) body.append(tabs([['story', 'Histoire' + countNew(acts, 'story')], ['event', 'Évènements' + countNew(acts, 'event')]], tab, (v) => { S.panel.tab = v; rerender(); }));
        const list = all.filter(e => e.kind === (hasEvents ? tab : 'story'));
        if (!list.length) body.append(h('p', { class: 'lp-empty' }, tab === 'event' ? 'Aucun évènement en cours.' : 'Aucun chapitre disponible.'));
        for (const b of list) body.append(arcCard(b));
      });
    }
    const BADGE = { new: ['new', 'Nouveau'], progress: ['prog', 'En cours'], cleared: ['done', 'Terminé ✓'], locked: ['soon', 'Verrouillé'] };
    function arcCard(b) {
      const [cls, label] = b.upcoming ? ['soon', 'Bientôt'] : BADGE[b.state];
      const single = b.arc.implicit;
      const pips = single ? null : h('span', { class: 'lp-pips', title: `${b.done}/${b.total} actes terminés` },
        b.acts.map(a => h('i', { class: a.state === 'cleared' ? 'on' : '' })), h('small', {}, `${b.done}/${b.total}`));
      const card = h('div', { class: 'lp-arc' + (b.state === 'locked' ? ' off' : '') + ' ' + cls },
        h('div', { class: 'lp-arc-head' }, h('div', { class: 'lp-name' }, b.arc.name), pips, h('span', { class: 'lp-badge ' + cls }, label)),
        b.arc.description ? h('div', { class: 'lp-sub' }, b.arc.description) : null,
        b.reasons.length ? h('div', { class: 'lp-why' }, b.reasons.join(' · ')) : null);
      for (const a of b.acts) {
        const obj = Mission.objectives(a.ch)[0];
        const state = a.state === 'cleared' ? h('span', { class: 'lp-badge done' }, '✓') : a.state === 'new' ? h('span', { class: 'lp-badge new' }, 'Nouveau') : null;
        card.append(h('div', { class: 'lp-row lp-act' + (a.playable ? '' : ' off') },
          h('div', { class: 'lp-main' },
            h('div', { class: 'lp-name' }, single ? a.ch.name : h('span', {}, h('b', { class: 'lp-actnum' }, `Acte ${a.index + 1}`), ' ', a.ch.name), ' ', state),
            h('div', { class: 'lp-sub' }, [obj ? Mission.label(obj, a.ch) : '', a.gold ? `Récompense : ${a.gold} or` : (a.state === 'cleared' && a.ch.gold ? 'Récompense déjà reçue' : '')].filter(Boolean).join(' · ')),
            b.state !== 'locked' && a.reasons.length ? h('div', { class: 'lp-why' }, a.reasons.join(' · ')) : null),
          h('button', { class: 'lp-go lp-focus', disabled: !a.playable, onclick: () => depart(a.ch) }, a.state === 'cleared' ? 'Rejouer' : 'Partir')));
      }
      return card;
    }
    const countNew = (all, kind) => { const n = all.filter(e => e.kind === kind && e.state === 'new').length; return n ? ` (${n})` : ''; };
    async function depart(ch) {
      const map = G.project.maps.find(m => m.id === ch.mapId);
      const errors = map ? [...Mission.validate(ch, G.db, map), ...Deployment.validate(ch, G.db, map), ...Villages.validate(ch, G.db, map), ...Locks.validate(ch, G.db, map)] : ["Map de l'acte introuvable."];
      if (errors.length) return UI.alert('Acte invalide', errors.join('\n'));
      if (!(await UI.confirm(`Partir pour « ${Lobby.actLabel(G.db, ch.id)} » ?`, { ok: 'Partir' }))) return;
      commit();
      leave();
      await api.loadChapter(ch);
    }

    // --- boutique
    function refreshMembers() {
      const ids = Team.sync(G.campaign, G.db, G.project.meta);
      S.members = ids.map(id => S.members.find(u => u.sourceId === id) || G.units.find(u => u.sourceId === id) ||
        api.prep(api.applyCampaign(R.makeUnitFromCharacter(R.byId(G.db.units, id), G.db, { x: 0, y: 0 }))));
      return S.members;
    }
    function members() { return refreshMembers(); }
    function commit() { Campaign.commit(G.campaign, S.members); }
    const teamPanel = TeamPanel.create({ G, h, R, members, openPanel, rerender,
      changed: () => { commit(); refreshHud(); }, openPromotion: api.openPromotion, showEvolution: api.showEvolution,
      openSettings: api.openSettings });
    function openTeam() { members(); openPanel('Équipe', teamPanel.render); }
    function openShop() {
      const MAX = 5;
      S.dest = S.dest || 'convoy';
      openPanel(S.cfg.shop.name || 'Boutique', (body) => {
        const tab = S.panel.tab = S.panel.tab || 'buy';
        body.append(tabs([['buy', 'Acheter'], ['sell', 'Vendre']], tab, (v) => { S.panel.tab = v; rerender(); }));
        const label = (slot) => { const d = Lobby.entryOf(G.db, slot.id); return d ? d.name : slot.id; };
        const usesOf = (slot) => { const d = Lobby.entryOf(G.db, slot.id); return d && d.uses ? `${slot.uses}/${d.uses}` : '∞'; };
        if (tab === 'buy') {
          const opts = [{ v: 'convoy', label: `Convoi (${G.convoy.length}/${G.convoyCap})`, full: G.convoy.length >= G.convoyCap }]
            .concat(members().map(u => ({ v: u.uid, label: `${u.name} (${u.inventory.length}/${MAX})`, full: u.inventory.length >= MAX })));
          if (!opts.some(o => o.v === S.dest)) S.dest = 'convoy';
          const sel = h('select', { class: 'lp-focus' }, opts.map(o => h('option', { value: o.v }, o.label)));
          sel.value = S.dest;
          sel.addEventListener('change', () => { S.dest = sel.value; rerender(); });
          body.append(h('div', { class: 'lp-dest' }, h('span', {}, 'Ranger dans'), sel));
          const full = (opts.find(o => o.v === S.dest) || {}).full;
          const stock = Lobby.stock(S.cfg, G.db);
          if (!stock.length) body.append(h('p', { class: 'lp-empty' }, 'Le marchand n\'a rien à vendre.'));
          for (const it of stock) {
            const can = (G.campaign.gold || 0) >= it.price && !full;
            body.append(h('div', { class: 'lp-row' + (can ? '' : ' off') },
              h('div', { class: 'lp-main' }, h('div', { class: 'lp-name' }, it.def.name), h('div', { class: 'lp-sub' }, kindOf(it.def) + (it.def.uses ? ` · ${it.def.uses} utilisations` : ''))),
              h('span', { class: 'lp-price' }, `${it.price} or`),
              h('button', { class: 'lp-go lp-focus', disabled: !can, onclick: () => buy(it.id) }, 'Acheter')));
          }
          if (full) body.append(h('p', { class: 'lp-why' }, 'Plus de place : choisis un autre rangement.'));
        } else {
          const groups = [{ owner: null, name: 'Convoi', list: G.convoy }].concat(members().map(u => ({ owner: u, name: u.name, list: u.inventory })));
          let any = false;
          for (const g of groups) {
            if (!g.list.length) continue;
            any = true;
            body.append(h('div', { class: 'lp-group' }, g.name));
            g.list.forEach((slot, i) => {
              const d = Lobby.entryOf(G.db, slot.id);
              const amount = d ? Lobby.sellPrice(d, slot.uses) : 0;
              body.append(h('div', { class: 'lp-row' + (amount ? '' : ' off') },
                h('div', { class: 'lp-main' }, h('div', { class: 'lp-name' }, label(slot)), h('div', { class: 'lp-sub' }, usesOf(slot))),
                h('span', { class: 'lp-price' }, amount ? `${amount} or` : 'invendable'),
                h('button', { class: 'lp-go lp-focus', disabled: !amount, onclick: () => sell(g, i) }, 'Vendre')));
            });
          }
          if (!any) body.append(h('p', { class: 'lp-empty' }, 'Rien à vendre.'));
        }
      });
    }
    const kindOf = (def) => def.type ? ((R.WEAPON_TYPES.find(t => t.id === def.type) || {}).name || def.type) : 'Objet';
    function buy(id) {
      const r = Lobby.buy(G.campaign, G.db, id);
      if (!r.ok) return UI.toast(r.error);
      const owner = members().find(u => u.uid === S.dest);
      if (owner) owner.inventory.push(r.slot); else G.convoy.push(r.slot);
      commit();
      UI.toast(`${Lobby.entryOf(G.db, id).name} acheté${owner ? ' pour ' + owner.name : ' (convoi)'}`);
      rerender(); refreshHud();
    }
    async function sell(group, index) {
      const slot = group.list[index];
      const d = Lobby.entryOf(G.db, slot.id);
      if (!(await UI.confirm(`Vendre ${d ? d.name : slot.id} pour ${Lobby.sellPrice(d, slot.uses)} or ?`, { ok: 'Vendre' }))) return rerender();
      const r = Lobby.sell(G.campaign, G.db, slot);
      if (!r.ok) return UI.toast(r.error);
      group.list.splice(index, 1);
      commit();
      UI.toast(`+${r.amount} or`);
      rerender(); refreshHud();
    }

    // ------------------------------------------------------------------
    // Menu du camp, sauvegarde
    // ------------------------------------------------------------------
    function openMenu() {
      const all = Lobby.chapters(G.db, G.project.meta, G.campaign);
      api.showMenu([
        { label: 'Équipe', sub: `${members().length} personnage(s) recruté(s)`, action: () => { api.hideMenu(); openTeam(); } },
        { label: S.cfg.board.label || 'Tableau des quêtes', sub: (countNew(all, 'story') + countNew(all, 'event')).trim(), action: () => { api.hideMenu(); openChapters(); } },
        S.cfg.shop.enabled ? { label: S.cfg.shop.name || 'Boutique', sub: goldLabel(), action: () => { api.hideMenu(); openShop(); } } : null,
        { label: 'Paramètres', sub: 'sauvegarde, son… (Échap)', action: () => { api.hideMenu(); G.ui = 'idle'; api.openSettings(); } },
        { label: 'Quitter le test', action: () => window.close() }
      ].filter(Boolean), S.hero, 'lobbymenu');
    }
    // ------------------------------------------------------------------
    // HUD, repères, entrées
    // ------------------------------------------------------------------
    function refreshHud() {
      const obj = $('#objective');
      const all = Lobby.chapters(G.db, G.project.meta, G.campaign);
      const fresh = all.filter(e => e.state === 'new');
      const talks = Lobby.talks(S.cfg, G.db, G.campaign);
      obj.innerHTML = '';
      obj.append(h('div', { class: 'lbl' }, S.cfg.name), h('div', { class: 'obj' }, goldLabel()),
        h('div', { class: 'turn' }, fresh.length ? `${fresh.length} acte(s) à jouer` : 'Aucun nouvel acte'),
        talks.length ? h('div', { class: 'turn' }, `${talks.length} conversation(s) — « ! »`) : null,
        h('div', { class: 'turn' }, G.campaign.mode === 'classic' ? 'Classique' : 'Détente'));
      refreshHint();
    }
    function refreshHint() {
      if (G.mode !== 'lobby') return;
      const t = target();
      const what = !t ? '' : t.kind === 'npc' ? `Z : parler à ${t.unit.name}` : t.kind === 'board' ? `Z : ${S.cfg.board.label || 'tableau des quêtes'}` : `Z : ${S.cfg.shop.name || 'boutique'}`;
      $('#help').textContent = (what ? what + ' · ' : '') + 'Flèches / clic : se déplacer · X : menu du camp · Échap : paramètres · M : son';
    }

    /** Repères dessinés par-dessus la map et les unités. */
    function drawOverlay(ctx, t) {
      const pulse = 0.55 + Math.sin(t / 280) * 0.35;
      const label = (x, y, text, color) => {
        const [px, py, w] = api.tileRect(x, y);
        ctx.font = `700 ${Math.max(10, Math.round(api.TW() * 0.3))}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(text, px + w / 2, py - 2);
        ctx.fillStyle = color; ctx.fillText(text, px + w / 2, py - 2);
      };
      const ring = (x, y, color) => {
        const [px, py, w, hh] = api.tileRect(x, y);
        ctx.strokeStyle = color; ctx.globalAlpha = pulse; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, w - 4, hh - 4); ctx.globalAlpha = 1;
      };
      const fresh = Lobby.chapters(G.db, G.project.meta, G.campaign).some(e => e.state === 'new');
      ring(S.cfg.board.x, S.cfg.board.y, '#f2d58a');
      label(S.cfg.board.x, S.cfg.board.y, (fresh ? '! ' : '') + (S.cfg.board.label || 'Tableau des quêtes'), '#f2d58a');
      if (S.cfg.shop.enabled) { ring(S.cfg.shop.x, S.cfg.shop.y, '#9fe0ff'); label(S.cfg.shop.x, S.cfg.shop.y, S.cfg.shop.name || 'Boutique', '#9fe0ff'); }
      const talking = new Set(Lobby.talks(S.cfg, G.db, G.campaign).map(e => e.unit.id));
      for (const u of S.npcs) {
        if (!talking.has(u.sourceId)) continue;
        const [px, py, w] = api.tileRect(u.rx, u.ry);
        const r = Math.max(6, api.TW() * 0.17), cx = px + w / 2, cy = py - r * 0.6 + Math.sin(t / 220) * 2;
        ctx.fillStyle = '#f2c46a'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a1d05'; ctx.font = `900 ${Math.round(r * 1.5)}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy + 1);
      }
    }

    /** Touche pressée dans le lobby (hors dialogue). Renvoie true si elle est traitée. */
    function key(e) {
      const k = e.key;
      if (S.panel) {
        if (e.target.tagName === 'SELECT' && !['x', 'X', 'Escape', 'Backspace', 'Tab'].includes(k)) return true;
        e.preventDefault();
        const items = [...panelEl().querySelectorAll('.lp-focus:not([disabled])')];
        const i = items.indexOf(document.activeElement);
        if (['x', 'X', 'Escape', 'Backspace'].includes(k)) closePanel();
        else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'Tab') { items[(i + 1) % items.length].focus(); api.Music.se('cursor'); }
        else if (k === 'ArrowUp' || k === 'ArrowLeft') { items[(i - 1 + items.length) % items.length].focus(); api.Music.se('cursor'); }
        else if (['z', 'Z', 'Enter', ' '].includes(k) && document.activeElement && document.activeElement.tagName !== 'SELECT') document.activeElement.click();
        return true;
      }
      if (G.menu) return false; // menus du moteur
      if (DIRS[k]) {
        e.preventDefault();
        if (G.busy) return true;
        if (!S.held.includes(k)) S.held.push(k);
        S.walkToken++;
        walkLoop();
        return true;
      }
      if (['z', 'Z', 'Enter', ' '].includes(k)) { e.preventDefault(); if (!G.busy && !S.moving) interact(); return true; }
      if (['x', 'X', 'Backspace'].includes(k)) { e.preventDefault(); if (!G.busy) openMenu(); return true; } // Échap : paramètres (moteur)
      return false;
    }
    function keyup(e) { S.held = S.held.filter(k => k !== e.key); }

    /** Clic sur une case : y aller ; sur un personnage / la table / la boutique : y aller puis interagir. */
    async function click(x, y) {
      if (G.busy || S.panel || G.menu || S.moving) return;
      const thing = thingAt(x, y);
      // devant un personnage / un bâtiment (ou dessus si on ne peut pas s'en approcher), sinon sur la case
      const path = thing ? (pathTo(x, y, true) || (thing.kind !== 'npc' ? pathTo(x, y, false) : null)) : pathTo(x, y, false);
      if (!path) return;
      if (!(await walkPath(path))) return;
      if (thing) { face(x, y); refreshHint(); await interact(thing); }
    }

    return { enabled, enter, leave, key, keyup, click, drawOverlay, refreshHud, closePanel, openMenu, openTeam, commit, get active() { return G.mode === 'lobby'; }, get state() { return S; } };
  }

  root.LobbyScene = { create };
})(self);
