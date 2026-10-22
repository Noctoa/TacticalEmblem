/* Altérations temporaires : durées comptées en phases du porteur, jamais dans la campagne. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Statuses = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TYPES = [
    { id: 'poison', name: 'Poison', icon: 'P', color: '#c68cf2', description: 'Perd 10 % des PV maximum (arrondi supérieur) au début de sa phase, sans descendre sous 1 PV.' },
    { id: 'sleep', name: 'Sommeil', icon: 'Z', color: '#8ecaff', description: 'Ne peut ni se déplacer, ni agir, ni riposter. Recevoir un coup ne réveille pas.' },
    { id: 'silence', name: 'Silence', icon: 'S', color: '#f0cf82', description: 'Ne peut utiliser ni tome, ni arme magique, ni bâton. Les armes physiques et les objets restent utilisables.' }
  ];
  const get = id => TYPES.find(s => s.id === id);
  const active = (unit, id) => !!(unit && unit.statuses && unit.statuses[id] && unit.statuses[id].turns > 0);
  const list = unit => TYPES.filter(s => active(unit, s.id)).map(s => ({ ...s, turns: unit.statuses[s.id].turns }));
  const canAct = unit => !active(unit, 'sleep');
  const blockedWeapon = (unit, weapon) => !canAct(unit) || (active(unit, 'silence') && (weapon.magic || ['anima', 'light', 'dark', 'staff'].includes(weapon.type)));
  const canApply = (unit, id, turns) => !!unit && !unit.dead && unit.hp > 0 && !!get(id) && Number.isInteger(turns) && turns >= 1 && turns <= 9 && (!active(unit, id) || unit.statuses[id].turns < turns);
  function apply(unit, id, turns) {
    if (!canApply(unit, id, turns)) return null;
    const statuses = unit.statuses || (unit.statuses = {}), old = statuses[id];
    statuses[id] = { turns, ticking: !!(old && old.ticking) };
    return { ...get(id), turns, refreshed: !!old };
  }
  function cure(unit, which = 'all') {
    const removed = list(unit).filter(s => which === 'all' || which === s.id);
    for (const s of removed) delete unit.statuses[s.id];
    return removed;
  }
  const canCure = (unit, which) => list(unit).some(s => which === 'all' || which === s.id);
  function beginPhase(units, protect = () => false) {
    const events = [];
    for (const unit of units) {
      if (unit.dead || unit.hp <= 0) continue;
      for (const s of list(unit)) unit.statuses[s.id].ticking = true;
      if (active(unit, 'poison')) {
        const damage = protect(unit) ? 0 : Math.max(0, Math.min(unit.hp - 1, Math.ceil(unit.stats.hp / 10)));
        unit.hp -= damage; events.push({ unit, damage, status: get('poison') });
      }
    }
    return events;
  }
  function endPhase(units) {
    const expired = [];
    for (const unit of units) for (const s of list(unit)) {
      const value = unit.statuses[s.id];
      if (!value.ticking) continue;
      value.ticking = false;
      if (--value.turns <= 0) { delete unit.statuses[s.id]; expired.push({ unit, status: get(s.id) }); }
    }
    return expired;
  }
  function validateConfig(c) {
    return !!c && typeof c === 'object' && !Array.isArray(c) && !!get(c.id) && Number.isInteger(c.turns) && c.turns >= 1 && c.turns <= 9 && Number.isInteger(c.chance) && c.chance >= 0 && c.chance <= 100;
  }
  function validateDefinitions(db) {
    const errors = [], cureId = id => id === 'all' || !!get(id);
    for (const w of db.weapons || []) {
      if (w.inflict !== undefined && (!validateConfig(w.inflict) || w.type === 'staff')) errors.push(`${w.name || w.id} : altération d’arme invalide.`);
      if (w.restore !== undefined && w.restore !== '' && (w.type !== 'staff' || !cureId(w.restore))) errors.push(`${w.name || w.id} : soin d’altération invalide.`);
    }
    for (const i of db.items || []) if (i.effect === 'restore' && (!cureId(i.cure) || !Number.isInteger(i.uses) || i.uses < 1 || i.uses > 99)) errors.push(`${i.name || i.id} : objet de soin d’altération invalide.`);
    return errors;
  }
  function examples() {
    const weapon = (id, name, type, extra) => ({ id, name, type, might: 3, hit: 90, crit: 0, weight: 5, minRange: 1, maxRange: 1, uses: 30, price: 600, effective: [], heal: 0, ...extra });
    return { weapons: [weapon('w_status_poison_sword', 'Épée empoisonnée', 'sword', { inflict: { id: 'poison', chance: 100, turns: 3 } }),
      weapon('w_status_restore', 'Rétablissement', 'staff', { might: 0, uses: 10, price: 1500, restore: 'all' })],
      items: [{ id: 'i_status_antidote', name: 'Antidote', effect: 'restore', cure: 'poison', uses: 3, price: 300 },
        { id: 'i_status_remedy', name: 'Remède universel', effect: 'restore', cure: 'all', uses: 1, price: 500 }] };
  }
  return { TYPES, get, active, list, canAct, blockedWeapon, canApply, apply, cure, canCure, beginPhase, endPhase, validateConfig, validateDefinitions, examples };
});
