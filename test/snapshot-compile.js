/*
 * Compilateur (Fichier › Compiler le jeu…) : version Web compilée depuis l'éditeur (dossier + zip, projet embarqué).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-compile.js npm start
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
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (code, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(code)) return; await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1600, 1000);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-compile-')), 'Jeu');
      io.createProject(dir, 'Mon jeu', 'sample', path.join(__dirname, '..', 'assets'));
      const out = path.join(path.dirname(dir), 'sortie');
      await js(`localStorage.setItem('tf.compile:Mon jeu', ${JSON.stringify(JSON.stringify({ version: '1.0.0', platforms: ['web', 'android'], outDir: out }))})`);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      await js(`Editor.project().meta.name = 'Mon jeu'; 0`);
      // commande du menu Fichier
      await js(`Editor.command('compile-game'); 0`);
      await until(`!!document.querySelector('[data-compile-go]')`);
      result.plateformes = await js(`[...document.querySelectorAll('[data-compile-platform]')].map(c => c.dataset.compilePlatform + (c.checked ? '✓' : ''))`);
      await shot('a_compiler');
      await js(`document.querySelector('[data-compile-name]').value = 'Les héros de test'; document.querySelector('[data-compile-go]').click(); 0`);
      await until(`!!document.querySelector('[data-compile-result="web"]') || !!document.querySelector('.compile-error')`, 120000);
      result.erreur = await js(`document.querySelector('.compile-error') && document.querySelector('.compile-error').textContent`);
      assert(!result.erreur, result.erreur);
      const web = path.join(out, 'Les héros de test (Web)');
      result.fichiers = fs.readdirSync(web).sort();
      assert(fs.existsSync(path.join(web, 'index.html')) && fs.existsSync(path.join(web, 'game', 'game-data.js')), 'web : ' + result.fichiers);
      assert(fs.existsSync(path.join(out, 'Les héros de test - web.zip')), 'zip');
      assert(fs.existsSync(path.join(out, 'Les héros de test (Android Studio)', 'app', 'src', 'main', 'assets', 'www', 'index.html')), 'android');
      const data = fs.readFileSync(path.join(web, 'game', 'game-data.js'), 'utf8');
      assert(/"name":"Les héros de test"/.test(data) && /"platform":"web"/.test(data), 'game-data');
      assert(!fs.existsSync(path.join(web, 'src', 'renderer', 'editor.js')), 'éditeur exclu');
      await wait(300); await shot('b_compile');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
