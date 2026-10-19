/*
 * Import de maps Tiled (.tmx XML et .tmj/.json JSON) vers le format interne.
 * Gère : tilesets internes ou externes (.tsx / .tsj), encodages CSV / base64 / XML,
 * compressions zlib / gzip (/ zstd si dispo), maps infinies (chunks), groupes de calques,
 * calques d'objets (placements d'unités), propriété de tile "terrain".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

// ---------- XML -> arbre simple ----------
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, parseAttributeValue: false, trimValues: true });

function toTree(arr) {
  const out = [];
  for (const n of arr || []) {
    const tag = Object.keys(n).find(k => k !== ':@');
    if (!tag) continue;
    if (tag === '#text') { out.push({ tag: '#text', text: String(n['#text']) }); continue; }
    out.push({ tag, attrs: n[':@'] || {}, children: toTree(n[tag]) });
  }
  return out;
}
function parseXml(text) { return toTree(parser.parse(text)); }
const kids = (node, tag) => (node.children || []).filter(c => c.tag === tag);
const kid = (node, tag) => kids(node, tag)[0] || null;
const textOf = node => (node.children || []).filter(c => c.tag === '#text').map(c => c.text).join('');
const num = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v));

function xmlProperties(node) {
  const props = kid(node, 'properties');
  if (!props) return [];
  return kids(props, 'property').map(p => ({
    name: p.attrs.name, type: p.attrs.type || 'string',
    value: p.attrs.value !== undefined ? p.attrs.value : textOf(p)
  }));
}

// ---------- normalisation TMX -> structure type TMJ ----------
function xmlTileset(node) {
  const a = node.attrs;
  const img = kid(node, 'image');
  return {
    firstgid: num(a.firstgid, undefined), source: a.source, name: a.name,
    tilewidth: num(a.tilewidth), tileheight: num(a.tileheight), tilecount: num(a.tilecount, 0),
    columns: num(a.columns, 0), margin: num(a.margin, 0), spacing: num(a.spacing, 0),
    image: img ? img.attrs.source : undefined, imagewidth: img ? num(img.attrs.width) : undefined,
    imageheight: img ? num(img.attrs.height) : undefined,
    tiles: kids(node, 'tile').map(t => ({ id: num(t.attrs.id), type: t.attrs.class || t.attrs.type, properties: xmlProperties(t), hasImage: !!kid(t, 'image') }))
  };
}

function xmlData(dataNode) {
  if (!dataNode) return { data: [] };
  const enc = dataNode.attrs.encoding, comp = dataNode.attrs.compression;
  const chunks = kids(dataNode, 'chunk');
  const decodeBody = (node) => {
    if (enc === 'csv' || enc === 'base64') return { raw: textOf(node), encoding: enc, compression: comp };
    return { raw: kids(node, 'tile').map(t => num(t.attrs.gid, 0)), encoding: 'xml' };
  };
  if (chunks.length) {
    return {
      chunks: chunks.map(c => Object.assign({ x: num(c.attrs.x), y: num(c.attrs.y), width: num(c.attrs.width), height: num(c.attrs.height) }, decodeBody(c)))
    };
  }
  return decodeBody(dataNode);
}

function xmlLayers(parent) {
  const out = [];
  for (const c of parent.children || []) {
    const a = c.attrs || {};
    const common = { name: a.name || '', visible: a.visible !== '0', opacity: num(a.opacity, 1), properties: xmlProperties(c) };
    if (c.tag === 'layer') {
      const d = xmlData(kid(c, 'data'));
      out.push(Object.assign(common, { type: 'tilelayer', width: num(a.width), height: num(a.height), x: num(a.x, 0), y: num(a.y, 0) }, d));
    } else if (c.tag === 'objectgroup') {
      out.push(Object.assign(common, {
        type: 'objectgroup',
        objects: kids(c, 'object').map(o => ({
          id: num(o.attrs.id), name: o.attrs.name || '', type: o.attrs.class || o.attrs.type || '',
          x: num(o.attrs.x, 0), y: num(o.attrs.y, 0), width: num(o.attrs.width, 0), height: num(o.attrs.height, 0),
          gid: o.attrs.gid !== undefined ? num(o.attrs.gid) : undefined, point: !!kid(o, 'point'),
          properties: xmlProperties(o)
        }))
      }));
    } else if (c.tag === 'group') {
      out.push(Object.assign(common, { type: 'group', layers: xmlLayers(c) }));
    } else if (c.tag === 'imagelayer') {
      out.push(Object.assign(common, { type: 'imagelayer' }));
    }
  }
  return out;
}

function tmxToJson(text) {
  const tree = parseXml(text);
  const mapNode = tree.find(n => n.tag === 'map');
  if (!mapNode) throw new Error("Fichier TMX invalide : balise <map> introuvable.");
  const a = mapNode.attrs;
  return {
    orientation: a.orientation, renderorder: a.renderorder, infinite: a.infinite === '1',
    width: num(a.width), height: num(a.height), tilewidth: num(a.tilewidth), tileheight: num(a.tileheight),
    tilesets: kids(mapNode, 'tileset').map(xmlTileset),
    layers: xmlLayers(mapNode),
    properties: xmlProperties(mapNode)
  };
}

// ---------- décodage des données de calque ----------
function decodeGids(body, warnings) {
  if (Array.isArray(body.raw)) return body.raw.map(Number);
  if (body.encoding === 'csv') return String(body.raw).split(/[\s,]+/).filter(s => s !== '').map(Number);
  if (body.encoding === 'base64') {
    let buf = Buffer.from(String(body.raw).trim(), 'base64');
    if (body.compression === 'zlib') buf = zlib.inflateSync(buf);
    else if (body.compression === 'gzip') buf = zlib.gunzipSync(buf);
    else if (body.compression === 'zstd') {
      if (typeof zlib.zstdDecompressSync === 'function') buf = zlib.zstdDecompressSync(buf);
      else throw new Error("Compression zstd non prise en charge par cette version. Dans Tiled, choisis « Base64 (zlib) » ou « CSV » dans les propriétés de la map.");
    } else if (body.compression) warnings.push('Compression inconnue : ' + body.compression);
    const out = new Array(buf.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = buf.readUInt32LE(i * 4);
    return out;
  }
  return [];
}

function jsonLayerBody(layer) {
  // TMJ : data = tableau ou chaîne base64
  if (layer.chunks) return { chunks: layer.chunks.map(c => Object.assign({}, c, { raw: c.data, encoding: layer.encoding || (Array.isArray(c.data) ? 'json' : 'base64'), compression: layer.compression })) };
  return { raw: layer.data, encoding: layer.encoding || (Array.isArray(layer.data) ? 'json' : 'base64'), compression: layer.compression };
}

function flattenLayers(layers, out, prefix, parentVisible) {
  for (const l of layers || []) {
    const visible = parentVisible && l.visible !== false;
    if (l.type === 'group') flattenLayers(l.layers, out, prefix + (l.name ? l.name + '/' : ''), visible);
    else out.push(Object.assign({}, l, { name: prefix + (l.name || ''), visible }));
  }
  return out;
}

// ---------- tilesets ----------
function loadExternalTileset(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\.(tsj|json)$/i.test(file) || text.trim().startsWith('{')) {
    const j = JSON.parse(text);
    return normalizeJsonTileset(j);
  }
  const tree = parseXml(text);
  const node = tree.find(n => n.tag === 'tileset');
  if (!node) throw new Error('Tileset externe invalide : ' + path.basename(file));
  return xmlTileset(node);
}

function normalizeJsonTileset(j) {
  let tiles = j.tiles || [];
  if (!Array.isArray(tiles)) tiles = Object.keys(tiles).map(id => Object.assign({ id: Number(id) }, tiles[id]));
  if (j.tileproperties) {
    for (const id of Object.keys(j.tileproperties)) {
      const props = Object.entries(j.tileproperties[id]).map(([name, value]) => ({ name, value }));
      tiles.push({ id: Number(id), properties: props });
    }
  }
  return {
    firstgid: j.firstgid, source: j.source, name: j.name,
    tilewidth: j.tilewidth, tileheight: j.tileheight, tilecount: j.tilecount || 0, columns: j.columns || 0,
    margin: j.margin || 0, spacing: j.spacing || 0, image: j.image, imagewidth: j.imagewidth, imageheight: j.imageheight,
    tiles: tiles.map(t => ({ id: t.id, type: t.class || t.type, properties: Array.isArray(t.properties) ? t.properties : [], hasImage: !!t.image }))
  };
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function matchTerrain(value, terrains) {
  const v = norm(value);
  if (!v) return null;
  const t = (terrains || []).find(t => norm(t.id) === v || norm(t.name) === v);
  return t ? t.id : null;
}

function sameFile(a, b) {
  try {
    const sa = fs.statSync(a), sb = fs.statSync(b);
    if (sa.size !== sb.size) return false;
    const h = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    return h(a) === h(b);
  } catch (e) { return false; }
}

function copyImage(src, projectDir) {
  const destDir = path.join(projectDir, 'ressources', 'tilesets');
  fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(src);
  const base = path.basename(src, ext).replace(/[^\w\-]+/g, '_') || 'tileset';
  let name = base + ext, i = 1;
  while (fs.existsSync(path.join(destDir, name))) {
    if (sameFile(src, path.join(destDir, name))) return 'ressources/tilesets/' + name;
    name = base + '_' + (i++) + ext;
  }
  fs.copyFileSync(src, path.join(destDir, name));
  return 'ressources/tilesets/' + name;
}

// ---------- import principal ----------
/**
 * @param {string} file chemin .tmx / .tmj / .json
 * @param {object} opts { projectDir, terrains, copyImages=true }
 */
function importTiled(file, opts) {
  opts = opts || {};
  const warnings = [];
  const baseDir = path.dirname(file);
  const text = fs.readFileSync(file, 'utf8');
  const isXml = /\.tmx$/i.test(file) || text.trim().startsWith('<');
  const tm = isXml ? tmxToJson(text) : JSON.parse(text);

  if (tm.orientation && tm.orientation !== 'orthogonal') warnings.push(`Orientation « ${tm.orientation} » non gérée : la map sera traitée comme orthogonale.`);

  // Tilesets
  const tilesets = [];
  const refs = [];
  for (const raw of tm.tilesets || []) {
    let ts = isXml ? raw : normalizeJsonTileset(raw);
    let tsDir = baseDir;
    if (ts.source) {
      const srcFile = path.resolve(baseDir, ts.source);
      if (!fs.existsSync(srcFile)) { warnings.push('Tileset externe introuvable : ' + ts.source); continue; }
      const firstgid = ts.firstgid;
      ts = loadExternalTileset(srcFile);
      ts.firstgid = firstgid;
      tsDir = path.dirname(srcFile);
    }
    if (!ts.image) {
      warnings.push(`Tileset « ${ts.name} » ignoré : les collections d'images ne sont pas gérées (utilise un tileset basé sur une seule image).`);
      continue;
    }
    const imgPath = path.resolve(tsDir, ts.image);
    if (!fs.existsSync(imgPath)) { warnings.push('Image de tileset introuvable : ' + ts.image); continue; }
    const rel = opts.projectDir && opts.copyImages !== false ? copyImage(imgPath, opts.projectDir) : imgPath;
    const tw = ts.tilewidth || tm.tilewidth, th = ts.tileheight || tm.tileheight;
    const margin = ts.margin || 0, spacing = ts.spacing || 0;
    let columns = ts.columns;
    if (!columns && ts.imagewidth) columns = Math.floor((ts.imagewidth - 2 * margin + spacing) / (tw + spacing));
    let tileCount = ts.tilecount;
    if (!tileCount && ts.imageheight && columns) tileCount = columns * Math.floor((ts.imageheight - 2 * margin + spacing) / (th + spacing));

    const tileTerrain = {};
    const unknown = new Set();
    for (const t of ts.tiles || []) {
      const prop = (t.properties || []).find(p => ['terrain', 'terrain_id', 'terrainid'].includes(norm(p.name)));
      const value = prop ? prop.value : t.type;
      if (!value) continue;
      const id = matchTerrain(value, opts.terrains);
      if (id) tileTerrain[t.id] = id; else if (prop) unknown.add(String(value));
    }
    if (unknown.size) warnings.push(`Tileset « ${ts.name} » : terrains inconnus (${[...unknown].join(', ')}). Crée-les dans la base de données ou corrige la propriété « terrain » dans Tiled.`);

    const id = 'ts_' + crypto.createHash('sha1').update(rel + '|' + tw + 'x' + th).digest('hex').slice(0, 8);
    tilesets.push({
      id, name: ts.name || path.basename(ts.image), image: rel, tileWidth: tw, tileHeight: th,
      columns, tileCount, margin, spacing, imageWidth: ts.imagewidth, imageHeight: ts.imageheight, tileTerrain
    });
    refs.push({ tilesetId: id, firstgid: ts.firstgid || 1 });
  }

  // Calques
  const flat = flattenLayers(tm.layers, [], '', true);
  const tileLayers = flat.filter(l => l.type === 'tilelayer');
  let width = tm.width, height = tm.height, offX = 0, offY = 0;

  // Maps infinies : on calcule l'emprise de tous les chunks
  const bodies = tileLayers.map(l => isXml ? l : Object.assign({}, l, jsonLayerBody(l)));
  if (tm.infinite) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bodies) for (const c of b.chunks || []) {
      minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width); maxY = Math.max(maxY, c.y + c.height);
    }
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
    offX = minX; offY = minY; width = maxX - minX; height = maxY - minY;
    warnings.push(`Map infinie convertie en ${width}×${height} cases.`);
  }

  const layers = [];
  bodies.forEach((b, i) => {
    const data = new Array(width * height).fill(0);
    if (b.chunks) {
      for (const c of b.chunks) {
        const gids = decodeGids(c, warnings);
        for (let cy = 0; cy < c.height; cy++) for (let cx = 0; cx < c.width; cx++) {
          const x = c.x + cx - offX, y = c.y + cy - offY;
          if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = gids[cy * c.width + cx] || 0;
        }
      }
    } else {
      const gids = decodeGids(b, warnings);
      const lw = b.width || width, lx = b.x || 0, ly = b.y || 0;
      for (let k = 0; k < gids.length; k++) {
        const x = (k % lw) + lx, y = Math.floor(k / lw) + ly;
        if (x < width && y < height) data[y * width + x] = gids[k] || 0;
      }
    }
    layers.push({ id: 'l' + (i + 1), name: b.name || ('Calque ' + (i + 1)), visible: b.visible !== false, data });
  });

  // Objets -> marqueurs (placements, cases à prendre…)
  const objects = [];
  const tw = tm.tilewidth, th = tm.tileheight;
  for (const l of flat.filter(l => l.type === 'objectgroup')) {
    for (const o of l.objects || []) {
      const props = {};
      for (const p of o.properties || []) props[p.name] = p.value;
      const h = o.gid ? (o.height || th) : (o.height || 0);
      const top = o.gid ? o.y - h : o.y;
      const cx = o.x + (o.width || (o.gid ? tw : 0)) / 2, cy = top + h / 2;
      objects.push({
        name: o.name || '', type: (o.type || o.class || '').toString(), layer: l.name,
        x: Math.floor(cx / tw) - offX, y: Math.floor(cy / th) - offY,
        properties: props
      });
    }
  }
  if (flat.some(l => l.type === 'imagelayer')) warnings.push("Les calques d'image ont été ignorés.");
  if (!layers.length) warnings.push("Aucun calque de tiles trouvé dans la map.");

  // Gids pointant vers un tileset ignoré
  const ranges = refs.map(r => {
    const ts = tilesets.find(t => t.id === r.tilesetId);
    return [r.firstgid, r.firstgid + (ts.tileCount || 0)];
  });
  let lost = 0;
  for (const l of layers) for (let k = 0; k < l.data.length; k++) {
    const g = l.data[k] & 0x0FFFFFFF;
    if (g && !ranges.some(([a, b]) => g >= a && g < b)) { l.data[k] = 0; lost++; }
  }
  if (lost) warnings.push(`${lost} tiles ignorés (tileset non importé).`);

  const map = {
    name: path.basename(file).replace(/\.(tmx|tmj|json)$/i, ''),
    width, height, tileWidth: tm.tilewidth, tileHeight: tm.tileheight,
    tilesets: refs, layers, terrain: new Array(width * height).fill(''), objects,
    source: { file: path.basename(file), importedAt: new Date().toISOString() }
  };
  return { map, tilesets, warnings };
}

module.exports = { importTiled, tmxToJson, decodeGids, matchTerrain };
