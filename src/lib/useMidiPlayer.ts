import { Midi } from '@tonejs/midi'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyChannelMutes,
  applyKeyShift,
  disposeEngine,
  ensureEngine,
  getEngine,
  prefetchSoundfont,
  DRUM_CHANNEL,
} from './soundfontEngine'

export type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'

export type TrackInfo = {
  id: string
  label: string
  channel: number
  program: number
  family: string
  isPercussion: boolean
  noteCount: number
}

const FAMILY_IT: Record<string, string> = {
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

function cleanName(name: string | undefined): string {
  return (name ?? '')
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
}

function trackLabel(opts: {
  trackName?: string
  program: number
  family: string
  percussion: boolean
  instrumentName: string
}): string {
  const cleaned = cleanName(opts.trackName)
  if (cleaned && !/^(untitled|track\s*\d+)$/i.test(cleaned)) return cleaned
  if (opts.percussion) return 'Batteria'
  const fromFamily = FAMILY_IT[opts.family]
  if (fromFamily) return fromFamily
  const inst = cleanName(opts.instrumentName)
  return inst || 'Strumento'
}

function parseTracks(midi: Midi): TrackInfo[] {
  const tracks: TrackInfo[] = []
  midi.tracks.forEach((track, index) => {
    if (track.notes.length === 0) return
    const isPercussion = track.instrument.percussion || track.channel === DRUM_CHANNEL
    tracks.push({
      id: `t${index}-ch${track.channel}-p${track.instrument.number}`,
      label: trackLabel({
        trackName: track.name,
        program: track.instrument.number,
        family: track.instrument.family,
        percussion: isPercussion,
        instrumentName: track.instrument.name,
      }),
      channel: track.channel,
      program: track.instrument.number,
      family: track.instrument.family,
      isPercussion,
      noteCount: track.notes.length,
    })
  })
  return tracks
}

export function useMidiPlayer() {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [tracks, setTracks] = useState<TrackInfo[]>([])
  const [mutedIds, setMutedIds] = useState<string[]>([])
  const [soloIds, setSoloIds] = useState<string[]>([])
  const [soundfontProgress, setSoundfontProgress] = useState(0)
  const [engineWarming, setEngineWarming] = useState(false)

  const midiBufferRef = useRef<ArrayBuffer | null>(null)
  const midiUrlRef = useRef<string | null>(null)
  const loadedSongUrlRef = useRef<string | null>(null)
  const tracksRef = useRef<TrackInfo[]>([])
  const mutedRef = useRef<Set<string>>(new Set())
  const soloRef = useRef<Set<string>>(new Set())
  const transposeRef = useRef(0)
  const tempoRef = useRef(100)
  const baseTempoRef = useRef(100)
  const rafRef = useRef<number | null>(null)

  const stopProgressLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startProgressLoop = useCallback(() => {
    stopProgressLoop()
    const tick = () => {
      const eng = getEngine()
      if (eng) {
        const seq = eng.sequencer
        const total = seq.duration || duration
        if (total > 0) {
          setProgress(Math.min(seq.currentTime, total))
        }
        if (!seq.paused) {
          setStatus((s) => (s === 'playing' ? s : 'playing'))
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [duration, stopProgressLoop])

  const mutedChannelsFromState = useCallback((): Set<number> => {
    const list = tracksRef.current
    const hasSolo = soloRef.current.size > 0
    const muted = new Set<number>()
    for (const track of list) {
      const audible = hasSolo
        ? soloRef.current.has(track.id)
        : !mutedRef.current.has(track.id)
      if (!audible) muted.add(track.channel)
    }
    // If any audible track shares a channel with a muted one, prefer audible
    // unless ALL tracks on that channel are muted/not-soloed.
    for (const track of list) {
      const audible = hasSolo
        ? soloRef.current.has(track.id)
        : !mutedRef.current.has(track.id)
      if (audible) muted.delete(track.channel)
    }
    return muted
  }, [])

  const syncSynthControls = useCallback(() => {
    const eng = getEngine()
    if (!eng) return
    applyChannelMutes(eng.synth, mutedChannelsFromState())
    applyKeyShift(eng.synth, transposeRef.current)
    const base = baseTempoRef.current || 100
    const target = tempoRef.current || base
    eng.sequencer.playbackRate = Math.min(3, Math.max(0.25, target / base))
  }, [mutedChannelsFromState])

  const loadSongIntoSequencer = useCallback(async () => {
    const eng = getEngine()
    const buffer = midiBufferRef.current
    const url = midiUrlRef.current
    if (!eng || !buffer || !url) return

    if (loadedSongUrlRef.current === url) {
      syncSynthControls()
      return
    }

    await new Promise<void>((resolve, reject) => {
      const handler = eng.sequencer.eventHandler
      const id = `song-ready-${Date.now()}`
      const timeout = window.setTimeout(() => {
        handler.removeEvent('songChange', id)
        // Some builds still expose duration after load even without event
        if (eng.sequencer.duration > 0) {
          resolve()
        } else {
          reject(new Error('Timeout caricamento sequenza MIDI'))
        }
      }, 15000)

      handler.addEvent('songChange', id, () => {
        window.clearTimeout(timeout)
        handler.removeEvent('songChange', id)
        resolve()
      })

      eng.sequencer.loadNewSongList([
        { binary: buffer.slice(0), fileName: url.split('/').pop() },
      ])
    })

    loadedSongUrlRef.current = url
    setDuration(eng.sequencer.duration || duration)
    syncSynthControls()
  }, [duration, syncSynthControls])

  // Prefetch soundfont ASAP (no AudioContext).
  useEffect(() => {
    void prefetchSoundfont((ratio) => setSoundfontProgress(ratio)).catch(() => {
      /* shown on Play if still missing */
    })
  }, [])

  const load = useCallback(
    async (url: string) => {
      setError(null)
      setStatus('loading')
      setProgress(0)
      setTracks([])
      setMutedIds([])
      setSoloIds([])
      mutedRef.current = new Set()
      soloRef.current = new Set()
      tracksRef.current = []
      loadedSongUrlRef.current = null
      stopProgressLoop()

      const eng = getEngine()
      if (eng) {
        eng.sequencer.pause()
        eng.synth.stopAll(true)
        eng.sequencer.currentTime = 0
      }

      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Impossibile caricare il MIDI (${response.status})`)
        }
        const buffer = await response.arrayBuffer()
        // Parse solo metadati/tracce — niente voci audio al load
        const midi = new Midi(buffer.slice(0))
        const parsed = parseTracks(midi)
        if (parsed.length === 0) {
          throw new Error('Il file MIDI non contiene note riproducibili')
        }

        const end = Math.max(midi.duration, 1)
        const bpm = midi.header.tempos[0]?.bpm ?? 100

        midiBufferRef.current = buffer
        midiUrlRef.current = url
        tracksRef.current = parsed
        baseTempoRef.current = bpm
        tempoRef.current = Math.round(bpm)
        transposeRef.current = 0

        setTracks(parsed)
        setDuration(end)
        setStatus('ready')
      } catch (err) {
        midiBufferRef.current = null
        midiUrlRef.current = null
        setDuration(0)
        setTracks([])
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Errore nel caricamento MIDI')
      }
    },
    [stopProgressLoop],
  )

  const play = useCallback(async () => {
    if (!midiBufferRef.current) return
    setError(null)
    setEngineWarming(true)
    // Optimistic UI
    setStatus('playing')
    try {
      const eng = await ensureEngine((ratio) => setSoundfontProgress(ratio))
      await loadSongIntoSequencer()
      syncSynthControls()

      if (
        eng.sequencer.duration > 0 &&
        eng.sequencer.currentTime >= eng.sequencer.duration - 0.05
      ) {
        eng.sequencer.currentTime = 0
        setProgress(0)
      }

      eng.sequencer.play()
      startProgressLoop()
    } catch (err) {
      stopProgressLoop()
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Impossibile avviare l’audio')
    } finally {
      setEngineWarming(false)
    }
  }, [loadSongIntoSequencer, startProgressLoop, stopProgressLoop, syncSynthControls])

  const pause = useCallback(() => {
    const eng = getEngine()
    eng?.sequencer.pause()
    stopProgressLoop()
    setStatus('paused')
  }, [stopProgressLoop])

  const stop = useCallback(() => {
    const eng = getEngine()
    if (eng) {
      eng.sequencer.pause()
      eng.sequencer.currentTime = 0
      eng.synth.stopAll(true)
    }
    stopProgressLoop()
    setProgress(0)
    setStatus(midiBufferRef.current ? 'ready' : 'idle')
  }, [stopProgressLoop])

  const setTempo = useCallback(
    (bpm: number) => {
      tempoRef.current = Math.min(240, Math.max(40, bpm))
      const eng = getEngine()
      if (eng) {
        const base = baseTempoRef.current || 100
        eng.sequencer.playbackRate = Math.min(
          3,
          Math.max(0.25, tempoRef.current / base),
        )
      }
    },
    [],
  )

  const getTempo = useCallback(() => tempoRef.current, [])

  const setTranspose = useCallback(
    (semitones: number) => {
      transposeRef.current = Math.round(semitones)
      const eng = getEngine()
      if (eng) applyKeyShift(eng.synth, transposeRef.current)
    },
    [],
  )

  const seek = useCallback((seconds: number) => {
    const eng = getEngine()
    const total = eng?.sequencer.duration || duration
    const next = Math.min(Math.max(0, seconds), Math.max(total, 0))
    if (eng) eng.sequencer.currentTime = next
    setProgress(next)
  }, [duration])

  const toggleMute = useCallback(
    (id: string) => {
      const next = new Set(mutedRef.current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      mutedRef.current = next
      setMutedIds([...next])
      const eng = getEngine()
      if (eng) applyChannelMutes(eng.synth, mutedChannelsFromState())
    },
    [mutedChannelsFromState],
  )

  const toggleSolo = useCallback(
    (id: string) => {
      const next = new Set(soloRef.current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      soloRef.current = next
      setSoloIds([...next])
      const eng = getEngine()
      if (eng) applyChannelMutes(eng.synth, mutedChannelsFromState())
    },
    [mutedChannelsFromState],
  )

  useEffect(() => {
    return () => {
      stopProgressLoop()
      disposeEngine()
    }
  }, [stopProgressLoop])

  return {
    status,
    error,
    progress,
    duration,
    tracks,
    mutedIds,
    soloIds,
    soundfontProgress,
    engineWarming,
    load,
    play,
    pause,
    stop,
    setTempo,
    getTempo,
    setTranspose,
    seek,
    toggleMute,
    toggleSolo,
  }
}
