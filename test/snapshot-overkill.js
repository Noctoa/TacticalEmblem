/*
 * Overkill : Hector (boosté) abat un brigand dès le premier coup, finit ses coups en overkill (animation de combat),
 * puis la même chose sans animation (sur la map). Vérifie le bonus d'EXP.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-overkill.js npm start
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
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 200000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const run = async (tag, anims) => {
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-ok-')), 'Jeu');
        io.createProject(dir, 'Overkill', 'sample', path.join(__dirname, '..', 'assets'));
        const q = io.loadProject(dir); q.meta.lobby.enabled = false; q.meta.settings.battleAnims = anims; q.meta.settings.trueHit = false;
        for (const sp of q.db.supports) sp.startPoints = 0; // pas d'attaque d'affinité
        io.saveProject(dir, q);
        const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
        wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push(tag + ': ' + m); });
        await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
        const js = c => wc.executeJavaScript(c, true);
        const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error(tag + ' délai ' + c); };
        await until(`!!document.querySelector('.choice-list')`);
        await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
        await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
        // Hector (7,9) contre un brigand fragile (8,9) : il le tue au 1er coup et double
        await js(`(() => { const G = PlaytestState;
          const h = G.units.find(u => u.name === 'Hector'), b = G.units.find(u => u.team === 'enemy' && !u.isBoss);
          for (const u of G.units) if (u !== h && u !== b) { u.x = u.rx = 0; u.y = u.ry = u.team === 'enemy' ? 0 : 14; }
          h.x = h.rx = 7; h.y = h.ry = 9; b.x = b.rx = 8; b.y = b.ry = 9;
          Object.assign(h.stats, { str: 28, skl: 30, spd: 30, lck: 30 });
          Object.assign(b.stats, { def: 0, spd: 0, hp: 18 }); b.hp = 18; window.__exp0 = h.exp; window.__lv0 = h.level;
          G.cursor = { x: 7, y: 9 }; })()`);
        const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
        await key('Z'); await until(`PlaytestState.ui === 'moving'`);
        await key('Z'); await until(`PlaytestState.ui === 'menu'`);
        await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(400);
        await key('Z');
        const shots = [];
        for (let i = 0; i < 140; i++) {
          await wait(70);
          if (i % 2 === 0 && shots.length < 60) { const n = `${tag}_${String(i).padStart(3, '0')}`; fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); shots.push(n); }
          if (i > 20 && await js(`!PlaytestState.busy && !BattleScene.isActive()`)) break;
        }
        await until(`!PlaytestState.busy`);
        result[tag] = await js(`(() => { const h = PlaytestState.units.find(u => u.name === 'Hector'); return { exp: [window.__lv0, window.__exp0, h.level, h.exp], brigandMort: !PlaytestState.units.some(u => u.team === 'enemy' && !u.isBoss && u.x === 8 && u.y === 9 && !u.dead) }; })()`);
        result[tag].shots = shots.length;
        pw.close(); await wait(500);
      };
      await run('anim', true);
      await run('map', false);
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
