/*
 * Fiche de personnage façon Radiant Dawn : touche R sur la map, pages Stats / Objets / Compétences, unité suivante,
 * bouton « Fiche » de la fenêtre d'unité, fermeture ; la fiche intégrée à l'équipe du camp est vérifiée par snapshot-team.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-unit-sheet.js npm start
 */
'use strict';
require('./auto-deploy.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-sheet-')), 'Jeu');
      const p = io.createProject(dir, 'Fiche', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false;
      Object.assign(p.db.chapters[0], { events: [], requiredUnits: [], objective: { type: 'survive', turns: 99 } });
      const hero = p.db.units[0]; hero.equippedSkills = ['skill_luna']; hero.learnedSkills = ['skill_luna']; hero.personalSkill = 'skill_precision';
      io.saveProject(dir, p);
      const win = openPlaytest(dir, p.db.chapters[0].id), wc = win.webContents;
      wc.setBackgroundThrottling(false); win.setSize(1100, 760);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
      const shot = async n => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      await new Promise(r => wc.once('did-finish-load', r));
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until('!!PlaytestState.map && !PlaytestState.busy', 20000);
      await js(`(() => { const G = PlaytestState; window.H = G.units.find(u => u.sourceId === ${JSON.stringify(hero.id)}); G.cursor = { x: H.x, y: H.y }; Statuses.apply(H, 'poison', 3); })()`);
      await wait(300);
      // 1. touche R : fiche de Xarrin, page Stats
      await key('R');
      await until(`!!document.querySelector('#unit-sheet .rd-sheet')`);
      await wait(700);
      result.nom = await js(`document.querySelector('#unit-sheet .rd-name').textContent`);
      assert(result.nom === hero.name, "nom : " + result.nom);
      result.stats = await js(`[...document.querySelectorAll('#unit-sheet .rd-row')].map(r => r.textContent)`);
      assert(result.stats.some(t => /^For/.test(t)) && result.stats.some(t => /^Attaque/.test(t)) && result.stats.some(t => /^Dép/.test(t)), 'page Stats : ' + result.stats);
      assert(await js(`!!document.querySelector('#unit-sheet [data-sheet-status="poison"]')`), 'poison affiché');
      await shot('a_stats');
      // 2. pages suivantes
      await key('Right');
      await until(`document.querySelector('#unit-sheet .rd-sheet').dataset.page === 'items'`);
      result.objets = await js(`[...document.querySelectorAll('#unit-sheet .rd-item')].map(r => r.textContent)`);
      assert(result.objets.length >= 1, 'objets');
      await shot('b_objets');
      await key('Right');
      await until(`document.querySelector('#unit-sheet .rd-sheet').dataset.page === 'skills'`);
      result.competences = await js(`[...document.querySelectorAll('#unit-sheet .rd-item')].map(r => r.textContent)`);
      assert(result.competences.some(t => /Précision/.test(t)) && result.competences.some(t => /Luna/.test(t)), 'compétences : ' + result.competences);
      await wait(300); await shot('c_competences');
      // 3. unité suivante (même page)
      await key('Down');
      result.suivant = await js(`document.querySelector('#unit-sheet .rd-name').textContent`);
      assert(result.suivant !== result.nom, 'unité suivante');
      assert(await js(`document.querySelector('#unit-sheet .rd-sheet').dataset.page === 'skills'`), 'page gardée');
      // 4. fermer (X), puis bouton « Fiche » de la fenêtre d'unité
      await key('X');
      await until(`!document.querySelector('#unit-sheet')`);
      assert(await js(`!PlaytestState.sheetOpen && !PlaytestState.busy`), 'jeu rendu');
      await until(`!!document.querySelector('[data-unit-sheet-open]')`);
      await js(`document.querySelector('[data-unit-sheet-open]').click()`);
      await until(`!!document.querySelector('#unit-sheet .rd-sheet')`);
      await js(`document.querySelector('#unit-sheet').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await until(`!document.querySelector('#unit-sheet')`);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
