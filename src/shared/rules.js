/*
 * Règles du jeu partagées (éditeur, playtest, tests Node).
 * Calculs façon Fire Emblem GBA : triangle des armes, doublé à +4 en vitesse,
 * vrai hit (moyenne de 2 tirages), critiques x3, armes efficaces.
 */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./skills.js') : root.Skills,
    typeof module !== 'undefined' && module.exports ? require('./promotions.js') : root.Promotions,
    typeof module !== 'undefined' && module.exports ? require('./statuses.js') : root.Statuses,
    typeof module !== 'undefined' && module.exports ? require('./weather.js') : root.Weather);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof self !== 'undefined' ? self : this, function (Skills, Promotions, Statuses, Weather) {
  'use strict';

  const STATS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
  const STAT_LABELS = { hp: 'PV', str: 'For', mag: 'Mag', skl: 'Tec', spd: 'Vit', lck: 'Cha', def: 'Déf', res: 'Rés', mov: 'Dép' };
  const MOVE_TYPES = [
    { id: 'foot', name: 'Infanterie' },
    { id: 'horse', name: 'Cavalerie' },
    { id: 'armor', name: 'Blindé' },
    { id: 'flier', name: 'Volant' }
  ];
  const WEAPON_TYPES = [
    { id: 'sword', name: 'Épée' },
    { id: 'lance', name: 'Lance' },
    { id: 'axe', name: 'Hache' },
    { id: 'bow', name: 'Arc' },
    { id: 'anima', name: 'Anima' },
    { id: 'light', name: 'Lumière' },
    { id: 'dark', name: 'Ténèbres' },
    { id: 'staff', name: 'Bâton' }
  ];
  const MAGIC_TYPES = ['anima', 'light', 'dark'];
  // a bat b
  const TRIANGLE = { sword: 'axe', axe: 'lance', lance: 'sword', anima: 'light', light: 'dark', dark: 'anima' };
  const IMPASSABLE = 99;
  const AI_DIFFICULTIES = [
    { value: 'easy', label: 'Facile', description: 'Les ennemis privilégient les cibles proches et anticipent peu les ripostes.' },
    { value: 'normal', label: 'Normal', description: 'Les ennemis évaluent dégâts, coups fatals, ripostes et soins.' },
    { value: 'hard', label: 'Tactique', description: 'Les ennemis cherchent les coups décisifs et évitent davantage les positions dangereuses.' }
  ];
  const normalizeAiDifficulty = value => AI_DIFFICULTIES.some(d => d.value === value) ? value : 'normal';

  const DEFAULT_SETTINGS = {
    trueHit: true,
    doubleThreshold: 4,
    triangleDmg: 1,
    triangleHit: 15,
    effectiveMult: 3,
    critMult: 3,
    maxLevel: 20,
    battleAnims: true,
    debugMenu: true, // onglet Debug dans les paramètres du playtest
    overkill: true,  // après le coup fatal, l'attaquant finit ses coups : les dégâts en trop sont affichés
    overkillExp: 30, // EXP en plus quand l'overkill dépasse une 2e fois les PV max de la cible (0 = pas de bonus)
    colors: 'map', // couleurs des sprites : 'map' (équipe sur la map, origine en combat), 'team', 'original'
    aiDifficulty: 'normal'
  };

  // ---------- utilitaires ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const key = (x, y) => x + ',' + y;
  const byId = (list, id) => (list || []).find(e => e.id === id) || null;

  function makeRng(seed) {
    // mulberry32 : reproductible si on fournit une graine
    let s = (seed === undefined ? Math.floor(Math.random() * 2 ** 31) : seed) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function triangle(atkType, defType) {
    if (!atkType || !defType) return 0;
    if (TRIANGLE[atkType] === defType) return 1;
    if (TRIANGLE[defType] === atkType) return -1;
    return 0;
  }

  // ---------- terrain ----------
  const GID_MASK = 0x0FFFFFFF;

  /** Retrouve le tileset + index local d'un gid de map. */
  function resolveGid(map, tilesets, gid) {
    const raw = gid & GID_MASK;
    if (!raw) return null;
    let best = null;
    for (const ref of map.tilesets || []) {
      if (ref.firstgid <= raw && (!best || ref.firstgid > best.firstgid)) best = ref;
    }
    if (!best) return null;
    const ts = byId(tilesets, best.tilesetId);
    if (!ts) return null;
    const local = raw - best.firstgid;
    if (local >= (ts.tileCount || Infinity)) return null;
    return { tileset: ts, local };
  }

  /** Grille des id de terrain effectifs : surcharge peinte > propriété du tile le plus haut > terrain par défaut. */
  function buildTerrainGrid(map, tilesets, defaultTerrainId) {
    const n = map.width * map.height;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const over = map.terrain && map.terrain[i];
      if (over) { out[i] = over; continue; }
      let found = null;
      const layers = map.layers || [];
      for (let l = layers.length - 1; l >= 0 && !found; l--) {
        const gid = layers[l].data[i];
        if (!gid) continue;
        const r = resolveGid(map, tilesets, gid);
        if (r && r.tileset.tileTerrain && r.tileset.tileTerrain[r.local]) found = r.tileset.tileTerrain[r.local];
      }
      out[i] = found || defaultTerrainId;
    }
    return out;
  }

  // ---------- inventaire / armes ----------
  function getEntry(db, id) {
    const w = byId(db.weapons, id);
    if (w) return { kind: 'weapon', def: w };
    const it = byId(db.items, id);
    if (it) return { kind: 'item', def: it };
    return null;
  }

  function canWield(unit, weapon, db) {
    const cls = byId(db.classes, unit.classId);
    return !!(cls && weapon && !Statuses.blockedWeapon(unit, weapon) && (cls.weapons || []).includes(weapon.type));
  }

  /** Armes offensives utilisables (pas les bâtons), dans l'ordre de l'inventaire. */
  function attackWeapons(unit, db) {
    const res = [];
    unit.inventory.forEach((slot, index) => {
      const w = byId(db.weapons, slot.id);
      if (w && w.type !== 'staff' && canWield(unit, w, db)) res.push({ index, weapon: w });
    });
    return res;
  }
  function staves(unit, db) {
    const res = [];
    unit.inventory.forEach((slot, index) => {
      const w = byId(db.weapons, slot.id);
      if (w && w.type === 'staff' && canWield(unit, w, db)) res.push({ index, weapon: w });
    });
    return res;
  }
  function equipped(unit, db) {
    const list = attackWeapons(unit, db);
    return list.length ? list[0] : null;
  }
  function staffCanTarget(unit, target, weapon) {
    if (!target || target === unit || target.dead || target.hp <= 0 || !sameSide(unit, target) || Statuses.blockedWeapon(unit, weapon)) return false;
    const distance = dist(unit, target);
    return distance >= (weapon.minRange || 1) && distance <= (weapon.maxRange || 1) &&
      (weapon.restore ? Statuses.canCure(target, weapon.restore) : target.hp < target.stats.hp);
  }
  /** Met une arme en tête d'inventaire (= équipée), comme dans FE. */
  function equip(unit, index) {
    if (index <= 0 || index >= unit.inventory.length) return;
    const [slot] = unit.inventory.splice(index, 1);
    unit.inventory.unshift(slot);
  }

  // ---------- création des unités ----------
  function statsFromClass(cls, level) {
    const s = {};
    for (const k of STATS) {
      const base = (cls.base && cls.base[k]) || 0;
      const g = (cls.growths && cls.growths[k]) || 0;
      s[k] = base + Math.floor((g * (level - 1)) / 100);
      if (cls.caps && cls.caps[k]) s[k] = Math.min(s[k], cls.caps[k]);
    }
    return s;
  }

  function buildInventory(list, db) {
    return (list || []).map(e => {
      const id = typeof e === 'string' ? e : e.id;
      const entry = getEntry(db, id);
      if (!entry) return null;
      const uses = (typeof e === 'object' && e.uses) ? e.uses : (entry.def.uses || 0);
      return { id, uses };
    }).filter(Boolean);
  }

  let uidCounter = 1;
  function makeUnitFromCharacter(ch, db, pos, team) {
    const cls = byId(db.classes, ch.classId);
    const stats = {};
    for (const k of STATS) stats[k] = (ch.stats && ch.stats[k] !== undefined) ? ch.stats[k] : 0;
    return {
      uid: 'u' + (uidCounter++), team: team || 'player', sourceId: ch.id, name: ch.name, convoy: !!ch.convoy,
      classId: ch.classId, level: ch.level || 1, exp: 0, stats, hp: stats.hp,
      growths: Object.assign({}, ch.growths || {}), inventory: buildInventory(ch.inventory, db),
      ...Skills.initialLoadout(ch, cls, db.skills),
      mov: (cls ? cls.mov : 5) + (ch.movBonus || 0), moveType: cls ? cls.moveType : 'foot',
      isLord: !!ch.isLord, portrait: ch.portrait || '', color: ch.color || '',
      ...ultimateOf(ch, db),
      mapSprite: ch.mapSprite || (cls && cls.mapSprite) || '', battler: ch.battler || (cls && cls.battler) || '',
      colors: ch.colors || (cls && cls.colors) || '', colorsOverride: pos.colors || '', // réglage du placement (prioritaire)
      x: pos.x, y: pos.y, done: false, ai: 'player'
    };
  }

  /** Ultime du personnage (Base de données › Ultimes) et sa recharge au début de la bataille (0 = prêt). */
  function ultimateOf(ch, db) {
    const ult = ch.ultimate ? byId(db.ultimates || [], ch.ultimate) : null;
    return ult ? { ultimate: ult.id, ultCharge: ult.ready === false ? ult.cooldown : 0 } : { ultimate: '', ultCharge: 0 };
  }

  function makeEnemyFromPlacement(pl, db, team) {
    const cls = byId(db.classes, pl.classId);
    if (!cls) return null;
    const level = pl.level || 1;
    const stats = statsFromClass(cls, level);
    if (pl.statBonus) for (const k of STATS) stats[k] += pl.statBonus[k] || 0;
    let inv = pl.inventory && pl.inventory.length ? pl.inventory : (cls.defaultInventory || []);
    return {
      uid: 'u' + (uidCounter++), team: team || 'enemy', sourceId: pl.id, name: pl.name || cls.name,
      classId: cls.id, level, exp: 0, stats, hp: stats.hp, growths: Object.assign({}, cls.growths || {}),
      ...Skills.initialLoadout(Object.assign({}, pl, { level }), cls, db.skills),
      inventory: buildInventory(inv, db), mov: cls.mov, moveType: cls.moveType,
      isLord: false, isBoss: !!pl.isBoss, portrait: pl.portrait || '', ai: pl.ai || 'aggressive',
      appearTurn: pl.appearTurn || 0, dropLast: !!pl.drop, gold: Math.max(0, Math.floor(Number(pl.gold) || 0)),
      mapSprite: pl.mapSprite || cls.mapSprite || '', battler: pl.battler || cls.battler || '',
      colors: pl.colors || cls.colors || '',
      x: pl.x, y: pl.y, done: false
    };
  }

  // ---------- déplacement ----------
  function moveCost(terrain, moveType, weather) {
    const c = terrain && terrain.cost && terrain.cost[moveType];
    const base = (c === undefined || c === null || c === '') ? 1 : Number(c);
    return base >= IMPASSABLE ? base : Math.min(IMPASSABLE - 1, base + Weather.movePenalty(weather, moveType));
  }

  /**
   * ctx = { width, height, terrainAt(x,y) -> objet terrain, unitAt(x,y) -> unité|null }
   * Retour : Map clé -> { x, y, cost, prev, canStop }
   */
  function reachable(unit, ctx, maxMove) {
    const limit = maxMove === undefined ? unit.mov : maxMove;
    const res = new Map();
    const start = { x: unit.x, y: unit.y, cost: 0, prev: null, canStop: true };
    res.set(key(unit.x, unit.y), start);
    if (!Statuses.canAct(unit)) return res;
    const open = [start];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
      const cur = open.splice(bi, 1)[0];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= ctx.width || ny >= ctx.height) continue;
        const c = moveCost(ctx.terrainAt(nx, ny), unit.moveType, ctx.weather);
        if (c >= IMPASSABLE) continue;
        const nc = cur.cost + c;
        if (nc > limit) continue;
        const occ = ctx.unitAt(nx, ny);
        if (occ && occ !== unit && !sameSide(occ, unit)) continue; // on ne traverse pas l'ennemi
        const k = key(nx, ny);
        const old = res.get(k);
        if (old && old.cost <= nc) continue;
        const node = { x: nx, y: ny, cost: nc, prev: cur, canStop: !occ || occ === unit };
        res.set(k, node);
        open.push(node);
      }
    }
    return res;
  }

  function sameSide(a, b) {
    const side = t => (t === 'enemy' ? 'enemy' : 'player'); // 'ally' joue avec le joueur
    return side(a.team) === side(b.team);
  }

  /** Occupation connue du camp : un ennemi caché ne doit pas découper une zone de déplacement. */
  function perceivedContext(unit, ctx, units) {
    const visible = Weather.visibleTiles(ctx.weather, units, unit.team, ctx.width, ctx.height);
    return { ...ctx, visible, unitAt: (x, y) => {
      const occupant = ctx.unitAt(x, y);
      return occupant && (sameSide(unit, occupant) || Weather.canSee(visible, occupant)) ? occupant : null;
    } };
  }

  function pathTo(reach, x, y) {
    const path = [];
    let n = reach.get(key(x, y));
    while (n) { path.unshift({ x: n.x, y: n.y }); n = n.prev; }
    return path;
  }

  function tilesInRange(x, y, min, max, ctx) {
    const out = [];
    for (let dy = -max; dy <= max; dy++) {
      for (let dx = -max; dx <= max; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < min || d > max) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ctx.width || ny >= ctx.height) continue;
        out.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  /** Cases menacées par une unité (déplacement + portée de ses armes). */
  function threatTiles(unit, ctx, db, stationary) {
    const weapons = attackWeapons(unit, db);
    const set = new Set();
    if (!weapons.length) return set;
    let min = 99, max = 0;
    weapons.forEach(w => { min = Math.min(min, w.weapon.minRange || 1); max = Math.max(max, w.weapon.maxRange || 1); });
    const stops = stationary ? [{ x: unit.x, y: unit.y, canStop: true }] : [...reachable(unit, ctx).values()];
    for (const s of stops) {
      if (!s.canStop) continue;
      for (const t of tilesInRange(s.x, s.y, min, max, ctx)) set.add(key(t.x, t.y));
    }
    return set;
  }

  // ---------- combat ----------
  /** Dégâts magiques (Mag / Rés) : tomes, et armes physiques marquées « magic » (Lame du tonnerre, Lame runique…). */
  function isMagic(w) { return !!w && (!!w.magic || MAGIC_TYPES.includes(w.type)); }

  function attackSpeed(u, w) { return u.stats.spd - Math.max(0, ((w && w.weight) || 0) - u.stats.str); }

  function skillState(unit, weapon, initiator, db, units) {
    const own = Skills.active(unit, db.skills || [], { weapon, initiating: unit === initiator, units });
    const auras = [];
    for (const source of units || []) {
      if (source === unit || !sameSide(source, unit) || source.dead || source.hp <= 0) continue;
      for (const skill of Skills.active(source, db.skills || [], { units })) {
        if (skill.effect === 'auraAvoid' && dist(source, unit) <= skill.range) auras.push(skill);
      }
    }
    // Une seule aura d'esquive : la plus forte, quelle que soit sa source.
    const aura = auras.sort((a, b) => b.amount - a.amount)[0];
    return { own, aura };
  }
  const skillTotal = (state, effect) => state.own.filter(s => s.effect === effect).reduce((sum, s) => sum + s.amount, 0);
  const skillInfo = (skill, unit) => ({ id: skill.id, name: skill.name, icon: skill.icon, image: skill.image || '', effect: skill.effect,
    chance: skill.activation === undefined ? skill.chance : Skills.chance(skill, unit), amount: skill.amount });
  function statusOffers(unit, weapon, target, initiator, db, units) {
    const offers = weapon.inflict ? [{ ...weapon.inflict }] : [];
    for (const skill of skillState(unit, weapon, initiator, db, units).own.filter(s => s.effect === 'inflictStatus'))
      offers.push({ id: skill.statusId, turns: skill.statusTurns, chance: Skills.chance(skill, unit), skill });
    return offers.filter(o => Statuses.canApply(target, o.id, o.turns));
  }

  function strikeStats(att, aw, def, dw, defTerrain, settings, db, aBonus, dBonus, context = {}) {
    const ab = aBonus || NO_BONUS, dbn = dBonus || NO_BONUS;
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const tri = triangle(aw.type, dw ? dw.type : null);
    const defCls = byId(db.classes, def.classId);
    const defMove = def.moveType || (defCls && defCls.moveType);
    const effectiveTypes = defCls && Array.isArray(defCls.effectiveTypes) ? defCls.effectiveTypes : [defMove];
    const eff = effectiveTypes.some(type => (aw.effective || []).includes(type)) ? s.effectiveMult : 1;
    const power = (isMagic(aw) ? att.stats.mag : att.stats.str) + (aw.might + tri * s.triangleDmg) * eff;
    const tDef = defTerrain ? (Number(defTerrain.def) || 0) : 0;
    const tAvo = defTerrain ? (Number(defTerrain.avoid) || 0) : 0;
    const initiator = context.initiator || att, units = context.units || [att, def];
    const aSkills = skillState(att, aw, initiator, db, units), dSkills = skillState(def, dw, initiator, db, units);
    const protection = (isMagic(aw) ? def.stats.res : def.stats.def) + tDef;
    const prot = context.luna ? protection - Math.floor(protection * context.luna.amount / 100) : protection;
    const rawDmg = Math.max(0, power + (ab.dmg || 0) + skillTotal(aSkills, 'damage') - prot);
    const guard = skillTotal(dSkills, 'guard');
    const dmg = Math.max(0, rawDmg - guard);
    const hitRate = aw.hit + att.stats.skl * 2 + Math.floor(att.stats.lck / 2) + tri * s.triangleHit + (ab.hit || 0) + skillTotal(aSkills, 'hit');
    const weatherAvoid = Weather.effects(context.weather).avoid;
    const avoid = attackSpeed(def, dw) * 2 + def.stats.lck + tAvo + (dbn.avoid || 0) + skillTotal(dSkills, 'avoid') + (dSkills.aura ? dSkills.aura.amount : 0) + weatherAvoid;
    const hit = clamp(hitRate - avoid, 0, 100);
    const crit = clamp((aw.crit || 0) + Math.floor(att.stats.skl / 2) + (ab.crit || 0) - def.stats.lck - (dbn.critAvoid || 0), 0, 100);
    return { dmg, hit, crit, rawDmg, guard, protection, weatherAvoid, effective: eff > 1, tri, bonus: !!(ab.hit || ab.crit || ab.dmg || dbn.avoid),
      skills: aSkills.own.filter(s => !['auraAvoid', 'renewal'].includes(s.effect)).map(skill => skillInfo(skill, att)),
      aura: aSkills.aura ? skillInfo(aSkills.aura, att) : null };
  }

  /**
   * Prévisions d'un combat. att/def sont des unités à leurs positions de combat.
   * aIndex = index d'inventaire de l'arme de l'attaquant.
   */
  function forecast(att, aIndex, def, opts) {
    const { db, settings, terrainOf } = opts;
    const bo = opts.bonusOf || (() => null);
    const bA = bo(att), bD = bo(def);
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const slot = att.inventory[aIndex];
    const aw = slot ? byId(db.weapons, slot.id) : null;
    if (!aw || aw.type === 'staff' || !canWield(att, aw, db)) throw new Error('Arme offensive inutilisable.');
    const d = dist(att, def);
    const dEq = equipped(def, db);
    const dw = dEq ? dEq.weapon : null;
    const canCounter = !!(dw && d >= (dw.minRange || 1) && d <= (dw.maxRange || 1));
    const context = { initiator: att, units: opts.units || [att, def], weather: opts.weather || (opts.ctx && opts.ctx.weather) };
    const a = strikeStats(att, aw, def, dw, terrainOf(def), s, db, bA, bD, context);
    const asA = attackSpeed(att, aw);
    const asD = attackSpeed(def, dw);
    a.count = Math.min(asA - asD >= s.doubleThreshold ? 2 : 1, slot.uses > 0 ? slot.uses : Infinity);
    a.weapon = aw;
    let b = null;
    if (canCounter) {
      b = strikeStats(def, dw, att, aw, terrainOf(att), s, db, bD, bA, context);
      b.count = Math.min(asD - asA >= s.doubleThreshold ? 2 : 1, def.inventory[dEq.index].uses > 0 ? def.inventory[dEq.index].uses : Infinity);
      b.weapon = dw;
      b.index = dEq.index;
    }
    const vantage = b && b.skills.find(skill => skill.effect === 'vantage');
    let order = vantage ? ['d', 'a'] : b ? ['a', 'd'] : ['a'];
    if (a.count > 1) order.push('a');
    if (b && b.count > 1) order.push('d');
    // arme brave : chaque attaque frappe deux fois de suite
    order = order.flatMap(x => (x === 'a' && aw.brave) || (x === 'd' && dw && dw.brave) ? [x, x] : [x]);
    a.count = order.filter(x => x === 'a').length;
    if (b) b.count = order.filter(x => x === 'd').length;
    const fc = { att: a, def: b, distance: d, order, vantage: vantage || null };
    // Variantes pour la prévision et l'IA, sans consommer le hasard du combat.
    for (const [unit, other, st, weapon, otherWeapon, ab, dbn] of [[att, def, a, aw, dw, bA, bD], [def, att, b, dw, aw, bD, bA]]) {
      if (!st) continue;
      let remaining = 1, expected = 0, healing = 0, lethal = 0;
      st.outcomes = [{ probability: 1 - st.hit / 100, damage: 0, healPercent: 0 }];
      const addOutcomes = (raw, probability, healPercent = 0) => {
        for (const [multiplier, rate] of [[1, 1 - st.crit / 100], [s.critMult, st.crit / 100]]) {
          const chance = probability * rate * st.hit / 100;
          if (chance > 0) st.outcomes.push({ probability: chance, damage: Math.max(0, raw * multiplier - st.guard), healPercent });
        }
      };
      st.procs = st.skills.filter(skill => ['luna', 'sol', 'miracle'].includes(skill.effect));
      const damage = raw => (Math.max(0, raw - st.guard) * (1 - st.crit / 100) + Math.max(0, raw * s.critMult - st.guard) * st.crit / 100);
      const lethalRate = raw => ((Math.max(0, raw - st.guard) >= other.hp ? 1 : 0) * (1 - st.crit / 100) +
        (Math.max(0, raw * s.critMult - st.guard) >= other.hp ? 1 : 0) * st.crit / 100);
      for (const effect of ['luna', 'sol']) for (const skill of st.procs.filter(p => p.effect === effect)) {
        const probability = remaining * skill.chance / 100;
        const variant = effect === 'luna' ? strikeStats(unit, weapon, other, otherWeapon, terrainOf(other), s, db, ab, dbn, { ...context, luna: skill }) : st;
        skill.dmg = variant.dmg;
        expected += probability * damage(variant.rawDmg);
        lethal += probability * lethalRate(variant.rawDmg);
        addOutcomes(variant.rawDmg, probability, effect === 'sol' ? skill.amount : 0);
        if (effect === 'sol') healing += probability * Math.min(other.hp, damage(st.rawDmg)) * skill.amount / 100;
        remaining *= 1 - skill.chance / 100;
      }
      st.expectedDmg = (expected + remaining * damage(st.rawDmg)) * st.hit / 100;
      st.statusInflict = statusOffers(unit, weapon, other, att, db, context.units).map(o => ({ id: o.id, name: Statuses.get(o.id).name, turns: o.turns, chance: o.chance }));
      addOutcomes(st.rawDmg, remaining);
      st.expectedHeal = healing * st.hit / 100;
      st.killChance = (lethal + remaining * lethalRate(st.rawDmg)) * st.hit / 100;
    }
    // Une cible sans riposte peut tout de même posséder Miracle et des protections.
    const defense = skillState(def, dw, att, db, context.units);
    fc.defSkills = defense.own.map(skill => skillInfo(skill, def));
    fc.defAura = defense.aura ? skillInfo(defense.aura, def) : null;
    return fc;
  }

  /** Estimation de l'IA : ordre réel, probabilités de survie et soins, sans hasard. */
  function estimateCombat(att, def, fc) {
    let states = [{ a: att.hp, d: def.hp, probability: 1 }];
    const damage = { a: 0, d: 0 }, healing = { a: 0, d: 0 };
    const miracleSurvival = skills => 1 - skills.filter(skill => skill.effect === 'miracle')
      .reduce((failure, skill) => failure * (1 - skill.chance / 100), 1);
    for (const who of fc.order) {
      const st = who === 'a' ? fc.att : fc.def, other = who === 'a' ? 'd' : 'a';
      const next = new Map();
      const add = state => {
        const key = state.a + ',' + state.d, old = next.get(key);
        if (old) old.probability += state.probability; else next.set(key, state);
      };
      for (const state of states) {
        if (state.a <= 0 || state.d <= 0) { add(state); continue; }
        for (const outcome of st.outcomes) {
          if (outcome.probability <= 0) continue;
          const probability = state.probability * outcome.probability;
          const hp = Math.max(0, state[other] - outcome.damage);
          const protection = hp === 0 && state[other] > 1 ? miracleSurvival(who === 'a' ? fc.defSkills : fc.att.skills) : 0;
          for (const [after, rate] of protection ? [[1, protection], [0, 1 - protection]] : [[hp, 1]]) {
            if (rate <= 0) continue;
            const loss = state[other] - after, maxHp = who === 'a' ? att.stats.hp : def.stats.hp;
            const heal = Math.min(maxHp - state[who], Math.floor(loss * outcome.healPercent / 100));
            const branch = probability * rate;
            damage[who] += loss * branch; healing[who] += heal * branch;
            add({ ...state, [who]: state[who] + heal, [other]: after, probability: branch });
          }
        }
      }
      states = [...next.values()];
    }
    return { damage: Math.min(def.hp, damage.a), counter: Math.min(att.hp, damage.d),
      healing: Math.min(att.stats.hp - att.hp, healing.a), killChance: states.filter(state => state.d <= 0).reduce((sum, state) => sum + state.probability, 0),
      deathChance: states.filter(state => state.a <= 0).reduce((sum, state) => sum + state.probability, 0) };
  }

  function roll(rng, pct, trueHit) {
    if (trueHit) return ((rng() * 100 + rng() * 100) / 2) < pct;
    return rng() * 100 < pct;
  }

  function useWeapon(unit, index) {
    const slot = unit.inventory[index];
    if (!slot) return false;
    if (slot.uses > 0) {
      slot.uses--;
      if (slot.uses === 0) { unit.inventory.splice(index, 1); return true; } // cassée
    }
    return false;
  }

  /** Résout le combat et modifie les PV / usures. Renvoie la liste des coups. */
  function resolveCombat(att, aIndex, def, opts) {
    const rng = opts.rng || Math.random;
    const s = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
    const fc = forecast(att, aIndex, def, opts);
    const order = fc.order;
    const strikes = [];
    let aIdx = aIndex, dIdx = fc.def ? fc.def.index : -1;
    let aBroken = false, dBroken = false;
    const defenderEquipment = equipped(def, opts.db);
    const defenderWeapon = defenderEquipment ? defenderEquipment.weapon : null;
    const dealt = { a: false, d: false };
    const specials = { a: opts.specialOf ? opts.specialOf(att) : null, d: opts.specialOf ? opts.specialOf(def) : null };
    const units = opts.units || [att, def, ...(opts.dual ? [opts.dual.partner] : [])];
    const bo = opts.bonusOf || (() => null);
    const proc = (skill, unit) => {
      const chance = Skills.chance(skill, unit);
      return chance >= 100 || (chance > 0 && rng() * 100 < chance);
    };
    const perform = (src, index, tgt, weapon, targetWeapon, initiator, extra = {}) => {
      const context = { units, initiator, weather: opts.weather || (opts.ctx && opts.ctx.weather) };
      const stats = luna => strikeStats(src, weapon, tgt, targetWeapon, opts.terrainOf(tgt), s, opts.db, bo(src), bo(tgt), { ...context, luna });
      let st = stats(), special = null;
      const statuses = [], skills = [], offensive = skillState(src, weapon, initiator, opts.db, units).own;
      const statusCandidates = statusOffers(src, weapon, tgt, initiator, opts.db, units);
      const defensive = skillState(tgt, targetWeapon, initiator, opts.db, units).own;
      const note = (skill, unit) => skills.push({ ...skillInfo(skill, unit), by: unit.uid });
      if (extra.vantage) note(extra.vantage, src);
      // Un seul effet offensif : affinité, puis Luna, puis Sol, dans l'ordre des emplacements.
      if (extra.special && rng() * 100 < extra.special.chance) special = extra.special.name;
      const ult = extra.ultimate; // ultime « frappe » : premier coup de l'attaquant
      if (ult) skills.push({ id: ult.id, name: ult.name, icon: ult.icon, image: ult.image, animation: ult.animation, effect: 'ultimate', ultimate: true, by: src.uid });
      const hit = ult && ult.sureHit ? true : roll(rng, clamp(st.hit + (special ? extra.special.hit || 0 : extra.hit || 0), 0, 100), s.trueHit);
      let crit = false, dmg = 0, heal = 0, selected = null;
      if (hit) {
        crit = rng() * 100 < clamp(st.crit + (special ? extra.special.crit || 0 : 0), 0, 100);
        if (!special && !extra.dual) {
          for (const effect of ['luna', 'sol']) {
            selected = offensive.find(skill => skill.effect === effect && proc(skill, src));
            if (selected) { note(selected, src); break; }
          }
          if (selected && selected.effect === 'luna') st = stats(selected);
        }
        const raw = Math.max(0, st.rawDmg + (special ? extra.special.dmg || 0 : extra.might || 0));
        const base = Math.max(0, raw * (crit ? s.critMult : 1) - st.guard);
        const damage = ult ? Math.floor(base * (ult.power || 100) / 100) : base;
        const before = tgt.hp;
        let hpAfter = Math.max(0, before - damage);
        if (hpAfter === 0 && before > 1) {
          const miracle = defensive.find(skill => skill.effect === 'miracle' && proc(skill, tgt));
          if (miracle) { hpAfter = 1; note(miracle, tgt); }
        }
        if (opts.protect && opts.protect(tgt)) hpAfter = before; // debug : unité invincible
        tgt.hp = hpAfter; dmg = before - hpAfter;
        if (hpAfter === 0 && damage > before) extra.excess = damage - before; // overkill : dégâts au-delà des PV restants
        if (selected && selected.effect === 'sol') {
          heal = Math.min(src.stats.hp - src.hp, Math.floor(dmg * selected.amount / 100));
          src.hp += heal;
        }
        if (weapon.drain && dmg > 0 && src.hp > 0) { // arme de drain (Nosferatu, Lame runique) : soigne des dégâts infligés
          const more = Math.min(src.stats.hp - src.hp, dmg);
          src.hp += more; heal += more;
        }
      }
      if (hit && tgt.hp > 0 && !(opts.protect && opts.protect(tgt))) {
        for (const offer of statusCandidates) {
          if (offer.chance < 100 && !(offer.chance > 0 && rng() * 100 < offer.chance)) continue;
          const applied = Statuses.apply(tgt, offer.id, offer.turns);
          if (applied) { statuses.push(applied); if (offer.skill) note(offer.skill, src); }
        }
      }
      const broke = useWeapon(src, index);
      const strike = { by: src.uid, target: tgt.uid, hit, crit, dmg, hpAfter: tgt.hp, srcHpAfter: src.hp, heal, broke,
        weapon: weapon.name, special, skills, statuses, dual: extra.dual || null, ultimate: ult ? ult.name : null,
        partner: special && extra.special.partnerUid ? extra.special.partnerUid : null }; // allié qui participe à l'attaque spéciale
      if (extra.excess) strike.overkill = extra.excess;
      strikes.push(strike);
      return strike;
    };
    // Overkill : la cible est vaincue, mais celui qui l'a abattue termine ses coups prévus. Ils ne changent
    // plus les PV (déjà à 0) : précision et critique sont tirées normalement, sans usure d'arme ni compétence,
    // et les dégâts s'ajoutent au total d'overkill. Bonus d'EXP si ce total atteint les PV max de la cible.
    let ok = null;
    const startOverkill = (strike, src, tgt) => {
      if (s.overkill === false || !strike.hit || tgt.hp > 0 || src.hp <= 0) return;
      ok = { by: src.uid, target: tgt.uid, total: strike.overkill || 0, max: tgt.stats.hp, strikes: 0 };
    };
    const overkillStrike = (src, tgt, weapon, targetWeapon) => {
      const st = strikeStats(src, weapon, tgt, targetWeapon, opts.terrainOf(tgt), s, opts.db, bo(src), bo(tgt), { units, initiator: att, weather: opts.weather || (opts.ctx && opts.ctx.weather) });
      const hit = roll(rng, clamp(st.hit, 0, 100), s.trueHit);
      const crit = hit && rng() * 100 < clamp(st.crit, 0, 100);
      const damage = hit ? Math.max(0, st.rawDmg * (crit ? s.critMult : 1) - st.guard) : 0;
      ok.total += damage; ok.strikes++;
      strikes.push({ by: src.uid, target: tgt.uid, hit, crit, dmg: 0, hpAfter: 0, srcHpAfter: src.hp, heal: 0, broke: false,
        weapon: weapon.name, special: null, skills: [], dual: null, partner: null, overkillStrike: true, overkill: damage, overkillTotal: ok.total });
    };
    // attaque duo : juste après le premier coup de l'attaquant, le partenaire adjacent
    // frappe à son tour (l'ennemi ne riposte pas contre lui)
    let duo = null, duoDone = false;
    const du = opts.dual;
    const doDuo = () => {
      duoDone = true;
      if (!(du && du.partner && att.hp > 0 && def.hp > 0 && du.partner.hp > 0 && rng() * 100 < du.chance)) return;
      const pe = equipped(du.partner, opts.db);
      if (!pe) return;
      const strike = perform(du.partner, pe.index, def, pe.weapon, dBroken ? null : defenderWeapon, du.partner,
        { dual: du.name || 'Attaque duo', might: du.might, hit: du.hit });
      duo = { partner: du.partner, hit: strike.hit, dmg: strike.dmg };
    };
    let ultDone = false;
    for (const who of order) {
      if (who === 'd' && opts.ultimate && opts.ultimate.noCounter) continue; // ultime sans riposte
      const st = who === 'a' ? fc.att : fc.def;
      const src = who === 'a' ? att : def, tgt = who === 'a' ? def : att;
      const targetWeapon = who === 'a' ? (dBroken ? null : defenderWeapon) : (aBroken ? null : fc.att.weapon);
      if (ok) { // la cible est déjà vaincue : seuls les coups restants de celui qui l'a abattue
        if (src.uid === ok.by && !((who === 'a' && aBroken) || (who === 'd' && dBroken))) overkillStrike(src, tgt, st.weapon, targetWeapon);
        continue;
      }
      if (att.hp <= 0 || def.hp <= 0) break;
      if ((who === 'a' && aBroken) || (who === 'd' && dBroken)) continue;
      if (!canWield(src, st.weapon, opts.db)) continue;
      const ultimate = who === 'a' && opts.ultimate && !ultDone ? opts.ultimate : null;
      if (ultimate) ultDone = true;
      const strike = perform(src, who === 'a' ? aIdx : dIdx, tgt, st.weapon, targetWeapon, att,
        { special: ultimate ? null : specials[who], ultimate, vantage: strikes.length === 0 && who === 'd' ? fc.vantage : null });
      if (strike.dmg > 0) dealt[who] = true;
      if (strike.broke) { if (who === 'a') aBroken = true; else dBroken = true; }
      if (tgt.hp <= 0) startOverkill(strike, src, tgt);
      if (who === 'a' && !duoDone) doDuo();
    }
    if (!duoDone) doDuo();
    const overkill = ok ? { by: ok.by, target: ok.target, total: ok.total, max: ok.max, strikes: ok.strikes,
      bonus: ok.total >= ok.max ? Math.max(0, Number(s.overkillExp) || 0) : 0, doubled: ok.total >= ok.max } : null;
    return { strikes, forecast: fc, dealt, duo, overkill, attackerDead: att.hp <= 0, defenderDead: def.hp <= 0 };
  }

  /** Régénération une fois par appel, réservé au début de la phase de l'unité. */
  function phaseRecovery(list, opts) {
    const events = [];
    for (const unit of list) {
      if (unit.dead || unit.hp <= 0 || unit.hp >= unit.stats.hp) continue;
      const skills = Skills.active(unit, opts.db.skills || [], { units: opts.units || list }).filter(skill => skill.effect === 'renewal');
      if (!skills.length) continue;
      const amount = skills.reduce((sum, skill) => sum + Math.max(1, Math.floor(unit.stats.hp * skill.amount / 100)), 0);
      const heal = Math.min(unit.stats.hp - unit.hp, amount);
      unit.hp += heal;
      events.push({ unit, heal, skills: skills.map(skill => skillInfo(skill, unit)) });
    }
    return events;
  }

  // ---------- affinités (soutiens) ----------
  const NO_BONUS = {};
  const SUPPORT_RANKS = ['', 'C', 'B', 'A', 'S'];
  const DEFAULT_SUPPORT = {
    thresholds: [20, 50, 90, 140], // points pour atteindre C, B, A, S
    range: 3,                      // portée des bonus passifs
    gainAdjacent: 3,               // points par fin de phase joueur côte à côte
    gainCombat: 2,                 // points quand on combat à côté de son partenaire
    bonus: { hit: 5, avoid: 5, crit: 3, critAvoid: 3 }, // par rang
    endingRank: 'A'                // rang minimum pour finir ensemble dans l'épilogue
  };
  const rankIndex = (r) => Math.max(0, SUPPORT_RANKS.indexOf(r || ''));
  function pairKey(a, b) { return [a, b].sort().join('|'); }
  /** Rang atteignable avec ces points (sans dépasser maxRank). */
  function rankForPoints(points, cfg, maxRank) {
    const t = (cfg && cfg.thresholds) || DEFAULT_SUPPORT.thresholds;
    let r = 0;
    for (let i = 0; i < t.length; i++) if (points >= t[i]) r = i + 1;
    return Math.min(r, rankIndex(maxRank || 'S') || 4);
  }
  /** État initial des paires à partir de la base (db.supports). */
  function initSupports(db, cfg) {
    const st = {};
    for (const p of db.supports || []) {
      if (!p.a || !p.b || p.a === p.b) continue;
      const points = Number(p.startPoints) || 0;
      st[pairKey(p.a, p.b)] = { def: p, points, rank: rankForPoints(points, cfg, p.maxRank) };
    }
    return st;
  }
  function partnersOf(unit, st) {
    const out = [];
    for (const k of Object.keys(st)) {
      const e = st[k];
      if (e.def.a === unit.sourceId) out.push({ id: e.def.b, entry: e });
      else if (e.def.b === unit.sourceId) out.push({ id: e.def.a, entry: e });
    }
    return out;
  }
  /** Bonus passifs : somme des rangs des partenaires présents à portée. */
  function supportBonus(unit, friends, st, cfg) {
    if (!unit || unit.team === 'enemy' || !st) return null;
    const c = Object.assign({}, DEFAULT_SUPPORT, cfg || {});
    const b = { hit: 0, avoid: 0, crit: 0, critAvoid: 0, partners: [] };
    for (const p of partnersOf(unit, st)) {
      if (!p.entry.rank) continue;
      const f = friends.find(u => u.sourceId === p.id && u.hp > 0 && u !== unit);
      if (!f || dist(f, unit) > c.range) continue;
      for (const k of ['hit', 'avoid', 'crit', 'critAvoid']) b[k] += (c.bonus[k] || 0) * p.entry.rank;
      b.partners.push(f.name);
    }
    return b.partners.length ? b : null;
  }
  /** Attaque spéciale disponible : partenaire à portée avec le rang requis. */
  function supportSpecial(unit, friends, st, cfg) {
    if (!unit || unit.team === 'enemy' || !st) return null;
    const c = Object.assign({}, DEFAULT_SUPPORT, cfg || {});
    let best = null;
    for (const p of partnersOf(unit, st)) {
      const sp = p.entry.def.special;
      if (!sp || !sp.name || p.entry.rank < rankIndex(sp.rank || 'B')) continue;
      const f = friends.find(u => u.sourceId === p.id && u.hp > 0 && u !== unit);
      if (!f || dist(f, unit) > c.range) continue;
      const chance = Number(sp.chance) || 0;
      if (!Statuses.canAct(f)) continue;
      if (!best || chance > best.chance) best = { name: sp.name, chance, dmg: Number(sp.dmg) || 0, hit: Number(sp.hit) || 0, crit: Number(sp.crit) || 0, partner: f.name, partnerUid: f.uid };
    }
    return best;
  }
  /** Attaque duo : partenaire adjacent à l'attaquant avec le rang requis et une arme. */
  function supportDual(unit, friends, st, db) {
    if (!unit || unit.team === 'enemy' || !st) return null;
    let best = null;
    for (const p of partnersOf(unit, st)) {
      const co = p.entry.def.combo;
      if (!co || !co.name || p.entry.rank < rankIndex(co.rank || 'A')) continue;
      const f = friends.find(u => u.sourceId === p.id && u.hp > 0 && u !== unit);
      if (!f || dist(f, unit) !== 1 || !equipped(f, db)) continue;
      const chance = Number(co.chance) || 0;
      if (!best || chance > best.chance) best = { partner: f, name: co.name, chance, might: Number(co.might) || 0, hit: Number(co.hit) || 0 };
    }
    return best;
  }
  /**
   * Ajoute des points à une paire. Renvoie true si un nouveau rang devient disponible
   * (la conversation de soutien peut alors être vue en jeu).
   */
  function addSupportPoints(st, idA, idB, amount, cfg, sRankTaken) {
    const e = st[pairKey(idA, idB)];
    if (!e || !amount) return false;
    const before = rankForPoints(e.points, cfg, e.def.maxRank);
    e.points += amount;
    let after = rankForPoints(e.points, cfg, e.def.maxRank);
    if (after === 4 && sRankTaken && sRankTaken(e)) after = 3; // un seul rang S par personnage
    return after > e.rank && after > before;
  }
  function pendingRank(e, cfg, sRankTaken) {
    let r = rankForPoints(e.points, cfg, e.def.maxRank);
    if (r === 4 && sRankTaken && sRankTaken(e)) r = 3;
    return r > e.rank ? e.rank + 1 : 0;
  }

  // ---------- expérience ----------
  /** bonus : EXP en plus (overkill), comptée dans le plafond de 100. */
  function combatExp(unit, foe, dealtDamage, killed, db, bonus) {
    const diff = Promotions.effectiveLevel(foe, db) - Promotions.effectiveLevel(unit, db);
    if (!dealtDamage && !killed) return 1;
    let exp = Math.max(1, Math.floor((31 + diff) / 3));
    if (killed) exp += Math.max(0, diff * 3 + 20) + (foe.isBoss ? 40 : 0);
    return clamp(exp + (Number(bonus) || 0), 1, 100);
  }
  function staffExp(unit, db) {
    const level = db ? Promotions.effectiveLevel(unit, db) : (unit.effectiveLevel || unit.level);
    return clamp(10 + Math.max(0, 10 - level), 1, 100);
  }

  /** Ajoute l'exp ; renvoie les montées de niveau et les compétences nouvellement apprises. */
  function gainExp(unit, amount, db, rng, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    rng = rng || Math.random;
    const ups = [];
    if (unit.level >= s.maxLevel) return ups;
    unit.exp += amount;
    while (unit.exp >= 100 && unit.level < s.maxLevel) {
      unit.exp -= 100;
      unit.level++;
      if (Number.isFinite(unit.effectiveLevel)) unit.effectiveLevel++;
      const cls = byId(db.classes, unit.classId);
      const gains = {};
      for (const k of STATS) {
        const g = unit.growths[k] || 0;
        let gain = Math.floor(g / 100) + (rng() * 100 < (g % 100) ? 1 : 0);
        const cap = cls && cls.caps && cls.caps[k];
        if (cap && unit.stats[k] + gain > cap) gain = Math.max(0, cap - unit.stats[k]);
        if (gain) { unit.stats[k] += gain; if (k === 'hp') unit.hp += gain; }
        gains[k] = gain;
      }
      const character = (db.units || []).find(ch => ch.id === unit.sourceId);
      const learnedSkills = Skills.learnThroughLevel(unit, cls, db.skills || [], character || {});
      ups.push({ level: unit.level, gains, learnedSkills });
    }
    if (unit.level >= s.maxLevel) unit.exp = 0;
    return ups;
  }

  // ---------- IA ennemie / alliée ----------
  /** Valeur d'un rétablissement : réveiller, libérer un soigneur/mage, puis ôter le poison. */
  function cureValue(target, which, db) {
    const cls = byId(db.classes, target.classId);
    const types = (cls && cls.weapons) || [];
    const magic = target.inventory.some(slot => {
      const w = byId(db.weapons, slot.id);
      return w && types.includes(w.type) && (w.magic || MAGIC_TYPES.includes(w.type) || w.type === 'staff');
    });
    return Statuses.list(target).filter(s => which === 'all' || s.id === which).reduce((score, s) => score +
      (s.id === 'sleep' ? 70 + (target.done ? 0 : 15) : s.id === 'silence' ? (magic ? 60 : 0) :
        12 + Math.ceil(target.stats.hp / 10) * Math.min(s.turns, 3)), 0);
  }

  function threatCounts(foes, ctx, db) {
    const danger = new Map();
    for (const foe of foes) for (const tile of threatTiles(foe, ctx, db, ['stationary', 'boss'].includes(foe.ai))) {
      danger.set(tile, (danger.get(tile) || 0) + 1);
    }
    return danger;
  }

  function planSupport(unit, friends, foes, reach, opts, difficulty, danger) {
    const { db, ctx } = opts;
    const staffs = staves(unit, db);
    const consumables = unit.inventory.map((slot, index) => ({ index, slot, item: byId(db.items, slot.id) }))
      .filter(o => o.item && o.slot.uses > 0 && (o.item.effect === 'heal' || o.item.effect === 'restore'));
    if (!staffs.length && !consumables.length && unit.ai !== 'support') return null;
    danger = danger || (difficulty === 'easy' ? new Map() : threatCounts(foes, ctx, db));
    const positionScore = stop => -(danger.get(key(stop.x, stop.y)) || 0) * (difficulty === 'hard' ? 24 : 12) - stop.cost * .05;
    let best = null;
    const offer = (stop, value, action, target, index) => {
      if (value <= 0) return;
      const score = (difficulty === 'easy' ? 20 - dist(unit, target) : value) + positionScore(stop);
      if (!best || score > best.score) best = { score, stop, action, target, index };
    };
    for (const stop of reach.values()) {
      if (!stop.canStop) continue;
      // Copie de position : la planification ne modifie jamais l'unité réelle.
      const from = { ...unit, x: stop.x, y: stop.y };
      for (const friend of friends) {
        if (friend === unit) continue;
        for (const s of staffs) {
          if (!staffCanTarget(from, friend, s.weapon)) continue;
          const value = s.weapon.restore ? cureValue(friend, s.weapon.restore, db) :
            Math.min(friend.stats.hp - friend.hp, (s.weapon.heal || 10) + unit.stats.mag) * 2 + (friend.hp <= friend.stats.hp / 2 ? 25 : 0);
          offer(stop, value, 'staff', friend, s.index);
        }
      }
      for (const c of consumables) {
        const value = c.item.effect === 'restore' ? cureValue(unit, c.item.cure, db) :
          unit.hp <= unit.stats.hp / 2 ? Math.min(unit.stats.hp - unit.hp, c.item.amount || 10) * 2 + 30 : 0;
        offer(stop, value, 'item', unit, c.index);
      }
    }
    if (best) return { score: best.score, action: best.action, moveTo: { x: best.stop.x, y: best.stop.y },
      path: pathTo(reach, best.stop.x, best.stop.y), target: best.target, weaponIndex: best.index, itemIndex: best.index };

    // Un soutien sans soin à donner accompagne son groupe ; aucun chemin à travers un mur ou un ennemi.
    if (unit.ai !== 'support') return null;
    const far = reachable(unit, ctx, 999);
    let goal = null, goalScore = -Infinity;
    for (const friend of friends) {
      if (friend === unit) continue;
      const need = Math.max(0, ...staffs.map(s => s.weapon.restore ? cureValue(friend, s.weapon.restore, db) :
        (friend.stats.hp - friend.hp) * 2));
      const ranges = staffs.length ? staffs.map(s => s.weapon) : [{ minRange: 1, maxRange: 2 }];
      for (const w of ranges) for (const pos of tilesInRange(friend.x, friend.y, w.minRange || 1, w.maxRange || 1, ctx)) {
        const node = far.get(key(pos.x, pos.y));
        if (!node || !node.canStop) continue;
        const score = need - node.cost;
        if (score > goalScore) { goalScore = score; goal = node; }
      }
    }
    if (!goal || goal.cost === 0) return null;
    let dest = reach.get(key(unit.x, unit.y));
    for (const pos of pathTo(far, goal.x, goal.y)) {
      const node = reach.get(key(pos.x, pos.y));
      if (node && node.canStop && positionScore(node) >= positionScore(dest) - 6) dest = node;
    }
    if (!dest.cost) return null;
    return { action: 'move', moveTo: { x: dest.x, y: dest.y }, path: pathTo(reach, dest.x, dest.y), target: null };
  }

  /**
   * opts = { db, settings, ctx, terrainOf(u), units? }
   * Renvoie { action: attack|staff|item|move, moveTo, path, target, weaponIndex?, itemIndex? }.
   */
  function planEnemy(unit, foes, opts) {
    if (unit.dead || unit.hp <= 0 || !Statuses.canAct(unit)) return null;
    const db = opts.db;
    const ctx = perceivedContext(unit, { ...opts.ctx, weather: opts.weather || opts.ctx.weather }, opts.units || [unit, ...foes]);
    opts = { ...opts, ctx };
    const difficulty = unit.team === 'enemy' ? normalizeAiDifficulty(opts.settings && opts.settings.aiDifficulty) : 'normal';
    foes = foes.filter(u => !u.dead && u.hp > 0 && !sameSide(unit, u) && Weather.canSee(ctx.visible, u));
    const friends = (opts.units || []).filter(u => !u.dead && u.hp > 0 && sameSide(unit, u));
    const stationary = unit.ai === 'stationary' || unit.ai === 'boss';
    const reach = stationary ? new Map([[key(unit.x, unit.y), { x: unit.x, y: unit.y, cost: 0, prev: null, canStop: true }]]) : reachable(unit, ctx);
    const danger = difficulty === 'hard' ? threatCounts(foes, ctx, db) : null;
    const support = planSupport(unit, friends, foes, reach, opts, difficulty, danger);
    if (support && support.action !== 'move' && unit.ai === 'support') return support;
    const weapons = attackWeapons(unit, db);
    let best = null;
    const ox = unit.x, oy = unit.y;
    for (const stop of reach.values()) {
      if (!stop.canStop) continue;
      for (const foe of foes) {
        const d = Math.abs(stop.x - foe.x) + Math.abs(stop.y - foe.y);
        for (const w of weapons) {
          if (d < (w.weapon.minRange || 1) || d > (w.weapon.maxRange || 1)) continue;
          unit.x = stop.x; unit.y = stop.y;
          const fc = forecast(unit, w.index, foe, opts);
          unit.x = ox; unit.y = oy;
          const estimate = estimateCombat(unit, foe, fc);
          const t = ctx.terrainAt(stop.x, stop.y);
          let score = estimate.damage * 2 + 40 * estimate.killChance - estimate.counter - 40 * estimate.deathChance + estimate.healing + (foe.isLord ? 4 : 0)
            + ((t && Number(t.avoid)) || 0) / 10 - stop.cost * 0.05;
          if (difficulty === 'easy') score = 30 - dist({ x: ox, y: oy }, foe) * 2 - stop.cost * .05;
          else {
            score += (fc.att.statusInflict || []).reduce((sum, o) => sum + ({ sleep: 15, silence: 8, poison: 4 }[o.id] || 0) * o.chance / 100 * fc.att.hit / 100, 0);
            if (difficulty === 'hard') score += 40 * estimate.killChance - estimate.counter * .5 - 60 * estimate.deathChance
              - (danger.get(key(stop.x, stop.y)) || 0) * 12;
          }
          if (!best || score > best.score) best = { score, stop, foe, index: w.index };
        }
      }
    }
    if (support && support.action !== 'move' && (!best || support.score > best.score)) return support;
    if (best) return { action: 'attack', moveTo: { x: best.stop.x, y: best.stop.y }, path: pathTo(reach, best.stop.x, best.stop.y), target: best.foe, weaponIndex: best.index };
    if (support) return support;
    if (unit.ai !== 'aggressive' || !foes.length) return null;

    // Avancer vers l'adversaire le plus proche (distance réelle de déplacement)
    const far = reachable(unit, ctx, 999);
    let goal = null;
    for (const foe of foes) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = far.get(key(foe.x + dx, foe.y + dy));
        if (n && n.canStop && (!goal || n.cost < goal.cost)) goal = n;
      }
    }
    if (!goal) return null;
    const full = pathTo(far, goal.x, goal.y);
    let dest = null;
    for (const p of full) {
      const n = reach.get(key(p.x, p.y));
      if (n && n.canStop) dest = n;
    }
    if (!dest || (dest.x === unit.x && dest.y === unit.y)) return null;
    return { action: 'move', moveTo: { x: dest.x, y: dest.y }, path: pathTo(reach, dest.x, dest.y), target: null };
  }

  return {
    STATS, STAT_LABELS, MOVE_TYPES, WEAPON_TYPES, MAGIC_TYPES, TRIANGLE, IMPASSABLE, DEFAULT_SETTINGS, GID_MASK,
    AI_DIFFICULTIES, normalizeAiDifficulty,
    clamp, dist, key, byId, makeRng, triangle, resolveGid, buildTerrainGrid, getEntry, canWield,
    attackWeapons, staves, staffCanTarget, equipped, equip, statsFromClass, makeUnitFromCharacter, makeEnemyFromPlacement,
    moveCost, reachable, perceivedContext, pathTo, tilesInRange, threatTiles, sameSide, isMagic, attackSpeed, strikeStats,
    forecast, resolveCombat, estimateCombat, phaseRecovery, combatExp, staffExp, gainExp, planEnemy,
    SUPPORT_RANKS, DEFAULT_SUPPORT, rankIndex, pairKey, rankForPoints, initSupports, partnersOf, supportBonus, supportSpecial, supportDual,
    addSupportPoints, pendingRank
  };
});
