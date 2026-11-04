/*
 * Plugin « Fire Emblem 7 — Unités génériques » : installé dans un projet, les sprites rejoignent les classes vides ;
 * Hector affronte un brigand qui prend l'animation du pirate de FE7 et le sprite de map du guerrier (captures).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-fe7-generics.js npm start
 */
'use strict';
require('./auto-deploy.js'); // écran des préparatifs validé avec la sélection par défaut
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
const pio = require(path.join(__dirname, '..', 'src/main/plugins-io.js'));
const Plugins = require(path.join(__dirname, '..', 'src/shared/plugins.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-g7-')), 'Jeu');
        io.createProject(dir, 'Generiques', 'sample', path.join(__dirname, '..', 'assets'));
        const q = io.loadProject(dir); q.meta.lobby.enabled = false; q.meta.settings.battleAnims = true; q.meta.settings.trueHit = false;
        for (const sp of q.db.supports) sp.startPoints = 0;
        const r = pio.install(dir, pio.bundledDir(path.join(__dirname, '..', 'plugins'), 'fe7-unites-generiques'));
        q.meta.plugins = { 'fe7-unites-generiques': { enabled: true, version: r.manifest.version, name: r.manifest.name } };
        q.resources = io.loadProject(dir).resources;
        for (const c of q.db.classes) { if (['soldier', 'knight', 'archer'].includes(c.id)) { c.battler = ''; c.mapSprite = ''; } }
        result.links = Plugins.applyLinks(q.db, r.manifest.links, { has: Plugins.hasIn(q.resources) });
        const brig = q.db.classes.find(c => c.id === 'brigand');
        brig.battler = 'ressources/personnages/Pirate/combat_FE7'; brig.mapSprite = 'ressources/personnages/Warrior/map_FE7';
        result.soldier = q.db.classes.find(c => c.id === 'soldier');
        if (!result.soldier || result.soldier.battler !== 'ressources/personnages/Soldier/combat_FE7') errs.push('soldat non relié');
        io.saveProject(dir, q);
        const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
        wc.on('console-message', (e, l, m) => { if (l >= 2 && !/play\(\)|NotAllowed|NotSupported|no supported source/i.test(m)) errs.push(m); });
        await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
        const js = c => wc.executeJavaScript(c, true);
        const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
        await until(`!!document.querySelector('.choice-list')`);
        await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
        await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
        fs.writeFileSync(path.join(out, 'map.png'), (await wc.capturePage()).toPNG());
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
        let shots = 0, seen = false;
        for (let i = 0; i < 260; i++) {
          await wait(60);
          const on = await js(`BattleScene.isActive()`);
          if (on) { seen = true; if (i % 3 === 0 && shots < 30) fs.writeFileSync(path.join(out, `combat_${String(shots++).padStart(2, '0')}.png`), (await wc.capturePage()).toPNG()); }
          if (seen && !on && await js(`!PlaytestState.busy`)) break;
        }
        result.shots = shots;
        if (!seen) errs.push('pas d’animation de combat');
    } catch (e) { errs.push(String(e && e.stack || e)); }
    finish();
  });
};
