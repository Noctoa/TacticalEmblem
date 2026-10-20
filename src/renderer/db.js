/* Fenêtre « Base de données » : listes + formulaires générés. */
(function () {
  'use strict';
  const { h } = UI;
  const $ = (s) => document.querySelector(s);
  const byId = Rules.byId;

  let tab = 'units';
  let selected = {};
  let changed = false;
  let promotionFocus = null;

  const db = () => Editor.db();
  const wtypes = Rules.WEAPON_TYPES.map(t => ({ value: t.id, label: t.name }));
  const mtypes = Rules.MOVE_TYPES.map(t => ({ value: t.id, label: t.name }));
  const classOpts = () => db().classes.map(c => ({ value: c.id, label: c.name }));
  const statsNoHp = Rules.STATS;
  const uName = (id) => { const u = byId(db().units, id); return u ? u.name : '?'; };
  const res = () => Editor.resources() || { characters: {}, battlers: {}, faces: [], tilesets: [], owners: [] };
  const PERSO = 'ressources/personnages/';
  /** « Lyn — Lame-Seigneur » : dossier du personnage puis nom de la planche. */
  const resLabel = (k, m) => {
    const name = (m && m.name) || k.split('/').pop();
    const own = (m && m.owner) || ownerOfKey(k);
    return own && !name.toLowerCase().startsWith(own.toLowerCase()) ? own + ' — ' + name : name;
  };
  const ownerOfKey = (k) => k.startsWith(PERSO) && k.slice(PERSO.length).includes('/') ? k.slice(PERSO.length).split('/')[0] : '';
  const shortPath = (k) => k.startsWith(PERSO) ? k.slice(PERSO.length) : k.replace(/^ressources\//, '');
  const charOpts = () => Object.entries(res().characters).map(([k, m]) => ({ value: k, label: resLabel(k, m) }));
  const battlerOpts = () => Object.entries(res().battlers).map(([k, m]) => ({ value: k, label: resLabel(k, m) }));
  const colorModeOpts = Palettes.MODES;
  /** Choix « après… » : un chapitre entier ou un acte précis. */
  const doneOpts = (exclude) => (db().arcs || []).filter(a => a.id !== exclude).map(a => ({ value: a.id, label: 'Chapitre : ' + (a.name || a.id) }))
    .concat(db().chapters.filter(c => c.id !== exclude).map(c => ({ value: c.id, label: 'Acte : ' + Lobby.actLabel(db(), c.id) })));
  /** Prix en boutique (lobby) ; la revente rapporte la moitié, au prorata des utilisations. */
  const priceField = { key: 'price', label: 'Prix en boutique (0 = ne se vend pas)', type: 'number', min: 0, max: 999999,
    help: 'Acheté au marchand du lobby à ce prix ; revendu à la moitié, selon les utilisations restantes.' };
  const projectColors = () => Palettes.resolveMode((Editor.project().meta.settings || {}).colors);
  const modeLabel = (v) => (Palettes.MODES.find(m => m.value === v) || {}).label || v;

  /** Champ portrait : choix parmi les images des dossiers personnages + import dans le dossier du personnage. */
  function faceField(u) {
    const prev = h('div', { class: 'img-prev' });
    const show = () => {
      prev.innerHTML = '';
      if (!u.portrait) return prev.append(h('span', { class: 'muted' }, 'Aucun'));
      const want = u.portrait;
      Render.loadImage(Editor.baseUrl(), want).then(img => {
        if (u.portrait !== want) return;
        prev.innerHTML = '';
        prev.append(Faces.element(img, Render.imageUrl(Editor.baseUrl(), want), 'bust') || h('span', { class: 'muted' }, '?'));
      });
    };
    const sel = h('select', {}, [h('option', { value: '' }, '— aucun —')].concat(res().faces.map(f => h('option', { value: f }, shortPath(f)))));
    if (u.portrait && !res().faces.includes(u.portrait)) sel.append(h('option', { value: u.portrait }, u.portrait));
    sel.value = u.portrait || '';
    sel.addEventListener('change', () => { u.portrait = sel.value; change(); show(); });
    const imp = h('button', { class: 'small', onclick: async () => {
      const rel = await tf.importPortrait(Editor.dir(), u.name); if (!rel) return;
      await Editor.rescanResources(); u.portrait = rel; change(); renderBody();
    } }, 'Importer…');
    show();
    return h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Portrait'), h('div', { class: 'img-field' }, prev, h('div', { class: 'img-actions', style: { flex: 1 } }, sel, imp,
      h('span', { class: 'muted', style: { fontSize: '11px' } }, `Importé dans ressources/personnages/${u.name || '…'}/`))));
  }

  /** Sprite de map + animation de combat d'une unité : effectifs, avec leur origine (classe ou propre à l'unité). */
  function appearanceField(u) {
    const cls = byId(db().classes, u.classId);
    const effSprite = u.mapSprite || (cls && cls.mapSprite) || '';
    const effBattler = u.battler || (cls && cls.battler) || '';
    const sMeta = res().characters[effSprite], bMeta = res().battlers[effBattler];
    const clsName = cls ? cls.name : '?';
    const label = (k, m) => k ? resLabel(k, m) : '';
    const mk = (key, list, effMeta, eff, kindLabel) => {
      const classVal = cls && cls[key];
      const classMeta = classVal && (key === 'mapSprite' ? res().characters : res().battlers)[classVal];
      const sel = h('select', {}, [h('option', { value: '' }, `Celui de la classe ${clsName}` + (classVal ? ` (${label(classVal, classMeta)})` : ' (aucun)'))]
        .concat(list().map(o => h('option', { value: o.value }, o.label))));
      sel.value = u[key] || '';
      sel.addEventListener('change', () => { u[key] = sel.value; change(); renderBody(); });
      return h('div', { class: 'field' }, h('label', { class: 'field-label' }, kindLabel), sel);
    };
    const preview = h('div', { class: 'appear-prev' });
    if (sMeta) preview.append(Sprites.icon(Editor.baseUrl(), sMeta, 'original', 64));
    else preview.append(h('span', { class: 'muted' }, 'jeton'));
    const noRes = !Object.keys(res().characters).length;
    return h('div', { class: 'appear' },
      preview,
      h('div', { class: 'appear-fields' },
        mk('mapSprite', charOpts, sMeta, effSprite, 'Sprite de map'),
        mk('battler', battlerOpts, bMeta, effBattler, 'Animation de combat'),
        colorsField(u, cls),
        h('p', { class: 'form-info' },
          noRes ? "Ce projet n'a aucun sprite dans ressources/personnages. Onglet Ressources › « Ajouter les ressources par défaut »."
            : `En jeu : ${sMeta ? label(effSprite, sMeta) : 'jeton coloré'} sur la map, ${bMeta ? 'animation « ' + label(effBattler, bMeta) + ' »' : 'combat sur la map'}. ` +
              (u.mapSprite || u.battler ? 'Réglé pour cette unité.' : `Hérité de la classe ${clsName}.`),
          ' ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); open('classes', u.classId); } }, 'Voir la classe'))));
  }

  /**
   * Réglage « Couleurs » d'une unité (cls donné) ou d'une classe (cls absent), avec un aperçu
   * de chaque variante : origine, bleu (joueur), rouge (ennemi), vert (allié).
   */
  function colorsField(obj, cls) {
    const inherited = cls ? Palettes.resolveMode(cls.colors, projectColors()) : projectColors();
    const sel = h('select', {}, [h('option', { value: '' }, (cls ? `Comme la classe ${cls.name}` : 'Comme le projet') + ` (${modeLabel(inherited).toLowerCase()})`)]
      .concat(colorModeOpts.map(o => h('option', { value: o.value }, o.label))));
    sel.value = obj.colors || '';
    sel.addEventListener('change', () => { obj.colors = sel.value; change(); renderBody(); });
    const mode = Palettes.resolveMode(obj.colors, inherited);
    const spriteKey = cls ? (obj.mapSprite || cls.mapSprite) : obj.mapSprite;
    const sMeta = spriteKey && res().characters[spriteKey];
    const swatches = h('div', { class: 'pal-row' });
    if (sMeta) {
      for (const [team, label] of [['player', 'Joueur'], ['ally', 'Allié'], ['enemy', 'Ennemi']]) {
        const mapPal = Palettes.paletteFor(team, mode, 'map'), batPal = Palettes.paletteFor(team, mode, 'battle');
        swatches.append(h('div', { class: 'pal-cell', title: `${label} : ${Palettes.LABELS[mapPal]} sur la map, ${Palettes.LABELS[batPal].toLowerCase()} en combat` },
          Sprites.icon(Editor.baseUrl(), sMeta, mapPal, 40), h('span', {}, label)));
      }
    }
    return h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Couleurs du sprite'), sel,
      sMeta ? swatches : null,
      h('p', { class: 'form-info', style: { margin: '2px 0 0' } }, "Couleur d'équipe : bleu si on le joue, rouge en ennemi, vert en allié. Couleur d'origine : celle de la planche. Les couleurs qui changent se règlent dans l'onglet Ressources."));
  }

  function change() { changed = true; Editor.markDirty(); }

  function unitSkillsField(unit) {
    const root = h('div', { class: 'unit-skills' });
    const redraw = () => {
      const catalogue = db().skills;
      const cls = byId(db().classes, unit.classId);
      const automatic = Skills.combinedLearning(unit, cls, unit.level || 1, catalogue).map(row => row.skillId);
      const characterSkills = Skills.availableLearning(unit, unit.level || 1, catalogue).map(row => row.skillId);
      const classSkills = Skills.availableLearning(cls, unit.level || 1, catalogue).map(row => row.skillId);
      const manual = Array.isArray(unit.learnedSkills) ? unit.learnedSkills : [];
      const learned = [...new Set([...manual, ...automatic])];
      const equipped = Array.isArray(unit.equippedSkills) ? unit.equippedSkills : Skills.initialLoadout(unit, cls, catalogue).equippedSkills;
      const find = id => byId(catalogue, id);
      const label = id => { const s = find(id); return s ? `${s.icon} ${s.name}` : `Introuvable : ${id}`; };
      const update = () => { change(); redraw(); };
      root.replaceChildren(h('div', { class: 'form-heading' }, 'Compétences — une personnelle + cinq équipables'),
        h('p', { class: 'form-info' }, 'La personnelle est fixe en jeu et ne consomme aucun emplacement. Les compétences équipées sont actives lorsque leurs conditions sont remplies ; les autres restent dans le répertoire.'));
      const personal = h('select', { 'data-skill-personal': true, 'aria-label': 'Compétence personnelle' },
        h('option', { value: '' }, '— aucune personnelle —'), catalogue.map(s => h('option', { value: s.id }, label(s.id))));
      if (unit.personalSkill && !find(unit.personalSkill)) personal.append(h('option', { value: unit.personalSkill }, label(unit.personalSkill)));
      personal.value = unit.personalSkill || '';
      personal.addEventListener('change', () => {
        unit.personalSkill = personal.value;
        unit.equippedSkills = equipped.filter(id => id !== personal.value);
        update();
      });
      root.append(h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Compétence personnelle (fixe en jeu)'), personal));
      if (find(unit.personalSkill)) root.append(h('p', { class: 'form-info' }, Skills.describe(find(unit.personalSkill))));
      root.append(learningField(unit, 'unit', update));

      const chips = h('div', { class: 'chips skill-repertoire' });
      const ids = [...new Set([...catalogue.map(s => s.id), ...learned])];
      for (const id of ids) {
        const selected = learned.includes(id);
        const chip = h('button', { type: 'button', class: 'chip' + (selected ? ' on' : ''), 'data-skill-learn': id,
          disabled: automatic.includes(id), 'aria-pressed': selected ? 'true' : 'false',
          title: automatic.includes(id) ? 'Déjà apprise grâce aux paliers atteints au niveau de départ.' : find(id) ? 'Accorder dès le départ, sans attendre un niveau. ' + Skills.describe(find(id)) : 'Retirer cette référence introuvable' },
        label(id) + (characterSkills.includes(id) ? ' · personnage' : '') + (classSkills.includes(id) ? ' · classe' : ''));
        chip.addEventListener('click', () => {
          if (automatic.includes(id)) return;
          unit.learnedSkills = selected ? manual.filter(value => value !== id) : [...manual, id];
          unit.equippedSkills = equipped.filter(value => unit.learnedSkills.includes(value) || automatic.includes(value));
          update();
        });
        chips.append(chip);
      }
      root.append(h('div', { class: 'field' }, h('label', { class: 'field-label' }, `Compétences déjà acquises au départ (${learned.length})`),
        ids.length ? chips : h('p', { class: 'muted' }, 'Le catalogue est vide. Ajoute des compétences ou leurs exemples dans l’onglet Compétences.')));
      root.append(h('p', { class: 'form-info' }, 'Cocher ici accorde immédiatement une compétence au début de la partie. Pour la débloquer plus tard, utilise les paliers ci-dessus ou ceux de la classe. Les compétences marquées « personnage » ou « classe » correspondent aux paliers déjà atteints au niveau de départ.'));

      const slots = h('div', { class: 'skill-slots' });
      for (let i = 0; i < Skills.EQUIPPED_SLOTS; i++) {
        const current = equipped[i] || '';
        const options = learned.filter(id => find(id) && id !== unit.personalSkill && !equipped.some((other, index) => index !== i && other === id));
        const select = h('select', { 'data-skill-slot': String(i), 'aria-label': 'Compétence équipée ' + (i + 1) },
          h('option', { value: '' }, '— emplacement libre —'), options.map(id => h('option', { value: id }, label(id))));
        if (current && !options.includes(current)) select.append(h('option', { value: current }, label(current) + ' (à corriger)'));
        select.value = current;
        select.addEventListener('change', () => {
          const next = equipped.slice(); next[i] = select.value;
          unit.equippedSkills = next.filter(Boolean); update();
        });
        slots.append(h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Emplacement ' + (i + 1)), select));
      }
      root.append(h('p', { class: 'form-info skill-slot-count' }, `${equipped.length} / ${Skills.EQUIPPED_SLOTS} compétences équipées — personnelle hors quota`), slots);
      for (const error of Skills.validateAssignment(unit, catalogue, automatic)) root.append(h('p', { class: 'note' }, '⚠ ' + error));
      root.append(h('button', { type: 'button', class: 'small', onclick: () => open('skills') }, 'Modifier le catalogue de compétences'));
    };
    redraw(); return root;
  }

  function learningField(owner, kind = 'class', onChange) {
    const root = h('div', { class: kind === 'unit' ? 'unit-learning' : 'class-learning' });
    const redraw = () => {
      const rows = Array.isArray(owner.skillLearning) ? owner.skillLearning : [];
      const catalogue = db().skills;
      root.replaceChildren(h('div', { class: 'form-heading' }, kind === 'unit' ? 'Apprentissages propres au personnage' : 'Compétences apprises par niveau'),
        h('p', { class: 'form-info' }, kind === 'unit'
          ? 'Ces paliers s’ajoutent à ceux de la classe. Chaque compétence se débloque au niveau indiqué du personnage, une seule fois, même si sa classe la lui enseigne aussi. Les paliers déjà atteints sont acquis dès le départ.'
          : 'Chaque compétence est acquise une seule fois. Les unités qui commencent à un niveau supérieur connaissent déjà les paliers atteints. À la montée de niveau, une place libre est utilisée ; sinon le joueur choisit quoi remplacer ou garde la compétence dans son répertoire.'));
      const update = () => { if (onChange) onChange(); else { change(); redraw(); } };
      rows.forEach((row, index) => {
        if (!row || typeof row !== 'object') {
          root.append(h('button', { class: 'small danger', onclick: () => { rows.splice(index, 1); update(); } }, 'Retirer la ligne invalide ' + (index + 1))); return;
        }
        const level = h('input', { type: 'number', min: 1, max: 99, value: row.level, 'data-learning-level': String(index), 'aria-label': 'Niveau d’apprentissage ' + (index + 1) });
        level.addEventListener('change', () => { row.level = Number(level.value); update(); });
        const options = catalogue.filter(s => !rows.some((other, i) => i !== index && other && other.skillId === s.id));
        const skill = h('select', { 'data-learning-skill': String(index), 'aria-label': 'Compétence à apprendre ' + (index + 1) },
          h('option', { value: '' }, '— choisir une compétence —'), options.map(s => h('option', { value: s.id }, `${s.icon} ${s.name}`)));
        if (row.skillId && !options.some(s => s.id === row.skillId)) skill.append(h('option', { value: row.skillId }, 'À corriger : ' + row.skillId));
        skill.value = row.skillId || '';
        skill.addEventListener('change', () => { row.skillId = skill.value; update(); });
        root.append(h('div', { class: 'learning-row' },
          h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Niveau'), level),
          h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Compétence'), skill),
          h('button', { class: 'small danger', title: 'Retirer cet apprentissage', onclick: () => { rows.splice(index, 1); update(); } }, 'Retirer')));
      });
      const available = catalogue.filter(s => !rows.some(row => row && row.skillId === s.id));
      root.append(h('button', { class: 'small', 'data-add-learning': true, disabled: !available.length, onclick: () => {
        owner.skillLearning = rows;
        const lastLevel = rows.reduce((max, row) => Math.max(max, row && Number.isInteger(row.level) ? row.level : 0), 0);
        rows.push({ level: Math.min(99, lastLevel + 1), skillId: available[0].id }); update();
      } }, '+ Ajouter un apprentissage'));
      if (!catalogue.length) root.append(h('p', { class: 'form-info' }, 'Ajoute d’abord des compétences dans le catalogue.'));
      const maxLevel = (Editor.project().meta.settings || {}).maxLevel || Rules.DEFAULT_SETTINGS.maxLevel;
      if (rows.some(row => row && row.level > maxLevel)) root.append(h('p', { class: 'note' }, 'Un palier dépasse le niveau maximum du projet (' + maxLevel + '). Il ne sera pas atteint avec ces réglages.'));
      for (const error of Skills.validateLearning({ skills: catalogue, [kind === 'unit' ? 'units' : 'classes']: [owner] })) root.append(h('p', { class: 'note' }, '⚠ ' + error));
    };
    redraw(); return root;
  }

  async function showPromotionTree(classId) {
    const choice = await UI.modal((box, close) => {
      box.classList.add('promotion-tree-modal');
      const view = h('div');
      const filter = h('select', { 'aria-label': 'Classes affichées' }, h('option', { value: '' }, 'Toutes les classes'),
        db().classes.map(c => h('option', { value: c.id }, 'Famille de ' + c.name)));
      filter.value = classId || '';
      const redraw = () => view.replaceChildren(PromotionUI.graph(db(), { rootId: filter.value, currentId: classId,
        onClass: cls => close({ classId: cls.id }), onEdge: edge => close({ classId: edge.from, index: edge.index }) }));
      filter.addEventListener('change', redraw); redraw();
      box.append(h('h3', {}, 'Arbre d’évolution'), h('p', {}, 'Clique sur une classe pour ouvrir sa fiche, ou sur un lien pour modifier ses conditions et ses bonus.'), filter, view,
        h('div', { class: 'modal-actions' }, h('button', { onclick: () => close(null) }, 'Fermer')));
    }, { wide: true });
    if (choice) {
      promotionFocus = choice;
      open('classes', choice.classId);
      const row = document.querySelector('[data-promotion-index="' + choice.index + '"]');
      if (row) row.scrollIntoView({ block: 'center' });
    }
  }

  function promotionField(cls) {
    const root = h('div', { class: 'promotion-editor' });
    let rows = JSON.parse(JSON.stringify(Promotions.branches(cls, db())));
    let expanded = promotionFocus && promotionFocus.classId === cls.id && promotionFocus.index !== undefined ? promotionFocus.index : 0;
    const errors = h('div', { class: 'promotion-errors', role: 'status' });
    const renderErrors = () => errors.replaceChildren(...Promotions.validate(db()).filter(e => e.startsWith('Classe ' + (cls.name || cls.id) + ' :') || e.startsWith('Cycle'))
      .map(e => h('p', { class: 'note' }, e)));
    const commit = () => { cls.promotions = rows; delete cls.promotesTo; change(); renderErrors(); };
    const redraw = () => {
      root.replaceChildren(h('div', { class: 'form-heading' }, 'Branches de promotion'),
        h('p', { class: 'form-info' }, 'Chaque branche définit sa destination, ses conditions et ses gains. Les acquis sont conservés ; la promotion consomme l’action. Sans objet requis, elle est accessible par la commande Promotion.'),
        h('button', { class: 'small', 'data-promotion-tree': true, onclick: () => showPromotionTree(cls.id) }, 'Voir l’arbre d’évolution'));
      rows.forEach((row, index) => {
        if (!row || typeof row !== 'object') { root.append(h('button', { class: 'small danger', onclick: () => { rows.splice(index, 1); commit(); redraw(); } }, 'Retirer la branche invalide')); return; }
        const target = byId(db().classes, row.classId), body = h('div', { class: 'promotion-fields' });
        const details = h('details', { class: 'promotion-branch', open: index === expanded, 'data-promotion-index': String(index) },
          h('summary', {}, `${target ? target.name : 'Destination à corriger'} — niveau ${row.minLevel}`), body);
        details.addEventListener('toggle', () => { if (details.open) expanded = index; });
        const fields = [
          { key: 'classId', label: 'Classe de destination', type: 'select', options: () => db().classes.filter(c => c.id !== cls.id && !rows.some((r, i) => i !== index && r && r.classId === c.id)).map(c => ({ value: c.id, label: c.name })) },
          { type: 'row', fields: [{ key: 'minLevel', label: 'Niveau minimum', type: 'number', min: 1, max: 99 },
            { key: 'itemId', label: 'Objet requis (dans l’inventaire)', type: 'select', empty: '— aucun —', options: () => db().items.filter(it => it.effect === 'promotion').map(it => ({ value: it.id, label: it.name })) }] },
          { key: 'resetLevel', label: 'Remettre le niveau à 1 et l’EXP à 0', type: 'checkbox' },
          { type: 'heading', label: 'Bonus propres à cette branche (plafonnés par la classe d’arrivée)' },
          { key: 'bonuses', type: 'stats', keys: Rules.STATS.concat('mov'), max: 99 },
          { key: 'skills', label: 'Compétences accordées à la promotion', type: 'multicheck', options: () => db().skills.map(s => ({ value: s.id, label: s.icon + ' ' + s.name })) }
        ];
        body.append(UI.form(fields, row, { onChange: key => {
          commit();
          if (key === 'classId') { expanded = index; redraw(); }
          else details.querySelector('summary').textContent = `${(byId(db().classes, row.classId) || {}).name || 'Destination à corriger'} — niveau ${row.minLevel}`;
        } }), h('div', { class: 'insp-actions' },
          h('button', { class: 'small', onclick: () => { const target = byId(db().classes, row.classId); if (target) { row.bonuses = Promotions.create(cls, target).bonuses; commit(); redraw(); } } }, 'Reprendre les écarts de stats entre classes'),
          h('button', { class: 'small danger', 'data-remove-promotion': String(index), onclick: () => { rows.splice(index, 1); commit(); redraw(); } }, 'Retirer la branche')));
        root.append(details);
      });
      const available = db().classes.filter(c => c.id !== cls.id && !rows.some(row => row && row.classId === c.id));
      root.append(h('button', { class: 'small', 'data-add-promotion': true, disabled: !available.length, onclick: () => {
        const target = available.find(c => c.tier > cls.tier) || available[0];
        rows.push(Promotions.create(cls, target)); expanded = rows.length - 1; commit(); redraw();
      } }, '+ Ajouter une branche'), errors);
      renderErrors();
    };
    redraw(); return root;
  }

  // ------------------------------------------------------------------
  // Définition des onglets « liste + fiche »
  // ------------------------------------------------------------------
  const TABS = {
    skills: {
      label: 'Compétences', list: () => db().skills, prefix: 'skill_',
      sub: s => (Skills.effectOf(s) || {}).name || 'Effet inconnu', icon: s => s.icon || '✦',
      create: () => Skills.create(),
      onField: (key, s) => { if (key === 'effect') Object.assign(s, Skills.parameters(s.effect)); },
      rerenderOn: ['effect', 'activation', 'hpCondition'],
      fields: s => {
        const effect = Skills.effectOf(s) || {};
        return [
          { type: 'row', fields: [
            { key: 'name', label: 'Nom', type: 'text', live: true },
            { key: 'icon', label: 'Symbole (1 à 6 caractères)', type: 'text', placeholder: '✦' }] },
          { key: 'description', label: 'Description du créateur (facultative)', type: 'textarea', rows: 2, placeholder: 'Une courte présentation de la compétence.' },
          { type: 'heading', label: 'Effet' },
          { key: 'effect', label: 'Type d’effet', type: 'select', options: Skills.EFFECTS.map(e => ({ value: e.id, label: e.name })) },
          ...(effect.utility ? [{ type: 'info', text: 'Compétence de carte : elle doit être personnelle ou équipée et ne consomme pas de clé. Certains coffres ou portes peuvent interdire Crochetage et imposer une clé.' }] : []),
          ...(effect.amount ? [{ key: 'amount', label: effect.amount, type: 'number', min: 1, max: effect.max }] : []),
          ...(s.effect === 'auraAvoid' ? [
            { key: 'range', label: 'Rayon autour du porteur (cases)', type: 'number', min: 1, max: 10 },
            { type: 'info', text: 'L’aura bénéficie aux autres alliés. Plusieurs porteurs de cette même compétence ne cumulent pas le bonus.' }
          ] : []),
          ...(effect.proc ? [
            { key: 'activation', label: 'Probabilité de déclenchement', type: 'select', options: [
              { value: 'always', label: 'Toujours' }, { value: 'fixed', label: 'Pourcentage fixe' },
              { value: 'skl', label: 'Technique de l’unité (%)' }, { value: 'lck', label: 'Chance de l’unité (%)' }] },
            ...(s.activation === 'fixed' ? [{ key: 'chance', label: 'Chance de déclenchement (%)', type: 'number', min: 0, max: 100 }] : [])
          ] : []),
          ...(!effect.utility ? [{ type: 'heading', label: 'Conditions d’activation' }] : []),
          ...(effect.combat ? [
            { key: 'phase', label: 'Qui engage le combat ?', type: 'select', options: [
              { value: 'any', label: 'Dans tous les cas' }, { value: 'initiate', label: 'L’unité engage' }, { value: 'defend', label: 'L’ennemi engage' }] },
            { key: 'weaponType', label: 'Arme requise', type: 'select', empty: 'Toutes les armes', options: wtypes }
          ] : []),
          ...(!effect.utility ? [{ key: 'hpCondition', label: 'État des PV du porteur', type: 'select', options: [
            { value: 'any', label: 'Aucune condition' }, { value: 'below', label: 'PV inférieurs ou égaux au seuil' },
            { value: 'above', label: 'PV supérieurs ou égaux au seuil' }, { value: 'full', label: 'PV au maximum' }] },
          ...(['below', 'above'].includes(s.hpCondition) ? [{ key: 'hpThreshold', label: 'Seuil (% des PV maximum)', type: 'number', min: 1, max: 100 }] : []),
          { key: 'adjacentAlly', label: 'Nécessite au moins un allié adjacent au porteur', type: 'checkbox' }] : [])
        ];
      }
    },
    units: {
      label: 'Unités', list: () => db().units, prefix: 'c_',
      sub: (u) => (unitView.by === 'class' ? Roster.seriesOf(u) : (byId(db().classes, u.classId) || {}).name) || '',
      create: () => {
        const cls = db().classes[0];
        return { name: 'Nouvelle unité', series: '', classId: cls ? cls.id : '', level: 1, isLord: false, color: '#4f8cff',
          stats: cls ? Rules.statsFromClass(cls, 1) : {}, growths: cls ? Object.assign({}, cls.growths) : {},
          inventory: cls ? (cls.defaultInventory || []).map(id => ({ id })) : [], portrait: '', bio: '',
          personalSkill: '', learnedSkills: [], equippedSkills: [], skillLearning: [] };
      },
      fields: () => [
        { type: 'row', fields: [{ key: 'name', label: 'Nom', type: 'text' }, { key: 'color', label: 'Couleur', type: 'color', compact: true }] },
        { key: 'series', label: 'Série', type: 'text', placeholder: 'ex. Fire Emblem 7, Final Fantasy VII, Original…', suggestions: () => Roster.seriesList(db()),
          help: 'Jeu ou univers d’origine du personnage. Sert à trier la liste des unités (Trier par › Série).' },
        { type: 'row', fields: [
          { key: 'classId', label: 'Classe', type: 'select', options: classOpts },
          { key: 'level', label: 'Niveau', type: 'number', min: 1, max: 40 }] },
        { key: 'isLord', label: 'Seigneur (protection et prise de point par défaut, personnalisables par acte)', type: 'checkbox' },
        { key: 'deathPolicy', label: 'Si ce personnage est vaincu', type: 'select', empty: 'Suivre le mode Classique / Détente', options: [{ value: 'retreat', label: 'Toujours se retirer et revenir au chapitre suivant' }] },
        { key: 'convoy', label: "Chef d'escouade : accès au convoi (les autres y accèdent depuis une case adjacente)", type: 'checkbox' },
        { key: 'recruitAfter', label: 'Rejoint l’effectif après', type: 'select', empty: '— pas de recrutement automatique —', options: () => doneOpts() },
        { type: 'info', text: 'L’effectif de départ se règle dans Lobby. Un personnage placé dans le camp ne rejoint pas automatiquement l’équipe. Les placements joueur d’un acte rejoignent l’effectif quand cet acte commence.' },
        { type: 'custom', render: unitSkillsField },
        { type: 'heading', label: 'Apparence' },
        { type: 'custom', render: appearanceField },
        { type: 'custom', render: faceField },
        { key: 'bio', label: 'Description', type: 'textarea', rows: 2 },
        { type: 'row', fields: [
          { key: 'gender', label: 'Genre', type: 'select', empty: '—', options: [{ value: 'homme', label: 'Homme' }, { value: 'femme', label: 'Femme' }, { value: 'autre', label: 'Autre' }] },
          { key: 'protagonist', label: "Personnage principal (choisit son partenaire à l'épilogue)", type: 'checkbox' }] },
        { key: 'ending', label: 'Fin en solo (épilogue)', type: 'textarea', rows: 2, placeholder: 'Ce que devient le personnage s\'il finit seul.' },
        { type: 'custom', render: (u) => {
          const pairs = db().supports.filter(p => p.a === u.id || p.b === u.id);
          return h('p', { class: 'form-info' }, pairs.length ? '♥ Affinités : ' + pairs.map(p => p.name).join(', ') + ' — ' : '♥ Aucune affinité. ',
            h('a', { href: '#', onclick: (e) => { e.preventDefault(); open('supports'); } }, 'Onglet Affinités'));
        } },
        { type: 'heading', label: 'Stats de base' },
        { key: 'stats', type: 'stats', max: 99 },
        { type: 'custom', render: (u) => h('div', { class: 'insp-actions' }, h('button', { class: 'small ghost', onclick: () => {
          const cls = byId(db().classes, u.classId); if (!cls) return;
          u.stats = Rules.statsFromClass(cls, u.level || 1); u.growths = Object.assign({}, cls.growths); change(); renderBody();
        } }, 'Reprendre les stats moyennes de la classe')) },
        { type: 'heading', label: 'Croissances (%)' },
        { key: 'growths', type: 'stats', percent: true, max: 255 },
        { type: 'heading', label: 'Inventaire' },
        { key: 'inventory', type: 'inventory', options: () => Editor.invOptions(), max: 5 },
        { type: 'info', text: "La première arme utilisable est équipée. « É » = emplacement équipé." }
      ]
    },
    classes: {
      label: 'Classes', list: () => db().classes, prefix: 'cls_',
      sub: (c) => (Rules.MOVE_TYPES.find(m => m.id === c.moveType) || {}).name,
      create: () => ({ name: 'Nouvelle classe', moveType: 'foot', mov: 5, weapons: ['sword'], tier: 1, promotions: [], mapSprite: '', battler: '',
        base: { hp: 18, str: 4, mag: 0, skl: 4, spd: 4, lck: 0, def: 3, res: 0 },
        growths: { hp: 70, str: 40, mag: 10, skl: 40, spd: 40, lck: 30, def: 20, res: 20 },
        caps: { hp: 60, str: 20, mag: 20, skl: 20, spd: 20, lck: 30, def: 20, res: 20 }, defaultInventory: [], skillLearning: [] }),
      fields: () => [
        { key: 'name', label: 'Nom', type: 'text' },
        { key: 'description', label: 'Rôle / description', type: 'textarea', rows: 2 },
        { type: 'row', fields: [
          { key: 'moveType', label: 'Type de déplacement', type: 'select', options: mtypes },
          { key: 'mov', label: 'Déplacement', type: 'number', min: 1, max: 15 },
          { key: 'tier', label: 'Palier (0 : recrue, 1 : base, 2 : promue…)', type: 'number', min: 0, max: 9 }] },
        { key: 'weapons', label: 'Armes maniées', type: 'multicheck', options: wtypes },
        { type: 'custom', render: cls => {
          const tmp = { effectiveTypes: cls.effectiveTypes || [cls.moveType] };
          return UI.form([{ key: 'effectiveTypes', label: 'Catégories pour les armes efficaces', type: 'multicheck', options: mtypes }], tmp,
            { onChange: () => { cls.effectiveTypes = tmp.effectiveTypes; change(); } });
        } },
        { type: 'custom', render: promotionField },
        { type: 'custom', render: c => learningField(c) },
        { type: 'row', fields: [
          { key: 'mapSprite', label: 'Sprite de map', type: 'select', empty: '— aucun (jeton) —', options: charOpts },
          { key: 'battler', label: 'Animation de combat', type: 'select', empty: '— aucune (combat sur la map) —', options: battlerOpts }] },
        { type: 'custom', render: c => colorsField(c) },
        { type: 'heading', label: 'Stats de base (niveau 1)' },
        { key: 'base', type: 'stats', max: 99 },
        { type: 'heading', label: 'Croissances (%) — utilisées pour les ennemis génériques' },
        { key: 'growths', type: 'stats', percent: true, max: 255 },
        { type: 'heading', label: 'Plafonds' },
        { key: 'caps', type: 'stats', max: 255 },
        { type: 'heading', label: 'Inventaire par défaut des ennemis de cette classe' },
        { key: 'defaultInventory', type: 'custom', render: (c) => {
          const tmp = { inv: (c.defaultInventory || []).map(id => ({ id })) };
          return UI.form([{ key: 'inv', type: 'inventory', options: () => Editor.invOptions(), max: 5 }], tmp, { onChange: () => { c.defaultInventory = tmp.inv.map(s => s.id); change(); } });
        } }
      ]
    },
    weapons: {
      label: 'Armes', list: () => db().weapons, prefix: 'w_',
      sub: (w) => (Rules.WEAPON_TYPES.find(t => t.id === w.type) || {}).name,
      create: () => ({ name: 'Nouvelle arme', type: 'sword', might: 5, hit: 80, crit: 0, weight: 5, minRange: 1, maxRange: 1, uses: 40, effective: [], heal: 0 }),
      fields: (w) => [
        { type: 'row', fields: [{ key: 'name', label: 'Nom', type: 'text' }, { key: 'type', label: 'Type', type: 'select', options: wtypes }] },
        w.type === 'staff'
          ? { type: 'row', fields: [
            { key: 'heal', label: 'Soin (+ Mag)', type: 'number', min: 0, max: 99 },
            { key: 'minRange', label: 'Portée min', type: 'number', min: 1, max: 15 },
            { key: 'maxRange', label: 'Portée max', type: 'number', min: 1, max: 15 },
            { key: 'uses', label: 'Utilisations', type: 'number', min: 0, max: 99, help: '0 = incassable' }] }
          : { type: 'row', fields: [
            { key: 'might', label: 'Puissance', type: 'number', min: 0, max: 50 },
            { key: 'hit', label: 'Précision', type: 'number', min: 0, max: 200 },
            { key: 'crit', label: 'Critique', type: 'number', min: 0, max: 100 },
            { key: 'weight', label: 'Poids', type: 'number', min: 0, max: 30 }] },
        w.type === 'staff' ? null : { type: 'row', fields: [
          { key: 'minRange', label: 'Portée min', type: 'number', min: 1, max: 15 },
          { key: 'maxRange', label: 'Portée max', type: 'number', min: 1, max: 15 },
          { key: 'uses', label: 'Utilisations', type: 'number', min: 0, max: 99, help: '0 = incassable' }] },
        w.type === 'staff' ? null : { key: 'effective', label: 'Efficace contre (×3)', type: 'multicheck', options: mtypes },
        priceField,
        { type: 'info', text: (w) => w.type === 'staff' ? 'Soigne un allié : PV rendus = Soin + Magie.' :
          Rules.MAGIC_TYPES.includes(w.type) ? 'Arme magique : utilise la Magie et cible la Résistance.' :
          'Arme physique : utilise la Force et cible la Défense. Le poids au-delà de la Force réduit la vitesse d\'attaque.' }
      ].filter(Boolean),
      rerenderOn: ['type']
    },
    items: {
      label: 'Objets', list: () => db().items, prefix: 'i_',
      sub: (i) => i.effect === 'heal' ? 'soin' : i.effect === 'promotion' ? 'promotion' : i.effect === 'key' ? 'clé' : 'stat',
      create: () => ({ name: 'Nouvel objet', effect: 'heal', amount: 10, stat: 'hp', uses: 3 }),
      onField: (key, it) => { if (key === 'effect' && it.effect === 'key' && !it.keyType) it.keyType = 'both'; },
      fields: (it) => [
        { key: 'name', label: 'Nom', type: 'text' },
        { type: 'row', fields: [
          { key: 'effect', label: 'Effet', type: 'select', options: [{ value: 'heal', label: 'Rend des PV' }, { value: 'boost', label: 'Augmente une stat (définitif)' }, { value: 'promotion', label: 'Permet une promotion' }, { value: 'key', label: 'Ouvre une serrure' }] },
          ...(['heal', 'boost'].includes(it.effect) ? [{ key: 'amount', label: 'Valeur', type: 'number', min: 1, max: 99 }] : []),
          { key: 'uses', label: 'Utilisations', type: 'number', min: 1, max: 99 }] },
        it.effect === 'boost' ? { key: 'stat', label: 'Stat', type: 'select', options: Rules.STATS.map(k => ({ value: k, label: Rules.STAT_LABELS[k] })).concat([{ value: 'mov', label: 'Déplacement' }]) } : null,
        it.effect === 'key' ? { key: 'keyType', label: 'Serrures compatibles', type: 'select', options: [{ value: 'chest', label: 'Coffres' }, { value: 'door', label: 'Portes' }, { value: 'both', label: 'Coffres et portes' }] } : null,
        priceField
      ].filter(Boolean),
      rerenderOn: ['effect']
    },
    supports: {
      label: 'Affinités', list: () => db().supports, prefix: 'sp_',
      sub: (p) => `${p.startPoints || 0} pts`,
      create: () => {
        const u = db().units;
        const a = u[0] ? u[0].id : '', b = u[1] ? u[1].id : a;
        return { name: `${uName(a)} ♥ ${uName(b)}`, a, b, startPoints: 0, maxRank: 'A',
          special: { rank: 'B', name: 'Attaque spéciale', chance: 20, dmg: 3, hit: 10, crit: 0 },
          combo: { rank: 'A', name: 'Attaque duo', chance: 30, might: 3, hit: 5 },
          conversations: { C: '', B: '', A: '', S: '' }, ending: '' };
      },
      onField: (k, p) => { if (k === 'a' || k === 'b') p.name = `${uName(p.a)} ♥ ${uName(p.b)}`; },
      rerenderOn: ['a', 'b', 'maxRank', 'startPoints'],
      fields: (p) => {
        const cfg = Object.assign({}, Rules.DEFAULT_SUPPORT, Editor.project().meta.supports || {});
        const units = db().units.map(u => ({ value: u.id, label: u.name }));
        const ranks = (max) => ['C', 'B', 'A', 'S'].slice(0, Rules.rankIndex(max || 'S')).map(r => ({ value: r, label: 'Rang ' + r }));
        const start = Rules.SUPPORT_RANKS[Rules.rankForPoints(Number(p.startPoints) || 0, cfg, p.maxRank)] || 'aucun';
        const convFields = ['C', 'B', 'A', 'S'].slice(0, Rules.rankIndex(p.maxRank || 'A')).map(r => ({
          key: 'conversations.' + r, label: `Conversation ${r} (${cfg.thresholds[Rules.rankIndex(r) - 1]} pts)`, type: 'textarea', rows: 3, placeholder: 'Nom: réplique\nAutre nom: réplique' }));
        return [
          { type: 'row', fields: [
            { key: 'a', label: 'Personnage', type: 'select', options: units },
            { key: 'b', label: 'Avec', type: 'select', options: units }] },
          { type: 'row', fields: [
            { key: 'startPoints', label: 'Points au départ', type: 'number', min: 0, max: 999 },
            { key: 'maxRank', label: 'Rang maximum', type: 'select', options: [{ value: 'A', label: 'A (amitié)' }, { value: 'S', label: 'S (couple)' }] }] },
          { type: 'info', text: `Rang au début du jeu : ${start}. Seuils C/B/A/S : ${cfg.thresholds.join(' / ')} points. Gains : +${cfg.gainAdjacent} par fin de tour côte à côte, +${cfg.gainCombat} en combattant l'un à côté de l'autre. Bonus par rang tant qu'ils sont à ${cfg.range} cases ou moins : précision +${cfg.bonus.hit}, esquive +${cfg.bonus.avoid}, critique +${cfg.bonus.crit}.` },
          { type: 'heading', label: 'Attaque spéciale (le partenaire est à portée)' },
          { type: 'row', fields: [
            { key: 'special.name', label: 'Nom', type: 'text' },
            { key: 'special.rank', label: 'Débloquée au', type: 'select', options: ranks('S') }] },
          { type: 'row', fields: [
            { key: 'special.chance', label: 'Chance (%)', type: 'number', min: 0, max: 100 },
            { key: 'special.dmg', label: 'Dégâts +', type: 'number', min: 0, max: 50 },
            { key: 'special.hit', label: 'Précision +', type: 'number', min: 0, max: 100 },
            { key: 'special.crit', label: 'Critique +', type: 'number', min: 0, max: 100 }] },
          { type: 'heading', label: 'Attaque duo (coordonnée : le partenaire adjacent frappe aussi)' },
          { type: 'row', fields: [
            { key: 'combo.name', label: 'Nom', type: 'text' },
            { key: 'combo.rank', label: 'Débloquée au', type: 'select', options: ranks('S') }] },
          { type: 'row', fields: [
            { key: 'combo.chance', label: 'Chance (%)', type: 'number', min: 0, max: 100 },
            { key: 'combo.might', label: 'Puissance +', type: 'number', min: 0, max: 50 },
            { key: 'combo.hit', label: 'Précision +', type: 'number', min: 0, max: 100 }] },
          { type: 'heading', label: 'Conversations de soutien' },
          { type: 'info', text: "Quand les points atteignent un nouveau rang, l'action « Soutien » apparaît si les deux sont côte à côte : la conversation se joue et le rang monte." },
          ...convFields,
          { type: 'heading', label: 'Fin à deux (épilogue)' },
          { key: 'ending', type: 'textarea', rows: 3, placeholder: `Ce que deviennent les deux personnages s'ils finissent ensemble (rang ${cfg.endingRank} ou plus).` }
        ];
      }
    },
    talks: {
      label: 'Conversations', list: () => db().talks || (db().talks = []), prefix: 't_',
      sub: (t) => uName(t.unitId),
      create: () => ({ name: 'Nouvelle conversation', unitId: (db().units[1] || db().units[0] || {}).id || '', after: '', alive: [], points: 0, once: true, script: '' }),
      rerenderOn: ['unitId', 'after'],
      fields: (t) => {
        const cfg = Lobby.defaults(Editor.project().meta.lobby);
        const hero = Lobby.heroOf(cfg, db());
        const here = cfg.spots.find(s => s.unitId === t.unitId);
        const linked = hero && (db().supports || []).some(p => [p.a, p.b].includes(hero.id) && [p.a, p.b].includes(t.unitId));
        return [
          { key: 'name', label: 'Titre (pour s\'y retrouver)', type: 'text' },
          { type: 'row', fields: [
            { key: 'unitId', label: 'Personnage à qui parler dans le lobby', type: 'select', options: db().units.map(u => ({ value: u.id, label: u.name })) },
            { key: 'after', label: 'Disponible après', type: 'select', empty: '— dès le début —', options: () => doneOpts() }] },
          !cfg.enabled ? { type: 'info', text: '⚠ Le lobby est désactivé (onglet Lobby) : les conversations ne se jouent pas.' }
            : !here ? { type: 'info', text: `⚠ ${uName(t.unitId)} n'est pas placé dans le lobby (onglet Lobby › Personnages présents) : impossible de lui parler.` } : null,
          { key: 'alive', label: 'Seulement si ces personnages sont en vie', type: 'multicheck', options: () => db().units.map(u => ({ value: u.id, label: u.name })) },
          { type: 'row', fields: [
            { key: 'points', label: `Affinité gagnée avec ${hero ? hero.name : 'le héros'}`, type: 'number', min: 0, max: 200, help: 'Ajoutée à leur paire d\'affinité (onglet Affinités), si elle existe.' },
            { key: 'once', label: 'Une seule fois', type: 'checkbox' }] },
          t.points > 0 && !linked ? { type: 'info', text: `Aucune affinité entre ${hero ? hero.name : 'le héros'} et ${uName(t.unitId)} : les points ne seront pas comptés.` } : null,
          { key: 'script', label: 'Dialogue', type: 'textarea', rows: 8, placeholder: 'Lyn: Bonsoir, Eliwood.\nEliwood: Tu ne dors pas ?' },
          { type: 'info', text: 'Une ligne par réplique : « Nom: texte ». Dans le lobby, un « ! » apparaît au-dessus du personnage quand une conversation est disponible ; le héros lui parle avec Z (ou un clic).' }
        ].filter(Boolean);
      }
    },
    terrains: {
      label: 'Terrains', list: () => db().terrains, prefix: 't_',
      sub: (t) => `${t.def}/${t.avoid}`,
      swatch: (t) => t.color,
      create: () => ({ name: 'Nouveau terrain', avoid: 0, def: 0, heal: 0, color: '#999999', cost: { foot: 1, horse: 1, armor: 1, flier: 1 } }),
      fields: () => [
        { type: 'row', fields: [{ key: 'name', label: 'Nom', type: 'text' }, { key: 'color', label: 'Couleur (vue terrain)', type: 'color', compact: true }] },
        { type: 'row', fields: [
          { key: 'def', label: 'Bonus Déf', type: 'number', min: -10, max: 20 },
          { key: 'avoid', label: 'Bonus Esquive', type: 'number', min: -50, max: 100 },
          { key: 'heal', label: 'Soin / tour (%)', type: 'number', min: 0, max: 100 }] },
        { key: 'cost', label: 'Coût de déplacement (99 = infranchissable)', type: 'costs' },
        { type: 'info', text: "L'identifiant du terrain (ou son nom) est la valeur à mettre dans la propriété « terrain » des tiles dans Tiled." }
      ]
    }
  };

  // ------------------------------------------------------------------
  // Structure de la fenêtre
  // ------------------------------------------------------------------
  const ORDER = [['units', 'Unités'], ['classes', 'Classes'], ['skills', 'Compétences'], ['weapons', 'Armes'], ['items', 'Objets'], ['supports', 'Affinités'], ['terrains', 'Terrains'], ['tilesets', 'Tilesets'], ['arcs', 'Chapitres et actes'], ['lobby', 'Lobby'], ['talks', 'Conversations'], ['resources', 'Ressources'], ['system', 'Système']];

  function open(t, id) {
    if (t) tab = t;
    if (id) selected[tab] = id;
    changed = false;
    $('#db').classList.remove('hidden');
    renderTabs(); renderBody();
  }
  async function close() {
    $('#db').classList.add('hidden');
    animToken++;
    if (changed) await Editor.refresh();
  }

  function renderTabs() {
    const nav = $('#db-tabs'); nav.innerHTML = '';
    for (const [k, label] of ORDER) nav.append(h('button', { class: (tab === k || (k === 'arcs' && tab === 'chapters')) ? 'on' : '', 'data-tab': k, onclick: () => { tab = k; renderTabs(); renderBody(); } }, label));
  }

  function renderBody() {
    const body = $('#db-body'); body.innerHTML = '';
    animToken++;
    body.classList.toggle('single', tab === 'system' || tab === 'lobby');
    if (TABS[tab]) return renderListTab(body, TABS[tab]);
    if (tab === 'tilesets') return renderTilesets(body);
    if (tab === 'chapters') return renderChapters(body);
    if (tab === 'system') return renderSystem(body);
    if (tab === 'resources') return renderResources(body);
    if (tab === 'lobby') return renderLobby(body);
    if (tab === 'arcs') return renderArcs(body);
  }

  function listPanel(items, cur, opts) {
    const box = h('div', { class: 'db-list-items' });
    const row = (it, i) => h('div', { class: 'db-item' + (it.id === cur ? ' on' : ''), 'data-id': it.id, onclick: () => { selected[tab] = it.id; renderBody(); } },
      opts.icon ? h('span', { class: 'skill-symbol' }, opts.icon(it)) : opts.swatch ? h('span', { class: 'sw', style: { width: '12px', height: '12px', borderRadius: '3px', background: opts.swatch(it), flex: 'none' } }) : h('span', { class: 'n' }, String(i + 1).padStart(3, '0')),
      h('span', {}, it.name), opts.sub ? h('span', { class: 'sub' }, opts.sub(it) || '') : null);
    // groups() : [{ label, units }] (tri des personnages) ; sans groupes, la liste dans l'ordre de la base
    const fill = () => {
      box.replaceChildren();
      if (!opts.groups) { items.forEach((it, i) => box.append(row(it, i))); return; }
      const groups = opts.groups();
      for (const g of groups) {
        if (g.label) box.append(h('div', { class: 'db-group' }, g.label, h('span', {}, String(g.units.length))));
        for (const it of g.units) box.append(row(it, items.indexOf(it)));
      }
      if (!groups.some(g => g.units.length)) box.append(h('p', { class: 'db-empty' }, 'Aucun personnage ne correspond.'));
    };
    fill();
    const toolbar = opts.toolbar ? opts.toolbar(fill) : null;
    box.refill = fill; // la fiche redemande le tri quand le nom, la classe ou la série changent
    const actions = h('div', { class: 'db-list-actions' },
      opts.onAdd ? h('button', { class: 'small', onclick: opts.onAdd, html: Icons.icon('plus') }, 'Nouveau') : null,
      opts.onCopy ? h('button', { class: 'small', title: 'Dupliquer', onclick: opts.onCopy, html: Icons.icon('copy'), disabled: !cur }) : null,
      opts.onDelete ? h('button', { class: 'small danger', title: 'Supprimer', onclick: opts.onDelete, html: Icons.icon('trash'), disabled: !cur }) : null);
    return h('div', { class: 'db-list' }, toolbar, box, actions);
  }

  // Tri des personnages (onglet Unités) : recherche + tri / regroupement, gardés pour la session
  const unitView = { by: '', query: '' };
  try { Object.assign(unitView, JSON.parse(localStorage.getItem('tf.unitView') || '{}'), { query: '' }); } catch (e) { /* stockage indisponible */ }
  function rosterToolbar(view, refill, storeKey) {
    const search = h('input', { type: 'search', class: 'roster-search', placeholder: 'Rechercher (nom, classe, arme, série)…', value: view.query });
    search.addEventListener('input', () => { view.query = search.value; refill(); });
    const sort = h('select', { class: 'roster-sort', 'aria-label': 'Trier par', title: 'Trier / regrouper par' }, Roster.SORTS.map(o => h('option', { value: o.id }, o.label)));
    sort.value = view.by || '';
    sort.addEventListener('change', () => {
      view.by = sort.value; refill();
      try { localStorage.setItem(storeKey, JSON.stringify({ by: view.by })); } catch (e) { /* stockage indisponible */ }
    });
    return h('div', { class: 'roster-tools' }, search, h('label', {}, 'Trier par', sort));
  }

  function renderListTab(body, def) {
    const list = def.list();
    if (!list.find(e => e.id === selected[tab])) selected[tab] = list[0] ? list[0].id : null;
    const cur = byId(list, selected[tab]);
    const roster = tab === 'units';
    body.append(listPanel(list, cur && cur.id, {
      sub: def.sub, swatch: def.swatch, icon: def.icon,
      groups: roster ? () => Roster.arrange(list, db(), unitView) : null,
      toolbar: roster ? refill => rosterToolbar(unitView, refill, 'tf.unitView') : null,
      onAdd: () => { const e = Object.assign({ id: Editor.uid(def.prefix, list) }, def.create()); list.push(e); selected[tab] = e.id; change(); renderBody(); },
      onCopy: () => { if (!cur) return; const e = JSON.parse(JSON.stringify(cur)); e.id = Editor.uid(def.prefix, list); e.name += ' (copie)'; list.splice(list.indexOf(cur) + 1, 0, e); selected[tab] = e.id; change(); renderBody(); },
      onDelete: async () => {
        if (!cur) return;
        if (['units', 'items', 'weapons', 'terrains'].includes(tab)) {
          const locks = Locks.references(db(), tab, cur.id);
          if (locks.length) return UI.alert('Élément utilisé par un coffre ou une porte', 'Modifie d’abord ces interactions : ' + locks.join(', ') + '.');
        }
        if (['units', 'items', 'weapons'].includes(tab)) {
          const villages = Villages.references(db(), tab, cur.id);
          if (villages.length) return UI.alert('Élément utilisé par un village', 'Modifie d’abord ces villages : ' + villages.join(', ') + '.');
        }
        if (tab === 'units' && (Editor.project().meta.lobby || {}).initialRoster?.includes(cur.id)) {
          return UI.alert('Personnage dans l’effectif de départ', 'Retire d’abord ce personnage de Lobby › Équipe de départ.');
        }
        if (tab === 'units' && db().chapters.some(ch => (ch.deployment && ch.deployment.forcedUnits || []).includes(cur.id))) return UI.alert('Personnage imposé dans un acte', 'Retire d’abord ce personnage des unités imposées dans les préparatifs de ses actes.');
        if (tab === 'chapters') {
          const recruits = db().units.filter(u => u.recruitAfter === cur.id);
          if (recruits.length) return UI.alert('Acte utilisé pour un recrutement', 'Modifie d’abord le recrutement de : ' + recruits.map(u => u.name).join(', ') + '.');
        }
        if (tab === 'classes' || tab === 'items') {
          const users = Promotions.usersOf(db(), tab, cur.id);
          if (users.length) return UI.alert('Élément utilisé par une promotion', 'Classes : ' + users.map(c => c.name).join(', ') + '. Retire d’abord leurs branches ou change leur objet requis.');
        }
        if (tab === 'skills') {
          const users = Skills.usersOf(db(), cur.id);
          const classes = [...new Set([...Skills.classUsersOf(db(), cur.id), ...Promotions.usersOf(db(), 'skills', cur.id)])];
          if (users.length || classes.length) return UI.alert('Compétence utilisée',
            (users.length ? 'Personnages : ' + users.map(u => u.name).join(', ') + '. ' : '') +
            (classes.length ? 'Classes : ' + classes.map(c => c.name).join(', ') + '. ' : '') +
            'Retire d’abord cette compétence de leurs fiches.');
        }
        const usage = usageOf(tab, cur.id);
        if (!(await UI.confirm(`Supprimer « ${cur.name} » ?` + (usage ? '\n' + usage : ''), { danger: true, ok: 'Supprimer' }))) return;
        list.splice(list.indexOf(cur), 1); change(); renderBody();
      }
    }));
    const pane = h('div', { class: 'db-form' });
    if (tab === 'items') {
      const missingKeys = Defaults.items().filter(it => it.effect === 'key' && !Rules.getEntry(db(), it.id));
      if (missingKeys.length) pane.append(h('button', { class: 'small', 'data-add-key-examples': true, onclick: () => {
        list.push(...missingKeys); selected.items = missingKeys[0].id; change(); renderBody(); UI.toast('Clés d’exemple ajoutées.');
      } }, 'Ajouter les clés d’exemple manquantes'));
    }
    if (tab === 'classes') {
      pane.append(h('button', { class: 'small', 'data-add-promotion-examples': true, onclick: () => {
        const examples = Defaults.classes().filter(cls => cls.id !== 'thief'), seal = Defaults.items().find(it => it.id === 'i_master_seal');
        if (byId(db().items, seal.id) && byId(db().items, seal.id).effect !== 'promotion') {
          return UI.alert('Identifiant d’objet déjà utilisé', 'Un objet du projet utilise déjà l’identifiant du sceau avec un autre effet. Modifie cet identifiant avant d’ajouter les exemples.');
        }
        let count = 0;
        if (!byId(db().items, seal.id)) { db().items.push(seal); count++; }
        for (const cls of examples) if (!byId(db().classes, cls.id)) { db().classes.push(cls); count++; }
        for (const cls of db().classes) {
          if (cls.promotions !== undefined || cls.promotesTo) continue;
          const example = byId(examples, cls.id);
          const rows = Promotions.branches(example, { classes: examples }).filter(row => !row.itemId || (byId(db().items, row.itemId) || {}).effect === 'promotion');
          if (rows.length) { cls.promotions = JSON.parse(JSON.stringify(rows)); delete cls.promotesTo; count += rows.length; }
        }
        if (count) { change(); renderBody(); }
        UI.toast(count ? 'Classes, objet et branches d’exemple ajoutés.' : 'Les exemples sont déjà présents ; les branches existantes sont conservées.');
      } }, 'Ajouter les exemples de promotions manquants'),
      h('p', { class: 'form-info' }, 'Ajoute les classes et le sceau manquants, puis les branches d’exemple aux anciennes classes sans promotion. Les branches déjà définies restent conservées.'));
    }
    if (tab === 'skills') {
      pane.append(h('p', { class: 'note' }, 'Attribue les compétences et leurs apprentissages dans les fiches des unités et des classes. La personnelle et les cinq compétences équipées appliquent leurs effets en jeu lorsque leurs conditions sont remplies.'));
      const missing = Skills.presets().filter(s => !list.some(existing => existing.id === s.id));
      if (missing.length) pane.append(h('button', { class: 'small', style: { margin: '10px 0' }, onclick: () => {
        list.push(...missing); selected.skills = missing[0].id; change(); renderBody();
      } }, 'Ajouter les exemples manquants (' + missing.length + ')'));
    }
    if (!cur) { pane.append(h('div', { class: 'db-empty' }, 'Aucun élément.')); body.append(pane); return; }
    pane.append(h('h2', {}, cur.name, h('span', { class: 'id' }, cur.id)));
    if (tab === 'units') pane.append(unitPreview(cur));
    if (tab === 'skills') {
      pane.append(h('div', { class: 'skill-overview' }, h('span', { class: 'skill-symbol big' }, cur.icon || '✦'),
        h('div', {}, h('b', {}, 'Résumé des réglages'), h('p', { class: 'skill-summary' }, Skills.describe(cur)))));
      pane.append(h('div', { class: 'skill-validation', role: 'status' }));
    }
    pane.append(UI.form(def.fields(cur), cur, {
      baseUrl: Editor.baseUrl(),
      onChange: (k) => {
        change();
        if (k === 'name') { pane.querySelector('h2').firstChild.textContent = cur.name; refreshListLabels(body, list); }
        if (tab === 'units' && ['name', 'series', 'classId'].includes(k)) { const box = body.querySelector('.db-list-items'); if (box && box.refill) box.refill(); }
        if (def.onField) def.onField(k, cur);
        if (tab === 'skills') {
          pane.querySelector('.skill-summary').textContent = Skills.describe(cur);
          pane.querySelector('.skill-symbol.big').textContent = cur.icon || '✦';
          renderSkillErrors(pane, cur);
          // Le symbole et le sous-titre reflètent aussi les changements de la fiche.
          body.querySelectorAll('.db-item').forEach((el, i) => {
            el.querySelector('.skill-symbol').textContent = list[i].icon || '✦';
            el.querySelector('.sub').textContent = def.sub(list[i]);
          });
        }
        if (tab === 'units' && k === 'convoy' && cur.convoy) for (const o of list) if (o !== cur) o.convoy = false;
        if ((def.rerenderOn || []).includes(k) || (tab === 'units' && ['classId', 'level', 'stats', 'mapSprite', 'battler'].includes(k))) renderBody();
      }
    }));
    body.append(pane);
    if (tab === 'skills') renderSkillErrors(pane, cur);
  }
  function renderSkillErrors(pane, skill) {
    const box = pane.querySelector('.skill-validation');
    box.replaceChildren(...Skills.validate(skill).map(message => h('p', { class: 'note' }, '⚠ ' + message)));
  }
  function refreshListLabels(body, list) {
    body.querySelectorAll('.db-item').forEach((el, i) => {
      const it = el.dataset.id ? byId(list, el.dataset.id) : list[i], s = el.children[1];
      if (s && it) s.textContent = it.name;
    });
  }

  function unitPreview(u) {
    const cls = byId(db().classes, u.classId);
    const cells = [];
    for (const k of Rules.STATS) cells.push(h('span', {}, Rules.STAT_LABELS[k]));
    cells.push(h('span', {}, 'Dép'));
    for (const k of Rules.STATS) cells.push(h('b', {}, String((u.stats || {})[k] || 0)));
    cells.push(h('b', {}, String(cls ? cls.mov : '?')));
    return h('div', { class: 'preview-card', style: { marginBottom: '14px' } }, cells);
  }

  function usageOf(kind, id) {
    const chs = db().chapters;
    if (kind === 'units') { const n = chs.filter(c => c.players.some(p => p.unitId === id)).length; return n ? `Utilisée dans ${n} acte(s) : les placements seront ignorés.` : ''; }
    if (kind === 'classes') { const n = chs.reduce((a, c) => a + c.enemies.filter(e => e.classId === id).length, 0) + db().units.filter(u => u.classId === id).length; return n ? `Utilisée par ${n} unité(s) ou ennemi(s).` : ''; }
    if (kind === 'terrains') return 'Les tiles associés à ce terrain retomberont sur le terrain par défaut.';
    return '';
  }

  // ------------------------------------------------------------------
  // Tilesets : propriétés + peinture des terrains par tile
  // ------------------------------------------------------------------
  let tsBrush = null;
  function renderTilesets(body) {
    const list = db().tilesets;
    if (!list.find(e => e.id === selected.tilesets)) selected.tilesets = list[0] ? list[0].id : null;
    const ts = byId(list, selected.tilesets);
    body.append(listPanel(list, ts && ts.id, {
      sub: (t) => `${t.tileWidth}px`,
      onAdd: async () => {
        const rel = await tf.importTilesetImage(Editor.dir()); if (!rel) return;
        const img = await Render.loadImage(Editor.baseUrl(), rel);
        if (!img) return UI.alert('Image illisible', rel);
        const t = { id: Editor.uid('ts_', list), name: rel.split('/').pop().replace(/\.\w+$/, ''), image: rel, tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0, imageWidth: img.width, imageHeight: img.height, tileTerrain: {} };
        recompute(t); list.push(t); selected.tilesets = t.id; change(); renderBody();
      },
      onDelete: async () => {
        if (!ts) return;
        const used = Editor.project().maps.filter(m => m.tilesets.some(r => r.tilesetId === ts.id));
        if (!(await UI.confirm(`Supprimer « ${ts.name} » ?` + (used.length ? `\nUtilisé par ${used.length} map(s) : leurs tiles disparaîtront.` : ''), { danger: true, ok: 'Supprimer' }))) return;
        list.splice(list.indexOf(ts), 1); change(); renderBody();
      }
    }));
    const pane = h('div', { class: 'db-form' });
    body.append(pane);
    if (!ts) { pane.append(h('div', { class: 'db-empty' }, 'Aucun tileset. Importe une image (bouton Nouveau) ou une map Tiled.')); return; }
    pane.append(h('h2', {}, ts.name, h('span', { class: 'id' }, ts.image)));
    pane.append(UI.form([
      { key: 'name', label: 'Nom', type: 'text' },
      { type: 'row', fields: [
        { key: 'tileWidth', label: 'Largeur tile', type: 'number', min: 4, max: 512 },
        { key: 'tileHeight', label: 'Hauteur tile', type: 'number', min: 4, max: 512 },
        { key: 'margin', label: 'Marge', type: 'number', min: 0, max: 64 },
        { key: 'spacing', label: 'Espacement', type: 'number', min: 0, max: 64 }] },
      { type: 'info', text: (t) => `${t.columns} colonnes · ${t.tileCount} tiles` }
    ], ts, { onChange: (k) => { if (k !== 'name') recompute(ts); change(); if (k !== 'name') renderBody(); } }));

    if (!tsBrush || !byId(db().terrains, tsBrush)) tsBrush = db().terrains[0] ? db().terrains[0].id : null;
    const picks = h('div', { class: 'pick-list' });
    const drawPicks = () => {
      picks.innerHTML = '';
      picks.append(h('div', { class: 'pick' + (tsBrush === '' ? ' on' : ''), onclick: () => { tsBrush = ''; drawPicks(); } }, h('span', { class: 'sw', style: { background: 'transparent', border: '1px dashed #777' } }), h('span', {}, 'Aucun (défaut)')));
      for (const t of db().terrains) picks.append(h('div', { class: 'pick' + (tsBrush === t.id ? ' on' : ''), onclick: () => { tsBrush = t.id; drawPicks(); } }, h('span', { class: 'sw', style: { background: t.color } }), h('span', {}, t.name)));
    };
    drawPicks();

    const cv = h('canvas'); const c2 = cv.getContext('2d');
    const img = Render.readyImage(Editor.baseUrl(), ts.image);
    const sc = img && img.width <= 400 ? 2 : 1;
    const paint = () => {
      if (!img) return;
      cv.width = img.width * sc; cv.height = img.height * sc;
      c2.imageSmoothingEnabled = false;
      c2.drawImage(img, 0, 0, cv.width, cv.height);
      const tmap = {}; db().terrains.forEach(t => { tmap[t.id] = t; });
      c2.font = `600 ${Math.max(9, ts.tileHeight * sc * 0.24)}px sans-serif`; c2.textAlign = 'center'; c2.textBaseline = 'middle';
      for (let i = 0; i < ts.tileCount; i++) {
        const { sx, sy } = Render.tileSource(ts, i);
        const t = tmap[ts.tileTerrain[i]];
        const x = sx * sc, y = sy * sc, w = ts.tileWidth * sc, hh = ts.tileHeight * sc;
        c2.strokeStyle = 'rgba(255,255,255,.12)'; c2.strokeRect(x + .5, y + .5, w - 1, hh - 1);
        if (!t) continue;
        c2.globalAlpha = .45; c2.fillStyle = t.color; c2.fillRect(x, y, w, hh); c2.globalAlpha = 1;
        c2.fillStyle = 'rgba(0,0,0,.6)'; c2.fillText(t.name.slice(0, 4), x + w / 2 + 1, y + hh / 2 + 1);
        c2.fillStyle = '#fff'; c2.fillText(t.name.slice(0, 4), x + w / 2, y + hh / 2);
      }
    };
    let down = false;
    const at = (e) => {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) / sc - (ts.margin || 0), py = (e.clientY - r.top) / sc - (ts.margin || 0);
      const cx = Math.floor(px / (ts.tileWidth + (ts.spacing || 0))), cy = Math.floor(py / (ts.tileHeight + (ts.spacing || 0)));
      if (cx < 0 || cy < 0 || cx >= ts.columns) return -1;
      const i = cy * ts.columns + cx; return i < ts.tileCount ? i : -1;
    };
    const apply = (e, clear) => {
      const i = at(e); if (i < 0) return;
      const v = clear ? '' : tsBrush;
      if ((ts.tileTerrain[i] || '') === v) return;
      if (v) ts.tileTerrain[i] = v; else delete ts.tileTerrain[i];
      change(); paint();
    };
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', (e) => { down = e.button === 2 ? 'clear' : 'paint'; apply(e, down === 'clear'); });
    cv.addEventListener('mousemove', (e) => { if (down) apply(e, down === 'clear'); });
    window.addEventListener('mouseup', () => { down = false; });
    paint();
    pane.append(h('div', { class: 'form-heading', style: { maxWidth: '760px' } }, 'Terrain de chaque tile'),
      h('p', { class: 'form-info', style: { margin: '6px 0 10px' } }, 'Choisis un terrain puis clique / glisse sur les tiles. Clic droit = retirer. Les cases de la map prennent le terrain de leur tile le plus haut.'),
      h('div', { class: 'ts-terrain' }, h('div', { class: 'ts-canvas-wrap' }, img ? cv : h('div', { class: 'palette-empty' }, 'Image introuvable.')), picks));
  }
  function recompute(t) {
    const m = t.margin || 0, s = t.spacing || 0;
    if (t.imageWidth) t.columns = Math.max(1, Math.floor((t.imageWidth - 2 * m + s) / (t.tileWidth + s)));
    if (t.imageHeight) t.tileCount = t.columns * Math.max(1, Math.floor((t.imageHeight - 2 * m + s) / (t.tileHeight + s)));
  }

  // ------------------------------------------------------------------
  // Actes (niveaux jouables, data/chapters.json) : objectif + événements / dialogues
  // ------------------------------------------------------------------
  const TRIGGERS = [
    { value: 'start', label: "Début de l'acte" },
    { value: 'turn', label: 'Début du tour (phase joueur)' },
    { value: 'death', label: "Unité vaincue (mort ou retraite)" },
    { value: 'area', label: 'Une unité du joueur entre dans une zone' },
    { value: 'victory', label: 'Victoire' }
  ];

  function renderChapters(body) {
    const list = db().chapters;
    const maps = Editor.project().maps;
    if (!list.find(e => e.id === selected.chapters)) selected.chapters = list[0] ? list[0].id : null;
    const ch = byId(list, selected.chapters);
    body.append(chapterTree());
    const pane = h('div', { class: 'db-form' });
    body.append(pane);
    if (!ch) { pane.append(h('div', { class: 'db-empty' }, 'Aucun acte.')); return; }
    if (!ch.kind) ch.kind = 'story';
    if (ch.replay === undefined) ch.replay = true;
    ch.unlock = Object.assign({ after: '', alive: [], from: '', to: '' }, ch.unlock || {});
    pane.append(h('h2', {}, ch.name, h('span', { class: 'id' }, ch.id)));
    const info = Lobby.actInfo(db(), ch.id);
    const inArc = info && !info.arc.implicit;
    pane.append(inArc
      ? h('p', { class: 'arc-line' }, h('b', {}, info.arc.name), ` · acte ${info.index + 1} sur ${info.arc.acts.length} `, h('a', { href: '#', onclick: (e) => { e.preventDefault(); selectNode('arcs', info.arc.id); } }, 'Voir le chapitre'))
      : h('div', { class: 'arc-line muted' }, "Cet acte n'est rangé dans aucun chapitre : il apparaît seul au tableau des quêtes. ",
        (db().arcs || []).length ? (() => {
          const sel = h('select', {}, (db().arcs || []).map(a => h('option', { value: a.id }, a.name || a.id)));
          return h('span', { class: 'arc-add' }, sel, h('button', { class: 'small', onclick: () => { const a = byId(db().arcs, sel.value); a.acts = (a.acts || []).concat(ch.id); change(); renderBody(); } }, 'Ranger dans ce chapitre'));
        })() : h('a', { href: '#', onclick: (e) => { e.preventDefault(); addArc('story'); } }, 'Créer un chapitre')));
    pane.append(UI.form([
      { type: 'row', fields: [
        { key: 'name', label: 'Nom', type: 'text' },
        { key: 'mapId', label: 'Map', type: 'select', options: maps.map(m => ({ value: m.id, label: m.name })) }] },
      { type: 'row', fields: [
        { key: 'objective.type', label: 'Objectif', type: 'select', options: Editor.objectives },
        { key: 'objective.turns', label: 'Tours (survie)', type: 'number', min: 1, max: 99, when: c => c.objective.type === 'survive' },
        { key: 'objective.x', label: 'Case X', type: 'number', min: 0, max: 499, when: c => c.objective.type === 'seize' },
        { key: 'objective.y', label: 'Case Y', type: 'number', min: 0, max: 499, when: c => c.objective.type === 'seize' }] },
      { key: 'objective.text', label: "Texte de l'objectif (optionnel)", type: 'text', placeholder: 'ex. Vaincre Gorvald' },
      { type: 'row', fields: [
        { key: 'next', label: 'Acte suivant (jeu sans lobby)', type: 'select', empty: '— aucun —', options: () => db().chapters.filter(c => c.id !== ch.id).map(c => ({ value: c.id, label: Lobby.actLabel(db(), c.id) })) },
        { key: 'final', label: "Dernier acte : la victoire ouvre l'épilogue", type: 'checkbox' }] },
      { type: 'info', text: "Sans lobby, « Acte suivant » enchaîne les actes. Avec le lobby, l'ordre vient des chapitres (la liste à gauche). Les niveaux, objets, convoi, affinités et morts sont conservés d'un acte à l'autre." },
      { type: 'heading', label: 'Lobby : récompense' + (inArc ? '' : ', type et déblocage') },
      { type: 'row', fields: [
        inArc ? null : { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'story', label: 'Histoire' }, { value: 'event', label: 'Évènement (optionnel)' }] },
        { key: 'gold', label: 'Or à la victoire', type: 'number', min: 0, max: 999999 }].filter(Boolean) },
      { type: 'row', fields: [
        { key: 'goldEachClear', label: "Or à chaque victoire (sinon : la première fois)", type: 'checkbox' },
        { key: 'replay', label: 'Rejouable une fois terminé', type: 'checkbox' }] },
      inArc ? { type: 'info', text: `Type, conditions et dates se règlent sur le chapitre « ${info.arc.name} » ; ses actes se jouent dans l'ordre.` } : null,
      inArc ? null : { key: 'unlock.after', label: 'Disponible après', type: 'select', empty: '— pas de condition —', options: () => doneOpts(ch.id) },
      inArc ? null : { key: 'unlock.alive', label: 'Seulement si ces personnages sont en vie', type: 'multicheck', options: () => db().units.map(u => ({ value: u.id, label: u.name })) },
      inArc ? null : { type: 'row', fields: [
        { key: 'unlock.from', label: 'Disponible du (date réelle)', type: 'date' },
        { key: 'unlock.to', label: 'au (inclus)', type: 'date' }] },
      { type: 'info', text: (c) => (Lobby.defaults(Editor.project().meta.lobby).enabled ? '' : '⚠ Le lobby est désactivé (onglet Lobby) : ces réglages ne servent pas encore. ') +
        (inArc ? '' : c.kind === 'event' ? "Évènement : visible au tableau des quêtes quand ses conditions sont remplies ; un évènement daté s'affiche « Bientôt » avant sa date." : "Histoire : s'ouvre quand l'acte qui le désigne comme « suivant » est terminé (ou s'il est l'acte de départ).") },
      { type: 'info', text: (c) => `${c.players.length} unité(s) joueur · ${c.enemies.length} ennemi(s) — les placements se font sur la map (mode Unités, F3).` }
    ], ch, { onChange: (k) => { change(); if (k === 'objective.type' || k === 'name' || k === 'kind') renderBody(); } }));
    renderDeployment(pane, ch);
    renderMissionRules(pane, ch);
    renderVillages(pane, ch);
    renderLocks(pane, ch);
    pane.append(h('div', { class: 'insp-actions', style: { margin: '10px 0 4px' } },
      h('button', { class: 'small', onclick: async () => { await close(); Editor.selectChapter(ch.id); } }, 'Ouvrir sur la map'),
      h('button', { class: 'small primary', html: Icons.icon('play'), onclick: async () => { await close(); Editor.playtest(ch.id); } }, 'Tester')));

    // événements
    pane.append(h('div', { class: 'form-heading', style: { maxWidth: '760px' } }, 'Événements & dialogues'));
    const evBox = h('div', { class: 'events', style: { maxWidth: '760px', marginTop: '10px' } });
    const targets = () => [{ value: '', label: '— choisir —' }]
      .concat(ch.players.map(p => { const u = byId(db().units, p.unitId); return { value: 'unit:' + p.unitId, label: '★ ' + (u ? u.name : p.unitId) }; }))
      .concat((ch.allies || []).map(p => { const u = byId(db().units, p.unitId); return { value: 'unit:' + p.unitId, label: '✚ ' + (u ? u.name : p.unitId) + ' (allié)' }; }))
      .concat(ch.enemies.map(e => ({ value: e.id, label: `✖ ${e.name || e.classId} (${e.x},${e.y})` })));
    ch.events.forEach((ev, i) => {
      const trig = h('select', {}, TRIGGERS.map(t => h('option', { value: t.value }, t.label)));
      trig.value = ev.trigger.type;
      trig.addEventListener('change', () => { ev.trigger = { type: trig.value }; if (trig.value === 'turn') ev.trigger.turn = 2; if (trig.value === 'area') Object.assign(ev.trigger, { x: 0, y: 0, w: 1, h: 1 }); change(); renderBody(); });
      const params = [];
      if (ev.trigger.type === 'turn') {
        const n = h('input', { type: 'number', min: 1, max: 99, style: { width: '70px' } }); n.value = ev.trigger.turn || 1;
        n.addEventListener('change', () => { ev.trigger.turn = Number(n.value) || 1; change(); });
        params.push(h('span', { class: 'muted' }, 'tour'), n);
      }
      if (ev.trigger.type === 'death') {
        const s = h('select', {}, targets().map(o => h('option', { value: o.value }, o.label))); s.value = ev.trigger.target || '';
        s.addEventListener('change', () => { ev.trigger.target = s.value; change(); });
        params.push(s);
      }
      if (ev.trigger.type === 'area') {
        for (const k of ['x', 'y', 'w', 'h']) {
          const n = h('input', { type: 'number', min: k === 'w' || k === 'h' ? 1 : 0, max: 499, style: { width: '58px' }, title: k }); n.value = ev.trigger[k] ?? (k === 'w' || k === 'h' ? 1 : 0);
          n.addEventListener('change', () => { ev.trigger[k] = Number(n.value) || 0; change(); });
          params.push(h('span', { class: 'muted' }, k), n);
        }
      }
      const once = h('input', { type: 'checkbox' }); once.checked = ev.once !== false;
      once.addEventListener('change', () => { ev.once = once.checked; change(); });
      const ta = h('textarea', { rows: 5, spellcheck: false, placeholder: 'Aldric: On avance !\nMaëlle: À vos ordres.' }); ta.value = ev.script || '';
      ta.addEventListener('input', () => { ev.script = ta.value; change(); });
      const up = h('button', { class: 'mini', html: Icons.icon('up'), title: 'Monter', onclick: () => { if (i > 0) { [ch.events[i - 1], ch.events[i]] = [ch.events[i], ch.events[i - 1]]; change(); renderBody(); } } });
      const del = h('button', { class: 'mini', html: Icons.icon('trash'), title: 'Supprimer', onclick: () => { ch.events.splice(i, 1); change(); renderBody(); } });
      evBox.append(h('div', { class: 'event-card' },
        h('div', { class: 'event-head' }, h('span', { html: Icons.icon('chat') }), trig, ...params, h('span', { class: 'grow' }), h('label', { class: 'field checkbox' }, once, h('span', {}, 'une fois')), up, del),
        h('div', { class: 'event-body' }, ta, h('div', { class: 'event-tip' }, 'Une réplique par ligne : « Nom: texte ». Le portrait est pris dans la fiche de l\'unité du même nom. Une ligne sans « : » = narration.'))));
    });
    evBox.append(h('div', {}, h('button', { class: 'small', html: Icons.icon('plus'), onclick: () => { ch.events.push({ id: Editor.uid('ev', ch.events), trigger: { type: 'start' }, once: true, script: '' }); change(); renderBody(); } }, 'Ajouter un événement')));
    pane.append(evBox);
  }

  // ------------------------------------------------------------------
  // Règles de mission : les anciens projets restent inchangés tant qu'un champ n'est pas modifié.
  // ------------------------------------------------------------------
  function renderVillages(pane, ch) {
    const map = Editor.project().maps.find(m => m.id === ch.mapId);
    pane.append(h('div', { class: 'form-heading' }, 'Villages à visiter'), h('p', { class: 'form-info' }, 'Les villages se placent en mode Unités (F3), outil Village. Le visiteur doit être sur la case ; visiter consomme son action.'));
    if (!map) return;
    for (const village of ch.villages || []) {
      const card = h('details', { class: 'event-card', style: { padding: '10px', marginTop: '8px' } }, h('summary', {}, `${village.name || 'Village'} (${village.x}, ${village.y})`));
      card.append(VillageFields.form(village, db(), map, { onChange: () => change() }), h('div', { class: 'insp-actions' },
        h('button', { class: 'small', onclick: async () => { await close(); Editor.selectVillage(ch.id, village.id); } }, 'Voir sur la map'),
        h('button', { class: 'small danger', onclick: async () => {
          if (!(await UI.confirm('Supprimer ce village ?', { danger: true, ok: 'Supprimer' }))) return;
          ch.villages = ch.villages.filter(v => v !== village); change(); renderBody();
        } }, 'Supprimer')));
      pane.append(card);
    }
    pane.append(h('button', { class: 'small', 'data-db-place-village': true, onclick: async () => { await close(); Editor.placeVillage(ch.id); } }, 'Placer un village sur la map'));
    for (const error of Villages.validate(ch, db(), map)) pane.append(h('p', { class: 'note' }, '⚠ ' + error));
  }
  function renderLocks(pane, ch) {
    const map = Editor.project().maps.find(m => m.id === ch.mapId); if (!map) return;
    for (const kind of ['chests', 'doors']) {
      pane.append(h('div', { class: 'form-heading' }, kind === 'chests' ? 'Coffres' : 'Portes'));
      for (const object of ch[kind] || []) {
        const card = h('details', { class: 'event-card', style: { padding: '10px', marginTop: '8px' } }, h('summary', {}, `${object.name} (${object.x}, ${object.y})`));
        card.append(LockFields.form(object, kind, db(), map, { onChange: () => change() }), h('div', { class: 'insp-actions' },
          h('button', { class: 'small', onclick: async () => { await close(); Editor.selectInteraction(ch.id, kind, object.id); } }, 'Voir sur la map'),
          h('button', { class: 'small danger', onclick: async () => {
            if (!(await UI.confirm('Supprimer cette interaction ?', { danger: true, ok: 'Supprimer' }))) return;
            ch[kind] = ch[kind].filter(o => o !== object); change(); renderBody();
          } }, 'Supprimer'))); pane.append(card);
      }
      pane.append(h('button', { class: 'small', 'data-db-place-lock': kind, onclick: async () => { await close(); Editor.placeInteraction(ch.id, kind); } }, kind === 'chests' ? 'Placer un coffre sur la map' : 'Placer une porte sur la map'));
    }
    for (const error of Locks.validate(ch, db(), map)) pane.append(h('p', { class: 'note' }, '⚠ ' + error));
  }
  function renderDeployment(pane, ch) {
    const model = { enabled: Deployment.enabled(ch), limit: (ch.deployment || {}).limit || 0, forcedUnits: ((ch.deployment || {}).forcedUnits || []).slice() };
    pane.append(UI.form([
      { type: 'heading', label: 'Préparatifs et déploiement' },
      { key: 'enabled', label: 'Choisir l’équipe avant cet acte', type: 'checkbox' },
      { key: 'limit', label: 'Nombre maximum de participants (0 = toutes les cases de départ)', type: 'number', min: 0, max: ch.players.length },
      { key: 'forcedUnits', label: 'Personnages imposés en plus de ceux à protéger', type: 'multicheck', options: [...new Set([...ch.players.map(p => p.unitId), ...model.forcedUnits])].map(id => ({ value: id, label: uName(id) + (ch.players.some(p => p.unitId === id) ? '' : ' (placement manquant)') })) },
      { type: 'info', text: 'Les placements joueur (F3) définissent les cases de départ et les personnages recrutés au lancement de l’acte. Les recrues en réserve peuvent prendre leur place. Les personnages à protéger sont toujours imposés ; les alliés verts restent fixes. Désactiver ce choix conserve les placements scénarisés.' }
    ], model, { onChange: () => { ch.deployment = model; change(); } }));
    const map = Editor.project().maps.find(m => m.id === ch.mapId);
    if (map) for (const error of Deployment.validate(ch, db(), map)) pane.append(h('p', { class: 'note' }, '⚠ ' + error));
  }
  function renderMissionRules(pane, ch) {
    const names = db().units.map(u => ({ value: u.id, label: u.name }));
    const model = {
      requiredUnits: Mission.required(ch, db()).slice(), seizeUnits: Mission.seizers(ch, db()).slice(),
      defeatAll: ch.defeatAll !== false, victoryMode: ch.victoryMode || 'all',
      turnLimit: ch.turnLimit || 0, lossLimit: ch.lossLimit || 0,
      defendZone: Object.assign({ enabled: false, x: 0, y: 0, w: 1, h: 1 }, ch.defendZone)
    };
    pane.append(UI.form([
      { type: 'heading', label: 'Conditions de victoire et de défaite' },
      { key: 'victoryMode', label: 'Victoire lorsque…', type: 'select', options: [
        { value: 'all', label: 'Toutes les conditions sont remplies (ET)' }, { value: 'any', label: 'Au moins une condition est remplie (OU)' }] },
      { key: 'requiredUnits', label: 'Personnages devant survivre (joueurs ou alliés placés sur cette map)', type: 'multicheck', options: names },
      { type: 'info', text: 'Aucune sélection = aucune défaite liée à un personnage. Cette protection reste active en Détente et pour les personnages qui se retirent.' },
      { key: 'seizeUnits', label: 'Personnages autorisés à prendre les points', type: 'multicheck', options: names },
      { key: 'defeatAll', label: 'Défaite si toutes les unités du joueur sont vaincues', type: 'checkbox' },
      { type: 'row', fields: [
        { key: 'turnLimit', label: 'Limite de tours complets (0 = aucune)', type: 'number', min: 0, max: 999 },
        { key: 'lossLimit', label: 'Défaite à N pertes joueur + alliés (0 = aucune)', type: 'number', min: 0, max: 999 }] },
      { key: 'defendZone.enabled', label: 'Défaite si un ennemi atteint une zone', type: 'checkbox' },
      { type: 'row', fields: ['x', 'y', 'w', 'h'].map(k => ({ key: 'defendZone.' + k,
        label: { x: 'Zone X', y: 'Zone Y', w: 'Largeur', h: 'Hauteur' }[k], type: 'number', min: k === 'w' || k === 'h' ? 1 : 0, max: 499 })) }
    ], model, { onChange: k => {
      const key = k.split('.')[0]; ch[key] = model[key]; change();
    } }));
    pane.append(h('div', { class: 'form-heading' }, 'Objectifs supplémentaires'));
    for (const [i, ob] of (ch.extraObjectives || []).entries()) {
      const card = h('div', { class: 'event-card', style: { padding: '12px', marginTop: '8px' } });
      card.append(UI.form([
        { key: 'type', label: 'Condition ' + (i + 2), type: 'select', options: Editor.objectives.concat([{ value: 'target', label: 'Vaincre un ennemi précis' }]) },
        { key: 'target', label: 'Ennemi à vaincre', type: 'select', empty: '— choisir —', when: o => o.type === 'target', options: ch.enemies.map(e => ({ value: e.id, label: e.name || e.id })) },
        { key: 'turns', label: 'Tours complets à survivre', type: 'number', min: 1, max: 999, when: o => o.type === 'survive' },
        { key: 'x', label: 'Point X', type: 'number', min: 0, max: 499, when: o => o.type === 'seize' },
        { key: 'y', label: 'Point Y', type: 'number', min: 0, max: 499, when: o => o.type === 'seize' },
        { key: 'text', label: 'Texte affiché (facultatif)', type: 'text' }
      ], ob, { onChange: k => { change(); if (k === 'type') renderBody(); } }),
      h('button', { class: 'small danger', onclick: () => { ch.extraObjectives.splice(i, 1); change(); renderBody(); } }, 'Retirer cette condition'));
      pane.append(card);
    }
    pane.append(h('button', { class: 'small', style: { marginTop: '8px' }, onclick: () => {
      ch.extraObjectives = ch.extraObjectives || [];
      ch.extraObjectives.push({ type: 'survive', turns: 8, x: 0, y: 0 }); change(); renderBody();
    } }, 'Ajouter une condition de victoire'));
    const map = Editor.project().maps.find(m => m.id === ch.mapId);
    if (map) for (const error of Mission.validate(ch, db(), map)) pane.append(h('p', { class: 'note' }, '⚠ ' + error));
  }

  // ------------------------------------------------------------------
  // Ressources (ressources/…) : par personnage, aperçu animé, couleurs d'équipe, utilisation
  // ------------------------------------------------------------------
  let animToken = 0;
  let resSel = null, resPalette = 'original', resAnim = 'attack';
  const PAL_LABELS = Palettes.LABELS;
  const KIND_LABEL = { characters: 'Sprite de map', battlers: 'Animation de combat', faces: 'Portrait', tilesets: 'Tileset' };

  function usageOfResource(key) {
    const out = [];
    for (const c of db().classes) if (c.mapSprite === key || c.battler === key) out.push('Classe « ' + c.name + ' »');
    for (const u of db().units) if (u.mapSprite === key || u.battler === key || u.portrait === key) out.push('Unité « ' + u.name + ' »');
    for (const t of db().tilesets) if (t.image === key) out.push('Tileset « ' + t.name + ' »');
    return out;
  }

  /** Dossier (relatif au projet) qui contient une ressource. */
  const folderOf = (key) => key.split('/').slice(0, -1).join('/');

  // Tri des ressources graphiques : par personnage (dossier), type, série ou arme du personnage
  const RES_SORTS = [{ id: '', label: 'Personnage (dossier)' }, { id: 'type', label: 'Type de ressource' }, { id: 'series', label: 'Série' }, { id: 'weapon', label: 'Arme' }];
  const resView = { by: '', query: '' };
  try { resView.by = JSON.parse(localStorage.getItem('tf.resView') || '{}').by || ''; } catch (e) { /* stockage indisponible */ }
  const foldText = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  /** Personnages et classes liés à un dossier de ressources : même nom, ou une de ses ressources leur est attribuée. */
  function ownerLinks(owner) {
    const d = db(), uses = (o) => [o.portrait, o.battler, o.mapSprite].some(k => k && ownerOfKey(k) === owner);
    const units = d.units.filter(u => foldText(u.name) === foldText(owner) || uses(u));
    const classes = d.classes.filter(uses);
    return { units, classes };
  }
  function ownerSeries(owner) {
    const { units } = ownerLinks(owner);
    return [...new Set(units.map(u => Roster.seriesOf(u)).filter(Boolean))];
  }
  function ownerWeapons(owner) {
    const { units, classes } = ownerLinks(owner);
    const types = new Set(units.flatMap(u => Roster.weaponTypesOf(u, db())));
    if (!types.size) for (const c of classes) for (const w of c.weapons || []) types.add(w);
    const order = Rules.WEAPON_TYPES.map(w => w.id);
    return [...types].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  /** Groupes affichés : [{ section, folder, label, items }] (label vide = pas de sous-titre). */
  function resourceGroups(owners, byOwner, tilesets, view) {
    const q = foldText(view.query).trim();
    const hit = (it) => !q || q.split(/\s+/).every(w => [it.label, it.key, it.owner, KIND_LABEL[it.kind], ...(it.owner ? ownerSeries(it.owner) : []), ...(it.owner ? ownerWeapons(it.owner).map(Roster.weaponLabel) : [])].some(t => foldText(t).includes(w)));
    const chars = owners.flatMap(o => byOwner.get(o)).filter(hit);
    const tiles = tilesets.filter(hit);
    const tileGroup = { section: 'Tilesets', folder: 'ressources/tilesets', label: '', items: tiles };
    const sectionP = 'Personnages', folderP = 'ressources/personnages';
    const by = view.by || '';
    if (by === 'type') {
      return ['characters', 'battlers', 'faces'].map(kind => ({ section: sectionP, folder: folderP, label: { characters: 'Sprites de map', battlers: 'Animations de combat', faces: 'Portraits' }[kind], items: chars.filter(it => it.kind === kind) }))
        .filter(g => g.items.length || !q).concat([tileGroup]);
    }
    const groups = new Map();
    const push = (key, label, it) => { if (!groups.has(key)) groups.set(key, { section: sectionP, folder: folderP, label, items: [] }); if (it) groups.get(key).items.push(it); };
    if (!by) {
      for (const o of owners) if (!q) push(o, o);
      for (const it of chars) push(it.owner || '(sans dossier)', it.owner || '(sans dossier)', it);
      return [...groups.values()].concat([tileGroup]);
    }
    for (const it of chars) {
      const keys = by === 'series' ? ownerSeries(it.owner) : ownerWeapons(it.owner).map(Roster.weaponLabel);
      if (!keys.length) push('~', by === 'series' ? Roster.NO_SERIES : Roster.NO_WEAPON, it);
      for (const k of keys) push(k, k, it);
    }
    const order = Rules.WEAPON_TYPES.map(w => w.name);
    const out = [...groups.entries()].sort(([a], [b]) => (a === '~') - (b === '~') || (by === 'weapon' ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b, 'fr'))).map(([, g]) => g);
    // à l'intérieur d'un groupe : par personnage puis par type
    for (const g of out) g.items.sort((a, b) => (a.owner || '').localeCompare(b.owner || '', 'fr') || ({ characters: 0, battlers: 1, faces: 2 }[a.kind] - { characters: 0, battlers: 1, faces: 2 }[b.kind]));
    return out.concat([tileGroup]);
  }

  function renderResources(body) {
    const r = res();
    // un groupe par dossier de personnage, puis les tilesets
    const byOwner = new Map();
    const add = (kind, key, label) => {
      const own = ownerOfKey(key) || '(sans dossier)';
      if (!byOwner.has(own)) byOwner.set(own, []);
      byOwner.get(own).push({ kind, key, label, owner: ownerOfKey(key) });
    };
    for (const own of r.owners || []) byOwner.set(own, []);
    for (const [k, m] of Object.entries(r.characters)) add('characters', k, m.name || k.split('/').pop());
    for (const [k, m] of Object.entries(r.battlers)) add('battlers', k, m.name || k.split('/').pop());
    for (const k of r.faces) add('faces', k, k.split('/').pop());
    const order = { characters: 0, battlers: 1, faces: 2 };
    const owners = [...byOwner.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
    for (const o of owners) byOwner.get(o).sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label, 'fr'));
    const tilesets = r.tilesets.map(k => ({ kind: 'tilesets', key: k, label: k.split('/').pop() }));
    const all = owners.flatMap(o => byOwner.get(o)).concat(tilesets);
    if (!resSel || !all.find(a => a.key === resSel.key)) resSel = all[0] || null;

    const items = h('div', { class: 'db-list-items' });
    const item = (it) => {
      const ic = it.kind === 'characters' ? Sprites.icon(Editor.baseUrl(), r.characters[it.key], 'original', 24)
        : h('span', { class: 'res-kind', title: KIND_LABEL[it.kind] }, { battlers: '⚔', faces: '☺', tilesets: '▦' }[it.kind] || '•');
      return h('div', { class: 'db-item' + (resSel && resSel.key === it.key ? ' on' : ''), title: it.key, onclick: () => { resSel = { kind: it.kind, key: it.key }; renderBody(); } },
        ic, h('span', {}, it.kind === 'faces' && resView.by && it.owner ? it.owner + ' — portrait' : it.label), h('span', { class: 'meta' }, resView.by === 'type' ? (it.owner || '') : KIND_LABEL[it.kind]));
    };
    const fill = () => {
      items.replaceChildren();
      const groups = resourceGroups(owners, byOwner, tilesets, resView);
      let currentSection = null;
      for (const g of groups) {
        if (g.section !== currentSection) { currentSection = g.section; items.append(h('div', { class: 'pick-group' }, g.section, g.folder ? h('span', { class: 'muted res-folder' }, g.folder) : null)); }
        if (g.label) items.append(h('div', { class: 'res-owner' }, g.label, h('span', { class: 'muted' }, g.items.length ? ` · ${g.items.length}` : ' · vide')));
        else if (!g.items.length) items.append(h('div', { class: 'db-item', style: { cursor: 'default' } }, h('span', { class: 'muted' }, 'vide')));
        for (const it of g.items) items.append(item(it));
      }
      if (resView.query && !groups.some(g => g.items.length)) items.append(h('p', { class: 'db-empty' }, 'Aucune ressource ne correspond.'));
    };
    fill();
    const search = h('input', { type: 'search', class: 'roster-search', placeholder: 'Rechercher (personnage, fichier, série, arme)…', value: resView.query });
    search.addEventListener('input', () => { resView.query = search.value; fill(); });
    const sort = h('select', { class: 'roster-sort', title: 'Trier / regrouper par' }, RES_SORTS.map(o => h('option', { value: o.id }, o.label)));
    sort.value = resView.by;
    sort.addEventListener('change', () => {
      resView.by = sort.value; fill();
      try { localStorage.setItem('tf.resView', JSON.stringify({ by: resView.by })); } catch (e) { /* stockage indisponible */ }
    });
    const tools = h('div', { class: 'roster-tools' }, search, h('label', {}, 'Trier par', sort));

    body.append(h('div', { class: 'db-list' }, tools, items, h('div', { class: 'db-list-actions' },
      h('button', { class: 'small', title: 'Ouvre le dossier de la ressource sélectionnée', onclick: () => tf.openResourceFolder(Editor.dir(), resSel ? folderOf(resSel.key) : 'ressources') }, 'Ouvrir le dossier'),
      h('button', { class: 'small', onclick: async () => { await Editor.rescanResources(); renderBody(); UI.toast('Ressources rechargées'); } }, 'Rescanner')),
      h('div', { class: 'db-list-actions' }, h('button', { class: 'small', onclick: installDefaults }, 'Ajouter les ressources par défaut'))));
    const pane = h('div', { class: 'db-form' });
    body.append(pane);
    if (!resSel) { pane.append(h('div', { class: 'db-empty' }, 'Aucune ressource. Range tes images dans ressources/personnages/<Nom>/ puis « Rescanner ».')); return; }
    const used = usageOfResource(resSel.key);
    const usage = h('p', { class: 'form-info', style: { margin: '10px 0 0' } }, used.length ? 'Utilisé par : ' + used.join(', ') : 'Utilisé nulle part pour le moment.');
    if (resSel.kind === 'characters') return previewCharacter(pane, resSel.key, r.characters[resSel.key], usage);
    if (resSel.kind === 'battlers') return previewBattler(pane, resSel.key, r.battlers[resSel.key], usage);
    pane.append(h('h2', {}, resSel.key.split('/').pop(), h('span', { class: 'id' }, resSel.key)),
      h('div', { class: 'res-stage' }, h('img', { src: Render.imageUrl(Editor.baseUrl(), resSel.key), class: 'res-img' + (resSel.kind === 'faces' ? ' big' : '') })), usage);
    if (resSel.kind === 'faces') previewFaceset(pane, resSel.key);
  }

  /**
   * Couleurs d'équipe d'une planche : nuancier de toutes ses couleurs, celles qui changent en
   * bleu / rouge / vert sont cochées. Un clic coche / décoche et enregistre dans le .json.
   */
  function teamColorsEditor(pane, key, meta) {
    const box = h('div', { class: 'team-colors' });
    pane.append(h('div', { class: 'form-heading' }, "Couleurs d'équipe"), box);
    const my = animToken;
    Render.loadImage(Editor.baseUrl(), meta.image).then(img => {
      if (!img || my !== animToken) return;
      const tc = Sprites.teamColors(img, meta);
      const on = new Set(tc.list);
      const save = async (list) => {
        try {
          const saved = await tf.setTeamColors(Editor.dir(), key, list);
          if (saved === null) delete meta.teamColors; else meta.teamColors = saved;
          renderBody();
        } catch (e) { UI.alert('Couleurs non enregistrées', e.message); }
      };
      const sw = h('div', { class: 'swatches' });
      for (const c of tc.colors.slice(0, 64)) {
        sw.append(h('button', {
          class: 'swatch' + (on.has(c.hex) ? ' on' : ''), style: { background: c.hex },
          title: `${c.hex} · ${c.count} px` + (on.has(c.hex) ? ' · change de couleur selon l\'équipe' : ''),
          onclick: () => { const next = new Set(on); if (next.has(c.hex)) next.delete(c.hex); else next.add(c.hex); save([...next]); }
        }));
      }
      box.append(sw,
        h('p', { class: 'form-info' }, (tc.auto ? 'Détection automatique' : 'Choisies à la main') +
          ` : ${on.size} couleur(s) cochée(s) — la tenue, l'armure… Clique une couleur pour la cocher ou la décocher. Les couleurs non cochées (peau, cheveux, armes) restent celles d'origine.`),
        h('div', { style: { display: 'flex', gap: '8px' } },
          tc.auto ? null : h('button', { class: 'small', onclick: () => save(null) }, 'Revenir à la détection automatique'),
          tc.auto ? h('button', { class: 'small', onclick: () => save([...on]) }, 'Garder ce choix') : null));
    });
  }
  /** Boutons de palette (aperçu) : origine, bleu, rouge, vert, gris. */
  function paletteChips(pane, withGray) {
    const list = Palettes.LIST.filter(p => withGray || p !== 'gray');
    if (!list.includes(resPalette)) resPalette = 'original';
    pane.append(chips(list.map(p => ({ value: p, label: PAL_LABELS[p] })), resPalette, (v) => { resPalette = v; renderBody(); }));
  }

  /** Face set (128×112) : portrait animé (clignement + bouche) et mini-portrait. */
  function previewFaceset(pane, key) {
    const my = animToken;
    Render.loadImage(Editor.baseUrl(), key).then(img => {
      if (my !== animToken || !Faces.isFaceset(img)) {
        if (img && my === animToken) pane.append(h('p', { class: 'form-info' }, `Portrait simple (${img.naturalWidth}×${img.naturalHeight}). Une planche de 128×112 au format face set des Fire Emblem GBA est animée : clignement des yeux et bouche qui bouge pendant les dialogues.`));
        return;
      }
      const main = Faces.element(img, '', 'main'), mini = Faces.element(img, '', 'mini');
      const S = Faces.sheetOf(img);
      const talkBtn = h('button', { class: 'small', onclick: () => { main.face.talking = !main.face.talking; talkBtn.textContent = main.face.talking ? 'Arrêter' : 'Faire parler'; } }, 'Faire parler');
      const smileBtn = h('button', { class: 'small', onclick: () => { main.face.smile = !main.face.smile; smileBtn.classList.toggle('on', main.face.smile); } }, 'Sourire');
      pane.append(h('div', { class: 'form-heading' }, 'Face set'),
        h('div', { class: 'faceset-demo' }, h('div', { class: 'fs-main' }, main), h('div', { class: 'fs-mini' }, mini)),
        h('div', { style: { display: 'flex', gap: '8px' } }, talkBtn, smileBtn),
        h('p', { class: 'form-info' }, `Bouche en ${S.mouth.join(',')} · yeux en ${S.eyes.join(',')} (trouvés automatiquement). Portrait 96×80 dans les dialogues, mini-portrait 32×32 dans les fenêtres d'unité.`));
    });
  }

  async function installDefaults() {
    const r = await tf.installDefaultResources(Editor.dir());
    await Editor.rescanResources();
    // relie les classes connues (Seigneur, Brigand…) à leurs sprites si elles n'en ont pas, et ajoute les classes de seigneurs manquantes
    let linked = 0, addedCls = 0;
    for (const def of Defaults.classes()) {
      const c = byId(db().classes, def.id);
      if (!c) { if (def.mapSprite || def.battler) { db().classes.push(JSON.parse(JSON.stringify(def))); addedCls++; } continue; }
      if (!c.mapSprite && def.mapSprite) { c.mapSprite = def.mapSprite; linked++; }
      if (!c.battler && def.battler) { c.battler = def.battler; linked++; }
    }
    change(); renderBody();
    UI.alert('Ressources par défaut', [`${r.added} fichier(s) copié(s) dans ressources/`, `${linked} lien(s) sprite ajouté(s) sur des classes existantes`, `${addedCls} classe(s) de seigneur ajoutée(s)`]);
  }

  function chips(options, cur, onPick) {
    return h('div', { class: 'chips' }, options.map(o => h('button', { class: 'chip' + (o.value === cur ? ' on' : ''), onclick: () => onPick(o.value) }, o.label)));
  }

  function previewCharacter(pane, key, meta, usage) {
    pane.append(h('h2', {}, meta.name, h('span', { class: 'id' }, meta.image)));
    paletteChips(pane, true);
    const names = Object.keys(meta.anims);
    const S = 4, cell = 32 * S;
    const cv = h('canvas', { width: names.length * (cell + 12), height: cell + 22, class: 'res-canvas' });
    pane.append(h('div', { class: 'res-stage' }, cv), h('p', { class: 'form-info' }, `Frames ${meta.frame[0]}×${meta.frame[1]} px · ancrage ${meta.anchor.join(',')} · base ${meta.base || 16} px` +
      (meta.palettes ? ' · ancienne planche à 4 palettes : seul le premier bloc est utilisé' : '')), usage);
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const my = animToken;
    Render.loadImage(Editor.baseUrl(), meta.image).then(img => {
      const loop = (t) => {
        if (my !== animToken || !img) return;
        g.clearRect(0, 0, cv.width, cv.height);
        names.forEach((n, i) => {
          const x0 = i * (cell + 12);
          g.fillStyle = '#20242c'; g.fillRect(x0, 0, cell, cell);
          g.fillStyle = '#2a2f39'; g.fillRect(x0 + 8 * S, 7 * S, 16 * S, 16 * S); // la case de 16×16
          Sprites.drawMapSprite(g, meta, img, x0 + meta.anchor[0] * S, meta.anchor[1] * S, S, { anim: n, t, palette: resPalette });
          g.fillStyle = '#a3a9b6'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText(n, x0 + cell / 2, cell + 16);
        });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    teamColorsEditor(pane, key, meta);
  }

  function previewBattler(pane, key, meta, usage) {
    const names = Object.keys(meta.anims);
    if (!meta.anims[resAnim]) resAnim = names.includes('attack') ? 'attack' : names[0];
    pane.append(h('h2', {}, meta.name, h('span', { class: 'id' }, meta.image)));
    paletteChips(pane, false);
    pane.append(chips(names.map(n => ({ value: n, label: n + ' (' + meta.anims[n].frames.length + ')' })), resAnim, (v) => { resAnim = v; renderBody(); }));
    const [cw, ch] = meta.cell; const S = Math.max(2, Math.min(4, Math.floor(420 / ch)));
    const cv = h('canvas', { width: Math.max(cw * S + 160, 360), height: ch * S + 30, class: 'res-canvas' });
    const info = h('p', { class: 'form-info' });
    pane.append(h('div', { class: 'res-stage' }, cv), info, usage);
    const A = meta.anims[resAnim];
    info.textContent = `Cellule ${cw}×${ch} · ${meta.count} frames uniques · regarde vers la ${meta.facing === 'left' ? 'gauche' : 'droite'}` +
      (A.hit !== undefined ? ` · impact frame ${A.hit}` : '') + (A.release !== undefined ? ` · tir frame ${A.release}` : '') +
      (A.approach ? ` · élan ${A.approach.join('–')}` : '') + (A.retreat ? ` · retour ${A.retreat.join('–')}` : '');
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const my = animToken;
    const total = (A.durations || []).reduce((a, b) => a + b, 0) + 500;
    Render.loadImage(Editor.baseUrl(), meta.image).then(img => {
      const t0 = performance.now();
      const loop = (t) => {
        if (my !== animToken || !img) return;
        let k = (t - t0) % total, i = 0;
        while (i < A.frames.length && k >= A.durations[i]) { k -= A.durations[i]; i++; }
        const idx = Math.min(i, A.frames.length - 1);
        g.clearRect(0, 0, cv.width, cv.height);
        const ground = ch * S - 4;
        g.fillStyle = '#20242c'; g.fillRect(0, 0, cv.width, cv.height);
        g.fillStyle = '#2c313b'; g.fillRect(0, ground, cv.width, cv.height - ground);
        Sprites.drawBattlerFrame(g, meta, Sprites.tinted(img, meta, resPalette), A.frames[idx], cv.width / 2, ground, S, false);
        g.fillStyle = idx === A.hit ? '#f2c46a' : '#a3a9b6'; g.font = '12px sans-serif'; g.textAlign = 'left';
        g.fillText(`frame ${idx + 1}/${A.frames.length}` + (idx === A.hit ? '  ← impact' : ''), 8, cv.height - 8);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    teamColorsEditor(pane, key, meta);
  }

  // ------------------------------------------------------------------
  // Chapitres : groupes d'actes (data/arcs.json), joués dans l'ordre, rangés en Histoire / Évènements
  // ------------------------------------------------------------------
  /** Nouvel acte vide sur la map courante (ou la première). */
  // ------------------------------------------------------------------
  // Chapitres et actes : un seul onglet, arbre des chapitres avec leurs actes en sous-cases
  // ------------------------------------------------------------------
  const collapsedArcs = new Set();
  const treeView = { query: '' };
  function arcOfAct(id) { return (db().arcs || []).find(a => (a.acts || []).includes(id)); }
  function selectNode(kind, id) { tab = kind; selected[kind] = id; renderTabs(); renderBody(); }
  async function deleteAct(ch) {
    const list = db().chapters;
    const recruits = db().units.filter(u => u.recruitAfter === ch.id);
    if (recruits.length) return UI.alert('Acte utilisé pour un recrutement', 'Modifie d’abord le recrutement de : ' + recruits.map(u => u.name).join(', ') + '.');
    if (!(await UI.confirm(`Supprimer l'acte « ${ch.name} » et tous ses placements / événements ?`, { danger: true, ok: 'Supprimer' }))) return;
    const arc = arcOfAct(ch.id), pos = arc ? arc.acts.indexOf(ch.id) : -1;
    list.splice(list.indexOf(ch), 1);
    for (const a of db().arcs || []) a.acts = (a.acts || []).filter(id => id !== ch.id);
    if (Editor.project().meta.startChapter === ch.id) Editor.project().meta.startChapter = list[0] ? list[0].id : '';
    // sélection suivante : l'acte voisin du même chapitre, sinon le chapitre
    change();
    if (arc && arc.acts.length) selectNode('chapters', arc.acts[Math.min(pos, arc.acts.length - 1)]);
    else if (arc) selectNode('arcs', arc.id);
    else renderBody();
  }
  async function deleteArc(arc) {
    const list = db().arcs;
    const recruits = db().units.filter(u => u.recruitAfter === arc.id);
    if (recruits.length) return UI.alert('Chapitre utilisé pour un recrutement', 'Modifie d’abord le recrutement de : ' + recruits.map(u => u.name).join(', ') + '.');
    if (!(await UI.confirm(`Supprimer le chapitre « ${arc.name} » ? Ses actes sont gardés (ils apparaîtront seuls au tableau des quêtes, dans « Actes non rangés »).`, { danger: true, ok: 'Supprimer' }))) return;
    list.splice(list.indexOf(arc), 1); change(); renderBody();
  }
  function addArc(kind) {
    const list = db().arcs || (db().arcs = []);
    const a = { id: Editor.uid('arc_', list), name: kind === 'event' ? 'Évènement ' + (list.filter(x => x.kind === 'event').length + 1) : 'Chapitre ' + (list.filter(x => x.kind !== 'event').length + 1),
      kind, description: '', unlock: { after: '', alive: [], from: '', to: '' }, acts: [] };
    list.push(a); collapsedArcs.delete(a.id); change(); selectNode('arcs', a.id);
  }
  function addActTo(arc) {
    const c = newAct(); if (!c) return;
    if (arc) { c.name = `Acte ${arc.acts.length + 1}`; arc.acts.push(c.id); collapsedArcs.delete(arc.id); }
    change(); selectNode('chapters', c.id);
  }
  function chapterTree() {
    const arcs = db().arcs || [], acts = db().chapters;
    const curArc = tab === 'arcs' ? byId(arcs, selected.arcs) : null;
    const curAct = tab === 'chapters' ? byId(acts, selected.chapters) : null;
    const parentArc = curAct ? arcOfAct(curAct.id) : curArc;
    if (curAct && parentArc) collapsedArcs.delete(parentArc.id); // l'acte ouvert reste visible
    const maps = Editor.project().maps;
    const box = h('div', { class: 'db-list-items ch-tree' });
    const fold = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const actRow = (c, label) => {
      const map = byId(maps, c.mapId);
      return h('div', { class: 'db-item ch-act' + (curAct && curAct.id === c.id ? ' on' : ''), 'data-act': c.id, title: map ? 'Map : ' + map.name : '', onclick: () => selectNode('chapters', c.id) },
        h('span', { class: 'n' }, label), h('span', {}, c.name), c.id === Editor.project().meta.startChapter ? h('span', { class: 'sub' }, 'départ') : null);
    };
    const fill = () => {
      box.replaceChildren();
      const q = fold(treeView.query.trim());
      const hit = (...texts) => !q || texts.some(t => fold(t).includes(q));
      let shown = 0;
      for (const [kind, title] of [['story', 'Histoire'], ['event', 'Évènements']]) {
        const group = arcs.filter(a => (a.kind === 'event' ? 'event' : 'story') === kind);
        box.append(h('div', { class: 'db-group' }, title, h('button', { class: 'mini ch-add', title: kind === 'event' ? 'Nouvel évènement' : 'Nouveau chapitre', html: Icons.icon('plus'), onclick: () => addArc(kind) })));
        let any = false;
        group.forEach(a => {
          const list = (a.acts || []).map(id => byId(acts, id)).filter(Boolean);
          const arcHit = hit(a.name), matching = list.filter(c => arcHit || hit(c.name));
          if (q && !arcHit && !matching.length) return;
          any = true; shown++;
          const open = q || !collapsedArcs.has(a.id);
          const num = kind === 'event' ? '' : String(group.indexOf(a) + 1);
          box.append(h('div', { class: 'db-item ch-arc' + (curArc && curArc.id === a.id ? ' on' : ''), 'data-arc': a.id, onclick: () => selectNode('arcs', a.id) },
            h('button', { class: 'ch-toggle', title: open ? 'Replier' : 'Déplier', onclick: (e) => { e.stopPropagation(); if (collapsedArcs.has(a.id)) collapsedArcs.delete(a.id); else collapsedArcs.add(a.id); fill(); } }, open ? '▾' : '▸'),
            h('span', {}, a.name || a.id), h('span', { class: 'sub' }, num ? `ch. ${num} · ${list.length} acte(s)` : `${list.length} acte(s)`)));
          if (open) {
            (q ? matching : list).forEach(c => box.append(actRow(c, 'Acte ' + (list.indexOf(c) + 1))));
            if (!q) box.append(h('button', { class: 'ch-act ch-new', onclick: () => addActTo(a) }, '+ Nouvel acte'));
          }
        });
        if (!any) box.append(h('p', { class: 'db-empty' }, q ? 'Aucun résultat.' : (kind === 'event' ? 'Aucun évènement.' : 'Aucun chapitre.')));
      }
      const used = new Set(arcs.flatMap(a => a.acts || []));
      const free = acts.filter(c => !used.has(c.id) && hit(c.name));
      if (free.length) {
        box.append(h('div', { class: 'db-group' }, 'Actes non rangés', h('span', {}, String(free.length))));
        free.forEach(c => box.append(actRow(c, '—')));
      }
    };
    fill();
    const search = h('input', { type: 'search', class: 'roster-search', placeholder: 'Rechercher un chapitre ou un acte…', value: treeView.query });
    search.addEventListener('input', () => { treeView.query = search.value; fill(); });
    const target = curAct || curArc;
    const actions = h('div', { class: 'db-list-actions' },
      h('button', { class: 'small', title: 'Nouveau chapitre d’histoire', html: Icons.icon('plus'), onclick: () => addArc('story') }, 'Chapitre'),
      h('button', { class: 'small', title: parentArc ? `Nouvel acte dans « ${parentArc.name} »` : 'Nouvel acte (non rangé)', html: Icons.icon('plus'), onclick: () => addActTo(parentArc) }, 'Acte'),
      h('button', { class: 'small danger', title: curAct ? 'Supprimer cet acte' : 'Supprimer ce chapitre (ses actes sont gardés)', html: Icons.icon('trash'), disabled: !target,
        onclick: () => curAct ? deleteAct(curAct) : curArc && deleteArc(curArc) }));
    return h('div', { class: 'db-list' }, h('div', { class: 'roster-tools' }, search), box, actions);
  }

  function newAct() {
    const maps = Editor.project().maps, list = db().chapters;
    const m = maps.find(m => m.id === Editor.state.mapId) || maps[0];
    if (!m) { UI.alert('Pas de map', "Crée d'abord une map."); return null; }
    const c = { id: Editor.uid('ch_', list), name: 'Acte ' + (list.length + 1), mapId: m.id, objective: { type: 'rout', turns: 10, x: 0, y: 0 }, players: [], enemies: [], events: [], replay: true };
    list.push(c);
    return c;
  }
  function renderArcs(body) {
    const list = db().arcs || (db().arcs = []);
    if (!list.find(e => e.id === selected.arcs)) selected.arcs = list[0] ? list[0].id : null;
    const arc = byId(list, selected.arcs);
    body.append(chapterTree());
    const pane = h('div', { class: 'db-form' });
    body.append(pane);
    pane.append(h('p', { class: 'form-info', style: { maxWidth: '760px' } }, "Un chapitre regroupe des actes (les niveaux jouables), joués dans l'ordre : l'acte 2 s'ouvre quand l'acte 1 est terminé. Au tableau des quêtes du lobby, les chapitres d'histoire s'ouvrent l'un après l'autre (dans l'ordre de cette liste) ; les évènements selon leurs conditions et leurs dates."));
    for (const e of Lobby.validateArcs(db())) pane.append(h('p', { class: 'note' }, '⚠ ' + e));
    if (!arc) { pane.append(h('div', { class: 'db-empty' }, 'Aucun chapitre : chaque acte apparaît seul au tableau des quêtes. « + Chapitre » pour en créer un.')); return; }
    arc.unlock = Object.assign({ after: '', alive: [], from: '', to: '' }, arc.unlock || {});
    arc.acts = arc.acts || [];
    pane.append(h('h2', {}, arc.name, h('span', { class: 'id' }, arc.id)));
    pane.append(UI.form([
      { type: 'row', fields: [
        { key: 'name', label: 'Nom', type: 'text', placeholder: 'Chapitre 1 — …' },
        { key: 'kind', label: 'Section du tableau', type: 'select', options: [{ value: 'story', label: 'Histoire' }, { value: 'event', label: 'Évènements' }] }] },
      { key: 'description', label: 'Description (affichée au tableau des quêtes)', type: 'text' },
      { type: 'heading', label: 'Déblocage' },
      { key: 'unlock.after', label: 'Disponible après', type: 'select', empty: arc.kind === 'event' ? '— pas de condition —' : '— le chapitre d\'histoire précédent —', options: () => doneOpts(arc.id) },
      { key: 'unlock.alive', label: 'Seulement si ces personnages sont en vie', type: 'multicheck', options: () => db().units.map(u => ({ value: u.id, label: u.name })) },
      { type: 'row', fields: [
        { key: 'unlock.from', label: 'Disponible du (date réelle)', type: 'date' },
        { key: 'unlock.to', label: 'au (inclus)', type: 'date' }] },
      { type: 'info', text: (a) => a.kind === 'event' ? "Évènement : visible quand ses conditions sont remplies ; daté, il s'affiche « Bientôt » avant sa date et disparaît après." : "Histoire : s'ouvre quand le chapitre d'histoire précédent est terminé (le premier contient l'acte de départ, Système). Les conditions s'ajoutent à cet ordre." }
    ], arc, { onChange: (k) => { change(); if (k === 'kind') renderBody(); else if (k === 'name') { pane.querySelector('h2').firstChild.textContent = arc.name; const row = document.querySelector(`#db-body [data-arc="${arc.id}"] span:nth-child(2)`); if (row) row.textContent = arc.name; } } }));

    // actes du chapitre, dans l'ordre
    pane.append(h('div', { class: 'form-heading', style: { maxWidth: '760px' } }, `Actes (${arc.acts.length})`));
    const box = h('div', { class: 'arc-acts' });
    arc.acts.forEach((id, i) => {
      const c = byId(db().chapters, id);
      const map = c && byId(Editor.project().maps, c.mapId);
      const move = (d) => { const j = i + d; if (j < 0 || j >= arc.acts.length) return; [arc.acts[i], arc.acts[j]] = [arc.acts[j], arc.acts[i]]; change(); renderBody(); };
      box.append(h('div', { class: 'arc-act' },
        h('b', { class: 'arc-num' }, `Acte ${i + 1}`),
        h('span', { class: 'arc-name' }, c ? c.name : `introuvable (${id})`),
        h('span', { class: 'muted' }, c ? [map ? map.name : '—', `${c.players.length} joueur · ${c.enemies.length} ennemi`, Mission.label(Mission.objectives(c)[0] || { type: 'rout' }, c), c.gold ? c.gold + ' or' : ''].filter(Boolean).join(' · ') : ''),
        h('span', { class: 'arc-tools' },
          h('button', { class: 'mini', title: 'Monter', disabled: i === 0, onclick: () => move(-1) }, '▲'),
          h('button', { class: 'mini', title: 'Descendre', disabled: i === arc.acts.length - 1, onclick: () => move(1) }, '▼'),
          c ? h('button', { class: 'small', onclick: () => selectNode('chapters', id) }, 'Modifier') : null,
          c ? h('button', { class: 'small', onclick: async () => { await close(); Editor.selectChapter(id); } }, 'Placements') : null,
          h('button', { class: 'small danger', title: 'Retirer du chapitre (l\'acte est gardé)', html: Icons.icon('trash'), onclick: () => { arc.acts.splice(i, 1); change(); renderBody(); } }))));
    });
    if (!arc.acts.length) box.append(h('p', { class: 'muted' }, 'Aucun acte. Crée-en un ou ajoute un acte existant.'));
    pane.append(box);
    const used = new Set((db().arcs || []).flatMap(a => a.acts || []));
    const free = db().chapters.filter(c => !used.has(c.id));
    const sel = h('select', {}, free.map(c => h('option', { value: c.id }, c.name)));
    pane.append(h('div', { class: 'insp-actions', style: { margin: '8px 0', maxWidth: '760px' } },
      h('button', { class: 'small primary', html: Icons.icon('plus'), onclick: () => addActTo(arc) }, 'Nouvel acte'),
      free.length ? sel : null,
      free.length ? h('button', { class: 'small', onclick: () => { arc.acts.push(sel.value); change(); renderBody(); } }, 'Ajouter cet acte') : h('span', { class: 'muted' }, 'Tous les actes sont rangés dans un chapitre.')));
    const first = byId(db().chapters, arc.acts[0]);
    if (first) pane.append(h('div', { class: 'insp-actions', style: { margin: '6px 0' } },
      h('button', { class: 'small', html: Icons.icon('play'), onclick: async () => { await close(); Editor.playtest(first.id); } }, "Tester l'acte 1")));
  }

  // ------------------------------------------------------------------
  // Lobby : le camp entre deux chapitres (map explorable, table des chapitres, boutique, personnages)
  // ------------------------------------------------------------------
  let lobbyPick = 'start';
  function renderLobby(body) {
    const project = Editor.project();
    const cfg = project.meta.lobby = Lobby.defaults(project.meta.lobby);
    const maps = project.maps;
    const pane = h('div', { class: 'db-form' });
    body.append(pane);
    pane.append(h('h2', {}, 'Lobby', h('span', { class: 'id' }, 'le camp entre deux chapitres')),
      h('p', { class: 'form-info' }, "Une map explorable où le jeu commence et revient après chaque chapitre. Le héros s'y déplace (flèches ou clic), parle aux personnages présents, consulte la table des chapitres (histoire et évènements) et achète ou revend à la boutique."));
    // démarrage rapide pour un projet créé avant le lobby
    const sampleMap = Defaults.lobbyMap();
    const noPrices = db().weapons.concat(db().items).filter(e => e.price === undefined && Defaults.PRICES[e.id]);
    const quick = [];
    if (!maps.some(m => m.id === sampleMap.id) && !maps.some(m => m.id === cfg.mapId)) quick.push(h('button', { class: 'small', onclick: () => {
      if (!byId(db().tilesets, 'ts_plaines')) return UI.alert('Tileset manquant', 'La map d\'exemple utilise le tileset « Plaines » des ressources par défaut. Crée plutôt ta propre map de camp dans l\'éditeur, puis choisis-la ici.');
      maps.push(sampleMap);
      const def = Defaults.lobby();
      Object.assign(cfg, { enabled: true, mapId: sampleMap.id, start: def.start, board: Object.assign({}, cfg.board, { x: def.board.x, y: def.board.y }), shop: Object.assign({}, cfg.shop, { x: def.shop.x, y: def.shop.y }) });
      if (!cfg.shop.stock.length) cfg.shop.stock = def.shop.stock.filter(id => byId(db().weapons, id) || byId(db().items, id));
      change(); Editor.refresh(); renderBody(); UI.toast('Map « ' + sampleMap.name + ' » ajoutée au projet');
    } }, 'Ajouter la map du camp d\'exemple'));
    if (noPrices.length) quick.push(h('button', { class: 'small', onclick: () => {
      for (const e of noPrices) e.price = Defaults.PRICES[e.id];
      change(); renderBody(); UI.toast(noPrices.length + ' prix ajoutés');
    } }, `Ajouter les prix par défaut (${noPrices.length} armes et objets)`));
    if (quick.length) pane.append(h('div', { class: 'insp-actions', style: { margin: '4px 0 10px' } }, ...quick));
    let redraw = () => {};
    const goods = () => db().weapons.concat(db().items).filter(e => Lobby.price(e) > 0).map(e => ({ value: e.id, label: `${e.name} — ${Lobby.price(e)} or` }));
    pane.append(UI.form([
      { key: 'enabled', label: 'Activer le lobby (le jeu commence au camp et y revient après chaque chapitre)', type: 'checkbox' },
      { type: 'row', fields: [
        { key: 'name', label: 'Nom', type: 'text' },
        { key: 'mapId', label: 'Map du lobby', type: 'select', empty: '— choisir —', options: maps.map(m => ({ value: m.id, label: `${m.name} (${m.width}×${m.height})` })) }] },
      { type: 'row', fields: [
        { key: 'heroId', label: 'Héros (personnage que l\'on déplace)', type: 'select', empty: '— premier personnage principal —', options: () => db().units.map(u => ({ value: u.id, label: u.name })) },
        { key: 'startGold', label: 'Or au début de la partie', type: 'number', min: 0, max: 999999 },
        { key: 'music', label: 'Musique', type: 'select', empty: '— celle de la phase joueur —', options: () => audioOpts('bgm') }] },
      { type: 'heading', label: 'Équipe de départ' },
      { type: 'custom', render: () => {
        const roster = { initialRoster: Team.initialIds(db(), project.meta) };
        const form = UI.form([{ key: 'initialRoster', label: 'Effectif recruté au début de la partie', type: 'multicheck', options: () => db().units.map(u => ({ value: u.id, label: u.name })) },
          { type: 'info', text: 'Indépendant des PNJ placés au camp. Le héros du lobby est toujours inclus. Les autres recrutements se règlent dans les fiches Unités.' }], roster,
          { onChange: () => { cfg.initialRoster = roster.initialRoster; change(); } });
        const hero = Lobby.heroOf(cfg, db());
        form.querySelectorAll('.chip').forEach((button, index) => { if (hero && db().units[index].id === hero.id) { button.disabled = true; button.title = 'Le héros du lobby fait toujours partie de l’effectif.'; } });
        return form;
      } },
      { type: 'heading', label: 'Boutique' },
      { type: 'row', fields: [
        { key: 'shop.enabled', label: 'Boutique ouverte', type: 'checkbox' },
        { key: 'shop.name', label: 'Nom du marchand', type: 'text' },
        { key: 'board.label', label: 'Nom du tableau des quêtes', type: 'text' }] },
      { key: 'shop.stock', label: 'Articles en vente', type: 'multicheck', options: goods, when: c => c.shop.enabled },
      { type: 'info', text: "Seuls les objets qui ont un prix sont proposés (onglets Armes et Objets › Prix en boutique). La revente rapporte la moitié du prix, selon les utilisations restantes. L'or vient des récompenses de chapitre (onglet Chapitres) et des ennemis qui portent une bourse (inspecteur d'un ennemi, mode Unités)." }
    ], cfg, { onChange: (k) => { change(); if (['enabled', 'mapId', 'shop.enabled', 'heroId', 'name', 'shop.name', 'board.label'].includes(k)) renderBody(); else redraw(); } }));

    // ---- placement sur la map
    pane.append(h('div', { class: 'form-heading' }, 'Placement sur la map'));
    const map = maps.find(m => m.id === cfg.mapId);
    if (!map) { pane.append(h('p', { class: 'note' }, 'Choisis la map du lobby (crée-la comme une map de chapitre, dans l\'éditeur).')); return lobbyFooter(pane, cfg); }
    const hero = Lobby.heroOf(cfg, db());
    const targets = [['start', `Départ de ${hero ? hero.name : 'héros'}`], ['board', cfg.board.label || 'Tableau des quêtes']]
      .concat(cfg.shop.enabled ? [['shop', cfg.shop.name || 'Boutique']] : [])
      .concat(cfg.spots.map((sp, i) => ['spot' + i, uName(sp.unitId)]));
    if (!targets.some(t => t[0] === lobbyPick)) lobbyPick = 'start';
    pane.append(h('div', { class: 'lobby-pick' }, h('span', { class: 'muted' }, 'Clique sur la map pour placer :'),
      chips(targets.map(([value, label]) => ({ value, label })), lobbyPick, (v) => { lobbyPick = v; renderBody(); })));
    const point = (key) => key === 'start' ? cfg.start : key === 'board' ? cfg.board : key === 'shop' ? cfg.shop : cfg.spots[Number(key.slice(4))];
    const scale = Math.max(0.5, Math.min(2, 640 / (map.width * map.tileWidth)));
    const cv = h('canvas', { class: 'lobby-map', width: Math.round(map.width * map.tileWidth * scale), height: Math.round(map.height * map.tileHeight * scale) });
    pane.append(h('div', { class: 'res-stage lobby-stage' }, cv));
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * map.width), y = Math.floor((e.clientY - r.top) / r.height * map.height);
      const p = point(lobbyPick); if (!p) return;
      p.x = x; p.y = y; change();
      renderBody();
    });
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const my = animToken;
    function drawPreview() {
      if (my !== animToken) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#14161b'; g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(scale, 0, 0, scale, 0, 0);
      Render.drawMap(g, map, { scale: 1, baseUrl: Editor.baseUrl(), tilesets: db().tilesets });
      const tw = map.tileWidth, th = map.tileHeight;
      const mark = (p, color, text, on) => {
        g.strokeStyle = color; g.lineWidth = on ? 3 / scale + 1 : 2; g.strokeRect(p.x * tw + 1.5, p.y * th + 1.5, tw - 3, th - 3);
        g.font = `700 ${Math.round(11 / scale + 2)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, p.x * tw + tw / 2, p.y * th - 1);
        g.fillStyle = color; g.fillText(text, p.x * tw + tw / 2, p.y * th - 1);
      };
      const sprite = (unitId, p) => {
        const u = byId(db().units, unitId); if (!u) return false;
        const c = byId(db().classes, u.classId);
        const meta = res().characters[u.mapSprite || (c && c.mapSprite)];
        const img = meta && Render.readyImage(Editor.baseUrl(), meta.image);
        if (!img) { if (meta) Render.loadImage(Editor.baseUrl(), meta.image).then(drawPreview); return false; }
        Sprites.drawMapSprite(g, meta, img, p.x * tw + tw / 2, (p.y + 1) * th, tw / (meta.base || 16), { anim: 'idle', frame: 0, palette: 'blue' });
        return true;
      };
      mark(cfg.board, '#f2d58a', cfg.board.label || 'Table', lobbyPick === 'board');
      if (cfg.shop.enabled) mark(cfg.shop, '#9fe0ff', cfg.shop.name || 'Boutique', lobbyPick === 'shop');
      cfg.spots.forEach((sp, i) => { sprite(sp.unitId, sp); mark(sp, sp.after ? '#c9a7ff' : '#9be59b', uName(sp.unitId) + (sp.after ? ' *' : ''), lobbyPick === 'spot' + i); });
      if (hero) sprite(hero.id, cfg.start);
      mark(cfg.start, '#ffffff', hero ? hero.name + ' (départ)' : 'Départ', lobbyPick === 'start');
    }
    redraw = drawPreview;
    drawPreview();
    pane.append(h('p', { class: 'form-info' }, `Map ${map.width}×${map.height}. Les cases infranchissables (murs, eau, pics…) bloquent le héros. Un personnage marqué * n'arrive qu'après le chapitre choisi.`));

    // ---- personnages présents
    pane.append(h('div', { class: 'form-heading' }, 'Personnages présents'));
    const list = h('div', { class: 'lobby-spots' });
    cfg.spots.forEach((sp, i) => {
      const unitSel = h('select', {}, db().units.map(u => h('option', { value: u.id }, u.name)));
      unitSel.value = sp.unitId;
      unitSel.addEventListener('change', () => { sp.unitId = unitSel.value; change(); renderBody(); });
      const afterSel = h('select', {}, [h('option', { value: '' }, 'dès le début')].concat(doneOpts().map(o => h('option', { value: o.value }, 'après ' + o.label.replace(/^(Chapitre|Acte) : /, (m, k) => k.toLowerCase() + ' ')))));
      afterSel.value = sp.after || '';
      afterSel.addEventListener('change', () => { sp.after = afterSel.value; change(); drawPreview(); });
      const talks = (db().talks || []).filter(t => t.unitId === sp.unitId).length;
      list.append(h('div', { class: 'lobby-spot' + (lobbyPick === 'spot' + i ? ' on' : '') },
        unitSel, afterSel, h('span', { class: 'muted' }, `case ${sp.x},${sp.y}`),
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); selected.talks = ((db().talks || []).find(t => t.unitId === sp.unitId) || {}).id; open('talks'); } }, talks ? `${talks} conversation(s)` : 'aucune conversation'),
        h('button', { class: 'small', onclick: () => { lobbyPick = 'spot' + i; renderBody(); } }, 'Placer'),
        h('button', { class: 'small danger', html: Icons.icon('trash'), title: 'Retirer', onclick: () => { cfg.spots.splice(i, 1); change(); renderBody(); } })));
    });
    pane.append(list);
    const free = db().units.filter(u => (!hero || u.id !== hero.id) && !cfg.spots.some(s => s.unitId === u.id));
    if (free.length) {
      pane.append(h('button', { class: 'small', style: { marginTop: '6px' }, onclick: () => {
        const taken = new Set([cfg.start, cfg.board, cfg.shop, ...cfg.spots].map(p => p.x + ',' + p.y));
        let x = cfg.start.x, y = cfg.start.y;
        for (let d = 1; d < 6 && taken.has(x + ',' + y); d++) { x = Math.min(map.width - 1, cfg.start.x + d); }
        cfg.spots.push({ unitId: free[0].id, x, y, after: '' }); lobbyPick = 'spot' + (cfg.spots.length - 1); change(); renderBody();
      } }, '+ Ajouter un personnage'));
    }
    lobbyFooter(pane, cfg);
  }
  function lobbyFooter(pane, cfg) {
    const errors = Lobby.validate(cfg, db(), Editor.project().maps);
    for (const e of errors) pane.append(h('p', { class: 'note' }, '⚠ ' + e));
    pane.append(h('div', { class: 'insp-actions', style: { margin: '12px 0 4px' } },
      h('button', { class: 'small', onclick: () => open('talks') }, 'Conversations du lobby'),
      h('button', { class: 'small primary', html: Icons.icon('play'), disabled: !cfg.enabled || errors.length > 0, onclick: async () => { await close(); Editor.playtest(Lobby.LOBBY_SAVE); } }, 'Tester le lobby')));
  }

  // ------------------------------------------------------------------
  // Système
  // ------------------------------------------------------------------
  function audioOpts(kind) {
    const r = res();
    return (r[kind] || []).concat(kind === 'me' ? (r.bgm || []) : []).map(f => ({ value: f, label: f.replace(/^ressources\//, '') }));
  }

  function renderSystem(body) {
    const p = Editor.project();
    const pane = h('div', { class: 'db-form' });
    pane.append(h('h2', {}, 'Système'));
    pane.append(UI.form([
      { type: 'row', fields: [{ key: 'name', label: 'Nom du jeu', type: 'text' }, { key: 'author', label: 'Auteur', type: 'text' }] },
      { type: 'row', fields: [
        { key: 'startChapter', label: 'Acte de départ', type: 'select', empty: '—', options: () => db().chapters.map(c => ({ value: c.id, label: Lobby.actLabel(db(), c.id) })) },
        { key: 'defaultTerrain', label: 'Terrain par défaut', type: 'select', options: () => db().terrains.map(t => ({ value: t.id, label: t.name })), help: 'Utilisé pour les cases dont le tile n\'a pas de terrain.' }] },
      { type: 'heading', label: 'Règles de combat' },
      { key: 'settings.trueHit', label: 'Vrai hit (moyenne de 2 tirages, comme FE6–FE13)', type: 'checkbox' },
      { key: 'settings.battleAnims', label: 'Animations de combat (si les deux unités ont un battler)', type: 'checkbox' },
      { key: 'settings.colors', label: 'Couleurs des sprites (par défaut, modifiable par classe, unité ou placement)', type: 'select', empty: `Par défaut (${Palettes.MODES[0].label.toLowerCase()})`, options: Palettes.MODES,
        help: "Couleur d'équipe : bleu pour le joueur, rouge pour les ennemis, vert pour les alliés. Couleur d'origine : celle de la planche." },
      { type: 'row', fields: [
        { key: 'settings.doubleThreshold', label: 'Écart de vitesse pour doubler', type: 'number', min: 1, max: 20 },
        { key: 'settings.critMult', label: 'Multiplicateur critique', type: 'number', min: 1, max: 5 },
        { key: 'settings.effectiveMult', label: 'Multiplicateur efficacité', type: 'number', min: 1, max: 5 }] },
      { type: 'row', fields: [
        { key: 'settings.triangleDmg', label: 'Triangle : bonus dégâts', type: 'number', min: 0, max: 10 },
        { key: 'settings.triangleHit', label: 'Triangle : bonus précision', type: 'number', min: 0, max: 50 },
        { key: 'settings.maxLevel', label: 'Niveau max', type: 'number', min: 1, max: 99 }] },
      { type: 'info', text: 'Triangle : Épée › Hache › Lance › Épée, Anima › Lumière › Ténèbres › Anima. Dégâts = (For ou Mag) + Puissance − (Déf ou Rés) − bonus terrain.' },
      { type: 'heading', label: 'Convoi (cargaison de départ)' },
      { key: 'convoy.capacity', label: 'Capacité', type: 'number', min: 1, max: 999 },
      { type: 'custom', render: (meta) => {
        meta.convoy = meta.convoy || { capacity: 100, items: [] };
        const tmp = { inv: meta.convoy.items.map(e => Object.assign({}, e)) };
        return UI.form([{ key: 'inv', label: 'Contenu au début de la partie', type: 'inventory', options: () => Editor.invOptions(), max: meta.convoy.capacity || 100 }], tmp,
          { onChange: () => { meta.convoy.items = tmp.inv; change(); } });
      } },
      { type: 'info', text: "Le chef d'escouade (case à cocher dans la fiche d'une unité) ouvre le convoi depuis son menu ; les autres unités du joueur y accèdent en s'arrêtant à côté de lui." },
      { type: 'heading', label: 'Affinités' },
      { type: 'custom', render: (meta) => {
        meta.supports = Object.assign({}, Rules.DEFAULT_SUPPORT, meta.supports || {});
        const sp = meta.supports;
        const tmp = { C: sp.thresholds[0], B: sp.thresholds[1], A: sp.thresholds[2], S: sp.thresholds[3] };
        return UI.form([{ type: 'row', fields: ['C', 'B', 'A', 'S'].map(r => ({ key: r, label: 'Seuil ' + r, type: 'number', min: 1, max: 999 })) }], tmp,
          { onChange: () => { sp.thresholds = ['C', 'B', 'A', 'S'].map(r => Number(tmp[r]) || 0); change(); } });
      } },
      { type: 'row', fields: [
        { key: 'supports.gainAdjacent', label: 'Gain par tour côte à côte', type: 'number', min: 0, max: 50 },
        { key: 'supports.gainCombat', label: 'Gain en combat', type: 'number', min: 0, max: 50 },
        { key: 'supports.range', label: 'Portée des bonus', type: 'number', min: 1, max: 10 },
        { key: 'supports.endingRank', label: 'Rang pour finir ensemble', type: 'select', options: ['C', 'B', 'A', 'S'].map(r => ({ value: r, label: r })) }] },
      { type: 'row', fields: [
        { key: 'supports.bonus.hit', label: 'Précision / rang', type: 'number', min: 0, max: 30 },
        { key: 'supports.bonus.avoid', label: 'Esquive / rang', type: 'number', min: 0, max: 30 },
        { key: 'supports.bonus.crit', label: 'Critique / rang', type: 'number', min: 0, max: 30 },
        { key: 'supports.bonus.critAvoid', label: 'Esq. critique / rang', type: 'number', min: 0, max: 30 }] },
      { type: 'heading', label: 'Musique (ressources/musiques, ressources/jingles)' },
      { type: 'row', fields: [
        { key: 'audio.playerPhase', label: 'Phase joueur', type: 'select', empty: '— aucune —', options: () => audioOpts('bgm') },
        { key: 'audio.allyPhase', label: 'Phase alliée', type: 'select', empty: '— aucune —', options: () => audioOpts('bgm') },
        { key: 'audio.enemyPhase', label: 'Phase ennemie', type: 'select', empty: '— aucune —', options: () => audioOpts('bgm') }] },
      { type: 'row', fields: [
        { key: 'audio.levelUp', label: 'Montée de niveau', type: 'select', empty: '— aucun —', options: () => audioOpts('me') },
        { key: 'audio.victory', label: 'Victoire', type: 'select', empty: '— aucun —', options: () => audioOpts('me') },
        { key: 'audio.gameOver', label: 'Game over', type: 'select', empty: '— aucun —', options: () => audioOpts('me') }] },
      { key: 'audio.volume', label: 'Volume général du jeu (0 à 1) — le joueur règle ensuite musique, jingles et effets dans les paramètres (Échap)', type: 'number', min: 0, max: 1, step: 0.05 },
      { type: 'heading', label: 'Effets sonores (ressources/sons)' },
      { type: 'custom', render: (meta) => {
        meta.audio = meta.audio || {};
        const se = meta.audio.se = meta.audio.se || {};
        const opts = audioOpts('se');
        const box = h('div', { class: 'form' });
        const defaults = Defaults.defaultSounds();
        const missing = !Object.values(se).some(Boolean) && Object.values(defaults).every(p => opts.some(o => o.value === p));
        if (missing) box.append(h('button', { class: 'small', onclick: () => { Object.assign(se, defaults); change(); renderBody(); } }, 'Utiliser les sons par défaut'));
        else if (!opts.length) box.append(h('p', { class: 'form-info' }, "Aucun son dans ressources/sons. Ressources › « Ajouter les ressources par défaut » en ajoute (.wav, .mp3, .ogg)."));
        const rows = [];
        for (let i = 0; i < Music.SE_KEYS.length; i += 4) rows.push({ type: 'row', fields: Music.SE_KEYS.slice(i, i + 4).map(([k, label]) => ({ key: k, label, type: 'select', empty: '— aucun —', options: () => opts })) });
        box.append(UI.form(rows, se, { onChange: () => change() }));
        return box;
      } },
      { type: 'heading', label: 'Playtest' },
      { key: 'settings.debugMenu', label: 'Onglet Debug dans les paramètres en jeu (Échap) : victoire immédiate, or, niveaux, invincibilité…', type: 'checkbox' }
    ], p.meta, { onChange: (k) => { change(); if (k === 'name') document.title = p.meta.name + ' — Tactics Forge'; } }));
    body.append(pane);
  }

  // ------------------------------------------------------------------
  document.addEventListener('click', (e) => { if (e.target.closest('[data-db-close]')) close(); });
  $('#db').addEventListener('mousedown', (e) => { if (e.target.id === 'db') close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#db').classList.contains('hidden') && !document.querySelector('.modal-back')) { e.preventDefault(); close(); }
  });

  window.DBEditor = { open, close };
})();
