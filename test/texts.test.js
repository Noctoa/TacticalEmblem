'use strict';
// Outil Textes : CSV (séparateurs, guillemets, retours à la ligne), références dans les dialogues, langues, sauvegarde.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const T = require('../src/shared/texts');
const io = require('../src/main/project-io');

test('CSV : séparateur détecté, guillemets et retours à la ligne', () => {
  const r = T.rowsFromCsv('﻿id;fr;en\r\n0000;"Bonjour; ami";"Hello, friend"\n0001;"Ligne 1\nLigne 2";\n');
  assert.deepEqual(r.languages, ['fr', 'en']);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].t.fr, 'Bonjour; ami');
  assert.equal(r.rows[1].t.fr, 'Ligne 1\nLigne 2');
  assert.equal(r.rows[1].t.en, undefined);
  const file = { rows: [{ id: '0000', t: { fr: 'Il dit "oui", puis part', en: 'x' } }] };
  const back = T.rowsFromCsv(T.toCsv(file, [{ code: 'fr' }, { code: 'en' }]));
  assert.equal(back.rows[0].t.fr, 'Il dit "oui", puis part');
});

test('références : réplique d\'un personnage, texte en ligne, langue de secours, texte manquant', () => {
  const texts = T.normalize({ languages: [{ code: 'fr' }, { code: 'en' }], main: 'fr', files: [] });
  const db = { units: [{ id: 'c_lyn', name: 'Lyn' }] };
  const lyn = T.create(texts, { name: 'Lyn', kind: 'character', ref: 'c_lyn' });
  T.addRow(lyn, { fr: 'Je suis Lyn.', en: 'I am Lyn.' });
  T.addRow(lyn, { fr: 'Seulement en français.' });
  const arm = T.create(texts, { name: 'Armes', kind: 'weapon' });
  T.addRow(arm, { fr: 'Épée de fer', en: 'Iron Sword' }, 'w_iron.nom');
  assert.equal(lyn.id, 'lyn');
  const script = '@lyn#0000\nBrigand: Rends-moi {@armes#w_iron.nom} !\n@lyn#0001\n@lyn#9999';
  assert.equal(T.resolve(script, texts, 'en', db), 'Lyn: I am Lyn.\nBrigand: Rends-moi Iron Sword !\nLyn: Seulement en français.\n[texte manquant : lyn#9999]');
  assert.equal(T.resolve('Sans référence : e-mail@site', texts, 'fr', db), 'Sans référence : e-mail@site');
  assert.equal(T.stats(lyn, texts).translated, 1);
  assert.equal(T.nextRowId(lyn), '0002');
  assert.equal(T.create(texts, { name: 'Lyn', kind: 'character' }).id, 'lyn_2');
});

test('remplissage depuis la base et import CSV', () => {
  const texts = T.empty();
  const f = T.create(texts, { name: 'Armes', kind: 'weapon' });
  assert.equal(T.fillFromDb(f, { weapons: [{ id: 'w1', name: 'Épée', description: 'Une épée.' }, { id: 'w2', name: 'Lance' }] }, 'fr'), 3);
  assert.equal(T.importCsv(f, texts, 'id,fr,en\nw1.nom,Épée,Sword\nnouveau,Neuf,New\n'), 2);
  assert.equal(f.rows.find(r => r.id === 'w1.nom').t.en, 'Sword');
  assert.ok(texts.languages.some(l => l.code === 'en' && l.name === 'English'));
  assert.equal(f.rows.length, 4);
});

test('sauvegarde : textes/index.json et un CSV par fichier, relus à l\'ouverture', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-texts-')), 'Jeu');
  io.createProject(dir, 'Jeu', 'sample', path.join(__dirname, '..', 'assets'));
  const p = io.loadProject(dir);
  const auto = p.texts.files.filter(f => f.kind === 'base').length;
  assert.ok(auto >= 8 && p.textsSync && p.textsSync.added > 50, 'textes de la base créés à l\'ouverture');
  p.texts.languages.push({ code: 'en', name: 'English' });
  const f = T.create(p.texts, { name: 'Eliwood', kind: 'character', ref: 'c_eliwood' });
  T.addRow(f, { fr: 'Bonjour, "Lyn" ; ça va ?', en: 'Hi' });
  const g = T.create(p.texts, { name: 'Brouillon', kind: 'other' });
  io.saveProject(dir, p);
  assert.ok(fs.existsSync(path.join(dir, 'textes', 'eliwood.csv')));
  const q = io.loadProject(dir);
  assert.equal(q.texts.files.length, auto + 2);
  assert.equal(q.textsSync, undefined, 'rien à ajouter une fois enregistré');
  const eli = q.texts.files.find(x => x.id === 'eliwood');
  assert.equal(eli.rows[0].t.fr, 'Bonjour, "Lyn" ; ça va ?');
  assert.equal(eli.ref, 'c_eliwood');
  q.texts.files = q.texts.files.filter(x => x.id !== g.id);
  io.saveProject(dir, q);
  assert.ok(!fs.existsSync(path.join(dir, 'textes', 'brouillon.csv')));
  eli.rows.push({ id: '0000', t: {} });
  assert.throws(() => io.saveProject(dir, q), /deux textes/);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('textes de la base : un ancien fichier d\'une pièce est réparti par type, traductions comprises', () => {
  const db = { units: [{ id: 'u1', name: 'Lyn', bio: 'Une nomade.' }] };
  const t = T.normalize({ languages: [{ code: 'fr' }, { code: 'en' }], main: 'fr', files: [{ id: 'base_units', name: 'Unités', kind: 'base', ref: 'units',
    rows: [{ id: 'u1.name', t: { fr: 'Lyn', en: 'Lyn' } }, { id: 'u1.bio', t: { fr: 'Une nomade.', en: 'A nomad.' } }] }] });
  const res = T.syncDb(t, db, {});
  assert.deepEqual(res, { added: 0, updated: 0, removed: 0 });
  assert.deepEqual(t.files.map(f => f.id), ['base_units_name', 'base_units_bio']);
  assert.equal(t.files[1].name, 'Biographies des unités');
  assert.equal(t.files[1].rows[0].t.en, 'A nomad.');
});

test('textes de la base : une ligne par texte du jeu, créée / retirée avec l\'élément, traduite en jeu', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-texts-')), 'Jeu');
  io.createProject(dir, 'Jeu', 'sample', path.join(__dirname, '..', 'assets'));
  const p = io.loadProject(dir);
  const file = (id) => p.texts.files.find(f => f.id === id);
  // une catégorie par liste, un fichier par type de texte
  const names = file('base_units_name'), weapons = file('base_weapons_name'), chapters = file('base_chapters_dialogues');
  assert.equal(names.name, 'Noms des unités');
  assert.equal(names.rows.find(r => r.id === 'c_eliwood.name').t.fr, 'Eliwood');
  assert.ok(!names.rows.some(r => r.id === 'c_eliwood.bio'));
  assert.ok(file('base_units_bio').rows.some(r => r.id === 'c_eliwood.bio'));
  assert.ok(file('base_units_description') || file('base_units_ending'));
  // dialogues : une ligne par réplique, sans le nom de l'orateur
  const first = chapters.rows.find(r => r.id === 'ch_1.events.ev1.script.01');
  assert.ok(first && first.who === 'Lyn' && !/^Lyn: /.test(first.t.fr), JSON.stringify(first));
  assert.ok(file('base_supports_conversations').rows.some(r => /\.conversations\.C\.01$/.test(r.id)));
  assert.ok(file('base_system_subtitle').rows.some(r => r.id === 'titre.subtitle'));
  const groups = T.baseGroups(p.texts);
  assert.equal(groups[0].name, 'Unités');
  assert.ok(groups[0].files.every(f => f.ref === 'units'));
  // nouvel objet : sa ligne existe dès l'enregistrement ; supprimé : sa ligne part
  p.db.weapons.push({ id: 'w_neuve', name: 'Lame neuve', type: 'sword', description: 'Toute neuve.' });
  p.texts.languages.push({ code: 'en', name: 'English' });
  io.saveProject(dir, p);
  assert.ok(weapons.rows.some(r => r.id === 'w_neuve.name' && r.t.fr === 'Lame neuve'));
  const csv = fs.readFileSync(path.join(dir, 'textes', 'weapons', 'name.csv'), 'utf8');
  assert.ok(csv.includes('w_neuve.name,Lame neuve,'));
  // traduction anglaise saisie dans le CSV (Excel), et le nom français changé dans le CSV
  fs.writeFileSync(path.join(dir, 'textes', 'weapons', 'name.csv'), csv.replace('w_neuve.name,Lame neuve,', 'w_neuve.name,Lame toute neuve,New Blade'));
  const q = io.loadProject(dir);
  assert.equal(q.db.weapons.find(w => w.id === 'w_neuve').name, 'Lame toute neuve', 'le CSV gagne');
  assert.deepEqual(q.textsSync, { added: 0, updated: 1, removed: 0 });
  const n = T.localizeDb(q.texts, q.db, q.meta, 'en');
  assert.ok(n >= 1);
  assert.equal(q.db.weapons.find(w => w.id === 'w_neuve').name, 'New Blade');
  assert.equal(q.db.units.find(u => u.id === 'c_eliwood').name, 'Eliwood', 'sans traduction : la langue principale');
  // texte principal modifié dans l'outil Textes → la base suit
  const r = io.loadProject(dir);
  assert.ok(T.setDbText(r.texts, r.db, r.meta, 'base_units_name', 'c_lyn.name', 'Lyndis'));
  assert.equal(r.db.units.find(u => u.id === 'c_lyn').name, 'Lyndis');
  r.db.weapons = r.db.weapons.filter(w => w.id !== 'w_neuve');
  io.saveProject(dir, r);
  assert.ok(!fs.readFileSync(path.join(dir, 'textes', 'weapons', 'name.csv'), 'utf8').includes('w_neuve'));
  assert.ok(fs.readFileSync(path.join(dir, 'textes', 'units', 'name.csv'), 'utf8').includes('c_lyn.name,Lyndis'));
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('conversations : une réplique par ligne, traductions conservées quand une réplique est insérée, ancien bloc réparti', () => {
  const db = { talks: [{ id: 't1', name: 'Veillée', script: 'Lyn: Bonsoir.\nEliwood: Tu ne dors pas ?' }], units: [{ id: 'u1', name: 'Lyn' }, { id: 'u2', name: 'Eliwood' }] };
  const t = T.normalize({ languages: [{ code: 'fr' }, { code: 'en' }], main: 'fr', files: [] });
  T.syncDb(t, db, {});
  const f = t.files.find(x => x.id === 'base_talks_dialogues');
  assert.deepEqual(f.rows.map(r => [r.id, r.who, r.t.fr]), [['t1.script.01', 'Lyn', 'Bonsoir.'], ['t1.script.02', 'Eliwood', 'Tu ne dors pas ?']]);
  f.rows[0].t.en = 'Good evening.'; f.rows[1].t.en = 'Can\'t sleep?';
  // une réplique insérée au début : les traductions suivent leur réplique
  db.talks[0].script = 'Eliwood: …\n' + db.talks[0].script;
  T.syncDb(t, db, {});
  assert.deepEqual(f.rows.map(r => [r.id, r.t.fr, r.t.en || '']), [['t1.script.01', '…', ''], ['t1.script.02', 'Bonsoir.', 'Good evening.'], ['t1.script.03', 'Tu ne dors pas ?', 'Can\'t sleep?']]);
  // texte principal modifié depuis l'outil : l'orateur reste
  assert.ok(T.setDbText(t, db, {}, f.id, 't1.script.02', 'Bonne nuit.'));
  assert.equal(db.talks[0].script.split('\n')[1], 'Lyn: Bonne nuit.');
  // en jeu : répliques et orateurs traduits
  db.units[0].name = 'Lyn'; t.files.push({ id: 'base_units_name', kind: 'base', ref: 'units', field: 'name', rows: [{ id: 'u1.name', t: { fr: 'Lyn', en: 'Lyn of Sacae' } }] });
  T.localizeDb(t, db, {}, 'en');
  assert.equal(db.talks[0].script, 'Eliwood: …\nLyn of Sacae: Good evening.\nEliwood: Can\'t sleep?');
  // ancien format (un bloc par dialogue) : traductions réparties réplique par réplique
  const db2 = { talks: [{ id: 't1', script: 'Lyn: Bonsoir.\n@autre#0001\nEliwood: Salut.' }] };
  const t2 = T.normalize({ languages: [{ code: 'fr' }, { code: 'en' }], main: 'fr', files: [{ id: 'base_talks', kind: 'base', ref: 'talks',
    rows: [{ id: 't1.script', t: { fr: 'Lyn: Bonsoir.\n@autre#0001\nEliwood: Salut.', en: 'Lyn: Good evening.\n@autre#0001\nEliwood: Hi.' } }] }] });
  const res = T.syncDb(t2, db2, {});
  assert.equal(res.added, 0);
  assert.deepEqual(t2.files.find(x => x.id === 'base_talks_dialogues').rows.map(r => r.t.en), ['Good evening.', 'Hi.']);
  // renommer une unité renomme l'orateur partout
  assert.equal(T.renameSpeaker(db2, {}, 'Lyn', 'Lyndis'), 1);
  assert.ok(db2.talks[0].script.startsWith('Lyndis: Bonsoir.'));
});

test('répliques des personnages : rangées dans le fichier du personnage, traductions comprises, le dialogue y renvoie', () => {
  const db = { talks: [{ id: 't1', script: 'Lyn: Bonsoir.\nBrigand: Ha !\nLyn: Bonsoir.' }], units: [{ id: 'u1', name: 'Lyn' }] };
  const t = T.normalize({ languages: [{ code: 'fr' }, { code: 'en' }], main: 'fr', files: [] });
  T.syncDb(t, db, {});
  t.files.find(f => f.id === 'base_talks_dialogues').rows[0].t.en = 'Good evening.';
  assert.equal(T.moveToCharacters(t, db, {}), 2);
  const f = T.characterFile(t, db, 'u1');
  assert.ok(f && f.kind === 'character');
  assert.deepEqual(f.rows.map(r => r.t), [{ fr: 'Bonsoir.', en: 'Good evening.' }], 'texte identique réutilisé');
  assert.equal(db.talks[0].script, `@${f.id}#0000\nBrigand: Ha !\n@${f.id}#0000`);
  assert.equal(T.resolve(db.talks[0].script, t, 'en', db), 'Lyn: Good evening.\nBrigand: Ha !\nLyn: Good evening.');
  // les répliques rangées quittent le CSV des dialogues de la base
  assert.deepEqual(t.files.find(x => x.id === 'base_talks_dialogues').rows.map(r => r.t.fr), ['Ha !']);
  assert.equal(T.storeLine(t, db, 'u1', 'Nouvelle réplique.'), f.id + '#0001');
});
