/* Équipe au camp (base façon Fire Emblem GBA) : tous les recrutés, y compris ceux absents de la map. */
(function (root) {
  'use strict';
  /** Éléments partagés par la base de l'équipe et la fenêtre de formation (preparation.js).
   *  api : { G, h, R, sheetCtx } */
  function parts(api) {
    const { G, h, R } = api;
    const label = slot => { const entry = R.getEntry(G.db, slot.id); return entry ? entry.def.name : slot.id; };
    const WICONS = ['sword', 'lance', 'axe', 'bow', 'anima', 'light', 'dark', 'staff']; // img/ui/weapon-icons.png
    function itemIcon(slot) {
      const e = R.getEntry(G.db, slot.id), i = e && e.kind === 'weapon' ? WICONS.indexOf(e.def.type) : -1;
      return i >= 0 ? h('span', { class: 'tb-wicon', style: { backgroundPosition: `${-i * 16}px 0` } }) : h('span', { class: 'tb-wicon txt' }, '✚');
    }
    function bust(unit) {
      const def = R.byId(G.db.units, unit.sourceId) || {}, src = def.portrait;
      const frame = h('span', { class: 'tb-bust' });
      if (src) { const f = Faces.element(Render.readyImage(G.baseUrl, src), Render.imageUrl(G.baseUrl, src), 'bust'); if (f) frame.append(f); }
      else frame.append(h('b', {}, unit.name.slice(0, 1)));
      return frame;
    }
    /** Sprite de map animé (canvas), sinon l'initiale. */
    function sprite(unit) {
      const sp = api.sheetCtx && api.sheetCtx().mapSpriteOf(unit);
      if (!sp) return h('span', { class: 'tb-sprite txt' }, unit.name.slice(0, 1));
      const cv = h('canvas', { class: 'tb-sprite', width: 32, height: 32 });
      cv.paint = (t) => {
        const g = cv.getContext('2d'); g.clearRect(0, 0, 32, 32); g.imageSmoothingEnabled = false;
        Sprites.drawMapSprite(g, sp.meta, sp.img, 16, 30, 32 / 16 * 16 / (sp.meta.base || 16) * 0.95, { anim: 'idle', t, palette: api.sheetCtx().paletteOf(unit) });
      };
      cv.paint(performance.now());
      return cv;
    }
    function animate(root) {
      const tick = (t) => { if (!root.isConnected) return; root.querySelectorAll('canvas.tb-sprite').forEach(c => c.paint && c.paint(t)); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    /** Aperçu : buste, nom, Nv / E, classe, inventaire avec icônes d'arme. */
    function card(unit) {
      const cls = R.byId(G.db.classes, unit.classId), eq = R.equipped(unit, G.db);
      return h('div', { class: 'tb-card' },
        h('div', { class: 'tb-head' }, bust(unit), h('div', { class: 'tb-id' },
          h('div', { class: 'tb-name' }, unit.name),
          h('div', { class: 'tb-lv' }, h('i', {}, 'Nv'), h('b', {}, String(unit.level)), h('i', {}, 'E'), h('b', {}, String(unit.exp || 0))),
          h('div', { class: 'tb-class' }, cls ? cls.name : '?'))),
        h('div', { class: 'tb-items' }, (unit.inventory || []).length ? unit.inventory.map((slot, i) => h('div', { class: 'tb-item' + (eq && eq.index === i ? ' eq' : '') },
          itemIcon(slot), h('span', {}, label(slot)), h('b', {}, slot.uses > 0 ? String(slot.uses) : '∞'))) : h('div', { class: 'tb-empty' }, 'Inventaire vide')));
    }
    return { label, itemIcon, bust, sprite, animate, card };
  }
  function create(api) {
    const { G, h, R } = api;
    const { itemIcon, bust, sprite, animate, card } = parts(api);
    const state = { id: '', tab: 'skills', view: 'list' };
    const label = slot => { const entry = R.getEntry(G.db, slot.id); return entry ? entry.def.name : slot.id; };
    const apply = result => {
      if (G.mode !== 'lobby' || G.busy) return;
      if (!result.ok) return UI.toast(result.error);
      api.changed(); api.rerender();
    };
    function portrait(unit) {
      const def = R.byId(G.db.units, unit.sourceId) || {}, src = def.portrait;
      const frame = h('span', { class: 'team-portrait' });
      if (src) frame.append(Faces.element(Render.readyImage(G.baseUrl, src), Render.imageUrl(G.baseUrl, src), 'mini'));
      else frame.textContent = unit.name.slice(0, 1);
      return frame;
    }
    // ------------------------------------------------------------------
    // Base de l'équipe façon Fire Emblem GBA : aperçu du personnage à gauche, tous les recrutés en grille à droite.
    // Choisir un personnage (clic / Z) l'affiche ; le choisir à nouveau (ou « Fiche ») ouvre sa fiche (unit-sheet.js).
    // Compétences, Inventaire et Évolution ouvrent la gestion du personnage (vue « gestion »).
    // ------------------------------------------------------------------
    function openSheet(unit) {
      if (!self.UnitSheet || !api.sheetCtx) return;
      const members = api.members();
      // sous la fiche : la gestion du personnage affiché (compétences équipées, inventaire, évolution)
      const manageTab = (tab) => (u) => { state.id = u.sourceId; state.view = tab; state.tab = tab; api.rerender(); };
      UnitSheet.open(unit, api.sheetCtx(), { list: members, title: 'Équipe', actions: [
        { id: 'skills', label: 'Compétences', onClick: manageTab('skills') },
        { id: 'items', label: 'Inventaire', onClick: manageTab('items') },
        { id: 'promotions', label: 'Évolution', onClick: manageTab('promotions') }] }).then(() => { if (state.view === 'list') api.rerender(); });
    }
    function render(body) {
      const members = api.members();
      if (!members.some(u => u.sourceId === state.id)) state.id = members[0] && members[0].sourceId;
      if (!members.length) { body.append(h('p', { class: 'lp-empty' }, 'Aucun personnage disponible.')); return; }
      const unit = members.find(u => u.sourceId === state.id), cls = R.byId(G.db.classes, unit.classId);
      if (state.view && state.view !== 'list') return manage(body, unit, cls);
      // aperçu (à gauche)
      const preview = card(unit);
      const actions = h('div', { class: 'tb-actions' },
        h('div', { class: 'tb-actions-title' }, 'Préparatifs'),
        h('div', { class: 'tb-buttons' },
          h('button', { class: 'lp-focus', 'data-team-sheet': unit.sourceId, onclick: () => openSheet(unit) }, 'Info')),
        h('p', { class: 'tb-hint' }, 'Info (ou choisir à nouveau le personnage) ouvre sa fiche : ← → personnage suivant, C croissances ; Compétences, Inventaire et Évolution sous la fiche.'));
      // grille des recrutés (à droite)
      const grid = h('div', { class: 'tb-grid' }, members.map(u => h('button', {
        class: 'lp-focus tb-unit' + (state.id === u.sourceId ? ' on' : ''), 'data-team-unit': u.sourceId,
        title: `${u.name} — ${(R.byId(G.db.classes, u.classId) || {}).name || '?'} · Nv ${u.level}`,
        onclick: () => { if (state.id === u.sourceId) return openSheet(u); state.id = u.sourceId; api.rerender(); }
      }, sprite(u), h('span', { class: 'tb-uname' }, u.name))));
      const list = h('div', { class: 'tb-list' }, h('div', { class: 'tb-list-head' }, h('span', {}, 'Personnages'), h('b', {}, String(members.length))), grid);
      const root = h('div', { class: 'tb-layout' }, h('div', { class: 'tb-left' }, preview, actions), list);
      body.append(root);
      animate(root);
      const on = grid.querySelector('.tb-unit.on'); if (on) requestAnimationFrame(() => on.scrollIntoView({ block: 'nearest' }));
    }
    /** Gestion d'un personnage : compétences équipées, inventaire / convoi, évolution. */
    function manage(body, unit, cls) {
      const main = h('div', { class: 'team-main' },
        h('div', { class: 'tb-manage-head' },
          h('button', { class: 'lp-focus', 'data-team-back': true, onclick: () => { state.view = 'list'; api.rerender(); } }, '◀ Équipe'),
          bust(unit), h('div', {}, h('h4', {}, unit.name), h('span', { class: 'lp-sub' }, `${cls ? cls.name : '?'} · Nv ${unit.level} · EXP ${unit.exp || 0}`)),
          h('button', { class: 'lp-focus', 'data-team-sheet': unit.sourceId, onclick: () => openSheet(unit) }, 'Fiche')),
        h('div', { class: 'lp-tabs' }, [['skills', 'Compétences'], ['items', 'Inventaire'], ['promotions', 'Évolution']].map(([id, text]) =>
          h('button', { class: 'lp-focus lp-tab' + (state.tab === id ? ' on' : ''), 'data-team-tab': id, onclick: () => { state.view = id; state.tab = id; api.rerender(); } }, text))));
      if (state.tab === 'skills') skills(main, unit);
      else if (state.tab === 'items') inventory(main, unit);
      else promotions(main, unit, cls);
      body.append(main);
    }
    function skills(body, unit) {
      const catalogue = G.db.skills || [], find = id => R.byId(catalogue, id);
      const personal = find(unit.personalSkill), equipped = unit.equippedSkills || [];
      body.append(h('div', { class: 'team-personal' }, h('b', {}, 'Personnelle fixe — ', ...(personal ? (self.SkillIcons ? [SkillIcons.element(personal, 18, 'inline'), ' ' + personal.name] : [`${personal.icon} ${personal.name}`]) : ['aucune'])),
        personal ? h('p', {}, Skills.describe(personal)) : null),
      h('p', { class: 'lp-sub' }, `${equipped.length}/5 compétences équipées. Retirer une compétence la conserve dans le répertoire.`));
      for (let i = 0; i < 5; i++) {
        const current = equipped[i] || '';
        const choices = (unit.learnedSkills || []).filter(id => find(id) && id !== unit.personalSkill && !equipped.some((other, index) => index !== i && other === id));
        const select = h('select', { class: 'lp-focus', 'data-team-skill-slot': String(i), disabled: i > equipped.length, 'aria-label': 'Compétence équipée ' + (i + 1) },
          h('option', { value: '' }, i > equipped.length ? '— utiliser le premier emplacement libre —' : '— emplacement libre —'),
          choices.map(id => h('option', { value: id }, `${find(id).icon} ${find(id).name}`)));
        select.value = current;
        select.addEventListener('change', () => {
          if (G.mode !== 'lobby' || G.busy) return;
          apply(Team.setSkill(unit, select.value, i, catalogue));
        });
        body.append(h('div', { class: 'team-skill-slot' }, h('label', {}, 'Emplacement ' + (i + 1), select),
          find(current) ? h('p', { class: 'lp-sub' }, Skills.describe(find(current))) : null));
      }
      const reserve = (unit.learnedSkills || []).filter(id => id !== unit.personalSkill && !equipped.includes(id) && find(id));
      body.append(h('p', { class: 'lp-sub team-reserve' }, 'Apprises, non équipées : ' + (reserve.map(id => find(id).name).join(', ') || 'aucune')));
    }
    function inventory(body, unit) {
      const equipped = R.equipped(unit, G.db);
      const group = (owner, name, list, capacity) => {
        const rows = h('div', { class: 'team-inventory-list' });
        list.forEach((slot, index) => {
          const entry = R.getEntry(G.db, slot.id), weapon = entry && entry.kind === 'weapon' ? entry.def : null;
          const usable = !weapon || R.canWield(unit, weapon, G.db);
          const controls = h('div', { class: 'team-item-actions' });
          if (owner !== '@convoy') for (const [offset, text] of [[-1, '↑'], [1, '↓']]) controls.append(h('button', {
            class: 'lp-focus', disabled: index + offset < 0 || index + offset >= list.length,
            'aria-label': (offset < 0 ? 'Monter ' : 'Descendre ') + label(slot), 'data-item-move': offset + ':' + index,
            onclick: () => { if (!G.busy) apply(Team.reorder(unit, index, index + offset)); } }, text));
          controls.append(h('button', { class: 'lp-focus', 'data-team-transfer': owner + ':' + index, onclick: () => transfer(owner, index) }, 'Transférer'));
          rows.append(h('div', { class: 'team-item', 'data-team-item-owner': owner },
            h('div', {}, h('b', {}, label(slot), owner !== '@convoy' && equipped && equipped.index === index ? ' · Équipée' : ''),
              h('small', { class: !usable && owner !== '@convoy' ? 'team-warning' : '' }, `${slot.uses > 0 ? slot.uses + ' utilisation(s)' : 'Usages illimités'}` +
                (!usable && owner !== '@convoy' ? ' · Inutilisable par cette classe' : ''))), controls));
        });
        return h('section', { class: 'team-inventory' }, h('h5', {}, `${name} — ${list.length}/${capacity}`), list.length ? rows : h('p', { class: 'lp-empty' }, 'Vide'));
      };
      body.append(h('p', { class: 'lp-sub' }, 'La première arme utilisable est équipée. Les transferts gardent les utilisations restantes ; une destination pleine permet un échange.'),
        group(unit.sourceId, unit.name, unit.inventory, 5), group('@convoy', 'Convoi', G.convoy, G.convoyCap));
    }
    async function transfer(owner, index) {
      if (G.mode !== 'lobby' || G.busy) return;
      G.busy = true;
      try {
        const data = { members: api.members(), convoy: G.convoy, capacity: G.convoyCap };
        const source = Team.container(data, owner), item = source && source.list[index]; if (!item) return;
        const destinations = [{ id: '@convoy', name: 'Convoi', capacity: G.convoyCap, list: G.convoy }]
          .concat(data.members.map(u => ({ id: u.sourceId, name: u.name, capacity: 5, list: u.inventory }))).filter(d => d.id !== owner);
        const chosen = await UI.choose('Transférer ' + label(item), destinations.map(d => ({ value: d.id, label: d.name,
          desc: `${d.list.length}/${d.capacity} emplacements` + (d.list.length >= d.capacity ? ' — complet : échange nécessaire' : '') })), 'Choisis la destination.', { wide: true });
        if (!chosen) return;
        const destination = destinations.find(d => d.id === chosen);
        let swap;
        if (destination.list.length >= destination.capacity) {
          if (!destination.list.length) { UI.toast('Aucune place dans la destination.'); return; }
          swap = await UI.choose('Échanger avec ' + destination.name, destination.list.map((slot, i) => ({ value: i, label: label(slot), desc: `${slot.uses > 0 ? slot.uses + ' utilisation(s)' : 'Usages illimités'}` })), 'L’objet choisi prendra la place de ' + label(item) + ' dans son rangement d’origine.');
          if (swap === null) return;
        }
        const result = Team.transfer(data, owner, chosen, index, swap);
        if (!result.ok) UI.toast(result.error); else { api.changed(); UI.toast('Inventaires mis à jour.'); }
      } finally { G.busy = false; api.rerender(); }
    }
    function promotions(body, unit, cls) {
      const options = Promotions.options(unit, G.db);
      body.append(h('p', { class: 'lp-sub' }, 'Les promotions au camp utilisent les mêmes conditions et bonus qu’en bataille, sans consommer de tour. Place le sceau requis dans l’inventaire du personnage.'),
        h('button', { class: 'lp-focus', onclick: () => api.showEvolution(unit) }, 'Voir l’arbre d’évolution'));
      for (const option of options) body.append(h('div', { class: 'team-promotion' }, h('b', {}, option.target ? option.target.name : 'Classe introuvable'),
        h('p', { class: option.available ? 'lp-sub' : 'team-warning' }, option.available ? 'Disponible' : option.reasons.join(' '))));
      if (!options.length) body.append(h('p', { class: 'lp-empty' }, `${cls ? cls.name : 'Cette classe'} n’a pas de promotion.`));
      else body.append(h('button', { class: 'lp-focus', 'data-team-promote': true, onclick: async () => {
        if (G.busy) return;
        await api.openPromotion(unit); api.changed(); api.rerender();
      } }, 'Comparer les promotions'));
    }
    return { render, state };
  }
  root.TeamPanel = { create, parts };
})(self);
