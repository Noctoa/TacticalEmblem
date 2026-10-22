(function (root) {
  'use strict';
  function weapon(w, changed) {
    const h = UI.h, box = h('div', { 'data-status-weapon': w.id });
    const redraw = () => {
      box.innerHTML = '';
      if (w.type === 'staff') {
        const model = { restore: w.restore || '' };
        box.append(UI.form([{ key: 'restore', label: 'Soigne une altération', type: 'select', empty: '— soin de PV habituel —', options: [{ value: 'all', label: 'Toutes les altérations' }, ...Statuses.TYPES.map(s => ({ value: s.id, label: s.name }))] },
          { type: 'info', text: 'Un bâton de rétablissement cible un allié atteint, même à tous ses PV. Silence empêche le porteur d’utiliser les bâtons.' }], model, { onChange: () => { if (model.restore) w.restore = model.restore; else delete w.restore; changed(); } }));
      } else {
        const model = { enabled: !!w.inflict, id: (w.inflict || {}).id || 'poison', chance: (w.inflict || {}).chance ?? 100, turns: (w.inflict || {}).turns || 3 };
        box.append(UI.form([{ key: 'enabled', label: 'Inflige une altération', type: 'checkbox' }, ...(model.enabled ? [
          { key: 'id', label: 'Altération infligée', type: 'select', options: Statuses.TYPES.map(s => ({ value: s.id, label: s.name })) },
          { key: 'chance', label: 'Chance après un coup réussi (%)', type: 'number', min: 0, max: 100 },
          { key: 'turns', label: 'Durée (phases de la cible)', type: 'number', min: 1, max: 9 },
          { type: 'info', text: 'S’applique sur un coup réussi si la cible survit. Aucun effet sur un raté ou un coup d’overkill. Le sommeil et le silence peuvent empêcher la riposte.' }] : [])], model, { onChange: key => {
          if (model.enabled) w.inflict = { id: model.id, chance: model.chance, turns: model.turns }; else delete w.inflict;
          changed(); if (key === 'enabled') redraw();
        } }));
      }
    };
    redraw(); return box;
  }
  root.StatusFields = { weapon };
})(self);
