# Musiques Fire Emblem (ressources/musiques/FE*, ressources/jingles/FE5)

Les 70 pistes fournies avec l'application viennent de transcriptions MIDI de bandes originales Fire Emblem
(FE3, FE4, FE5, FE9, FE10, FE12, FE13 ; certaines « Original MIDI ripped by SaltySoul »), données au projet.
Les MIDI d'origine sont dans `midi/`.

Rendu : FluidSynth (wasm, paquet npm `js-synthesizer`) avec la banque de sons **GeneralUser GS** de S. Christian Collins
(licence libre, https://schristiancollins.com/generaluser.php), puis ffmpeg (Ogg Vorbis q3, silence de fin retiré,
volume normalisé à −16 LUFS).

```
npm install --no-save js-synthesizer@1.8.5
node tools/music/midi-to-wav.js "midi/FE5/FE5 - Game Over.mid" piste.wav GeneralUser-GS.sf2
ffmpeg -i piste.wav -af "areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libvorbis -q:a 3 piste.ogg
```

Noms : « _s » → « ’s », mention « (Original MIDI ripped by SaltySoul) » retirée du nom de fichier (crédit ci-dessus).
Les pistes courtes de FE5 (montée de niveau, changement de classe, soin, game over, petite victoire) sont rangées dans
`ressources/jingles/FE5`.

Dans l'éditeur : Système › Musique (phases, combats joueur / ennemi / boss, jingles) et, pour chaque acte,
Base de données › Chapitres › « Musique de l'acte ». Un ancien projet reçoit ces pistes une fois, à son ouverture.
Fire Emblem est une marque de Nintendo / Intelligent Systems : ces musiques sont à garder pour un projet personnel.
