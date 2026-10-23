(function (root) {
  'use strict';
  function render(pane, ch, db, api) {
    const { h } = UI, box = h('section', { 'data-secondary-editor': true });
    pane.append(box);
    function draw() {
      box.replaceChildren(h('div', { class: 'form-heading' }, 'Objectifs secondaires (facultatifs)'),
        h('p', { class: 'form-info' }, 'Ces défis ne conditionnent pas la victoire. Les récompenses sont données à la victoire ; recommencer ou abandonner annule les gains de la tentative.'));
      for (const ob of SideObjectives.list(ch)) {
        const card = h('details', { class: 'event-card', open: true, 'data-secondary-id': ob.id, style: { padding: '12px', marginTop: '8px' } });
        const heading = h('summary', {}, SideObjectives.label(ob, ch, db));
        const model = { name: '', turns: 0, target: '', flag: '', value: true, repeatOnReplay: false, ...ob,
          reward: { gold: 0, itemId: '', uses: 0, unitId: '', ...ob.reward } };
        card.append(heading, UI.form([
          { key: 'name', label: 'Nom du défi (facultatif)', type: 'text' },
          { key: 'type', label: 'Défi', type: 'select', options: SideObjectives.TYPES },
          { key: 'target', label: 'Personnage à protéger', type: 'select', empty: '— choisir —', when: o => o.type === 'protect', options: [...new Set([...(ch.players || []), ...(ch.allies || [])].map(p => p.unitId))].map(id => ({ value: id, label: db.units.find(u => u.id === id)?.name || id })) },
          { type: 'info', when: o => o.type === 'protect', text: 'Ce personnage doit être déployé et rester en vie jusqu’à la victoire. Sa retraite fait échouer le défi, même en Détente ; le défi ne l’impose pas dans les préparatifs.' },
          { key: 'target', label: 'Ennemi à vaincre', type: 'select', empty: '— choisir —', when: o => o.type === 'target', options: (ch.enemies || []).map(e => ({ value: e.id, label: e.name || e.id })) },
          { key: 'target', label: 'Village à visiter', type: 'select', empty: '— choisir —', when: o => o.type === 'village', options: (ch.villages || []).map(v => ({ value: v.id, label: v.name || v.id })) },
          { key: 'target', label: 'Coffre à ouvrir', type: 'select', empty: '— choisir —', when: o => o.type === 'chest', options: (ch.chests || []).map(v => ({ value: v.id, label: v.name || v.id })) },
          { key: 'flag', label: 'Information de scénario', type: 'text', when: o => o.type === 'flag', placeholder: 'ex. civils_sauves' },
          { key: 'value', label: 'Valeur vraie requise (décoché = faux)', type: 'checkbox', when: o => o.type === 'flag' },
          { key: 'turns', label: 'Dernier tour autorisé (inclus)', type: 'number', min: 1, max: 999, when: o => o.type === 'turn' },
          { key: 'turns', label: 'À accomplir avant la fin du tour (0 = sans délai)', type: 'number', min: 0, max: 999, when: o => !['turn', 'protect'].includes(o.type) },
          { key: 'reward.gold', label: 'Or offert à la victoire', type: 'number', min: 0, max: 999999 },
          { key: 'reward.itemId', label: 'Arme ou objet offert à la victoire', type: 'select', empty: '— aucun —', options: db.weapons.concat(db.items).map(i => ({ value: i.id, label: i.name })) },
          { key: 'reward.uses', label: 'Utilisations de la récompense (0 = toutes)', type: 'number', min: 0, max: 999 },
          { key: 'reward.unitId', label: 'Destinataire de l’objet (vide = convoi)', type: 'select', empty: '— convoi —', options: db.units.map(u => ({ value: u.id, label: u.name })) },
          { key: 'repeatOnReplay', label: 'Récompense à chaque réussite lors d’un acte rejoué', type: 'checkbox' },
          { type: 'info', text: 'Par défaut, chaque défi est récompensé une seule fois dans la campagne, même si le premier acte réussi ne le remplissait pas. Un destinataire absent, vaincu ou plein envoie l’objet au convoi ; s’il est plein aussi, la victoire attend une place libre.' }
        ].filter(f => !f.when || f.when(model)), model, { onChange: k => {
          const top = k.split('.')[0]; ob[top] = model[top];
          if (k === 'type') { ob.target = ''; ob.turns = model.type === 'turn' ? 8 : 0; if (ob.type === 'flag') ob.value = model.value; }
          if (k === 'reward.itemId') ob.reward.uses = 0;
          api.change();
          if (k === 'type' || k === 'reward.itemId') draw();
          else heading.textContent = SideObjectives.label(ob, ch, db);
        } }), h('button', { class: 'small danger', 'data-secondary-remove': ob.id, onclick: () => {
          ch.secondaryObjectives = ch.secondaryObjectives.filter(o => o !== ob); api.change(); draw();
        } }, 'Retirer ce défi'));
        box.append(card);
      }
      box.append(h('button', { class: 'small', 'data-secondary-add': true, disabled: SideObjectives.list(ch).length >= 20, style: { marginTop: '8px' }, onclick: () => {
        ch.secondaryObjectives = SideObjectives.list(ch).concat({ id: api.uid('side', SideObjectives.list(ch)), type: 'turn', name: '', turns: 8, reward: { gold: 0, itemId: '', uses: 0, unitId: '' } });
        api.change(); draw();
      } }, 'Ajouter un objectif secondaire'));
      for (const error of SideObjectives.validate(ch, db)) box.append(h('p', { class: 'note' }, '⚠ ' + error));
    }
    draw();
  }
  root.SideObjectiveFields = { render };
})(self);
