/*
 * Lobby : la base entre deux chapitres (façon Fire Emblem Heroes / Three Houses).
 *
 * Réglages (game.tfproj › meta.lobby) :
 *   enabled     le jeu démarre dans le lobby et y revient après chaque chapitre
 *   name        nom affiché (« Camp »)
 *   mapId       map explorable (faite dans l'éditeur, comme une map de chapitre)
 *   heroId      personnage que l'on déplace ('' : le premier personnage principal / seigneur)
 *   start       { x, y } case de départ du héros
 *   board       { x, y, label } table des chapitres
 *   shop        { x, y, name, stock: [id d'arme / d'objet] } boutique ; prix réglés sur l'arme / l'objet
 *   spots       [{ unitId, x, y, after }] personnages présents (after : après tel chapitre)
 *   startGold   or au début d'une nouvelle partie
 *   music       musique du lobby
 *
 * Chapitres (data/chapters.json) :
 *   kind        'story' (histoire : s'enchaînent par « Chapitre suivant ») ou 'event' (évènement, optionnel)
 *   unlock      { after, alive: [unitId], from, to } — after : chapitre à terminer avant ;
 *               alive : personnages vivants requis ; from / to : dates réelles « AAAA-MM-JJ » (incluses)
 *   gold        or gagné à la victoire ; goldEachClear : aussi quand on le rejoue
 *   replay      false : ne peut plus être joué une fois terminé
 *
 * Conversations de lobby (data/talks.json) :
 *   { id, name, unitId, script, after, alive: [unitId], points, once }
 *   unitId : personnage du lobby à qui parler ; points : affinité gagnée avec le héros ;
 *   once (défaut) : ne se joue qu'une fois.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Lobby = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const byId = (list, id) => (list || []).find(e => e && e.id === id);
  const LOBBY_SAVE = '@lobby'; // « chapitre » d'une sauvegarde faite dans le lobby

  function defaults(cfg) {
    const c = Object.assign({ enabled: false, name: 'Camp', mapId: '', heroId: '', startGold: 0, music: '' }, cfg || {});
    c.start = Object.assign({ x: 0, y: 0 }, c.start || {});
    c.board = Object.assign({ x: 0, y: 0, label: 'Table des chapitres' }, c.board || {});
    c.shop = Object.assign({ enabled: true, x: 0, y: 0, name: 'Marchand' }, c.shop || {});
    c.shop.stock = Array.isArray(c.shop.stock) ? c.shop.stock : [];
    c.spots = Array.isArray(c.spots) ? c.spots : [];
    return c;
  }

  /** Personnage que l'on déplace dans le lobby. */
  function heroOf(cfg, db) {
    const units = (db && db.units) || [];
    return byId(units, cfg && cfg.heroId) || units.find(u => u.protagonist) || units.find(u => u.isLord) || units[0] || null;
  }

  const today = (now) => {
    const d = now instanceof Date ? now : new Date(now || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const frDate = (s) => isDate(s) ? s.split('-').reverse().join('/') : s;

  /** État de progression : { cleared: [], dead: [], talks: [], gold }. */
  function progressOf(campaign) {
    return { cleared: (campaign && campaign.cleared) || [], dead: (campaign && campaign.dead) || [], talks: (campaign && campaign.talks) || [], gold: (campaign && campaign.gold) || 0 };
  }

  /**
   * Conditions communes (chapitres et conversations) : chapitre terminé, personnages vivants, dates.
   * Renvoie la liste des raisons de blocage (vide = débloqué), et dateOnly si seules les dates bloquent.
   */
  function conditions(unlock, db, progress, now) {
    const u = unlock || {};
    const reasons = [];
    let other = 0;
    if (u.after && !progress.cleared.includes(u.after)) {
      const c = byId(db.chapters, u.after);
      reasons.push(`Terminer « ${c ? c.name : u.after} »`); other++;
    }
    for (const id of u.alive || []) {
      if (progress.dead.includes(id)) { const c = byId(db.units, id); reasons.push(`${c ? c.name : id} doit être en vie`); other++; }
    }
    const d = today(now);
    if (isDate(u.from) && d < u.from) reasons.push(`Disponible à partir du ${frDate(u.from)}`);
    if (isDate(u.to) && d > u.to) reasons.push(`Terminé depuis le ${frDate(u.to)}`);
    return { reasons, dateOnly: reasons.length > 0 && other === 0 };
  }

  /**
   * Chapitres vus depuis le lobby :
   * [{ ch, kind, state: 'new' | 'cleared' | 'locked', playable, reasons, upcoming }]
   * Un chapitre d'histoire est ouvert s'il est le chapitre de départ ou le « suivant » d'un chapitre terminé.
   * Les chapitres verrouillés ne sont listés que s'ils sont seulement bloqués par une date à venir (évènements).
   */
  function chapters(db, meta, campaign, now) {
    const progress = progressOf(campaign);
    const list = (db && db.chapters) || [];
    const story = list.filter(c => (c.kind || 'story') !== 'event');
    const startId = (meta && meta.startChapter && byId(story, meta.startChapter)) ? meta.startChapter : (story[0] && story[0].id);
    const out = [];
    for (const ch of list) {
      const kind = ch.kind === 'event' ? 'event' : 'story';
      const cleared = progress.cleared.includes(ch.id);
      const cond = conditions(ch.unlock, db, progress, now);
      let reached = true;
      if (kind === 'story') reached = ch.id === startId || list.some(c => c.next === ch.id && progress.cleared.includes(c.id));
      const reasons = reached ? cond.reasons : ['Pas encore atteint'].concat(cond.reasons);
      const open = reached && !reasons.length;
      const state = cleared ? 'cleared' : open ? 'new' : 'locked';
      const playable = open && (!cleared || ch.replay !== false);
      const upcoming = !open && reached && cond.dateOnly && isDate((ch.unlock || {}).from) && today(now) < ch.unlock.from;
      if (state === 'locked' && !upcoming && !cleared) continue;
      out.push({ ch, kind, state, playable, reasons, upcoming, gold: goldFor(ch, cleared) });
    }
    return out;
  }

  /** Or gagné en terminant un chapitre (0 s'il a déjà été terminé, sauf goldEachClear). */
  function goldFor(ch, alreadyCleared) {
    const g = Math.max(0, Math.floor(Number(ch && ch.gold) || 0));
    return alreadyCleared && !(ch && ch.goldEachClear) ? 0 : g;
  }

  /** Victoire : chapitre noté terminé, or ajouté. Renvoie l'or gagné. */
  function completeChapter(campaign, ch) {
    campaign.cleared = campaign.cleared || [];
    const already = campaign.cleared.includes(ch.id);
    const gold = goldFor(ch, already);
    if (!already) campaign.cleared.push(ch.id);
    campaign.gold = (campaign.gold || 0) + gold;
    return gold;
  }

  /** Personnages présents dans le lobby : [{ spot, unit (fiche) }], sans le héros ni les morts. */
  function present(cfg, db, campaign) {
    const progress = progressOf(campaign);
    const hero = heroOf(cfg, db);
    const seen = new Set();
    const out = [];
    for (const spot of (cfg && cfg.spots) || []) {
      const unit = byId(db.units, spot.unitId);
      if (!unit || (hero && unit.id === hero.id) || seen.has(unit.id) || progress.dead.includes(unit.id)) continue;
      if (spot.after && !progress.cleared.includes(spot.after)) continue;
      seen.add(unit.id);
      out.push({ spot, unit });
    }
    return out;
  }

  /** Conversations disponibles avec un personnage présent : [{ talk, unit }]. */
  function talks(cfg, db, campaign, now) {
    const progress = progressOf(campaign);
    const here = new Map(present(cfg, db, campaign).map(p => [p.unit.id, p.unit]));
    const out = [];
    for (const t of (db && db.talks) || []) {
      const unit = here.get(t.unitId);
      if (!unit || !String(t.script || '').trim()) continue;
      if (t.once !== false && progress.talks.includes(t.id)) continue;
      if (conditions({ after: t.after, alive: t.alive }, db, progress, now).reasons.length) continue;
      out.push({ talk: t, unit });
    }
    return out;
  }

  /** Conversation jouée : notée comme vue. */
  function markTalk(campaign, talk) {
    campaign.talks = campaign.talks || [];
    if (!campaign.talks.includes(talk.id)) campaign.talks.push(talk.id);
  }

  // ---------- boutique ----------
  /** Fiche d'une arme ou d'un objet. */
  function entryOf(db, id) { return byId(db.weapons, id) || byId(db.items, id) || null; }
  function price(def) { return Math.max(0, Math.floor(Number(def && def.price) || 0)); }
  /** Prix de revente : la moitié, au prorata des utilisations restantes. 0 = invendable. */
  function sellPrice(def, uses) {
    const p = price(def);
    if (!p) return 0;
    const max = Number(def.uses) || 0;
    const left = max > 0 ? Math.max(0, Math.min(max, uses === undefined ? max : uses)) / max : 1;
    return Math.floor(p * left / 2);
  }
  /** Stock de la boutique : [{ id, def, price }] (seulement ce qui existe et a un prix). */
  function stock(cfg, db) {
    return ((cfg && cfg.shop && cfg.shop.stock) || []).map(id => ({ id, def: entryOf(db, id) })).filter(e => e.def && price(e.def) > 0).map(e => Object.assign(e, { price: price(e.def) }));
  }
  /** Achat : retire l'or et renvoie l'emplacement à ranger { id, uses }, ou une erreur. */
  function buy(campaign, db, id) {
    const def = entryOf(db, id);
    if (!def || !price(def)) return { ok: false, error: 'Article introuvable.' };
    if ((campaign.gold || 0) < price(def)) return { ok: false, error: 'Pas assez d\'or.' };
    campaign.gold -= price(def);
    return { ok: true, slot: { id, uses: def.uses || 0 } };
  }
  /** Vente d'un emplacement { id, uses } : ajoute l'or, renvoie le montant. */
  function sell(campaign, db, slot) {
    const def = entryOf(db, slot && slot.id);
    const amount = def ? sellPrice(def, slot.uses) : 0;
    if (!amount) return { ok: false, error: 'Cet objet ne se vend pas.' };
    campaign.gold = (campaign.gold || 0) + amount;
    return { ok: true, amount };
  }

  /** Erreurs de configuration (map, cases hors map, personnages). */
  function validate(cfg, db, maps) {
    const c = defaults(cfg);
    if (!c.enabled) return [];
    const errors = [];
    const map = (maps || []).find(m => m.id === c.mapId);
    if (!map) return ['Lobby : choisis une map.'];
    const inside = (p) => p && p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
    if (!heroOf(c, db)) errors.push('Lobby : aucun personnage à déplacer.');
    if (!inside(c.start)) errors.push('Lobby : la case de départ est hors de la map.');
    if (!inside(c.board)) errors.push('Lobby : la table des chapitres est hors de la map.');
    if (c.shop.enabled && !inside(c.shop)) errors.push('Lobby : la boutique est hors de la map.');
    const taken = new Set([c.start.x + ',' + c.start.y]);
    for (const s of c.spots) {
      const u = byId(db.units, s.unitId);
      if (!u) { errors.push('Lobby : personnage inconnu dans « Personnages présents ».'); continue; }
      if (!inside(s)) errors.push(`Lobby : ${u.name} est placé hors de la map.`);
      const k = s.x + ',' + s.y;
      if (taken.has(k)) errors.push(`Lobby : ${u.name} est sur une case déjà occupée (${k}).`);
      taken.add(k);
    }
    return errors;
  }

  return { LOBBY_SAVE, defaults, heroOf, today, conditions, chapters, goldFor, completeChapter, present, talks, markTalk, entryOf, price, sellPrice, stock, buy, sell, validate, progressOf };
});
