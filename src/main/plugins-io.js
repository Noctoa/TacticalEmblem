'use strict';
/*
 * Plugins côté disque : plugins fournis avec Tactical Emblem (dossier plugins/ de l'application), plugins installés
 * dans un projet (<projet>/plugins/<id>/), installation (copie des ressources sans écraser + fiche et scripts) et
 * désinstallation (la fiche et les scripts partent, les ressources copiées restent : elles peuvent être utilisées).
 */
const fs = require('fs');
const path = require('path');
const Plugins = require('../shared/plugins.js');

const PROJECT_DIR = 'plugins';
const MANIFEST = 'plugin.json';

function readManifest(dir) {
  const file = path.join(dir, MANIFEST);
  if (!fs.existsSync(file)) throw new Error('Pas de plugin.json dans ' + dir);
  let m;
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error('plugin.json illisible : ' + e.message); }
  const err = Plugins.validate(m);
  if (err.length) throw new Error('plugin.json invalide : ' + err.join(' ; '));
  return Plugins.normalize(m);
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  return n;
}

/** Plugins d'un dossier (un sous-dossier par plugin) : [{ ...fiche, dir, files }], les fiches invalides en { id, error }. */
function listIn(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const dir = path.join(root, e.name);
    if (!fs.existsSync(path.join(dir, MANIFEST))) continue;
    try {
      const m = readManifest(dir);
      out.push(Object.assign(m, { dir, files: countFiles(path.join(dir, m.ressources)) }));
    } catch (err) { out.push({ id: e.name, name: e.name, error: err.message, dir }); }
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
}

const listInstalled = (projectDir) => listIn(path.join(projectDir, PROJECT_DIR)).map(m => Object.assign(m, { dir: undefined }));

function copyTree(src, dest, overwrite) {
  let added = 0;
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) added += copyTree(s, d, overwrite);
    else if (overwrite || !fs.existsSync(d)) { fs.copyFileSync(s, d); added++; }
  }
  return added;
}

/**
 * Installe le plugin du dossier src dans le projet : ses ressources vont dans <projet>/ressources (sans écraser),
 * la fiche, les scripts et le reste dans <projet>/plugins/<id>/ (remplacés : mise à jour du plugin).
 */
function install(projectDir, src) {
  const m = readManifest(src);
  const resSrc = path.resolve(src, m.ressources || 'ressources');
  if (!resSrc.startsWith(path.resolve(src))) throw new Error('« ressources » sort du dossier du plugin.');
  const added = copyTree(resSrc, path.join(projectDir, 'ressources'), false);
  const dest = path.join(projectDir, PROJECT_DIR, m.id);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (path.resolve(src, e.name) === resSrc) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d, true); else fs.copyFileSync(s, d);
  }
  for (const s of m.scripts || []) if (!fs.existsSync(path.join(dest, s))) throw new Error('Script introuvable dans le plugin : ' + s);
  return { manifest: Object.assign({}, m, { dir: undefined }), added };
}

function uninstall(projectDir, id) {
  if (!Plugins.ID.test(String(id))) throw new Error('Identifiant de plugin invalide.');
  const dest = path.join(projectDir, PROJECT_DIR, id);
  if (!fs.existsSync(dest)) return false;
  fs.rmSync(dest, { recursive: true, force: true });
  return true;
}

/** Dossier d'un plugin fourni avec l'application, d'après son identifiant. */
function bundledDir(root, id) {
  const m = listIn(root).find(p => p.id === id && !p.error);
  if (!m) throw new Error('Plugin introuvable : ' + id);
  return m.dir;
}

module.exports = { PROJECT_DIR, MANIFEST, readManifest, listIn, listInstalled, install, uninstall, bundledDir };
