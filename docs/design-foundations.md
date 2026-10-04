# Design foundations

One design language for the Eudaimonai app and, once it is approved in the app,
for the website. Status: **built across the app, not yet committed**
(3 Oct 2026). Rejected along the way, so don't propose them again: grey
neutrals, a grainy "pigment" score panel, solid non-glass panels, a single
colour ring, and three-hue rings (white/ultramarine/neon green). "Apple
native" means type, structure, click feel and controls, not a new look.

## The idea in one sentence

Native Apple design (calm, precise, materials instead of effects) with one
quiet art moment and one WHOOP-like core: **one number per day, the Focus
Score, shown as a ring.**

This is a refinement of the dark ultramarine look Clemens chose (AGENTS.md §6),
not a new direction. The app stays dark. Nothing switches to light.

---

## 1. Tokens

All tokens live in `:root` in `src/App.css` under the `--ds-` prefix
("design system"), next to the older tokens they will eventually replace. New
or rebuilt components use only `--ds-*`. Older screens keep their legacy tokens
until they are migrated one at a time.

### Colour

The existing dark ultramarine world (navy grounds, glass panels). Clemens
likes this look; refine it, don't replace it.

| Token | Value | Use |
|---|---|---|
| `--ds-bg` | `#04060F` | Window ground |
| `--ds-surface` | `#080B1C` | Panel (solid) |
| `--ds-surface-raised` | `#0D1229` | Hovered row, popover body |
| `--ds-fill` | `rgba(122, 152, 255, 0.07)` | Control fill (segmented, secondary button) |
| `--ds-fill-strong` | `rgba(122, 152, 255, 0.14)` | Hover / selected control fill, ring track |
| `--ds-hairline` | `rgba(170, 186, 255, 0.11)` | Separators, panel edges |
| `--ds-hairline-strong` | `rgba(190, 204, 255, 0.2)` | Control edges, focus-adjacent |
| `--ds-label` | `#F5F7FF` | Primary text, numbers |
| `--ds-label-2` | `#B3BBDC` | Secondary text |
| `--ds-label-3` | `#8089B0` | Tertiary text, axis labels (≈5.5:1, the floor for small text) |
| `--ds-label-4` | `rgba(179, 187, 220, 0.3)` | Disabled only. Never for information |
| `--ds-accent` | `#2C46FF` | Ultramarine. Fills only: primary button, selected segment, ring of a live session |
| `--ds-accent-hover` | `#3B54FF` | Hover on accent fills |
| `--ds-accent-pressed` | `#2339D6` | Pressed accent fills |
| `--ds-accent-text` | `#8C9DFF` | Accent as **text** (links, text buttons). `#2C46FF` on dark is only ~3:1 |
| `--ds-focus-ring` | `rgba(140, 157, 255, 0.7)` | Keyboard focus outline |
| `--ds-good` / `--ds-warn` / `--ds-bad` | `#2FE3A8` / `#FFB340` / `#FF4D6A` | States only (attention bands, outcome, status). Never decoration |

Rules:

- **One accent.** Ultramarine marks the action and the current selection.
  Nothing else is blue. No light-blue surfaces, no blue-tinted panels.
- **Accent as text uses `--ds-accent-text`.** Solid `#2C46FF` is a fill colour.
- **Semantic colours mean a state.** The attention colours are shared with the
  session curve and timeline (high green, focused amber, low red, no signal
  grey, break hatched). Do not reuse them for decoration.

### Typography

SF Pro only, through the system stack. No other UI typeface. Monospace is not a
style: numbers use `font-variant-numeric: tabular-nums` instead.

| Token | Size / line / weight | Use |
|---|---|---|
| `--ds-type-score` | 64 / 1 / 300 | The Focus Score inside the ring. One per screen |
| `--ds-type-metric` | 30 / 1.1 / 400 | Key numbers (focus time, attention) |
| `--ds-type-title` | 22 / 1.2 / 650 | Screen title, if a screen needs one |
| `--ds-type-headline` | 15 / 1.35 / 600 | Panel titles |
| `--ds-type-body` | 13 / 1.5 / 400 | Body text, list rows (macOS body size) |
| `--ds-type-footnote` | 12 / 1.4 / 400 | Secondary detail under a value |
| `--ds-type-caption` | 11 / 1.3 / 500 | Axis labels, legends, badges |

- Large numbers are light (300–400). Titles are 600–700, and they stay small:
  hierarchy comes from weight and colour, not from making every heading huge.
- **Sentence case everywhere.** No uppercase labels with wide letter-spacing.
  The exception is nothing; if a label needs to be quieter, use `--ds-label-3`.
- Tracking: SF Pro sets its own optical tracking. Only the score (−0.03em) and
  metric numbers (−0.02em) get negative tracking.

### Spacing

4/8 grid. Use only: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64` px
(`--ds-space-1` … `--ds-space-16`, named by multiples of 4).

- Inside a panel: 20 px padding (24 at wide widths).
- Between panels: 16 px.
- Between a panel title and its content: 16 px.
- Screen edge: 32 px desktop, 16 px on narrow windows.

### Radii

Four sizes, nothing else:

| Token | Value | Use |
|---|---|---|
| `--ds-radius-sm` | 8 px | Badges, small controls, segmented thumb |
| `--ds-radius-md` | 12 px | Buttons, inputs, list rows, tooltips |
| `--ds-radius-lg` | 18 px | Panels, cards, sheets |
| `--ds-radius-full` | 999 px | Buttons, segmented controls, the ring |

Nested radii: an element inside a padded container uses the next size down.

### Materials

Materials are the macOS idea of surfaces: the window bar and floating layers
are translucent and blur what is behind them (`NSVisualEffectView`
"vibrancy"). Content panels are glass, as in Analytics.

| Token | Value | Use |
|---|---|---|
| `--ds-material-bar` | `rgba(4, 6, 15, 0.78)` + `backdrop-filter: blur(28px) saturate(170%)` | Window toolbar / app header |
| `--ds-material-popover` | `rgba(13, 19, 48, 0.82)` + same blur | Tooltips, menus, popovers |
| `--ds-shadow-float` | `0 12px 32px rgba(0, 0, 0, 0.45)` | Floating layers only |
| `--ds-glass` | faint ultramarine light from the top left over `rgba(13, 19, 48, 0.55)` | Panels |
| `--ds-glass-shadow` | hairline top highlight + soft drop shadow | Panels |
| `--ds-glass-inset` | `rgba(4, 6, 15, 0.38)` | Tiles, inputs, chips, secondary buttons inside a panel |
| `--ds-silver-line` / `--ds-silver-edge` | silver hairlines (22 % / 34 %) | Panel, tile, chip and secondary-button edges, the selected tab |
| `--ds-silver-text` | white → platinum → silver gradient, clipped to text | The score and the key numbers only |

Silver is the second material after glass: it marks what was measured (rings,
numbers, edges). Ultramarine stays the action colour.

- Panels: `--ds-glass`, `--ds-glass-shadow`, a 1 px `--ds-hairline` edge,
  `--ds-radius-lg`, `backdrop-filter: blur(18px)`. The faint light spot is the
  one permitted gradient on surfaces.
- Floating layers (tooltip, popover, sheet): material + `--ds-shadow-float` +
  a hairline.

### Motion

| Token | Value |
|---|---|
| `--ds-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` — the one curve, a short soft spring-like settle |
| `--ds-dur-fast` | 120 ms (hover, press) |
| `--ds-dur-base` | 220 ms (state change, tooltip) |
| `--ds-dur-slow` | 420 ms (entering content, ring fill) |

- Press: `transform: scale(0.97)` with `--ds-dur-fast`.
- Content enters with opacity plus at most 8 px of rise.
- **`prefers-reduced-motion: reduce` always wins:** no rise, no ring sweep, no
  bar reveal. Content renders in its final state.

---

## 2. Components

### Button

- **Primary:** `--ds-accent` fill, white 13/600 text, pill
  (`--ds-radius-full`), height 34 px, padding 0 20 px. Hover `--ds-accent-hover`, pressed
  `--ds-accent-pressed` + scale 0.97. One primary button per screen.
- **Secondary:** `--ds-glass-inset` with a `--ds-hairline-strong` inset
  edge, `--ds-label` text, same geometry.
- **Chip** (tags, durations, filters, presets): 32 px pill, `--ds-glass-inset`,
  12/600; selected = solid `--ds-accent`, white text.
- **Input:** 40 px, `--ds-radius-md`, `--ds-glass-inset`, hairline; focus = an
  accent edge plus a 3 px soft accent ring.
- The shared selectors live in the "Shared control layer" block at the end of
  `src/App.css`. New buttons should use `.ds-button-primary` or join that list,
  never get their own geometry.
- **Text button / link:** no fill, `--ds-accent-text`, 13/500.
- **Icon button:** 28 × 28, `--ds-radius-md`, transparent; `--ds-fill` on hover.
- Focus: 2 px `--ds-focus-ring` outline, 2 px offset. Never remove focus
  outlines without a replacement.
- No gradients, no glows, no inset highlights on any button.

### Pop-up button (`DsSelect`)

Visible pickers use `src/components/DsSelect.jsx`, not a native `<select>`:
the WebView's native menu fell back to a serif font and a grey sheet. It is
a 34 px glass pill with the value and a chevron; the menu is the popover
material with a check on the selected row and the accent on the hovered
one, arrow keys, Home/End, Enter/Space, Escape. Selects that tests drive as
native comboboxes (workspace editor properties) stay native and get the same
pill look via CSS.

### Segmented control

The Analytics control, shared everywhere: a pill track (`--ds-surface` with a
hairline), 3 px padding, and a solid `--ds-accent` thumb that glides to the
selected segment with `--ds-ease`. Selected text white, others `--ds-label-2`.
12/600 text, height 30 px.

### Panel

Glass (see Materials), hairline edge, `--ds-radius-lg`, 20–24 px padding. Title in
`--ds-type-headline`, optional one-line description in footnote/`--ds-label-2`
under it. Panels do not nest.

### Window structure (sidebar)

The app is a macOS source-list window (since 4 Oct 2026, after a design
review): `titleBarStyle: Overlay` puts the traffic lights over a translucent
sidebar (220 px) in the same deep night blue as the window (`--ds-bg`,
not a lighter translucent blue), content fills the rest of the window.

- **Sidebar:** Lab, Session, Workspace, Protection, Analytics, AI Companion
  (disabled, "Soon"). 30 px rows, SF-style line icons, the current item on
  `--ds-fill-strong`. Protection shows a status dot (green ready, amber needs
  attention). Footer: Reload (kept by request), Legal, build identity.
- **Toolbar:** each screen starts with one sticky row in the window material:
  title left (17/700), actions right. It is a `data-tauri-drag-region`, so it
  drags the window like a native title bar. No page-sized headings, no
  eyebrow labels, no Back buttons between main areas.
- **Keyboard and menu:** ⌘1–⌘5 switch areas, ⌘N opens a new session; the
  native menu gains a Go menu with the same shortcuts and "Legal Notice &
  Privacy" under Help (`src/lib/nativeAppMenu.js`, built on Tauri's default
  menu so the Edit menu keeps working). Leaving Protection with unsaved
  changes asks first (leave guard), wherever the navigation came from.
- **Cursor:** the arrow everywhere, as in Mac apps; no pointing hand on
  buttons.
- **Selection is quiet:** segmented controls, chips and tabs mark the chosen
  item with a lighter fill and a silver edge. Ultramarine is only for the one
  primary action of a screen (Start session, Save workspace, Done).
- **Accessibility:** "Increase contrast" strengthens hairlines and secondary
  text; "Reduce transparency" makes sidebar, toolbars and panels solid.
- **Hiding the sidebar:** the toggle in the sidebar, ⌃⌘S or Go > Toggle
  Sidebar collapses it to a 76 px icon rail (wide enough for the traffic
  lights). Hovering the rail opens the full sidebar as an overlay after a
  160 ms pause, without moving the content; keyboard focus opens it too.
  The choice is remembered per device (`eudaimonai_sidebar_collapsed`).
- **Narrow windows** (< 760 px) keep an icon-only sidebar.
- **Menu-bar extra:** a monochrome template image (`icons/tray-icon.png`),
  tinted by macOS. The app icon sits on Apple's grid (824 px body in a
  1024 px canvas with a soft shadow) so it matches Dock neighbours.

### Attention colours

Good attention is silver, only a problem is coloured: Deep Focus white
(`--ds-attn-deep`), high attention silver (`--ds-attn-high`), focused dark
silver (`--ds-attn-focused`), low attention amber (`--ds-attn-low`). Used by
the Lab field, the live ring, session curves, timelines and history rows.
Outcome colours (Done / Partial / Missed) and status colours stay separate.

### Durations

Summaries (Lab, Analytics overview, recent sessions) are rounded to the
minute with `formatDurationCompact` ("6h 10m"); detail views keep seconds.

### Ring (the Focus Score)

The product's central visual and, later, the logo. Chosen by Clemens on
3 Oct 2026 after four rounds of options: concept "11" (three thin nested
rings with the numbers beside them) in silver.

- **Lab:** three thin rings (stroke 2.8 on a 128 viewBox) around the score.
  Outer **white** = Focus time against the score's own weekday reference
  (80 min × elapsed weekdays), middle **silver** `#B4BBC6` = average
  attention / 100, inner **dark silver** `#6B7280` = Deep Focus / measured
  time. Clean flat 2D strokes (4.5 on a 128 viewBox): no gloss, shading or
  shadow. Clemens tried a lit "metal tube" version and found it too 3D; the
  metal look belongs to the app icon, the rings stay flat with clearly
  different tones.
- The three numbers stand on their own beside the ring, each in a glass tile
  whose left edge carries its ring's tone. No legend needed.
- **Session (live ring):** outer platinum = elapsed share of the planned
  session (no arc without a time limit), inner = live attention. Silver while
  attention is good; amber or red only when it carries a warning. In Deep
  Focus (the existing live Flow state) the inner ring turns white and
  breathes slowly (6 s). Presentation only; it never feeds scoring.
- **No value, no arc.** An unknown fraction draws only the track, and an
  absent score shows "—" (AGENTS.md §5).
- Arcs sweep in once with a short stagger; with reduced motion they render
  filled and the breathing stops.

### List

A list is one panel with rows separated by hairlines, like a macOS table:
rows are 44 px minimum, 13 px body text, secondary values in `--ds-label-2`
with tabular numbers, right-aligned. No per-row boxes or borders. Hover:
`--ds-fill` background on the row, `--ds-radius-md`.

### Icons

SF Symbols style: inline SVG, 1.5 px stroke at 16 px, round caps and joins,
`currentColor`. Chevrons for navigation (`chevron.left`, `chevron.right`), not
text arrows (`←`, `→`, `↗`). No emoji anywhere in the UI.

---

## 3. Voice

The interface speaks plainly. It names what the user cares about (time, focus,
sessions), not how the pipeline works (signals, ledgers, multipliers,
generations). AGENTS.md §5 still holds: never say more than was measured. A
plain word that overstates the data is worse than a technical one.
Concrete proposals: [`copy-plain-language.md`](copy-plain-language.md).

---

## 4. Uniqueness ("spice")

Quiet signatures, chosen 3 Oct 2026:

1. **The breathing ring:** see the live ring above. The only ambient motion
   in the app.
2. ~~One editorial line in New York~~ — built, then removed at Clemens'
   request on 3 Oct 2026, together with the routine score notes under the
   Lab score panel. The Lab now shows only real warnings there
   (`FocusScoreExplanation warningsOnly`); Analytics keeps the full
   explanation.
3. **The signature sound:** a soft two-note bell (D5→A5 at start, A5→D5 at the
   end), synthesised in `src/lib/signatureSound.js`, peak gain 0.05, about a
   fifth of the drift alert.

---

## 5. Forbidden

- Light app themes or light surfaces in the app.
- New colour worlds, second accent colours, light-blue fills.
- Neon glows: `text-shadow` glows, `box-shadow: 0 0 Npx <colour>` halos,
  glowing lines.
- Decorative gradients beyond the glass light spot, and gradient buttons.
- Uppercase labels with wide letter-spacing; monospace as a style.
- Text arrows and emoji as icons.
- Radii, font sizes or spacings outside the token lists.
- Inventing a visual direction (AGENTS.md §6, §8). Refinements go through
  Clemens with a screenshot first.

---

## 5b. App icon

A silver ring with a silver core on night blue `#080B1C`, rendered as lit
metal with a shallow, machined relief (chosen 4 Oct 2026 over a fully 3D and
a flat version). `docs/brand/render-silver-icon.py` reproduces it and a flat
variant for 16–32 px uses (favicon, small marks). Don't redraw it as flat
SVG gradients: that read as grey, which is why it was redone.

## 6. Website

The website uses the same tokens, type scale, ring and voice. Where the website
has light sections (see the landing mockup), only the colour tokens change; the
type scale, radii, motion, ring and component rules stay identical.

---

## 7. Status quo before this pass (3 Oct 2026)

What already fits: one ultramarine accent, a dark ground, SF Pro, shared
easing tokens, `prefers-reduced-motion` handling, and a single colour language
for attention bands.

What does not fit, measured in `src/App.css`:

- 95 glow declarations (`text-shadow`, coloured `0 0 Npx` halos), 43 gradients
  (radial "light spots" on every glass panel, gradient buttons).
- 55 uppercase labels and 24 monospace uses (eyebrows like "COMMAND / LAB",
  axis ticks, the clock, legends).
- 18 different border radii (2 to 20 px, plus 100 and 999), 32 font sizes
  (7 to 76 px, including 7, 8 and 9 px text that is hard to read) and 13 font
  weights.
- Three stacked override layers ("Screen polish", "less blue", "darker ground")
  re-style the same Lab selectors, so the final look is spread over 600 lines.
- Accent `#2C46FF` and `#7A98FF`/`#9BB0FF` used as text colours on dark.
- Text arrows (`←`, `→`, `↗`) as icons; the Session screen sets most of its
  styling inline (78 inline `style` objects).
