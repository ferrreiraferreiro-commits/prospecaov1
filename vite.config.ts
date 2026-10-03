import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'
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

/**
 * Na Vercel, api/maps.ts vira a função /api/maps. No `npm run dev` não há Vercel:
 * este atalho chama a mesma função, com as variáveis do .env.local (inclusive GOOGLE_PLACES_KEY).
 */
function apiDev(): Plugin {
  return {
    name: 'xs-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/maps', async (req, res) => {
        const env = loadEnv(server.config.mode, process.cwd(), '')
        for (const k of ['GOOGLE_PLACES_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) if (env[k]) process.env[k] = env[k]
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const mod = (await server.ssrLoadModule('/api/maps.ts')) as typeof import('./api/maps')
        let code = 200
        const out = {
          status(c: number) {
            code = c
            return out
          },
          json(body: unknown) {
            res.statusCode = code
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
          },
        }
        await mod.default({ method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() }, out)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorker(), apiDev()],
  server: { port: Number(process.env.PORT) || 5180 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
