/*
 * Éditeur de conversation réplique par réplique (soutiens, camp, événements…) : orateurs avec portrait, ajout,
 * aperçu, renommage d'une unité suivi dans les dialogues, une ligne de CSV par réplique dans l'outil Textes.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-dialogues.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code, true);
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (code, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(code)) return; await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1600, 1000);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-dlg-')), 'Jeu');
      io.createProject(dir, 'Dialogues', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      // soutiens : conversation C de la première paire
      await js(`DBEditor.open('supports')`);
      await until(`!!document.querySelector('[data-dlg-editor] [data-dlg-row]')`);
      result.paire = await js(`(() => { const p = Editor.db().supports[0]; return [p.a, p.b].map(id => Editor.db().units.find(u => u.id === id).name); })()`);
      result.repliques = await js(`[...document.querySelector('[data-dlg-editor]').querySelectorAll('[data-dlg-who]')].map(i => i.value)`);
      assert(result.repliques.length >= 2, 'répliques : ' + result.repliques);
      const before = await js(`Editor.db().supports[0].conversations.C`);
      // ajouter une réplique : l'interlocuteur est proposé
      await js(`document.querySelector('[data-dlg-editor] [data-dlg-add]').click()`); await wait(200);
      result.propose = await js(`(() => { const w = [...document.querySelector('[data-dlg-editor]').querySelectorAll('[data-dlg-who]')]; return w[w.length - 1].value; })()`);
      await js(`(() => { const t = [...document.querySelector('[data-dlg-editor]').querySelectorAll('[data-dlg-text]')]; const a = t[t.length - 1]; a.value = 'On se reverra.'; a.dispatchEvent(new Event('input', { bubbles: true })); })()`); await wait(200);
      result.ecrit = await js(`Editor.db().supports[0].conversations.C`);
      assert(result.ecrit === before + '\n' + result.propose + ': On se reverra.', 'écrit : ' + JSON.stringify(result.ecrit));
      // fin de saisie : la réplique part dans le fichier de textes du personnage, le dialogue y renvoie
      await js(`(() => { const t = [...document.querySelector('[data-dlg-editor]').querySelectorAll('[data-dlg-text]')]; t[t.length - 1].dispatchEvent(new Event('change', { bubbles: true })); })()`); await wait(200);
      const refOf = (name, text) => js(`(() => { const t = Editor.project().texts, u = Texts.unitByName(Editor.db(), ${JSON.stringify(name)}), f = Texts.characterFile(t, Editor.db(), u.id); const r = f && f.rows.find(r => r.t.fr === ${JSON.stringify(text)}); return r ? f.id + '#' + r.id : null; })()`);
      result.ref = await refOf(result.propose, 'On se reverra.');
      result.apres = await js(`Editor.db().supports[0].conversations.C`);
      assert(result.ref && result.apres === before + '\n@' + result.ref, 'rangée : ' + JSON.stringify(result.apres));
      assert(await js(`!!document.querySelector('[data-dlg-editor] .dlg-row.char [data-dlg-speaker]')`), 'ligne de personnage');
      // réplique déjà écrite d'un personnage : choix du personnage puis de la réplique
      await js(`document.querySelector('[data-dlg-editor] [data-dlg-pick-char]').click()`);
      await until(`!!document.querySelector('[data-pick-unit]')`);
      await js(`(() => { const s = document.querySelector('[data-pick-unit]'); s.value = Texts.unitByName(Editor.db(), ${JSON.stringify(result.propose)}).id; s.dispatchEvent(new Event('change')); })()`); await wait(200);
      await js(`document.querySelector('[data-pick-line]').dispatchEvent(new MouseEvent('mouseenter'))`); await wait(2000);
      await shot('b0_choix_replique');
      await js(`document.querySelector('[data-pick-line]').click()`); await wait(300);
      result.choisie = await js(`Editor.db().supports[0].conversations.C.split('\\n').pop()`);
      assert(result.choisie === '@' + result.ref, 'réplique choisie : ' + result.choisie);
      // nouvelle réplique écrite depuis le choix : rangée dans le fichier du personnage
      await js(`document.querySelector('[data-dlg-editor] [data-dlg-pick-char]').click()`);
      await until(`!!document.querySelector('[data-pick-unit]')`);
      await js(`(() => { const s = document.querySelector('[data-pick-unit]'); s.value = 'c_lyn'; s.dispatchEvent(new Event('change')); const a = document.querySelector('[data-pick-new]'); a.value = 'À bientôt, alors.'; document.querySelector('[data-pick-add]').click(); })()`); await wait(300);
      result.nouvelle = await refOf('Lyn', 'À bientôt, alors.');
      assert(result.nouvelle && (await js(`Editor.db().supports[0].conversations.C.split('\\n').pop()`)) === '@' + result.nouvelle, 'nouvelle réplique : ' + result.nouvelle);
      assert(result.paire.includes(result.propose), 'orateur proposé : ' + result.propose);
      await wait(300); await shot('a_soutien');
      // aperçu dans la boîte de dialogue
      await js(`document.querySelector('[data-dlg-editor] [data-dlg-preview]').click()`);
      await until(`!!document.querySelector('[data-dlg-preview-box] .tx-dlg-text')`);
      result.apercu = await js(`document.querySelector('[data-dlg-preview-box] .tx-dlg-name').textContent`);
      await wait(400); await shot('b_apercu');
      await js(`document.querySelector('[data-dlg-next]').click()`); await wait(150);
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await wait(200);
      // texte brut : écrire dedans reconstruit les répliques
      await js(`document.querySelector('[data-dlg-editor] [data-dlg-raw]').click()`); await wait(100);
      await js(`(() => { const t = document.querySelector('[data-dlg-editor] textarea.dlg-raw'); t.value = 'Narrateur: Il pleut.\\nLe vent souffle.'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await js(`document.querySelector('[data-dlg-editor] [data-dlg-raw]').click()`); await wait(200);
      result.brut = await js(`[...document.querySelector('[data-dlg-editor]').querySelectorAll('[data-dlg-row]')].map(r => r.querySelector('[data-dlg-who]').value + '|' + r.querySelector('[data-dlg-text]').value)`);
      assert(JSON.stringify(result.brut) === JSON.stringify(['Narrateur|Il pleut.', '|Le vent souffle.']), 'texte brut : ' + result.brut);
      await js(`(() => { const t = document.querySelector('[data-dlg-editor] textarea.dlg-raw'); t.value = ${JSON.stringify(before)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      // renommer une unité : l'orateur suit dans tous les dialogues
      const lyn = await js(`Editor.db().units.find(u => u.id === 'c_lyn').name`);
      await js(`DBEditor.open('units', 'c_lyn')`); await wait(300);
      await js(`(() => { const l = [...document.querySelectorAll('#db-body .field-label')].find(l => l.textContent === 'Nom'); const i = l.parentElement.querySelector('input'); i.value = 'Lyndis'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`); await wait(300);
      result.renomme = await js(`(() => { const all = JSON.stringify([Editor.db().supports, Editor.db().chapters, Editor.db().talks]); return { ancien: (all.match(new RegExp('(^|\\\\n|")' + ${JSON.stringify(lyn)} + ':', 'g')) || []).length, nouveau: (all.match(/Lyndis:/g) || []).length }; })()`);
      assert(result.renomme.ancien === 0 && result.renomme.nouveau > 0, 'renommage : ' + JSON.stringify(result.renomme));
      // outil Textes : une ligne par réplique avec son orateur et l'aperçu du portrait
      await js(`document.querySelector('[data-rail="texts"]').click()`); await wait(300);
      await js(`TextsEditor.open('base_supports_conversations')`); await wait(400);
      result.csv = await js(`[...document.querySelectorAll('[data-text-who]')].slice(0, 4).map(b => b.textContent + ' ← ' + b.dataset.textWho)`);
      assert(result.csv.length && /\.conversations\.C\.01$/.test(result.csv[0]), 'CSV : ' + result.csv);
      await js(`document.querySelector('[data-text-row]').dispatchEvent(new MouseEvent('mousedown'))`); await wait(400);
      result.portrait = await js(`!!document.querySelector('[data-text-preview] .tx-dlg-name') && document.querySelector('[data-text-preview] .tx-dlg-name').textContent`);
      await shot('c_textes');
      // importer toutes les répliques des personnages des dialogues dans leurs fichiers
      const avant = await js(`Editor.project().texts.files.find(f => f.id === 'base_supports_conversations').rows.length`);
      await js(`document.querySelector('[data-texts-move-lines]').click()`);
      await until(`!!document.querySelector('.modal .primary')`);
      await js(`document.querySelector('.modal .primary').click()`); await wait(400);
      result.import = await js(`(() => { const t = Editor.project().texts, b = t.files.find(f => f.id === 'base_supports_conversations'); return { base: b ? b.rows.length : 0, personnages: t.files.filter(f => f.kind === 'character').map(f => f.name + ':' + f.rows.length), conv: Editor.db().supports[0].conversations.B }; })()`);
      assert(result.import.base < avant && result.import.personnages.length >= 2 && /^@/.test(result.import.conv), 'import : ' + JSON.stringify(result.import));
      await shot('d_import');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
