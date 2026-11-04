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

test('neuf jeux + monstres de FE8, plus de 500 classes, toutes complètes et dans les types du moteur', () => {
  assert.deepEqual(FEClasses.GAMES.map(g => g.id), ['fe6', 'fe7', 'fe8', 'fe9', 'fe10', 'fe13', 'fe14', 'fe16', 'fe17', 'fe8m']);
  assert.ok(FEClasses.total() > 450, 'total : ' + FEClasses.total());
  const ids = new Set();
  for (const g of FEClasses.GAMES) for (const c of g.classes) {
    assert.ok(!ids.has(c.id), 'id unique : ' + c.id); ids.add(c.id);
    assert.ok(MV.includes(c.moveType) && c.mov > 0, c.id);
    assert.ok(c.weapons.every(w => W.includes(w)) && (c.weapons.length || c.dance || c.source === 'Gorgon Egg'), c.id + ' armes');
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

test('monstres de FE8 : classes, armes de monstre installées, promotions, efficacité « Monstre »', () => {
  const FE = require('../src/shared/fe-classes'), D = require('../src/shared/defaults'), R = require('../src/shared/rules'), P = require('../src/shared/promotions');
  const db = { classes: D.classes(), weapons: D.weapons(), items: D.items(), units: D.characters(), skills: [] };
  assert.equal(FE.install(db, ['fe8m']), 22);
  const c = (n) => db.classes.find(x => x.id === 'fe8_' + n);
  assert.deepEqual(c('revenant').base, { hp: 25, str: 2, mag: 0, skl: 0, spd: 0, lck: 0, def: 0, res: 0 });
  assert.equal(c('arch_mogall').growths.mag, 55); assert.equal(c('draco_zombie').caps.hp, 100);
  assert.deepEqual(c('mogall').promotions.map(p => p.classId), ['fe8_arch_mogall']);
  assert.equal(c('gargoyle').moveType, 'flier'); assert.equal(c('maelduin').moveType, 'horse');
  assert.deepEqual(P.validate(db), []);
  const claw = db.weapons.find(w => w.id === c('revenant').defaultInventory[0]);
  assert.equal(claw.type, 'monster'); assert.equal(claw.name, 'Griffe pourrie');
  assert.equal(db.weapons.find(w => w.name === 'Griffe empoisonnée').inflict.id, 'poison');
  // une arme « efficace contre les monstres » triple sa puissance
  const enemy = R.makeEnemyFromPlacement({ id: 'e', classId: 'fe8_revenant', level: 1, x: 1, y: 0 }, db);
  const hero = R.makeUnitFromCharacter(db.units[0], db, { x: 0, y: 0 });
  const sword = Object.assign({}, db.weapons.find(w => w.id === 'w_iron_sword'), { id: 'w_slayer', effective: ['monster'], rank: '' });
  db.weapons.push(sword); hero.inventory = [{ id: 'w_slayer', uses: 30 }];
  const opts = { db, settings: { trueHit: false }, terrainOf: () => null };
  assert.equal(R.forecast(hero, 0, enemy, opts).att.effective, true);
  sword.effective = []; assert.equal(R.forecast(hero, 0, enemy, opts).att.effective, false);
});
