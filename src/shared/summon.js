/*
 * Invocations façon Fire Emblem Heroes : bannières, cercle de 5 pierres de couleur, orbes, pitié,
 * recrutement du personnage invoqué ou fusion (+1, jusqu'à +10) s'il est déjà dans l'équipe.
 * La rareté (3★ / 4★ / 5★) est fixée sur la fiche du personnage : elle ne décide que de sa probabilité.
 * Indépendant du rendu (testé dans test/summon.test.js).
 */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./lobby.js') : root.Lobby,
    common ? require('./roster.js') : root.Roster, common ? require('./team.js') : root.Team);
  if (common) module.exports = api; else root.Summon = api;
})(typeof self !== 'undefined' ? self : this, function (Rules, Lobby, Roster, Team) {
  'use strict';
  const byId = (list, id) => (list || []).find(e => e && e.id === id);
  const RARITIES = [5, 4, 3];
  const MAX_MERGES = 10;
  // couleur de la pierre = première arme du personnage (comme les armes rouges / bleues / vertes / incolores de FEH)
  const COLORS = [
    { id: 'red', name: 'Rouge', weapons: ['sword', 'anima'], css: '#e0483c' },
    { id: 'blue', name: 'Bleu', weapons: ['lance', 'light'], css: '#3f7fe6' },
    { id: 'green', name: 'Vert', weapons: ['axe', 'dark'], css: '#3fae4f' },
    { id: 'colorless', name: 'Incolore', weapons: ['bow', 'staff'], css: '#a9a9b4' }
  ];
  const DEFAULT_SETTINGS = { enabled: true, startOrbs: 20, costs: [5, 4, 4, 4, 3], pityEvery: 5, pityStep: 0.5 };
  const DEFAULT_RATES = { 5: 6, 4: 58, 3: 36 };

  function settings(meta) {
    const s = Object.assign({}, DEFAULT_SETTINGS, (meta && meta.summon) || {});
    s.costs = Array.isArray(s.costs) && s.costs.length === 5 ? s.costs.map(c => Math.max(0, Math.floor(Number(c) || 0))) : DEFAULT_SETTINGS.costs.slice();
    return s;
  }
  function rarityOf(unit) { const r = Number(unit && unit.rarity); return RARITIES.includes(r) ? r : 3; }
  function colorOf(unit, db) {
    const first = Roster.weaponTypesOf(unit, db)[0];
    return COLORS.find(c => c.weapons.includes(first)) || COLORS[3];
  }
  function normalizeBanner(b) {
    const out = Object.assign({ name: 'Invocation', description: '', pool: [], focus: [], focusShare: 50 }, b || {});
    out.rates = Object.assign({}, DEFAULT_RATES, out.rates || {});
    out.unlock = Object.assign({ after: '', alive: [], from: '', to: '' }, out.unlock || {});
    out.pool = Array.isArray(out.pool) ? out.pool : [];
    out.focus = Array.isArray(out.focus) ? out.focus : [];
    return out;
  }

  // ---------- orbes et état de la campagne ----------
  /** Champs d'invocation de la campagne (anciennes sauvegardes comprises). */
  function ensure(campaign, meta) {
    if (!Number.isFinite(campaign.orbs) || campaign.orbs < 0) campaign.orbs = 0;
    if (!campaign.summons || typeof campaign.summons !== 'object') { // première fois : orbes de départ
      campaign.summons = {};
      campaign.orbs += settings(meta).startOrbs;
    }
    campaign.summons.pity = campaign.summons.pity || {};
    campaign.summons.total = campaign.summons.total || 0;
    campaign.merges = campaign.merges && typeof campaign.merges === 'object' ? campaign.merges : {};
    return campaign;
  }
  function addOrbs(campaign, n) { campaign.orbs = Math.max(0, (Number(campaign.orbs) || 0) + Math.max(0, Math.floor(Number(n) || 0))); return campaign.orbs; }

  // ---------- bannières ----------
  /** Personnages invocables d'une bannière : existants, vivants (en Classique, un mort ne revient pas). */
  function poolOf(banner, db, campaign) {
    const dead = (campaign && campaign.dead) || [];
    return [...new Set(banner.pool.concat(banner.focus))].map(id => byId(db.units, id)).filter(u => u && !dead.includes(u.id));
  }
  /** Bannières affichées à l'autel : [{ banner, reasons, upcoming, pool }]. Les bannières terminées (date passée) disparaissent. */
  function banners(db, campaign, now) {
    const progress = Lobby.progressOf(campaign);
    const out = [];
    for (const raw of db.banners || []) {
      const banner = normalizeBanner(raw);
      const c = Lobby.conditions(banner.unlock, db, progress, now);
      const d = Lobby.today(now);
      if (banner.unlock.to && /^\d{4}-\d{2}-\d{2}$/.test(banner.unlock.to) && d > banner.unlock.to) continue;
      const pool = poolOf(banner, db, campaign);
      if (!pool.length) continue;
      out.push({ banner, reasons: c.reasons, upcoming: c.dateOnly, open: !c.reasons.length, pool });
    }
    return out;
  }
  /** Bonus de pitié (en points de %) : +step tous les « every » invocations sans 5★ sur cette bannière. */
  function pityBonus(campaign, banner, meta) {
    const s = settings(meta);
    const n = ((campaign.summons && campaign.summons.pity) || {})[banner.id] || 0;
    return s.pityEvery > 0 ? Math.floor(n / s.pityEvery) * s.pityStep : 0;
  }
  /**
   * Taux effectifs (en %) d'une bannière, pitié comprise : { focus, 5, 4, 3 } (focus = 5★ mis en avant).
   * La pitié s'ajoute aux 5★ et se retire des 4★ / 3★ proportionnellement. Une rareté sans personnage
   * dans la bannière rend son taux aux autres.
   */
  function rates(banner, db, campaign, meta) {
    const b = normalizeBanner(banner), pool = poolOf(b, db, campaign);
    const has = r => pool.some(u => rarityOf(u) === r && !b.focus.includes(u.id)); // hors personnages mis en avant
    const focusUnits = pool.filter(u => b.focus.includes(u.id));
    let r5 = Math.max(0, Number(b.rates[5]) || 0), r4 = Math.max(0, Number(b.rates[4]) || 0), r3 = Math.max(0, Number(b.rates[3]) || 0);
    const bonus = pityBonus(campaign || {}, b, meta);
    if (bonus > 0 && r4 + r3 > 0) { const sum = r4 + r3, take = Math.min(bonus, sum); r4 -= take * r4 / sum; r3 -= take * r3 / sum; r5 += take; }
    // rendre le taux des raretés vides
    const tiers = { 5: r5, 4: r4, 3: r3 };
    const focusShare = Math.max(0, Math.min(100, Number(b.focusShare) || 0));
    let focus = focusUnits.length ? tiers[5] * focusShare / 100 : 0;
    let five = tiers[5] - focus;
    if (!pool.some(u => rarityOf(u) === 5 && !b.focus.includes(u.id))) { if (focusUnits.length) focus += five; five = 0; }
    const out = { focus, 5: five, 4: has(4) ? tiers[4] : 0, 3: has(3) ? tiers[3] : 0 };
    const total = out.focus + out[5] + out[4] + out[3];
    if (total <= 0) return { focus: 0, 5: 0, 4: 0, 3: 0, pity: bonus };
    for (const k of Object.keys(out)) out[k] = out[k] * 100 / total;
    out.pity = bonus;
    return out;
  }

  /** Tire un personnage selon les taux : { unit, rarity, focus }. */
  function roll(banner, db, campaign, meta, rng) {
    const b = normalizeBanner(banner), pool = poolOf(b, db, campaign), r = rates(b, db, campaign, meta);
    const pick = list => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
    let x = rng() * 100;
    const tiers = [['focus', pool.filter(u => b.focus.includes(u.id))], [5, pool.filter(u => rarityOf(u) === 5 && !b.focus.includes(u.id))],
      [4, pool.filter(u => rarityOf(u) === 4 && !b.focus.includes(u.id))], [3, pool.filter(u => rarityOf(u) === 3 && !b.focus.includes(u.id))]];
    for (const [tier, list] of tiers) {
      if (!r[tier] || !list.length) continue;
      if (x < r[tier]) { const u = pick(list); return { unit: u, rarity: rarityOf(u), focus: tier === 'focus' }; }
      x -= r[tier];
    }
    const any = tiers.filter(t => t[1].length).pop(); // arrondis
    const u = pick(any[1]);
    return { unit: u, rarity: rarityOf(u), focus: any[0] === 'focus' };
  }

  /** Nouvelle séance : cercle de 5 pierres. Les couleurs sont visibles, les personnages cachés. */
  function circle(banner, db, campaign, meta, rng) {
    const stones = [];
    for (let i = 0; i < 5; i++) {
      const r = roll(banner, db, campaign, meta, rng || Math.random);
      const color = colorOf(r.unit, db);
      stones.push({ unitId: r.unit.id, rarity: r.rarity, focus: r.focus, color: color.id, opened: false, result: null });
    }
    return { bannerId: banner.id, stones, pulled: 0 };
  }
  /** Coût de la prochaine pierre de la séance (5, 4, 4, 4, 3 par défaut). */
  function nextCost(session, meta) { return session.pulled < 5 ? settings(meta).costs[session.pulled] : 0; }

  /**
   * Ouvre une pierre : retire les orbes, met à jour la pitié, recrute ou fusionne.
   * Renvoie { ok, stone, result: { unitId, rarity, focus, isNew, merges, maxed } } ou { ok: false, error }.
   */
  function open(session, index, campaign, db, meta) {
    ensure(campaign, meta);
    const stone = session.stones[index];
    if (!stone || stone.opened) return { ok: false, error: 'Pierre déjà ouverte.' };
    const cost = nextCost(session, meta);
    if (campaign.orbs < cost) return { ok: false, error: `Il faut ${cost} orbe(s).` };
    campaign.orbs -= cost;
    session.pulled++;
    campaign.summons.total++;
    const pity = campaign.summons.pity;
    pity[session.bannerId] = stone.rarity === 5 ? 0 : (pity[session.bannerId] || 0) + 1;
    const result = Object.assign({ unitId: stone.unitId, rarity: stone.rarity, focus: stone.focus, cost }, receive(campaign, db, meta, stone.unitId));
    stone.opened = true; stone.result = result;
    return { ok: true, stone, result };
  }

  /** Le personnage invoqué rejoint l'équipe, ou gagne une fusion s'il y est déjà. */
  function receive(campaign, db, meta, unitId) {
    ensure(campaign, meta);
    const recruited = Team.sync(campaign, db, meta || {});
    if (!recruited.includes(unitId)) {
      campaign.recruited = [...new Set([...(campaign.recruited || []), unitId])];
      return { isNew: true, merges: campaign.merges[unitId] || 0, maxed: false };
    }
    const n = campaign.merges[unitId] || 0;
    if (n >= MAX_MERGES) return { isNew: false, merges: n, maxed: true };
    campaign.merges[unitId] = n + 1;
    return { isNew: false, merges: n + 1, maxed: false };
  }

  // ---------- fusions ----------
  /** Ordre des stats qui montent avec les fusions : les plus hautes du personnage d'abord (comme FEH). */
  function mergeOrder(character) {
    const base = (character && character.stats) || {};
    return Rules.STATS.slice().sort((a, b) => (Number(base[b]) || 0) - (Number(base[a]) || 0) || Rules.STATS.indexOf(a) - Rules.STATS.indexOf(b));
  }
  /** Points de stats donnés par n fusions : chaque fusion +1 à deux stats, en tournant dans l'ordre. */
  function mergeBonus(character, n) {
    const order = mergeOrder(character), out = {};
    for (let k = 0; k < 2 * Math.max(0, Math.min(MAX_MERGES, n || 0)); k++) { const st = order[k % order.length]; out[st] = (out[st] || 0) + 1; }
    return out;
  }
  /**
   * Applique à une unité les fusions pas encore comptées dans ses stats (unit.merges = fusions déjà appliquées).
   * Sans effet si elles le sont toutes : on peut l'appeler à chaque chargement.
   */
  function applyMerges(unit, character, target) {
    const done = Math.max(0, Number(unit.merges) || 0), want = Math.max(0, Math.min(MAX_MERGES, Number(target) || 0));
    if (want <= done) return unit;
    const before = mergeBonus(character, done), after = mergeBonus(character, want);
    let hpUp = 0;
    for (const st of Rules.STATS) {
      const d = (after[st] || 0) - (before[st] || 0);
      if (!d) continue;
      unit.stats[st] = (unit.stats[st] || 0) + d;
      if (st === 'hp') hpUp = d;
    }
    if (Number.isFinite(unit.hp)) unit.hp = Math.min(unit.stats.hp, unit.hp + hpUp);
    unit.merges = want;
    return unit;
  }

  /** Erreurs de configuration des bannières. */
  function validate(db) {
    const errors = [];
    for (const raw of db.banners || []) {
      const b = normalizeBanner(raw);
      const name = b.name || b.id;
      if (![...b.pool, ...b.focus].length) errors.push(`Bannière « ${name} » : aucun personnage.`);
      for (const id of [...b.pool, ...b.focus]) if (!byId(db.units, id)) errors.push(`Bannière « ${name} » : personnage supprimé (${id}).`);
      if (['5', '4', '3'].reduce((s, k) => s + (Number(b.rates[k]) || 0), 0) <= 0) errors.push(`Bannière « ${name} » : tous les taux sont à 0.`);
    }
    return errors;
  }

  return { RARITIES, MAX_MERGES, COLORS, DEFAULT_SETTINGS, DEFAULT_RATES, settings, rarityOf, colorOf, normalizeBanner, ensure, addOrbs,
    poolOf, banners, pityBonus, rates, roll, circle, nextCost, open, receive, mergeOrder, mergeBonus, applyMerges, validate };
});
