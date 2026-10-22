(function (root) {
  'use strict';
  function render(pane, ch, db, map, api) {
    const h = UI.h, options = (list, label) => (list || []).map(o => ({ value: o.id, label: label ? label(o) : o.name || o.id }));
    const changed = () => { api.change(); redraw(); };
    const box = h('div', { class: 'events', 'data-scenario-editor': true });
    const expanded = new Map();
    pane.append(h('div', { class: 'form-heading' }, 'Événements & dialogues'), box);
    const fields = (rows, model, dynamic) => UI.form(rows, model, { onChange: key => {
      if (key === 'objective.type') { model.objective.turns ??= 5; model.objective.x ??= 0; model.objective.y ??= 0; }
      if (key === 'remove' && !model.remove && model.statusId === 'all') model.statusId = 'poison';
      api.change(); if ((dynamic || []).includes(key)) redraw();
    } });
    const targets = options(db.units, u => u.name).map(o => ({ ...o, value: 'unit:' + o.value })).concat(options(ch.enemies));
    const interactions = type => options(ch[{ chest: 'chests', door: 'doors', village: 'villages' }[type]]);
    const flagHelp = 'Nom interne : commence par une lettre ; lettres, chiffres et _ uniquement. Absent = faux. Conservé entre les actes après victoire.';
    function defaults(type) {
      const plug = Scenario.pluginAction(type);
      if (plug) return Object.assign({ plugin: plug.plugin || '' }, JSON.parse(JSON.stringify(plug.defaults || {})));
      return { dialogue: { text: '' }, gold: { amount: 100 }, item: { itemId: '', uses: 0, unitId: '' },
        reinforcement: { target: '' }, door: { target: '', open: true }, objective: { objective: { type: 'rout' } },
        flag: { key: '', value: true }, choice: { key: '', text: 'Que décides-tu ?', yes: 'Accepter', no: 'Refuser' }, status: { target: '', statusId: 'poison', turns: 3, remove: false } }[type];
    }
    function actionFields(a) {
      if (a.type === 'status') return [{ key: 'target', label: 'Unité ciblée', type: 'select', empty: '— choisir —', options: targets },
        { key: 'remove', label: 'Soigner (décoché = appliquer)', type: 'checkbox' },
        { key: 'statusId', label: 'Altération', type: 'select', options: [...(a.remove ? [{ value: 'all', label: 'Toutes' }] : []), ...Statuses.TYPES.map(s => ({ value: s.id, label: s.name }))] },
        ...(!a.remove ? [{ key: 'turns', label: 'Durée (phases de la cible)', type: 'number', min: 1, max: 9 }] : []),
        { type: 'info', text: 'Cible vivante et présente sur la map uniquement. Une unité absente ou un renfort non encore apparu est ignoré. Les altérations disparaissent après la bataille.' }];
      if (a.type === 'dialogue') return [{ key: 'text', label: 'Dialogue', type: 'textarea', rows: 4 }];
      if (a.type === 'gold') return [{ key: 'amount', label: 'Or donné', type: 'number', min: 1, max: 999999 }];
      const plug = Scenario.pluginAction(a.type);
      if (plug) return typeof plug.fields === 'function' ? plug.fields(a, { db, ch, map }) : [];
      if (!Scenario.ACTIONS.some(t => t.value === a.type)) return [{ type: 'info', text: `Action « ${a.type} » d’un plugin absent ou désactivé${a.plugin ? ' (' + a.plugin + ')' : ''} : elle est gardée mais ne fait rien en jeu.` }];
      if (a.type === 'item') return [
        { key: 'itemId', label: 'Arme ou objet', type: 'select', empty: '— choisir —', options: options(db.weapons.concat(db.items)) },
        { key: 'uses', label: 'Utilisations (0 = toutes)', type: 'number', min: 0, max: 999 },
        { key: 'unitId', label: 'Destinataire (vide = convoi)', type: 'select', empty: '— convoi —', options: options(db.units) },
        { type: 'info', text: 'Personnage absent, vaincu ou inventaire plein : envoi au convoi. Si tout est plein, l’événement attend et reprend sans redonner les récompenses précédentes.' }];
      if (a.type === 'reinforcement') return [
        { key: 'target', label: 'Renfort placé sur la map', type: 'select', empty: '— choisir —', options: options((ch.enemies || []).filter(e => e.eventOnly || e.appearTurn > 0)) },
        { type: 'info', text: 'En F3, place l’ennemi et coche « Arrivée uniquement par événement ». Une case occupée utilise une case accessible voisine. Un ennemi déjà apparu ne revient pas.' }];
      if (a.type === 'door') return [{ key: 'target', label: 'Porte', type: 'select', empty: '— choisir —', options: interactions('door') },
        { key: 'open', label: 'Ouvrir (décoché = fermer)', type: 'checkbox' }, { type: 'info', text: 'La fermeture attend si une unité occupe la case. Les déplacements et la zone de danger sont actualisés.' }];
      if (a.type === 'objective') return [
        { key: 'objective.type', label: 'Nouvel objectif', type: 'select', options: [
          { value: 'rout', label: 'Mettre en déroute' }, { value: 'boss', label: 'Vaincre les boss' }, { value: 'target', label: 'Vaincre une cible' }, { value: 'survive', label: 'Survivre' }, { value: 'seize', label: 'Prendre un point' }] },
        ...(a.objective.type === 'survive' ? [{ key: 'objective.turns', label: 'Tours à survivre à partir du tour actuel', type: 'number', min: 1, max: 999 }] : []),
        ...(a.objective.type === 'target' ? [{ key: 'objective.target', label: 'Cible', type: 'select', empty: '— choisir —', options: options(ch.enemies) }] : []),
        ...(a.objective.type === 'seize' ? ['x', 'y'].map(k => ({ key: 'objective.' + k, label: 'Case ' + k.toUpperCase(), type: 'number', min: 0, max: (k === 'x' ? map.width : map.height) - 1 })) : []),
        { key: 'objective.text', label: 'Texte affiché (facultatif)', type: 'text' }, { type: 'info', text: 'Remplace tous les objectifs de victoire. Les règles de défaite et personnages à protéger restent appliqués. La map et l’acte du projet ne sont pas modifiés en jeu.' }];
      if (a.type === 'flag') return [{ key: 'key', label: 'Information mémorisée', type: 'text', help: flagHelp }, { key: 'value', label: 'Valeur vraie (décoché = faux)', type: 'checkbox' }];
      if (a.type === 'choice') return [{ key: 'text', label: 'Question', type: 'text' }, { key: 'key', label: 'Information mémorisée', type: 'text', help: flagHelp },
        { key: 'yes', label: 'Réponse qui mémorise vrai', type: 'text' }, { key: 'no', label: 'Réponse qui mémorise faux', type: 'text' }];
      return [];
    }
    function redraw() {
      box.querySelectorAll('[data-event-id]').forEach(card => expanded.set(card.dataset.eventId, card.open));
      box.innerHTML = '';
      for (const [index, ev] of (ch.events || []).entries()) {
        const tr = ev.trigger, c = ev.conditions || { present: [], flags: [] };
        const card = h('details', { class: 'event-card', open: expanded.get(ev.id) !== false, 'data-event-id': ev.id, style: { padding: '12px', marginBottom: '12px' } }, h('summary', {}, ev.name || `Événement ${index + 1}`));
        card.append(fields([{ key: 'name', label: 'Nom de l’événement', type: 'text' },
          { key: 'once', label: 'Une seule fois par tentative', type: 'checkbox' }, { key: 'campaignOnce', label: 'Une seule fois dans toute la campagne (prioritaire)', type: 'checkbox' }],
          Object.assign(ev, { once: ev.once !== false })));
        card.append(fields([{ key: 'type', label: 'Déclenchement', type: 'select', options: Scenario.TRIGGERS }], tr));
        card.querySelector('select').addEventListener('change', () => {
          const type = tr.type; ev.trigger = { type };
          if (type === 'turn') ev.trigger.turn = 2;
          if (type === 'area') Object.assign(ev.trigger, { x: 0, y: 0, w: 1, h: 1 });
          changed();
        });
        if (tr.type === 'turn') card.append(fields([{ key: 'turn', label: 'Tour', type: 'number', min: 1, max: 999 }], tr));
        if (tr.type === 'death') card.append(fields([{ key: 'target', label: 'Unité vaincue', type: 'select', empty: '— choisir —', options: targets }], tr));
        if (tr.type === 'area') card.append(fields(['x', 'y', 'w', 'h'].map(k => ({ key: k, label: { x: 'Zone X', y: 'Zone Y', w: 'Largeur', h: 'Hauteur' }[k], type: 'number', min: ['w', 'h'].includes(k) ? 1 : 0, max: 499 })), tr));
        if (['chest', 'door', 'village'].includes(tr.type)) card.append(fields([{ key: 'target', label: 'Interaction', type: 'select', empty: '— choisir —', options: interactions(tr.type) }], tr));
        if (tr.type === 'condition') card.append(h('p', { class: 'form-info' }, 'Évalué après les événements et actions, avant le résultat de mission. Sans « une seule fois », attend que les conditions deviennent fausses puis vraies pour se répéter.'));
        card.append(h('div', { class: 'form-heading' }, 'Conditions (toutes nécessaires)'),
          UI.form([{ key: 'present', label: 'Personnages vivants et déployés', type: 'multicheck', options: options(db.units) }], c, { onChange: () => { ev.conditions = c; api.change(); } }));
        for (const [i, condition] of (c.flags || []).entries()) card.append(fields([
          { key: 'key', label: 'Information requise', type: 'text', help: flagHelp }, { key: 'value', label: 'Doit être vraie (décoché = fausse)', type: 'checkbox' }], condition),
          h('button', { class: 'small', onclick: () => { c.flags.splice(i, 1); ev.conditions = c; changed(); } }, 'Retirer cette condition'));
        card.append(h('button', { class: 'small', 'data-event-add-condition': ev.id, onclick: () => { (c.flags || (c.flags = [])).push({ key: '', value: true }); ev.conditions = c; changed(); } }, 'Ajouter une condition mémorisée'),
          fields([{ key: 'script', label: 'Dialogue initial (facultatif)', type: 'textarea', rows: 3 }], ev), h('p', { class: 'form-info' }, 'Une réplique par ligne : Nom: texte. Les actions suivantes sont exécutées dans l’ordre.'));
        for (const [i, a] of (ev.actions || []).entries()) {
          const action = h('div', { 'data-event-action': String(i), style: { borderTop: '1px solid var(--line-2)', paddingTop: '10px', marginTop: '10px' } });
          const selector = h('select', { 'data-action-type': true }, Scenario.actionTypes().concat(Scenario.actionTypes().some(o => o.value === a.type) ? [] : [{ value: a.type, label: a.type + ' (plugin absent)' }]).map(o => h('option', { value: o.value }, o.label))); selector.value = a.type;
          selector.addEventListener('change', () => { ev.actions[i] = { type: selector.value, ...defaults(selector.value) }; changed(); });
          action.append(h('b', {}, `Action ${i + 1} `), selector, fields(actionFields(a), a, ['objective.type', 'remove']),
            h('div', { class: 'insp-actions' }, h('button', { class: 'small', disabled: i === 0, onclick: () => { [ev.actions[i - 1], ev.actions[i]] = [a, ev.actions[i - 1]]; changed(); } }, 'Monter'),
              h('button', { class: 'small', disabled: i === ev.actions.length - 1, onclick: () => { [ev.actions[i + 1], ev.actions[i]] = [a, ev.actions[i + 1]]; changed(); } }, 'Descendre'),
              h('button', { class: 'small danger', onclick: () => { ev.actions.splice(i, 1); changed(); } }, 'Retirer l’action'))); card.append(action);
        }
        card.append(h('button', { class: 'small', 'data-event-add-action': ev.id, onclick: () => { (ev.actions || (ev.actions = [])).push({ type: 'dialogue', text: '' }); changed(); } }, 'Ajouter une action'),
          h('div', { class: 'insp-actions' },
            h('button', { class: 'small', disabled: index === 0, onclick: () => { [ch.events[index - 1], ch.events[index]] = [ev, ch.events[index - 1]]; changed(); } }, 'Monter l’événement'),
            h('button', { class: 'small', onclick: () => { const copy = JSON.parse(JSON.stringify(ev)); copy.id = api.uid('ev', ch.events); copy.name = (ev.name || ev.id) + ' (copie)'; ch.events.splice(index + 1, 0, copy); changed(); } }, 'Dupliquer'),
            h('button', { class: 'small danger', onclick: async () => { if (await UI.confirm('Supprimer cet événement ?', { danger: true })) { ch.events.splice(index, 1); changed(); } } }, 'Supprimer l’événement')));
        box.append(card);
      }
      box.append(h('button', { class: 'small', 'data-event-add': true, onclick: () => {
        const events = ch.events || (ch.events = []); events.push({ id: api.uid('ev', events), name: 'Nouvel événement', trigger: { type: 'start' }, once: true, script: '', actions: [] }); changed();
      } }, 'Ajouter un événement'));
      for (const error of Scenario.validate(ch, db, map)) box.append(h('p', { class: 'note' }, '⚠ ' + error));
    }
    redraw();
  }
  root.EventFields = { render };
})(self);
