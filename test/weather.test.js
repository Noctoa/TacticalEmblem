'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const W = require('../src/shared/weather'), D = require('../src/shared/defaults');
const E = require('../src/shared/scenario'), C = require('../src/shared/campaign'), io = require('../src/main/project-io');

test('météo : aucun effet dans les anciens actes, valeurs par défaut et libellés', () => {
  assert.deepEqual(W.normalize(), { type: 'none', intensity: 2, direction: 'right', tactical: false });
  assert.equal(W.normalize({ type: 'unknown', intensity: 99 }).type, 'none');
  assert.equal(W.normalize({ type: 'fog' }).intensity, 2);
  assert.equal(W.label({ type: 'snow', intensity: 3 }), 'Neige · forte');
  assert.deepEqual(W.validate(undefined), []);
});

test('météo : trois types et trois intensités, vent contrôlé et données invalides refusées', () => {
  for (const type of ['none', 'fog', 'sand', 'snow']) for (const intensity of [1, 2, 3]) for (const direction of ['left', 'right']) {
    assert.deepEqual(W.validate({ type, intensity, direction }), []);
  }
  for (const v of [null, [], 'fog', {}, { type: 'rain' }, { type: 'fog', intensity: 0 }, { type: 'fog', intensity: '2' },
    { type: 'fog', direction: 'north' }]) assert.ok(W.validate(v).length, JSON.stringify(v));
});

test('projet : météo par acte sauvegardée, validation avant toute écriture', t => {
  const p = D.sampleProject('Météo'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-weather-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ch = p.db.chapters[0]; ch.weather = { type: 'sand', intensity: 3, direction: 'left' };
  io.saveProject(dir, p);
  const disk = io.loadProject(dir); assert.deepEqual(disk.db.chapters[0].weather, ch.weather);
  assert.equal(disk.db.chapters[1].weather, undefined);
  const meta = fs.readFileSync(path.join(dir, 'game.tfproj'), 'utf8');
  const data = fs.readFileSync(path.join(dir, 'data/chapters.json'), 'utf8');
  ch.weather.type = 'invalid'; assert.throws(() => io.saveProject(dir, p), /Météo/);
  assert.equal(fs.readFileSync(path.join(dir, 'game.tfproj'), 'utf8'), meta);
  assert.equal(fs.readFileSync(path.join(dir, 'data/chapters.json'), 'utf8'), data);
});

test('événements : changement et arrêt de météo, données mal formées refusées', () => {
  const p = D.sampleProject('Météo'), ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
  assert.ok(E.actionTypes().some(t => t.value === 'weather'));
  const action = { type: 'weather', weather: { type: 'snow', intensity: 3, direction: 'right' } };
  ch.events = [{ id: 'storm', trigger: { type: 'turn', turn: 2 }, actions: [action] }];
  assert.deepEqual(E.validate(ch, p.db, map), []);
  action.weather = { type: 'none' }; assert.deepEqual(E.validate(ch, p.db, map), []);
  delete action.weather; assert.ok(E.validate(ch, p.db, map).some(e => /météo manquante/.test(e)));
  action.weather = { type: 'snow', intensity: 4 }; assert.ok(E.validate(ch, p.db, map).some(e => /intensité/.test(e)));
});

test('runtime : la météo est locale à la tentative et ne modifie ni unités ni définition d’acte', async () => {
  const G = { chapter: { weather: { type: 'fog', intensity: 1 } }, units: [{ hp: 15, x: 2, y: 3 }] };
  const before = JSON.stringify(G), context = { self: {}, Weather: W };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/scenario-runtime.js'), 'utf8'), context);
  const runtime = context.self.ScenarioRuntime.create({ G, R: {} });
  await runtime.action({ type: 'weather', weather: { type: 'sand', intensity: 3, direction: 'left' } }, {});
  assert.equal(G.weather.type, 'sand');
  const { weather, ...unchanged } = G; assert.equal(JSON.stringify(unchanged), before);
  await runtime.action({ type: 'weather', weather: { type: 'none' } }, {}); assert.equal(G.weather.type, 'none');
});

test('sauvegarde : masquer la météo est optionnel et doit être un booléen', () => {
  const save = C.checkpoint('ch1', C.create('classic'), [], {});
  assert.doesNotThrow(() => C.validate(save));
  save.weatherEffects = false; assert.doesNotThrow(() => C.validate(save));
  save.weatherEffects = true; assert.doesNotThrow(() => C.validate(save));
  save.weatherEffects = 'false'; assert.throws(() => C.validate(save), /météo/);
});
