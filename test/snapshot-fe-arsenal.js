/*
 * Pack « Armes, objets et compétences de la série » : import depuis l'onglet Armes, fiches, puis combat
 * animé avec une Épée brave (deux coups par attaque).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-fe-arsenal.js npm start
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
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 160000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900); win.show();
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-arsenal-')), 'Jeu');
      io.createProject(dir, 'Arsenal', 'sample', path.join(__dirname, '..', 'assets'));
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async (n, wc = win.webContents) => { wc.invalidate(); await wc.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))', true); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1000);
      await ejs(`DBEditor.open('weapons')`); await wait(500);
      await ejs(`document.querySelector('[data-fe-arsenal]').click()`); await wait(500);
      result.groupesCoches = await ejs(`[...document.querySelectorAll('.fe-pack-row input:checked')].map(i => i.dataset.group)`);
      await shot('a_import_armes');
      await ejs(`[...document.querySelectorAll('.modal .insp-actions button')].find(b => b.textContent === 'Tout cocher').click()`); await wait(200);
      await ejs(`document.querySelector('[data-fe-arsenal-ok]').click()`); await wait(800);
      result.apres = await ejs(`({ armes: Editor.db().weapons.length, objets: Editor.db().items.length, competences: Editor.db().skills.length })`);
      assert(result.apres.armes > 100 && result.apres.objets > 20 && result.apres.competences > 40, 'import');
      const brave = await ejs(`Editor.db().weapons.find(w => w.name === 'Épée brave').id`);
      await ejs(`DBEditor.open('weapons', ${JSON.stringify(brave)})`); await wait(400); await shot('b_epee_brave');
      await ejs(`DBEditor.open('weapons', Editor.db().weapons.find(w => w.name === 'Lame runique').id)`); await wait(400); await shot('c_lame_runique');
      await ejs(`DBEditor.open('skills', Editor.db().skills.find(s => s.name === 'Coup mortel').id)`); await wait(400); await shot('d_coup_mortel');
      await ejs(`DBEditor.open('items', Editor.db().items.find(s => s.name === 'Bottes').id)`); await wait(400); await shot('e_bottes');
      win.webContents.send('menu', 'save'); await wait(1500);
      // combat animé : Hector reçoit une Hache brave contre un brigand solide
      const p = io.loadProject(dir); p.meta.lobby.enabled = false; for (const sp of p.db.supports) sp.startPoints = 0;
      const axe = p.db.weapons.find(w => w.name === 'Hache brave');
      p.db.units.find(u => u.id === 'c_hector').inventory = [{ id: axe.id }];
      io.saveProject(dir, p);
      const pw = openPlaytest(dir, 'ch_1'), wc = pw.webContents; wc.setBackgroundThrottling(false); pw.show();
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c) => { for (let i = 0; i < 250; i++) { if (await js(c)) return; await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(100); } throw new Error('délai ' + c); };
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`);
      await js(`(() => { const G = PlaytestState; G.debug.god = true;
        const h = G.units.find(u => u.name === 'Hector'), b = G.units.find(u => u.team === 'enemy' && !u.isBoss);
        for (const u of G.units) if (u !== h && u !== b) { u.x = u.rx = 0; u.y = u.ry = u.team === 'enemy' ? 0 : 14; }
        h.x = h.rx = 7; h.y = h.ry = 9; b.x = b.rx = 8; b.y = b.ry = 9; h.stats.str = 12; Object.assign(b.stats, { hp: 60, def: 3 }); b.hp = 60; window.__b = b;
        G.cursor = { x: 7, y: 9 }; })()`);
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      await key('Z'); await until(`PlaytestState.ui === 'moving'`);
      await key('Z'); await until(`PlaytestState.ui === 'menu'`);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(500);
      result.prevision = await js(`document.querySelector('#forecast') ? document.querySelector('#forecast').textContent : ''`);
      await shot('f_prevision_brave', wc);
      await key('Z');
      await until(`BattleScene.isActive()`);
      for (let i = 0; i < 6; i++) { await wait(700); if (i === 3) await shot('g_combat_brave', wc); }
      await until(`!PlaytestState.busy && !BattleScene.isActive()`);
      result.brigand = await js(`window.__b.hp`);
      assert(result.brigand < 60, 'dégâts');
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
