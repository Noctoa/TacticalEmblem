/*
 * Pack de ressources « Fire Emblem GBA » : import FE6 depuis Unités › Personnages de la série (dossiers copiés,
 * Roy relié à ses animations), bouton du pack dans Ressources, puis un combat de Roy (animation du pack).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-fe-gba.js npm start
 */
'use strict';
require('./auto-deploy.js');
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 170000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-gba-')), 'Jeu');
      io.createProject(dir, 'GBA', 'sample', path.join(__dirname, '..', 'assets'));
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async (n, wc = win.webContents) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      win.show();
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1200);
      await ejs(`DBEditor.open('units')`); await wait(400);
      await ejs(`document.querySelector('[data-fe-pack]').click()`); await wait(500);
      await ejs(`document.querySelectorAll('.fe-pack-row input').forEach(i => { if (i.checked !== (i.dataset.game === 'fe6')) i.click(); })`);
      await ejs(`document.querySelector('[data-fe-pack-ok]').click()`); await wait(2000);
      result.toast = await ejs(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`);
      result.roy = await ejs(`(() => { const u = Editor.db().units.find(x => x.name === 'Roy'); return u && { id: u.id, portrait: u.portrait, battler: u.battler, mapSprite: u.mapSprite, classId: u.classId }; })()`);
      result.dossiers = fs.readdirSync(path.join(dir, 'ressources', 'personnages')).sort();
      assert(result.roy && /Roy\/combat_Lord$/.test(result.roy.battler), 'battler de Roy');
      assert(result.dossiers.includes('Roy'), 'dossier Roy copié');
      result.classes = await ejs(`Editor.db().classes.filter(c => /ressources\\/personnages\\/(?!Eliwood|Lyn|Hector|Brigand|Cloud|Xarrin)/.test(c.battler + c.mapSprite)).map(c => c.id + ':' + (c.battler || '-') + '|' + (c.mapSprite || '-'))`);
      await ejs(`DBEditor.open('units', ${JSON.stringify(result.roy.id)})`); await wait(800); await shot('a_fiche_roy');
      await ejs(`DBEditor.open('resources')`); await wait(600);
      await ejs(`[...document.querySelectorAll('#db-body .db-item')].find(e => (e.title || '').endsWith('Roy/combat_Lord')).click()`); await wait(1200);
      await shot('b_ressource_roy');
      // bouton du pack complet
      await ejs(`document.querySelector('[data-gba-pack]').click()`); await wait(2500);
      result.alerte = await ejs(`(document.querySelector('.modal-back') || {}).textContent || ''`);
      await ejs(`(() => { const b = [...document.querySelectorAll('.modal-back button')].pop(); b && b.click(); })()`); await wait(300);
      result.dossiersApres = fs.readdirSync(path.join(dir, 'ressources', 'personnages')).length;
      result.fonds = await ejs(`Editor.db().terrains.filter(t => t.battleback).map(t => t.id + ':' + t.battleback.split('/').pop())`);
      assert(result.fonds.length >= 12 && fs.existsSync(path.join(dir, 'ressources', 'fonds-combat', 'fe6-plaine.png')), 'fonds de combat');
      await ejs(`DBEditor.open('tilesets')`); await wait(400);
      await ejs(`(() => { const it = [...document.querySelectorAll('#db-body .db-item')].find(e => e.textContent.includes('Forêt')); it && it.click(); })()`); await wait(500);
      await shot('b2_terrain_foret');
      await ejs(`DBEditor.close()`);
      win.webContents.send('menu', 'save'); await wait(1500);
      // combat : Roy remplace Hector dans le premier acte
      const p = io.loadProject(dir); p.meta.lobby.enabled = false; p.meta.settings.battleAnims = true;
      for (const sp of p.db.supports) sp.startPoints = 0;
      const ch = p.db.chapters.find(c => c.id === 'ch_1'); ch.events = [];
      const hp = ch.players.find(x => x.unitId === 'c_hector'); hp.unitId = result.roy.id;
      io.saveProject(dir, p);
      const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      await js(`(() => { const G = PlaytestState;
        const h = G.units.find(u => u.name === 'Roy'), b = G.units.find(u => u.team === 'enemy' && !u.isBoss);
        for (const u of G.units) if (u !== h && u !== b) { u.x = u.rx = 0; u.y = u.ry = u.team === 'enemy' ? 0 : 14; }
        h.x = h.rx = 7; h.y = h.ry = 9; b.x = b.rx = 8; b.y = b.ry = 9; G.cursor = { x: 7, y: 9 }; })()`);
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      await key('Z'); await until(`PlaytestState.ui === 'moving'`);
      await key('Z'); await until(`PlaytestState.ui === 'menu'`);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(400);
      await key('Z');
      let n = 0;
      for (let i = 0; i < 160; i++) {
        await wait(70);
        if (i % 6 === 2 && n < 14) { fs.writeFileSync(path.join(out, `c_combat_${String(n).padStart(2, '0')}.png`), (await wc.capturePage()).toPNG()); n++; }
        if (i > 20 && await js(`!PlaytestState.busy && !BattleScene.isActive()`)) break;
      }
      result.combatImages = n;
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
