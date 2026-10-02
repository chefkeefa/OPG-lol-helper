import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite'
import react from '@vitejs/plugin-react'

// Riot API не отдаёт CORS-заголовки, поэтому браузер ходит в него через этот
// локальный прокси: /riot/<host>/<path> -> https://<host>.api.riotgames.com/<path>
const HOSTS = new Set([
  'americas', 'europe', 'asia', 'sea',
  'na1', 'br1', 'la1', 'la2', 'euw1', 'eun1', 'tr1', 'ru', 'me1',
  'kr', 'jp1', 'oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2',
])

function riotProxy(serverKey: string | undefined): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/riot/')) return next()
    res.setHeader('content-type', 'application/json')
    if (req.url === '/riot/_config') {
      res.end(JSON.stringify({ serverKey: Boolean(serverKey) }))
      return
    }
    const m = req.url.match(/^\/riot\/([a-z0-9]+)(\/.*)$/)
    if (!m || !HOSTS.has(m[1])) {
      res.statusCode = 400
      res.end(JSON.stringify({ status: { message: 'Unknown routing host' } }))
      return
    }
    const key = serverKey || (req.headers['x-riot-key'] as string | undefined)
    if (!key) {
      res.statusCode = 401
      res.end(JSON.stringify({ status: { message: 'No Riot API key' } }))
      return
    }
    try {
      const r = await fetch(`https://${m[1]}.api.riotgames.com${m[2]}`, {
        headers: { 'X-Riot-Token': key },
      })
      res.statusCode = r.status
      const retry = r.headers.get('retry-after')
      if (retry) res.setHeader('retry-after', retry)
      res.end(Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      res.statusCode = 502
      res.end(JSON.stringify({ status: { message: String(e) } }))
    }
  }
  return {
    name: 'riot-proxy',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [react(), riotProxy(env.RIOT_API_KEY)],
    server: { port: 5173, open: true },
  }
})
