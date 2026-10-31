'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const R = require('../src/shared/rules'), D = require('../src/shared/defaults'), M = require('../src/shared/movement');
const C = require('../src/shared/campaign'), P = require('../src/shared/promotions'), V = require('../src/shared/villages'), Deploy = require('../src/shared/deployment');
function fixture() {
  const p = D.sampleProject('Rivière'), db = p.db;
  db.classes.push({ ...db.classes.find(c => c.id === 'brigand'), id: 'fe7_pirate', name: 'Pirate', promotions: [] });
  const enemy = R.makeEnemyFromPlacement({ id: 'enemy', classId: 'brigand', x: 1, y: 1, ai: 'aggressive' }, db);
  const hero = R.makeUnitFromCharacter({ ...db.units.find(u => u.id === 'c_eliwood'), classId: 'fe7_pirate' }, db, { x: 1, y: 1 });
  const water = db.terrains.find(t => t.id === 'water'), plain = db.terrains.find(t => t.id === 'plain');
  const units = [enemy], ctx = { width: 7, height: 3, terrainAt: (x, y) => x === 2 ? water : plain,
    unitAt: (x, y) => units.find(u => u.x === x && u.y === y && !u.dead && u.hp > 0) };
  return { db, enemy, hero, water, plain, units, ctx };
}
test('brigands et pirates : aptitude par défaut, classes importées et réglage explicite de classe', () => {
  for (const id of ['brigand', 'pirate', 'bandit', 'fe6_brigand', 'fe7_pirate', 'fe16_brigand']) assert.equal(M.classCrossesWater({ id }), true);
  assert.equal(M.classCrossesWater({ id: 'fighter' }), false);
  assert.equal(M.classCrossesWater({ id: 'brigand', crossWater: false }), false);
  assert.equal(M.classCrossesWater({ id: 'custom', crossWater: true }), true);
  const f = fixture(); assert.equal(f.enemy.crossWater, true); assert.equal(f.hero.crossWater, true);
});
test('eau à deux points, sol inchangé et limites conservées pour les autres unités', () => {
  const f = fixture();
  assert.equal(R.moveCost(f.water, 'foot', undefined, f.enemy), 2);
  assert.equal(R.moveCost(f.plain, 'foot', undefined, f.enemy), 1);
  assert.equal(R.moveCost(f.water, 'foot'), 99); assert.equal(R.moveCost(f.water, 'horse'), 99);
  assert.equal(R.moveCost(f.water, 'flier', undefined, { ...f.enemy, moveType: 'flier' }), 1);
  assert.equal(R.moveCost(f.db.terrains.find(t => t.id === 'wall'), 'foot', undefined, f.enemy), 99);
  assert.equal(R.moveCost(f.db.terrains.find(t => t.id === 'peak'), 'foot', undefined, f.enemy), 99);
  assert.equal(R.moveCost({ ...f.water, cost: { foot: 3 } }, 'foot', undefined, f.enemy), 3);
  assert.equal(R.moveCost(f.water, 'foot', undefined, { ...f.enemy, crossWater: false }), 99);
});
test('trajets joueur/ennemi : traversée, coût exact et arrêt sur l’eau', () => {
  const f = fixture();
  for (const unit of [f.hero, f.enemy]) {
    f.units.splice(0, f.units.length, unit); const reach = R.reachable(unit, f.ctx);
    assert.equal(reach.get('2,1').cost, 2); assert.equal(reach.get('3,1').cost, 3);
    assert.deepEqual(R.pathTo(reach, 3, 1), [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    unit.mov = 1; assert.equal(R.reachable(unit, f.ctx).has('2,1'), false); unit.mov = 5;
  }
  assert.equal(R.reachable({ ...f.hero, classId: 'lord', crossWater: false }, f.ctx).has('3,1'), false);
});
test('climat, portes et ennemis bloquants s’appliquent aussi aux traversées', () => {
  const f = fixture(); f.ctx.weather = { type: 'snow', intensity: 2, tactical: true };
  assert.equal(R.reachable(f.enemy, f.ctx).get('2,1').cost, 3);
  assert.equal(R.reachable(f.enemy, f.ctx).get('3,1').cost, 5);
  f.ctx.terrainAt = (x, y) => x === 2 ? { id: '@closed-door', cost: { foot: 99 } } : f.plain;
  assert.equal(R.reachable(f.enemy, f.ctx).has('3,1'), false);
  f.ctx.terrainAt = (x, y) => x === 2 ? f.water : f.plain;
  f.units.push(...[0, 1, 2].map(y => ({ team: 'player', hp: 20, x: 2, y })));
  assert.equal(R.reachable(f.enemy, f.ctx).has('3,1'), false);
});
test('IA, zone de danger et pillage utilisent la même traversée', () => {
  const f = fixture(); const foe = R.makeUnitFromCharacter(f.db.units.find(u => u.id === 'c_eliwood'), f.db, { x: 4, y: 1 }); f.units.push(foe);
  const opts = { db: f.db, units: f.units, ctx: f.ctx, terrainOf: u => f.ctx.terrainAt(u.x, u.y), settings: R.DEFAULT_SETTINGS };
  const plan = R.planEnemy(f.enemy, [foe], opts);
  assert.equal(plan.action, 'attack'); assert.ok(plan.path.some(p => p.x === 2));
  assert.equal(R.threatTiles(f.enemy, f.ctx, f.db).has('4,1'), true);
  const ch = { id: 'c', villages: [{ id: 'v', x: 4, y: 0 }] }, state = { campaign: C.create(), visited: new Set(), ruined: new Set(), units: f.units };
  const raid = V.planRaid(f.enemy, ch, state, f.db, f.ctx); assert.equal(raid.action, 'pillage'); assert.ok(raid.path.some(p => p.x === 2));
});
test('préparatifs : pirate autorisé sur une case d’eau, infanterie ordinaire refusée', () => {
  const f = fixture(), ch = { players: [{ unitId: f.hero.sourceId, x: 2, y: 1 }] };
  assert.equal(Deploy.canPlace(ch, f.hero, { x: 2, y: 1 }, f.ctx.terrainAt), true);
  assert.equal(Deploy.canPlace(ch, { ...f.hero, crossWater: false }, { x: 2, y: 1 }, f.ctx.terrainAt), false);
});
test('ancienne campagne et promotion : aptitude recalculée depuis la classe actuelle', () => {
  const f = fixture(), campaign = C.create('casual');
  campaign.units[f.hero.sourceId] = { classId: 'fe7_pirate', stats: f.hero.stats, inventory: f.hero.inventory };
  const restored = C.apply(campaign, R.makeUnitFromCharacter(f.db.units.find(u => u.id === 'c_eliwood'), f.db, { x: 0, y: 0 }), f.db);
  assert.equal(restored.crossWater, true);
  f.db.classes.find(c => c.id === 'fe7_pirate').crossWater = false;
  assert.equal(C.apply(campaign, restored, f.db).crossWater, false);
  const source = f.db.classes.find(c => c.id === 'brigand'), target = f.db.classes.find(c => c.id === 'warrior');
  source.promotions = [{ ...P.create(source, target), minLevel: 1 }];
  assert.equal(P.apply(f.enemy, 'warrior', f.db).ok, true); assert.equal(f.enemy.crossWater, false);
  f.db.classes.find(c => c.id === 'warrior').crossWater = 'oui'; assert.ok(P.validate(f.db).some(e => e.includes('traversée')));
});
