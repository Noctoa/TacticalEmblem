/*
 * Sprite de map de Xarrin (pose unique, base 32) : éditeur, base de données, jeu ; pack FE7 qui recopie
 * et relie les ressources d'un personnage absent (Lyn retirée du projet).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-xarrin-sprite.js npm start
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
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-xarrin-')), 'Jeu');
      io.createProject(dir, 'Xarrin', 'sample', path.join(__dirname, '..', 'assets'));
      // projet sans Lyn (ni fiche, ni ressources) : le pack FE7 doit la recréer avec ses images
      const p0 = io.loadProject(dir);
      p0.db.units = p0.db.units.filter(u => u.id !== 'c_lyn');
      for (const c of p0.db.chapters) for (const k of ['players', 'allies']) if (c[k]) c[k] = c[k].filter(x => x.unitId !== 'c_lyn');
      if (p0.meta.lobby) { p0.meta.lobby.spots = (p0.meta.lobby.spots || []).filter(s => s.unitId !== 'c_lyn'); p0.meta.lobby.startTeam = (p0.meta.lobby.startTeam || []).filter(id => id !== 'c_lyn'); }
      p0.db.talks = (p0.db.talks || []).filter(t => t.unitId !== 'c_lyn');
      p0.db.supports = (p0.db.supports || []).filter(s => s.a !== 'c_lyn' && s.b !== 'c_lyn');
      for (const b of p0.db.banners || []) { b.pool = b.pool.filter(id => id !== 'c_lyn'); b.focus = b.focus.filter(id => id !== 'c_lyn'); }
      for (const c of p0.db.classes) if ((c.mapSprite || '').includes('/Lyn/') || (c.battler || '').includes('/Lyn/')) { c.mapSprite = ''; c.battler = ''; }
      io.saveProject(dir, p0);
      fs.rmSync(path.join(dir, 'ressources', 'personnages', 'Lyn'), { recursive: true });
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async (n, wc = win.webContents) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      win.show();
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1200);
      result.sprite = await ejs(`Editor.db().units.find(u => u.id === 'c_xarrin').mapSprite`);
      result.ressource = await ejs(`!!Editor.resources().characters['ressources/personnages/Xarrin/map_Lord']`);
      assert(result.ressource, 'ressource Xarrin/map_Lord absente');
      await ejs(`Editor.selectChapter && Editor.selectChapter('ch_1')`); await wait(600);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F3' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F3' }); await wait(500);
      await shot('a_editeur_map');
      await ejs(`DBEditor.open('resources')`); await wait(600);
      await ejs(`[...document.querySelectorAll('#db-body .db-item')].find(e => (e.title || '').endsWith('Xarrin/map_Lord')).click()`); await wait(900);
      await shot('b_ressource_xarrin');
      await ejs(`DBEditor.open('units', 'c_xarrin')`); await wait(700); await shot('c_fiche_xarrin');
      // pack FE7 : Lyn revient, avec portrait (fichiers recopiés depuis les ressources de base)
      await ejs(`DBEditor.open('units')`); await wait(400);
      await ejs(`document.querySelector('[data-fe-pack]').click()`); await wait(500);
      await ejs(`document.querySelectorAll('.fe-pack-row input').forEach(i => { if (i.checked !== (i.dataset.game === 'fe7')) i.click(); })`);
      await ejs(`document.querySelector('[data-fe-pack-ok]').click()`); await wait(1500);
      result.lyn = await ejs(`(() => { const u = Editor.db().units.find(x => x.name === 'Lyn'); return u && { id: u.id, portrait: u.portrait, battler: u.battler, mapSprite: u.mapSprite }; })()`);
      result.toast = await ejs(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`);
      result.lynFichiers = fs.existsSync(path.join(dir, 'ressources/personnages/Lyn')) ? fs.readdirSync(path.join(dir, 'ressources/personnages/Lyn')).sort() : [];
      assert(result.lyn && result.lyn.portrait === 'ressources/personnages/Lyn/portrait.png', 'portrait Lyn');
      assert(result.lynFichiers.includes('portrait.png') && result.lynFichiers.includes('combat.json'), 'fichiers Lyn');
      await ejs(`DBEditor.open('units', ${JSON.stringify(result.lyn.id)})`); await wait(700); await shot('d_fiche_lyn_pack');
      await ejs(`DBEditor.close()`);
      win.webContents.send('menu', 'save'); await wait(1500);
      // en jeu : premier acte
      const p = io.loadProject(dir); p.meta.lobby.enabled = false;
      const ch = p.db.chapters.find(c => c.id === 'ch_1'); ch.events = [];
      io.saveProject(dir, p);
      const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      await js(`(() => { const G = PlaytestState; const x = G.units.find(u => u.name === 'Xarrin'); G.cursor = { x: x.x, y: x.y }; })()`); await wait(600);
      await shot('e_jeu', wc);
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
