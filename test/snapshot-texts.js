/*
 * Outil Textes : fichiers par personnage, langues, traduction, aperçu avec le portrait, remplissage depuis la base,
 * bouton « ＋ Texte » des dialogues, CSV écrits à l'enregistrement, et en jeu les références remplacées (anglais).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-texts.js npm start
 */
'use strict';
require('./auto-deploy.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code, true);
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n, w) => { const c = w || wc; await c.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await c.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const until = async (code, ms = 10000, c) => { const end = Date.now() + ms; while (Date.now() < end) { if (await (c ? c.executeJavaScript(code, true) : js(code))) return; await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1600, 1000);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-texts-')), 'Jeu');
      io.createProject(dir, 'Textes', 'sample', path.join(__dirname, '..', 'assets'));
      const q = io.loadProject(dir); q.meta.lobby.enabled = false; q.meta.settings.language = 'en'; io.saveProject(dir, q);
      await js(`localStorage.removeItem('tf.textsFile')`);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      await js(`document.querySelector('[data-rail="texts"]').click()`);
      await until(`!document.querySelector('#texts').classList.contains('hidden')`);
      assert(await js(`document.body.dataset.view === 'texts'`), 'vue textes');
      await shot('a_vide');
      // un fichier par personnage
      await js(`document.querySelector('[data-texts-characters]').click()`);
      await until(`Editor.project().texts.files.filter(f => f.kind === 'character').length === Editor.db().units.length`);
      await js(`document.querySelector('[data-text-file="eliwood"]').click()`);
      // langue anglaise
      await js(`document.querySelector('[data-texts-languages]').click()`);
      await until(`!!document.querySelector('[data-lang-code]')`);
      await js(`document.querySelector('[data-lang-code]').value = 'en'; document.querySelector('[data-lang-add]').click()`);
      await shot('b_langues');
      await js(`document.querySelector('.modal .modal-actions .primary').click()`);
      await until(`Editor.project().texts.languages.length === 2 && !document.querySelector('.modal-back')`);
      // deux textes
      const type = async (sel, v) => js(`(() => { const t = document.querySelector('${sel}'); t.focus(); t.value = ${JSON.stringify(v)}; t.dispatchEvent(new Event('input')); })()`);
      await js(`document.querySelector('[data-texts-add]').click()`); await wait(200);
      await type('[data-text-row="0000"]', 'Lyn, Hector ! Le fort est juste devant nous.');
      await js(`document.querySelector('[data-texts-add]').click()`); await wait(200);
      await type('[data-text-row="0001"]', 'Restez groupés, et que personne ne tombe.');
      await js(`document.querySelector('[data-text-row="0000"]').dispatchEvent(new MouseEvent('mousedown'))`); await wait(400);
      result.apercu = await js(`document.querySelector('[data-text-preview] .tx-dlg-text').textContent`);
      assert(/fort est juste devant/.test(result.apercu), 'aperçu : ' + result.apercu);
      result.portrait = await js(`!!document.querySelector('[data-text-preview] canvas, [data-text-preview] img')`);
      await shot('c_textes');
      // traduction
      await js(`document.querySelector('[data-text-tab="translate"]').click()`); await wait(300);
      await type('[data-text-translate="0000"]', 'Lyn, Hector! The fort is right ahead.');
      await type('[data-text-translate="0001"]', 'Stay together, and let no one fall.');
      await js(`TextsEditor.render()`); await wait(300);
      result.faits = await js(`document.querySelector('.tx-progress').textContent`);
      await shot('d_traduction');
      // textes de la base : une ligne par texte du jeu ; une arme créée a sa ligne tout de suite ; la langue principale modifie la base
      result.base = await js(`Editor.project().texts.files.filter(f => f.kind === 'base').map(f => f.id + ':' + f.rows.length)`);
      assert(result.base.some(x => x.startsWith('base_units_name:')), 'fichiers de la base : ' + result.base);
      await js(`Editor.db().weapons.push({ id: 'w_test', name: 'Lame d’essai', type: 'sword', might: 5, hit: 90, crit: 0, weight: 5, uses: 30, range: [1, 1] }); Editor.markDirty()`);
      await js(`TextsEditor.open('base_weapons_name')`); await wait(300);
      result.nouvelle = await js(`!!Editor.project().texts.files.find(f => f.id === 'base_weapons_name').rows.find(r => r.id === 'w_test.name')`);
      assert(result.nouvelle, 'ligne de la nouvelle arme');
      await js(`TextsEditor.open('base_units_name')`); await wait(300);
      await js(`document.querySelector('[data-text-tab="texts"]').click()`); await wait(300);
      await js(`(() => { const s = document.querySelector('[data-text-lang]'); s.value = 'fr'; s.dispatchEvent(new Event('change')); })()`); await wait(200);
      await type('[data-text-row="c_lyn.name"]', 'Lyndis');
      result.lyn = await js(`Editor.db().units.find(u => u.id === 'c_lyn').name`);
      assert(result.lyn === 'Lyndis', 'nom dans la base : ' + result.lyn);
      await js(`(() => { const s = document.querySelector('[data-text-lang]'); s.value = 'en'; s.dispatchEvent(new Event('change')); })()`); await wait(200);
      await type('[data-text-row="c_lyn.name"]', 'Lyn of Sacae');
      await js(`(() => { const s = document.querySelector('[data-text-lang]'); s.value = 'fr'; s.dispatchEvent(new Event('change')); })()`); await wait(300);
      await shot('e_base');
      // bouton « ＋ Texte » : choix d'un texte inséré dans un dialogue
      await js(`window.__ta = document.createElement('textarea'); window.__ta.value = 'Hector: Allons-y.'; window.__ta.selectionStart = window.__ta.value.length; window.__p = UI.textPicker(window.__ta); 0`);
      await until(`!!document.querySelector('[data-pick-file]')`);
      await js(`(() => { const s = document.querySelector('[data-pick-file]'); s.value = 'eliwood'; s.dispatchEvent(new Event('change')); })()`); await wait(200);
      await js(`document.querySelector('[data-pick-row="0001"]').dispatchEvent(new MouseEvent('mouseenter'))`);
      await shot('f_choix');
      await js(`document.querySelector('[data-pick-row="0001"]').click()`); await wait(200);
      result.insere = await js(`window.__ta.value`);
      assert(result.insere === 'Hector: Allons-y.\n@eliwood#0001', 'insertion : ' + result.insere);
      // dialogue d'ouverture de l'acte 1 qui appelle les textes, enregistrement
      await js(`Editor.db().chapters[0].events[0].script = '@eliwood#0000\\nHector: Enfin un peu d’action !\\n@eliwood#0001'; Editor.markDirty()`);
      await js(`document.querySelector('[data-rail="save"]').click()`);
      await wait(1500);
      const csv = path.join(dir, 'textes', 'eliwood.csv');
      assert(fs.existsSync(csv), 'CSV absent');
      result.csv = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '').split('\r\n').slice(0, 2);
      assert(result.csv[0] === 'id,fr,en', 'en-tête : ' + result.csv[0]);
      // en jeu (langue : anglais)
      const pw = openPlaytest(dir, 'ch_1'), pc = pw.webContents; pc.setBackgroundThrottling(false); pw.show();
      await new Promise(r => pc.once('did-finish-load', r)); pw.setSize(1100, 780);
      await until(`!!document.querySelector('.choice-list')`, 20000, pc);
      await pc.executeJavaScript(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`!!PlaytestState.dialogue && document.querySelector('#dialogue .dlg-name').textContent === 'Eliwood'`, 20000, pc);
      await wait(2500);
      result.jeu = await pc.executeJavaScript(`document.querySelector('#dialogue .dlg-text').textContent`);
      result.nomLyn = await pc.executeJavaScript(`PlaytestState.db.units.find(u => u.id === 'c_lyn').name`);
      assert(result.nomLyn === 'Lyn of Sacae', 'nom traduit en jeu : ' + result.nomLyn);
      assert(result.jeu === 'Lyn, Hector! The fort is right ahead.', 'en jeu : ' + result.jeu);
      await shot('g_jeu', pc);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
