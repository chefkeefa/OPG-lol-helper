/**
 * Position icons in the familiar minimap style: the three lanes are drawn faintly and the
 * selected lane is highlighted (own drawings, not Riot's assets).
 */
const LANE = {
  TOP: 'M3.5 20.5V3.5h17',
  MIDDLE: 'M4.5 19.5l15-15',
  BOTTOM: 'M3.5 20.5h17v-17',
}

function Map({ hi }: { hi: keyof typeof LANE }) {
  return (
    <>
      <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="1.2" />
      {(Object.keys(LANE) as (keyof typeof LANE)[]).map((k) => (
        <path
          key={k}
          d={LANE[k]}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={k === hi ? 3.4 : 1.2}
          strokeOpacity={k === hi ? 1 : 0.2}
        />
      ))}
      {/* the lane's own corner / centre marker */}
      {hi === 'TOP' && <rect x="2" y="2" width="7" height="7" rx="1.2" fill="currentColor" />}
      {hi === 'BOTTOM' && <rect x="15" y="15" width="7" height="7" rx="1.2" fill="currentColor" />}
      {hi === 'MIDDLE' && <rect x="8.5" y="8.5" width="7" height="7" rx="1.2" transform="rotate(45 12 12)" fill="currentColor" />}
    </>
  )
}

export function RoleIcon({ role, size = 20 }: { role: string; size?: number }) {
  let body
  switch (role) {
    case 'TOP':
    case 'MIDDLE':
    case 'BOTTOM':
      body = <Map hi={role} />
      break
    case 'JUNGLE':
      // three claw marks
      body = (
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 4c1.5 5 1.2 10-1 16" />
          <path d="M12 3c1.6 6 1.6 12 0 18" />
          <path d="M18 4c-1.5 5-1.2 10 1 16" />
        </g>
      )
      break
    case 'UTILITY':
      // shield with a healing cross
      body = (
        <>
          <path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )
      break
    default:
      // all roles: the whole map with every lane lit
      body = (
        <>
          <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="1.2" />
          <path d={`${LANE.TOP}M${LANE.MIDDLE.slice(1)}M${LANE.BOTTOM.slice(1)}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="role-icon">
      {body}
    </svg>
  )
}
