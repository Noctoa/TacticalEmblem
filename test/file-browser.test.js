'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const files = require('../src/main/file-browser.js');

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-fb-'));
  const w = (rel, data = 'x') => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
  w('Château Bleu.png'); w('notes.txt'); w('.cache.png'); w('b/Forêt d’été.PNG'); w('b/c/Château Rouge.webp'); w('node_modules/x/Château.png'); w('a/vide.gif');
  return root;
}

test('list : dossiers puis images, fichiers cachés et autres extensions ignorés', () => {
  const root = tree();
  const r = files.list(root, files.IMAGE_EXTS);
  assert.deepStrictEqual(r.entries.map(e => e.name), ['a', 'b', 'node_modules', 'Château Bleu.png']);
  assert.ok(r.entries[0].dir && !r.entries[3].dir);
  assert.strictEqual(r.parent, path.dirname(root));
});

test('search : sans accents ni casse, tous les mots, sous-dossiers (pas node_modules)', () => {
  const root = tree();
  const names = (q) => files.search(root, q, files.IMAGE_EXTS).results.map(e => e.name).sort();
  assert.deepStrictEqual(names('chateau'), ['Château Bleu.png', 'Château Rouge.webp']);
  assert.deepStrictEqual(names('ROUGE chat'), ['Château Rouge.webp']);
  assert.deepStrictEqual(names('foret ete'), ['Forêt d’été.PNG']);
  assert.deepStrictEqual(names('  '), []);
  const lim = files.search(root, 'a', files.IMAGE_EXTS, { max: 1 });
  assert.strictEqual(lim.results.length, 1); assert.ok(lim.truncated);
  assert.deepStrictEqual(files.search(root, 'rouge', files.IMAGE_EXTS, { depth: 1 }).results, []);
});

test('copyInto : nom nettoyé et unique, pas de copie si déjà dans le dossier', () => {
  const root = tree(), proj = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-fbp-'));
  const a = files.copyInto(proj, path.join(root, 'Château Bleu.png'), 'ressources/tilesets');
  const b = files.copyInto(proj, path.join(root, 'Château Bleu.png'), 'ressources/tilesets');
  assert.strictEqual(a, 'ressources/tilesets/Château_Bleu.png');
  assert.strictEqual(b, 'ressources/tilesets/Château_Bleu_1.png');
  assert.strictEqual(files.copyInto(proj, path.join(proj, a), 'ressources/tilesets'), a);
  assert.throws(() => files.copyInto(proj, path.join(root, 'absent.png'), 'ressources/tilesets'));
});

test('places : raccourcis existants seulement', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-home-'));
  fs.mkdirSync(path.join(home, 'Pictures')); fs.mkdirSync(path.join(home, 'Documents'));
  const p = files.places(home, 'linux');
  assert.deepStrictEqual(p.map(x => x.label), ['Documents', 'Images', 'Dossier personnel', 'Racine']);
});
