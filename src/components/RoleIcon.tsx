/**
 * Position icons in the familiar League style: lanes are a square minimap with the lane in
 * bright fill, jungle a three-blade claw, support a winged chalice, all roles an asterisk.
 * Own drawings, filled with currentColor so they follow the button state.
 */
const DIM = 0.32

export function RoleIcon({ role, size = 20 }: { role: string; size?: number }) {
  let body
  switch (role) {
    case 'TOP':
      body = (
        <>
          <path d="M8.5 8.5H21V21H8.5z" fill="currentColor" fillOpacity={DIM} />
          <path d="M3 3h16l-3.5 3.5h-9v9L3 19z" fill="currentColor" />
          <rect x="10" y="10" width="4.5" height="4.5" fill="currentColor" />
        </>
      )
      break
    case 'BOTTOM':
      body = (
        <>
          <path d="M3 3h12.5v12.5H3z" fill="currentColor" fillOpacity={DIM} />
          <path d="M21 21H5l3.5-3.5h9v-9L21 5z" fill="currentColor" />
          <rect x="9.5" y="9.5" width="4.5" height="4.5" fill="currentColor" />
        </>
      )
      break
    case 'MIDDLE':
      body = (
        <>
          <path d="M3 3h12L3 15zM21 21H9l12-12z" fill="currentColor" fillOpacity={DIM} />
          <path d="M3 18.5L18.5 3H21v2.5L5.5 21H3z" fill="currentColor" />
        </>
      )
      break
    case 'JUNGLE':
      body = (
        <path
          fill="currentColor"
          d="M12 2.5c2.2 3 3 6.2 2.4 9.6-.4 2.6-1.3 5-2.4 9.4-1.1-4.4-2-6.8-2.4-9.4C9 8.7 9.8 5.5 12 2.5zM4 6.5c3 1.6 4.8 4 5.3 7.4.3 2.2.1 4.5.6 7.1-2.6-2-4.4-4-5.2-6.6-.7-2.4-.9-5.1-.7-7.9zM20 6.5c.2 2.8 0 5.5-.7 7.9-.8 2.6-2.6 4.6-5.2 6.6.5-2.6.3-4.9.6-7.1.5-3.4 2.3-5.8 5.3-7.4z"
        />
      )
      break
    case 'UTILITY':
      body = (
        <path
          fill="currentColor"
          d="M9.6 4h4.8l-1.1 3.6h-2.6zM1.5 7.2c3.4-.3 6.6.6 9 2.6l-1.8 3.3c-2.9-.6-5.2-2.6-7.2-5.9zM22.5 7.2c-2 3.3-4.3 5.3-7.2 5.9l-1.8-3.3c2.4-2 5.6-2.9 9-2.6zM10.4 10.6h3.2l-.3 7.4L12 21l-1.3-3z"
        />
      )
      break
    default:
      body = (
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 4.5v15M4.5 12h15M6.7 6.7l10.6 10.6M17.3 6.7L6.7 17.3" />
        </g>
      )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="role-icon">
      {body}
    </svg>
  )
}
