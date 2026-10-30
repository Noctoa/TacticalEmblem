/*
 * Base de données › Classes › « ＋ Classes de la série… » : fenêtre des jeux, ajout de FE7 et Awakening, fiche d'une classe.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-fe-classes.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const js = c => wc.executeJavaScript(c, true);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await js(`document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`); await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (c, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-fe-classes-')), 'Jeu');
      io.createProject(dir, 'Classes', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      result.avant = await js(`Editor.db().classes.length`);
      await js(`DBEditor.open('classes')`);
      await until(`!!document.querySelector('[data-fe-classes]')`);
      await js(`document.querySelector('[data-fe-classes]').click()`);
      await until(`!!document.querySelector('[data-fe-classes-ok]')`);
      result.jeux = await js(`[...document.querySelectorAll('.fe-pack-row b')].map(b => b.textContent)`);
      assert(result.jeux.length === 9, 'jeux : ' + result.jeux);
      await js(`['fe7', 'fe13'].forEach(id => { const cb = document.querySelector('.fe-pack-row input[data-group="' + id + '"]'); cb.checked = true; cb.dispatchEvent(new Event('change')); })`);
      result.compte = await js(`document.querySelector('.modal-actions .muted').textContent`);
      await wait(200); await shot('a_choix');
      await js(`document.querySelector('[data-fe-classes-ok]').click()`);
      await until(`Editor.db().classes.length > ${result.avant}`);
      result.apres = await js(`Editor.db().classes.length`);
      assert(result.apres === result.avant + 62 + 46, 'classes ajoutées : ' + (result.apres - result.avant));
      // fiche du Paladin (M) de FE7
      await js(`[...document.querySelectorAll('.db-item')].find(e => e.textContent.includes('Paladin (M) · FE7')).click()`);
      await wait(500);
      result.fiche = await js(`document.querySelector('#db-body').innerText.includes('Paladin (M) · FE7')`);
      assert(result.fiche, 'fiche ouverte');
      await shot('b_fiche');
      result.promos = await js(`Editor.db().classes.find(c => c.id === 'fe13_cavalier').promotions.map(p => p.classId)`);
      assert(JSON.stringify(result.promos) === '["fe13_paladin","fe13_great_knight"]', 'promotions : ' + result.promos);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
