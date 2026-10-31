/*
 * Palette de tiles : zoom (boutons, Ctrl+molette) ; fenêtre « Image du nouveau tileset » (images du projet, recherche,
 * navigateur de l'ordinateur avec recherche dans les sous-dossiers, import).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-tileset-picker.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const js = c => wc.executeJavaScript(c, true);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await js(`document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`); await wc.capturePage(); await wait(400); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 120000);
  const until = async (c, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-picker-'));
      const dir = path.join(tmp, 'Jeu');
      io.createProject(dir, 'Picker', 'sample', path.join(__dirname, '..', 'assets'));
      // dossier « de l'ordinateur » avec une image dans un sous-dossier
      const pc = path.join(tmp, 'Mes images'); fs.mkdirSync(path.join(pc, 'Tiles', 'Forêts'), { recursive: true });
      const src = fs.readdirSync(path.join(dir, 'ressources/tilesets')).find(f => f.endsWith('.png'));
      fs.copyFileSync(path.join(dir, 'ressources/tilesets', src), path.join(pc, 'Tiles', 'Forêts', 'Forêt magique.png'));
      fs.copyFileSync(path.join(dir, 'ressources/tilesets', src), path.join(pc, 'plaine.png'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      await js(`document.querySelector('[data-mode="tiles"]').click()`);
      await until(`!!document.querySelector('[data-pal-zoom-label]') && document.querySelector('[data-pal-zoom-label]').textContent.includes('%')`);
      const z = () => js(`({ label: document.querySelector('[data-pal-zoom-label]').textContent, scale: Number(document.querySelector('.palette-scroll canvas').dataset.scale), w: document.querySelector('.palette-scroll canvas').width })`);
      result.zoom0 = await z();
      await js(`document.querySelector('[data-pal-zoom="1"]').click()`); result.zoomPlus = await z();
      assert(result.zoomPlus.scale > result.zoom0.scale && result.zoomPlus.w > result.zoom0.w, 'zoom + : ' + JSON.stringify(result.zoomPlus));
      await js(`(() => { const c = document.querySelector('.palette-scroll canvas'); const r = c.getBoundingClientRect(); c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: r.left + 20, clientY: r.top + 20, bubbles: true, cancelable: true })); })()`);
      result.zoomWheel = await z();
      assert(result.zoomWheel.scale > result.zoomPlus.scale, 'Ctrl+molette : ' + JSON.stringify(result.zoomWheel));
      await shot('a_palette_zoom');
      // le zoom survit au changement de mode
      await js(`document.querySelector('[data-mode="terrain"]').click()`); await wait(200);
      await js(`document.querySelector('[data-mode="tiles"]').click()`); await wait(300);
      assert((await z()).scale === result.zoomWheel.scale, 'zoom retenu');
      await js(`document.querySelector('[data-pal-zoom-label]').click()`); await wait(200);
      assert((await z()).scale === result.zoom0.scale, 'retour au zoom automatique');

      // fenêtre de choix : images du projet
      const before = await js(`Editor.db().tilesets.length`);
      await js(`document.querySelector('#palette .head-actions button:last-child').click()`);
      await until(`!!document.querySelector('.fp-modal')`);
      await js(`document.querySelector('[data-fp-tab="project"]').click()`);
      await until(`document.querySelectorAll('.fp-modal [data-fp-file]').length > 0`);
      result.projet = await js(`document.querySelectorAll('.fp-modal [data-fp-file]').length`);
      result.badges = await js(`document.querySelectorAll('.fp-modal .fp-badge').length`);
      await js(`(() => { const s = document.querySelector('[data-fp-search]'); s.value = 'castle'; s.dispatchEvent(new Event('input')); })()`);
      result.filtre = await js(`[...document.querySelectorAll('.fp-modal [data-fp-file]')].map(c => c.dataset.fpFile.split('/').pop())`);
      assert(result.filtre.length && result.filtre.length < result.projet && result.filtre.every(n => /castle/i.test(n)), 'filtre : ' + result.filtre);
      await until(`[...document.querySelectorAll('.fp-modal .fp-thumb')].slice(0, 12).every(i => i.complete && i.naturalWidth > 0)`, 15000);
      await shot('b_projet');
      // ordinateur : aller dans le dossier, chercher dans les sous-dossiers, importer
      await js(`document.querySelector('[data-fp-tab="pc"]').click()`);
      await until(`!!document.querySelector('[data-fp-path]')`);
      result.raccourcis = await js(`[...document.querySelectorAll('[data-fp-place]')].map(b => b.textContent)`);
      await js(`(() => { const p = document.querySelector('[data-fp-path]'); p.value = ${JSON.stringify(pc)}; p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
      await until(`!!document.querySelector('[data-fp-dir]')`);
      result.dossier = await js(`[...document.querySelectorAll('.fp-modal .fp-cell small')].map(s => s.textContent)`);
      assert(JSON.stringify(result.dossier) === '["Tiles","plaine.png"]', 'dossier : ' + result.dossier);
      await js(`(() => { const s = document.querySelector('[data-fp-pcsearch]'); s.value = 'foret'; s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
      await until(`document.querySelectorAll('.fp-modal [data-fp-file]').length === 1`);
      result.recherche = await js(`[...document.querySelectorAll('.fp-modal .fp-cell')].map(c => c.innerText.replace(/\\s+/g, ' '))`);
      await js(`document.querySelector('.fp-modal [data-fp-file]').click()`);
      await wait(600); await shot('c_ordinateur');
      result.bouton = await js(`document.querySelector('[data-fp-ok]').textContent`);
      await js(`document.querySelector('[data-fp-ok]').click()`);
      await until(`!document.querySelector('.fp-modal') && document.querySelector('.modal input')`);
      await js(`(() => { const i = document.querySelector('.modal input'); i.value = '16'; document.querySelector('.modal button.primary').click(); })()`);
      await until(`Editor.db().tilesets.length === ${before + 1}`);
      result.ajoute = await js(`Editor.db().tilesets[Editor.db().tilesets.length - 1].image`);
      assert(result.ajoute === 'ressources/tilesets/Forêt_magique.png' && fs.existsSync(path.join(dir, result.ajoute)), 'import : ' + result.ajoute);
      // dossier retenu à la réouverture
      await js(`document.querySelector('#palette .head-actions button:last-child').click()`);
      await until(`!!document.querySelector('[data-fp-path]')`);
      await until(`document.querySelector('[data-fp-path]').value.length > 0`);
      result.retenu = await js(`document.querySelector('[data-fp-path]').value`);
      assert(result.retenu === path.join(pc, 'Tiles', 'Forêts') || result.retenu === pc, 'dossier retenu : ' + result.retenu);
      await js(`document.querySelector('.fp-modal .modal-actions button:nth-last-child(2)').click()`);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
