# Tactical Emblem

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

Après une compilation réussie, le portable de `dist/` est automatiquement copié à la racine et remplace l'exécutable de même nom (`Tactical Emblem 0.1.0.exe` pour cette version). Fermer l'application avant de reconstruire. Si le remplacement échoue parce qu'elle est ouverte, la compilation reste dans `dist/` ; fermer l'application puis lancer `npm run postdist` suffit pour refaire la copie.

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

**Écran titre** — Le jeu s'ouvre sur un écran titre : le nom du jeu (Système › Nom du jeu), un sous-titre, puis **Jouer**, **Crédits** et **Quitter** (flèches + Z / Entrée, ou la souris).
- **Jouer** sans sauvegarde crée la partie tout de suite (Classique par défaut ; *Détente* ou *Demander* dans Système) ; avec des sauvegardes, il propose **Continuer**, **Charger une sauvegarde** (s'il y en a plusieurs) et **Nouvelle partie**.
- **Crédits** affiche le nom du jeu, l'auteur et le texte de **Système › Écran titre et crédits** : une ligne « Rôle : Nom » sur deux colonnes, une ligne qui finit par « : » en titre, une ligne vide entre les blocs.
- Le même endroit règle le sous-titre, une image de fond (dossier `ressources/interface` ou fonds de combat) et une musique.
- Lancé depuis l'éditeur sur un acte précis, l'écran titre ajoute « Test : « l'acte » » pour le jouer directement.

Une nouvelle partie se joue en **Classique** (pertes définitives) ou **Détente** (les unités vaincues reviennent au chapitre suivant). Les personnages requis par le chapitre doivent survivre dans les deux modes. Dans la fiche d'un personnage, « Toujours se retirer » permet son retour même en Classique.

**Base de données › Chapitres et actes › (un acte) › Conditions de victoire et de défaite** permet de choisir les personnages à protéger et ceux autorisés à prendre les points, de combiner plusieurs objectifs avec ET / OU et d'ajouter des défaites par limite de tours, pertes ou intrusion ennemie dans une zone. Les anciens chapitres héritent des Seigneurs pour la protection et la prise de point. Les conditions invalides sont signalées avant de lancer le test.

**Interface des combats animés** — **Système › Règles de combat › Interface des combats animés** : *GBA* (par défaut, style Fire Emblem) ou *FF9* (texture tissu, d'après Cynon). Les plaques de nom, les encadrés PRÉC / DGT / CRIT et les panneaux de PV prennent la couleur du camp (rouge ennemi, bleu joueur, vert allié). Pièces dans `src/renderer/img/ui/` (thème GBA) et `img/ui/ff9/`, regénérées par `python3 tools/build_ui_gba.py`.

**Effets façon Fire Emblem Heroes** — Les dégâts s'affichent avec les chiffres de *Heroes* (rouges, plus grands sur un critique, verts pour les soins), en combat animé comme sur la map ; les attaques spéciales et compétences s'annoncent dans un bandeau turquoise ; au camp, une bulle « ! » signale une conversation ; à l'autel d'invocation, chaque personnage a l'icône de son type d'arme. L'or (la monnaie du jeu) s'affiche avec une pièce d'or (`src/renderer/img/ui/gold.png`) au camp, à la boutique et en chapitre ; le plugin Invocations affiche les orbes avec l'orbe d'invocation de *Heroes* (`plugins/invocations/img/orb.png`).

**Animations d'attaque** — Base de données › **Animations**, comme dans RPG Maker : une animation est une suite d'images où l'on pose des **cellules**, des morceaux des planches rangées dans `ressources/animations` (les 148 planches d'effets *Heroes* sont fournies dans `ressources/animations/heroes`, toutes disponibles). Dans l'onglet :
- **Bande des images** : ajouter, dupliquer, déplacer, supprimer une image ; « Interpoler jusqu'à… » remplit les images entre l'image courante et une autre (positions, taille, rotation, opacité).
- **Scène** : l'attaquant à gauche, la cible à droite ; une cellule se place à la souris (flèches : au pixel près), se règle à droite (X, Y, taille, rotation, opacité, fusion normale ou *addition* pour les lumières, retournée, devant / derrière) ; l'image précédente s'affiche en transparence. « Ajouter une pièce… » ouvre la planche avec ses morceaux détectés (clic) ou une zone à tracer.
- **Par image** : son, flash (cible ou écran, couleur, force, durée), tremblement, et l'image où **les dégâts tombent**.
- **Deux types** : *normale* (jouée sur la cible ou l'attaquant : centre, pieds, tête ou écran) et **projectile** pour les attaques à distance (de l'attaquant à la cible, durée du trajet, courbe, orienté selon son trajet comme une flèche ou simplement tourné vers la cible comme une boule de feu). « Animation à l'arrivée » enchaîne une autre animation sur la cible (Feu → Explosion de feu) ; les dégâts tombent à son image d'impact.
- **Aperçu** : joue l'animation et ses enchaînements.

**Quelle attaque joue quelle animation** : chaque type d'arme a son animation par défaut (en haut de l'onglet Animations) ; une arme peut choisir la sienne et une autre pour ses critiques (onglet Armes et objets), une compétence qui se déclenche (Luna, Sol…) la remplace sur son coup (onglet Compétences). Les animations sont jouées en combat animé (elles remplacent le projectile intégré du personnage) comme sur la map, et pour les bâtons de soin. Le projet d'exemple en a douze (coup tranchant, estoc, coup lourd, flèche, Feu, Éclair, Flux, Soin, Luna, Sol…) ; un ancien projet les reçoit à l'ouverture.

**Icônes de compétences** — Chaque compétence peut avoir une icône façon *Heroes* (Base de données › Compétences › *Icône* › « Choisir une icône… ») : plus de 1 300 icônes rangées en 9 planches (`src/renderer/img/skills/`), toutes disponibles même si aucune compétence de base ne les utilise encore. Les compétences de base ont la leur (un ancien projet la reçoit à l'ouverture) ; sans icône, le symbole s'affiche comme avant. L'icône apparaît dans la liste des compétences, les prévisions de combat, la fiche des compétences en jeu, l'équipe au camp et le bandeau turquoise des combats animés.

**Altérations d'état** — Poison, Sommeil et Silence sont disponibles dans le noyau, sans plugin. Les lettres **P / Z / S** apparaissent sur la map ; la fiche d'unité affiche le nom et la durée restante, avec le détail au survol.

- **Poison** : au début de la phase du porteur, retire 10 % de ses PV maximum, arrondis au supérieur, sans descendre sous 1 PV. L'effet passe avant Régénération et le soin du terrain.
- **Sommeil** : empêche déplacement, action, riposte et participation offensive à un duo. Recevoir un coup ne réveille pas. Un allié réveillé par un soin peut agir s'il n'avait pas déjà joué ; un soin ne réactive pas une action dépensée.
- **Silence** : empêche les tomes, les armes physiques marquées magiques et tous les bâtons. Les armes physiques normales, objets et déplacements restent accessibles. La première arme utilisable de l'inventaire sert d'équipement de secours.

La durée se règle de **1 à 9 phases du porteur** : activation au début, diminution à la fin de sa phase. Un statut appliqué pendant sa phase agit immédiatement mais attend la prochaine phase complète pour décompter sa durée. Plusieurs altérations différentes peuvent coexister. Réappliquer le même effet ne le multiplie pas et ne raccourcit pas sa durée : seule une durée supérieure la prolonge. Les unités endormies du joueur peuvent attendre via **Fin du tour** ; leurs phases continuent de faire avancer la durée.

Dans **Armes**, cocher **Inflige une altération** et choisir l'effet, sa chance après un coup réussi et sa durée. Dans **Compétences**, l'effet **Inflige une altération après un coup réussi** utilise les conditions habituelles, une probabilité fixe, la Technique ou la Chance ; la compétence doit être personnelle ou équipée. Cette altération est indépendante du choix exclusif entre attaque spéciale, Luna et Sol. Elle peut s'appliquer sur un coup à zéro dégât, si la cible survit ; aucun effet sur un raté, une cible vaincue ou un coup d'overkill. Le sommeil ou le silence peut interrompre la riposte ou les coups suivants du combat en cours. Les prévisions affichent les chances par coup réussi et la durée ; l'IA prend en compte les restrictions et ajoute une estimation de l'intérêt des altérations à son choix d'attaque.

Dans **Objets**, choisir **Soigne une altération** puis l'effet concerné ou Toutes. L'objet se consomme depuis le menu Objet uniquement quand il peut soigner le porteur. Pour soigner un autre personnage, un **bâton** peut régler **Soigne une altération** : le rétablissement est accessible même sur un allié à tous ses PV et ne rend pas de PV lui-même. Quand plusieurs bâtons conviennent à la cible, le jeu propose lequel utiliser. Un porteur sous Silence ne peut pas lancer ce soin ; un porteur endormi ne peut pas utiliser d'objet lui-même.

Les onglets **Armes**, **Objets** et **Compétences** proposent **Ajouter les exemples d'altérations manquants** : épée empoisonnée et bâton Rétablissement, Antidote et Remède universel, trois compétences d'altération à 30 %. Les exemples s'ajoutent sans remplacer les fiches existantes et ne sont pas distribués automatiquement aux personnages. Les événements proposent aussi **Appliquer / soigner une altération**, pour un personnage vivant déployé ou un ennemi déjà apparu. Les altérations sont propres à la bataille : elles ne sont pas conservées au camp ou au chapitre suivant. Recommencer restaure le début d'acte et rejoue ses éventuelles altérations scénarisées ; la sauvegarde reste un début d'acte.

**Soins et soutien de l’IA** — Les ennemis et alliés verts contrôlés par l’IA peuvent utiliser les bâtons de soin et de Rétablissement de leur inventaire. Ils cherchent une case accessible à portée d’un allié blessé ou atteint d’une altération ; Rétablissement privilégie le sommeil et le silence d’un utilisateur de magie ou de bâtons. Les alliés verts peuvent aussi soigner les personnages du joueur. La classe, la portée, les murs, les occupations des cases, Sommeil et Silence restent respectés. Les soins jouent l’animation habituelle, consomment les utilisations du bâton, et donnent de l’EXP aux alliés. Une unité IA endormie réveillée avant la fin de sa phase peut encore agir si elle n’a pas déjà joué.

En **Unités (F3)**, le comportement **Soutien — soigne et accompagne ses alliés** donne priorité aux soins ; sans soin immédiat, l’unité rejoint son groupe et peut attaquer si une occasion se présente. Les autres comportements peuvent aussi soigner à portée, en comparant l’intérêt du soin à celui d’une attaque ; **Immobile** reste sur sa case. L’IA peut également utiliser une potion quand elle a au plus la moitié de ses PV, un antidote contre le poison ou un remède contre une altération utile à retirer. Ces objets sont consommés normalement ; les boosts permanents ne sont pas utilisés automatiquement.

**Difficulté de l’IA** — **Paramètres (Échap) › Jeu › Difficulté de l’IA ennemie** propose **Facile**, **Normal** et **Tactique**, modifiables au camp, pendant les préparatifs ou entre deux actions en bataille. Facile privilégie les adversaires proches et anticipe peu les ripostes ; Normal évalue les dégâts, coups fatals, ripostes et soins ; Tactique renforce les priorités de victoire/survie et pénalise davantage les cases menacées. Les statistiques, la précision et les tirages restent identiques, les comportements de placement restent respectés et les alliés conservent une IA normale. Le choix est enregistré avec la sauvegarde. **Base de données › Système › Règles de combat** règle la difficulté par défaut ; une ancienne sauvegarde sans ce champ reprend cette valeur (Normal par défaut).

**Ambiances météo** — **Unités (F3) › Ambiance météo**, ou **Base de données › Chapitres et actes › un acte › Ambiance météo** : choisir **Aucune**, **Brouillard**, **Tempête de sable** ou **Neige**, une intensité légère/modérée/forte et la direction du vent. L’éditeur affiche un aperçu animé en mode Unités. La météo apparaît sur la carte et dans les combats animés ; le brouillard forme des nappes mobiles, le sable des rafales et voiles de poussière, la neige des flocons entraînés par le vent. Les textes et interfaces restent au premier plan. Les anciens actes n’ont aucun effet par défaut et aucune ressource à importer n’est nécessaire.

Par défaut, la météo reste visuelle. Cocher **Activer les effets tactiques du climat** dans les mêmes réglages active les règles suivantes, pour les deux camps :

| Climat | Effets légers / modérés / forts |
| --- | --- |
| Brouillard | Esquive +5 / +10 / +15 points ; vue limitée à 6 / 4 / 3 cases. |
| Tempête de sable | Vue limitée à 6 / 4 / 3 cases ; déplacements ralentis. Aucun changement de précision ou d’esquive. |
| Neige | Déplacements ralentis uniquement ; vue et combats inchangés. |

Pour le sable et la neige : en léger, coût par case +1 pour la cavalerie ; en modéré, +1 pour toutes les unités au sol ; en fort, +1 au sol et +2 pour la cavalerie. Les volants gardent leurs coûts de déplacement et les terrains infranchissables restent bloqués. Les prévisions, les zones de déplacement et de danger et l’IA utilisent ces mêmes règles. Le bonus d’esquive du brouillard est déjà inclus dans les valeurs de précision affichées, y compris pour les ripostes et la magie.

La vue est partagée entre le joueur et ses alliés verts, et séparément entre ennemis. Le rayon se compte en cases sans blocage de vue par les murs ; le terrain reste connu, les unités adverses hors de vue sont cachées. Les préparatifs, fiches, listes de cibles et zones de danger ne révèlent pas leurs positions. Un trajet peut être choisi vers l’inconnu : s’il rencontre un ennemi, l’unité s’arrête avant lui et peut encore choisir une action. Tout déplacement dans le brouillard de guerre est validé pour empêcher l’annulation après une reconnaissance ; une danse rend bien un nouveau déplacement. Les adversaires se révèlent le temps d’un combat. L’IA choisit parmi les cibles repérées par son camp.

**Événements & dialogues › Changer la météo** peut changer le climat, son intensité et l’activation des effets tactiques, ou le dissiper (**Aucune**) en cours d’acte. Le changement reste propre à la tentative ; recommencer ou recharger le début d’acte rétablit sa météo initiale et rejoue les événements. Le camp ne reprend pas le climat de la bataille. **Échap › Jeu › Afficher les effets météo** masque les animations, tout en gardant les effets tactiques et le brouillard de guerre actifs ; ce choix est conservé dans la sauvegarde. Les anciennes configurations sans activation explicite restent purement visuelles.

**Overkill** — Quand un coup abat l'ennemi, les dégâts en trop sont affichés (« OVERKILL +18 »). Celui qui l'a abattu termine ensuite les coups qu'il avait prévus (double attaque, arme à plusieurs coups). Ces coups ne retirent plus de PV ; leur précision et leurs critiques sont tirées normalement, sans usure d'arme ni compétence, et leurs dégâts s'ajoutent à l'overkill. En combat animé, la barre de PV de l'ennemi vaincu se remplit en rouge et son compteur affiche « −54 ». Si l'overkill atteint une deuxième fois les PV max de l'ennemi (54 dégâts en trop sur un brigand de 18 PV max, par exemple), le bandeau « OVERKILL ×2 ! » s'affiche et l'attaquant reçoit un bonus d'EXP (30 par défaut). L'EXP d'un combat reste plafonnée à 100. Ces réglages se trouvent dans **Système › Overkill** (activer / désactiver, montant du bonus, 0 = pas de bonus). Une riposte fatale donne l'overkill au défenseur.

**Préparatifs avant bataille** — Chaque acte commence par le choix des participants dans l'effectif recruté et vivant. Cocher un personnage le déploie ; cliquer sa fiche affiche ses statistiques, objets et compétences. Sélectionner ensuite une case sur la carte ou son bouton numéroté déplace ce personnage ; une case occupée échange les deux positions. Les terrains infranchissables pour leur classe actuelle sont refusés. Les alliés verts gardent leur placement et ne prennent pas de place dans la sélection. Les dialogues de début et le premier tour attendent **Commencer la bataille**.

Dans **Base de données › Chapitres et actes › (un acte) › Préparatifs et déploiement**, régler le nombre maximum de participants (`0` = toutes les cases) et les personnages imposés. Les placements joueur en mode Unités définissent les cases de départ et les recrues de l'acte ; ils servent aussi de sélection par défaut. Les personnages à protéger sont automatiquement imposés. Une prise de point obligatoire exige au moins un participant autorisé, ou un allié fixe autorisé. Décocher **Choisir l'équipe avant cet acte** conserve ses placements scénarisés. Les anciens actes bénéficient des préparatifs sans conversion manuelle.

Le bouton **Sauvegarder…** et Échap donnent accès aux emplacements habituels : la sélection et les positions sont conservées. Recharger ou recommencer une bataille redonne accès à ses préparatifs. Si le projet ou l'effectif a changé, un déploiement devenu invalide est ajusté et signalé. **Retour au camp** permet de reprendre les équipements et promotions avant de repartir. Les modifications d'équipement restent dans le menu Équipe du camp.

**Villages** — En mode **Unités (F3) › Interactions › Village**, cliquer une case pour placer une visite. Le village peut partager la case d'une unité. Le sélectionner dans la liste de droite permet de régler son nom, son dialogue (`Nom: texte`), l'or, l'arme ou l'objet offert et ses utilisations, le personnage recruté et les visiteurs autorisés. Glisser déplace le village ; clic droit ou Suppr le retire, et Ctrl+Z annule. Les mêmes réglages sont accessibles dans **Base de données › Chapitres et actes › (un acte) › Villages à visiter**. Le marqueur V ajoute l'interaction ; le dessin de la maison reste celui de la map. Un village est fourni dans le prologue des nouveaux projets d'exemple.

En bataille, un personnage du joueur doit se trouver sur cette case pour avoir l'action **Visiter**, qui consomme son action. Le dialogue précède la récompense. Un objet va dans son inventaire, ou au convoi s'il est plein ; si les deux sont pleins, la visite attend qu'une place se libère. Une nouvelle recrue apparaît sur une case accessible à proximité et peut agir immédiatement ; un allié vert déjà présent rejoint le joueur en gardant ses PV et ses objets. Un personnage déjà recruté n'est pas dupliqué et un mort ne ressuscite pas. Sans case libre pour une nouvelle recrue, la visite attend également.

Le marqueur passe de V à ✓ après la visite. Par défaut, elle ne peut être récompensée qu'une fois dans la campagne, même en rejouant l'acte ; **Réutilisable quand cet acte est rejoué après victoire** autorise une nouvelle récompense à chaque nouvelle tentative, une seule fois dans chacune. Recommencer ou abandonner une tentative annule ses visites, ses récompenses et ses recrutements. Les sauvegardes en bataille restent des débuts d'acte ; une sauvegarde du camp après victoire conserve les visites acquises.

**Coffres et portes** — En **Unités (F3) › Interactions**, placer un coffre ou une porte, puis sélectionner son marqueur C/P pour régler sa serrure, les personnages autorisés et son dialogue. Les mêmes fiches sont accessibles dans **Base de données › Chapitres et actes**, sur la fiche de l'acte. Un coffre offre de l'or et/ou une arme ou un objet avec ses utilisations ; une porte définit le terrain du passage après ouverture. Les interactions se déplacent et se suppriment avec annulation. Deux interactions ne peuvent pas partager une case, et une unité ne peut pas commencer sur une porte fermée.

En bataille, **Ouvrir le coffre** exige d'être sur sa case et **Ouvrir la porte** d'être adjacent. L'ouverture consomme l'action du personnage. Une clé adaptée doit être dans son inventaire : une utilisation est retirée, puis la clé épuisée disparaît. Les clés peuvent ouvrir les coffres, les portes ou les deux ; chaque serrure peut exiger un objet précis, interdire Crochetage ou être déverrouillée. La compétence **Crochetage**, personnelle ou équipée, ouvre sans consommer de clé et est utilisée en priorité ; la connaître sans l'équiper ne suffit pas. Les nouveaux projets comprennent un Voleur qui l'apprend au niveau 1, une clé de coffre et une clé de porte également vendues au camp. Pour un ancien projet, utiliser **Armes et objets › (un objet) › Ajouter les clés d'exemple manquantes** et le bouton d'exemples des compétences, puis régler l'apprentissage souhaité dans la classe ou le personnage. Ces ajouts préservent les fiches existantes.

Les récompenses vont dans l'inventaire puis le convoi. Si les deux sont pleins, le coffre reste fermé et aucune clé n'est consommée ; la dernière utilisation d'une clé peut libérer la place nécessaire. Une porte fermée bloque tous les déplacements, y compris ceux des ennemis et des volants ; son ouverture actualise les chemins et la zone de danger. Les coffres pillés restent vides dans la campagne, sauf option de remplissage lors d'un acte rejoué après victoire. Les portes se referment à chaque tentative. Recommencer ou abandonner restaure ensemble les clés, récompenses et ouvertures ; les sauvegardes de bataille restent des débuts d'acte.

**Échanges en bataille** — Après le déplacement, **Échanger** propose les personnages du joueur vivants sur une case adjacente, même s'ils ont déjà joué. Choisir un objet dans l'un des deux inventaires, puis un objet en face pour les échanger ou une place libre pour le donner. Les inventaires pleins permettent un échange ; les utilisations sont conservées. La première arme utilisable est équipée automatiquement et les possibilités d'attaque sont actualisées. Les ennemis, alliés verts et réservistes ne sont pas des partenaires d'échange en bataille.

Flèches pour parcourir les deux colonnes, Z / Entrée pour choisir, X / Échap / clic droit pour annuler une sélection puis revenir. **Retour** ferme directement l'écran. Fermer sans transfert permet toujours d'annuler le déplacement ; après un transfert, le déplacement est validé et les objets restent échangés. Le personnage actif peut encore attaquer, soigner, utiliser un objet, échanger à nouveau ou attendre. Le partenaire garde son état de tour et n'est pas réactivé. Le verrou de déplacement disparaît au tour suivant. Recommencer restaure les inventaires de début d'acte ; une victoire et la sauvegarde de campagne conservent les échanges.

**Événements scénarisés** — Dans **Base de données › Chapitres et actes › fiche d'acte › Événements & dialogues**, ajouter un événement, son déclencheur, ses conditions et ses actions. Les anciens dialogues restent lisibles et sont joués avant les nouvelles actions. Les actions se réordonnent et les événements se dupliquent. Les fiches peuvent être repliées pour naviguer dans un acte chargé.

Déclencheurs : début d'acte, début de tour joueur, unité vaincue, fin d'action d'un joueur ou allié dans une zone, coffre ouvert, porte ouverte, village visité, conditions devenues vraies et victoire. Les conditions exigent tous les personnages choisis vivants et déployés, ainsi que les informations mémorisées demandées. Un réserviste ne compte pas comme présent. Par défaut, l'événement joue une fois par tentative ; **Une seule fois dans toute la campagne** évite aussi sa répétition après victoire et rejeu. Un événement conditionnel répétable attend que ses conditions deviennent fausses puis vraies avant de rejouer.

Actions disponibles : dialogue, or, arme ou objet avec ses utilisations et son destinataire, apparition d'un renfort, ouverture/fermeture de porte, remplacement de l'objectif, mémorisation d'une information vraie/fausse et choix entre deux réponses ; les plugins en ajoutent (« Donner des orbes » avec le plugin Invocations). Une information absente vaut faux. Son nom commence par une lettre et contient uniquement lettres, chiffres et `_` (64 caractères maximum). Par exemple, un choix mémorise `marche_accepte` ; un autre événement exige cette information vraie pour donner des orbes, et une branche peut exiger sa valeur fausse. Les choix et événements joués une fois par campagne sont conservés après victoire dans les sauvegardes, et peuvent servir dans les actes suivants.

Pour un renfort, placer l'ennemi en **F3** et cocher **Arrivée uniquement par événement**, puis le choisir dans l'action. Le tour d'arrivée est alors ignoré. Il apparaît sur sa case ou une case accessible voisine et ne se duplique pas s'il est déjà apparu ou vaincu. Les renforts en attente restent inclus dans les objectifs qui les comptent. Une porte occupée attend avant de se fermer. Un objet va au personnage choisi, sinon au convoi si ce personnage est absent, vaincu ou plein ; sans destinataire, il va directement au convoi. Si aucune place n'est disponible, l'événement attend et reprend à cette action quand la place est libérée, sans redonner les récompenses précédentes. La victoire attend aussi la fin des événements en cours : libérer une place par un échange ou le convoi permet de récupérer une récompense de victoire bloquée.

**Exemple d'embuscade** : déclencheur **Coffre ouvert**, choisir le coffre ; ajouter **Faire apparaître un renfort**, **Ouvrir / fermer une porte** avec la case Ouvrir décochée, puis **Changer l'objectif › Survivre › 5 tours**. Ces cinq tours se comptent à partir du tour courant, inclus. Le nouvel objectif remplace tous les objectifs de victoire et conserve les règles de défaite et les personnages à protéger. Pour un objectif de prise de point, prévoir un personnage autorisé dans les participants ou l'imposer dans les préparatifs.

Les modifications de portes et d'objectifs restent propres à la tentative ; le projet d'édition reste intact. Recommencer ou abandonner restaure ensemble les récompenses, choix et informations du début d'acte. Les sauvegardes de bataille restent des débuts d'acte, et ne suspendent pas une séquence d'événements en cours. Les données et références invalides sont signalées et refusées avant écriture.

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

**Annonces, flèche de déplacement et fond** — Les changements de phase s'annoncent avec les bandeaux dessinés « Player Phase », « Enemy Phase » et « Other Phase » (phase alliée), qui glissent de droite à gauche. Quand on déplace un personnage, son trajet est tracé avec la flèche des jeux officiels (départ, droites, coins, pointe). Les écrans sans décor (écran titre sans fond choisi, préparatifs, épilogue) utilisent un fond commun (`src/renderer/img/ui/background.png`). Pièces découpées par `tools/build_ui_popups.py` depuis `tools/ui-popups/`.

**Sauvegardes** — Façon *Fire Emblem* GBA (pièces `src/renderer/img/ui/save/`, découpées par `tools/build_ui_save.py`) : dans Paramètres › Sauvegarder / Charger, chaque emplacement est une barre verte ornée (plus claire quand elle est choisie, main-curseur à gauche) avec le lieu, le mode, l'or, la date et le cadre **PLAYTIME** (temps de jeu, enregistré dans la sauvegarde et repris au chargement). Cliquer la barre (ou Z / Entrée) sauvegarde ou charge ; « Effacer » vide un emplacement. Sur l'écran titre, les entrées sont des barres bleues (la barre verte ornée sur l'entrée choisie) et Jouer › Charger montre les mêmes barres d'emplacement.

**Fiche de personnage** — Façon *Fire Emblem : Radiant Dawn* (fond `src/renderer/img/ui/radiant/`, découpé par `tools/build_ui_radiant.py`) : portrait, nom sur le parchemin, classe, niveau, EXP, PV et sprite de map sur le bois, et trois pages à droite : **Stats** (stats avec jauge jusqu'au maximum de la classe, déplacement, attaque, précision, esquive, critique, altérations en cours, arme équipée), **Objets** (inventaire, arme équipée « E », caractéristiques de l'arme) et **Compétences** (personnelle « P » et équipées, affinités). Sur la map : touche **R** sur une unité ou bouton **Fiche** de la fenêtre d'unité ; ← → changent de page, ↑ ↓ passent aux autres unités du camp, X / Échap / clic droit ferment. Au camp, la fiche est en tête de l'Équipe.

**Lobby (le camp)** — Comme dans Fire Emblem Heroes, le jeu commence dans un lobby et y revient après chaque chapitre. C'est une petite map explorable (une **map de camp**, faite dans l'éditeur) où l'on déplace le héros au clavier (flèches) ou à la souris (clic : il y va, et interagit s'il s'agit d'un personnage ou d'un bâtiment) :
- **Tableau des quêtes** : deux sections, *Histoire* et *Évènements*. Chaque **chapitre** y apparaît comme une carte qui contient ses **actes** (les niveaux jouables), à jouer dans l'ordre : l'acte 2 s'ouvre quand l'acte 1 est gagné, et la victoire propose « Acte 2 → » pour enchaîner sans repasser par le camp. Les chapitres d'histoire s'ouvrent l'un après l'autre ; les évènements selon leurs conditions et leurs dates (« Bientôt » avant la date). Les actes terminés se rejouent, sauf si on décoche *Rejouable*.
- **Équipe** (menu du camp) : tous les personnages recrutés et vivants, même absents de la map du camp. Choisir les cinq compétences équipées parmi les compétences apprises, en plus de la personnelle fixe ; transférer les objets entre personnages et convoi, échanger avec une destination pleine et réordonner un inventaire pour choisir sa première arme utilisable ; consulter l'arbre et promouvoir un personnage avec son sceau. Ces préparatifs sont conservés à la sauvegarde et au prochain déploiement. Les promotions au camp ne consomment pas de tour.
- **Boutique** : achat (rangé dans le convoi ou l'inventaire de n'importe quel personnage recruté et vivant) et revente à moitié prix, au prorata des utilisations restantes. Prix réglés sur chaque arme et objet ; `0` = ne se vend pas.
- **Personnages présents** : ceux que l'on place dans le lobby, éventuellement à partir d'un chapitre (Cloud rejoint le camp après le prologue). Un « ! » au-dessus d'eux signale une **conversation de lobby** disponible : Z (ou un clic) pour la jouer. Elle peut faire gagner de l'affinité avec le héros.
- **Or** : récompense de chapitre (la première victoire, ou à chaque victoire), bourse des ennemis vaincus (réglée sur le placement de l'ennemi), revente.
- X (ou clic droit) : menu du camp — équipe, chapitres, boutique, paramètres. En chapitre, le menu propose *Retour au camp* (abandon) ; après une défaite, on retourne au camp dans l'état d'avant le chapitre.

**Personnages de la série Fire Emblem** — Base de données › Unités › **＋ Personnages de la série…** : on coche les jeux (Shadow Dragon / Mystery, Echoes, Genealogy, Thracia 776, Binding Blade, Blazing Blade, Sacred Stones, Path of Radiance, Radiant Dawn, Awakening, Fates, Three Houses, Engage) et leurs personnages principaux sont ajoutés, soit 171 fiches. Chaque fiche contient :
- la classe, le niveau, l'inventaire, la rareté d'invocation (utilisée par le plugin Invocations), la série (« Fire Emblem 7 »…) et une bio ;
- des croissances inspirées du jeu ;
- des stats approximatives, calculées depuis la classe et le niveau, puis ajustées selon ses croissances.

Images : Eliwood, Lyn et Hector (Blazing Blade) reçoivent les ressources de base du projet (portrait, animation de combat, sprite de map). Si leur dossier manque dans `ressources/personnages/`, il est recopié. S'ils sont déjà dans la base, seuls leurs champs d'image vides sont remplis. Le sprite de map reste celui de la classe quand elle en a un, pour que la promotion le change. Les autres personnages prennent les sprites de leur classe, ou un jeton, jusqu'à ce que tu leur donnes les tiens. Pour en équiper un autre, il suffit d'ajouter une ligne à `ART` dans `src/shared/fe-pack.js`. L'import ajoute aussi :
- les classes qui manquent : Seigneur (épée / lance / hache / arc), Tacticien, Prêtresse guerrière, Myrmidon › Bretteur, Chevalier wyverne › Seigneur wyverne, Chevalier faucon, Danseuse, Troubadour › Valkyrie, Moine › Évêque, Shaman › Druide, Sage, Nomade › Sniper, Berserker, Chevalier noir ;
- avec le plugin Invocations, une bannière d'invocation par jeu, avec le ou les seigneurs mis en avant.

Les autres personnages reçoivent leurs images si un **plugin** de leur jeu est installé dans le projet (voir « Plugins » plus bas) : Roy, Eirika, Ephraim, Guy, Florina… et les classes Archer, Chevalier, Mage… qui n'avaient pas de sprite. Installer le plugin avant ou après l'import revient au même : à l'installation, il relie aussi les personnages déjà présents.

**Fonds de combat** — Chaque terrain peut avoir un décor (Terrains et tilesets › fiche du terrain › **Fond de combat**), une image de `ressources/fonds-combat/`. L'animation de combat l'affiche derrière les combattants, d'après le terrain du défenseur. Sans fond, c'est la map floutée qui sert de décor. Le projet de base en fournit 19 (décors de *Fire Emblem 6*, dans `assets/default/ressources/fonds-combat/`), déjà posés sur les terrains de base ; un projet créé avant les reçoit à sa première ouverture (une seule fois, sans remplacer un décor déjà choisi). Les combattants se tiennent directement sur le décor, sans plateforme.

Un personnage déjà présent (même nom, même série) n'est pas dupliqué. Les manaketes et les laguz ne sont pas inclus (pas de pierre de dragon ni de transformation dans le moteur).

**Armes, objets et compétences de la série** — Dans les onglets Armes et objets (selon la fiche ouverte : arme ou objet) et Compétences, le bouton **＋ De la série Fire Emblem…** ajoute des fiches officielles, sans images. On coche les groupes voulus :
- **armes** : épées, lances, haches, arcs, magie anima, magie de lumière, magie noire, bâtons, et 35 armes légendaires incassables (Falchion, Durandal, Ragnell, Gáe Bolg, Armads, Mulagir, Forseti, Naga…) ;
- **objets** : soins, objets de stats (Robe séraphique, Bottes…), sceaux, clés ;
- **compétences** : déclenchements, bonus, coups et postures (Coup mortel…), compétences selon les PV, maîtrises d'armes, soutien d'équipe.

Une fiche déjà présente (même nom) n'est pas dupliquée. Les compétences sont adaptées aux effets du moteur, et leur description indique quand une version est simplifiée. Les sceaux spéciaux (Emblème du héros…) servent si une promotion de classe les demande.

Trois propriétés d'arme ont été ajoutées pour l'occasion (fiche d'arme) :
- **Brave** : chaque attaque frappe deux fois ;
- **Dégâts magiques** : Mag / Rés pour une épée, une lance ou une hache (Lame du tonnerre…) ;
- **Drain** : le porteur récupère les PV des dégâts infligés (Nosferatu, Lame runique).

**Danser** — Une unité de classe Danseuse (case *Danse* de la classe) a l'action **Danser** : un allié adjacent qui a déjà joué peut rejouer ce tour (+10 EXP pour la danseuse).

**Invocations (plugin)** — Le gacha est un plugin fourni avec l'application, `invocations` : on l'ajoute dans **Base de données › Plugins › Invocations › Installer dans le projet** ; un projet neuf ne l'a pas. À l'installation, il prépare le projet s'il n'a encore jamais servi : réglages par défaut, autel au camp, une bannière (celles de l'exemple si ses personnages sont là), orbes sur les actes et les conversations. Désactivé ou désinstallé, il cache l'autel, les orbes, l'onglet Invocations et la rareté ; les bannières, réglages et orbes gagnées restent dans le projet et les sauvegardes. Un ancien projet qui se servait des invocations reçoit le plugin automatiquement à sa première ouverture.

Comme dans Fire Emblem Heroes, un autel au camp (le puits du camp d'exemple) permet d'invoquer des personnages avec des **orbes**. On en reçoit au début de la partie (20 par défaut), à la première victoire de chaque acte (champ *Orbes* de l'acte) et en parlant aux compagnons au camp (champ *Orbes gagnées* d'une conversation).
- **Bannières** (Base de données › Invocations) : nom, description, personnages possibles, personnages mis en avant, taux 5★ / 4★ / 3★ et part des 5★ réservée aux mis en avant, condition de déblocage et dates (une bannière dont la date de fin est passée disparaît). Les taux réels sont affichés : une rareté sans personnage rend son taux aux autres.
- **Rareté** (fiche d'unité) : 3★, 4★ ou 5★. Elle ne décide que de la probabilité ; les stats ne changent pas.
- **Séance** : un cercle de 5 pierres de couleur (rouge : épée / anima, bleu : lance / lumière, vert : hache / ténèbres, incolore : arc / bâton) ; on choisit lesquelles ouvrir. La 1re coûte 5 orbes, puis 4, 4, 4 et 3 (Système › Invocations). Il faut en ouvrir au moins une : refermer l'autel garde la séance, on ne peut pas relancer les couleurs gratuitement.
- **Pitié** : +0,5 % de 5★ toutes les 5 invocations sans 5★ sur une bannière, retirés des 4★ / 3★ ; remise à zéro quand un 5★ sort.
- **Résultat** : un nouveau personnage rejoint l'équipe (menu Équipe, préparatifs) ; un personnage déjà recruté gagne une **fusion** (+1 à deux stats, les plus hautes d'abord, jusqu'à +10). En Classique, un personnage mort ne peut plus être invoqué.
- Le projet d'exemple propose « Héros de Lycia » (Rebecca mise en avant) et « Mercenaires de passage » (Cloud, après le chapitre 1), avec cinq personnages à invoquer (Rebecca, Oswin, Matthew, Serra, Dorcas) qui prennent les sprites de leur classe. Menu Debug : « +50 orbes ».

**Recrutement** — Sur la map de camp (mode Unités), section **Équipe de départ**, choisir l'effectif initial (le héros du camp est toujours inclus). Sans réglage explicite, les placements joueur de l'acte de départ servent d'effectif initial. Dans **Unités › Rejoint l'effectif après**, choisir un acte ou un chapitre entier : le personnage est recruté une fois cet objectif terminé. Les placements joueur rejoignent également l'effectif au lancement de leur acte. Placer un PNJ dans le camp ne le recrute pas. Les anciennes sauvegardes retrouvent l'effectif initial et les personnages des actes déjà terminés ; les personnages morts en Classique restent indisponibles. Les préparatifs permettent de choisir les participants parmi cet effectif, sur les cases de départ de chaque acte.

**Chapitres et actes** — Un *acte* est un niveau jouable (map, placements, objectif, dialogues ; placements en mode Unités). Un *chapitre* regroupe des actes dans l'ordre. Les deux se règlent dans le même onglet, **Base de données › Chapitres et actes**. À gauche, un arbre présente les sections Histoire et Évènements ; chaque chapitre se replie (▸ / ▾) et montre ses actes en sous-cases, avec « + Nouvel acte » en dessous. Les actes qui ne sont rangés dans aucun chapitre sont regroupés dans « Actes non rangés ». La recherche trouve un chapitre ou un acte par son nom. Cliquer un chapitre ouvre sa fiche (nom, section, description, conditions et dates de déblocage, ordre des actes avec ▲ ▼). Cliquer un acte ouvre la sienne (objectif, dialogues, or, préparatifs, villages, coffres et portes). En bas, on trouve « + Chapitre », « + Acte » (dans le chapitre sélectionné) et la suppression de l'élément sélectionné : supprimer un chapitre garde ses actes. Les actes rangés dans aucun chapitre (anciens projets) s'affichent chacun comme un chapitre d'un seul acte au tableau des quêtes. Les conditions « disponible après » acceptent un chapitre entier ou un acte précis. Fichier : `data/arcs.json`.

**Maps de chapitre et maps de camp** — Le panneau Projet sépare les **Maps de chapitre** (avec leurs actes) et les **Maps de camp** ; chaque section a son bouton +. Le type d'une map se change dans son inspecteur. Le camp se règle directement sur sa map : ouvrir la map de camp en mode **Unités (F3)**.
- **Palette (à gauche)** : les repères (départ du héros, tableau des quêtes, marchand, lieux ajoutés par les plugins comme l'autel d'invocation) et les personnages présents. On choisit un repère, puis on clique sur la map pour le placer. « Ajouter » met un personnage au camp ; un clic droit sur lui le retire.
- **Inspecteur (à droite)** : nom, héros, or de départ, musique, bouton *Tester le camp*. Pour le personnage sélectionné : le chapitre après lequel il arrive. Puis les **conversations** du camp (cliquer pour les modifier dans une fenêtre : personnage, chapitre à terminer avant, personnages vivants requis, affinité et orbes gagnées, une seule fois, dialogue « Nom: texte »), l'**équipe de départ**, la **boutique** et l'**autel**.

Si le projet a plusieurs maps de camp, une seule est utilisée par le jeu (« Utiliser comme camp du jeu »). Tout cela est annulable (Ctrl+Z). Les chapitres et leurs actes se règlent dans Base de données › **Chapitres et actes** (section, conditions, **dates réelles**, or à la victoire, rejouable). Sans lobby (case décochée), les chapitres s'enchaînent comme avant.

## Plugins

**Base de données › Plugins** liste les plugins installés dans le projet et ceux fournis avec Tactical Emblem (dossier `plugins/` de l'application). **Installer dans le projet** :
- copie les ressources du plugin dans `ressources/` du projet, sans rien écraser ;
- range sa fiche et ses scripts dans `<projet>/plugins/<id>/` ;
- relie ses images aux classes, aux terrains (fonds de combat) et aux personnages de la série déjà présents, sur les champs vides seulement.

**Installer depuis un dossier…** prend n'importe quel dossier qui contient un `plugin.json`. Dans la fiche d'un plugin installé :
- **Activé** : décoché, ses scripts ne tournent plus et l'import des personnages ne prend plus ses images ;
- **Relier à la base** : refait les liens ;
- **Désinstaller** : retire la fiche et les scripts ; les images déjà copiées restent dans `ressources/`.

Plugins fournis dans le dépôt :
- `invocations` : le gacha façon Fire Emblem Heroes (voir **Invocations (plugin)** plus haut) ; c'est aussi l'exemple complet d'un plugin qui ajoute un système au jeu.

Les fonds de combat de Fire Emblem 6 font maintenant partie des ressources de base (voir **Fonds de combat**).

Un petit exemple de script (annonce des tours, ennemis vaincus) est dans `test/fixtures/exemple-annonce-tours/`.

Les plugins de ressources Fire Emblem (sprites de `fe6-binding-blade`, `fe7-blazing-blade`, `fe8-sacred-stones`, `customs-style-gba`) ne sont plus dans le dépôt. Ce sont des rips (The Spriters Resource) de Nintendo / Intelligent Systems et de Square Enix, pour un usage personnel. Pour les refaire à partir des planches de `tools/sprite-sources/fe-gba/` :
- `python3 tools/build_fe_gba_pack.py` découpe les planches (réglages dans `tools/fe_gba_overrides.py`, `--preview dossier` pour les aperçus numérotés) ;
- `tools/split_fe_gba_plugins.py` les range par jeu dans `plugins/`.

On les installe ensuite avec **Installer depuis un dossier…**.

**Créer un plugin** — un dossier avec un `plugin.json` :

```json
{
 "id": "mon-plugin", "name": "Mon plugin", "version": "1.0.0", "kind": "mixte",
 "description": "…", "author": "…",
 "ressources": "ressources",
 "links": {
  "characters": { "fe7:Guy": { "portrait": "ressources/personnages/Guy/portrait.png", "battler": "ressources/personnages/Guy/combat_Myrmidon" } },
  "classes": { "archer": { "battler": "ressources/personnages/Archer/combat_FE7", "mapSprite": "ressources/personnages/Archer/map_FE7Male" } },
  "battlebacks": { "plain": "ressources/fonds-combat/ma-plaine.png" }
 },
 "scripts": ["main.js"],
 "styles": ["style.css"]
}
```

`kind` vaut `ressources`, `script` ou `mixte`. `ressources/` reprend l'arborescence d'un projet (`personnages/<Nom>/`, `fonds-combat/`, `tilesets/`, `musiques/`…). `links` est facultatif : `characters` utilise les clés « jeu:Nom » du pack de personnages de la série, `classes` les identifiants de classes, `battlebacks` les identifiants de terrains.

**Scripts** — chargés (avec les feuilles de style de `styles`) dans l'éditeur à l'ouverture du projet ou dès l'installation, et dans le jeu au lancement, seulement pour les plugins activés :

```js
TacticalEmblem.register('mon-plugin', {
  setup(api) { /* éditeur et jeu : ajouts communs */ },
  editor(api) { /* dans l'éditeur, à chaque ouverture du projet */ },
  game(api) { api.toast('Mon plugin est actif'); }
});
TacticalEmblem.on('turn:start', (e, api) => { if (e.phase === 'player') api.toast('Tour ' + e.turn); });
```

Événements : `game:start`, `campaign:new` { campaign }, `chapter:start` { chapter }, `turn:start` { phase, turn }, `combat:end` { attacker, defender, result }, `unit:defeated` { unit }, `chapter:victory` { chapter }, `lobby:enter` { campaign }, `lobby:talk` { talk, unit, campaign, float }. `api` donne `id`, `where` ('editor' ou 'game'), `project`, `meta`, `db`, `state` (la partie en cours), `toast(texte)`, `on(événement, fn)` (gestionnaire coupé quand le plugin est désactivé) et `extend(type, clé, définition)` pour ajouter au noyau :

| type | ajoute | définition |
|---|---|---|
| `dbTab` | un onglet-liste dans la base de données | `{ key, label, after, list(), prefix, create(), fields(item), sub(item) }` |
| `fields` | des champs à une fiche | `{ tab: 'units' \| 'talks' \| 'chapters', after: 'clé', fields(item) }` |
| `system` | une section de Système | `{ label, prepare(meta), fields(meta) }` |
| `action` | une action d'événement | `{ type, plugin, label, defaults, fields(a), validate(a, db), run(a, ctx) }` |
| `lobbyPlace` | un lieu du camp (placé sur la map de camp) | `{ key, name, label, color, help, enabled(meta), open(ctx), menuSub(ctx) }` |
| `currency` | une monnaie affichée au camp | `{ label(campaign), enabled(meta, cfg) }` |
| `chapterReward` | une récompense de victoire | `{ amount(acte, déjàFini), grant(campaign, n), text(n) }` |
| `unitModifier` | une retouche des unités chargées | `(unit, fiche, campaign) => {}` |
| `debug` | un bouton du menu Debug | `{ label, run(ctx) }` |
| `hook` | une réaction du noyau | `{ name: 'fePack:installed' \| 'db:deleted', fn(données) }` |

Les données d'un plugin se rangent dans la base (`db.<clé>` est enregistré dans `data/<clé>.json`), dans `meta` ou dans la campagne ; elles restent quand le plugin est désactivé. `plugins/invocations/main.js` utilise presque tous ces points d'extension. Un script qui plante est signalé dans la console sans arrêter le jeu. Un script a les mêmes droits que l'éditeur : n'installe que des plugins de confiance.

## Affinités (soutiens) et épilogue

**Affinités, dans la fiche des unités** (Base de données › Unités › Affinités) — Une paire par partenaire, dépliable : partenaire, points au départ, rang maximum (A ou S), attaque spéciale, attaque duo, une conversation par rang et le texte de fin du couple ; « ＋ Nouvelle affinité avec… » en ajoute une. Six paires sont fournies : Xarrin ♥ Eliwood, Xarrin ♥ Lyn, Eliwood ♥ Lyn, Eliwood ♥ Hector, Hector ♥ Lyn, Lyn ♥ Cloud.

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

**Interface** : thème « Soft Dark » repris des jetons de [Soft Dark UI](https://github.com/Otaku17/soft-dark-ui) (licence MIT, voir `src/renderer/soft-dark.css`) ; police [Inter](https://github.com/rsms/inter) (SIL OFL 1.1). Thème « FF9 » de l'interface de combat : *FF9 Inspired Battle Screen* de **Cynon** (dépôt FE-Repo, libre de modification ; planches dans `tools/ui-ff9/`). Chiffres des dégâts, bandeau des compétences, bulle de conversation, icônes d'armes des invocations, pièce d'or et orbe d'invocation : éléments de *Fire Emblem Heroes* (Nintendo / Intelligent Systems), découpés par `tools/build_ui_feh.py` depuis `tools/ui-feh/`. Annonces de phase : **Lukiroh** ; flèche de déplacement : **Squidjees** (FE-Repo, libres de modification) ; fond des écrans sans décor : fourni avec ces pièces (`tools/ui-popups/`). Barres, main-curseur, cadre PLAYTIME et chiffres des sauvegardes : menus de *Fire Emblem* GBA (Nintendo / Intelligent Systems), `tools/ui-save/`. Fond de la fiche de personnage : interface des statuts de *Fire Emblem : Radiant Dawn* (Nintendo / Intelligent Systems), `tools/ui-radiant/`. Planches des animations d'attaque (`ressources/animations/heroes`) : effets de *Fire Emblem Heroes* (Nintendo / Intelligent Systems). Icônes de compétences : planches *Skills* de *Fire Emblem Heroes* (Nintendo / Intelligent Systems), copiées et indexées par `tools/build_skill_icons.py`.

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
src/shared/plugins.js      plugins : fiches plugin.json, liens vers la base — testé dans test/plugins.test.js
src/main/plugins-io.js     plugins fournis (plugins/), installation / désinstallation dans un projet
src/renderer/title-screen.js  écran titre du jeu (Jouer, Crédits, Quitter)
src/renderer/plugin-runtime.js  scripts des plugins (TacticalEmblem.register / on), chargés dans l'éditeur et le jeu
src/shared/extensions.js   points d'extension des plugins (onglets, champs, actions, lieux du camp, récompenses…)
plugins/invocations/       plugin Invocations : summon.js (taux, pitié, cercle de pierres, fusions — test/summon.test.js),
                           summon-panel.js (autel du camp), main.js (branchement sur le noyau), summon.css
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
src/shared/scenario.js     déclencheurs, conditions, mémoire et séquencement des événements — testés dans test/scenario.test.js
src/renderer/event-fields.js éditeur des événements et de leurs actions
src/renderer/scenario-runtime.js actions de scénario dans le playtest
src/renderer/settings-window.js  fenêtre Paramètres du playtest (sauvegarde, chargement, son, debug)
src/main/campaign-io.js    emplacements de sauvegarde (saves/slot-N.json)
src/renderer/lobby-scene.js  lobby jouable dans le playtest (déplacements, panneaux chapitres / boutique, conversations)
src/shared/palettes.js     couleurs d'équipe (détection, recoloration, réglage origine / équipe) — testées dans test/palettes.test.js
src/shared/rules.js        règles du jeu (combat, déplacement, IA, exp) — testées dans test/run.js
src/shared/statuses.js     poison, sommeil, silence, durées, soins et validation — testés dans test/statuses.test.js
src/renderer/status-fields.js réglage des altérations et soins des armes/bâtons dans l'éditeur
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
test/snapshot-scenario.js   événements de bout en bout (édition, choix, coffre, embuscade, porte, objectif, récompenses en attente, reprise et sauvegarde)
test/snapshot-statuses.js   altérations de bout en bout (éditeur, soins, bâtons, combats animés/map, durée, expiration et reprise)
test/snapshot-ressources.js  conversion d'un ancien projet, onglet Ressources, couleurs en jeu (TF_OLD_PROJECT=dossier pour tester un vrai projet)
```

**Compétences en jeu** — Précision, Esquive, Offensive et Garde modifient les calculs lorsque leurs conditions sont remplies. Présence rassurante protège les autres alliés à portée (y compris les unités vertes) ; seule l’aura d’esquive la plus forte s’applique. Régénération soigne au début de la phase du porteur, avant le soin du terrain, sans ressusciter les unités vaincues. Luna ignore une partie de la Défense / Résistance et du terrain ; Sol soigne sur les PV réellement retirés ; Vantage place la première riposte avant l’attaque ennemie ; Miracle permet de survivre à 1 PV, mais ne protège pas un nouveau coup commencé à 1 PV. Les prévisions affichent les dégâts hors déclenchements et les probabilités séparément. Un seul effet offensif peut se déclencher par coup : priorité à l’attaque spéciale d’affinité, puis Luna, puis Sol. Les attaques duo utilisent les passifs et les protections de la cible, sans Luna/Sol du partenaire. Les déclenchements et soins sont visibles dans les animations comme sur la map.

## Pistes pour la suite

Priorités suivantes : animations des classes génériques, sauvegarde en milieu de bataille et export d'un jeu jouable autonome. Les climats tactiques et le brouillard de guerre, événements à actions et choix mémorisés, villages, coffres, portes, échanges en bataille, promotions à embranchements, la gestion de l'équipe au camp et l'écran de préparation avant bataille sont disponibles. Le recrutement reste centré sur les invocations ; l'action Parler/recruter n'est pas prioritaire. La proposition complète et l'état des lots sont dans `docs/proposition-systemes-fire-emblem.md`.
