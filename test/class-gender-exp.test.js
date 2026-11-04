'use strict';
/* Classes réservées à un genre (promotion, générateur) et EXP multipliée des classes de palier 0 (recrues). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/shared/rules');
const Promotions = require('../src/shared/promotions');
const D = require('../src/shared/defaults');
const FE = require('../src/shared/fe-classes');

function db() {
  const classes = D.classes();
  const recruit = classes.find(c => c.id === 'recruit');
  return { classes, units: D.characters(), weapons: D.weapons(), items: D.items(), skills: [], recruit };
}

test('EXP : palier 0 ×2 par défaut, ×3 au réglage, plafond 100, palier 1 inchangé', () => {
  const d = db();
  assert.equal(d.recruit.tier, 0);
  const u = { classId: 'recruit' }, base = { classId: 'soldier' };
  assert.equal(R.DEFAULT_SETTINGS.traineeExp, 2);
  assert.equal(R.expMultiplier(u, d), 2); assert.equal(R.expFor(u, 30, d), 60);
  assert.equal(R.expFor(u, 30, d, { traineeExp: 3 }), 90);
  assert.equal(R.expFor(u, 60, d, { traineeExp: 3 }), 100);
  assert.equal(R.expFor(u, 30, d, { traineeExp: 1 }), 30);
  assert.equal(R.expFor(u, 30, d, { traineeExp: 9 }), 90); // borné à ×3
  assert.equal(R.expMultiplier(base, d), 1); assert.equal(R.expFor(base, 30, d), 30);
  assert.equal(R.expMultiplier({ classId: 'absent' }, d), 1);
});

test('genre : classe réservée refusée à l’autre genre seulement ; promotion bloquée avec la raison', () => {
  const peg = { id: 'peg', gender: 'femme' }, free = { id: 'x' };
  assert.equal(R.classGenderOk(peg, 'femme'), true); assert.equal(R.classGenderOk(peg, 'homme'), false);
  assert.equal(R.classGenderOk(peg, ''), true); assert.equal(R.classGenderOk(peg, 'autre'), true); assert.equal(R.classGenderOk(free, 'homme'), true);
  assert.equal(R.genderLockText(peg), 'Classe réservée aux femmes.');
  const d = db();
  const cav = d.classes.find(c => c.id === 'cavalier');
  const target = d.classes.find(c => c.id === cav.promotions[0].classId);
  target.gender = 'femme';
  const ch = d.units.find(u => u.gender === 'homme');
  ch.classId = 'cavalier'; ch.level = 20;
  const unit = R.makeUnitFromCharacter(ch, d, { x: 0, y: 0 });
  assert.equal(unit.gender, 'homme');
  unit.inventory.push({ id: cav.promotions[0].itemId || 'i_master_seal', uses: 1 });
  const opt = Promotions.options(unit, d).find(o => o.row.classId === target.id);
  assert.ok(opt && !opt.available && opt.reasons.includes('Classe réservée aux femmes.'), JSON.stringify(opt && opt.reasons));
  target.gender = '';
  assert.ok(!Promotions.options(unit, d).find(o => o.row.classId === target.id).reasons.includes('Classe réservée aux femmes.'));
});

test('pack de classes : variantes (M) / (F) et classes d’un seul genre des GBA réservées', () => {
  const d = { classes: [], weapons: D.weapons(), items: [], units: [] };
  FE.install(d, ['fe8']);
  const by = (name) => d.classes.find(c => c.name === name + ' · FE8');
  assert.equal(by('Paladin (F)').gender, 'femme'); assert.equal(by('Paladin (M)').gender, 'homme');
  assert.equal(by('Pegasus Knight').gender, 'femme'); assert.equal(by('Monk').gender, 'homme');
  assert.ok(!by('Soldier').gender && !by('Thief').gender);
});
