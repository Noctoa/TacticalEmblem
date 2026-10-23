/* Préparatifs : formation (fenêtre de choix des participants, façon base de l'équipe), aperçu de la carte
 * et échange des positions de départ. */
(function (root) {
  'use strict';
  function create(api) {
    const { G, h, R } = api;
    const S = { members: [], plan: [], focus: '', onStart: null, onCancel: null, formation: null, sheet: false };
    const parts = () => TeamPanel.parts(api);
    const panel = () => document.querySelector('#preparation');
    const terrainAt = (x, y) => Locks.terrainAt(G.chapter, G.db, x, y, G.openedDoors || new Set(), G.terrains[G.tgrid[y * G.map.width + x]] || null);
    function close() { closeFormation(); panel().classList.add('hidden'); panel().innerHTML = ''; document.body.classList.remove('in-preparation'); }
    function open(members, saved, onStart, onCancel) {
      Object.assign(S, { members, onStart, onCancel, plan: Deployment.initial(G.chapter, G.db, members, terrainAt, saved) });
      S.focus = S.plan[0] && S.plan[0].unitId || (Deployment.eligible(G.chapter, members)[0] || {}).sourceId || '';
      document.body.classList.add('in-preparation'); panel().classList.remove('hidden'); render();
      if (saved && JSON.stringify(saved) !== JSON.stringify(S.plan)) UI.toast('Déploiement ajusté aux personnages et aux cases actuellement disponibles.');
    }
    const errors = () => Deployment.errors(G.chapter, G.db, S.members, S.plan, terrainAt);
    function change(result) {
      if (!result.ok) { UI.toast(result.error); render(); return; }
      S.plan = result.plan; render();
    }
    function render() {
      const active = document.activeElement, focusAttribute = ['data-deploy-formation', 'data-deploy-unit', 'data-deploy-slot', 'data-deploy-reset'].find(key => active && active.hasAttribute(key));
      const focusValue = focusAttribute && active.getAttribute(focusAttribute);
      const box = panel(), ch = G.chapter, required = Deployment.forced(ch, G.db), messages = errors();
      const members = Deployment.eligible(ch, S.members), unit = S.members.find(u => u.sourceId === S.focus);
      box.innerHTML = '';
      box.append(h('header', { class: 'prep-header' }, h('div', {}, h('h2', {}, 'Préparatifs'), h('p', {}, Lobby.actLabel(G.db, ch.id))),
        h('b', { 'data-deploy-count': true }, `${S.plan.length}/${Deployment.limit(ch)} déployés`)),
      h('p', { class: 'prep-intro' }, 'Formation : choisis qui part au combat. Sélectionne ensuite un déployé puis une case de départ ; une case occupée échange les positions. Les alliés verts gardent leur placement.' ));
      // formation : bouton vers la fenêtre de choix + les déployés (choisir l'un d'eux puis une case pour le placer)
      const deployed = S.plan.map(p => members.find(u => u.sourceId === p.unitId)).filter(Boolean);
      const formation = h('div', { class: 'prep-formation' },
        h('button', { class: 'prep-formation-open', 'data-deploy-formation': true, onclick: openFormation },
          h('b', {}, 'Formation'), h('small', {}, `${S.plan.length}/${Deployment.limit(ch)} participants · choisir qui part au combat`)),
        h('div', { class: 'prep-lineup' }, deployed.map(u => h('button', { class: 'prep-chip' + (S.focus === u.sourceId ? ' on' : ''), 'data-deploy-unit': u.sourceId,
          title: 'Choisir ' + u.name + ' puis une case de départ', onclick: () => { S.focus = u.sourceId; render(); } }, parts().sprite(u), h('span', {}, u.name),
          required.includes(u.sourceId) ? h('i', { title: 'Imposé' }, '★') : null))),
        !members.length ? h('p', { class: 'prep-muted' }, 'Aucun personnage disponible.') : null);
      parts().animate(formation);
      const mapBox = h('div', { class: 'prep-map-box' }), canvas = h('canvas', { 'data-deploy-map': true, 'aria-label': 'Aperçu des cases de départ' });
      const map = G.map, previewHeight = Math.max(180, Math.min(370, window.innerHeight - 420));
      const scale = Math.min(2, 580 / (map.width * map.tileWidth), previewHeight / (map.height * map.tileHeight));
      canvas.width = Math.ceil(map.width * map.tileWidth * scale); canvas.height = Math.ceil(map.height * map.tileHeight * scale);
      const ctx = canvas.getContext('2d'), tw = map.tileWidth * scale, th = map.tileHeight * scale;
      ctx.imageSmoothingEnabled = false; Render.drawMap(ctx, map, { scale, baseUrl: G.baseUrl, tilesets: G.db.tilesets });
      const scouts = S.plan.map(p => ({ ...p, team: 'player', hp: 1 })).concat(G.units.filter(u => u.team === 'ally'));
      const visible = Weather.visibleTiles(ch.weather, scouts, 'player', map.width, map.height);
      if (visible !== null) {
        ctx.fillStyle = 'rgba(10,18,30,.62)';
        for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!visible.has(x + ',' + y))
          ctx.fillRect(x * tw, y * th, tw + .5, th + .5);
      }
      const marker = (p, color, text) => {
        ctx.fillStyle = color; ctx.fillRect(p.x * tw + 1, p.y * th + 1, tw - 2, th - 2);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(p.x * tw + 1, p.y * th + 1, tw - 2, th - 2);
        ctx.font = `bold ${Math.max(8, Math.min(15, th * .65))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(text, (p.x + .5) * tw, (p.y + .5) * th);
      };
      for (const v of Villages.list(ch)) marker(v, '#987328', Villages.visited(G.campaign, ch, v) && !v.repeatOnReplay ? '✓' : 'V');
      for (const kind of Locks.lists) for (const object of Locks.list(ch, kind)) marker(object, '#925a2c', kind === 'chests' ? 'C' : 'P');
      for (const e of ch.enemies || []) if (!e.eventOnly && !(e.appearTurn > 0) && Weather.canSee(visible, e)) marker(e, '#a13232', e.isBoss ? '★' : '');
      for (const a of ch.allies || []) if (!ch.players.some(p => p.unitId === a.unitId) && !G.campaign.dead.includes(a.unitId)) marker(a, '#258344', 'A');
      Deployment.slots(ch).forEach((p, i) => marker(p, S.plan.some(q => q.unitId === S.focus && q.x === p.x && q.y === p.y) ? '#a37c19' : '#2859a8', String(i + 1)));
      canvas.addEventListener('click', e => {
        const rect = canvas.getBoundingClientRect(), x = Math.floor((e.clientX - rect.left) / rect.width * map.width), y = Math.floor((e.clientY - rect.top) / rect.height * map.height);
        const point = Deployment.slots(ch).find(p => p.x === x && p.y === y);
        if (point) change(Deployment.move(ch, members, S.plan, S.focus, point, terrainAt));
      });
      mapBox.append(canvas, h('p', { class: 'prep-muted' }, 'Bleu : départ · Or : sélection · Rouge : ennemi · Vert : allié · V : village · C : coffre · P : porte'));
      const positions = h('div', { class: 'prep-positions' }, Deployment.slots(ch).map((p, i) => {
        const assigned = S.plan.find(q => q.x === p.x && q.y === p.y), u = assigned && members.find(u => u.sourceId === assigned.unitId);
        return h('button', { 'data-deploy-slot': String(i), disabled: !S.plan.some(q => q.unitId === S.focus),
          onclick: () => change(Deployment.move(ch, members, S.plan, S.focus, p, terrainAt)) }, `${i + 1} · ${u ? u.name : 'Libre'} (${p.x}, ${p.y})`);
      }));
      box.append(...[h('div', { class: 'prep-layout' }, h('section', {}, h('h3', {}, 'Formation'), formation),
        h('section', {}, h('h3', {}, 'Positions de départ'), mapBox, positions)),
      h('p', { class: 'prep-objective' }, Mission.objectives(ch).map(o => Mission.label(o, ch)).join(ch.victoryMode === 'any' ? ' OU ' : ' ET ') +
        (visible === null ? ` · ${ch.enemies.filter(e => !(e.appearTurn > 0)).length} ennemi(s), ${ch.enemies.filter(e => e.appearTurn > 0).length} renfort(s)` :
          ` · ${ch.enemies.filter(e => !e.eventOnly && !(e.appearTurn > 0) && Weather.canSee(visible, e)).length} ennemi(s) repéré(s)`)),
      Weather.normalize(ch.weather).type !== 'none' ? h('p', { class: 'prep-muted' }, 'Météo : ' + Weather.label(ch.weather) + ' · ' + Weather.describe(ch.weather)) : null,
      SideObjectives.list(ch).length ? h('details', { class: 'prep-secondary', open: true }, h('summary', {}, 'Objectifs secondaires (facultatifs)'),
        ...SideObjectives.list(ch).map(ob => h('p', { 'data-prep-secondary': ob.id },
          h('b', {}, SideObjectives.label(ob, ch, G.db) + ' · '), SideObjectives.description(ob, ch, G.db),
          SideObjectives.rewardText(ob, G.db) ? ' · ' + SideObjectives.rewardText(ob, G.db) : '',
          !ob.repeatOnReplay && SideObjectives.claimed(G.campaign, ch, ob) ? ' · récompense déjà obtenue' : '',
          ob.type === 'protect' && !S.plan.some(p => p.unitId === ob.target) && !(ch.allies || []).some(p => p.unitId === ob.target) ? ' · ⚠ absent des participants' : ''))) : null,
      h('div', { class: 'prep-errors', role: 'status' }, messages.map(text => h('p', {}, text))),
      h('footer', { class: 'prep-actions' },
        G.lobbyOn ? h('button', { 'data-deploy-cancel': true, onclick: () => { close(); S.onCancel(); } }, 'Retour au camp') : null,
        h('button', { 'data-deploy-reset': true, onclick: () => { S.plan = Deployment.initial(ch, G.db, S.members, terrainAt); render(); } }, 'Sélection par défaut'),
        h('button', { 'data-deploy-save': true, onclick: () => api.openSettings('save') }, 'Sauvegarder…'),
        h('button', { class: 'primary', 'data-deploy-start': true, disabled: messages.length > 0, onclick: () => {
          if (errors().length) return render();
          const plan = S.plan.map(p => ({ ...p })); close(); S.onStart(plan);
        } }, 'Commencer la bataille'))].filter(Boolean)); // Element.append écrirait « null »
      if (S.formation) drawFormation();
      if (focusAttribute) [...box.querySelectorAll('[' + focusAttribute + ']')].find(el => el.getAttribute(focusAttribute) === focusValue)?.focus({ preventScroll: true });
    }
    // ------------------------------------------------------------------
    // Fenêtre « Formation » (même présentation que la base de l'équipe) : aperçu à gauche avec « Info »,
    // grille des personnages disponibles à droite. Choisir un personnage le fait partir au combat ou le laisse en réserve.
    // ------------------------------------------------------------------
    function openFormation() {
      if (S.formation) return;
      S.formation = { preview: S.focus || ((Deployment.eligible(G.chapter, S.members)[0] || {}).sourceId) };
      S.formation.back = h('div', { class: 'formation-back', onmousedown: (e) => { if (e.target === S.formation.back) { e.preventDefault(); closeFormation(); } } });
      document.body.append(S.formation.back); // hors du #hud (masqué pendant les préparatifs)
      drawFormation(true);
    }
    function closeFormation() {
      if (!S.formation) return;
      S.formation.back.remove(); S.formation = null;
      const b = document.querySelector('[data-deploy-formation]'); if (b) b.focus({ preventScroll: true });
    }
    function toggleUnit(u) {
      const ch = G.chapter, members = Deployment.eligible(ch, S.members);
      S.formation.preview = u.sourceId;
      if (Deployment.forced(ch, G.db).includes(u.sourceId)) { UI.toast(u.name + ' est imposé pour cette bataille.'); return drawFormation(); }
      S.focus = u.sourceId;
      change(Deployment.toggle(ch, G.db, members, S.plan, u.sourceId, terrainAt));
    }
    function infoSheet() {
      const members = Deployment.eligible(G.chapter, S.members), u = members.find(m => m.sourceId === S.formation.preview);
      if (!u || !self.UnitSheet || !api.sheetCtx) return;
      S.sheet = true;
      UnitSheet.open(u, api.sheetCtx(), { list: members, title: 'Formation' }).then(() => { S.sheet = false; if (S.formation) drawFormation(true); });
    }
    function drawFormation(focus) {
      const F = S.formation, ch = G.chapter, P = parts(), required = Deployment.forced(ch, G.db), limit = Deployment.limit(ch);
      const members = Deployment.eligible(ch, S.members);
      if (!members.some(u => u.sourceId === F.preview)) F.preview = members[0] && members[0].sourceId;
      const active = document.activeElement && document.activeElement.getAttribute('data-deploy-toggle');
      const preview = members.find(u => u.sourceId === F.preview);
      const left = h('div', { class: 'tb-left' }, preview ? P.card(preview) : h('div', { class: 'tb-card tb-empty' }, 'Aucun personnage disponible.'),
        h('div', { class: 'tb-actions' }, h('div', { class: 'tb-actions-title' }, 'Formation'),
          h('div', { class: 'tb-buttons' },
            h('button', { 'data-formation-info': true, disabled: !preview, onclick: infoSheet }, 'Info'),
            h('button', { 'data-formation-close': true, onclick: closeFormation }, 'Terminer')),
          h('p', { class: 'tb-hint' }, 'Choisir un personnage le fait partir au combat (nom vert) ou le remet en réserve. ★ : imposé.')));
      const grid = h('div', { class: 'tb-grid' }, members.map(u => {
        const on = S.plan.some(p => p.unitId === u.sourceId), imposed = required.includes(u.sourceId);
        const cls = R.byId(G.db.classes, u.classId);
        return h('button', { class: 'tb-unit' + (F.preview === u.sourceId ? ' on' : '') + (on ? ' deployed' : ' reserve') + (imposed ? ' locked' : ''),
          'data-deploy-toggle': u.sourceId, 'aria-pressed': on ? 'true' : 'false', 'aria-label': (on ? 'Retirer ' : 'Déployer ') + u.name,
          title: `${u.name} — ${cls ? cls.name : '?'} · Nv ${u.level}${imposed ? ' · imposé' : on ? ' · part au combat' : ' · réserve'}`,
          onclick: () => toggleUnit(u),
          onmouseenter: () => { if (F.preview !== u.sourceId) { F.preview = u.sourceId; drawFormation(); } },
          onfocus: () => { if (F.preview !== u.sourceId) { F.preview = u.sourceId; drawFormation(); } }
        }, P.sprite(u), h('span', { class: 'tb-uname' }, u.name), imposed ? h('i', { class: 'tb-lock' }, '★') : null);
      }));
      const remaining = Math.max(0, limit - S.plan.length);
      const list = h('div', { class: 'tb-list' }, h('div', { class: 'tb-list-head' },
        h('span', {}, 'Choisir', h('small', {}, ` · ${remaining} restant${remaining > 1 ? 's' : ''}`)),
        h('b', { 'data-formation-count': true }, `${S.plan.length}/${limit}`)), grid);
      const win = h('div', { class: 'formation-win' },
        h('div', { class: 'formation-title' }, h('b', {}, 'Formation'), h('span', {}, Lobby.actLabel(G.db, ch.id))),
        h('div', { class: 'tb-layout' }, left, list));
      F.back.replaceChildren(win);
      P.animate(win);
      const target = grid.querySelector(`[data-deploy-toggle="${active || (focus ? F.preview : '')}"]`);
      if (target) target.focus({ preventScroll: true });
      const on = grid.querySelector('.tb-unit.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function formationKey(e) {
      const k = e.key;
      if (['Escape', 'x', 'X', 'Backspace'].includes(k)) { e.preventDefault(); return closeFormation(); }
      if (k === 'c' || k === 'C' || k === 'r' || k === 'R') { e.preventDefault(); return infoSheet(); }
      const cells = [...document.querySelectorAll('.formation-win [data-deploy-toggle]')];
      if (!cells.length) return;
      const at = Math.max(0, cells.indexOf(document.activeElement)), step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[k];
      if (step) { e.preventDefault(); const next = cells[Math.min(cells.length - 1, Math.max(0, (cells.includes(document.activeElement) ? at + step : 0)))]; next.focus(); }
      else if (k === 'z' || k === 'Z') { e.preventDefault(); (cells.includes(document.activeElement) ? document.activeElement : cells[at]).click(); }
    }
    function key(e) {
      if (S.sheet) return;
      if (S.formation) return formationKey(e);
      if (e.key === 'Escape') { e.preventDefault(); api.openSettings(); }
      // Les boutons, cases à cocher et Tab gardent leur comportement natif.
    }
    return { open, close, key, errors, openFormation, closeFormation, plan: () => S.plan.map(p => ({ ...p })) };
  }
  root.Preparation = { create };
})(self);
