# Vidura — Express + React (migrated from TanStack Start / Nitro)

This is the same application (100% of the UI, components, business logic,
financial engine, exports, and AI features), restructured from a
**serverless TanStack Start / Nitro** app into a **traditional Node.js +
Express** architecture that runs as a single Node process on Railway,
Render, a VPS, or any Node host.

## What changed, and why

TanStack Start's `createServerFn` / Nitro server layer is gone. Every
piece of server-side logic it used to run now lives in an Express REST
API under `server/`. The React frontend is untouched functionally — it
still renders the exact same pages, still calls `fetch("/api/chat")` and
`fetch("/api/report")` exactly as before (those were already plain REST
calls in the original code), and still uses TanStack Router / React
Query / Tailwind / Radix / Recharts exactly as before.

The only *frontend* changes were mechanical, not behavioral:
- Removed the SSR-only shell (`shellComponent`, `<Scripts />`) since
  there's no more server-rendering — `client/index.html` now owns the
  document shell, and the app mounts client-side in `client/src/main.tsx`.
- The one server function the UI depended on
  (`getLiveQuote` / `hydrateLiveCompany` for live Yahoo Finance quotes)
  now calls a new REST endpoint, `GET /api/market-data/:ticker`, instead
  of an in-process server function. Same inputs, same outputs, same
  fallback behavior (never throws, empty object on failure).
- Import paths for the data/financial-engine modules that are shared
  between the client (for charts/UI) and the server (for the AI
  chat/report context) now point at a new `shared/` workspace instead of
  being duplicated — see "Avoiding duplicate logic" below.

## Project structure

```
project/
  client/                 Vite + React 19 SPA (unchanged UI/UX)
    index.html
    vite.config.ts
    src/
      main.tsx             new CSR entrypoint (replaces SSR hydration)
      router.tsx           unchanged
      routeTree.gen.ts     regenerated (api/chat, api/report routes removed)
      routes/
        __root.tsx         SSR shell removed, head()/meta still works via
                            TanStack Router's HeadContent + React 19 head hoisting
        index.tsx           unchanged UI, imports shared data via @shared/*
        company.$ticker.tsx unchanged UI, imports shared data via @shared/*
      components/ui/*      unchanged (shadcn/Radix components)
      hooks/                unchanged
      lib/
        utils.ts            unchanged
        exports.ts           unchanged (client-side Excel/PDF/PPTX generation)
        market-data.ts        rewritten: calls GET /api/market-data/:ticker
        lovable-error-reporting.ts  unchanged
  server/                  Express + TypeScript REST API
    src/
      server.ts             entrypoint (listen, graceful shutdown)
      app.ts                Express app: helmet, cors, compression, morgan,
                             json body parsing, routes, static SPA serving,
                             404 + error handlers
      config/env.ts         dotenv-based environment loader
      routes/               chat.routes.ts, report.routes.ts, market.routes.ts,
                             health.routes.ts, index.ts (aggregator)
      controllers/          chat.controller.ts, report.controller.ts,
                             market.controller.ts, health.controller.ts
      services/              ai-gateway.service.ts (moved from ai-gateway.server.ts),
                             research-context.service.ts (de-duplicated
                             company-context builder used by both chat & report),
                             market-data.service.ts (moved from lib/market-data.ts,
                             Map cache replaced with node-cache)
      middleware/            errorHandler.ts, notFoundHandler.ts, validate.ts,
                             upload.ts (multer, ready for future file-upload routes)
      validators/            chat.validator.ts, report.validator.ts,
                             market.validator.ts (express-validator)
      utils/                 logger.ts, asyncHandler.ts, httpError.ts
  shared/                  Code shared by both client and server, so the
                            financial engine and company/universe data
                            exist in exactly one place (no duplication)
    data/
      companies.ts          unchanged content (seeded NSE companies)
      universe.ts           unchanged content (2,100-company universe + resolveCompany)
      nse-list.json         unchanged
    lib/
      financials.ts         unchanged content (3-statement engine, DCF, forecast)
      financialRatios.ts     unchanged content (KPI/ratio calculations)
  package.json             npm workspaces root (client, server)
```

## Old → new file mapping

| Old path (TanStack Start / Nitro) | New path | Reason |
|---|---|---|
| `src/routes/api/chat.ts` (TanStack Start server route, `createFileRoute("/api/chat")` + `server.handlers.POST`) | `server/src/routes/chat.routes.ts` + `server/src/controllers/chat.controller.ts` | Server functions replaced with a plain Express route + controller. Streaming logic adapted from a Web `Response` to Node's `http.ServerResponse` via `Readable.fromWeb(...).pipe(res)`. |
| `src/routes/api/report.ts` | `server/src/routes/report.routes.ts` + `server/src/controllers/report.controller.ts` | Same reasoning; non-streaming JSON response. |
| `src/lib/market-data.ts` (`createServerFn` `getLiveQuote`, `hydrateLiveCompany`) | `server/src/services/market-data.service.ts` (Yahoo fetch/cache logic) + `server/src/controllers/market.controller.ts` (new `GET /api/market-data/:ticker`) + `client/src/lib/market-data.ts` (client-side fetch wrapper, same public `hydrateLiveCompany` signature) | `createServerFn` doesn't exist outside TanStack Start; split into a real REST endpoint (server) and a thin fetch wrapper (client) that preserves the exact same call site and behavior in `company.$ticker.tsx`. |
| `src/lib/ai-gateway.server.ts` | `server/src/services/ai-gateway.service.ts` | Moved verbatim — this was already server-only logic (the `.server.ts` suffix), now living in the Express services layer instead of being tree-shaken out of the client bundle by TanStack Start's convention. |
| `src/lib/config.server.ts` | `server/src/config/env.ts` | Server-only env access is now a real Express config module using `dotenv`, instead of a Vite-convention `.server.ts` file. |
| `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/server.ts`, `src/start.ts` | *(removed — no replacement needed)* | These existed purely to catch and render a fallback error page when Nitro/h3 swallowed an SSR error into a generic 500. There is no SSR layer anymore; Express's own global `errorHandler` middleware (`server/src/middleware/errorHandler.ts`) and the client's existing `errorComponent` in `__root.tsx` (a client-side React error boundary, untouched) fully cover this. |
| `src/lib/api/example.functions.ts` | *(removed)* | Was a placeholder/example `createServerFn`, not used anywhere in the app; no REST equivalent needed. |
| `src/data/companies.ts`, `src/data/universe.ts`, `src/data/nse-list.json` | `shared/data/*` | Used by both the client (rendering, search) and the server (AI context building for chat/report) — moved to a shared workspace instead of duplicating this ~600-line dataset and its logic in two places. |
| `src/lib/financials.ts`, `src/lib/financialRatios.ts` | `shared/lib/*` | Same reasoning — the DCF/forecast/ratio engine is needed by both the UI and the server's AI-context builders. |
| `src/lib/exports.ts`, `src/lib/utils.ts`, `src/lib/lovable-error-reporting.ts` | `client/src/lib/*` (unchanged) | Purely client-side (browser Excel/PDF/PPTX generation, Tailwind class merging, window-scoped error reporting) — no server dependency, so these stay client-only, verbatim. |
| `src/routes/index.tsx`, `src/routes/company.$ticker.tsx`, `src/routes/__root.tsx` | `client/src/routes/*` | Same components/JSX/business logic; only import paths for shared data/financials updated, and `__root.tsx`'s SSR shell (`shellComponent`, `<Scripts />`) removed since rendering is now purely client-side. |
| `src/router.tsx` | `client/src/router.tsx` | Unchanged. |
| `src/routeTree.gen.ts` | `client/src/routeTree.gen.ts` | Regenerated without the `/api/chat` and `/api/report` TanStack file routes (those are now Express endpoints, not client routes). Will also be auto-regenerated by the TanStack Router Vite plugin on `npm run dev` / `npm run build`. |
| `src/components/ui/*`, `src/hooks/use-mobile.tsx`, `src/styles.css`, `components.json`, `public/robots.txt` | `client/src/components/ui/*`, `client/src/hooks/*`, `client/src/styles.css`, `client/components.json`, `client/public/robots.txt` | Copied verbatim — no server dependency, no changes. |
| `vite.config.ts` (wrapping `@lovable.dev/vite-tanstack-config` → TanStack Start + Nitro + Cloudflare target) | `client/vite.config.ts` | Plain Vite config: `@vitejs/plugin-react`, `@tailwindcss/vite`, and the TanStack Router Vite plugin in client-only mode (route-tree generation only, no server entry/Nitro build). |
| *(new)* | `client/index.html`, `client/src/main.tsx` | TanStack Start generated the HTML document and hydration entry via its SSR server entry; a plain Vite SPA needs an explicit `index.html` + client entrypoint, which didn't exist before. |
| *(new)* | `server/src/app.ts`, `server/src/server.ts`, `server/src/middleware/*`, `server/src/validators/*`, `server/src/utils/*` | Required Express scaffolding (security headers, CORS, compression, logging, JSON parsing, validation, global error/404 handling, graceful shutdown) that Nitro previously provided implicitly. |
| *(new)* | `package.json` (root, npm workspaces) | Ties `client` and `server` together so `npm install`, `npm run build`, `npm start` work as a single toolchain from the repo root. |

## Environment variables

Copy `server/.env.example` to `server/.env` and fill in:

```
PORT=4000
NODE_ENV=production
LOVABLE_API_KEY=your-key-here
CORS_ORIGIN=*
MARKET_DATA_CACHE_TTL_MS=300000
LOG_LEVEL=info
```

`LOVABLE_API_KEY` is required for `/api/chat` and `/api/report` (AI
Analyst chat + AI research report generation) — identical requirement
to the original app.

## Running locally

```bash
npm install          # installs client + server workspaces
npm run dev           # runs Vite dev server (client) + Express (server) concurrently,
                       # with the Vite dev server proxying /api/* to Express
```

## Building & running in production

```bash
npm install
npm run build          # builds the client SPA (client/dist) and type-checks the server
npm start               # starts the single Express process: serves the built SPA
                         # as static files AND the /api/* REST endpoints
```

This is a single Node process — no Nitro, no Cloudflare Workers, no edge
runtime — and is deployable as-is on Railway, Render, a plain VPS, or any
other Node hosting target. Set `PORT` via the platform's environment
variable and it will bind correctly (`server/src/config/env.ts` reads
`process.env.PORT`, defaulting to `4000`).

## REST API reference

| Method | Path | Replaces | Description |
|---|---|---|---|
| `GET` | `/api/health` | *(new)* | Health check for uptime/load-balancer probes. |
| `POST` | `/api/chat` | `src/routes/api/chat.ts` server function | Streaming AI Analyst chat, grounded in a company's financials. Body: `{ messages, ticker? }`. Streams the same UI-message protocol the frontend's `useChat`/`DefaultChatTransport` already expects — no frontend change required. |
| `POST` | `/api/report` | `src/routes/api/report.ts` server function | Generates the full AI equity research report. Body: `{ ticker }`. Returns `{ markdown }`. |
| `GET` | `/api/market-data/:ticker` | `getLiveQuote` server function (`src/lib/market-data.ts`) | Live Yahoo Finance quote + a `Company` patch, cached 5 minutes per ticker (in-memory, `node-cache`). |

All endpoints validate input with `express-validator`, use `async/await`
throughout, and funnel errors through the shared `asyncHandler` +
global `errorHandler` middleware (returns consistent JSON error bodies,
with stack traces only outside production).
