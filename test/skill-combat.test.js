'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/shared/rules');
const Skills = require('../src/shared/skills');

function fixture() {
  const db = { skills: Skills.presets(), classes: [{ id: 'fighter', moveType: 'foot', weapons: ['sword', 'anima', 'bow'] }], weapons: [
    { id: 'sword', name: 'Épée', type: 'sword', might: 5, hit: 80, weight: 0, crit: 0, uses: 10, minRange: 1, maxRange: 1 },
    { id: 'magic', name: 'Feu', type: 'anima', might: 5, hit: 80, weight: 0, crit: 0, uses: 10, minRange: 1, maxRange: 2 },
    { id: 'bow', name: 'Arc', type: 'bow', might: 5, hit: 80, weight: 0, crit: 0, uses: 10, minRange: 2, maxRange: 2 }
  ] };
  const make = (uid, team, x, y) => ({ uid, sourceId: uid, name: uid, classId: 'fighter', team, level: 1, exp: 0, mov: 3, moveType: 'foot', ai: 'aggressive',
    x, y, hp: 40, stats: { hp: 40, str: 10, mag: 10, skl: 0, spd: 5, lck: 0, def: 5, res: 3 },
    inventory: [{ id: 'sword', uses: 10 }], learnedSkills: [], equippedSkills: [], personalSkill: '' });
  const a = make('a', 'player', 1, 1), d = make('d', 'enemy', 2, 1), ally = make('ally', 'ally', 1, 2);
  const opts = { db, settings: { trueHit: false }, terrainOf: () => null, units: [a, d, ally], rng: () => 0.1 };
  const skill = (id, changes = {}) => Object.assign(db.skills.find(s => s.id === 'skill_' + id), changes);
  const give = (unit, ...ids) => { unit.learnedSkills = ids.map(id => 'skill_' + id); unit.equippedSkills = unit.learnedSkills.slice(); };
  return { db, a, d, ally, opts, make, skill, give };
}

test('passifs : personnelle + équipement, réserves inactives, prévisions sans hasard ni mutation', () => {
  const { a, d, opts, give } = fixture();
  const base = R.forecast(a, 0, d, opts);
  give(a, 'offensive', 'precision'); a.personalSkill = 'skill_precision';
  give(d, 'garde', 'esquive');
  a.learnedSkills.push('skill_luna');
  const before = JSON.stringify([a, d]);
  const fc = R.forecast(a, 0, d, { ...opts, rng: () => { throw new Error('Pas de hasard dans une prévision'); } });
  assert.equal(fc.att.dmg, base.att.dmg + 3 - 2);
  assert.equal(fc.att.hit, base.att.hit); // +10 précision et +10 esquive adverse.
  assert.equal(fc.att.procs.length, 0);
  assert.equal(fc.att.skills.filter(s => s.id === 'skill_precision').length, 1);
  assert.equal(JSON.stringify([a, d]), before);
  const res = R.resolveCombat(a, 0, d, opts);
  assert.equal(res.strikes[0].dmg, fc.att.dmg);
});

test('conditions : engagement, arme, seuil inclusif de PV et allié adjacent vivant', () => {
  const { a, d, ally, opts, give, skill } = fixture();
  give(a, 'offensive'); skill('offensive', { weaponType: 'sword', hpCondition: 'below', hpThreshold: 50, adjacentAlly: true });
  a.hp = 20;
  assert.equal(R.forecast(a, 0, d, opts).att.dmg, 13);
  a.hp = 21; assert.equal(R.forecast(a, 0, d, opts).att.dmg, 10);
  a.hp = 20; ally.dead = true; assert.equal(R.forecast(a, 0, d, opts).att.dmg, 10);
  ally.dead = false; ally.team = 'enemy'; assert.equal(R.forecast(a, 0, d, opts).att.dmg, 10);
  ally.team = 'ally'; a.inventory[0].id = 'magic'; assert.equal(R.forecast(a, 0, d, opts).att.dmg, 12);
  a.inventory[0].id = 'sword';
  assert.equal(R.forecast(d, 0, a, opts).def.dmg, 10); // Offensive ne fonctionne pas en riposte.
});

test('aura : rayon de Manhattan, absence de cumul, alliés verts, sources mortes et exclusion de soi', () => {
  const { a, d, ally, opts, give, make, db } = fixture();
  give(ally, 'presence');
  const clone = make('clone', 'player', 0, 1); give(clone, 'presence'); opts.units.push(clone);
  const base = R.forecast(d, 0, a, { ...opts, units: [a, d] }).att.hit;
  assert.equal(R.forecast(d, 0, a, opts).att.hit, base - 10);
  db.skills.push({ ...db.skills.find(s => s.id === 'skill_presence'), id: 'strong', amount: 20 });
  clone.learnedSkills = clone.equippedSkills = ['strong'];
  assert.equal(R.forecast(d, 0, a, opts).att.hit, base - 20);
  clone.hp = 0; ally.x = 0; ally.y = 3;
  assert.equal(R.forecast(d, 0, a, opts).att.hit, base);
  give(a, 'presence'); assert.equal(R.forecast(d, 0, a, { ...opts, units: [a, d] }).att.hit, base);
});

test('conditions de PV recalculées avant chaque coup, sans changer le doublé initial', () => {
  const { a, d, opts, give, skill } = fixture();
  give(d, 'garde'); skill('garde', { hpCondition: 'below', hpThreshold: 50 });
  d.hp = d.stats.hp = 20; d.inventory = []; a.stats.spd = 10;
  const res = R.resolveCombat(a, 0, d, opts);
  assert.deepEqual(res.strikes.map(s => s.dmg), [10, 8]);
  assert.equal(d.hp, 2);
});

test('Garde réduit les dégâts après le multiplicateur critique et ne soigne jamais', () => {
  const { a, d, opts, give, db, skill } = fixture(); give(d, 'garde'); db.weapons[0].crit = 100;
  d.inventory = [];
  assert.equal(R.resolveCombat(a, 0, d, opts).strikes[0].dmg, 28);
  d.hp = 40; skill('garde', { amount: 99 });
  assert.equal(R.resolveCombat(a, 0, d, opts).strikes[0].dmg, 0); assert.equal(d.hp, 40);
});

test('Luna réduit Déf ou Rés et terrain, avec arrondi inférieur de la protection ignorée', () => {
  for (const weapon of ['sword', 'magic']) {
    const { a, d, opts, give, skill } = fixture(); give(a, 'luna'); skill('luna', { activation: 'fixed', chance: 100 });
    a.inventory[0].id = weapon; d.inventory = []; opts.terrainOf = () => ({ def: 2 });
    const fc = R.forecast(a, 0, d, opts), protection = weapon === 'sword' ? 7 : 5;
    assert.equal(fc.att.dmg, 15 - protection);
    assert.equal(fc.att.procs[0].dmg, 15 - protection + Math.floor(protection / 2));
    const res = R.resolveCombat(a, 0, d, opts);
    assert.equal(res.strikes[0].dmg, fc.att.procs[0].dmg);
    assert.equal(res.strikes[0].skills[0].effect, 'luna');
  }
});

test('Sol : soin sur dégâts réels, arrondi inférieur et plafond de PV', () => {
  const { a, d, opts, give, skill } = fixture(); give(a, 'sol'); skill('sol', { activation: 'always' });
  a.hp = 10; d.hp = 3; d.inventory = [];
  const strike = R.resolveCombat(a, 0, d, opts).strikes[0];
  assert.equal(strike.dmg, 3); assert.equal(strike.heal, 1); assert.equal(strike.srcHpAfter, 11); assert.equal(a.hp, 11);
  a.hp = 39; d.hp = 20;
  assert.equal(R.resolveCombat(a, 0, d, opts).strikes[0].heal, 1); assert.equal(a.hp, 40);
});

test('un seul déclenchement offensif : affinité puis Luna puis Sol ; repli si échec', () => {
  const { a, d, opts, give, skill } = fixture(); give(a, 'luna', 'sol');
  skill('luna', { activation: 'fixed', chance: 100 }); skill('sol', { activation: 'always' }); d.inventory = [];
  let strike = R.resolveCombat(a, 0, d, { ...opts, specialOf: () => ({ name: 'Élan', chance: 100, dmg: 2 }) }).strikes[0];
  assert.equal(strike.special, 'Élan'); assert.deepEqual(strike.skills, []);
  d.hp = 40; strike = R.resolveCombat(a, 0, d, opts).strikes[0];
  assert.deepEqual(strike.skills.map(s => s.effect), ['luna']);
  skill('luna', { chance: 0 }); d.hp = 40; a.hp = 10;
  strike = R.resolveCombat(a, 0, d, opts).strikes[0];
  assert.deepEqual(strike.skills.map(s => s.effect), ['sol']); assert.ok(strike.heal > 0);
});

test('échec de précision : pas de Luna/Sol, aucun soin ; chance liée aux stats plafonnée', () => {
  const { a, d, opts, give, skill, db } = fixture(); give(a, 'sol'); a.hp = 10; a.stats.skl = 200;
  assert.equal(Skills.chance(skill('sol'), a), 100);
  db.weapons[0].hit = -500;
  const res = R.resolveCombat(a, 0, d, opts);
  assert.equal(res.strikes[0].hit, false); assert.deepEqual(res.strikes[0].skills, []); assert.equal(a.hp, 10);
});

test('Vantage : ordre fixé au début, riposte obligatoire, pas de coup gratuit et mort avant attaque', () => {
  const { a, d, opts, give } = fixture(); give(d, 'vantage'); d.hp = 20;
  assert.deepEqual(R.forecast(a, 0, d, opts).order, ['d', 'a']);
  a.hp = 5;
  const res = R.resolveCombat(a, 0, d, opts);
  assert.equal(res.strikes.length, 1); assert.equal(res.strikes[0].by, d.uid); assert.equal(res.attackerDead, true);
  assert.equal(res.strikes[0].skills[0].effect, 'vantage');
  a.hp = 40; a.inventory[0].id = 'bow'; a.x = 0;
  assert.equal(R.forecast(a, 0, d, opts).vantage, null);
  a.x = 1; a.inventory[0].id = 'sword'; d.hp = 21;
  assert.deepEqual(R.resolveCombat(a, 0, d, opts).strikes.map(s => s.by), ['a', 'd']);
});

test('Miracle : survie à 1 PV, aucune nouvelle survie depuis 1 PV, critiques et doublés', () => {
  const { a, d, opts, give, skill, db } = fixture(); give(d, 'miracle'); skill('miracle', { activation: 'always' });
  d.hp = 5; d.inventory = []; a.stats.spd = 10; db.weapons[0].crit = 100;
  const res = R.resolveCombat(a, 0, d, opts);
  assert.deepEqual(res.strikes.map(s => s.hpAfter), [1, 0]);
  assert.equal(res.strikes[0].skills[0].effect, 'miracle'); assert.deepEqual(res.strikes[1].skills, []);
  assert.equal(res.defenderDead, true);
});

test('arme brisée : plus de second coup ; le prochain objet ne devient pas une arme du combat', () => {
  const { a, d, opts } = fixture(); a.stats.spd = 10; a.inventory[0].uses = 1; a.inventory.push({ id: 'magic', uses: 10 }); d.inventory = [];
  assert.equal(R.forecast(a, 0, d, opts).att.count, 1);
  const res = R.resolveCombat(a, 0, d, opts);
  assert.equal(res.strikes.length, 1); assert.equal(res.strikes[0].broke, true);
  assert.equal(a.inventory[0].id, 'magic'); assert.equal(a.inventory[0].uses, 10);
});

test('attaque duo : passifs et protections appliqués, aucun Luna/Sol du partenaire', () => {
  const { a, d, ally, opts, give, skill } = fixture(); give(ally, 'luna', 'sol', 'offensive'); give(d, 'miracle', 'garde');
  skill('luna', { activation: 'always' }); skill('sol', { activation: 'always' }); skill('miracle', { activation: 'always' });
  d.hp = 12; d.inventory = []; ally.hp = 10;
  const res = R.resolveCombat(a, 0, d, { ...opts, dual: { partner: ally, chance: 100, name: 'Duo' } });
  const duo = res.strikes.find(s => s.dual);
  assert.ok(duo); assert.equal(duo.hpAfter, 1); assert.equal(d.hp, 1);
  assert.deepEqual(duo.skills.map(s => s.effect), ['miracle']); assert.equal(ally.hp, 10);
});

test('Régénération : début de phase, conditions, plafonds et aucune résurrection', () => {
  const { a, ally, d, opts, give, skill } = fixture(); give(a, 'regeneration'); give(ally, 'regeneration'); give(d, 'regeneration');
  a.hp = 38; ally.hp = 0; d.hp = 20;
  let events = R.phaseRecovery([a, ally], opts);
  assert.equal(events.length, 1); assert.equal(events[0].heal, 2); assert.equal(a.hp, 40); assert.equal(ally.hp, 0); assert.equal(d.hp, 20);
  assert.deepEqual(R.phaseRecovery([a, ally], opts), []);
  skill('regeneration', { hpCondition: 'below', hpThreshold: 50, adjacentAlly: true }); a.hp = 20;
  assert.deepEqual(R.phaseRecovery([a], opts), []);
  ally.hp = 10; events = R.phaseRecovery([a], opts); assert.equal(events[0].heal, 4); assert.equal(a.hp, 24);
});

test('IA : Vantage létal réduit son estimation et elle privilégie une cible sans riposte fatale', () => {
  const { a, d, opts, give, make } = fixture(); a.team = 'enemy'; d.team = 'player'; d.hp = 20; a.hp = 5; a.ai = 'stationary';
  give(d, 'vantage');
  const easy = make('easy', 'player', 1, 2); easy.stats.def = 9; easy.inventory = [];
  opts.units = [a, d, easy];
  const ctx = { width: 4, height: 4, terrainAt: () => ({ cost: { foot: 1 } }), unitAt: (x, y) => opts.units.find(u => u.x === x && u.y === y) };
  const fc = R.forecast(a, 0, d, opts);
  assert.ok(R.estimateCombat(a, d, fc).damage < fc.att.expectedDmg);
  assert.equal(R.planEnemy(a, [d, easy], { ...opts, ctx }).target.uid, easy.uid);
});

test('IA : un doublé peut achever Miracle ; probabilités de deux coups et dégâts cumulés', () => {
  const { a, d, opts, give, skill, db } = fixture(); a.stats.spd = 10; d.inventory = []; d.hp = 5;
  give(d, 'miracle'); skill('miracle', { activation: 'always' }); db.weapons[0].hit = 1000;
  assert.equal(R.estimateCombat(a, d, R.forecast(a, 0, d, opts)).killChance, 1);
  a.inventory[0].uses = 1;
  assert.equal(R.estimateCombat(a, d, R.forecast(a, 0, d, opts)).killChance, 0);
  d.equippedSkills = []; d.hp = 15; a.inventory[0].uses = 10; db.weapons[0].hit = 60; // 50 % après esquive.
  assert.equal(R.estimateCombat(a, d, R.forecast(a, 0, d, opts)).killChance, 0.25);
});
