/*
 * Test de bout en bout : TF_SNAPSHOT=<dossier> npx electron .
 * Crée un projet d'exemple, parcourt l'éditeur, importe la map Tiled d'exemple,
 * lance un playtest, joue quelques actions et enregistre des captures.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io.js');

module.exports = function (editorWin, openPlaytest) {
  const out = process.env.TF_SNAPSHOT;
  fs.mkdirSync(out, { recursive: true });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errors = [];
  const log = (...a) => console.log('[snapshot]', ...a);

  const watch = (wc, name) => {
    wc.on('console-message', (e, level, message, line, source) => {
      if (level >= 2) { errors.push(`${name}: ${message} (${source}:${line})`); }
    });
    wc.on('render-process-gone', (e, d) => errors.push(name + ' crash ' + d.reason));
  };
  watch(editorWin.webContents, 'editor');

  async function shot(wc, name) {
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(out, name + '.png'), img.toPNG());
    log('capture', name);
  }
  const js = (wc, code) => wc.executeJavaScript(code, true);
  const key = async (wc, keyCode, n) => {
    for (let i = 0; i < (n || 1); i++) {
      wc.sendInputEvent({ type: 'keyDown', keyCode });
      wc.sendInputEvent({ type: 'char', keyCode });
      wc.sendInputEvent({ type: 'keyUp', keyCode });
      await wait(90);
    }
  };

  editorWin.webContents.once('did-finish-load', async () => {
    try {
      editorWin.setSize(1440, 900);
      await wait(600);
      await shot(editorWin.webContents, '00_accueil');
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-snap-')), 'MonJeu');
      io.createProject(dir, 'La Chronique de Varenne', 'sample', path.join(__dirname, '..', 'assets'));
      const ew = editorWin.webContents;
      await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      await wait(900);
      await shot(ew, '01_editeur_tiles');
      // peinture : on sélectionne la forêt dans la palette et on peint 3 cases sur le calque décor
      await js(ew, `(() => { const S = Editor.state; S.layerIndex = 1; S.brush = { tilesetId: 'ts_plaines', x: 2, y: 0, w: 1, h: 1 }; })()`);
      ew.send('menu', 'mode-terrain'); await wait(400);
      await shot(ew, '02_editeur_terrain');
      ew.send('menu', 'mode-units'); await wait(400);
      await js(ew, `(() => { Editor.state.selected = { kind: 'enemies', id: 'e7' }; document.querySelector('[data-mode=units]').click(); })()`);
      await wait(400);
      await shot(ew, '03_editeur_unites');
      ew.send('menu', 'database'); await wait(400);
      await shot(ew, '04_bdd_unites');
      await js(ew, `DBEditor.open('classes')`); await wait(300);
      await shot(ew, '05_bdd_classes');
      await js(ew, `DBEditor.open('tilesets')`); await wait(500);
      await shot(ew, '06_bdd_tilesets');
      await js(ew, `DBEditor.open('chapters')`); await wait(300);
      await shot(ew, '07_bdd_chapitres');
      await js(ew, `DBEditor.open('resources')`); await wait(700);
      await shot(ew, '07r_bdd_ressources_sprite');
      await js(ew, `(() => { const items = [...document.querySelectorAll('#db-body .db-item')]; const it = items.find(e => e.textContent.includes('Hector (Seigneur)')); it && it.click(); })()`); await wait(900);
      await shot(ew, '07s_bdd_ressources_battler');
      await js(ew, `DBEditor.open('system')`); await wait(300);
      await shot(ew, '07b_bdd_systeme');
      await js(ew, `DBEditor.close()`); await wait(300);

      // peinture réelle à la souris + annuler / rétablir
      ew.send('menu', 'mode-tiles'); await wait(300);
      await js(ew, `(() => { const S = Editor.state; S.layerIndex = 1; S.brush = { tilesetId: 'ts_plaines', x: 2, y: 0, w: 1, h: 1 }; })()`);
      const rect = JSON.parse(await js(ew, `JSON.stringify(document.getElementById('map-canvas').getBoundingClientRect())`));
      const cell = 32 * (await js(ew, 'Editor.state.zoom'));
      const pt = (cx, cy) => ({ x: Math.round(rect.x + cx * cell + cell / 2), y: Math.round(rect.y + cy * cell + cell / 2) });
      const decor = () => js(ew, `JSON.stringify([8,9,10].map(x => Editor.project().maps[0].layers[1].data[2 * 20 + x]))`);
      ew.sendInputEvent({ type: 'mouseMove', ...pt(8, 2) }); await wait(50);
      ew.sendInputEvent({ type: 'mouseDown', ...pt(8, 2), button: 'left', clickCount: 1 }); await wait(50);
      ew.sendInputEvent({ type: 'mouseMove', ...pt(9, 2), button: 'left' }); await wait(50);
      ew.sendInputEvent({ type: 'mouseMove', ...pt(10, 2), button: 'left' }); await wait(50);
      ew.sendInputEvent({ type: 'mouseUp', ...pt(10, 2), button: 'left', clickCount: 1 }); await wait(200);
      const painted = await decor();
      ew.send('menu', 'undo'); await wait(200);
      const undone = await decor();
      ew.send('menu', 'redo'); await wait(200);
      const redone = await decor();
      log('peinture', painted, 'annuler', undone, 'rétablir', redone);
      if (painted !== '[3,3,3]' || undone !== '[0,0,0]' || redone !== '[3,3,3]') errors.push('peinture/undo incorrects');
      await shot(ew, '07c_peinture');

      // import Tiled
      global.__tiledOverride = [path.join(__dirname, '..', 'assets', 'sample', 'tiled', 'chapitre1_forteresse.tmx')];
      ew.send('menu', 'import-tiled'); await wait(1200);
      await shot(ew, '08_import_rapport');
      await key(ew, 'Enter'); await wait(500);
      await shot(ew, '09_import_proposition_chapitre');
      await key(ew, 'Enter'); await wait(700);
      await shot(ew, '10_import_chapitre_cree');
      global.__tiledOverride = null;
      const state = await js(ew, `JSON.stringify({ maps: Editor.project().maps.map(m => [m.id, m.name, m.width, m.height]), chapters: Editor.db().chapters.map(c => [c.id, c.name, c.mapId, c.players.length, c.enemies.length, c.objective.type]) })`);
      log('état', state);

      // annuler / rétablir sur une peinture
      await js(ew, `(() => { const m = Editor.project().maps[0]; Editor.state.mapId = m.id; })()`);
      ew.send('menu', 'save'); await wait(600);
      const saved = io.loadProject(dir);
      log('sauvegarde', saved.maps.length, 'maps', saved.db.chapters.length, 'chapitres');

      // playtest
      const pw = openPlaytest(dir, 'ch_1');
      watch(pw.webContents, 'playtest');
      await new Promise(r => pw.webContents.once('did-finish-load', r));
      pw.setSize(1100, 780);
      await wait(2200);
      const pwc = pw.webContents;
      await shot(pwc, '11_playtest_dialogue');
      const idle = async (max) => {
        const t0 = Date.now();
        while (Date.now() - t0 < (max || 30000)) {
          const busy = await js(pwc, `BattleScene.isActive() || PlaytestState.busy || !!PlaytestState.dialogue || !!PlaytestState.waitClick`);
          if (!busy) return;
          await js(pwc, `PlaytestState.waitClick && PlaytestState.waitClick()`);
          await wait(200);
        }
        errors.push('délai dépassé en attendant la fin d\'une action');
      };
      const skipDialogue = () => js(pwc, `document.querySelector('.dlg-skip') && !document.querySelector('#dialogue').classList.contains('hidden') && document.querySelector('.dlg-skip').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await skipDialogue();
      await wait(1800);
      await shot(pwc, '12_playtest_sprites_map');
      // Eliwood (curseur dessus au départ) : portée de déplacement + menu
      await key(pwc, 'Z'); await wait(300);
      await key(pwc, 'Up', 4); await wait(400);
      await shot(pwc, '13_playtest_deplacement');
      await key(pwc, 'Z'); await wait(900);
      await shot(pwc, '14_playtest_menu_action');
      await key(pwc, 'X'); await wait(300); await key(pwc, 'X'); await wait(300);
      log('unités', await js(pwc, `JSON.stringify(PlaytestState.units.filter(u => !u.dead).map(u => [u.name, u.team, u.x, u.y, u.hp, u.mapSprite, u.battler]))`));

      // Hector (6,13) → (7,9), au contact du brigand en (8,9) : combat animé au corps à corps
      await key(pwc, 'Right'); await wait(100); await key(pwc, 'Down'); await wait(100);
      await key(pwc, 'Z'); await wait(300);
      await key(pwc, 'Up', 4); await wait(100); await key(pwc, 'Right'); await wait(200);
      await key(pwc, 'Z'); await wait(1000);
      await shot(pwc, '15_playtest_menu_hector');
      await key(pwc, 'Z'); await wait(500); // Attaquer
      await shot(pwc, '16_playtest_previsions');
      await key(pwc, 'Z'); await wait(1300);
      await shot(pwc, '17a_combat_hector_entree');
      await wait(900);
      await shot(pwc, '17b_combat_hector_action');
      await wait(900);
      await shot(pwc, '17c_combat_hector_suite');
      await idle();
      await shot(pwc, '17d_apres_combat');

      // Lyn à l'arc, à 2 cases du brigand en (2,4)
      await js(pwc, `(() => { const G = PlaytestState; const l = G.units.find(u => u.name === 'Lyn'); l.x = l.rx = 2; l.y = l.ry = 6; G.cursor = { x: 2, y: 6 }; })()`);
      await key(pwc, 'Z'); await wait(300); await key(pwc, 'Z'); await wait(700);
      const lynMenu = await js(pwc, `PlaytestState.menu ? PlaytestState.menu.items.map(i => i.label).join(',') : ''`);
      log('menu Lyn', lynMenu);
      await key(pwc, 'Z'); await wait(500);
      await shot(pwc, '18a_previsions_arc');
      await key(pwc, 'Z'); await wait(1600);
      await shot(pwc, '18b_combat_lyn_arc');
      await wait(700);
      await shot(pwc, '18c_combat_lyn_arc_suite');
      await idle();

      // convoi : Eliwood (chef d'escouade) récupère un objet
      await js(pwc, `(() => { PlaytestState.cursor = { x: 5, y: 12 }; })()`);
      await key(pwc, 'Z'); await wait(300); await key(pwc, 'Z'); await wait(700);
      const elMenu = await js(pwc, `PlaytestState.menu ? PlaytestState.menu.items.map(i => i.label).join(',') : ''`);
      log('menu Eliwood', elMenu);
      if (!elMenu.includes('Convoi')) errors.push('pas de Convoi dans le menu du chef');
      await js(pwc, `PlaytestState.menu.items.find(i => i.label === 'Convoi').action()`); await wait(400);
      const before = await js(pwc, `PlaytestState.units.find(u => u.name === 'Eliwood').inventory.length + '/' + PlaytestState.convoy.length`);
      await js(pwc, `document.querySelectorAll('#convoy .cv-col')[1].querySelector('.cv-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); await wait(300);
      const after = await js(pwc, `PlaytestState.units.find(u => u.name === 'Eliwood').inventory.length + '/' + PlaytestState.convoy.length`);
      log('convoi (inventaire/convoi)', before, '→', after);
      if (before === after) errors.push('retrait du convoi sans effet');
      await shot(pwc, '18d_convoi');
      await key(pwc, 'X'); await wait(300);
      await js(pwc, `PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`); await wait(500);
      log('musique', await js(pwc, `JSON.stringify(Music.state())`));

      // toutes les unités du joueur ont joué → la phase alliée démarre seule (Cloud jouable), puis la phase ennemie
      for (let i = 0; i < 40 && !(await js(pwc, `PlaytestState.phase === 'ally' && !PlaytestState.busy`)); i++) await wait(200);
      log('phase', await js(pwc, `PlaytestState.phase`), 'musique', await js(pwc, `JSON.stringify(Music.state())`));
      await shot(pwc, '19b_phase_alliee');
      // Cloud avance de 2 cases vers le nord puis attend
      const cl = JSON.parse(await js(pwc, `JSON.stringify((u => [u.x, u.y])(PlaytestState.units.find(u => u.name === 'Cloud')))`));
      await js(pwc, `PlaytestState.cursor = { x: ${cl[0]}, y: ${cl[1]} }`);
      await key(pwc, 'Z'); await wait(300); await key(pwc, 'Up', 2); await wait(200);
      await shot(pwc, '19c_cloud_deplacement');
      await key(pwc, 'Z'); await wait(900);
      log('menu Cloud', await js(pwc, `PlaytestState.menu ? PlaytestState.menu.items.map(i => i.label).join(',') : '(aucun)'`));
      await js(pwc, `PlaytestState.menu && PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`);
      let shotEnemy = false;
      for (let i = 0; i < 100; i++) {
        await wait(250);
        if (!shotEnemy && await js(pwc, `BattleScene.isActive()`)) { await wait(1400); await shot(pwc, '20_combat_phase_ennemie'); shotEnemy = true; }
        if (await js(pwc, `PlaytestState.phase === 'player' && !PlaytestState.busy`)) break;
      }
      await idle();
      await shot(pwc, '21_playtest_tour2');
      const st = await js(pwc, `JSON.stringify({ turn: PlaytestState.turn, phase: PlaytestState.phase, units: PlaytestState.units.map(u => [u.name, u.team, u.x, u.y, u.hp, u.dead, u.level, u.exp]) })`);
      log('état playtest', st);

      // victoire : Eliwood au contact de Batta affaibli
      await js(pwc, `(() => {
        const G = PlaytestState;
        const a = G.units.find(u => u.name === 'Eliwood'); const g = G.units.find(u => u.name === 'Batta');
        a.x = a.rx = 17; a.y = a.ry = 2; a.stats.skl = 60; a.done = false; g.hp = 1;
        G.cursor = { x: 17, y: 2 };
      })()`);
      await key(pwc, 'Z'); await wait(300);
      await key(pwc, 'Z'); await wait(500);
      await key(pwc, 'Z'); await wait(400);
      const tgt = await js(pwc, `PlaytestState.targets.map(t => t.name).join(',')`);
      for (let i = 0; i < 4 && !(await js(pwc, `PlaytestState.targets[PlaytestState.tIndex].name`)).startsWith('Batta'); i++) await key(pwc, 'Right');
      await wait(300);
      log('cibles', tgt, '→', await js(pwc, `PlaytestState.targets[PlaytestState.tIndex].name`));
      await key(pwc, 'Z'); await wait(1700);
      await shot(pwc, '22_combat_eliwood_batta');
      for (let i = 0; i < 60; i++) {
        await wait(300);
        await skipDialogue();
        if (await js(pwc, `!!document.querySelector('#end h1')`)) break;
      }
      await wait(600);
      await shot(pwc, '23_playtest_victoire');
      const endTxt = await js(pwc, `document.querySelector('#end h1') ? document.querySelector('#end h1').textContent : '(pas d’écran de fin)'`);
      log('fin', endTxt);
      if (endTxt !== 'Victoire') errors.push('pas de victoire : ' + endTxt);
    } catch (e) {
      errors.push('snapshot: ' + (e.stack || e));
    }
    fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
    log(errors.length ? 'ERREURS :\n' + errors.join('\n') : 'aucune erreur console');
    app.exit(0);
  });
};
