'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/shared/rules');
const S = require('../src/shared/statuses');
const C = require('../src/shared/campaign');

function fixture() {
  const db = { units: [], skills: [], classes: [
    { id: 'hybrid', weapons: ['sword', 'anima', 'staff'] }, { id: 'fighter', weapons: ['sword'] }
  ], weapons: [
    { id: 'sword', type: 'sword', might: 5, hit: 100, crit: 0, weight: 0, uses: 20, minRange: 1, maxRange: 1 },
    { id: 'heal', type: 'staff', heal: 10, uses: 10, minRange: 1, maxRange: 1 },
    { id: 'restore', type: 'staff', restore: 'all', uses: 10, minRange: 1, maxRange: 1 },
    { id: 'magic', type: 'anima', might: 5, uses: 20, minRange: 1, maxRange: 2 }
  ], items: [
    { id: 'potion', effect: 'heal', amount: 10, uses: 3 },
    { id: 'antidote', effect: 'restore', cure: 'poison', uses: 3 },
    { id: 'remedy', effect: 'restore', cure: 'all', uses: 1 },
    { id: 'boost', effect: 'boost', amount: 2, stat: 'str', uses: 1 }
  ] };
  const make = (uid, team, x, y = 2) => ({ uid, sourceId: uid, name: uid, classId: 'hybrid', team, x, y,
    level: 1, exp: 0, mov: 3, moveType: 'foot', ai: 'support', hp: 30,
    stats: { hp: 30, str: 6, mag: 4, skl: 20, spd: 5, lck: 0, def: 4, res: 2 },
    inventory: [], personalSkill: '', learnedSkills: [], equippedSkills: [], done: false });
  const healer = make('healer', 'enemy', 1), friend = make('friend', 'enemy', 5);
  healer.inventory = [{ id: 'heal', uses: 10 }, { id: 'restore', uses: 10 }];
  const units = [healer, friend];
  const ctx = { width: 10, height: 7, terrainAt: () => null,
    unitAt: (x, y) => units.find(u => !u.dead && u.hp > 0 && u.x === x && u.y === y) };
  const opts = { db, ctx, units, settings: { trueHit: false }, terrainOf: u => ctx.terrainAt(u.x, u.y) };
  const plan = () => R.planEnemy(healer, units.filter(u => !R.sameSide(healer, u)), opts);
  return { db, make, healer, friend, units, ctx, opts, plan };
}

test('IA : rejoint un blessé, choisit Soin, et planifie sans altérer les unités', () => {
  const f = fixture(); f.friend.hp = 7;
  const before = JSON.stringify(f.units), p = f.plan();
  assert.equal(p.action, 'staff'); assert.equal(p.target, f.friend); assert.equal(p.weaponIndex, 0);
  assert.equal(R.dist(p.moveTo, f.friend), 1); assert.equal(p.path.length, 4);
  assert.equal(JSON.stringify(f.units), before);
});

test('IA : Rétablissement réveille une cible à tous ses PV avant de traiter le poison', () => {
  const f = fixture(); f.friend.x = 2; S.apply(f.friend, 'sleep', 3);
  const poisoned = f.make('poisoned', 'enemy', 1, 3); S.apply(poisoned, 'poison', 2); f.units.push(poisoned);
  const p = f.plan(); assert.equal(p.action, 'staff'); assert.equal(p.weaponIndex, 1); assert.equal(p.target, f.friend);
});

test('IA : soigne le silence d’un utilisateur de bâton, sans gaspiller sur un combattant physique', () => {
  const f = fixture(); f.friend.x = 2; f.friend.inventory = [{ id: 'heal', uses: 10 }]; S.apply(f.friend, 'silence', 3);
  assert.equal(f.plan().weaponIndex, 1);
  f.friend.classId = 'fighter'; f.friend.inventory = [{ id: 'sword', uses: 10 }];
  assert.notEqual(f.plan()?.action, 'staff');
});

test('IA : les alliés verts soignent le joueur, jamais leurs adversaires ni eux-mêmes au bâton', () => {
  const f = fixture(); f.healer.team = 'ally'; f.friend.team = 'player'; f.friend.hp = 4; f.friend.x = 2;
  assert.equal(f.plan().target, f.friend);
  f.friend.team = 'enemy'; f.healer.hp = 1;
  assert.notEqual(f.plan()?.action, 'staff');
  f.friend.team = 'player'; f.friend.dead = true;
  assert.notEqual(f.plan()?.action, 'staff');
});

test('IA : respecte Sommeil, Silence, la classe et l’immobilité pour les bâtons', () => {
  const f = fixture(); f.friend.hp = 1;
  S.apply(f.healer, 'sleep', 2); assert.equal(f.plan(), null); S.cure(f.healer, 'all');
  S.apply(f.healer, 'silence', 2); assert.notEqual(f.plan()?.action, 'staff'); S.cure(f.healer, 'all');
  f.healer.classId = 'fighter'; assert.notEqual(f.plan()?.action, 'staff'); f.healer.classId = 'hybrid';
  f.healer.ai = 'stationary'; assert.equal(f.plan(), null);
  f.friend.x = 2; assert.equal(f.plan().action, 'staff'); assert.deepEqual(f.plan().moveTo, { x: 1, y: 2 });
});

test('IA : les anciens comportements peuvent aussi soigner à portée', () => {
  for (const ai of ['aggressive', 'range', 'stationary']) {
    const f = fixture(); f.healer.ai = ai; f.friend.x = 2; f.friend.hp = 8;
    assert.equal(f.plan().action, 'staff');
  }
});

test('IA : respecte la portée minimale/maximale du bâton et les cases occupées', () => {
  const f = fixture(); f.healer.ai = 'stationary'; f.friend.hp = 1;
  Object.assign(f.db.weapons[1], { minRange: 2, maxRange: 3 });
  f.friend.x = 2; assert.equal(f.plan(), null);
  f.friend.x = 3; assert.equal(f.plan().action, 'staff');
  f.friend.x = 5; assert.equal(f.plan(), null);
  f.healer.ai = 'support'; const p = f.plan();
  assert.notEqual(f.ctx.unitAt(p.moveTo.x, p.moveTo.y), f.friend);
  assert.ok(R.dist(p.moveTo, f.friend) >= 2 && R.dist(p.moveTo, f.friend) <= 3);
});

test('IA Soutien : accompagne un blessé lointain mais ne traverse pas un mur', () => {
  const f = fixture(); f.friend.x = 8; f.friend.hp = 1;
  const p = f.plan(); assert.equal(p.action, 'move'); assert.equal(p.target, null);
  assert.ok(R.dist(p.moveTo, f.friend) < R.dist(f.healer, f.friend));
  f.ctx.terrainAt = x => x === 4 ? { cost: { foot: 99 } } : null;
  assert.equal(f.plan(), null);
});

test('IA Soutien : accompagne aussi un groupe en bonne santé et n’utilise pas un bâton inutilement', () => {
  const f = fixture(); assert.equal(f.plan().action, 'move');
  f.friend.x = 2; assert.equal(f.plan(), null);
});

test('IA : potion sous la moitié des PV, antidote utile, aucun boost automatique', () => {
  const f = fixture(); f.healer.inventory = [{ id: 'potion', uses: 2 }, { id: 'antidote', uses: 1 }, { id: 'boost', uses: 1 }];
  f.healer.ai = 'range'; f.healer.hp = 10;
  let p = f.plan(); assert.equal(p.action, 'item'); assert.equal(p.itemIndex, 0);
  f.healer.hp = 30; assert.equal(f.plan(), null);
  S.apply(f.healer, 'poison', 3); p = f.plan(); assert.equal(p.itemIndex, 1);
  f.healer.inventory[1].uses = 0; assert.equal(f.plan(), null);
});

test('IA : un soigneur réduit au silence peut utiliser un remède sur lui-même', () => {
  const f = fixture(); f.healer.inventory.push({ id: 'remedy', uses: 1 }); S.apply(f.healer, 'silence', 2);
  const p = f.plan(); assert.equal(p.action, 'item'); assert.equal(p.itemIndex, 2);
  S.apply(f.healer, 'sleep', 2); assert.equal(f.plan(), null);
});

test('difficulté : Facile vise le proche, Normal et Tactique privilégient une cible vulnérable', () => {
  const f = fixture(); f.healer.ai = 'aggressive'; f.healer.inventory = [{ id: 'sword', uses: 20 }];
  f.friend.team = 'player'; f.friend.x = 2; f.friend.stats.def = 40;
  const fragile = f.make('fragile', 'player', 4, 3); fragile.hp = 1; f.units.push(fragile);
  f.opts.settings.aiDifficulty = 'easy'; assert.equal(f.plan().target, f.friend);
  for (const d of ['normal', 'hard', 'invalid', undefined]) {
    f.opts.settings.aiDifficulty = d; assert.equal(f.plan().target, fragile);
  }
});

test('difficulté : Tactique évite davantage les autres menaces lors du choix de position', () => {
  const f = fixture(); Object.assign(f.healer, { ai: 'aggressive', x: 3, y: 4 });
  f.healer.inventory = [{ id: 'sword', uses: 20 }]; Object.assign(f.friend, { team: 'player', x: 5, y: 3 });
  const guard = f.make('guard', 'player', 4, 2); guard.ai = 'stationary'; guard.stats.def = 50;
  guard.inventory = [{ id: 'sword', uses: 20 }]; f.units.push(guard);
  f.ctx.terrainAt = (x, y) => x === 4 && y === 3 ? { avoid: 40 } : null;
  f.opts.settings.aiDifficulty = 'normal'; assert.deepEqual(f.plan().moveTo, { x: 4, y: 3 });
  f.opts.settings.aiDifficulty = 'hard'; const p = f.plan();
  assert.equal(p.target, f.friend); assert.notDeepEqual(p.moveTo, { x: 4, y: 3 });
});

test('difficulté : le choix ne modifie ni statistiques ni IA des alliés verts', () => {
  const f = fixture(); f.healer.team = 'ally'; f.friend.team = 'player'; f.friend.hp = 1;
  const stats = JSON.stringify(f.units.map(u => u.stats));
  f.opts.settings.aiDifficulty = 'easy'; const easy = f.plan();
  f.opts.settings.aiDifficulty = 'hard'; const hard = f.plan();
  assert.deepEqual(hard, easy); assert.equal(JSON.stringify(f.units.map(u => u.stats)), stats);
});

test('sauvegarde : difficulté optionnelle et validée, anciennes sauvegardes compatibles', () => {
  const save = C.checkpoint('ch1', C.create('classic'), [], {});
  assert.doesNotThrow(() => C.validate(save));
  for (const d of R.AI_DIFFICULTIES) { save.aiDifficulty = d.value; assert.doesNotThrow(() => C.validate(save)); }
  save.aiDifficulty = 'impossible'; assert.throws(() => C.validate(save), /Difficulté/);
});
