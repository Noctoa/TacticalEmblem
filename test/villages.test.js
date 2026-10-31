'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const V = require('../src/shared/villages'), D = require('../src/shared/defaults'), R = require('../src/shared/rules');
const C = require('../src/shared/campaign'), io = require('../src/main/project-io');
const Side = require('../src/shared/side-objectives'), Scenario = require('../src/shared/scenario');
function fixture() {
  const p = D.sampleProject('Villages'), db = p.db, ch = db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
  const village = { id: 'v_test', name: 'Village du pont', x: 3, y: 3, script: 'Villageois: Merci !', reward: { gold: 120, itemId: 'w_iron_sword', uses: 7 }, allowedUnits: [] };
  ch.villages = [village];
  const unit = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_eliwood'), db, village);
  const state = { campaign: C.create('classic'), visited: new Set(), convoy: [], capacity: 2, units: [unit] };
  return { p, db, ch, map, village, unit, state };
}
test('anciens actes et sauvegardes sans villages : comportement inchangé', () => {
  const { ch, db, map, state } = fixture(); delete ch.villages;
  assert.deepEqual(V.list(ch), []); assert.equal(V.at(ch, 3, 3), undefined); assert.deepEqual(V.validate(ch, db, map), []);
  assert.doesNotThrow(() => C.validate(C.checkpoint(ch.id, state.campaign, [], {})));
});
test('visiteur : case exacte, joueur vivant disponible et autorisations', () => {
  const { ch, db, village, unit, state } = fixture();
  const no = patch => { const u = { ...unit, ...patch }; assert.equal(V.offer(ch, village, u, state, db).ok, false); };
  no({ x: 4 }); no({ team: 'ally' }); no({ team: 'enemy' }); no({ hp: 0 }); no({ dead: true }); no({ done: true });
  village.allowedUnits = ['c_lyn']; assert.equal(V.offer(ch, village, unit, state, db).ok, false);
  village.allowedUnits = [unit.sourceId]; assert.ok(V.offer(ch, village, unit, state, db).ok);
});
test('récompenses atomiques : or, objet avec usages, offre sans mutation et visite unique', () => {
  const { ch, db, village, unit, state } = fixture(), initial = JSON.stringify([state.campaign, unit.inventory]);
  const before = unit.inventory.length; assert.ok(V.offer(ch, village, unit, state, db).ok);
  assert.equal(JSON.stringify([state.campaign, unit.inventory]), initial);
  assert.ok(V.claim(ch, village, unit, state, db).ok);
  assert.equal(state.campaign.gold, 120); assert.equal(unit.inventory.length, before + 1);
  assert.deepEqual(unit.inventory.at(-1), { id: 'w_iron_sword', uses: 7 });
  assert.deepEqual(state.campaign.villageVisits, [{ chapterId: ch.id, villageId: village.id }]);
  assert.equal(V.claim(ch, village, unit, state, db).ok, false); assert.equal(state.campaign.gold, 120);
});
test('inventaire plein : convoi, ou refus sans perte ni récompense partielle quand tout est plein', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud';
  unit.inventory = Array.from({ length: 5 }, () => ({ id: 'i_vulnerary', uses: 2 }));
  state.capacity = 0; const before = JSON.stringify([unit, state.campaign, state.convoy]);
  assert.equal(V.claim(ch, village, unit, state, db).ok, false);
  assert.equal(JSON.stringify([unit, state.campaign, state.convoy]), before); assert.equal(state.visited.size, 0);
  state.capacity = 1; assert.equal(V.claim(ch, village, unit, state, db).destination, 'convoy');
  assert.equal(unit.inventory.length, 5); assert.deepEqual(state.convoy, [{ id: 'w_iron_sword', uses: 7 }]);
});
test('répétition : une fois par campagne par défaut, option par acte rejoué, jamais deux fois dans la tentative', () => {
  const { ch, db, village, unit, state } = fixture(); village.reward = { gold: 10 };
  V.claim(ch, village, unit, state, db); state.visited.clear();
  assert.ok(V.closed(ch, village, state)); assert.equal(V.offer(ch, village, unit, state, db).ok, false);
  village.repeatOnReplay = true; assert.ok(V.claim(ch, village, unit, state, db).ok);
  assert.equal(state.campaign.gold, 20); assert.equal(state.campaign.villageVisits.length, 1);
  assert.equal(V.claim(ch, village, unit, state, db).ok, false);
  const another = { ...ch, id: 'another' }; state.visited.clear(); village.repeatOnReplay = false;
  assert.equal(V.closed(another, village, state), false);
});
test('recommencer annule visites, or, objets et recrutements de la tentative', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud';
  C.commit(state.campaign, [unit]); const before = C.checkpoint(ch.id, state.campaign, [], {});
  V.claim(ch, village, unit, state, db); assert.ok(state.campaign.recruited.includes('c_cloud'));
  const restored = C.restore(before, {});
  assert.equal(restored.campaign.gold, 0); assert.equal(restored.campaign.villageVisits, undefined);
  const fresh = C.apply(restored.campaign, R.makeUnitFromCharacter(db.units.find(u => u.id === unit.sourceId), db, village), db);
  const next = { ...state, ...restored, units: [fresh], visited: new Set() };
  assert.ok(V.claim(ch, village, fresh, next, db).ok); assert.equal(restored.campaign.gold, 120);
  assert.equal(fresh.inventory.length, before.campaign.units[unit.sourceId].inventory.length + 1);
});
test('recrutement : nouveau, allié existant, déjà recruté ou mort, sans doublons ni résurrection', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud';
  assert.equal(V.offer(ch, village, unit, state, db).recruit.kind, 'new');
  const ally = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_cloud'), db, { x: 8, y: 8 }, 'ally'); ally.hp = 3;
  state.units.push(ally); assert.equal(V.offer(ch, village, unit, state, db).recruit.kind, 'ally');
  assert.strictEqual(V.offer(ch, village, unit, state, db).recruit.unit, ally);
  ally.dead = true; assert.equal(V.offer(ch, village, unit, state, db).recruit.kind, 'unavailable');
  ally.dead = false; state.campaign.dead.push('c_cloud'); assert.equal(V.claim(ch, village, unit, state, db).recruit.kind, 'unavailable');
  assert.equal(state.campaign.recruited, undefined); assert.equal(ally.hp, 3);
  state.visited.clear(); state.campaign.villageVisits = []; state.campaign.dead = []; state.units.pop(); state.campaign.recruited = ['c_cloud'];
  assert.equal(V.claim(ch, village, unit, state, db).recruit.kind, 'already'); assert.deepEqual(state.campaign.recruited, ['c_cloud']);
});
test('validation des positions, récompenses, visiteurs et références, avant écriture', t => {
  const { p, ch, db, map, village } = fixture(); assert.deepEqual(V.validate(ch, db, map), []);
  const bad = mutate => { const copy = JSON.parse(JSON.stringify(ch)); mutate(copy); assert.ok(V.validate(copy, db, map).length); };
  bad(c => c.villages = {}); bad(c => c.villages = [null]); bad(c => c.villages.push(c.villages[0]));
  bad(c => c.villages[0].x = map.width); bad(c => c.villages[0].y = -1); bad(c => c.villages[0].id = '');
  bad(c => c.villages[0].reward.gold = -1); bad(c => c.villages[0].reward.gold = 0.5); bad(c => c.villages[0].reward.itemId = 'missing');
  bad(c => c.villages[0].reward.uses = 999); bad(c => c.villages[0].reward = []); bad(c => c.villages[0].script = {});
  bad(c => c.villages[0].recruitUnitId = 'missing'); bad(c => c.villages[0].allowedUnits = ['missing']); bad(c => c.villages[0].repeatOnReplay = 'oui');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-village-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, p); assert.deepEqual(io.loadProject(dir).db.chapters[0].villages, ch.villages);
  const before = fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8');
  village.reward.itemId = 'missing'; assert.throws(() => io.saveProject(dir, p), /récompense introuvable/);
  assert.equal(fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8'), before);
});
test('visites sauvegardées : compatibilité, détection des doublons et références protégées', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud'; village.allowedUnits = ['c_eliwood'];
  assert.equal(V.references(db, 'units', 'c_cloud').length, 1); assert.equal(V.references(db, 'units', 'c_eliwood').length, 1);
  assert.equal(V.references(db, 'weapons', 'w_iron_sword').length, 1); assert.equal(V.references(db, 'items', 'missing').length, 0);
  V.claim(ch, village, unit, state, db); C.commit(state.campaign, state.units);
  const saved = C.checkpoint(ch.id, state.campaign, state.convoy, {}), restored = C.restore(JSON.parse(JSON.stringify(saved)), {});
  assert.ok(V.visited(restored.campaign, ch, village));
  saved.campaign.villageVisits.push(saved.campaign.villageVisits[0]); assert.throws(() => C.validate(saved), /Visites de villages invalides/);
  saved.campaign.villageVisits = [{}]; assert.throws(() => C.validate(saved), /Visites de villages invalides/);
});

function raidFixture() {
  const f = fixture();
  f.enemy = R.makeEnemyFromPlacement({ id: 'raider', classId: 'brigand', x: 1, y: 3, level: 1, ai: 'aggressive' }, f.db);
  f.state.units.push(f.enemy); f.state.ruined = new Set(); f.unit.x = 0; f.unit.y = 0;
  f.ctx = { width: 10, height: 8, terrainAt: () => ({ cost: { foot: 1 } }), unitAt: (x, y) => f.state.units.find(u => !u.dead && u.hp > 0 && u.x === x && u.y === y) };
  return f;
}
test('pillards : classes par défaut et importées, réglages de classe/placement, sommeil et équipes', () => {
  const f = raidFixture(); assert.equal(V.canPillage(f.enemy, f.db), true);
  for (const id of ['brigand', 'pirate', 'fe7_brigand', 'fe6_pirate', 'fe16_brigand']) assert.equal(V.classPillages({ id }), true);
  assert.equal(V.classPillages({ id: 'fighter' }), false);
  const cls = f.db.classes.find(c => c.id === 'brigand'); cls.pillageVillages = false;
  assert.equal(V.canPillage(f.enemy, f.db), false); f.enemy.pillageVillages = true; assert.equal(V.canPillage(f.enemy, f.db), true);
  f.enemy.pillageVillages = false; cls.pillageVillages = true; assert.equal(V.canPillage(f.enemy, f.db), false);
  delete f.enemy.pillageVillages;
  for (const change of [{ hp: 0 }, { dead: true }, { team: 'player' }, { team: 'ally' }, { statuses: { sleep: { turns: 2 } } }]) assert.equal(V.canPillage({ ...f.enemy, ...change }, f.db), false);
  assert.equal(V.canPillage({ ...f.enemy, statuses: { silence: { turns: 2 } } }, f.db), true);
  assert.equal(R.makeEnemyFromPlacement({ id: 'safe', classId: 'brigand', x: 0, y: 0, pillageVillages: false }, f.db).pillageVillages, false);
});
test('pillage : case exacte, village ouvert, aucune récompense ni recrue, pas de double pillage', () => {
  const f = raidFixture(); f.village.recruitUnitId = 'c_cloud';
  assert.equal(V.pillage(f.ch, f.village, f.enemy, f.state, f.db).ok, false);
  Object.assign(f.enemy, { x: f.village.x, y: f.village.y });
  const inventory = JSON.stringify(f.enemy.inventory);
  assert.equal(V.pillage(f.ch, f.village, f.enemy, f.state, f.db).ok, true);
  assert.equal(V.status(f.ch, f.village, f.state), 'ruined'); assert.equal(f.state.campaign.gold, 0);
  assert.equal(f.state.campaign.recruited, undefined); assert.equal(f.state.visited.size, 0); assert.equal(JSON.stringify(f.enemy.inventory), inventory);
  assert.equal(V.pillage(f.ch, f.village, f.enemy, f.state, f.db).ok, false);
  assert.equal(f.state.campaign.villageRuins.length, 1);
  Object.assign(f.unit, { x: f.village.x, y: f.village.y });
  assert.match(V.offer(f.ch, f.village, f.unit, f.state, f.db).error, /pillé/);
  assert.equal(V.claim(f.ch, f.village, f.unit, f.state, f.db).ok, false);
});
test('un village visité est protégé, et le créateur peut interdire le pillage', () => {
  const f = raidFixture(); Object.assign(f.unit, { x: 3, y: 3 });
  V.claim(f.ch, f.village, f.unit, f.state, f.db); Object.assign(f.enemy, { x: 3, y: 3 });
  assert.equal(V.pillage(f.ch, f.village, f.enemy, f.state, f.db).ok, false);
  assert.equal(V.status(f.ch, f.village, f.state), 'visited');
  f.state.visited.clear(); f.state.campaign.villageVisits = []; f.village.raidable = false;
  assert.equal(V.pillage(f.ch, f.village, f.enemy, f.state, f.db).ok, false);
  assert.equal(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx), null);
});
test('IA : village prioritaire, trajet sur plusieurs tours, action de pillage et immobile respecté', () => {
  const f = raidFixture(); const before = JSON.stringify([f.enemy, f.ch, f.state.campaign]);
  const near = V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx);
  assert.equal(near.action, 'pillage'); assert.deepEqual(near.moveTo, { x: 3, y: 3 });
  assert.equal(JSON.stringify([f.enemy, f.ch, f.state.campaign]), before);
  f.enemy.mov = 1; const far = V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx);
  assert.equal(far.action, 'move'); assert.deepEqual(far.moveTo, { x: 2, y: 3 });
  f.enemy.ai = 'stationary'; assert.equal(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx), null);
  Object.assign(f.enemy, { x: 3, y: 3 }); assert.equal(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx).action, 'pillage');
});
test('IA : terrain infranchissable, portes, village occupé et coût du climat', () => {
  const f = raidFixture(); f.enemy.mov = 2;
  f.ctx.weather = { type: 'snow', intensity: 3, tactical: true };
  assert.deepEqual(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx).moveTo, { x: 2, y: 3 });
  f.ctx.terrainAt = (x, y) => ({ cost: { foot: x === 2 ? 99 : 1 } });
  assert.equal(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx), null);
  f.ctx.terrainAt = () => ({ cost: { foot: 1 } }); delete f.ctx.weather;
  Object.assign(f.unit, { x: 3, y: 3 }); assert.equal(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx), null);
  f.unit.team = 'enemy'; assert.equal(V.planRaid(f.enemy, f.ch, f.state, f.db, f.ctx), null);
});
test('ruines : checkpoint annule le pillage ; sauvegarde de campagne le conserve ; rejeu explicite restaure le village', () => {
  const f = raidFixture(), checkpoint = C.checkpoint(f.ch.id, f.state.campaign, [], {});
  Object.assign(f.enemy, { x: 3, y: 3 }); V.pillage(f.ch, f.village, f.enemy, f.state, f.db);
  const save = C.checkpoint('@lobby', f.state.campaign, [], {}), restored = C.restore(JSON.parse(JSON.stringify(save)), {});
  const next = { ...f.state, ...restored, ruined: new Set() };
  assert.equal(V.ruined(f.ch, f.village, next), true);
  const reset = { ...next, ...C.restore(checkpoint, {}) }; assert.equal(V.ruined(f.ch, f.village, reset), false);
  f.village.repeatOnReplay = true; assert.equal(V.ruined(f.ch, f.village, next), false);
  assert.equal(V.pillage(f.ch, f.village, f.enemy, next, f.db).ok, true); assert.equal(V.ruined(f.ch, f.village, next), true);
  assert.equal(next.campaign.villageRuins.length, 1);
  save.campaign.villageRuins.push(save.campaign.villageRuins[0]); assert.throws(() => C.validate(save), /pillés/);
});
test('apparences : remplacement de plusieurs cases et calques, coordonnées locales du tileset et projet intact', () => {
  const f = raidFixture(), ts = f.db.tilesets[0];
  f.map.tilesets[0].firstgid = 101;
  const patch = { tilesetId: ts.id, tileX: 3, tileY: 4, width: 3, height: 2, offsetX: -1, offsetY: -1 };
  f.village.appearance = { ruined: patch, visited: { ...patch, tileY: 5 } };
  assert.deepEqual(V.validate(f.ch, f.db, f.map), []);
  const before = JSON.stringify(f.map); f.state.ruined.add(f.village.id);
  const visual = V.visualMap(f.map, f.ch, f.state, f.db);
  assert.notEqual(visual, f.map); assert.equal(JSON.stringify(f.map), before);
  const i = 2 * f.map.width + 2;
  assert.equal(visual.layers[0].data[i], 101 + 4 * ts.columns + 3);
  assert.equal(visual.layers[0].data[i + f.map.width + 2], 101 + 5 * ts.columns + 5);
  assert.equal(visual.layers[1].data[i], 0); assert.equal(visual.layers[2].data[i], 0);
  f.state.ruined.clear(); f.state.visited.add(f.village.id);
  assert.equal(V.visualMap(f.map, f.ch, f.state, f.db).layers[0].data[i], 101 + 5 * ts.columns + 3);
  f.state.visited.clear(); assert.equal(V.visualMap(f.map, f.ch, f.state, f.db), f.map);
});
test('ruines sans bloc : le décor intact est supprimé ; le terrain est actualisé sans changer la grille du projet', () => {
  const f = raidFixture(), base = { id: 'wall' }; f.state.ruined.add(f.village.id);
  const index = 3 * f.map.width + 3, original = JSON.stringify(f.map);
  const out = V.visualMap(f.map, f.ch, f.state, f.db);
  assert.equal(out.layers[2].data[index], 0); assert.ok(out.layers[0].data[index]);
  assert.equal(V.terrainAt(f.ch, f.db, 3, 3, f.state, base).id, 'plain');
  assert.equal(V.terrainAt(f.ch, f.db, 2, 3, f.state, base), base);
  assert.equal(JSON.stringify(f.map), original);
});
test('validation des blocs et des réglages de pillage avant écriture ; références de terrain et tileset', () => {
  const f = raidFixture(), patch = { tilesetId: 'ts_village', tileX: 0, tileY: 0, width: 2, height: 2, offsetX: 0, offsetY: -1 };
  f.village.appearance = { ruined: patch }; f.village.ruinedTerrainId = 'plain';
  assert.deepEqual(V.validate(f.ch, f.db, f.map), []);
  for (const change of [{ tileX: -1 }, { tileY: 99 }, { width: 0 }, { width: 17 }, { height: 0 }, { offsetX: -99 }, { offsetY: 99 }, { tileX: 15 }, { tileY: .5 }, { tilesetId: 'missing' }]) {
    const ch = JSON.parse(JSON.stringify(f.ch)); Object.assign(ch.villages[0].appearance.ruined, change); assert.ok(V.validate(ch, f.db, f.map).length, JSON.stringify(change));
  }
  assert.ok(V.references(f.db, 'tilesets', 'ts_village').length); assert.ok(V.references(f.db, 'terrains', 'plain').length);
  f.enemy.pillageVillages = 'oui'; f.ch.enemies.push(f.enemy); assert.ok(V.validate(f.ch, f.db, f.map).length);
  delete f.enemy.pillageVillages;
  f.village.raidable = 'oui'; assert.ok(V.validate(f.ch, f.db, f.map).length); delete f.village.raidable;
  f.village.ruinedTerrainId = 'wall'; assert.ok(V.validate(f.ch, f.db, f.map).length);
});
test('village pillé : objectif secondaire échoué immédiatement et déclencheur distinct de la visite', () => {
  const f = raidFixture(); f.ch.secondaryObjectives = [{ id: 'save', type: 'village', target: f.village.id }];
  f.state.ruinedVillages = f.state.ruined;
  Object.assign(f.enemy, { x: 3, y: 3 }); V.pillage(f.ch, f.village, f.enemy, f.state, f.db);
  const result = Side.advance(f.ch, f.state); assert.equal(result.save.status, 'failed');
  const event = { id: 'burnt', trigger: { type: 'villagePillaged', target: f.village.id }, actions: [] };
  f.ch.events = [event]; assert.deepEqual(Scenario.validate(f.ch, f.db, f.map), []);
  assert.equal(Scenario.matches(event, 'villagePillaged', { target: f.village.id }), true);
  assert.equal(Scenario.matches(event, 'village', { target: f.village.id }), false);
  assert.equal(Scenario.matches(event, 'villagePillaged', { target: 'other' }), false);
});
