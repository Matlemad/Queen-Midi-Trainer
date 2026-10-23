export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export type NoteName = (typeof NOTE_NAMES)[number]

/** Semitone offset from C (0). Range typically -6..+6 for practice. */
export function labelForTranspose(semitones: number): string {
  const idx = ((semitones % 12) + 12) % 12
  const name = NOTE_NAMES[idx]
  if (semitones === 0) return `${name} (originale)`
  const sign = semitones > 0 ? '+' : ''
  return `${name} (${sign}${semitones})`
}
