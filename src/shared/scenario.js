/* Événements : conditions, validation et séquencement sans dépendance au rendu. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./mission.js') : root.Mission);
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Scenario = api;
})(typeof self !== 'undefined' ? self : this, function (Mission) {
  'use strict';
  const TRIGGERS = [
    ['start', 'Début de l’acte'], ['turn', 'Début du tour (phase joueur)'], ['death', 'Unité vaincue'],
    ['area', 'Un joueur ou allié termine son action dans une zone'], ['chest', 'Coffre ouvert'], ['door', 'Porte ouverte'],
    ['village', 'Village visité'], ['condition', 'Dès que les conditions sont remplies'], ['victory', 'Victoire']
  ].map(([value, label]) => ({ value, label }));
  const ACTIONS = [['dialogue', 'Afficher un dialogue'], ['gold', 'Donner de l’or'], ['orbs', 'Donner des orbes'],
    ['item', 'Donner une arme ou un objet'], ['reinforcement', 'Faire apparaître un renfort'], ['door', 'Ouvrir / fermer une porte'],
    ['objective', 'Changer l’objectif'], ['flag', 'Mémoriser une information'], ['choice', 'Proposer un choix']].map(([value, label]) => ({ value, label }));
  const validFlag = key => typeof key === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key);
  const list = ch => ch.events || [];
  const keyOf = (ch, ev) => JSON.stringify([ch.id, ev.id]);
  const flag = (campaign, key) => ((campaign.scenario || {}).flags || {})[key] === true;
  function memory(campaign) { return campaign.scenario || (campaign.scenario = { flags: {}, events: [] }); }
  function setFlag(campaign, key, value) { memory(campaign).flags[key] = value; }
  function validateMemory(value) {
    return value === undefined || (!!value && typeof value === 'object' && !Array.isArray(value) &&
      !!value.flags && typeof value.flags === 'object' && !Array.isArray(value.flags) && Object.entries(value.flags).every(([k, v]) => validFlag(k) && typeof v === 'boolean') &&
      Array.isArray(value.events) && value.events.every(k => {
        try { const pair = JSON.parse(k); return Array.isArray(pair) && pair.length === 2 && pair.every(v => typeof v === 'string' && v) && JSON.stringify(pair) === k; } catch (_) { return false; }
      }) && new Set(value.events).size === value.events.length);
  }
  function conditions(ev, state) {
    const c = ev.conditions || {};
    return (c.flags || []).every(f => flag(state.campaign, f.key) === f.value) &&
      (c.present || []).every(id => state.units.some(u => u.team !== 'enemy' && u.sourceId === id && !u.dead && u.hp > 0));
  }
  function matches(ev, type, data) {
    const tr = ev.trigger || {};
    if (tr.type !== type) return false;
    if (type === 'turn') return tr.turn === data.turn;
    if (type === 'death') return !!data.unit && (tr.target === data.unit.sourceId || (data.unit.team !== 'enemy' && tr.target === 'unit:' + data.unit.sourceId));
    if (type === 'area') { const u = data.unit; return !!u && u.team !== 'enemy' && u.x >= tr.x && u.y >= tr.y && u.x < tr.x + (tr.w || 1) && u.y < tr.y + (tr.h || 1); }
    if (['chest', 'door', 'village'].includes(type)) return tr.target === data.target;
    return true;
  }
  function validate(ch, db, map) {
    const errors = [], seen = new Set(), point = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
    const known = id => (db.units || []).some(u => u.id === id), interaction = (type, id) => (ch[{ chest: 'chests', door: 'doors', village: 'villages' }[type]] || []).some(o => o.id === id);
    if (ch.events !== undefined && !Array.isArray(ch.events)) return ['Événements : une liste est attendue.'];
    for (const e of list(ch)) {
      if (!e || typeof e !== 'object') { errors.push('Événement invalide.'); continue; }
      const name = e.name || e.id || 'Événement', bad = text => errors.push(`${name} : ${text}`), tr = e.trigger || {};
      if (typeof e.id !== 'string' || !e.id || seen.has(e.id)) bad('identifiant vide ou en double.'); seen.add(e.id);
      if (!TRIGGERS.some(t => t.value === tr.type)) bad('déclencheur inconnu.');
      if (e.script !== undefined && typeof e.script !== 'string') bad('dialogue invalide.');
      for (const k of ['once', 'campaignOnce']) if (e[k] !== undefined && typeof e[k] !== 'boolean') bad('fréquence invalide.');
      if (tr.type === 'turn' && (!Number.isInteger(tr.turn) || tr.turn < 1 || tr.turn > 999)) bad('tour invalide.');
      if (tr.type === 'death' && !(ch.enemies || []).some(u => u.id === tr.target) && !(typeof tr.target === 'string' && tr.target.startsWith('unit:') && known(tr.target.slice(5)))) bad('unité vaincue introuvable.');
      if (tr.type === 'area' && (!point(tr.x, tr.y) || !Number.isInteger(tr.w || 1) || !Number.isInteger(tr.h || 1) || (tr.w || 1) < 1 || (tr.h || 1) < 1 || !point(tr.x + (tr.w || 1) - 1, tr.y + (tr.h || 1) - 1))) bad('zone hors de la map.');
      if (['chest', 'door', 'village'].includes(tr.type) && !interaction(tr.type, tr.target)) bad('interaction de déclenchement introuvable.');
      const c = e.conditions;
      if (c !== undefined && (!c || typeof c !== 'object' || Array.isArray(c))) bad('conditions invalides.');
      else if (c) {
        if (c.flags !== undefined && (!Array.isArray(c.flags) || c.flags.some(f => !f || !validFlag(f.key) || typeof f.value !== 'boolean'))) bad('information de condition invalide.');
        if (c.present !== undefined && (!Array.isArray(c.present) || c.present.some(id => !known(id)))) bad('personnage de condition introuvable.');
      }
      if (e.actions !== undefined && (!Array.isArray(e.actions) || e.actions.length > 200)) { bad('liste d’actions invalide (200 maximum).'); continue; }
      for (const a of e.actions || []) {
        if (!a || !ACTIONS.some(t => t.value === a.type)) { bad('action inconnue.'); continue; }
        if (a.type === 'dialogue' && typeof a.text !== 'string') bad('texte de dialogue invalide.');
        if (['gold', 'orbs'].includes(a.type) && (!Number.isInteger(a.amount) || a.amount < 1 || a.amount > 999999)) bad('montant de récompense invalide.');
        if (a.type === 'item') {
          if (![...(db.items || []), ...(db.weapons || [])].some(i => i.id === a.itemId)) bad('récompense introuvable.');
          if (!Number.isInteger(a.uses) || a.uses < 0 || a.uses > 999) bad('utilisations de récompense invalides.');
          if (a.unitId && !known(a.unitId)) bad('destinataire introuvable.');
        }
        if (a.type === 'reinforcement' && !(ch.enemies || []).some(u => u.id === a.target && (u.eventOnly || u.appearTurn > 0) && (db.classes || []).some(c => c.id === u.classId))) bad('choisis un renfort placé sur la map (arrivée par événement ou par tour).');
        if (a.type === 'door' && (!interaction('door', a.target) || typeof a.open !== 'boolean')) bad('porte ou état invalide.');
        if (a.type === 'objective') {
          if (!a.objective || typeof a.objective !== 'object') bad('objectif manquant.');
          else for (const error of Mission.validate({ ...ch, objective: a.objective, extraObjectives: [] }, db, map)) bad(error);
        }
        if (['flag', 'choice'].includes(a.type) && !validFlag(a.key)) bad('nom d’information invalide : lettre, puis lettres, chiffres ou _ (64 caractères maximum).');
        if (a.type === 'flag' && typeof a.value !== 'boolean') bad('valeur d’information invalide.');
        if (a.type === 'choice' && ['text', 'yes', 'no'].some(k => typeof a[k] !== 'string' || !a[k].trim())) bad('question et deux réponses obligatoires.');
      }
    }
    for (const u of ch.enemies || []) if (u.eventOnly !== undefined && typeof u.eventOnly !== 'boolean') errors.push(`${u.name || u.id} : arrivée par événement invalide.`);
    return [...new Set(errors)];
  }
  function references(db, kind, id) {
    return (db.chapters || []).flatMap(ch => list(ch).filter(e => kind === 'units' ? (e.conditions || {}).present?.includes(id) || e.trigger?.target === 'unit:' + id || (e.actions || []).some(a => a.unitId === id) : (e.actions || []).some(a => a.type === 'item' && a.itemId === id)).map(e => `${ch.name} — ${e.name || e.id}`));
  }
  function createRunner(ch, api) {
    const progress = new Map(), warned = new Map(), conditionEdges = new Set(); let running = false;
    async function run(type, data = {}) {
      if (running) throw new Error('Événement réentrant.');
      running = true;
      const handled = new Set(), signals = [{ type, data }, { type: 'condition', data: {} }];
      try {
        // Les actions bloquées reprennent où elles se sont arrêtées à la prochaine étape du jeu.
        for (const ev of list(ch)) if (progress.has(ev.id)) await execute(ev);
        while (signals.length) {
          const signal = signals.shift();
          for (const ev of list(ch)) {
            const state = api.state();
            if (ev.trigger.type === 'condition' && !conditions(ev, state)) conditionEdges.delete(ev.id);
            if (handled.has(ev.id) || progress.has(ev.id) || ((ev.once !== false || ev.campaignOnce) && state.fired.has(ev.id)) || (ev.campaignOnce && ((state.campaign.scenario || {}).events || []).includes(keyOf(ch, ev)))) continue;
            if (ev.trigger.type === 'condition' && conditionEdges.has(ev.id)) continue;
            if (!matches(ev, signal.type, signal.data) || !conditions(ev, state)) continue;
            if (ev.trigger.type === 'condition') conditionEdges.add(ev.id);
            progress.set(ev.id, { index: 0, data: signal.data }); await execute(ev);
          }
        }
      } finally { running = false; }
      async function execute(ev) {
        handled.add(ev.id);
        const step = progress.get(ev.id), actions = [...(ev.script ? [{ type: 'dialogue', text: ev.script }] : []), ...(ev.actions || [])];
        for (; step.index < actions.length; step.index++) {
          const result = await api.action(actions[step.index], step.data) || { ok: true };
          if (!result.ok) {
            if (warned.get(ev.id) !== result.error) { warned.set(ev.id, result.error); api.blocked?.(ev, result.error); }
            return;
          }
          for (const signal of result.signals || []) signals.push(signal);
        }
        progress.delete(ev.id); warned.delete(ev.id); api.state().fired.add(ev.id);
        if (ev.campaignOnce) { const saved = memory(api.state().campaign); if (!saved.events.includes(keyOf(ch, ev))) saved.events.push(keyOf(ch, ev)); }
        signals.push({ type: 'condition', data: {} });
      }
    }
    return { run, pending: () => progress.size > 0 };
  }
  return { TRIGGERS, ACTIONS, validFlag, flag, setFlag, validateMemory, conditions, matches, validate, references, createRunner };
});
