'use strict';
/* Niveaux d'armes (E à S) : seuils, arme exigeant un niveau, EXP d'arme, niveau de départ, campagne, niveaux officiels. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/shared/rules');
const C = require('../src/shared/campaign');
const D = require('../src/shared/defaults');
const A = require('../src/shared/armory-icons');
const FE = require('../src/shared/fe-arsenal');

const db = () => ({ classes: D.classes(), units: D.characters(), weapons: D.weapons(), items: D.items(), skills: [] });

test('seuils GBA et progression vers le niveau suivant', () => {
  assert.deepEqual(R.RANKS, ['E', 'D', 'C', 'B', 'A', 'S']);
  assert.equal(R.rankOfWexp(0), 'E'); assert.equal(R.rankOfWexp(30), 'E'); assert.equal(R.rankOfWexp(31), 'D');
  assert.equal(R.rankOfWexp(180), 'B'); assert.equal(R.rankOfWexp(181), 'A'); assert.equal(R.rankOfWexp(999), 'S');
  const p = R.rankProgress({ wexp: { lance: 51 } }, 'lance');
  assert.deepEqual([p.rank, p.next, p.ratio], ['D', 'C', 0.5]);
  assert.equal(R.rankProgress({ wexp: { lance: 251 } }, 'lance').ratio, 1);
  assert.equal(R.rankOf({}, 'sword'), 'E');
});

test('arme exigeant un niveau : maniable à partir de ce niveau ; les ennemis l’ignorent', () => {
  const d = db(), silver = { id: 'w_s', name: 'Épée d’argent', type: 'sword', rank: 'A', might: 13 }, plain = { id: 'w_p', type: 'sword' };
  const u = { classId: 'mercenary', team: 'player', wexp: { sword: 120 } };
  assert.equal(R.canWield(u, silver, d), false); assert.equal(R.canWield(u, plain, d), true);
  u.wexp.sword = 181; assert.equal(R.canWield(u, silver, d), true);
  assert.equal(R.canWield({ classId: 'mercenary', team: 'enemy' }, silver, d), true);
});

test('niveau de départ : fiche du personnage, au moins E, inventaire de départ toujours maniable', () => {
  const d = db(), cls = d.classes.find(c => c.id === 'mercenary');
  const w = R.initialWexp({ weaponRanks: { sword: 'C' }, inventory: [] }, cls, d);
  assert.equal(w.sword, 71);
  const steel = d.weapons.find(x => x.id === 'w_steel_sword');
  assert.equal(steel.rank, 'D');
  assert.equal(R.initialWexp({ inventory: [{ id: 'w_steel_sword', uses: 30 }] }, cls, d).sword, 31);
  const unit = R.makeUnitFromCharacter(Object.assign({}, d.units[0], { inventory: [{ id: 'w_steel_sword', uses: 30 }], classId: 'mercenary' }), d, { x: 0, y: 0 });
  assert.equal(R.canWield(unit, steel, d), true);
});

test('EXP d’arme : +1 par défaut (ou weapon.wexp), annonce du nouveau niveau, plafond S, pas pour les ennemis', () => {
  const u = { team: 'player', wexp: { axe: 29 } }, axe = { type: 'axe' };
  assert.equal(R.gainWexp(u, axe), null); assert.equal(u.wexp.axe, 30);
  assert.deepEqual(R.gainWexp(u, axe), { type: 'axe', rank: 'D' });
  assert.deepEqual(R.gainWexp(u, { type: 'axe', wexp: 50 }), { type: 'axe', rank: 'C' }); assert.equal(u.wexp.axe, 81);
  R.gainWexp(u, { type: 'axe', wexp: 999 }); assert.equal(u.wexp.axe, R.MAX_WEXP);
  assert.equal(R.gainWexp({ team: 'enemy' }, axe), null);
  assert.equal(R.gainWexp(u, { type: 'bow', wexp: 0 }), null);
});

test('campagne : l’EXP d’arme est gardée d’un acte à l’autre', () => {
  const d = db(), camp = C.create('classic');
  const u = R.makeUnitFromCharacter(d.units[0], d, { x: 0, y: 0 });
  u.wexp = Object.assign({}, u.wexp, { sword: 77 });
  C.commit(camp, [u]);
  const again = C.apply(camp, R.makeUnitFromCharacter(d.units[0], d, { x: 0, y: 0 }), d);
  assert.equal(again.wexp.sword, 77); assert.equal(R.rankOf(again, 'sword'), 'C');
});

test('niveaux officiels : armes de la série (pack, projet d’exemple, anciens projets)', () => {
  assert.equal(A.officialRank('Épée d\'argent'), 'A'); assert.equal(A.officialRank('Lance brave'), 'B'); assert.equal(A.officialRank('Rapière'), '');
  const d = { weapons: [{ name: 'Hache tueuse' }, { name: 'Ma hache', rank: '' }, { name: 'Arc d\'acier', rank: 'S' }], items: [], skills: [] };
  assert.equal(A.fillRanks(d), 1); assert.equal(d.weapons[0].rank, 'C'); assert.equal(d.weapons[1].rank, ''); assert.equal(d.weapons[2].rank, 'S');
  const p = { weapons: [], items: [], skills: [] }; FE.install(p, ['swords', 'legendary']);
  assert.equal(p.weapons.find(w => w.name === 'Épée brave').rank, 'B');
  assert.ok(!p.weapons.find(w => w.name === 'Durandal').rank);
});
