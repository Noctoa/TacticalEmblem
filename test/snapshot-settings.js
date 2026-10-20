/*
 * Fenêtre Paramètres (Échap) : sauvegarde dans un emplacement, réglage du son, Debug au camp
 * (or, progression), chargement, puis en chapitre : Debug (invincibilité, déplacement, victoire).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-settings.js npm start
 */
'use strict';
require('./auto-deploy.js'); // écran des préparatifs validé avec la sélection par défaut
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {}, log = (k, v) => { result[k] = v; };
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-settings-')), 'Jeu');
      io.createProject(dir, 'Paramètres', 'sample', path.join(__dirname, '..', 'assets'));
      const pw = openPlaytest(dir, ''); const wc = pw.webContents;
      wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await wait(100); } throw new Error('Délai : ' + c); };
      const shot = async n => { wc.invalidate(); await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const key = async (k) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      const clickIn = (sel, text) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}) && !e.disabled); if (b) b.click(); return !!b; })()`);
      const confirmModal = async (text) => { await until(`!!document.querySelector('.modal-back')`); await js(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`); await wait(300); };
      const tab = async (name) => { await clickIn('#settings .st-tab', name); await wait(400); };

      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      // Échap ouvre la fenêtre
      await key('Escape');
      await until(`PlaytestSettings.isOpen`);
      await wait(300); await shot('a_sauvegarder');
      log('onglets', await js(`[...document.querySelectorAll('#settings .st-tab')].map(b => b.textContent)`));
      // sauvegarde emplacement 2
      await js(`document.querySelectorAll('#settings .st-slot')[1].querySelector('button').click()`); await wait(800);
      log('emplacements', await js(`[...document.querySelectorAll('#settings .st-slot')].map(r => r.textContent)`));
      log('fichier slot-2', fs.existsSync(path.join(dir, 'saves', 'slot-2.json')));
      // son
      await tab('Son');
      await js(`(() => { const r = document.querySelector('#settings input[type=range]'); r.value = 40; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()`);
      await wait(300); await shot('b_son');
      log('volumes', await js(`Music.state().volumes`));
      // debug au camp
      await tab('Debug');
      await clickIn('#settings .st-btn', '+1 000 or'); await wait(200);
      await clickIn('#settings .st-btn', 'Tout marquer terminé'); await wait(1600);
      if (!(await js(`PlaytestSettings.isOpen`))) { await key('Escape'); await until(`PlaytestSettings.isOpen`); await tab('Debug'); }
      await shot('c_debug_camp');
      log('après debug', await js(`({ or: PlaytestState.campaign.gold, terminés: PlaytestState.campaign.cleared.length, npcs: PlaytestLobby.state.npcs.map(u => u.name) })`));
      // chargement de l'emplacement 2 : retour à l'état sauvegardé
      await tab('Charger');
      await js(`document.querySelectorAll('#settings .st-slot')[1].querySelector('.st-go').click()`);
      await confirmModal('Charger');
      await until(`!PlaytestSettings.isOpen && PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      log('après chargement', await js(`({ or: PlaytestState.campaign.gold, terminés: PlaytestState.campaign.cleared.length, npcs: PlaytestLobby.state.npcs.map(u => u.name) })`));
      // départ en chapitre
      await js(`PlaytestLobby.click(PlaytestLobby.state.cfg.board.x, PlaytestLobby.state.cfg.board.y)`);
      await until(`!document.querySelector('#lobby-panel').classList.contains('hidden')`);
      await clickIn('#lobby-panel .lp-go', 'Partir'); await confirmModal('Partir');
      await until(`PlaytestState.mode === 'chapter' && !!PlaytestState.chapter`);
      for (let i = 0; i < 40 && !(await js(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`)); i++) { await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(200); }
      await js(`(() => { const e = PlaytestState.units.find(u => u.name === 'Eliwood'); PlaytestState.cursor = { x: e.x, y: e.y }; })()`);
      await key('Escape'); await until(`PlaytestSettings.isOpen`);
      await tab('Debug');
      await js(`[...document.querySelectorAll('#settings .st-check')].filter(l => /Invincibilité|Déplacement/.test(l.textContent)).forEach(l => l.querySelector('input').click())`); await wait(300);
      await shot('d_debug_chapitre');
      log('debug chapitre', await js(`({ debug: PlaytestState.debug, movEliwood: PlaytestState.units.find(u => u.name === 'Eliwood').mov, groupes: [...document.querySelectorAll('#settings .st-group h4')].map(e => e.textContent) })`));
      await tab('Sauvegarder');
      log('sauvegarde en chapitre', await js(`document.querySelector('#settings .st-info').textContent`));
      await tab('Debug');
      await clickIn('#settings .st-btn', 'Victoire immédiate');
      for (let i = 0; i < 60 && !(await js(`document.querySelector('#end').classList.contains('win-screen')`)); i++) { await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(150); }
      await wait(300); await shot('e_victoire_debug');
      log('fin', await js(`document.querySelector('#end').textContent`));
      // Échap sur l'écran de fin : paramètres (charger / sauvegarder)
      await key('Escape'); log('échap fin', await js(`PlaytestSettings.isOpen`));
      await key('Escape'); log('refermé', await js(`!PlaytestSettings.isOpen`));
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
