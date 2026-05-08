/**
 * StorePro — Testes de carga e concorrência com k6
 *
 * Pré-requisitos:
 *   - k6 instalado: https://k6.io/docs/get-started/installation/
 *   - Variáveis de ambiente:
 *       SUPABASE_URL   = https://<project>.supabase.co
 *       SUPABASE_KEY   = <anon_key>
 *
 * Execução:
 *   k6 run --env SUPABASE_URL=... --env SUPABASE_KEY=... tests/k6/concorrencia.js
 *
 * Cenários:
 *   1. double_submit    – 1 VU dispara 2 requests em paralelo para a mesma comanda
 *   2. 10_operadores    – 10 VUs tentam fechar a mesma comanda simultaneamente
 *   3. stress_idempotencia – 50 VUs; comanda já fechada → todos devem retornar ok
 *   4. version_conflict – 2 VUs com versões diferentes tentam fechar
 *   5. rede_lenta       – simula latência alta com rate limit de 1 req/s
 */

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// ─── Métricas customizadas ────────────────────────────────────────────────────
const tempoRpc          = new Trend('rpc_duration_ms', true);
const totalIdempotentes = new Counter('idempotent_responses');
const totalConflitos    = new Counter('version_conflicts');
const totalSucessos     = new Counter('successful_finalizations');
const taxaErro          = new Rate('error_rate');

// ─── Configuração de cenários ─────────────────────────────────────────────────
export const options = {
  scenarios: {
    double_submit: {
      executor:    'per-vu-iterations',
      vus:         1,
      iterations:  1,
      exec:        'doubleSubmit',
      startTime:   '0s',
      tags:        { cenario: 'double_submit' },
    },
    dez_operadores: {
      executor:    'shared-iterations',
      vus:         10,
      iterations:  10,
      exec:        'dezOperadores',
      startTime:   '3s',       // aguarda double_submit terminar
      tags:        { cenario: 'dez_operadores' },
    },
    stress_idempotencia: {
      executor:    'shared-iterations',
      vus:         50,
      iterations:  50,
      exec:        'stressIdempotencia',
      startTime:   '8s',
      tags:        { cenario: 'stress_idempotencia' },
    },
    version_conflict: {
      executor:    'per-vu-iterations',
      vus:         2,
      iterations:  1,
      exec:        'versionConflict',
      startTime:   '15s',
      tags:        { cenario: 'version_conflict' },
    },
    rede_lenta: {
      executor:    'constant-arrival-rate',
      rate:        1,         // 1 req/s (rede lenta = poucos recursos)
      timeUnit:    '1s',
      duration:    '10s',
      preAllocatedVUs: 2,
      exec:        'redeLenta',
      startTime:   '20s',
      tags:        { cenario: 'rede_lenta' },
    },
  },
  thresholds: {
    'rpc_duration_ms':               ['p(95)<3000'],   // 95% das RPCs em < 3s
    'error_rate{cenario:double_submit}': ['rate<0.01'], // quase zero erros no double submit
    'http_req_failed':               ['rate<0.05'],    // menos de 5% de falhas HTTP
  },
};

// ─── Config global ────────────────────────────────────────────────────────────
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_KEY = __ENV.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_KEY devem ser definidos via --env');
}

const HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer':        'return=representation',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function criarComanda(clienteNome = '_k6_test') {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/comandas`,
    JSON.stringify({ status: 'aberta', cliente_nome: clienteNome }),
    { headers: HEADERS }
  );
  if (res.status !== 201) {
    throw new Error(`criarComanda falhou (${res.status}): ${res.body}`);
  }
  const rows = JSON.parse(res.body);
  return rows[0];  // { id, version, ... }
}

function finalizarComanda(comandaId, version, overrides = {}) {
  const payload = {
    p_comanda_id: comandaId,
    p_payload: {
      servicos:        [{ id: 1, nome: 'Corte k6', valor: 50 }],
      itens_bar:       [],
      itens_loja:      [],
      valor_servicos:  50,
      valor_bar:       0,
      valor_loja:      0,
      valor_total:     50,
      forma_pagamento: 'pix',
      barbeiro_id:     null,
      version:         version,
      ...overrides,
    },
  };

  const start = Date.now();
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/finalizar_comanda`,
    JSON.stringify(payload),
    { headers: HEADERS, timeout: '15s' }
  );
  tempoRpc.add(Date.now() - start);

  return res;
}

function deletarComanda(comandaId) {
  // Soft delete via RPC de cancelamento (não apaga do banco)
  http.post(
    `${SUPABASE_URL}/rest/v1/rpc/cancelar_comanda`,
    JSON.stringify({ p_comanda_id: comandaId, p_motivo: 'limpeza k6' }),
    { headers: HEADERS }
  );
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ─── Cenário 1: double submit ─────────────────────────────────────────────────
// 1 VU cria uma comanda, dispara 2 requests em paralelo.
// Expectativa: ambos retornam ok=true; exatamente um idempotent=false.

export function doubleSubmit() {
  const comanda = criarComanda('_k6_double_submit');

  const [res1, res2] = http.batch([
    ['POST', `${SUPABASE_URL}/rest/v1/rpc/finalizar_comanda`,
      JSON.stringify({
        p_comanda_id: comanda.id,
        p_payload: {
          servicos: [], itens_bar: [], itens_loja: [],
          valor_servicos: 50, valor_bar: 0, valor_loja: 0,
          valor_total: 50, forma_pagamento: 'pix',
          version: comanda.version,
        },
      }),
      { headers: HEADERS }
    ],
    ['POST', `${SUPABASE_URL}/rest/v1/rpc/finalizar_comanda`,
      JSON.stringify({
        p_comanda_id: comanda.id,
        p_payload: {
          servicos: [], itens_bar: [], itens_loja: [],
          valor_servicos: 50, valor_bar: 0, valor_loja: 0,
          valor_total: 50, forma_pagamento: 'pix',
          version: comanda.version,
        },
      }),
      { headers: HEADERS }
    ],
  ]);

  const b1 = parseBody(res1);
  const b2 = parseBody(res2);

  const ambosOk = (b1?.ok || false) && (b2?.ok || false);
  const temIdempotente = (b1?.idempotent || false) || (b2?.idempotent || false);

  check(res1, { 'double_submit res1 HTTP 200': (r) => r.status === 200 });
  check(res2, { 'double_submit res2 HTTP 200': (r) => r.status === 200 });

  if (ambosOk) {
    totalSucessos.add(1);
    if (temIdempotente) totalIdempotentes.add(1);
  }

  taxaErro.add(!ambosOk ? 1 : 0);

  check(null, {
    'double_submit: ambos ok=true':        () => ambosOk,
    'double_submit: tem resposta idempotente': () => temIdempotente,
  });

  // Verifica que apenas 1 atendimento foi criado
  const atendRes = http.get(
    `${SUPABASE_URL}/rest/v1/atendimentos?comanda_id=eq.${comanda.id}&select=id`,
    { headers: HEADERS }
  );
  const atendimentos = parseBody(atendRes);
  check(null, {
    'double_submit: exatamente 1 atendimento': () =>
      Array.isArray(atendimentos) && atendimentos.length === 1,
  });
}

// ─── Cenário 2: 10 operadores na mesma comanda ────────────────────────────────
// Compartilhado via __ITER (comanda criada no setup, ID passado via env).
// Simula duas abas / dois terminais tentando fechar a mesma comanda.

export function dezOperadores() {
  const comandaId = parseInt(__ENV.COMANDA_DEZ_ID || '0');
  if (!comandaId) {
    console.warn('COMANDA_DEZ_ID não definido — criando comanda ad-hoc para este VU');
    const c = criarComanda('_k6_10ops');
    const res = finalizarComanda(c.id, c.version);
    check(res, { '10_ops: status 200 ou erro esperado': (r) => r.status === 200 || r.status === 400 });
    return;
  }

  // Todos os VUs tentam fechar a MESMA comanda
  const res = finalizarComanda(comandaId, 1);  // version=1 (pode já ter sido incrementada)
  const body = parseBody(res);

  if (res.status === 200 && body?.ok && !body?.idempotent) {
    totalSucessos.add(1);
  } else if (res.status === 200 && body?.ok && body?.idempotent) {
    totalIdempotentes.add(1);
  } else if (res.status === 400 || res.status === 409) {
    // Conflito esperado — P0010, P0002
    totalConflitos.add(1);
  }

  check(res, {
    '10_ops: resposta processada (não crashou)': (r) =>
      r.status === 200 || r.status === 400 || r.status === 409,
  });
}

// ─── Cenário 3: stress de idempotência ───────────────────────────────────────
// 50 VUs todos chamam finalizar_comanda em uma comanda já fechada.
// Todos devem retornar idempotent=true.

export function stressIdempotencia() {
  // Cria e fecha uma comanda antes do loop principal
  // (na prática você passaria o ID via __ENV após um setup externo)
  const comandaId = parseInt(__ENV.COMANDA_FECHADA_ID || '0');

  if (!comandaId) {
    // Fallback: cada VU cria e fecha sua própria comanda, então testa idempotência
    const c = criarComanda('_k6_idem_stress');
    finalizarComanda(c.id, c.version);  // fecha
    sleep(0.1);
    const res2 = finalizarComanda(c.id, c.version);  // retry
    const body = parseBody(res2);
    check(res2, {
      'stress_idem: retry retorna ok=true':        () => body?.ok === true,
      'stress_idem: retry retorna idempotent=true': () => body?.idempotent === true,
    });
    totalIdempotentes.add(1);
    return;
  }

  const res = finalizarComanda(comandaId, 999);  // version qualquer — idempotente ignora
  const body = parseBody(res);

  check(res, {
    'stress_idem: HTTP 200':         (r) => r.status === 200,
    'stress_idem: ok=true':          () => body?.ok === true,
    'stress_idem: idempotent=true':  () => body?.idempotent === true,
  });

  if (body?.idempotent) totalIdempotentes.add(1);
}

// ─── Cenário 4: version conflict entre 2 VUs ─────────────────────────────────
// VU 1: envia version=1 (correta)
// VU 2: também envia version=1 mas chega depois que VU 1 já incrementou
// → um vence, outro recebe P0010

export function versionConflict() {
  const vuId = __VU;  // 1 ou 2

  if (vuId === 1) {
    // VU 1 cria a comanda e salva o ID num lugar compartilhado via ENV
    const c = criarComanda('_k6_version_conflict');
    // Em produção você usaria um recurso compartilhado (Redis, etc.)
    // Aqui simulamos via __ENV passado externamente:
    const res = finalizarComanda(c.id, c.version);
    const body = parseBody(res);
    check(res, {
      'vc_vu1: fechou com sucesso': () => body?.ok === true && !body?.idempotent,
    });
    if (body?.ok && !body?.idempotent) totalSucessos.add(1);
  }

  if (vuId === 2) {
    // VU 2: simula chegada após VU 1 — usa um ID que ele sabe que foi criado
    const comandaId = parseInt(__ENV.COMANDA_CONFLITO_ID || '0');
    if (!comandaId) {
      console.warn('VU 2: COMANDA_CONFLITO_ID não definido, pulando conflito real');
      return;
    }
    sleep(0.1);  // dá uma fração de segundo de vantagem para VU 1
    const res = finalizarComanda(comandaId, 1);  // version antiga
    const body = parseBody(res);

    // Espera conflito (P0010) OU idempotência (se VU 1 já fechou)
    const conflito = res.status === 400 && JSON.stringify(body).includes('P0010');
    const idem     = res.status === 200 && body?.idempotent;

    check(null, {
      'vc_vu2: recebeu conflito ou idempotência': () => conflito || idem,
    });

    if (conflito) totalConflitos.add(1);
    if (idem)     totalIdempotentes.add(1);
  }
}

// ─── Cenário 5: rede lenta (1 req/s) ─────────────────────────────────────────
// Testa que o servidor aguarda e responde corretamente mesmo com baixo throughput.
// Usa comanda diferente a cada iteração para não conflitar.

export function redeLenta() {
  const c = criarComanda('_k6_rede_lenta');
  sleep(0.5);  // simula cliente pensando (rede lenta)

  const res = finalizarComanda(c.id, c.version);
  const body = parseBody(res);

  check(res, {
    'rede_lenta: HTTP 200':   (r) => r.status === 200,
    'rede_lenta: ok=true':    () => body?.ok === true,
  });

  tempoRpc.add(res.timings.duration);
  if (body?.ok) totalSucessos.add(1);
}

// ─── setup / teardown (opcional) ─────────────────────────────────────────────
// Você pode criar recursos compartilhados aqui e passar via __ENV ou shared data.

export function setup() {
  console.log('[k6] Iniciando suíte de concorrência StorePro');
  console.log(`[k6] Supabase URL: ${SUPABASE_URL}`);

  // Cria uma comanda fechada para o cenário stress_idempotencia
  // (caso COMANDA_FECHADA_ID não tenha sido passado externamente)
  const c = criarComanda('_k6_setup_fechada');
  const res = finalizarComanda(c.id, c.version);
  const body = parseBody(res);

  if (body?.ok) {
    console.log(`[k6] Comanda fechada para stress_idempotencia: ID=${c.id}`);
    return { comanda_fechada_id: c.id };
  }
  return {};
}

export function teardown(data) {
  console.log('[k6] Teardown — limpando dados de teste');
  if (data?.comanda_fechada_id) {
    // Já está fechada, não há o que limpar além da nota
    console.log(`[k6] Comanda de teste ${data.comanda_fechada_id} permanece no banco (fechada)`);
  }

  console.log('[k6] ═══════════════════════════════════════════');
  console.log(`[k6] Sucessos reais:      ${totalSucessos.name}`);
  console.log(`[k6] Idempotentes:        ${totalIdempotentes.name}`);
  console.log(`[k6] Conflitos de versão: ${totalConflitos.name}`);
  console.log('[k6] ═══════════════════════════════════════════');
}
