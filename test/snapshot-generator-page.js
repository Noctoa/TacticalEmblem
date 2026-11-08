/*
 * Section Générateur (barre d'icônes) : créer un personnage avec le générateur et exporter ses images en PNG dans un
 * dossier hors du projet (rien n'est ajouté au projet).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-generator-page.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code, true);
  const importFile = (selector, contents, filename = 'personnage_recette.json') => js(`(() => {
    const nativeClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { if (!this.matches('[data-cg-import-file]')) return nativeClick.call(this); };
    try {
      document.querySelector(${JSON.stringify(selector)}).click();
      const input = document.querySelector('[data-cg-import-file]');
      if (${contents === null}) input.dispatchEvent(new Event('cancel'));
      else {
        const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(contents)}], ${JSON.stringify(filename)}, { type: 'application/json' }));
        input.files = transfer.files; input.dispatchEvent(new Event('change'));
      }
    } finally { HTMLInputElement.prototype.click = nativeClick; }
  })()`);
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (code, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(code)) return; await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1600, 1000);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-gen-')), 'Jeu');
      io.createProject(dir, 'Generateur', 'sample', path.join(__dirname, '..', 'assets'));
      const exportDir = path.join(path.dirname(dir), 'export');
      process.env.TF_EXPORT_DIR = exportDir;
      await js(`localStorage.removeItem('tf.generator.creations'); localStorage.removeItem('tf.generator.exports')`);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      await js(`document.querySelector('[data-rail="generator"]').click()`);
      await until(`document.body.dataset.view === 'generator' && !!document.querySelector('#gen-body [data-gen-new]')`);
      await wait(300); await shot('a_vide');
      // nouveau personnage : le générateur s'ouvre, on le nomme et on valide
      await js(`document.querySelector('#gen-nav [data-gen-new]').click()`);
      await until(`!!document.querySelector('[data-cg-ok]') && !!document.querySelector('[data-cg-name]')`, 30000);
      await wait(800);
      await js(`(() => { const n = document.querySelector('[data-cg-name]'); n.value = 'Élise'; n.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-cg-ok]').click(); })()`);
      await until(`!!document.querySelector('[data-gen-item]') && !!document.querySelector('.gen-hero-img')`, 30000);
      await wait(800);
      result.creations = await js(`JSON.parse(localStorage.getItem('tf.generator.creations')).map(c => c.name)`);
      assert(JSON.stringify(result.creations) === JSON.stringify(['Élise']), 'créations : ' + result.creations);
      result.images = await js(`[...document.querySelectorAll('[data-gen-export]')].map(b => b.dataset.genExport + (b.checked ? '✓' : '') + (b.disabled ? '(off)' : ''))`);
      await shot('b_personnage');
      // export : fichiers PNG/JSON dans <dossier>/Élise/, rien dans le projet
      const before = fs.existsSync(path.join(dir, 'ressources', 'personnages')) ? fs.readdirSync(path.join(dir, 'ressources', 'personnages')).length : 0;
      // toutes les images cochées (le choix est gardé d'une fois sur l'autre)
      await js(`document.querySelectorAll('[data-gen-export]').forEach(b => { if (!b.disabled && !b.checked) { b.checked = true; b.dispatchEvent(new Event('change')); } })`);
      await js(`document.querySelector('[data-gen-export-btn]').click()`);
      await until(`!!document.querySelector('[data-gen-export-status] button')`, 20000);
      const outDir = path.join(exportDir, 'Élise');
      const recipeJSON = fs.readFileSync(path.join(outDir, 'Elise_recette.json'), 'utf8');
      result.fichiers = fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : [];
      for (const f of ['Elise_faceset.png', 'Elise_portrait.png', 'Elise_map.png', 'Elise_map.json', 'Elise_recette.json']) assert(result.fichiers.includes(f), 'fichier manquant : ' + f + ' dans ' + result.fichiers);
      const png = fs.readFileSync(path.join(outDir, 'Elise_faceset.png'));
      assert(png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 128 && png.readUInt32BE(20) === 112, 'face set 128×112');
      const after = fs.existsSync(path.join(dir, 'ressources', 'personnages')) ? fs.readdirSync(path.join(dir, 'ressources', 'personnages')).length : 0;
      assert(after === before, 'rien ajouté au projet');
      result.dirty = await js(`document.title`);
      await wait(300); await shot('c_exporte');
      // Annuler et refuser un fichier invalide gardent la bibliothèque intacte.
      await importFile('#gen-nav [data-gen-import]', null);
      assert(await js(`JSON.parse(localStorage.getItem('tf.generator.creations')).length === 1`), 'import annulé');
      await importFile('#gen-nav [data-gen-import]', '{ pas du JSON');
      await until(`!!document.querySelector('.modal-back')`);
      assert(await js(`document.querySelector('.modal-back h3').textContent === 'Import impossible'`), 'fichier invalide refusé');
      await js(`document.querySelector('.modal-actions button').click()`);
      assert(await js(`JSON.parse(localStorage.getItem('tf.generator.creations')).length === 1`), 'aucune création invalide');
      // Réimporter l’export réel retrouve le personnage et ses paramètres.
      await importFile('#gen-nav [data-gen-import]', '\uFEFF' + recipeJSON, 'Elise_recette.json');
      await until(`JSON.parse(localStorage.getItem('tf.generator.creations')).length === 2 && !!document.querySelector('.gen-hero-img')`);
      const imported = await js(`JSON.parse(localStorage.getItem('tf.generator.creations'))[0]`);
      assert(imported.name === 'Élise' && JSON.stringify(imported.recipe) === JSON.stringify(JSON.parse(recipeJSON).recipe), 'recette réimportée identique');
      // décocher une image : elle n'est plus exportée ; dupliquer
      await js(`(() => { const b = document.querySelector('[data-gen-export="recipe"]'); b.checked = false; b.dispatchEvent(new Event('change')); })()`);
      fs.rmSync(outDir, { recursive: true, force: true });
      await js(`document.querySelector('[data-gen-export-btn]').click()`);
      await until(`!!document.querySelector('[data-gen-export-status] button')`, 20000);
      assert(!fs.readdirSync(outDir).includes('Elise_recette.json'), 'recette décochée');
      await js(`document.querySelector('[data-gen-duplicate]').click()`); await wait(400);
      result.apresDuplication = await js(`[...document.querySelectorAll('[data-gen-item]')].map(b => b.textContent)`);
      assert(result.apresDuplication.length === 3, 'dupliqué');
      // Importer comme nouvelle unité : prévisualiser puis confirmer, images dans le projet.
      const original = await js(`Editor.db().units[0]`), unitCount = await js(`Editor.db().units.length`);
      await js(`DBEditor.open('units')`);
      await importFile('[data-generator-import-unit]', recipeJSON);
      await until(`!!document.querySelector('[data-cg-ok]')`);
      assert(await js(`Editor.db().units.length === ${unitCount}`), 'pas d’unité avant confirmation');
      await js(`document.querySelector('[data-cg-ok]').click()`);
      await until(`Editor.db().units.length === ${unitCount + 1} && !!Editor.db().units.at(-1).generator`, 30000);
      const unit = await js(`Editor.db().units.at(-1)`);
      assert(unit.name === 'Élise' && unit.generator.hair === imported.recipe.hair && !!unit.mapSprite && !!unit.battler && !!unit.portrait, 'unité complète importée');
      assert(JSON.stringify(await js(`Editor.db().units[0]`)) === JSON.stringify(original), 'unités existantes conservées');
      for (const rel of [unit.portrait, unit.mapSprite + '.json', unit.battler + '.json']) assert(fs.existsSync(path.join(dir, rel)), 'ressource importée : ' + rel);
      await shot('d_unite_importee');
      // Annuler l’aperçu ne crée pas de nouvelle unité.
      await importFile('[data-generator-import-unit]', recipeJSON);
      await until(`!!document.querySelector('[data-cg-cancel]')`);
      await js(`document.querySelector('[data-cg-cancel]').click()`);
      assert(await js(`Editor.db().units.length === ${unitCount + 1}`), 'aperçu annulé sans ajout');
      // Appliquer à une unité existante garde ses données de jeu.
      await js(`DBEditor.open('units', ${JSON.stringify(original.id)})`);
      await importFile('[data-generator-import]', recipeJSON);
      await until(`!!document.querySelector('[data-cg-ok]')`);
      await js(`document.querySelector('[data-cg-ok]').click()`);
      await until(`!!Editor.db().units[0].generator`, 30000);
      const updated = await js(`Editor.db().units[0]`);
      for (const key of ['name', 'classId', 'stats', 'growths', 'inventory', 'level']) assert(JSON.stringify(updated[key]) === JSON.stringify(original[key]), 'champ conservé : ' + key);
      assert(updated.generator.hair === imported.recipe.hair, 'apparence importée');
      await js(`Editor.command('save')`);
      const saved = io.loadProject(dir);
      assert(saved.db.units.at(-1).generator.hair === imported.recipe.hair, 'import enregistré');
      // Retoucher un personnage importé réutilise le générateur habituel.
      await js(`DBEditor.open('units', ${JSON.stringify(unit.id)}); document.querySelector('[data-generator-open]').click()`);
      await until(`!!document.querySelector('[data-cg-ok]')`);
      await js(`document.querySelector('[data-cg-cancel]').click()`);
      result.importGenerateur = true; result.importUnite = true; result.importApparence = true; result.importEnregistre = true;
      // retour à la map par la barre d'icônes
      await js(`document.querySelector('[data-rail="map"]').click()`); await wait(200);
      assert(await js(`document.querySelector('#generator').classList.contains('hidden') && document.body.dataset.view === 'map'`), 'fermé');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
