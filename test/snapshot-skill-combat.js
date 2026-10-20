/* Vérification en jeu : prévisions, animations, effets sur la map et débuts de phase. */
'use strict';
require('./auto-deploy.js'); // écran des préparatifs validé avec la sélection par défaut
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = (wc, code) => wc.executeJavaScript(code, true);
  const finish = result => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 120000);
  const until = async (wc, condition, paint = false) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      if (await js(wc, condition)) return;
      // Les fenêtres masquées ont besoin de captures pour faire avancer le rendu animé.
      if (paint) await wc.capturePage();
      await delay(80);
    }
    const state = await js(wc, `({ panels: [...document.querySelectorAll('.b-panel')].map(el => ({ class: el.className, text: el.textContent })),
      busy: PlaytestState.busy, hp: window.H && H.hp, combat: window.lastCombat && lastCombat.strikes })`);
    throw new Error('Délai dépassé : ' + condition + '\n' + JSON.stringify(state));
  };
  const shot = async (wc, name) => { await wc.capturePage(); await delay(220); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-combat-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Compétences actives', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false; io.saveProject(dir, p); // ce scénario ne teste pas le lobby : la partie démarre directement au chapitre
      p.db.supports = []; // Le scénario isole les compétences, sans attaque d'affinité aléatoire.
      const hero = p.db.units[0], ally = p.db.units[1], ch = p.db.chapters[0];
      hero.stats = { hp: 40, str: 15, mag: 0, skl: 0, spd: 5, lck: 0, def: 10, res: 10 };
      hero.level = 1; hero.personalSkill = 'skill_precision';
      hero.learnedSkills = ['skill_offensive', 'skill_luna', 'skill_sol', 'skill_regeneration']; hero.equippedSkills = ['skill_offensive', 'skill_luna'];
      hero.inventory = [{ id: 'w_iron_sword' }];
      ally.learnedSkills = ['skill_presence', 'skill_regeneration']; ally.equippedSkills = ally.learnedSkills.slice();
      for (const id of ['skill_luna', 'skill_sol', 'skill_miracle']) Object.assign(p.db.skills.find(s => s.id === id), { activation: 'fixed', chance: 100 });
      Object.assign(p.db.weapons.find(w => w.id === 'w_iron_sword'), { might: 5, hit: 1000, weight: 0, crit: 0 });
      const enemyClass = p.db.classes.find(c => c.id === 'brigand'); enemyClass.weapons = ['sword'];
      Object.assign(enemyClass.base, { hp: 40, str: 5, skl: 0, spd: 5, lck: 0, def: 8 });
      enemyClass.skillLearning = [{ level: 1, skillId: 'skill_miracle' }, { level: 1, skillId: 'skill_vantage' }];
      Object.assign(ch, { objective: { type: 'survive', turns: 99 }, requiredUnits: [], events: [], next: '', final: false, allies: [] });
      ch.players = [{ unitId: hero.id, x: 3, y: 3 }, { unitId: ally.id, x: 3, y: 4 }];
      ch.enemies = [{ id: 'test_enemy', classId: 'brigand', name: 'Adversaire', level: 1, x: 4, y: 3, ai: 'stationary', inventory: [{ id: 'w_iron_sword' }] }];
      p.meta.settings.battleAnims = true; io.saveProject(dir, p);
      const win = openPlaytest(dir, ch.id), wc = win.webContents;
      wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      await new Promise(resolve => wc.once('did-finish-load', resolve));
      await until(wc, `!!document.querySelector('.choice-list')`);
      await js(wc, `[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(wc, '!!PlaytestState.map && !PlaytestState.busy');
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await delay(100); };
      await js(wc, `(() => {
        const G = PlaytestState; window.H = G.units.find(u => u.sourceId === ${JSON.stringify(hero.id)}); window.D = G.units.find(u => u.team === 'enemy');
        D.hp = 10; D.stats.def = 8; D.stats.spd = 5; G.settings.trueHit = false;
        const original = Rules.resolveCombat;
        Rules.resolveCombat = (...args) => { const result = original(...args); window.lastCombat = result; return result; };
        G.cursor = { x: H.x, y: H.y };
      })()`);
      const selectAttack = async () => {
        await js(wc, `H.done = false; PlaytestState.cursor = { x: H.x, y: H.y }`);
        await key('Z'); await until(wc, `PlaytestState.ui === 'moving'`);
        await key('Z'); await until(wc, `PlaytestState.ui === 'menu'`);
        await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`);
        await until(wc, `!document.querySelector('#forecast').classList.contains('hidden')`);
      };
      await selectAttack();
      const forecast = await js(wc, `document.querySelector('#forecast').textContent`);
      assert.match(forecast, /Luna 100 %/); assert.match(forecast, /Miracle 100 %/); assert.match(forecast, /riposte en premier/);
      assert.match(forecast, /Présence rassurante/); await shot(wc, 'forecast');
      await key('Z'); await until(wc, `document.body.classList.contains('in-battle')`); await delay(1000); await shot(wc, 'animated-combat');
      await key('X'); await until(wc, `!PlaytestState.busy && !document.body.classList.contains('in-battle')`);
      assert.equal(await js(wc, 'D.hp'), 1);
      assert.deepEqual(await js(wc, `lastCombat.strikes.map(s => s.skills.map(skill => skill.effect))`), [['vantage'], ['luna', 'miracle']]);
      // Même parcours sur la map, cette fois avec Sol.
      await js(wc, `PlaytestState.settings.battleAnims = false; H.hp = 10; H.equippedSkills = ['skill_offensive', 'skill_sol']; D.hp = 30; D.equippedSkills = [];`);
      await selectAttack(); await key('Z'); await until(wc, '!PlaytestState.busy');
      const heal = await js(wc, 'lastCombat.strikes[0].heal'); assert.ok(heal > 0);
      assert.equal(await js(wc, 'H.hp'), 10 + heal);
      assert.equal(await js(wc, 'D.dead'), false);
      await shot(wc, 'map-after-sol');
      // L'animation de Sol doit aussi actualiser la jauge du lanceur.
      await js(wc, `PlaytestState.settings.battleAnims = true; H.hp = 10; D.hp = 30`);
      await selectAttack(); await key('Z');
      await until(wc, `document.querySelector('.b-panel.player .b-hpnum') && Number(document.querySelector('.b-panel.player .b-hpnum').textContent) === 10 + lastCombat.strikes[0].heal`, true);
      await shot(wc, 'animated-sol-healing');
      await until(wc, '!PlaytestState.busy', true);
      assert.equal(await js(wc, 'H.hp'), 10 + heal);
      // Régénération de chaque camp, une seule fois sur sa propre phase.
      await js(wc, `(() => {
        const G = PlaytestState, A = G.units.find(u => u.sourceId === ${JSON.stringify(ally.id)});
        H.equippedSkills = ['skill_regeneration']; H.hp = 20; H.done = false;
        A.team = 'ally'; A.control = 'player'; A.hp = 5;
        D.hp = 20; D.learnedSkills = ['skill_regeneration']; D.equippedSkills = ['skill_regeneration']; D.inventory = [];
        window.recoveryLog = []; const recover = Rules.phaseRecovery;
        Rules.phaseRecovery = (list, opts) => { const events = recover(list, opts); recoveryLog.push({ team: list[0] && list[0].team, units: list.map(u => ({ name: u.name, hp: u.hp, max: u.stats.hp, dead: u.dead, equipped: u.equippedSkills })), events: events.map(e => e.heal) }); return events; };
        window.allyBefore = A.hp; window.allyMax = A.stats.hp; G.cursor = { x: 0, y: 0 };
      })()`);
      await key('Z'); await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Fin du tour').action()`);
      await until(wc, `PlaytestState.phase === 'ally' && !PlaytestState.busy`);
      assert.equal(await js(wc, 'H.hp'), 20); assert.equal(await js(wc, 'D.hp'), 20);
      assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(ally.id)}).hp`),
        await js(wc, 'Math.min(allyMax, allyBefore + Math.max(1, Math.floor(allyMax / 10)))'));
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }`); await key('Z');
      await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Fin de la phase alliée').action()`);
      await until(wc, `PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      assert.equal(await js(wc, 'H.hp'), 24); assert.equal(await js(wc, 'D.hp'), 24, JSON.stringify(await js(wc, 'recoveryLog')));
      assert.deepEqual(errors, []); clearTimeout(watchdog);
      finish({ ok: true, forecast: true, animatedCombat: true, mapCombat: true, solHealing: true, animatedSolHealing: true, vantage: true, miracle: true, recoveryAllTeams: true, errors });
    } catch (e) { clearTimeout(watchdog); finish({ ok: false, error: e.stack, errors }); }
  });
};
