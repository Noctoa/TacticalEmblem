/*
 * Annonces de phase dessinées (Lukiroh), flèche de déplacement façon Fire Emblem (Squidjees), fond des écrans sans décor.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-popups.js npm start
 */
'use strict';
require('./auto-deploy.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-popups-')), 'Jeu');
      const p = io.createProject(dir, 'Annonces', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false;
      Object.assign(p.db.chapters[0], { events: [], requiredUnits: [], objective: { type: 'survive', turns: 99 } });
      io.saveProject(dir, p);
      const win = openPlaytest(dir, p.db.chapters[0].id), wc = win.webContents;
      wc.setBackgroundThrottling(false); win.setSize(1100, 760); win.show();
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(50); } throw new Error('Délai : ' + c); };
      const shot = async n => { await wc.capturePage(); await wait(120); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      await new Promise(r => wc.once('did-finish-load', r));
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      // 1. annonce « Player Phase »
      await until(`!!document.querySelector('#banner.phase img') && !document.querySelector('#banner').classList.contains('hidden')`);
      result.annonce = await js(`document.querySelector('#banner.phase img').getAttribute('src')`);
      assert(/phase-player\.png$/.test(result.annonce), 'annonce : ' + result.annonce);
      await js(`document.querySelector('#banner.phase img').style.animation = 'none'`); // image figée au centre pour la capture
      await shot('a_phase_joueur');
      assert(await js(`document.querySelector('#banner.phase img').naturalWidth > 0`), 'image chargée');
      await until('!!PlaytestState.map && !PlaytestState.busy', 20000);
      // 2. cases de la flèche : départ, droit, coin, pointe
      result.cases = await js(`PlaytestDebug.arrowTiles([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }])`);
      assert(JSON.stringify(result.cases) === '[0,14,5,12,7,10]', 'cases : ' + result.cases);
      // 3. flèche sur la map : le héros sélectionné, curseur à 2 cases avec un coin
      await js(`(() => { const G = PlaytestState; window.H = G.units.find(u => u.team === 'player' && !u.done); G.cursor = { x: H.x, y: H.y }; })()`);
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(120); };
      await key('Z'); await until(`PlaytestState.ui === 'moving'`);
      const target = await js(`(() => { const G = PlaytestState; for (const [k, n] of G.reach) { const [x, y] = k.split(',').map(Number); const d = Math.abs(x - H.x) + Math.abs(y - H.y); if (d >= 3 && x !== H.x && y !== H.y && !G.units.some(u => u !== H && u.x === x && u.y === y && !u.dead)) return { x, y }; } return null; })()`);
      assert(target, 'case atteignable avec un coin');
      await js(`PlaytestState.cursor = ${JSON.stringify(target)}`); await wait(300);
      result.chemin = await js(`(() => { const G = PlaytestState, n = G.reach.get(G.cursor.x + ',' + G.cursor.y); return PlaytestDebug.arrowTiles(Rules.pathTo(G.reach, n.x, n.y)); })()`);
      assert(result.chemin.length >= 3 && result.chemin.every(t => Number.isInteger(t)), 'chemin : ' + result.chemin);
      await shot('b_fleche');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
