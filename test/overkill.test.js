'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/shared/rules');
const D = require('../src/shared/defaults');

// attaquant très fort et rapide (double) contre un brigand fragile : le 1er coup tue, le 2e est de l'overkill
function duel(settings, tweak) {
  const db = D.sampleProject('Overkill').db;
  const a = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_hector'), db, { x: 0, y: 0 });
  Object.assign(a.stats, { str: 30, skl: 30, spd: 30, lck: 30 }); a.hp = a.stats.hp;
  const b = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 1, y: 0 }, db);
  Object.assign(b.stats, { def: 0, spd: 0, hp: 20 }); b.hp = 20;
  if (tweak) tweak(a, b, db);
  const rng = () => 0.5; // toujours touché, jamais de critique (crit ≈ quelques %)
  const res = R.resolveCombat(a, 0, b, { db, settings: Object.assign({ trueHit: false }, settings), terrainOf: () => null, rng });
  return { a, b, res, db };
}

test('le coup fatal note les dégâts en trop, l’attaquant finit ses coups en overkill', () => {
  const { a, b, res } = duel({});
  const [kill, extra] = res.strikes;
  assert.equal(res.strikes.length, 2);
  assert.equal(b.hp, 0);
  assert.equal(kill.dmg, 20);                         // les PV réellement retirés
  assert.ok(kill.overkill > 0);                       // dégâts au-delà des PV
  assert.ok(extra.overkillStrike && extra.hit && extra.dmg === 0 && extra.hpAfter === 0);
  assert.equal(extra.overkill, kill.dmg + kill.overkill); // même dégâts que le premier coup
  assert.equal(res.overkill.total, kill.overkill + extra.overkill);
  assert.equal(res.overkill.by, a.uid);
  assert.equal(res.overkill.max, 20);
  assert.ok(res.overkill.doubled);                    // ~ 2 × 50 dégâts ≥ 20 PV max
  assert.equal(res.overkill.bonus, R.DEFAULT_SETTINGS.overkillExp);
});

test('pas de bonus si l’overkill n’atteint pas une 2e fois les PV max', () => {
  const { b, res } = duel({}, (a, b) => { a.stats.str = 1; b.stats.hp = 60; b.hp = 12; });
  assert.equal(b.hp, 0);
  assert.ok(res.overkill && !res.overkill.doubled && res.overkill.bonus === 0);
  assert.ok(res.overkill.total < 60);
});

test('overkill désactivé : le combat s’arrête au coup fatal comme avant', () => {
  const { res } = duel({ overkill: false });
  assert.equal(res.strikes.length, 1);
  assert.equal(res.overkill, null);
});

test('l’usure : seul le coup fatal use l’arme, pas les coups d’overkill', () => {
  const { a, db } = duel({}, () => {});
  const fresh = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_hector'), db, { x: 0, y: 0 });
  assert.equal(fresh.inventory[0].uses - a.inventory[0].uses, 1);
});

test('EXP : le bonus d’overkill s’ajoute, plafonné à 100', () => {
  const db = D.sampleProject('Overkill').db;
  const u = R.makeUnitFromCharacter(db.units[0], db, { x: 0, y: 0 });
  const foe = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 1, y: 0 }, db);
  const base = R.combatExp(u, foe, true, true, db);
  assert.equal(R.combatExp(u, foe, true, true, db, 30), Math.min(100, base + 30));
  foe.isBoss = true; foe.level = 20;
  assert.equal(R.combatExp(u, foe, true, true, db, 30), 100);
});

test('riposte fatale : l’overkill revient au défenseur, l’attaquant ne frappe plus', () => {
  const db = D.sampleProject('Overkill').db;
  const weak = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_lyn'), db, { x: 0, y: 0 });
  Object.assign(weak.stats, { hp: 5, def: 0, spd: 0, str: 0 }); weak.hp = 5;
  const brute = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 10, x: 1, y: 0 }, db);
  Object.assign(brute.stats, { str: 30, skl: 30, spd: 30, def: 30 });
  const res = R.resolveCombat(weak, 0, brute, { db, settings: { trueHit: false }, terrainOf: () => null, rng: () => 0.5 });
  assert.equal(weak.hp, 0);
  assert.ok(res.strikes.filter(s => s.overkillStrike).every(s => s.by === brute.uid));
  assert.equal(res.overkill.by, brute.uid);
});
