'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const W = require('../src/shared/weather'), R = require('../src/shared/rules'), K = require('../src/shared/skills');
const weather = (type, intensity = 2) => ({ type, intensity, tactical: true });
function fixture() {
  const db = { classes: [{ id: 'hybrid', weapons: ['sword', 'bow', 'anima'] }], skills: K.presets(), weapons: [
    { id: 'bow', type: 'bow', name: 'Arc', might: 5, hit: 60, crit: 0, weight: 0, minRange: 1, maxRange: 2, uses: 20 },
    { id: 'sword', type: 'sword', name: 'Épée', might: 5, hit: 60, crit: 0, weight: 0, minRange: 1, maxRange: 1, uses: 20 },
    { id: 'magic', type: 'anima', name: 'Feu', might: 5, hit: 60, crit: 0, weight: 0, minRange: 1, maxRange: 2, uses: 20 }
  ], items: [] };
  const make = (uid, team, x, y = 1) => ({ uid, sourceId: uid, name: uid, team, classId: 'hybrid', x, y,
    hp: 30, stats: { hp: 30, str: 4, mag: 4, skl: 0, lck: 0, spd: 0, def: 2, res: 2 },
    mov: 4, moveType: 'foot', ai: 'aggressive', personalSkill: '', learnedSkills: [], equippedSkills: [], inventory: [{ id: 'bow', uses: 20 }] });
  const a = make('a', 'player', 0), b = make('b', 'enemy', 2), units = [a, b];
  const ctx = { width: 12, height: 8, terrainAt: () => null, unitAt: (x, y) => units.find(u => !u.dead && u.x === x && u.y === y) };
  const opts = { db, units, ctx, terrainOf: () => null, settings: { trueHit: false, overkill: false }, rng: () => .5 };
  return { db, make, a, b, units, ctx, opts };
}

test('climat : les anciennes ambiances restent visuelles, activation explicite et validation', () => {
  assert.deepEqual(W.effects({ type: 'fog' }), { vision: null, avoid: 0, movement: 0 });
  assert.deepEqual(W.effects({ type: 'snow', intensity: 3, tactical: false }), W.effects());
  assert.deepEqual(W.validate(weather('snow')), []);
  assert.ok(W.validate({ ...weather('snow'), tactical: 'true' }).length);
  assert.equal(W.effects({ ...weather('none') }).vision, null);
});

test('brouillard : esquive accrue pour les deux camps, dégâts et critiques inchangés', () => {
  const f = fixture(), clear = R.forecast(f.a, 0, f.b, f.opts);
  for (const intensity of [1, 2, 3]) {
    const fc = R.forecast(f.a, 0, f.b, { ...f.opts, weather: weather('fog', intensity) });
    assert.equal(fc.att.hit, clear.att.hit - intensity * 5); assert.equal(fc.def.hit, clear.def.hit - intensity * 5);
    assert.equal(fc.att.dmg, clear.att.dmg); assert.equal(fc.att.crit, clear.att.crit);
    assert.equal(fc.att.weatherAvoid, intensity * 5);
  }
});

test('brouillard : esquive contre magie et variantes de compétence, même au corps à corps', () => {
  const f = fixture(); f.a.inventory[0].id = 'magic'; f.a.equippedSkills = ['skill_luna']; f.a.learnedSkills = ['skill_luna'];
  const luna = f.db.skills.find(s => s.id === 'skill_luna'); luna.activation = 'fixed'; luna.chance = 100;
  const fc = R.forecast(f.a, 0, f.b, { ...f.opts, weather: weather('fog', 3) });
  assert.equal(fc.att.hit, 45);
  const combat = R.resolveCombat(f.a, 0, f.b, { ...f.opts, weather: weather('fog', 3) });
  assert.equal(combat.strikes[0].hit, false);
  f.b.x = 1; assert.equal(R.forecast(f.a, 0, f.b, { ...f.opts, weather: weather('fog', 3) }).att.hit, 45);
});

test('brouillard : l’esquive précède le plafonnement à 0–100 et la résolution utilise la prévision', () => {
  const f = fixture(); f.opts.weather = weather('fog', 3);
  assert.equal(R.resolveCombat(f.a, 0, f.b, f.opts).strikes[0].hit, false); // 50 > 45
  f.db.weapons[0].hit = 200; assert.equal(R.forecast(f.a, 0, f.b, f.opts).att.hit, 100);
  f.db.weapons[0].hit = 5; assert.equal(R.forecast(f.a, 0, f.b, f.opts).att.hit, 0);
});

test('sable : vision et déplacement réduits, aucune pénalité de précision ou bonus d’esquive', () => {
  const f = fixture(), clear = R.forecast(f.a, 0, f.b, f.opts);
  for (const intensity of [1, 2, 3]) {
    const w = weather('sand', intensity), fc = R.forecast(f.a, 0, f.b, { ...f.opts, weather: w });
    assert.equal(fc.att.hit, clear.att.hit); assert.equal(fc.def.hit, clear.def.hit); assert.equal(fc.att.weatherAvoid, 0);
    assert.equal(W.effects(w).vision, [6, 4, 3][intensity - 1]);
    assert.ok(R.moveCost(null, 'horse', w) > 1);
  }
});

test('neige : pénalités progressives, cavalerie plus ralentie, volants et murs respectés', () => {
  for (const [intensity, foot, horse] of [[1, 1, 2], [2, 2, 2], [3, 2, 3]]) {
    const w = weather('snow', intensity);
    assert.equal(R.moveCost(null, 'foot', w), foot); assert.equal(R.moveCost(null, 'horse', w), horse);
    assert.equal(R.moveCost(null, 'flier', w), 1);
    assert.equal(R.moveCost({ cost: { foot: 99 } }, 'foot', w), 99);
    assert.equal(R.moveCost({ cost: { horse: 98 } }, 'horse', w), 98);
    assert.equal(W.effects(w).vision, null); assert.equal(W.effects(w).avoid, 0);
  }
});

test('neige : ajoute au coût du terrain, préserve les obstacles et réduit la portée de menace', () => {
  const f = fixture(); f.a.mov = 3; f.a.inventory[0].id = 'sword'; f.b.x = 10;
  assert.ok(R.threatTiles(f.a, f.ctx, f.db).has('4,1'));
  const ctx = { ...f.ctx, weather: weather('snow') };
  assert.equal(R.reachable(f.a, ctx).has('2,1'), false);
  assert.equal(R.threatTiles(f.a, ctx, f.db).has('4,1'), false);
  assert.equal(R.moveCost({ cost: { foot: 3 } }, 'foot', ctx.weather), 4);
  f.a.moveType = 'flier'; assert.ok(R.reachable(f.a, ctx).has('3,1'));
});

test('neige : l’IA utilise le même budget de déplacement que le joueur', () => {
  const f = fixture(); f.a.team = 'enemy'; f.b.team = 'player'; f.b.x = 4; f.a.mov = 3; f.a.inventory[0].id = 'sword';
  assert.equal(R.planEnemy(f.a, [f.b], f.opts).action, 'attack');
  const snowy = R.planEnemy(f.a, [f.b], { ...f.opts, ctx: { ...f.ctx, weather: weather('snow') } });
  assert.equal(snowy.action, 'move'); assert.equal(snowy.moveTo.x, 1);
});

test('brouillard : rayon par intensité, distance en cases et vision partagée joueur/alliés', () => {
  const f = fixture(); f.a.x = 3; f.a.y = 3;
  for (const [i, radius] of [[1, 6], [2, 4], [3, 3]]) {
    const v = W.visibleTiles(weather('fog', i), [f.a], 'player', 20, 20);
    assert.ok(v.has((3 + radius) + ',3')); assert.equal(v.has((4 + radius) + ',3'), false);
    assert.equal(v.has((3 + radius) + ',4'), false); assert.equal(v.has('-1,3'), false);
  }
  const ally = f.make('ally', 'ally', 15, 3);
  assert.ok(W.visibleTiles(weather('fog', 3), [f.a, ally], 'player', 20, 20).has('18,3'));
  ally.dead = true; assert.equal(W.visibleTiles(weather('fog', 3), [f.a, ally], 'player', 20, 20).has('18,3'), false);
});

test('brouillard : aucun éclaireur ennemi ne révèle la carte au joueur ; unités à 0 PV exclues', () => {
  const f = fixture(); f.b.x = 10;
  assert.equal(W.canSee(W.visibleTiles(weather('fog', 3), f.units, 'player', 12, 8), f.b), false);
  f.a.hp = 0; assert.equal(W.visibleTiles(weather('fog', 3), f.units, 'player', 12, 8).size, 0);
  assert.equal(W.visibleTiles({ type: 'fog' }, f.units, 'player', 12, 8), null);
});

test('brouillard : les cases d’un adversaire caché ne trahissent pas sa position', () => {
  const f = fixture(); f.a.y = f.b.y = 0; f.b.x = 5; f.a.mov = 8;
  Object.assign(f.ctx, { height: 1, weather: weather('fog', 3) });
  const perceived = R.perceivedContext(f.a, f.ctx, f.units);
  assert.equal(perceived.unitAt(5, 0), null); assert.equal(R.reachable(f.a, f.ctx).has('5,0'), false);
  assert.equal(R.reachable(f.a, perceived).has('7,0'), true);
  f.b.x = 2; assert.equal(R.perceivedContext(f.a, f.ctx, f.units).unitAt(2, 0), f.b);
});

test('brouillard : l’IA ne cible pas les ennemis non repérés, mais partage les découvertes', () => {
  const f = fixture(); f.a.team = 'enemy'; f.b.team = 'player'; f.b.x = 9; f.opts.weather = weather('fog', 3);
  assert.equal(R.planEnemy(f.a, [f.b], f.opts), null);
  const scout = f.make('scout', 'enemy', 8); f.units.push(scout);
  assert.ok(R.planEnemy(f.a, [f.b], f.opts));
  scout.dead = true; assert.equal(R.planEnemy(f.a, [f.b], f.opts), null);
});

test('climat : direction visuelle indépendante des règles, aucun tirage aléatoire en prévision', () => {
  const f = fixture(), original = Math.random;
  Math.random = () => { throw new Error('Tirage inattendu'); };
  try {
    const left = R.forecast(f.a, 0, f.b, { ...f.opts, weather: { ...weather('sand'), direction: 'left' } });
    const right = R.forecast(f.a, 0, f.b, { ...f.opts, weather: { ...weather('sand'), direction: 'right' } });
    assert.deepEqual(left, right);
  } finally { Math.random = original; }
});
