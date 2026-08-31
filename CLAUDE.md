# CLAUDE.md — footsie.ai Web Frontend

## Overview

Marketing landing page for footsie.ai — open infrastructure for the agentic economy. A single-page site built with vanilla HTML/CSS/JS (no frameworks). The hero section features a procedurally generated circular maze with animated pac-man style agent characters navigating its corridors.

## File Structure

```
web-frontend/
├── index.html           # Landing page (5 sections + nav)
├── styles.css           # Component styles & responsive layout
├── colors_and_type.css  # Design tokens (colors, type, spacing)
├── maze.js              # Maze SVG generator + agent animation engine
├── nav.js               # Mobile navigation toggle
├── README.md            # Public-facing project readme
├── LICENSE              # MIT
└── assets/
    ├── agent-teal.png       # Pixel-art agent sprite (teal)
    ├── agent-coral.png      # Pixel-art agent sprite (coral)
    ├── agent-amber.png      # Pixel-art agent sprite (amber)
    ├── agent-violet.png     # Pixel-art agent sprite (violet)
    └── maze-mark.svg        # Brand logo (navy/teal), also the favicon
```

Every maze on the page — hero, problem, how, you, and footer — is generated at
runtime from a `data-maze` attribute. There are no pre-rendered maze images.

## Page Sections

1. **Nav** — sticky header, glassmorphic blur, brand + links + CTA
2. **Hero** (`#top`) — dynamic SVG maze background, 10 animated agents, headline, CTA
3. **Problem** (`#problem`) — "stuck in someone else's maze?", 3 problem cards
4. **How** (`#how`) — "what footsie.ai does", 4 capability cards (teal/violet/coral/amber)
5. **You** (`#you`) — "your data, your agents, your rules", 3 value cards
6. **Footer** (`#cta`) — teal background, closing CTA, footer links

## Design System

### Brand Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--footsie-navy` | `#0F172A` | Wordmark body, headlines |
| `--footsie-teal` | `#0D9488` | Primary CTA, `.ai` suffix, accents |
| `--footsie-white` | `#FFFFFF` | Page background |

Full teal scale: `--footsie-50` (#f0fdfa) through `--footsie-900` (#134e4a).
Neutral gray scale: `--gray-50` (#f9fafb) through `--gray-900` (#111827).

### Agent Character Colors
These are for the pixel-art sprites only — never use on buttons, borders, or UI accents.
- Teal: `#0D9488` — Coral: `#F97066` — Amber: `#F59E0B` — Violet: `#8B5CF6`

### Typography
- **Primary font:** Outfit (weights 400/500/600 only — never Light or Bold)
- **Mono font:** JetBrains Mono (weights 400/500)
- **Headline scale:** `clamp(44px, 6.4vw, 88px)` hero, `clamp(32px, 4.4vw, 56px)` sections
- **Body:** 15-18px, line-height 1.55
- **Eyebrows:** 10-11px, 600 weight, 0.06-0.18em letter-spacing, uppercase

### Layout
- Container: `max-width: 1180px`, `padding: 0 32px`
- Section padding: 140-180px vertical
- Grid gaps: 20px
- Responsive breakpoint: 920px (grids → single column, nav collapses)

### Button System
- `.btn-primary` — teal bg, white text
- `.btn-on-teal` — white bg, teal text (for teal backgrounds)
- `.btn-ghost` — transparent with gray border
- Sizes: `.btn-sm` / `.btn-md` / `.btn-lg`

## Maze Engine (`maze.js`)

### Architecture
The maze is both a visual background AND a navigation graph for agents. `buildMaze()` produces both in a single pass, guaranteeing the paths agents walk match the drawn maze exactly.

**Key concept:** Drawn arcs and radial lines are WALLS. Agents move in CORRIDORS between walls (pac-man style). Gaps in ring arcs are doorways between adjacent corridors.

### `buildMaze(options)` Parameters
| Param | Type | Description |
|-------|------|-------------|
| `size` | number | SVG viewBox dimension (default 800) |
| `rings` | number | Concentric ring count (default 7) |
| `slots` | number | Angular divisions (default 12) |
| `stroke` | string | Wall color |
| `strokeW` | number | Wall thickness |
| `mode` | string | `"open"` or `"broken"` |
| `seed` | number | PRNG seed for deterministic layout |
| `center` | boolean | Draw "f" mark at center |
| `fStroke` | string | Center mark color |
| `opacity` | number | SVG opacity |
| `dotColor` | string | Corridor pellet dot color |

Returns `{ svg, nodes, adj }` — SVG string + navigation graph.

### Generation Algorithm
1. **Radial walls** — randomly placed within each corridor to create turns/dead-ends
2. **Ring gaps** — initial random gaps + connectivity pass ensuring every corridor segment has ≥1 gap on both bounding rings
3. **SVG rendering** — ring arcs (skipping gaps), radial wall lines, pellet dots
4. **Graph construction** — arc edges within corridors (blocked by radial walls), radial crossing edges at ring gaps

### Hero Maze Config
Declared **once**, on the hero element's `data-maze` attribute in `index.html`:
```json
{
  "size": 1400, "rings": 9, "stroke": "#c5e8e4", "strokeW": 12,
  "mode": "open", "seed": 7, "center": true, "fStroke": "#d5edea",
  "slots": 24, "dotColor": "#6ec4b8"
}
```
`animateHeroAgents()` reads that attribute to build the navigation graph, so the
maze the agents walk is always the maze that was drawn. Do NOT reintroduce a
second copy of this config in `maze.js` — that duplication previously meant any
edit to the attribute silently desynced the agents from the walls.

**Never hardcode the SVG's on-screen scale in `maze.js`.** `measure()` reads the
rendered `<svg>` rect from the DOM every frame. There used to be a
`CSS_SCALE = 1.3` constant mirroring `width: 130%`, but `.hero-maze-bg` is a
flex container and the default `flex-shrink` pulls the SVG back to 100% — so
the constant was 30% wrong and every agent was drawn on top of a wall instead
of in the corridor between walls. Measuring also means the CSS can change
freely without touching the JS.

### Pellet Dots
- **Arc corridor dots** — at every slot center on every corridor midpoint (5px, opacity 0.55)
- **Radial crossing dots** — 3-dot trail through each ring gap (at 25%, 50%, 75% of corridor-to-corridor distance)
- Dot color: `#6ec4b8` (distinct teal, separate from wall color)

### Generation Tuning (open mode)
- **Radial walls per corridor:** inner (c≤3): 1-2, outer (c>3): 2-3
- **Ring gaps per ring:** 4-5 (initial) + connectivity pass adds more as needed
- **Connectivity guarantee:** every corridor segment has ≥1 gap on both bounding rings

### Agent Animation
- **Agent count comes from the markup** — `maze.js` reads `.hero-agent` elements
  from `index.html` (currently 16). Add or remove elements there; speeds and PRNG
  seeds extend automatically
- **Two bands.** The first `INNER_COUNT` (5) agents go in a narrow inner band
  (corridors `BAND_MIN`..`BAND_MAX`, i.e. 4-5); the remaining 11 go on the rim
  (`RIM_MIN`..`RIM_MAX`, i.e. 6 to `rings - 1`). The rim deliberately holds the
  majority — the inner corridors pass behind the headline and paragraph
- **Start-node scoring puts angular spread first** (`-slotDist * 10`), with
  connectivity only breaking ties. The reverse weighting made every agent
  converge on the few best-connected junctions and look bunched
  - The inner band is kept narrow **on purpose**: spread over too many corridors,
    agents almost never share an edge and the collision bounce stops happening
  - Corridors 1-2 are avoided entirely — they sit behind the headline and its
    scrim, so agents there are invisible
  - Rim corridors exceed the hero's vertical bounds, so those agents patrol the
    left and right flanks of the circle
- **Smart start selection** — each agent picks the best-connected node on its target corridor (≥2 edges, prefers radial connections), no duplicates, only nodes inside the visible hero band
- **Speeds:** 28-42 px/s (amber fastest, violet slowest)
- **Per-agent PRNG** (distinct seeds) for independent turn decisions at intersections
- **Routing happens only at nodes** (`chooseNextEdge`): pick a forward edge with an on-screen destination; else reverse the way you came; else (stranded after resize) walk back toward the visible band. No per-frame boundary bounce.
- **Dead ends:** agent pauses 0.2s ("bonk"), flips, and walks back
- **Collision:** only when two agents share track (head-on on the same edge, or both converging on a node) within ~1 sprite width — never through walls; both reverse with no position jump + sparkle (3s per-pair cooldown)
- **Sprite size:** computed each frame from corridor clear width (clamped 22-42px) so agents always fit between walls; CSS 38px is the no-JS fallback
- **Pellet eating:** dots carry `data-dot` keys; agents dim dots they pass (opacity 0.06), dots restore after ~4s
- **Movement:** `t` interpolates [0,1] along current edge; arc edges curve, radial edges go straight; gentle sine bob added at render time only
- **Debug:** `?mazedebug=1` overlays the navigation graph on a canvas (red dots = isolated nodes) and logs invariant violations (off-midline, out-of-band) to the console

### Coordinate System
```
svgRect = <svg>.getBoundingClientRect()   // MEASURED, never assumed
base    = svgRect.width / 2               // px per (SVG_SIZE / 2) maze units
ox, oy  = svg centre - hero centre         // maze centre vs agent-layer centre
pixel_offset = node.rFrac * base + ox      // distance from centre in pixels
rFrac   = midR / (SVG_SIZE / 2)            // normalised corridor midpoint radius
```
Agent positions are relative to the hero center (CSS `top: 50%; left: 50%` + transform).
Dots and agents use identical radius/angle formulas — verified to 0.0000px alignment.

## Commands

```bash
# Serve locally
python3 -m http.server 8080

# No build step — vanilla HTML/CSS/JS
```

## Important Notes

- **No framework** — plain HTML/CSS/JS, no build tooling
- **Maze SVG is procedural** — generated at runtime by `maze.js`, not static files
- **All five mazes are procedural**, footer included. The pre-rendered maze PNGs
  were removed: they were 1.77 MB each and accounted for ~89% of page weight
- **Agent PNGs** must have transparent backgrounds (no white squares)
- **Outfit font** is loaded from Google Fonts via `<link>` in `index.html` (not an
  `@import` in CSS, which would block stylesheet parsing) — always pin to 400/500/600
- **`prefers-reduced-motion` is honoured** — `maze.js` places the agents statically
  and never starts the animation loop. Keep any new motion behind that check
- **The hero scrim is scaled down below 920px.** It's sized to the hero copy,
  which at narrow widths is nearly the whole hero — at full desktop strength it
  covered ~100% of the hero and ~200% of the maze, washing out the maze and
  every agent. Keep the mobile override if you touch `.hero-content::before`
- **Nav collapses to a toggle below 920px** (`nav.js`) — it must not simply be
  hidden, or phones get no navigation at all
- **No invented metrics.** The nav previously showed a fake relay counter and
  the hero a fake "14,328 agents · 92 relays · 1.2M records" line. Both were
  removed — don't reintroduce made-up figures. If real numbers become
  available, wire them to an endpoint rather than hardcoding
- The page references `#cta` for CTA scroll targets and uses anchor links for nav
