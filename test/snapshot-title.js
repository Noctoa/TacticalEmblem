/*
 * Écran titre : nom du jeu, Jouer / Crédits / Quitter ; « Jouer » sans sauvegarde crée la partie tout seul,
 * avec une sauvegarde propose Continuer ; crédits saisis dans Système.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-title.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  process.env.TF_TITLE = '1'; // ce scénario teste l'écran titre (les autres passent par le lanceur direct)
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 120000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-title-')), 'Jeu');
      const p = io.createProject(dir, 'La Lame de Varenne', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.author = 'Luca';
      io.saveProject(dir, p);
      const open = async () => {
        const pw = openPlaytest(dir, ''); const wc = pw.webContents;
        wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
        await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 760); pw.show();
        return { pw, wc, js: c => wc.executeJavaScript(c, true) };
      };
      const until = async (js, c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await wait(100); } throw new Error('Délai : ' + c); };
      const shot = async (wc, n) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(400); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      const key = (js, k) => js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);

      // 1. premier lancement : écran titre
      let s = await open();
      await until(s.js, `!!document.querySelector('#title-screen .ts-menu')`);
      await wait(600); await shot(s.wc, 'a_titre');
      result.titre = await s.js(`({ nom: document.querySelector('.ts-name').textContent, sous: (document.querySelector('.ts-sub') || {}).textContent, menu: [...document.querySelectorAll('.ts-item')].map(b => b.textContent) })`);
      assert(result.titre.nom === 'La Lame de Varenne', 'nom du jeu');
      assert(JSON.stringify(result.titre.menu) === '["Jouer","Crédits","Quitter"]', 'menu : ' + result.titre.menu);
      // 2. crédits au clavier : flèche bas puis Entrée ; Échap revient au menu
      await key(s.js, 'ArrowDown'); await key(s.js, 'Enter'); await wait(300);
      result.credits = await s.js(`document.querySelector('.ts-credits-roll').textContent`);
      assert(/EdnidCorp\./.test(result.credits) && /Lexou/.test(result.credits) && /Square-Enix/.test(result.credits) && /Luca/.test(result.credits), 'crédits du projet');
      await shot(s.wc, 'b_credits');
      await key(s.js, 'Escape'); await wait(200);
      assert(await s.js(`!!document.querySelector('.ts-menu')`), 'retour au menu');
      // 3. Jouer sans sauvegarde : partie Classique créée directement, arrivée au camp
      await s.js(`document.querySelector('[data-title="play"]').click()`);
      await until(s.js, `PlaytestState.mode === 'lobby' && !PlaytestState.busy && !document.querySelector('#title-screen')`, 20000);
      result.nouvelle = await s.js(`({ mode: PlaytestState.campaign.mode, dialogue: !!document.querySelector('.modal-back') })`);
      assert(result.nouvelle.mode === 'classic' && !result.nouvelle.dialogue, 'nouvelle partie automatique');
      await s.js(`PlaytestDebug.saveSlot(1)`); await wait(300);
      s.pw.destroy(); await wait(500);
      // 4. avec une sauvegarde : Jouer propose Continuer / Nouvelle partie
      s = await open();
      await until(s.js, `!!document.querySelector('#title-screen .ts-menu')`);
      await s.js(`document.querySelector('[data-title="play"]').click()`); await wait(300);
      result.reprise = await s.js(`[...document.querySelectorAll('.ts-menu.sub .ts-item')].map(b => b.textContent)`);
      assert(result.reprise[0] === 'Continuer' && result.reprise.includes('Nouvelle partie') && result.reprise.at(-1) === 'Retour', 'choix avec sauvegarde : ' + result.reprise);
      await shot(s.wc, 'c_jouer_reprise');
      // X → retour au menu principal ; puis Jouer › Continuer au clavier
      await key(s.js, 'x'); await wait(200);
      assert(await s.js(`!document.querySelector('.ts-menu.sub') && !!document.querySelector('[data-title="credits"]')`), 'retour au menu principal');
      await key(s.js, 'Enter'); await wait(200); await key(s.js, 'Enter');
      await until(s.js, `PlaytestState.mode === 'lobby' && !PlaytestState.busy && !document.querySelector('#title-screen')`, 20000);
      result.continue = true;
      // 5. Quitter ferme la fenêtre du jeu
      s.pw.destroy(); await wait(400);
      s = await open();
      await until(s.js, `!!document.querySelector('#title-screen .ts-menu')`);
      const closed = new Promise(r => s.pw.once('closed', () => r(true)));
      await s.js(`document.querySelector('[data-title="quit"]').click()`);
      result.quitte = await Promise.race([closed, wait(3000).then(() => false)]);
      assert(result.quitte, 'Quitter ferme le jeu');
    } catch (e) { errs.push(String(e && e.stack || e)); }
    finish();
  });
};
