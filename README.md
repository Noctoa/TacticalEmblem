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

**Terrain** (F2) — Chaque case prend le terrain de son tile (défini dans Base de données › Terrains et tilesets). On peut peindre une surcharge case par case quand un tile sert à plusieurs choses.

**Unités / chapitre** (F3) — Un chapitre = une bataille sur une map. On place les unités du joueur et les ennemis à la souris (clic : placer, glisser : déplacer, clic droit : retirer). Pour chaque ennemi : classe, niveau, comportement (agressif / attend à portée / immobile), boss, tour d'arrivée (renforts), inventaire, bonus de stats. Objectifs : déroute, vaincre le boss, prendre une case, survivre X tours.

**Base de données** (F9)
- Unités : stats, croissances, inventaire, portrait, seigneur (sa mort = défaite), **série** (jeu ou univers d'origine, avec les séries déjà saisies en suggestion). Au-dessus de la liste : une recherche (nom, classe, arme ou série, sans tenir compte des accents) et **Trier par** ordre de la base, nom, classe, arme ou série. Par arme, un personnage qui manie plusieurs armes apparaît dans chacun de leurs groupes ; par série, les personnages sans série sont rangés à la fin. La palette de placement (mode Unités, F3) a la même recherche et le même tri. Le tri choisi est retenu sur ce poste.
- Classes : déplacement, armes maniées, stats de base, croissances, plafonds, promotion, inventaire par défaut des ennemis, programme des compétences apprises par niveau (niveau → compétence).
- Compétences : catalogue éditable, onze exemples (dix effets de combat, soin et aura, plus Crochetage), nom, symbole, description, effet, valeur, conditions de PV / arme / engagement et probabilité de déclenchement. Création, duplication et suppression ; résumé automatique et validation des réglages. Le catalogue est sauvegardé dans `data/skills.json`. Pour un ancien projet, « Ajouter les exemples manquants » remplit le catalogue. Dans **Unités › Compétences**, choisir une personnelle fixe, un répertoire appris et jusqu’à cinq compétences équipées. Retirer une compétence manuellement apprise la déséquipe ; une fiche utilisée par un personnage ou un programme de classe ne peut pas être supprimée du catalogue. En playtest, le bouton **Compétences** de la fiche d’un personnage permet de consulter sa personnelle, ses cinq emplacements et ses compétences non équipées. L’attribution est conservée dans le projet et la campagne. Les dix effets de combat sont actifs dans le jeu, les prévisions et l’estimation de l’IA ; Crochetage intervient sur les coffres et portes.
- Armes : puissance, précision, critique, poids, portée, usure, efficacité (×3), bâtons de soin
- Objets : soins, boosts de stats
- Terrains et tilesets (un seul onglet, une liste : les tilesets puis les terrains) : terrain de chaque tile à la souris ; bonus défense / esquive, soin par tour, coût de déplacement par type (infanterie, cavalerie, blindé, volant)
- Chapitres : objectif, événements et dialogues, chapitre suivant / dernier chapitre
- Affinités : paires de personnages, attaques spéciales et duo, conversations, fins
- Système : chapitre de départ, réglages de combat (vrai hit, seuil de doublé, triangle, multiplicateurs)

**Dialogues** — Une réplique par ligne, au format `Nom: texte`. Le portrait vient de l'unité du même nom. Déclencheurs : début du chapitre, début d'un tour, mort d'une unité, entrée dans une zone, victoire.

**Apprentissage des compétences** — Dans **Base de données › Classes › Compétences apprises par niveau**, ajouter les paliers communs à la classe (par exemple niveau 2 → Précision). Dans **Unités › Apprentissages propres au personnage**, ajouter ceux propres à chaque héros (par exemple niveau 5 → Luna). Les deux programmes se complètent : une compétence enseignée par les deux est acquise au premier palier atteint, une seule fois. Chaque montée de niveau ajoute automatiquement les nouvelles compétences au répertoire et affiche une annonce. Un emplacement libre est utilisé automatiquement ; si les cinq sont occupés, le joueur choisit un remplacement ou garde la compétence sans l’équiper. L’ancienne compétence reste apprise et la personnelle n’est jamais remplacée. Plusieurs compétences au même niveau et plusieurs niveaux gagnés d’un coup sont traités dans l’ordre, sans doublons. Une unité qui commence à un niveau élevé connaît déjà les paliers atteints ; les emplacements explicitement choisis par le créateur restent respectés. Les apprentissages et les choix d’équipement sont conservés dans la campagne. **Compétences déjà acquises au départ** permet d’accorder des compétences immédiatement : ne pas les cocher ici si elles doivent attendre un palier. Les programmes sont facultatifs, les anciens projets conservent leurs attributions initiales.

## Playtest (F5)

Au lancement, choisir **Classique** (pertes définitives) ou **Détente** (les unités vaincues reviennent au chapitre suivant). Les personnages requis par le chapitre doivent survivre dans les deux modes. Dans la fiche d'un personnage, « Toujours se retirer » permet son retour même en Classique.

**Base de données › Chapitres et actes › (un acte) › Conditions de victoire et de défaite** permet de choisir les personnages à protéger et ceux autorisés à prendre les points, de combiner plusieurs objectifs avec ET / OU et d'ajouter des défaites par limite de tours, pertes ou intrusion ennemie dans une zone. Les anciens chapitres héritent des Seigneurs pour la protection et la prise de point. Les conditions invalides sont signalées avant de lancer le test.

**Overkill** — Quand un coup abat l'ennemi, les dégâts en trop sont affichés (« OVERKILL +18 »). Celui qui l'a abattu termine ensuite les coups qu'il avait prévus (double attaque, arme à plusieurs coups). Ces coups ne retirent plus de PV ; leur précision et leurs critiques sont tirées normalement, sans usure d'arme ni compétence, et leurs dégâts s'ajoutent à l'overkill. En combat animé, la barre de PV de l'ennemi vaincu se remplit en rouge et son compteur affiche « −54 ». Si l'overkill atteint une deuxième fois les PV max de l'ennemi (54 dégâts en trop sur un brigand de 18 PV max, par exemple), le bandeau « OVERKILL ×2 ! » s'affiche et l'attaquant reçoit un bonus d'EXP (30 par défaut). L'EXP d'un combat reste plafonnée à 100. Ces réglages se trouvent dans **Système › Overkill** (activer / désactiver, montant du bonus, 0 = pas de bonus). Une riposte fatale donne l'overkill au défenseur.

**Préparatifs avant bataille** — Chaque acte commence par le choix des participants dans l'effectif recruté et vivant. Cocher un personnage le déploie ; cliquer sa fiche affiche ses statistiques, objets et compétences. Sélectionner ensuite une case sur la carte ou son bouton numéroté déplace ce personnage ; une case occupée échange les deux positions. Les terrains infranchissables pour leur classe actuelle sont refusés. Les alliés verts gardent leur placement et ne prennent pas de place dans la sélection. Les dialogues de début et le premier tour attendent **Commencer la bataille**.

Dans **Base de données › Chapitres et actes › (un acte) › Préparatifs et déploiement**, régler le nombre maximum de participants (`0` = toutes les cases) et les personnages imposés. Les placements joueur en mode Unités définissent les cases de départ et les recrues de l'acte ; ils servent aussi de sélection par défaut. Les personnages à protéger sont automatiquement imposés. Une prise de point obligatoire exige au moins un participant autorisé, ou un allié fixe autorisé. Décocher **Choisir l'équipe avant cet acte** conserve ses placements scénarisés. Les anciens actes bénéficient des préparatifs sans conversion manuelle.

Le bouton **Sauvegarder…** et Échap donnent accès aux emplacements habituels : la sélection et les positions sont conservées. Recharger ou recommencer une bataille redonne accès à ses préparatifs. Si le projet ou l'effectif a changé, un déploiement devenu invalide est ajusté et signalé. **Retour au camp** permet de reprendre les équipements et promotions avant de repartir. Les modifications d'équipement restent dans le menu Équipe du camp.

**Villages** — En mode **Unités (F3) › Interactions › Village**, cliquer une case pour placer une visite. Le village peut partager la case d'une unité. Le sélectionner dans la liste de droite permet de régler son nom, son dialogue (`Nom: texte`), l'or, l'arme ou l'objet offert et ses utilisations, le personnage recruté et les visiteurs autorisés. Glisser déplace le village ; clic droit ou Suppr le retire, et Ctrl+Z annule. Les mêmes réglages sont accessibles dans **Base de données › Chapitres et actes › (un acte) › Villages à visiter**. Le marqueur V ajoute l'interaction ; le dessin de la maison reste celui de la map. Un village est fourni dans le prologue des nouveaux projets d'exemple.

En bataille, un personnage du joueur doit se trouver sur cette case pour avoir l'action **Visiter**, qui consomme son action. Le dialogue précède la récompense. Un objet va dans son inventaire, ou au convoi s'il est plein ; si les deux sont pleins, la visite attend qu'une place se libère. Une nouvelle recrue apparaît sur une case accessible à proximité et peut agir immédiatement ; un allié vert déjà présent rejoint le joueur en gardant ses PV et ses objets. Un personnage déjà recruté n'est pas dupliqué et un mort ne ressuscite pas. Sans case libre pour une nouvelle recrue, la visite attend également.

Le marqueur passe de V à ✓ après la visite. Par défaut, elle ne peut être récompensée qu'une fois dans la campagne, même en rejouant l'acte ; **Réutilisable quand cet acte est rejoué après victoire** autorise une nouvelle récompense à chaque nouvelle tentative, une seule fois dans chacune. Recommencer ou abandonner une tentative annule ses visites, ses récompenses et ses recrutements. Les sauvegardes en bataille restent des débuts d'acte ; une sauvegarde du camp après victoire conserve les visites acquises.

**Coffres et portes** — En **Unités (F3) › Interactions**, placer un coffre ou une porte, puis sélectionner son marqueur C/P pour régler sa serrure, les personnages autorisés et son dialogue. Les mêmes fiches sont accessibles dans **Base de données › Chapitres et actes**, sur la fiche de l'acte. Un coffre offre de l'or et/ou une arme ou un objet avec ses utilisations ; une porte définit le terrain du passage après ouverture. Les interactions se déplacent et se suppriment avec annulation. Deux interactions ne peuvent pas partager une case, et une unité ne peut pas commencer sur une porte fermée.

En bataille, **Ouvrir le coffre** exige d'être sur sa case et **Ouvrir la porte** d'être adjacent. L'ouverture consomme l'action du personnage. Une clé adaptée doit être dans son inventaire : une utilisation est retirée, puis la clé épuisée disparaît. Les clés peuvent ouvrir les coffres, les portes ou les deux ; chaque serrure peut exiger un objet précis, interdire Crochetage ou être déverrouillée. La compétence **Crochetage**, personnelle ou équipée, ouvre sans consommer de clé et est utilisée en priorité ; la connaître sans l'équiper ne suffit pas. Les nouveaux projets comprennent un Voleur qui l'apprend au niveau 1, une clé de coffre et une clé de porte également vendues au camp. Pour un ancien projet, utiliser **Objets › Ajouter les clés d'exemple manquantes** et le bouton d'exemples des compétences, puis régler l'apprentissage souhaité dans la classe ou le personnage. Ces ajouts préservent les fiches existantes.

Les récompenses vont dans l'inventaire puis le convoi. Si les deux sont pleins, le coffre reste fermé et aucune clé n'est consommée ; la dernière utilisation d'une clé peut libérer la place nécessaire. Une porte fermée bloque tous les déplacements, y compris ceux des ennemis et des volants ; son ouverture actualise les chemins et la zone de danger. Les coffres pillés restent vides dans la campagne, sauf option de remplissage lors d'un acte rejoué après victoire. Les portes se referment à chaque tentative. Recommencer ou abandonner restaure ensemble les clés, récompenses et ouvertures ; les sauvegardes de bataille restent des débuts d'acte.

**Échanges en bataille** — Après le déplacement, **Échanger** propose les personnages du joueur vivants sur une case adjacente, même s'ils ont déjà joué. Choisir un objet dans l'un des deux inventaires, puis un objet en face pour les échanger ou une place libre pour le donner. Les inventaires pleins permettent un échange ; les utilisations sont conservées. La première arme utilisable est équipée automatiquement et les possibilités d'attaque sont actualisées. Les ennemis, alliés verts et réservistes ne sont pas des partenaires d'échange en bataille.

Flèches pour parcourir les deux colonnes, Z / Entrée pour choisir, X / Échap / clic droit pour annuler une sélection puis revenir. **Retour** ferme directement l'écran. Fermer sans transfert permet toujours d'annuler le déplacement ; après un transfert, le déplacement est validé et les objets restent échangés. Le personnage actif peut encore attaquer, soigner, utiliser un objet, échanger à nouveau ou attendre. Le partenaire garde son état de tour et n'est pas réactivé. Le verrou de déplacement disparaît au tour suivant. Recommencer restaure les inventaires de début d'acte ; une victoire et la sauvegarde de campagne conservent les échanges.

Le menu de la map propose **Sauvegarder** : il enregistre le **début du chapitre**, avec la campagne, les classes, les inventaires, les soutiens, le convoi et les pertes des chapitres précédents, dans l'un des cinq emplacements de `saves/`. **Continuer la campagne** reprend la dernière sauvegarde au prochain lancement. **Recommencer** annule uniquement la tentative du chapitre courant. La suspension au milieu d'un tour n'est pas encore disponible.

Ouvre une fenêtre de jeu sur le chapitre courant (le projet est enregistré avant). Les unités sont animées sur la map (attente, marche dans les 4 directions, survol, gris quand elles ont joué) et chaque combat ouvre une scène animée façon GBA : attaque, critique, attaque à distance avec projectile, esquive, barres de PV. Clic ou Z maintenu pour accélérer, X ou clic droit pour passer ; l'option se coupe dans le menu de la map ou dans Système.

- clic / Z : valider · clic droit / X : annuler · flèches : curseur
- D : zone de danger · Maj maintenue : accélérer
- clic sur un ennemi : affiche sa portée
- clic sur une case vide : menu (fin du tour, zone de danger, vitesse, animations de combat, recommencer)

Règles façon GBA : triangle des armes (épée › hache › lance, anima › lumière › ténèbres), doublé à +4 de vitesse d'attaque, vrai hit (moyenne de deux tirages), critiques ×3, armes efficaces, riposte selon la portée, usure et casse des armes, expérience et montée de niveau selon les croissances, soin des forts en début de tour, renforts, IA ennemie qui choisit sa cible (dégâts, kill, riposte, terrain).

## Alliés, convoi, terrains, musique

**Alliés (unités vertes)** — En mode Unités, la section *Alliés* de la palette place un personnage de la base en vert. Il ne fait pas partie de l'équipe : sa mort ne fait pas perdre, il ne compte pas pour la défaite. La **phase alliée** se joue juste après la phase du joueur. Pour chaque allié, *Contrôle* : **Jouable** (tu le diriges pendant la phase alliée) ou **IA** (il joue seul, avec le comportement choisi). Sur la map il est posé sur un carré vert. Cloud est fourni comme exemple d'allié jouable.

**Convoi** — Coche *Chef d'escouade* dans la fiche d'une unité (Xarrin par défaut). Il a l'action *Convoi* dans son menu ; les autres unités du joueur l'ont aussi quand elles s'arrêtent sur une case adjacente à lui. On y dépose et retire armes et objets (5 places par unité). Le contenu de départ et la capacité se règlent dans Système.

**Terrains** — Chaque terrain donne un bonus d'esquive et de défense au défenseur, plus un coût de déplacement par type d'unité : forêt (+20 esq, +1 déf), buisson (+10 esq), fourré (+40 esq, +1 déf, interdit aux cavaliers et blindés), fort (+20 esq, +2 déf, soin 20 %)… Le bonus de la case occupée s'affiche sous l'unité en jeu, et il est déjà compté dans les prévisions de combat.

**Musique** — `ressources/musiques` (musiques en boucle) et `ressources/jingles`. Système › Musique : une piste par phase (joueur, alliée, ennemie) et des jingles pour la montée de niveau, la victoire et le game over. Touche M en jeu pour couper.

**Paramètres en jeu (Échap)** — Une fenêtre à onglets, au camp comme en chapitre (Échap annule d'abord une sélection ou un menu en cours ; X et le clic droit restent « annuler ») :
- **Sauvegarder** : 5 emplacements (lieu, mode, or, date). Au camp, on sauvegarde le camp ; en chapitre, le début du chapitre (comme les Fire Emblem). Fichiers : `saves/slot-1.json` … `slot-5.json` (l'ancienne sauvegarde unique devient l'emplacement 1).
- **Charger** : reprendre un emplacement, ou l'effacer. Au lancement du playtest : *Continuer* (dernière sauvegarde) et *Charger une sauvegarde…*.
- **Son** : volumes de la musique, des jingles et des effets sonores, son coupé (M). Gardés d'une partie à l'autre sur ce poste. Les effets (curseur, valider, annuler, coup, critique, esquive, unité vaincue) se choisissent dans Système ; des sons par défaut sont fournis dans `ressources/sons` (générés par `tools/build_default_sounds.py`).
- **Debug** (masquable : Système › Playtest) : invincibilité, déplacement illimité, ennemis passifs ; victoire / défaite immédiate, vaincre tous les ennemis, soigner, faire rejouer, tour suivant ; unité sous le curseur (+1 / +5 niveaux, PV max, vaincre) ; or, objet dans le convoi, affinités +20 ; au camp, marquer des chapitres terminés et revoir les conversations.

**Lobby (le camp)** — Comme dans Fire Emblem Heroes, le jeu commence dans un lobby et y revient après chaque chapitre. C'est une petite map explorable (une **map de camp**, faite dans l'éditeur) où l'on déplace le héros au clavier (flèches) ou à la souris (clic : il y va, et interagit s'il s'agit d'un personnage ou d'un bâtiment) :
- **Tableau des quêtes** : deux sections, *Histoire* et *Évènements*. Chaque **chapitre** y apparaît comme une carte qui contient ses **actes** (les niveaux jouables), à jouer dans l'ordre : l'acte 2 s'ouvre quand l'acte 1 est gagné, et la victoire propose « Acte 2 → » pour enchaîner sans repasser par le camp. Les chapitres d'histoire s'ouvrent l'un après l'autre ; les évènements selon leurs conditions et leurs dates (« Bientôt » avant la date). Les actes terminés se rejouent, sauf si on décoche *Rejouable*.
- **Équipe** (menu du camp) : tous les personnages recrutés et vivants, même absents de la map du camp. Choisir les cinq compétences équipées parmi les compétences apprises, en plus de la personnelle fixe ; transférer les objets entre personnages et convoi, échanger avec une destination pleine et réordonner un inventaire pour choisir sa première arme utilisable ; consulter l'arbre et promouvoir un personnage avec son sceau. Ces préparatifs sont conservés à la sauvegarde et au prochain déploiement. Les promotions au camp ne consomment pas de tour.
- **Boutique** : achat (rangé dans le convoi ou l'inventaire de n'importe quel personnage recruté et vivant) et revente à moitié prix, au prorata des utilisations restantes. Prix réglés sur chaque arme et objet ; `0` = ne se vend pas.
- **Personnages présents** : ceux que l'on place dans le lobby, éventuellement à partir d'un chapitre (Cloud rejoint le camp après le prologue). Un « ! » au-dessus d'eux signale une **conversation de lobby** disponible : Z (ou un clic) pour la jouer. Elle peut faire gagner de l'affinité avec le héros.
- **Or** : récompense de chapitre (la première victoire, ou à chaque victoire), bourse des ennemis vaincus (réglée sur le placement de l'ennemi), revente.
- X (ou clic droit) : menu du camp — équipe, chapitres, boutique, paramètres. En chapitre, le menu propose *Retour au camp* (abandon) ; après une défaite, on retourne au camp dans l'état d'avant le chapitre.

**Personnages de la série Fire Emblem** — Base de données › Unités › **＋ Personnages de la série…** : on coche les jeux (Shadow Dragon / Mystery, Echoes, Genealogy, Thracia 776, Binding Blade, Blazing Blade, Sacred Stones, Path of Radiance, Radiant Dawn, Awakening, Fates, Three Houses, Engage) et leurs personnages principaux sont ajoutés, soit 171 fiches. Chaque fiche contient :
- la classe, le niveau, l'inventaire, la rareté d'invocation, la série (« Fire Emblem 7 »…) et une bio ;
- des croissances inspirées du jeu ;
- des stats approximatives, calculées depuis la classe et le niveau, puis ajustées selon ses croissances.

Images : Eliwood, Lyn et Hector (Blazing Blade) reçoivent les ressources de base du projet (portrait, animation de combat, sprite de map). Si leur dossier manque dans `ressources/personnages/`, il est recopié. S'ils sont déjà dans la base, seuls leurs champs d'image vides sont remplis. Le sprite de map reste celui de la classe quand elle en a un, pour que la promotion le change. Les autres personnages prennent les sprites de leur classe, ou un jeton, jusqu'à ce que tu leur donnes les tiens. Pour en équiper un autre, il suffit d'ajouter une ligne à `ART` dans `src/shared/fe-pack.js`. L'import ajoute aussi :
- les classes qui manquent : Seigneur (épée / lance / hache / arc), Tacticien, Prêtresse guerrière, Myrmidon › Bretteur, Chevalier wyverne › Seigneur wyverne, Chevalier faucon, Danseuse, Troubadour › Valkyrie, Moine › Évêque, Shaman › Druide, Sage, Nomade › Sniper, Berserker, Chevalier noir ;
- une bannière d'invocation par jeu, avec le ou les seigneurs mis en avant.

Un personnage déjà présent (même nom, même série) n'est pas dupliqué. Les manaketes et les laguz ne sont pas inclus (pas de pierre de dragon ni de transformation dans le moteur).

**Armes, objets et compétences de la série** — Dans les onglets Armes, Objets et Compétences, le bouton **＋ De la série Fire Emblem…** ajoute des fiches officielles, sans images. On coche les groupes voulus :
- **armes** : épées, lances, haches, arcs, magie anima, magie de lumière, magie noire, bâtons, et 35 armes légendaires incassables (Falchion, Durandal, Ragnell, Gáe Bolg, Armads, Mulagir, Forseti, Naga…) ;
- **objets** : soins, objets de stats (Robe séraphique, Bottes…), sceaux, clés ;
- **compétences** : déclenchements, bonus, coups et postures (Coup mortel…), compétences selon les PV, maîtrises d'armes, soutien d'équipe.

Une fiche déjà présente (même nom) n'est pas dupliquée. Les compétences sont adaptées aux effets du moteur, et leur description indique quand une version est simplifiée. Les sceaux spéciaux (Emblème du héros…) servent si une promotion de classe les demande.

Trois propriétés d'arme ont été ajoutées pour l'occasion (fiche d'arme) :
- **Brave** : chaque attaque frappe deux fois ;
- **Dégâts magiques** : Mag / Rés pour une épée, une lance ou une hache (Lame du tonnerre…) ;
- **Drain** : le porteur récupère les PV des dégâts infligés (Nosferatu, Lame runique).

**Danser** — Une unité de classe Danseuse (case *Danse* de la classe) a l'action **Danser** : un allié adjacent qui a déjà joué peut rejouer ce tour (+10 EXP pour la danseuse).

**Invocations** — Comme dans Fire Emblem Heroes, un autel au camp (le puits du camp d'exemple) permet d'invoquer des personnages avec des **orbes**. On en reçoit au début de la partie (20 par défaut), à la première victoire de chaque acte (champ *Orbes* de l'acte) et en parlant aux compagnons au camp (champ *Orbes gagnées* d'une conversation).
- **Bannières** (Base de données › Invocations) : nom, description, personnages possibles, personnages mis en avant, taux 5★ / 4★ / 3★ et part des 5★ réservée aux mis en avant, condition de déblocage et dates (une bannière dont la date de fin est passée disparaît). Les taux réels sont affichés : une rareté sans personnage rend son taux aux autres.
- **Rareté** (fiche d'unité) : 3★, 4★ ou 5★. Elle ne décide que de la probabilité ; les stats ne changent pas.
- **Séance** : un cercle de 5 pierres de couleur (rouge : épée / anima, bleu : lance / lumière, vert : hache / ténèbres, incolore : arc / bâton) ; on choisit lesquelles ouvrir. La 1re coûte 5 orbes, puis 4, 4, 4 et 3 (Système › Invocations). Il faut en ouvrir au moins une : refermer l'autel garde la séance, on ne peut pas relancer les couleurs gratuitement.
- **Pitié** : +0,5 % de 5★ toutes les 5 invocations sans 5★ sur une bannière, retirés des 4★ / 3★ ; remise à zéro quand un 5★ sort.
- **Résultat** : un nouveau personnage rejoint l'équipe (menu Équipe, préparatifs) ; un personnage déjà recruté gagne une **fusion** (+1 à deux stats, les plus hautes d'abord, jusqu'à +10). En Classique, un personnage mort ne peut plus être invoqué.
- Le projet d'exemple propose « Héros de Lycia » (Rebecca mise en avant) et « Mercenaires de passage » (Cloud, après le chapitre 1), avec cinq personnages à invoquer (Rebecca, Oswin, Matthew, Serra, Dorcas) qui prennent les sprites de leur classe. Menu Debug : « +50 orbes ».

**Recrutement** — Sur la map de camp (mode Unités), section **Équipe de départ**, choisir l'effectif initial (le héros du camp est toujours inclus). Sans réglage explicite, les placements joueur de l'acte de départ servent d'effectif initial. Dans **Unités › Rejoint l'effectif après**, choisir un acte ou un chapitre entier : le personnage est recruté une fois cet objectif terminé. Les placements joueur rejoignent également l'effectif au lancement de leur acte. Placer un PNJ dans le camp ne le recrute pas. Les anciennes sauvegardes retrouvent l'effectif initial et les personnages des actes déjà terminés ; les personnages morts en Classique restent indisponibles. Les préparatifs permettent de choisir les participants parmi cet effectif, sur les cases de départ de chaque acte.

**Chapitres et actes** — Un *acte* est un niveau jouable (map, placements, objectif, dialogues ; placements en mode Unités). Un *chapitre* regroupe des actes dans l'ordre. Les deux se règlent dans le même onglet, **Base de données › Chapitres et actes**. À gauche, un arbre présente les sections Histoire et Évènements ; chaque chapitre se replie (▸ / ▾) et montre ses actes en sous-cases, avec « + Nouvel acte » en dessous. Les actes qui ne sont rangés dans aucun chapitre sont regroupés dans « Actes non rangés ». La recherche trouve un chapitre ou un acte par son nom. Cliquer un chapitre ouvre sa fiche (nom, section, description, conditions et dates de déblocage, ordre des actes avec ▲ ▼). Cliquer un acte ouvre la sienne (objectif, dialogues, or, préparatifs, villages, coffres et portes). En bas, on trouve « + Chapitre », « + Acte » (dans le chapitre sélectionné) et la suppression de l'élément sélectionné : supprimer un chapitre garde ses actes. Les actes rangés dans aucun chapitre (anciens projets) s'affichent chacun comme un chapitre d'un seul acte au tableau des quêtes. Les conditions « disponible après » acceptent un chapitre entier ou un acte précis. Fichier : `data/arcs.json`.

**Maps de chapitre et maps de camp** — Le panneau Projet sépare les **Maps de chapitre** (avec leurs actes) et les **Maps de camp** ; chaque section a son bouton +. Le type d'une map se change dans son inspecteur. Le camp se règle directement sur sa map : ouvrir la map de camp en mode **Unités (F3)**.
- **Palette (à gauche)** : les repères (départ du héros, tableau des quêtes, marchand, autel d'invocation) et les personnages présents. On choisit un repère, puis on clique sur la map pour le placer. « Ajouter » met un personnage au camp ; un clic droit sur lui le retire.
- **Inspecteur (à droite)** : nom, héros, or de départ, musique, bouton *Tester le camp*. Pour le personnage sélectionné : le chapitre après lequel il arrive. Puis les **conversations** du camp (cliquer pour les modifier dans une fenêtre : personnage, chapitre à terminer avant, personnages vivants requis, affinité et orbes gagnées, une seule fois, dialogue « Nom: texte »), l'**équipe de départ**, la **boutique** et l'**autel**.

Si le projet a plusieurs maps de camp, une seule est utilisée par le jeu (« Utiliser comme camp du jeu »). Tout cela est annulable (Ctrl+Z). Les chapitres et leurs actes se règlent dans Base de données › **Chapitres et actes** (section, conditions, **dates réelles**, or à la victoire, rejouable). Sans lobby (case décochée), les chapitres s'enchaînent comme avant.

## Affinités (soutiens) et épilogue

**Base de données › Affinités** — Une fiche par paire de personnages : points au départ, rang maximum (A ou S), attaque spéciale, attaque duo, une conversation par rang et le texte de fin du couple. Six paires sont fournies : Xarrin ♥ Eliwood, Xarrin ♥ Lyn, Eliwood ♥ Lyn, Eliwood ♥ Hector, Hector ♥ Lyn, Lyn ♥ Cloud.

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

Les données d'un côté, les ressources de l'autre, rangées **par personnage** : tout ce qui concerne Lyn est dans `ressources/personnages/Lyn/`.

```
MonJeu/
  game.tfproj              nom, réglages, chapitre de départ, ordre des maps, lobby
  data/
    units.json classes.json skills.json weapons.json items.json terrains.json tilesets.json chapters.json (actes) arcs.json (chapitres) supports.json talks.json
    maps/map_1.json        une map par fichier (calques = gids façon Tiled)
  ressources/
    LISEZMOI.txt           rappel de l'organisation
    personnages/
      Lyn/
        map_Lord.png       + map_Lord.json        sprite de map (une planche par classe si besoin)
        map_BladeLord.png  + map_BladeLord.json
        combat.png         + combat.json          animation de combat
        combat_arrow.png                          projectile de l'animation
        portrait.png                              portrait / face set
      Brigand/ Cloud/ Eliwood/ Hector/ Xarrin/
    tilesets/              images des tilesets
    interface/             curseur, fenêtres…
    musiques/              musiques de phase
    jingles/               montée de niveau, victoire, game over
    sons/                  effets sonores
```

Le nom des fichiers ne compte pas : une planche avec un `.json` « `type: mapsprite` » est un sprite de map, « `type: battler` » une animation de combat, une image seule dans `personnages/` est un portrait. Les sous-dossiers sont libres (`personnages/Ennemis/Soldat/…`). Un portrait importé depuis la fiche d'une unité va directement dans le dossier de ce personnage.

Tout est en JSON lisible, donc versionnable avec Git.

**Anciens projets** (`img/characters`, `img/battlers`, `img/faces`, `img/tilesets`, `audio/…`) : convertis automatiquement à l'ouverture. Chaque fichier est rangé dans le dossier du personnage dont le nom commence le fichier (`Lyn_Lord.png` → `personnages/Lyn/map_Lord.png`, `img/faces/Lyn.png` → `personnages/Lyn/portrait.png`), sinon dans celui de l'unité qui l'utilise. Les références de la base de données, des maps et de la sauvegarde de campagne sont réécrites. Une copie des données d'avant la conversion reste dans `.sauvegarde-avant-ressources/`. Les projets encore plus anciens (`maps/` à la racine) s'ouvrent toujours aussi.

## Couleurs des personnages

Chaque planche est enregistrée **une fois, dans ses couleurs d'origine**. L'éditeur calcule les variantes :

| Variante | Quand |
|---|---|
| Couleur d'origine | celle de la planche |
| Bleu | unité du joueur |
| Rouge | ennemi |
| Vert | allié (unité verte) |
| Gris | unité qui a déjà joué ce tour (sur la map) |

Seules les **couleurs d'équipe** changent (tenue, armure…) ; la peau, les cheveux et les armes gardent leurs couleurs. Elles sont détectées automatiquement (la famille de teintes saturées la plus présente, hors tons chair). Pour corriger : Base de données › Ressources › choisir la planche › *Couleurs d'équipe* : un clic sur une couleur la coche ou la décoche. Le choix est enregistré dans le `.json` de la planche (`"teamColors": ["#2850c8", …]`) ; *Revenir à la détection automatique* efface la liste.

Réglage **Couleurs du sprite** :

- *Équipe sur la map, origine en combat* (par défaut, comme les Fire Emblem GBA)
- *Couleur d'équipe partout*
- *Couleur d'origine partout*

Il se règle dans Système (pour tout le projet), sur une classe, sur une unité ou sur un placement de chapitre (inspecteur de droite en mode Unités). Le plus précis l'emporte : placement › unité › classe › projet.

## Ressources par défaut

Chaque nouveau projet reçoit le contenu de `assets/default/ressources/` :

| Dossier | Contenu |
|---|---|
| `personnages/Xarrin` | protagoniste : animation de combat (tirée de `xarrin.gif`), portrait, sprite de map `map_Lord` (tiré de `xarrin_map.png`, une seule pose dessinée en 64×64 pour des cases de 32 : `base: 32`) |
| `personnages/Eliwood` | sprites de map Seigneur et Chevalier-Seigneur, animation de combat, portrait en face set (planche FE GBA animée) |
| `personnages/Lyn` | Seigneur et Lame-Seigneur, animation (épée + arc, flèche en projectile), portrait |
| `personnages/Hector` | Seigneur et Grand Seigneur, animation (hache + hachette lancée), portrait |
| `personnages/Brigand` | sprite de map, animation (planche retouchée), portrait |
| `personnages/Cloud` | allié, sprites propres à l'unité |
| `tilesets` | Plaines (dont buisson et fourré), Village (tiles de 16 px, utilisé par le camp) |
| `musiques` | Winning Road (Roy's Hope), Advance |
| `jingles` | Level Up, Game Over |

### Portraits au format face set

Un portrait de 128×112 px rangé comme dans les Fire Emblem GBA est reconnu tout seul et animé :

```
(0,0)   portrait 96×80                       (96,16)  mini-portrait 32×32
(96,48) yeux mi-clos 32×16                   (96,64)  yeux fermés
(0,80) (32,80) (64,80)  bouche ouverte / entrouverte / fermée   (96,80) sourire fermé
(0,96) (32,96) (64,96)  sourire ouvert / entrouvert / fermé
```

La couleur du pixel en haut à gauche sert de fond transparent. La place des yeux et de la bouche sur le portrait est retrouvée automatiquement (elle s'affiche dans Ressources). En jeu : grand portrait qui cligne des yeux et parle pendant que le texte défile dans les dialogues, mini-portrait dans la fenêtre d'unité, buste dans l'épilogue. Les portraits d'une autre taille restent affichés tels quels.

Un projet existant garde son ancien portrait d'Eliwood (l'ajout des ressources par défaut n'écrase rien) : remplace `ressources/personnages/Eliwood/portrait.png` à la main pour avoir le face set.

Pour un projet sans ressources : Base de données › Ressources › **Ajouter les ressources par défaut** copie les fichiers sans rien écraser et relie les classes de seigneurs et le Brigand à leurs sprites.

Les sprites sont liés aux **classes** (Base de données › Classes : *Sprite de map* et *Animation de combat*). Une unité peut surcharger ceux de sa classe. Une classe sans sprite s'affiche en jeton coloré ; si un des deux combattants n'a pas d'animation, le combat se joue directement sur la map. L'onglet **Ressources** de la base de données liste tout ce qu'il y a dans `ressources/`, avec une recherche et un **Trier par** : personnage (dossier), type de ressource (sprites de map, animations, portraits), série ou arme du personnage. Le personnage d'un dossier est l'unité de même nom ou celle qui utilise ses ressources ; pour l'arme, à défaut d'unité, c'est la classe qui les utilise (le Brigand est rangé sous Hache). Chaque ressource est présentée avec un aperçu animé (couleur d'origine / bleu / rouge / vert / gris, chaque animation, frame d'impact), les couleurs d'équipe et un bouton qui ouvre le dossier de la ressource.

Le chapitre d'exemple met Xarrin, Eliwood, Lyn et Hector face aux brigands de Batta. Xarrin est le héros du camp et le chef d'escouade (convoi).

Un tileset dont les tiles sont plus petits que les cases de la map (16 px sur une map en 32 px, par ex.) est agrandi d'un facteur entier à l'affichage, comme les sprites de map.

### Format d'un sprite de map (`personnages/Nom/map_….json`)

Planche de frames 32×32, une rangée par animation (`idle`, `left`, `right`, `down`, `up`, `focus`), dans les couleurs d'origine. `teamColors` (facultatif) liste les couleurs qui passent en bleu / rouge / vert.

```json
{ "type": "mapsprite", "name": "Lyn — Seigneur", "frame": [32, 32], "anchor": [16, 23], "base": 16,
  "teamColors": ["#3850d0", "#4898f8", "…"],
  "anims": { "idle": { "row": 0, "frames": [0, 1, 2, 1], "durations": [500, 80, 500, 80] }, "...": {} } }
```

Les anciennes planches à 4 palettes précalculées (`palettes`, `paletteHeight`) restent lisibles : seul le premier bloc est utilisé.

`anchor` = pied du personnage (bas-centre de la case), `base` = taille de case d'origine (le sprite est agrandi pour des cases de 32 px).

### Format d'une animation de combat (`personnages/Nom/combat.json`)

Toutes les frames ont la même taille (`cell`) et le même point d'ancrage au sol, rangées sur une grille de `columns` colonnes. Chaque animation liste ses frames et peut préciser :

- `hit` : frame de l'impact (dégâts, flash, recul)
- `approach` / `retreat` : frames pendant lesquelles l'attaquant avance vers l'adversaire / revient
- `reach` : part du trajet parcourue pendant `approach` (1 par défaut ; moins quand le mouvement est déjà dessiné dans les frames, comme pour Xarrin)
- `projectile`, `release`, `catch` : projectile (`arrow`, `axe`), frame du tir et frame où l'arme revient
- `projectiles` : images des projectiles, rangées à côté de la planche (`{ "arrow": "combat_arrow.png" }`)
- `teamColors` : comme pour les sprites de map
- `facing` : sens dans lequel la planche regarde (les héros regardent à gauche, le brigand à droite) ; le moteur retourne l'image si besoin

Animations reconnues : `stance`, `attack`, `critical`, `ranged`, `rangedCritical`, `bow`, `bowCritical`, `dodge`.

### Régénérer les ressources

Les planches d'origine sont dans `tools/sprite-sources/` (dont `cloud.gif`). Le script de conversion les redécoupe, aligne les frames, range chaque personnage dans son dossier, note ses couleurs d'équipe et génère les portraits :

```bash
python3 tools/build_default_resources.py --preview apercu/
```

Une planche retouchée à la main se pose dans `tools/sprite-sources/<nom>_combat.png` (même taille que la planche générée, y compris pour les animations tirées d'un GIF) : elle remplace la planche générée, le `.json` reste celui du script. Un face set se pose dans `<nom>_faceset.png`, un portrait simple dans `<nom>_portrait.png`. Les animations tirées d'un GIF (Cloud, Xarrin) se règlent dans `GIF_BATTLERS` : couleur de fond, ombre, frames de chaque animation, impact, avance / recul. Un sprite de map dessiné en une seule pose (agrandi ×N accepté) se déclare dans `POSE_MAP_SPRITES` : le script le ramène à sa taille d'origine et simule les animations (respiration, petits sauts pendant la marche, miroir pour la droite). Le champ `base` du `.json` donne la taille de case pour laquelle le sprite est dessiné : 16 pour les sprites GBA, 32 pour Xarrin.

(Pillow + numpy.) Les découpages, frames d'impact et cadrages des portraits sont réglés en haut du script.

**Crédits** : sprites rippés de *Fire Emblem: The Blazing Blade* (Intelligent Systems / Nintendo) par Lexou, Grim & Bonzai. Cloud : édition FE par Lord Zymeth (personnage Square Enix, base Nintendo). Musiques : *Fire Emblem: The Binding Blade*, Yuka Tsujiyoko (Enhanced Soundtrack). À garder pour un usage perso / fan-game : à retirer de `assets/default/ressources/` et `tools/sprite-sources/` avant toute diffusion publique de l'outil.

## Code

```
main.js                    process principal Electron (fenêtres, menus, IPC)
preload.js                 pont sécurisé vers le renderer
src/main/tiled.js          import Tiled
src/main/project-io.js     lecture / écriture des projets
src/main/resources-layout.js  dossier ressources/ : inventaire, conversion des anciens projets, couleurs d'équipe des .json
src/shared/lobby.js        lobby : chapitres débloqués, évènements datés, conversations, boutique — testé dans test/lobby.test.js
src/shared/rules.js        (resolveCombat) overkill : coups restants après le coup fatal, bonus d'EXP — testé dans test/overkill.test.js
src/shared/fe-arsenal.js   pack d'armes, objets et compétences de la série — testé dans test/fe-arsenal.test.js
src/shared/fe-pack.js      pack de personnages de la série (fiches, classes, bannières) — testé dans test/fe-pack.test.js
src/shared/summon.js       invocations : bannières, taux, pitié, cercle de pierres, fusions — testé dans test/summon.test.js
src/renderer/summon-panel.js  autel d'invocation du camp
src/shared/roster.js       tri et recherche des personnages (nom, classe, arme, série) — testé dans test/roster.test.js
src/shared/team.js         effectif recruté, équipement des compétences et transferts — testés dans test/team.test.js
src/renderer/team-panel.js préparatifs de l'équipe au camp
src/shared/battle-trade.js règles d'échange entre personnages adjacents en bataille — testées dans test/battle-trade.test.js
src/renderer/trade-panel.js écran d'échange en bataille, souris et clavier
src/shared/deployment.js   règles de sélection et de placement — testées dans test/deployment.test.js
src/renderer/preparation.js écran de préparation avant bataille
src/shared/villages.js     accès aux villages, récompenses et historique — testés dans test/villages.test.js
src/renderer/village-fields.js réglages des villages partagés par l'éditeur de map et la fiche d'acte
src/shared/locks.js        coffres, portes, clés, Crochetage et terrain des passages — testés dans test/locks.test.js
src/renderer/lock-fields.js réglages des coffres et portes partagés par l'éditeur de map et la fiche d'acte
src/renderer/settings-window.js  fenêtre Paramètres du playtest (sauvegarde, chargement, son, debug)
src/main/campaign-io.js    emplacements de sauvegarde (saves/slot-N.json)
src/renderer/lobby-scene.js  lobby jouable dans le playtest (déplacements, panneaux chapitres / boutique, conversations)
src/shared/palettes.js     couleurs d'équipe (détection, recoloration, réglage origine / équipe) — testées dans test/palettes.test.js
src/shared/rules.js        règles du jeu (combat, déplacement, IA, exp) — testées dans test/run.js
src/shared/defaults.js     base de données par défaut + chapitre d'exemple
src/renderer/              éditeur (editor.js, db.js), playtest (playtest.js), scène de combat (battle.js), sprites (sprites.js)
tools/                     conversion des planches de sprites
test/snapshot.js           test de bout en bout : TF_SNAPSHOT=dossier npm start
test/snapshot-supports.js  affinités, attaque duo, soutien, épilogue : TF_SNAPSHOT_SCRIPT=test/snapshot-supports.js
test/snapshot-settings.js  fenêtre Paramètres de bout en bout
test/snapshot-lobby.js     lobby de bout en bout (camp, conversation, boutique, chapitre, retour) ; test/snapshot-lobby-editor.js : son édition
test/snapshot-team.js      équipe de bout en bout (réservistes, compétences, échanges, promotion, sauvegarde et déploiement)
test/snapshot-deployment.js préparatifs de bout en bout (sélection, carte, terrain, sauvegarde, déploiement, acte suivant et désactivation)
test/snapshot-villages.js   villages de bout en bout (placement, déplacement/annulation, récompenses, recrues, sauvegarde et rejeu)
test/snapshot-locks.js      coffres et portes de bout en bout (édition, clés, Crochetage, passage, reprise et rejeu)
test/snapshot-battle-trade.js échanges en bataille de bout en bout (annulation, inventaires pleins, déplacement, attaque, reprise et sauvegarde)
test/snapshot-ressources.js  conversion d'un ancien projet, onglet Ressources, couleurs en jeu (TF_OLD_PROJECT=dossier pour tester un vrai projet)
```

**Compétences en jeu** — Précision, Esquive, Offensive et Garde modifient les calculs lorsque leurs conditions sont remplies. Présence rassurante protège les autres alliés à portée (y compris les unités vertes) ; seule l’aura d’esquive la plus forte s’applique. Régénération soigne au début de la phase du porteur, avant le soin du terrain, sans ressusciter les unités vaincues. Luna ignore une partie de la Défense / Résistance et du terrain ; Sol soigne sur les PV réellement retirés ; Vantage place la première riposte avant l’attaque ennemie ; Miracle permet de survivre à 1 PV, mais ne protège pas un nouveau coup commencé à 1 PV. Les prévisions affichent les dégâts hors déclenchements et les probabilités séparément. Un seul effet offensif peut se déclencher par coup : priorité à l’attaque spéciale d’affinité, puis Luna, puis Sol. Les attaques duo utilisent les passifs et les protections de la cible, sans Luna/Sol du partenaire. Les déclenchements et soins sont visibles dans les animations comme sur la map.

## Pistes pour la suite

Priorités suivantes : animations des classes génériques, brouillard de guerre, sauvegarde en milieu de bataille et export d'un jeu jouable autonome. Les villages, coffres, portes, échanges en bataille, promotions à embranchements, la gestion de l'équipe au camp et l'écran de préparation avant bataille sont disponibles. La proposition complète et l'état des lots sont dans `docs/proposition-systemes-fire-emblem.md`.
