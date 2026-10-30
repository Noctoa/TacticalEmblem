'use strict';
/* Pack « Classes de la série » : données officielles relevées, installation, promotions, validation du projet. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const FEClasses = require('../src/shared/fe-classes');
const Promotions = require('../src/shared/promotions');
const R = require('../src/shared/rules');
const D = require('../src/shared/defaults');
const STATS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
const W = R.WEAPON_TYPES.map(t => t.id), MV = R.MOVE_TYPES.map(t => t.id);
const find = (g, s) => FEClasses.GAMES.find(x => x.id === g).classes.find(c => c.source === s);

test('neuf jeux, près de 500 classes, toutes complètes et dans les types du moteur', () => {
  assert.deepEqual(FEClasses.GAMES.map(g => g.id), ['fe6', 'fe7', 'fe8', 'fe9', 'fe10', 'fe13', 'fe14', 'fe16', 'fe17']);
  assert.ok(FEClasses.total() > 450, 'total : ' + FEClasses.total());
  const ids = new Set();
  for (const g of FEClasses.GAMES) for (const c of g.classes) {
    assert.ok(!ids.has(c.id), 'id unique : ' + c.id); ids.add(c.id);
    assert.ok(MV.includes(c.moveType) && c.mov > 0, c.id);
    assert.ok(c.weapons.every(w => W.includes(w)) && (c.weapons.length || c.dance), c.id + ' armes');
    for (const k of STATS) for (const part of ['base', 'growths', 'caps']) assert.ok(Number.isInteger(c[part][k]) && c[part][k] >= 0, `${c.id} ${part}.${k}`);
    assert.ok(c.base.hp > 0 && c.caps.hp >= c.base.hp, c.id + ' PV');
  }
});

test('valeurs officielles relevées (échantillon)', () => {
  // FE7 : Paladin (M) 23 PV / 7 For / 4 Tec / 7 Vit / 8 Déf / 3 Rés, déplacement 8 ; croissances 70/25/30/18/25/12/20
  const pal = find('fe7', 'Paladin (M)');
  assert.deepEqual([pal.base.hp, pal.base.str, pal.base.skl, pal.base.spd, pal.base.def, pal.base.res, pal.mov], [23, 7, 4, 7, 8, 3, 8]);
  assert.deepEqual([pal.growths.hp, pal.growths.str, pal.growths.skl, pal.growths.spd, pal.growths.lck, pal.growths.def, pal.growths.res], [70, 25, 30, 18, 25, 12, 20]);
  // GBA : « Pow » d'un mage va en Magie
  const mage = find('fe7', 'Mage (M)');
  assert.equal(mage.base.str, 0); assert.equal(mage.base.mag, 1); assert.equal(mage.growths.mag, 55);
  // Awakening : Great Knight 26 PV, 11 For, 14 Déf, plafonds 80 / 48
  const gk = find('fe13', 'Great Knight');
  assert.deepEqual([gk.base.hp, gk.base.str, gk.base.def, gk.caps.hp, gk.caps.str], [26, 11, 14, 80, 48]);
  // Engage : Dex → Technique
  assert.equal(find('fe17', 'Sniper').base.skl, 11);
  // Three Houses : croissance = modificateur + référence (Épéiste : Vit +20 → 50)
  assert.equal(find('fe16', 'Swordmaster').growths.spd, 50);
});

test('installation : classes ajoutées une fois, promotions reliées et valides, arme de départ de la base', () => {
  const db = D.sampleProject('Jeu').db;
  const before = db.classes.length;
  const n = FEClasses.install(db, FEClasses.GAMES.map(g => g.id));
  assert.equal(n, FEClasses.total());
  assert.equal(db.classes.length, before + n);
  assert.equal(FEClasses.install(db, ['fe7']), 0, 'pas de doublon');
  assert.deepEqual(Promotions.validate(db), [], 'promotions valides');
  const cav = db.classes.find(c => c.id === 'fe8_cavalier_f');
  assert.deepEqual(cav.promotions.map(p => p.classId), ['fe8_paladin_f', 'fe8_great_knight_f']);
  assert.equal(cav.promotions[0].bonuses.hp, 5, 'bonus = écart des stats de base (23 − 18)');
  assert.deepEqual(cav.defaultInventory, ['w_iron_sword']);
  assert.equal(db.classes.find(c => c.id === 'fe7_mage_m').defaultInventory[0], 'w_fire');
  assert.ok(db.classes.find(c => c.id === 'fe7_dancer').dance);
  const s = FEClasses.summary(db);
  assert.ok(s.every(g => g.already === g.total));
  // une unité générique de ces classes se crée normalement
  const u = R.makeEnemyFromPlacement({ id: 'x', classId: 'fe13_great_knight', level: 5, x: 0, y: 0 }, db, 'enemy');
  assert.ok(u && u.hp > 26);
});
