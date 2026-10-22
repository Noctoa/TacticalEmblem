'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const S = require('../src/shared/statuses'), R = require('../src/shared/rules'), K = require('../src/shared/skills');
const C = require('../src/shared/campaign'), D = require('../src/shared/defaults'), Events = require('../src/shared/scenario'), Trade = require('../src/shared/battle-trade'), io = require('../src/main/project-io');
function fixture() {
  const db = { skills: K.presets(), items: [], classes: [{ id: 'fighter', moveType: 'foot', weapons: ['sword', 'anima', 'staff'] }], weapons: [
    { id: 'sword', name: 'Épée', type: 'sword', might: 1, hit: 200, weight: 0, crit: 0, uses: 20, minRange: 1, maxRange: 1 },
    { id: 'magic', name: 'Feu', type: 'anima', might: 1, hit: 200, weight: 0, crit: 0, uses: 20, minRange: 1, maxRange: 2 },
    { id: 'staff', name: 'Soin', type: 'staff', uses: 10, heal: 10, minRange: 1, maxRange: 1 },
    { id: 'restore', name: 'Rétablissement', type: 'staff', uses: 10, restore: 'all', minRange: 1, maxRange: 1 }
  ] };
  const unit = (uid, team, x) => ({ uid, sourceId: uid, name: uid, classId: 'fighter', team, level: 1, exp: 0, x, y: 1, mov: 5, moveType: 'foot', ai: 'aggressive', hp: 31,
    stats: { hp: 31, str: 4, mag: 4, skl: 0, spd: 5, lck: 0, def: 0, res: 0 }, inventory: [{ id: 'sword', uses: 20 }], personalSkill: '', learnedSkills: [], equippedSkills: [], done: false });
  const a = unit('a', 'player', 1), b = unit('b', 'enemy', 2), friend = unit('friend', 'player', 0);
  const ctx = { width: 6, height: 4, terrainAt: () => ({ cost: { foot: 1 } }), unitAt: (x, y) => [a, b, friend].find(u => u.x === x && u.y === y) };
  const opts = { db, settings: { trueHit: false, overkill: false }, ctx, terrainOf: () => null, units: [a, b, friend], rng: () => .5 };
  return { db, a, b, friend, ctx, opts };
}
test('altérations : coexistence, renouvellement sans cumul, durée invalide et soins ciblés', () => {
  const { a } = fixture(); assert.equal(S.apply(a, 'unknown', 2), null); assert.equal(S.apply(a, 'poison', 0), null);
  assert.ok(S.apply(a, 'poison', 3)); assert.equal(S.apply(a, 'poison', 2), null); assert.equal(S.apply(a, 'poison', 3), null);
  assert.equal(S.apply(a, 'poison', 5).refreshed, true); S.apply(a, 'sleep', 1); S.apply(a, 'silence', 2);
  assert.equal(S.list(a).length, 3); assert.equal(S.cure(a, 'poison').length, 1); assert.equal(S.canAct(a), false);
  assert.equal(S.cure(a, 'all').length, 2); assert.equal(S.canAct(a), true);
  a.hp = 0; assert.equal(S.apply(a, 'poison', 3), null);
});
test('poison : 10 % arrondi supérieur, non létal, protection debug et aucune activation sur un mort', () => {
  const { a } = fixture(); S.apply(a, 'poison', 3); assert.equal(S.beginPhase([a])[0].damage, 4); assert.equal(a.hp, 27);
  a.hp = 2; S.beginPhase([a]); assert.equal(a.hp, 1); S.beginPhase([a]); assert.equal(a.hp, 1);
  a.hp = 10; S.beginPhase([a], () => true); assert.equal(a.hp, 10); a.dead = true; assert.equal(S.beginPhase([a]).length, 0);
});
test('durée : trois phases complètes, application en cours de phase et rafraîchissement', () => {
  const { a } = fixture(); S.beginPhase([a]); S.apply(a, 'sleep', 2); S.endPhase([a]); assert.equal(a.statuses.sleep.turns, 2);
  S.beginPhase([a]); assert.equal(S.canAct(a), false); S.endPhase([a]); assert.equal(a.statuses.sleep.turns, 1);
  S.beginPhase([a]); S.apply(a, 'sleep', 3); S.endPhase([a]); assert.equal(a.statuses.sleep.turns, 2);
  S.beginPhase([a]); S.endPhase([a]); S.beginPhase([a]); assert.equal(S.endPhase([a])[0].status.id, 'sleep'); assert.equal(S.canAct(a), true);
});
test('sommeil : déplacement, riposte, menace, IA et échange bloqués ; partenaire endormi accessible', () => {
  const { a, b, friend, db, ctx, opts } = fixture(); S.apply(b, 'sleep', 2);
  assert.equal(R.reachable(b, ctx).size, 1); assert.equal(R.threatTiles(b, ctx, db).size, 0); assert.equal(R.planEnemy(b, [a], opts), null);
  assert.equal(R.forecast(a, 0, b, opts).def, null); assert.throws(() => R.forecast(b, 0, a, opts), /inutilisable/);
  const state = { units: [a, friend], mode: 'chapter', phase: 'player' }; S.apply(a, 'sleep', 1);
  assert.equal(Trade.available(state, a, friend), false); assert.equal(Trade.available(state, friend, a), true);
});
test('silence : tomes, armes physiques magiques et bâtons bloqués ; arme physique de secours conservée', () => {
  const { a, db } = fixture(); db.weapons.push({ ...db.weapons[0], id: 'magic_sword', magic: true });
  a.inventory = ['magic', 'magic_sword', 'staff', 'sword'].map(id => ({ id, uses: 10 })); S.apply(a, 'silence', 2);
  const before = JSON.stringify(a.stats); assert.equal(R.equipped(a, db).weapon.id, 'sword'); assert.equal(R.attackWeapons(a, db).length, 1); assert.equal(R.staves(a, db).length, 0); assert.equal(JSON.stringify(a.stats), before);
  S.cure(a, 'silence'); assert.equal(R.equipped(a, db).weapon.id, 'magic');
});
test('arme à altération : coup réussi sur une cible survivante, pas de hasard en prévision', () => {
  const { a, b, db, opts } = fixture(); db.weapons[0].inflict = { id: 'poison', turns: 3, chance: 100 };
  const before = JSON.stringify([a, b]); const fc = R.forecast(a, 0, b, { ...opts, rng: () => { throw new Error('Pas de hasard'); } });
  assert.equal(fc.att.statusInflict[0].chance, 100); assert.equal(JSON.stringify([a, b]), before);
  const result = R.resolveCombat(a, 0, b, opts); assert.equal(S.active(b, 'poison'), true); assert.equal(result.strikes[0].statuses[0].id, 'poison'); assert.equal(a.inventory[0].uses, 19);
});
test('raté, chance nulle, cible vaincue et overkill : aucune altération supplémentaire', () => {
  for (const mode of ['miss', 'chance0', 'dead']) {
    const { a, b, db, opts } = fixture(); db.weapons[0].inflict = { id: 'sleep', turns: 3, chance: mode === 'chance0' ? 0 : 100 };
    if (mode === 'miss') db.weapons[0].hit = 0;
    if (mode === 'dead') { b.hp = 1; a.stats.spd = 20; opts.settings.overkill = true; }
    R.resolveCombat(a, 0, b, opts); assert.equal(S.active(b, 'sleep'), false);
  }
});
test('sommeil ou silence infligé pendant le combat supprime la riposte concernée, sans réveil au coup suivant', () => {
  for (const id of ['sleep', 'silence']) {
    const { a, b, db, opts } = fixture(); b.inventory[0].id = 'magic'; a.stats.spd = 15; db.weapons[0].inflict = { id, turns: 3, chance: 100 };
    assert.ok(R.forecast(a, 0, b, opts).def); const res = R.resolveCombat(a, 0, b, opts);
    assert.equal(res.strikes.some(s => s.by === b.uid), false); assert.equal(res.strikes.filter(s => s.by === a.uid).length, 2); assert.equal(S.active(b, id), true);
  }
});
test('Vantage peut endormir l’attaquant avant son coup ; silence ne bloque pas la riposte physique', () => {
  const f = fixture(); f.b.personalSkill = 'skill_vantage'; f.b.hp = 15; f.db.weapons.push({ ...f.db.weapons[0], id: 'sleep_blade', inflict: { id: 'sleep', turns: 1, chance: 100 } }); f.b.inventory[0].id = 'sleep_blade';
  const res = R.resolveCombat(f.a, 0, f.b, f.opts); assert.equal(res.strikes.length, 1); assert.equal(res.strikes[0].by, f.b.uid);
  const g = fixture(); g.db.weapons[0].inflict = { id: 'silence', turns: 1, chance: 100 }; assert.ok(R.resolveCombat(g.a, 0, g.b, g.opts).strikes.some(s => s.by === g.b.uid));
});
test('compétence personnelle/équipée : conditions respectées, réserve inactive et association avec le poison d’arme', () => {
  const { a, b, db, opts } = fixture(), skill = { ...K.create('inflictStatus'), id: 'venom', statusId: 'sleep', chance: 100, phase: 'initiate' }; db.skills.push(skill);
  a.learnedSkills = ['venom']; assert.equal(R.forecast(a, 0, b, opts).att.statusInflict.length, 0); a.equippedSkills = ['venom'];
  db.weapons[0].inflict = { id: 'poison', turns: 3, chance: 100 };
  assert.equal(R.forecast(a, 0, b, opts).att.statusInflict.length, 2); const res = R.resolveCombat(a, 0, b, opts); assert.equal(S.list(b).length, 2); assert.ok(res.strikes[0].skills.some(s => s.id === 'venom'));
  assert.equal(K.validate({ ...skill, statusTurns: 0 }).length > 0, true);
});
test('rétablissement : cible à tous ses PV acceptée, unité saine et porteur silencieux refusés', () => {
  const { a, friend, db } = fixture(), restore = db.weapons.find(w => w.id === 'restore');
  assert.equal(R.staffCanTarget(a, friend, restore), false); S.apply(friend, 'sleep', 2); assert.equal(R.staffCanTarget(a, friend, restore), true);
  S.apply(a, 'silence', 2); assert.equal(R.staffCanTarget(a, friend, restore), false); S.cure(a, 'all');
  friend.done = true; S.cure(friend, 'all'); assert.equal(friend.done, true); assert.equal(R.staffCanTarget(a, friend, restore), false);
});
test('condition de PV évaluée avant le coup, même si Sol soigne le porteur ensuite', () => {
  const { a, b, db, opts } = fixture();
  const skill = { ...K.create('inflictStatus'), id: 'low_hp_status', statusId: 'sleep', chance: 100, hpCondition: 'below', hpThreshold: 50 };
  db.skills.push(skill); db.skills.find(s => s.id === 'skill_sol').activation = 'always';
  a.hp = 15; a.learnedSkills = ['low_hp_status', 'skill_sol']; a.equippedSkills = [...a.learnedSkills]; b.inventory = [];
  R.resolveCombat(a, 0, b, opts); assert.ok(a.hp > 15.5); assert.equal(S.active(b, 'sleep'), true);
});
test('événements : application et soin sur une cible présente, références et validation', async () => {
  const p = D.sampleProject('Altérations'), db = p.db, ch = db.chapters[0], map = p.maps.find(m => m.id === ch.mapId); ch.events = [];
  const target = 'unit:' + ch.players[0].unitId, action = { type: 'status', target, statusId: 'sleep', turns: 2, remove: false };
  ch.events.push({ id: 's', trigger: { type: 'start' }, actions: [action] }); assert.deepEqual(Events.validate(ch, db, map), []); assert.equal(Events.references(db, 'units', ch.players[0].unitId).length, 1);
  const unit = R.makeUnitFromCharacter(db.units.find(u => u.id === ch.players[0].unitId), db, ch.players[0]), context = { self: {}, Statuses: S, UI: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/scenario-runtime.js'), 'utf8'), context);
  const runtime = context.self.ScenarioRuntime.create({ G: { units: [unit] }, R, float: () => {} }); await runtime.action(action, {}); assert.equal(S.active(unit, 'sleep'), true);
  await runtime.action({ ...action, remove: true, statusId: 'all' }, {}); assert.equal(S.list(unit).length, 0); await runtime.action({ ...action, target: 'unit:absent' }, {});
  action.turns = 0; assert.ok(Events.validate(ch, db, map).length);
});
test('exemples et sauvegardes : validation avant écriture, aucun statut conservé dans la campagne', t => {
  const p = D.sampleProject('Altérations'), examples = S.examples(); p.db.weapons.push(...examples.weapons); p.db.items.push(...examples.items); assert.deepEqual(S.validateDefinitions(p.db), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-status-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); io.saveProject(dir, p);
  const before = fs.readFileSync(path.join(dir, 'data/weapons.json'), 'utf8'); examples.weapons[0].inflict.turns = 0; assert.throws(() => io.saveProject(dir, p), /altération d’arme invalide/); assert.equal(fs.readFileSync(path.join(dir, 'data/weapons.json'), 'utf8'), before);
  const unit = R.makeUnitFromCharacter(p.db.units[0], p.db, { x: 0, y: 0 }), campaign = C.create('classic'); S.apply(unit, 'poison', 3); C.commit(campaign, [unit]); assert.equal(campaign.units[unit.sourceId].statuses, undefined);
  const next = C.apply(campaign, R.makeUnitFromCharacter(p.db.units[0], p.db, { x: 0, y: 0 }), p.db); assert.equal(S.list(next).length, 0);
});
