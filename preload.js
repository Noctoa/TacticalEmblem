'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(name, ...args) {
  const r = await ipcRenderer.invoke(name, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

contextBridge.exposeInMainWorld('tf', {
  recent: () => call('app:recent'),
  setDirty: (d) => call('app:dirty', d),
  forceClose: () => call('app:forceClose'),
  newProject: (opts) => call('project:new', opts),
  openProject: (dir) => call('project:open', dir),
  loadProject: (dir) => call('project:load', dir),
  loadCampaign: (dir, slot) => call('campaign:load', dir, slot),
  saveCampaign: (dir, value, slot) => call('campaign:save', dir, value, slot),
  listSaves: (dir) => call('campaign:list', dir),
  removeSave: (dir, slot) => call('campaign:remove', dir, slot),
  saveProject: (dir, project) => call('project:save', dir, project),
  openFolder: (dir) => call('project:openFolder', dir),
  importTiled: (dir, terrains) => call('tiled:import', dir, terrains),
  importTilesetImage: (dir) => call('tileset:importImage', dir),
  filePlaces: () => call('files:places'),
  listFiles: (dir) => call('files:list', dir),
  searchFiles: (root, query) => call('files:search', root, query),
  importFile: (dir, src, kind) => call('files:import', dir, src, kind),
  nativePickFile: (defaultPath) => call('files:native', defaultPath),
  importPortrait: (dir, owner) => call('portrait:import', dir, owner),
  playtest: (dir, chapterId) => call('playtest:open', dir, chapterId),
  scanResources: (dir) => call('resources:scan', dir),
  installDefaultResources: (dir, only) => call('resources:installDefaults', dir, only),
  setTeamColors: (dir, key, colors) => call('resources:setTeamColors', dir, key, colors),
  writeGenerated: (dir, owner, files) => call('resources:writeGenerated', dir, owner, files),
  openResourceFolder: (dir, sub) => call('resources:openFolder', dir, sub),
  bundledPlugins: () => call('plugins:bundled'),
  installedPlugins: (dir) => call('plugins:installed', dir),
  installPlugin: (dir, from) => call('plugins:install', dir, from),
  uninstallPlugin: (dir, id) => call('plugins:uninstall', dir, id),
  onMenu: (fn) => ipcRenderer.on('menu', (e, cmd) => fn(cmd))
});
