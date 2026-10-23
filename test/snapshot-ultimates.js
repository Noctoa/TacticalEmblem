/*
 * Ultimes en bataille : badge de recharge / icône sur la carte, action « Ultime » du menu, frappe (prévision,
 * dégâts, recharge), dégâts de zone sur une case choisie, renfort (nouveau tour + bonus), soin de zone,
 * recharge qui baisse au début de la phase, fiche de l'unité ; onglet Ultimes de l'éditeur.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-ultimates.js npm start
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
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const ewc = editor.webContents;
  ewc.on('console-message', (e, level, message) => { if (level >= 3) errors.push('[éditeur] ' + message); });
  ewc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-ult-')), 'Jeu');
      const p = io.createProject(dir, 'Ultimes', 'sample', path.join(__dirname, '..', 'assets'));
      assert(p.db.ultimates.length === 4 && p.db.units.find(u => u.id === 'c_hector').ultimate === 'ult_meteore', 'exemples');
      p.meta.lobby.enabled = false; p.meta.settings.battleAnims = false;
      Object.assign(p.db.chapters[0], { events: [], requiredUnits: [], objective: { type: 'survive', turns: 99 } });
      io.saveProject(dir, p);

      // ---- 1. éditeur : onglet Ultimes, ultime dans la fiche d'une unité
      const ejs = c => ewc.executeJavaScript(c, true);
      const euntil = async (c, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ejs(c)) return; await wait(60); } throw new Error('Délai : ' + c); };
      const eshot = async n => { await ewc.capturePage(); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await ewc.capturePage()).toPNG()); };
      await ejs(`Editor.open(${JSON.stringify(dir)})`);
      await euntil(`!!Editor.db()`);
      await ejs(`DBEditor.open('ultimates', 'ult_meteore')`);
      await euntil(`!!document.querySelector('[data-ultimate-summary]')`);
      result.onglets = await ejs(`[...document.querySelectorAll('#db-tabs button')].map(b => b.textContent)`);
      assert(result.onglets.includes('Ultimes'), 'onglet Ultimes');
      result.resume = await ejs(`document.querySelector('[data-ultimate-summary]').textContent`);
      assert(/Dégâts de zone/.test(result.resume) && /recharge 4/.test(result.resume), 'résumé : ' + result.resume);
      await wait(300); await eshot('a_editeur_ultime');
      // changer le type d'effet : les réglages suivent
      await ejs(`(() => { const s = [...document.querySelectorAll('.db-form select')].find(x => [...x.options].some(o => o.value === 'rally')); s.value = 'heal'; s.dispatchEvent(new Event('change')); })()`);
      await euntil(`Editor.db().ultimates.find(u => u.id === 'ult_meteore').effect === 'heal' && Editor.db().ultimates.find(u => u.id === 'ult_meteore').amount === 50`);
      assert(await ejs(`Editor.db().ultimates.find(u => u.id === 'ult_meteore').area === undefined`), 'réglages de zone retirés');
      await ejs(`(() => { const s = [...document.querySelectorAll('.db-form select')].find(x => [...x.options].some(o => o.value === 'rally')); s.value = 'blast'; s.dispatchEvent(new Event('change')); })()`);
      await euntil(`Editor.db().ultimates.find(u => u.id === 'ult_meteore').effect === 'blast'`);
      await ejs(`DBEditor.open('units', 'c_hector')`);
      await euntil(`[...document.querySelectorAll('.field-label')].some(l => l.textContent.startsWith('Ultime'))`);
      result.champUnite = await ejs(`(() => { const l = [...document.querySelectorAll('.field-label')].find(l => l.textContent.startsWith('Ultime')); const s = l.parentElement.querySelector('select'); return s.options[s.selectedIndex].textContent; })()`);
      assert(/Météore/.test(result.champUnite), 'champ unité : ' + result.champUnite);
      await ejs(`(() => { const l = [...document.querySelectorAll('.field-label')].find(l => l.textContent.startsWith('Ultime')); l.parentElement.querySelector('select').scrollIntoView(); })()`);
      await wait(250); await eshot('b_editeur_unite');
      await ejs(`DBEditor.close()`);

      // ---- 2. bataille
      const win = openPlaytest(dir, p.db.chapters[0].id), wc = win.webContents;
      wc.setBackgroundThrottling(false); win.setSize(1200, 800);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
      const shot = async n => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); };
      await new Promise(r => wc.once('did-finish-load', r));
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`!!PlaytestState.map && PlaytestState.phase === 'player' && !PlaytestState.busy`, 25000);
      // trois personnages côte à côte, un ennemi à côté du premier
      result.equipe = await js(`(() => {
        const G = PlaytestState; G.debug.passive = true; G.fast = true;
        const team = G.units.filter(u => u.team === 'player' && !u.dead).slice(0, 3);
        const free = (x, y) => x >= 0 && y >= 0 && x < G.map.width && y < G.map.height && !G.units.some(u => !u.dead && u.x === x && u.y === y);
        const put = (u, x, y) => { u.x = u.rx = x; u.y = u.ry = y; };
        const [A, B, C] = team;
        let spot = null;
        for (let y = 1; y < G.map.height - 2 && !spot; y++) for (let x = 1; x < G.map.width - 3 && !spot; x++)
          if (free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 2, y + 1) && free(x + 1, y + 1)) spot = { x, y };
        put(A, spot.x, spot.y); put(B, spot.x, spot.y + 1); put(C, spot.x + 1, spot.y + 1);
        const E = G.units.filter(u => u.team === 'enemy' && !u.dead)[0]; put(E, spot.x + 1, spot.y); E.hp = E.stats.hp = 60;
        A.ultimate = 'ult_assaut'; A.ultCharge = 0; B.ultimate = 'ult_meteore'; B.ultCharge = 0; C.ultimate = 'ult_cri'; C.ultCharge = 2;
        window.A = A; window.B = B; window.C = C; window.E = E;
        return team.map(u => u.name);
      })()`);
      const menu = async (who) => {
        await js(`(() => { const u = window.${who}; PlaytestState.cursor = { x: u.x, y: u.y }; })()`);
        await key('Z'); await until(`PlaytestState.ui === 'moving'`);
        await key('Z'); await until(`PlaytestState.ui === 'menu' && !PlaytestState.busy`);
        return js(`(() => { const it = PlaytestState.menu.items.find(i => i.ultimate); return it ? { sub: it.sub, disabled: !!it.disabled } : null; })()`);
      };
      await wait(400); await shot('c_carte_badges');
      // 2a. frappe ultime : prévision, dégâts renforcés, recharge
      result.menuA = await menu('A');
      assert(result.menuA && !result.menuA.disabled && /Assaut/.test(result.menuA.sub), 'menu A : ' + JSON.stringify(result.menuA));
      await js(`PlaytestState.menu.items.find(i => i.ultimate).action()`);
      await until(`PlaytestState.ui === 'target' && !!document.querySelector('#forecast [data-forecast-ultimate]')`);
      result.prevision = await js(`document.querySelector('#forecast [data-forecast-ultimate]').textContent`);
      assert(/touche assurée/.test(result.prevision), 'prévision : ' + result.prevision);
      await shot('d_prevision');
      const hp0 = await js(`E.hp`);
      await key('Z');
      await until(`window.A.done && !PlaytestState.busy`, 20000);
      result.frappe = await js(`({ degats: ${hp0} - E.hp, recharge: A.ultCharge })`);
      assert(result.frappe.recharge === 3 && result.frappe.degats > 0, 'frappe : ' + JSON.stringify(result.frappe));
      // 2b. dégâts de zone sur la case de l'ennemi
      result.menuB = await menu('B');
      assert(result.menuB && !result.menuB.disabled, 'menu B');
      await js(`PlaytestState.menu.items.find(i => i.ultimate).action()`);
      await until(`PlaytestState.ui === 'ultimate'`);
      await js(`PlaytestState.cursor = { x: E.x, y: E.y }`); await wait(300);
      await shot('e_zone');
      const hp1 = await js(`E.hp`);
      await key('Z');
      await until(`window.B.done && !PlaytestState.busy`, 20000);
      result.zone = await js(`({ degats: ${hp1} - E.hp, recharge: B.ultCharge })`);
      assert(result.zone.recharge === 4 && result.zone.degats > 0, 'zone : ' + JSON.stringify(result.zone));
      // 2c. renfort : en recharge (2 tours) puis prêt ; nouveau tour pour A, bonus de dégâts
      result.menuC = await menu('C');
      assert(result.menuC && result.menuC.disabled && /2 tours/.test(result.menuC.sub), 'recharge : ' + JSON.stringify(result.menuC));
      await key('X'); await until(`PlaytestState.ui === 'moving'`); await key('X'); await until(`PlaytestState.ui === 'idle'`);
      await js(`C.ultCharge = 0; C.done = false`);
      await menu('C');
      await js(`PlaytestState.menu.items.find(i => i.ultimate).action()`);
      await until(`PlaytestState.ui === 'ultimate'`);
      await key('Z');
      await until(`window.C.done && !PlaytestState.busy`, 20000);
      result.renfort = await js(`({ rejoue: !A.done, bonus: (A.rally || []).map(r => r.dmg), recharge: C.ultCharge })`);
      assert(result.renfort.rejoue && result.renfort.bonus[0] === 3 && result.renfort.recharge === 5, 'renfort : ' + JSON.stringify(result.renfort));
      // bonus pris en compte dans les dégâts prévus
      result.bonusPrevu = await js(`(() => { const w = Rules.equipped(A, PlaytestState.db); const f = Rules.forecast(A, w.index, E, { db: PlaytestState.db, settings: PlaytestState.settings, terrainOf: () => null, units: PlaytestState.units }); const g = Rules.forecast(A, w.index, E, { db: PlaytestState.db, settings: PlaytestState.settings, terrainOf: () => null, units: PlaytestState.units, bonusOf: () => Ultimates.rallyBonus(A) }); return g.att.dmg - f.att.dmg; })()`);
      assert(result.bonusPrevu === 3, 'bonus de renfort : ' + result.bonusPrevu);
      // fiche : bloc Ultime, puis info de l'unité
      await js(`PlaytestState.cursor = { x: A.x, y: A.y }`); await wait(200);
      result.tag = await js(`(document.querySelector('[data-unit-ultimate]') || {}).textContent || ''`);
      assert(/3 tours/.test(result.tag), 'badge info : ' + result.tag);
      await shot('f_recharge');
      await key('R'); await until(`!!document.querySelector('#unit-sheet .rd-sheet')`);
      await key('Down'); await key('Down');
      await until(`!!document.querySelector('#unit-sheet [data-sheet-ultimate]')`);
      await wait(400); await shot('g_fiche');
      await key('X'); await until(`!document.querySelector('#unit-sheet')`);
      // 2d. soin de zone (Aurore) : A blessé et empoisonné
      await js(`A.hp = 5; Statuses.apply(A, 'poison', 3); B.ultimate = 'ult_aurore'; B.ultCharge = 0; B.done = false`);
      result.menuSoin = await menu('B');
      assert(result.menuSoin && !result.menuSoin.disabled, 'menu soin : ' + JSON.stringify(result.menuSoin));
      await js(`PlaytestState.menu.items.find(i => i.ultimate).action()`);
      await until(`PlaytestState.ui === 'ultimate'`);
      await key('Z');
      await until(`window.B.done && !PlaytestState.busy`, 20000);
      result.soin = await js(`({ pv: A.hp, poison: Statuses.list(A).length })`);
      assert(result.soin.pv > 5 && result.soin.poison === 0, 'soin : ' + JSON.stringify(result.soin));
      // 2e. fin du tour : la recharge baisse d'un tour au début de la phase joueur suivante
      const before = await js(`({ a: A.ultCharge, c: C.ultCharge })`);
      await js(`PlaytestState.units.filter(u => u.team === 'player').forEach(u => { u.done = true; })`);
      await js(`(() => { const G = PlaytestState; for (let y = 0; y < G.map.height; y++) for (let x = 0; x < G.map.width; x++) if (!G.units.some(u => !u.dead && u.x === x && u.y === y)) { G.cursor = { x, y }; return; } })()`);
      await key('Z'); await until(`PlaytestState.ui === 'mapmenu'`);
      await js(`PlaytestState.menu.items.find(i => /Fin/.test(i.label)).action()`);
      await until(`PlaytestState.phase !== 'player' || PlaytestState.turn === 2`, 15000);
      if (await js(`PlaytestState.phase === 'ally'`)) { // alliés jouables : fin de la phase alliée
        await until(`PlaytestState.phase === 'ally' && !PlaytestState.busy && PlaytestState.ui === 'idle'`);
        await js(`(() => { const G = PlaytestState; for (let y = 0; y < G.map.height; y++) for (let x = 0; x < G.map.width; x++) if (!G.units.some(u => !u.dead && u.x === x && u.y === y)) { G.cursor = { x, y }; return; } })()`);
        await key('Z'); await until(`PlaytestState.ui === 'mapmenu'`);
        await js(`PlaytestState.menu.items.find(i => /Fin/.test(i.label)).action()`);
      }
      try { await until(`PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`, 30000); }
      catch (e) { throw new Error(e.message + ' — état : ' + await js(`JSON.stringify({ turn: PlaytestState.turn, phase: PlaytestState.phase, ui: PlaytestState.ui, busy: PlaytestState.busy, dialogue: !!PlaytestState.dialogue, menu: !!PlaytestState.menu, modal: !!document.querySelector('.modal-back') && document.querySelector('.modal-back').textContent.slice(0, 200) })`)); }
      result.tour2 = await js(`({ a: A.ultCharge, c: C.ultCharge, bonus: (A.rally || []).length })`);
      assert(result.tour2.a === before.a - 1 && result.tour2.c === before.c - 1 && result.tour2.bonus === 0, 'tour 2 : ' + JSON.stringify(result.tour2));
      await wait(300); await shot('h_tour2');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
