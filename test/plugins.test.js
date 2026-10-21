'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const Plugins = require('../src/shared/plugins');
const IO = require('../src/main/plugins-io');
const D = require('../src/shared/defaults');
const P = require('../src/shared/fe-pack');

const BUNDLED = path.join(__dirname, '..', 'plugins');

test('fiches : validation, valeurs par défaut', () => {
  assert.deepEqual(Plugins.validate({ id: 'mon-plugin', name: 'Mon plugin' }), []);
  assert.ok(Plugins.validate({ id: 'Mauvais ID', name: 'x' }).length);
  assert.ok(Plugins.validate({ id: 'abc', name: '' }).length);
  assert.ok(Plugins.validate({ id: 'abc', name: 'x', scripts: ['../evil.js'] }).length);
  assert.ok(Plugins.validate({ id: 'abc', name: 'x', kind: 'autre' }).length);
  const n = Plugins.normalize({ id: 'abc', name: 'x', scripts: ['a.js'] });
  assert.equal(n.kind, 'script');
  assert.deepEqual(n.links, { characters: {}, classes: {}, battlebacks: {} });
});

test('plugins fournis : un par jeu (FE6, FE7, FE8, customs) + exemple de script, fiches valides et fichiers présents', () => {
  const list = IO.listIn(BUNDLED);
  const ids = list.map(m => m.id).sort();
  assert.deepEqual(ids, ['customs-style-gba', 'exemple-annonce-tours', 'fe6-binding-blade', 'fe7-blazing-blade', 'fe8-sacred-stones']);
  for (const m of list) {
    assert.ok(!m.error, m.id + ' : ' + m.error);
    for (const kind of ['characters', 'classes']) for (const e of Object.values(m.links[kind])) {
      if (e.portrait) assert.ok(fs.existsSync(path.join(m.dir, e.portrait)), m.id + ' ' + e.portrait);
      if (e.battler) assert.ok(fs.existsSync(path.join(m.dir, e.battler + '.json')), m.id + ' ' + e.battler);
      if (e.mapSprite) assert.ok(fs.existsSync(path.join(m.dir, e.mapSprite + '.json')), m.id + ' ' + e.mapSprite);
    }
    for (const f of Object.values(m.links.battlebacks)) assert.ok(fs.existsSync(path.join(m.dir, f)), f);
    for (const s of m.scripts) assert.ok(fs.existsSync(path.join(m.dir, s)), s);
  }
  const fe6 = list.find(m => m.id === 'fe6-binding-blade');
  assert.ok(fe6.links.characters['fe6:Roy'].battler.endsWith('Roy/combat_Lord'));
  assert.ok(Object.keys(fe6.links.battlebacks).length >= 12);
  // les personnages d'un plugin sont ceux de son jeu
  for (const m of list) for (const k of Object.keys(m.links.characters)) assert.ok(m.id.startsWith(k.split(':')[0]), m.id + ' ' + k);
});

test('installation dans un projet : ressources copiées sans écraser, fiche dans plugins/<id>, désinstallation', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-plug-')), 'Jeu');
  fs.mkdirSync(path.join(dir, 'ressources', 'fonds-combat'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ressources', 'fonds-combat', 'fe6-plaine.png'), 'à moi');
  const r = IO.install(dir, path.join(BUNDLED, 'fe6-binding-blade'));
  assert.equal(r.manifest.id, 'fe6-binding-blade');
  assert.ok(r.added > 300);
  assert.equal(fs.readFileSync(path.join(dir, 'ressources', 'fonds-combat', 'fe6-plaine.png'), 'utf8'), 'à moi'); // rien d'écrasé
  assert.ok(fs.existsSync(path.join(dir, 'ressources', 'personnages', 'Roy', 'combat_Lord.json')));
  assert.ok(fs.existsSync(path.join(dir, 'plugins', 'fe6-binding-blade', 'plugin.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'plugins', 'fe6-binding-blade', 'ressources'))); // pas de double copie
  const s = IO.install(dir, path.join(BUNDLED, 'exemple-annonce-tours'));
  assert.ok(fs.existsSync(path.join(dir, 'plugins', 'exemple-annonce-tours', 'main.js')));
  assert.equal(s.added, 0);
  assert.deepEqual(IO.listInstalled(dir).map(m => m.id).sort(), ['exemple-annonce-tours', 'fe6-binding-blade']);
  assert.equal(IO.uninstall(dir, 'exemple-annonce-tours'), true);
  assert.deepEqual(IO.listInstalled(dir).map(m => m.id), ['fe6-binding-blade']);
  assert.ok(fs.existsSync(path.join(dir, 'ressources', 'personnages', 'Roy'))); // les ressources restent
  assert.throws(() => IO.uninstall(dir, '../x'));
  // dossier sans plugin.json / fiche invalide
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-bad-'));
  assert.throws(() => IO.install(dir, bad), /plugin.json/);
  fs.writeFileSync(path.join(bad, 'plugin.json'), JSON.stringify({ id: 'X X', name: '' }));
  assert.throws(() => IO.install(dir, bad), /invalide/);
});

test('liens : classes, terrains et personnages déjà présents, champs vides seulement', () => {
  const m = IO.readManifest(path.join(BUNDLED, 'fe6-binding-blade'));
  const p = D.sampleProject('Liens');
  P.install(p.db, ['fe6'], { has: () => true }); // personnages FE6 sans images
  p.db.terrains.find(t => t.id === 'forest').battleback = 'ressources/fonds-combat/mien.png';
  const n = Plugins.applyLinks(p.db, m.links, { findUnit: (k) => P.findUnit(p.db, k) });
  assert.ok(n.classes > 0 && n.terrains >= 12 && n.units > 0, JSON.stringify(n));
  assert.equal(p.db.terrains.find(t => t.id === 'forest').battleback, 'ressources/fonds-combat/mien.png');
  const roy = p.db.units.find(u => u.name === 'Roy');
  assert.ok(roy.battler.endsWith('Roy/combat_Lord') && roy.portrait.endsWith('Roy/portrait.png'));
  const again = Plugins.applyLinks(p.db, m.links, { findUnit: (k) => P.findUnit(p.db, k) });
  assert.deepEqual(again, { classes: 0, terrains: 0, units: 0 });
  // fichiers absents : rien
  const q = D.sampleProject('Rien');
  assert.deepEqual(Plugins.applyLinks(q.db, m.links, { has: () => false }), { classes: 0, terrains: 0, units: 0 });
  // plugins actifs et liens réunis
  const meta = { plugins: { a: { enabled: false } } };
  assert.deepEqual(Plugins.enabled(meta, [{ id: 'a' }, { id: 'b' }]).map(x => x.id), ['b']);
  const merged = Plugins.mergeLinks([{ links: { classes: { archer: { battler: 'x' } } } }, { links: { classes: { archer: { battler: 'y' }, mage: { battler: 'z' } } } }]);
  assert.equal(merged.classes.archer.battler, 'x');
  assert.equal(merged.classes.mage.battler, 'z');
});
