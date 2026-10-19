/* Promotions : transitions, compatibilité des anciennes classes et application atomique. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./skills.js') : root.Skills);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Promotions = api;
})(typeof self !== 'undefined' ? self : this, function (Skills) {
  'use strict';
  const STATS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
  const byId = (list, id) => (list || []).find(entry => entry.id === id);
  const clone = value => JSON.parse(JSON.stringify(value));
  function create(source, target) {
    const bonuses = {};
    for (const key of STATS) bonuses[key] = Math.max(0, ((target.base || {})[key] || 0) - ((source.base || {})[key] || 0));
    bonuses.mov = 0;
    return { classId: target.id, minLevel: 10, itemId: '', resetLevel: true, bonuses, skills: [] };
  }
  function branches(cls, db) {
    if (!cls) return [];
    if (cls.promotions !== undefined) return Array.isArray(cls.promotions) ? cls.promotions : [];
    if (!cls.promotesTo) return [];
    const target = byId(db.classes, cls.promotesTo);
    return [create(cls, target || { id: cls.promotesTo })];
  }
  function validate(db) {
    const errors = [], skills = new Set((db.skills || []).map(s => s.id));
    for (const item of db.items || []) if (item.effect === 'promotion' && (!Number.isInteger(item.uses) || item.uses < 1 || item.uses > 99)) errors.push(`Objet ${item.name || item.id} : un objet de promotion doit avoir de 1 à 99 utilisations.`);
    for (const cls of db.classes || []) {
      const prefix = `Classe ${cls.name || cls.id} : `;
      if (cls.tier !== undefined && (!Number.isInteger(cls.tier) || cls.tier < 0 || cls.tier > 9)) errors.push(prefix + 'le palier doit être un entier de 0 à 9.');
      if (cls.effectiveTypes !== undefined && (!Array.isArray(cls.effectiveTypes) || cls.effectiveTypes.some(t => !['foot', 'horse', 'armor', 'flier'].includes(t)))) errors.push(prefix + 'catégories d’efficacité invalides.');
      if (cls.promotions !== undefined && !Array.isArray(cls.promotions)) { errors.push(prefix + 'les promotions doivent être une liste.'); continue; }
      const seen = new Set();
      for (const row of branches(cls, db)) {
        if (!row || typeof row !== 'object') { errors.push(prefix + 'promotion invalide.'); continue; }
        if (!byId(db.classes, row.classId)) errors.push(prefix + 'classe de destination introuvable.');
        if (row.classId === cls.id) errors.push(prefix + 'une classe ne peut pas se promouvoir vers elle-même.');
        if (seen.has(row.classId)) errors.push(prefix + 'destination de promotion en double.');
        seen.add(row.classId);
        if (!Number.isInteger(row.minLevel) || row.minLevel < 1 || row.minLevel > 99) errors.push(prefix + 'le niveau de promotion doit être un entier de 1 à 99.');
        if (typeof row.resetLevel !== 'boolean') errors.push(prefix + 'choisir si le niveau est remis à 1.');
        if (typeof row.itemId !== 'string' || (row.itemId && (!byId(db.items, row.itemId) || byId(db.items, row.itemId).effect !== 'promotion'))) errors.push(prefix + 'objet de promotion introuvable ou incompatible.');
        if (!row.bonuses || typeof row.bonuses !== 'object' || Array.isArray(row.bonuses) || Object.entries(row.bonuses).some(([key, n]) => ![...STATS, 'mov'].includes(key) || !Number.isInteger(n) || n < 0 || n > (key === 'mov' ? 15 : 99))) errors.push(prefix + 'bonus de promotion invalides.');
        if (!Array.isArray(row.skills) || row.skills.some(id => !skills.has(id)) || new Set(row.skills).size !== row.skills.length) errors.push(prefix + 'compétences de promotion invalides ou en double.');
      }
    }
    const visiting = new Set(), visited = new Set();
    const visit = id => {
      if (visiting.has(id)) { errors.push('Cycle dans l’arbre de promotions : ' + id + '.'); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const row of branches(byId(db.classes, id), db)) if (row && byId(db.classes, row.classId)) visit(row.classId);
      visiting.delete(id); visited.add(id);
    };
    for (const cls of db.classes || []) visit(cls.id);
    return errors;
  }
  function effectiveLevel(unit, db) {
    if (Number.isFinite(unit.effectiveLevel)) return unit.effectiveLevel;
    const cls = byId(db.classes, unit.classId);
    return unit.level + Math.max(0, (Number(cls && cls.tier) || 1) - 1) * 20;
  }
  function options(unit, db, itemIndex) {
    const cls = byId(db.classes, unit.classId);
    return branches(cls, db).filter(row => row && (itemIndex === undefined || (unit.inventory[itemIndex] && row.itemId === unit.inventory[itemIndex].id))).map(row => {
      const target = byId(db.classes, row.classId), reasons = [];
      if (unit.dead || unit.hp <= 0) reasons.push('Unité vaincue.');
      if (!target) reasons.push('Classe de destination introuvable.');
      if (unit.level < row.minLevel) reasons.push('Niveau ' + row.minLevel + ' requis.');
      const index = row.itemId ? (itemIndex === undefined ? unit.inventory.findIndex(slot => slot.id === row.itemId && slot.uses > 0) : itemIndex) : -1;
      if (row.itemId && (index < 0 || !unit.inventory[index] || unit.inventory[index].uses <= 0)) reasons.push('Objet requis : ' + ((byId(db.items, row.itemId) || {}).name || row.itemId) + ' dans l’inventaire.');
      return { row, target, itemIndex: index, available: reasons.length === 0, reasons };
    });
  }
  function preview(unit, option, db) {
    const target = option.target, source = byId(db.classes, unit.classId);
    if (!target) return null;
    const stats = {}, gains = {};
    for (const key of STATS) {
      const old = unit.stats[key] || 0, cap = (target.caps || {})[key] || 99;
      stats[key] = Math.max(old, Math.min(cap, old + (option.row.bonuses[key] || 0)));
      gains[key] = stats[key] - old;
    }
    const mov = Math.max(1, Math.min(30, target.mov + (unit.mov - source.mov) + (option.row.bonuses.mov || 0)));
    return { stats, gains, mov, level: option.row.resetLevel ? 1 : unit.level, exp: option.row.resetLevel ? 0 : unit.exp,
      hp: Math.min(stats.hp, unit.hp + gains.hp), moveType: target.moveType };
  }
  function apply(unit, destinationId, db, itemIndex) {
    const errors = validate(db);
    if (errors.length) return { ok: false, error: errors.join('\n') };
    const option = options(unit, db, itemIndex).find(o => o.row.classId === destinationId);
    if (!option || !option.available) return { ok: false, error: option ? option.reasons.join(' ') : 'Promotion indisponible.' };
    const before = effectiveLevel(unit, db), result = preview(unit, option, db), next = clone(unit);
    Object.assign(next, { classId: option.target.id, ...result });
    delete next.gains;
    next.effectiveLevel = Math.max(before, next.level + Math.max(0, (Number(option.target.tier) || 1) - 1) * 20);
    const character = byId(db.units, unit.sourceId) || {};
    next.mapSprite = character.mapSprite || option.target.mapSprite || '';
    next.battler = character.battler || option.target.battler || '';
    Object.assign(next, Skills.loadout(next, db.skills || []));
    const learnedSkills = [];
    for (const id of option.row.skills) if (id !== next.personalSkill && !next.learnedSkills.includes(id)) { next.learnedSkills.push(id); learnedSkills.push(id); }
    learnedSkills.push(...Skills.learnThroughLevel(next, option.target, db.skills || [], character));
    if (option.row.itemId) {
      const slot = next.inventory[option.itemIndex]; slot.uses--;
      if (!slot.uses) next.inventory.splice(option.itemIndex, 1);
    }
    Object.assign(unit, next);
    return { ok: true, gains: result.gains, learnedSkills, target: option.target };
  }
  function usersOf(db, kind, id) {
    return (db.classes || []).filter(cls => branches(cls, db).some(row => row && (kind === 'classes' ? row.classId === id : kind === 'items' ? row.itemId === id : (row.skills || []).includes(id))));
  }
  return { create, branches, validate, effectiveLevel, options, preview, apply, usersOf };
});
