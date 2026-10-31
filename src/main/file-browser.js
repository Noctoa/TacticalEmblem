'use strict';
/*
 * Navigateur de fichiers intégré (fenêtre « Choisir un tileset ») : raccourcis, contenu d'un dossier, recherche par
 * nom dans les sous-dossiers, copie du fichier choisi dans le projet. Sans Electron : testable avec node.
 *
 *   places(home)                     → [{ label, path }] : Bureau, Documents, Images, Téléchargements, lecteurs
 *   list(dir, exts)                  → { path, parent, entries: [{ name, path, dir, size, mtime }] } (dossiers puis fichiers)
 *   search(root, query, exts, opts)  → { results: [...], truncated } ; nom sans accents ni casse, tous les mots
 *   copyInto(projectDir, src, sub)   → chemin relatif de la copie dans le projet (nom unique)
 */
const fs = require('fs');
const path = require('path');

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
// dossiers lourds ou système ignorés par la recherche
const SKIP = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information', 'appdata', 'windows', 'program files', 'program files (x86)', 'programdata', '.cache', '.npm']);

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const extOk = (name, exts) => !exts || !exts.length || exts.includes(path.extname(name).slice(1).toLowerCase());
const hidden = (name) => name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(name);

function places(home, platform = process.platform) {
  const out = [];
  const add = (label, p) => { if (p && !out.some(o => o.path === p) && isDir(p)) out.push({ label, path: p }); };
  const user = home || require('os').homedir();
  for (const [label, names] of [['Bureau', ['Desktop', 'Bureau']], ['Documents', ['Documents']], ['Images', ['Pictures', 'Images']], ['Téléchargements', ['Downloads', 'Téléchargements']]]) {
    for (const n of names) { const p = path.join(user, n); if (isDir(p)) { add(label, p); break; } }
    // OneDrive redirige souvent Bureau / Documents / Images
    for (const n of names) { const p = path.join(user, 'OneDrive', n); if (isDir(p)) { add(label + ' (OneDrive)', p); break; } }
  }
  add('Dossier personnel', user);
  if (platform === 'win32') {
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') add(`Disque ${l}:`, l + ':\\');
  } else add('Racine', '/');
  return out;
}
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

function entryOf(dir, d) {
  const p = path.join(dir, d.name);
  let isDirectory = d.isDirectory(), size = 0, mtime = 0;
  try { const st = fs.statSync(p); isDirectory = st.isDirectory(); size = st.size; mtime = st.mtimeMs; } catch (e) { return null; }
  return { name: d.name, path: p, dir: isDirectory, size, mtime };
}

function list(dir, exts) {
  dir = path.resolve(dir);
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const entries = [];
  for (const d of items) {
    if (hidden(d.name)) continue;
    if (!d.isDirectory() && !d.isSymbolicLink() && !extOk(d.name, exts)) continue;
    const e = entryOf(dir, d); if (!e) continue;
    if (!e.dir && !extOk(e.name, exts)) continue;
    entries.push(e);
  }
  entries.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent !== dir ? parent : null, entries };
}

/** Recherche en largeur (dossiers proches d'abord), bornée en résultats, profondeur et durée. */
function search(root, query, exts, opts = {}) {
  const max = opts.max || 300, depth = opts.depth == null ? 8 : opts.depth, until = Date.now() + (opts.ms || 4000);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const results = [];
  if (!words.length) return { results, truncated: false };
  let queue = [{ dir: path.resolve(root), level: 0 }], truncated = false;
  while (queue.length) {
    const { dir, level } = queue.shift();
    if (Date.now() > until) { truncated = true; break; }
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const d of items) {
      if (hidden(d.name)) continue;
      const name = fold(d.name);
      if (d.isDirectory()) {
        if (level < depth && !SKIP.has(name)) queue.push({ dir: path.join(dir, d.name), level: level + 1 });
        continue;
      }
      if (!extOk(d.name, exts) || !words.every(w => name.includes(w))) continue;
      const e = entryOf(dir, d); if (!e) continue;
      results.push(e);
      if (results.length >= max) { truncated = true; queue = []; break; }
    }
  }
  return { results, truncated };
}

/** Copie src dans projectDir/sub sous un nom unique ; renvoie « sub/nom ». */
function copyInto(projectDir, src, sub) {
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error('Fichier introuvable : ' + src);
  const destDir = path.join(projectDir, sub);
  fs.mkdirSync(destDir, { recursive: true });
  // déjà dans ce dossier du projet : pas de copie
  if (path.resolve(path.dirname(src)).toLowerCase() === path.resolve(destDir).toLowerCase()) return sub + '/' + path.basename(src);
  const ext = path.extname(src);
  const base = path.basename(src, ext).replace(/[^\p{L}\p{N}_\-]+/gu, '_') || 'image';
  let name = base + ext, i = 1;
  while (fs.existsSync(path.join(destDir, name))) name = base + '_' + (i++) + ext;
  fs.copyFileSync(src, path.join(destDir, name));
  return sub + '/' + name;
}

module.exports = { IMAGE_EXTS, places, list, search, copyInto, fold };
