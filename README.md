# GitHub Graph

Visualize any public GitHub repository as an interactive dependency map. Parses JS/TS/JSX/TSX/Python source files using AST analysis — no AI, fully local.

![GitHub Graph screenshot](https://github.com/user-attachments/assets/placeholder)

## Features

- **AST-based analysis** — Babel parser for JS/TS, regex parser for Python. Detects imports, exports, re-exports, dynamic imports, barrel files.
- **Interactive graph** — Zoom, pan, search, filter by file type/edge type/folder. Select a node to see all its dependencies.
- **Metrics** — Instability, afferent/efferent coupling, circular dependency detection, dead export detection, most-imported files.
- **SHA-based caching** — Results are cached by commit SHA; re-analyzing the same commit is instant.
- **Monorepo support** — Reads `package.json` workspaces and `pnpm-workspace.yaml` to resolve inter-package imports.

## Quick start

```bash
# 1. Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install

# 2. Start both servers
cd ..
npm run dev          # or: cd backend && npm run dev  AND  cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and paste any GitHub repo URL.

## Docker (production)

```bash
# Build and run with docker-compose
docker-compose up --build

# Open http://localhost
```

Set `GITHUB_TOKEN` in your environment to avoid GitHub API rate limits:

```bash
GITHUB_TOKEN=ghp_xxx docker-compose up
```

## Configuration

Copy `.env.example` to `.env` in the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend port |
| `GITHUB_TOKEN` | — | GitHub PAT — increases rate limit from 60 to 5000 req/hr |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed frontend origins |
| `RATE_LIMIT_MAX` | `20` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds |
| `MAX_FILES` | `5000` | Maximum files to analyze per repo |

## Architecture

```
github-graph/
├── backend/          Node.js + Express + TypeScript
│   ├── src/
│   │   ├── scanner/          Download + extract zip, detect languages
│   │   ├── parser/           AST parsers (JS/TS, CSS, Python)
│   │   ├── analysis/         Relationship builder, summary generator
│   │   ├── graph/            Graph assembler + coupling metrics
│   │   ├── cache/            SHA-based result cache with LRU eviction
│   │   ├── config.ts         Environment config
│   │   └── logger.ts         Structured logger
│   └── openapi.yaml          API spec
│
└── frontend/         React + Vite + TypeScript + TailwindCSS
    └── src/
        ├── components/       UI: GraphCanvas, Sidebar, FilterPanel, StatsPanel, …
        ├── hooks/            useGraphLayout, useGroupedLayout, useDebounce, useRecentRepos
        ├── api/              SSE client with friendly error messages
        └── types/            Shared type definitions
```

## API

The backend exposes a REST API documented in [`backend/openapi.yaml`](backend/openapi.yaml).

Key endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analyze-stream?url=…` | SSE stream with real-time progress |
| `POST` | `/api/analyze` | Synchronous analysis (blocks) |
| `GET` | `/api/cache/stats` | Cache hit rate and disk usage |
| `DELETE` | `/api/cache/repo/:owner/:repo` | Invalidate cached results for a repo |
| `GET` | `/health/detailed` | Uptime, memory, cache stats |

## E2E Tests

Before running E2E tests for the first time, install Playwright browsers:

```bash
cd frontend && npx playwright install chromium
```

Then run:
```bash
cd frontend && npm run test:e2e
```

## Development

```bash
# Run tests (backend)
cd backend && npm test
cd backend && npm run test:coverage

# Type-check
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` | Focus search |
| `?` | Show all shortcuts |
| `Esc` | Deselect / clear highlights |
| `F` | Fit graph to viewport |
| `H` | Hide selected node |
| `↑↓←→` | Navigate between connected nodes |
| Right-click | Context menu on node |

## Supported languages

| Language | Imports | Exports | File type detection |
|---|---|---|---|
| JavaScript / TypeScript | ESM + CJS + dynamic | Named + default + re-exports | Full |
| JSX / TSX | ESM + CJS + dynamic | Named + default | Full |
| Python | import / from…import | def, class, \_\_all\_\_ | Partial |
| CSS / SCSS | `@import` | — | Style |
| JSON | — | — | Config |
