import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'

export const SOUNDFONT_URL = '/soundfonts/MuseScore_General.sf3'
export const WORKLET_URL = '/spessasynth_processor.min.js'
export const DRUM_CHANNEL = 9

type Engine = {
  context: AudioContext
  synth: WorkletSynthesizer
  sequencer: Sequencer
}

let engine: Engine | null = null
let soundfontBuffer: ArrayBuffer | null = null
let soundfontPromise: Promise<ArrayBuffer> | null = null
let workletReady = false

/** Prefetch SF3 senza creare AudioContext (ok fuori dal gesto utente). */
export function prefetchSoundfont(
  onProgress?: (ratio: number) => void,
): Promise<ArrayBuffer> {
  if (soundfontBuffer) {
    onProgress?.(1)
    return Promise.resolve(soundfontBuffer)
  }
  if (soundfontPromise) return soundfontPromise

  soundfontPromise = (async () => {
    const res = await fetch(SOUNDFONT_URL)
    if (!res.ok) {
      throw new Error(
        `Soundfont non trovata (${res.status}). Esegui npm run soundfont`,
      )
    }
    const total = Number(res.headers.get('content-length') ?? 0)
    if (!res.body || !total) {
      const buf = await res.arrayBuffer()
      soundfontBuffer = buf
      onProgress?.(1)
      return buf
    }

    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        received += value.length
        onProgress?.(Math.min(1, received / total))
      }
    }
    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    soundfontBuffer = merged.buffer
    onProgress?.(1)
    return soundfontBuffer
  })().catch((err) => {
    soundfontPromise = null
    throw err
  })

  return soundfontPromise
}

/**
 * Crea AudioContext + synth solo dopo un gesto utente (Play).
 * L’AudioContext viene creato subito (prima di await lunghi) per rispettare
 * la autoplay policy; lo SF3 può continuare a scaricarsi in parallelo.
 */
export async function ensureEngine(
  onSoundfontProgress?: (ratio: number) => void,
): Promise<Engine> {
  if (engine) {
    if (engine.context.state !== 'running') {
      await engine.context.resume()
    }
    return engine
  }

  // Importante: niente await prima di new AudioContext() nel percorso Play.
  const context = new AudioContext()
  const resumePromise = context.resume()
  const sfPromise = prefetchSoundfont(onSoundfontProgress)

  await resumePromise

  if (!workletReady) {
    await context.audioWorklet.addModule(WORKLET_URL)
    workletReady = true
  }

  const sf = await sfPromise
  const synth = new WorkletSynthesizer(context)
  synth.connect(context.destination)
  await synth.soundBankManager.addSoundBank(sf.slice(0), 'main')
  await synth.isReady

  const sequencer = new Sequencer(synth)
  sequencer.loopCount = Infinity

  engine = { context, synth, sequencer }
  return engine
}

export function getEngine(): Engine | null {
  return engine
}

export function applyChannelMutes(
  synth: WorkletSynthesizer,
  mutedChannels: Set<number>,
): void {
  const channels = synth.midiChannels
  for (let ch = 0; ch < channels.length; ch++) {
    channels[ch]?.setSystemParameter('isMuted', mutedChannels.has(ch))
  }
}

/** Transpose melodico: keyShift su tutti i canali tranne la batteria (ch. 10 / index 9). */
export function applyKeyShift(synth: WorkletSynthesizer, semitones: number): void {
  const shift = Math.round(semitones)
  const channels = synth.midiChannels
  for (let ch = 0; ch < channels.length; ch++) {
    const channel = channels[ch]
    if (!channel) continue
    channel.setSystemParameter('keyShift', ch === DRUM_CHANNEL ? 0 : shift)
  }
}

export function disposeEngine(): void {
  if (!engine) return
  try {
    engine.sequencer.pause()
  } catch {
    /* ignore */
  }
  try {
    engine.synth.stopAll(true)
  } catch {
    /* ignore */
  }
  void engine.context.close()
  engine = null
  workletReady = false
}
