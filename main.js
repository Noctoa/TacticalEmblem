'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const io = require('./src/main/project-io.js');
const campaignIO = require('./src/main/campaign-io.js');
const { importTiled } = require('./src/main/tiled.js');

const ASSETS = path.join(__dirname, 'assets');
let editorWin = null;
let editorDirty = false;
let forceClose = false;
const playtests = new Set();

// ---------- projets récents ----------
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function getRecent() {
  try { return JSON.parse(fs.readFileSync(recentFile(), 'utf8')).filter(r => io.isProjectDir(r.dir)); } catch (e) { return []; }
}
function addRecent(dir, name) {
  const list = getRecent().filter(r => r.dir !== dir);
  list.unshift({ dir, name, openedAt: new Date().toISOString() });
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(recentFile(), JSON.stringify(list.slice(0, 8), null, 1));
}
const payload = (dir, project) => ({ dir, baseUrl: pathToFileURL(dir).href.replace(/\/?$/, '/'), project });

// ---------- fenêtres ----------
function createEditor() {
  editorWin = new BrowserWindow({
    show: !process.env.TF_SNAPSHOT,
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, backgroundColor: '#15171c',
    title: 'Tactics Forge',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  editorWin.loadFile(path.join(__dirname, 'src', 'renderer', 'editor.html'));
  editorWin.on('close', (e) => {
    if (forceClose || !editorDirty) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(editorWin, {
      type: 'question', buttons: ['Enregistrer', 'Quitter sans enregistrer', 'Annuler'], defaultId: 0, cancelId: 2,
      title: 'Modifications non enregistrées', message: 'Le projet contient des modifications non enregistrées.'
    });
    if (choice === 0) editorWin.webContents.send('menu', 'save-and-close');
    else if (choice === 1) { forceClose = true; editorWin.close(); }
  });
  editorWin.on('closed', () => { editorWin = null; for (const w of playtests) if (!w.isDestroyed()) w.close(); });
}

function openPlaytest(dir, chapterId) {
  const win = new BrowserWindow({
    show: !process.env.TF_SNAPSHOT,
    width: 1100, height: 780, minWidth: 640, minHeight: 480, backgroundColor: '#0b0d12', title: 'Playtest',
    parent: undefined, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'playtest.html'), { query: { dir, chapter: chapterId || '' } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  playtests.add(win);
  win.on('closed', () => playtests.delete(win));
  return win;
}

function send(cmd) { if (editorWin) editorWin.webContents.send('menu', cmd); }

function buildMenu() {
  const tpl = [
    { label: 'Fichier', submenu: [
      { label: 'Nouveau projet…', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: 'Ouvrir un projet…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { type: 'separator' },
      { label: 'Importer une map Tiled…', accelerator: 'CmdOrCtrl+I', click: () => send('import-tiled') },
      { label: 'Ouvrir le dossier du projet', click: () => send('open-folder') },
      { type: 'separator' },
      { role: 'quit', label: 'Quitter' }
    ] },
    { label: 'Édition', submenu: [
      { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
      { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
      { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' },
      { role: 'selectAll', label: 'Tout sélectionner' }
    ] },
    { label: 'Mode', submenu: [
      { label: 'Tiles', accelerator: 'F1', click: () => send('mode-tiles') },
      { label: 'Terrain', accelerator: 'F2', click: () => send('mode-terrain') },
      { label: 'Unités / chapitre', accelerator: 'F3', click: () => send('mode-units') }
    ] },
    { label: 'Affichage', submenu: [
      { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
      { label: 'Zoom −', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
      { label: 'Zoom 100 %', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
      { label: 'Grille', accelerator: 'CmdOrCtrl+G', click: () => send('toggle-grid') },
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Outils de développement' },
      { role: 'togglefullscreen', label: 'Plein écran' }
    ] },
    { label: 'Outils', submenu: [
      { label: 'Base de données…', accelerator: 'F9', click: () => send('database') },
      { label: 'Tester le chapitre', accelerator: 'F5', click: () => send('playtest') }
    ] },
    { label: 'Aide', submenu: [
      { label: 'À propos', click: () => dialog.showMessageBox(editorWin, { title: 'Tactics Forge', message: 'Tactics Forge ' + app.getVersion(), detail: "Éditeur de tactical RPG façon Fire Emblem.\nImport de maps Tiled (.tmx / .tmj)." }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

// ---------- IPC ----------
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    try { return { ok: true, value: await fn(e, ...args) }; }
    catch (err) { console.error(err); return { ok: false, error: err.message || String(err) }; }
  });
}

handle('app:recent', () => getRecent());
handle('app:dirty', (e, dirty) => { editorDirty = !!dirty; });
handle('app:forceClose', () => { forceClose = true; if (editorWin) editorWin.close(); });

handle('project:new', async (e, { name, template }) => {
  const res = await dialog.showSaveDialog(editorWin, {
    title: 'Emplacement du nouveau projet', buttonLabel: 'Créer le projet',
    defaultPath: path.join(app.getPath('documents'), (name || 'MonProjet').replace(/[\\/:*?"<>|]+/g, '_'))
  });
  if (res.canceled || !res.filePath) return null;
  const dir = res.filePath;
  const project = io.createProject(dir, name, template, ASSETS);
  addRecent(dir, project.meta.name);
  return payload(dir, project);
});

handle('project:open', async (e, dir) => {
  if (!dir) {
    const res = await dialog.showOpenDialog(editorWin, {
      title: 'Ouvrir un projet', properties: ['openFile'], filters: [{ name: 'Projet Tactics Forge', extensions: ['tfproj'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    dir = path.dirname(res.filePaths[0]);
  }
  const project = io.loadProject(dir);
  addRecent(dir, project.meta.name);
  return payload(dir, project);
});

handle('project:load', (e, dir) => payload(dir, io.loadProject(dir)));
handle('campaign:load', (e, dir) => campaignIO.load(dir));
handle('campaign:save', (e, dir, value) => { campaignIO.save(dir, value); return true; });
handle('project:save', (e, dir, project) => { io.saveProject(dir, project); return true; });
handle('project:openFolder', (e, dir) => shell.openPath(dir));

handle('tiled:import', async (e, dir, terrains) => {
  let files = global.__tiledOverride; // utilisé par le test automatisé
  if (!files) {
    const res = await dialog.showOpenDialog(editorWin, {
      title: 'Importer une map Tiled', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Maps Tiled', extensions: ['tmx', 'tmj', 'json'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    files = res.filePaths;
  }
  return files.map(f => {
    try { return Object.assign({ file: f }, importTiled(f, { projectDir: dir, terrains })); }
    catch (err) { return { file: f, error: err.message }; }
  });
});

function importAsset(sub) {
  return async (e, dir) => {
    const res = await dialog.showOpenDialog(editorWin || BrowserWindow.getFocusedWindow(), {
      title: 'Choisir une image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    const src = res.filePaths[0];
    const destDir = path.join(dir, sub);
    fs.mkdirSync(destDir, { recursive: true });
    const ext = path.extname(src);
    const base = path.basename(src, ext).replace(/[^\w\-]+/g, '_') || 'image';
    let name = base + ext, i = 1;
    while (fs.existsSync(path.join(destDir, name))) name = base + '_' + (i++) + ext;
    fs.copyFileSync(src, path.join(destDir, name));
    return sub + '/' + name;
  };
}
handle('tileset:importImage', importAsset('img/tilesets'));
handle('portrait:import', importAsset('img/faces'));
handle('resources:scan', (e, dir) => io.scanResources(dir));
handle('resources:installDefaults', (e, dir) => io.installDefaults(dir, ASSETS));
handle('resources:openFolder', (e, dir, sub) => shell.openPath(path.join(dir, sub || 'img')));

handle('playtest:open', (e, dir, chapterId) => { openPlaytest(dir, chapterId); return true; });

app.whenReady().then(() => {
  buildMenu();
  createEditor();
  // mode test automatisé : TF_SNAPSHOT=dossier → captures d'écran puis sortie
  if (process.env.TF_SNAPSHOT) require(process.env.TF_SNAPSHOT_SCRIPT || './test/snapshot.js')(editorWin, openPlaytest);
});
app.on('window-all-closed', () => app.quit());
