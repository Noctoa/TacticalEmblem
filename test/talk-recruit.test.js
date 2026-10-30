'use strict';
/* Recrutement en combat par la conversation (« Parler ») : réglages, validation, qui peut parler à qui. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/shared/talk-recruit');
const D = require('../src/shared/defaults');

const db = D.sampleProject('Jeu').db;
const ch = () => ({ players: [{ unitId: 'c_eliwood' }, { unitId: 'c_lyn' }],
  enemies: [{ id: 'e1', name: 'Mercenaire', classId: 'mercenary', talk: { enabled: true, with: ['c_lyn'], text: '', joinAs: 'c_cloud' } }],
  allies: [{ id: 'a1', unitId: 'c_hector', talk: { enabled: true, with: [] } }] });

test('réglages : désactivé ou absent → null ; actif → liste des personnages, texte, recrue', () => {
  assert.equal(T.config({}), null);
  assert.equal(T.config({ talk: { enabled: false, joinAs: 'c_cloud' } }), null);
  assert.deepEqual(T.config(ch().enemies[0]), { with: ['c_lyn'], text: '', joinAs: 'c_cloud' });
  assert.equal(T.recruitId(ch().enemies[0], 'enemies'), 'c_cloud');
  assert.equal(T.recruitId(ch().allies[0], 'allies'), 'c_hector');
});

test('validation : recrue obligatoire et existante pour un ennemi, pas de boss, pas déjà joueur, pas soi-même', () => {
  assert.deepEqual(T.validate(ch(), db), []);
  const c1 = ch(); c1.enemies[0].talk.joinAs = ''; assert.ok(T.validate(c1, db).some(e => /choisis le personnage/.test(e)));
  const c2 = ch(); c2.enemies[0].isBoss = true; assert.ok(T.validate(c2, db).some(e => /boss/.test(e)));
  const c3 = ch(); c3.enemies[0].talk.joinAs = 'c_lyn'; assert.ok(T.validate(c3, db).some(e => /déjà une unité du joueur/.test(e)));
  const c4 = ch(); c4.allies[0].talk.with = ['c_hector']; assert.ok(T.validate(c4, db).some(e => /lui-même/.test(e)));
  const c5 = ch(); c5.enemies[0].talk.with = ['inconnu']; assert.ok(T.validate(c5, db).some(e => /introuvable/.test(e)));
  const c6 = ch(); c6.enemies[0].talk = { enabled: false }; assert.deepEqual(T.validate(c6, db), [], 'désactivé : rien à vérifier');
});

test('qui peut parler : adjacent, personnage autorisé, une seule fois, unités du joueur seulement', () => {
  const lyn = { team: 'player', sourceId: 'c_lyn', x: 5, y: 5, hp: 10 }, eli = { team: 'player', sourceId: 'c_eliwood', x: 4, y: 4, hp: 10 };
  const merc = { team: 'enemy', name: 'Mercenaire', x: 5, y: 4, hp: 5, talk: T.config(ch().enemies[0]) };
  const hector = { team: 'ally', name: 'Hector', x: 4, y: 5, hp: 5, talk: T.config(ch().allies[0]) };
  const far = { team: 'enemy', name: 'Loin', x: 9, y: 9, hp: 5, talk: T.config(ch().enemies[0]) };
  const units = [lyn, eli, merc, hector, far];
  assert.deepEqual(T.partners(units, lyn).map(u => u.name), ['Mercenaire', 'Hector']);
  assert.deepEqual(T.partners(units, eli).map(u => u.name), ['Hector'], 'Eliwood ne peut pas parler au mercenaire (réservé à Lyn)');
  merc.talked = true; assert.deepEqual(T.partners(units, lyn).map(u => u.name), ['Hector']);
  assert.deepEqual(T.partners(units, merc), [], 'un ennemi ne parle pas');
  assert.match(T.defaultText({ name: 'Lyn' }, { name: 'Cloud' }), /^Lyn: .*\nCloud: /);
});
