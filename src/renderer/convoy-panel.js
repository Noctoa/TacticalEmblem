/*
 * Convoi au camp (lobby) : menu du camp › Convoi. On choisit un personnage de l'équipe, puis on dépose ses objets
 * dans le convoi ou on y prend des armes et objets (rangés par catégorie, comme le convoi des Fire Emblem GBA).
 * Les mouvements passent par Team.transfer (mêmes règles que l'onglet Inventaire de l'équipe) : utilisations gardées,
 * 5 objets par personnage, capacité du convoi ; inventaire plein → échange avec un de ses objets.
 *
 *   api : { G, h, R, members, rerender, changed, itemIcon }
 */
(function (root) {
  'use strict';
  const CATEGORIES = [['all', 'Tout'], ['sword', 'Épées'], ['lance', 'Lances'], ['axe', 'Haches'], ['bow', 'Arcs'], ['anima', 'Anima'],
    ['light', 'Lumière'], ['dark', 'Ténèbres'], ['staff', 'Bâtons'], ['item', 'Objets']];
  const MAX = 5;

  function create(api) {
    const { G, h, R } = api;
    const state = { unitId: null, cat: 'all' };
    const entry = (slot) => R.getEntry(G.db, slot.id);
    const label = (slot) => { const e = entry(slot); return e ? e.def.name : slot.id; };
    const catOf = (slot) => { const e = entry(slot); return e && e.kind === 'weapon' ? e.def.type : 'item'; };
    const uses = (slot) => (slot.uses > 0 ? String(slot.uses) : '∞');
    const typeName = (slot) => { const e = entry(slot); return e && e.kind === 'weapon' ? (R.WEAPON_TYPES.find(t => t.id === e.def.type) || {}).name || e.def.type : 'Objet'; };
    const order = (a, b) => CATEGORIES.findIndex(c => c[0] === catOf(a.slot)) - CATEGORIES.findIndex(c => c[0] === catOf(b.slot)) || label(a.slot).localeCompare(label(b.slot));

    /** Équipe du camp et personnage choisi (le premier par défaut). */
    function current() {
      const list = api.members();
      const unit = list.find(u => u.sourceId === state.unitId) || list[0] || null;
      state.unitId = unit ? unit.sourceId : null;
      return { list, unit };
    }
    function data() { return { members: api.members(), convoy: G.convoy, capacity: G.convoyCap }; }
    function done(result, message) {
      if (!result.ok) UI.toast(result.error);
      else { api.changed(); if (message) UI.toast(message); }
      api.rerender();
    }
    function deposit(unit, index) {
      if (G.mode !== 'lobby' || G.busy) return;
      done(Team.transfer(data(), unit.sourceId, '@convoy', index));
    }
    async function take(unit, index) {
      if (G.mode !== 'lobby' || G.busy) return;
      const item = G.convoy[index]; if (!item) return;
      if (unit.inventory.length < MAX) return done(Team.transfer(data(), '@convoy', unit.sourceId, index));
      // inventaire plein : échanger avec un de ses objets
      G.busy = true;
      let swap = null;
      try {
        swap = await UI.choose(`Échanger ${label(item)}`, unit.inventory.map((slot, i) => ({ value: i, label: label(slot), desc: `${typeName(slot)} · ${uses(slot)}` })),
          `L'inventaire de ${unit.name} est plein : l'objet choisi va dans le convoi.`);
      } finally { G.busy = false; }
      if (swap === null || swap === undefined) return api.rerender();
      done(Team.transfer(data(), '@convoy', unit.sourceId, index, swap), 'Objets échangés.');
    }
    function depositAll(unit) {
      if (G.mode !== 'lobby' || G.busy) return;
      let n = 0;
      while (unit.inventory.length && G.convoy.length < G.convoyCap && Team.transfer(data(), unit.sourceId, '@convoy', 0).ok) n++;
      if (n) api.changed();
      UI.toast(n ? `${n} objet(s) déposé(s).` : 'Le convoi est plein.');
      api.rerender();
    }

    function render(body) {
      const { list, unit } = current();
      if (!unit) { body.append(h('p', { class: 'lp-empty' }, 'Personne dans l’équipe.')); return; }
      const full = G.convoy.length >= G.convoyCap;
      // personnages
      body.append(h('div', { class: 'cvp-units' }, list.map(u => h('button', { class: 'lp-focus lp-tab' + (u === unit ? ' on' : ''), 'data-convoy-unit': u.sourceId,
        onclick: () => { state.unitId = u.sourceId; api.rerender(); } }, `${u.name} ${u.inventory.length}/${MAX}`))));
      // inventaire du personnage
      const equipped = R.equipped(unit, G.db);
      const inv = h('section', { class: 'cvp-col', 'data-convoy-inventory': unit.sourceId },
        h('div', { class: 'cvp-col-head' }, h('h5', {}, `${unit.name} — ${unit.inventory.length}/${MAX}`),
          h('button', { class: 'lp-focus', 'data-convoy-deposit-all': true, disabled: !unit.inventory.length || full, onclick: () => depositAll(unit) }, 'Tout déposer')),
        unit.inventory.length ? unit.inventory.map((slot, i) => {
          const e = entry(slot), usable = !(e && e.kind === 'weapon') || R.canWield(unit, e.def, G.db);
          return h('div', { class: 'cvp-item' + (usable ? '' : ' off') }, api.itemIcon(slot),
            h('span', { class: 'cvp-name' }, label(slot), equipped && equipped.index === i ? h('i', { class: 'cvp-eq' }, 'E') : null),
            h('b', { class: 'cvp-uses' }, uses(slot)),
            h('button', { class: 'lp-focus', 'data-convoy-deposit': String(i), disabled: full, title: full ? 'Le convoi est plein' : '', onclick: () => deposit(unit, i) }, 'Déposer →'));
        }) : h('p', { class: 'lp-empty' }, 'Inventaire vide'));
      // convoi, par catégorie
      const rows = G.convoy.map((slot, i) => ({ slot, i })).sort(order);
      const count = (c) => (c === 'all' ? rows.length : rows.filter(r => catOf(r.slot) === c).length);
      if (state.cat !== 'all' && !count(state.cat)) state.cat = 'all';
      const shown = rows.filter(r => state.cat === 'all' || catOf(r.slot) === state.cat);
      const conv = h('section', { class: 'cvp-col', 'data-convoy-list': true },
        h('div', { class: 'cvp-col-head' }, h('h5', {}, `Convoi — ${G.convoy.length}/${G.convoyCap}`)),
        h('div', { class: 'cvp-cats' }, CATEGORIES.filter(([c]) => c === 'all' || count(c)).map(([c, name]) => h('button', {
          class: 'lp-focus lp-tab' + (state.cat === c ? ' on' : ''), 'data-convoy-cat': c, onclick: () => { state.cat = c; api.rerender(); } }, `${name} ${count(c)}`))),
        shown.length ? h('div', { class: 'cvp-scroll' }, shown.map(({ slot, i }) => {
          const e = entry(slot), usable = !(e && e.kind === 'weapon') || R.canWield(unit, e.def, G.db);
          return h('div', { class: 'cvp-item' + (usable ? '' : ' off'), title: usable ? '' : `${unit.name} ne peut pas manier cette arme` },
            h('button', { class: 'lp-focus', 'data-convoy-take': String(i), onclick: () => take(unit, i) }, unit.inventory.length >= MAX ? '⇄ Échanger' : '← Prendre'),
            api.itemIcon(slot), h('span', { class: 'cvp-name' }, label(slot)), h('b', { class: 'cvp-uses' }, uses(slot)));
        })) : h('p', { class: 'lp-empty' }, 'Le convoi est vide'));
      body.append(h('div', { class: 'cvp-cols' }, inv, conv),
        h('p', { class: 'lp-sub' }, 'Les objets grisés ne sont pas maniables par ce personnage. Inventaire plein : « Échanger » renvoie un de ses objets au convoi.'));
    }
    return { render, state };
  }
  root.ConvoyPanel = { create, CATEGORIES };
})(self);
