import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const midiDir = path.resolve(rootDir, 'public/midi')
const manifestPath = path.resolve(rootDir, 'src/midi-manifest.json')

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.(mid|midi)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function writeMidiManifest(): string[] {
  fs.mkdirSync(midiDir, { recursive: true })
  const files = fs
    .readdirSync(midiDir)
    .filter((f) => /\.(mid|midi)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'it'))

  const manifest = files.map((filename) => ({
    id: filename,
    name: titleFromFilename(filename),
    url: `/midi/${encodeURIComponent(filename)}`,
  }))

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return files
}

function midiManifestPlugin(): Plugin {
  return {
    name: 'midi-manifest',
    buildStart() {
      writeMidiManifest()
    },
    configureServer(server) {
      writeMidiManifest()
      server.watcher.add(midiDir)
      const refresh = (file: string) => {
        if (!file.includes(`${path.sep}midi${path.sep}`) && !file.endsWith(`${path.sep}midi`)) {
          return
        }
        writeMidiManifest()
        const mod = server.moduleGraph.getModuleById(manifestPath)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
        }
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
      server.watcher.on('change', refresh)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), midiManifestPlugin()],
  server: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true,
  },
})
