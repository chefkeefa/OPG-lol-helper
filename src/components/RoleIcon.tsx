/** Simple lane glyphs (own drawings, not Riot's assets). */
const D: Record<string, string> = {
  ALL: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  TOP: 'M4 4h12l-4 4H8v4l-4 4zM20 8v12H8l4-4h4v-4z',
  JUNGLE: 'M12 3c-1 5-5 6-5 11a5 5 0 0 0 10 0c0-5-4-6-5-11zM12 21v-6',
  MIDDLE: 'M4 16l12-12h4v4L8 20H4zM4 4h6l-6 6zM20 20h-6l6-6z',
  BOTTOM: 'M20 20H8l4-4h4v-4l4-4zM4 16V4h12l-4 4H8v4z',
  UTILITY: 'M9 4h6l-1 4h-4zM4 9l8 2 8-2-4 5H8zM12 13v8',
}

export function RoleIcon({ role, size = 20 }: { role: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={D[role] ?? D.ALL} />
    </svg>
  )
}
