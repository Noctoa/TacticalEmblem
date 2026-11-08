'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
const { app, dialog } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wc = editor.webContents, errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code, true);
  const until = async code => { const end = Date.now() + 30000; while (Date.now() < end) { if (await js(code)) return; await wait(80); } throw new Error('Délai : ' + code); };
  const shot = async name => { await js(`document.querySelector('#toast-root').replaceChildren()`); await wc.capturePage(); await wait(200); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const originalDialog = dialog.showSaveDialog;
  const finish = () => { clearTimeout(watchdog); dialog.showSaveDialog = originalDialog; result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => { errors.push('Délai global dépassé'); finish(); }, 90000);
  wc.setBackgroundThrottling(false);
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-new-sample-')), 'Exemple');
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: dir });
      await js(`void Editor.command('new')`);
      await until(`!!document.querySelector('.modal-back input')`);
      await js(`document.querySelector('.modal-back input').value = 'Exemple Acania'; document.querySelector('.modal-actions .primary').click()`);
      await until(`!!document.querySelector('.choice-list .primary')`);
      assert.match(await js(`document.querySelector('.choice-list .primary').textContent`), /Mon Tactical RPG/);
      await shot('a_choix_exemple');
      await js(`document.querySelector('.choice-list .primary').click()`);
      await until(`!!Editor.db() && Editor.db().units.length === 36`);
      assert.equal(await js(`Editor.project().meta.name`), 'Exemple Acania');
      assert.equal(await js(`Editor.project().meta.startChapter`), 'ch_2');
      assert.equal(await js(`Editor.db().chapters.length`), 11);
      assert.equal(await js(`Editor.project().maps.length`), 10);
      await js(`DBEditor.open('arcs')`); await shot('b_chapitres_acania');
      await js(`DBEditor.open('units')`); await shot('c_personnages');
      assert.equal(fs.existsSync(path.join(dir, 'saves')), false);
      await js(`Editor.command('save')`);
      assert.equal(io.loadProject(dir).db.units.length, 36);
      // Le projet créé ouvre aussi son camp et son générateur de protagoniste en playtest.
      const game = openPlaytest(dir, ''), gw = game.webContents;
      gw.setBackgroundThrottling(false); gw.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      await new Promise(r => gw.once('did-finish-load', r));
      const run = code => gw.executeJavaScript(code, true);
      const ready = async code => { const end = Date.now() + 30000; while (Date.now() < end) { if (await run(code)) return; await wait(80); } throw new Error('Délai playtest : ' + code); };
      await ready(`!!document.querySelector('.choice-list button')`);
      await run(`document.querySelector('.choice-list button').click()`);
      await ready(`!!document.querySelector('[data-cg-ok]') || PlaytestState.mode === 'lobby'`);
      if (await run(`!!document.querySelector('[data-cg-ok]')`)) await run(`document.querySelector('[data-cg-ok]').click()`);
      await ready(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await gw.capturePage(); await wait(200); fs.writeFileSync(path.join(out, 'd_camp.png'), (await gw.capturePage()).toPNG());
      result.directory = dir; result.creationDepuisMenu = true; result.unites = 36; result.actes = 11; result.maps = 10; result.campJouable = true;
    } catch (e) { errors.push(e.stack || String(e)); }
    finish();
  });
};
