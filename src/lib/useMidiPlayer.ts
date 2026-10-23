import { Midi } from '@tonejs/midi'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import {
  createDrumKit,
  createPitchedSynth,
  kindFromInstrument,
  labelForInstrument,
  type DrumKit,
  type PitchedInstrument,
  type VoiceKind,
} from './gmVoices'

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'

export type TrackInfo = {
  id: string
  label: string
  channel: number
  program: number
  family: string
  isPercussion: boolean
  noteCount: number
}

type ScheduledNote = {
  time: number
  midi: number
  duration: number
  velocity: number
}

type VoiceRuntime = {
  info: TrackInfo
  kind: VoiceKind
  notes: ScheduledNote[]
  channel: Tone.Channel
  synth: PitchedInstrument | null
  drums: DrumKit | null
  part: Tone.Part | null
}

type LoadedMidi = {
  url: string
  duration: number
  voices: VoiceRuntime[]
}

function buildVoices(midi: Midi): Omit<VoiceRuntime, 'channel' | 'synth' | 'drums' | 'part'>[] {
  const voices: Omit<VoiceRuntime, 'channel' | 'synth' | 'drums' | 'part'>[] = []

  midi.tracks.forEach((track, index) => {
    if (track.notes.length === 0) return

    const isPercussion = track.instrument.percussion || track.channel === 9
    const kind = kindFromInstrument(track.instrument.family, isPercussion)
    const id = `t${index}-ch${track.channel}-p${track.instrument.number}`
    const label = labelForInstrument({
      trackName: track.name,
      program: track.instrument.number,
      family: track.instrument.family,
      percussion: isPercussion,
    })

    const notes: ScheduledNote[] = track.notes.map((note) => ({
      midi: note.midi,
      time: note.time,
      duration: Math.max(note.duration, isPercussion ? 0.03 : 0.05),
      velocity: note.velocity,
    }))

    voices.push({
      info: {
        id,
        label,
        channel: track.channel,
        program: track.instrument.number,
        family: track.instrument.family,
        isPercussion,
        noteCount: notes.length,
      },
      kind,
      notes,
    })
  })

  return voices
}

export function useMidiPlayer() {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [tracks, setTracks] = useState<TrackInfo[]>([])
  const [mutedIds, setMutedIds] = useState<string[]>([])
  const [soloIds, setSoloIds] = useState<string[]>([])

  const loadedRef = useRef<LoadedMidi | null>(null)
  const transposeRef = useRef(0)
  const loopRef = useRef(true)
  const rafRef = useRef<number | null>(null)
  const mutedRef = useRef<Set<string>>(new Set())
  const soloRef = useRef<Set<string>>(new Set())
  const wasPlayingRef = useRef(false)

  const stopProgressLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startProgressLoop = useCallback(() => {
    stopProgressLoop()
    const tick = () => {
      const transportState = Tone.Transport.state
      if (transportState === 'started') {
        setStatus((s) => (s === 'playing' ? s : 'playing'))
      } else if (transportState === 'paused') {
        setStatus((s) => (s === 'paused' ? s : 'paused'))
      }

      const total = loadedRef.current?.duration ?? 0
      if (total > 0) {
        const seconds = Tone.Transport.seconds
        setProgress(loopRef.current ? seconds % total : Math.min(seconds, total))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopProgressLoop])

  const applyMuteSolo = useCallback(() => {
    const loaded = loadedRef.current
    if (!loaded) return
    const hasSolo = soloRef.current.size > 0
    for (const voice of loaded.voices) {
      const audible = hasSolo
        ? soloRef.current.has(voice.info.id)
        : !mutedRef.current.has(voice.info.id)
      voice.channel.mute = !audible
    }
  }, [])

  const disposeVoices = useCallback(() => {
    const loaded = loadedRef.current
    if (!loaded) return
    for (const voice of loaded.voices) {
      voice.part?.dispose()
      voice.part = null
      voice.synth?.dispose()
      voice.synth = null
      voice.drums?.dispose()
      voice.drums = null
      voice.channel.dispose()
    }
    loaded.voices = []
  }, [])

  const scheduleParts = useCallback(() => {
    const loaded = loadedRef.current
    if (!loaded) return

    const transpose = transposeRef.current

    for (const voice of loaded.voices) {
      voice.part?.dispose()
      voice.part = null

      const isDrum = voice.info.isPercussion

      const events = voice.notes.map((n) => ({
        time: n.time,
        midi: isDrum ? n.midi : Math.min(127, Math.max(0, n.midi + transpose)),
        duration: n.duration,
        velocity: n.velocity,
      }))

      const part = new Tone.Part((time, event) => {
        if (isDrum && voice.drums) {
          voice.drums.trigger(event.midi, event.duration, time, event.velocity)
        } else if (voice.synth) {
          voice.synth.triggerAttackRelease(
            Tone.Frequency(event.midi, 'midi').toFrequency(),
            event.duration,
            time,
            event.velocity,
          )
        }
      }, events)

      part.loop = loopRef.current
      part.loopEnd = loaded.duration
      part.start(0)
      voice.part = part
    }

    applyMuteSolo()
  }, [applyMuteSolo])

  const createRuntimeVoices = useCallback(
    (partials: ReturnType<typeof buildVoices>): VoiceRuntime[] => {
      return partials.map((partial) => {
        const channel = new Tone.Channel({ volume: -4 }).toDestination()
        let synth: PitchedInstrument | null = null
        let drums: DrumKit | null = null

        if (partial.info.isPercussion || partial.kind === 'drums') {
          drums = createDrumKit(channel)
        } else {
          synth = createPitchedSynth(partial.kind, channel)
        }

        return {
          ...partial,
          channel,
          synth,
          drums,
          part: null,
        }
      })
    },
    [],
  )

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
      stopProgressLoop()
      Tone.Transport.stop()
      Tone.Transport.position = 0
      disposeVoices()
      loadedRef.current = null

      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Impossibile caricare il MIDI (${response.status})`)
        }
        const buffer = await response.arrayBuffer()
        const midi = new Midi(buffer)
        const partials = buildVoices(midi)
        if (partials.length === 0) {
          throw new Error('Il file MIDI non contiene note riproducibili')
        }

        const end = Math.max(
          midi.duration,
          ...partials.flatMap((v) => v.notes.map((n) => n.time + n.duration)),
          1,
        )

        const voices = createRuntimeVoices(partials)
        loadedRef.current = { url, duration: end, voices }
        setDuration(end)
        setTracks(voices.map((v) => v.info))

        const tempos = midi.header.tempos
        Tone.Transport.bpm.value = tempos.length > 0 ? tempos[0].bpm : 100

        scheduleParts()
        setStatus('ready')
      } catch (err) {
        disposeVoices()
        loadedRef.current = null
        setDuration(0)
        setTracks([])
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Errore nel caricamento MIDI')
      }
    },
    [createRuntimeVoices, disposeVoices, scheduleParts, stopProgressLoop],
  )

  const play = useCallback(async () => {
    if (!loadedRef.current) return
    setError(null)
    setStatus('playing')
    startProgressLoop()
    try {
      await Tone.start()
      if (Tone.Transport.state === 'started') {
        return
      }
      if (
        Tone.Transport.state === 'stopped' &&
        Tone.Transport.seconds >= (loadedRef.current.duration ?? 0) - 0.05
      ) {
        Tone.Transport.seconds = 0
        setProgress(0)
      }
      Tone.Transport.start()
    } catch (err) {
      stopProgressLoop()
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Impossibile avviare l’audio')
    }
  }, [startProgressLoop, stopProgressLoop])

  const pause = useCallback(() => {
    Tone.Transport.pause()
    stopProgressLoop()
    setStatus('paused')
  }, [stopProgressLoop])

  const stop = useCallback(() => {
    Tone.Transport.stop()
    Tone.Transport.position = 0
    stopProgressLoop()
    setProgress(0)
    setStatus(loadedRef.current ? 'ready' : 'idle')
  }, [stopProgressLoop])

  const setTempo = useCallback((bpm: number) => {
    Tone.Transport.bpm.value = Math.min(240, Math.max(40, bpm))
  }, [])

  const getTempo = useCallback(() => Tone.Transport.bpm.value, [])

  const setTranspose = useCallback(
    (semitones: number) => {
      transposeRef.current = Math.round(semitones)
      const playing = Tone.Transport.state === 'started'
      const position = Tone.Transport.seconds
      wasPlayingRef.current = playing

      if (playing) {
        Tone.Transport.pause()
      }
      scheduleParts()
      Tone.Transport.seconds = position
      setProgress(position)

      if (wasPlayingRef.current) {
        void Tone.start().then(() => {
          Tone.Transport.start()
          setStatus('playing')
          startProgressLoop()
        })
      }
    },
    [scheduleParts, startProgressLoop],
  )

  const seek = useCallback((seconds: number) => {
    const total = loadedRef.current?.duration ?? 0
    const next = Math.min(Math.max(0, seconds), Math.max(total, 0))
    Tone.Transport.seconds = next
    setProgress(next)
  }, [])

  const toggleMute = useCallback(
    (id: string) => {
      const next = new Set(mutedRef.current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      mutedRef.current = next
      setMutedIds([...next])
      applyMuteSolo()
    },
    [applyMuteSolo],
  )

  const toggleSolo = useCallback(
    (id: string) => {
      const next = new Set(soloRef.current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      soloRef.current = next
      setSoloIds([...next])
      applyMuteSolo()
    },
    [applyMuteSolo],
  )

  useEffect(() => {
    return () => {
      stopProgressLoop()
      disposeVoices()
      Tone.Transport.stop()
      Tone.Transport.cancel()
      loadedRef.current = null
    }
  }, [disposeVoices, stopProgressLoop])

  return {
    status,
    error,
    progress,
    duration,
    tracks,
    mutedIds,
    soloIds,
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
