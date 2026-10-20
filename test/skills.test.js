'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Skills = require('../src/shared/skills');
const Defaults = require('../src/shared/defaults');
const io = require('../src/main/project-io');

function temporaryProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, Defaults.sampleProject('Compétences'));
  return dir;
}
test('les onze exemples sont valides et indépendants entre projets', () => {
  const a = Defaults.sampleProject('A'), b = Defaults.sampleProject('B');
  assert.equal(a.db.skills.length, 11);
  assert.deepEqual(Skills.validateAll(a.db.skills), []);
  a.db.skills[0].amount = 77;
  assert.equal(b.db.skills[0].amount, 10);
});
test('sauvegarde et rechargement conservent tous les réglages et les autres données', t => {
  const dir = temporaryProject(t), p = io.loadProject(dir);
  const s = Object.assign(Skills.create('sol'), { id: 'custom', name: 'Soleil', icon: '☀', amount: 35,
    activation: 'fixed', chance: 25, phase: 'initiate', hpCondition: 'below', hpThreshold: 40,
    weaponType: 'sword', adjacentAlly: true, description: 'Une compétence personnalisée.' });
  p.db.skills.push(s); io.saveProject(dir, p);
  const loaded = io.loadProject(dir);
  assert.deepEqual(loaded.db.skills.at(-1), s);
  assert.deepEqual(loaded.db.units, p.db.units);
  assert.deepEqual(loaded.maps, p.maps);
});
test('ancien projet sans catalogue : ouverture et réenregistrement sans ajout imposé', t => {
  const dir = temporaryProject(t), file = path.join(dir, 'data', 'skills.json');
  fs.unlinkSync(file);
  const loaded = io.loadProject(dir);
  assert.deepEqual(loaded.db.skills, []);
  // Le projet simulé précède aussi les apprentissages de classe et le Voleur fourni ensuite.
  for (const cls of loaded.db.classes) delete cls.skillLearning;
  io.saveProject(dir, loaded);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
});
test('catalogue corrompu : erreur explicite et fichier conservé', t => {
  const dir = temporaryProject(t), file = path.join(dir, 'data', 'skills.json');
  for (const content of ['{broken', '{}', '[null]']) {
    fs.writeFileSync(file, content, 'utf8');
    assert.throws(() => io.loadProject(dir), /skills.json/);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  }
});
test('réglages invalides : sauvegarde refusée avant toute écriture du projet', t => {
  const dir = temporaryProject(t), p = io.loadProject(dir);
  const before = fs.readFileSync(path.join(dir, 'game.tfproj'), 'utf8');
  p.meta.name = 'Ne doit pas être enregistré'; p.db.skills[0].amount = 999;
  assert.throws(() => io.saveProject(dir, p), /Précision/);
  assert.equal(fs.readFileSync(path.join(dir, 'game.tfproj'), 'utf8'), before);
  assert.equal(io.loadProject(dir).db.skills[0].amount, 10);
  p.db.skills[0].amount = 10; p.db.skills.push(p.db.skills[0]);
  assert.throws(() => io.saveProject(dir, p), /identifiant déjà utilisé/);
});
test('résumé : seuil inclusif, conditions et probabilité fixe sans tirage de hasard', () => {
  const s = Object.assign(Skills.create('sol'), { amount: 35, phase: 'defend', hpCondition: 'below', hpThreshold: 40,
    activation: 'fixed', chance: 25, weaponType: 'sword', adjacentAlly: true });
  const text = Skills.describe(s);
  for (const part of ['35 %', 'PV réellement', 'l’ennemi engage', '≤ 40 %', 'épée', 'allié adjacent', '25 % par coup']) assert.ok(text.includes(part), part);
});
