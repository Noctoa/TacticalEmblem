/*
 * Dialogues de combat (comme les conversations de boss des Fire Emblem) : avant un combat, un dialogue se joue
 * quand un personnage précis affronte un ennemi précis. Plusieurs personnages peuvent avoir chacun leur dialogue
 * avec le même ennemi ; une entrée sans personnage choisi sert à tous les autres (réplique générique du boss).
 *
 *   placement ennemi.battleTalks = [{ id, with: [ids de personnages] (vide = tous), text: 'Nom: réplique\n…', when: 'attack' | 'any' }]
 *     when 'attack' : seulement quand le personnage attaque l'ennemi ; 'any' : dans un sens ou dans l'autre.
 *   find(enemyPlacement, player, initiatedByPlayer, done) → l'entrée à jouer (personnage précis avant générique) ou null
 *   key(enemyPlacement, entry, player) → clé « déjà vu » (une fois par tentative)
 *   validate(ch, db) → erreurs
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BattleTalks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const entries = (pl) => (pl && Array.isArray(pl.battleTalks) ? pl.battleTalks : []).filter(t => t && String(t.text || '').trim());
  const key = (pl, t, player) => [pl.id, t.id || '', (t.with || []).length ? '' : player.sourceId].join('|');
  function find(pl, player, initiated, done) {
    if (!pl || !player) return null;
    const ok = (t) => (t.when !== 'attack' || initiated) && !(done && done.has(key(pl, t, player)));
    const own = entries(pl).filter(t => (t.with || []).includes(player.sourceId)).find(ok);
    return own || entries(pl).filter(t => !(t.with || []).length).find(ok) || null;
  }
  function validate(ch, db) {
    const errors = [], known = (id) => (db.units || []).some(u => u.id === id);
    for (const pl of ch.enemies || []) {
      const talks = pl.battleTalks;
      if (talks === undefined) continue;
      const who = pl.name || pl.id;
      if (!Array.isArray(talks)) { errors.push(`${who} : dialogues de combat invalides.`); continue; }
      for (const t of talks) {
        if (!t || typeof t !== 'object') { errors.push(`${who} : dialogue de combat invalide.`); continue; }
        if (t.with !== undefined && (!Array.isArray(t.with) || t.with.some(id => !known(id)))) errors.push(`${who} : personnage du dialogue de combat introuvable.`);
        if (t.when !== undefined && !['attack', 'any'].includes(t.when)) errors.push(`${who} : moment du dialogue de combat invalide.`);
        if (!String(t.text || '').trim()) errors.push(`${who} : un dialogue de combat est vide.`);
      }
    }
    return errors;
  }
  return { entries, find, key, validate };
});
