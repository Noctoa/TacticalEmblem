/*
 * Météo : textures de neige et de brouillard (img/weather) sur la carte, aux trois intensités, et en combat.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-weather-textures.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 120000);
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-wtex-')), 'Jeu');
      const p = io.createProject(dir, 'Météo', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false;
      Object.assign(p.db.chapters[0], { events: [], requiredUnits: [], objective: { type: 'survive', turns: 99 }, deployment: { enabled: false } });
      io.saveProject(dir, p);
      const win = openPlaytest(dir, p.db.chapters[0].id), wc = win.webContents;
      wc.setBackgroundThrottling(false); win.setSize(1100, 760);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
      await new Promise(r => wc.once('did-finish-load', r));
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until('!!PlaytestState.map && !PlaytestState.busy', 20000);
      await js(`WeatherFX.ready()`); await until(`WeatherFX.ready().snow && WeatherFX.ready().fog`);
      for (const type of ['snow', 'fog']) for (const intensity of [1, 2, 3]) {
        await js(`PlaytestState.weather = { type: '${type}', intensity: ${intensity}, direction: 'right' }`);
        await wait(900);
        await wc.capturePage(); await wait(200);
        fs.writeFileSync(path.join(out, `${type}_${intensity}.png`), (await wc.capturePage()).toPNG());
      }
      result.textures = await js(`WeatherFX.ready()`);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
