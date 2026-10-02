// Rate-limited Riot API client shared by the interface and the background stats collector.
// Development and personal keys allow 20 requests/second and 100 requests/2 minutes;
// interface requests jump the queue and the collector always leaves headroom for them.

const HOSTS = new Set([
  'americas', 'europe', 'asia', 'sea',
  'na1', 'br1', 'la1', 'la2', 'euw1', 'eun1', 'tr1', 'ru', 'me1',
  'kr', 'jp1', 'oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2',
])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class RiotClient {
  constructor(getKey, limits = { perSecond: 20, perTwoMinutes: 100 }) {
    this.getKey = getKey
    this.limits = limits
    this.stamps = []
    this.blockedUntil = 0
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
      if (priority === 'high') this.queue.unshift(job)
      else this.queue.push(job)
      this.pump()
    })
  }

  pendingLow() {
    return this.queue.filter((j) => j.priority === 'low').length
  }

  waitTime(priority) {
    const now = Date.now()
    this.stamps = this.stamps.filter((t) => now - t < 120_000)
    if (now < this.blockedUntil) return this.blockedUntil - now
    const lastSecond = this.stamps.filter((t) => now - t < 1000)
    if (lastSecond.length >= this.limits.perSecond) return 1000 - (now - lastSecond[0]) + 5
    // the collector keeps 15% of the 2-minute budget free for the interface
    const cap = priority === 'low' ? Math.floor(this.limits.perTwoMinutes * 0.85) : this.limits.perTwoMinutes
    if (this.stamps.length >= cap) return 120_000 - (now - this.stamps[this.stamps.length - cap]) + 5
    return 0
  }

  async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.queue.length) {
        const job = this.queue[0]
        const wait = this.waitTime(job.priority)
        if (wait > 0) {
          await sleep(Math.min(wait, 1000))
          continue
        }
        this.queue.shift()
        this.stamps.push(Date.now())
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
        this.blockedUntil = Date.now() + (retryAfter || 5) * 1000
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

function regionalOf(platform) {
  if (['na1', 'br1', 'la1', 'la2'].includes(platform)) return 'americas'
  if (['kr', 'jp1'].includes(platform)) return 'asia'
  if (['oc1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(platform)) return 'sea'
  return 'europe'
}

module.exports = { RiotClient, regionalOf, HOSTS }
