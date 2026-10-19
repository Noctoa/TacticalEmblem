/*
 * Lobby : la base entre deux chapitres (façon Fire Emblem Heroes / Three Houses).
 *
 * Réglages (game.tfproj › meta.lobby) :
 *   enabled     le jeu démarre dans le lobby et y revient après chaque chapitre
 *   name        nom affiché (« Camp »)
 *   mapId       map explorable (faite dans l'éditeur, comme une map de chapitre)
 *   heroId      personnage que l'on déplace ('' : le premier personnage principal / seigneur)
 *   start       { x, y } case de départ du héros
 *   board       { x, y, label } tableau des quêtes (chapitres et évènements, avec leurs actes)
 *   shop        { x, y, name, stock: [id d'arme / d'objet] } boutique ; prix réglés sur l'arme / l'objet
 *   spots       [{ unitId, x, y, after }] personnages présents (after : après tel chapitre)
 *   startGold   or au début d'une nouvelle partie
 *   music       musique du lobby
 *
 * Chapitres et actes :
 *   Un ACTE est un niveau jouable (data/chapters.json : map, placements, objectif, dialogues).
 *   Un CHAPITRE (data/arcs.json) regroupe des actes, joués dans l'ordre :
 *     { id, name, kind, description, unlock, acts: [id d'acte] }
 *     kind      'story' (histoire : les chapitres s'ouvrent l'un après l'autre) ou 'event' (évènement)
 *     unlock    { after, alive: [unitId], from, to } — after : chapitre ou acte à terminer avant ;
 *               alive : personnages vivants requis ; from / to : dates réelles « AAAA-MM-JJ » (incluses)
 *   Un chapitre est terminé quand tous ses actes le sont. Un acte qui n'appartient à aucun chapitre
 *   s'affiche comme un chapitre d'un seul acte (anciens projets) ; il garde alors ses propres
 *   kind / unlock, et les chapitres d'histoire s'enchaînent aussi par « Acte suivant » (next).
 *   Par acte : gold (or à la victoire ; goldEachClear : aussi en le rejouant), replay (false : pas rejouable).
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
    c.board = Object.assign({ x: 0, y: 0, label: 'Tableau des quêtes' }, c.board || {});
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
    if (u.after && !isDone(db, progress, u.after)) {
      reasons.push(`Terminer « ${nameOf(db, u.after)} »`); other++;
    }
    for (const id of u.alive || []) {
      if (progress.dead.includes(id)) { const c = byId(db.units, id); reasons.push(`${c ? c.name : id} doit être en vie`); other++; }
    }
    const d = today(now);
    if (isDate(u.from) && d < u.from) reasons.push(`Disponible à partir du ${frDate(u.from)}`);
    if (isDate(u.to) && d > u.to) reasons.push(`Terminé depuis le ${frDate(u.to)}`);
    return { reasons, dateOnly: reasons.length > 0 && other === 0 };
  }

  // ------------------------------------------------------------------
  // Chapitres (groupes d'actes) et actes
  // ------------------------------------------------------------------
  /**
   * Tous les chapitres : ceux de data/arcs.json (actes existants seulement), puis un chapitre implicite
   * d'un seul acte pour chaque acte rangé nulle part. [{ id, name, kind, description, unlock, acts: [acte], implicit }]
   */
  function arcsOf(db) {
    const acts = (db && db.chapters) || [];
    const used = new Set();
    const out = [];
    for (const a of (db && db.arcs) || []) {
      const list = (a.acts || []).map(id => byId(acts, id)).filter(c => c && !used.has(c.id));
      list.forEach(c => used.add(c.id));
      out.push({ id: a.id, name: a.name || a.id, kind: a.kind === 'event' ? 'event' : 'story', description: a.description || '', unlock: a.unlock || {}, acts: list, implicit: false });
    }
    for (const c of acts) {
      if (used.has(c.id)) continue;
      out.push({ id: c.id, name: c.name, kind: c.kind === 'event' ? 'event' : 'story', description: '', unlock: c.unlock || {}, acts: [c], implicit: true });
    }
    return out;
  }
  /** Chapitre d'un acte et son rang : { arc, index } (null si l'acte n'existe pas). */
  function actInfo(db, actId) {
    for (const arc of arcsOf(db)) {
      const i = arc.acts.findIndex(c => c.id === actId);
      if (i >= 0) return { arc, index: i };
    }
    return null;
  }
  /** Libellé d'un acte : « Chapitre 1 — … · Acte 2 : … » (ou le nom seul pour un acte isolé). */
  function actLabel(db, actId, short) {
    const info = actInfo(db, actId);
    if (!info) return actId;
    const ch = info.arc.acts[info.index];
    if (info.arc.implicit) return ch.name;
    const act = `Acte ${info.index + 1} : ${ch.name}`;
    return short ? act : `${info.arc.name} · ${act}`;
  }
  /** Nom d'un chapitre ou d'un acte (pour les conditions). */
  function nameOf(db, id) {
    const arc = ((db && db.arcs) || []).find(a => a.id === id);
    if (arc) return arc.name || id;
    return byId((db && db.chapters) || [], id) ? actLabel(db, id) : id;
  }
  /** Chapitre terminé (tous ses actes) ou acte terminé. */
  function isDone(db, progress, id) {
    const arc = ((db && db.arcs) || []).find(a => a.id === id);
    if (arc) {
      const acts = arcsOf(db).find(a => a.id === id).acts;
      return acts.length > 0 && acts.every(c => progress.cleared.includes(c.id));
    }
    return progress.cleared.includes(id);
  }

  /**
   * Tableau des quêtes : [{ arc, kind, state: 'new' | 'progress' | 'cleared' | 'locked', reasons, upcoming,
   *   done, total, acts: [{ ch, index, state, playable, reasons, gold }] }]
   * Histoire : le premier chapitre (celui de l'acte de départ), puis chacun s'ouvre quand le précédent
   * est terminé. Évènements : ouverts selon leurs conditions et leurs dates.
   * Les actes d'un chapitre se jouent dans l'ordre. Les chapitres verrouillés ne sont listés que
   * s'ils ne sont bloqués que par une date à venir.
   */
  function board(db, meta, campaign, now) {
    const progress = progressOf(campaign);
    const arcs = arcsOf(db);
    const story = arcs.filter(a => a.kind === 'story' && a.acts.length);
    const first = story.find(a => meta && a.acts.some(c => c.id === meta.startChapter)) || story[0];
    const out = [];
    for (const arc of arcs) {
      if (!arc.acts.length) continue;
      const done = arc.acts.filter(c => progress.cleared.includes(c.id)).length;
      const complete = done === arc.acts.length;
      let reached = true;
      if (arc.kind === 'story') {
        const i = story.indexOf(arc);
        reached = arc === first || (i > 0 && story[i - 1].acts.every(c => progress.cleared.includes(c.id)))
          || arc.acts.some(a => (db.chapters || []).some(c => c.next === a.id && progress.cleared.includes(c.id)));
      }
      const cond = conditions(arc.unlock, db, progress, now);
      const reasons = reached ? cond.reasons : ['Pas encore atteint'].concat(cond.reasons);
      const open = reached && !reasons.length;
      const upcoming = !open && reached && cond.dateOnly && isDate((arc.unlock || {}).from) && today(now) < arc.unlock.from;
      if (!open && !upcoming && !done) continue;
      const acts = arc.acts.map((ch, index) => {
        const cleared = progress.cleared.includes(ch.id);
        const prev = index === 0 || progress.cleared.includes(arc.acts[index - 1].id);
        const own = arc.implicit ? { reasons: [] } : conditions(ch.unlock, db, progress, now);
        const why = !open ? reasons : !prev ? [`Terminer l'acte ${index}`] : own.reasons;
        const playable = !why.length && (!cleared || ch.replay !== false);
        return { ch, index, state: cleared ? 'cleared' : why.length ? 'locked' : 'new', playable, reasons: why, gold: goldFor(ch, cleared) };
      });
      const state = complete ? 'cleared' : !open ? 'locked' : done ? 'progress' : 'new';
      out.push({ arc, kind: arc.kind, state, reasons: open ? [] : reasons, upcoming, done, total: arc.acts.length, acts });
    }
    return out;
  }

  /** Actes vus depuis le tableau, à plat : [{ ch, kind, state, playable, reasons, upcoming, gold, arc, index }]. */
  function chapters(db, meta, campaign, now) {
    const out = [];
    for (const b of board(db, meta, campaign, now)) {
      for (const a of b.acts) out.push(Object.assign({ kind: b.kind, upcoming: b.upcoming, arc: b.arc }, a));
    }
    return out;
  }
  /** Acte qui suit dans le même chapitre (null s'il n'y en a pas). */
  function nextAct(db, actId) {
    const info = actInfo(db, actId);
    return info && !info.arc.implicit ? info.arc.acts[info.index + 1] || null : null;
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
      if (spot.after && !isDone(db, progress, spot.after)) continue;
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

  /** Erreurs dans les chapitres : acte inconnu, acte rangé dans deux chapitres, chapitre vide. */
  function validateArcs(db) {
    const errors = [];
    const seen = new Map();
    for (const a of (db && db.arcs) || []) {
      if (!(a.acts || []).length) errors.push(`Le chapitre « ${a.name || a.id} » n'a aucun acte.`);
      for (const id of a.acts || []) {
        if (!byId(db.chapters, id)) { errors.push(`Le chapitre « ${a.name || a.id} » contient un acte supprimé (${id}).`); continue; }
        if (seen.has(id)) errors.push(`L'acte « ${byId(db.chapters, id).name} » est dans deux chapitres (« ${seen.get(id)} » et « ${a.name || a.id} »).`);
        seen.set(id, a.name || a.id);
      }
    }
    return errors;
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

  return { LOBBY_SAVE, defaults, heroOf, today, conditions, arcsOf, actInfo, actLabel, nameOf, isDone, board, chapters, nextAct, validateArcs, goldFor, completeChapter, present, talks, markTalk, entryOf, price, sellPrice, stock, buy, sell, validate, progressOf };
});
