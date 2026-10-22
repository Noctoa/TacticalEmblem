/*
 * Plugin Invocations depuis l'éditeur : projet neuf sans gacha, installation dans Base de données › Plugins
 * (onglet Invocations, rareté, Système › Invocations et autel du camp tout de suite), désactivation (tout est
 * caché, les données restent), réactivation, désinstallation ; puis un ancien projet qui se servait des
 * invocations reçoit le plugin automatiquement à l'ouverture.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-invocation-plugin.js npm start
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
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900); win.show();
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async n => { win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      const tabs = () => ejs(`[...document.querySelectorAll('#db-tabs button')].map(b => b.dataset.tab)`);
      const closeModal = () => ejs(`(() => { const b = [...document.querySelectorAll('.modal-back button')].pop(); b && b.click(); })()`);

      // 1. projet neuf : pas d'invocations
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-invoc-ui-')), 'Jeu');
      io.createProject(dir, 'Sans gacha', 'sample', path.join(__dirname, '..', 'assets'));
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1200);
      await ejs(`DBEditor.open('plugins')`); await wait(1200);
      result.avant = { onglets: await tabs(), bannieres: await ejs(`(Editor.db().banners || []).length`), autel: await ejs(`!!(Editor.project().meta.lobby.summon)`) };
      assert(!result.avant.onglets.includes('banners') && !result.avant.bannieres && !result.avant.autel, 'projet neuf sans invocations');
      await ejs(`document.querySelector('[data-plugin="invocations"]').click()`); await wait(300);
      await shot('a_plugin_fourni');

      // 2. installation : tout apparaît sans rouvrir le projet
      await ejs(`document.querySelector('[data-plugin-install="invocations"]').click()`); await wait(2500);
      await closeModal(); await wait(300);
      result.installe = { onglets: await tabs(), bannieres: await ejs(`Editor.db().banners.map(b => b.name)`), autel: await ejs(`Editor.project().meta.lobby.summon`),
        orbesActe: await ejs(`Editor.db().chapters[0].orbs`), fichiers: fs.readdirSync(path.join(dir, 'plugins', 'invocations')).sort() };
      assert(result.installe.onglets.includes('banners'), 'onglet Invocations');
      assert(result.installe.bannieres.length === 2 && result.installe.autel && result.installe.autel.x === 9, 'bannières et autel préparés');
      await ejs(`DBEditor.open('banners')`); await wait(500); await shot('b_onglet_invocations');
      await ejs(`DBEditor.open('units', 'c_lyn')`); await wait(500);
      result.rarete = await ejs(`[...document.querySelectorAll('#db-body .field-label')].some(l => l.textContent.includes('Rareté'))`);
      assert(result.rarete, 'champ Rareté sur les unités');
      await ejs(`DBEditor.open('system')`); await wait(500);
      result.systeme = await ejs(`[...document.querySelectorAll('#db-body .form-heading')].map(h => h.textContent)`);
      assert(result.systeme.includes('Invocations'), 'section Système › Invocations');
      await shot('c_systeme');

      // 3. désactivation : caché ; réactivation : de retour
      await ejs(`DBEditor.open('plugins')`); await wait(600);
      await ejs(`document.querySelector('[data-plugin="invocations"]').click()`); await wait(300);
      await ejs(`(() => { const b = document.querySelector('[data-plugin-enabled="invocations"]'); b.checked = false; b.dispatchEvent(new Event('change')); })()`); await wait(800);
      result.desactive = { onglets: await tabs(), bannieres: await ejs(`Editor.db().banners.length`), lieux: await ejs(`Lobby.places().length`) };
      assert(!result.desactive.onglets.includes('banners') && result.desactive.bannieres === 2 && result.desactive.lieux === 0, 'désactivé : caché, données gardées');
      await ejs(`(() => { const b = document.querySelector('[data-plugin-enabled="invocations"]'); b.checked = true; b.dispatchEvent(new Event('change')); })()`); await wait(800);
      result.reactive = await tabs();
      assert(result.reactive.includes('banners'), 'réactivé');

      // 4. désinstallation (confirmation acceptée)
      await ejs(`document.querySelector('[data-plugin-remove="invocations"]').click()`); await wait(400);
      await ejs(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent.includes('Désinstaller')).click()`); await wait(1200);
      result.desinstalle = { onglets: await tabs(), dossier: fs.existsSync(path.join(dir, 'plugins', 'invocations')), bannieres: await ejs(`Editor.db().banners.length`) };
      assert(!result.desinstalle.onglets.includes('banners') && !result.desinstalle.dossier && result.desinstalle.bannieres === 2, 'désinstallé');
      await ejs(`DBEditor.close()`); await wait(300);

      // 5. ancien projet (avant le plugin) : bannières et autel, sans plugin ni migration notée → plugin installé à l'ouverture
      const old = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-invoc-old-')), 'Ancien');
      const p = io.createProject(old, 'Ancien', 'sample', path.join(__dirname, '..', 'assets'));
      delete p.meta.pluginMigrations;
      p.db.banners = [{ id: 'bn_old', name: 'Vieille bannière', pool: ['c_lyn', 'c_hector'], focus: [], rates: { 5: 6, 4: 58, 3: 36 } }];
      p.meta.summon = { enabled: true, startOrbs: 12, costs: [5, 4, 4, 4, 3], pityEvery: 5, pityStep: 0.5 };
      p.meta.lobby.summon = { enabled: true, x: 9, y: 7, name: 'Vieil autel' };
      io.saveProject(old, p);
      await ejs(`EditorState.dirty = false`); // pas de « Enregistrer les modifications ? »
      await ejs(`Editor.open(${JSON.stringify(old)})`); await wait(3000);
      result.migration = { installe: fs.existsSync(path.join(old, 'plugins', 'invocations', 'main.js')), lieux: await ejs(`Lobby.places().map(p => p.key)`),
        bannieres: await ejs(`Editor.db().banners.map(b => b.id)`), orbes: await ejs(`Editor.project().meta.summon.startOrbs`), notee: await ejs(`Editor.project().meta.pluginMigrations`) };
      assert(result.migration.installe && result.migration.lieux.includes('summon'), 'migration : plugin installé');
      assert(JSON.stringify(result.migration.bannieres) === '["bn_old"]' && result.migration.orbes === 12, 'migration : données d’origine gardées');
      await shot('d_migration');
    } catch (e) { errs.push(String(e && e.stack || e)); }
    finish();
  });
};
