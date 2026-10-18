# Tactics Forge

Éditeur de tactical RPG dans l'esprit de RPG Maker, mais pour faire du Fire Emblem : on gère un projet, ses maps, sa base de données, ses chapitres, et on teste les combats directement depuis l'éditeur. Les maps peuvent être faites dans Tiled et importées.

## Lancer

```bash
npm install
npm start
```

Node 18+ suffit. Pour sortir un .exe Windows portable :

```bash
npm run dist
```

Après une compilation réussie, le portable de `dist/` est automatiquement copié à la racine et remplace l'exécutable de même nom (`Tactics Forge 0.1.0.exe` pour cette version). Fermer l'application avant de reconstruire. Si le remplacement échoue parce qu'elle est ouverte, la compilation reste dans `dist/` ; fermer l'application puis lancer `npm run postdist` suffit pour refaire la copie.

Le portable peut être utilisé seul. `dist/win-unpacked/` est la version décompressée : ses DLL, ressources et autres fichiers sont nécessaires lorsqu'on lance son propre exécutable. Les fichiers `builder-*.yml` / `.yaml` décrivent la compilation et servent au diagnostic. Une fois le portable copié à la racine, `dist/` peut être supprimé ; il sera recréé à la prochaine compilation. Un changement de version produit un nouveau nom de portable.

Les tests (règles de combat, import Tiled, lecture/écriture de projet) :

```bash
npm test
```

## Ce que fait l'éditeur

**Projet** — Nouveau projet vide ou avec le chapitre d'exemple (« Prologue — Les brigands du fort » : Eliwood, Lyn et Hector contre des brigands, un boss, des renforts au tour 3, des dialogues). Dans les deux cas, les ressources par défaut (sprites, animations, portraits) sont copiées dans le projet. Ctrl+S pour enregistrer, l'appli prévient si on ferme avec des modifs non enregistrées.

**Maps** (mode Tiles, F1)
- palette de tileset avec sélection rectangulaire (tampon multi-tiles)
- crayon, rectangle, remplissage, gomme, pipette (B / R / F / E / I) ; clic droit = pipette
- calques : ajout, suppression, ordre, visibilité, renommage (double-clic), option pour atténuer les autres
- redimensionnement, duplication, Ctrl+Z / Ctrl+Y, Ctrl+molette pour zoomer, molette centrale pour se déplacer
- import d'une image de tileset directement depuis la palette

**Terrain** (F2) — Chaque case prend le terrain de son tile (défini dans Base de données › Tilesets). On peut peindre une surcharge case par case quand un tile sert à plusieurs choses.

**Unités / chapitre** (F3) — Un chapitre = une bataille sur une map. On place les unités du joueur et les ennemis à la souris (clic : placer, glisser : déplacer, clic droit : retirer). Pour chaque ennemi : classe, niveau, comportement (agressif / attend à portée / immobile), boss, tour d'arrivée (renforts), inventaire, bonus de stats. Objectifs : déroute, vaincre le boss, prendre une case, survivre X tours.

**Base de données** (F9)
- Unités : stats, croissances, inventaire, portrait, seigneur (sa mort = défaite)
- Classes : déplacement, armes maniées, stats de base, croissances, plafonds, promotion, inventaire par défaut des ennemis, programme des compétences apprises par niveau (niveau → compétence).
- Compétences : catalogue éditable, dix exemples, nom, symbole, description, effet, valeur, conditions de PV / arme / engagement et probabilité de déclenchement. Création, duplication et suppression ; résumé automatique et validation des réglages. Le catalogue est sauvegardé dans `data/skills.json`. Pour un ancien projet, « Ajouter les exemples manquants » remplit le catalogue. Dans **Unités › Compétences**, choisir une personnelle fixe, un répertoire appris et jusqu’à cinq compétences équipées. Retirer une compétence manuellement apprise la déséquipe ; une fiche utilisée par un personnage ou un programme de classe ne peut pas être supprimée du catalogue. En playtest, le bouton **Compétences** de la fiche d’un personnage permet de consulter sa personnelle, ses cinq emplacements et ses compétences non équipées. L’attribution est conservée dans le projet et la campagne. Les effets en combat restent à réaliser.
- Armes : puissance, précision, critique, poids, portée, usure, efficacité (×3), bâtons de soin
- Objets : soins, boosts de stats
- Terrains : bonus défense / esquive, soin par tour, coût de déplacement par type (infanterie, cavalerie, blindé, volant)
- Tilesets : terrain de chaque tile, à la souris
- Chapitres : objectif, événements et dialogues, chapitre suivant / dernier chapitre
- Affinités : paires de personnages, attaques spéciales et duo, conversations, fins
- Système : chapitre de départ, réglages de combat (vrai hit, seuil de doublé, triangle, multiplicateurs)

**Dialogues** — Une réplique par ligne, au format `Nom: texte`. Le portrait vient de l'unité du même nom. Déclencheurs : début du chapitre, début d'un tour, mort d'une unité, entrée dans une zone, victoire.

**Apprentissage des compétences** — Dans **Base de données › Classes › Compétences apprises par niveau**, ajouter les paliers (par exemple niveau 2 → Précision, niveau 5 → Luna). Chaque montée de niveau ajoute automatiquement les nouvelles compétences au répertoire et affiche une annonce. Un emplacement libre est utilisé automatiquement ; si les cinq sont occupés, le joueur choisit un remplacement ou garde la compétence sans l’équiper. L’ancienne compétence reste apprise et la personnelle n’est jamais remplacée. Plusieurs compétences au même niveau et plusieurs niveaux gagnés d’un coup sont traités dans l’ordre, sans doublons. Une unité qui commence à un niveau élevé connaît déjà les paliers atteints ; les emplacements explicitement choisis par le créateur restent respectés. Les apprentissages et les choix d’équipement sont conservés dans la campagne.

## Playtest (F5)

Au lancement, choisir **Classique** (pertes définitives) ou **Détente** (les unités vaincues reviennent au chapitre suivant). Les personnages requis par le chapitre doivent survivre dans les deux modes. Dans la fiche d'un personnage, « Toujours se retirer » permet son retour même en Classique.

**Base de données › Chapitres › Conditions de victoire et de défaite** permet de choisir les personnages à protéger et ceux autorisés à prendre les points, de combiner plusieurs objectifs avec ET / OU et d'ajouter des défaites par limite de tours, pertes ou intrusion ennemie dans une zone. Les anciens chapitres héritent des Seigneurs pour la protection et la prise de point. Les conditions invalides sont signalées avant de lancer le test.

Le menu de la map propose **Sauvegarder** : il enregistre le **début du chapitre**, avec la campagne, les classes, les inventaires, les soutiens, le convoi et les pertes des chapitres précédents. Le fichier `saves/campaign.json` est séparé des données de l'éditeur ; la sauvegarde précédente est conservée en `.bak`. **Continuer la campagne** reprend ce début de chapitre au prochain lancement. **Recommencer** annule uniquement la tentative du chapitre courant. La suspension au milieu d'un tour n'est pas encore disponible.

Ouvre une fenêtre de jeu sur le chapitre courant (le projet est enregistré avant). Les unités sont animées sur la map (attente, marche dans les 4 directions, survol, gris quand elles ont joué) et chaque combat ouvre une scène animée façon GBA : attaque, critique, attaque à distance avec projectile, esquive, barres de PV. Clic ou Z maintenu pour accélérer, X ou clic droit pour passer ; l'option se coupe dans le menu de la map ou dans Système.

- clic / Z : valider · clic droit / X : annuler · flèches : curseur
- D : zone de danger · Maj maintenue : accélérer
- clic sur un ennemi : affiche sa portée
- clic sur une case vide : menu (fin du tour, zone de danger, vitesse, animations de combat, recommencer)

Règles façon GBA : triangle des armes (épée › hache › lance, anima › lumière › ténèbres), doublé à +4 de vitesse d'attaque, vrai hit (moyenne de deux tirages), critiques ×3, armes efficaces, riposte selon la portée, usure et casse des armes, expérience et montée de niveau selon les croissances, soin des forts en début de tour, renforts, IA ennemie qui choisit sa cible (dégâts, kill, riposte, terrain).

## Alliés, convoi, terrains, musique

**Alliés (unités vertes)** — En mode Unités, la section *Alliés* de la palette place un personnage de la base en vert. Il ne fait pas partie de l'équipe : sa mort ne fait pas perdre, il ne compte pas pour la défaite. La **phase alliée** se joue juste après la phase du joueur. Pour chaque allié, *Contrôle* : **Jouable** (tu le diriges pendant la phase alliée) ou **IA** (il joue seul, avec le comportement choisi). Sur la map il est posé sur un carré vert. Cloud est fourni comme exemple d'allié jouable.

**Convoi** — Coche *Chef d'escouade* dans la fiche d'une unité (Eliwood par défaut). Il a l'action *Convoi* dans son menu ; les autres unités du joueur l'ont aussi quand elles s'arrêtent sur une case adjacente à lui. On y dépose et retire armes et objets (5 places par unité). Le contenu de départ et la capacité se règlent dans Système.

**Terrains** — Chaque terrain donne un bonus d'esquive et de défense au défenseur, plus un coût de déplacement par type d'unité : forêt (+20 esq, +1 déf), buisson (+10 esq), fourré (+40 esq, +1 déf, interdit aux cavaliers et blindés), fort (+20 esq, +2 déf, soin 20 %)… Le bonus de la case occupée s'affiche sous l'unité en jeu, et il est déjà compté dans les prévisions de combat.

**Musique** — `audio/bgm` (musiques en boucle) et `audio/me` (jingles). Système › Musique : une piste par phase (joueur, alliée, ennemie) et des jingles pour la montée de niveau, la victoire et le game over. Touche M en jeu pour couper.

## Affinités (soutiens) et épilogue

**Base de données › Affinités** — Une fiche par paire de personnages : points au départ, rang maximum (A ou S), attaque spéciale, attaque duo, une conversation par rang et le texte de fin du couple. Quatre paires sont fournies : Eliwood ♥ Lyn, Eliwood ♥ Hector, Hector ♥ Lyn, Lyn ♥ Cloud.

**Comment ça monte** — +3 points quand les deux finissent la phase joueur côte à côte, +2 quand l'un combat à côté de l'autre (réglable dans Système › Affinités, ainsi que les seuils C/B/A/S). Quand un nouveau rang est atteint, l'action **Soutien** apparaît dans le menu si les deux sont adjacents : la conversation se joue et le rang monte. Comme dans les jeux, un personnage ne peut avoir qu'un seul rang S.

**Ce que ça donne en combat**
- *bonus d'affinité* : tant que le partenaire est à 3 cases ou moins, précision / esquive / critique / esquive critique augmentent avec le rang ;
- *attaque spéciale* (à partir du rang choisi, souvent B) : une chance de déclencher un coup renforcé, avec bandeau dans la scène de combat ;
- *attaque duo* (souvent rang A) : si le partenaire est sur une case adjacente à l'attaquant, il peut entrer dans la scène et frapper juste après le premier coup. L'ennemi ne riposte pas contre lui.

Les prévisions de combat indiquent ce qui est actif (bonus, chance de spéciale, chance de duo).

**Épilogue** — Dans la fiche d'une unité : *Genre*, *Personnage principal* et *Fin personnelle*. Sur un chapitre, *Dernier chapitre* affiche le bouton **Épilogue** après la victoire (sinon *Chapitre suivant* enchaîne la campagne en gardant niveaux, inventaires et morts). Chaque personnage principal choisit avec qui il finit parmi ceux dont l'affinité atteint le rang demandé (A par défaut, réglable), homme ou femme, ou finit seul. Viennent ensuite les fins de couple, puis les fins personnelles des autres, et les morts au combat.

## Importer depuis Tiled

Fichier › Importer une map Tiled (Ctrl+I), formats `.tmx` et `.tmj` / `.json`.

Pris en charge : tilesets internes ou externes (`.tsx` / `.tsj`), encodage CSV, base64 non compressé / zlib / gzip, maps infinies (converties à leur taille réelle), groupes de calques, tiles retournés / pivotés, marge et espacement des tilesets. Les images sont copiées dans le dossier `tilesets/` du projet. Si on réimporte le même fichier, l'éditeur propose de mettre à jour la map existante sans casser les chapitres liés.

Pas pris en charge : maps isométriques / hexagonales (importées comme orthogonales), tilesets « collection d'images », calques d'images, compression zstd.

### Terrain depuis Tiled

Dans l'éditeur de tileset de Tiled, ajoute une propriété personnalisée `terrain` sur les tiles, avec l'identifiant ou le nom d'un terrain de la base (`forest`, `Forêt`, `fort`…). La classe du tile (champ *Class*) marche aussi.

### Placements depuis Tiled

Un calque d'objets peut contenir les placements du chapitre. Le champ *Class* (ou *Type*) de l'objet indique ce que c'est :

| Class | Propriétés reconnues |
|---|---|
| `player` / `joueur` | `unit` = id ou nom de l'unité (sinon le nom de l'objet) |
| `enemy` / `ennemi` | `class`, `level`, `ai` (`aggressive` / `range` / `stationary`), `turn` (renfort), `boss` |
| `boss` | mêmes propriétés, marqué boss et immobile par défaut |
| `seize` | case à prendre (objectif « Prendre une case ») |

À l'import, si la map contient ce genre d'objets et n'a pas de chapitre, l'éditeur propose d'en créer un directement. Exemple complet dans `assets/sample/tiled/`.

## Format du projet

Rangé comme un projet RPG Maker : les données d'un côté, les ressources triées par type de l'autre.

```
MonJeu/
  game.tfproj              nom, réglages, chapitre de départ, ordre des maps
  data/
    units.json classes.json skills.json weapons.json items.json terrains.json tilesets.json chapters.json supports.json
    maps/map_1.json        une map par fichier (calques = gids façon Tiled)
  img/
    tilesets/              images des tilesets
    characters/            sprites de map        (Nom.png + Nom.json)
    battlers/              animations de combat  (Nom.png + Nom.json)
    faces/                 portraits
    system/                interface
  audio/
    bgm/ se/ me/
```

Tout est en JSON lisible, donc versionnable avec Git. Les projets créés avec l'ancienne version (`maps/`, `tilesets/` à la racine) s'ouvrent toujours et sont réenregistrés dans la nouvelle arborescence.

## Ressources par défaut

Chaque nouveau projet reçoit le contenu de `assets/default/` :

| Dossier | Contenu |
|---|---|
| `img/characters` | Eliwood (Seigneur, Chevalier-Seigneur), Lyn (Seigneur, Lame-Seigneur), Hector (Seigneur, Grand Seigneur), Brigand |
| `img/battlers` | Eliwood, Lyn (épée + arc, flèche en projectile), Hector (hache + hachette lancée), Brigand |
| `img/faces` | bustes tirés des animations de combat |
| `img/tilesets` | Plaines (dont buisson et fourré) |
| `img/characters` + `img/battlers` | Cloud (allié, sprites propres à l'unité) |
| `audio/bgm` | Winning Road (Roy's Hope), Advance |
| `audio/me` | Level Up, Game Over |

Pour un projet créé avant cette version (dossier `img/` vide) : Base de données › Ressources › **Ajouter les ressources par défaut** copie les fichiers sans rien écraser et relie les classes de seigneurs et le Brigand à leurs sprites.

Les sprites sont liés aux **classes** (Base de données › Classes : *Sprite de map* et *Animation de combat*). Une unité peut surcharger ceux de sa classe. Une classe sans sprite s'affiche en jeton coloré ; si un des deux combattants n'a pas d'animation, le combat se joue directement sur la map. L'onglet **Ressources** de la base de données liste tout ce qu'il y a dans `img/`, avec un aperçu animé (palettes, chaque animation, frame d'impact).

Le chapitre d'exemple met Eliwood, Lyn et Hector face aux brigands de Batta.

### Format d'un sprite de map (`img/characters/Nom.json`)

Planche de frames 32×32, une rangée par animation (`idle`, `left`, `right`, `down`, `up`, `focus`), répétée pour chaque palette (`ally`, `enemy`, `neutral`, `gray`). Les palettes sont les vraies palettes FE (bleu / rouge / vert / gris « a déjà joué »).

```json
{ "frame": [32, 32], "anchor": [16, 23], "base": 16,
  "palettes": ["ally", "enemy", "neutral", "gray"], "paletteHeight": 192,
  "anims": { "idle": { "row": 0, "frames": [0, 1, 2, 1], "durations": [500, 80, 500, 80] }, "...": {} } }
```

`anchor` = pied du personnage (bas-centre de la case), `base` = taille de case d'origine (le sprite est agrandi pour des cases de 32 px).

### Format d'une animation de combat (`img/battlers/Nom.json`)

Toutes les frames ont la même taille (`cell`) et le même point d'ancrage au sol, rangées sur une grille de `columns` colonnes. Chaque animation liste ses frames et peut préciser :

- `hit` : frame de l'impact (dégâts, flash, recul)
- `approach` / `retreat` : frames pendant lesquelles l'attaquant avance vers l'adversaire / revient
- `projectile`, `release`, `catch` : projectile (`arrow`, `axe`), frame du tir et frame où l'arme revient
- `facing` : sens dans lequel la planche regarde (les héros regardent à gauche, le brigand à droite) ; le moteur retourne l'image si besoin

Animations reconnues : `stance`, `attack`, `critical`, `ranged`, `rangedCritical`, `bow`, `bowCritical`, `dodge`.

### Régénérer les ressources

Les planches d'origine sont dans `tools/sprite-sources/` (dont `cloud.gif`). Le script de conversion les redécoupe, aligne les frames, génère les palettes et les portraits :

```bash
python3 tools/build_default_resources.py --preview apercu/
```

(Pillow + numpy.) Les découpages, frames d'impact et cadrages des portraits sont réglés en haut du script.

**Crédits** : sprites rippés de *Fire Emblem: The Blazing Blade* (Intelligent Systems / Nintendo) par Lexou, Grim & Bonzai. Cloud : édition FE par Lord Zymeth (personnage Square Enix, base Nintendo). Musiques : *Fire Emblem: The Binding Blade*, Yuka Tsujiyoko (Enhanced Soundtrack). À garder pour un usage perso / fan-game : à retirer de `assets/default/` (img et audio) et `tools/sprite-sources/` avant toute diffusion publique de l'outil.

## Code

```
main.js                    process principal Electron (fenêtres, menus, IPC)
preload.js                 pont sécurisé vers le renderer
src/main/tiled.js          import Tiled
src/main/project-io.js     lecture / écriture des projets
src/shared/rules.js        règles du jeu (combat, déplacement, IA, exp) — testées dans test/run.js
src/shared/defaults.js     base de données par défaut + chapitre d'exemple
src/renderer/              éditeur (editor.js, db.js), playtest (playtest.js), scène de combat (battle.js), sprites (sprites.js)
tools/                     conversion des planches de sprites
test/snapshot.js           test de bout en bout : TF_SNAPSHOT=dossier npm start
test/snapshot-supports.js  affinités, attaque duo, soutien, épilogue : TF_SNAPSHOT_SCRIPT=test/snapshot-supports.js
```

## Pistes pour la suite

Priorités : compétences (une personnelle fixe + cinq équipables), promotions en jeu avec arbre à embranchements. Puis animations des classes génériques, échanges d'objets entre unités, villages / coffres / portes, brouillard de guerre, écran de préparation, sauvegarde en milieu de bataille et export d'un jeu jouable autonome. La proposition complète et l'état des lots sont dans `docs/proposition-systemes-fire-emblem.md`.
