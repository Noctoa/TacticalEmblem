/*
 * Générateur : genre (filtre toutes les pièces) et classe (sprites de combat et de map de sa monture : un cavalier est
 * à cheval) dans l'éditeur et à la création du protagoniste ; retouche du protagoniste au camp (menu › Apparence).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-avatar-class.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
const C = require('../src/shared/char-gen');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const ewc = editor.webContents;
  ewc.on('console-message', (e, level, message) => { if (level >= 3) errors.push('[éditeur] ' + message); });
  const mk = (wc) => ({
    js: c => wc.executeJavaScript(c, true),
    until: async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await wc.executeJavaScript(c, true)) return; await wait(80); } throw new Error('Délai : ' + c); },
    shot: async n => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); }
  });
  // pièces du générateur (genre / monture d'un identifiant)
  const vm = require('vm'), GEN = path.join(__dirname, '..', 'src/renderer/img/generator'), ctx = { self: {} };
  for (const f of ['parts.js', 'sprites.js', 'battlers.js']) vm.runInNewContext(fs.readFileSync(path.join(GEN, f), 'utf8'), ctx);
  const P = ctx.self.GENERATOR_PARTS; P.sprite = ctx.self.GENERATOR_SPRITES.list; P.battlers = ctx.self.GENERATOR_BATTLERS;
  const info = (k, id) => { const p = P[k].find(x => x.id === id); return p ? C.partMount(k, p, P) + '/' + (C.partSex(k, p, P) || 'u') : '?'; };
  const cells = (G, k) => G.js(`[...document.querySelectorAll('[data-cg-picker="${k}"] .cg-cell')].map(c => c.dataset.cgPart)`);
  async function openPicker(G, k) { await G.js(`document.querySelector('[data-cg-choose="${k}"]').click()`); await G.until(`document.querySelectorAll('[data-cg-picker="${k}"] .cg-cell').length > 0`); const l = await cells(G, k); await G.js(`document.querySelector('[data-cg-picker="${k}"] .cg-pop-head button:last-child').click()`); return l; }
  const recipeOf = (G) => G.js(`({ token: [...document.querySelectorAll('[data-cg-label]')].length })`);
  ewc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-avclass-')), 'Jeu');
      const p = io.createProject(dir, 'Avatar', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.avatar = { enabled: true, unitId: 'c_eliwood', rename: true };
      p.db.units.find(u => u.id === 'c_eliwood').classId = 'cavalier';
      io.saveProject(dir, p);
      const E = mk(ewc);
      await E.js(`Editor.open(${JSON.stringify(dir)})`);
      await E.until(`!!Editor.db()`);
      // ---- éditeur : fiche d'Eliwood (cavalier) → sprites à cheval ; case décochée → tous
      await E.js(`DBEditor.open('units', 'c_eliwood')`);
      await E.until(`!!document.querySelector('[data-generator-open]')`);
      await E.js(`document.querySelector('[data-generator-open]').click()`);
      await E.until(`!!document.querySelector('.cg-win [data-cg-by-class]')`, 20000);
      result.editeurGenres = await E.js(`[...document.querySelectorAll('[data-cg-gender]')].map(b => b.dataset.cgGender)`);
      assert(result.editeurGenres.join() === 'm,f,', 'genres éditeur : ' + result.editeurGenres);
      let tokens = await openPicker(E, 'token');
      assert(tokens.length && tokens.every(id => info('token', id).startsWith('horse/')), 'sprites de combat éditeur : ' + tokens.filter(id => !info('token', id).startsWith('horse/')));
      await E.js(`document.querySelector('[data-cg-by-class]').click()`); await wait(200);
      const all = await openPicker(E, 'token');
      assert(all.length > tokens.length * 3, 'case décochée : ' + all.length);
      await wait(200); await E.shot('a_editeur');
      await E.js(`document.querySelector('[data-cg-cancel]').click()`);
      // classe réservée à un genre : Classes › Lame-Seigneur « Réservée à : Hommes » → avertissement sur Lyn, générateur imposé
      await E.js(`DBEditor.open('classes', 'blade_lord')`);
      await E.until(`[...document.querySelectorAll('#db-body .field')].some(f => /Réservée à/.test(f.textContent))`);
      await E.js(`(() => { const f = [...document.querySelectorAll('#db-body .field')].find(f => /Réservée à/.test(f.textContent)); const s = f.querySelector('select'); s.value = 'homme'; s.dispatchEvent(new Event('change')); })()`);
      await E.until(`Editor.db().classes.find(c => c.id === 'blade_lord').gender === 'homme'`);
      await E.js(`DBEditor.open('units', 'c_lyn')`);
      await E.until(`!!document.querySelector('[data-gender-warning]')`);
      result.avertissement = await E.js(`document.querySelector('[data-gender-warning]').textContent`);
      await E.js(`document.querySelector('[data-generator-open]').click()`);
      await E.until(`!!document.querySelector('.cg-win [data-cg-gender-lock]')`, 20000);
      result.verrou = await E.js(`[...document.querySelectorAll('[data-cg-gender]')].map(b => b.dataset.cgGender + (b.disabled ? '-' : '') + (b.classList.contains('on') ? '*' : ''))`);
      assert(result.verrou.join() === 'm*,f-,-', 'genre imposé : ' + result.verrou);
      await wait(200); await E.shot('a2_verrou_genre');
      await E.js(`document.querySelector('[data-cg-cancel]').click()`);
      await E.js(`DBEditor.close()`);

      // ---- jeu : création du protagoniste (cavalier) : genre, sprites à cheval obligatoires
      const win = openPlaytest(dir, ''), wc = win.webContents; wc.setBackgroundThrottling(false); win.setSize(1200, 820);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      await new Promise(r => wc.once('did-finish-load', r));
      const G = mk(wc);
      await G.until(`!!document.querySelector('.choice-list')`);
      await G.js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await G.until(`!!document.querySelector('.cg-back.cg-game [data-cg-gender]')`, 20000);
      result.jeuGenres = await G.js(`[...document.querySelectorAll('[data-cg-gender]')].map(b => b.dataset.cgGender + (b.classList.contains('on') ? '*' : ''))`);
      result.classe = await G.js(`document.querySelector('[data-cg-class]').textContent`);
      assert(result.jeuGenres.join() === 'm*,f' && /Cavalier/.test(result.classe) && !(await G.js(`!!document.querySelector('[data-cg-by-class]')`)), 'jeu : ' + result.jeuGenres + ' ' + result.classe);
      tokens = await openPicker(G, 'token');
      assert(tokens.every(id => /^horse\/(m|u)$/.test(info('token', id))), 'combat (cavalier, masculin) : ' + tokens.map(id => id + '=' + info('token', id)));
      let sprites = await openPicker(G, 'sprite');
      assert(sprites.every(id => /^horse\/(m|u)$/.test(info('sprite', id))), 'map (cavalier, masculin) : ' + sprites);
      // féminin : toutes les pièces passent au féminin, toujours à cheval
      await G.js(`document.querySelector('[data-cg-gender="f"]').click()`); await wait(300);
      tokens = await openPicker(G, 'token'); sprites = await openPicker(G, 'sprite');
      const hair = await openPicker(G, 'hair');
      assert(tokens.every(id => /^horse\/(f|u)$/.test(info('token', id))) && sprites.every(id => /^horse\/(f|u)$/.test(info('sprite', id))), 'féminin à cheval');
      assert(hair.every(id => info('hair', id) !== '?/m') && hair.every(id => C.partSex('hair', P.hair.find(x => x.id === id), P) !== 'm'), 'cheveux féminins');
      await G.js(`(() => { const i = document.querySelector('[data-cg-name]'); i.value = 'Aria'; i.dispatchEvent(new Event('input')); })()`);
      await wait(400); await G.shot('b_creation');
      await G.js(`document.querySelector('[data-cg-ok]').click()`);
      await G.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`, 25000);
      result.avatar = await G.js(`(() => { const a = PlaytestState.campaign.avatar; return { nom: a.name, genre: a.gender, token: a.recipe.token, sprite: a.recipe.sprite }; })()`);
      assert(result.avatar.nom === 'Aria' && result.avatar.genre === 'f' && info('token', result.avatar.token) === 'horse/f' && /^horse\/(f|u)$/.test(info('sprite', result.avatar.sprite)), 'avatar : ' + JSON.stringify(result.avatar));

      // ---- camp : menu › Apparence
      await G.js(`PlaytestLobby.openMenu()`); await wait(300);
      result.menu = await G.js(`[...document.querySelectorAll('#menu button')].map(b => b.textContent.trim().split('\\n')[0]).filter(Boolean)`);
      assert(result.menu.some(t => /Apparence/.test(t)), 'menu du camp : ' + result.menu);
      await G.js(`[...document.querySelectorAll('#menu button')].find(b => /Apparence/.test(b.textContent)).dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      await wait(500);
      result.etat = await G.js(`({ busy: PlaytestState.busy, ui: PlaytestState.ui, cg: !!document.querySelector('.cg-back'), cancel: !!document.querySelector('[data-cg-cancel]') })`);
      await G.until(`!!document.querySelector('.cg-back.cg-game [data-cg-cancel]')`, 20000);
      assert(await G.js(`document.querySelector('[data-cg-name]').value === 'Aria' && document.querySelector('[data-cg-gender="f"]').classList.contains('on')`), 'reprise de la recette');
      await G.js(`document.querySelector('[data-cg-gender="m"]').click()`); await wait(200);
      await G.js(`(() => { const i = document.querySelector('[data-cg-name]'); i.value = 'Arion'; i.dispatchEvent(new Event('input')); })()`);
      await wait(300); await G.shot('c_camp_apparence');
      await G.js(`document.querySelector('[data-cg-ok]').click()`);
      await G.until(`!document.querySelector('.cg-back') && PlaytestState.campaign.avatar.name === 'Arion'`, 20000);
      result.camp = await G.js(`(() => { const S = PlaytestState, a = S.campaign.avatar, u = S.units.find(u => u.sourceId === 'c_eliwood'); return { genre: a.gender, token: a.recipe.token, unite: u && u.name, sprite: u && u.mapSprite, def: S.db.units.find(x => x.id === 'c_eliwood').name }; })()`);
      assert(result.camp.genre === 'm' && info('token', result.camp.token) !== 'horse/f' && info('token', result.camp.token).startsWith('horse/') && result.camp.def === 'Arion', 'camp : ' + JSON.stringify(result.camp));
      if (result.camp.unite) assert(result.camp.unite === 'Arion' && result.camp.sprite === 'avatar:c_eliwood', 'unité du camp : ' + JSON.stringify(result.camp));
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
