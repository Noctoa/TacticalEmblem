/*
 * Scène de combat animée, façon Fire Emblem GBA.
 * L'issue est calculée avant (Rules.resolveCombat) : la scène ne fait que la mettre en scène.
 * Le camp du joueur est à droite, l'ennemi à gauche.
 */
(function (root) {
  'use strict';
  const { h } = UI;

  let active = null;

  function wait(ms, sc) {
    return new Promise((resolve) => {
      if (sc.skip) return resolve();
      const end = performance.now() + ms / sc.speed;
      const tick = () => {
        if (sc.skip || performance.now() >= end) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function chooseAnim(meta, crit, dist, weaponType) {
    if (!meta) return null;
    const A = meta.anims;
    const pick = (...names) => names.find(n => A[n]);
    if (weaponType === 'bow') return pick(crit && 'bowCritical', 'bow', crit && 'rangedCritical', 'ranged', crit && 'critical', 'attack');
    if (dist >= 2) return pick(crit && 'rangedCritical', 'ranged', crit && 'critical', 'attack');
    return pick(crit && 'critical', 'attack');
  }

  // ------------------------------------------------------------------
  function makeActor(opts, unit, side) {
    const meta = opts.battlerOf(unit);
    const raw = meta ? Render.readyImage(opts.baseUrl, meta.image) : null;
    // couleurs : origine ou équipe (bleu / rouge / vert) selon le réglage de l'unité
    const img = raw && opts.paletteOf ? Sprites.tinted(raw, meta, opts.paletteOf(unit)) : raw;
    const want = side === 'R' ? 'left' : 'right';
    // pose de garde : celle de l'arc si l'unité a un arc en main (Lyn), sinon la garde normale
    const w = opts.weaponOf(unit);
    const stance = !meta ? 0 : (w && w.type === 'bow' && meta.anims.bow ? meta.anims.bow.frames[0] : meta.anims.stance.frames[0]);
    // sans animation de combat (un partenaire, par exemple) : son sprite de map, agrandi
    let mapSp = null;
    if (!meta && opts.mapSpriteOf) {
      const sp = opts.mapSpriteOf(unit);
      if (sp) mapSp = { meta: sp.meta, img: sp.img, palette: opts.paletteOf ? opts.paletteOf(unit) : 'original' };
    }
    return {
      unit, side, meta, img, mapSp, flip: meta ? meta.facing !== want : false, stance,
      frame: stance, anim: null,
      travel: 0, travelTarget: 0, dodge: 0, dodgeTarget: 0, flash: 0, alpha: 1, hp: unit.hp, hpShown: unit.hp
    };
  }

  /**
   * opts : { baseUrl, battlerOf(u), att, def, hp0: {[uid]: hp}, strikes, forecast, distance,
   *          weaponOf(u) -> arme, terrainOf(u) -> terrain, background (canvas), projectileImg(meta, name),
   *          paletteOf(u) -> 'original' | 'blue' | 'red' | 'green',
   *          partner (attaque duo), helpers: [unité] (partenaires des attaques spéciales), mapSpriteOf(u) -> { meta, img } }
   */
  async function play(opts) {
    const left = opts.att.team === 'enemy' ? opts.att : opts.def;
    const right = left === opts.att ? opts.def : opts.att;
    const sc = {
      opts, speed: 1, skip: false, floats: [], shake: 0, whiteout: 0, projectile: null, fade: 0,
      L: makeActor(opts, left, 'L'), R: makeActor(opts, right, 'R'), ranged: opts.distance >= 2
    };
    sc.L.hp = sc.L.hpShown = opts.hp0[left.uid];
    sc.R.hp = sc.R.hpShown = opts.hp0[right.uid];
    sc.byUid = { [left.uid]: sc.L, [right.uid]: sc.R };
    // partenaires (attaque duo, attaque spéciale) : entrent derrière l'attaquant le temps de l'attaque
    sc.helpers = [];
    for (const u of [opts.partner, ...(opts.helpers || [])]) {
      if (!u || sc.byUid[u.uid]) continue;
      const side = sc.byUid[opts.att.uid].side;
      const a = makeActor(opts, u, side);
      a.hp = a.hpShown = opts.hp0[u.uid] !== undefined ? opts.hp0[u.uid] : u.hp;
      a.alpha = 0; a.shift = 1; a.helper = true;
      sc.byUid[u.uid] = a; sc.helpers.push(a);
    }
    sc.P = sc.helpers[0] || null;
    active = sc;
    buildDom(sc);
    const raf = () => { if (!sc.closed) { draw(sc); requestAnimationFrame(raf); } };
    requestAnimationFrame(raf);
    // fondu d'entrée
    for (let i = 0; i <= 10; i++) { sc.fade = i / 10; await wait(22, sc); }
    sc.fade = 1;
    await wait(250, sc);
    const strikes = opts.strikes;
    for (let k = 0; k < strikes.length; k++) {
      const s = strikes[k];
      const atk = sc.byUid[s.by], def = sc.byUid[s.target];
      if (!atk || !def) break;
      if (s.overkillStrike) { // overkill : la cible est vaincue, l'attaquant termine ses coups
        if (atk.hp <= 0) break;
        await strike(sc, atk, def, s);
        await wait(180, sc);
        continue;
      }
      if (atk.hp <= 0 || def.hp <= 0) break;
      // attaque spéciale : le partenaire apparaît derrière l'attaquant et frappe avec lui
      const mate = s.special && s.partner && sc.byUid[s.partner] && sc.byUid[s.partner].helper ? sc.byUid[s.partner] : null;
      if (atk.helper) {
        showBanner(sc, s.dual || 'Attaque duo');
        setSide(atk, sc.byUid[s.target] === sc.L ? 'R' : 'L');
        await fadeIn(sc, atk);
      } else if (s.special) {
        showBanner(sc, s.special);
        if (mate) { setSide(mate, atk.side); await fadeIn(sc, mate); }
      }
      if (s.skills && s.skills.length) {
        showBanner(sc, s.skills.map(skill => `${skill.icon} ${skill.name}`).join(' · '));
        await wait(350, sc);
      }
      if (mate) await Promise.all([strike(sc, atk, def, s), assist(sc, mate, def, s)]);
      else await strike(sc, atk, def, s);
      if (atk.helper) await fadeOut(sc, atk);
      if (mate) await fadeOut(sc, mate);
      await wait(180, sc);
      const overkillNext = strikes[k + 1] && strikes[k + 1].overkillStrike;
      if (def.hp <= 0) { if (overkillNext) { def.ko = true; continue; } await death(sc, def); break; }
      if (atk.hp <= 0) { await death(sc, atk); break; }
    }
    for (const a of [sc.L, sc.R]) if (a.ko) { a.ko = false; await death(sc, a); } // vaincus pendant l'overkill
    if (opts.overkill && opts.overkill.doubled) {
      showBanner(sc, `OVERKILL ×2 !  ${opts.overkill.total} / ${opts.overkill.max}` + (opts.overkill.bonus ? `  ·  +${opts.overkill.bonus} EXP` : ''), 'overkill');
      await wait(900, sc);
    }
    await wait(450, sc);
    for (let i = 10; i >= 0; i--) { sc.fade = i / 10; await wait(20, sc); }
    sc.closed = true;
    sc.dom.remove();
    active = null;
  }

  // ------------------------------------------------------------------
  // Partenaires
  // ------------------------------------------------------------------
  function setSide(a, side) {
    if (a.side === side) return;
    a.side = side;
    if (a.meta) a.flip = a.meta.facing !== (side === 'R' ? 'left' : 'right');
  }
  async function fadeIn(sc, a) { a.travel = a.travelTarget = 0; for (let i = 1; i <= 8; i++) { a.alpha = i / 8; await wait(30, sc); } a.alpha = 1; }
  async function fadeOut(sc, a) { for (let i = 7; i >= 0; i--) { a.alpha = i / 8; await wait(30, sc); } a.alpha = 0; a.frame = a.stance; a.travel = a.travelTarget = 0; }
  /**
   * Le partenaire d'une attaque spéciale joue son attaque en même temps que l'attaquant, un peu en retrait
   * (il ne touche pas lui-même : les dégâts sont ceux du coup de l'attaquant).
   */
  async function assist(sc, a, def, s) {
    const weapon = sc.opts.weaponOf(a.unit);
    const name = chooseAnim(a.meta, false, sc.opts.distance, weapon && weapon.type);
    const A = a.meta && a.meta.anims[name];
    if (!A) { // sprite de map : un bond vers l'adversaire
      a.travelTarget = 0.6; await wait(260, sc); a.travelTarget = 0; await wait(200, sc); return;
    }
    await wait(80, sc); // léger décalage : les deux coups ne se superposent pas exactement
    const useTravel = !sc.ranged && A.approach;
    for (let i = 0; i < A.frames.length; i++) {
      a.frame = A.frames[i];
      if (useTravel) {
        const [a0, a1] = A.approach;
        const reach = 0.75 * (A.reach !== undefined ? A.reach : 1);
        if (i >= a0 && i <= a1) a.travelTarget = reach * (i - a0 + 1) / (a1 - a0 + 1);
        if (A.retreat) { const [r0, r1] = A.retreat; if (i >= r0 && i <= r1) a.travelTarget = reach * (1 - (i - r0 + 1) / (r1 - r0 + 1)); if (i > r1) a.travelTarget = 0; }
      }
      await wait((A.durations && A.durations[i]) || 55, sc);
    }
    a.travelTarget = 0; a.frame = a.stance;
  }

  function skip() { if (active) { active.skip = true; } }
  function setFast(on) { if (active) active.speed = on ? 2.5 : 1; }
  function isActive() { return !!active; }

  // ------------------------------------------------------------------
  function sideWeapon(sc, actor) {
    const w = sc.opts.weaponOf(actor.unit);
    return w ? w.name : '—';
  }

  function buildDom(sc) {
    const fc = sc.opts.forecast;
    const statsOf = (actor) => (actor.unit === sc.opts.att ? fc.att : fc.def);
    const panel = (actor) => {
      const s = statsOf(actor);
      const hpBar = h('div', { class: 'b-hpbar' });
      const hpNum = h('b', { class: 'b-hpnum' }, String(actor.hpShown));
      actor.hpEls = { hpBar, hpNum };
      return h('div', { class: 'b-panel ' + (actor.side === 'L' ? 'enemy' : actor.unit.team === 'ally' ? 'ally' : 'player') },
        h('div', { class: 'b-top' }, h('span', { class: 'b-name' }, actor.unit.name), h('span', { class: 'b-weap' }, sideWeapon(sc, actor))),
        h('div', { class: 'b-stats' },
          h('div', {}, h('span', {}, 'PRÉC'), h('b', {}, s ? String(s.hit) : '--')),
          h('div', {}, h('span', {}, 'DGT'), h('b', {}, s ? String(s.dmg) + (s.count > 1 ? ' ×' + s.count : '') : '--')),
          h('div', {}, h('span', {}, 'CRIT'), h('b', {}, s ? String(s.crit) : '--'))),
        h('div', { class: 'b-hp' }, hpNum, hpBar));
    };
    const cv = h('canvas', { class: 'b-canvas' });
    sc.canvas = cv; sc.ctx = cv.getContext('2d');
    sc.dom = h('div', { id: 'battle' }, cv,
      h('div', { class: 'b-hud' }, panel(sc.L), panel(sc.R)),
      h('div', { class: 'b-hint' }, 'Clic / Z maintenu : accélérer · X / clic droit : passer'));
    document.body.append(sc.dom);
    updateHp(sc.L); updateHp(sc.R);
  }

  function showBanner(sc, text, kind) { sc.banner = { text, kind, t0: performance.now() }; }

  function updateHp(actor) {
    if (!actor.hpEls) return;
    const { hpBar, hpNum } = actor.hpEls;
    const max = actor.unit.stats.hp;
    const over = Math.round(actor.hpShown) <= 0 ? (actor.over || 0) : 0;
    hpNum.textContent = over ? '−' + over : String(Math.max(0, Math.round(actor.hpShown)));
    hpNum.classList.toggle('over', !!over);
    hpBar.innerHTML = '';
    // barre segmentée, une case par PV (comme sur GBA) ; à 0 PV, l'overkill la remplit en rouge
    for (let i = 0; i < max; i++) hpBar.append(h('i', { class: i < Math.round(actor.hpShown) ? 'on' : i < over ? 'over' : '' }));
    hpBar.classList.toggle('over-full', over >= max);
  }

  // ------------------------------------------------------------------
  function layout(sc) {
    const w = sc.canvas.clientWidth, hh = sc.canvas.clientHeight;
    const S = Math.max(2, Math.min(4, Math.floor(Math.min(w / 250, (hh - 150) / 140))));
    const ground = Math.round(hh * 0.66);
    const sep = (sc.ranged ? 70 : 46) * S;
    return { w, h: hh, S, ground, homeL: w / 2 - sep, homeR: w / 2 + sep, meet: 30 * S };
  }

  function actorX(sc, a, L) {
    const home = (a.side === 'L' ? L.homeL : L.homeR) + (a.shift || 0) * (a.side === 'L' ? -1 : 1) * 26 * L.S; // partenaire : un peu en retrait
    const other = a.side === 'L' ? L.homeR : L.homeL;
    const dir = a.side === 'L' ? 1 : -1;
    const target = other - dir * L.meet;
    return home + (target - home) * a.travel - dir * a.dodge * 16 * L.S;
  }

  function draw(sc) {
    const cv = sc.canvas, dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const g = sc.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    const L = layout(sc);
    g.globalAlpha = 1;
    g.clearRect(0, 0, w, hh);
    g.globalAlpha = sc.fade;
    // fond : la map floutée et assombrie
    if (sc.opts.background) {
      g.save(); g.filter = 'blur(6px) brightness(0.45) saturate(1.1)';
      const bg = sc.opts.background; const s = Math.max(w / bg.width, hh / bg.height) * 1.15;
      g.drawImage(bg, (w - bg.width * s) / 2, (hh - bg.height * s) / 2, bg.width * s, bg.height * s);
      g.restore();
    } else { g.fillStyle = '#10131c'; g.fillRect(0, 0, w, hh); }
    const sky = g.createLinearGradient(0, 0, 0, hh);
    sky.addColorStop(0, 'rgba(10,14,30,.55)'); sky.addColorStop(0.6, 'rgba(10,14,30,.15)'); sky.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = sky; g.fillRect(0, 0, w, hh);
    // plateformes (couleur du terrain de chaque combattant)
    const plat = (cx, terrain) => {
      const col = (terrain && terrain.color) || '#7a8a5a';
      const pw = 92 * L.S, ph = 10 * L.S;
      const gr = g.createLinearGradient(0, L.ground - ph * 0.2, 0, L.ground + ph);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,.85)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(cx, L.ground + ph * 0.25, pw / 2, ph, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; g.stroke();
    };
    let sx = 0, sy = 0;
    if (sc.shake > 0.3) { sx = (Math.random() - 0.5) * sc.shake; sy = (Math.random() - 0.5) * sc.shake * 0.6; sc.shake *= 0.88; } else sc.shake = 0;
    g.save(); g.translate(sx, sy);
    plat(L.homeL, sc.opts.terrainOf(sc.L.unit));
    plat(L.homeR, sc.opts.terrainOf(sc.R.unit));
    // déplacement lissé
    for (const a of [sc.L, sc.R, ...sc.helpers]) {
      a.travel += (a.travelTarget - a.travel) * 0.32;
      a.dodge += (a.dodgeTarget - a.dodge) * 0.35;
    }
    // l'attaquant est dessiné devant
    // l'attaquant (y compris un partenaire qui frappe) est dessiné devant, les autres partenaires derrière
    const main = sc.front === sc.L ? [sc.R, sc.L] : [sc.L, sc.R];
    const order = sc.front && sc.front.helper ? [...sc.helpers.filter(a => a !== sc.front), ...main, sc.front] : [...sc.helpers, ...main];
    for (const a of order) drawActor(sc, g, a, L);
    if (sc.projectile) drawProjectile(sc, g, L);
    // textes flottants
    const now = performance.now();
    for (let i = sc.floats.length - 1; i >= 0; i--) {
      const f = sc.floats[i]; const k = (now - f.t0) / 900;
      if (k > 1) { sc.floats.splice(i, 1); continue; }
      if (k < 0) continue; // texte différé
      const a = f.actor; const x = actorX(sc, a, L);
      g.globalAlpha = sc.fade * (k < 0.75 ? 1 : (1 - k) * 4);
      g.font = `900 ${Math.round((f.big ? 15 : 11) * L.S)}px "Segoe UI", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const y = L.ground - (52 + (f.dy || 0)) * L.S - k * 18 * L.S;
      g.lineWidth = 2 * L.S; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(f.text, x, y);
      g.fillStyle = f.color; g.fillText(f.text, x, y);
    }
    g.restore();
    // bannière (attaque spéciale / duo)
    if (sc.banner) {
      const k = (performance.now() - sc.banner.t0) / 1400;
      if (k > 1) sc.banner = null;
      else {
        g.globalAlpha = sc.fade * (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1);
        const bw = Math.min(w * 0.7, 520), bh = 46, bx = (w - bw) / 2, by = hh * 0.12;
        const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
        const ok = sc.banner.kind === 'overkill', c0 = ok ? 'rgba(255,120,60,0)' : 'rgba(255,90,160,0)', c1 = ok ? 'rgba(200,52,24,.92)' : 'rgba(190,40,110,.9)';
        gr.addColorStop(0, c0); gr.addColorStop(0.2, c1); gr.addColorStop(0.8, c1); gr.addColorStop(1, c0);
        g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
        g.font = '800 22px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.fillText((ok ? '✸ ' : '♥ ') + sc.banner.text, w / 2, by + bh / 2 + 1);
        g.globalAlpha = 1;
      }
    }
    // flash blanc des critiques
    if (sc.whiteout > 0.02) { g.globalAlpha = sc.whiteout * sc.fade; g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); sc.whiteout *= 0.86; }
    g.globalAlpha = 1;
  }

  function drawActor(sc, g, a, L) {
    if (a.alpha <= 0) return;
    if (!a.meta || !a.img) return drawMapActor(sc, g, a, L);
    const x = actorX(sc, a, L);
    g.globalAlpha = sc.fade * a.alpha;
    // ombre portée
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(x, L.ground + 1, 14 * L.S, 3 * L.S, 0, 0, Math.PI * 2); g.fill();
    if (a.flash > performance.now()) {
      // silhouette blanche (impact) : frame redessinée sur un calque puis teintée
      const [cw, ch] = a.meta.cell;
      const off = a.off || (a.off = document.createElement('canvas'));
      off.width = cw; off.height = ch;
      const o = off.getContext('2d');
      o.clearRect(0, 0, cw, ch);
      o.drawImage(a.img, (a.frame % a.meta.columns) * cw, Math.floor(a.frame / a.meta.columns) * ch, cw, ch, 0, 0, cw, ch);
      o.globalCompositeOperation = 'source-atop'; o.fillStyle = '#fff'; o.fillRect(0, 0, cw, ch); o.globalCompositeOperation = 'source-over';
      const [ax, ay] = a.meta.anchor;
      g.save(); g.translate(Math.round(x), Math.round(L.ground)); if (a.flip) g.scale(-1, 1);
      g.drawImage(off, -ax * L.S, -ay * L.S, cw * L.S, ch * L.S);
      g.restore();
    } else {
      Sprites.drawBattlerFrame(g, a.meta, a.img, a.frame, x, L.ground, L.S, a.flip);
    }
    g.globalAlpha = 1;
  }

  /** Combattant sans animation de combat : son sprite de map, agrandi, tourné vers l'adversaire. */
  function drawMapActor(sc, g, a, L) {
    if (!a.mapSp) return;
    const x = actorX(sc, a, L);
    const k = L.S * 2.6 * 16 / (a.mapSp.meta.base || 16);
    g.globalAlpha = sc.fade * a.alpha;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(x, L.ground + 1, 12 * L.S, 3 * L.S, 0, 0, Math.PI * 2); g.fill();
    const moving = Math.abs(a.travelTarget - a.travel) > 0.02;
    const anim = moving ? (a.side === 'R' ? 'left' : 'right') : 'focus';
    if (a.flash > performance.now()) g.filter = 'brightness(5) saturate(0)';
    Sprites.drawMapSprite(g, a.mapSp.meta, a.mapSp.img, x, L.ground, k, { anim: a.mapSp.meta.anims[anim] ? anim : 'idle', t: performance.now(), palette: a.mapSp.palette });
    g.filter = 'none';
    g.globalAlpha = 1;
  }

  function drawProjectile(sc, g, L) {
    const p = sc.projectile;
    const k = Math.min(1, (performance.now() - p.t0) / p.dur);
    const from = actorX(sc, p.from, L), to = actorX(sc, p.to, L);
    const x0 = p.back ? to : from, x1 = p.back ? from : to;
    const x = x0 + (x1 - x0) * k;
    const y = L.ground - 24 * L.S - Math.sin(k * Math.PI) * (p.kind === 'axe' ? 14 : 4) * L.S;
    g.save(); g.translate(x, y); g.globalAlpha = sc.fade;
    const dir = Math.sign(x1 - x0) || 1;
    if (p.kind === 'arrow' && p.img) {
      g.scale(dir < 0 ? 1 : -1, 1); // la flèche de la planche pointe vers la gauche
      g.imageSmoothingEnabled = false;
      g.drawImage(p.img, -p.img.width * L.S / 2, -p.img.height * L.S / 2, p.img.width * L.S, p.img.height * L.S);
    } else if (p.kind === 'axe') {
      g.rotate(performance.now() / 50 * dir);
      g.fillStyle = '#7a5230'; g.fillRect(-1 * L.S, -7 * L.S, 2 * L.S, 14 * L.S);
      g.fillStyle = '#dfe7ef'; g.strokeStyle = '#3a4250'; g.lineWidth = L.S * 0.6;
      g.beginPath(); g.moveTo(0, -7 * L.S); g.quadraticCurveTo(8 * L.S, -6 * L.S, 7 * L.S, 1 * L.S); g.lineTo(0, -2 * L.S); g.closePath(); g.fill(); g.stroke();
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 3 * L.S, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // ------------------------------------------------------------------
  async function strike(sc, atk, def, s) {
    sc.front = atk;
    const weapon = sc.opts.weaponOf(atk.unit);
    const name = chooseAnim(atk.meta, s.crit, sc.opts.distance, weapon && weapon.type);
    const A = atk.meta && atk.meta.anims[name];
    if (!A) { // pas d'animation de combat (partenaire affiché avec son sprite de map) : un bond vers l'adversaire
      atk.travelTarget = 0.85; await wait(240, sc); outcome(sc, atk, def, s); await wait(160, sc);
      atk.travelTarget = 0; await wait(240, sc); return;
    }
    const n = A.frames.length;
    const useTravel = !sc.ranged && A.approach;
    const projKind = A.projectile && (sc.ranged || weapon && weapon.type === 'bow') ? A.projectile : null;
    let resolved = false;
    const resolve = () => { if (!resolved) { resolved = true; outcome(sc, atk, def, s); } };
    let projDone = Promise.resolve();
    if (s.crit) { sc.whiteout = 0.9; await wait(120, sc); }
    for (let i = 0; i < n; i++) {
      atk.frame = A.frames[i];
      if (useTravel) {
        const [a0, a1] = A.approach;
        // reach : part du trajet faite par le moteur (le reste est dessiné dans les frames, ex. une ruée)
        const reach = A.reach !== undefined ? A.reach : 1;
        if (i >= a0 && i <= a1) atk.travelTarget = reach * (i - a0 + 1) / (a1 - a0 + 1);
        if (A.retreat) {
          const [r0, r1] = A.retreat;
          if (i >= r0 && i <= r1) atk.travelTarget = reach * (1 - (i - r0 + 1) / (r1 - r0 + 1));
          if (i > r1) atk.travelTarget = 0;
        }
      }
      if (projKind && i === A.release) projDone = throwProjectile(sc, atk, def, projKind, A.catch !== undefined, resolve);
      if (!projKind && i === (A.hit !== undefined ? A.hit : Math.floor(n / 2))) resolve();
      if (projKind && A.catch !== undefined && i === A.catch) await projDone;
      await wait((A.durations && A.durations[i]) || 55, sc);
    }
    await projDone;
    resolve();
    atk.travelTarget = 0;
    atk.frame = atk.stance;
    await wait(120, sc);
  }

  async function throwProjectile(sc, atk, def, kind, returns, onHit) {
    const img = kind === 'arrow' ? sc.opts.projectileImg(atk.meta, kind) : null;
    const dur = kind === 'arrow' ? 240 : 320;
    sc.projectile = { kind, img, from: atk, to: def, t0: performance.now(), dur: dur / sc.speed, back: false };
    await wait(dur, sc);
    onHit();
    if (returns) {
      sc.projectile = { kind, img, from: atk, to: def, t0: performance.now(), dur: dur / sc.speed, back: true };
      await wait(dur, sc);
    }
    sc.projectile = null;
  }

  function outcome(sc, atk, def, s) {
    Music.se(s.hit ? (s.crit ? 'crit' : 'hit') : 'miss');
    if (s.overkillStrike) {
      if (s.hit) {
        def.flash = performance.now() + 110;
        sc.shake = s.crit ? 14 : 6;
        sc.floats.push({ actor: def, text: `OVERKILL ${s.crit ? 'CRITIQUE ' : ''}+${s.overkill}`, color: '#ff8a5c', big: s.crit, t0: performance.now() });
        def.over = s.overkillTotal; updateHp(def);
      } else sc.floats.push({ actor: def, text: 'RATÉ', color: '#9ad0ff', t0: performance.now() });
      return;
    }
    if (s.hit) {
      def.flash = performance.now() + 110;
      sc.shake = s.crit ? 18 : (s.dmg ? 7 : 2);
      sc.floats.push({ actor: def, text: s.crit ? `CRITIQUE ${s.dmg}` : (s.dmg ? String(s.dmg) : 'Aucun dégât'), color: s.crit ? '#ffd24a' : '#fff', big: s.crit, t0: performance.now() });
      def.hp = s.hpAfter;
      tweenHp(sc, def);
      if (s.overkill) { // dégâts au-delà des PV restants
        sc.floats.push({ actor: def, text: `OVERKILL +${s.overkill}`, color: '#ff8a5c', dy: 16, t0: performance.now() + 260 });
        def.over = s.overkill; setTimeout(() => updateHp(def), 300);
      }
      if (s.heal) {
        atk.hp = s.srcHpAfter;
        sc.floats.push({ actor: atk, text: '+' + s.heal, color: '#7dffa8', t0: performance.now() });
        tweenHp(sc, atk);
      }
    } else {
      sc.floats.push({ actor: def, text: 'RATÉ', color: '#9ad0ff', t0: performance.now() });
      dodge(sc, def);
    }
    if (s.broke) sc.floats.push({ actor: atk, text: 'Arme brisée !', color: '#ffb36b', t0: performance.now() });
  }

  async function tweenHp(sc, a) {
    const from = a.hpShown, to = a.hp, steps = Math.max(1, Math.abs(from - to));
    for (let i = 1; i <= steps; i++) {
      a.hpShown = from + (to - from) * i / steps; updateHp(a);
      await wait(Math.max(18, 260 / steps), sc);
    }
    a.hpShown = to; updateHp(a);
  }

  async function dodge(sc, a) {
    const D = a.meta && a.meta.anims.dodge;
    if (D && D.frames.length > 1) {
      for (let i = 0; i < D.frames.length; i++) { a.frame = D.frames[i]; await wait((D.durations && D.durations[i]) || 70, sc); }
      a.frame = a.stance;
    } else {
      a.dodgeTarget = 1; await wait(200, sc); a.dodgeTarget = 0;
    }
  }

  async function death(sc, a) {
    await wait(200, sc);
    for (let i = 0; i < 8; i++) { a.flash = performance.now() + 60; await wait(70, sc); }
    for (let i = 10; i >= 0; i--) { a.alpha = i / 10; await wait(40, sc); }
  }

  /** État de la scène en cours (tests automatisés). */
  function debugState() { return active ? { helpers: active.helpers.map(a => ({ name: a.unit.name, alpha: a.alpha, travel: a.travel, side: a.side, mapSprite: !!a.mapSp })) } : null; }
  root.BattleScene = { play, skip, setFast, isActive, chooseAnim, debugState };
})(self);
