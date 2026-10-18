/* Règles de chapitre pures, communes à l'éditeur, au jeu et aux tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mission = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const objectives = ch => [ch.objective || { type: 'rout' }, ...(ch.extraObjectives || [])];
  const friends = ch => [...(ch.players || []), ...(ch.allies || [])];
  const required = (ch, db) => Array.isArray(ch.requiredUnits) ? ch.requiredUnits :
    (ch.players || []).filter(p => (db.units.find(u => u.id === p.unitId) || {}).isLord).map(p => p.unitId);
  const seizers = (ch, db) => Array.isArray(ch.seizeUnits) ? ch.seizeUnits :
    (ch.players || []).filter(p => (db.units.find(u => u.id === p.unitId) || {}).isLord).map(p => p.unitId);
  const down = u => u.dead || u.hp <= 0;
  const inside = (u, z) => u.x >= z.x && u.y >= z.y && u.x < z.x + z.w && u.y < z.y + z.h;
  function label(ob, ch) {
    if (ob.text) return ob.text;
    return { rout: 'Mettre en déroute', boss: 'Vaincre tous les boss',
      target: 'Vaincre ' + (((ch.enemies || []).find(e => e.id === ob.target) || {}).name || ob.target || 'la cible'),
      seize: `Prendre le point (${ob.x || 0}, ${ob.y || 0})`, survive: `Survivre ${ob.turns || 10} tours complets` }[ob.type] || 'Objectif inconnu';
  }
  function validate(ch, db, map) {
    const errors = [];
    const placed = friends(ch).map(p => p.unitId);
    const known = id => db.units.some(u => u.id === id) && placed.includes(id);
    const point = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
    for (const id of required(ch, db)) if (!known(id)) errors.push(`Personnage à protéger absent du chapitre : ${id}.`);
    for (const [i, ob] of objectives(ch).entries()) {
      if (!['rout', 'boss', 'target', 'seize', 'survive'].includes(ob.type)) errors.push(`Objectif ${i + 1} inconnu.`);
      if (ob.type === 'target' && !(ch.enemies || []).some(e => e.id === ob.target)) errors.push(`Objectif ${i + 1} : cible ennemie introuvable.`);
      if (ob.type === 'boss' && !(ch.enemies || []).some(e => e.isBoss)) errors.push('Aucun boss placé pour cet objectif.');
      if (ob.type === 'survive' && (!Number.isInteger(ob.turns) || ob.turns < 1)) errors.push('La durée de survie doit être un nombre entier positif.');
      if (ob.type === 'seize') {
        if (!point(ob.x, ob.y)) errors.push('Le point à prendre est hors de la map.');
        if (!seizers(ch, db).length) errors.push('Aucun personnage autorisé à prendre les points.');
        for (const id of seizers(ch, db)) if (!known(id)) errors.push(`Personnage autorisé à prendre les points absent : ${id}.`);
      }
    }
    for (const k of ['turnLimit', 'lossLimit']) if (ch[k] != null && (!Number.isInteger(ch[k]) || ch[k] < 0)) errors.push('Les limites doivent être des nombres entiers positifs ou zéro.');
    const z = ch.defendZone;
    if (z && z.enabled && (!Number.isInteger(z.w) || !Number.isInteger(z.h) || z.w < 1 || z.h < 1 || !point(z.x, z.y) || !point(z.x + z.w - 1, z.y + z.h - 1))) errors.push('La zone à défendre doit être entièrement dans la map.');
    return [...new Set(errors)];
  }
  function canSeize(ch, db, u) {
    return u && !down(u) && u.team !== 'enemy' && seizers(ch, db).includes(u.sourceId) &&
      objectives(ch).some(ob => ob.type === 'seize' && ob.x === u.x && ob.y === u.y);
  }
  function evaluate(ch, db, state) {
    const units = state.units || [], pending = state.pending || [];
    const foes = [...units, ...pending].filter(u => u.team === 'enemy');
    const live = units.filter(u => !down(u));
    const completedTurns = (state.turn || 1) - 1;
    let reason = '';
    for (const id of required(ch, db)) {
      const u = units.find(u => u.team !== 'enemy' && u.sourceId === id);
      if (!u || down(u)) { reason = `${(db.units.find(c => c.id === id) || {}).name || id} doit survivre à ce chapitre.`; break; }
    }
    if (!reason && ch.defeatAll !== false && !live.some(u => u.team === 'player')) reason = 'Toutes vos unités ont été vaincues.';
    if (!reason && ch.defendZone && ch.defendZone.enabled && live.some(u => u.team === 'enemy' && inside(u, ch.defendZone))) reason = 'Un ennemi a atteint la zone à défendre.';
    if (!reason && ch.lossLimit > 0 && units.filter(u => u.team !== 'enemy' && down(u)).length >= ch.lossLimit) reason = `La limite de ${ch.lossLimit} perte(s) est atteinte.`;
    const progress = objectives(ch).map(ob => {
      switch (ob.type) {
        case 'rout': return !(ob.includeReinforcements === false ? units : foes).some(u => u.team === 'enemy' && !down(u));
        case 'boss': { const b = foes.filter(u => u.isBoss); return b.length > 0 && b.every(down); }
        case 'target': { const target = foes.find(u => u.sourceId === ob.target); return !!target && down(target); }
        case 'survive': return completedTurns >= (ob.turns || 10);
        case 'seize': return (state.seized || []).includes(`${ob.x},${ob.y}`);
        default: return false;
      }
    });
    const won = ch.victoryMode === 'any' ? progress.some(Boolean) : progress.every(Boolean);
    // Une victoire acquise à la fin du dernier tour autorisé reste valide.
    if (!reason && !won && ch.turnLimit > 0 && completedTurns >= ch.turnLimit) reason = 'La limite de tours est atteinte.';
    return { outcome: reason ? 'defeat' : won ? 'victory' : null, reason, progress };
  }
  return { objectives, required, seizers, label, validate, canSeize, evaluate };
});
