'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const L = require('../src/shared/locks'), D = require('../src/shared/defaults'), R = require('../src/shared/rules'), S = require('../src/shared/skills'), C = require('../src/shared/campaign'), io = require('../src/main/project-io');
function fixture() {
  const p = D.sampleProject('Serrures'), db = p.db, ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
  ch.villages = []; ch.players = [{ unitId: 'c_eliwood', x: 1, y: 1 }]; ch.allies = []; ch.enemies = [];
  const chest = { id: 'c1', name: 'Trésor', x: 1, y: 1, locked: true, reward: { gold: 80, itemId: 'w_iron_sword', uses: 7 } };
  const door = { id: 'd1', name: 'Porte', x: 2, y: 1, locked: true, openTerrainId: 'floor' };
  ch.chests = [chest]; ch.doors = [door];
  const unit = R.makeUnitFromCharacter(db.units[0], db, { x: 1, y: 1 }); unit.inventory = [{ id: 'i_chest_key', uses: 2 }, { id: 'i_door_key', uses: 1 }];
  const state = { campaign: C.create('classic'), openedChests: new Set(), openedDoors: new Set(), convoy: [], capacity: 2 };
  return { p, db, ch, map, chest, door, unit, state };
}
test('clés compatibles et consommées une fois, types de serrure et distance exacte', () => {
  const { db, ch, chest, door, unit, state } = fixture();
  assert.ok(L.offer(ch, 'chests', chest, unit, state, db).ok); assert.ok(L.offer(ch, 'doors', door, unit, state, db).ok);
  assert.ok(L.claim(ch, 'chests', chest, unit, state, db).ok); assert.equal(unit.inventory[0].uses, 1);
  assert.equal(state.campaign.gold, 80); assert.deepEqual(unit.inventory.at(-1), { id: 'w_iron_sword', uses: 7 });
  assert.equal(L.claim(ch, 'chests', chest, unit, state, db).ok, false); assert.equal(unit.inventory[0].uses, 1);
  assert.ok(L.claim(ch, 'doors', door, unit, state, db).ok); assert.ok(!unit.inventory.some(i => i.id === 'i_door_key'));
  assert.ok(state.openedDoors.has(door.id));
  state.openedDoors.clear(); unit.x = 2; unit.y = 2; assert.equal(L.offer(ch, 'doors', door, unit, state, db).ok, false);
  unit.x = 1; unit.y = 2; unit.inventory = [{ id: 'i_door_key', uses: 1 }]; assert.equal(L.offer(ch, 'doors', door, unit, state, db).ok, false);
});
test('clé universelle, clé spécifique et serrure sans verrou', () => {
  const { db, ch, chest, door, unit, state } = fixture(); db.items.push({ id: 'universal', name: 'Passe-partout', effect: 'key', keyType: 'both', uses: 3 });
  unit.inventory = [{ id: 'universal', uses: 3 }];
  assert.ok(L.offer(ch, 'chests', chest, unit, state, db).ok); assert.ok(L.offer(ch, 'doors', door, unit, state, db).ok);
  door.keyItemId = 'i_door_key'; assert.equal(L.offer(ch, 'doors', door, unit, state, db).ok, false);
  door.locked = false; assert.equal(L.claim(ch, 'doors', door, unit, state, db).method, 'free'); assert.equal(unit.inventory[0].uses, 3);
});
test('Crochetage : personnelle ou équipée, jamais en réserve, sans consommer de clé', () => {
  const { db, ch, chest, unit, state } = fixture(); unit.inventory = []; unit.learnedSkills = ['skill_lockpick'];
  assert.equal(L.offer(ch, 'chests', chest, unit, state, db).ok, false);
  unit.equippedSkills = ['skill_lockpick']; assert.ok(L.canPick(unit, db));
  assert.equal(L.offer(ch, 'chests', chest, unit, state, db).method, 'lockpick');
  unit.inventory.push({ id: 'i_chest_key', uses: 2 }); L.claim(ch, 'chests', chest, unit, state, db); assert.equal(unit.inventory[0].uses, 2);
  unit.equippedSkills = []; unit.personalSkill = 'skill_lockpick'; assert.ok(L.canPick(unit, db));
  state.openedChests.clear(); state.campaign.chestVisits = []; chest.allowLockpick = false; unit.inventory = [];
  assert.equal(L.offer(ch, 'chests', chest, unit, state, db).ok, false);
  assert.ok(!S.active(unit, db.skills).some(s => s.effect === 'lockpick'));
});
test('inventaires pleins : échec atomique ou place libérée par la dernière utilisation de clé', () => {
  const { db, ch, chest, unit, state } = fixture(); state.capacity = 0;
  unit.inventory = [{ id: 'i_chest_key', uses: 2 }, ...Array.from({ length: 4 }, () => ({ id: 'i_vulnerary', uses: 2 }))];
  const before = JSON.stringify([unit, state.campaign, state.convoy]);
  assert.equal(L.claim(ch, 'chests', chest, unit, state, db).ok, false); assert.equal(JSON.stringify([unit, state.campaign, state.convoy]), before);
  assert.equal(state.openedChests.size, 0);
  unit.inventory[0].uses = 1; const result = L.claim(ch, 'chests', chest, unit, state, db);
  assert.ok(result.ok); assert.equal(result.destination, 'unit'); assert.equal(unit.inventory.length, 5);
  assert.ok(!unit.inventory.some(i => i.id === 'i_chest_key')); assert.equal(unit.inventory.at(-1).uses, 7);
});
test('inventaire plein et convoi disponible : récompense transférée, clé conservée avec un usage en moins', () => {
  const { db, ch, chest, unit, state } = fixture(); unit.inventory = [{ id: 'i_chest_key', uses: 2 }, ...Array.from({ length: 4 }, () => ({ id: 'i_vulnerary', uses: 2 }))];
  const result = L.claim(ch, 'chests', chest, unit, state, db); assert.equal(result.destination, 'convoy'); assert.equal(unit.inventory[0].uses, 1);
  assert.deepEqual(state.convoy, [{ id: 'w_iron_sword', uses: 7 }]);
});
test('joueur vivant disponible et autorisations : aucune consommation pour une action invalide', () => {
  const { db, ch, chest, unit, state } = fixture();
  for (const patch of [{ team: 'enemy' }, { team: 'ally' }, { hp: 0 }, { dead: true }, { done: true }, { x: 5 }]) assert.equal(L.offer(ch, 'chests', chest, { ...unit, ...patch }, state, db).ok, false);
  chest.allowedUnits = ['c_lyn']; assert.equal(L.offer(ch, 'chests', chest, unit, state, db).ok, false); assert.equal(unit.inventory[0].uses, 2);
});
test('porte fermée : tous les déplacements bloqués ; ouverte : passage pour les unités et portées de l’IA', () => {
  const { db, ch, door, unit, state } = fixture(), wall = db.terrains.find(t => t.id === 'wall'), floor = db.terrains.find(t => t.id === 'floor');
  const base = (x, y) => y === 1 && x !== 2 ? floor : wall;
  const ctx = { width: 5, height: 3, unitAt: () => null, terrainAt: (x, y) => L.terrainAt(ch, db, x, y, state.openedDoors, base(x, y)) };
  for (const type of R.MOVE_TYPES) assert.equal(R.moveCost(ctx.terrainAt(2, 1), type.id), 99);
  assert.ok(!R.reachable(unit, ctx).has(R.key(3, 1)));
  const enemy = { ...unit, team: 'enemy', inventory: [{ id: 'w_iron_sword', uses: 20 }] };
  assert.ok(!R.threatTiles(enemy, ctx, db).has(R.key(4, 1)));
  L.claim(ch, 'doors', door, unit, state, db);
  assert.strictEqual(ctx.terrainAt(2, 1), floor); assert.ok(R.reachable(unit, ctx).has(R.key(3, 1))); assert.ok(R.threatTiles(enemy, ctx, db).has(R.key(4, 1)));
  assert.strictEqual(base(2, 1), wall); assert.ok(L.floorTile({ tilesets: [{ tilesetId: db.tilesets[0].id, firstgid: 1 }] }, db, 'floor'));
});
test('reprise de début d’acte : portes refermées, clés et récompenses restaurées ensemble', () => {
  const { db, ch, door, chest, unit, state } = fixture(); C.commit(state.campaign, [unit]); const checkpoint = C.checkpoint(ch.id, state.campaign, [], {});
  L.claim(ch, 'chests', chest, unit, state, db); L.claim(ch, 'doors', door, unit, state, db);
  assert.equal(state.campaign.gold, 80);
  const restored = C.restore(checkpoint, {}), fresh = C.apply(restored.campaign, R.makeUnitFromCharacter(db.units[0], db, chest), db);
  const retry = { ...state, ...restored, openedChests: new Set(), openedDoors: new Set() };
  assert.equal(retry.campaign.gold, 0); assert.equal(L.opened(ch, 'doors', door, retry), false); assert.equal(L.opened(ch, 'chests', chest, retry), false);
  assert.equal(fresh.inventory[0].uses, 2); assert.ok(L.offer(ch, 'chests', chest, fresh, retry, db).ok);
});
test('coffres : une récompense par campagne ou par rejeu, portes toujours refermées à la nouvelle tentative', () => {
  const { db, ch, chest, door, unit, state } = fixture(); L.claim(ch, 'chests', chest, unit, state, db); L.claim(ch, 'doors', door, unit, state, db);
  const replay = { ...state, openedChests: new Set(), openedDoors: new Set() };
  assert.ok(L.opened(ch, 'chests', chest, replay)); assert.equal(L.opened(ch, 'doors', door, replay), false);
  chest.repeatOnReplay = true; assert.equal(L.opened(ch, 'chests', chest, replay), false);
  assert.ok(L.claim(ch, 'chests', chest, unit, replay, db).ok); assert.equal(state.campaign.gold, 160); assert.equal(state.campaign.chestVisits.length, 1);
});
test('validation : positions, superpositions, clés, terrains et récompenses invalides avant écriture', t => {
  const { p, db, ch, map, chest } = fixture(); assert.deepEqual(L.validate(ch, db, map), []); assert.deepEqual(L.validateKeys(db), []);
  const bad = mutate => { const copy = JSON.parse(JSON.stringify(ch)); mutate(copy); assert.ok(L.validate(copy, db, map).length); };
  bad(c => c.chests = {}); bad(c => c.chests.push({ ...c.chests[0] })); bad(c => c.doors[0].openTerrainId = 'wall'); bad(c => c.doors[0].keyItemId = 'i_chest_key');
  bad(c => c.chests[0].reward.itemId = 'missing'); bad(c => c.chests[0].x = map.width); bad(c => c.doors[0].x = 1); bad(c => c.doors[0].locked = 'oui');
  bad(c => c.villages = [{ id: 'v', x: 2, y: 1 }]); bad(c => c.doors[0].openTerrainId = 'missing');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-locks-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, p); assert.deepEqual(io.loadProject(dir).db.chapters[0].chests, ch.chests);
  const before = fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8'); chest.reward.itemId = 'missing';
  assert.throws(() => io.saveProject(dir, p), /récompense introuvable/); assert.equal(fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8'), before);
});
test('ancien projet, référence utilisée, sauvegarde et classe Voleur', () => {
  const { db, ch, map, chest, door, unit, state } = fixture();
  door.keyItemId = 'i_door_key'; assert.equal(L.references(db, 'items', 'i_door_key').length, 1); assert.equal(L.references(db, 'terrains', 'floor').length, 1);
  L.claim(ch, 'chests', chest, unit, state, db); const save = C.checkpoint(ch.id, state.campaign, [], {});
  assert.doesNotThrow(() => C.restore(save, {})); save.campaign.chestVisits.push(save.campaign.chestVisits[0]); assert.throws(() => C.validate(save), /Ouvertures de coffres invalides/);
  delete ch.chests; delete ch.doors; assert.deepEqual(L.validate(ch, db, map), []);
  const thief = R.makeUnitFromCharacter({ ...db.units[0], classId: 'thief', personalSkill: '', learnedSkills: [], equippedSkills: undefined }, db, { x: 1, y: 1 });
  assert.ok(L.canPick(thief, db)); assert.equal(S.validateAll(db.skills).length, 0);
});
