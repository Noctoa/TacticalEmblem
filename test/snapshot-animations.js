/*
 * Animations d'attaque : onglet Animations (scène, déplacement d'une cellule, choix d'une pièce, interpolation),
 * champ des armes, lecture en combat animé (projectile Feu → explosion) et sur la map.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-animations.js npm start
 */
'use strict';
require('./auto-deploy.js');
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const run = (c, code) => c.executeJavaScript(code, true);
  const js = code => run(wc, code);
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (c, n) => { await run(c, `document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`); await c.capturePage(); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await c.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const until = async (c, code, ms = 15000, paint = false) => { const end = Date.now() + ms; while (Date.now() < end) { if (await run(c, code)) return; if (paint) await c.capturePage(); await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push('éditeur: ' + message); });
  wc.once('did-finish-load', async () => {
    try {
      // 0. projet d'avant les animations : planches, exemples et réglages ajoutés à l'ouverture
      const oldDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-anims-old-')), 'Ancien');
      const o = io.createProject(oldDir, 'Ancien', 'sample', path.join(__dirname, '..', 'assets'));
      o.meta.pluginMigrations = o.meta.pluginMigrations.filter(m => m !== 'animations'); delete o.meta.animationDefaults;
      o.db.animations = []; o.db.skills.forEach(sk => { delete sk.animation; }); (o.db.ultimates || []).forEach(u => { u.animation = ''; }); o.meta.lobby.enabled = false;
      io.saveProject(oldDir, o);
      fs.unlinkSync(path.join(oldDir, 'data', 'animations.json'));
      fs.rmSync(path.join(oldDir, 'ressources', 'animations'), { recursive: true, force: true });
      await js(`Editor.open(${JSON.stringify(oldDir)})`);
      await until(wc, `Editor.db() && (Editor.db().animations || []).length > 0 && (Editor.resources().animations || []).length > 100`);
      result.ancien = await js(`({ n: Editor.db().animations.length, defauts: Editor.project().meta.animationDefaults.sword, luna: Editor.db().skills.find(s => s.id === 'skill_luna').animation })`);
      assert(result.ancien.defauts === 'anim_slash' && result.ancien.luna === 'anim_luna', 'migration : ' + JSON.stringify(result.ancien));
      await js(`Editor.state.dirty = false`);

      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-anims-')), 'Jeu');
      const p = io.createProject(dir, 'Animations', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false; io.saveProject(dir, p);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(wc, `Editor.db() && (Editor.db().animations || []).length > 0`);
      result.exemples = await js(`Editor.db().animations.map(a => a.id)`);
      assert(result.exemples.includes('anim_fire') && result.exemples.includes('anim_fire_hit'), 'animations d’exemple');
      assert((await js(`Editor.resources().animations.length`)) > 100, 'planches de ressources/animations');

      // 1. onglet Animations : Explosion de feu, image 5
      await js(`DBEditor.open('animations', 'anim_fire_hit')`);
      await until(wc, `!!document.querySelector('[data-anim-stage]') && document.querySelectorAll('.anim-frame').length === 12`);
      await js(`document.querySelector('.anim-frame[data-frame="4"]').click()`);
      await wait(900); await shot(wc, 'a_onglet');
      // déplacer la première cellule à la souris (origine : pieds de la cible)
      const before = await js(`JSON.stringify(Editor.db().animations.find(a => a.id === 'anim_fire_hit').frames[4].cells.at(-1))`);
      await js(`(() => {
        const cv = document.querySelector('[data-anim-stage]'), r = cv.getBoundingClientRect(), z = r.width / AnimationEditor.STAGE.w;
        const c = Editor.db().animations.find(a => a.id === 'anim_fire_hit').frames[4].cells.at(-1); // la cellule du dessus
        const x = r.left + (480 + c.x) * z, y = r.top + (222 + 72 + c.y) * z;
        cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 30 * z, clientY: y - 10 * z, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: x + 30 * z, clientY: y - 10 * z, bubbles: true }));
      })()`);
      result.deplacement = { avant: JSON.parse(before), apres: await js(`Editor.db().animations.find(a => a.id === 'anim_fire_hit').frames[4].cells.at(-1)`) };
      assert(result.deplacement.apres.x === result.deplacement.avant.x + 30 && result.deplacement.apres.y === result.deplacement.avant.y - 10, 'cellule déplacée : ' + JSON.stringify(result.deplacement));
      assert(await js(`!!document.querySelector('[data-cell-field="x"]')`), 'réglages de la cellule');

      // 2. nouvelle animation : une pièce choisie dans une planche, deux images, interpolation
      await js(`[...document.querySelectorAll('.db-list-actions button')].find(b => b.textContent.includes('Nouveau')).click()`);
      await until(wc, `!!document.querySelector('[data-anim-add-cell]') && Editor.db().animations.length === ${result.exemples.length + 1}`);
      result.nouvelle = await js(`Editor.db().animations.at(-1).id`);
      await js(`document.querySelector('[data-anim-add-cell]').click()`);
      await until(wc, `!!document.querySelector('[data-anim-picker]') && document.querySelector('.anim-picker-info').textContent.includes('morceaux')`);
      await js(`(() => { const s = document.querySelector('[data-anim-sheet]'); s.value = 'ressources/animations/heroes/Btl_Hit01.png'; s.dispatchEvent(new Event('change')); })()`);
      await until(wc, `document.querySelector('.anim-picker-info').textContent.includes('morceaux')`);
      await wait(400); await shot(wc, 'b_choix_piece');
      result.morceaux = await js(`Number(document.querySelector('.anim-picker-info').textContent.match(/(\\d+) morceaux/)[1])`);
      assert(result.morceaux > 30, 'morceaux détectés : ' + result.morceaux);
      // tracer une zone à la souris
      await js(`(() => {
        const cv = document.querySelector('[data-anim-picker]'), r = cv.getBoundingClientRect(), k = r.width / 1024;
        const ev = (t, x, y) => cv.dispatchEvent(new MouseEvent(t, { clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true }));
        ev('mousedown', 4, 390); ev('mousemove', 123, 569); ev('mouseup', 123, 569);
      })()`);
      await until(wc, `!document.querySelector('[data-anim-picker]')`);
      result.cellule = await js(`Editor.db().animations.at(-1).frames[0].cells[0]`);
      assert(result.cellule && result.cellule.image.endsWith('Btl_Hit01.png') && Math.abs(result.cellule.rect[2] - 120) <= 2, 'pièce tracée : ' + JSON.stringify(result.cellule));
      // 3 images de plus (dupliquer), on décale la dernière puis interpolation 1 → 4
      for (let i = 0; i < 3; i++) await js(`document.querySelector('[data-anim-frame-copy]').click()`);
      await js(`(() => { const a = Editor.db().animations.at(-1); Object.assign(a.frames[3].cells[0], { x: 90, scale: 40, opacity: 0 }); })()`);
      await js(`document.querySelector('.anim-frame[data-frame="0"]').click()`);
      await js(`(() => { const s = document.querySelector('.anim-interp'); s.value = '3'; s.dispatchEvent(new Event('change')); })()`);
      result.interpolation = await js(`Editor.db().animations.at(-1).frames.map(f => f.cells[0].x)`);
      assert(JSON.stringify(result.interpolation) === '[0,30,60,90]', 'interpolation : ' + result.interpolation);
      await js(`document.querySelector('.anim-frame[data-frame="2"]').click()`); await wait(400); await shot(wc, 'c_nouvelle');

      // 3. arme : animation par défaut du type, ou la sienne
      await js(`DBEditor.open('weapons', 'w_fire')`);
      await until(wc, `[...document.querySelectorAll('.db-form .field-label')].some(l => l.textContent.startsWith('Animation d’attaque'))`);
      result.arme = await js(`(() => { const l = [...document.querySelectorAll('.db-form .field-label')].find(l => l.textContent.startsWith('Animation d’attaque')); return [...l.parentElement.querySelector('select').options].slice(0, 3).map(o => o.textContent); })()`);
      assert(/Feu/.test(result.arme[0]), 'option par défaut : ' + result.arme);
      await js(`DBEditor.close()`); wc.send('menu', 'save'); await until(wc, '!Editor.state.dirty');
      const saved = io.loadProject(dir);
      assert(saved.db.animations.some(a => a.id === result.nouvelle), 'animation enregistrée');

      // 4. jeu : Xarrin lance Feu à distance (combat animé), puis sur la map
      const q = io.loadProject(dir);
      const hero = q.db.units[0], ch = q.db.chapters[0];
      hero.inventory = [{ id: 'w_fire' }]; hero.stats.mag = 12; hero.level = 1;
      const cls = q.db.classes.find(c => c.id === hero.classId); cls.weapons = [...new Set([...(cls.weapons || []), 'anima'])];
      Object.assign(q.db.weapons.find(w => w.id === 'w_fire'), { hit: 1000 });
      Object.assign(ch, { objective: { type: 'survive', turns: 99 }, requiredUnits: [], events: [], next: '', final: false, allies: [] });
      ch.players = [{ unitId: hero.id, x: 3, y: 3 }];
      ch.enemies = [{ id: 'cible', classId: 'brigand', name: 'Cible', level: 1, x: 5, y: 3, ai: 'stationary', inventory: [{ id: 'w_iron_axe' }] }];
      q.meta.settings.battleAnims = true; q.db.supports = []; io.saveProject(dir, q);
      const win = openPlaytest(dir, ch.id), pw = win.webContents;
      pw.setBackgroundThrottling(false); pw.on('console-message', (e, level, message) => { if (level >= 3) errors.push('jeu: ' + message); });
      await new Promise(r => pw.once('did-finish-load', r));
      await until(pw, `!!document.querySelector('.choice-list')`);
      await run(pw, `[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(pw, '!!PlaytestState.map && !PlaytestState.busy');
      await run(pw, `(() => { const G = PlaytestState; window.H = G.units.find(u => u.team === 'player'); window.D = G.units.find(u => u.team === 'enemy'); D.hp = 60; D.stats.hp = 60; G.settings.trueHit = false; })()`);
      const key = async k => { pw.sendInputEvent({ type: 'keyDown', keyCode: k }); pw.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(100); };
      const attack = async () => {
        await run(pw, `H.done = false; PlaytestState.cursor = { x: H.x, y: H.y }`);
        await key('Z'); await until(pw, `PlaytestState.ui === 'moving'`);
        await key('Z'); await until(pw, `PlaytestState.ui === 'menu'`);
        await run(pw, `PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`);
        await until(pw, `!document.querySelector('#forecast').classList.contains('hidden')`);
        await key('Z');
      };
      await attack();
      await until(pw, `document.body.classList.contains('in-battle')`);
      // capture quand une animation d'attaque est en cours (projectile, puis explosion)
      const seen = new Set();
      const end = Date.now() + 12000;
      let shots = 0;
      while (Date.now() < end && (await run(pw, `document.body.classList.contains('in-battle')`))) {
        const st = await run(pw, `BattleScene.debugState()`);
        if (st && st.anims) { seen.add('combat'); if (shots < 2) { await shot(pw, shots ? 'e_combat_impact' : 'd_combat_projectile'); shots++; await wait(shots === 1 ? 260 : 0); } }
        await pw.capturePage(); await wait(40);
      }
      assert(seen.has('combat'), 'animation jouée en combat animé');
      await until(pw, `!PlaytestState.busy && !document.body.classList.contains('in-battle')`, 20000, true);
      result.combatPV = await run(pw, 'D.hp');
      assert(result.combatPV < 60, 'dégâts du combat animé');
      // sur la map
      await run(pw, `PlaytestState.settings.battleAnims = false; D.hp = 60;`);
      await attack();
      let mapShot = false;
      const end2 = Date.now() + 12000;
      while (Date.now() < end2 && (await run(pw, 'PlaytestState.busy'))) {
        if (!mapShot && await run(pw, 'PlaytestDebug.mapAnims() > 0')) { await wait(150); await shot(pw, 'f_map'); mapShot = true; }
        await pw.capturePage(); await wait(40);
      }
      assert(mapShot, 'animation jouée sur la map');
      result.mapPV = await run(pw, 'D.hp');
      assert(result.mapPV < 60, 'dégâts sur la map');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
