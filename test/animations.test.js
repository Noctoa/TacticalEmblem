'use strict';
/* Animations d'attaque : exemples, choix de l'animation d'une attaque, interpolation, validation, sauvegarde. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const A = require('../src/shared/animations');
const D = require('../src/shared/defaults');
const io = require('../src/main/project-io');

const ASSETS = path.join(__dirname, '..', 'assets');

test('exemples : valides, planches présentes dans les ressources par défaut, reliés aux types d’arme et à Luna / Sol', () => {
  const p = D.sampleProject('Jeu');
  assert.deepEqual(A.validateAll(p.db.animations), []);
  assert.deepEqual(A.validateLinks(p.db, p.meta), []);
  for (const img of A.images(p.db.animations)) assert.ok(fs.existsSync(path.join(ASSETS, 'default', img)), img);
  assert.equal(p.meta.animationDefaults.anima, 'anim_fire');
  assert.equal(p.db.skills.find(s => s.id === 'skill_luna').animation, 'anim_luna');
  assert.ok(p.meta.pluginMigrations.includes('animations'));
  // Feu : projectile, puis l'explosion sur la cible
  assert.deepEqual(A.chain(p.db.animations, 'anim_fire').map(a => a.id), ['anim_fire', 'anim_fire_hit']);
});

test('animation d’une attaque : compétence > critique > arme > type d’arme ; « aucune »', () => {
  const p = D.sampleProject('Jeu'), db = p.db, meta = p.meta;
  const sword = Object.assign({}, db.weapons.find(w => w.id === 'w_iron_sword'));
  assert.equal(A.forAttack(db, meta, sword), 'anim_slash'); // type d'arme
  sword.animation = 'anim_smash';
  assert.equal(A.forAttack(db, meta, sword), 'anim_smash');
  sword.critAnimation = 'anim_thunder';
  assert.equal(A.forAttack(db, meta, sword, { crit: true }), 'anim_thunder');
  assert.equal(A.forAttack(db, meta, sword, { crit: true, skills: [{ id: 'skill_luna' }] }), 'anim_luna'); // compétence déclenchée
  assert.equal(A.forAttack(db, meta, sword, { skills: [{ id: 'skill_precision' }] }), 'anim_smash'); // sans animation : celle de l'arme
  sword.animation = 'none';
  assert.equal(A.forAttack(db, meta, sword), '');
  sword.animation = 'anim_absente';
  assert.equal(A.forAttack(db, meta, sword), 'anim_slash');
  assert.equal(A.forAttack(db, meta, null), '');
  assert.equal(A.forAttack(db, {}, Object.assign({}, sword, { animation: '' })), '');
});

test('temps : images, projectile qui boucle pendant son trajet', () => {
  const p = D.sampleProject('Jeu');
  const slash = A.byId(p.db.animations, 'anim_slash'), fire = A.byId(p.db.animations, 'anim_fire');
  assert.equal(A.duration(slash), slash.frames.length * slash.speed);
  assert.equal(A.frameIndex(slash, 10 * slash.speed + 5), slash.frames.length - 1);
  assert.equal(A.duration(fire), fire.travel);
  assert.equal(A.frameIndex(fire, fire.speed * fire.frames.length + 1), 0); // boucle
});

test('interpolation entre deux images (cellule i ↔ cellule i)', () => {
  const a = Object.assign(A.create('normal'), { id: 'a' });
  const c = A.cell('ressources/animations/x.png', [0, 0, 10, 10]);
  a.frames = [{ cells: [Object.assign({}, c, { x: 0, opacity: 100 })] }, { cells: [] }, { cells: [] }, { cells: [Object.assign({}, c, { x: 90, opacity: 40 })] }];
  assert.ok(A.interpolate(a, 0, 3));
  assert.deepEqual(a.frames.map(f => f.cells[0].x), [0, 30, 60, 90]);
  assert.deepEqual(a.frames.map(f => f.cells[0].opacity), [100, 80, 60, 40]);
  assert.equal(A.interpolate(a, 0, 1), false); // rien entre deux images voisines
});

test('validation : champs, enchaînement en boucle, références, suppression', () => {
  const p = D.sampleProject('Jeu'), list = p.db.animations;
  const bad = Object.assign(A.create('projectile'), { id: 'x', travel: 10, speed: 5, frames: [{ cells: [{ image: '../hors.png', rect: [0, 0, 1, 1] }] }] });
  const errs = A.validate(bad, list).join('\n');
  assert.match(errs, /trajet/); assert.match(errs, /durée d'une image/); assert.match(errs, /image de cellule invalide/);
  const a1 = Object.assign(A.create('normal'), { id: 'b1', next: 'b2' }), a2 = Object.assign(A.create('normal'), { id: 'b2', next: 'b1' });
  assert.match(A.validateAll([a1, a2]).join(), /boucle/);
  assert.match(A.validateAll([Object.assign(A.create('normal'), { id: 'c', next: 'absente' })]).join(), /introuvable/);
  p.db.weapons[0].animation = 'absente';
  assert.match(A.validateLinks(p.db, p.meta).join(), /Épée de fer/);
  p.db.weapons[0].animation = 'anim_fire_hit';
  assert.ok(A.usersOf(p.db, p.meta, 'anim_fire_hit').some(u => /Feu/.test(u)) && A.usersOf(p.db, p.meta, 'anim_fire_hit').some(u => /Épée de fer/.test(u)));
  A.forget(p.db, p.meta, 'anim_fire_hit');
  assert.equal(p.db.weapons[0].animation, ''); assert.equal(A.byId(list, 'anim_fire').next, '');
  A.forget(p.db, p.meta, 'anim_slash');
  assert.equal(p.meta.animationDefaults.sword, '');
});

test('projet : data/animations.json écrit et relu, planches copiées ; un ancien projet s’ouvre sans animations', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-anims-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'Jeu');
  const p = io.createProject(dir, 'Jeu', 'sample', ASSETS);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'animations.json')));
  assert.ok(p.resources.animations.length > 100 && p.resources.animations.every(f => f.startsWith('ressources/animations/')));
  assert.equal(p.db.animations.length, A.samples().length);
  p.db.weapons[0].animation = 'absente';
  assert.throws(() => io.saveProject(dir, p), /animation introuvable/);
  p.db.weapons[0].animation = 'anim_pierce';
  io.saveProject(dir, p);
  assert.equal(io.loadProject(dir).db.weapons[0].animation, 'anim_pierce');
  fs.unlinkSync(path.join(dir, 'data', 'animations.json'));
  const old = io.loadProject(dir);
  assert.deepEqual(old.db.animations, []);
});
