import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useInView, type HTMLMotionProps, type Variants } from 'motion/react'
import { champIcon, itemIcon } from '../lib/ddragon'

// ---------- shared motion presets ----------
export const ease = [0.22, 1, 0.36, 1] as const
export const spring = { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 } as const

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}
export const fadeUp: Variants = {
  // transform and opacity only: they stay on the compositor, unlike an animated blur
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease } },
}

/** Panel with entrance animation (driven by a parent `stagger`) and a soft hover lift. */
export function Card({ className = '', children, hover = true, ...rest }: HTMLMotionProps<'section'> & { hover?: boolean }) {
  return (
    <motion.section
      variants={fadeUp}
      className={`card ${hover ? 'hoverable' : ''} ${className}`}
      whileHover={hover ? { y: -2, transition: { duration: 0.25, ease } } : undefined}
      {...rest}
    >
      {children}
    </motion.section>
  )
}

/** Image that falls back to a lettered tile when the CDN is unreachable, and fades in when loaded. */
export function Img({
  src,
  alt,
  size,
  radius = 8,
  className = '',
  style,
}: {
  src: string
  alt: string
  size: number
  radius?: number
  className?: string
  style?: CSSProperties
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading')
  const base: CSSProperties = { width: size, height: size, borderRadius: radius, flex: 'none', ...style }
  if (state === 'fail')
    return (
      <span className={`img-fallback ${className}`} style={{ ...base, fontSize: size * 0.36 }} title={alt}>
        {alt.slice(0, 2)}
      </span>
    )
  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      className={`img ${state === 'ok' ? 'loaded' : ''} ${className}`}
      style={base}
      onLoad={() => setState('ok')}
      onError={() => setState('fail')}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

/** Full-bleed background that fades in only once the image actually loads. */
export function Splash({ src, fallback, className = '', position = 'center 20%' }: { src: string; fallback?: string; className?: string; position?: string }) {
  const [ok, setOk] = useState(false)
  const [url, setUrl] = useState(src)
  useEffect(() => {
    setOk(false)
    setUrl(src)
    let off = false
    const i = new Image()
    i.onload = () => !off && setOk(true)
    // e.g. a chroma has no splash of its own: show the base art instead
    i.onerror = () => {
      if (off || !fallback || fallback === src) return
      const j = new Image()
      j.onload = () => {
        if (off) return
        setUrl(fallback)
        setOk(true)
      }
      j.src = fallback
    }
    i.src = src
    return () => {
      off = true
    }
  }, [src, fallback])
  src = url
  return (
    <motion.div
      className={`splash ${className}`}
      initial={false}
      animate={{ opacity: ok ? 1 : 0, scale: ok ? 1 : 1.04 }}
      transition={{ duration: 0.9, ease }}
      style={{ backgroundImage: ok ? `url(${src})` : undefined, backgroundPosition: position }}
    />
  )
}

export const Champ = ({ name, size = 32, radius, className }: { name: string; size?: number; radius?: number; className?: string }) => (
  <Img src={champIcon(name)} alt={name} size={size} radius={radius ?? Math.round(size / 4)} className={className} />
)

export const Item = ({ id, size = 22 }: { id: number; size?: number }) =>
  id ? <Img src={itemIcon(id)} alt={`#${id}`} size={size} radius={5} /> : <span className="item-empty" style={{ width: size, height: size }} />

/** Number that counts up to its value whenever it changes. */
export function Counter({ value, format = (v) => v.toFixed(0), className }: { value: number; format?: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const c = animate(prev.current, value, {
      duration: 0.9,
      ease,
      onUpdate: (v) => (el.textContent = format(v)),
    })
    prev.current = value
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  )
}

/** Sparkline whose line draws itself in when it scrolls into view; hovering shows each point's label and value. */
export function Sparkline({
  data,
  width = 130,
  height = 46,
  color = 'currentColor',
  stretch = false,
  dot = true,
  labels,
  format,
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  stretch?: boolean
  dot?: boolean
  /** one per point, e.g. "16 авг · Ahri"; enables the hover tooltip */
  labels?: string[]
  format?: (v: number) => string
}) {
  const id = useId()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true })
  const [hover, setHover] = useState<number | null>(null)
  if (data.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (width - 4) + 2, height - 4 - ((v - min) / span) * (height - 8)] as const)
  // smooth curve through the points (Catmull-Rom → Bézier)
  let line = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const [x3, y3] = pts[i + 2] ?? pts[i + 1]
    const t = 0.18
    line += ` C${x1 + (x2 - x0) * t},${y1 + (y2 - y0) * t} ${x2 - (x3 - x1) * t},${y2 - (y3 - y1) * t} ${x2},${y2}`
  }
  const [lx, ly] = pts[pts.length - 1]
  const interactive = Boolean(labels || format)
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    setHover(Math.round(ratio * (data.length - 1)))
  }
  const hp = hover !== null ? pts[hover] : null
  return (
    <span className={`spark-wrap ${stretch ? 'stretch' : ''}`} style={stretch ? undefined : { width, height }}>
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="spark"
        preserveAspectRatio={stretch ? 'none' : undefined}
        aria-hidden
        onMouseMove={interactive ? onMove : undefined}
        onMouseLeave={interactive ? () => setHover(null) : undefined}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.3" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={`${line} L${width - 2},${height} L2,${height} Z`}
          fill={`url(#${id})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="1.7"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: inView ? 1 : 0 }}
          transition={{ duration: 1.1, ease }}
        />
        {dot && !stretch && hover === null && (
          <motion.circle cx={lx} cy={ly} r="2.6" fill={color} initial={{ scale: 0 }} animate={{ scale: inView ? 1 : 0 }} transition={{ delay: 1, ...spring }} />
        )}
        {hp && <line x1={hp[0]} x2={hp[0]} y1={0} y2={height} className="spark-cursor" vectorEffect="non-scaling-stroke" />}
        {interactive && <rect x={0} y={0} width={width} height={height} fill="transparent" />}
      </svg>
      <AnimatePresence>
        {hp && hover !== null && (
          <>
            <span className="spark-dot" style={{ left: `${(hp[0] / width) * 100}%`, top: `${(hp[1] / height) * 100}%`, background: color }} />
            <motion.span
              className="spark-tip"
              style={{ left: `${(hp[0] / width) * 100}%`, top: `${(hp[1] / height) * 100}%`, x: '-50%', y: 'calc(-100% - 10px)' }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {labels?.[hover] && <em>{labels[hover]}</em>}
              <b>{format ? format(data[hover]) : data[hover].toFixed(1)}</b>
            </motion.span>
          </>
        )}
      </AnimatePresence>
    </span>
  )
}

/** Circular gauge 0–100 that sweeps in. */
export function Ring({ value, size = 40, stroke = 3, color, children }: { value: number; size?: number; stroke?: number; color: string; children?: ReactNode }) {
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--ring-track)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v / 100) }}
          transition={{ duration: 1, ease, delay: 0.15 }}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  )
}

/** Pill-shaped segmented control with a sliding highlight. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
  className = '',
}: {
  options: { id: T; label: ReactNode; title?: string }[]
  value: T
  onChange: (v: T) => void
  id: string
  className?: string
}) {
  return (
    <div className={`segmented ${className}`}>
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)} title={o.title}>
          {o.id === value && <motion.span layoutId={`seg-${id}`} className="seg-bg" transition={spring} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export const Skeleton = ({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) => (
  <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} />
)

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}

export type IconName = keyof typeof PATHS

const PATHS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 20h8" />,
  film: <path d="M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4" />,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  swords: <path d="M14 4h6v6L9 21l-3-3zM4 14l6 6M3 21l3-3" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  key: <path d="M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7z" />,
  arrow: <path d="M7 17L17 7M9 7h8v8" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  min: <path d="M5 12h14" />,
  max: <path d="M5 5h14v14H5z" />,
  restore: <path d="M8 8h11v11H8zM5 16V5h11" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M7 5l12 7-12 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" />,
  video: <path d="M3 6h12v12H3zM15 10l6-3v10l-6-3" />,
  rec: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  tv: <path d="M3 6h18v12H3zM8 21h8M12 18v3M9 2l3 4 3-4" />,
  box: <path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" />,
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  scissors: <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 7.5L20 19M8.5 16.5L20 5" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />,
  target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01" />,
  pie: <path d="M12 3v9h9a9 9 0 1 1-9-9zM15 3.5A9 9 0 0 1 20.5 9H15z" />,
  check: <path d="M5 12l5 5L20 7" />,
  info: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5" />,
  sliders: <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />,
  users: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6" />,
  wand: <path d="M4 20L15 9M14 4v2M19 9h2M17.5 5.5L19 4M18 13l1.5 1.5M10 5.5L8.5 4M15 9l-2-2" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  medal: <path d="M8 3h8l-2 6h-4zM12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 12.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" />,
  brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />,
}

/** iOS-style toggle with a springy knob. */
export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch-row block">
      <span>
        {label}
        {hint && <em className="muted small">{hint}</em>}
      </span>
      <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on}>
        <motion.i layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </button>
    </label>
  )
}
