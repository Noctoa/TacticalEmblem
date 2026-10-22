/* Préparatifs au camp : tous les recrutés, y compris ceux absents de la map. */
(function (root) {
  'use strict';
  function create(api) {
    const { G, h, R } = api;
    const state = { id: '', tab: 'skills' };
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
    function render(body) {
      const members = api.members();
      if (!members.some(u => u.sourceId === state.id)) state.id = members[0] && members[0].sourceId;
      body.append(h('div', { class: 'team-toolbar' }, h('p', { class: 'lp-sub' }, `${members.length} personnage(s) recruté(s). Les préparatifs seront utilisés lors de leur prochain déploiement.`),
        h('button', { class: 'lp-focus', 'data-team-save': true, onclick: () => api.openSettings('save') }, 'Sauvegarder')));
      if (!members.length) { body.append(h('p', { class: 'lp-empty' }, 'Aucun personnage disponible.')); return; }
      const unit = members.find(u => u.sourceId === state.id), cls = R.byId(G.db.classes, unit.classId);
      const roster = h('div', { class: 'team-roster' }, members.map(u => h('button', { class: 'lp-focus team-member' + (state.id === u.sourceId ? ' on' : ''), 'data-team-unit': u.sourceId,
        onclick: () => { state.id = u.sourceId; api.rerender(); } }, portrait(u),
        h('span', {}, h('b', {}, u.name), h('small', {}, `${(R.byId(G.db.classes, u.classId) || {}).name || '?'} · Nv ${u.level}`)))));
      // fiche façon Radiant Dawn (unit-sheet.js) ; sinon l'ancien résumé
      const head = self.UnitSheet && api.sheetCtx
        ? h('div', { class: 'team-sheet', onclick: (e) => { const b = e.target.closest('[data-sheet-page]'); if (b) state.sheetPage = b.dataset.sheetPage; } }, UnitSheet.element(unit, api.sheetCtx(), { scale: 2, page: state.sheetPage || 'stats' }))
        : [h('div', { class: 'team-heading' }, h('h4', {}, unit.name), h('span', {}, `${cls ? cls.name : '?'} · Nv ${unit.level} · EXP ${unit.exp}`)),
          h('div', { class: 'team-stats' }, R.STATS.map(key => h('span', {}, `${R.STAT_LABELS[key]} ${unit.stats[key]}`)), h('span', {}, `Dép ${unit.mov}`))];
      const main = h('div', { class: 'team-main' }, head,
      h('div', { class: 'lp-tabs' }, [['skills', 'Compétences'], ['items', 'Inventaire'], ['promotions', 'Évolution']].map(([id, text]) =>
        h('button', { class: 'lp-focus lp-tab' + (state.tab === id ? ' on' : ''), 'data-team-tab': id, onclick: () => { state.tab = id; api.rerender(); } }, text))));
      if (state.tab === 'skills') skills(main, unit);
      else if (state.tab === 'items') inventory(main, unit);
      else promotions(main, unit, cls);
      body.append(h('div', { class: 'team-layout' }, roster, main));
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
    return { render };
  }
  root.TeamPanel = { create };
})(self);
