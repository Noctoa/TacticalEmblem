#!/usr/bin/env python3
"""
Classes officielles de la série Fire Emblem → pack « Classes de la série » (src/shared/fe-classes-data.js).

  python3 tools/build_fe_classes.py

Sources : tools/fe-classes/data/<jeu>_base.csv, _growth.csv, _caps.csv (tableaux de Serenes Forest, serenesforest.net,
relevés classe par classe). Ce script y ajoute ce que les tableaux ne donnent pas (armes, type de déplacement, palier,
promotions) et ramène chaque jeu aux 8 stats du moteur :
  - GBA (FE6-8) : « Pow » (Force/Magie) va en Magie pour les classes magiques, sinon en Force ; Chance de base 0 ;
    croissances = croissances de classe des unités génériques.
  - FE9-10, Awakening, Fates, Engage : Dex → Technique ; Construction / Charme ignorés.
  - Three Houses : les classes n'ont que des modificateurs de croissance (ajoutés aux croissances du personnage dans le
    jeu) : croissance = modificateur + taux de référence (PV 40 %, autres 30 %) ; pas de plafond de classe → 99 / 70.
  - FE10 : quelques classes sans croissances relevées reprennent celles de la classe la plus proche de leur lignée.
Les armes absentes du moteur sont ramenées au type le plus proche : dagues, couteaux, shurikens → épée ; massues → hache ;
naginata → lance ; yumi → arc ; poings / arts → hache ; parchemins et tomes → anima (tomes de Nohr et noirs → ténèbres).
Classes non reprises : transformations (laguz, manaketes, taguels, kitsune, loups), monstres, civils, transporteurs,
classes uniques de boss.
"""
import csv, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'tools', 'fe-classes', 'data')
OUT = os.path.join(ROOT, 'src', 'shared', 'fe-classes-data.js')
STATS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res']
W = {'S': 'sword', 'L': 'lance', 'A': 'axe', 'B': 'bow', 'N': 'anima', 'Li': 'light', 'D': 'dark', 'St': 'staff'}
MV = {'f': 'foot', 'h': 'horse', 'ar': 'armor', 'fl': 'flier'}

GAMES = [
    ('fe6', 'FE6 — The Binding Blade', 'gba'), ('fe7', 'FE7 — The Blazing Blade', 'gba'), ('fe8', 'FE8 — The Sacred Stones', 'gba'),
    ('fe9', 'FE9 — Path of Radiance', 'sep'), ('fe10', 'FE10 — Radiant Dawn', 'sep'),
    ('fe13', 'FE13 — Awakening', 'sep'), ('fe14', 'FE14 — Fates', 'sep'),
    ('fe16', 'FE16 — Three Houses', '3h'), ('fe17', 'FE17 — Engage', 'engage'),
]

# ---------------------------------------------------------------------------------------------------------------
# Détails par classe : 'Nom': (armes, déplacement, palier, [promotions]) ; « * » dans une promotion = même variante
# (M)/(F) que la classe de départ si elle existe.
# ---------------------------------------------------------------------------------------------------------------
GBA_COMMON = {
    'Soldier': ('L', 'f', 1, []), 'Cavalier': ('S L', 'h', 1, ['Paladin*']), 'Paladin': ('S L A', 'h', 2, []),
    'Knight': ('L', 'ar', 1, ['General*']), 'General': ('L A', 'ar', 2, []), 'Mercenary': ('S', 'f', 1, ['Hero*']), 'Hero': ('S A', 'f', 2, []),
    'Myrmidon': ('S', 'f', 1, ['Swordmaster*']), 'Swordmaster': ('S', 'f', 2, []), 'Thief': ('S', 'f', 1, ['Assassin*']), 'Assassin': ('S', 'f', 2, []),
    'Archer': ('B', 'f', 1, ['Sniper*']), 'Sniper': ('B', 'f', 2, []), 'Nomad': ('B', 'h', 1, ['Nomad Trooper*']), 'Nomad Trooper': ('S B', 'h', 2, []),
    'Wyvern Rider': ('L', 'fl', 1, ['Wyvern Lord*']), 'Wyvern Lord': ('L S', 'fl', 2, []), 'Mage': ('N', 'f', 1, ['Sage*']), 'Sage': ('N St', 'f', 2, []),
    'Monk': ('Li', 'f', 1, ['Bishop (M)']), 'Cleric': ('St', 'f', 1, ['Bishop (F)']), 'Priest': ('St', 'f', 1, ['Bishop*']), 'Bishop': ('Li St', 'f', 2, []),
    'Shaman': ('D', 'f', 1, ['Druid*']), 'Druid': ('D St', 'f', 2, []), 'Fighter': ('A', 'f', 1, ['Warrior']), 'Warrior': ('A B', 'f', 2, []),
    'Brigand': ('A', 'f', 1, ['Berserker']), 'Pirate': ('A', 'f', 1, ['Berserker']), 'Corsair': ('A', 'f', 1, ['Berserker']), 'Berserker': ('A', 'f', 2, []),
    'Pegasus Knight': ('L', 'fl', 1, []), 'Falcoknight': ('L S', 'fl', 2, []), 'Falcon Knight': ('L S', 'fl', 2, []),
    'Troubadour': ('St', 'h', 1, []), 'Valkyrie': ('St N', 'h', 2, []), 'Valkyria': ('St N', 'h', 2, []),
    'Dancer': ('', 'f', 1, []), 'Bard': ('', 'f', 1, []),
}
META = {
    'fe6': dict(GBA_COMMON, **{
        'Lord': ('S', 'f', 1, ['Master Lord']), 'Master Lord': ('S', 'h', 2, []), 'Thief': ('S', 'f', 1, []),
        'Pegasus Knight': ('L', 'fl', 1, ['Falcon Knight']), 'Troubadour': ('St', 'h', 1, ['Valkyria']),
    }),
    'fe7': dict(GBA_COMMON, **{
        'Lord (Lyn)': ('S', 'f', 1, ['Blade Lord']), 'Lord (Eliwood)': ('S', 'f', 1, ['Knight Lord']), 'Lord (Hector)': ('A', 'f', 1, ['Great Lord']),
        'Blade Lord': ('S B', 'h', 2, []), 'Knight Lord': ('S L', 'h', 2, []), 'Great Lord': ('A S', 'ar', 2, []),
        'Pegasus Knight': ('L', 'fl', 1, ['Falcoknight']), 'Troubadour': ('St', 'h', 1, ['Valkyrie']),
    }),
    'fe8': dict(GBA_COMMON, **{
        'Lord (Ephraim)': ('L', 'f', 1, ['Great Lord (Ephraim)']), 'Lord (Eirika)': ('S', 'f', 1, ['Great Lord (Eirika)']),
        'Great Lord (Ephraim)': ('L', 'h', 2, []), 'Great Lord (Eirika)': ('S', 'h', 2, []),
        'Cavalier': ('S L', 'h', 1, ['Paladin*', 'Great Knight*']), 'Knight': ('L', 'ar', 1, ['General*', 'Great Knight*']), 'Great Knight': ('S L A', 'h', 2, []),
        'Mercenary': ('S', 'f', 1, ['Hero*', 'Ranger*']), 'Myrmidon': ('S', 'f', 1, ['Swordmaster*', 'Assassin*']),
        'Thief': ('S', 'f', 1, ['Assassin (M)', 'Rogue']), 'Rogue': ('S', 'f', 2, []), 'Archer': ('B', 'f', 1, ['Sniper*', 'Ranger*']), 'Ranger': ('S B', 'h', 2, []),
        'Wyvern Rider': ('L', 'fl', 1, ['Wyvern Lord*', 'Wyvern Knight*']), 'Wyvern Knight': ('L', 'fl', 2, []),
        'Mage': ('N', 'f', 1, ['Sage*', 'Mage Knight*']), 'Mage Knight': ('N St', 'h', 2, []),
        'Monk': ('Li', 'f', 1, ['Bishop (M)', 'Sage (M)']), 'Priest': ('St', 'f', 1, ['Bishop (M)', 'Sage (M)']), 'Cleric': ('St', 'f', 1, ['Bishop (F)', 'Valkyrie']),
        'Shaman': ('D', 'f', 1, ['Druid*', 'Summoner*']), 'Summoner': ('D St', 'f', 2, []), 'Fighter': ('A', 'f', 1, ['Warrior', 'Hero (M)']),
        'Pirate': ('A', 'f', 1, ['Berserker', 'Warrior']), 'Brigand': ('A', 'f', 1, []),
        'Pegasus Knight': ('L', 'fl', 1, ['Falcoknight', 'Wyvern Knight (F)']), 'Troubadour': ('St', 'h', 1, ['Valkyrie', 'Mage Knight (F)']),
        'Journeyman': ('A', 'f', 0, ['Fighter', 'Pirate']), 'Recruit': ('L', 'f', 0, ['Cavalier (M)', 'Knight (M)']), 'Pupil': ('N', 'f', 0, ['Mage (M)', 'Shaman (M)']),
        'Necromancer': ('D N Li St', 'f', 2, []),
    }),
    'fe9': {
        'Ranger': ('S', 'f', 1, ['Lord']), 'Lord': ('S', 'f', 2, []), 'Hero': ('S A', 'f', 2, []),
        'Myrmidon': ('S', 'f', 1, ['Swordmaster*']), 'Swordmaster': ('S', 'f', 2, []), 'Soldier': ('L', 'f', 1, ['Halberdier*']), 'Halberdier': ('L', 'f', 2, []),
        'Fighter': ('A', 'f', 1, ['Warrior']), 'Warrior': ('A B', 'f', 2, []), 'Archer': ('B', 'f', 1, ['Sniper']), 'Sniper': ('B', 'f', 2, []),
        'Knight': ('L', 'ar', 1, ['General']), 'General': ('S L', 'ar', 2, []), 'Horse Knight': ('S L A B', 'h', 1, ['Paladin*']), 'Paladin': ('S L A B', 'h', 2, []),
        'Pegasus Knight': ('L', 'fl', 1, ['Falcon Knight']), 'Falcon Knight': ('S L', 'fl', 2, []), 'Wyvern Rider': ('L', 'fl', 1, ['Wyvern Lord*']), 'Wyvern Lord': ('L A', 'fl', 2, []),
        'Mage': ('N', 'f', 1, ['Sage*']), 'Sage': ('N St', 'f', 2, []), 'Priest': ('St', 'f', 1, ['Bishop (M)']), 'Cleric': ('St', 'f', 1, ['Valkyrie']),
        'Bishop': ('Li St', 'f', 2, []), 'Valkyrie': ('S St', 'h', 2, []), 'Thief': ('S', 'f', 1, ['Assassin (M)']), 'Assassin': ('S', 'f', 2, []),
        'Bandit': ('A', 'f', 1, ['Berserker']), 'Berserker': ('A', 'f', 2, []),
    },
    'fe10': {
        'Light Mage': ('Li', 'f', 1, ['Light Sage']), 'Light Sage': ('Li St', 'f', 2, ['Light Priestess']), 'Light Priestess': ('Li St', 'f', 3, []),
        'Thief': ('S', 'f', 1, ['Rogue']), 'Rogue': ('S', 'f', 2, ['Whisper']), 'Whisper': ('S', 'f', 3, []),
        'Myrmidon': ('S', 'f', 1, ['Swordmaster']), 'Swordmaster': ('S', 'f', 2, ['Trueblade']), 'Trueblade': ('S', 'f', 3, []),
        'Soldier': ('L', 'f', 1, ['Halberdier']), 'Halberdier': ('L', 'f', 2, ['Sentinel']), 'Sentinel': ('L', 'f', 3, []),
        'Fighter': ('A', 'f', 1, ['Warrior']), 'Warrior': ('A B', 'f', 2, ['Reaver']), 'Reaver': ('A B', 'f', 3, []),
        'Archer': ('B', 'f', 1, ['Sniper']), 'Sniper': ('B', 'f', 2, ['Marksman']), 'Marksman': ('B', 'f', 3, []),
        'Armor Sword': ('S', 'ar', 1, ['Sword General']), 'Sword General': ('S', 'ar', 2, ['Marshall']),
        'Armor Lance': ('L', 'ar', 1, ['Lance General']), 'Lance General': ('L', 'ar', 2, ['Marshall']),
        'Armor Axe': ('A', 'ar', 1, ['Axe General']), 'Axe General': ('A', 'ar', 2, ['Marshall']), 'Marshall': ('S L A', 'ar', 3, []),
        'Sword Knight': ('S', 'h', 1, ['Blade Paladin']), 'Blade Paladin': ('S', 'h', 2, ['Gold Knight']), 'Gold Knight': ('S A', 'h', 3, []),
        'Lance Knight': ('L', 'h', 1, ['Lance Paladin']), 'Lance Paladin': ('L', 'h', 2, ['Silver Knight']), 'Silver Knight': ('L B', 'h', 3, []),
        'Axe Knight': ('A', 'h', 1, ['Axe Paladin']), 'Axe Paladin': ('A', 'h', 2, ['Gold Knight']),
        'Bow Knight': ('B', 'h', 1, ['Bow Paladin']), 'Bow Paladin': ('B', 'h', 2, ['Silver Knight']),
        'Pegasus Knight': ('L', 'fl', 1, ['Falcon Knight']), 'Falcon Knight': ('L S', 'fl', 2, ['Seraph Knight']), 'Seraph Knight': ('L S St', 'fl', 3, []),
        'Dracoknight': ('L', 'fl', 1, ['Dragonmaster']), 'Dragonmaster': ('L A', 'fl', 2, ['Dragonlord']), 'Dragonlord': ('L A', 'fl', 3, []),
        'Priest': ('St', 'f', 1, ['Bishop']), 'Bishop': ('Li St', 'f', 2, ['Saint']), 'Saint': ('Li St', 'f', 3, []),
        'Fire Mage': ('N', 'f', 1, ['Fire Sage']), 'Fire Sage': ('N St', 'f', 2, ['Arch Sage']),
        'Thunder Mage': ('N', 'f', 1, ['Thunder Sage']), 'Thunder Sage': ('N St', 'f', 2, ['Arch Sage']),
        'Wind Mage': ('N', 'f', 1, ['Wind Sage']), 'Wind Sage': ('N St', 'f', 2, ['Arch Sage']), 'Arch Sage': ('N Li St', 'f', 3, []),
        'Dark Sage': ('D', 'f', 2, ['Summoner']), 'Druid': ('D St', 'f', 2, ['Summoner']), 'Summoner': ('D St', 'f', 3, []),
        'Hero': ('S', 'f', 2, ['Vanguard']), 'Vanguard': ('S A', 'f', 3, []), 'Cleric': ('St', 'f', 2, ['Valkyrie']), 'Valkyrie': ('St S', 'h', 3, []),
        'Bandit': ('A', 'f', 1, []),
    },
    'fe13': {
        'Lord': ('S', 'f', 1, ['Great Lord*']), 'Great Lord': ('S L', 'f', 2, []), 'Tactician': ('S N', 'f', 1, ['Grandmaster']), 'Grandmaster': ('S N', 'f', 2, []),
        'Cavalier': ('S L', 'h', 1, ['Paladin', 'Great Knight']), 'Paladin': ('S L', 'h', 2, []), 'Great Knight': ('S L A', 'h', 2, []),
        'Knight': ('L', 'ar', 1, ['General', 'Great Knight']), 'General': ('L A', 'ar', 2, []),
        'Myrmidon': ('S', 'f', 1, ['Swordmaster', 'Assassin']), 'Swordmaster': ('S', 'f', 2, []), 'Mercenary': ('S', 'f', 1, ['Hero', 'Bow Knight']), 'Hero': ('S A', 'f', 2, []),
        'Fighter': ('A', 'f', 1, ['Warrior', 'Hero']), 'Warrior': ('A B', 'f', 2, []), 'Barbarian': ('A', 'f', 1, ['Berserker', 'Warrior']), 'Berserker': ('A', 'f', 2, []),
        'Archer': ('B', 'f', 1, ['Sniper', 'Bow Knight']), 'Sniper': ('B', 'f', 2, []), 'Bow Knight': ('S B', 'h', 2, []),
        'Thief': ('S', 'f', 1, ['Assassin', 'Trickster']), 'Assassin': ('S B', 'f', 2, []), 'Trickster': ('S St', 'f', 2, []),
        'Pegasus Knight': ('L', 'fl', 1, ['Falcon Knight', 'Dark Flier']), 'Falcon Knight': ('L St', 'fl', 2, []), 'Dark Flier': ('L N', 'fl', 2, []),
        'Wyvern Rider': ('A', 'fl', 1, ['Wyvern Lord', 'Griffon Rider']), 'Wyvern Lord': ('L A', 'fl', 2, []), 'Griffon Rider': ('A', 'fl', 2, []),
        'Mage': ('N', 'f', 1, ['Sage', 'Dark Knight']), 'Sage': ('N St', 'f', 2, []), 'Dark Mage': ('D', 'f', 1, ['Sorcerer', 'Dark Knight']), 'Sorcerer': ('D', 'f', 2, []),
        'Dark Knight': ('S N', 'h', 2, []), 'Cleric': ('St', 'f', 1, ['War Monk', 'Sage']), 'War Monk': ('A St', 'f', 2, []),
        'Troubadour': ('St', 'h', 1, ['Valkyrie', 'War Monk']), 'Valkyrie': ('N St', 'h', 2, []), 'Villager': ('L', 'f', 1, []), 'Dancer': ('S', 'f', 1, []),
        'Lodestar': ('S', 'f', 2, []), 'Dread Fighter': ('S A N', 'f', 2, []), 'Bride': ('L B St', 'f', 2, []), 'Conqueror': ('S L A', 'h', 2, []),
    },
    'fe14': {
        'Hoshido Noble': ('S St', 'f', 2, []), 'Samurai': ('S', 'f', 1, ['Swordmaster', 'Master of Arms']), 'Swordmaster': ('S', 'f', 2, []), 'Master of Arms': ('S L A', 'f', 2, []),
        'Oni Savage': ('A', 'f', 1, ['Oni Chieftain', 'Blacksmith']), 'Oni Chieftain': ('A N', 'f', 2, []), 'Blacksmith': ('S A', 'f', 2, []),
        'Spear Fighter': ('L', 'f', 1, ['Spear Master', 'Basara']), 'Spear Master': ('L', 'f', 2, []), 'Basara': ('L N', 'f', 2, []),
        'Diviner': ('N', 'f', 1, ['Onmyoji', 'Basara']), 'Onmyoji': ('N St', 'f', 2, []), 'Monk': ('St', 'f', 1, ['Great Master', 'Priestess', 'Onmyoji']),
        'Great Master': ('L St', 'f', 2, []), 'Priestess': ('B St', 'f', 2, []), 'Sky Knight': ('L', 'fl', 1, ['Falcon Knight', 'Kinshi Knight']),
        'Falcon Knight': ('L St', 'fl', 2, []), 'Kinshi Knight': ('L B', 'fl', 2, []), 'Archer': ('B', 'f', 1, ['Sniper', 'Kinshi Knight']), 'Sniper': ('B', 'f', 2, []),
        'Ninja': ('S', 'f', 1, ['Master Ninja', 'Mechanist']), 'Master Ninja': ('S', 'f', 2, []), 'Mechanist': ('S B', 'h', 2, []),
        'Apothecary': ('B', 'f', 1, ['Merchant', 'Mechanist']), 'Merchant': ('L B', 'f', 2, []), 'Songstress': ('L', 'f', 1, []), 'Villager': ('L', 'f', 1, ['Master of Arms', 'Merchant']),
        'Nohr Prince': ('S', 'f', 1, ['Hoshido Noble', 'Nohr Noble']), 'Nohr Noble': ('S D', 'f', 2, []),
        'Cavalier': ('S L', 'h', 1, ['Paladin', 'Great Knight']), 'Paladin': ('S L', 'h', 2, []), 'Great Knight': ('S L A', 'h', 2, []),
        'Knight': ('L', 'ar', 1, ['General', 'Great Knight']), 'General': ('L A', 'ar', 2, []), 'Fighter': ('A', 'f', 1, ['Berserker', 'Hero']), 'Berserker': ('A', 'f', 2, []),
        'Mercenary': ('S', 'f', 1, ['Hero', 'Bow Knight']), 'Hero': ('S A', 'f', 2, []), 'Bow Knight': ('S B', 'h', 2, []),
        'Outlaw': ('B', 'f', 1, ['Adventurer', 'Bow Knight']), 'Adventurer': ('B St', 'f', 2, []),
        'Wyvern Rider': ('A', 'fl', 1, ['Wyvern Lord', 'Malig Knight']), 'Wyvern Lord': ('L A', 'fl', 2, []), 'Malig Knight': ('A D', 'fl', 2, []),
        'Dark Mage': ('D', 'f', 1, ['Sorcerer', 'Dark Knight']), 'Sorcerer': ('D', 'f', 2, []), 'Dark Knight': ('S D', 'h', 2, []),
        'Troubadour': ('St', 'h', 1, ['Strategist', 'Butler']), 'Strategist': ('D St', 'h', 2, []), 'Butler': ('S St', 'f', 2, []),
    },
    'fe16': {
        'Myrmidon': ('S', 'f', 1, ['Mercenary', 'Thief']), 'Soldier': ('L', 'f', 1, ['Cavalier', 'Armored Knight', 'Pegasus Knight']),
        'Fighter': ('A B', 'f', 1, ['Brigand', 'Archer', 'Brawler', 'Armored Knight']), 'Monk': ('N', 'f', 1, ['Mage', 'Dark Mage', 'Priest']),
        'Lord': ('S', 'f', 2, ['High Lord', 'Armored Lord', 'Wyvern Master']), 'Mercenary': ('S', 'f', 2, ['Hero', 'Swordmaster']), 'Thief': ('S', 'f', 2, ['Assassin', 'Trickster']),
        'Armored Knight': ('L A', 'ar', 2, ['Fortress Knight']), 'Cavalier': ('L', 'h', 2, ['Paladin']), 'Brigand': ('A', 'f', 2, ['Warrior']), 'Archer': ('B', 'f', 2, ['Sniper']),
        'Brawler': ('A', 'f', 2, ['Grappler']), 'Mage': ('N', 'f', 2, ['Warlock']), 'Dark Mage': ('D', 'f', 2, ['Dark Bishop']), 'Priest': ('Li St', 'f', 2, ['Bishop', 'War Monk', 'Valkyrie']),
        'Pegasus Knight': ('L', 'fl', 2, ['Falcon Knight', 'Dark Flier']), 'Hero': ('S A', 'f', 3, ['Mortal Savant']), 'Swordmaster': ('S', 'f', 3, ['Mortal Savant']),
        'Assassin': ('S B', 'f', 3, []), 'Fortress Knight': ('L A', 'ar', 3, ['Great Knight']), 'Paladin': ('L S', 'h', 3, ['Great Knight', 'Bow Knight']),
        'Wyvern Rider': ('A L', 'fl', 3, ['Wyvern Lord']), 'Warrior': ('A B', 'f', 3, ['War Master']), 'Sniper': ('B', 'f', 3, ['Bow Knight']), 'Grappler': ('A', 'f', 3, ['War Master']),
        'Warlock': ('N', 'f', 3, ['Gremory', 'Dark Knight', 'Mortal Savant']), 'Dark Bishop': ('D', 'f', 3, ['Gremory', 'Dark Knight']), 'Bishop': ('Li St', 'f', 3, ['Holy Knight', 'Gremory']),
        'Falcon Knight': ('L S', 'fl', 4, []), 'Wyvern Lord': ('A L', 'fl', 4, []), 'Mortal Savant': ('S N', 'f', 4, []), 'Great Knight': ('L A', 'h', 4, []),
        'Bow Knight': ('B L', 'h', 4, []), 'Dark Knight': ('D L', 'h', 4, []), 'Holy Knight': ('Li St L', 'h', 4, []), 'War Master': ('A', 'f', 4, []), 'Gremory': ('N D Li St', 'f', 4, []),
        'Trickster': ('S St', 'f', 3, []), 'War Monk': ('A St', 'f', 3, []), 'Dark Flier': ('L N', 'fl', 3, []), 'Valkyrie': ('N St', 'h', 3, []),
        'Enlightened One': ('S', 'f', 4, []), 'Armored Lord': ('L A', 'ar', 3, ['Emperor']), 'High Lord': ('S', 'f', 3, ['Great Lord']), 'Wyvern Master': ('A L B', 'fl', 3, ['Barbarossa']),
        'Emperor': ('A S', 'ar', 4, []), 'Great Lord': ('L', 'f', 4, []), 'Barbarossa': ('B A', 'fl', 4, []),
    },
    'fe17': {
        'Dragon Child': ('S', 'f', 1, ['Divine Dragon']), 'Divine Dragon': ('S', 'f', 2, []), 'Fell Child': ('N', 'f', 1, []),
        'Noble (Alfred)': ('L', 'h', 1, ['Avenir']), 'Avenir': ('L St', 'h', 2, []), 'Noble (Celine)': ('S N', 'f', 1, ['Vidame']), 'Vidame': ('S N St', 'h', 2, []),
        'Lord (Diamant)': ('S', 'f', 1, ['Successeur']), 'Successeur': ('S A', 'f', 2, []), 'Lord (Alcryst)': ('B', 'f', 1, ["Tireur d'elite"]), "Tireur d'elite": ('B S', 'f', 2, []),
        'Wing Tamer (Ivy)': ('N', 'fl', 1, ['Lindwurm']), 'Lindwurm': ('N St', 'fl', 2, []), 'Wing Tamer (Hortensia)': ('St', 'fl', 1, ['Sleipnir Rider']), 'Sleipnir Rider': ('St L', 'fl', 2, []),
        'Sentinel (Timerra)': ('S', 'f', 1, ['Picket']), 'Picket': ('S L', 'f', 2, []), 'Sentinel (Fogado)': ('S', 'f', 1, ['Cupido']), 'Cupido': ('S B', 'h', 2, []),
        'Sword Fighter': ('S', 'f', 1, ['Swordmaster', 'Hero']), 'Swordmaster': ('S', 'f', 2, []), 'Hero': ('S A', 'f', 2, []),
        'Lance Fighter': ('L', 'f', 1, ['Halberdier', 'Royal Knight']), 'Halberdier': ('L', 'f', 2, []), 'Royal Knight': ('L St', 'h', 2, []),
        'Axe Fighter': ('A', 'f', 1, ['Berserker', 'Warrior']), 'Berserker': ('A', 'f', 2, []), 'Warrior': ('A B', 'f', 2, []),
        'Archer': ('B', 'f', 1, ['Sniper', 'Bow Knight']), 'Sniper': ('B', 'f', 2, []), 'Bow Knight': ('B S', 'h', 2, []),
        'Sword Armor': ('S', 'ar', 1, ['General', 'Great Knight']), 'Lance Armor': ('L', 'ar', 1, ['General', 'Great Knight']), 'Axe Armor': ('A', 'ar', 1, ['General', 'Great Knight']),
        'General': ('S L A', 'ar', 2, []), 'Great Knight': ('S L A', 'h', 2, []),
        'Sword Cavalier': ('S', 'h', 1, ['Paladin', 'Wolf Knight']), 'Lance Cavalier': ('L', 'h', 1, ['Paladin', 'Wolf Knight']), 'Axe Cavalier': ('A', 'h', 1, ['Paladin', 'Wolf Knight']),
        'Paladin': ('S L', 'h', 2, []), 'Wolf Knight': ('S L', 'h', 2, []),
        'Mage': ('N', 'f', 1, ['Sage', 'Mage Knight']), 'Sage': ('N St', 'f', 2, []), 'Mage Knight': ('N S', 'h', 2, []),
        'Martial Monk': ('A St', 'f', 1, ['Martial Master', 'High Priest']), 'Martial Master': ('A St', 'f', 2, []), 'High Priest': ('N St', 'f', 2, []),
        'Sword Flier': ('S', 'fl', 1, ['Griffin Knight', 'Wyvern Knight']), 'Lance Flier': ('L', 'fl', 1, ['Griffin Knight', 'Wyvern Knight']), 'Axe Flier': ('A', 'fl', 1, ['Griffin Knight', 'Wyvern Knight']),
        'Griffin Knight': ('S St', 'fl', 2, []), 'Wyvern Knight': ('L A', 'fl', 2, []), 'Thief': ('S', 'f', 1, []), 'Dancer': ('S', 'f', 1, []),
        'Melusine': ('A', 'fl', 2, []), 'Enchanter': ('S', 'f', 2, []), 'Mage Cannoneer': ('B', 'f', 2, []),
    },
}
DANCE = {('fe6', 'Dancer'), ('fe6', 'Bard'), ('fe7', 'Dancer'), ('fe7', 'Bard'), ('fe8', 'Dancer'), ('fe13', 'Dancer'), ('fe14', 'Songstress'), ('fe17', 'Dancer')}
GBA_MAGIC = re.compile(r'^(Mage|Sage|Monk|Cleric|Priest|Bishop|Shaman|Druid|Troubadour|Valkyri[ea]|Archsage|Dark Druid|Pupil|Summoner|Mage Knight|Necromancer)( \(|$)')
FE10_FILL = {'Light Mage': 'Fire Mage', 'Light Sage': 'Fire Sage', 'Light Priestess': 'Arch Sage', 'Trueblade': 'Swordmaster', 'Summoner': 'Druid'}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '_', s.lower().replace("'", '')).strip('_')


def read(game, kind):
    p = os.path.join(DATA, f'{game}_{kind}.csv')
    if not os.path.exists(p): return {}
    with open(p, encoding='utf-8') as f:
        rows = list(csv.reader(f))
    head = [h.strip().lower() for h in rows[0]]
    return {r[0].strip(): {head[i]: r[i].strip() for i in range(1, len(head)) if i < len(r)} for r in rows[1:] if r and r[0].strip()}


def num(v):
    try: return int(float(v))
    except (TypeError, ValueError): return 0


def stats_of(row, game, name, family):
    """Ligne du tableau → 8 stats du moteur."""
    if not row: return None
    if family == 'gba':
        pow_ = num(row.get('pow'))
        magic = bool(GBA_MAGIC.match(name))
        return {'hp': num(row.get('hp')), 'str': 0 if magic else pow_, 'mag': pow_ if magic else 0, 'skl': num(row.get('skl')), 'spd': num(row.get('spd')),
                'lck': num(row.get('lck')), 'def': num(row.get('def')), 'res': num(row.get('res'))}
    g = lambda *ks: next((num(row[k]) for k in ks if k in row and row[k] != ''), 0)
    return {'hp': g('hp'), 'str': g('str'), 'mag': g('mag'), 'skl': g('skl', 'dex'), 'spd': g('spd'), 'lck': g('lck'), 'def': g('def'), 'res': g('res')}


def meta_for(game, name):
    m = META[game]
    if name in m: return m[name]
    base = re.sub(r' \((M|F)\)$', '', name)
    return m.get(base)


def main():
    games = []
    for gid, gname, family in GAMES:
        base, growth, caps = read(gid, 'base'), read(gid, 'growth'), read(gid, 'caps')
        if gid == 'fe16': growth = read(gid, 'growthmod')
        default_cap = caps.get('*')
        classes, missing = [], []
        names = list(base.keys())
        for name in names:
            meta = meta_for(gid, name)
            if not meta: missing.append(name); continue
            weapons, move, tier, promos = meta
            b = stats_of(base[name], gid, name, family)
            gr_row = growth.get(name) or growth.get(re.sub(r' \((M|F)\)$', '', name))
            if gid == 'fe10' and (not gr_row or not any(num(v) for v in gr_row.values())) and name in FE10_FILL: gr_row = growth.get(FE10_FILL[name])
            gr = stats_of(gr_row, gid, name, family) or {k: 0 for k in STATS}
            if gid == 'fe16':  # modificateurs → croissances absolues
                gr = {k: max(0, gr[k] + (40 if k == 'hp' else 30)) for k in STATS}
            cap_row = caps.get(name)
            if not cap_row and default_cap: cap_row = (caps.get('*mage') if family != 'gba' and gid == 'fe9' and ('N' in weapons.split() or 'St' in weapons.split() or 'Li' in weapons.split()) and caps.get('*mage') else default_cap)
            cp = stats_of(cap_row, gid, name, family) if cap_row else None
            if family == 'gba' and cp:  # Pow : même plafond en Force et en Magie
                pw = max(cp['str'], cp['mag']); cp['str'] = cp['mag'] = pw
            if gid == 'fe16': cp = {k: (99 if k == 'hp' else 70) for k in STATS}
            if not cp: cp = {'hp': 60, 'str': 30, 'mag': 30, 'skl': 30, 'spd': 30, 'lck': 30, 'def': 30, 'res': 30}
            mov = num(base[name].get('mov')) or 5
            entry = {'id': f'{gid}_{slug(name)}', 'name': f'{name} · {gid.upper()}', 'game': gid, 'source': name,
                     'moveType': MV[move], 'mov': mov, 'weapons': [W[w] for w in weapons.split()], 'base': b, 'growths': gr, 'caps': cp, 'tier': tier, 'promoteTo': promos}
            if (gid, re.sub(r' \((M|F)\)$', '', name)) in DANCE: entry['dance'] = True
            classes.append(entry)
        # promotions : noms → ids (variante * : même (M)/(F) si elle existe)
        by_source = {c['source']: c for c in classes}
        for c in classes:
            ids = []
            sfx = re.search(r' \((M|F)\)$', c['source'])
            for p in c.pop('promoteTo'):
                star = p.endswith('*'); p = p.rstrip('*')
                cand = [p + sfx.group(0)] if (star and sfx) else []
                cand.append(p); cand += [p + ' (M)', p + ' (F)']
                t = next((by_source[x] for x in cand if x in by_source), None)
                if t and t is not c and t['id'] not in ids: ids.append(t['id'])
                elif not t: print(f'  {gid}: promotion introuvable {c["source"]} → {p}')
            c['promotions'] = ids
        if missing: print(f'  {gid}: classes ignorées (non reprises) : {", ".join(missing)}')
        games.append({'id': gid, 'name': gname, 'classes': classes})
        print(f'{gid}: {len(classes)} classes')
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Généré par tools/build_fe_classes.py depuis tools/fe-classes/data (Serenes Forest) — ne pas modifier à la main.\n')
        fh.write('(function (root) {\n  const DATA = ' + json.dumps(games, ensure_ascii=False, separators=(',', ':')) + ';\n')
        fh.write("  if (typeof module !== 'undefined' && module.exports) module.exports = DATA; else root.FE_CLASSES_DATA = DATA;\n})(typeof self !== 'undefined' ? self : this);\n")
    print('total', sum(len(g['classes']) for g in games))


if __name__ == '__main__':
    main()
