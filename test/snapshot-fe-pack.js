/*
 * Pack « Personnages de la série » : import depuis Base de données › Unités, tri par série, bannières par jeu ;
 * puis action Danser en jeu (Olivia redonne son tour à Xarrin).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-fe-pack.js npm start
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
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-fepack-')), 'Jeu');
      io.createProject(dir, 'Pack', 'sample', path.join(__dirname, '..', 'assets'));
      require('./fixtures/plugin-host').installBundled(dir, 'invocations'); // les invocations sont un plugin
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async (n, wc = win.webContents) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      win.show();
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1000);
      await ejs(`DBEditor.open('units')`); await wait(500);
      await ejs(`document.querySelector('[data-fe-pack]').click()`); await wait(500);
      result.jeux = await ejs(`[...document.querySelectorAll('.fe-pack-row')].map(r => r.textContent)`);
      await shot('a_import');
      await ejs(`document.querySelector('[data-fe-pack-ok]').click()`); await wait(800);
      result.apres = await ejs(`({ unites: Editor.db().units.length, classes: Editor.db().classes.length, bannieres: Editor.db().banners.map(b => b.name) })`);
      assert(result.apres.unites > 170 && result.apres.bannieres.length === 15, 'import');
      await ejs(`(() => { const s = document.querySelector('#db-body .roster-sort'); s.value = 'series'; s.dispatchEvent(new Event('change')); })()`); await wait(300);
      result.groupes = await ejs(`[...document.querySelectorAll('#db-body .db-group')].map(g => g.textContent)`);
      await shot('b_tri_serie');
      await ejs(`DBEditor.open('units', 'fe_fe13_olivia')`); await wait(500); await shot('c_fiche_olivia');
      await ejs(`DBEditor.open('banners', 'bn_fe13')`); await wait(500); await shot('d_banniere_awakening');
      win.webContents.send('menu', 'save'); await wait(1500);
      // danse : Olivia à côté de Xarrin dans le premier acte
      const p = io.loadProject(dir);
      p.meta.lobby.enabled = false;
      const ch = p.db.chapters.find(c => c.id === 'ch_1'); ch.events = [];
      ch.players.push({ id: 'p9', unitId: 'fe_fe13_olivia', x: 6, y: 12 });
      io.saveProject(dir, p);
      const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c) => { for (let i = 0; i < 200; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      result.olivia = await js(`(() => { const o = PlaytestState.units.find(u => u.name === 'Olivia'); return o && [o.x, o.y]; })()`);
      await js(`(() => { const G = PlaytestState; const x = G.units.find(u => u.name === 'Xarrin'); const o = G.units.find(u => u.name === 'Olivia'); x.x = x.rx = o.x - 1; x.y = x.ry = o.y; x.done = true; G.cursor = { x: o.x, y: o.y }; })()`);
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      await key('Z'); await until(`PlaytestState.ui === 'moving'`);
      await key('Z'); await until(`PlaytestState.ui === 'menu'`);
      result.menu = await js(`PlaytestState.menu.items.map(i => i.label)`);
      await shot('e_menu_danser', wc);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Danser').action()`); await wait(1500);
      result.danse = await js(`(() => { const G = PlaytestState; return { xarrin: G.units.find(u => u.name === 'Xarrin').done, olivia: G.units.find(u => u.name === 'Olivia').done }; })()`);
      assert(result.danse.xarrin === false && result.danse.olivia === true, 'danse');
      await shot('f_apres_danse', wc);
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
