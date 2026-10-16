// Rate-limited Riot API client shared by the interface and the background stats collector.
// Development and personal keys allow 20 requests/second and 100 requests/2 minutes, counted
// separately for every routing value (kr, euw1, europe, americas...), so each host gets its own
// budget and a busy region never holds up another. Interface requests jump the queue and the
// collector always leaves headroom for them.

const HOSTS = new Set([
  'americas', 'europe', 'asia', 'sea',
  'na1', 'br1', 'la1', 'la2', 'euw1', 'eun1', 'tr1', 'ru', 'me1',
  'kr', 'jp1', 'oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2',
])

class RiotClient {
  constructor(getKey, limits = { perSecond: 20, perTwoMinutes: 100 }) {
    this.getKey = getKey
    this.limits = limits
    /** per host: send times within the last two minutes, 429 back-off, last interface request */
    this.hosts = {}
    this.queue = []
    this.pumping = false
    this.sent = 0
  }

  setLimits(limits) {
    this.limits = limits
  }

  /** priority: 'high' for the interface, 'low' for the collector */
  request(host, path, priority = 'high') {
    if (!HOSTS.has(host) || typeof path !== 'string' || !path.startsWith('/')) return Promise.resolve({ status: 400, body: null })
    if (!this.getKey()) return Promise.resolve({ status: 401, body: { status: { message: 'No Riot API key' } } })
    return new Promise((resolve) => {
      const job = { host, path, priority, resolve }
      if (priority === 'high') {
        this.host(host).lastHigh = Date.now()
        this.queue.unshift(job)
      }
      else this.queue.push(job)
      // a pump waiting on another host's budget looks at the new job right away
      this.wake?.()
      this.pump()
    })
  }

  host(name) {
    return (this.hosts[name] ||= { stamps: [], blockedUntil: 0, lastHigh: 0 })
  }

  pendingLow() {
    return this.queue.filter((j) => j.priority === 'low').length
  }

  waitTime(job) {
    const now = Date.now()
    const h = this.host(job.host)
    h.stamps = h.stamps.filter((t) => now - t < 120_000)
    if (now < h.blockedUntil) return h.blockedUntil - now
    const lastSecond = h.stamps.filter((t) => now - t < 1000)
    if (lastSecond.length >= this.limits.perSecond) return 1000 - (now - lastSecond[0]) + 5
    // the collector stands aside on a host while the interface is loading something from it
    if (job.priority === 'low' && now - h.lastHigh < 20_000) return 1000
    // the collector keeps 40% of the 2-minute budget free, so pages and searches never queue behind it
    const cap = job.priority === 'low' ? Math.floor(this.limits.perTwoMinutes * 0.6) : this.limits.perTwoMinutes
    if (h.stamps.length >= cap) return 120_000 - (now - h.stamps[h.stamps.length - cap]) + 5
    return 0
  }

  async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.queue.length) {
        // the first job (in priority order) whose host has budget left; others keep their place
        let next = -1
        let wait = 1000
        for (let i = 0; i < this.queue.length; i++) {
          const w = this.waitTime(this.queue[i])
          if (w <= 0) {
            next = i
            break
          }
          wait = Math.min(wait, w)
        }
        if (next < 0) {
          await new Promise((r) => {
            const timer = setTimeout(r, Math.max(5, wait))
            this.wake = () => {
              clearTimeout(timer)
              r()
            }
          })
          this.wake = null
          continue
        }
        const [job] = this.queue.splice(next, 1)
        this.host(job.host).stamps.push(Date.now())
        this.sent++
        this.run(job)
      }
    } finally {
      this.pumping = false
    }
  }

  async run(job) {
    try {
      const r = await fetch(`https://${job.host}.api.riotgames.com${job.path}`, { headers: { 'X-Riot-Token': this.getKey() } })
      const retryAfter = Number(r.headers.get('retry-after') || 0)
      if (r.status === 429) {
        this.host(job.host).blockedUntil = Date.now() + (retryAfter || 5) * 1000
        // put it back and try again once the limit resets
        this.queue.unshift(job)
        this.pump()
        return
      }
      const body = await r.json().catch(() => null)
      job.resolve({ status: r.status, body, retryAfter })
    } catch (e) {
      job.resolve({ status: 502, body: { status: { message: String(e) } } })
    }
  }
}

/** Platforms whose match history lives on the same regional host share that host's budget. */
function regionalOf(platform) {
  if (['na1', 'br1', 'la1', 'la2'].includes(platform)) return 'americas'
  if (['kr', 'jp1'].includes(platform)) return 'asia'
  if (['oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(platform)) return 'sea'
  return 'europe'
}

module.exports = { RiotClient, regionalOf, HOSTS }
