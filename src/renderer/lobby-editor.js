/*
 * Édition d'une map de camp (lobby) directement dans l'éditeur de maps, en mode Unités (F3) :
 *   - palette : départ du héros, tableau des quêtes, marchand, autel d'invocation, personnages présents ;
 *     on choisit un repère puis on clique sur la map pour le placer (clic droit sur un personnage : le retirer) ;
 *   - inspecteur : réglages du camp (héros, or, musique, équipe de départ, boutique, autel) et conversations.
 * Les réglages restent dans game.tfproj (meta.lobby) et les conversations dans data/talks.json.
 */
(function (root) {
  'use strict';

  function create(api) {
    const { h } = api;
    const byId = (list, id) => (list || []).find(e => e.id === id);
    const S = { pick: 'start', spot: -1, addUnit: '' };
    const project = () => api.project();
    const DB = () => api.DB();
    // réglages du camp complétés sur place : l'objet meta.lobby garde son identité (les formulaires y écrivent)
    const cfg = () => {
      const meta = project().meta; if (!meta.lobby) meta.lobby = {};
      const d = Lobby.defaults(meta.lobby);
      for (const k of Object.keys(d)) if (meta.lobby[k] === undefined || (typeof d[k] === 'object' && d[k] !== meta.lobby[k] && !Array.isArray(d[k]) && Object.keys(d[k]).some(x => meta.lobby[k][x] === undefined))) meta.lobby[k] = d[k];
      return meta.lobby;
    };
    const helpers = () => DBEditor.helpers;
    const uName = (id) => { const u = byId(DB().units, id); return u ? u.name : '?'; };
    const isLobbyMap = (m) => !!m && m.kind === 'lobby';
    const active = (m) => cfg().mapId === m.id;
    const changed = () => { api.markDirty(); };

    // ------------------------------------------------------------------
    // Repères
    // ------------------------------------------------------------------
    function targets() {
      const c = cfg(), hero = Lobby.heroOf(c, DB());
      return [['start', `Départ de ${hero ? hero.name : 'héros'}`, '#ffffff'], ['board', c.board.label || 'Tableau des quêtes', '#f2d58a']]
        .concat(c.shop.enabled ? [['shop', c.shop.name || 'Marchand', '#9fe0ff']] : [])
        .concat(c.summon.enabled ? [['summon', c.summon.name || 'Autel', '#d6a8ff']] : []);
    }
    function point(key) { const c = cfg(); return key === 'start' ? c.start : key === 'board' ? c.board : key === 'shop' ? c.shop : key === 'summon' ? c.summon : null; }

    function palette(box, m) {
      const c = cfg();
      box.append(h('div', { class: 'section-head' }, h('h3', {}, 'Camp'),
        h('div', { class: 'head-actions' }, h('button', { class: 'mini', title: 'Tester le camp', html: Icons.icon('play'), onclick: testLobby }))));
      const list = h('div', { class: 'pick-list' });
      if (!active(m)) {
        list.append(h('p', { class: 'note' }, 'Cette map n\'est pas le camp utilisé par le jeu.'),
          h('button', { class: 'small', onclick: () => useAsCamp(m) }, 'Utiliser comme camp du jeu'));
        box.append(list); return;
      }
      list.append(h('div', { class: 'pick-group' }, 'Repères — clique puis place sur la map'));
      for (const [key, label, color] of targets()) {
        const p = point(key);
        list.append(h('div', { class: 'pick' + (S.pick === key ? ' on' : ''), 'data-lobby-pick': key, onclick: () => { S.pick = key; S.spot = -1; api.renderPalette(); api.renderInspector(); api.draw(); } },
          h('span', { class: 'token', style: { background: color, color: '#1b1407' } }, label.slice(0, 1)), h('span', {}, label), h('span', { class: 'meta' }, `${p.x},${p.y}`)));
      }
      list.append(h('div', { class: 'pick-group' }, 'Personnages présents'));
      c.spots.forEach((sp, i) => {
        const key = 'spot' + i;
        list.append(h('div', { class: 'pick' + (S.pick === key ? ' on' : ''), 'data-lobby-pick': key, onclick: () => { S.pick = key; S.spot = i; api.renderPalette(); api.renderInspector(); api.draw(); } },
          api.unitIcon(sp.unitId), h('span', {}, uName(sp.unitId)), h('span', { class: 'meta' }, (sp.after ? 'après ' + Lobby.nameOf(DB(), sp.after) + ' · ' : '') + `${sp.x},${sp.y}`)));
      });
      if (!c.spots.length) list.append(h('p', { class: 'note' }, 'Aucun personnage au camp.'));
      const used = new Set([Lobby.heroOf(c, DB()) && Lobby.heroOf(c, DB()).id, ...c.spots.map(s => s.unitId)]);
      const free = DB().units.filter(u => !used.has(u.id));
      if (free.length) {
        if (!free.some(u => u.id === S.addUnit)) S.addUnit = free[0].id;
        const sel = h('select', { 'data-lobby-add-unit': true }, free.map(u => h('option', { value: u.id }, u.name)));
        sel.value = S.addUnit;
        sel.addEventListener('change', () => { S.addUnit = sel.value; });
        list.append(h('div', { class: 'lobby-add' }, sel, h('button', { class: 'small', 'data-lobby-add': true, onclick: () => addSpot(m, sel.value) }, 'Ajouter')));
      }
      box.append(list);
    }

    function freeTile(m) {
      const c = cfg(), taken = new Set([c.start, ...c.spots].map(p => p.x + ',' + p.y));
      const grid = Rules.buildTerrainGrid(m, DB().tilesets, project().meta.defaultTerrain || 'plain');
      const T = {}; DB().terrains.forEach(t => { T[t.id] = t; });
      for (let r = 1; r < Math.max(m.width, m.height); r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = c.start.x + dx, y = c.start.y + dy;
          if (x < 0 || y < 0 || x >= m.width || y >= m.height || taken.has(x + ',' + y)) continue;
          if (Rules.moveCost(T[grid[y * m.width + x]], 'foot') < Rules.IMPASSABLE) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    }
    function addSpot(m, unitId) {
      api.snapshotProject();
      const c = cfg(), p = freeTile(m);
      c.spots.push({ unitId, x: p.x, y: p.y, after: '' });
      S.spot = c.spots.length - 1; S.pick = 'spot' + S.spot;
      changed(); api.renderAll();
    }
    function useAsCamp(m) {
      api.snapshotProject();
      const c = cfg();
      c.mapId = m.id; c.enabled = true;
      const inside = p => p.x >= 0 && p.y >= 0 && p.x < m.width && p.y < m.height;
      for (const key of ['start', 'board', 'shop', 'summon']) if (!inside(c[key])) Object.assign(c[key], { x: 0, y: 0 });
      c.spots = c.spots.filter(inside);
      changed(); api.renderAll();
    }

    // ------------------------------------------------------------------
    // Carte : dessin et clics
    // ------------------------------------------------------------------
    function overlay(ctx, m, cs) {
      if (!active(m)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
      const c = cfg(), hero = Lobby.heroOf(c, DB());
      const mark = (p, color, text, on) => {
        ctx.strokeStyle = color; ctx.lineWidth = on ? 3 : 2; ctx.strokeRect(p.x * cs.w + 1.5, p.y * cs.h + 1.5, cs.w - 3, cs.h - 3);
        ctx.font = `700 ${Math.max(10, Math.round(cs.h * 0.32))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(text, (p.x + 0.5) * cs.w, p.y * cs.h - 1);
        ctx.fillStyle = color; ctx.fillText(text, (p.x + 0.5) * cs.w, p.y * cs.h - 1);
      };
      c.spots.forEach((sp, i) => { api.drawUnit(sp.unitId, sp.x, sp.y, cs); mark(sp, sp.after ? '#c9a7ff' : '#9be59b', uName(sp.unitId) + (sp.after ? ' *' : ''), S.pick === 'spot' + i); });
      if (hero) api.drawUnit(hero.id, c.start.x, c.start.y, cs);
      for (const [key, label, color] of targets()) mark(point(key), color, key === 'start' ? label.replace('Départ de ', '') + ' (départ)' : label, S.pick === key);
    }
    function spotAt(x, y) { return cfg().spots.findIndex(s => s.x === x && s.y === y); }
    function mouseDown(e, cell, m) {
      if (!active(m)) return;
      const c = cfg(), i = spotAt(cell.x, cell.y);
      if (e.button === 2) {
        if (i < 0) return;
        api.snapshotProject();
        c.spots.splice(i, 1); S.spot = -1; S.pick = 'start';
        changed(); api.renderAll(); return;
      }
      if (S.pick && S.pick.startsWith('spot')) {
        const sp = c.spots[Number(S.pick.slice(4))];
        if (!sp) return;
        if (i >= 0 && c.spots[i] !== sp) { S.pick = 'spot' + i; S.spot = i; api.renderPalette(); api.renderInspector(); api.draw(); return; }
        api.snapshotProject(); sp.x = cell.x; sp.y = cell.y;
      } else if (i >= 0 && S.pick === null) {
        S.pick = 'spot' + i; S.spot = i;
      } else {
        const p = point(S.pick || 'start');
        api.snapshotProject(); p.x = cell.x; p.y = cell.y;
      }
      changed(); api.renderPalette(); api.renderInspector(); api.draw();
    }

    // ------------------------------------------------------------------
    // Inspecteur
    // ------------------------------------------------------------------
    function inspector(box, m) {
      const c = cfg();
      const H = helpers();
      const errors = Lobby.validate(c, DB(), project().maps);
      if (!active(m)) {
        box.append(api.section('Camp', h('p', { class: 'note' }, 'Cette map est une map de camp, mais le jeu utilise ' + (byId(project().maps, c.mapId) ? `« ${byId(project().maps, c.mapId).name} »` : 'aucun camp') + '.'),
          h('div', { class: 'insp-actions' }, h('button', { class: 'small primary', onclick: () => useAsCamp(m) }, 'Utiliser comme camp du jeu'))));
        return;
      }
      const rerender = (k) => { changed(); if (['enabled', 'heroId', 'shop.enabled', 'summon.enabled', 'shop.name', 'summon.name', 'board.label'].includes(k)) api.renderAll(); else api.draw(); };
      box.append(api.section('Camp',
        errors.length ? h('div', {}, errors.map(e => h('p', { class: 'note' }, '⚠ ' + e))) : null,
        UI.form([
          { key: 'enabled', label: 'Le jeu commence au camp et y revient après chaque chapitre', type: 'checkbox' },
          { key: 'name', label: 'Nom du camp', type: 'text' },
          { key: 'heroId', label: 'Héros (personnage que l\'on déplace)', type: 'select', empty: '— premier personnage principal —', options: () => DB().units.map(u => ({ value: u.id, label: u.name })) },
          { type: 'row', fields: [
            { key: 'startGold', label: 'Or au début', type: 'number', min: 0, max: 999999 },
            { key: 'music', label: 'Musique', type: 'select', empty: '— phase joueur —', options: () => H.audioOpts('bgm') }] },
          { key: 'board.label', label: 'Nom du tableau des quêtes', type: 'text' }
        ], c, { onChange: rerender }),
        h('div', { class: 'insp-actions' }, h('button', { class: 'small primary', html: Icons.icon('play'), disabled: !c.enabled || errors.length > 0, onclick: testLobby }, 'Tester le camp'))));

      // personnage sélectionné
      const sp = S.pick && S.pick.startsWith('spot') ? c.spots[Number(S.pick.slice(4))] : null;
      if (sp) {
        box.append(api.section('Personnage présent',
          UI.form([
            { key: 'unitId', label: 'Personnage', type: 'select', options: () => DB().units.map(u => ({ value: u.id, label: u.name })) },
            { key: 'after', label: 'Arrive au camp après', type: 'select', empty: '— dès le début —', options: () => H.doneOpts() }
          ], sp, { onChange: () => { changed(); api.renderAll(); } }),
          h('p', { class: 'muted' }, `Case ${sp.x},${sp.y} : clique sur la map pour le déplacer.`),
          h('div', { class: 'insp-actions' },
            h('button', { class: 'small', onclick: () => newTalk(sp.unitId) }, 'Nouvelle conversation'),
            h('button', { class: 'small danger', html: Icons.icon('trash'), onclick: () => { api.snapshotProject(); c.spots.splice(c.spots.indexOf(sp), 1); S.pick = 'start'; changed(); api.renderAll(); } }, 'Retirer du camp'))));
      }

      // conversations
      const talks = DB().talks || (DB().talks = []);
      const here = new Set(c.spots.map(s => s.unitId));
      const rows = h('div', { class: 'lobby-talks' });
      const sorted = talks.slice().sort((a, b) => (sp ? (b.unitId === sp.unitId) - (a.unitId === sp.unitId) : 0));
      for (const t of sorted) {
        rows.append(h('div', { class: 'lobby-talk' + (sp && t.unitId === sp.unitId ? ' mine' : '') + (here.has(t.unitId) ? '' : ' warn'), 'data-talk': t.id, onclick: () => editTalk(t) },
          h('b', {}, t.name || t.id), h('span', { class: 'muted' }, [uName(t.unitId), t.after ? 'après ' + Lobby.nameOf(DB(), t.after) : '', here.has(t.unitId) ? '' : 'absent du camp'].filter(Boolean).join(' · '))));
      }
      if (!talks.length) rows.append(h('p', { class: 'muted' }, 'Aucune conversation.'));
      box.append(api.section('Conversations', rows,
        h('div', { class: 'insp-actions' }, h('button', { class: 'small', 'data-new-talk': true, onclick: () => newTalk(sp ? sp.unitId : (c.spots[0] || {}).unitId) }, 'Nouvelle conversation')),
        h('p', { class: 'muted' }, 'Un « ! » apparaît au-dessus du personnage quand une conversation est disponible.')));

      // équipe, boutique, autel
      const roster = { initialRoster: Team.initialIds(DB(), project().meta) };
      const rosterForm = UI.form([{ key: 'initialRoster', label: 'Effectif recruté au début de la partie', type: 'multicheck', options: () => DB().units.map(u => ({ value: u.id, label: u.name })) }], roster,
        { onChange: () => { c.initialRoster = roster.initialRoster; changed(); } });
      const hero = Lobby.heroOf(c, DB());
      rosterForm.querySelectorAll('.chip').forEach((b, i) => { if (hero && DB().units[i].id === hero.id) { b.disabled = true; b.title = 'Le héros du camp fait toujours partie de l’effectif.'; } });
      box.append(api.section('Équipe de départ', rosterForm, h('p', { class: 'muted' }, 'Indépendant des personnages placés au camp. Les autres recrutements se règlent dans les fiches Unités.')));
      box.append(api.section('Boutique et autel', UI.form([
        { type: 'row', fields: [{ key: 'shop.enabled', label: 'Boutique', type: 'checkbox' }, { key: 'shop.name', label: 'Nom du marchand', type: 'text' }] },
        { key: 'shop.stock', label: 'Articles en vente', type: 'multicheck', options: () => H.goods(), when: x => x.shop.enabled },
        { type: 'row', fields: [{ key: 'summon.enabled', label: 'Autel d’invocation', type: 'checkbox' }, { key: 'summon.name', label: 'Nom de l’autel', type: 'text' }] },
        { type: 'info', text: 'Prix : onglets Armes et Objets. Bannières d’invocation : Base de données › Invocations.' }
      ], c, { onChange: rerender })));
    }

    function newTalk(unitId) {
      const talks = DB().talks || (DB().talks = []);
      let n = talks.length + 1; while (talks.some(t => t.id === 't_' + n)) n++;
      const t = { id: 't_' + n, name: 'Nouvelle conversation', unitId: unitId || (DB().units[1] || DB().units[0] || {}).id || '', after: '', alive: [], points: 0, orbs: 0, once: true, script: '' };
      talks.push(t); changed();
      editTalk(t, true);
    }
    async function editTalk(t, isNew) {
      const copy = JSON.parse(JSON.stringify(t));
      const result = await UI.modal((box, close) => {
        const body = h('div', { class: 'talk-form' });
        const renderForm = () => body.replaceChildren(UI.form(helpers().talkFields(copy), copy, { onChange: (k) => { if (['unitId', 'after', 'points'].includes(k)) renderForm(); } }));
        renderForm();
        box.append(h('h3', {}, 'Conversation du camp'), body,
          h('div', { class: 'modal-actions' },
            isNew ? null : h('button', { class: 'danger', onclick: () => close('delete') }, 'Supprimer'),
            h('button', { onclick: () => close(null) }, 'Annuler'),
            h('button', { class: 'primary', 'data-talk-ok': true, onclick: () => close('ok') }, 'Enregistrer')));
      }, { wide: true });
      const talks = DB().talks;
      if (result === 'ok') { Object.assign(t, copy); changed(); }
      else if (result === 'delete' || (isNew && !result)) { talks.splice(talks.indexOf(t), 1); changed(); }
      api.renderInspector(); api.draw();
    }

    async function testLobby() { await api.save(); api.playtest(Lobby.LOBBY_SAVE); }

    return { isLobbyMap, palette, overlay, mouseDown, inspector, newTalk, editTalk, useAsCamp, get state() { return S; } };
  }

  root.LobbyEditor = { create };
})(self);
