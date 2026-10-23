# Queen MIDI Bases

App web semplice per esercitarsi con basi MIDI: scegli un file, poi play/pausa, trasposizione di tonalità e cambio tempo.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- Riproduzione: Tone.js + `@tonejs/midi`

## Avvio locale

```bash
npm install
npm run soundfont   # scarica MuseScore_General.sf3 (~38 MB) se manca
npm run dev
```

L’app parte su [http://127.0.0.1:43127](http://127.0.0.1:43127).

Playback: **spessasynth_lib** + soundfont GM **MuseScore General** (campioni, non synth Tone).
L’AudioContext parte solo al primo Play.

Build di produzione:

```bash
npm run build
npm run preview
```

## Cartella MIDI

Metti i file `.mid` / `.midi` in:

```text
public/midi/
```

All’avvio di `dev` e in `build`, un plugin Vite legge quella cartella e genera `src/midi-manifest.json`. I nuovi file compaiono nella lista dopo il rebuild o la ricarica del server di sviluppo.

I file Queen attualmente in `public/midi/` provengono dai download pubblici gratuiti di
[queensongs.info/midi/queen](https://www.queensongs.info/midi/queen).
Puoi aggiungere altri `.mid` nella stessa cartella.

## Controlli

- **Play / Pausa / Stop** — riproduzione della base selezionata
- **Tempo** — BPM in tempo reale (Transport di Tone.js)
- **Tonalità** — trasposizione ±6 semitoni (le note vengono riprogrammate; la riproduzione riprende dalla posizione corrente)
