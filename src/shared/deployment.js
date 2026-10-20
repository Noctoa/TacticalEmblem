/* Sélection et placement avant bataille, sans modifier les placements du projet. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./mission.js') : root.Mission, common ? require('./rules.js') : root.Rules);
  if (common) module.exports = api; else root.Deployment = api;
})(typeof self !== 'undefined' ? self : this, function (Mission, R) {
  'use strict';
  const enabled = ch => !ch.deployment || ch.deployment.enabled !== false;
  const slots = ch => (ch.players || []).map(p => ({ x: p.x, y: p.y, colors: p.colors || '' }));
  const limit = ch => (ch.deployment && ch.deployment.limit) || slots(ch).length;
  const allied = ch => new Set((ch.allies || []).filter(p => !(ch.players || []).some(q => q.unitId === p.unitId)).map(p => p.unitId));
  const forced = (ch, db) => [...new Set([...(ch.deployment && ch.deployment.forcedUnits || []), ...Mission.required(ch, db).filter(id => !allied(ch).has(id))])];
  const eligible = (ch, members) => members.filter(u => !allied(ch).has(u.sourceId));
  const same = (a, b) => a.x === b.x && a.y === b.y;
  function validate(ch, db, map) {
    const cfg = ch.deployment, errors = [];
    if (cfg !== undefined && (!cfg || typeof cfg !== 'object' || Array.isArray(cfg))) return ['Préparatifs : réglages invalides.'];
    if (cfg && cfg.enabled !== undefined && typeof cfg.enabled !== 'boolean') errors.push('Préparatifs : activation invalide.');
    if (cfg && cfg.limit !== undefined && (!Number.isInteger(cfg.limit) || cfg.limit < 0 || cfg.limit > slots(ch).length)) errors.push('Préparatifs : limite supérieure au nombre de cases ou invalide.');
    if (cfg && cfg.forcedUnits !== undefined && (!Array.isArray(cfg.forcedUnits) || cfg.forcedUnits.some(id => !(ch.players || []).some(p => p.unitId === id)) || new Set(cfg.forcedUnits).size !== cfg.forcedUnits.length)) errors.push('Préparatifs : unités imposées absentes des placements joueur ou en double.');
    if (errors.length || !enabled(ch)) return errors;
    if (!slots(ch).length) errors.push('Préparatifs : place au moins un personnage joueur sur la map pour définir les cases de départ.');
    const points = new Set(), ids = new Set();
    for (const p of ch.players || []) {
      if (!db.units.some(u => u.id === p.unitId) || ids.has(p.unitId)) errors.push('Préparatifs : personnage joueur introuvable ou placé plusieurs fois.');
      ids.add(p.unitId);
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) errors.push('Préparatifs : case de départ hors de la map.');
      const key = p.x + ',' + p.y;
      if (points.has(key)) errors.push('Préparatifs : plusieurs cases de départ se superposent.');
      points.add(key);
      if ((ch.enemies || []).some(e => !(e.appearTurn > 0) && same(e, p)) || (ch.allies || []).some(a => allied(ch).has(a.unitId) && same(a, p))) errors.push('Préparatifs : une case de départ est occupée par un ennemi ou un allié.');
    }
    if (forced(ch, db).length > limit(ch)) errors.push('Préparatifs : la limite est inférieure au nombre de personnages imposés ou à protéger.');
    return [...new Set(errors)];
  }
  function canPlace(ch, unit, point, terrainAt) {
    if (!unit || !slots(ch).some(p => same(p, point))) return false;
    const cost = R.moveCost(terrainAt(point.x, point.y), unit.moveType);
    return Number.isFinite(cost) && cost < R.IMPASSABLE;
  }
  function errors(ch, db, members, plan, terrainAt) {
    const messages = [], available = eligible(ch, members), ids = new Set(), points = new Set();
    if (!plan.length) messages.push('Sélectionne au moins un personnage.');
    if (plan.length > limit(ch)) messages.push(`La limite est de ${limit(ch)} personnages.`);
    for (const p of plan) {
      const unit = available.find(u => u.sourceId === p.unitId), key = p.x + ',' + p.y;
      if (!unit) messages.push('Un personnage sélectionné est indisponible (non recruté, mort ou allié de cet acte).');
      if (ids.has(p.unitId) || points.has(key)) messages.push('Un personnage ou une case apparaît plusieurs fois.');
      ids.add(p.unitId); points.add(key);
      if (unit && !canPlace(ch, unit, p, terrainAt)) messages.push(`${unit.name} ne peut pas commencer sur cette case.`);
    }
    for (const id of forced(ch, db)) if (!ids.has(id)) messages.push(`${(db.units.find(u => u.id === id) || {}).name || id} est imposé et doit être disponible.`);
    for (const id of Mission.required(ch, db).filter(id => allied(ch).has(id))) if (!members.some(u => u.sourceId === id)) messages.push(`${(db.units.find(u => u.id === id) || {}).name || id} doit être disponible comme allié à protéger.`);
    const needsSeizer = Mission.objectives(ch).some(o => o.type === 'seize') && (ch.victoryMode !== 'any' || Mission.objectives(ch).every(o => o.type === 'seize'));
    if (needsSeizer && !plan.some(p => Mission.seizers(ch, db).includes(p.unitId)) && !(ch.allies || []).some(p => allied(ch).has(p.unitId) && members.some(u => u.sourceId === p.unitId) && Mission.seizers(ch, db).includes(p.unitId))) messages.push('Déploie au moins un personnage autorisé à prendre les points.');
    return [...new Set(messages)];
  }
  // Appariement : une unité terrestre ne doit pas prendre la seule case accessible à un cavalier.
  function arrange(ch, members, ids, previous, terrainAt) {
    const positions = slots(ch), occupied = new Map();
    function assign(id, visited) {
      const unit = members.find(u => u.sourceId === id), prior = previous.find(p => p.unitId === id);
      const score = i => prior && same(positions[i], prior) ? 2 : !occupied.has(i) ? 1 : 0;
      const order = positions.map((p, i) => i).sort((a, b) => score(b) - score(a));
      for (const i of order) {
        if (visited.has(i) || !canPlace(ch, unit, positions[i], terrainAt)) continue;
        visited.add(i);
        if (!occupied.has(i) || assign(occupied.get(i), visited)) { occupied.set(i, id); return true; }
      }
      return false;
    }
    for (const id of ids) if (!assign(id, new Set())) return null;
    return ids.map(id => ({ unitId: id, ...positions[[...occupied].find(([, other]) => other === id)[0]] }));
  }
  function initial(ch, db, members, terrainAt, saved) {
    const available = eligible(ch, members), known = id => available.some(u => u.sourceId === id);
    if (Array.isArray(saved) && !errors(ch, db, members, saved, terrainAt).length) return saved.map(p => ({ unitId: p.unitId, ...slots(ch).find(s => same(s, p)) }));
    const ids = [...new Set([...forced(ch, db), ...(ch.players || []).map(p => p.unitId), ...available.map(u => u.sourceId)])].filter(known).slice(0, limit(ch));
    return arrange(ch, available, ids, ch.players || [], terrainAt) || ids.map((id, i) => ({ unitId: id, ...slots(ch)[i] }));
  }
  function toggle(ch, db, members, plan, id, terrainAt) {
    if (!eligible(ch, members).some(u => u.sourceId === id)) return { ok: false, error: 'Personnage indisponible.' };
    if (plan.some(p => p.unitId === id)) {
      if (forced(ch, db).includes(id)) return { ok: false, error: 'Ce personnage est imposé pour cet acte.' };
      return { ok: true, plan: plan.filter(p => p.unitId !== id) };
    }
    if (plan.length >= limit(ch)) return { ok: false, error: 'Retire un personnage avant d’en ajouter un autre.' };
    const next = arrange(ch, members, plan.map(p => p.unitId).concat(id), plan, terrainAt);
    return next ? { ok: true, plan: next } : { ok: false, error: 'Aucune disposition accessible pour ces personnages sur les cases de départ.' };
  }
  function move(ch, members, plan, id, point, terrainAt) {
    const from = plan.find(p => p.unitId === id), target = plan.find(p => same(p, point));
    if (!from || !canPlace(ch, members.find(u => u.sourceId === id), point, terrainAt) || (target && !canPlace(ch, members.find(u => u.sourceId === target.unitId), from, terrainAt))) return { ok: false, error: 'Placement impossible pour l’un des personnages.' };
    const destination = slots(ch).find(p => same(p, point)), origin = slots(ch).find(p => same(p, from));
    return { ok: true, plan: plan.map(p => p === from ? { unitId: id, ...destination } : p === target ? { unitId: p.unitId, ...origin } : { ...p }) };
  }
  return { enabled, slots, limit, forced, eligible, validate, canPlace, errors, arrange, initial, toggle, move };
});
