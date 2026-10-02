/** Small line glyphs for the neutral objectives (dragon, baron, herald, grubs). */
export function ObjectiveGlyph({ id }: { id: string }) {
  const d: Record<string, string> = {
    dragon: 'M4 14c3-1 4-5 8-6 3-1 6 1 8 3-2 0-3 1-4 2 1 2 0 5-3 6-1-2-3-2-5-1-1-2-2-3-4-4z',
    elder: 'M4 14c3-1 4-5 8-6 3-1 6 1 8 3-2 0-3 1-4 2 1 2 0 5-3 6-1-2-3-2-5-1-1-2-2-3-4-4z',
    baron: 'M12 3c3 2 6 5 6 9a6 6 0 0 1-12 0c0-4 3-7 6-9zM9 12h.01M15 12h.01',
    herald: 'M12 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12 9v3l2 2',
    grubs: 'M6 14a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM12 10a3 3 0 1 1 6 0 3 3 0 0 1-6 0z',
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d[id]} />
    </svg>
  )
}
