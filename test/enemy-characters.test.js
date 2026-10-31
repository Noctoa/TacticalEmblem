'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = require('../src/shared/rules'), D = require('../src/shared/defaults'), C = require('../src/shared/campaign');
const Mission = require('../src/shared/mission'), Scenario = require('../src/shared/scenario'), IO = require('../src/main/project-io');
function fixture() {
  const p = D.sampleProject('Adversaires'), db = p.db, c = db.units.find(u => u.id === 'c_lyn');
  c.level = 7; c.stats.hp = 33; c.stats.str = 14; c.movBonus = 1;
  c.inventory = [{ id: 'w_iron_sword', uses: 9 }];
  const placement = { id: 'enemy_lyn', unitId: c.id, classId: 'brigand', level: 1, x: 4, y: 3, ai: 'stationary', isBoss: true, appearTurn: 3 };
  return { p, db, c, placement };
}
test('personnage ennemi : fiche actuelle, stats, niveau, équipement, portrait et sprites', () => {
  const { db, c, placement } = fixture(), u = R.makeEnemyFromPlacement(placement, db);
  assert.equal(u.team, 'enemy'); assert.equal(u.name, c.name); assert.equal(u.level, 7); assert.equal(u.classId, c.classId);
  assert.equal(u.stats.hp, 33); assert.equal(u.stats.str, 14); assert.equal(u.hp, 33);
  assert.equal(u.mov, db.classes.find(k => k.id === c.classId).mov + 1);
  assert.deepEqual(u.inventory, [{ id: 'w_iron_sword', uses: 9 }]); assert.equal(u.portrait, c.portrait);
  assert.equal(u.mapSprite, c.mapSprite || db.classes.find(k => k.id === c.classId).mapSprite || '');
  assert.equal(u.battler, c.battler || db.classes.find(k => k.id === c.classId).battler || '');
  assert.equal(u.isBoss, true); assert.equal(u.isLord, false); assert.equal(u.convoy, false); assert.equal(u.ai, 'stationary'); assert.equal(u.appearTurn, 3);
});
test('copies ennemies indépendantes de la fiche et entre elles', () => {
  const { db, c, placement } = fixture(), before = JSON.stringify(c);
  const a = R.makeEnemyFromPlacement(placement, db), b = R.makeEnemyFromPlacement({ ...placement, id: 'clone' }, db);
  a.stats.hp = 1; a.inventory[0].uses = 1; a.growths.hp = 0; a.learnedSkills.push('extra');
  assert.equal(JSON.stringify(c), before); assert.equal(b.stats.hp, 33); assert.equal(b.inventory[0].uses, 9);
  assert.notEqual(a.uid, b.uid); assert.notEqual(a.sourceId, b.sourceId);
});
test('compétences personnelles, équipement et apprentissages du personnage hérités', () => {
  const { db, c, placement } = fixture();
  c.personalSkill = db.skills[0].id; c.learnedSkills = [db.skills[1].id]; c.equippedSkills = [db.skills[1].id];
  c.skillLearning = [{ level: 5, skillId: db.skills[2].id }];
  const u = R.makeEnemyFromPlacement(placement, db);
  assert.equal(u.personalSkill, c.personalSkill); assert.ok(u.learnedSkills.includes(db.skills[2].id)); assert.ok(u.equippedSkills.includes(db.skills[1].id));
  assert.equal(u.ultimate, c.ultimate || '');
});
test('surcharges locales : nom, bonus, inventaire, couleurs, pillage et renfort', () => {
  const { db, c, placement } = fixture();
  const u = R.makeEnemyFromPlacement({ ...placement, name: 'Lyn adverse', statBonus: { hp: 4, str: 2 }, inventory: [{ id: 'w_iron_axe', uses: 12 }], colors: 'team', pillageVillages: false }, db);
  assert.equal(u.name, 'Lyn adverse'); assert.equal(u.stats.hp, 37); assert.equal(u.stats.str, 16); assert.equal(c.stats.hp, 33);
  assert.deepEqual(u.inventory, [{ id: 'w_iron_axe', uses: 12 }]); assert.equal(u.colorsOverride, 'team'); assert.equal(u.pillageVillages, false);
  c.inventory = []; assert.deepEqual(R.makeEnemyFromPlacement(placement, db).inventory, []);
});
test('identités : objectifs et événements ciblent le placement ; aucune mort dans la campagne du joueur', () => {
  const { db, c, placement } = fixture(), enemy = R.makeEnemyFromPlacement(placement, db);
  assert.equal(enemy.characterId, c.id); assert.equal(enemy.sourceId, placement.id);
  const player = R.makeUnitFromCharacter(c, db, { x: 0, y: 0 });
  const campaign = C.create('classic'); enemy.dead = true; enemy.hp = 0;
  C.commit(campaign, [player, enemy]); assert.deepEqual(campaign.dead, []); assert.ok(campaign.units[c.id]); assert.equal(campaign.units[placement.id], undefined);
  const ch = { objective: { type: 'target', target: placement.id }, requiredUnits: [], players: [{ unitId: c.id }], enemies: [placement] };
  assert.equal(Mission.evaluate(ch, db, { units: [player, enemy] }).outcome, 'victory');
  assert.equal(Scenario.matches({ trigger: { type: 'death', target: placement.id } }, 'death', { unit: enemy }), true);
  assert.equal(Scenario.matches({ trigger: { type: 'death', target: 'unit:' + c.id } }, 'death', { unit: enemy }), false);
});
test('fiche modifiée après placement : classe actuelle, traversée de l’eau et renfort événementiel', () => {
  const { db, c, placement } = fixture(); c.classId = 'brigand'; placement.classId = 'ancienne_classe'; placement.eventOnly = true;
  const u = R.makeEnemyFromPlacement(placement, db); assert.equal(u.classId, 'brigand'); assert.equal(u.crossWater, true);
  const ch = { enemies: [placement], players: [], requiredUnits: [], events: [{ id: 'spawn', trigger: { type: 'start' }, actions: [{ type: 'reinforcement', target: placement.id }] }] };
  assert.deepEqual(Scenario.validate(ch, db, { width: 20, height: 20 }), []);
});
test('anciens ennemis génériques inchangés ; références cassées refusées', () => {
  const { db } = fixture(), generic = R.makeEnemyFromPlacement({ id: 'old', classId: 'brigand', level: 3, x: 1, y: 1 }, db);
  assert.deepEqual(generic.stats, R.statsFromClass(db.classes.find(c => c.id === 'brigand'), 3)); assert.equal(generic.characterId, undefined);
  const ch = { enemies: [{ id: 'bad', unitId: 'missing', classId: 'brigand' }] };
  assert.ok(R.validateEnemyCharacters(ch, db).length); assert.equal(R.makeEnemyFromPlacement(ch.enemies[0], db), null);
});
test('projet : aller-retour du personnage ennemi et refus avant écriture d’une référence cassée', () => {
  const { p, db, placement } = fixture(); db.chapters[0].enemies.push(placement);
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-enemy-character-')), 'Jeu'); IO.saveProject(dir, p);
  assert.equal(IO.loadProject(dir).db.chapters[0].enemies.at(-1).unitId, placement.unitId);
  placement.unitId = 'missing'; assert.throws(() => IO.saveProject(dir, p), /personnage ennemi introuvable/);
  assert.notEqual(IO.loadProject(dir).db.chapters[0].enemies.at(-1).unitId, 'missing');
});
