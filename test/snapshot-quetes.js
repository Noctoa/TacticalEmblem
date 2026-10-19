/*
 * Tableau des quêtes : chapitres de plusieurs actes (histoire et évènement).
 * Nouvelle partie → chapitre 1 (acte 2 verrouillé) → acte 1 gagné → « Acte 2 → » → acte 2 gagné →
 * retour au camp : chapitre 1 terminé, chapitre 2 ouvert, évènement en 2 actes ouvert. Puis l'onglet Chapitres de l'éditeur.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-quetes.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {}, log = (k, v) => { result[k] = v; };
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 180000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-quetes-')), 'Jeu');
      io.createProject(dir, 'Quêtes', 'sample', path.join(__dirname, '..', 'assets'));
      const pw = openPlaytest(dir, ''); const wc = pw.webContents;
      wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(120); } throw new Error('Délai : ' + c); };
      const shot = async n => { wc.invalidate(); await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const clickIn = (sel, text) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)}) && !e.disabled); if (b) b.click(); return !!b; })()`);
      const confirmModal = async (text) => { await until(`!!document.querySelector('.modal-back')`); await js(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`); await wait(300); };
      const board = async () => { await js(`PlaytestLobby.click(PlaytestLobby.state.cfg.board.x, PlaytestLobby.state.cfg.board.y)`); await until(`!document.querySelector('#lobby-panel').classList.contains('hidden')`); await wait(300); };
      const cards = () => js(`[...document.querySelectorAll('#lobby-panel .lp-arc')].map(c => ({ titre: c.querySelector('.lp-arc-head').textContent, actes: [...c.querySelectorAll('.lp-act')].map(a => a.querySelector('.lp-name').textContent + ' [' + (a.querySelector('button').disabled ? 'verrouillé' : a.querySelector('button').textContent) + ']') }))`);
      const win1 = async () => {
        await until(`PlaytestState.mode === 'chapter' && PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
        await js(`(() => { (async () => { const G = PlaytestState; for (const u of G.units) if (u.team === 'enemy') u.dead = true; G.pending = []; await PlaytestDebug.checkEnd(); })(); return true; })()`);
        await until(`document.querySelector('#end').classList.contains('win-screen')`);
      };

      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await board(); await shot('a_tableau_debut');
      log('début', await cards());
      log('onglets', await js(`[...document.querySelectorAll('#lobby-panel .lp-tab')].map(b => b.textContent)`));
      await clickIn('#lobby-panel .lp-go', 'Partir'); await confirmModal('Partir');
      log('bannière acte 1', await js(`document.title`));
      await win1(); await wait(300); await shot('b_victoire_acte1');
      log('fin acte 1', await js(`[...document.querySelectorAll('#end button')].map(b => b.textContent)`));
      await clickIn('#end button', 'Acte 2');
      await until(`PlaytestState.mode === 'chapter' && PlaytestState.chapter.id === 'ch_1_2'`);
      await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      await shot('c_acte2');
      log('acte 2', { titre: await js(`document.title`), objectif: await js(`document.querySelector('#objective').textContent`), or: await js(`PlaytestState.campaign.gold`) });
      await win1(); await wait(200);
      log('fin acte 2', await js(`[...document.querySelectorAll('#end button')].map(b => b.textContent)`));
      await clickIn('#end button', 'Retour au camp');
      await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await board(); await shot('d_tableau_chapitre2');
      log('après chapitre 1', await cards());
      await clickIn('#lobby-panel .lp-tab', 'Évènements'); await wait(300);
      await shot('e_evenements');
      log('évènements', await cards());
      log('or', await js(`PlaytestState.campaign.gold`));
      pw.close();
      // éditeur : onglet Chapitres
      win.setSize(1440, 900); win.show();
      const ejs = c => win.webContents.executeJavaScript(c, true);
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(900);
      await ejs(`DBEditor.open('arcs')`); await wait(700);
      win.webContents.invalidate(); await wait(400);
      fs.writeFileSync(path.join(out, 'f_editeur_chapitres.png'), (await win.webContents.capturePage()).toPNG());
      log('éditeur', await ejs(`[...document.querySelectorAll('.arc-act')].map(a => a.querySelector('.arc-num').textContent + ' ' + a.querySelector('.arc-name').textContent)`));
      await ejs(`DBEditor.open('chapters', 'ch_1_2')`); await wait(600);
      win.webContents.invalidate(); await wait(300);
      fs.writeFileSync(path.join(out, 'g_editeur_acte.png'), (await win.webContents.capturePage()).toPNG());
      log('acte dans éditeur', await ejs(`document.querySelector('.arc-line').textContent`));
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
