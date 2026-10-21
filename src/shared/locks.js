/* Coffres et portes : clés, crochetage, récompenses et terrain des passages. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./skills.js') : root.Skills, common ? require('./villages.js') : root.Villages);
  if (common) module.exports = api; else root.Locks = api;
})(typeof self !== 'undefined' ? self : this, function (R, Skills, Villages) {
  'use strict';
  const lists = ['chests', 'doors'];
  const list = (ch, kind) => ch && ch[kind] || [];
  const at = (ch, kind, x, y) => list(ch, kind).find(o => o.x === x && o.y === y);
  const visited = (campaign, ch, chest) => (campaign.chestVisits || []).some(p => p.chapterId === ch.id && p.chestId === chest.id);
  const opened = (ch, kind, object, state) => kind === 'doors' ? state.openedDoors.has(object.id) : state.openedChests.has(object.id) || (!object.repeatOnReplay && visited(state.campaign, ch, object));
  const keyMatches = (item, kind) => item && item.effect === 'key' && (item.keyType === 'both' || item.keyType === (kind === 'chests' ? 'chest' : 'door'));
  const canPick = (unit, db) => Skills.assigned(unit, db.skills || []).some(entry => entry.skill.effect === 'lockpick');
  function validateKeys(db) {
    return (db.items || []).filter(i => i.effect === 'key').flatMap(i => !['chest', 'door', 'both'].includes(i.keyType) || !Number.isInteger(i.uses) || i.uses < 1 || i.uses > 99 ? [`${i.name || i.id} : type de clé ou utilisations invalides.`] : []);
  }
  function validate(ch, db, map) {
    const errors = [], points = new Set((Array.isArray(ch.villages) ? ch.villages : []).filter(Boolean).map(v => v.x + ',' + v.y));
    for (const kind of lists) {
      if (ch[kind] === undefined) continue;
      if (!Array.isArray(ch[kind])) { errors.push(`${kind === 'chests' ? 'Coffres' : 'Portes'} : une liste est attendue.`); continue; }
      errors.push(...Villages.validate({ villages: ch[kind] }, db, map));
      for (const object of ch[kind]) {
        if (!object || typeof object !== 'object') continue;
        const name = object.name || object.id, point = object.x + ',' + object.y;
        if (points.has(point)) errors.push(`${name} : une autre interaction occupe déjà cette case.`);
        points.add(point);
        for (const field of ['locked', 'allowLockpick']) if (object[field] !== undefined && typeof object[field] !== 'boolean') errors.push(`${name} : réglage de serrure invalide.`);
        if (object.keyItemId !== undefined && (typeof object.keyItemId !== 'string' || (object.keyItemId && !keyMatches(R.byId(db.items, object.keyItemId), kind)))) errors.push(`${name} : clé requise introuvable ou incompatible.`);
        if (object.recruitUnitId) errors.push(`${name} : le recrutement se règle sur un village.`);
        if (kind === 'doors') {
          if (!db.terrains.some(t => t.id === object.openTerrainId && R.moveCost(t, 'foot') < R.IMPASSABLE)) errors.push(`${name} : choisis un terrain de passage accessible à pied.`);
          if ([...(ch.players || []), ...(ch.allies || []), ...(ch.enemies || []).filter(e => !e.eventOnly && !(e.appearTurn > 0))].some(p => p.x === object.x && p.y === object.y)) errors.push(`${name} : une unité ne peut pas commencer sur une porte fermée.`);
          if (object.reward && ((object.reward.gold || 0) || object.reward.itemId)) errors.push(`${name} : les récompenses se règlent sur les coffres.`);
        }
      }
    }
    return [...new Set(errors)];
  }
  function offer(ch, kind, object, unit, state, db) {
    const no = error => ({ ok: false, error });
    if (!object || !lists.includes(kind) || !list(ch, kind).includes(object)) return no('Interaction introuvable.');
    if (!unit || unit.team !== 'player' || unit.dead || unit.hp <= 0 || unit.done) return no('Une unité du joueur disponible est nécessaire.');
    const distance = R.dist(unit, object);
    if (distance !== (kind === 'doors' ? 1 : 0)) return no(kind === 'doors' ? 'Place le personnage à côté de la porte.' : 'Place le personnage sur le coffre.');
    if (opened(ch, kind, object, state)) return no('Déjà ouvert.');
    if ((object.allowedUnits || []).length && !object.allowedUnits.includes(unit.sourceId)) return no('Ce personnage n’est pas autorisé à ouvrir cette serrure.');
    let keyIndex = -1, method = 'free';
    if (object.locked !== false) {
      if (object.allowLockpick !== false && canPick(unit, db)) method = 'lockpick';
      else {
        keyIndex = unit.inventory.findIndex(slot => slot.uses > 0 && keyMatches(R.byId(db.items, slot.id), kind) && (!object.keyItemId || slot.id === object.keyItemId));
        if (keyIndex < 0) return no(object.keyItemId ? 'Clé requise : ' + (R.byId(db.items, object.keyItemId) || {}).name + '.' : 'Il faut une clé adaptée dans l’inventaire' + (object.allowLockpick !== false ? ' ou Crochetage équipé.' : '.'));
        method = 'key';
      }
    }
    const inventory = unit.inventory.filter((slot, index) => index !== keyIndex || slot.uses > 1);
    const reward = Villages.rewardOffer(kind === 'chests' ? object.reward || {} : {}, inventory, state, db);
    if (!reward.ok) return { ...reward, error: 'Inventaire et convoi pleins : libère une place avant d’ouvrir.' };
    return { ...reward, method, keyIndex };
  }
  function claim(ch, kind, object, unit, state, db) {
    const result = offer(ch, kind, object, unit, state, db);
    if (!result.ok) return result;
    if (result.keyIndex >= 0) {
      const key = unit.inventory[result.keyIndex]; key.uses--;
      if (!key.uses) unit.inventory.splice(result.keyIndex, 1);
    }
    if (result.slot) (result.destination === 'unit' ? unit.inventory : state.convoy).push(result.slot);
    state.campaign.gold = (state.campaign.gold || 0) + result.gold;
    if (kind === 'doors') state.openedDoors.add(object.id);
    else {
      state.openedChests.add(object.id);
      if (!visited(state.campaign, ch, object)) (state.campaign.chestVisits || (state.campaign.chestVisits = [])).push({ chapterId: ch.id, chestId: object.id });
    }
    return result;
  }
  const blockedTerrain = { id: '@closed-door', name: 'Porte fermée', def: 0, avoid: 0, heal: 0, cost: { foot: 99, horse: 99, armor: 99, flier: 99 } };
  function terrainAt(ch, db, x, y, openedDoors, base) {
    const door = at(ch, 'doors', x, y);
    return !door ? base : !openedDoors.has(door.id) ? blockedTerrain : R.byId(db.terrains, door.openTerrainId) || base;
  }
  function floorTile(map, db, terrainId) {
    for (const ref of map.tilesets || []) {
      const ts = R.byId(db.tilesets, ref.tilesetId); if (!ts) continue;
      const entry = Object.entries(ts.tileTerrain || {}).find(([, id]) => id === terrainId);
      if (entry) return { tileset: ts, local: Number(entry[0]) };
    }
    return null;
  }
  function references(db, kind, id) {
    return (db.chapters || []).flatMap(ch => lists.flatMap(type => list(ch, type).filter(o => kind === 'units' ? (o.allowedUnits || []).includes(id) : kind === 'terrains' ? o.openTerrainId === id : o.keyItemId === id || (o.reward || {}).itemId === id).map(o => `${ch.name} — ${o.name || o.id}`)));
  }
  return { lists, list, at, visited, opened, keyMatches, canPick, validateKeys, validate, offer, claim, terrainAt, floorTile, references };
});
