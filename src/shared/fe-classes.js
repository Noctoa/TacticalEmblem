/*
 * Pack « Classes de la série Fire Emblem » : les classes officielles de FE6 à Engage (stats de base, croissances,
 * plafonds, armes, déplacement, palier, promotions), relevées sur Serenes Forest et générées par
 * tools/build_fe_classes.py dans fe-classes-data.js (voir ce script pour les adaptations au moteur).
 *
 *   summary(db)          → [{ id, name, total, already, sample }] par jeu
 *   install(db, ['fe7']) → ajoute les classes absentes (même id = déjà là), relie leurs promotions et leur donne une
 *                          arme de départ parmi celles de la base ; renvoie le nombre de classes ajoutées.
 * Les classes n'ont pas de sprite : à choisir dans leur fiche (ressources du projet ou générateur).
 */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./fe-classes-data.js') : root.FE_CLASSES_DATA, common ? require('./promotions.js') : root.Promotions);
  if (common) module.exports = api; else root.FEClasses = api;
})(typeof self !== 'undefined' ? self : this, function (DATA, Promotions) {
  'use strict';
  const GAMES = DATA || [];
  const byId = (list, id) => (list || []).find(e => e.id === id);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function summary(db) {
    return GAMES.map(g => ({ id: g.id, name: g.name, total: g.classes.length, already: g.classes.filter(c => byId(db.classes, c.id)).length,
      sample: g.classes.slice(0, 5).map(c => c.source).join(', ') }));
  }
  /** Arme de départ : la moins chère en boutique de la base parmi les types de la classe (bâton : un soin). */
  function starter(db, weapons) {
    for (const type of weapons || []) {
      const list = (db.weapons || []).filter(w => w.type === type && (type === 'staff' ? Number(w.heal) > 0 : Number(w.might) > 0));
      const price = (w) => Number(w.price) || Infinity; // prix 0 = arme spéciale, invendable : en dernier
      list.sort((a, b) => price(a) - price(b));
      if (list[0]) return [list[0].id];
    }
    return [];
  }
  function install(db, gameIds) {
    db.classes = db.classes || [];
    const added = [];
    for (const g of GAMES.filter(x => (gameIds || []).includes(x.id))) {
      for (const c of g.classes) {
        if (byId(db.classes, c.id)) continue;
        const e = clone(c);
        const promos = e.promotions || [];
        delete e.source; delete e.game;
        Object.assign(e, { promotesTo: '', promotions: [], defaultInventory: starter(db, e.weapons), mapSprite: '', battler: '', fromPack: 'fe-classes', promoteIds: promos });
        db.classes.push(e); added.push(e);
      }
    }
    // promotions (vers les classes présentes dans la base, nouvelles ou déjà installées)
    for (const e of added) {
      e.promotions = e.promoteIds.map(id => byId(db.classes, id)).filter(Boolean).map(t => Promotions.create(e, t));
      delete e.promoteIds;
    }
    return added.length;
  }
  const total = () => GAMES.reduce((n, g) => n + g.classes.length, 0);
  return { GAMES, summary, install, total };
});
