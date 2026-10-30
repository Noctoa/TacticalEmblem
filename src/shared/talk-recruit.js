/*
 * Recrutement en combat par la conversation (« Parler », comme dans les Fire Emblem) : un ennemi ou un allié vert
 * d'un acte peut rejoindre l'équipe quand un personnage précis du joueur, adjacent, lui parle.
 *
 * Placement (ennemi ou allié d'un chapitre) : talk = { enabled, with: [ids des personnages qui peuvent parler ; vide = tous],
 *   text: 'Nom: réplique\n…' (facultatif), joinAs: id de fiche Unités (ennemis seulement : le personnage qui rejoint) }.
 * Un ennemi recruté est remplacé par ce personnage (même case, même proportion de PV) ; un allié devient une unité du
 * joueur. Dans les deux cas, le personnage est ajouté à l'effectif de la campagne.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TalkRecruit = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const byId = (list, id) => (list || []).find(e => e.id === id);
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  /** Réglages actifs d'un placement (ou null). */
  function config(pl) {
    const t = pl && pl.talk;
    if (!t || !t.enabled) return null;
    return { with: Array.isArray(t.with) ? t.with.filter(Boolean) : [], text: String(t.text || ''), joinAs: String(t.joinAs || '') };
  }
  /** Personnage qui rejoint l'équipe : la fiche choisie (ennemi) ou celle de l'allié. */
  const recruitId = (pl, kind) => (kind === 'allies' ? pl.unitId : (config(pl) || {}).joinAs);

  function validate(ch, db) {
    const errors = [], players = new Set((ch.players || []).map(p => p.unitId));
    for (const [kind, list] of [['enemies', ch.enemies || []], ['allies', ch.allies || []]]) {
      for (const pl of list) {
        const t = pl.talk;
        if (t === undefined) continue;
        const who = pl.name || (byId(db.units, pl.unitId) || {}).name || pl.id;
        if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(`${who} : recrutement par la conversation invalide.`); continue; }
        if (!t.enabled) continue;
        if (t.with !== undefined && (!Array.isArray(t.with) || t.with.some(id => !byId(db.units, id)))) errors.push(`${who} : personnage qui peut lui parler introuvable.`);
        if (kind === 'enemies') {
          if (pl.isBoss) errors.push(`${who} : un boss ne peut pas être recruté par la conversation.`);
          if (!t.joinAs || !byId(db.units, t.joinAs)) errors.push(`${who} : choisis le personnage (fiche Unités) qui rejoint l'équipe.`);
          else if (players.has(t.joinAs)) errors.push(`${who} : ${byId(db.units, t.joinAs).name} est déjà une unité du joueur dans cet acte.`);
        }
        if ((t.with || []).includes(recruitId(pl, kind))) errors.push(`${who} : le personnage recruté ne peut pas se parler à lui-même.`);
      }
    }
    return errors;
  }

  /**
   * Unités à qui `u` (unité du joueur) peut parler maintenant : ennemis ou alliés adjacents, vivants, avec une conversation
   * de recrutement pas encore faite, et `u` parmi les personnages autorisés.
   */
  function partners(units, u) {
    if (!u || u.team !== 'player' || u.dead) return [];
    return (units || []).filter(o => o !== u && !o.dead && o.hp > 0 && (o.team === 'enemy' || o.team === 'ally') && o.talk && !o.talked
      && dist(o, u) === 1 && (!o.talk.with.length || o.talk.with.includes(u.sourceId)));
  }
  /** Texte joué si le créateur n'en a pas écrit. */
  const defaultText = (speaker, target) => `${speaker.name}: Nous ne sommes pas ennemis. Rejoins-nous !\n${target.name}: … Très bien. Je me bats à vos côtés.`;
  return { config, recruitId, validate, partners, defaultText };
});
