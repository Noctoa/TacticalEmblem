'use strict';
/* Ultimes : catalogue, validation, zones, effets, recharge, frappe dans le combat, projet. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const U = require('../src/shared/ultimates');
const R = require('../src/shared/rules');
const K = require('../src/shared/skills');
const D = require('../src/shared/defaults');
const io = require('../src/main/project-io');

function fixture() {
  const db = { classes: [{ id: 'hybrid', weapons: ['sword'] }], skills: K.presets(), items: [], weapons: [
    { id: 'sword', type: 'sword', name: 'Épée', might: 5, hit: 0, crit: 0, weight: 0, minRange: 1, maxRange: 1, uses: 20 }] };
  const make = (uid, team, x, y = 1) => ({ uid, sourceId: uid, name: uid, team, classId: 'hybrid', x, y,
    hp: 40, stats: { hp: 40, str: 10, mag: 2, skl: 0, lck: 0, spd: 0, def: 3, res: 1 },
    mov: 4, moveType: 'foot', ai: 'aggressive', personalSkill: '', learnedSkills: [], equippedSkills: [], inventory: [{ id: 'sword', uses: 20 }] });
  const a = make('a', 'player', 0), b = make('b', 'enemy', 1), units = [a, b];
  const opts = { db, units, terrainOf: () => null, settings: { trueHit: false, overkill: false, critMult: 3 }, rng: () => .99 };
  return { db, a, b, opts, make };
}

test('exemples : valides, attribués aux héros de l’exemple, liens corrects', () => {
  const p = D.sampleProject('Jeu');
  assert.deepEqual(U.validateAll(p.db.ultimates), []);
  assert.deepEqual(U.validateLinks(p.db), []);
  assert.deepEqual(p.db.ultimates.map(u => u.effect), ['strike', 'heal', 'blast', 'rally']);
  assert.equal(p.db.units.find(u => u.id === 'c_hector').ultimate, 'ult_meteore');
  assert.ok(p.meta.pluginMigrations.includes('ultimates'));
  for (const u of p.db.ultimates) assert.ok(U.describe(u).includes('recharge'), u.id);
});

test('validation : recharge 1-9, réglages de chaque effet, références', () => {
  const ok = Object.assign(U.create('blast'), { id: 'x' });
  assert.deepEqual(U.validate(ok), []);
  assert.match(U.validate(Object.assign({}, ok, { cooldown: 10 })).join(), /recharge/);
  assert.match(U.validate(Object.assign({}, ok, { cooldown: 0 })).join(), /recharge/);
  assert.match(U.validate(Object.assign({}, ok, { area: 'self', radius: 0 })).join(), /rayon/);
  assert.match(U.validate(Object.assign(U.create('strike'), { id: 's', power: 50 })).join(), /100 et 500/);
  assert.match(U.validate(Object.assign(U.create('rally'), { id: 'r', dmg: 0, hit: 0, avoid: 0, refresh: false })).join(), /aucun effet/);
  assert.match(U.validate(Object.assign({}, ok, { effect: 'boom' })).join(), /effet inconnu/);
  assert.match(U.validateAll([ok, Object.assign({}, ok)]).join(), /double/);
  const db = { ultimates: [ok], units: [{ name: 'Lyn', ultimate: 'absent' }, { name: 'Eli', ultimate: 'x' }], animations: [] };
  assert.match(U.validateLinks(db).join(), /Lyn/);
  ok.animation = 'anim_absente'; assert.match(U.validateLinks(db).join(), /animation introuvable/);
  assert.deepEqual(U.usersOf(db, 'x'), ['Unité « Eli »']);
  U.forget(db, 'x'); assert.equal(db.units[1].ultimate, '');
});

test('changement d’effet : les réglages de l’ancien effet disparaissent', () => {
  const u = Object.assign(U.create('blast'), { id: 'x' });
  U.setEffect(u, 'heal');
  assert.equal(u.area, undefined); assert.equal(u.amount, 50); assert.equal(u.cooldown, 3);
  assert.deepEqual(U.validate(u), []);
});

test('zones : cases dans la carte, unités touchées selon l’effet', () => {
  assert.equal(U.area({ x: 5, y: 5 }, 1).length, 5);
  assert.equal(U.area({ x: 5, y: 5 }, 2).length, 13);
  assert.equal(U.area({ x: 0, y: 0 }, 1, 10, 10).length, 3);
  const f = fixture(), c = f.make('c', 'player', 0, 2), far = f.make('far', 'player', 5, 5), e2 = f.make('e2', 'enemy', 3, 3);
  const units = [f.a, f.b, c, far, e2];
  const heal = Object.assign(U.create('heal'), { radius: 2, self: false });
  assert.deepEqual(U.affected(heal, f.a, units).map(u => u.uid), ['c']);
  heal.self = true; assert.deepEqual(U.affected(heal, f.a, units).map(u => u.uid), ['a', 'c']);
  const blast = Object.assign(U.create('blast'), { area: 'tile', radius: 1 });
  assert.deepEqual(U.affected(blast, f.a, units, { x: 2, y: 3 }).map(u => u.uid), ['e2']); // les alliés ne sont jamais touchés
  assert.deepEqual(U.affected(Object.assign({}, blast, { area: 'self', radius: 1 }), f.a, units).map(u => u.uid), ['b']);
});

test('effets : soin plafonné, dégâts de zone For / Mag, « peut vaincre »', () => {
  const f = fixture();
  f.a.hp = 30;
  assert.equal(U.healAmount({ amount: 50 }, f.a), 10); // 20 de soin, plafonné aux PV manquants
  f.a.hp = 39; assert.equal(U.healAmount({ amount: 1 }, f.a), 1);
  const blast = Object.assign(U.create('blast'), { stat: 'str', power: 150 });
  assert.equal(U.blastDamage(blast, f.a, f.b), 15 - 3); // 10 × 150 % − Déf
  assert.equal(U.blastDamage(Object.assign({}, blast, { stat: 'mag' }), f.a, f.b), 2); // 3 − Rés 1
  assert.equal(U.blastDamage(Object.assign({}, blast, { stat: 'best' }), f.a, f.b), 12); // For > Mag
  f.b.hp = 5;
  assert.equal(U.blastDamage(blast, f.a, f.b), 5);
  assert.equal(U.blastDamage(Object.assign({}, blast, { lethal: false }), f.a, f.b), 4);
});

test('recharge : −1 au début de la phase du camp, prêt à 0 ; les renforts expirent', () => {
  const f = fixture();
  f.a.ultCharge = 2; f.a.rally = [{ id: 'r', dmg: 3, hit: 0, avoid: 5, turns: 1 }, { id: 's', dmg: 1, hit: 10, avoid: 0, turns: 2 }];
  assert.deepEqual(U.rallyBonus(f.a), { dmg: 3, hit: 10, avoid: 5, crit: 0, critAvoid: 0 });
  assert.deepEqual(U.beginPhase([f.a]), []);
  assert.equal(f.a.ultCharge, 1); assert.deepEqual(f.a.rally.map(r => r.id), ['s']);
  assert.deepEqual(U.beginPhase([f.a]), [f.a]);
  assert.equal(f.a.ultCharge, 0); assert.equal(U.rallyBonus(f.a), null);
  assert.equal(U.initialCharge({ cooldown: 4, ready: false }), 4);
  assert.equal(U.initialCharge({ cooldown: 4, ready: true }), 0);
});

test('unité d’un personnage : ultime et recharge de départ', () => {
  const p = D.sampleProject('Jeu');
  const hector = R.makeUnitFromCharacter(p.db.units.find(u => u.id === 'c_hector'), p.db, { x: 0, y: 0 });
  assert.equal(hector.ultimate, 'ult_meteore'); assert.equal(hector.ultCharge, 4); // « Météore » commence en recharge
  const xarrin = R.makeUnitFromCharacter(p.db.units.find(u => u.id === 'c_xarrin'), p.db, { x: 0, y: 0 });
  assert.equal(xarrin.ultCharge, 0);
  const lost = R.makeUnitFromCharacter(Object.assign({}, p.db.units[0], { ultimate: 'absent' }), p.db, { x: 0, y: 0 });
  assert.equal(lost.ultimate, '');
});

test('frappe ultime : touche assurée, dégâts multipliés au premier coup, sans riposte', () => {
  const f = fixture();
  // sans ultime : précision 0 % (épée 0 de précision), aucun coup ne touche
  const normal = R.resolveCombat(f.a, 0, f.b, f.opts);
  assert.equal(normal.strikes[0].hit, false);
  const g = fixture();
  const ult = U.strikeOpts(Object.assign(U.create('strike'), { id: 'ult_x', name: 'Coup', power: 300, sureHit: true, noCounter: true }));
  const res = R.resolveCombat(g.a, 0, g.b, { ...g.opts, ultimate: ult });
  const first = res.strikes[0];
  assert.equal(first.hit, true); assert.equal(first.ultimate, 'Coup');
  assert.equal(first.dmg, (10 + 5 - 3) * 3); // (For + puissance − Déf) × 300 %
  assert.ok(first.skills.some(s => s.ultimate && s.name === 'Coup'));
  assert.ok(res.strikes.every(s => s.by === 'a')); // pas de riposte
  // avec riposte : la cible frappe ensuite normalement
  const h = fixture();
  const res2 = R.resolveCombat(h.a, 0, h.b, { ...h.opts, ultimate: Object.assign({}, ult, { noCounter: false }) });
  assert.ok(res2.strikes.some(s => s.by === 'b'));
  assert.equal(res2.strikes.filter(s => s.ultimate).length, 1);
});

test('projet : data/ultimates.json écrit et relu ; ultime introuvable refusé ; ancien projet sans fichier', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-ult-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'Jeu');
  const p = io.createProject(dir, 'Jeu', 'sample', path.join(__dirname, '..', 'assets'));
  assert.ok(fs.existsSync(path.join(dir, 'data', 'ultimates.json')));
  assert.equal(io.loadProject(dir).db.ultimates.length, 4);
  p.db.units[0].ultimate = 'absent';
  assert.throws(() => io.saveProject(dir, p), /ultime introuvable/);
  p.db.units[0].ultimate = 'ult_aurore';
  io.saveProject(dir, p);
  assert.equal(io.loadProject(dir).db.units[0].ultimate, 'ult_aurore');
  fs.unlinkSync(path.join(dir, 'data', 'ultimates.json'));
  p.db.units[0].ultimate = ''; for (const u of p.db.units) u.ultimate = '';
  io.saveProject(dir, Object.assign({}, p, { db: Object.assign({}, p.db, { ultimates: [] }) }));
  fs.unlinkSync(path.join(dir, 'data', 'ultimates.json'));
  assert.deepEqual(io.loadProject(dir).db.ultimates, []);
});
