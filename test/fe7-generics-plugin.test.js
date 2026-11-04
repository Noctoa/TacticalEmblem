'use strict';
// Plugin « Fire Emblem 7 — Unités génériques » : fiche valide, liens vers des fichiers présents, installation et
// liens posés sur les classes d'exemple et sur les classes FE7 du pack de classes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const D = require('../src/shared/defaults');
const P = require('../src/shared/plugins');
const FC = require('../src/shared/fe-classes');
const io = require('../src/main/project-io');
const pio = require('../src/main/plugins-io');

const ROOT = path.join(__dirname, '..', 'plugins');
const ID = 'fe7-unites-generiques';

test('fiche et liens : chaque image reliée existe dans le plugin', () => {
  const m = pio.listIn(ROOT).find(p => p.id === ID);
  assert.ok(m && !m.error, 'plugin listé');
  const dir = pio.bundledDir(ROOT, ID);
  const l = P.normalize(m).links;
  assert.ok(Object.keys(l.classes).length >= 80);
  for (const group of ['classes', 'characters']) {
    for (const [key, a] of Object.entries(l[group])) {
      for (const f of ['battler', 'mapSprite', 'portrait']) {
        if (!a[f]) continue;
        const file = path.join(dir, a[f] + (f === 'portrait' ? '' : '.json'));
        assert.ok(fs.existsSync(file), `${key}.${f} → ${a[f]}`);
        if (f !== 'portrait') assert.ok(fs.existsSync(file.replace(/\.json$/, '.png')), a[f] + '.png');
      }
    }
  }
  // cases d'étiquettes remplacées : plus de case « Attacking » dans l'attaque du nomade
  const nomad = JSON.parse(fs.readFileSync(path.join(dir, 'ressources/personnages/Nomad/combat_FE7.json'), 'utf8'));
  assert.ok(!nomad.anims.attack.frames.includes(1));
});

test('installation : ressources copiées, sprites reliés aux classes vides (exemple et FE7)', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-g7-')), 'Jeu');
  io.createProject(dir, 'Jeu', 'sample', path.join(__dirname, '..', 'assets'));
  const r = pio.install(dir, pio.bundledDir(ROOT, ID));
  assert.ok(r.added > 100);
  const p = io.loadProject(dir);
  FC.install(p.db, ['fe7']);
  for (const c of p.db.classes) if (/^fe7_/.test(c.id)) { c.battler = ''; c.mapSprite = ''; }
  const n = P.applyLinks(p.db, r.manifest.links, { has: P.hasIn(p.resources) });
  assert.ok(n.classes > 60, String(n.classes));
  const by = id => p.db.classes.find(c => c.id === id);
  assert.equal(by('fe7_soldier').battler, 'ressources/personnages/Soldier/combat_FE7');
  assert.equal(by('fe7_sniper_f').battler, 'ressources/personnages/Sniper/combat_FE7Female');
  assert.equal(by('fe7_mage_f').mapSprite, 'ressources/personnages/Mage/map_FE7Female');
  assert.equal(by('fe7_pirate').mapSprite, 'ressources/personnages/Pirate/map_FE7');
  assert.equal(by('fe7_wyvern_lord_m').mapSprite, 'ressources/personnages/Wyvern Lord/map_FE7');
  assert.equal(by('fe7_swordmaster_f').mapSprite, 'ressources/personnages/Swordmaster/map_FE7Female');
  assert.equal(by('fe7_dancer').mapSprite, 'ressources/personnages/Dancer/map_FE7');
  // une classe qui avait déjà ses sprites les garde
  assert.equal(by('brigand').battler, 'ressources/personnages/Brigand/combat');
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
