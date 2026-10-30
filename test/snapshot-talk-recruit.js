/*
 * Recrutement en combat par la conversation : Lyn parle à un ennemi (→ Matthew rejoint), n'importe qui parle à une alliée
 * (→ Serra devient jouable) ; Eliwood n'a pas « Parler » vers l'ennemi réservé à Lyn ; les recrues entrent dans l'effectif.
 * Éditeur : champs du placement et badge sur la map.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-talk-recruit.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const js = (wc, c) => wc.executeJavaScript(c, true);
  const until = async (wc, c, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(wc, c)) return true; await wait(100); } throw new Error('Délai : ' + c); };
  const shot = async (wc, n) => { await wc.capturePage(); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-talk-')), 'Jeu');
      const p = io.createProject(dir, 'Parler', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false;
      const ch = p.db.chapters.find(c => c.id === 'ch_1');
      ch.deployment = { enabled: false }; ch.events = [];
      const e1 = ch.enemies.find(e => e.id === 'e1');
      Object.assign(e1, { name: 'Voleur masqué', x: 4, y: 12, ai: 'stationary', talk: { enabled: true, with: ['c_lyn'], joinAs: 'c_matthew', text: 'Lyn: Toi ! Tu n’es pas un brigand.\nVoleur masqué: … Bien vu. Je m’appelle Matthew. Je vous suis.' } });
      ch.allies = [{ id: 'a1', unitId: 'c_serra', x: 7, y: 13, control: 'ai', ai: 'stationary', talk: { enabled: true, with: [] } }];
      io.saveProject(dir, p);
      // éditeur : badge et champs
      const ewc = editor.webContents; ewc.on('console-message', (e, l, m) => { if (l >= 3) errors.push('éditeur: ' + m); });
      await js(ewc, `Editor.open(${JSON.stringify(dir)})`); await until(ewc, `!!Editor.project()`);
      await js(ewc, `Editor.selectInteraction('ch_1', 'enemies', 'e1')`); await wait(600);
      result.editeur = await js(ewc, `(() => { const t = document.querySelector('#inspector').innerText; return { titre: t.includes('Recrutement par la conversation'), recrue: [...document.querySelectorAll('#inspector select')].some(s => s.value === 'c_matthew'), erreurs: [...document.querySelectorAll('#inspector .note')].map(n => n.textContent).filter(t => t.startsWith('⚠')) }; })()`);
      assert.ok(result.editeur.titre && result.editeur.recrue && !result.editeur.erreurs.length, 'éditeur : ' + JSON.stringify(result.editeur));
      await shot(ewc, 'z_editeur');
      // boss : erreur affichée
      await js(ewc, `(() => { const e = Editor.project().db.chapters.find(c => c.id === 'ch_1').enemies.find(e => e.id === 'e1'); e.isBoss = true; Editor.selectInteraction('ch_1', 'enemies', 'e1'); })()`); await wait(300);
      result.editeurBoss = await js(ewc, `[...document.querySelectorAll('#inspector .note')].map(n => n.textContent).filter(t => /boss/.test(t))`);
      assert.equal(result.editeurBoss.length, 1);
      await js(ewc, `(() => { const e = Editor.project().db.chapters.find(c => c.id === 'ch_1').enemies.find(e => e.id === 'e1'); e.isBoss = false; })()`);
      // playtest
      const pw = openPlaytest(dir, ''); const wc = pw.webContents; wc.setBackgroundThrottling(false); pw.setSize(1100, 780);
      wc.on('console-message', (e, l, m) => { if (l >= 3) errors.push(m); });
      await new Promise(r => wc.once('did-finish-load', r));
      await until(wc, `!!document.querySelector('.choice-list')`);
      await js(wc, `[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      const skip = `(PlaytestState.dialogue && PlaytestState.dialogue.skip(), true)`;
      const end = Date.now() + 25000;
      while (!(await js(wc, `PlaytestState.mode === 'chapter' && PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`))) { if (Date.now() > end) throw new Error('début du chapitre'); await js(wc, skip); await wait(150); }
      const menu = async (id, x, y) => {
        await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); PlaytestState.cursor = { x: ${x}, y: ${y} }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`);
        await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
        return js(wc, `PlaytestState.menu.items.map(i => i.label + (i.sub ? ' (' + i.sub + ')' : ''))`);
      };
      const action = (label) => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      // badge sur l'ennemi
      result.badge = await js(wc, `(() => { const u = PlaytestState.units.find(u => u.name === 'Voleur masqué'); return !!(u && u.talk); })()`);
      // Eliwood (5,13) : adjacent à Serra (7,13)? non → il se déplace en (5,12) : voisin du voleur (4,12) mais pas autorisé
      result.eliwood = await menu('c_eliwood', 5, 12);
      assert.ok(!result.eliwood.some(l => /^Parler/.test(l) && /Voleur/.test(l)), 'Eliwood ne doit pas pouvoir parler au voleur : ' + result.eliwood);
      await action('Attendre'); await until(wc, `PlaytestState.ui === 'idle' && !PlaytestState.busy`);
      // Lyn (4,13), adjacente au voleur (4,12) : « Parler »
      result.lyn = await menu('c_lyn', 4, 13);
      assert.ok(result.lyn.includes('Parler (Voleur masqué)'), 'menu de Lyn : ' + result.lyn);
      await shot(wc, 'a_menu');
      await action('Parler');
      await until(wc, `!!PlaytestState.dialogue`); await wait(400); await shot(wc, 'b_dialogue');
      await until(wc, `(PlaytestState.dialogue && PlaytestState.dialogue.next(), !PlaytestState.busy && PlaytestState.ui === 'idle')`);
      result.apres = await js(wc, `PlaytestState.units.filter(u => !u.dead).map(u => u.team + ':' + (u.sourceId || u.name)).filter(s => /c_matthew|e1|c_serra/.test(s))`);
      assert.ok(result.apres.includes('player:c_matthew') && !result.apres.includes('enemy:e1'), 'Matthew a rejoint : ' + result.apres);
      result.recrues = await js(wc, `PlaytestState.campaign.recruited`);
      assert.ok(result.recrues.includes('c_matthew'));
      result.matthewPeutAgir = await js(wc, `!PlaytestState.units.find(u => u.sourceId === 'c_matthew').done`);
      await wait(300); await shot(wc, 'c_recrue');
      // Hector (6,13) parle à Serra (7,13), alliée sans restriction
      result.hector = await menu('c_hector', 6, 13);
      assert.ok(result.hector.includes('Parler (Serra)'), 'menu d’Hector : ' + result.hector);
      await action('Parler');
      await until(wc, `(PlaytestState.dialogue && PlaytestState.dialogue.skip(), !PlaytestState.busy && PlaytestState.ui === 'idle')`);
      result.serra = await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_serra').team`);
      assert.equal(result.serra, 'player');
      assert.ok((await js(wc, `PlaytestState.campaign.recruited`)).includes('c_serra'));
      pw.close();
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
