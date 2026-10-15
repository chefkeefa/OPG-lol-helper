import type { LiveData } from './types'
import type { StatsDetail, StatsStatus, StatsSummary, BuildPayload, Recording, Benchmarks, DraftData, DraftSession, MayhemData, AugTiers, AugOverlayState, WorldData } from './lib/statsTypes'

interface RiotResult {
  status: number
  body: unknown
  retryAfter?: number
}

export type OverlayWidget = 'timers' | 'bench' | 'gold' | 'respawn' | 'skills' | 'scout'

export interface DesktopSettings {
  riotApiKey: string
  myRiotId: string
  lang: 'ru' | 'en'
  platform: string
  overlayEnabled: boolean
  overlayCorner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  overlayBenchmark: boolean
  /** which in-game widgets are on */
  overlayWidgets: Record<OverlayWidget, boolean>
  /** widget positions as fractions of the screen, set in the overlay editor */
  overlayLayout: Partial<Record<OverlayWidget, { x: number; y: number }>>
  collectorEnabled: boolean
  collectorPlatform: string
  autoOpenChampion: boolean
  autoImportRunes: boolean
  autoImportItems: boolean
  autoImportSpells: boolean
  recordingEnabled: boolean
  recordingFolder: string
  recordingQuality: 'high' | 'medium' | 'low'
  recordingFps: number
  recordingResolution: string
  recordingAudio: boolean
  recordingSource: 'screen' | 'window'
  recordingMaxGB: number
  /** full game, or only a reel of the moments picked below */
  recordingMode: 'full' | 'highlights'
  hlMultikill: number
  hlSteal: boolean
  hlFight: boolean
  hlAce: boolean
  hlObjective: boolean
  hlKill: boolean
  hlDeath: boolean
  hlBefore: number
  hlAfter: number
  hlKeepFull: boolean
  /** replay buffer: Ctrl+Shift+S keeps the last bufferSeconds */
  recordingBuffer: boolean
  bufferSeconds: number
  collectMayhem: boolean
  augmentsEnabled: boolean
  discordWebhook: string
  discordGameAlerts: boolean
}

export interface ClientStatus {
  connected: boolean
  phase: string
}

type Off = () => void
export type SkinLog = { games: { champ?: string; key?: number; num: number; at: number }[] }
export type UpdateState = { state: 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'; version: string; error?: string }
type Result = { ok: boolean; error?: string }

declare global {
  interface Window {
    /** Present only inside the desktop (Electron) build */
    rp?: {
      window: { minimize(): void; maximize(): void; close(): void; onState(cb: (s: { maximized: boolean }) => void): Off }
      version(): Promise<string>
      settings: { get(): Promise<DesktopSettings>; set<K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]): Promise<boolean> }
      riot(host: string, path: string): Promise<RiotResult>
      skins: { get(): Promise<SkinLog>; onUpdate(cb: (s: SkinLog) => void): Off }
      cache: { read(): Promise<Record<string, MatchSummary>>; write(d: Record<string, MatchSummary>): Promise<boolean>; clear(): Promise<boolean> }
      lcu: {
        status(): Promise<ClientStatus>
        get<T = unknown>(path: string): Promise<T>
        onStatus(cb: (s: ClientStatus) => void): Off
        onChampSelect(cb: (p: { championId: number; position: string }) => void): Off
      }
      live: { get(): Promise<LiveData | null>; on(cb: (d: LiveData | null) => void): Off }
      overlay: {
        toggle(): Promise<boolean>
        /** turn the overlay editor on or off (Alt+B); resolves to the new state */
        edit(on?: boolean): Promise<boolean>
        setBenchmarks(b: Benchmarks): void
        onBenchmarks(cb: (b: Benchmarks) => void): Off
        onEdit(cb: (on: boolean) => void): Off
        onScout(cb: (on: boolean) => void): Off
        onSettings(cb: (s: DesktopSettings) => void): Off
      }
      stats: {
        status(): Promise<StatsStatus>
        summary(patches?: string[]): Promise<StatsSummary>
        detail(champ: string, role: string, patches?: string[]): Promise<StatsDetail>
        draft(patches?: string[]): Promise<DraftData>
        mayhem(patches?: string[]): Promise<MayhemData>
        world(patches?: string[]): Promise<WorldData>
        onUpdate(cb: () => void): Off
      }
      aug: { tiers(champ?: string): Promise<AugTiers>; onState(cb: (s: AugOverlayState) => void): Off }
      draft: { get(): Promise<DraftSession | null>; onSession(cb: (s: DraftSession | null) => void): Off }
      build: {
        import(what: 'runes' | 'items' | 'spells', build: BuildPayload): Promise<Result>
        onAutoImport(cb: (r: { champion: string; ok: boolean; done?: string[]; error?: string }) => void): Off
      }
      discord(url: string, payload: { content?: string; embeds?: unknown[] }): Promise<Result>
      replay: {
        state(gameId: number): Promise<{ ok: boolean; state?: string; progress?: number; error?: string }>
        run(what: 'download' | 'watch' | 'folder', gameId: number): Promise<Result>
      }
      spectate(puuid: string, name: string): Promise<Result>
      update: {
        state(): Promise<UpdateState>
        install(): Promise<void>
        check(): Promise<void>
        onState(cb: (s: UpdateState) => void): Off
      }
      rec: {
        list(): Promise<Recording[]>
        status(): Promise<{ recording: boolean; folder: string }>
        remove(id: string): Promise<boolean>
        clip(id: string, start: number, end: number, label?: string): Promise<string>
        open(file?: string): Promise<void>
        toggle(): Promise<boolean>
        onState(cb: (s: 'recording' | 'idle') => void): Off
        /** keep the last bufferSeconds of the recording in progress */
        mark(): Promise<boolean>
        /** the buffer hotkey was pressed: true when a moment was saved */
        onMark(cb: (ok: boolean) => void): Off
      }
    }
  }
}
