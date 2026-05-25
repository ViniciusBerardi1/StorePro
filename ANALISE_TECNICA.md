# Análise Técnica — StorePro PWA
**Engenheiro Sênior / Tech Lead Review**
Data: 2026-05-24

---

## 1. Visão Geral da Arquitetura

**Stack:** React 19 + Vite 8 + TailwindCSS 4 + Supabase (PostgreSQL + Auth) + Vercel Serverless Functions

**Modelo:** SaaS multi-tenant (B2B) para gestão de barbearias. Três portais distintos:
- **App principal** — operacional (staff da loja)
- **Admin** — gestão da plataforma (super-admin)
- **Portal barbeiro** — portal individual do profissional

**Fluxo de dados:**
```
Browser → Supabase JS Client (RLS) → PostgreSQL
Browser → /api/admin/* (Bearer token) → Supabase service_role
Browser → /api/barbeiro/* (custom token) → barbeiro_tokens table
Browser → /api/exportar-financeiro → PostgreSQL direto (pg Pool)
```

**Separação de responsabilidades:**
```
src/services/supabaseDb.js  → Data Access Layer (DAL) — 905 linhas
src/hooks/                  → Auth hooks
src/components/views/       → Page components (lógica + UI misturados)
api/                        → Backend serverless
```

---

## 2. Pontos Positivos do Projeto

**Arquitetura e Design:**
- Multi-tenancy bem implementado via `loja_id` + RLS em todas as tabelas scoped
- Três contextos de autenticação isolados (app / admin / barbeiro) — decisão arquitetural correta
- Locking otimista (`version` column) para prevenir race conditions em comandas
- Operações financeiras críticas via RPCs atômicas (`finalizar_comanda`, `cancelar_comanda`, `abrir_caixa`) — excelente
- Audit log append-only: `comanda_eventos`, `movimentos_caixa`, `historico` — rastreabilidade completa
- Soft delete (`deleted_at`) em comandas

**Código:**
- Lazy loading consistente em todas as views — ótimo para performance inicial
- `Promise.all()` para queries paralelas onde não há dependência
- Guard clauses explícitas no `updateComanda` (status='aberta', deleted_at IS NULL)
- Fallback JS para RPC não deployado em `baixarEstoqueComanda` — pragmático
- Cache simples mas eficaz em `getAssinaturasAtivas` (60s TTL, invalidação em mutação)
- Funções de data timezone-aware (`hojeLocalStr`, `rangeLocalDia`) — evita bugs clássicos de UTC

**Infra:**
- PWA com service worker
- ExcelJS para export financeiro (7 abas) — feature de alto valor
- Testes de carga k6 presentes
- Migrations SQL versionadas

---

## 3. Problemas Críticos

### C1 — Service Key exposta no frontend (CRÍTICO)

**Arquivo:** `.env.local`, linha com `VITE_SUPABASE_SERVICE_KEY`

```bash
# PROBLEMA: VITE_ prefix expõe qualquer variável no bundle JS compilado
VITE_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Impacto atual:** Qualquer usuário pode abrir DevTools → Sources e copiar a service key. Com ela, tem acesso total ao banco bypassando todas as RLS policies — lê, escreve e deleta dados de qualquer loja.

**Risco futuro:** Vazamento em crawlers, GitHub, logs de CDN, extensões de browser.

**Como corrigir:**
```bash
# .env.local — APENAS anon key no frontend
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...  # público, seguro por RLS

# Vercel Environment Variables (server-side only, sem VITE_)
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
DATABASE_URL=...
```

**Prioridade: IMEDIATA — rotar a service key hoje.**

---

### C2 — Tabela `historico` sem `loja_id` (Vazamento multi-tenant)

**Arquivo:** `supabaseDb.js:83-86`

```javascript
async function limparHistorico() {
  // DELETE sem WHERE de loja — apaga histórico de TODAS as lojas
  const { error } = await supabase.from("historico").delete().neq("id", 0);
}
```

E em `limparDadosOperacionais` (linha 834):
```javascript
// "historico não tem loja_id — depende do RLS para escopo correto"
// MAS se não há RLS na tabela, esta query apaga tudo
const { error: errHist } = await supabase.from("historico").delete().neq("id", 0);
```

**Impacto:** Se `historico` não tem RLS configurado, `limparHistorico()` apaga dados de TODAS as lojas. Mesmo se houver RLS, a função `registrarMovimento` insere sem `loja_id`, impossibilitando filtrar por loja depois.

**Correção:**
```sql
ALTER TABLE historico ADD COLUMN loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
CREATE INDEX historico_loja_idx ON historico(loja_id);
ALTER TABLE historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY historico_loja ON historico USING (
  loja_id = (SELECT loja_id FROM profiles WHERE id = auth.uid())
);
```

---

### C3 — Senha do app armazenada e comparada em plaintext

**Arquivo:** `App.jsx:74-80`

```javascript
const senhaCorreta = await db.getConfiguracao("app_senha");
// ...
if (senha === senhaCorreta) {  // comparação direta — plaintext
```

**Impacto:** A senha está na tabela `configuracoes` como texto puro. Qualquer admin Supabase, DBA, ou vazamento de DB expõe todas as senhas. Além disso, qualquer usuário autenticado com Supabase (se RLS for permissiva na tabela) pode ler o valor via query direta.

**Correção:** Hash com bcrypt no backend, ou usar Supabase Auth diretamente (o `SenhaModal` já faz isso corretamente — o `LoginApp` deveria seguir o mesmo padrão).

---

### C4 — Token do barbeiro armazenado em plaintext no banco

**Arquivo:** `api/barbeiro/_auth.js:21-23`

```javascript
const { data: session } = await serviceClient
  .from("barbeiro_tokens")
  .select("barbeiro_id, loja_id, expires_at")
  .eq("token", token)  // busca o token cru
```

**Impacto:** Um dump do banco (backup, vulnerabilidade SQL, funcionário desonesto) expõe todos os tokens ativos, permitindo impersonation de qualquer barbeiro.

**Correção:**
```javascript
// Armazenar SHA-256 do token no banco
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
// Buscar pelo hash
.eq("token_hash", tokenHash)
```

---

### C5 — Roteamento avaliado no nível de módulo (não reativo)

**Arquivo:** `App.jsx:46-50`

```javascript
// Executado UMA VEZ no carregamento — não reage a mudanças de URL
const isPublicRoute    = window.location.pathname.startsWith("/assinar");
const isAdminRoute     = window.location.pathname.startsWith("/admin");
const isResetRoute     = window.location.pathname.startsWith("/reset-password");
const isCadastroRoute  = window.location.pathname.startsWith("/cadastro");
const isBarbeiroRoute  = window.location.pathname.startsWith("/barbeiro");
```

**Impacto:** Em um PWA com service worker, se o usuário navega programaticamente (pushState) ou recarrega após rota mudar, o valor das constantes pode estar stale. Se a lógica de roteamento der errado, o usuário vê um componente errado sem erro visível.

**Correção:** Usar react-router-dom v6 (BrowserRouter + Route) ou pelo menos derivar as rotas dentro de um componente com `useState` + `useEffect`.

---

## 4. Problemas Médios

### M1 — God Component `AppPrincipal` (650 linhas no App.jsx)

`AppPrincipal` gerencia: estado de produtos, categorias, histórico, view ativa, modal de senha, auto-lock, toast, confirm modal, lógica de comanda — tudo no mesmo componente. Viola Single Responsibility e torna testes e manutenção muito difíceis.

**Refatorar em:**
- `useEstoque()` hook para produtos/categorias/histórico
- `useFinanceiroLock()` hook para auto-lock + senha modal
- `<EstoquePage>` componente separado

---

### M2 — Roteamento manual com if/else em cascata

**Arquivo:** `App.jsx:563-609`

```javascript
{view === "configuracoes" ? <Configuracoes />
: view === "sobre" ? <Sobre />
: view === "servicos" ? <Servicos />
// ... 12 condicionais encadeadas
```

Adicionar uma nova rota exige editar o meio do componente. Sem tipagem ou validação de rotas.

**Correção:** Mapa de rotas declarativo:
```javascript
const ROTAS = {
  configuracoes: Configuracoes,
  sobre: Sobre,
  servicos: Servicos,
  financeiro: () => <Dashboard produtos={produtos} setView={navegar} />,
  // ...
};
const ViewComponent = ROTAS[view] ?? EmBreve;
```

---

### M3 — `getClientesComStats` — N+M join em memória

**Arquivo:** `supabaseDb.js:115-142`

```javascript
// Busca TODOS os clientes + TODOS os atendimentos concluídos
// Depois faz join em JavaScript
const [clientes, atendimentos] = await Promise.all([...]);
// byId, byNome lookups em loop
```

**Impacto:** Com 10k clientes e 100k atendimentos, isso trafega megabytes pelo cliente. Deveria ser uma view ou query com JOIN no PostgreSQL.

**Correção SQL:**
```sql
CREATE VIEW clientes_com_stats AS
SELECT c.*,
  COUNT(a.id) AS total_atendimentos,
  COALESCE(SUM(a.valor_total), 0) AS total_gasto,
  MAX(a.data_hora) AS ultima_visita
FROM clientes c
LEFT JOIN atendimentos a ON a.cliente_id = c.id AND a.status = 'concluido'
GROUP BY c.id;
```

---

### M4 — Fallback de schema via try/catch em queries de produção

**Arquivo:** `supabaseDb.js:623-651`

```javascript
async function getAssinaturasAtivas() {
  const { data, error } = await supabase.from("assinaturas")
    .select("..., planos(id, nome, valor, intervalo, beneficios)")...

  if (error) {
    // Fallback: beneficios column may not exist yet
    const { data: data2 } = await supabase.from("assinaturas")
      .select("..., planos(id, nome, valor, intervalo)")... // sem beneficios
  }
}
```

**Problema:** Usar exceção de runtime para detectar estado de schema é errado. Um erro real de rede ou RLS triggering dispara o fallback silenciosamente. As migrations deveriam ser idempotentes e aplicadas antes do deploy.

---

### M5 — Ausência total de TypeScript

Com 30+ componentes, 8 services e 19 tabelas, a ausência de tipos torna:
- Refatorações silenciosamente erradas (campo renomeado no DB não detectado)
- Props de componente sem contrato (qual shape de `comanda` o editor espera?)
- Erros de runtime preventíveis em tempo de compilação

---

### M6 — `onAbrirComanda` silencia erros do usuário

**Arquivo:** `App.jsx:503-505`

```javascript
} catch (e) {
  console.error("Erro ao criar comanda:", e);
  // Nenhum feedback visual — usuário não sabe o que aconteceu
}
```

---

### M7 — Cache de módulo ES (`_assinaturasCache`) não é compartilhado entre abas

**Arquivo:** `supabaseDb.js:613-615`

```javascript
let _assinaturasCache   = null;  // em memória, por aba
let _assinaturasCacheTs = 0;
```

Duas abas abertas terão caches desincronizados. Uma atualização em uma aba não invalida a cache da outra. Para dados financeiros isso pode causar exibição de valores divergentes.

---

### M8 — `baixarEstoqueComanda` fallback JS não é atômico

**Arquivo:** `supabaseDb.js:532-548`

```javascript
await Promise.all(
  produtos.map(async (prod) => {
    const novaQtd = Math.max(0, qtdAnterior - agregado[prod.id]);
    await supabase.from("produtos").update({ quantidade: novaQtd }).eq("id", prod.id);
    // Se qualquer update falhar após outros terem sucesso → estoque inconsistente
  })
);
```

Múltiplos updates independentes sem transação. Se o terceiro produto falhar, os dois primeiros já foram decrementados. Nenhum rollback.

---

## 5. Melhorias Recomendadas

### Migrar para React Router v6
```bash
npm install react-router-dom
```
Substitui todo o sistema manual de `window.location.pathname` + `view` state por `<BrowserRouter>` + `<Routes>` declarativas, com suporte nativo a parâmetros de URL, navegação programática e lazy loading.

### Criar Contexto de estado global leve
O `AppPrincipal` passa callbacks como `onAtendimentoFinalizado` e `onAbrirComanda` por props entre componentes não relacionados. Um Context mínimo resolve o prop drilling sem precisar de Redux.

### Migrar para TypeScript
Adotar `.tsx` e `.ts` gradualmente, começando pelas interfaces de dados (`Comanda`, `Barbeiro`, `Assinatura`) e pelos services.

### Implementar React Query (TanStack Query)
Substitui o cache manual de módulo por cache reativo, sincronizado entre abas, com invalidação e refetch automático:
```javascript
const { data: assinaturas } = useQuery({
  queryKey: ["assinaturas", "ativas"],
  queryFn: () => db.getAssinaturasAtivas(),
  staleTime: 60_000,
});
```

---

## 6. Refatorações Sugeridas

### 6.1 — DAL monolítico → módulos por domínio

`supabaseDb.js` com 905 linhas e 50+ funções é difícil de navegar e testar.

```
src/services/
  db/
    clientes.js      # getClientes, addCliente, updateCliente, deleteCliente
    comandas.js      # getComandasAbertas, criarComanda, updateComanda, ...
    barbeiros.js
    produtos.js
    assinaturas.js
    caixa.js
    config.js
  supabase.js        # client singleton
```

### 6.2 — Extrair `ComandaEditor` para arquivo próprio

`Comandas.jsx` mistura a listagem de comandas abertas/fechadas com o editor completo. São dois produtos diferentes — devem ser componentes separados.

### 6.3 — Roteamento declarativo

```javascript
// routes.js
export const ROUTES = [
  { path: "agenda",      Component: Agenda,      protegeFinanceiro: false },
  { path: "financeiro",  Component: Dashboard,   protegeFinanceiro: true  },
  { path: "relatorios",  Component: Relatorios,  protegeFinanceiro: true  },
  // ...
];

// App.jsx
const rota = ROUTES.find(r => r.path === view) ?? { Component: EmBreve };
```

---

## 7. Melhorias de Segurança

| # | Problema | Ação | Urgência |
|---|----------|------|----------|
| S1 | Service key no frontend | Rotar key + remover VITE_ prefix | **HOJE** |
| S2 | Token barbeiro em plaintext | Armazenar SHA-256(token) | Alta |
| S3 | Senha app em plaintext no DB | Migrar para hash bcrypt ou Supabase Auth | Alta |
| S4 | Sem rate limiting nas APIs | Adicionar Upstash Redis + middleware de rate limit | Média |
| S5 | Tabela `historico` sem RLS | Adicionar `loja_id` + policy RLS | Alta |
| S6 | Sem CSP headers | Adicionar `Content-Security-Policy` no vercel.json | Média |
| S7 | Sem CORS configurado explicitamente | Configurar CORS nas serverless functions | Média |
| S8 | `.env.local` no git | Verificar `.gitignore`, rotar credenciais | **HOJE** |

**Rate limiting exemplo (Vercel + Upstash):**
```javascript
// api/_rateLimit.js
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),
});

export async function checkRateLimit(req, res) {
  const ip = req.headers["x-forwarded-for"] ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    res.status(429).json({ erro: "Muitas requisições" });
    return false;
  }
  return true;
}
```

---

## 8. Melhorias de Performance

### P1 — Queries com JOIN no banco, não join em JS

```sql
-- Em vez de getClientesComStats() em JS
SELECT c.*,
  COUNT(a.id) FILTER (WHERE a.status = 'concluido') AS total_atendimentos,
  COALESCE(SUM(a.valor_total) FILTER (WHERE a.status = 'concluido'), 0) AS total_gasto,
  MAX(a.data_hora) AS ultima_visita
FROM clientes c
LEFT JOIN atendimentos a ON a.cliente_id = c.id
GROUP BY c.id
ORDER BY c.nome;
```

### P2 — Índices faltantes

```sql
-- Alta frequência de queries por período
CREATE INDEX atendimentos_data_hora_idx ON atendimentos(loja_id, data_hora DESC);
CREATE INDEX comandas_status_loja_idx ON comandas(loja_id, status) WHERE deleted_at IS NULL;
CREATE INDEX assinaturas_cliente_status_idx ON assinaturas(cliente_id, status);
CREATE INDEX barbeiro_tokens_token_idx ON barbeiro_tokens(token); -- ou token_hash
```

### P3 — `AppPrincipal` carrega produtos/categorias/histórico em toda montagem

```javascript
// App.jsx:360-363
const [p, c, h] = await Promise.all([
  db.getProdutos(),      // todos os produtos
  db.getCategorias(),    // todas as categorias
  db.getHistorico(),     // TODO o histórico de estoque
]);
```

`getHistorico()` pode retornar milhares de linhas sem paginação. E esses dados são carregados mesmo quando o usuário está na view `agenda` — dados desnecessários.

**Correção:** Carregar dados sob demanda por view ativa, com React Query para caching.

### P4 — AnimatePresence com 12+ views em re-render

O `AnimatePresence mode="wait"` no roteador de views recria e anima o componente inteiro a cada troca de view. Com Framer Motion, cada transição pode custar 3-5 frames extras de layout recalculation.

### P5 — Service Worker precisa de estratégia de cache versionada

`sw.js` atual pode servir recursos stale após deploy. Implementar cache busting com versão no nome do arquivo (já feito pelo Vite com hash) e limpeza de caches antigos no `activate` event.

---

## 9. Melhorias de Organização e Clean Code

### 9.1 — Inconsistência no tratamento de erro

Algumas funções jogam `throw error`, outras retornam `null`, outras fazem `console.warn`:

```javascript
// supabaseDb.js — 3 padrões diferentes:
if (error) throw error;                        // linha 33
if (error) console.warn("...", error.message); // linha 452
if (error) return [];                          // linha 716
```

Definir um padrão único: funções de leitura retornam `[]`/`null` em erro esperado, funções de escrita sempre jogam erro.

### 9.2 — Comentários que descrevem o quê, não o porquê

```javascript
// Retorna a data LOCAL hoje no formato "YYYY-MM-DD"
function hojeLocalStr() { ... }
```

O nome `hojeLocalStr` já diz isso. O comentário útil seria explicar por que local e não UTC (questão de UX/timezone-awareness).

### 9.3 — `limparHistorico` é uma bomba relacional

```javascript
async function limparHistorico() {
  await supabase.from("historico").delete().neq("id", 0); // deleta TUDO
}
```

Esta função está exportada no objeto `db` — qualquer chamada acidental ou bug limpa o histórico de estoque de todas as lojas. Deveria ser removida do `db` export, exigir `loja_id` explícito, e ter um nome mais ominoso como `__DANGER_limparHistoricoLoja`.

### 9.4 — `carregarDashboard` é um alias desnecessário

```javascript
const carregarDashboard = useCallback(() => carregar(), [carregar]);
// Usado apenas como: onAtendimentoFinalizado={carregarDashboard}
```

`carregar` poderia ser passado diretamente.

---

## 10. Melhorias de UX/UI

### UX1 — Feedback ausente no `onAbrirComanda`
Se a criação de comanda falhar (DB offline, constraint violation), o usuário não vê nada — apenas o console registra o erro. Adicionar `setToast("Erro ao criar comanda. Tente novamente.")`.

### UX2 — Sem skeleton loaders nas views lazy-loaded
O `PageLoader` atual é um quadrado pulsante. Para views como `Comandas` ou `ClientesLista` que carregam listas, um skeleton placeholder da estrutura evita layout shift e transmite progresso.

### UX3 — Auto-lock de 1 minuto pode ser muito agressivo
Em barbearias movimentadas, o operador pode ficar 90 segundos sem tocar o mouse entre clientes. Considerar configurar o timeout por loja (salvo em `configuracoes`).

### UX4 — Tela de senha do financeiro não tem "esqueci a senha"
Se a `app_senha` for esquecida, não há recovery path pela UI — o admin precisa acessar o Supabase diretamente.

### UX5 — Formulários sem validação client-side visível
Formulários de `addBarbeiro`, `addServico`, `addCliente` dependem exclusivamente de erros do banco para feedback. Adicionar validação Zod ou react-hook-form + mensagens inline antes do submit.

---

## 11. Escalabilidade Futura

### Gargalos previsíveis com crescimento:

| Cenário | Problema | Solução |
|---------|----------|---------|
| 100 lojas × 10k comandas | `getComandasFechadas` sem filtro de loja_id redundante no JS | Garantir query index, adicionar paginação cursor-based |
| Agenda com 1000+ eventos GCal | `removeAtendimentosOrfaos` faz SELECT + filter em JS | Reescrever como query `NOT IN (...)` no banco |
| Concorrência de múltiplos terminais | Cache de módulo ES desincronizado | React Query com shared cache por aba |
| Mais tipos de benefícios | `calcularBeneficios` cresce como switch infinito | Strategy pattern: um arquivo por tipo de benefício |
| Múltiplos gateways de pagamento | `forma_pagamento` é TEXT livre | Enum + tabela de gateways com config |
| Audit trail financeiro completo | `comanda_eventos` não captura todas as operações | Event sourcing: todos os estados de `comanda` na tabela de eventos |

### Arquitetura sugerida para escala:

```
Nível 1 (atual):       Supabase + Vercel Functions
Nível 2 (1k lojas):    + Redis (Upstash) para cache cross-tab
                        + Supabase Edge Functions para RPCs críticas
Nível 3 (10k lojas):   + Read replicas para queries de relatório
                        + Queue (BullMQ/Inngest) para GCal sync assíncrono
                        + Separação de schemas por tenant (tenant isolation)
```

---

## 12. Nota Técnica do Projeto

| Critério | Nota | Observação |
|----------|------|------------|
| Arquitetura geral | 7/10 | Multi-tenant correto, 3 portais bem separados |
| Segurança | 4/10 | Service key exposta é gravíssima |
| Código backend (API) | 7/10 | Auth middleware correto, falta rate limit |
| Código frontend | 6/10 | God component, routing manual, sem tipos |
| Banco de dados | 8/10 | Schema bem pensado, RLS, RPCs atômicas |
| Testes | 3/10 | 1 spec e2e + 2 scripts SQL = muito pouco |
| Performance | 5/10 | Joins em JS, índices faltando, cache por módulo |
| Manutenibilidade | 6/10 | DAL monolítico, sem TypeScript |
| UX/UI | 7/10 | Design consistente, faltam skeletons e validações |
| **NOTA GERAL** | **6/10** | Produto funcional com débito técnico significativo |

---

## 13. Prioridade das Correções

### Imediato (esta semana)
1. Rotar a Supabase service key — comprometida desde que o código foi a um repositório com `.env.local`
2. Remover `VITE_SUPABASE_SERVICE_KEY` do frontend — nunca deve ter `VITE_` prefix
3. Verificar se `.env.local` está no `.gitignore` e remover do histórico git se necessário (`git filter-branch` ou BFG)
4. Adicionar `loja_id` na tabela `historico` + RLS policy

### Alta (próximas 2 semanas)
5. Hash SHA-256 nos tokens de barbeiro
6. Hash bcrypt na senha do app (ou remover o `LoginApp` e usar apenas `SenhaModal`)
7. Rate limiting nas rotas `/api/admin/*`
8. Índices de banco faltantes
9. Refatorar `getClientesComStats` para query com JOIN

### Média (próximo mês)
10. Migrar para TypeScript (começar pelos services e models)
11. Quebrar `supabaseDb.js` em módulos por domínio
12. Implementar React Query para cache cross-tab
13. Separar `AppPrincipal` em hooks e componentes menores
14. Migrar roteamento para react-router-dom

### Baixa (backlog)
15. Skeleton loaders
16. Validação client-side com Zod
17. Cobertura de testes (unitários para `beneficiosCalc`, `desconto`, `comandasService`)
18. CSP headers
19. Timeout configurável por loja

---

## 14. Sugestões de Stack/Bibliotecas

| Necessidade | Atual | Sugerido |
|-------------|-------|----------|
| Tipagem | JavaScript puro | TypeScript 5 |
| Roteamento | Manual (`pathname` + `view` state) | react-router-dom v6 |
| Estado server | Cache de módulo manual | TanStack Query v5 |
| Formulários | `useState` manual | react-hook-form + Zod |
| Rate limiting | Nenhum | @upstash/ratelimit |
| Hash de token | Plaintext | Node.js `crypto.createHash("sha256")` |
| Hash de senha | Plaintext | bcryptjs |
| Testes unitários | Vitest (configurado, subutilizado) | Vitest + Testing Library |
| Testes e2e | Playwright (1 spec) | Playwright (expandir) |
| Monitoramento de erros | `console.error` | Sentry |

---

## 15. Exemplo de Código Melhor Estruturado

### Antes — `getClientesComStats` (join em JS):
```javascript
async function getClientesComStats() {
  const [{ data: clientes }, { data: atends }] = await Promise.all([
    supabase.from("clientes").select("*").order("data_cadastro", { ascending: false }),
    supabase.from("atendimentos").select("cliente_id, cliente_nome, valor_total, data_hora")
      .eq("status", "concluido"),
  ]);
  // ... 20 linhas de join em JavaScript
}
```

### Depois — query com JOIN no banco:
```javascript
// src/services/db/clientes.ts
import { supabase } from "../supabase";
import type { ClienteComStats } from "../../types";

export async function getClientesComStats(): Promise<ClienteComStats[]> {
  const { data, error } = await supabase
    .rpc("clientes_com_stats")  // view ou RPC no banco
    .order("data_cadastro", { ascending: false });

  if (error) throw new Error(`getClientesComStats: ${error.message}`);
  return data ?? [];
}
```

```sql
-- supabase/migrations/20260601_view_clientes_stats.sql
CREATE OR REPLACE VIEW clientes_com_stats AS
SELECT
  c.*,
  COUNT(a.id) FILTER (WHERE a.status = 'concluido') AS total_atendimentos,
  COALESCE(SUM(a.valor_total) FILTER (WHERE a.status = 'concluido'), 0) AS total_gasto,
  MAX(a.data_hora) AS ultima_visita
FROM clientes c
LEFT JOIN atendimentos a ON a.cliente_id = c.id
GROUP BY c.id;
```

### Antes — roteamento em cascata:
```javascript
{view === "configuracoes" ? <Configuracoes />
: view === "sobre" ? <Sobre />
: view === "servicos" ? <Servicos />
// ... 12 condicionais
```

### Depois — roteamento declarativo com proteção:
```typescript
// src/routes.ts
type Route = {
  component: React.LazyExoticComponent<React.FC>;
  protegeFinanceiro?: boolean;
};

export const ROUTES: Record<string, Route> = {
  agenda:        { component: Agenda },
  comandas:      { component: Comandas },
  financeiro:    { component: Dashboard, protegeFinanceiro: true },
  relatorios:    { component: Relatorios, protegeFinanceiro: true },
  configuracoes: { component: Configuracoes },
  // ...
};

// Em AppPrincipal:
const rota = ROUTES[view];
const ViewComponent = rota?.component ?? EmBreve;
```

---

## Roadmap Técnico de Melhorias

```
Sprint 1 (Semana 1-2) — SEGURANÇA
  ├── Rotar service key + remover do frontend
  ├── Adicionar loja_id na tabela historico
  ├── Hash em tokens de barbeiro
  └── Rate limiting nas APIs admin

Sprint 2 (Semana 3-4) — QUALIDADE DE DADOS
  ├── Migrar getClientesComStats para VIEW SQL
  ├── Adicionar índices faltantes
  └── Corrigir fallbacks de schema (consolidar migrations)

Sprint 3 (Mês 2) — ARQUITETURA FRONTEND
  ├── Migrar para TypeScript (interfaces + services)
  ├── Quebrar supabaseDb.js em módulos
  ├── Implementar React Query
  └── Migrar para react-router-dom

Sprint 4 (Mês 3) — QUALIDADE E TESTES
  ├── Testes unitários: beneficiosCalc, desconto, comandasService
  ├── Testes e2e: fluxo completo de comanda
  ├── Validação client-side com Zod
  └── Sentry para monitoramento de erros
```

---

## Lista de Débito Técnico

1. `historico` sem `loja_id` e sem RLS
2. Service key exposta no frontend (CRÍTICO)
3. Tokens de barbeiro em plaintext
4. Senha do app em plaintext
5. Join de clientes+atendimentos em JS
6. `supabaseDb.js` monolítico (905 linhas)
7. Roteamento manual (consts de módulo + if/else cascata)
8. `AppPrincipal` como God Component
9. Ausência de TypeScript
10. Cache de módulo não compartilhado entre abas
11. Fallback de schema via try/catch em produção
12. Sem rate limiting
13. Índices de banco faltantes
14. Testes insuficientes (1 spec e2e, poucos unitários)
15. `baixarEstoqueComanda` fallback não-atômico

---

## Nível Esperado do Desenvolvedor

O código evidencia um **desenvolvedor Pleno sólido** com tendências de Sênior:

**Sinais de maturidade acima da média:**
- Entende multi-tenancy e RLS
- Usou locking otimista e RPCs atômicas (conceitos avançados)
- Separou 3 contextos de autenticação corretamente
- Auditoria append-only, soft delete
- Cache simples mas funcional com invalidação
- Fallback JS para migration não deployada

**Sinais de gap para Sênior:**
- Crítico de segurança (service key no frontend) indica falta de revisão de threat model
- God component e routing manual indicam que ainda não internalizou Clean Architecture em frontend
- Ausência de TypeScript em projeto com 19 tabelas e 50+ funções é um risco que um sênior evitaria
- Joins em JS ao invés de SQL indicam menor proficiência em PostgreSQL avançado
- Testes insuficientes para um produto financeiro

**Conclusão:** Desenvolvedor capaz de entregar produto funcional e com boa intuição arquitetural, mas que precisa maturar em segurança ofensiva/defensiva, organização de código em escala e disciplina de testes. Com as correções críticas de segurança implementadas, o produto está próximo de nível profissional para o porte atual.
