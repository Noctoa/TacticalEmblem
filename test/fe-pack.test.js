'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/shared/fe-pack');
const D = require('../src/shared/defaults');
const R = require('../src/shared/rules');
const S = require('../src/shared/summon');
const Pr = require('../src/shared/promotions');
const Team = require('../src/shared/team');

const all = () => P.GAMES.map(g => g.id);

test('chaque jeu : 10 à 17 personnages, noms uniques, classes et armes connues', () => {
  const classes = P.classCatalogue().map(c => c.id), weapons = D.weapons().map(w => w.id);
  for (const g of P.GAMES) {
    assert.ok(g.characters.length >= 10 && g.characters.length <= 17, g.id);
    assert.equal(new Set(g.characters.map(r => r[0])).size, g.characters.length, g.id + ' doublon');
    for (const [name, classId, level, rarity, gender, growths, inv] of g.characters) {
      assert.ok(classes.includes(classId), `${name} : classe ${classId}`);
      assert.ok([3, 4, 5].includes(rarity) && level >= 1 && ['h', 'f'].includes(gender), name);
      assert.equal(growths.split(' ').length, 8, name);
      for (const id of inv) assert.ok(weapons.includes(id), `${name} : arme ${id}`);
    }
  }
  assert.ok(P.total() > 150);
});

test('installation dans le projet d’exemple : classes, personnages, bannières ; base valide', () => {
  const p = D.sampleProject('Pack'), before = p.db.units.length;
  const res = P.install(p.db, all());
  assert.equal(p.db.units.length, before + res.units);
  assert.equal(res.units, P.total() - 3); // Eliwood, Lyn et Hector sont déjà dans l'exemple
  assert.equal(res.banners, P.GAMES.length);
  assert.deepEqual(S.validate(p.db), []);
  assert.deepEqual(Pr.validate(p.db), []);
  assert.deepEqual(Team.validate(p.db, p.meta), []);
  assert.equal(new Set(p.db.units.map(u => u.id)).size, p.db.units.length);
  const fe7 = p.db.banners.find(b => b.id === 'bn_fe7');
  assert.deepEqual(fe7.focus, ['c_eliwood', 'c_lyn', 'c_hector']); // les fiches existantes sont reprises
  for (const u of p.db.units.filter(x => x.fromPack)) {
    const unit = R.makeUnitFromCharacter(u, p.db, { x: 0, y: 0 });
    assert.ok(unit.stats.hp >= 10 && R.STATS.every(k => unit.stats[k] >= 0), u.name);
    const cls = p.db.classes.find(c => c.id === u.classId);
    for (const slot of u.inventory) { // chaque arme de départ est maniable par la classe
      const w = p.db.weapons.find(x => x.id === slot.id);
      if (w) assert.ok(cls.weapons.includes(w.type), `${u.name} (${cls.name}) ne manie pas ${w.name}`);
    }
    assert.ok(cls.dance || u.inventory.length, u.name + ' sans rien');
  }
  assert.ok(p.db.classes.find(c => c.id === 'fe_myrmidon').promotions.some(x => x.classId === 'fe_swordmaster'));
});

test('réinstaller ne duplique rien ; un projet vide reçoit aussi les classes de base utilisées', () => {
  const p = D.sampleProject('Pack');
  P.install(p.db, ['fe9']);
  assert.deepEqual(P.install(p.db, ['fe9']), { units: 0, classes: 0, banners: 0, art: 0 });
  const empty = D.emptyDatabase();
  empty.classes = empty.classes.filter(c => !['paladin', 'pegasus'].includes(c.id));
  const res = P.install(empty, ['fe1']);
  assert.ok(empty.classes.some(c => c.id === 'paladin') && empty.classes.some(c => c.id === 'pegasus'));
  assert.equal(res.units, 16);
  assert.deepEqual(Pr.validate(empty), []);
});

test('aperçu : personnages déjà présents comptés par jeu', () => {
  const p = D.sampleProject('Pack');
  assert.equal(P.summary(p.db).find(g => g.id === 'fe7').already, 3);
  P.install(p.db, ['fe13']);
  const s = P.summary(p.db).find(g => g.id === 'fe13');
  assert.equal(s.already, s.total);
});

test('couleur des pierres : danseuses incolores, épées rouges', () => {
  const p = D.sampleProject('Pack'); P.install(p.db, ['fe13']);
  const by = n => p.db.units.find(u => u.name === n);
  assert.equal(S.colorOf(by('Olivia'), p.db).id, 'colorless');
  assert.equal(S.colorOf(by('Chrom'), p.db).id, 'red');
  assert.equal(S.colorOf(by('Tharja'), p.db).id, 'green');
});

test('images du pack : Eliwood, Lyn et Hector (ressources de base), les autres viennent des plugins installés', () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..', 'assets', 'default');
  for (const a of Object.values(P.ART)) {
    assert.ok(fs.existsSync(path.join(root, a.portrait)), a.portrait);
    assert.ok(fs.existsSync(path.join(root, a.battler + '.json')), a.battler);
    assert.ok(fs.existsSync(path.join(root, a.mapSprite + '.json')), a.mapSprite);
  }
  assert.deepEqual(P.artFolders(['fe7', 'fe6']).map(f => f.folder), ['Eliwood', 'Lyn', 'Hector']);
  const p = D.sampleProject('Pack');
  p.db.units = p.db.units.filter(u => !['c_eliwood', 'c_lyn', 'c_hector'].includes(u.id));
  const res = P.install(p.db, ['fe7'], { has: () => true });
  const eli = p.db.units.find(u => u.name === 'Eliwood' && u.fromPack === 'fe7');
  assert.equal(eli.portrait, 'ressources/personnages/Eliwood/portrait.png');
  assert.equal(eli.battler, ''); // déjà donnée par la classe Seigneur
  assert.equal(eli.mapSprite, ''); // idem : la classe garde la main (promotion → sprite de Chevalier-Seigneur)
  assert.ok(res.art >= 3);
  assert.equal(p.db.units.find(u => u.name === 'Ninian').portrait, ''); // pas de plugin : pas d'image
  // avec les liens d'un plugin : Ninian et les classes reçoivent leurs images
  const art = { characters: { 'fe7:Ninian': { portrait: 'ressources/personnages/Ninian/portrait.png' } }, classes: { fe_dancer: { battler: 'ressources/personnages/Dancer/combat_FE7' } } };
  const q = D.sampleProject('Pack2');
  P.install(q.db, ['fe7'], { has: () => true, art });
  assert.equal(q.db.units.find(u => u.name === 'Ninian').portrait, 'ressources/personnages/Ninian/portrait.png');
  assert.equal(q.db.classes.find(c => c.id === 'fe_dancer').battler, 'ressources/personnages/Dancer/combat_FE7');
  assert.equal(P.findUnit(q.db, 'fe7:Ninian').name, 'Ninian');
  // ressource absente du projet : rien n'est relié
  const r = D.sampleProject('Pack3');
  r.db.units = r.db.units.filter(u => u.id !== 'c_lyn');
  P.install(r.db, ['fe7'], { has: () => false, art });
  assert.equal(r.db.units.find(u => u.name === 'Lyn').portrait, '');
});

test('Xarrin a son propre sprite de map (pose unique, .json complet)', () => {
  const fs = require('fs'), path = require('path');
  const x = D.characters().find(u => u.id === 'c_xarrin');
  assert.equal(x.mapSprite, 'ressources/personnages/Xarrin/map_Lord');
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'default', x.mapSprite + '.json'), 'utf8'));
  assert.equal(meta.type, 'mapsprite');
  assert.deepEqual(meta.frame, [64, 64]);
  assert.equal(meta.base, 32);
  for (const a of ['idle', 'left', 'right', 'down', 'up', 'focus']) assert.ok(meta.anims[a], a);
  assert.ok(meta.teamColors.length);
});
