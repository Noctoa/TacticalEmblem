(function (root) {
  'use strict';
  function create(api) {
    const { G, R } = api;
    const no = error => ({ ok: false, error });
    async function action(a, data) {
      switch (a.type) {
        case 'dialogue': await api.playDialogue(a.text); break;
        case 'gold': G.campaign.gold = (G.campaign.gold || 0) + a.amount; UI.toast(`+${a.amount} or`); break;
        case 'orbs': Summon.addOrbs(G.campaign, a.amount); UI.toast(`+${a.amount} orbes`); break;
        case 'flag': Scenario.setFlag(G.campaign, a.key, a.value); break;
        case 'choice': {
          let value = null;
          // Fermer la boîte ne choisit pas une réponse à la place du joueur.
          while (value === null) value = await UI.modal((box, close) => {
            box.append(UI.h('h3', {}, a.text), UI.h('div', { class: 'choice-list' },
              UI.h('button', { 'data-scenario-choice': 'true', onclick: () => close(true) }, a.yes),
              UI.h('button', { 'data-scenario-choice': 'false', onclick: () => close(false) }, a.no)));
          });
          Scenario.setFlag(G.campaign, a.key, value); break;
        }
        case 'item': {
          const recipient = a.unitId ? G.units.find(u => u.team === 'player' && u.sourceId === a.unitId && !u.dead && u.hp > 0) : null;
          const result = Villages.rewardOffer({ itemId: a.itemId, uses: a.uses }, recipient ? recipient.inventory : Array(5), { convoy: G.convoy, capacity: G.convoyCap }, G.db);
          if (!result.ok) return no('Récompense en attente : libère une place dans le convoi ou l’inventaire du destinataire.');
          (result.destination === 'unit' ? recipient.inventory : G.convoy).push(result.slot);
          UI.toast(`${R.getEntry(G.db, a.itemId).def.name} reçu (${result.destination === 'unit' ? recipient.name : 'convoi'}).`); break;
        }
        case 'reinforcement': {
          const unit = G.pending.find(u => u.sourceId === a.target);
          if (!unit) break; // Un ennemi déjà apparu, même vaincu, ne revient jamais.
          const spot = api.freeSpotNear(unit.x, unit.y, unit);
          if (!spot) return no(`Renfort en attente : aucune case accessible près de ${unit.name}.`);
          G.pending.splice(G.pending.indexOf(unit), 1); Object.assign(unit, spot, { rx: spot.x, ry: spot.y, alpha: 1, done: true });
          G.units.push(unit); api.float(unit.x, unit.y, 'Renfort !', '#ff9a8a'); break;
        }
        case 'door': {
          const door = G.chapter.doors.find(d => d.id === a.target), wasOpen = G.openedDoors.has(door.id);
          if (!a.open && G.units.some(u => !u.dead && u.hp > 0 && u.x === door.x && u.y === door.y)) return no(`Fermeture en attente : libère la case de ${door.name}.`);
          if (a.open) G.openedDoors.add(door.id); else G.openedDoors.delete(door.id);
          if (a.open && !wasOpen) return { ok: true, signals: [{ type: 'door', data: { target: door.id, unit: data.unit } }] };
          break;
        }
        case 'objective': {
          const objective = JSON.parse(JSON.stringify(a.objective));
          if (objective.type === 'survive') {
            const duration = objective.turns; objective.turns += G.turn - 1;
            if (!objective.text) objective.text = `Survivre ${duration} tours (jusqu’à la fin du tour ${objective.turns})`;
          }
          G.chapter.objective = objective; G.chapter.extraObjectives = []; G.chapter.victoryMode = 'all'; G.seized = [];
          UI.toast('Nouvel objectif : ' + Mission.label(objective, G.chapter)); break;
        }
      }
      return { ok: true };
    }
    return { action };
  }
  root.ScenarioRuntime = { create };
})(self);
