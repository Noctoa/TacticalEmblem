/* Défis facultatifs d'un acte : suivi, validation et récompenses de victoire. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules);
  if (common) module.exports = api; else root.SideObjectives = api;
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const TYPES = [['turn', 'Gagner avant la fin d’un tour'], ['protect', 'Garder un personnage en vie'],
    ['target', 'Vaincre un ennemi précis'], ['village', 'Visiter un village'], ['chest', 'Ouvrir un coffre'],
    ['flag', 'Remplir une condition de scénario']].map(([value, label]) => ({ value, label }));
  const list = ch => ch.secondaryObjectives || [];
  const key = (ch, ob) => JSON.stringify([ch.id, ob.id]);
  const claimed = (campaign, ch, ob) => (campaign.secondaryClaims || []).includes(key(ch, ob));
  const down = u => u.dead || u.hp <= 0;
  const validFlag = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);
  function validateMemory(value) {
    return value === undefined || (Array.isArray(value) && new Set(value).size === value.length && value.every(k => {
      try { const pair = JSON.parse(k); return Array.isArray(pair) && pair.length === 2 && pair.every(v => typeof v === 'string' && v) && JSON.stringify(pair) === k; } catch (_) { return false; }
    }));
  }
  function label(ob, ch, db) {
    if (ob.name) return ob.name;
    const unit = (db.units || []).find(u => u.id === ob.target), enemy = (ch.enemies || []).find(u => u.id === ob.target);
    const interaction = (ch[ob.type === 'chest' ? 'chests' : 'villages'] || []).find(v => v.id === ob.target);
    return { turn: `Gagner au plus tard au tour ${ob.turns}`, protect: `Protéger ${unit?.name || ob.target || 'un personnage'}`,
      target: `Vaincre ${enemy?.name || ob.target || 'la cible'}`, village: `Visiter ${interaction?.name || 'le village'}`,
      chest: `Ouvrir ${interaction?.name || 'le coffre'}`, flag: `Condition : ${ob.flag || 'à choisir'}` }[ob.type] || 'Objectif secondaire';
  }
  function description(ob, ch, db) {
    const condition = label({ ...ob, name: '' }, ch, db);
    return condition + (ob.type !== 'turn' && ob.type !== 'protect' && ob.turns > 0 ? ` avant la fin du tour ${ob.turns}` : '') +
      (ob.type === 'protect' ? ' jusqu’à la victoire (doit participer)' : ob.type === 'flag' && ob.value === false ? ' = faux' : '');
  }
  function rewardText(ob, db) {
    const reward = ob.reward || {}, item = reward.itemId && R.getEntry(db, reward.itemId);
    return [reward.gold > 0 ? `+${reward.gold} or` : '', item ? item.def.name + (reward.uses > 0 ? ` (${reward.uses} utilisation${reward.uses > 1 ? 's' : ''})` : '') : ''].filter(Boolean).join(' · ');
  }
  function validate(ch, db) {
    if (ch.secondaryObjectives === undefined) return [];
    if (!Array.isArray(ch.secondaryObjectives) || ch.secondaryObjectives.length > 20) return ['Objectifs secondaires : une liste de 20 défis maximum est attendue.'];
    const errors = [], ids = new Set(), known = id => (db.units || []).some(u => u.id === id);
    for (const ob of list(ch)) {
      if (!ob || typeof ob !== 'object' || Array.isArray(ob)) { errors.push('Objectif secondaire illisible.'); continue; }
      const bad = text => errors.push(`${ob.name || ob.id || 'Objectif secondaire'} : ${text}`);
      if (typeof ob.id !== 'string' || !ob.id || ids.has(ob.id)) bad('identifiant vide ou en double.'); ids.add(ob.id);
      if (ob.name !== undefined && typeof ob.name !== 'string') bad('nom invalide.');
      if (!TYPES.some(t => t.value === ob.type)) bad('type inconnu.');
      if (ob.turns !== undefined && (!Number.isInteger(ob.turns) || ob.turns < 0 || ob.turns > 999)) bad('délai invalide (0 à 999 tours).');
      if (ob.type === 'turn' && !(ob.turns > 0)) bad('choisis un tour limite positif.');
      if (ob.type === 'protect' && (!known(ob.target) || ![...(ch.players || []), ...(ch.allies || [])].some(p => p.unitId === ob.target))) bad('personnage à protéger absent des placements.');
      if (ob.type === 'target' && !(ch.enemies || []).some(e => e.id === ob.target)) bad('ennemi cible introuvable.');
      if (['village', 'chest'].includes(ob.type) && !(ch[ob.type === 'village' ? 'villages' : 'chests'] || []).some(v => v.id === ob.target)) bad('village ou coffre introuvable.');
      if (ob.type === 'flag' && (!validFlag(ob.flag) || typeof ob.value !== 'boolean')) bad('information de scénario ou valeur invalide.');
      if (ob.repeatOnReplay !== undefined && typeof ob.repeatOnReplay !== 'boolean') bad('répétition invalide.');
      const reward = ob.reward;
      if (reward === undefined) continue;
      if (!reward || typeof reward !== 'object' || Array.isArray(reward)) { bad('récompense invalide.'); continue; }
      if (reward.gold !== undefined && (!Number.isSafeInteger(reward.gold) || reward.gold < 0 || reward.gold > 999999)) bad('or invalide (0 à 999999).');
      const item = reward.itemId && R.getEntry(db, reward.itemId);
      if (reward.itemId !== undefined && (typeof reward.itemId !== 'string' || (reward.itemId && !item))) bad('arme ou objet introuvable.');
      if (reward.uses !== undefined && (!Number.isInteger(reward.uses) || reward.uses < 0 || (item && reward.uses > item.def.uses))) bad('utilisations de récompense invalides.');
      if (reward.unitId !== undefined && (typeof reward.unitId !== 'string' || (reward.unitId && !known(reward.unitId)))) bad('destinataire introuvable.');
    }
    return [...new Set(errors)];
  }
  /** Les réussites ponctuelles et les échecs sont mémorisés pour cette tentative uniquement. */
  function advance(ch, state, previous = {}, final = false) {
    const next = Object.create(null), turn = state.secondaryTurn || state.turn || 1;
    for (const ob of list(ch)) {
      const old = previous[ob.id];
      if (old && ['success', 'failed'].includes(old.status)) { next[ob.id] = { ...old }; continue; }
      let status = 'pending';
      const expired = ob.turns > 0 && turn > ob.turns;
      if (ob.type === 'protect') {
        const unit = (state.units || []).find(u => u.team !== 'enemy' && u.sourceId === ob.target);
        status = !unit || down(unit) ? 'failed' : final ? 'success' : 'pending';
      } else if (ob.type === 'turn') status = expired ? 'failed' : final ? 'success' : 'pending';
      else {
        let done = false;
        if (ob.type === 'target') done = (state.units || []).some(u => u.team === 'enemy' && u.sourceId === ob.target && down(u));
        if (ob.type === 'village') done = !!state.visitedVillages?.has(ob.target) || (!ob.repeatOnReplay && (state.campaign.villageVisits || []).some(v => v.chapterId === ch.id && v.villageId === ob.target));
        if (ob.type === 'chest') done = !!state.openedChests?.has(ob.target) || (!ob.repeatOnReplay && (state.campaign.chestVisits || []).some(v => v.chapterId === ch.id && v.chestId === ob.target));
        if (ob.type === 'flag') done = (state.campaign.scenario?.flags?.[ob.flag] === true) === ob.value;
        status = expired ? 'failed' : done ? 'success' : final ? 'failed' : 'pending';
      }
      next[ob.id] = { status, turn };
    }
    return next;
  }
  /** Chaque défi est payé une seule fois ; un objet bloqué garde aussi son or en attente. */
  function grant(ch, db, state, progress) {
    const awarded = [];
    if (!state.secondaryPaid) state.secondaryPaid = new Set();
    for (const ob of list(ch)) {
      if (progress[ob.id]?.status !== 'success' || state.secondaryPaid?.has(ob.id) || (!ob.repeatOnReplay && claimed(state.campaign, ch, ob))) continue;
      const reward = ob.reward || {}, item = reward.itemId && R.getEntry(db, reward.itemId);
      const recipient = reward.unitId && (state.units || []).find(u => u.team === 'player' && u.sourceId === reward.unitId && !down(u));
      let inventory = null;
      if (item) {
        if (recipient && recipient.inventory.length < 5) inventory = recipient.inventory;
        else if (state.convoy.length < state.convoyCap) inventory = state.convoy;
        else return { ok: false, awarded, error: 'Récompense secondaire en attente : libère une place dans le convoi ou l’inventaire du destinataire.' };
      }
      if (item) inventory.push({ id: reward.itemId, uses: reward.uses || item.def.uses || 0 });
      state.campaign.gold = (state.campaign.gold || 0) + (reward.gold || 0);
      state.secondaryPaid.add(ob.id); awarded.push(ob.id);
      if (!claimed(state.campaign, ch, ob)) (state.campaign.secondaryClaims || (state.campaign.secondaryClaims = [])).push(key(ch, ob));
    }
    return { ok: true, awarded };
  }
  function references(db, kind, id) {
    return (db.chapters || []).flatMap(ch => list(ch).filter(ob => kind === 'units' ? (ob.type === 'protect' && ob.target === id) || ob.reward?.unitId === id : ob.reward?.itemId === id).map(ob => `${ch.name} — ${label(ob, ch, db)}`));
  }
  return { TYPES, list, key, claimed, validateMemory, label, description, rewardText, validate, advance, grant, references };
});
