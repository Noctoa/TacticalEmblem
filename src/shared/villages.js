/* Villages d'un acte : accès, récompenses et visites conservées dans la campagne. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./team.js') : root.Team);
  if (common) module.exports = api; else root.Villages = api;
})(typeof self !== 'undefined' ? self : this, function (R, Team) {
  'use strict';
  const list = ch => ch.villages || [];
  const at = (ch, x, y) => list(ch).find(v => v.x === x && v.y === y);
  const visited = (campaign, ch, v) => (campaign.villageVisits || []).some(p => p.chapterId === ch.id && p.villageId === v.id);
  const closed = (ch, v, state) => state.visited.has(v.id) || (!v.repeatOnReplay && visited(state.campaign, ch, v));
  function validate(ch, db, map) {
    if (ch.villages === undefined) return [];
    if (!Array.isArray(ch.villages)) return ['Villages : une liste est attendue.'];
    const errors = [], ids = new Set(), points = new Set(), known = id => db.units.some(u => u.id === id);
    for (const v of ch.villages) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push('Village illisible.'); continue; }
      const name = v.name || v.id || 'Village';
      if (typeof v.id !== 'string' || !v.id || ids.has(v.id)) errors.push(`${name} : identifiant manquant ou en double.`);
      ids.add(v.id);
      if (!Number.isInteger(v.x) || !Number.isInteger(v.y) || v.x < 0 || v.y < 0 || v.x >= map.width || v.y >= map.height) errors.push(`${name} : position hors de la map.`);
      const point = v.x + ',' + v.y;
      if (points.has(point)) errors.push(`${name} : un village occupe déjà cette case.`);
      points.add(point);
      if ((v.name !== undefined && typeof v.name !== 'string') || (v.script !== undefined && typeof v.script !== 'string')) errors.push(`${name} : nom ou dialogue invalide.`);
      if (v.allowedUnits !== undefined && (!Array.isArray(v.allowedUnits) || v.allowedUnits.some(id => !known(id)) || new Set(v.allowedUnits).size !== v.allowedUnits.length)) errors.push(`${name} : visiteurs autorisés introuvables ou en double.`);
      if (v.recruitUnitId !== undefined && (typeof v.recruitUnitId !== 'string' || (v.recruitUnitId && !known(v.recruitUnitId)))) errors.push(`${name} : personnage à recruter introuvable.`);
      if (v.repeatOnReplay !== undefined && typeof v.repeatOnReplay !== 'boolean') errors.push(`${name} : réglage de répétition invalide.`);
      const reward = v.reward;
      if (reward === undefined) continue;
      if (!reward || typeof reward !== 'object' || Array.isArray(reward)) { errors.push(`${name} : récompense invalide.`); continue; }
      if (reward.gold !== undefined && (!Number.isSafeInteger(reward.gold) || reward.gold < 0 || reward.gold > 999999)) errors.push(`${name} : or invalide (0 à 999999).`);
      const entry = reward.itemId && R.getEntry(db, reward.itemId);
      if (reward.itemId !== undefined && (typeof reward.itemId !== 'string' || (reward.itemId && !entry))) errors.push(`${name} : arme ou objet de récompense introuvable.`);
      if (reward.uses !== undefined && (!Number.isInteger(reward.uses) || reward.uses < 0 || (entry && reward.uses > (entry.def.uses || 0)))) errors.push(`${name} : utilisations de la récompense invalides.`);
    }
    return [...new Set(errors)];
  }
  function offer(ch, v, unit, state, db) {
    const no = error => ({ ok: false, error });
    if (!v || !list(ch).includes(v)) return no('Village introuvable.');
    if (!unit || unit.team !== 'player' || unit.dead || unit.hp <= 0 || unit.done || unit.x !== v.x || unit.y !== v.y) return no('Une unité du joueur disponible doit se trouver sur le village.');
    if (closed(ch, v, state)) return no('Ce village a déjà été visité.');
    if ((v.allowedUnits || []).length && !v.allowedUnits.includes(unit.sourceId)) return no('Ce personnage ne peut pas visiter ce village.');
    const reward = v.reward || {}, entry = reward.itemId && R.getEntry(db, reward.itemId);
    if (reward.itemId && !entry) return no('Récompense introuvable.');
    const destination = entry ? unit.inventory.length < 5 ? 'unit' : state.convoy.length < state.capacity ? 'convoy' : '' : null;
    if (entry && !destination) return no('Inventaire et convoi pleins : libère une place avant de visiter.');
    let recruit = null;
    if (v.recruitUnitId) {
      const def = db.units.find(u => u.id === v.recruitUnitId);
      if (!def) return no('Personnage à recruter introuvable.');
      const present = state.units.find(u => u.sourceId === def.id && u.team !== 'enemy');
      const unavailable = (state.campaign.dead || []).includes(def.id) || (present && (present.dead || present.hp <= 0));
      const kind = unavailable ? 'unavailable' : present && present.team === 'player' ? 'already' : present && present.team === 'ally' ? 'ally' : (state.campaign.recruited || []).includes(def.id) ? 'already' : 'new';
      recruit = { id: def.id, name: def.name, kind, unit: present || null };
    }
    return { ok: true, gold: reward.gold || 0, slot: entry ? { id: reward.itemId, uses: reward.uses || entry.def.uses || 0 } : null, destination, recruit };
  }
  function claim(ch, v, unit, state, db) {
    const result = offer(ch, v, unit, state, db);
    if (!result.ok) return result;
    if (result.slot) (result.destination === 'unit' ? unit.inventory : state.convoy).push(result.slot);
    state.campaign.gold = (state.campaign.gold || 0) + result.gold;
    if (result.recruit && result.recruit.kind !== 'unavailable') Team.recruit(state.campaign, [result.recruit.id]);
    state.visited.add(v.id);
    if (!visited(state.campaign, ch, v)) (state.campaign.villageVisits || (state.campaign.villageVisits = [])).push({ chapterId: ch.id, villageId: v.id });
    return result;
  }
  function references(db, kind, id) {
    return (db.chapters || []).flatMap(ch => list(ch).filter(v => kind === 'units' ? v.recruitUnitId === id || (v.allowedUnits || []).includes(id) : (v.reward || {}).itemId === id).map(v => `${ch.name} — ${v.name || v.id}`));
  }
  return { list, at, visited, closed, validate, offer, claim, references };
});
