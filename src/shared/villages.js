/* Villages d'un acte : accès, récompenses et visites conservées dans la campagne. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./team.js') : root.Team, common ? require('./statuses.js') : root.Statuses);
  if (common) module.exports = api; else root.Villages = api;
})(typeof self !== 'undefined' ? self : this, function (R, Team, Statuses) {
  'use strict';
  const Factions = typeof module !== 'undefined' && module.exports ? require('./factions.js') : self.Factions;
  const playerSide = (u) => !!u && Factions.isPlayerSide(u.team);
  /** Unité venue d'un placement générique (ennemi, autre faction, allié générique) ; les anciennes unités ennemies sans placementId aussi. */
  const placed = (u) => !!u && (!!u.placementId || !Factions.isPlayerSide(u.team));
  const list = ch => ch.villages || [];
  const at = (ch, x, y) => list(ch).find(v => v.x === x && v.y === y);
  const visited = (campaign, ch, v) => (campaign.villageVisits || []).some(p => p.chapterId === ch.id && p.villageId === v.id);
  const ruined = (ch, v, state) => !!state.ruined?.has(v.id) || (!v.repeatOnReplay && (state.campaign.villageRuins || []).some(p => p.chapterId === ch.id && p.villageId === v.id));
  const closed = (ch, v, state) => ruined(ch, v, state) || state.visited.has(v.id) || (!v.repeatOnReplay && visited(state.campaign, ch, v));
  const status = (ch, v, state) => ruined(ch, v, state) ? 'ruined' : closed(ch, v, state) ? 'visited' : 'open';
  const classPillages = cls => typeof cls?.pillageVillages === 'boolean' ? cls.pillageVillages : /^(fe\d*_)?(brigand|bandit|pirate)$/.test(cls?.id || '');
  const canPillage = (unit, db) => !!unit && Factions.hostile(unit.team, 'player') && !unit.dead && unit.hp > 0 && Statuses.canAct(unit) &&
    (typeof unit.pillageVillages === 'boolean' ? unit.pillageVillages : classPillages((db.classes || []).find(c => c.id === unit.classId)));
  const bounds = (v, patch) => ({ x: v.x + (patch?.offsetX || 0), y: v.y + (patch?.offsetY || 0), w: patch?.width || 1, h: patch?.height || 1 });
  const inside = (x, y, area) => x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h;
  function validate(ch, db, map) {
    const raiderErrors = [...(db.classes || []), ...(ch.enemies || [])].filter(u => u.pillageVillages !== undefined && typeof u.pillageVillages !== 'boolean').map(u => `${u.name || u.id} : autorisation de pillage invalide.`);
    if (ch.villages === undefined) return raiderErrors;
    if (!Array.isArray(ch.villages)) return ['Villages : une liste est attendue.'];
    const errors = raiderErrors, ids = new Set(), points = new Set(), known = id => db.units.some(u => u.id === id);
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
      if (v.raidable !== undefined && typeof v.raidable !== 'boolean') errors.push(`${name} : autorisation de pillage invalide.`);
      if (v.ruinedTerrainId !== undefined && (typeof v.ruinedTerrainId !== 'string' || (v.ruinedTerrainId && !(db.terrains || []).some(t => t.id === v.ruinedTerrainId && R.moveCost(t, 'foot') < R.IMPASSABLE)))) errors.push(`${name} : terrain de ruines introuvable ou infranchissable.`);
      if (v.appearance !== undefined) {
        if (!v.appearance || typeof v.appearance !== 'object' || Array.isArray(v.appearance)) errors.push(`${name} : apparences invalides.`);
        else for (const kind of ['visited', 'ruined']) {
          const p = v.appearance[kind]; if (p === undefined) continue;
          const ts = p && (db.tilesets || []).find(t => t.id === p.tilesetId), area = bounds(v, p);
          if (!p || typeof p !== 'object' || Array.isArray(p) || !ts || !(map.tilesets || []).some(t => t.tilesetId === p.tilesetId) ||
            !['tileX', 'tileY', 'width', 'height', 'offsetX', 'offsetY'].every(k => Number.isInteger(p[k])) ||
            p.width < 1 || p.width > 16 || p.height < 1 || p.height > 16 || p.tileX < 0 || p.tileY < 0 || p.tileX + p.width > ts.columns ||
            (p.tileY + p.height - 1) * ts.columns + p.tileX + p.width > ts.tileCount || area.x < 0 || area.y < 0 || area.x + area.w > map.width || area.y + area.h > map.height)
            errors.push(`${name} : tuiles ${kind === 'visited' ? 'du village fermé' : 'des ruines'} invalides ou hors de la map.`);
        }
      }
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
    if (!unit || unit.team !== 'player' || unit.dead || unit.hp <= 0 || unit.done || !Statuses.canAct(unit) || unit.x !== v.x || unit.y !== v.y) return no('Une unité du joueur disponible doit se trouver sur le village.');
    if (ruined(ch, v, state)) return no('Ce village a été pillé : sa récompense est perdue.');
    if (closed(ch, v, state)) return no('Ce village a déjà été visité.');
    if ((v.allowedUnits || []).length && !v.allowedUnits.includes(unit.sourceId)) return no('Ce personnage ne peut pas visiter ce village.');
    const reward = rewardOffer(v.reward || {}, unit.inventory, state, db);
    if (!reward.ok) return reward;
    let recruit = null;
    if (v.recruitUnitId) {
      const def = db.units.find(u => u.id === v.recruitUnitId);
      if (!def) return no('Personnage à recruter introuvable.');
      const present = state.units.find(u => u.sourceId === def.id && playerSide(u) && !placed(u));
      const unavailable = (state.campaign.dead || []).includes(def.id) || (present && (present.dead || present.hp <= 0));
      const kind = unavailable ? 'unavailable' : present && present.team === 'player' ? 'already' : present && present.team === 'ally' ? 'ally' : (state.campaign.recruited || []).includes(def.id) ? 'already' : 'new';
      recruit = { id: def.id, name: def.name, kind, unit: present || null };
    }
    return { ...reward, recruit };
  }
  function rewardOffer(reward, inventory, state, db) {
    const no = error => ({ ok: false, error }), entry = reward.itemId && R.getEntry(db, reward.itemId);
    if (reward.itemId && !entry) return no('Récompense introuvable.');
    const destination = entry ? inventory.length < 5 ? 'unit' : state.convoy.length < state.capacity ? 'convoy' : '' : null;
    if (entry && !destination) return no('Inventaire et convoi pleins : libère une place avant de visiter.');
    return { ok: true, gold: reward.gold || 0, slot: entry ? { id: reward.itemId, uses: reward.uses || entry.def.uses || 0 } : null, destination };
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
    return (db.chapters || []).flatMap(ch => list(ch).filter(v => kind === 'units' ? v.recruitUnitId === id || (v.allowedUnits || []).includes(id) : kind === 'terrains' ? v.ruinedTerrainId === id : kind === 'tilesets' ? Object.values(v.appearance || {}).some(p => p?.tilesetId === id) : (v.reward || {}).itemId === id).map(v => `${ch.name} — ${v.name || v.id}`));
  }
  function pillage(ch, v, unit, state, db) {
    if (!list(ch).includes(v) || !canPillage(unit, db) || v.raidable === false || closed(ch, v, state) || unit.x !== v.x || unit.y !== v.y) return { ok: false };
    (state.ruined || (state.ruined = new Set())).add(v.id);
    if (!(state.campaign.villageRuins || []).some(p => p.chapterId === ch.id && p.villageId === v.id))
      (state.campaign.villageRuins || (state.campaign.villageRuins = [])).push({ chapterId: ch.id, villageId: v.id });
    return { ok: true };
  }
  /** Les pillards poursuivent un village accessible ; ils combattent normalement s'il est bloqué. */
  function planRaid(unit, ch, state, db, context) {
    if (!canPillage(unit, db)) return null;
    const targets = list(ch).filter(v => v.raidable !== false && !closed(ch, v, state));
    if (!targets.length) return null;
    const ctx = R.perceivedContext(unit, context, state.units);
    const stationary = ['stationary', 'boss'].includes(unit.ai);
    const far = R.reachable(unit, ctx, stationary ? 0 : 999);
    let goal = null, village = null;
    for (const v of targets) {
      const node = far.get(R.key(v.x, v.y));
      if (node?.canStop && (!goal || node.cost < goal.cost)) { goal = node; village = v; }
    }
    if (!goal) return null;
    const reach = R.reachable(unit, ctx, stationary ? 0 : undefined);
    let dest = reach.get(R.key(unit.x, unit.y));
    for (const step of R.pathTo(far, goal.x, goal.y)) {
      const node = reach.get(R.key(step.x, step.y)); if (node?.canStop) dest = node;
    }
    if (!dest || (!dest.cost && (dest.x !== village.x || dest.y !== village.y))) return null;
    return { action: dest.x === village.x && dest.y === village.y ? 'pillage' : 'move', village,
      moveTo: { x: dest.x, y: dest.y }, path: R.pathTo(reach, dest.x, dest.y), target: null };
  }
  function terrainAt(ch, db, x, y, state, base) {
    for (const v of list(ch)) if (ruined(ch, v, state) && inside(x, y, bounds(v, v.appearance?.ruined)))
      return (db.terrains || []).find(t => t.id === (v.ruinedTerrainId || 'plain')) || base;
    return base;
  }
  /** Remplace les tuiles de la zone, sans modifier les calques du projet. */
  function visualMap(map, ch, state, db) {
    let layers = null;
    for (const v of list(ch)) {
      const kind = status(ch, v, state), patch = v.appearance?.[kind];
      if (kind === 'open' || (!patch && kind !== 'ruined')) continue;
      const area = bounds(v, patch), ref = patch && map.tilesets.find(t => t.tilesetId === patch.tilesetId);
      const ts = ref && db.tilesets.find(t => t.id === ref.tilesetId);
      if (patch && (!ts || !ref)) continue;
      if (!layers) layers = map.layers.map(l => ({ ...l, data: l.data.slice() }));
      let dest = layers.find(l => l.visible);
      if (!dest) { dest = { id: '@villages', visible: true, data: Array(map.width * map.height).fill(0) }; layers.push(dest); }
      let ground = 0;
      if (!patch) for (const r of map.tilesets || []) {
        const set = (db.tilesets || []).find(t => t.id === r.tilesetId);
        const entry = set && Object.entries(set.tileTerrain || {}).find(([, id]) => id === (v.ruinedTerrainId || 'plain'));
        if (entry) { ground = r.firstgid + Number(entry[0]); break; }
      }
      for (let y = 0; y < area.h; y++) for (let x = 0; x < area.w; x++) {
        if (area.x + x < 0 || area.y + y < 0 || area.x + x >= map.width || area.y + y >= map.height) continue;
        const i = (area.y + y) * map.width + area.x + x;
        for (const layer of layers) layer.data[i] = 0;
        dest.data[i] = patch ? ref.firstgid + (patch.tileY + y) * ts.columns + patch.tileX + x : ground;
      }
    }
    return layers ? { ...map, layers } : map;
  }
  return { list, at, visited, ruined, closed, status, classPillages, canPillage, bounds, validate, offer, claim, rewardOffer, references, pillage, planRaid, terrainAt, visualMap };
});
