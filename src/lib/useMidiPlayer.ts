import { Midi } from '@tonejs/midi'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'

type LoadedMidi = {
  url: string
  duration: number
  notes: Array<{ midi: number; time: number; duration: number; velocity: number }>
}

function collectNotes(midi: Midi) {
  const notes: LoadedMidi['notes'] = []
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      notes.push({
        midi: note.midi,
        time: note.time,
        duration: Math.max(note.duration, 0.05),
        velocity: note.velocity,
      })
    }
  }
  notes.sort((a, b) => a.time - b.time)
  return notes
}

export function useMidiPlayer() {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  const synthRef = useRef<Tone.PolySynth | null>(null)
  const partRef = useRef<Tone.Part | null>(null)
  const loadedRef = useRef<LoadedMidi | null>(null)
  const transposeRef = useRef(0)
  const loopRef = useRef(true)
  const rafRef = useRef<number | null>(null)
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
      // Keep React status aligned with the singleton Transport (HMR / remount safe).
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

  const ensureSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0.35, release: 0.8 },
      }).toDestination()
      synthRef.current.volume.value = -8
    }
    return synthRef.current
  }, [])

  const disposePart = useCallback(() => {
    if (partRef.current) {
      partRef.current.dispose()
      partRef.current = null
    }
  }, [])

  const schedulePart = useCallback(() => {
    const loaded = loadedRef.current
    if (!loaded) return

    disposePart()
    const synth = ensureSynth()
    const transpose = transposeRef.current

    const events = loaded.notes.map((n) => ({
      time: n.time,
      midi: Math.min(127, Math.max(0, n.midi + transpose)),
      duration: n.duration,
      velocity: n.velocity,
    }))

    const part = new Tone.Part((time, event) => {
      synth.triggerAttackRelease(
        Tone.Frequency(event.midi, 'midi').toFrequency(),
        event.duration,
        time,
        event.velocity,
      )
    }, events)

    part.loop = loopRef.current
    part.loopEnd = loaded.duration
    part.start(0)
    partRef.current = part
  }, [disposePart, ensureSynth])

  const load = useCallback(
    async (url: string) => {
      setError(null)
      setStatus('loading')
      setProgress(0)
      stopProgressLoop()
      Tone.Transport.stop()
      Tone.Transport.position = 0
      disposePart()

      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Impossibile caricare il MIDI (${response.status})`)
        }
        const buffer = await response.arrayBuffer()
        const midi = new Midi(buffer)
        const notes = collectNotes(midi)
        if (notes.length === 0) {
          throw new Error('Il file MIDI non contiene note riproducibili')
        }
        const end = Math.max(
          midi.duration,
          ...notes.map((n) => n.time + n.duration),
          1,
        )
        loadedRef.current = { url, duration: end, notes }
        setDuration(end)

        const tempos = midi.header.tempos
        if (tempos.length > 0) {
          Tone.Transport.bpm.value = tempos[0].bpm
        } else {
          Tone.Transport.bpm.value = 100
        }

        schedulePart()
        setStatus('ready')
      } catch (err) {
        loadedRef.current = null
        setDuration(0)
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Errore nel caricamento MIDI')
      }
    },
    [disposePart, schedulePart, stopProgressLoop],
  )

  const play = useCallback(async () => {
    if (!loadedRef.current) return
    setError(null)
    // Optimistic UI so Play → Pausa flips before Tone.start() resolves.
    setStatus('playing')
    startProgressLoop()
    try {
      await Tone.start()
      ensureSynth()
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
  }, [ensureSynth, startProgressLoop, stopProgressLoop])

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
      schedulePart()
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
    [schedulePart, startProgressLoop],
  )

  const seek = useCallback(
    (seconds: number) => {
      const total = loadedRef.current?.duration ?? 0
      const next = Math.min(Math.max(0, seconds), Math.max(total, 0))
      Tone.Transport.seconds = next
      setProgress(next)
    },
    [],
  )

  useEffect(() => {
    return () => {
      stopProgressLoop()
      disposePart()
      Tone.Transport.stop()
      Tone.Transport.cancel()
      synthRef.current?.dispose()
      synthRef.current = null
    }
  }, [disposePart, stopProgressLoop])

  return {
    status,
    error,
    progress,
    duration,
    load,
    play,
    pause,
    stop,
    setTempo,
    getTempo,
    setTranspose,
    seek,
  }
}
