/*
 * Éditeur : onglet Invocations (bannières, taux réels), rareté d'une unité, autel dans l'onglet Lobby, réglages Système.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-invocation-editeur.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 120000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-inv-ed-')), 'Jeu');
      io.createProject(dir, 'Invocations', 'sample', path.join(__dirname, '..', 'assets'));
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async n => { win.show(); win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      const field = (label) => `[...document.querySelectorAll('#db-body .field-label')].find(l => l.textContent.startsWith(${JSON.stringify(label)})).parentElement`;
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1000);
      await ejs(`DBEditor.open('banners')`); await wait(600);
      result.liste = await ejs(`[...document.querySelectorAll('#db-body .db-item')].map(e => e.textContent)`);
      result.taux = await ejs(`[...document.querySelectorAll('#db-body .form-info')].map(e => e.textContent).find(t => t.startsWith('Taux réels'))`);
      await shot('a_banniere');
      // Oswin mis en avant aussi : les taux affichés changent
      await ejs(`[...${field('Mis en avant')}.querySelectorAll('.chip')].find(c => c.textContent.startsWith('Oswin')).click()`); await wait(400);
      result.focus = await ejs(`Editor.db().banners[0].focus`);
      result.taux2 = await ejs(`[...document.querySelectorAll('#db-body .form-info')].map(e => e.textContent).find(t => t.startsWith('Taux réels'))`);
      // nouvelle bannière
      await ejs(`document.querySelector('#db-body .db-list-actions button').click()`); await wait(400);
      result.nouvelle = await ejs(`(() => { const b = Editor.db().banners[Editor.db().banners.length - 1]; return { name: b.name, pool: b.pool.length, rates: b.rates }; })()`);
      // rareté d'une unité
      await ejs(`DBEditor.open('units', 'c_serra')`); await wait(400);
      await ejs(`(() => { const s = ${field('Rareté')}.querySelector('select'); s.value = '4'; s.dispatchEvent(new Event('change')); })()`); await wait(300);
      result.rareteSerra = await ejs(`Editor.db().units.find(u => u.id === 'c_serra').rarity`);
      await shot('b_rarete');
      await ejs(`DBEditor.open('lobby')`); await wait(600);
      await ejs(`[...document.querySelectorAll('#db-body .form-heading')].find(e => e.textContent.startsWith('Autel')).scrollIntoView()`); await wait(200);
      result.cibles = await ejs(`[...document.querySelectorAll('#db-body .lobby-pick .chip')].map(c => c.textContent)`);
      await shot('c_lobby_autel');
      await ejs(`DBEditor.open('system')`); await wait(500);
      await ejs(`[...document.querySelectorAll('#db-body .form-heading')].find(e => e.textContent === 'Invocations').scrollIntoView()`); await wait(200);
      result.systeme = await ejs(`Editor.project().meta.summon`);
      await shot('d_systeme');
      win.webContents.send('menu', 'save'); await wait(1200);
      const p = io.loadProject(dir);
      result.sauve = { focus: p.db.banners[0].focus, serra: p.db.units.find(u => u.id === 'c_serra').rarity, bannieres: p.db.banners.length };
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
