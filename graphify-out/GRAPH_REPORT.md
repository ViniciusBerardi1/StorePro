# Graph Report - D:/loja-gestao-pwa  (2026-05-07)

## Corpus Check
- 46 files · ~55,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 341 nodes · 446 edges · 26 communities (23 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Routing and Auth|App Routing and Auth]]
- [[_COMMUNITY_Reports and Financials|Reports and Financials]]
- [[_COMMUNITY_Google Calendar Integration|Google Calendar Integration]]
- [[_COMMUNITY_Client Management UI|Client Management UI]]
- [[_COMMUNITY_Order Selector and Discounts|Order Selector and Discounts]]
- [[_COMMUNITY_Dashboard and KPIs|Dashboard and KPIs]]
- [[_COMMUNITY_PWA Setup and Config|PWA Setup and Config]]
- [[_COMMUNITY_Brand Identity Assets|Brand Identity Assets]]
- [[_COMMUNITY_Product and Stock View|Product and Stock View]]
- [[_COMMUNITY_Test Fixtures and Mocks|Test Fixtures and Mocks]]
- [[_COMMUNITY_Sidebar Navigation|Sidebar Navigation]]
- [[_COMMUNITY_Excel Export Pipeline|Excel Export Pipeline]]
- [[_COMMUNITY_IndexedDB and Seed Data|IndexedDB and Seed Data]]
- [[_COMMUNITY_Comanda Order View|Comanda Order View]]
- [[_COMMUNITY_Product Form and Tests|Product Form and Tests]]
- [[_COMMUNITY_Supabase Webhook Handler|Supabase Webhook Handler]]
- [[_COMMUNITY_Graphify Meta Docs|Graphify Meta Docs]]
- [[_COMMUNITY_Lateral Comanda Panel|Lateral Comanda Panel]]
- [[_COMMUNITY_Service Worker Cache|Service Worker Cache]]
- [[_COMMUNITY_Dashboard Data Queries|Dashboard Data Queries]]
- [[_COMMUNITY_URL Utilities (stale)|URL Utilities (stale)]]
- [[_COMMUNITY_DB Tests|DB Tests]]

## God Nodes (most connected - your core abstractions)
1. `db` - 15 edges
2. `store-pro-pwa Project` - 8 edges
3. `BRL()` - 7 edges
4. `apiFetch()` - 7 edges
5. `UI Icon Sprite Sheet (Social & Navigation Icons)` - 7 edges
6. `handler()` - 6 edges
7. `ClientePerfil()` - 5 edges
8. `StorePro PWA Entry Point` - 5 edges
9. `CLAUDE.md (loja-gestao-pwa)` - 5 edges
10. `BRL()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `React` --conceptually_related_to--> `React Logo SVG Asset`  [INFERRED]
  README.md → src/assets/react.svg
- `Vite` --conceptually_related_to--> `Vite Logo SVG Asset`  [INFERRED]
  README.md → src/assets/vite.svg
- `Google Identity Services Client` --conceptually_related_to--> `store-pro-pwa Project`  [INFERRED]
  index.html → README.md
- `StorePro PWA Entry Point` --references--> `store-pro-pwa Project`  [INFERRED]
  index.html → README.md
- `Favicon SVG (Lightning Bolt / App Icon)` --conceptually_related_to--> `Brand Logo - Beleza by Mih Butterfly Monogram (BM)`  [INFERRED]
  public/favicon.svg → public/logo.png

## Hyperedges (group relationships)
- **PWA Icon Set (favicon, 192px, 512px)** — favicon_svg, icon192_png, icon512_png [INFERRED 0.95]
- **Brand Visual Assets (logo, icons, hero)** — logo_png, icon192_png, icon512_png, favicon_svg, hero_png [INFERRED 0.85]
- **Social Platform Icon Symbols in Sprite Sheet** — icon_bluesky, icon_discord, icon_github, icon_x [EXTRACTED 1.00]

## Communities (26 total, 3 thin omitted)

### Community 1 - "App Routing and Auth"
Cohesion: 0.07
Nodes (14): db, App(), AppInterno(), AppPrincipal(), isPublicRoute, LoginApp(), pageTransition, pageVariants (+6 more)

### Community 2 - "Reports and Financials"
Cohesion: 0.09
Nodes (20): getComissoesPorBarbeiro(), getRelatoriosPeriodo(), getRelatoriosPeriodoAnterior(), getUltimaVisitaClientes(), supabase, BRL(), DateRangePicker(), diasEntre() (+12 more)

### Community 3 - "Google Calendar Integration"
Cohesion: 0.12
Nodes (19): apiFetch(), atualizarEvento(), criarEvento(), deletarEvento(), getEventos(), googleSignIn(), googleSignOut(), _handleTokenResponse() (+11 more)

### Community 4 - "Client Management UI"
Cohesion: 0.16
Nodes (13): AssinaturaSection(), BRL(), ClienteCard(), ClientePerfil(), fmtData(), fmtFreq(), fmtTel(), GATEWAYS (+5 more)

### Community 5 - "Order Selector and Discounts"
Cohesion: 0.17
Nodes (10): ALVOS_DESCONTO, calcDesconto(), ComandaCard(), ComandaEditor(), fmtHora(), fmtValor(), labelDesconto(), PAGAMENTOS (+2 more)

### Community 6 - "Dashboard and KPIs"
Cohesion: 0.14
Nodes (7): BRL(), DetalheComanda(), PERIODOS, PGTO_BADGE, STATUS_BADGE, TabCaixa(), TABS

### Community 7 - "PWA Setup and Config"
Cohesion: 0.15
Nodes (14): React Logo SVG Asset, Vite Logo SVG Asset, Google Identity Services Client, Inter Font (Google Fonts), Main JSX Entry Module, PWA Web Manifest, StorePro PWA Entry Point, Billing / Faturamento Feature (+6 more)

### Community 8 - "Brand Identity Assets"
Cohesion: 0.18
Nodes (14): Beleza by Mih - Beauty Salon Brand, Favicon SVG (Lightning Bolt / App Icon), Hero Illustration - Isometric Layered Card/Platform, PWA Icon 192px (Cartoon Woman with Lipstick), PWA Icon 512px (Cartoon Woman with Lipstick), Bluesky Social Icon, Discord Icon, Documentation Icon (+6 more)

### Community 10 - "Test Fixtures and Mocks"
Cohesion: 0.15
Nodes (8): baixo, categorias, hoje, ok, produtoBase, valido, vencido, zerado

### Community 11 - "Sidebar Navigation"
Cohesion: 0.18
Nodes (4): isAtivo(), ItemGroup(), MENU, VIEWS_ATIVAS

### Community 12 - "Excel Export Pipeline"
Cohesion: 0.29
Nodes (8): buildBar(), buildDetalhes(), buildPagamento(), COR, fmtDate(), getPool(), groupByDesc(), handler()

### Community 13 - "IndexedDB and Seed Data"
Cohesion: 0.24
Nodes (4): db, getAll(), openDB(), PRODUTOS_SEED

### Community 14 - "Comanda Order View"
Cohesion: 0.36
Nodes (7): ALVOS_DESCONTO, calcDesconto(), Comanda(), fmtValor(), labelDesconto(), PAGAMENTOS, TABS

### Community 15 - "Product Form and Tests"
Cohesion: 0.29
Nodes (3): alertSpy, categorias, defaultProps

### Community 16 - "Supabase Webhook Handler"
Cohesion: 0.29
Nodes (6): action, dataObj, eventoRaw, supabase, tipo, updates

### Community 17 - "Graphify Meta Docs"
Cohesion: 0.48
Nodes (7): CLAUDE.md (loja-gestao-pwa), GRAPH_REPORT.md, Graphify Knowledge Graph, graphify-out/ Directory, graphify query command, graphify update command, graphify-out/wiki/index.md

### Community 18 - "Lateral Comanda Panel"
Cohesion: 0.5
Nodes (4): ComandaLateral(), fmtValor(), PAGAMENTOS, TABS

### Community 19 - "Service Worker Cache"
Cohesion: 0.5
Nodes (3): APP_SHELL, clone, url

### Community 20 - "Dashboard Data Queries"
Cohesion: 0.5
Nodes (4): getAtendimentosHoje(), getDashboardData(), getFaturamentoUltimosDias(), rangeLocalDia()

## Knowledge Gaps
- **68 isolated node(s):** `COR`, `APP_SHELL`, `url`, `clone`, `MENU` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `App Routing and Auth` to `Database CRUD Layer`, `Google Calendar Integration`, `Client Management UI`, `Order Selector and Discounts`, `Dashboard and KPIs`, `Comanda Order View`, `Lateral Comanda Panel`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `supabase` connect `Reports and Financials` to `Database CRUD Layer`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `atualizarEvento()` connect `Google Calendar Integration` to `Order Selector and Discounts`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `store-pro-pwa Project` (e.g. with `StorePro PWA Entry Point` and `Google Identity Services Client`) actually correct?**
  _`store-pro-pwa Project` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `COR`, `APP_SHELL`, `url` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database CRUD Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `App Routing and Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._