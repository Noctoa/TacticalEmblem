/*
 * Pluie et cendres (img/weather/rain.png, ash.png), et ressources d'interface modifiables dans le projet
 * (ressources/interface) : une image remplacée dans le projet est celle du jeu (CSS et images dessinées).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-interface.js npm start
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
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-iface-')), 'Jeu');
      const p = io.createProject(dir, 'Météo', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false;
      Object.assign(p.db.chapters[0], { events: [], requiredUnits: [], objective: { type: 'survive', turns: 99 }, deployment: { enabled: false } });
      io.saveProject(dir, p);
      // interface copiée dans le projet ; on remplace la flèche et la fenêtre par des copies marquées
      const ui = io.installInterface(dir, path.join(__dirname, '..', 'src', 'renderer', 'img'));
      result.interface = ui.length;
      if (!ui.includes('ui/window.png') || !ui.includes('weather/rain.png') || !ui.includes('ui/phase-player.png')) errors.push('interface incomplète : ' + ui.slice(0, 20));
      if (ui.some(f => f.startsWith('generator/'))) errors.push('générateur copié');
      const win = openPlaytest(dir, p.db.chapters[0].id), wc = win.webContents;
      wc.setBackgroundThrottling(false); win.setSize(1100, 760);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
      await new Promise(r => wc.once('did-finish-load', r));
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until('!!PlaytestState.map && !PlaytestState.busy', 20000);
      result.css = await js(`(() => { const w = [...document.querySelectorAll('*')].map(e => getComputedStyle(e).borderImageSource + getComputedStyle(e).backgroundImage).find(v => /window\.png/.test(v)); return w || ''; })()`);
      result.fleche = await js(`UIAsset('img/ui/arrow.png')`);
      if (!/ressources\/interface\/ui\/arrow\.png$/.test(result.fleche)) errors.push('flèche : ' + result.fleche);
      result.cssRewritten = await js(`(() => { let n = 0; for (const s of document.styleSheets) { try { for (const r of s.cssRules) if (r.cssText && r.cssText.includes('ressources/interface')) n++; } catch (e) {} } return n; })()`);
      if (!result.cssRewritten) errors.push('feuilles de style non réécrites');
      await until(`WeatherFX.ready().rain || (PlaytestState.weather = { type: 'rain', intensity: 2, direction: 'right' }, false)`);
      for (const type of ['rain', 'ash']) for (const intensity of [1, 3]) {
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
