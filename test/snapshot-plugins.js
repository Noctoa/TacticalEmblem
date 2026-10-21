/*
 * Plugins : onglet Plugins de la base de données, installation du plugin FE6 (ressources + liens) et du plugin
 * d'exemple (script), import des personnages FE6 (images venues du plugin), combat avec fond de combat,
 * script actif dans le jeu, désinstallation.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-plugins.js npm start
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
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 200000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-plug-')), 'Jeu');
      io.createProject(dir, 'Plugins', 'sample', path.join(__dirname, '..', 'assets'));
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async (n, wc = win.webContents) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      const closeModal = () => ejs(`(() => { const b = [...document.querySelectorAll('.modal-back button')].pop(); b && b.click(); })()`);
      win.show();
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1200);
      await ejs(`DBEditor.open('plugins')`); await wait(1200);
      result.liste = await ejs(`[...document.querySelectorAll('#db-body [data-plugin]')].map(e => e.dataset.plugin)`);
      assert(result.liste.length === 5, 'plugins fournis : ' + result.liste);
      await ejs(`document.querySelector('[data-plugin="fe6-binding-blade"]').click()`); await wait(300);
      await shot('a_plugins');
      await ejs(`document.querySelector('[data-plugin-install="fe6-binding-blade"]').click()`); await wait(3000);
      result.alerte = await ejs(`(document.querySelector('.modal-back') || {}).textContent || ''`);
      await shot('b_plugin_installe');
      await closeModal(); await wait(300);
      result.meta = await ejs(`Editor.project().meta.plugins`);
      result.fonds = await ejs(`Editor.db().terrains.filter(t => t.battleback).length`);
      result.classes = await ejs(`Editor.db().classes.filter(c => /personnages\\/(Archer|Knight|Mage|Cavalier)\\//.test(c.battler + c.mapSprite)).map(c => c.id)`);
      assert(result.meta && result.meta['fe6-binding-blade'] && result.fonds >= 12 && result.classes.length >= 3, 'liens du plugin FE6');
      assert(fs.existsSync(path.join(dir, 'ressources', 'personnages', 'Roy', 'combat_Lord.json')), 'ressources FE6 copiées');
      // plugin script
      await ejs(`document.querySelector('[data-plugin="exemple-annonce-tours"]').click()`); await wait(300);
      await ejs(`document.querySelector('[data-plugin-install="exemple-annonce-tours"]').click()`); await wait(1500);
      await closeModal(); await wait(300);
      // personnages FE6 : images du plugin
      await ejs(`DBEditor.open('units')`); await wait(400);
      await ejs(`document.querySelector('[data-fe-pack]').click()`); await wait(500);
      await ejs(`document.querySelectorAll('.fe-pack-row input').forEach(i => { if (i.checked !== (i.dataset.game === 'fe6')) i.click(); })`);
      await ejs(`document.querySelector('[data-fe-pack-ok]').click()`); await wait(1500);
      result.roy = await ejs(`(() => { const u = Editor.db().units.find(x => x.name === 'Roy'); return u && { id: u.id, portrait: u.portrait, battler: u.battler, mapSprite: u.mapSprite }; })()`);
      assert(result.roy && /Roy\/combat_Lord$/.test(result.roy.battler) && /Roy\/portrait.png$/.test(result.roy.portrait), 'images de Roy (plugin)');
      await ejs(`DBEditor.close()`);
      win.webContents.send('menu', 'save'); await wait(1500);
      // jeu : script actif, combat avec fond
      const p = io.loadProject(dir); p.meta.lobby.enabled = false; p.meta.settings.battleAnims = true;
      for (const sp of p.db.supports) sp.startPoints = 0;
      const ch = p.db.chapters.find(c => c.id === 'ch_1'); ch.events = [];
      ch.players.find(x => x.unitId === 'c_hector').unitId = result.roy.id;
      io.saveProject(dir, p);
      const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
      await until(`!!document.querySelector('.choice-list')`);
      result.scripts = await js(`TacticalEmblem.loaded().map(s => s.split('/').slice(-2).join('/'))`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      result.toasts = await js(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`);
      assert(result.scripts.length === 1 && result.toasts.some(t => /Tour 1/.test(t)), 'script du plugin');
      await shot('c_jeu_script', wc);
      await js(`(() => { const G = PlaytestState;
        const h = G.units.find(u => u.name === 'Roy'), b = G.units.find(u => u.team === 'enemy' && !u.isBoss);
        for (const u of G.units) if (u !== h && u !== b) { u.x = u.rx = 0; u.y = u.ry = u.team === 'enemy' ? 0 : 14; }
        h.x = h.rx = 7; h.y = h.ry = 9; b.x = b.rx = 8; b.y = b.ry = 9; G.cursor = { x: 7, y: 9 }; })()`);
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      await key('Z'); await until(`PlaytestState.ui === 'moving'`);
      await key('Z'); await until(`PlaytestState.ui === 'menu'`);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(400);
      await key('Z'); await wait(1300);
      await shot('d_combat_fond', wc);
      for (let i = 0; i < 160; i++) { await wait(70); if (i > 20 && await js(`!PlaytestState.busy && !BattleScene.isActive()`)) break; }
      pw.close(); await wait(400);
      // désinstallation du plugin d'exemple
      await ejs(`DBEditor.open('plugins')`); await wait(1200);
      await ejs(`document.querySelector('[data-plugin="exemple-annonce-tours"]').click()`); await wait(300);
      await ejs(`document.querySelector('[data-plugin-remove="exemple-annonce-tours"]').click()`); await wait(400);
      await ejs(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent.includes('Désinstaller')).click()`); await wait(1200);
      result.apres = await ejs(`[...document.querySelectorAll('#db-body [data-plugin]')].map(e => e.dataset.plugin + ':' + e.closest('.db-list-items').textContent.indexOf(e.textContent))`);
      result.installesApres = fs.readdirSync(path.join(dir, 'plugins'));
      assert(!result.installesApres.includes('exemple-annonce-tours'), 'désinstallé');
      await shot('e_apres_desinstallation');
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
