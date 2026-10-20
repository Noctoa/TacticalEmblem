/* Tri et regroupement des personnages (base de données, palette de placement) : par nom, classe, arme ou série. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules);
  if (common) module.exports = api; else root.Roster = api;
})(typeof self !== 'undefined' ? self : this, function (Rules) {
  'use strict';
  const SORTS = [
    { id: '', label: 'Ordre de la base' },
    { id: 'name', label: 'Nom' },
    { id: 'class', label: 'Classe' },
    { id: 'weapon', label: 'Arme' },
    { id: 'series', label: 'Série' }
  ];
  const NO_SERIES = 'Sans série', NO_WEAPON = 'Aucune arme';
  const byId = (list, id) => (list || []).find(e => e.id === id);
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const collator = typeof Intl !== 'undefined' ? new Intl.Collator('fr', { sensitivity: 'base', numeric: true }) : null;
  const cmp = (a, b) => collator ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0);

  function seriesOf(unit) { return String((unit && unit.series) || '').trim(); }

  /** Types d'armes d'un personnage : ceux de sa classe, sinon ceux des armes de son inventaire. */
  function weaponTypesOf(unit, db) {
    const cls = byId(db.classes, unit.classId);
    let types = cls && Array.isArray(cls.weapons) ? cls.weapons.slice() : [];
    if (!types.length) types = (unit.inventory || []).map(s => (byId(db.weapons, s.id) || {}).type).filter(Boolean);
    const order = Rules.WEAPON_TYPES.map(w => w.id);
    return [...new Set(types)].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  }
  function weaponLabel(type) { return (Rules.WEAPON_TYPES.find(w => w.id === type) || {}).name || type; }

  /** Séries déjà utilisées dans la base (pour les suggestions de saisie). */
  function seriesList(db) {
    const seen = new Map(); // même série écrite avec une autre casse ou d'autres accents : une seule suggestion
    for (const name of (db.units || []).map(seriesOf).filter(Boolean)) if (!seen.has(fold(name))) seen.set(fold(name), name);
    return [...seen.values()].sort(cmp);
  }

  /** Recherche : nom, classe, série ou arme, sans tenir compte des accents ni de la casse. */
  function matches(unit, db, query) {
    const q = fold(query);
    if (!q) return true;
    const cls = byId(db.classes, unit.classId);
    const hay = [unit.name, cls && cls.name, seriesOf(unit), ...weaponTypesOf(unit, db).map(weaponLabel)].map(fold).join('\n');
    return q.split(/\s+/).every(word => hay.includes(word));
  }

  /**
   * Range les personnages : [{ key, label, units }]. Un seul groupe sans titre pour l'ordre de la base et le tri par nom.
   * Par arme, un personnage qui manie plusieurs armes apparaît dans chacun de ses groupes.
   */
  function arrange(units, db, opts) {
    const by = (opts && opts.by) || '', query = (opts && opts.query) || '';
    const list = (units || []).filter(u => matches(u, db, query));
    const byName = (a, b) => cmp(a.name || '', b.name || '');
    if (!by) return [{ key: '', label: '', units: list }];
    if (by === 'name') return [{ key: '', label: '', units: list.slice().sort(byName) }];
    const groups = new Map();
    const add = (key, label, unit) => { if (!groups.has(key)) groups.set(key, { key, label, units: [] }); groups.get(key).units.push(unit); };
    for (const u of list) {
      if (by === 'class') { const cls = byId(db.classes, u.classId); add(cls ? cls.id : '', cls ? cls.name : 'Sans classe', u); }
      else if (by === 'series') { const s = seriesOf(u); add(s ? fold(s) : '', s || NO_SERIES, u); }
      else if (by === 'weapon') { const types = weaponTypesOf(u, db); if (!types.length) add('', NO_WEAPON, u); for (const t of types) add(t, weaponLabel(t), u); }
    }
    const out = [...groups.values()];
    for (const g of out) g.units.sort(byName);
    if (by === 'class') { const order = (db.classes || []).map(c => c.id); out.sort((a, b) => (order.indexOf(a.key) + 1 || 999) - (order.indexOf(b.key) + 1 || 999)); }
    if (by === 'weapon') { const order = Rules.WEAPON_TYPES.map(w => w.id); out.sort((a, b) => (order.indexOf(a.key) + 1 || 999) - (order.indexOf(b.key) + 1 || 999)); }
    if (by === 'series') out.sort((a, b) => (a.key === '') - (b.key === '') || cmp(a.label, b.label));
    return out;
  }

  return { SORTS, NO_SERIES, NO_WEAPON, seriesOf, seriesList, weaponTypesOf, weaponLabel, matches, arrange };
});
