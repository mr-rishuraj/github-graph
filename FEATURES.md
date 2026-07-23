# GitHub Graph — Features

A local, AI-free dependency visualizer for any public GitHub repository.

---

## Core Analysis

- **AST-based parsing** — uses Babel to parse JS, TS, JSX, TSX files with full syntax support (including decorators, optional chaining, TypeScript generics, etc.)
- **CSS / SCSS parsing** — detects `@import` relationships between stylesheets
- **Python parsing** — detects `import` and `from ... import` statements
- **Import resolution** — resolves relative paths, barrel files (`index.js`), and path aliases
- **Export tracking** — records named exports, default exports, re-exports, and barrel re-exports
- **Dynamic import detection** — `import()` calls are tracked separately as a distinct edge type
- **No AI, no external APIs** — everything runs locally; GitHub is only used to download the repo zip

---

## Graph Visualization

- **Interactive ReactFlow canvas** — zoom, pan, drag nodes
- **Dagre hierarchical layout** — clean top-down (TB) or left-right (LR) directed layout
- **Async layout worker** — large graphs (500+ nodes) compute layout in a Web Worker to keep the UI responsive
- **Folder grouping mode** — groups nodes visually by their directory
- **Node types with color coding**
  - Page, Component, Hook, Context, Utility, API, Layout, Style, Asset, Config, Test
- **Edge types**
  - `imports` (solid), `re-exports` (dashed), `dynamic-import` (animated)
- **Edge legend** — always visible at the bottom of the canvas
- **MiniMap** — overview of the full graph with color-coded nodes
- **Zoom controls** — built-in zoom in/out/fit buttons

---

## Node Details

- **Click any node** to open a sidebar with:
  - File path (with one-click copy)
  - Type, language, and barrel badges
  - Lines of code, file size, import count, export count, used-by count
  - Named exports list (type, default flag)
  - Imports list — clickable, navigates to that node
  - Imported-by list — shows which files depend on this file
  - JSX components used inside the file
  - External npm packages imported (with specifier preview)
  - Direct link to the file on GitHub
- **Instability metric** — displayed as a color bar at the bottom of each node (green = stable, red = unstable), based on afferent/efferent coupling
- **Hotspot glow** — nodes imported by 5+ other files get a colored glow ring
- **Hover tooltip** — shows path, summary, instability, depth, and coupling metrics on hover

---

## Search & Filter

- **Search bar** — fuzzy search across all node labels and paths; highlights matches and focuses the camera on selection
- **Filter panel** — toggle visibility by file type (page, component, hook, etc.)
- **Edge type filter** — independently toggle imports, re-exports, and dynamic imports
- **Diff filter** — in diff mode, filter to show only Added / Removed / Changed / All nodes
- **Hide node** — right-click → hide a specific node from the graph
- **Show only connected** — right-click → hide everything except direct neighbors
- **Reset hidden** — restore all hidden nodes with one click

---

## Diff Mode (Branch Comparison)

- **Compare any two branches** of a repository
- **Color-coded diff status** on every node:
  - Green border + `+` badge → Added in branch B
  - Red dashed border + `-` badge → Removed in branch B
  - Amber border + `~` badge → Changed (imports or exports differ)
  - Dimmed → Unchanged
- **Diff summary badges** in the top bar — total added / removed / changed counts
- **Diff legend** on the canvas
- **Removed nodes are visible** — files deleted in branch B are still shown in the graph (with red styling)
- **Back from diff returns to the graph** — no data is lost when navigating back
- **Diff filter bottom sheet on mobile** — accessible via the Diff tab in the bottom bar

---

## Path & Cycle Analysis

- **Highlight reachable paths** — right-click a node → highlight all nodes reachable from it via BFS
- **Circular dependency detection** — automatically finds cycles; count shown in the stats panel
- **Focus cycle** — clicking a circular dep in stats highlights all nodes in the cycle and centers the camera
- **Arrow key navigation** — with a node selected, Arrow keys traverse to connected neighbors

---

## Stats Panel

- Total files, parsed files, edge count, analysis time
- File type breakdown (counts per type)
- Language breakdown
- Most imported files (top N by incoming edge count)
- Circular dependency list (clickable to focus cycle on canvas)
- Orphan files list (files with no imports and no importers)
- Dead exports count
- Average instability score

---

## Export

- **Export PNG** — renders the current canvas view as a high-res PNG (2×)
- **Export JSON** — full graph data (nodes, edges, metadata) as a `.json` file
- **Export Mermaid** — generates a `.mmd` Mermaid diagram (capped at 150 nodes with a note if truncated)

---

## Node Context Menu

Right-click any node to access:
- Focus node (center camera)
- Show only connected nodes
- Hide this node
- Reset all hidden nodes
- Highlight reachable paths from this node

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `?` | Open / close keyboard shortcuts modal |
| `f` | Fit graph to screen |
| `h` | Hide the selected node |
| `Esc` | Deselect / cancel highlight mode |
| `→` / `↓` | Navigate to an outgoing neighbor |
| `←` / `↑` | Navigate to an incoming neighbor |

---

## URL Sharing

- **Hash-based shareable links** — the repo URL is encoded in the page hash (`#repo=...`)
- **Auto-analyze on load** — opening a shared link immediately starts analysis
- **Copy link button** — one click to copy the current share URL to clipboard

---

## Recent Repos

- **Last 10 analyzed repos** stored in localStorage with node count and timestamp
- **One-click re-analyze** from the recent list
- **Export recent repos** — download list as JSON
- **Import recent repos** — restore a previously exported list

---

## GitHub Authentication

- **Sign in with GitHub (OAuth)** — unlocks analysis of private repositories
- Token is stored in localStorage and sent with API requests
- Sign out clears the token

---

## Mobile UI

- **Responsive top bar** — on small screens, secondary actions (Compare, Copy link, Auth, stats) collapse into a `...` overflow menu
- **Bottom navigation bar** — tabs for Search, Filter, Stats, and Diff (in diff mode)
- **Bottom sheets** — Filter, Stats, and Diff filter open as slide-up panels with a drag handle
- **Mobile search** — expands as a full-width overlay at the top of the canvas
- **Sidebar as bottom panel** — node detail sidebar slides up from the bottom on mobile (65 vh)
- **Safe area insets** — bottom bar respects iOS/Android notch/home indicator padding
- **Touch dismiss** — tapping outside a bottom sheet closes it

---

## Performance

- **Async Dagre layout** — runs in a Web Worker; UI stays interactive during computation
- **Layout debounce** — filter changes are debounced (60 ms) to avoid thrashing the layout engine
- **Large graph warning** — shown for graphs with 2000+ nodes, prompts the user to apply filters
- **Result caching** — backend caches analysis results by repo SHA to avoid re-downloading/re-parsing
- **Configurable file limit** — slider to set max files (100–5000) before starting analysis

---

## Configuration Options (Advanced)

- **Max files** — limit how many files are parsed (default 2000)
- **Skip test files** — exclude `*.test.*`, `*.spec.*`, and `__tests__` directories
- **Branch override** — analyze a specific branch from the input screen
