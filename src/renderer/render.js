/* Rendu des maps (partagé éditeur / playtest). */
(function (root) {
  'use strict';
  const FLIP_H = 0x80000000, FLIP_V = 0x40000000, FLIP_D = 0x20000000;
  const cache = new Map();

  function imageUrl(baseUrl, rel) {
    if (/^(file|https?|data):/.test(rel)) return rel;
    return baseUrl + rel.split('/').map(encodeURIComponent).join('/');
  }

  function loadImage(baseUrl, rel) {
    const url = imageUrl(baseUrl, rel);
    if (cache.has(url)) return cache.get(url);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url + (url.startsWith('file:') ? '?v=' + Date.now() : '');
    });
    p.then(img => { p.img = img; });
    cache.set(url, p);
    return p;
  }
  function forget(baseUrl, rel) { cache.delete(imageUrl(baseUrl, rel)); }
  function readyImage(baseUrl, rel) { const p = cache.get(imageUrl(baseUrl, rel)); return p ? p.img : null; }

  async function preloadTilesets(baseUrl, tilesets) {
    await Promise.all((tilesets || []).map(ts => loadImage(baseUrl, ts.image)));
  }

  function tileSource(ts, local) {
    const cols = ts.columns || 1;
    const m = ts.margin || 0, s = ts.spacing || 0;
    return { sx: m + (local % cols) * (ts.tileWidth + s), sy: m + Math.floor(local / cols) * (ts.tileHeight + s) };
  }

  function drawTile(ctx, img, ts, local, dx, dy, dw, dh, gid) {
    const { sx, sy } = tileSource(ts, local);
    const h = (gid >>> 0) & FLIP_H, v = (gid >>> 0) & FLIP_V, d = (gid >>> 0) & FLIP_D;
    if (!h && !v && !d) { ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, dx, dy, dw, dh); return; }
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(h ? -1 : 1, v ? -1 : 1);
    if (d) ctx.transform(0, 1, 1, 0, 0, 0);
    ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  /** Index tileset rapide pour une map : tableau trié par firstgid décroissant */
  function tilesetIndex(map, tilesets) {
    return (map.tilesets || []).map(r => ({ firstgid: r.firstgid, ts: tilesets.find(t => t.id === r.tilesetId) }))
      .filter(r => r.ts).sort((a, b) => b.firstgid - a.firstgid);
  }

  /** Facteur d'agrandissement d'un tileset sur une map : entier si ses tuiles sont plus petites que la grille. */
  function upscale(ts, tw) {
    return ts.tileWidth < tw && tw % ts.tileWidth === 0 ? tw / ts.tileWidth : 1;
  }

  /**
   * opts : { scale, baseUrl, tilesets, onlyLayer, dimOthers (index du calque actif), area {x0,y0,x1,y1} }
   */
  function drawMap(ctx, map, opts) {
    const scale = opts.scale || 1;
    const tw = map.tileWidth, th = map.tileHeight;
    const idx = tilesetIndex(map, opts.tilesets);
    const a = opts.area || { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 };
    map.layers.forEach((layer, li) => {
      if (!layer.visible) return;
      const dim = opts.dimOthers !== undefined && opts.dimOthers !== null && li !== opts.dimOthers;
      ctx.globalAlpha = dim ? 0.45 : 1;
      for (let y = a.y0; y <= a.y1; y++) {
        for (let x = a.x0; x <= a.x1; x++) {
          const gid = layer.data[y * map.width + x];
          if (!gid) continue;
          const raw = (gid >>> 0) & 0x0FFFFFFF;
          const ref = idx.find(r => r.firstgid <= raw);
          if (!ref) continue;
          const local = raw - ref.firstgid;
          const img = readyImage(opts.baseUrl, ref.ts.image);
          if (!img) continue;
          // tuiles plus petites que la grille (ex. 16 px sur une map en 32 px) : agrandies d'un facteur entier,
          // comme les sprites de map (base 16 px) ; plus grandes : dépassent vers le haut, comme dans Tiled
          const f = upscale(ref.ts, tw);
          const dw = ref.ts.tileWidth * f * scale, dh = ref.ts.tileHeight * f * scale;
          drawTile(ctx, img, ref.ts, local, x * tw * scale, (y * th + th - ref.ts.tileHeight * f) * scale, dw, dh, gid);
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  root.Render = { FLIP_H, FLIP_V, FLIP_D, upscale, loadImage, readyImage, forget, preloadTilesets, drawTile, drawMap, tileSource, imageUrl };
})(self);
