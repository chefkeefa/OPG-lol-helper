// Connection to the local League client (LCU) and the in-game Live Client Data API.
// Both listen on 127.0.0.1 with Riot's self-signed certificate, so TLS checks are
// relaxed for these two local endpoints only.
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })

function request(port, pathname, { auth, method = 'GET', body, timeout = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        agent: localAgent,
        timeout,
        headers: {
          Accept: 'application/json',
          ...(auth ? { Authorization: 'Basic ' + Buffer.from(`riot:${auth}`).toString('base64') } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data = null
          try {
            data = text ? JSON.parse(text) : null
          } catch {
            data = text
          }
          if (res.statusCode >= 400) reject(Object.assign(new Error(`LCU ${res.statusCode} ${pathname}`), { status: res.statusCode, data }))
          else resolve(data)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// ---------- credentials ----------
function fromProcessList() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null)
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
      ],
      { windowsHide: true, timeout: 6000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const port = stdout.match(/--app-port=(\d+)/)?.[1]
        const token = stdout.match(/--remoting-auth-token=([\w-]+)/)?.[1]
        const dir = stdout.match(/--install-directory=([^"]+?)"?\s--/)?.[1]
        resolve(port && token ? { port: Number(port), token, dir } : null)
      },
    )
  })
}

function candidateDirs(saved) {
  const dirs = []
  if (saved) dirs.push(saved)
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
  try {
    const raw = fs.readFileSync(
      path.join(programData, 'Riot Games', 'Metadata', 'league_of_legends.live', 'league_of_legends.live.product_settings.yaml'),
      'utf8',
    )
    const m = raw.match(/product_install_full_path:\s*"?([^"\r\n]+)"?/)
    if (m) dirs.push(m[1])
  } catch {}
  for (const d of 'CDEFGH') dirs.push(`${d}:\\Riot Games\\League of Legends`)
  return dirs
}

function fromLockfile(saved) {
  for (const dir of candidateDirs(saved)) {
    try {
      const [, , port, token] = fs.readFileSync(path.join(dir, 'lockfile'), 'utf8').split(':')
      if (port && token) return { port: Number(port), token, dir }
    } catch {}
  }
  return null
}

class LeagueClient {
  constructor(store) {
    this.store = store
    this.creds = null
  }

  async connect() {
    if (this.creds) {
      try {
        await request(this.creds.port, '/riotclient/ux-state', { auth: this.creds.token, timeout: 1500 })
        return true
      } catch {
        this.creds = null
      }
    }
    const creds = (await fromProcessList()) || fromLockfile(this.store.get('leagueDir'))
    if (!creds) return false
    try {
      await request(creds.port, '/riotclient/ux-state', { auth: creds.token, timeout: 1500 })
    } catch {
      return false
    }
    this.creds = creds
    if (creds.dir) this.store.set('leagueDir', creds.dir)
    return true
  }

  async status() {
    const connected = await this.connect()
    if (!connected) return { connected: false, phase: 'None' }
    let phase = 'None'
    try {
      phase = await this.get('/lol-gameflow/v1/gameflow-phase')
    } catch {}
    return { connected: true, phase }
  }

  async get(pathname) {
    if (!this.creds && !(await this.connect())) throw Object.assign(new Error('League client is not running'), { status: 503 })
    return request(this.creds.port, pathname, { auth: this.creds.token })
  }

  async post(pathname, body) {
    return this.send('POST', pathname, body)
  }

  async send(method, pathname, body) {
    if (!this.creds && !(await this.connect())) throw Object.assign(new Error('League client is not running'), { status: 503 })
    return request(this.creds.port, pathname, { auth: this.creds.token, method, body })
  }
}

/** Live Client Data API — only answers while a game is running on this PC. */
async function liveGameData() {
  try {
    return await request(2999, '/liveclientdata/allgamedata', { timeout: 1200 })
  } catch {
    return null
  }
}

module.exports = { LeagueClient, liveGameData }
