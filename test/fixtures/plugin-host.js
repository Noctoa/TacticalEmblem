'use strict';
/*
 * Charge un plugin du dépôt (plugins/<id>/) dans Node, comme le ferait l'éditeur ou le jeu :
 * ses scripts sont exécutés dans un contexte qui voit les modules du noyau (Rules, Lobby, Extensions…),
 * puis setup() et editor() / game() sont appelés avec une api équivalente à celle de plugin-runtime.js.
 *
 *   const host = loadPlugin('invocations', { where: 'editor', project });
 *   host.emit('lobby:talk', { … });   // événements enregistrés par le plugin (api.on)
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Extensions = require('../../src/shared/extensions.js');

const core = (name) => require(path.join(__dirname, '../../src/shared', name + '.js'));

function loadPlugin(id, opts) {
  opts = opts || {};
  const dir = path.join(__dirname, '../../plugins', id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  const handlers = [];
  const ctx = { where: opts.where || 'game', project: opts.project || null, db: opts.project ? opts.project.db : null, state: opts.state || null, toast: opts.toast || (() => {}) };
  const api = { id, version: 2, extend: (kind, key, def) => Extensions.add(kind, id, key, def), on: (event, fn) => handlers.push({ event, fn }) };
  for (const k of Object.keys(ctx)) Object.defineProperty(api, k, { enumerable: true, get: () => ctx[k] });
  Object.defineProperty(api, 'meta', { get: () => (ctx.project ? ctx.project.meta : null) });
  const sandbox = {
    console, Extensions, Rules: core('rules'), Lobby: core('lobby'), Roster: core('roster'), Team: core('team'), Campaign: core('campaign'),
    TacticalEmblem: { register: (pid, def) => { if (typeof def.setup === 'function') def.setup(api); if (typeof def[ctx.where] === 'function') def[ctx.where](api); } }
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const s of manifest.scripts || []) vm.runInContext(fs.readFileSync(path.join(dir, s), 'utf8'), sandbox, { filename: path.join(dir, s) });
  return {
    manifest, api, sandbox,
    emit: (event, payload) => { for (const h of handlers) if (h.event === event) h.fn(payload || {}, api); }
  };
}

module.exports = { loadPlugin, Extensions };

/**
 * Installe un plugin fourni avec l'application dans un projet enregistré, comme le bouton « Installer » de
 * Base de données › Plugins puis la réouverture dans l'éditeur (préparation du projet par le plugin).
 */
function installBundled(dir, id) {
  const io = require('../../src/main/project-io.js'), pio = require('../../src/main/plugins-io.js');
  pio.install(dir, pio.bundledDir(path.join(__dirname, '../../plugins'), id));
  const p = io.loadProject(dir);
  p.meta.plugins = Object.assign({}, p.meta.plugins, { [id]: { enabled: true, version: '1.0.0', name: id } });
  loadPlugin(id, { where: 'editor', project: p });
  io.saveProject(dir, JSON.parse(JSON.stringify(p)));
  return p;
}
module.exports.installBundled = installBundled;
