/*
 * Musiques : l'acte remplace la musique de phase du projet ; pendant l'animation de combat, la musique de combat
 * (FE5 « Attack ») joue, la musique de la map est en pause puis reprend.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-music.js npm start
 */
'use strict';
require('./auto-deploy.js'); // écran des préparatifs validé avec la sélection par défaut
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-mu-')), 'Jeu');
        io.createProject(dir, 'Musiques', 'sample', path.join(__dirname, '..', 'assets'));
        const q = io.loadProject(dir); q.meta.lobby.enabled = false; q.meta.settings.battleAnims = true; q.meta.settings.trueHit = false;
        for (const sp of q.db.supports) sp.startPoints = 0;
        const LEIF = 'ressources/musiques/FE5/FE5 - Leif’s Army, Seeking Victory ~ Leif.ogg';
        q.db.chapters[0].music = { playerPhase: LEIF, enemyPhase: '' };
        io.saveProject(dir, q);
        const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
        wc.on('console-message', (e, l, m) => { if (l >= 2 && !/play\(\)|NotAllowed|NotSupported|no supported source/i.test(m)) errs.push(m); });
        await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
        const js = c => wc.executeJavaScript(c, true);
        const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
        await until(`!!document.querySelector('.choice-list')`);
        await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
        await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
        result.phase = await js(`Music.state().current`);
        if (result.phase !== LEIF) errs.push('musique de phase : ' + result.phase);
        result.battleTrack = await js(`Music.track('battlePlayer')`);
        if (!/Attack\.ogg$/.test(result.battleTrack)) errs.push('musique de combat : ' + result.battleTrack);
        await js(`(() => { const G = PlaytestState;
          const h = G.units.find(u => u.name === 'Hector'), b = G.units.find(u => u.team === 'enemy' && !u.isBoss);
          for (const u of G.units) if (u !== h && u !== b) { u.x = u.rx = 0; u.y = u.ry = u.team === 'enemy' ? 0 : 14; }
          h.x = h.rx = 7; h.y = h.ry = 9; b.x = b.rx = 8; b.y = b.ry = 9;
          G.cursor = { x: 7, y: 9 }; })()`);
        const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
        await key('Z'); await until(`PlaytestState.ui === 'moving'`);
        await key('Z'); await until(`PlaytestState.ui === 'menu'`);
        await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(400);
        await key('Z');
        result.during = null;
        for (let i = 0; i < 200; i++) {
          await wait(70);
          if (!result.during && await js(`BattleScene.isActive()`)) { await wait(600); result.during = await js(`Music.state()`); fs.writeFileSync(path.join(out, 'combat.png'), (await wc.capturePage()).toPNG()); }
          if (result.during && await js(`!PlaytestState.busy && !BattleScene.isActive()`)) break;
        }
        await wait(800);
        result.after = await js(`Music.state()`);
        if (!result.during || !result.during.battle) errs.push('pas de musique de combat pendant le combat');
        if (result.after.battle || result.after.current !== LEIF) errs.push('la musique de la map ne reprend pas');
        fs.writeFileSync(path.join(out, 'apres.png'), (await wc.capturePage()).toPNG());
    } catch (e) { errs.push(String(e && e.stack || e)); }
    finish();
  });
};
