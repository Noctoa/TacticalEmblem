/*
 * Lecture / écriture d'un projet sur disque. Arborescence inspirée de RPG Maker :
 *
 * MonJeu/
 *   game.tfproj              métadonnées (nom, réglages, chapitre de départ, ordre des maps)
 *   data/                    base de données
 *     units.json classes.json weapons.json items.json terrains.json tilesets.json chapters.json
 *     maps/map_1.json        une map par fichier
 *   img/
 *     tilesets/              images de tilesets
 *     characters/            sprites de map  (<nom>.png + <nom>.json)
 *     battlers/              animations de combat (<nom>.png + <nom>.json)
 *     faces/                 portraits
 *     system/                interface (curseur, fenêtres…)
 *   audio/
 *     bgm/ se/ me/
 *
 * Les anciens projets (maps/, tilesets/, portraits/ à la racine) sont lus tels quels
 * et réenregistrés dans la nouvelle arborescence.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Defaults = require('../shared/defaults.js');

const PROJECT_FILE = 'game.tfproj';
const DB_KEYS = ['terrains', 'weapons', 'items', 'classes', 'units', 'tilesets', 'chapters', 'supports'];
const RESOURCE_DIRS = ['img/tilesets', 'img/characters', 'img/battlers', 'img/faces', 'img/system', 'audio/bgm', 'audio/se', 'audio/me'];
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a)$/i;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file); // écriture atomique
}

function isProjectDir(dir) { return fs.existsSync(path.join(dir, PROJECT_FILE)); }

function mapsDirOf(dir) { return path.join(dir, 'data', 'maps'); }

function readMaps(dir) {
  const maps = new Map();
  // ancienne arborescence d'abord, la nouvelle l'emporte
  for (const d of [path.join(dir, 'maps'), mapsDirOf(dir)]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json')) continue;
      const m = readJson(path.join(d, f), null);
      if (m && m.id) maps.set(m.id, m);
    }
  }
  return [...maps.values()];
}

/** Inventaire des ressources graphiques (sprites de map, battlers, portraits, tilesets). */
function scanResources(dir) {
  const res = { characters: {}, battlers: {}, faces: [], tilesets: [], system: [], bgm: [], me: [], se: [] };
  const list = (sub) => {
    const d = path.join(dir, sub);
    return fs.existsSync(d) ? fs.readdirSync(d).sort((a, b) => a.localeCompare(b)) : [];
  };
  for (const kind of ['characters', 'battlers']) {
    for (const f of list('img/' + kind)) {
      if (!f.endsWith('.json')) continue;
      const base = f.slice(0, -5);
      const png = 'img/' + kind + '/' + base + '.png';
      if (!fs.existsSync(path.join(dir, png))) continue;
      const meta = readJson(path.join(dir, 'img', kind, f), null);
      if (!meta) continue;
      meta.image = png;
      res[kind]['img/' + kind + '/' + base] = meta;
    }
  }
  for (const f of list('img/faces')) if (IMAGE_EXT.test(f)) res.faces.push('img/faces/' + f);
  for (const f of list('img/tilesets')) if (IMAGE_EXT.test(f)) res.tilesets.push('img/tilesets/' + f);
  for (const f of list('img/system')) if (IMAGE_EXT.test(f)) res.system.push('img/system/' + f);
  for (const k of ['bgm', 'me', 'se']) for (const f of list('audio/' + k)) if (AUDIO_EXT.test(f)) res[k].push('audio/' + k + '/' + f);
  return res;
}

function loadProject(dir) {
  const metaFile = path.join(dir, PROJECT_FILE);
  if (!fs.existsSync(metaFile)) throw new Error("Ce dossier ne contient pas de projet (" + PROJECT_FILE + " introuvable).");
  const meta = readJson(metaFile, null);
  if (!meta) throw new Error(PROJECT_FILE + ' est illisible.');
  const db = {};
  for (const k of DB_KEYS) db[k] = readJson(path.join(dir, 'data', k + '.json'), []);
  const maps = readMaps(dir);
  const order = meta.mapOrder || [];
  maps.sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.id.localeCompare(b.id);
  });
  delete meta.mapOrder;
  return { meta, db, maps, resources: scanResources(dir) };
}

function saveProject(dir, project) {
  for (const d of RESOURCE_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.mkdirSync(mapsDirOf(dir), { recursive: true });
  const meta = Object.assign({}, project.meta, { mapOrder: project.maps.map(m => m.id), savedAt: new Date().toISOString(), layout: 2 });
  writeJson(path.join(dir, PROJECT_FILE), meta);
  for (const k of DB_KEYS) writeJson(path.join(dir, 'data', k + '.json'), project.db[k] || []);
  const keep = new Set();
  for (const m of project.maps) {
    const name = m.id + '.json';
    keep.add(name);
    writeJson(path.join(mapsDirOf(dir), name), m);
  }
  // supprime les maps retirées du projet
  for (const f of fs.readdirSync(mapsDirOf(dir))) {
    if (f.endsWith('.json') && !keep.has(f)) fs.unlinkSync(path.join(mapsDirOf(dir), f));
  }
  // ancienne arborescence : maps/ à la racine, migré dans data/maps/
  const old = path.join(dir, 'maps');
  if (fs.existsSync(old)) {
    for (const f of fs.readdirSync(old)) if (f.endsWith('.json')) fs.unlinkSync(path.join(old, f));
    if (!fs.readdirSync(old).length) fs.rmdirSync(old);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.name !== '.gitkeep') fs.copyFileSync(s, d);
  }
}

/** Copie les ressources par défaut dans un projet existant, sans écraser ses fichiers. */
function installDefaults(dir, assetsDir) {
  let added = 0;
  const walk = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dest, e.name);
      if (e.isDirectory()) walk(s, d);
      else if (e.name !== '.gitkeep' && !fs.existsSync(d)) { fs.copyFileSync(s, d); added++; }
    }
  };
  walk(path.join(assetsDir, 'default'), dir);
  for (const d of RESOURCE_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  return { added, resources: scanResources(dir) };
}

/** Nouveau projet : copie les ressources par défaut (assets/default) puis écrit la base. */
function createProject(dir, name, template, assetsDir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error('Le dossier choisi n\'est pas vide.');
  copyDir(path.join(assetsDir, 'default'), dir);
  for (const d of RESOURCE_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const project = Defaults.sampleProject(name);
  if (template === 'empty') {
    const map = project.maps[0];
    map.name = 'Map 1';
    map.layers[0].data = map.layers[0].data.map(() => 1);
    project.db.chapters = [];
    project.meta.startChapter = '';
  }
  saveProject(dir, project);
  return loadProject(dir);
}

module.exports = { PROJECT_FILE, DB_KEYS, RESOURCE_DIRS, loadProject, saveProject, createProject, isProjectDir, scanResources, installDefaults };
