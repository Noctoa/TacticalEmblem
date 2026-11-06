/*
 * Factions (camps) : qui joue avec qui, qui se bat contre qui, et leurs couleurs.
 *
 *   player  Joueur (bleu)      ┐ toujours amis entre eux
 *   ally    Alliés (vert)      ┘
 *   enemy   Ennemis (rouge)    toujours hostiles au joueur et aux alliés
 *   yellow  Armée jaune        présente par défaut ; nom et hostilités réglables
 *   f_…     jusqu'à 2 factions créées par l'utilisateur (6 en tout), couleur au choix
 *
 * Réglages du projet : meta.factions = [{ id, name, color, foes: [ids] }] (les factions en plus seulement).
 * L'hostilité est symétrique : une faction se bat contre une autre si l'une des deux la désigne dans foes.
 * Les unités génériques (placements de classe) de n'importe quelle faction viennent de ch.enemies, avec
 * placement.faction (défaut 'enemy').
 *
 * Factions.configure(meta.factions) est appelé au chargement (éditeur, jeu) ; les règles lisent l'état courant.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Factions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX = 6, MAX_CUSTOM = 2;
  /** Couleurs : palette des sprites (Palettes) et teinte de l'interface. */
  const COLORS = {
    blue: { label: 'Bleu', hex: '#3f7cf0' }, green: { label: 'Vert', hex: '#2fd37a' }, red: { label: 'Rouge', hex: '#d9473d' },
    yellow: { label: 'Jaune', hex: '#e2b52a' }, purple: { label: 'Violet', hex: '#a066e8' }, orange: { label: 'Orange', hex: '#f08a2c' },
    cyan: { label: 'Cyan', hex: '#2cc3d9' }, pink: { label: 'Rose', hex: '#e05aa8' }
  };
  /** Couleurs proposées pour les factions créées par l'utilisateur. */
  const CUSTOM_COLORS = ['purple', 'orange', 'cyan', 'pink'];
  const BASE = [
    { id: 'player', name: 'Joueur', short: 'joueur', color: 'blue', fixed: true },
    { id: 'ally', name: 'Alliés', short: 'allié', color: 'green', fixed: true },
    { id: 'enemy', name: 'Ennemis', short: 'ennemi', color: 'red', fixed: true }
  ];
  const DEFAULT_EXTRA = [{ id: 'yellow', name: 'Armée jaune', color: 'yellow', foes: ['player', 'ally', 'enemy'] }];
  const ID = /^[a-z][a-z0-9_]{0,23}$/;
  let extra = clone(DEFAULT_EXTRA);

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  /** Réglages du projet nettoyés : l'armée jaune toujours là, 2 factions personnalisées au plus. */
  function normalize(list) {
    const src = Array.isArray(list) ? list : [];
    const out = [];
    const yellow = src.find(f => f && f.id === 'yellow') || {};
    out.push({ id: 'yellow', name: String(yellow.name || DEFAULT_EXTRA[0].name).slice(0, 40), color: 'yellow',
      foes: Array.isArray(yellow.foes) ? yellow.foes.slice() : DEFAULT_EXTRA[0].foes.slice() });
    for (const f of src) {
      if (!f || f.id === 'yellow' || !ID.test(f.id || '') || BASE.some(b => b.id === f.id) || out.some(o => o.id === f.id)) continue;
      if (out.length - 1 >= MAX_CUSTOM) break;
      out.push({ id: f.id, name: String(f.name || 'Faction').slice(0, 40), color: CUSTOM_COLORS.includes(f.color) ? f.color : CUSTOM_COLORS[0], foes: Array.isArray(f.foes) ? f.foes.slice() : ['player', 'ally'] });
    }
    const ids = new Set(BASE.map(b => b.id).concat(out.map(o => o.id)));
    for (const f of out) f.foes = [...new Set(f.foes.filter(x => ids.has(x) && x !== f.id))];
    return out;
  }
  function configure(list) { extra = normalize(list); return all(); }
  /** Toutes les factions : les 3 de base puis les factions en plus. */
  function all() { return BASE.map(b => Object.assign({}, b)).concat(extra.map(f => Object.assign({ short: f.name }, f))); }
  const ids = () => all().map(f => f.id);
  const get = (id) => all().find(f => f.id === id) || null;
  const extras = () => extra.map(f => Object.assign({}, f));
  const isPlayerSide = (team) => team === 'player' || team === 'ally';
  /** Deux camps se battent-ils ? (symétrique) */
  function hostile(a, b) {
    if (!a || !b || a === b) return false;
    if (isPlayerSide(a) && isPlayerSide(b)) return false;
    if ((a === 'enemy' && isPlayerSide(b)) || (b === 'enemy' && isPlayerSide(a))) return true;
    const fa = extra.find(f => f.id === a), fb = extra.find(f => f.id === b);
    return !!((fa && fa.foes.includes(b)) || (fb && fb.foes.includes(a)));
  }
  const friendly = (a, b) => !hostile(a, b);
  /** Palette des sprites d'un camp (Palettes.teamPalette). */
  function palette(team) { const f = get(team); return f ? f.color : 'red'; }
  function hex(team) { const c = COLORS[palette(team)]; return c ? c.hex : '#d9473d'; }
  const name = (team) => { const f = get(team); return f ? f.name : team; };
  /** Factions qui jouent une phase après la phase ennemie (dans l'ordre). */
  const phaseOrder = () => extra.map(f => f.id);
  /** Faction d'un placement générique (ch.enemies) ; inconnue → ennemi. */
  function ofPlacement(pl) { const t = pl && pl.faction; return t && t !== 'player' && ids().includes(t) ? t : 'enemy'; }
  /** Erreurs des réglages (enregistrement du projet). */
  function validate(list) {
    const errors = [];
    if (list === undefined) return errors;
    if (!Array.isArray(list)) return ['Factions : une liste est attendue.'];
    if (list.filter(f => f && f.id !== 'yellow').length > MAX_CUSTOM) errors.push(`Factions : ${MAX_CUSTOM} factions personnalisées au plus (${MAX} en tout).`);
    for (const f of list) {
      if (!f || !ID.test(f.id || '')) { errors.push('Factions : identifiant invalide.'); continue; }
      if (BASE.some(b => b.id === f.id)) errors.push(`Factions : « ${f.id} » est réservé.`);
      if (f.id !== 'yellow' && !CUSTOM_COLORS.includes(f.color)) errors.push(`Faction ${f.name || f.id} : couleur inconnue.`);
    }
    const colors = list.filter(f => f && f.id !== 'yellow').map(f => f.color);
    if (new Set(colors).size !== colors.length) errors.push('Factions : deux factions ont la même couleur.');
    return errors;
  }
  /** Nouvelle faction personnalisée (couleur libre suivante) ; null s'il y en a déjà 6. */
  function create(list, name) {
    const cur = normalize(list);
    if (cur.length - 1 >= MAX_CUSTOM) return null;
    const used = new Set(cur.map(f => f.color));
    let n = 1; while (cur.some(f => f.id === 'f_' + n)) n++;
    return { id: 'f_' + n, name: name || 'Faction ' + (n + 1), color: CUSTOM_COLORS.find(c => !used.has(c)) || CUSTOM_COLORS[0], foes: ['player', 'ally', 'enemy'] };
  }

  return { MAX, MAX_CUSTOM, COLORS, CUSTOM_COLORS, BASE, DEFAULT_EXTRA, normalize, configure, all, ids, get, extras, isPlayerSide, hostile, friendly,
    palette, hex, name, phaseOrder, ofPlacement, validate, create };
});
