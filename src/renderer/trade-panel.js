(function (root) {
  'use strict';
  function create(api) {
    const { G, h, R } = api;
    const panel = () => document.querySelector('#trade');
    let actor = null, partner = null, selected = null, cursor = { side: 0, index: 0 }, notice = '';
    const owners = () => [actor, partner];
    const label = slot => (R.getEntry(G.db, slot.id) || { def: { name: slot.id } }).def.name;
    function choose(side, index) {
      cursor = { side, index };
      const unit = owners()[side], slot = unit.inventory[index];
      if (!selected || selected.side === side) {
        selected = slot ? (selected && selected.side === side && selected.index === index ? null : { side, index }) : selected;
        notice = ''; render(); return;
      }
      const source = owners()[selected.side], sent = source.inventory[selected.index];
      const result = BattleTrade.transfer(G, actor, partner, source, selected.index, slot ? index : undefined);
      if (!result.ok) { notice = result.error; render(); return; }
      notice = slot ? `${label(sent)} et ${label(slot)} échangés.` : `${label(sent)} donné à ${unit.name}.`;
      selected = null; api.changed(); render();
    }
    function render() {
      const el = panel(); el.innerHTML = '';
      const columns = owners().map((unit, side) => {
        const equipped = R.equipped(unit, G.db);
        return h('section', { class: 'trade-column' }, h('h4', {}, api.portrait(unit), h('span', {}, unit.name, h('small', {}, `${unit.inventory.length}/5 objets${unit.done ? ' · a déjà joué' : ''}`))),
          Array.from({ length: 5 }, (_, index) => {
            const slot = unit.inventory[index], isSelected = selected && selected.side === side && selected.index === index;
            const weapon = slot && R.byId(G.db.weapons, slot.id), usable = !weapon || R.canWield(unit, weapon, G.db);
            return h('button', { class: 'trade-slot' + (isSelected ? ' selected' : '') + (cursor.side === side && cursor.index === index ? ' current' : ''),
              'data-trade-slot': side + ':' + index, onclick: () => choose(side, index) },
              h('span', {}, slot ? label(slot) : '— Emplacement libre —'),
              slot ? h('small', { class: usable ? '' : 'trade-warning' }, `${slot.uses > 0 ? slot.uses + ' utilisation(s)' : 'Usages illimités'}${equipped && equipped.index === index ? ' · Équipée' : ''}${usable ? '' : ' · Inutilisable par cette classe'}`) : null);
          }));
      });
      el.append(h('div', { class: 'trade-head' }, h('h3', {}, 'Échanger'), h('button', { 'data-trade-close': true, onclick: close }, 'Retour (X)')),
        h('p', { class: 'trade-help' }, selected ? 'Choisis un objet en face pour échanger, ou une place libre pour donner.' : 'Choisis un objet dans l’un des deux inventaires.'),
        h('div', { class: 'trade-columns' }, columns),
        h('p', { class: 'trade-notice', role: 'status' }, notice || '\u00a0'),
        h('p', { class: 'trade-help' }, actor.tradeLocked ? 'Déplacement validé. Tu peux encore attaquer, utiliser un objet ou attendre.' : 'Un transfert valide le déplacement et conserve ton action. Le partenaire garde son état de tour.'));
    }
    function open(unit, other) {
      if (!BattleTrade.available(G, unit, other)) return;
      actor = unit; partner = other; selected = null; cursor = { side: 0, index: 0 }; notice = '';
      api.hideMenu(); G.ui = 'trade'; render(); panel().classList.remove('hidden');
    }
    function hide() { panel().classList.add('hidden'); panel().innerHTML = ''; actor = partner = selected = null; }
    function close() { hide(); api.returnToMenu(); }
    function cancel() { if (selected) { selected = null; notice = ''; render(); } else close(); }
    function key(e) {
      e.preventDefault();
      if (['Escape', 'x', 'X', 'Backspace'].includes(e.key)) cancel();
      else if (['Enter', ' ', 'z', 'Z'].includes(e.key)) choose(cursor.side, cursor.index);
      else {
        if (e.key === 'ArrowLeft') cursor.side = 0;
        if (e.key === 'ArrowRight') cursor.side = 1;
        if (e.key === 'ArrowUp') cursor.index = (cursor.index + 4) % 5;
        if (e.key === 'ArrowDown') cursor.index = (cursor.index + 1) % 5;
        if (e.key === 'Tab') cursor.side = 1 - cursor.side;
        render();
      }
    }
    panel().addEventListener('mousedown', e => { e.stopPropagation(); if (e.button === 2) cancel(); });
    return { open, hide, cancel, key };
  }
  root.TradePanel = { create };
})(self);
