'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/shared/fe-arsenal');
const D = require('../src/shared/defaults');
const R = require('../src/shared/rules');
const Sk = require('../src/shared/skills');

const all = () => A.GROUPS.map(g => g.id);

test('fiches cohérentes : types d’armes, portées, effets d’objets et de compétences connus', () => {
  const types = R.WEAPON_TYPES.map(t => t.id), effects = Sk.EFFECTS.map(e => e.id);
  for (const g of A.WEAPON_GROUPS) for (const w of g.list) {
    assert.ok(types.includes(w.type), w.name);
    assert.ok(w.minRange >= 1 && w.maxRange >= w.minRange, w.name);
    assert.ok(w.type !== 'staff' || w.heal > 0, w.name);
    for (const m of w.effective) assert.ok(['horse', 'armor', 'flier', 'foot'].includes(m), w.name);
  }
  for (const g of A.ITEM_GROUPS) for (const it of g.list) assert.ok(['heal', 'boost', 'promotion', 'key'].includes(it.effect), it.name);
  for (const g of A.SKILL_GROUPS) for (const s of g.list) { assert.ok(effects.includes(s.effect), s.name); assert.ok(s.description, s.name); }
  assert.ok(A.total('weapons') >= 100 && A.total('items') >= 20 && A.total('skills') >= 35);
});

test('installation : fiches absentes ajoutées, valides, rien en double au 2e passage', () => {
  const p = D.sampleProject('Arsenal'), before = { w: p.db.weapons.length, i: p.db.items.length, s: p.db.skills.length };
  const res = A.install(p.db, all());
  assert.equal(p.db.weapons.length, before.w + res.weapons);
  assert.ok(res.weapons > 80 && res.items > 10 && res.skills > 25);
  assert.deepEqual(A.install(p.db, all()), { weapons: 0, items: 0, skills: 0 });
  for (const k of ['weapons', 'items', 'skills']) assert.equal(new Set(p.db[k].map(e => e.id)).size, p.db[k].length, k);
  for (const s of p.db.skills) assert.deepEqual(Sk.validate(s), [], s.name);
  // les noms déjà présents ne sont pas dupliqués (Épée de fer, Potion, Luna…)
  for (const [kind, name] of [['weapons', 'Épée de fer'], ['items', 'Potion'], ['skills', 'Luna'], ['skills', 'Crochetage']]) assert.equal(p.db[kind].filter(e => A.fold(e.name) === A.fold(name)).length, 1, name);
});

function duel(weapon, setup) {
  const p = D.sampleProject('Arsenal'); A.install(p.db, all());
  const w = p.db.weapons.find(x => x.name === weapon);
  const a = R.makeUnitFromCharacter(p.db.units.find(u => u.id === 'c_eliwood'), p.db, { x: 0, y: 0 });
  a.inventory = [{ id: w.id, uses: w.uses }];
  const b = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 1, y: 0 }, p.db);
  Object.assign(b.stats, { hp: 80, spd: 0, def: 5, res: 0 }); b.hp = 80;
  if (setup) setup(a, b, p.db, w);
  const opts = { db: p.db, settings: { trueHit: false, overkill: false }, terrainOf: () => null, rng: () => 0.5 };
  return { a, b, w, fc: R.forecast(a, 0, b, opts), res: R.resolveCombat(a, 0, b, opts) };
}

test('arme brave : chaque attaque frappe deux fois (quatre coups en doublant)', () => {
  const { fc, res } = duel('Épée brave', (a) => { a.stats.spd = 20; });
  assert.deepEqual(fc.order.filter(x => x === 'a').length, 4);
  assert.equal(fc.att.count, 4);
  assert.equal(res.strikes.filter(s => s.target !== s.by && s.hit && s.by === res.strikes[0].by).length, 4);
});

test('arme magique : dégâts selon la Magie et la Résistance', () => {
  const { fc, a, b, w } = duel('Lame du tonnerre', (a, b) => { a.stats.str = 0; a.stats.mag = 10; b.stats.def = 30; b.stats.res = 0; });
  assert.equal(fc.att.dmg, a.stats.mag + w.might - b.stats.res + fc.att.tri * 1);
});

test('drain : le porteur récupère les PV des dégâts infligés', () => {
  const { res, a } = duel('Lame runique', (a) => { a.stats.mag = 12; a.hp = 5; });
  const healed = res.strikes.filter(s => s.by === a.uid).reduce((n, s) => n + s.heal, 0);
  assert.ok(healed > 0);
  assert.equal(a.hp, Math.min(a.stats.hp, 5 + healed - res.strikes.filter(s => s.target === a.uid).reduce((n, s) => n + s.dmg, 0)));
});
