(function (root) {
  'use strict';
  function form(object, kind, db, map, api) {
    const chest = kind === 'chests', model = Object.assign({ name: chest ? 'Coffre' : 'Porte', x: 0, y: 0, script: '', locked: true, allowLockpick: true, keyItemId: '', allowedUnits: [], repeatOnReplay: false }, object,
      { reward: Object.assign({ gold: 0, itemId: '', uses: 0 }, object.reward) });
    const fields = [
      { key: 'name', label: 'Nom', type: 'text' },
      { type: 'row', fields: [{ key: 'x', label: 'Case X', type: 'number', min: 0, max: map.width - 1 }, { key: 'y', label: 'Case Y', type: 'number', min: 0, max: map.height - 1 }] },
      { key: 'locked', label: 'Verrouillé (clé ou Crochetage nécessaire)', type: 'checkbox' },
      { key: 'allowLockpick', label: 'Autoriser Crochetage sans clé', type: 'checkbox' },
      { key: 'keyItemId', label: 'Clé spécifique (vide = toute clé adaptée)', type: 'select', empty: '— toute clé adaptée —', options: db.items.filter(i => Locks.keyMatches(i, kind)).map(i => ({ value: i.id, label: i.name })) },
      { key: 'allowedUnits', label: 'Personnages autorisés (vide = tous les joueurs)', type: 'multicheck', options: db.units.map(u => ({ value: u.id, label: u.name })) },
      { key: 'script', label: 'Dialogue à l’ouverture (facultatif)', type: 'textarea', rows: 3 }
    ];
    if (chest) fields.push(
      { key: 'reward.gold', label: 'Or contenu', type: 'number', min: 0, max: 999999 },
      { key: 'reward.itemId', label: 'Arme ou objet contenu', type: 'select', empty: '— aucun —', options: db.weapons.concat(db.items).map(i => ({ value: i.id, label: i.name })) },
      { key: 'reward.uses', label: 'Utilisations de la récompense (0 = toutes)', type: 'number', min: 0, max: 999 },
      { key: 'repeatOnReplay', label: 'Rempli de nouveau quand cet acte est rejoué après victoire', type: 'checkbox' });
    else fields.push({ key: 'openTerrainId', label: 'Terrain du passage après ouverture', type: 'select', options: db.terrains.filter(t => Rules.moveCost(t, 'foot') < Rules.IMPASSABLE).map(t => ({ value: t.id, label: t.name })) });
    fields.push({ type: 'info', text: chest ? 'Le personnage doit être sur le coffre. L’ouverture consomme son action. Une clé adaptée est utilisée depuis son inventaire ; Crochetage personnelle ou équipée évite de la consommer. Si la dernière utilisation libère une place, la récompense peut l’occuper.' : 'Le personnage doit être adjacent à la porte. Fermée, elle bloque toutes les unités. Ouverte, elle utilise le terrain choisi. Les portes se referment au début de chaque tentative ; la map du projet reste intacte.' });
    const box = UI.form(fields, model, { onChange: key => {
      api.beforeChange && api.beforeChange(); const top = key.split('.')[0];
      object[top] = model[top] && typeof model[top] === 'object' ? JSON.parse(JSON.stringify(model[top])) : model[top]; api.onChange(key);
    } });
    box.dataset.lockId = object.id; return box;
  }
  root.LockFields = { form };
})(self);
