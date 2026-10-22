'use strict';
/* Écran titre : lecture du texte des crédits et réglages par défaut (title-screen.js, chargé comme dans le jeu). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const D = require('../src/shared/defaults');

const ctx = { self: {}, UI: { h: () => null } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/title-screen.js'), 'utf8'), ctx);
const T = ctx.self.TitleScreen;
const j = (x) => JSON.parse(JSON.stringify(x));

test('crédits : titres « … : », lignes « Rôle : Nom », texte libre, blocs séparés par une ligne vide', () => {
  assert.deepEqual(j(T.parseCredits('\n\nGraphismes :\nSprites : Lexou, Grim & Bonzai\nUn grand merci\n\nMusiques:\nTitre : « L\'aube » : Yuka\n\n')), [
    { kind: 'heading', text: 'Graphismes' },
    { kind: 'role', role: 'Sprites', name: 'Lexou, Grim & Bonzai' },
    { kind: 'text', text: 'Un grand merci' },
    { kind: 'gap' },
    { kind: 'heading', text: 'Musiques' },
    { kind: 'role', role: 'Titre', name: '« L\'aube » : Yuka' }
  ]);
  assert.deepEqual(j(T.parseCredits('')), []);
  assert.deepEqual(j(T.parseCredits('http://exemple.fr')), [{ kind: 'text', text: 'http://exemple.fr' }]); // « : » sans espaces : pas un rôle
});

test('réglages : valeurs par défaut, projet d’exemple avec sous-titre et crédits', () => {
  assert.deepEqual(j(T.settings({})), { subtitle: '', background: '', music: '', newGameMode: 'classic' });
  const p = D.sampleProject('Jeu');
  assert.equal(T.settings(p.meta).subtitle, 'Les héros de Varenne');
  const lines = T.parseCredits(p.meta.credits);
  assert.ok(lines.some(l => l.kind === 'heading' && l.text === 'Graphismes'));
  assert.ok(lines.some(l => l.kind === 'role' && l.name === 'Lexou, Grim & Bonzai'));
});
