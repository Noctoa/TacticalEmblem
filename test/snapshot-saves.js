/*
 * Sauvegardes façon Fire Emblem GBA : barres d'emplacement (Paramètres › Charger), temps de jeu (PLAYTIME) enregistré
 * et repris, écran titre › Jouer › Charger avec les mêmes barres et les menus en barres bleues / vertes.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-saves.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  process.env.TF_TITLE = '1';
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 120000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-saves-')), 'Jeu');
      io.createProject(dir, 'Sauvegardes', 'sample', path.join(__dirname, '..', 'assets'));
      const open = async () => {
        const pw = openPlaytest(dir, ''); const wc = pw.webContents;
        wc.on('console-message', (e, l, m) => { if (l >= 3) errs.push('playtest: ' + m); });
        await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 760); pw.show();
        return { pw, wc, js: c => wc.executeJavaScript(c, true) };
      };
      const until = async (js, c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await wait(100); } throw new Error('Délai : ' + c); };
      const shot = async (wc, n) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(400); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      const key = (js, k) => js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);

      // 1. nouvelle partie, 3 h 25 de jeu, deux sauvegardes ; Paramètres › Charger
      let s = await open();
      await until(s.js, `!!document.querySelector('#title-screen .ts-menu')`);
      await wait(500); await shot(s.wc, 'a_titre');
      await s.js(`document.querySelector('[data-title="play"]').click()`);
      await until(s.js, `PlaytestState.mode === 'lobby' && !PlaytestState.busy && !document.querySelector('#title-screen')`, 20000);
      await s.js(`PlaytestState.playBase = (3 * 60 + 25) * 60000; PlaytestState.playStart = performance.now()`);
      await s.js(`PlaytestDebug.saveSlot(1)`); await s.js(`PlaytestState.campaign.gold = 1234; PlaytestDebug.saveSlot(3)`); await wait(300);
      await s.js(`PlaytestSettings.open('load')`);
      await until(s.js, `document.querySelectorAll('#settings .sv-slot').length === 5`);
      result.barres = await s.js(`[...document.querySelectorAll('#settings .sv-slot')].map(b => ({ vide: b.classList.contains('empty'), titre: b.querySelector('.sv-title').textContent, temps: (b.querySelector('.sv-digits') || {}).getAttribute ? b.querySelector('.sv-digits').getAttribute('aria-label') : null }))`);
      assert(!result.barres[0].vide && result.barres[1].vide && !result.barres[2].vide, 'emplacements : ' + JSON.stringify(result.barres));
      assert(result.barres[0].temps === '03:25', 'PLAYTIME : ' + result.barres[0].temps);
      await s.js(`document.querySelector('#settings .sv-slot[data-sv-slot="3"]').focus()`);
      await shot(s.wc, 'b_charger');
      s.pw.destroy(); await wait(500);

      // 2. écran titre › Jouer › Charger : les barres ; on reprend l'emplacement 3 (temps de jeu repris)
      s = await open();
      await until(s.js, `!!document.querySelector('#title-screen .ts-menu')`);
      await s.js(`document.querySelector('[data-title="play"]').click()`); await wait(300);
      await s.js(`[...document.querySelectorAll('.ts-menu.sub .ts-item')].find(b => b.textContent.startsWith('Charger')).click()`); await wait(300);
      result.titreBarres = await s.js(`[...document.querySelectorAll('.ts-item.ts-slot')].map(b => b.querySelector('.sv-title').textContent)`);
      assert(result.titreBarres.length === 2, 'barres de l’écran titre : ' + result.titreBarres);
      await key(s.js, 'ArrowDown'); await wait(200);
      await shot(s.wc, 'c_titre_charger');
      await key(s.js, 'Enter');
      await until(s.js, `PlaytestState.mode === 'lobby' && !PlaytestState.busy && !document.querySelector('#title-screen')`, 20000);
      result.or = await s.js(`PlaytestState.campaign.gold`);
      result.tempsRepris = await s.js(`Math.round(PlaytestState.playBase / 60000)`);
      assert(result.or === 1234 && result.tempsRepris === 205, 'reprise : ' + JSON.stringify(result));
      s.pw.destroy();
    } catch (e) { errs.push(String(e && e.stack || e)); }
    finish();
  });
};
