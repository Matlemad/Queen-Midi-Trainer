import { useEffect, useMemo, useState } from 'react'
import manifest from './midi-manifest.json'
import { labelForTranspose } from './lib/keys'
import { useMidiPlayer } from './lib/useMidiPlayer'

type MidiEntry = {
  id: string
  name: string
  url: string
}

const midiList = manifest as MidiEntry[]

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export default function App() {
  const player = useMidiPlayer()
  const [selectedId, setSelectedId] = useState<string>(midiList[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [tempo, setTempo] = useState(100)
  const [transpose, setTranspose] = useState(0)

  const filteredList = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return midiList
    return midiList.filter((item) => {
      const hay = normalize(`${item.name} ${item.id}`)
      return hay.includes(q)
    })
  }, [query])

  const resolvedId = useMemo(() => {
    if (filteredList.some((m) => m.id === selectedId)) return selectedId
    return filteredList[0]?.id ?? ''
  }, [filteredList, selectedId])

  const selected = useMemo(
    () => midiList.find((m) => m.id === resolvedId) ?? null,
    [resolvedId],
  )

  const mutedSet = useMemo(() => new Set(player.mutedIds), [player.mutedIds])
  const soloSet = useMemo(() => new Set(player.soloIds), [player.soloIds])

  const { load, getTempo, setTranspose: applyTranspose } = player

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    void load(selected.url).then(() => {
      if (cancelled) return
      setTempo(Math.round(getTempo()))
      setTranspose(0)
      applyTranspose(0)
    })
    return () => {
      cancelled = true
    }
  }, [selected, load, getTempo, applyTranspose])

  const isBusy = player.status === 'loading'
  const canControl =
    Boolean(selected) && player.status !== 'loading' && player.status !== 'error'
  const isPlaying = player.status === 'playing'

  const onSelect = (id: string) => {
    if (id === selectedId) return
    player.stop()
    setSelectedId(id)
  }

  const onTempo = (value: number) => {
    setTempo(value)
    player.setTempo(value)
  }

  const onTranspose = (value: number) => {
    setTranspose(value)
    player.setTranspose(value)
  }

  const sfPct = Math.round(player.soundfontProgress * 100)

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-teal-800/80 uppercase">
          Queen MIDI Bases
        </p>
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
          Pratica con le basi MIDI
        </h1>
        <p className="max-w-2xl text-muted">
          Cerca e scegli una base, poi regola tonalità e tempo. I timbri sono campioni GM
          (MuseScore General / FluidR3).
        </p>
      </header>

      <section
        aria-labelledby="player"
        className="rounded-2xl border border-line bg-panel/90 p-4 shadow-sm backdrop-blur-sm sm:p-5"
      >
        <h2 id="player" className="mb-4 text-lg font-semibold text-ink">
          Player
        </h2>

        {midiList.length === 0 ? (
          <p className="mb-5 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-6 text-center text-muted">
            Nessun file MIDI trovato. Metti uno o più
            {' '}
            <span className="font-medium text-ink">.mid</span>
            {' '}
            in
            {' '}
            <span className="font-medium text-ink">public/midi/</span>
            .
          </p>
        ) : (
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-ink">Cerca base</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Es. Bohemian, Killer Queen…"
                autoComplete="off"
                enterKeyHint="search"
                aria-label="Cerca base MIDI per nome"
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink outline-none transition placeholder:text-muted/80 focus:border-teal-700"
              />
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">Base MIDI</span>
                <span className="text-xs text-muted">
                  {filteredList.length}
                  {' '}
                  di
                  {' '}
                  {midiList.length}
                </span>
              </div>
              <select
                value={resolvedId}
                disabled={filteredList.length === 0}
                onChange={(e) => onSelect(e.target.value)}
                aria-label="Seleziona base MIDI"
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-teal-700 disabled:opacity-50"
              >
                {filteredList.length === 0 ? (
                  <option value="">Nessun risultato</option>
                ) : (
                  filteredList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        )}

        {player.error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger"
          >
            {player.error}
          </p>
        )}

        {isBusy && (
          <p className="mb-4 text-sm text-muted" aria-live="polite">
            Caricamento MIDI…
          </p>
        )}

        {player.soundfontProgress > 0 && player.soundfontProgress < 1 && (
          <p className="mb-4 text-sm text-muted" aria-live="polite">
            Download soundfont GM… {sfPct}%
          </p>
        )}

        {player.engineWarming && (
          <p className="mb-4 text-sm text-muted" aria-live="polite">
            Avvio motore audio…
          </p>
        )}

        <div className="mb-5 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>{formatTime(player.progress)}</span>
            <span>{formatTime(player.duration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(player.duration, 0.01)}
            step={0.01}
            value={Math.min(player.progress, player.duration || 0)}
            disabled={!canControl}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Posizione riproduzione"
            className="w-full"
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canControl || player.engineWarming}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Metti in pausa' : 'Avvia riproduzione'}
            onClick={() => {
              if (isPlaying) player.pause()
              else void player.play()
            }}
            className="min-w-28 rounded-xl bg-accent px-4 py-2.5 font-medium text-white transition hover:bg-teal-800 disabled:hover:bg-accent"
          >
            {isPlaying ? 'Pausa' : 'Play'}
          </button>
          <button
            type="button"
            disabled={!canControl}
            onClick={() => player.stop()}
            className="rounded-xl border border-line bg-white px-4 py-2.5 font-medium text-ink transition hover:bg-paper"
          >
            Stop
          </button>
        </div>

        <div className="space-y-5">
          <label className="block space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-ink">Tempo</span>
              <span className="tabular-nums text-sm text-muted">{tempo} BPM</span>
            </div>
            <input
              type="range"
              min={40}
              max={200}
              step={1}
              value={tempo}
              disabled={!canControl}
              onChange={(e) => onTempo(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="block space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-ink">Tonalità (trasposizione)</span>
              <span className="text-sm text-muted">{labelForTranspose(transpose)}</span>
            </div>
            <input
              type="range"
              min={-6}
              max={6}
              step={1}
              value={transpose}
              disabled={!canControl}
              onChange={(e) => onTranspose(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted">
              <span>−6</span>
              <span>0</span>
              <span>+6</span>
            </div>
            <p className="text-xs text-muted">
              La trasposizione non modifica la batteria (canale 10).
            </p>
          </label>

          {player.tracks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-medium text-ink">Strumenti</h3>
                <span className="text-xs text-muted">{player.tracks.length} tracce</span>
              </div>
              <ul
                className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-white/80"
                aria-label="Tracce e strumenti"
              >
                {player.tracks.map((track) => {
                  const muted = mutedSet.has(track.id)
                  const solo = soloSet.has(track.id)
                  return (
                    <li
                      key={track.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{track.label}</p>
                        <p className="truncate text-xs text-muted">
                          {track.isPercussion
                            ? 'Batteria · canale 10'
                            : `Ch ${track.channel + 1} · prog ${track.program}`}
                          {' · '}
                          {track.noteCount} note
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!canControl}
                        aria-pressed={muted}
                        aria-label={muted ? `Riattiva ${track.label}` : `Silenzia ${track.label}`}
                        onClick={() => player.toggleMute(track.id)}
                        className={[
                          'shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition',
                          muted
                            ? 'border-teal-700 bg-accent-soft text-ink'
                            : 'border-line bg-paper text-muted hover:border-teal-600/40',
                        ].join(' ')}
                      >
                        Mute
                      </button>
                      <button
                        type="button"
                        disabled={!canControl}
                        aria-pressed={solo}
                        aria-label={solo ? `Togli solo da ${track.label}` : `Solo ${track.label}`}
                        onClick={() => player.toggleSolo(track.id)}
                        className={[
                          'shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition',
                          solo
                            ? 'border-teal-700 bg-accent-soft text-ink'
                            : 'border-line bg-paper text-muted hover:border-teal-600/40',
                        ].join(' ')}
                      >
                        Solo
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      <footer className="pb-2 text-sm text-muted">
        Motore:
        {' '}
        <span className="text-ink">spessasynth_lib</span>
        {' · '}
        soundfont MuseScore General (GM).
      </footer>
    </div>
  )
}
