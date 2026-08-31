# footsie.ai — landing page

A single-page marketing site built with vanilla HTML, CSS and JavaScript. No
framework, no build step, no dependencies — open `index.html` and it runs.

The hero is the reason this repository is interesting. It generates a circular
maze as SVG at runtime, then walks sixteen pixel-art agents through its corridors
like Pac-Man ghosts — turning at junctions, reversing at dead ends, bouncing off
each other, and eating pellets as they go.

![Vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e) ![No build step](https://img.shields.io/badge/build-none-brightgreen) ![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

---

## The maze engine

The interesting problem here is that the maze is **two things at once**: a
picture, and a map. If those two ever disagree — if an agent walks through a
drawn wall — the whole effect collapses.

`buildMaze()` solves this by producing both in a single pass:

```js
const { svg, nodes, adj } = buildMaze({ rings: 9, slots: 24, seed: 7 });
//      └── what you see    └────┬────┘
//                               └── where agents may walk
```

The key inversion: **the drawn arcs and lines are walls, not paths.** Agents
travel in the corridors *between* them. A gap in a ring arc is a doorway to the
next corridor; a radial line inside a corridor is a barrier that creates a turn
or a dead end.

Generation runs in four steps:

1. **Place radial walls** inside each corridor, to create turns and dead ends.
2. **Place ring gaps**, then run a connectivity pass — every corridor segment is
   guaranteed at least one gap on each of its bounding rings, so no agent can
   ever be sealed into a pocket.
3. **Render the SVG** — arcs (skipping gaps), radial walls, and pellet dots.
4. **Build the navigation graph** — arc edges along corridors, radial edges
   wherever a ring gap exists.

Because steps 3 and 4 read the same data, the picture and the map cannot drift
apart. Dots and agents use identical radius/angle formulas, so agents travel
exactly over the pellets.

### Agent behaviour

All routing happens at nodes, never mid-edge. Each agent picks a forward edge
whose destination is on-screen; failing that it reverses the way it came (the
Pac-Man dead-end turn, with a 0.2s "bonk" pause). Collisions only register when
two agents genuinely share track — head-on along one edge, or converging on the
same node — because a naive distance check would have them colliding *through*
walls, since corridors sit closer together than a sprite is wide.

### Debug overlay

Append `?mazedebug=1` to draw the navigation graph over the maze and log
invariant violations to the console:

```
http://localhost:8080/?mazedebug=1
```

Red dots mark isolated nodes. The console warns if any agent drifts off its
corridor midline or outside the visible band.

---

## Running it

There is no build step. Any static server will do:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## File structure

```
index.html           Landing page — nav + 5 sections
styles.css           Component styles and responsive layout
colors_and_type.css  Design tokens (colour, type, spacing, radii)
maze.js              Maze generator + agent animation engine
nav.js               Mobile navigation toggle
assets/              Agent sprites (PNG) and the brand mark (SVG)
```

Every maze on the page is declared in the markup and rendered at runtime:

```html
<div data-maze='{"size":1400,"rings":9,"seed":7,"slots":24}'></div>
```

`maze.js` mounts every `[data-maze]` element on load. The hero reads its config
from that same attribute to build the agent navigation graph, so there is one
source of truth per maze.

The agent layer measures the rendered `<svg>` rather than assuming how big CSS
made it. That matters more than it sounds: the corridors are only ~30px wide on
screen, so a scale assumption that is even slightly off puts every agent on a
wall instead of in the gap between two.

## Design system

Tokens live in `colors_and_type.css`.

| | |
|---|---|
| **Type** | Outfit (400/500/600 only — never Light or Bold), JetBrains Mono for metadata |
| **Brand** | Navy `#0F172A`, teal `#0D9488`, white |
| **Agent sprites** | Teal, coral `#F97066`, amber `#F59E0B`, violet `#8B5CF6` — sprites only, never UI |
| **Layout** | 1180px container, 920px breakpoint |

## Accessibility

- Body text meets WCAG AA contrast; small text uses `--footsie-700` rather than
  the lighter brand teal, which fails at 11px.
- `prefers-reduced-motion` is honoured — the maze still draws and the agents are
  placed, but the animation loop never starts.
- Visible focus rings, a skip link, a `<main>` landmark, and a keyboard-operable
  mobile menu (Escape closes it and returns focus).
- All decorative imagery is `aria-hidden` with empty `alt`.

## Notes

A few things are deliberately unfinished, since this is a design and front-end
exercise rather than a deployed product:

- **The network statistics are placeholder values.** "14,328 agents · 92 relays
  · 1.2M records" and the relay status indicator are illustrative figures for
  the design, marked as such in `index.html`. They are not live telemetry.
- **Several links point at `#`** — Docs, Blog, About and the footer navigation
  have no destinations yet.
- **No Open Graph image.** The meta tags are in place but `og:image` needs a
  real asset before the page is shared anywhere.

## Licence

MIT — see [LICENSE](LICENSE).
