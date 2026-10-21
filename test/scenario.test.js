'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const S = require('../src/shared/scenario'), D = require('../src/shared/defaults'), C = require('../src/shared/campaign'), R = require('../src/shared/rules');
const L = require('../src/shared/locks'), V = require('../src/shared/villages'), M = require('../src/shared/mission'), Summon = require('../src/shared/summon'), io = require('../src/main/project-io');
function fixture() {
  const p = D.sampleProject('Événements'), db = p.db, ch = db.chapters[0], map = p.maps.find(m => m.id === ch.mapId); ch.events = [];
  ch.doors = [{ id: 'door', name: 'Sortie', x: 1, y: 1, openTerrainId: 'plain' }];
  ch.chests = [{ id: 'chest', name: 'Trésor', x: 2, y: 2 }];
  ch.enemies.push({ id: 'ambush', name: 'Embuscade', classId: 'brigand', level: 1, eventOnly: true, x: 3, y: 3 });
  const unit = R.makeUnitFromCharacter(db.units[0], db, { x: 0, y: 0 }), pending = R.makeEnemyFromPlacement(ch.enemies.at(-1), db);
  const state = { campaign: C.create('classic', 50), units: [unit], pending: [pending], fired: new Set(), convoy: [], convoyCap: 1, openedDoors: new Set(['door']), chapter: JSON.parse(JSON.stringify(ch)), db, turn: 4, seized: [] };
  state.chapter.requiredUnits = [unit.sourceId];
  const notices = [], context = { self: {}, Scenario: S, R, Mission: M, Summon, Villages: V, UI: { toast: text => notices.push(text), modal: async () => false } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/scenario-runtime.js'), 'utf8'), context);
  let spot = { x: 3, y: 3 };
  const runtime = context.self.ScenarioRuntime.create({ G: state, R, playDialogue: async text => notices.push(text), freeSpotNear: () => spot, float: () => {} });
  const runner = () => S.createRunner(state.chapter, { state: () => state, action: runtime.action, blocked: (e, error) => notices.push(error) });
  return { p, db, ch, map, state, unit, runtime, runner, notices, setSpot: value => { spot = value; } };
}
const event = (id, type, actions, rest = {}) => ({ id, trigger: { type }, actions, ...rest });
test('anciens événements : dialogues dans l’ordre, tour exact, zone, vaincu, victoire et fréquence', async () => {
  const f = fixture(), { state, notices } = f;
  state.chapter.events = [event('start', 'start', [], { script: 'Ancien dialogue' }), event('turn', 'turn', [{ type: 'gold', amount: 10 }], { trigger: { type: 'turn', turn: 3 }, once: false }),
    event('zone', 'area', [{ type: 'gold', amount: 20 }], { trigger: { type: 'area', x: 1, y: 1, w: 2, h: 1 } }), event('death', 'death', [{ type: 'gold', amount: 30 }], { trigger: { type: 'death', target: 'unit:' + f.unit.sourceId } }), event('win', 'victory', [], { script: 'Victoire' })];
  const runner = f.runner(); await runner.run('start'); await runner.run('start'); assert.deepEqual(notices, ['Ancien dialogue']);
  await runner.run('turn', { turn: 2 }); assert.equal(state.campaign.gold, 50); await runner.run('turn', { turn: 3 }); await runner.run('turn', { turn: 3 }); assert.equal(state.campaign.gold, 70);
  await runner.run('area', { unit: { ...f.unit, x: 3, y: 1 } }); assert.equal(state.campaign.gold, 70);
  await runner.run('area', { unit: { ...f.unit, x: 2, y: 1 } }); await runner.run('death', { unit: f.unit }); await runner.run('victory'); assert.equal(state.campaign.gold, 120); assert.equal(notices.at(-1), 'Victoire');
});
test('coffre : embuscade, fermeture de porte, récompenses et nouvel objectif à partir du tour courant', async () => {
  const f = fixture(), { state } = f;
  state.chapter.events = [event('trap', 'chest', [{ type: 'gold', amount: 80 }, { type: 'orbs', amount: 3 }, { type: 'reinforcement', target: 'ambush' }, { type: 'door', target: 'door', open: false }, { type: 'objective', objective: { type: 'survive', turns: 5 } }], { trigger: { type: 'chest', target: 'chest' } })];
  const runner = f.runner(); await runner.run('chest', { target: 'other' }); assert.equal(state.campaign.gold, 50);
  await runner.run('chest', { target: 'chest', unit: f.unit }); assert.equal(state.campaign.gold, 130); assert.equal(state.campaign.orbs, 3); assert.equal(state.pending.length, 0); assert.equal(state.units.length, 2); assert.equal(state.units[1].done, true); assert.equal(state.openedDoors.size, 0);
  assert.equal(state.chapter.objective.turns, 8); assert.equal(f.ch.objective.type, 'boss');
  state.turn = 8; assert.equal(M.evaluate(state.chapter, f.db, state).outcome, null); state.turn = 9; assert.equal(M.evaluate(state.chapter, f.db, state).outcome, 'victory');
  await runner.run('chest', { target: 'chest' }); assert.equal(state.campaign.gold, 130);
});
test('choix faux mémorisé, présence vivante requise et conditions résolues même avant la source dans la liste', async () => {
  const f = fixture(), { state } = f;
  state.chapter.events = [event('branch', 'condition', [{ type: 'gold', amount: 7 }], { conditions: { flags: [{ key: 'accepted', value: false }, { key: 'asked', value: true }], present: [f.unit.sourceId] } }),
    event('question', 'start', [{ type: 'choice', key: 'accepted', text: 'Accepter ?', yes: 'Oui', no: 'Non' }, { type: 'flag', key: 'asked', value: true }])];
  const runner = f.runner(); f.unit.dead = true; await runner.run('start'); assert.equal(S.flag(state.campaign, 'accepted'), false); assert.equal(state.campaign.scenario.flags.accepted, false); assert.equal(state.campaign.gold, 50);
  f.unit.dead = false; await runner.run('condition'); assert.equal(state.campaign.gold, 57); await runner.run('condition'); assert.equal(state.campaign.gold, 57);
  assert.equal(S.flag(C.create('classic'), 'constructor'), false);
});
test('événement conditionnel répétable : aucune récompense répétée tant que la condition reste vraie', async () => {
  const f = fixture(), { state } = f;
  state.chapter.events = [event('edge', 'condition', [{ type: 'gold', amount: 1 }], { once: false, conditions: { flags: [{ key: 'gate', value: true }] } })];
  const runner = f.runner(); S.setFlag(state.campaign, 'gate', true); await runner.run('condition'); await runner.run('condition'); assert.equal(state.campaign.gold, 51);
  S.setFlag(state.campaign, 'gate', false); await runner.run('condition'); S.setFlag(state.campaign, 'gate', true); await runner.run('condition'); assert.equal(state.campaign.gold, 52);
});
test('récompense bloquée : reprise à l’action en attente sans redonner l’or ou rejouer le dialogue', async () => {
  const f = fixture(), { state } = f;
  state.convoy.push({ id: 'i_vulnerary', uses: 1 });
  state.chapter.events = [event('reward', 'start', [{ type: 'gold', amount: 20 }, { type: 'item', itemId: 'i_chest_key', uses: 2 }, { type: 'flag', key: 'done', value: true }], { script: 'Une récompense !' })];
  const runner = f.runner(); await runner.run('start'); assert.equal(state.campaign.gold, 70); assert.ok(!state.fired.has('reward')); await runner.run('condition'); assert.equal(state.campaign.gold, 70);
  state.convoy.pop(); await runner.run('condition'); assert.equal(state.convoy[0].uses, 2); assert.equal(S.flag(state.campaign, 'done'), true); assert.equal(f.notices.filter(t => t === 'Une récompense !').length, 1);
});
test('destinataire absent ou plein : convoi ; place dans l’inventaire : usages conservés', async () => {
  const f = fixture(); f.unit.inventory = []; await f.runtime.action({ type: 'item', itemId: 'w_iron_sword', uses: 4, unitId: f.unit.sourceId }, {}); assert.equal(f.unit.inventory[0].uses, 4);
  await f.runtime.action({ type: 'item', itemId: 'i_chest_key', uses: 1, unitId: 'absent' }, {}); assert.equal(f.state.convoy[0].id, 'i_chest_key');
});
test('porte occupée et renfort sans place : attente, puis reprise ; pas de duplication du renfort', async () => {
  const f = fixture(), { state } = f; f.unit.x = f.unit.y = 1; f.setSpot(null);
  state.chapter.events = [event('close', 'start', [{ type: 'door', target: 'door', open: false }, { type: 'reinforcement', target: 'ambush' }])];
  const runner = f.runner(); await runner.run('start'); assert.ok(state.openedDoors.has('door')); f.unit.x = 0; await runner.run('condition'); assert.equal(state.openedDoors.size, 0); assert.equal(state.pending.length, 1);
  f.setSpot({ x: 2, y: 3 }); await runner.run('condition'); assert.equal(state.pending.length, 0); assert.equal(state.units[1].x, 2);
  await f.runtime.action({ type: 'reinforcement', target: 'ambush' }, {}); assert.equal(state.units.length, 2);
});
test('ouvrir une porte par événement déclenche ses événements associés et les boucles sont bornées', async () => {
  const f = fixture(), { state } = f; state.openedDoors.clear();
  state.chapter.events = [event('open', 'start', [{ type: 'door', target: 'door', open: true }]), event('opened', 'door', [{ type: 'gold', amount: 2 }, { type: 'door', target: 'door', open: false }, { type: 'door', target: 'door', open: true }], { once: false, trigger: { type: 'door', target: 'door' } })];
  await f.runner().run('start'); assert.equal(state.campaign.gold, 52); assert.ok(state.openedDoors.has('door'));
});
test('mémoire de campagne, une fois par campagne, sauvegarde et recommencement', async () => {
  const f = fixture(), { state } = f; C.commit(state.campaign, state.units); const checkpoint = C.checkpoint(f.ch.id, state.campaign, [], {});
  state.chapter.events = [event('gift', 'start', [{ type: 'gold', amount: 10 }, { type: 'flag', key: 'seen', value: true }], { campaignOnce: true })];
  await f.runner().run('start'); state.fired.clear(); await f.runner().run('start'); assert.equal(state.campaign.gold, 60);
  const saved = C.checkpoint(f.ch.id, state.campaign, [], {}); assert.equal(C.restore(saved, {}).campaign.scenario.flags.seen, true);
  assert.equal(C.restore(checkpoint, {}).campaign.scenario, undefined);
  for (const bad of [null, {}, { flags: { invalid: 3 }, events: [] }, { flags: {}, events: ['invalid'] }, { flags: {}, events: ['["a","b"]', '["a","b"]'] }]) { saved.campaign.scenario = bad; assert.throws(() => C.validate(saved), /Mémoire des événements/); }
});
test('validation et références : anciens exemples valides, erreurs explicites, sauvegarde refusée avant écriture', t => {
  const f = fixture(); assert.deepEqual(S.validate(f.ch, f.db, f.map), []);
  const ev = event('test', 'chest', [{ type: 'item', itemId: 'i_chest_key', uses: 1, unitId: f.unit.sourceId }], { trigger: { type: 'chest', target: 'chest' }, conditions: { present: [f.unit.sourceId] } }); f.ch.events = [ev];
  assert.deepEqual(S.validate(f.ch, f.db, f.map), []); assert.equal(S.references(f.db, 'items', 'i_chest_key').length, 1); assert.equal(S.references(f.db, 'units', f.unit.sourceId).length, 1);
  const bad = change => { const ch = JSON.parse(JSON.stringify(f.ch)); change(ch); assert.ok(S.validate(ch, f.db, f.map).length); };
  bad(ch => ch.events = {}); bad(ch => ch.events.push(ch.events[0])); bad(ch => ch.events[0].trigger.target = 'unknown');
  bad(ch => ch.events[0].actions[0].itemId = 'unknown'); bad(ch => ch.events[0].conditions.present = ['missing']); bad(ch => ch.events[0].conditions.flags = [{ key: '__proto__', value: true }]);
  for (const action of [{ type: 'gold', amount: -1 }, { type: 'orbs', amount: 1.5 }, { type: 'reinforcement', target: 'missing' }, { type: 'door', target: 'missing', open: false }, { type: 'objective', objective: { type: 'survive', turns: 0 } }, { type: 'flag', key: 'bad key', value: true }, { type: 'choice', key: 'x', text: '', yes: '', no: '' }, { type: 'unknown' }]) bad(ch => ch.events[0].actions = [action]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-scenario-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Le coffre doit être sur une case libre d'autre interaction pour la validation globale.
  f.ch.villages = []; io.saveProject(dir, f.p); const before = fs.readFileSync(path.join(dir, 'data/chapters.json'), 'utf8'); ev.actions[0].itemId = 'missing'; assert.throws(() => io.saveProject(dir, f.p), /récompense introuvable/); assert.equal(fs.readFileSync(path.join(dir, 'data/chapters.json'), 'utf8'), before);
});
