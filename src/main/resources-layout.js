/*
 * Ressources d'un projet : rangement sur disque, inventaire et migration des anciens projets.
 *
 * MonJeu/ressources/
 *   personnages/        un dossier par personnage (ou par ennemi générique)
 *     Lyn/
 *       map_Lord.png  + map_Lord.json      sprite de map (une planche par classe si besoin)
 *       combat.png    + combat.json        animation de combat
 *       combat_arrow.png                   projectile de l'animation (flèche…)
 *       portrait.png                       portrait / face set
 *   tilesets/           images de tilesets
 *   interface/          curseur, fenêtres…
 *   musiques/           musiques de phase (bgm)
 *   jingles/            montée de niveau, victoire, game over (me)
 *   sons/               effets sonores (se)
 *
 * Le type d'un fichier ne dépend pas de son nom : une planche accompagnée d'un .json
 * « type: mapsprite » est un sprite de map, « type: battler » une animation de combat ;
 * une image seule rangée dans personnages/ est un portrait. Les sous-dossiers sont libres.
 *
 * Les projets enregistrés avant cette organisation (img/characters, img/battlers, img/faces,
 * img/tilesets, img/system, audio/bgm…) sont convertis à l'ouverture : fichiers déplacés,
 * références réécrites, sauvegarde de data/ et game.tfproj dans .sauvegarde-avant-ressources/.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = 'ressources';
const DIRS = {
  characters: ROOT + '/personnages',
  tilesets: ROOT + '/tilesets',
  system: ROOT + '/interface',
  bgm: ROOT + '/musiques',
  me: ROOT + '/jingles',
  se: ROOT + '/sons'
};
const ALL_DIRS = Object.values(DIRS);
const LAYOUT = 3;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a)$/i;
const BACKUP = '.sauvegarde-avant-ressources';

const README = `Ressources du projet
====================

personnages/   un dossier par personnage (ou ennemi générique), avec dedans :
                 - ses sprites de map      (planche .png + .json « type: mapsprite »)
                 - son animation de combat (planche .png + .json « type: battler »)
                 - son portrait            (image seule, face set 128×112 ou portrait simple)
               Les noms de fichiers sont libres, les sous-dossiers aussi.
tilesets/      images de tilesets (maps)
interface/     curseur, fenêtres…
musiques/      musiques de phase
jingles/       montée de niveau, victoire, game over
sons/          effets sonores

Couleurs : chaque planche est dans ses couleurs d'origine. Les versions bleue (joueur),
rouge (ennemi), verte (allié) et grise sont calculées par l'éditeur ; les couleurs qui
changent sont listées dans le .json (« teamColors ») et se règlent dans
Base de données › Ressources.
`;

const posix = (p) => p.split(path.sep).join('/');
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '').trim() || 'Sans_nom';
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

/** Fichiers (chemins relatifs au projet, en « / ») sous un dossier, récursivement, triés. */
function walk(dir, sub) {
  const out = [];
  const rec = (rel) => {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const r = rel + '/' + e.name;
      if (e.isDirectory()) rec(r); else out.push(r);
    }
  };
  rec(sub);
  return out.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

function ensureDirs(dir) {
  for (const d of ALL_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const readme = path.join(dir, ROOT, 'LISEZMOI.txt');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, README, 'utf8');
}

/** Dossier « personnage » d'un chemin de ressource : le premier dossier sous personnages/. */
function ownerOf(rel) {
  const pre = DIRS.characters + '/';
  if (!rel.startsWith(pre)) return '';
  const parts = rel.slice(pre.length).split('/');
  return parts.length > 1 ? parts[0] : '';
}

/** Inventaire des ressources. Clés des sprites : chemin sans extension. */
function scanResources(dir) {
  const res = { characters: {}, battlers: {}, faces: [], tilesets: [], system: [], bgm: [], me: [], se: [], owners: [] };
  const files = walk(dir, ROOT);
  const set = new Set(files);
  const used = new Set();
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const meta = readJson(path.join(dir, f), null);
    if (!meta || (meta.type !== 'mapsprite' && meta.type !== 'battler')) continue;
    const base = f.slice(0, -5);
    const image = ['.png', '.gif', '.webp'].map(e => base + e).find(p => set.has(p));
    if (!image) continue;
    meta.image = image;
    meta.folder = base.split('/').slice(0, -1).join('/');
    meta.owner = ownerOf(f);
    used.add(image);
    if (meta.type === 'battler' && meta.projectiles) {
      // les projectiles sont rangés à côté de la planche (nom seul dans le .json)
      for (const [k, p] of Object.entries(meta.projectiles)) {
        const near = meta.folder + '/' + String(p).split('/').pop();
        const rel = set.has(p) ? p : set.has(near) ? near : null;
        if (rel) { meta.projectiles[k] = rel; used.add(rel); } else delete meta.projectiles[k];
      }
    }
    res[meta.type === 'mapsprite' ? 'characters' : 'battlers'][base] = meta;
  }
  const under = (d) => files.filter(f => f.startsWith(d + '/'));
  for (const f of under(DIRS.characters)) if (IMAGE_EXT.test(f) && !used.has(f)) res.faces.push(f);
  for (const f of under(DIRS.tilesets)) if (IMAGE_EXT.test(f)) res.tilesets.push(f);
  for (const f of under(DIRS.system)) if (IMAGE_EXT.test(f)) res.system.push(f);
  for (const k of ['bgm', 'me', 'se']) for (const f of under(DIRS[k])) if (AUDIO_EXT.test(f)) res[k].push(f);
  const pDir = path.join(dir, DIRS.characters);
  if (fs.existsSync(pDir)) res.owners = fs.readdirSync(pDir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b, 'fr'));
  return res;
}

/** Enregistre les couleurs d'équipe d'une planche dans son .json (null = détection automatique). */
function setTeamColors(dir, key, colors) {
  const file = path.join(dir, key + '.json');
  if (!posix(path.relative(dir, file)).startsWith(ROOT + '/')) throw new Error('Ressource hors du dossier ressources/.');
  const meta = readJson(file, null);
  if (!meta) throw new Error('Fichier introuvable : ' + key + '.json');
  if (colors === null) delete meta.teamColors;
  else meta.teamColors = [...new Set(colors.map(c => String(c).toLowerCase()).filter(c => /^#[0-9a-f]{6}$/.test(c)))].sort();
  writeJson(file, meta);
  return meta.teamColors || null;
}

// ======================================================================
// Migration des anciens projets
// ======================================================================
const OLD_DIRS = ['img/characters', 'img/battlers', 'img/faces', 'img/tilesets', 'img/system', 'audio/bgm', 'audio/me', 'audio/se'];

function needsMigration(dir) {
  return OLD_DIRS.some(d => fs.existsSync(path.join(dir, d)) && walk(dir, d).length);
}

/**
 * Plan de déplacement : [{ from, to }] (chemins relatifs).
 * Dossier d'un sprite / portrait : le personnage dont le nom commence le fichier (« Lyn_Lord » → Lyn),
 * sinon l'unité qui l'utilise, sinon le début du nom de fichier.
 */
function migrationPlan(dir, db) {
  const units = (db && db.units) || [], classes = (db && db.classes) || [];
  const byName = new Map(units.map(u => [String(u.name || '').toLowerCase(), u.name]));
  const effective = new Map(); // ancienne clé / chemin -> nom d'unité
  for (const u of units) {
    const c = classes.find(c => c.id === u.classId) || {};
    for (const v of [u.mapSprite || c.mapSprite, u.battler || c.battler, u.portrait]) if (v && !effective.has(v)) effective.set(v, u.name);
  }
  const split = (base) => { const i = base.indexOf('_'); return i > 0 ? [base.slice(0, i), base.slice(i + 1)] : [base, '']; };
  const owner = (oldKey, base) => {
    const [pre] = split(base);
    if (byName.has(pre.toLowerCase())) return byName.get(pre.toLowerCase());
    if (byName.has(base.toLowerCase())) return byName.get(base.toLowerCase());
    if (effective.has(oldKey)) return effective.get(oldKey);
    return pre;
  };
  const fileName = (prefix, base, own) => {
    const o = own.toLowerCase(), b = base.toLowerCase();
    if (b === o) return prefix;
    if (b.startsWith(o + '_')) return prefix + '_' + base.slice(own.length + 1);
    return prefix + '_' + base;
  };
  const plan = [];
  const taken = new Set();
  const reserve = (to) => {
    let t = to, i = 2;
    const ext = path.posix.extname(to), stem = to.slice(0, to.length - ext.length);
    while (taken.has(t.toLowerCase()) || fs.existsSync(path.join(dir, t))) t = stem + '_' + (i++) + ext;
    taken.add(t.toLowerCase());
    return t;
  };
  const projectiles = new Set();
  // planches (png + json) et leurs projectiles
  for (const [kind, prefix] of [['characters', 'map'], ['battlers', 'combat']]) {
    const d = 'img/' + kind;
    for (const f of walk(dir, d).filter(f => f.endsWith('.json'))) {
      const oldKey = f.slice(0, -5);
      const base = path.posix.basename(oldKey);
      const img = ['.png', '.gif', '.webp'].map(e => oldKey + e).find(p => fs.existsSync(path.join(dir, p)));
      const own = safeName(owner(oldKey, base));
      const stem = reserve(DIRS.characters + '/' + own + '/' + fileName(prefix, base, own) + '.json').slice(0, -5);
      plan.push({ from: f, to: stem + '.json', key: [oldKey, stem] });
      if (img) plan.push({ from: img, to: stem + path.posix.extname(img) });
      const meta = readJson(path.join(dir, f), {});
      for (const [name, p] of Object.entries(meta.projectiles || {})) {
        if (!fs.existsSync(path.join(dir, p)) || projectiles.has(p)) continue;
        projectiles.add(p);
        plan.push({ from: p, to: reserve(stem + '_' + safeName(name) + path.posix.extname(p)), projectileOf: stem + '.json', name });
      }
    }
  }
  const moved = new Set(plan.map(p => p.from));
  for (const f of walk(dir, 'img/faces')) {
    if (!IMAGE_EXT.test(f)) continue;
    const ext = path.posix.extname(f), base = path.posix.basename(f, ext);
    const own = safeName(owner(f, base));
    plan.push({ from: f, to: reserve(DIRS.characters + '/' + own + '/' + fileName('portrait', base, own) + ext) });
  }
  // images restées dans img/characters ou img/battlers sans .json : rangées avec le personnage
  for (const kind of ['characters', 'battlers']) {
    for (const f of walk(dir, 'img/' + kind)) {
      if (moved.has(f) || f.endsWith('.json')) continue;
      const base = path.posix.basename(f);
      const own = safeName(split(base.replace(/\.[^.]+$/, ''))[0]);
      plan.push({ from: f, to: reserve(DIRS.characters + '/' + own + '/' + base) });
    }
  }
  const flat = [['img/tilesets', DIRS.tilesets], ['img/system', DIRS.system], ['audio/bgm', DIRS.bgm], ['audio/me', DIRS.me], ['audio/se', DIRS.se]];
  for (const [from, to] of flat) for (const f of walk(dir, from)) plan.push({ from: f, to: reserve(to + f.slice(from.length)) });
  return plan;
}

/**
 * Une planche convertie qui est une ressource par défaut (même nom, même source) récupère les
 * réglages de la version actuelle : liste des couleurs d'équipe et, pour les anciens sprites de
 * map à 4 palettes précalculées, la planche à une seule palette (même dessin).
 */
function upgradeFromDefault(dir, jsonRel, defaultRoot) {
  const defJson = path.join(defaultRoot, jsonRel);
  if (!fs.existsSync(defJson)) return;
  const file = path.join(dir, jsonRel);
  const meta = readJson(file, null), def = readJson(defJson, null);
  if (!meta || !def || meta.type !== def.type || meta.name !== def.name || meta.source !== def.source) return;
  if (!Array.isArray(meta.teamColors) && Array.isArray(def.teamColors)) meta.teamColors = def.teamColors;
  const png = jsonRel.slice(0, -5) + '.png';
  if (meta.palettes && !def.palettes && fs.existsSync(path.join(defaultRoot, png)) && fs.existsSync(path.join(dir, png))) {
    fs.copyFileSync(path.join(defaultRoot, png), path.join(dir, png));
    delete meta.palettes; delete meta.paletteHeight;
  }
  writeJson(file, meta);
}

/** Remplace, partout dans une valeur JSON, les chaînes égales à une ancienne clé. */
function rewrite(value, map) {
  if (typeof value === 'string') return map.has(value) ? map.get(value) : value;
  if (Array.isArray(value)) return value.map(v => rewrite(v, map));
  if (value && typeof value === 'object') { const o = {}; for (const [k, v] of Object.entries(value)) o[k] = rewrite(v, map); return o; }
  return value;
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}

function removeEmpty(abs) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
  for (const e of fs.readdirSync(abs)) removeEmpty(path.join(abs, e));
  const left = fs.readdirSync(abs).filter(n => n !== '.gitkeep');
  if (!left.length) { for (const n of fs.readdirSync(abs)) fs.unlinkSync(path.join(abs, n)); fs.rmdirSync(abs); }
}

/**
 * Convertit un projet à l'ancienne arborescence. Écrit directement sur le disque (fichiers
 * déplacés + données réécrites) pour que le projet reste cohérent même sans réenregistrer.
 * Renvoie null si rien à faire, sinon { moved, backup }.
 */
function migrate(dir, projectFile, dbKeys, assetsDir) {
  if (!needsMigration(dir)) return null;
  const meta = readJson(path.join(dir, projectFile), {});
  const db = {};
  for (const k of dbKeys) db[k] = readJson(path.join(dir, 'data', k + '.json'), []);
  const plan = migrationPlan(dir, db);
  // sauvegarde des données (les images ne sont que déplacées)
  const backup = path.join(dir, BACKUP);
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(backup, { recursive: true });
    fs.copyFileSync(path.join(dir, projectFile), path.join(backup, projectFile));
    if (fs.existsSync(path.join(dir, 'data'))) copyTree(path.join(dir, 'data'), path.join(backup, 'data'));
  }
  const map = new Map();
  for (const p of plan) {
    map.set(p.from, p.to);
    if (p.key) map.set(p.key[0], p.key[1]);
  }
  ensureDirs(dir);
  for (const p of plan) {
    fs.mkdirSync(path.dirname(path.join(dir, p.to)), { recursive: true });
    fs.renameSync(path.join(dir, p.from), path.join(dir, p.to));
  }
  // planches par défaut (Eliwood, Lyn…) : reprend les couleurs d'équipe réglées et la planche à une seule palette
  if (assetsDir) for (const p of plan.filter(p => p.key)) upgradeFromDefault(dir, p.to, path.join(assetsDir, 'default'));
  // projectiles : nom de fichier seul, à côté de la planche
  for (const p of plan.filter(p => p.projectileOf)) {
    const f = path.join(dir, p.projectileOf);
    const m = readJson(f, null);
    if (m && m.projectiles) { m.projectiles[p.name] = path.posix.basename(p.to); writeJson(f, m); }
  }
  // références : base de données, maps, réglages du projet
  for (const k of dbKeys) {
    const f = path.join(dir, 'data', k + '.json');
    if (fs.existsSync(f)) writeJson(f, rewrite(readJson(f, []), map));
  }
  for (const d of [path.join(dir, 'data', 'maps'), path.join(dir, 'maps')]) {
    if (!fs.existsSync(d)) continue;
    for (const n of fs.readdirSync(d)) if (n.endsWith('.json')) writeJson(path.join(d, n), rewrite(readJson(path.join(d, n), {}), map));
  }
  const campaign = path.join(dir, 'saves', 'campaign.json'); // partie en cours du playtest
  if (fs.existsSync(campaign)) writeJson(campaign, rewrite(readJson(campaign, {}), map));
  writeJson(path.join(dir, projectFile), Object.assign(rewrite(meta, map), { layout: LAYOUT }));
  for (const d of ['img', 'audio']) removeEmpty(path.join(dir, d));
  return { moved: plan.length, backup: BACKUP };
}

module.exports = { ROOT, DIRS, ALL_DIRS, LAYOUT, IMAGE_EXT, AUDIO_EXT, BACKUP, ensureDirs, scanResources, setTeamColors, needsMigration, migrationPlan, migrate, rewrite, walk, safeName };
