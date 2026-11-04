/*
 * Météo : flux déterministe, indépendant du hasard des combats. Neige et brouillard utilisent des textures qui se
 * répètent (img/weather/snow.png, fog.png, tools/build_weather.py) en couches défilantes à vitesses différentes
 * (parallaxe) ; tant qu'elles ne sont pas chargées, le rendu procédural d'origine prend le relais. Sable : procédural.
 */
(function (root) {
  'use strict';
  const mod = (n, m) => ((n % m) + m) % m;
  const noise = n => { const k = Math.sin(n * 127.1 + 311.7) * 43758.5453; return k - Math.floor(k); };
  const clouds = new Map();
  // textures de météo (chargées une fois ; null tant qu'elles ne sont pas prêtes)
  const textures = {};
  function texture(name) {
    if (textures[name] !== undefined) return textures[name] && textures[name].complete && textures[name].naturalWidth ? textures[name] : null;
    if (typeof Image === 'undefined') { textures[name] = null; return null; }
    const img = new Image(); img.src = 'img/weather/' + name + '.png'; textures[name] = img;
    img.onerror = () => { textures[name] = null; };
    return null;
  }
  /** Motif répété décalé de (ox, oy), à l'échelle k, sur tout le rectangle (0, 0, w, h). */
  function tiled(ctx, img, w, h, k, ox, oy) {
    const tw = img.naturalWidth * k, th = img.naturalHeight * k;
    const sx = mod(ox, tw) - tw, sy = mod(oy, th) - th;
    for (let yy = sy; yy < h; yy += th) for (let xx = sx; xx < w; xx += tw) ctx.drawImage(img, xx, yy, tw, th);
  }
  function cloudImage(kind = 'fog') {
    if (clouds.has(kind)) return clouds.get(kind);
    const cloud = document.createElement('canvas'); cloud.width = 128; cloud.height = 64;
    const g = cloud.getContext('2d');
    g.scale(1, .5);
    const gradient = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    const rgb = kind === 'sand' ? '211,172,103' : '223,232,236';
    gradient.addColorStop(0, `rgba(${rgb},.8)`); gradient.addColorStop(.4, `rgba(${rgb},.45)`); gradient.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
    clouds.set(kind, cloud);
    return cloud;
  }
  /** Rect en pixels logiques : l'appelant conserve son transform (DPR) et son alpha. */
  function draw(ctx, value, rect, time) {
    const weather = Weather.normalize(value);
    if (weather.type === 'none' || rect.width <= 0 || rect.height <= 0) return;
    const { x = 0, y = 0, width: w, height: h } = rect;
    const intensity = weather.intensity, dir = weather.direction === 'left' ? -1 : 1;
    const t = (Number.isFinite(time) ? time : 0) / 1000;
    const pixel = Math.max(1.5, Math.min(3, rect.scale || 2));
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
    const alpha = ctx.globalAlpha;
    const snowTex = weather.type === 'snow' && texture('snow'), fogTex = weather.type === 'fog' && texture('fog');
    if (fogTex) {
      // brouillard : voile léger + deux nappes de brume qui dérivent à des vitesses différentes
      ctx.fillStyle = '#d9e3e7'; ctx.globalAlpha = alpha * (.07 + intensity * .06); ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      const k = pixel * 2.2;
      ctx.globalAlpha = Math.min(1, alpha * (.3 + intensity * .17));
      tiled(ctx, fogTex, w, h, k, dir * t * 7, Math.sin(t * .1) * 10);
      ctx.globalAlpha = Math.min(1, alpha * (.2 + intensity * .13));
      tiled(ctx, fogTex, w, h, k * 1.7, dir * t * 13 + 97, t * 2.5 + 41);
      ctx.imageSmoothingEnabled = false;
    } else if (snowTex) {
      // neige : léger voile froid + couches de flocons (proches : plus grandes et rapides), dérive selon le vent
      ctx.fillStyle = '#d8e7f3'; ctx.globalAlpha = alpha * (.02 + intensity * .025); ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      const k = pixel / 2;
      const layers = [[.75 * k, 14, 1, .55], [1 * k, 24, 1.6, .85], [1.5 * k, 38, 2.4, 1]].slice(0, intensity === 1 ? 2 : 3);
      layers.forEach(([scale, fall, drift, a], i) => {
        ctx.globalAlpha = alpha * a * (.55 + intensity * .15);
        tiled(ctx, snowTex, w, h, scale, dir * t * (4 + drift * intensity * 3) + Math.sin(t * .7 + i * 2) * 6 + i * 137, t * fall * (1 + intensity * .25) + i * 89);
      });
    } else if (weather.type === 'fog') {
      ctx.fillStyle = '#d9e3e7'; ctx.globalAlpha = alpha * (.025 + intensity * .035); ctx.fillRect(0, 0, w, h);
      const image = cloudImage(), cw = Math.max(220, Math.min(700, w * .8)), ch = Math.max(100, Math.min(240, h * .45));
      ctx.imageSmoothingEnabled = true;
      for (let i = 0; i < 8 + intensity * 3; i++) {
        const px = mod(noise(i + 1) * (w + cw) + dir * t * (9 + noise(i + 21) * 9), w + cw) - cw;
        const py = noise(i + 50) * (h + ch) - ch + Math.sin(t * .15 + i) * 12;
        ctx.globalAlpha = alpha * (.1 + intensity * .065);
        ctx.drawImage(image, px, py, cw, ch);
      }
    } else {
      const sand = weather.type === 'sand';
      ctx.fillStyle = sand ? '#c49a53' : '#d8e7f3';
      ctx.globalAlpha = alpha * (sand ? .035 + intensity * .05 : .015 + intensity * .02);
      ctx.fillRect(0, 0, w, h);
      if (sand) {
        const image = cloudImage('sand'), cw = Math.max(250, w * .8), ch = Math.max(120, h * .5);
        ctx.imageSmoothingEnabled = true; ctx.globalAlpha = alpha * intensity * .065;
        for (let i = 0; i < 5; i++) ctx.drawImage(image,
          mod(noise(i + 400) * (w + cw) + dir * t * 65, w + cw) - cw, noise(i + 450) * h - ch / 2, cw, ch);
        ctx.imageSmoothingEnabled = false;
      }
      const count = Math.min(480, Math.ceil(w * h / (sand ? 4500 : 5500)) * intensity + 20);
      for (let i = 0; i < count; i++) {
        const speed = .65 + noise(i + 81) * .75;
        const px = mod(noise(i + 1) * (w + 60) + dir * t * (sand ? 150 + intensity * 35 : 18 + intensity * intensity * 9) * speed + (sand ? 0 : Math.sin(t + i) * 8), w + 60) - 30;
        const py = mod(noise(i + 120) * (h + 30) + t * (sand ? 24 : 30 + intensity * 10) * speed, h + 30) - 15;
        ctx.globalAlpha = alpha * (.35 + noise(i + 230) * .55);
        ctx.fillStyle = sand ? (i % 3 ? '#e7c583' : '#a77b42') : (i % 3 ? '#f3f7ff' : '#c8dce8');
        const size = pixel * (sand ? .65 : .9 + noise(i + 310) * 1.1);
        ctx.fillRect(Math.round(px), Math.round(py), sand ? size * (2 + intensity) : size, size);
      }
    }
    ctx.restore();
  }
  /** Textures prêtes (tests, aperçus) : { snow, fog }. */
  const ready = () => ({ snow: !!texture('snow'), fog: !!texture('fog') });
  root.WeatherFX = { draw, ready };
})(self);
