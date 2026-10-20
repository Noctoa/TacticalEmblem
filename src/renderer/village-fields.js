/* Champs partagés entre l'inspecteur de map et la fiche d'acte. */
(function (root) {
  'use strict';
  function form(village, db, map, api) {
    const model = Object.assign({ name: 'Village', x: 0, y: 0, script: '', allowedUnits: [], recruitUnitId: '', repeatOnReplay: false }, village,
      { reward: Object.assign({ gold: 0, itemId: '', uses: 0 }, village.reward) });
    const box = UI.form([
      { key: 'name', label: 'Nom du village', type: 'text' },
      { type: 'row', fields: [{ key: 'x', label: 'Case X', type: 'number', min: 0, max: map.width - 1 }, { key: 'y', label: 'Case Y', type: 'number', min: 0, max: map.height - 1 }] },
      { key: 'script', label: 'Dialogue de visite (Nom: texte)', type: 'textarea', rows: 5, placeholder: 'Villageois: Merci de votre aide !' },
      { key: 'reward.gold', label: 'Or offert', type: 'number', min: 0, max: 999999 },
      { key: 'reward.itemId', label: 'Arme ou objet offert', type: 'select', empty: '— aucun —', options: db.weapons.concat(db.items).map(e => ({ value: e.id, label: e.name })) },
      { key: 'reward.uses', label: 'Utilisations de l’objet (0 = toutes)', type: 'number', min: 0, max: 999 },
      { key: 'recruitUnitId', label: 'Personnage recruté', type: 'select', empty: '— aucun —', options: db.units.map(u => ({ value: u.id, label: u.name })) },
      { key: 'allowedUnits', label: 'Visiteurs autorisés (vide = tous les personnages du joueur)', type: 'multicheck', options: db.units.map(u => ({ value: u.id, label: u.name })) },
      { key: 'repeatOnReplay', label: 'Réutilisable quand cet acte est rejoué après victoire', type: 'checkbox' },
      { type: 'info', text: 'Visiter consomme l’action. Un objet va au convoi si l’inventaire est plein ; si les deux sont pleins, la visite attend une place libre. Une recrue apparaît à proximité ou un allié vert rejoint le joueur. Un personnage mort ne ressuscite pas. Par défaut, les récompenses ne se répètent pas après une victoire.' }
    ], model, { onChange: key => {
      api.beforeChange && api.beforeChange();
      const top = key.split('.')[0];
      // Le modèle de saisie doit rester distinct pour capturer l'état précédent dans l'historique.
      village[top] = model[top] && typeof model[top] === 'object' ? JSON.parse(JSON.stringify(model[top])) : model[top];
      api.onChange(key);
    } });
    box.dataset.villageId = village.id;
    return box;
  }
  root.VillageFields = { form };
})(self);
