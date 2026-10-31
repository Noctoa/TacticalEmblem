/*
 * Nouvelle map de chapitre + « Nouvel acte » : la palette de placement liste les personnages, alliés et ennemis,
 * et on peut placer une unité (régression : l'acte créé n'avait pas de liste d'alliés et la palette restait vide).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-new-act.js npm start
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
  const finish = async () => { result.errors = errors; result.ok = !errors.length; try { fs.writeFileSync(path.join(out, 'a.png'), (await wc.capturePage()).toPNG()); } catch (e) { /* pas d'image */ } fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (c, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-newact-')), 'Jeu');
      io.createProject(dir, 'Acte', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      const maps = await js(`Editor.project().maps.length`);
      // bouton + des maps de chapitre, puis Créer
      await js(`document.querySelector('button[title="Nouvelle map de chapitre"]').click()`);
      await until(`!!document.querySelector('.modal button.primary')`);
      await js(`document.querySelector('.modal button.primary').click()`);
      await until(`Editor.project().maps.length === ${maps + 1}`);
      await js(`document.querySelector('[data-mode="units"]').click()`);
      await until(`[...document.querySelectorAll('#inspector button')].some(b => b.textContent.includes('Créer un acte'))`);
      await js(`[...document.querySelectorAll('#inspector button')].find(b => b.textContent.includes('Créer un acte')).click()`);
      await wait(400);
      result.picks = await js(`document.querySelectorAll('#palette [data-pick-unit]').length`);
      result.ennemis = await js(`[...document.querySelectorAll('#palette .pick-group')].map(g => g.textContent)`);
      assert(result.picks > 0, 'palette vide');
      const ch = await js(`(() => { const c = Editor.db().chapters[Editor.db().chapters.length - 1]; return { allies: c.allies, next: c.next, kind: c.kind }; })()`);
      assert(Array.isArray(ch.allies) && ch.kind === 'story', 'acte : ' + JSON.stringify(ch));
      // placer la première unité du joueur
      await js(`document.querySelector('#palette [data-pick-unit^="players:"]').click()`);
      await js(`(() => { const c = document.querySelector('#map-canvas') || document.querySelector('#canvas-wrap canvas'); const r = c.getBoundingClientRect(); const o = { bubbles: true, clientX: r.left + 40, clientY: r.top + 40, button: 0 }; c.dispatchEvent(new MouseEvent('mousedown', o)); window.dispatchEvent(new MouseEvent('mouseup', o)); })()`);
      await wait(300);
      result.places = await js(`Editor.db().chapters[Editor.db().chapters.length - 1].players.length`);
      assert(result.places === 1, 'placement : ' + result.places);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
