/* Aspect de secours pour les villages sans tuiles de remplacement personnalisées. */
(function (root) {
  'use strict';
  function draw(ctx, map, ch, state, scale = 1) {
    const tw = map.tileWidth * scale, th = map.tileHeight * scale;
    ctx.save();
    for (const v of Villages.list(ch)) {
      const kind = Villages.status(ch, v, state);
      if (kind === 'open' || v.appearance?.[kind]) continue;
      const x = v.x * tw, y = v.y * th;
      if (kind === 'visited') {
        ctx.fillStyle = '#49352a'; ctx.fillRect(x + tw * .4, y + th * .6, tw * .22, th * .32);
        ctx.fillStyle = '#b18a56';
        for (const row of [.66, .78, .89]) ctx.fillRect(x + tw * .4, y + th * row, tw * .22, Math.max(1, scale));
      } else {
        ctx.fillStyle = '#514a43'; ctx.fillRect(x + tw * .12, y + th * .65, tw * .75, th * .25);
        ctx.fillStyle = '#8a8073';
        for (const p of [[.12, .6, .2, .18], [.4, .5, .23, .17], [.62, .7, .25, .2], [.29, .77, .2, .13]])
          ctx.fillRect(x + tw * p[0], y + th * p[1], tw * p[2], th * p[3]);
        ctx.strokeStyle = '#382f29'; ctx.lineWidth = Math.max(1, tw / 10);
        ctx.beginPath(); ctx.moveTo(x + tw * .27, y + th * .8); ctx.lineTo(x + tw * .4, y + th * .3);
        ctx.moveTo(x + tw * .4, y + th * .7); ctx.lineTo(x + tw * .78, y + th * .42); ctx.stroke();
      }
    }
    ctx.restore();
  }
  root.VillageVisuals = { draw };
})(self);
