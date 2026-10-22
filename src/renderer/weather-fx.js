/* Météo procédurale : flux déterministe, indépendant du hasard des combats et sans images à importer. */
(function (root) {
  'use strict';
  const mod = (n, m) => ((n % m) + m) % m;
  const noise = n => { const k = Math.sin(n * 127.1 + 311.7) * 43758.5453; return k - Math.floor(k); };
  const clouds = new Map();
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
    if (weather.type === 'fog') {
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
  root.WeatherFX = { draw };
})(self);
