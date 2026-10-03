import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * O MapLibre desenha o mapa num Web Worker que importa um módulo compartilhado.
 * Servimos os dois arquivos, sem empacotar, em /maplibre/ (dev e build).
 */
function maplibreWorker(): Plugin {
  const dir = path.resolve(__dirname, 'node_modules/maplibre-gl/dist')
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'xs-maplibre-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/maplibre\/([\w.-]+\.mjs)/)?.[1]
        if (!name || !files.includes(name)) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(fs.readFileSync(path.join(dir, name)))
      })
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: 'asset', fileName: `maplibre/${name}`, source: fs.readFileSync(path.join(dir, name)) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorker()],
  server: { port: Number(process.env.PORT) || 5180 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
