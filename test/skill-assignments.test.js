'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const Skills = require('../src/shared/skills');
const Defaults = require('../src/shared/defaults');
const Rules = require('../src/shared/rules');
const Campaign = require('../src/shared/campaign');
const io = require('../src/main/project-io');
const ids = ['esquive', 'offensive', 'garde', 'presence', 'regeneration', 'luna'].map(id => 'skill_' + id);
const assign = u => Object.assign(u, { personalSkill: 'skill_precision', learnedSkills: ids.slice(), equippedSkills: ids.slice(0, 5) });

test('une personnelle plus cinq équipées et six apprises est une attribution valide', () => {
  const p = Defaults.sampleProject('Test'), u = assign(p.db.units[0]);
  assert.deepEqual(Skills.validateAssignments(p.db), []);
  const active = Skills.assigned(u, p.db.skills);
  assert.equal(active.length, 6); assert.equal(active[0].origin, 'personal');
  assert.equal(active.filter(entry => entry.origin === 'equipped').length, 5);
  assert.ok(!active.some(entry => entry.id === ids[5]));
});
test('six équipées, doublon, personnelle en emplacement et compétence non apprise sont refusés', () => {
  const catalogue = Skills.presets();
  for (const equippedSkills of [ids.slice(), [ids[0], ids[0]], ['skill_precision'], ['skill_sol']]) {
    const u = assign({}); u.equippedSkills = equippedSkills;
    assert.ok(Skills.validateAssignment(u, catalogue).length > 0);
  }
  assert.ok(Skills.validateAssignment({ learnedSkills: {} }, catalogue).length > 0);
});
test('les unités joueur et alliées reçoivent des listes indépendantes de la fiche du personnage', () => {
  const p = Defaults.sampleProject('Test'), ch = assign(p.db.units[0]);
  const a = Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 });
  const b = Rules.makeUnitFromCharacter(ch, p.db, { x: 1, y: 0 }, 'ally');
  assert.equal(a.personalSkill, ch.personalSkill); assert.deepEqual(b.equippedSkills, ids.slice(0, 5));
  a.learnedSkills.pop(); a.equippedSkills.pop();
  assert.equal(ch.learnedSkills.length, 6); assert.equal(b.equippedSkills.length, 5);
});
test('lecture défensive : ignore les références disparues, sans modifier les données originales', () => {
  const u = { personalSkill: 'skill_precision', learnedSkills: ['missing', ids[0], ids[0]], equippedSkills: [ids[0], ids[0], 'missing', 'skill_precision'] };
  const before = JSON.stringify(u), set = Skills.loadout(u, Skills.presets());
  assert.deepEqual(set, { personalSkill: 'skill_precision', learnedSkills: [ids[0]], equippedSkills: [ids[0]] });
  assert.equal(JSON.stringify(u), before);
});
test('les anciennes fiches sans compétences restent valides et donnent une attribution vide', () => {
  assert.deepEqual(Skills.validateAssignment({}, []), []);
  assert.deepEqual(Skills.loadout({}, []), { personalSkill: '', learnedSkills: [], equippedSkills: [] });
});
test('campagne : personnelle et équipement persistants, checkpoint indépendant et anciennes sauvegardes', () => {
  const p = Defaults.sampleProject('Test'), ch = assign(p.db.units[0]);
  const u = Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 });
  const c = Campaign.create('classic'); Campaign.commit(c, [u]);
  const save = Campaign.checkpoint('ch_2', c, [], {}); Campaign.validate(save);
  u.equippedSkills.pop(); u.personalSkill = '';
  const restored = Campaign.restore(save, {});
  const next = Campaign.apply(restored.campaign, Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 }), p.db);
  assert.equal(next.personalSkill, 'skill_precision'); assert.equal(next.equippedSkills.length, 5);
  const legacy = Campaign.create('classic');
  legacy.units[ch.id] = { classId: ch.classId, stats: ch.stats, inventory: [] };
  const fromLegacy = Campaign.apply(legacy, Rules.makeUnitFromCharacter(ch, p.db, { x: 0, y: 0 }), p.db);
  assert.equal(fromLegacy.personalSkill, 'skill_precision'); assert.equal(fromLegacy.equippedSkills.length, 5);
  save.campaign.units[ch.id].equippedSkills = ids.slice();
  assert.throws(() => Campaign.validate(save), /cinq/);
});
test('projet : conservation des attributions et refus des références manquantes avant écriture', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-assignment-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = Defaults.sampleProject('Test'); assign(p.db.units[0]); io.saveProject(dir, p);
  const loaded = io.loadProject(dir);
  assert.deepEqual(Skills.loadout(loaded.db.units[0], loaded.db.skills), Skills.loadout(p.db.units[0], p.db.skills));
  const before = fs.readFileSync(path.join(dir, 'data/units.json'), 'utf8');
  loaded.db.skills = loaded.db.skills.filter(s => s.id !== 'skill_precision');
  assert.throws(() => io.saveProject(dir, loaded), /personnelle introuvable/);
  assert.equal(fs.readFileSync(path.join(dir, 'data/units.json'), 'utf8'), before);
});
test('la suppression tient compte des personnelles, du répertoire et de l’équipement', () => {
  const db = { units: [{ id: 'a', personalSkill: ids[0] }, { id: 'b', learnedSkills: [ids[0]] }, { id: 'c', equippedSkills: [ids[0]] }, { id: 'd' }] };
  assert.deepEqual(Skills.usersOf(db, ids[0]).map(u => u.id), ['a', 'b', 'c']);
});
