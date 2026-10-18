'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const Skills = require('../src/shared/skills');
const Defaults = require('../src/shared/defaults');
const Rules = require('../src/shared/rules');
const Campaign = require('../src/shared/campaign');
const io = require('../src/main/project-io');
function fixture() {
  const p = Defaults.sampleProject('Apprentissage'), ch = p.db.units[0];
  ch.level = 1; ch.personalSkill = 'skill_esquive'; ch.learnedSkills = []; ch.equippedSkills = [];
  const cls = p.db.classes.find(c => c.id === ch.classId);
  cls.skillLearning = [{ level: 3, skillId: 'skill_luna' }, { level: 2, skillId: 'skill_precision' }];
  const unit = Rules.makeUnitFromCharacter(ch, p.db, { x: 1, y: 1 });
  return { p, ch, cls, unit };
}
test('seuil exact : la compétence arrive au niveau prévu, une seule fois', () => {
  const { p, unit } = fixture();
  assert.deepEqual(Rules.gainExp(unit, 99, p.db, Rules.makeRng(1)), []);
  assert.deepEqual(unit.learnedSkills, []);
  const up = Rules.gainExp(unit, 1, p.db, Rules.makeRng(1));
  assert.deepEqual(up[0].learnedSkills, ['skill_precision']);
  assert.ok(unit.learnedSkills.includes('skill_precision'));
  assert.deepEqual(Rules.gainExp(unit, 1, p.db, Rules.makeRng(1)), []);
  assert.equal(unit.learnedSkills.filter(id => id === 'skill_precision').length, 1);
});
test('plusieurs niveaux et plusieurs compétences au même niveau sont acquis dans l’ordre', () => {
  const { p, cls, unit } = fixture(); cls.skillLearning.push({ level: 2, skillId: 'skill_garde' });
  const ups = Rules.gainExp(unit, 250, p.db, Rules.makeRng(3));
  assert.deepEqual(ups.map(up => up.learnedSkills), [['skill_precision', 'skill_garde'], ['skill_luna']]);
  assert.deepEqual(unit.equippedSkills, []); // L'interface traite l'équipement après chaque annonce.
  assert.deepEqual(unit.learnedSkills, ['skill_precision', 'skill_garde', 'skill_luna']);
});
test('niveau de départ élevé et ennemis : paliers déjà atteints inclus, choix explicites respectés', () => {
  const { p, ch, cls } = fixture(); ch.level = 4;
  ch.equippedSkills = ['skill_luna'];
  assert.deepEqual(Skills.validateAssignments(p.db), []);
  const unit = Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 });
  assert.deepEqual(unit.learnedSkills, ['skill_precision', 'skill_luna']);
  assert.deepEqual(unit.equippedSkills, ['skill_luna']);
  delete ch.equippedSkills;
  const ally = Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 }, 'ally');
  assert.deepEqual(ally.equippedSkills, ['skill_precision', 'skill_luna']);
  const enemy = Rules.makeEnemyFromPlacement({ id: 'enemy', classId: cls.id, level: 3, x: 1, y: 0 }, p.db);
  assert.deepEqual(enemy.learnedSkills, ['skill_precision', 'skill_luna']);
});
test('un apprentissage déjà détenu ou identique à la personnelle ne crée pas de doublon', () => {
  const { p, cls, unit } = fixture();
  cls.skillLearning.push({ level: 2, skillId: unit.personalSkill });
  unit.learnedSkills = ['skill_precision'];
  assert.deepEqual(Rules.gainExp(unit, 100, p.db, Rules.makeRng(1))[0].learnedSkills, []);
  assert.deepEqual(unit.learnedSkills, ['skill_precision']);
  assert.equal(unit.personalSkill, 'skill_esquive');
});
test('une place libre équipe sans toucher à la personnelle ; à cinq, aucun remplacement implicite', () => {
  const { p, unit } = fixture(); unit.learnedSkills = p.db.skills.map(s => s.id);
  for (const id of ['skill_precision', 'skill_garde', 'skill_offensive', 'skill_sol', 'skill_luna']) assert.equal(Skills.equipLearned(unit, id), true);
  assert.equal(Skills.equipLearned(unit, 'skill_miracle'), false);
  const old = unit.equippedSkills[1];
  assert.equal(Skills.equipLearned(unit, 'skill_miracle', 1), true);
  assert.ok(unit.learnedSkills.includes(old)); assert.equal(unit.personalSkill, 'skill_esquive');
  assert.equal(Skills.equipLearned(unit, 'skill_esquive', 0), false);
  assert.equal(Skills.equipLearned(unit, 'not-learned', 0), false);
  assert.equal(Skills.equipLearned(unit, 'skill_regeneration', 5), false);
});
test('sauvegarde de campagne : acquisition conservée et compétence refusée jamais rééquipée', () => {
  const { p, cls, unit, ch } = fixture(); Rules.gainExp(unit, 200, p.db, Rules.makeRng(1));
  Skills.equipLearned(unit, 'skill_precision'); // Luna est conservée sans équipement.
  const c = Campaign.create('classic'); Campaign.commit(c, [unit]);
  const checkpoint = Campaign.checkpoint('ch_2', c, [], {});
  const restored = Campaign.restore(checkpoint, {});
  const next = Campaign.apply(restored.campaign, Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 }), p.db);
  assert.ok(next.learnedSkills.includes('skill_luna')); assert.deepEqual(next.equippedSkills, ['skill_precision']);
  assert.deepEqual(Skills.learnThroughLevel(next, cls, p.db.skills), []);
});
test('ancienne sauvegarde à niveau élevé : rattrapage sans perte de compétences et sans remplissage forcé', () => {
  const { p, unit, ch } = fixture();
  const c = Campaign.create('classic'); unit.level = 4; Campaign.commit(c, [unit]);
  delete c.units[ch.id].learnedSkills; delete c.units[ch.id].equippedSkills;
  const next = Campaign.apply(c, Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 }), p.db);
  assert.deepEqual(next.learnedSkills, ['skill_precision', 'skill_luna']);
  assert.deepEqual(next.equippedSkills, []);
});
test('validation des programmes : anciens projets, doublons, références et niveaux invalides', () => {
  const { p, cls } = fixture();
  assert.deepEqual(Skills.validateLearning(p.db), []);
  cls.skillLearning.push({ level: 2, skillId: 'skill_precision' });
  assert.match(Skills.validateLearning(p.db).join(), /une fois/);
  cls.skillLearning = [{ level: 0, skillId: 'missing' }, { level: 1.5, skillId: 'skill_sol' }];
  assert.equal(Skills.validateLearning(p.db).length, 3);
  delete cls.skillLearning; assert.deepEqual(Skills.validateLearning(p.db), []);
});
test('programme et attribution initiale sont sauvegardés ; refus avant écriture si programme invalide', t => {
  const { p, ch, cls } = fixture(); ch.level = 3; ch.equippedSkills = ['skill_luna'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-learning-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, p);
  const loaded = io.loadProject(dir);
  assert.deepEqual(loaded.db.classes.find(c => c.id === cls.id).skillLearning, cls.skillLearning);
  assert.ok(Skills.classUsersOf(loaded.db, 'skill_luna').length > 0);
  const before = fs.readFileSync(path.join(dir, 'data/classes.json'), 'utf8');
  cls.skillLearning[0].level = -1;
  assert.throws(() => io.saveProject(dir, p), /niveau d’apprentissage/);
  assert.equal(fs.readFileSync(path.join(dir, 'data/classes.json'), 'utf8'), before);
});
