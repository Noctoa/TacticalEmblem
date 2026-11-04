'use strict';
/* Boutiques des maps de combat, dialogues de combat et zones d'événement déclenchées par un ennemi ou un allié. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Shops = require('../src/shared/battle-shops');
const Talks = require('../src/shared/battle-talks');
const Scenario = require('../src/shared/scenario');
const D = require('../src/shared/defaults');

const db = () => ({ weapons: D.weapons(), items: D.items(), units: D.characters(), classes: D.classes() });
const map = { width: 10, height: 8 };

test('boutique : case, stock avec prix, validation', () => {
  const d = db(), ch = { shops: [{ id: 's1', name: 'Armurerie', x: 2, y: 3, stock: ['w_iron_sword', 'i_vulnerary'] }], villages: [] };
  assert.deepEqual(Shops.validate(ch, d, map), []);
  assert.equal(Shops.at(ch, 2, 3).name, 'Armurerie'); assert.equal(Shops.at(ch, 3, 3), null);
  const st = Shops.stock(ch.shops[0], d);
  assert.ok(st.length >= 1 && st.every(e => e.price > 0));
  ch.shops.push({ id: 's2', x: 20, y: 0, stock: ['absent'] }, { id: 's1', x: 4, y: 4 });
  const errs = Shops.validate(ch, d, map).join(' ');
  assert.match(errs, /double/); assert.match(errs, /hors de la map/); assert.match(errs, /introuvable/);
  assert.match(Shops.validate({ shops: [{ id: 'a', x: 1, y: 1 }], villages: [{ x: 1, y: 1 }] }, d, map).join(), /même case/);
});

test('dialogues de combat : personnage précis avant générique, attaque ou combat, une fois', () => {
  const pl = { id: 'boss', battleTalks: [
    { id: 'a', with: ['c_lyn'], when: 'attack', text: 'Lyn: À nous deux !' },
    { id: 'b', with: ['c_hector', 'c_eliwood'], when: 'any', text: 'Hector: Allons-y.' },
    { id: 'g', with: [], when: 'any', text: 'Boss: Qui ose ?' }] };
  const lyn = { sourceId: 'c_lyn' }, hector = { sourceId: 'c_hector' }, oswin = { sourceId: 'c_oswin' }, done = new Set();
  assert.equal(Talks.find(pl, lyn, true, done).id, 'a');
  assert.equal(Talks.find(pl, lyn, false, done).id, 'g'); // Lyn attaquée : son dialogue « attaque » ne se joue pas
  assert.equal(Talks.find(pl, hector, false, done).id, 'b');
  assert.equal(Talks.find(pl, oswin, true, done).id, 'g');
  done.add(Talks.key(pl, Talks.find(pl, lyn, true, done), lyn));
  assert.equal(Talks.find(pl, lyn, true, done).id, 'g');
  done.add(Talks.key(pl, pl.battleTalks[2], oswin)); // la réplique générique reste disponible pour les autres
  assert.equal(Talks.find(pl, hector, true, done).id, 'b'); assert.equal(Talks.find(pl, oswin, true, done), null);
  assert.equal(Talks.find({ id: 'x' }, lyn, true, done), null);
  const d = db();
  assert.deepEqual(Talks.validate({ enemies: [pl] }, d), []);
  assert.equal(Talks.validate({ enemies: [{ id: 'e', battleTalks: [{ with: ['absent'], text: '' , when: 'x' }] }] }, d).length, 3);
});

test('zone d’événement : déclenchée par le joueur (défaut), un allié, un ennemi, une unité précise', () => {
  const ev = (who) => ({ trigger: { type: 'area', x: 1, y: 1, w: 2, h: 2, who } });
  const player = { team: 'player', sourceId: 'c_lyn', x: 1, y: 1 }, ally = { team: 'ally', sourceId: 'c_oswin', x: 2, y: 2 };
  const enemy = { team: 'enemy', sourceId: 'e7', characterId: 'c_cloud', x: 1, y: 2 }, out = { team: 'enemy', sourceId: 'e8', x: 5, y: 5 };
  const m = (who, unit) => Scenario.matches(ev(who), 'area', { unit });
  assert.equal(m(undefined, player), true); assert.equal(m(undefined, ally), true); assert.equal(m(undefined, enemy), false);
  assert.equal(m('enemy', enemy), true); assert.equal(m('enemy', player), false); assert.equal(m('enemy', out), false);
  assert.equal(m('ally', ally), true); assert.equal(m('player', ally), false); assert.equal(m('any', enemy), true);
  assert.equal(m('enemy:e7', enemy), true); assert.equal(m('enemy:e8', enemy), false);
  assert.equal(m('unit:c_cloud', enemy), true); assert.equal(m('unit:c_lyn', player), true); assert.equal(m('unit:c_lyn', ally), false);
  const ch = { id: 'c', enemies: [{ id: 'e7', x: 1, y: 2 }], events: [{ id: 'v', trigger: { type: 'area', x: 0, y: 0, who: 'enemy:e7' } }, { id: 'w', trigger: { type: 'area', x: 0, y: 0, who: 'enemy:zz' } }] };
  const errs = Scenario.validate(ch, db(), map);
  assert.equal(errs.filter(e => /déclenche la zone/.test(e)).length, 1);
});
