'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const Team = require('../src/shared/team'), C = require('../src/shared/campaign'), D = require('../src/shared/defaults');
const R = require('../src/shared/rules'), P = require('../src/shared/promotions'), io = require('../src/main/project-io');
function fixture() {
  const project = D.sampleProject('Préparatifs'), db = project.db, meta = project.meta;
  meta.lobby.initialRoster = ['c_eliwood', 'c_hector'];
  const campaign = C.create('classic');
  const members = Team.sync(campaign, db, meta).map(id => C.apply(campaign, R.makeUnitFromCharacter(db.units.find(u => u.id === id), db, { x: 0, y: 0 }), db));
  return { project, db, meta, campaign, members, convoy: [{ id: 'w_iron_sword', uses: 7 }], capacity: 3 };
}
test('effectif indépendant des PNJ : personnage recruté absent de la map et PNJ non recruté', () => {
  const { db, meta, campaign } = fixture();
  meta.lobby.spots = [{ unitId: 'c_lyn', x: 2, y: 2 }];
  assert.deepEqual(Team.sync(campaign, db, meta), ['c_eliwood', 'c_hector']);
  assert.ok(!campaign.recruited.includes('c_lyn'));
  assert.ok(!campaign.recruited.includes('c_cloud'));
});
test('compatibilité : effectif de départ inféré, anciens PNJ sauvegardés exclus, chapitres déjà joués conservés', () => {
  const { db, meta } = fixture(); delete meta.lobby.initialRoster;
  const campaign = C.create('casual'); campaign.units.c_cloud = { inventory: [] };
  assert.deepEqual(Team.sync(campaign, db, meta), Team.initialIds(db, meta));
  assert.ok(!campaign.recruited.includes('c_cloud'));
  const old = C.create('classic'); old.cleared = ['ch_1'];
  assert.ok(Team.sync(old, db, meta).includes('c_cloud')); // Recrutement configuré après le prologue.
});
test('recrutement après un chapitre entier, pas au premier acte ; pertes et ajouts sans doublons', () => {
  const { db, meta, campaign } = fixture(); const cloud = db.units.find(u => u.id === 'c_cloud');
  db.arcs = [{ id: 'arc', acts: ['ch_1', 'a2'] }]; db.chapters.push({ id: 'a2', players: [] }); cloud.recruitAfter = 'arc';
  campaign.cleared = ['ch_1']; assert.ok(!Team.sync(campaign, db, meta).includes('c_cloud'));
  campaign.cleared.push('a2'); assert.ok(Team.sync(campaign, db, meta).includes('c_cloud'));
  Team.sync(campaign, db, meta); Team.recruit(campaign, ['c_cloud']); assert.equal(campaign.recruited.filter(id => id === 'c_cloud').length, 1);
  campaign.dead.push('c_cloud'); assert.ok(!Team.sync(campaign, db, meta).includes('c_cloud'));
});
test('compétences : cinq emplacements, personnelle protégée, refus des doublons et acquis conservés', () => {
  const { members, db } = fixture(), unit = members[0];
  unit.personalSkill = 'skill_precision'; unit.learnedSkills = db.skills.map(s => s.id); unit.equippedSkills = [];
  for (const [i, id] of ['skill_sol', 'skill_luna', 'skill_garde', 'skill_esquive', 'skill_miracle'].entries()) assert.ok(Team.setSkill(unit, id, i, db.skills).ok);
  const before = JSON.stringify(unit);
  for (const [id, slot] of [['skill_precision', 0], ['skill_luna', 0], ['skill_presence', 5], ['missing', 0]]) assert.equal(Team.setSkill(unit, id, slot, db.skills).ok, false);
  assert.equal(JSON.stringify(unit), before);
  assert.ok(Team.setSkill(unit, '', 0, db.skills).ok); assert.ok(unit.learnedSkills.includes('skill_sol')); assert.equal(unit.equippedSkills.length, 4);
  assert.ok(Team.setSkill(unit, 'skill_sol', 4, db.skills).ok); assert.equal(unit.personalSkill, 'skill_precision');
  unit.learnedSkills = ['skill_sol']; unit.equippedSkills = [];
  assert.equal(Team.setSkill(unit, 'skill_luna', 0, db.skills).ok, false);
});
test('transferts entre personnages et convoi : usages et nombre total d’objets inchangés', () => {
  const state = fixture(), a = state.members[0], b = state.members[1];
  const total = () => state.convoy.length + state.members.reduce((sum, u) => sum + u.inventory.length, 0);
  const count = total(), original = a.inventory[0]; original.uses = 4;
  assert.ok(Team.transfer(state, a.sourceId, b.sourceId, 0).ok);
  assert.strictEqual(b.inventory[b.inventory.length - 1], original); assert.equal(total(), count);
  assert.ok(Team.transfer(state, b.sourceId, '@convoy', b.inventory.length - 1).ok);
  assert.equal(state.convoy[state.convoy.length - 1].uses, 4); assert.equal(total(), count);
  assert.ok(Team.transfer(state, '@convoy', a.sourceId, state.convoy.length - 1).ok); assert.equal(total(), count);
});
test('inventaire plein : échec atomique, échange possible et aucune perte quand le convoi est plein', () => {
  const state = fixture(), a = state.members[0], b = state.members[1];
  b.inventory = Array.from({ length: 5 }, (_, i) => ({ id: 'i_vulnerary', uses: i + 1 }));
  let before = JSON.stringify(state.members);
  assert.equal(Team.transfer(state, a.sourceId, b.sourceId, 0).ok, false); assert.equal(JSON.stringify(state.members), before);
  const first = a.inventory[0], swapped = b.inventory[2];
  assert.ok(Team.transfer(state, a.sourceId, b.sourceId, 0, 2).ok); assert.strictEqual(a.inventory[0], swapped); assert.strictEqual(b.inventory[2], first);
  state.capacity = state.convoy.length; before = JSON.stringify(state);
  assert.equal(Team.transfer(state, a.sourceId, '@convoy', 0).ok, false); assert.equal(JSON.stringify(state), before);
  assert.ok(Team.transfer(state, a.sourceId, '@convoy', 0, 0).ok);
});
test('réorganisation et transferts invalides : pas de duplication, accès limité aux membres', () => {
  const state = fixture(), unit = state.members[0], slot = unit.inventory[1];
  assert.ok(Team.reorder(unit, 1, 0).ok); assert.strictEqual(unit.inventory[0], slot);
  const before = JSON.stringify(state);
  assert.equal(Team.reorder(unit, -1, 0).ok, false);
  assert.equal(Team.transfer(state, unit.sourceId, 'c_lyn', 0).ok, false);
  assert.equal(Team.transfer(state, '@convoy', unit.sourceId, 99).ok, false);
  assert.equal(Team.transfer(state, unit.sourceId, unit.sourceId, 0).ok, false);
  assert.equal(Team.transfer(state, '@convoy', unit.sourceId, 0, 99).ok, false);
  assert.equal(JSON.stringify(state), before);
});
test('préparatifs et promotion d’un réserviste : sauvegarde puis déploiement conservés', () => {
  const { campaign, db, meta, members, convoy } = fixture(), unit = members[1];
  unit.level = 10; unit.inventory.push({ id: 'i_master_seal', uses: 1 }); unit.learnedSkills = ['skill_sol'];
  assert.ok(Team.setSkill(unit, 'skill_sol', 0, db.skills).ok);
  assert.ok(P.apply(unit, 'great_lord', db).ok); C.commit(campaign, members);
  const save = C.checkpoint('@lobby', campaign, convoy, {}), restored = C.restore(JSON.parse(JSON.stringify(save)), {});
  assert.deepEqual(Team.sync(restored.campaign, db, meta), ['c_eliwood', 'c_hector']);
  const next = C.apply(restored.campaign, R.makeUnitFromCharacter(db.units.find(u => u.id === unit.sourceId), db, { x: 5, y: 5 }), db);
  assert.equal(next.classId, 'great_lord'); assert.equal(next.level, 1); assert.equal(next.effectiveLevel, 21);
  assert.deepEqual(next.inventory, unit.inventory); assert.deepEqual(next.equippedSkills, ['skill_sol']);
  assert.equal(next.x, 5); assert.equal(next.y, 5);
});
test('validation : ancien projet et ancienne sauvegarde, nouvelles références contrôlées avant écriture', t => {
  const { project, db, meta, campaign, members } = fixture();
  delete meta.lobby.initialRoster; assert.deepEqual(Team.validate(db, meta), []);
  C.commit(campaign, members); const save = C.checkpoint('@lobby', campaign, [], {});
  delete save.campaign.recruited; assert.doesNotThrow(() => C.restore(save, {}));
  save.campaign.recruited = ['x', 'x']; assert.throws(() => C.validate(save), /Effectif recruté invalide/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-team-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, project); const before = fs.readFileSync(path.join(dir, 'game.tfproj'), 'utf8');
  meta.lobby.initialRoster = ['missing']; assert.throws(() => io.saveProject(dir, project), /Effectif de départ/);
  assert.equal(fs.readFileSync(path.join(dir, 'game.tfproj'), 'utf8'), before);
  meta.lobby.initialRoster = ['c_hector']; db.units[0].recruitAfter = 'missing'; assert.match(Team.validate(db, meta).join(), /recrutement introuvable/);
});

test('nouveau projet vide : aucun recrutement lié aux actes supprimés de l’exemple', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-team-empty-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const project = io.createProject(dir, 'Projet vide', 'empty', path.join(__dirname, '..', 'assets'));
  assert.equal(project.db.chapters.length, 0);
  assert.deepEqual(Team.validate(project.db, project.meta), []);
  assert.ok(project.db.units.every(unit => !unit.recruitAfter));
  assert.deepEqual(Team.sync(C.create('classic'), project.db, project.meta), ['c_eliwood']);
  assert.doesNotThrow(() => io.saveProject(dir, project));
});
