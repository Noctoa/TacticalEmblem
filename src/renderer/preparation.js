/* Préparatifs : effectif, aperçu de la carte et échange des positions de départ. */
(function (root) {
  'use strict';
  function create(api) {
    const { G, h, R } = api;
    const S = { members: [], plan: [], focus: '', onStart: null, onCancel: null };
    const panel = () => document.querySelector('#preparation');
    const terrainAt = (x, y) => Locks.terrainAt(G.chapter, G.db, x, y, G.openedDoors || new Set(), G.terrains[G.tgrid[y * G.map.width + x]] || null);
    function close() { panel().classList.add('hidden'); panel().innerHTML = ''; document.body.classList.remove('in-preparation'); }
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
      const active = document.activeElement, focusAttribute = ['data-deploy-toggle', 'data-deploy-unit', 'data-deploy-slot', 'data-deploy-reset'].find(key => active && active.hasAttribute(key));
      const focusValue = focusAttribute && active.getAttribute(focusAttribute);
      const box = panel(), ch = G.chapter, required = Deployment.forced(ch, G.db), messages = errors();
      const members = Deployment.eligible(ch, S.members), unit = S.members.find(u => u.sourceId === S.focus);
      box.innerHTML = '';
      box.append(h('header', { class: 'prep-header' }, h('div', {}, h('h2', {}, 'Préparatifs'), h('p', {}, Lobby.actLabel(G.db, ch.id))),
        h('b', { 'data-deploy-count': true }, `${S.plan.length}/${Deployment.limit(ch)} déployés`)),
      h('p', { class: 'prep-intro' }, 'Choisis les participants puis sélectionne un personnage et une case de départ. Cliquer une case occupée échange les positions. Les alliés verts gardent leur placement.' ));
      const roster = h('div', { class: 'prep-roster' }, members.map(u => {
        const selected = S.plan.some(p => p.unitId === u.sourceId), imposed = required.includes(u.sourceId);
        const checkbox = h('input', { type: 'checkbox', checked: selected, disabled: imposed, 'data-deploy-toggle': u.sourceId, 'aria-label': 'Déployer ' + u.name,
          onchange: () => { S.focus = u.sourceId; change(Deployment.toggle(ch, G.db, members, S.plan, u.sourceId, terrainAt)); } });
        const cls = R.byId(G.db.classes, u.classId);
        return h('div', { class: 'prep-member' + (S.focus === u.sourceId ? ' on' : '') }, checkbox,
          h('button', { 'data-deploy-unit': u.sourceId, onclick: () => { S.focus = u.sourceId; render(); } }, api.portrait(u, 'mini'),
            h('span', {}, h('b', {}, u.name, imposed ? ' · Imposé' : ''), h('small', {}, `${cls ? cls.name : '?'} · Nv ${u.level}${selected ? ' · Déployé' : ' · Réserve'}`))));
      }));
      if (!members.length) roster.append(h('p', {}, 'Aucun personnage disponible.'));
      const detail = h('div', { class: 'prep-detail' });
      if (unit) {
        const skills = [unit.personalSkill, ...(unit.equippedSkills || [])].filter(Boolean).map(id => (R.byId(G.db.skills, id) || {}).name || id);
        detail.append(h('h3', {}, unit.name), h('p', {}, R.STATS.map(k => `${R.STAT_LABELS[k]} ${unit.stats[k]}`).join(' · ')),
          h('p', {}, 'Équipement : ' + (unit.inventory.map(slot => { const e = R.getEntry(G.db, slot.id); return `${e ? e.def.name : slot.id} (${slot.uses || '∞'})`; }).join(', ') || 'aucun')),
          h('p', {}, 'Compétences : ' + (skills.join(', ') || 'aucune')));
        if (!S.plan.some(p => p.unitId === unit.sourceId)) detail.append(h('p', { class: 'prep-muted' }, 'En réserve. Coche ce personnage pour le déployer.'));
      }
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
      box.append(h('div', { class: 'prep-layout' }, h('section', {}, h('h3', {}, 'Participants'), roster, detail),
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
        } }, 'Commencer la bataille')));
      if (focusAttribute) [...box.querySelectorAll('[' + focusAttribute + ']')].find(el => el.getAttribute(focusAttribute) === focusValue)?.focus({ preventScroll: true });
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); api.openSettings(); }
      // Les boutons, cases à cocher et Tab gardent leur comportement natif.
    }
    return { open, close, key, errors, plan: () => S.plan.map(p => ({ ...p })) };
  }
  root.Preparation = { create };
})(self);
