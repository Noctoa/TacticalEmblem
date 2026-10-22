'use strict';
/* Les invocations sont un plugin : noyau sans gacha, plugin qui s'y branche, données gardées sans lui. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const D = require('../src/shared/defaults');
const C = require('../src/shared/campaign');
const R = require('../src/shared/rules');
const L = require('../src/shared/lobby');
const Sc = require('../src/shared/scenario');
const io = require('../src/main/project-io');
const pio = require('../src/main/plugins-io');
const { loadPlugin, Extensions } = require('./fixtures/plugin-host');
const S = require('../plugins/invocations/summon.js');

// objets créés dans le contexte du plugin (vm) : comparés après passage en JSON
const j = (x) => JSON.parse(JSON.stringify(x));
const prepared = () => { const p = D.sampleProject('Jeu'); loadPlugin('invocations', { where: 'editor', project: p }); return p; };

test('le noyau seul : pas de bannière, pas d’autel, pas d’orbes dans le projet d’exemple', () => {
  Extensions.reset();
  const p = D.sampleProject('Jeu');
  assert.equal(p.db.banners, undefined);
  assert.equal(p.meta.summon, undefined);
  assert.equal(L.defaults(p.meta.lobby).summon, undefined);
  assert.ok(p.db.chapters.every(ch => ch.orbs === undefined) && p.db.talks.every(t => t.orbs === undefined));
  assert.deepEqual(j(p.meta.pluginMigrations), j(['invocations'])); // un projet neuf ne reçoit pas le plugin automatiquement
  assert.ok(!Sc.actionTypes().some(a => a.value === 'orbs'));
});

test('premier ajout du plugin : réglages, autel au puits du camp, bannières d’exemple, orbes ; une seule fois', () => {
  Extensions.reset();
  const p = prepared();
  assert.deepEqual(j(p.meta.summon), j(S.settings({})));
  assert.deepEqual(j(p.meta.lobby.summon), j({ enabled: true, x: 9, y: 7, name: 'Autel d\'invocation' }));
  assert.deepEqual(j(p.db.banners.map(b => b.id)), j(['bn_lycia', 'bn_mercs']));
  assert.equal(p.db.chapters.find(c => c.id === 'ch_1').orbs, 3);
  assert.ok(p.db.talks.every(t => t.orbs === 1));
  p.db.banners.pop(); p.db.chapters[0].orbs = 7;
  loadPlugin('invocations', { where: 'editor', project: p }); // réouverture du projet
  assert.equal(p.db.banners.length, 1); assert.equal(p.db.chapters[0].orbs, 7);
  assert.deepEqual(j(S.validate(p.db)), j([]));
  assert.deepEqual(L.validate(p.meta.lobby, p.db, p.maps), []);
});

test('jeu : orbes de départ, récompense de victoire, conversations, action d’événement, fusions', () => {
  Extensions.reset();
  const p = prepared();
  const host = loadPlugin('invocations', { where: 'game', project: p });
  const c = C.create('classic', 0);
  host.emit('campaign:new', { campaign: c }); assert.equal(c.orbs, 20);
  L.completeChapter(c, p.db.chapters.find(x => x.id === 'ch_1'));
  assert.equal(c.orbs, 23); assert.deepEqual(j(c.lastRewards), j(['+3 orbes']));
  host.emit('lobby:talk', { talk: p.db.talks[0], campaign: c, float: () => {} }); assert.equal(c.orbs, 24);
  const orbs = Sc.pluginAction('orbs');
  assert.deepEqual(j(orbs.validate({ type: 'orbs', amount: 1.5 })), j(['montant de récompense invalide.']));
  orbs.run({ type: 'orbs', amount: 6 }, { G: { campaign: c }, toast: () => {} }); assert.equal(c.orbs, 30);
  c.merges = { c_lyn: 2 };
  const lyn = p.db.units.find(u => u.id === 'c_lyn');
  const merged = C.apply(c, R.makeUnitFromCharacter(lyn, p.db, { x: 0, y: 0 }), p.db);
  assert.equal(merged.merges, 2);
  assert.equal(L.defaults(p.meta.lobby).summon.enabled, true);
  assert.ok(Extensions.list('currency').length === 1 && Extensions.list('debug').length === 1);
});

test('plugin désactivé : plus d’autel, d’orbes ni de fusions ; les données restent', () => {
  Extensions.reset();
  const p = prepared();
  loadPlugin('invocations', { where: 'game', project: p });
  Extensions.setActive([]); // désactivé dans Base de données › Plugins
  const c = C.create('classic', 0); c.merges = { c_lyn: 3 };
  L.completeChapter(c, p.db.chapters.find(x => x.id === 'ch_1'));
  assert.equal(c.orbs, undefined); assert.deepEqual(j(c.lastRewards), j([]));
  const lyn = p.db.units.find(u => u.id === 'c_lyn');
  assert.equal(C.apply(c, R.makeUnitFromCharacter(lyn, p.db, { x: 0, y: 0 }), p.db).merges, undefined);
  assert.equal(L.places().length, 0); // l'autel n'est plus un lieu du camp
  assert.equal(p.meta.lobby.summon.x, 9); // réglage gardé dans le projet
  // une action « orbes » d'un plugin absent reste valide (gardée telle quelle) ; une action inconnue sans plugin non
  const ch = JSON.parse(JSON.stringify(p.db.chapters[0])), map = p.maps.find(m => m.id === ch.mapId);
  ch.events = [{ id: 'e', trigger: { type: 'start' }, actions: [{ type: 'orbs', amount: 2, plugin: 'invocations' }] }];
  assert.deepEqual(Sc.validate(ch, p.db, map), []);
  ch.events[0].actions[0] = { type: 'orbs', amount: 2 };
  assert.match(Sc.validate(ch, p.db, map).join(), /action inconnue/);
});

test('sauvegarde : bannières dans data/banners.json, anciennes actions « orbes » rattachées au plugin', (t) => {
  Extensions.reset();
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-invoc-')), 'Jeu');
  t.after(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));
  const p = io.createProject(dir, 'Jeu', 'sample', path.join(__dirname, '..', 'assets'));
  loadPlugin('invocations', { where: 'editor', project: p });
  p.db.chapters[0].events = [{ id: 'gift', trigger: { type: 'start' }, actions: [{ type: 'orbs', amount: 3 }] }];
  io.saveProject(dir, p);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'banners.json')));
  Extensions.reset(); // relu sans le plugin chargé
  const back = io.loadProject(dir);
  assert.deepEqual(j(back.db.banners.map(b => b.id)), j(['bn_lycia', 'bn_mercs']));
  assert.equal(back.db.chapters[0].events[0].actions[0].plugin, 'invocations');
  io.saveProject(dir, back); // toujours enregistrable sans le plugin
});

test('installation du plugin fourni : scripts et feuille de style copiés dans le projet', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-invoc-inst-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const src = pio.bundledDir(path.join(__dirname, '..', 'plugins'), 'invocations');
  const r = pio.install(dir, src);
  assert.equal(r.manifest.kind, 'script');
  for (const f of ['plugin.json', 'summon.js', 'summon-panel.js', 'main.js', 'summon.css']) assert.ok(fs.existsSync(path.join(dir, 'plugins', 'invocations', f)), f);
  assert.deepEqual(j(pio.listInstalled(dir).map(m => [m.id, m.styles])), j([['invocations', ['summon.css']]]));
});
