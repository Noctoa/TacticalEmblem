/*
 * Recrutement automatique (« Rejoint l'effectif après ») : Cloud rejoint l'équipe après l'acte 1 du projet d'exemple,
 * annoncé au retour au camp et présent dans menu du camp › Équipe ; sans camp, « Acte suivant » compte l'acte comme terminé.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-recruit.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 170000);
  const play = async (dir) => {
    const pw = openPlaytest(dir, ''); const wc = pw.webContents; wc.setBackgroundThrottling(false);
    wc.on('console-message', (e, l, m) => { if (l >= 3) errors.push(m); });
    await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
    const js = c => wc.executeJavaScript(c, true);
    const until = async (c, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(120); } throw new Error('Délai : ' + c); };
    const clickIn = (sel, text) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)}) && !e.disabled); if (b) b.click(); return !!b; })()`);
    const win = async () => {
      await until(`PlaytestState.mode === 'chapter' && PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      await js(`(() => { (async () => { const G = PlaytestState; for (const u of G.units) if (u.team === 'enemy') u.dead = true; G.pending = []; await PlaytestDebug.checkEnd(); })(); return true; })()`);
      await until(`document.querySelector('#end').classList.contains('win-screen')`);
    };
    const deploy = async () => { await wait(800); if (await js(`PlaytestState.mode === 'preparation'`)) await js(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Commencer|Lancer|Valider|Combattre/.test(b.textContent) && b.offsetParent); if (b) b.click(); return !!b; })()`); };
    await until(`!!document.querySelector('.choice-list')`);
    await clickIn('.choice-list button', 'Classique');
    return { pw, js, until, clickIn, win, deploy };
  };
  editor.webContents.once('did-finish-load', async () => {
    try {
      // 1. avec le camp : acte 1 gagné → retour au camp → Cloud annoncé et dans l'équipe
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-recruit-')), 'Jeu');
      io.createProject(dir, 'Recrues', 'sample', path.join(__dirname, '..', 'assets'));
      const a = await play(dir);
      await a.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      result.depart = await a.js(`PlaytestState.campaign.recruited`);
      assert.ok(!result.depart.includes('c_cloud'), 'Cloud pas encore recruté');
      await a.js(`PlaytestLobby.click(PlaytestLobby.state.cfg.board.x, PlaytestLobby.state.cfg.board.y)`); await wait(500);
      await a.clickIn('#lobby-panel .lp-go', 'Partir');
      await a.until(`!!document.querySelector('.modal-back')`); await a.clickIn('.modal-back button', 'Partir');
      await a.deploy(); await a.win();
      await a.clickIn('#end button', 'Retour au camp');
      await a.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await a.until(`document.body.innerText.includes('Nouvelle recrue : Cloud')`);
      result.annonce = await a.js(`PlaytestLobby.state.joined`);
      assert.deepEqual(result.annonce, ['Cloud']);
      await a.js('PlaytestLobby.openMenu()');
      await a.js(`PlaytestState.menu.items.find(i => i.label === 'Équipe').action()`);
      await a.until(`!!document.querySelector('[data-team-unit="c_cloud"]')`);
      a.pw.close(); await wait(500);
      // 2. sans camp : « Acte suivant → » compte l'acte comme terminé, Cloud recruté au chapitre suivant
      const dir2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-recruit2-')), 'Jeu');
      const p2 = io.createProject(dir2, 'Recrues', 'sample', path.join(__dirname, '..', 'assets'));
      p2.meta.lobby.enabled = false; io.saveProject(dir2, p2);
      const b = await play(dir2);
      await b.deploy(); await b.win();
      result.boutons = await b.js(`[...document.querySelectorAll('#end button')].map(x => x.textContent)`);
      await b.clickIn('#end button', 'Acte suivant');
      await b.until(`PlaytestState.chapter && PlaytestState.chapter.id !== 'ch_1'`);
      result.sansCamp = { cleared: await b.js(`PlaytestState.campaign.cleared`), recrues: await b.js(`PlaytestState.campaign.recruited`) };
      assert.ok(result.sansCamp.cleared.includes('ch_1') && result.sansCamp.recrues.includes('c_cloud'), JSON.stringify(result.sansCamp));
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
