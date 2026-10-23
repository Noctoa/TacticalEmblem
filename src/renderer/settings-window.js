/*
 * Fenêtre « Paramètres » du playtest (Échap), en chapitre comme au camp :
 *
 *   Sauvegarder   5 emplacements (barres façon Fire Emblem GBA, save-slots.js) ; au camp on sauvegarde le camp, en chapitre le début du chapitre
 *   Charger       reprend un emplacement (la partie en cours non sauvegardée est perdue)
 *   Jeu          difficulté des décisions de l'IA ennemie
 *   Son           volumes musique / jingles / effets sonores, son coupé
 *   Debug         actions de test (désactivable : Système › Playtest)
 *
 * Le moteur fournit l'état (api.G) et les actions (api.*) ; les fichiers passent par tf.*Save*.
 */
(function (root) {
  'use strict';

  function create(api) {
    const { G, h, $, R } = api;
    const S = { open: false, tab: 'save', saves: null, busy: false };
    const el = () => $('#settings');
    const TABS = () => [['save', 'Sauvegarder'], ['load', 'Charger'], ['game', 'Jeu'], ['sound', 'Son']]
      .concat(G.mode !== 'preparation' && G.settings && G.settings.debugMenu !== false ? [['debug', 'Debug']] : []);

    // ------------------------------------------------------------------
    function open(tab) {
      if (G.over && tab !== 'load' && tab !== 'save' && tab !== 'sound') tab = 'load';
      S.open = true; S.tab = tab || S.tab;
      if (!TABS().some(t => t[0] === S.tab)) S.tab = 'save';
      S.prevUi = G.ui; G.ui = 'settings';
      api.hideMenu();
      document.body.classList.add('in-settings');
      api.Music.se('confirm');
      refresh();
    }
    function close() {
      if (!S.open) return;
      S.open = false;
      el().classList.add('hidden'); el().innerHTML = '';
      document.body.classList.remove('in-settings');
      G.ui = S.prevUi && S.prevUi !== 'settings' ? S.prevUi : 'idle';
      if (G.ui === 'menu' || G.ui === 'mapmenu' || G.ui === 'lobbymenu' || G.ui === 'items') G.ui = 'idle';
      api.Music.se('cancel');
      api.afterClose();
    }
    async function refresh(focusIndex) {
      if (!S.open) return;
      if (S.tab === 'save' || S.tab === 'load') {
        try { S.saves = await tf.listSaves(api.dir); } catch (e) { S.saves = []; UI.toast(e.message); }
      }
      render(focusIndex);
    }
    function render(focusIndex) {
      const box = el();
      box.classList.remove('hidden'); box.innerHTML = '';
      const body = h('div', { class: 'st-body' });
      box.append(
        h('div', { class: 'st-head' }, h('h3', {}, 'Paramètres'), h('span', { class: 'st-where' }, where()),
          h('button', { class: 'st-close st-focus', onclick: close }, 'Fermer ✕')),
        h('div', { class: 'st-tabs' }, TABS().map(([k, label]) => h('button', { class: 'st-tab st-focus' + (k === S.tab ? ' on' : ''), onclick: () => { S.tab = k; api.Music.se('cursor'); refresh(); } }, label))),
        body);
      ({ save: renderSave, load: renderLoad, game: renderGame, sound: renderSound, debug: renderDebug })[S.tab](body);
      const items = focusables();
      const i = focusIndex !== undefined ? Math.min(focusIndex, items.length - 1) : items.findIndex(b => b.classList.contains('on'));
      if (items[Math.max(0, i)]) items[Math.max(0, i)].focus();
    }
    const focusables = () => [...el().querySelectorAll('.st-focus:not([disabled])')];
    function rerender() { const items = focusables(); refresh(Math.max(0, items.indexOf(document.activeElement))); }
    function where() {
      if (G.mode === 'lobby') return `${api.lobbyName()} · ${(G.campaign.gold || 0).toLocaleString('fr-FR')} or`;
      if (G.mode === 'preparation') return `${G.chapter.name} · Préparatifs`;
      if (G.chapter) return `${G.chapter.name} · tour ${G.turn}`;
      return '';
    }

    // ------------------------------------------------------------------
    // Sauvegarde / chargement
    // ------------------------------------------------------------------
    // emplacements façon Fire Emblem GBA : save-slots.js (barres vertes, main-curseur, PLAYTIME)
    const describe = (s) => SaveSlots.describe(s, { G, R, lobbyName: api.lobbyName && api.lobbyName() });
    function slotRow(s, onClick, extra, disabled) {
      return h('div', { class: 'sv-row st-slot' + (s.exists ? '' : ' empty') }, SaveSlots.element(s, describe(s), { onClick, disabled, cls: 'st-focus st-go' }), extra || null);
    }
    function renderSave(body) {
      const can = api.canSave();
      body.append(h('p', { class: 'st-info' }, !can.ok ? can.reason : G.mode === 'lobby'
        ? 'Sauvegarde du camp : or, objets, chapitres terminés, conversations vues.'
        : G.mode === 'preparation' ? 'Sauvegarde des préparatifs : personnages sélectionnés et positions de départ. La bataille n’a pas encore commencé.'
        : `En chapitre, la sauvegarde enregistre le début de « ${G.chapter.name} » (comme les Fire Emblem) : la partie reprendra au début de ce chapitre.`));
      body.append(h('div', { class: 'sv-list' }, (S.saves || []).map(s => slotRow(s, () => save(s), null, !can.ok))));
    }
    async function save(s) {
      if (S.busy) return;
      if (s.exists && !(await UI.confirm(`Écraser l'emplacement ${s.slot} (${describe(s).title}) ?`, { ok: 'Écraser' }))) return rerender();
      S.busy = true;
      try {
        const data = api.makeSave();
        await tf.saveCampaign(api.dir, data, s.slot);
        api.Music.se('confirm');
        UI.toast(`Partie sauvegardée — emplacement ${s.slot}`);
      } catch (e) { await UI.alert('Sauvegarde impossible', e.message); }
      finally { S.busy = false; }
      rerender();
    }
    function renderLoad(body) {
      body.append(h('p', { class: 'st-info' }, 'Reprendre une sauvegarde. Ce qui n\'a pas été sauvegardé depuis sera perdu.'));
      body.append(h('div', { class: 'sv-list' }, (S.saves || []).map(s => slotRow(s, () => load(s),
        s.exists ? h('button', { class: 'st-del st-focus', title: 'Effacer cet emplacement', onclick: () => remove(s) }, 'Effacer') : h('span', { class: 'st-del-space' }),
        !s.exists || !!s.error))));
    }
    async function load(s) {
      if (S.busy) return;
      if (!(await UI.confirm(`Charger l'emplacement ${s.slot} (${describe(s).title}) ? La partie en cours non sauvegardée sera perdue.`, { ok: 'Charger' }))) return rerender();
      S.busy = true;
      try {
        const data = await tf.loadCampaign(api.dir, s.slot);
        close();
        await api.startFromSave(data);
        UI.toast(`Emplacement ${s.slot} chargé`);
      } catch (e) { await UI.alert('Chargement impossible', e.message); }
      finally { S.busy = false; }
    }
    async function remove(s) {
      if (!(await UI.confirm(`Effacer l'emplacement ${s.slot} (${describe(s).title}) ?`, { danger: true, ok: 'Effacer' }))) return rerender();
      try { await tf.removeSave(api.dir, s.slot); } catch (e) { UI.toast(e.message); }
      rerender();
    }

    // ------------------------------------------------------------------
    // Jeu
    // ------------------------------------------------------------------
    function renderGame(body) {
      const current = R.normalizeAiDifficulty(G.settings.aiDifficulty);
      const select = h('select', { class: 'st-focus', 'data-ai-difficulty': '' },
        R.AI_DIFFICULTIES.map(d => h('option', { value: d.value }, d.label)));
      select.value = current;
      const description = h('p', { class: 'st-info' }, R.AI_DIFFICULTIES.find(d => d.value === current).description);
      select.addEventListener('change', () => {
        G.settings.aiDifficulty = R.normalizeAiDifficulty(select.value);
        description.textContent = R.AI_DIFFICULTIES.find(d => d.value === G.settings.aiDifficulty).description;
        api.Music.se('confirm');
      });
      body.append(h('label', { class: 'st-check' }, h('span', {}, 'Difficulté de l’IA ennemie'), select), description,
        h('p', { class: 'st-info' }, 'S’applique aux prochaines décisions ennemies, sans changer leurs statistiques ni leurs chances de réussite. Les alliés conservent une IA normale. Ce choix est conservé quand tu sauvegardes la partie.'));
      const weather = h('input', { type: 'checkbox', class: 'st-focus', 'data-weather-effects': '' });
      weather.checked = G.settings.weatherEffects !== false;
      weather.addEventListener('change', () => { G.settings.weatherEffects = weather.checked; api.Music.se('confirm'); });
      body.append(h('label', { class: 'st-check' }, weather, h('span', {}, 'Afficher les effets météo')),
        h('p', { class: 'st-info' }, 'Masque les animations météo sur la carte et en combat. Les effets tactiques du climat et le brouillard de guerre restent actifs. Le choix est conservé dans ta sauvegarde.'));
    }

    // ------------------------------------------------------------------
    // Son
    // ------------------------------------------------------------------
    function renderSound(body) {
      const st = api.Music.state();
      const slider = (channel, label, hint) => {
        const value = h('span', { class: 'st-val' }, Math.round(st.volumes[channel] * 100) + ' %');
        const input = h('input', { type: 'range', min: 0, max: 100, step: 5, class: 'st-focus' });
        input.value = Math.round(st.volumes[channel] * 100);
        input.addEventListener('input', () => { api.Music.setVolume(channel, input.value / 100); value.textContent = input.value + ' %'; });
        input.addEventListener('change', () => api.Music.preview(channel));
        return h('label', { class: 'st-slider' }, h('span', { class: 'st-name' }, label, hint ? h('small', {}, hint) : null), input, value);
      };
      const mute = h('input', { type: 'checkbox', class: 'st-focus' }); mute.checked = st.muted;
      mute.addEventListener('change', () => { api.Music.setMuted(mute.checked); rerender(); });
      body.append(
        slider('music', 'Musique', 'musiques de phase et du camp'),
        slider('me', 'Jingles', 'montée de niveau, victoire, game over'),
        slider('se', 'Effets sonores', 'curseur, menus, coups'),
        h('label', { class: 'st-check' }, mute, h('span', {}, 'Couper tout le son (touche M)')),
        h('p', { class: 'st-info' }, 'Réglages propres à ce poste, gardés d\'une partie à l\'autre. Le volume général et les sons choisis se règlent dans l\'éditeur (Base de données › Système).'));
    }

    // ------------------------------------------------------------------
    // Debug
    // ------------------------------------------------------------------
    function renderDebug(body) {
      const D = G.debug;
      const btn = (label, fn, opts) => h('button', { class: 'st-btn st-focus' + (opts && opts.danger ? ' danger' : ''), disabled: opts && opts.disabled, onclick: async () => { await fn(); api.Music.se('confirm'); rerender(); } }, label);
      const toggle = (key, label, hint) => {
        const cb = h('input', { type: 'checkbox', class: 'st-focus' }); cb.checked = !!D[key];
        cb.addEventListener('change', () => { D[key] = cb.checked; api.debugChanged(key); UI.toast(`${label} : ${cb.checked ? 'oui' : 'non'}`); });
        return h('label', { class: 'st-check' }, cb, h('span', {}, label, hint ? h('small', {}, ' — ' + hint) : null));
      };
      const group = (title, ...items) => body.append(h('div', { class: 'st-group' }, h('h4', {}, title), h('div', { class: 'st-row' }, ...items.filter(Boolean))));
      const inChapter = G.mode === 'chapter' && G.chapter && !G.over;
      const cur = inChapter ? api.unitAtCursor() : null;

      group('Interrupteurs', toggle('god', 'Invincibilité', 'mes unités ne perdent pas de PV'),
        toggle('move', 'Déplacement illimité', '99 cases pour mes unités (murs et eau restent infranchissables)'),
        toggle('passive', 'Ennemis passifs', 'les ennemis ne jouent plus'));
      if (inChapter) {
        group('Chapitre',
          btn('Victoire immédiate', api.debug.win),
          btn('Défaite immédiate', api.debug.lose, { danger: true }),
          btn('Vaincre tous les ennemis', api.debug.killEnemies),
          btn('Soigner mes unités', api.debug.healAll),
          btn('Mes unités rejouent', api.debug.refresh),
          btn('Tour suivant', api.debug.endTurn));
        group(cur ? `Unité sous le curseur : ${cur.name} (Nv ${cur.level}, ${cur.hp}/${cur.stats.hp} PV)` : 'Unité sous le curseur : place le curseur sur une unité',
          btn('+1 niveau', () => api.debug.levelUp(cur), { disabled: !cur }),
          btn('+5 niveaux', () => api.debug.levelUp(cur, 5), { disabled: !cur }),
          btn('PV au maximum', () => api.debug.heal(cur), { disabled: !cur }),
          btn('Vaincre', () => api.debug.kill(cur), { disabled: !cur, danger: true }));
      }
      const goods = G.db.weapons.concat(G.db.items);
      const item = h('select', { class: 'st-focus' }, goods.map(e => h('option', { value: e.id }, e.name)));
      if (S.item) item.value = S.item;
      item.addEventListener('change', () => { S.item = item.value; });
      group('Partie',
        btn('+1 000 or', () => api.debug.gold(1000)),
        btn('+10 000 or', () => api.debug.gold(10000)),
        ...Extensions.list('debug').map(d => btn(d.label, () => api.debug.plugin(d))),
        h('span', { class: 'st-inline' }, item, btn('Ajouter au convoi', () => api.debug.addItem(item.value))),
        btn('Affinités +20 (toutes les paires)', api.debug.supports));
      if (G.lobbyOn) {
        const chSel = h('select', { class: 'st-focus' }, G.db.chapters.map(c => h('option', { value: c.id }, ((G.campaign.cleared || []).includes(c.id) ? '✓ ' : '') + Lobby.actLabel(G.db, c.id))));
        if (S.chapter) chSel.value = S.chapter;
        chSel.addEventListener('change', () => { S.chapter = chSel.value; });
        group('Progression (lobby)',
          h('span', { class: 'st-inline' }, chSel, btn('Marquer terminé', () => api.debug.clear(chSel.value))),
          btn('Tout marquer terminé', api.debug.clearAll),
          btn('Revoir les conversations', api.debug.resetTalks),
          G.mode === 'chapter' ? btn('Retour au camp', api.debug.toLobby) : null);
      }
      body.append(h('p', { class: 'st-info' }, 'Outils de test du playtest. Les actions s\'appliquent à la partie en cours ; rien n\'est sauvegardé tant que tu ne sauvegardes pas.'));
    }

    // ------------------------------------------------------------------
    /** Touche pressée pendant que la fenêtre est ouverte. */
    function key(e) {
      const k = e.key;
      const tag = document.activeElement && document.activeElement.tagName;
      if (k === 'Escape' || ((k === 'x' || k === 'X') && tag !== 'SELECT' && tag !== 'INPUT')) { e.preventDefault(); return close(); }
      const items = focusables();
      const i = items.indexOf(document.activeElement);
      if (tag === 'INPUT' && document.activeElement.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return; // curseur de volume
      if (tag === 'SELECT' && (k === 'ArrowUp' || k === 'ArrowDown')) return;
      if (k === 'ArrowDown' || k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); items[(i + 1) % items.length].focus(); api.Music.se('cursor'); }
      else if (k === 'ArrowUp' || k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); api.Music.se('cursor'); }
      else if (['z', 'Z', 'Enter', ' '].includes(k)) {
        e.preventDefault();
        const a = document.activeElement;
        if (a && a.type === 'checkbox') { a.checked = !a.checked; a.dispatchEvent(new Event('change')); }
        else if (a && a.tagName === 'BUTTON') a.click(); // emplacements compris (barres)
      }
      else if (k === 'q' || k === 'e') { // onglet précédent / suivant
        const t = TABS(); const j = t.findIndex(x => x[0] === S.tab);
        S.tab = t[(j + (k === 'e' ? 1 : -1) + t.length) % t.length][0]; refresh();
      }
    }

    return { open, close, key, refresh, get isOpen() { return S.open; } };
  }

  root.SettingsWindow = { create };
})(self);
