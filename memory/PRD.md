# Diffractograph — Powder XRD Viewer

## Original problem statement
> Baue mir eine app, die lokal auf einem Windows pC läuft, in Python geschrieben ist und Pulver XRD Daten aus .xy oder .raw files graphisch darstellt

User clarifications:
- Platform: Web app (FastAPI + React, runs locally in browser)
- Formats: `.xy` only for now
- Features: multi-pattern overlay, smoothing, background subtraction, **reference patterns as droplines/sticks**
- Delivery: web

## Architecture
- **Backend**: FastAPI + scipy + numpy. Three endpoints under `/api/xrd/`:
  - `POST /xrd/parse`  — uploads .xy text, returns `{name, x, y, points, x_min, x_max, y_max}`
  - `POST /xrd/smooth` — Savitzky-Golay smoothing
  - `POST /xrd/background` — SNIP background subtraction
- **Frontend**: React 19 + Plotly.js (basic-dist-min) + Tailwind. Single-page layout with sidebar (file controls per pattern) and main plot area.
- **No DB / no auth**: state lives in React, processing in scipy.

## Implemented (2026-02-02)
- .xy / .xye / .txt / .dat parser (skips comments, accepts whitespace/comma/tab)
- Multi-file drag-and-drop + button upload
- Per-pattern controls: visibility, color picker, name edit, remove, line vs droplines/sticks mode, y-offset slider, scale slider, smooth, background subtract, reset-to-raw
- Plot: Plotly with dark theme, scroll-zoom, drag-pan, double-click reset, hover tooltips with 2θ/I
- Reference patterns rendered as droplines (sparse vertical sticks from baseline)
- CSV and PNG export of all patterns
- Toast notifications for success/error
- Distinct visual identity: amber/teal/coral/violet on #0a0d14, Manrope + JetBrains Mono fonts, surface cards with color-accented left borders

## Backlog
- P1: support `.raw` files via xylib (Bruker / Rigaku / Philips)
- P1: peak picking with adjustable threshold
- P2: axis switching (2θ ↔ d-spacing ↔ q) — needs wavelength input
- P2: drag-to-reorder patterns, save/restore session as JSON
- P2: PDF/SVG export, dark/light theme toggle
- P3: ICSD/COD reference card lookup, hkl labels on droplines

## Test credentials
N/A — no auth.
