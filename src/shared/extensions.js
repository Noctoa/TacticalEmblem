/*
 * Points d'extension : ce que les plugins ajoutent au noyau (éditeur et jeu).
 *
 * Un plugin enregistre ses ajouts par type (kind), chacun sous une clé : un second ajout avec la même
 * clé remplace le premier (rechargement du plugin). Les ajouts d'un plugin désactivé ou désinstallé
 * sont ignorés (setActive) sans être effacés : le réactiver les rend tout de suite.
 *
 * Types utilisés par le noyau (détail dans le README, section Plugins) :
 *   dbTab          onglet de la base de données        { key, label, after, list, prefix, create, fields, sub, rerenderOn }
 *   fields         champs ajoutés à un formulaire      { tab: 'units' | 'talks' | 'chapters', after, fields(item) }
 *   system         section de Base de données › Système { label, prepare(meta), fields(meta) }
 *   action         action d'événement                  { type, label, defaults, fields(a), validate(a, db), run(a, ctx) }
 *   unitModifier   retouche d'une unité chargée        (unit, character, campaign) => void
 *   chapterReward  récompense de victoire (camp)       { amount(ch, alreadyCleared), grant(campaign, n, ch), text(n) }
 *   currency       monnaie affichée au camp            { label(campaign, meta), enabled(meta, cfg) }
 *   lobbyPlace     lieu du camp (comme la boutique)    { key, name, color, enabled(meta, cfg), open(ctx), menuSub(ctx) }
 *   debug          bouton du menu Debug (jeu)          { label, run(ctx) }
 *   hook           fonction appelée par le noyau       { name, fn }   (ex. 'fePack:installed')
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Extensions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const regs = new Map(); // kind -> Map(plugin + '/' + key -> { plugin, key, def })
  let active = () => true;
  let seq = 0;

  /** Ajoute (ou remplace) un ajout du plugin `plugin`. Sans clé : une clé unique est créée. */
  function add(kind, plugin, key, def) {
    if (!regs.has(kind)) regs.set(kind, new Map());
    const k = String(plugin) + '/' + (key === undefined || key === null ? '#' + (++seq) : String(key));
    regs.get(kind).set(k, { plugin: String(plugin), key: key === undefined || key === null ? k : key, def });
    return k;
  }
  /** Ajouts actifs d'un type : [{ plugin, key, def }]. */
  function entries(kind) { return [...((regs.get(kind) || new Map()).values())].filter(e => active(e.plugin)); }
  /** Définitions actives d'un type. */
  function list(kind) { return entries(kind).map(e => e.def); }
  /** Définition active d'un type selon une propriété (ex. find('action', 'type', 'orbs')). */
  function find(kind, prop, value) { return list(kind).find(d => d && d[prop] === value) || null; }
  /** Appelle les fonctions « hook » enregistrées sous ce nom ; renvoie leurs résultats. */
  function hook(name, ...args) {
    const out = [];
    for (const d of list('hook')) if (d && d.name === name && typeof d.fn === 'function') {
      try { out.push(d.fn(...args)); } catch (e) { if (typeof console !== 'undefined') console.error('[plugin] ' + name, e); }
    }
    return out;
  }
  /** Retire tous les ajouts d'un plugin (désinstallation). */
  function removePlugin(plugin) { for (const m of regs.values()) for (const [k, e] of m) if (e.plugin === plugin) m.delete(k); }
  /** Plugins actifs : fonction (id) => booléen, ou liste d'identifiants. */
  function setActive(fn) { active = typeof fn === 'function' ? fn : (ids => (id) => ids.includes(id))(fn || []); }
  function isActive(plugin) { return active(plugin); }
  /** Tout effacer (tests). */
  function reset() { regs.clear(); active = () => true; }

  return { add, entries, list, find, hook, removePlugin, setActive, isActive, reset };
});
