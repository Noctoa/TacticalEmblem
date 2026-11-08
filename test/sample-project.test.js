'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const io = require('../src/main/project-io'), plugins = require('../src/main/plugins-io');
const assets = path.join(__dirname, '..', 'assets'), template = path.join(assets, 'sample-project');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('projet d’exemple Acania : données, ressources et plugins complets, sans sauvegardes de parties', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-sample-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'Mon jeu'), before = fs.readFileSync(path.join(template, 'game.tfproj'));
  const expected = read(path.join(template, 'game.tfproj'));
  const project = io.createProjectFromTemplate(dir, 'Mon nouvel exemple', template, assets);
  assert.equal(project.meta.name, 'Mon nouvel exemple');
  for (const key of ['startChapter', 'lobby', 'avatar', 'settings', 'plugins', 'title']) assert.deepEqual(project.meta[key], expected[key], key);
  for (const key of ['units', 'classes', 'chapters', 'arcs', 'tilesets'])
    assert.deepEqual(project.db[key].map(e => e.id), read(path.join(template, 'data', key + '.json')).map(e => e.id), key);
  assert.deepEqual(project.maps.map(m => m.id), expected.mapOrder);
  assert.equal(project.db.units.length, 36); assert.equal(project.db.chapters.length, 11);
  for (const unit of project.db.units) {
    if (unit.portrait) assert.ok(fs.existsSync(path.join(dir, unit.portrait)), unit.portrait);
    if (unit.mapSprite) assert.ok(project.resources.characters[unit.mapSprite], unit.mapSprite);
    if (unit.battler) assert.ok(project.resources.battlers[unit.battler], unit.battler);
    if (unit.generator) assert.ok(unit.portrait && unit.mapSprite, unit.name);
  }
  for (const cls of project.db.classes) {
    if (cls.mapSprite) assert.ok(project.resources.characters[cls.mapSprite], cls.mapSprite);
    if (cls.battler) assert.ok(project.resources.battlers[cls.battler], cls.battler);
  }
  for (const ts of project.db.tilesets) assert.ok(fs.existsSync(path.join(dir, ts.image)), ts.image);
  const installed = plugins.listInstalled(dir);
  assert.ok(installed.every(p => !p.error)); assert.equal(installed.length, Object.keys(expected.plugins).length);
  assert.ok(project.texts.files.length && fs.existsSync(path.join(dir, 'textes', 'index.json')));
  assert.equal(fs.existsSync(path.join(dir, 'saves')), false);
  assert.deepEqual(fs.readFileSync(path.join(template, 'game.tfproj')), before, 'modèle intact');
  io.saveProject(dir, project);
  assert.equal(io.loadProject(dir).db.units.length, 36);
});

test('création depuis un modèle : un dossier non vide et un modèle absent sont refusés sans écriture', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-template-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a-conserver.txt'), 'Ne pas modifier');
  assert.throws(() => io.createProjectFromTemplate(root, 'Test', template, assets), /pas vide/);
  assert.equal(fs.readFileSync(path.join(root, 'a-conserver.txt'), 'utf8'), 'Ne pas modifier');
  const absent = path.join(root, 'absent'), target = path.join(root, 'nouveau');
  assert.throws(() => io.createProjectFromTemplate(target, 'Test', absent, assets), /introuvable/);
  assert.equal(fs.existsSync(target), false);
});
