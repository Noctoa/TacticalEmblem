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
  importPortrait: (dir, owner) => call('portrait:import', dir, owner),
  playtest: (dir, chapterId) => call('playtest:open', dir, chapterId),
  scanResources: (dir) => call('resources:scan', dir),
  installDefaultResources: (dir) => call('resources:installDefaults', dir),
  setTeamColors: (dir, key, colors) => call('resources:setTeamColors', dir, key, colors),
  openResourceFolder: (dir, sub) => call('resources:openFolder', dir, sub),
  onMenu: (fn) => ipcRenderer.on('menu', (e, cmd) => fn(cmd))
});
