# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Digital Level is the frontend dashboard for the Binance Sentinel ecosystem. It provides operator and investor dashboards for monitoring P2P arbitrage operations, tracking profits, managing bank accounts, and analyzing performance metrics. Hosted at digitalevel.com and deployed as a static site.

## Common Commands

```bash
# Development
npm run dev              # Start Astro dev server with hot-reload (localhost:4321)
npm run build            # Compile TypeScript and build for production → ./dist/
npm run preview          # Preview production build locally
npm run astro            # Astro CLI (astro add, astro check, etc.)
```

No test runner is configured. Type checking is done via `astro check` or the TypeScript compiler.

## Architecture

### Technology Stack
- **Framework**: Astro 5 (static site generator, ES modules, strict TypeScript)
- **Styling**: Tailwind CSS 3 with custom theme (`binance-yellow: #F3BA2F`, dark backgrounds)
- **Interactivity**: React 19 (complex components), Alpine.js (lightweight toggles)
- **Charts**: Chart.js 4
- **Other**: Flatpickr (date picker), html2pdf.js (PDF export), EmailJS (contact forms)

### Pages (`src/pages/`)
| Route | File | Access |
|-------|------|--------|
| `/` | `index.astro` | Public — marketing homepage |
| `/login` | `login.astro` | Public — multi-role auth (operator, investor, admin) |
| `/dashboard` | `dashboard/index.astro` | Authenticated — operator KPI dashboard |
| `/investor` | `investor.astro` | Authenticated — investor portfolio |
| `/calculadora` | `calculadora.astro` | Public — P2P arbitrage calculator |

### Layouts (`src/layouts/`)
- **`Base.astro`**: Global HTML wrapper (head, GTM, EmailJS init, footer)
- **`DashboardLayout.astro`**: Dashboard-specific wrapper with sticky header and sidebar

### Components (`src/components/`)
Organized by page. Dashboard-specific components are under `src/components/dashboard/`. Key ones:
- `SidebarMonitor.astro` — Live sync status and per-bank promise monitor (Parseo 2.0)
- `BalanceLedger.astro` — Paginated transfer history with parseo rows
- `Bancos.astro` — Bank spend limits and pago móvil controls
- `profit.astro`, `operaciones.astro`, `comisiones.astro` — KPI metric cards

### Client-Side Scripts (`src/scripts/`)
Dashboard logic lives in **vanilla JS modules** (not bundled by a framework), loaded directly from Astro pages:

```
src/scripts/
├── dashboard.js              # Orchestrates all dashboard modules, handles KPI range filtering
├── investor-logic.js         # Investor data fetch and UI updates
└── dashboard/                # Modular sub-scripts (each owns one widget)
    ├── utils.js              # Shared formatters: fUSDT, fVES, fVESInline, DOM injection
    ├── profit.js             # Profit KPI UI
    ├── operaciones.js        # Operations metrics
    ├── comisiones.js         # Commission breakdown
    ├── balanceLedger.js      # Ledger pagination, parseo row rendering, settlement highlighting
    ├── SidebarMonitor.js     # Sidebar bank cards, promise summary (buildPromiseSummaryByBank)
    ├── bancos.js             # Bank limits, favorites
    ├── p2p.js                # P2P order metrics
    ├── pay.js                # Pay transaction data
    ├── activeAds.js          # Active P2P order listings
    ├── proyecciones.js       # Profit projections
    ├── comisionOp.js         # Operator/dispersor residual panel
    ├── payrollWithdrawals.js # Withdrawal history
    └── utils.js              # Shared helpers
```

### Backend Integration (`binance-sentinel` — port 3003)
The frontend calls the binance-sentinel REST API. API base is resolved in this order:
1. `import.meta.env.PUBLIC_API_URL`
2. `localStorage.getItem('api_base')`
3. `window.location.origin` (same-origin in production)
4. `http://localhost:3003` (dev fallback)

Key endpoints:
- `POST /api/auth/login` — returns JWT + role
- `GET /api/kpis` — all KPI metrics (profit, ops, wallets, judge insights, config)
- `GET /api/transfers` — balance ledger with pagination
- `GET /api/p2p/ads/active` — live P2P ads
- `GET /api/payroll/summary` / `GET /api/payroll/withdrawals` — payroll data

Authentication: JWT stored in `sessionStorage` as `auth_token`, passed as `Authorization: Bearer <token>`.

### State Management
- **`sessionStorage`**: Auth token, user role, operator alias (per-tab isolation)
- **`localStorage`**: API base URL, KPI date range filter preference
- **DOM injection**: KPI metrics are updated via direct `textContent` writes (no virtual DOM for dashboard updates)
- **React state**: Only for interactive UI components (Navbar, modals)

## Key Concepts

### Parseo 2.0 (P2P Promise System)
The balance ledger and sidebar monitor implement a promise-tracking system:
- **DISPERSOR_PENDING** row: Synthetic row in `balanceLedger.js` built from `kpis.judge.dispersor`; shows total promise, local coverage, and external pending
- **`buildPromiseSummaryByBank()`** in `SidebarMonitor.js`: Groups open SpreadVerdicts by bank to show per-bank promise status (Prometido / Pendiente)
- **Settlement rows**: Transfers with `excludedReason: "INTER_OPERATOR_SETTLEMENT"` are rendered as LIQUID rows; `isSettlementTransfer()` detects them by note keywords (liq/liquidacion/liquidar)
- **`computeTxSpread()`**: Returns 0 for LIQUID rows → SPREAD column shows "--"

### KPI Data Shape (`kpis` object)
The `/api/kpis` response is the central data object used across all dashboard modules. Key paths:
- `kpis.profit.*` — profit metrics
- `kpis.judge.dispersor` — dispersor summary (promisedUsdt, pendingUsdt, pendingFiat, receivers)
- `kpis.judge.openVerdicts[]` — active SpreadVerdicts with expectedRebuyUsdt, consumedRebuyUsdt, consumedRebuyFiat, saleRate
- `kpis.bankInsights[]` — per-bank stats including profit, spread, cycle data
- `kpis.config` — operator config (ceilingRate, etc.)

### TypeScript
Strict mode via `astro/tsconfigs/strict`. JSX target is React 19 (`jsxImportSource: "react"`). Most dashboard logic is plain `.js` (not TypeScript) due to browser-direct loading pattern.

## Configuration

**Environment variables** (`import.meta.env.*`):
- `PUBLIC_API_URL`: Backend base URL (optional; falls back to localhost:3003)

**Key config files**:
- `astro.config.mjs`: Astro integrations (React, Alpine.js, Tailwind, sitemap)
- `tailwind.config.mjs`: Custom color theme (binance-yellow, dark palette)
- `tsconfig.json`: Strict TypeScript with React JSX

## Deployment

Builds to `./dist/` as a static site, deployed to GitHub Pages via CNAME (`digitalevel.com`). Run `npm run build` to generate the production output.
