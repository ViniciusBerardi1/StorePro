# Graph Report - .  (2026-05-07)

## Corpus Check
- 15 files · ~10,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 362 nodes · 477 edges · 26 communities (22 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Routing and Auth|App Routing and Auth]]
- [[_COMMUNITY_Reports and Analytics|Reports and Analytics]]
- [[_COMMUNITY_Dashboard and KPIs|Dashboard and KPIs]]
- [[_COMMUNITY_Comanda and Benefits Engine|Comanda and Benefits Engine]]
- [[_COMMUNITY_Google Calendar Integration|Google Calendar Integration]]
- [[_COMMUNITY_Client List and Subscriptions|Client List and Subscriptions]]
- [[_COMMUNITY_PWA Entry and Assets|PWA Entry and Assets]]
- [[_COMMUNITY_Brand Identity Assets|Brand Identity Assets]]
- [[_COMMUNITY_Product and Stock View|Product and Stock View]]
- [[_COMMUNITY_Sidebar Navigation|Sidebar Navigation]]
- [[_COMMUNITY_Excel Export Pipeline|Excel Export Pipeline]]
- [[_COMMUNITY_IndexedDB Local Store|IndexedDB Local Store]]
- [[_COMMUNITY_Comanda Order View|Comanda Order View]]
- [[_COMMUNITY_Product Form and Tests|Product Form and Tests]]
- [[_COMMUNITY_Supabase Webhook Handler|Supabase Webhook Handler]]
- [[_COMMUNITY_Graphify Knowledge Graph|Graphify Knowledge Graph]]
- [[_COMMUNITY_Lateral Comanda Panel|Lateral Comanda Panel]]
- [[_COMMUNITY_Service Worker Cache|Service Worker Cache]]
- [[_COMMUNITY_Dashboard Data Queries|Dashboard Data Queries]]
- [[_COMMUNITY_URL Utilities|URL Utilities]]
- [[_COMMUNITY_DB Tests|DB Tests]]
- [[_COMMUNITY_Subscription Cache|Subscription Cache]]

## God Nodes (most connected - your core abstractions)
1. `db` - 16 edges
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

## Communities (26 total, 4 thin omitted)

### Community 1 - "App Routing and Auth"
Cohesion: 0.07
Nodes (14): db, App(), AppInterno(), AppPrincipal(), isPublicRoute, LoginApp(), pageTransition, pageVariants (+6 more)

### Community 2 - "Reports and Analytics"
Cohesion: 0.09
Nodes (20): getComissoesPorBarbeiro(), getRelatoriosPeriodo(), getRelatoriosPeriodoAnterior(), getUltimaVisitaClientes(), supabase, BRL(), DateRangePicker(), diasEntre() (+12 more)

### Community 3 - "Dashboard and KPIs"
Cohesion: 0.07
Nodes (15): BRL(), DetalheComanda(), PERIODOS, PGTO_BADGE, STATUS_BADGE, TabCaixa(), TABS, baixo (+7 more)

### Community 4 - "Comanda and Benefits Engine"
Cohesion: 0.1
Nodes (14): calcularBeneficios(), cicloAtual(), finalizarComanda(), parsearErroComanda(), ALVOS_DESCONTO, calcDesconto(), ComandaCard(), ComandaEditor() (+6 more)

### Community 5 - "Google Calendar Integration"
Cohesion: 0.12
Nodes (19): apiFetch(), atualizarEvento(), criarEvento(), deletarEvento(), getEventos(), googleSignIn(), googleSignOut(), _handleTokenResponse() (+11 more)

### Community 6 - "Client List and Subscriptions"
Cohesion: 0.13
Nodes (15): AssinaturaSection(), BRL(), ClienteCard(), ClientePerfil(), fmtData(), fmtFreq(), fmtTel(), GATEWAYS (+7 more)

### Community 7 - "PWA Entry and Assets"
Cohesion: 0.15
Nodes (14): React Logo SVG Asset, Vite Logo SVG Asset, Google Identity Services Client, Inter Font (Google Fonts), Main JSX Entry Module, PWA Web Manifest, StorePro PWA Entry Point, Billing / Faturamento Feature (+6 more)

### Community 8 - "Brand Identity Assets"
Cohesion: 0.18
Nodes (14): Beleza by Mih - Beauty Salon Brand, Favicon SVG (Lightning Bolt / App Icon), Hero Illustration - Isometric Layered Card/Platform, PWA Icon 192px (Cartoon Woman with Lipstick), PWA Icon 512px (Cartoon Woman with Lipstick), Bluesky Social Icon, Discord Icon, Documentation Icon (+6 more)

### Community 10 - "Sidebar Navigation"
Cohesion: 0.18
Nodes (4): isAtivo(), ItemGroup(), MENU, VIEWS_ATIVAS

### Community 11 - "Excel Export Pipeline"
Cohesion: 0.29
Nodes (8): buildBar(), buildDetalhes(), buildPagamento(), COR, fmtDate(), getPool(), groupByDesc(), handler()

### Community 12 - "IndexedDB Local Store"
Cohesion: 0.24
Nodes (4): db, getAll(), openDB(), PRODUTOS_SEED

### Community 13 - "Comanda Order View"
Cohesion: 0.36
Nodes (7): ALVOS_DESCONTO, calcDesconto(), Comanda(), fmtValor(), labelDesconto(), PAGAMENTOS, TABS

### Community 14 - "Product Form and Tests"
Cohesion: 0.29
Nodes (3): alertSpy, categorias, defaultProps

### Community 15 - "Supabase Webhook Handler"
Cohesion: 0.29
Nodes (6): action, dataObj, eventoRaw, supabase, tipo, updates

### Community 16 - "Graphify Knowledge Graph"
Cohesion: 0.48
Nodes (7): CLAUDE.md (loja-gestao-pwa), GRAPH_REPORT.md, Graphify Knowledge Graph, graphify-out/ Directory, graphify query command, graphify update command, graphify-out/wiki/index.md

### Community 17 - "Lateral Comanda Panel"
Cohesion: 0.5
Nodes (4): ComandaLateral(), fmtValor(), PAGAMENTOS, TABS

### Community 18 - "Service Worker Cache"
Cohesion: 0.5
Nodes (3): APP_SHELL, clone, url

### Community 19 - "Dashboard Data Queries"
Cohesion: 0.5
Nodes (4): getAtendimentosHoje(), getDashboardData(), getFaturamentoUltimosDias(), rangeLocalDia()

## Knowledge Gaps
- **70 isolated node(s):** `COR`, `APP_SHELL`, `url`, `clone`, `MENU` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `App Routing and Auth` to `Supabase CRUD Layer`, `Dashboard and KPIs`, `Comanda and Benefits Engine`, `Google Calendar Integration`, `Client List and Subscriptions`, `Comanda Order View`, `Lateral Comanda Panel`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `supabase` connect `Reports and Analytics` to `Supabase CRUD Layer`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `atualizarEvento()` connect `Google Calendar Integration` to `Comanda and Benefits Engine`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `store-pro-pwa Project` (e.g. with `StorePro PWA Entry Point` and `Google Identity Services Client`) actually correct?**
  _`store-pro-pwa Project` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `COR`, `APP_SHELL`, `url` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Supabase CRUD Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `App Routing and Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._