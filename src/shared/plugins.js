/*
 * Plugins : fiches (plugin.json) et liens qu'un plugin pose sur la base du projet.
 *
 * Un plugin est un dossier :
 *   plugin.json   { id, name, version, kind ('ressources' | 'script' | 'mixte'), description, author, notice,
 *                   ressources: 'ressources',           dossier copié dans ressources/ du projet (sans rien écraser)
 *                   links: { characters, classes, battlebacks },   images reliées à la base (champs vides seulement)
 *                   scripts: ['main.js'],                fichiers chargés dans l'éditeur et dans le jeu
 *                   styles: ['style.css'] }              feuilles de style chargées avec les scripts
 *
 * Liens :
 *   characters  { 'fe6:Roy': { folder, portrait, battler, mapSprite } }  personnages du pack de personnages FE
 *   classes     { archer: { folder, battler, mapSprite } }                classes de la base (par identifiant)
 *   battlebacks { plain: 'ressources/fonds-combat/fe6-plaine.png' }       fond de combat par terrain
 *
 * Le projet garde la liste dans meta.plugins : { <id>: { enabled, version, name } }.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Plugins = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
  const KINDS = ['ressources', 'script', 'mixte'];
  const KIND_LABELS = { ressources: 'Ressources', script: 'Script', mixte: 'Ressources + script' };

  /** Erreurs d'une fiche plugin.json (liste vide = valide). */
  function validate(m) {
    const err = [];
    if (!m || typeof m !== 'object') return ['plugin.json illisible'];
    if (!ID.test(String(m.id || ''))) err.push('« id » manquant ou invalide (minuscules, chiffres, - et _)');
    if (!String(m.name || '').trim()) err.push('« name » manquant');
    if (m.kind && !KINDS.includes(m.kind)) err.push('« kind » inconnu : ' + m.kind);
    if (m.scripts && (!Array.isArray(m.scripts) || m.scripts.some(s => typeof s !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(s) || !/\.js$/i.test(s))))
      err.push('« scripts » : liste de fichiers .js du dossier du plugin');
    if (m.styles && (!Array.isArray(m.styles) || m.styles.some(s => typeof s !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(s) || !/\.css$/i.test(s))))
      err.push('« styles » : liste de fichiers .css du dossier du plugin');
    return err;
  }

  /** Valeurs par défaut d'une fiche. */
  function normalize(m) {
    const links = (m && m.links) || {};
    return Object.assign({ version: '1.0.0', kind: (m && m.scripts && m.scripts.length) ? 'script' : 'ressources', description: '', author: '', notice: '',
      ressources: 'ressources', scripts: [], styles: [] }, m, {
      links: { characters: links.characters || {}, classes: links.classes || {}, battlebacks: links.battlebacks || {} }
    });
  }

  /** Plugins actifs du projet (fiches installées + meta.plugins). */
  function enabled(meta, installed) {
    const conf = (meta && meta.plugins) || {};
    return (installed || []).filter(m => !conf[m.id] || conf[m.id].enabled !== false);
  }

  /** Liens réunis de plusieurs plugins (le premier qui fournit une entrée la garde). */
  function mergeLinks(manifests) {
    const out = { characters: {}, classes: {}, battlebacks: {} };
    for (const m of manifests || []) {
      const l = normalize(m).links;
      for (const k of Object.keys(out)) for (const [key, v] of Object.entries(l[k])) if (out[k][key] === undefined) out[k][key] = v;
    }
    return out;
  }

  /**
   * Pose les liens d'un plugin sur la base : sprites des classes, fonds des terrains, images des personnages
   * déjà présents (findUnit(clé « jeu:Nom ») → unité). Seuls les champs vides sont remplis, et seulement si
   * has(champ, chemin) confirme que le fichier est dans le projet. Renvoie le nombre de liens posés par type.
   */
  function applyLinks(db, links, opts) {
    opts = opts || {};
    const has = opts.has || (() => true);
    const out = { classes: 0, terrains: 0, units: 0 };
    const l = normalize({ links }).links;
    for (const c of db.classes || []) {
      const a = l.classes[c.id];
      if (!a) continue;
      for (const key of ['battler', 'mapSprite']) if (a[key] && !c[key] && has(key, a[key])) { c[key] = a[key]; out.classes++; }
    }
    for (const t of db.terrains || []) {
      const f = l.battlebacks[t.id];
      if (f && !t.battleback && has('battleback', f)) { t.battleback = f; out.terrains++; }
    }
    if (opts.findUnit) {
      for (const [key, a] of Object.entries(l.characters)) {
        const u = opts.findUnit(key);
        if (!u) continue;
        const cls = (db.classes || []).find(c => c.id === u.classId);
        for (const field of ['portrait', 'battler', 'mapSprite']) {
          if (!a[field] || u[field] || !has(field, a[field])) continue;
          if (field === 'mapSprite' && cls && cls.mapSprite) continue; // la classe garde la main (promotion)
          if (field === 'battler' && cls && cls.battler === a.battler) continue;
          u[field] = a[field]; out.units++;
        }
      }
    }
    return out;
  }

  /** Une ressource existe-t-elle dans l'inventaire du projet (Editor.resources()) ? */
  function hasIn(res) {
    return (field, val) => {
      if (field === 'mapSprite') return !!(res.characters || {})[val];
      if (field === 'battler') return !!(res.battlers || {})[val];
      if (field === 'battleback') return (res.battlebacks || []).includes(val);
      return (res.faces || []).includes(val);
    };
  }

  return { ID, KINDS, KIND_LABELS, validate, normalize, enabled, mergeLinks, applyLinks, hasIn };
});
