/*
 * Fonds de combat de base : un projet neuf les a sur ses terrains ; un ancien projet (sans décors, sans migration
 * notée) les reçoit à l'ouverture, sans remplacer un décor déjà choisi ; combat animé sans plateforme sous les combattants.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-fonds-combat.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 90000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const assert = (c, m) => { if (!c) throw new Error(m); };
      // projet neuf
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-bb-')), 'Neuf');
      const p = io.createProject(dir, 'Neuf', 'sample', path.join(__dirname, '..', 'assets'));
      result.neuf = { fichiers: p.resources.battlebacks.length, plaine: p.db.terrains.find(t => t.id === 'plain').battleback };
      assert(result.neuf.fichiers === 19 && result.neuf.plaine === 'ressources/fonds-combat/fe6-plaine.png', 'projet neuf');
      // ancien projet : pas de dossier fonds-combat, terrains sans décor (sauf la forêt, choisie à la main)
      const old = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-bb-old-')), 'Ancien');
      const q = io.createProject(old, 'Ancien', 'sample', path.join(__dirname, '..', 'assets'));
      fs.rmSync(path.join(old, 'ressources', 'fonds-combat'), { recursive: true });
      for (const t of q.db.terrains) t.battleback = '';
      q.db.terrains.find(t => t.id === 'forest').battleback = 'ressources/fonds-combat/ma-foret.png';
      q.meta.pluginMigrations = ['invocations'];
      io.saveProject(old, q);
      win.show();
      await ejs(`Editor.open(${JSON.stringify(old)})`); await wait(2500);
      result.ancien = await ejs(`({ plaine: Editor.db().terrains.find(t => t.id === 'plain').battleback, foret: Editor.db().terrains.find(t => t.id === 'forest').battleback,
        fichiers: (Editor.resources().battlebacks || []).length, notee: Editor.project().meta.pluginMigrations })`);
      assert(result.ancien.plaine === 'ressources/fonds-combat/fe6-plaine.png' && result.ancien.foret === 'ressources/fonds-combat/ma-foret.png', 'terrains reliés sans écraser');
      assert(result.ancien.fichiers === 19 && result.ancien.notee.includes('fonds-combat'), 'décors copiés, migration notée');
    } catch (e) { errs.push(String(e && e.stack || e)); }
    finish();
  });
};
