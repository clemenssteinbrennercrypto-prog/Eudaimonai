// SF Symbols-style line glyphs on a 16 px grid (1.5 px stroke). One set for
// the editor's object list and the workspace map, so the same device always
// looks the same.
export const WORKSPACE_GLYPH_PATHS = {
  monitor: <><rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" /><path d="M8 11.25v2.5M5.5 13.75h5" /></>,
  laptop: <><rect x="3" y="3.25" width="10" height="7.5" rx="1.25" /><path d="M1.25 12.75h13.5" /></>,
  camera: <><circle cx="8" cy="8" r="5.75" /><circle cx="8" cy="8" r="2" /></>,
  phone: <><rect x="4.75" y="1.25" width="6.5" height="13.5" rx="1.75" /><path d="M7.25 12.5h1.5" /></>,
  ipad: <><rect x="2.75" y="1.75" width="10.5" height="12.5" rx="1.75" /><path d="M7.25 12.25h1.5" /></>,
  keyboard: <><rect x="1.25" y="4.25" width="13.5" height="7.5" rx="1.5" /><path d="M4 7h.5M6.5 7h.5M9 7h.5M11.5 7h.5M5 9.25h6" /></>,
  mouse: <><rect x="4.5" y="1.75" width="7" height="12.5" rx="3.5" /><path d="M8 1.75v4" /></>,
  paper: <><path d="M4 1.75h5.5L12.5 4.75v9.5H4z" /><path d="M9.5 1.75v3h3M6 8h4.5M6 10.5h4.5" /></>,
  notebook: <><rect x="3.25" y="1.75" width="9.5" height="12.5" rx="1.25" /><path d="M5.75 1.75v12.5" /></>,
  book: <><path d="M8 4.25C6.5 3 4 2.75 1.75 3.25v9.5C4 12.25 6.5 12.5 8 13.75 9.5 12.5 12 12.25 14.25 12.75v-9.5C12 2.75 9.5 3 8 4.25z" /><path d="M8 4.25v9.5" /></>,
}

const FALLBACK_GLYPH = <rect x="3" y="3" width="10" height="10" rx="2" />

export function workspaceGlyphPaths(type) {
  return WORKSPACE_GLYPH_PATHS[type] || FALLBACK_GLYPH
}

export function deviceGlyph(type) {
  return <svg className="ds-icon" viewBox="0 0 16 16">{workspaceGlyphPaths(type)}</svg>
}
