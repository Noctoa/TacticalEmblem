'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const P = require('../src/shared/promotions'), R = require('../src/shared/rules'), S = require('../src/shared/skills');
const D = require('../src/shared/defaults'), C = require('../src/shared/campaign'), io = require('../src/main/project-io');
function fixture() {
  const project = D.sampleProject('Promotions'), db = project.db;
  const ch = db.units.find(u => u.id === 'c_cloud'); ch.level = 10;
  ch.personalSkill = 'skill_precision'; ch.learnedSkills = ['skill_sol']; ch.equippedSkills = ['skill_sol'];
  const unit = R.makeUnitFromCharacter(ch, db, { x: 2, y: 2 }); unit.hp -= 7; unit.exp = 42;
  const cls = db.classes.find(c => c.id === ch.classId), target = db.classes.find(c => c.id === 'hero');
  cls.promotions[0].skills = ['skill_luna', 'skill_sol'];
  target.skillLearning = [{ level: 1, skillId: 'skill_garde' }, { level: 5, skillId: 'skill_miracle' }];
  return { project, db, ch, unit, cls, target };
}
test('démonstration : branches partagées, recrue et anciennes destinations lues sans mutation', () => {
  const db = D.sampleProject().db;
  assert.deepEqual(P.validate(db), []);
  assert.deepEqual(P.branches(db.classes.find(c => c.id === 'cavalier'), db).map(r => r.classId), ['paladin', 'great_knight']);
  assert.ok(P.branches(db.classes.find(c => c.id === 'knight'), db).some(r => r.classId === 'great_knight'));
  const legacy = { id: 'old', name: 'Ancienne classe', base: { hp: 10 }, promotesTo: 'hero' }, before = JSON.stringify(legacy);
  const row = P.branches(legacy, db)[0];
  assert.equal(row.classId, 'hero'); assert.equal(row.itemId, ''); assert.equal(row.minLevel, 10);
  assert.equal(JSON.stringify(legacy), before);
  legacy.promotions = []; assert.deepEqual(P.branches(legacy, db), []);
});
test('niveau et objet requis : pas de mutation, pas de consommation si promotion refusée', () => {
  const { db, unit } = fixture(); unit.level = 9;
  let before = JSON.stringify(unit);
  assert.equal(P.options(unit, db)[0].available, false);
  assert.match(P.apply(unit, 'hero', db).error, /Niveau 10/); assert.equal(JSON.stringify(unit), before);
  unit.level = 10; unit.inventory = unit.inventory.filter(s => s.id !== 'i_master_seal'); before = JSON.stringify(unit);
  assert.match(P.apply(unit, 'hero', db).error, /Objet requis/); assert.equal(JSON.stringify(unit), before);
});
test('prévision sans mutation et promotion : stats, PV manquants, déplacement, acquis et objet', () => {
  const { db, ch, unit, target } = fixture();
  const before = JSON.stringify(unit), oldStats = { ...unit.stats }, growths = { ...unit.growths };
  const option = P.options(unit, db)[0], preview = P.preview(unit, option, db);
  assert.equal(JSON.stringify(unit), before);
  const result = P.apply(unit, 'hero', db);
  assert.equal(result.ok, true); assert.equal(unit.classId, 'hero'); assert.equal(unit.level, 1); assert.equal(unit.exp, 0);
  assert.deepEqual(unit.stats, preview.stats); assert.equal(unit.stats.hp - unit.hp, 7);
  assert.ok(unit.stats.str >= oldStats.str); assert.equal(unit.mov, target.mov); assert.deepEqual(unit.growths, growths);
  assert.equal(unit.mapSprite, ch.mapSprite); assert.equal(unit.battler, ch.battler); // Apparence propre à Cloud.
  assert.equal(unit.personalSkill, 'skill_precision'); assert.deepEqual(unit.equippedSkills, ['skill_sol']);
  assert.deepEqual(result.learnedSkills, ['skill_luna', 'skill_garde']); assert.ok(!unit.learnedSkills.includes('skill_miracle'));
  assert.equal(unit.learnedSkills.filter(id => id === 'skill_sol').length, 1);
  assert.ok(!unit.inventory.some(slot => slot.id === 'i_master_seal')); assert.ok(unit.inventory.some(slot => slot.id === 'w_wind_sword'));
});
test('héritage de l’apparence, bonus de déplacement antérieurs et usages de l’objet conservés', () => {
  const { db, ch, unit, target, cls } = fixture(); ch.mapSprite = ''; ch.battler = '';
  target.mapSprite = 'new-map'; target.battler = 'new-battle';
  unit.mov += 2; cls.promotions[0].bonuses.mov = 1;
  const slot = unit.inventory.find(slot => slot.id === 'i_master_seal'); slot.uses = 3;
  assert.equal(P.apply(unit, 'hero', db).ok, true);
  assert.equal(unit.mov, target.mov + 3); assert.equal(unit.mapSprite, 'new-map'); assert.equal(unit.battler, 'new-battle');
  assert.equal(unit.inventory.find(slot => slot.id === 'i_master_seal').uses, 2);
});
test('plafonds : gains limités sans perte des statistiques déjà supérieures au plafond', () => {
  const { db, unit, target, cls } = fixture(); unit.stats.str = 30; target.caps.str = 20;
  unit.stats.def = 19; target.caps.def = 20; cls.promotions[0].bonuses.def = 5;
  const result = P.apply(unit, 'hero', db); assert.equal(result.ok, true);
  assert.equal(unit.stats.str, 30); assert.equal(result.gains.str, 0); assert.equal(unit.stats.def, 20); assert.equal(result.gains.def, 1);
});
test('niveau conservé, branches sans objet et apprentissage des paliers déjà atteints', () => {
  const { db, unit, cls } = fixture(); const row = cls.promotions[0]; row.itemId = ''; row.resetLevel = false;
  const result = P.apply(unit, 'hero', db);
  assert.equal(result.ok, true); assert.equal(unit.level, 10); assert.equal(unit.exp, 42);
  assert.ok(result.learnedSkills.includes('skill_miracle')); assert.ok(unit.inventory.some(s => s.id === 'i_master_seal'));
});
test('niveau effectif : promotions successives et gains d’expérience sans retour artificiel au niveau 1', () => {
  const { db, unit, cls, target } = fixture(); cls.promotions[0].itemId = '';
  const result = P.apply(unit, 'hero', db); assert.equal(result.ok, true); assert.equal(unit.effectiveLevel, 21);
  R.gainExp(unit, 100, db, R.makeRng(1)); assert.equal(unit.level, 2); assert.equal(unit.effectiveLevel, 22);
  const veteran = { ...unit, level: 22, effectiveLevel: undefined, classId: 'mercenary' }, foe = { ...unit, level: 10, effectiveLevel: undefined, classId: 'mercenary' };
  assert.equal(R.combatExp(unit, foe, true, false, db), R.combatExp(veteran, foe, true, false, db));
  assert.equal(R.staffExp(unit, db), 10);
  const final = { ...target, id: 'final', tier: 3, promotions: [] }; db.classes.push(final);
  target.promotions = [{ ...P.create(target, final), minLevel: 2 }];
  assert.equal(P.apply(unit, 'final', db).ok, true); assert.equal(unit.effectiveLevel, 41);
});
test('branche forcée, mauvais objet, unité vaincue et double promotion sont refusés', () => {
  const { db, unit } = fixture(); const before = JSON.stringify(unit);
  assert.equal(P.apply(unit, 'paladin', db).ok, false); assert.equal(P.apply(unit, 'hero', db, 0).ok, false);
  assert.equal(JSON.stringify(unit), before);
  unit.hp = 0; assert.equal(P.apply(unit, 'hero', db).ok, false); unit.hp = 10;
  assert.equal(P.apply(unit, 'hero', db).ok, true); const after = JSON.stringify(unit);
  assert.equal(P.apply(unit, 'hero', db).ok, false); assert.equal(JSON.stringify(unit), after);
});
test('validation des cycles, doublons, références, bonus et sauvegarde avant toute écriture', t => {
  const { db, project, cls, target } = fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-promotions-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, project); const before = fs.readFileSync(path.join(dir, 'data/classes.json'), 'utf8');
  target.promotions = [P.create(target, cls)]; assert.match(P.validate(db).join(), /Cycle/);
  assert.throws(() => io.saveProject(dir, project), /Cycle/); assert.equal(fs.readFileSync(path.join(dir, 'data/classes.json'), 'utf8'), before);
  target.promotions = []; cls.promotions.push({ ...cls.promotions[0] }); assert.match(P.validate(db).join(), /double/);
  cls.promotions = [{ classId: 'missing', minLevel: 0, resetLevel: 'yes', itemId: 'i_vulnerary', bonuses: { hp: -1 }, skills: ['missing'] }];
  assert.equal(P.validate(db).length, 6);
});
test('campagne : classe, niveau effectif, stats, objets et compétences restaurés au chapitre suivant', () => {
  const { db, unit, ch } = fixture(); assert.equal(P.apply(unit, 'hero', db).ok, true);
  S.equipLearned(unit, 'skill_luna'); const campaign = C.create('classic'); C.commit(campaign, [unit]);
  const checkpoint = C.checkpoint('ch2', campaign, [], {}), restored = C.restore(checkpoint, {}).campaign;
  const next = C.apply(restored, R.makeUnitFromCharacter(ch, db, { x: 0, y: 0 }), db);
  assert.equal(next.classId, 'hero'); assert.equal(next.level, 1); assert.equal(next.effectiveLevel, unit.effectiveLevel);
  assert.deepEqual(next.stats, unit.stats); assert.deepEqual(next.inventory, unit.inventory); assert.deepEqual(next.equippedSkills, unit.equippedSkills);
  assert.deepEqual(S.learnThroughLevel(next, db.classes.find(c => c.id === 'hero'), db.skills, ch), []);
});
test('références protégées et round-trip des branches', t => {
  const { db, project, cls } = fixture();
  assert.ok(P.usersOf(db, 'classes', 'hero').includes(cls)); assert.ok(P.usersOf(db, 'items', 'i_master_seal').includes(cls)); assert.ok(P.usersOf(db, 'skills', 'skill_luna').includes(cls));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-promotion-io-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, project); assert.deepEqual(io.loadProject(dir).db.classes.find(c => c.id === cls.id).promotions, cls.promotions);
});
test('Grand chevalier : efficacité montée et blindée indépendante du déplacement', () => {
  const { db, unit } = fixture(); unit.classId = 'great_knight'; unit.moveType = 'horse';
  const attacker = { ...unit, uid: 'enemy', team: 'enemy', x: 3, inventory: [{ id: 'w_iron_sword', uses: 10 }] };
  const weapon = db.weapons.find(w => w.id === 'w_iron_sword'), opts = { db, terrainOf: () => null };
  weapon.effective = ['armor']; assert.equal(R.forecast(attacker, 0, unit, opts).att.effective, true);
  weapon.effective = ['horse']; assert.equal(R.forecast(attacker, 0, unit, opts).att.effective, true);
  weapon.effective = ['flier']; assert.equal(R.forecast(attacker, 0, unit, opts).att.effective, false);
});
