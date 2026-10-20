/* Effectif recruté et préparatifs au camp, indépendants des personnages dessinés sur sa map. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./lobby.js') : root.Lobby);
  if (common) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this, function (Rules, Lobby) {
  'use strict';
  const byId = (list, id) => (list || []).find(entry => entry.id === id);
  function initialIds(db, meta) {
    const cfg = meta.lobby || {}, hero = Lobby.heroOf(cfg, db);
    const start = byId(db.chapters, meta.startChapter) || (db.chapters || [])[0];
    const ids = Array.isArray(cfg.initialRoster) ? cfg.initialRoster : ((start && start.players) || []).map(p => p.unitId);
    return [...new Set([...ids, ...(hero ? [hero.id] : [])])].filter(id => byId(db.units, id));
  }
  function recruit(campaign, ids) {
    campaign.recruited = [...new Set([...(campaign.recruited || []), ...ids])];
  }
  function sync(campaign, db, meta, chapterId) {
    if (!Array.isArray(campaign.recruited)) {
      const past = (db.chapters || []).filter(ch => ch.id === chapterId || (campaign.cleared || []).includes(ch.id));
      // Une ancienne présence au camp ne suffit pas à prouver qu'un PNJ avait été recruté.
      recruit(campaign, initialIds(db, meta).concat(past.flatMap(ch => (ch.players || []).map(p => p.unitId))));
    }
    const progress = Lobby.progressOf(campaign);
    recruit(campaign, (db.units || []).filter(u => u.recruitAfter && Lobby.isDone(db, progress, u.recruitAfter)).map(u => u.id));
    return campaign.recruited.filter(id => !(campaign.dead || []).includes(id) && byId(db.units, id));
  }
  function validate(db, meta) {
    const errors = [], cfg = meta.lobby || {};
    if (cfg.initialRoster !== undefined && (!Array.isArray(cfg.initialRoster) || cfg.initialRoster.some(id => !byId(db.units, id)) || new Set(cfg.initialRoster).size !== cfg.initialRoster.length)) errors.push('Effectif de départ : personnages introuvables ou en double.');
    for (const unit of db.units || []) {
      if (unit.recruitAfter !== undefined && (typeof unit.recruitAfter !== 'string' || (unit.recruitAfter && !byId(db.chapters, unit.recruitAfter) && !byId(db.arcs, unit.recruitAfter)))) errors.push(`${unit.name || unit.id} : chapitre ou acte de recrutement introuvable.`);
    }
    return errors;
  }
  function setSkill(unit, id, slot, catalogue) {
    const current = unit.equippedSkills || [];
    if (!Number.isInteger(slot) || slot < 0 || slot > current.length || slot >= 5) return { ok: false, error: 'Emplacement de compétence invalide.' };
    if (id && (!byId(catalogue, id) || id === unit.personalSkill || !(unit.learnedSkills || []).includes(id))) return { ok: false, error: 'Choisis une compétence apprise, différente de la personnelle.' };
    if (id && current.some((other, index) => index !== slot && other === id)) return { ok: false, error: 'Cette compétence est déjà équipée.' };
    const next = current.slice();
    if (id) next[slot] = id; else next.splice(slot, 1);
    unit.equippedSkills = next;
    return { ok: true };
  }
  function container(state, id) {
    if (id === '@convoy') return { list: state.convoy, capacity: state.capacity };
    const unit = state.members.find(u => u.sourceId === id);
    return unit ? { list: unit.inventory, capacity: 5 } : null;
  }
  function transfer(state, sourceId, destinationId, index, swapIndex) {
    const from = container(state, sourceId), to = container(state, destinationId);
    if (!from || !to || from.list === to.list || !Number.isInteger(index) || index < 0 || index >= from.list.length) return { ok: false, error: 'Transfert impossible.' };
    if (swapIndex !== undefined) {
      if (!Number.isInteger(swapIndex) || swapIndex < 0 || swapIndex >= to.list.length) return { ok: false, error: 'Objet à échanger invalide.' };
      [from.list[index], to.list[swapIndex]] = [to.list[swapIndex], from.list[index]];
    } else {
      if (to.list.length >= to.capacity) return { ok: false, error: 'Plus de place dans la destination. Choisis un échange.' };
      to.list.push(from.list.splice(index, 1)[0]);
    }
    return { ok: true };
  }
  function reorder(unit, index, destination) {
    if (![index, destination].every(n => Number.isInteger(n) && n >= 0 && n < unit.inventory.length)) return { ok: false, error: 'Position d’objet invalide.' };
    const [slot] = unit.inventory.splice(index, 1); unit.inventory.splice(destination, 0, slot);
    return { ok: true };
  }
  return { initialIds, recruit, sync, validate, setSkill, transfer, reorder, container };
});
