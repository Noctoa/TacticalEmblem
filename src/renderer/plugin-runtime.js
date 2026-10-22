/*
 * Scripts des plugins : chaque plugin actif du projet peut fournir des fichiers .js (plugin.json › scripts)
 * et des feuilles de style (plugin.json › styles), chargés dans l'éditeur et dans le jeu. Un script s'enregistre avec :
 *
 *   TacticalEmblem.register('mon-plugin', {
 *     setup(api) { ... },                  // éditeur ET jeu, avant editor / game (ajouts communs)
 *     editor(api) { ... },                 // à chaque ouverture du projet dans l'éditeur
 *     game(api) { ... },                   // au lancement du jeu (playtest)
 *   });
 *   TacticalEmblem.on('turn:start', (e, api) => { ... });   // événements du jeu (voir EVENTS)
 *
 * api : { id, where ('editor' | 'game'), project, db, meta, toast(texte), state (le jeu : PlaytestState), version,
 *         extend(kind, key, def)  ajout au noyau (voir shared/extensions.js), on(event, fn) }
 * Les ajouts d'un plugin désactivé sont ignorés. Un script qui plante est signalé dans la console et n'arrête ni
 * l'éditeur ni le jeu.
 */
(function (root) {
  'use strict';
  const EVENTS = {
    'game:start': 'le jeu démarre (après le chargement du projet)',
    'campaign:new': 'nouvelle partie ({ campaign })',
    'chapter:start': 'un acte commence ({ chapter })',
    'turn:start': 'début de phase ({ phase: player | ally | enemy, turn })',
    'combat:end': 'fin d’un combat ({ attacker, defender, result })',
    'unit:defeated': 'une unité tombe ({ unit })',
    'chapter:victory': 'acte gagné ({ chapter })',
    'lobby:enter': 'arrivée au camp ({ campaign })',
    'lobby:talk': 'conversation du camp terminée ({ talk, unit, campaign, float(texte, couleur) })'
  };
  const defs = new Map();
  const handlers = [];
  let ctx = null;
  const loaded = [];
  const Ext = () => root.Extensions;

  function apiFor(id) {
    const api = {
      id, version: 2,
      extend: (kind, key, def) => Ext().add(kind, id, key, def),
      on: (event, fn) => TF.on(event, fn, id)
    };
    // contexte courant (le projet ouvert peut changer dans l'éditeur)
    for (const k of ['where', 'project', 'db', 'toast', 'state', 'baseUrl']) Object.defineProperty(api, k, { enumerable: true, get: () => (ctx || {})[k] });
    Object.defineProperty(api, 'meta', { enumerable: true, get: () => ctx && ctx.project ? ctx.project.meta : null });
    return api;
  }
  const safe = (label, fn) => { try { const r = fn(); if (r && r.catch) r.catch(e => console.error('[plugin] ' + label, e)); } catch (e) { console.error('[plugin] ' + label, e); } };
  function start(id, def) {
    if (!ctx) return;
    const api = apiFor(id);
    if (typeof def.setup === 'function') safe(id + '.setup', () => def.setup(api));
    if (typeof def[ctx.where] === 'function') safe(id + '.' + ctx.where, () => def[ctx.where](api));
    def.__ctx = ctx;
  }

  const TF = {
    EVENTS,
    register(id, def) {
      id = String(id); def = def || {};
      defs.set(id, def);
      if (ctx && (!Ext() || Ext().isActive(id))) start(id, def);
    },
    /** Un gestionnaire enregistré par un plugin (api.on) se tait quand le plugin est désactivé. */
    on(event, fn, plugin) {
      if (typeof fn !== 'function') return;
      const i = plugin ? handlers.findIndex(h => h.plugin === plugin && h.event === event && String(h.fn) === String(fn)) : -1;
      if (i >= 0) handlers[i].fn = fn; // rechargement du plugin : pas de doublon
      else handlers.push({ event, fn, plugin: plugin || null });
    },
    emit(event, payload) {
      for (const h of handlers.slice()) if (h.event === event && (!h.plugin || !Ext() || Ext().isActive(h.plugin)))
        safe(event, () => h.fn(payload || {}, h.plugin ? apiFor(h.plugin) : Object.assign({ version: 2 }, ctx || {})));
    },
    plugins: () => [...defs.keys()],
    loaded: () => loaded.slice()
  };

  const fileUrl = (baseUrl, id, f) => baseUrl + 'plugins/' + encodeURIComponent(id) + '/' + String(f).split('/').map(encodeURIComponent).join('/');
  function addStyle(href, id) {
    if ([...document.querySelectorAll('link[data-plugin-style]')].some(l => l.dataset.pluginStyle === href)) return;
    const el = document.createElement('link');
    el.rel = 'stylesheet'; el.href = href; el.dataset.pluginStyle = href; el.dataset.plugin = id;
    document.head.appendChild(el);
  }
  function addScript(src, id) {
    if (loaded.includes(src)) return Promise.resolve();
    return new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = src; el.dataset.plugin = id;
      el.onload = () => { loaded.push(src); resolve(); };
      el.onerror = () => { console.error('[plugin] script introuvable : ' + src); resolve(); };
      document.head.appendChild(el);
    });
  }

  /** Plugins actifs du projet d'après les fiches installées et meta.plugins (les ajouts des autres sont ignorés). */
  function activate(installed, meta) {
    const on = root.Plugins ? root.Plugins.enabled(meta, installed) : installed;
    const ids = (on || []).filter(m => !m.error).map(m => m.id);
    if (Ext()) Ext().setActive(ids);
    return ids;
  }

  /**
   * Charge les scripts et styles des plugins actifs du projet. where : 'editor' | 'game'.
   * context : { project, db, toast, state } ; installed : fiches renvoyées par tf.installedPlugins(dir).
   * Rappelée après une installation ou une activation (éditeur) : seuls les nouveaux fichiers sont chargés,
   * les plugins actifs sont relancés (leurs ajouts sont remplacés, pas doublés).
   */
  async function load(baseUrl, installed, meta, where, context) {
    ctx = Object.assign({ where, baseUrl }, context || {});
    const ids = activate(installed || [], meta);
    for (const m of (installed || []).filter(p => ids.includes(p.id))) {
      for (const s of m.styles || []) addStyle(fileUrl(baseUrl, m.id, s), m.id);
      for (const s of m.scripts || []) await addScript(fileUrl(baseUrl, m.id, s), m.id);
    }
    for (const [id, def] of defs) if (def.__ctx !== ctx && ids.includes(id)) start(id, def);
    return loaded.length;
  }

  root.TacticalEmblem = TF;
  root.TacticsForge = TF; // ancien nom (Tactics Forge), gardé pour les plugins déjà écrits
  root.PluginRuntime = { load, activate, EVENTS };
})(typeof self !== 'undefined' ? self : this);
