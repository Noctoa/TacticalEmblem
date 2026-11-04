/*
 * Boutique sur une map de combat (éditeur : placement + stock ; jeu : action « Boutique », achat, vente),
 * dialogue de combat entre Hector et un ennemi, et événement de zone déclenché par un ennemi.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-battle-features.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const mk = (wc) => ({ js: c => wc.executeJavaScript(c, true),
    until: async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await wc.executeJavaScript(c, true)) return; await wait(80); } throw new Error('Délai : ' + c); },
    shot: async n => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); },
    key: async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(150); } });
  const ewc = editor.webContents; ewc.setBackgroundThrottling(false);
  ewc.on('console-message', (e, level, message) => { if (level >= 3) errors.push('[éditeur] ' + message); });
  ewc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-bfeat-')), 'Jeu');
      const p = io.createProject(dir, 'Combat', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false; p.meta.settings = Object.assign({}, p.meta.settings, { battleAnims: false });
      const ch = p.db.chapters[0];
      Object.assign(ch, { events: [], allies: [], requiredUnits: [], objective: { type: 'survive', turns: 99 }, deployment: { enabled: false } });
      io.saveProject(dir, p);
      // ---- éditeur : boutique posée sur la case de Lyn, stock ; dialogue de combat sur un ennemi
      const E = mk(ewc);
      await E.js(`Editor.open(${JSON.stringify(dir)})`); await E.until(`!!Editor.db()`);
      await E.js(`Editor.selectChapter('ch_1'); document.querySelector('[data-mode="units"]').click()`);
      await E.until(`!!document.querySelector('[data-place-lock="shops"]')`);
      await E.js(`document.querySelector('[data-place-lock="shops"]').click()`);
      const lyn = ch.players.find(q => q.unitId === 'c_lyn');
      await E.js(`(() => { const c = document.querySelector('#canvas-wrap canvas'), r = c.getBoundingClientRect(), m = Editor.project().maps.find(m => m.id === Editor.db().chapters[0].mapId);
        const o = { bubbles: true, clientX: r.left + (${lyn.x} + .5) * r.width / m.width, clientY: r.top + (${lyn.y} + .5) * r.height / m.height, button: 0 };
        c.dispatchEvent(new MouseEvent('mousedown', o)); window.dispatchEvent(new MouseEvent('mouseup', o)); })()`);
      await E.until(`(Editor.db().chapters[0].shops || []).length === 1`);
      await E.until(`[...document.querySelectorAll('#inspector .field')].some(f => /Articles vendus/.test(f.textContent))`);
      await E.js(`(() => { const f = [...document.querySelectorAll('#inspector .field')].find(f => /Articles vendus/.test(f.textContent));
        for (const chip of [...f.querySelectorAll('.chip')].filter(c => /Épée de fer|Potion/.test(c.textContent))) chip.click(); })()`);
      result.stock = await E.js(`Editor.db().chapters[0].shops[0].stock`);
      assert(result.stock.length === 2, 'stock : ' + result.stock);
      await wait(200); await E.shot('a_editeur_boutique');
      // dialogue de combat sur le premier ennemi non boss
      const enemyId = ch.enemies.find(e => !e.isBoss).id;
      await E.js(`(() => { const S = Editor.state; S.placeTool = null; S.selected = { kind: 'enemies', id: ${JSON.stringify(enemyId)} }; Editor.selectChapter('ch_1'); })()`);
      await E.js(`document.querySelector('[data-mode="units"]').click()`);
      await E.js(`(() => { const S = Editor.state; S.selected = { kind: 'enemies', id: ${JSON.stringify(enemyId)} }; })(); document.querySelector('[data-mode="units"]').click()`);
      await E.until(`!!document.querySelector('[data-battle-talk-add]')`);
      await E.js(`document.querySelector('[data-battle-talk-add]').click()`);
      await E.until(`!!document.querySelector('[data-battle-talk="0"] textarea')`);
      await E.js(`(() => { const box = document.querySelector('[data-battle-talk="0"]');
        const t = box.querySelector('textarea'); t.value = 'Hector: Toi, tu vas goûter à ma hache !\\nBrigand: Essaie donc, gros lourdaud !'; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true }));
        [...box.querySelectorAll('.chip')].find(c => c.textContent.trim() === 'Hector').click(); })()`);
      result.dialogue = await E.js(`JSON.stringify(Editor.db().chapters[0].enemies.find(e => e.id === ${JSON.stringify(enemyId)}).battleTalks)`);
      assert(/Hector: Toi/.test(result.dialogue) && /c_hector/.test(result.dialogue), 'dialogue : ' + result.dialogue);
      await wait(200); await E.shot('b_editeur_dialogue');
      // événement : zone couvrant toute la map, déclenchée par un ennemi
      await E.js(`(() => { const c = Editor.db().chapters[0], m = Editor.project().maps.find(m => m.id === c.mapId);
        c.events.push({ id: 'ev_enemy_zone', name: 'Un ennemi bouge', trigger: { type: 'area', x: 0, y: 0, w: m.width, h: m.height, who: 'enemy' }, once: true, script: 'Lyn: Ils avancent !', actions: [{ type: 'flag', key: 'enemyMoved', value: true }] }); })()`);
      ewc.send('menu', 'save'); await E.until('!Editor.state.dirty');

      // ---- jeu
      const win = openPlaytest(dir, 'ch_1'), wc = win.webContents; wc.setBackgroundThrottling(false); win.setSize(1100, 780);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      await new Promise(r => wc.once('did-finish-load', r));
      const G = mk(wc);
      const skip = `PlaytestState.dialogue && PlaytestState.dialogue.skip()`;
      await G.until(`!!document.querySelector('.choice-list')`);
      await G.js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await G.until(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`, 20000);
      // boutique : Lyn est sur la case de la boutique
      result.or0 = await G.js(`PlaytestState.campaign.gold || 0`);
      await G.js(`(() => { const G = PlaytestState, l = G.units.find(u => u.sourceId === 'c_lyn'); G.campaign.gold = 2000; G.cursor = { x: l.x, y: l.y }; window.__inv = l.inventory.length; })()`);
      await G.key('Z'); await G.until(`PlaytestState.ui === 'moving'`);
      await G.key('Z'); await G.until(`PlaytestState.ui === 'menu'`);
      result.menu = await G.js(`PlaytestState.menu.items.map(i => i.label)`);
      assert(result.menu.includes('Boutique'), 'menu : ' + result.menu);
      await G.js(`PlaytestState.menu.items.find(i => i.label === 'Boutique').action()`);
      await G.until(`!!document.querySelector('[data-shop-buy]')`);
      await G.js(`document.querySelector('[data-shop-buy]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await wait(300);
      result.achat = await G.js(`(() => { const l = PlaytestState.units.find(u => u.sourceId === 'c_lyn'); return { or: PlaytestState.campaign.gold, inv: l.inventory.length, avant: window.__inv }; })()`);
      assert(result.achat.or < 2000 && result.achat.inv === result.achat.avant + 1, 'achat : ' + JSON.stringify(result.achat));
      await G.shot('c_jeu_boutique');
      await G.js(`document.querySelector('[data-shop-sell="0"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); await wait(300);
      result.vente = await G.js(`PlaytestState.campaign.gold`);
      assert(result.vente > result.achat.or, 'vente : ' + result.vente);
      await G.key('X'); await G.until(`PlaytestState.ui === 'menu'`);
      await G.js(`PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`); await G.until(`!PlaytestState.busy`);
      // dialogue de combat : Hector attaque le brigand (posés côte à côte)
      await G.js(`(() => { const G = PlaytestState, h = G.units.find(u => u.name === 'Hector'), b = G.units.find(u => u.sourceId === ${JSON.stringify(enemyId)});
        for (const u of G.units) if (u !== h && u !== b && u.team === 'enemy') { u.x = u.rx = 0; u.y = u.ry = 0; }
        h.x = h.rx = 7; h.y = h.ry = 9; b.x = b.rx = 8; b.y = b.ry = 9; G.cursor = { x: 7, y: 9 }; })()`);
      await G.key('Z'); await G.until(`PlaytestState.ui === 'moving'`);
      await G.key('Z'); await G.until(`PlaytestState.ui === 'menu'`);
      await G.js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(400);
      await G.key('Z');
      await G.until(`!!PlaytestState.dialogue`, 10000);
      await G.until(`/goûter à ma hache/.test(document.querySelector('#dialogue').textContent)`, 8000); // texte qui s'écrit
      result.vu = await G.js(`document.querySelector('#dialogue').textContent.replace(/\\s+/g, ' ').trim()`);
      assert(/goûter à ma hache/.test(result.vu), 'dialogue de combat : ' + result.vu);
      await G.shot('d_jeu_dialogue');
      for (let i = 0; i < 300 && await G.js(`PlaytestState.busy || !!PlaytestState.dialogue`); i++) { await G.js(skip); await wait(150); }
      result.tue = await G.js(`PlaytestState.battleTalksDone.size`);
      result.etat = await G.js(`({ ui: PlaytestState.ui, busy: PlaytestState.busy, phase: PlaytestState.phase, dlg: !!PlaytestState.dialogue, battle: BattleScene.isActive(), body: document.body.className, modal: !!document.querySelector('.modal-back') })`);
      await G.shot('e_etat');
      // événement de zone déclenché par un ennemi : fin du tour, phase ennemie
      await G.js(`(() => { const G = PlaytestState; for (const u of G.units) if (u.team === 'player') u.done = true;
        // un brigand libre et agressif, à quelques cases de l'équipe : il bouge pendant la phase ennemie
        const e = G.units.find(u => u.team === 'enemy' && !u.dead && u.hp > 0 && !u.isBoss), h = G.units.find(u => u.name === 'Hector');
        const free = (x, y) => x >= 0 && y >= 0 && x < G.map.width && y < G.map.height && !G.units.some(o => !o.dead && o !== e && o.x === x && o.y === y);
        for (let d = 3; d < 8; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (free(h.x + dx, h.y + dy)) { e.x = e.rx = h.x + dx; e.y = e.ry = h.y + dy; e.ai = 'aggressive'; return; } })()`);
      await G.js(`(() => { const G = PlaytestState; for (let y = 0; y < G.map.height; y++) for (let x = 0; x < G.map.width; x++) if (!G.units.some(u => !u.dead && u.x === x && u.y === y)) { G.cursor = { x, y }; return; } })()`);
      await G.until(`!PlaytestState.busy && PlaytestState.ui === 'idle'`);
      await G.key('Z'); await G.until(`PlaytestState.ui === 'mapmenu'`);
      await G.js(`void PlaytestState.menu.items.find(i => i.label.includes('Fin du tour')).action()`);
      for (let i = 0; i < 200 && !(await G.js(`!!(PlaytestState.campaign.scenario && PlaytestState.campaign.scenario.flags.enemyMoved)`)); i++) { await G.js(skip); await wait(120); }
      result.debug = await G.js(`({ events: PlaytestState.chapter.events.map(e => e.id + ':' + JSON.stringify(e.trigger)), turn: PlaytestState.turn, phase: PlaytestState.phase, fired: [...PlaytestState.fired], flags: PlaytestState.campaign.scenario })`);
      result.zone = await G.js(`!!(PlaytestState.campaign.scenario && PlaytestState.campaign.scenario.flags.enemyMoved)`);
      assert(result.zone, 'événement déclenché par un ennemi');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
