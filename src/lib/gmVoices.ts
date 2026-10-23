import * as Tone from 'tone'

/** MIDI channel 10 (1-based) → index 9 in @tonejs/midi */
export const DRUM_CHANNEL = 9

export type VoiceKind =
  | 'piano'
  | 'organ'
  | 'guitar'
  | 'bass'
  | 'strings'
  | 'ensemble'
  | 'brass'
  | 'reed'
  | 'pipe'
  | 'lead'
  | 'pad'
  | 'fx'
  | 'percPitched'
  | 'drums'

const FAMILY_TO_KIND: Record<string, VoiceKind> = {
  piano: 'piano',
  'chromatic percussion': 'percPitched',
  organ: 'organ',
  guitar: 'guitar',
  bass: 'bass',
  strings: 'strings',
  ensemble: 'ensemble',
  brass: 'brass',
  reed: 'reed',
  pipe: 'pipe',
  'synth lead': 'lead',
  'synth pad': 'pad',
  'synth effects': 'fx',
  ethnic: 'percPitched',
  percussive: 'percPitched',
  'sound effects': 'fx',
  drums: 'drums',
}

const FAMILY_LABEL_IT: Record<string, string> = {
  piano: 'Pianoforte',
  'chromatic percussion': 'Percussioni',
  organ: 'Organo',
  guitar: 'Chitarra',
  bass: 'Basso',
  strings: 'Archi',
  ensemble: 'Ensemble',
  brass: 'Ottoni',
  reed: 'Ance',
  pipe: 'Fiati',
  'synth lead': 'Synth lead',
  'synth pad': 'Synth pad',
  'synth effects': 'Effetti synth',
  ethnic: 'Etnico',
  percussive: 'Percussivo',
  'sound effects': 'Effetti',
  drums: 'Batteria',
}

/** Common GM program → Italian label (fallback: family). */
const PROGRAM_LABEL_IT: Partial<Record<number, string>> = {
  0: 'Pianoforte',
  4: 'Piano elettrico',
  16: 'Organo drawbar',
  18: 'Organo rock',
  24: 'Chitarra acustica',
  27: 'Chitarra clean',
  28: 'Chitarra muted',
  29: 'Chitarra overdrive',
  30: 'Chitarra distortion',
  32: 'Basso acustico',
  33: 'Basso elettrico',
  34: 'Basso pick',
  36: 'Slap bass',
  38: 'Synth bass',
  40: 'Violino',
  42: 'Violoncello',
  47: 'Timpani',
  48: 'Archi ensemble',
  49: 'Archi ensemble 2',
  52: 'Coro Aah',
  53: 'Coro Ooh',
  56: 'Tromba',
  57: 'Trombone',
  60: 'Corno francese',
  61: 'Sezione ottoni',
  62: 'Synth brass',
  65: 'Sax alto',
  66: 'Sax tenore',
  68: 'Oboe',
  69: 'Corno inglese',
  71: 'Clarinetto',
  73: 'Flauto',
  80: 'Lead square',
  81: 'Lead saw',
  84: 'Lead charang',
  88: 'Pad new age',
  89: 'Pad warm',
}

export function kindFromInstrument(family: string, percussion: boolean): VoiceKind {
  if (percussion) return 'drums'
  return FAMILY_TO_KIND[family] ?? 'piano'
}

export function labelForInstrument(opts: {
  trackName?: string
  program: number
  family: string
  percussion: boolean
}): string {
  const cleaned = (opts.trackName ?? '')
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
  if (cleaned && !/^(untitled|track\s*\d+)$/i.test(cleaned)) {
    return cleaned
  }
  if (opts.percussion) return 'Batteria'
  return (
    PROGRAM_LABEL_IT[opts.program] ??
    FAMILY_LABEL_IT[opts.family] ??
    (opts.family || 'Strumento')
  )
}

export type PitchedInstrument = Tone.PolySynth

/** Create a pitched poly synth routed through `output` (usually a Channel). */
export function createPitchedSynth(kind: VoiceKind, output: Tone.ToneAudioNode): PitchedInstrument {
  const volume = -12
  let synth: PitchedInstrument

  switch (kind) {
    case 'bass':
      synth = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: 'square' },
        filter: { Q: 1, type: 'lowpass', rolloff: -24 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4, baseFrequency: 120, octaves: 2.5 },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.7, release: 0.35 },
      })
      break
    case 'guitar':
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.35, sustain: 0.15, release: 0.35 },
      })
      break
    case 'organ':
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.15 },
      })
      break
    case 'strings':
    case 'ensemble':
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.12, decay: 0.2, sustain: 0.75, release: 0.9 },
      })
      break
    case 'brass':
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.06, decay: 0.15, sustain: 0.7, release: 0.4 },
      })
      break
    case 'reed':
    case 'pipe':
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.15, sustain: 0.6, release: 0.35 },
      })
      break
    case 'lead':
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.3 },
      })
      break
    case 'pad':
      synth = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2,
        envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 1.2 },
        modulationEnvelope: { attack: 0.4, decay: 0.1, sustain: 0.7, release: 0.8 },
      })
      break
    case 'fx':
      synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 8,
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.5 },
        modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
      })
      break
    case 'percPitched':
      synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 4,
        modulationIndex: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.05, release: 0.3 },
        modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
      })
      break
    case 'piano':
    default:
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.35, sustain: 0.25, release: 0.7 },
      })
      break
  }

  synth.connect(output)
  synth.volume.value = volume
  synth.maxPolyphony = 32
  return synth
}

export type DrumKit = {
  trigger: (midi: number, duration: number, time: number, velocity: number) => void
  dispose: () => void
}

/** Lightweight GM drum kit (channel 10) with distinct kick/snare/hats/toms/cymbals. */
export function createDrumKit(output: Tone.ToneAudioNode): DrumKit {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 5,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 0.2 },
  }).connect(output)
  kick.volume.value = -6

  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
  }).connect(output)
  snareNoise.volume.value = -14

  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
  }).connect(output)
  snareBody.volume.value = -10

  const hat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).connect(output)
  hat.volume.value = -22
  hat.frequency.value = 400

  const openHat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.35, release: 0.2 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 3500,
    octaves: 1.5,
  }).connect(output)
  openHat.volume.value = -20
  openHat.frequency.value = 380

  const cymbal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.2, release: 0.4 },
    harmonicity: 5.1,
    modulationIndex: 40,
    resonance: 3000,
    octaves: 1.5,
  }).connect(output)
  cymbal.volume.value = -18
  cymbal.frequency.value = 300

  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.15 },
  }).connect(output)
  tom.volume.value = -8

  const clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.04 },
  }).connect(output)
  clap.volume.value = -12

  const trigger = (midi: number, _duration: number, time: number, velocity: number) => {
    const v = Math.min(1, Math.max(0.05, velocity))
    // GM percussion key map (subset)
    if (midi === 35 || midi === 36) {
      kick.triggerAttackRelease('C1', '8n', time, v)
    } else if (midi === 38 || midi === 40) {
      snareBody.triggerAttackRelease('G2', '16n', time, v * 0.8)
      snareNoise.triggerAttackRelease('16n', time, v)
    } else if (midi === 37) {
      snareNoise.triggerAttackRelease('32n', time, v * 0.6)
    } else if (midi === 39) {
      clap.triggerAttackRelease('16n', time, v)
    } else if (midi === 42 || midi === 44) {
      hat.triggerAttackRelease('32n', time, v * 0.7)
    } else if (midi === 46) {
      openHat.triggerAttackRelease('8n', time, v * 0.7)
    } else if (midi === 49 || midi === 57 || midi === 55 || midi === 52 || midi === 51 || midi === 59) {
      cymbal.triggerAttackRelease('2n', time, v * 0.6)
    } else if (midi >= 41 && midi <= 50) {
      const freqs: Record<number, string> = {
        41: 'F2',
        43: 'A2',
        45: 'C3',
        47: 'D3',
        48: 'F3',
        50: 'A3',
      }
      tom.triggerAttackRelease(freqs[midi] ?? 'G2', '8n', time, v)
    } else if (midi === 54 || midi === 56 || midi === 70 || midi === 75) {
      hat.triggerAttackRelease('64n', time, v * 0.5)
    } else {
      // fallback click
      hat.triggerAttackRelease('64n', time, v * 0.4)
    }
  }

  const dispose = () => {
    kick.dispose()
    snareNoise.dispose()
    snareBody.dispose()
    hat.dispose()
    openHat.dispose()
    cymbal.dispose()
    tom.dispose()
    clap.dispose()
  }

  return { trigger, dispose }
}
