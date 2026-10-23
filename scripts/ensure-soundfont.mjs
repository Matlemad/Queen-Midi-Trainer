#!/usr/bin/env node
/**
 * Scarica MuseScore_General.sf3 (GM, basato su FluidR3) in public/soundfonts/
 * se non è già presente. Licenza: vedi public/soundfonts/README.md
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'soundfonts')
const outFile = join(outDir, 'MuseScore_General.sf3')
const URL =
  'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3'
const MIN_BYTES = 1_000_000

mkdirSync(outDir, { recursive: true })

// Copia worklet processor dal package (deve restare allineato alla versione npm)
const workletSrc = join(root, 'node_modules/spessasynth_lib/dist/spessasynth_processor.min.js')
const workletDst = join(root, 'public/spessasynth_processor.min.js')
if (existsSync(workletSrc)) {
  const { copyFileSync } = await import('node:fs')
  copyFileSync(workletSrc, workletDst)
  console.log('Worklet spessasynth copiato in public/')
}

if (existsSync(outFile) && statSync(outFile).size >= MIN_BYTES) {
  console.log(`Soundfont già presente (${(statSync(outFile).size / 1e6).toFixed(1)} MB)`)
  process.exit(0)
}

console.log('Download MuseScore_General.sf3…')
const res = await fetch(URL)
if (!res.ok || !res.body) {
  console.error(`Download fallito: HTTP ${res.status}`)
  process.exit(1)
}

await pipeline(Readable.fromWeb(res.body), createWriteStream(outFile))
console.log(`Salvato in ${outFile} (${(statSync(outFile).size / 1e6).toFixed(1)} MB)`)
