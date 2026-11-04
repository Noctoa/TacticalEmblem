/*
 * Boutiques sur les maps de combat (comme le marchand du camp) : une case de la map où une unité du joueur peut
 * acheter et vendre avec l'or de la campagne (action « Boutique », sans terminer son tour).
 *
 *   acte.shops = [{ id, name, x, y, stock: [id d'arme ou d'objet] }]   prix : ceux des fiches (Base de données)
 *   at(ch, x, y)             → boutique de la case (ou null)
 *   stock(shop, db)          → [{ id, def, price }] (articles existants avec un prix)
 *   validate(ch, db, map)    → erreurs
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BattleShops = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const list = (ch) => (ch && Array.isArray(ch.shops) ? ch.shops : []);
  const entry = (db, id) => (db.weapons || []).find(w => w.id === id) || (db.items || []).find(i => i.id === id) || null;
  const price = (def) => Math.max(0, Math.floor(Number(def && def.price) || 0));
  const at = (ch, x, y) => list(ch).find(s => s.x === x && s.y === y) || null;
  function stock(shop, db) {
    return ((shop && shop.stock) || []).map(id => ({ id, def: entry(db, id) })).filter(e => e.def && price(e.def) > 0).map(e => Object.assign(e, { price: price(e.def) }));
  }
  function validate(ch, db, map) {
    const errors = [];
    if (ch.shops !== undefined && !Array.isArray(ch.shops)) return ['Boutiques : une liste est attendue.'];
    const seen = new Set();
    for (const s of list(ch)) {
      const name = (s && s.name) || 'Boutique';
      if (!s || typeof s.id !== 'string' || !s.id || seen.has(s.id)) { errors.push(`${name} : identifiant vide ou en double.`); continue; }
      seen.add(s.id);
      if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || s.x < 0 || s.y < 0 || (map && (s.x >= map.width || s.y >= map.height))) errors.push(`${name} : case hors de la map.`);
      if (s.stock !== undefined && !Array.isArray(s.stock)) errors.push(`${name} : stock invalide.`);
      else {
        if ((s.stock || []).some(id => !entry(db, id))) errors.push(`${name} : article introuvable dans le stock.`);
        else if ((s.stock || []).length && !stock(s, db).length) errors.push(`${name} : aucun article du stock n’a de prix (Base de données › Armes / Objets).`);
      }
      for (const kind of ['villages', 'chests', 'doors']) if ((ch[kind] || []).some(o => o.x === s.x && o.y === s.y)) errors.push(`${name} : une autre interaction occupe la même case.`);
    }
    if (new Set(list(ch).map(s => s.x + ',' + s.y)).size !== list(ch).length) errors.push('Boutiques : deux boutiques sur la même case.');
    return errors;
  }
  return { list, at, stock, price, validate };
});
