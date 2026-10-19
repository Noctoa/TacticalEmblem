/*
 * Sauvegardes de campagne du playtest : SLOTS emplacements, saves/slot-1.json … slot-5.json.
 * Chaque fichier est un point de reprise (début de chapitre ou camp) produit par Campaign.checkpoint,
 * complété d'un résumé « info » pour l'écran de chargement (lieu, mode, or, date).
 * L'ancienne sauvegarde unique (saves/campaign.json) devient l'emplacement 1.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Campaign = require('../shared/campaign');

const SLOTS = 5;
const dirOf = dir => path.join(dir, 'saves');
const fileOf = (dir, slot) => path.join(dirOf(dir), `slot-${slot}.json`);
const legacyOf = dir => path.join(dirOf(dir), 'campaign.json');

function checkSlot(slot) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > SLOTS) throw new Error(`Emplacement de sauvegarde invalide : ${slot}.`);
  return n;
}

/** L'ancienne sauvegarde unique est rangée dans l'emplacement 1 (s'il est libre). */
function adoptLegacy(dir) {
  const legacy = legacyOf(dir);
  if (!fs.existsSync(legacy) || fs.existsSync(fileOf(dir, 1))) return;
  fs.renameSync(legacy, fileOf(dir, 1));
  if (fs.existsSync(legacy + '.bak')) fs.renameSync(legacy + '.bak', fileOf(dir, 1) + '.bak');
}

function read(file) {
  try { return Campaign.validate(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e) { throw new Error('Impossible de lire la sauvegarde : ' + e.message); }
}

/** Contenu d'un emplacement (null s'il est vide). Sans emplacement : la sauvegarde la plus récente. */
function load(dir, slot) {
  adoptLegacy(dir);
  if (slot === undefined || slot === null) {
    const latest = list(dir).filter(s => s.exists && !s.error).sort((a, b) => b.mtime - a.mtime)[0];
    if (latest) return Object.assign(read(fileOf(dir, latest.slot)), { slot: latest.slot });
    const broken = list(dir).find(s => s.error);
    if (broken) throw new Error(broken.error);
    return null;
  }
  const n = checkSlot(slot);
  const file = fileOf(dir, n);
  return fs.existsSync(file) ? Object.assign(read(file), { slot: n }) : null;
}

/** Écrit un emplacement (1 par défaut). L'ancienne version est gardée en .bak. */
function save(dir, value, slot) {
  Campaign.validate(value);
  const n = checkSlot(slot === undefined || slot === null ? 1 : slot);
  adoptLegacy(dir);
  const file = fileOf(dir, n);
  fs.mkdirSync(dirOf(dir), { recursive: true });
  const data = Object.assign({}, value, { info: Object.assign({}, value.info || {}, { savedAt: new Date().toISOString() }) });
  delete data.slot;
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(file + '.tmp', file);
  return n;
}

/** Efface un emplacement (une copie reste en .bak). */
function remove(dir, slot) {
  const file = fileOf(dir, checkSlot(slot));
  if (fs.existsSync(file)) fs.renameSync(file, file + '.bak');
  return true;
}

/** Résumé des emplacements : [{ slot, exists, info, chapterId, mode, gold, mtime, error }]. */
function list(dir) {
  adoptLegacy(dir);
  const out = [];
  for (let n = 1; n <= SLOTS; n++) {
    const file = fileOf(dir, n);
    const e = { slot: n, exists: fs.existsSync(file) };
    if (e.exists) {
      e.mtime = fs.statSync(file).mtimeMs;
      try {
        const s = read(file);
        Object.assign(e, { info: s.info || {}, chapterId: s.chapterId, mode: s.campaign.mode, gold: s.campaign.gold || 0 });
      } catch (err) { e.error = err.message; }
    }
    out.push(e);
  }
  return out;
}

module.exports = { SLOTS, load, save, remove, list, fileOf };
