/*
 * Scripts des plugins : chaque plugin actif du projet peut fournir des fichiers .js (plugin.json › scripts),
 * chargés dans l'éditeur et dans le jeu. Un script s'enregistre avec :
 *
 *   TacticsForge.register('mon-plugin', {
 *     editor(api) { ... },                 // une fois, à l'ouverture du projet dans l'éditeur
 *     game(api) { ... },                   // une fois, au lancement du jeu (playtest)
 *   });
 *   TacticsForge.on('turn:start', (e, api) => { ... });   // événements du jeu (voir EVENTS)
 *
 * api : { where ('editor' | 'game'), project, db, toast(texte), state (le jeu : PlaytestState), version }
 * Un script qui plante est signalé dans la console et n'arrête ni l'éditeur ni le jeu.
 */
(function (root) {
  'use strict';
  const EVENTS = {
    'game:start': 'le jeu démarre (après le chargement du projet)',
    'chapter:start': 'un acte commence ({ chapter })',
    'turn:start': 'début de phase ({ phase: player | ally | enemy, turn })',
    'combat:end': 'fin d’un combat ({ attacker, defender, result })',
    'unit:defeated': 'une unité tombe ({ unit })',
    'chapter:victory': 'acte gagné ({ chapter })'
  };
  const defs = new Map();
  const handlers = [];
  let ctx = null;
  const loaded = [];

  const api = () => Object.assign({ version: 1 }, ctx || {});
  const safe = (label, fn) => { try { const r = fn(); if (r && r.catch) r.catch(e => console.error('[plugin] ' + label, e)); } catch (e) { console.error('[plugin] ' + label, e); } };

  const TF = {
    EVENTS,
    register(id, def) {
      defs.set(String(id), def || {});
      if (ctx && def && typeof def[ctx.where] === 'function') { def.__started = true; safe(id + '.' + ctx.where, () => def[ctx.where](api())); }
    },
    on(event, fn) { if (typeof fn === 'function') handlers.push({ event, fn }); },
    emit(event, payload) {
      for (const h of handlers) if (h.event === event) safe(event, () => h.fn(payload || {}, api()));
    },
    plugins: () => [...defs.keys()],
    loaded: () => loaded.slice()
  };

  /**
   * Charge les scripts des plugins actifs du projet. where : 'editor' | 'game'.
   * context : { project, db, toast, state } ; installed : fiches renvoyées par tf.installedPlugins(dir).
   */
  async function load(baseUrl, installed, meta, where, context) {
    ctx = Object.assign({ where }, context || {});
    const list = root.Plugins ? root.Plugins.enabled(meta, installed) : installed;
    for (const m of list) {
      for (const s of m.scripts || []) {
        const src = baseUrl + 'plugins/' + encodeURIComponent(m.id) + '/' + s.split('/').map(encodeURIComponent).join('/');
        if (loaded.includes(src)) continue;
        await new Promise((resolve) => {
          const el = document.createElement('script');
          el.src = src; el.dataset.plugin = m.id;
          el.onload = () => { loaded.push(src); resolve(); };
          el.onerror = () => { console.error('[plugin] script introuvable : ' + src); resolve(); };
          document.head.appendChild(el);
        });
      }
    }
    // plugins enregistrés avant le contexte (scripts déjà chargés) : on les lance maintenant
    for (const [id, def] of defs) if (typeof def[where] === 'function' && !def.__started) { def.__started = true; safe(id + '.' + where, () => def[where](api())); }
    return loaded.length;
  }

  root.TacticsForge = TF;
  root.PluginRuntime = { load, EVENTS };
})(typeof self !== 'undefined' ? self : this);
