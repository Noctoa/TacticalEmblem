/*
 * Lecture / écriture d'un projet sur disque :
 *
 * MonJeu/
 *   game.tfproj              métadonnées (nom, réglages, chapitre de départ, ordre des maps)
 *   data/                    base de données
 *     units.json classes.json weapons.json items.json terrains.json tilesets.json chapters.json
 *     maps/map_1.json        une map par fichier
 *   ressources/              images et sons, détail dans resources-layout.js
 *     personnages/<Nom>/     sprites de map, animation de combat, portrait d'un personnage
 *     tilesets/ interface/ musiques/ jingles/ sons/
 *
 * Les anciens projets (img/…, audio/…, maps/ à la racine) sont convertis à l'ouverture.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Defaults = require('../shared/defaults.js');
const Skills = require('../shared/skills.js');
const Promotions = require('../shared/promotions.js');
const Team = require('../shared/team.js');
const Deployment = require('../shared/deployment.js');
const Villages = require('../shared/villages.js');
const Locks = require('../shared/locks.js');
const Scenario = require('../shared/scenario.js');
const Layout = require('./resources-layout.js');

const PROJECT_FILE = 'game.tfproj';
const DB_KEYS = ['terrains', 'weapons', 'items', 'classes', 'units', 'tilesets', 'chapters', 'supports', 'skills', 'talks', 'arcs', 'banners'];
const RESOURCE_DIRS = Layout.ALL_DIRS;

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

/** Inventaire des ressources (sprites de map, animations de combat, portraits, tilesets, audio). */
const scanResources = Layout.scanResources;

/** assetsDir (facultatif) : dossier assets/ de l'application, pour la conversion des anciens projets. */
function loadProject(dir, assetsDir) {
  const metaFile = path.join(dir, PROJECT_FILE);
  if (!fs.existsSync(metaFile)) throw new Error("Ce dossier ne contient pas de projet (" + PROJECT_FILE + " introuvable).");
  const meta = readJson(metaFile, null);
  if (!meta) throw new Error(PROJECT_FILE + ' est illisible.');
  // ancienne arborescence des ressources (img/, audio/) : conversion sur le disque
  const migration = Layout.migrate(dir, PROJECT_FILE, DB_KEYS, assetsDir);
  if (migration) Object.assign(meta, readJson(metaFile, meta));
  const db = {};
  for (const k of DB_KEYS) db[k] = readJson(path.join(dir, 'data', k + '.json'), []);
  const skillFile = path.join(dir, 'data', 'skills.json');
  if (fs.existsSync(skillFile)) {
    try { db.skills = JSON.parse(fs.readFileSync(skillFile, 'utf8')); }
    catch (e) { throw new Error('Le catalogue data/skills.json est illisible : ' + e.message); }
    if (!Array.isArray(db.skills) || db.skills.some(s => !s || typeof s !== 'object' || Array.isArray(s))) throw new Error('Le catalogue data/skills.json doit contenir une liste de fiches.');
  }
  const maps = readMaps(dir);
  const order = meta.mapOrder || [];
  maps.sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.id.localeCompare(b.id);
  });
  delete meta.mapOrder;
  const project = { meta, db, maps, resources: scanResources(dir) };
  if (migration) project.migration = migration;
  return project;
}

function saveProject(dir, project) {
  const errors = [...Skills.validateAll(project.db.skills || []), ...Skills.validateAssignments(project.db), ...Skills.validateLearning(project.db), ...Promotions.validate(project.db), ...Team.validate(project.db, project.meta), ...Locks.validateKeys(project.db)];
  for (const ch of project.db.chapters || []) errors.push(...Locks.validate(ch, project.db, project.maps.find(m => m.id === ch.mapId) || { width: Infinity, height: Infinity }));
  for (const ch of project.db.chapters || []) errors.push(...Scenario.validate(ch, project.db, project.maps.find(m => m.id === ch.mapId) || { width: Infinity, height: Infinity }));
  for (const ch of project.db.chapters || []) if (ch.villages !== undefined) {
    const map = project.maps.find(m => m.id === ch.mapId);
    // Comme les actes sans villages, un acte orphelin reste éditable après suppression de sa map.
    errors.push(...Villages.validate(ch, project.db, map || { width: Infinity, height: Infinity }));
  }
  for (const ch of project.db.chapters || []) if (ch.deployment !== undefined) {
    const map = project.maps.find(m => m.id === ch.mapId);
    if (map) errors.push(...Deployment.validate(ch, project.db, map));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  Layout.ensureDirs(dir);
  fs.mkdirSync(mapsDirOf(dir), { recursive: true });
  const meta = Object.assign({}, project.meta, { mapOrder: project.maps.map(m => m.id), savedAt: new Date().toISOString(), layout: Layout.LAYOUT });
  delete meta.migration;
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

/** Copie les ressources par défaut dans un projet existant, sans écraser ses fichiers.
 *  only : liste de dossiers de personnages (ressources/personnages/<nom>) à copier ; absent = tout. */
function installDefaults(dir, assetsDir, only) {
  let added = 0;
  const walk = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dest, e.name);
      if (e.isDirectory()) walk(s, d);
      else if (e.name !== '.gitkeep' && !fs.existsSync(d)) { fs.copyFileSync(s, d); added++; }
    }
  };
  // seulement assets/default/ressources : d'éventuels restes d'une ancienne version (img/, audio/) sont ignorés
  const src = path.join(assetsDir, 'default', Layout.ROOT), dest = path.join(dir, Layout.ROOT);
  if (Array.isArray(only)) {
    const rel = path.relative(Layout.ROOT, Layout.DIRS.characters);
    for (const who of only) {
      const s = path.join(src, rel, path.basename(String(who)));
      if (fs.existsSync(s)) walk(s, path.join(dest, rel, path.basename(String(who))));
    }
  } else walk(src, dest);
  Layout.ensureDirs(dir);
  return { added, resources: scanResources(dir) };
}

/** Nouveau projet : copie les ressources par défaut (assets/default/ressources) puis écrit la base. */
function createProject(dir, name, template, assetsDir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error('Le dossier choisi n\'est pas vide.');
  copyDir(path.join(assetsDir, 'default', Layout.ROOT), path.join(dir, Layout.ROOT));
  Layout.ensureDirs(dir);
  const project = Defaults.sampleProject(name);
  if (template === 'empty') {
    const map = project.maps[0];
    map.name = 'Map 1';
    map.layers[0].data = map.layers[0].data.map(() => 1);
    project.db.chapters = [];
    for (const unit of project.db.units) delete unit.recruitAfter;
    project.meta.startChapter = '';
  }
  saveProject(dir, project);
  return loadProject(dir);
}

module.exports = { PROJECT_FILE, DB_KEYS, RESOURCE_DIRS, DIRS: Layout.DIRS, setTeamColors: Layout.setTeamColors, loadProject, saveProject, createProject, isProjectDir, scanResources, installDefaults };
