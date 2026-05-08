// Suíte Vitest: testa o service layer de comandas.
// Cobre idempotência, optimistic locking, race conditions e erros do banco.
// Execução: npm test  (ou npx vitest run)

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock('./googleCalendar', () => ({
  atualizarEvento: vi.fn(),
}));

import { parsearErroComanda, finalizarComanda } from './comandasService';
import { supabase } from './supabase';
import { atualizarEvento } from './googleCalendar';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const payloadBase = {
  servicos:             [{ id: 1, nome: 'Corte', valor: 50 }],
  itens_bar:            [],
  itens_loja:           [],
  valor_servicos:       50,
  valor_bar:            0,
  valor_loja:           0,
  valor_total:          50,
  forma_pagamento:      'pix',
  desconto:             null,
  barbeiro_id:          1,
  beneficio_desconto:   0,
  beneficios_aplicados: [],
  _benefRegistros:      [],
};

const comandaBase = {
  id:            42,
  version:       1,
  gcal_event_id: null,
  evento_gcal:   null,
  cliente_nome:  'João Silva',
};

const respostaOk = {
  data:  { ok: true, idempotent: false, comanda_id: 42, atendimento_id: 7, valor_total: 50 },
  error: null,
};

const respostaIdempotente = {
  data:  { ok: true, idempotent: true, comanda_id: 42, atendimento_id: 7, message: 'Comanda já fechada — resultado original retornado' },
  error: null,
};

// ─── parsearErroComanda ───────────────────────────────────────────────────────

describe('parsearErroComanda', () => {
  it.each([
    ['P0010',          'Conflito: comanda modificada por outra sessão (P0010)',        'modificada em outra aba'],
    ['Conflito',       'Conflito de versão detectado',                                 'modificada em outra aba'],
    ['P0002',          'P0002 gerado pelo trigger',                                    'já foi fechada'],
    ['já está fechada','Comanda 42 já está fechada: campos são imutáveis.',            'já foi fechada'],
    ['P0006',          'Comanda 42 está cancelada (P0006)',                            'foi cancelada'],
    ['cancelada',      'comanda foi cancelada',                                        'foi cancelada'],
    ['P0003',          'forma_pagamento inválida (P0003)',                             'forma de pagamento'],
    ['forma_pagamento','forma_pagamento ausente do payload',                           'forma de pagamento'],
    ['P0005',          'valor_total superior à soma dos componentes (P0005)',          'Erro de cálculo'],
    ['superior à soma','valor 100 superior à soma 50.00',                             'Erro de cálculo'],
  ])('mapeia "%s" → mensagem amigável contendo "%s"', (_, rawMsg, expectedFragment) => {
    expect(parsearErroComanda(rawMsg)).toContain(expectedFragment);
  });

  it('retorna a mensagem original para erros desconhecidos', () => {
    const msg = 'Erro genérico desconhecido do banco';
    expect(parsearErroComanda(msg)).toBe(msg);
  });

  it('aceita string vazia sem explodir', () => {
    expect(() => parsearErroComanda('')).not.toThrow();
  });

  it('aceita undefined sem explodir', () => {
    expect(() => parsearErroComanda(undefined)).not.toThrow();
  });
});

// ─── finalizarComanda — caminho feliz ─────────────────────────────────────────

describe('finalizarComanda — caminho feliz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.rpc.mockResolvedValue(respostaOk);
    atualizarEvento.mockResolvedValue({});
  });

  it('chama supabase.rpc("finalizar_comanda") uma única vez', async () => {
    await finalizarComanda(comandaBase, payloadBase);
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('finalizar_comanda', expect.any(Object));
  });

  it('envia p_comanda_id correto', async () => {
    await finalizarComanda(comandaBase, payloadBase);
    const chamada = supabase.rpc.mock.calls[0][1];
    expect(chamada.p_comanda_id).toBe(42);
  });

  it('envia version do cliente no payload (optimistic locking)', async () => {
    await finalizarComanda(comandaBase, payloadBase);
    const chamada = supabase.rpc.mock.calls[0][1];
    expect(chamada.p_payload.version).toBe(1);
  });

  it('retorna dados da RPC em sucesso', async () => {
    const result = await finalizarComanda(comandaBase, payloadBase);
    expect(result.ok).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.atendimento_id).toBe(7);
  });

  it('não chama atualizarEvento quando gcal_event_id é null', async () => {
    await finalizarComanda({ ...comandaBase, gcal_event_id: null }, payloadBase);
    expect(atualizarEvento).not.toHaveBeenCalled();
  });

  it('chama atualizarEvento quando gcal_event_id existe', async () => {
    const comanda = {
      ...comandaBase,
      gcal_event_id: 'gcal_abc123',
      evento_gcal: {
        summary:     'Corte — João',
        start:       { dateTime: '2026-05-07T10:00:00Z' },
        end:         { dateTime: '2026-05-07T10:30:00Z' },
        description: '',
      },
    };
    await finalizarComanda(comanda, payloadBase);
    expect(atualizarEvento).toHaveBeenCalledOnce();
    expect(atualizarEvento.mock.calls[0][0]).toBe('gcal_abc123');
  });

  it('falha no GCal não propaga — RPC já confirmada, GCal é eventual consistency', async () => {
    atualizarEvento.mockRejectedValue(new Error('GCal offline'));
    const comanda = {
      ...comandaBase,
      gcal_event_id: 'gcal_abc',
      evento_gcal:   { summary: 'Corte', start: { dateTime: '2026-05-07T10:00:00Z' }, end: { dateTime: '2026-05-07T10:30:00Z' }, description: '' },
    };
    await expect(finalizarComanda(comanda, payloadBase)).resolves.toBeDefined();
  });

  it('prefixa título com ✅ ao atualizar GCal', async () => {
    const comanda = {
      ...comandaBase,
      gcal_event_id: 'gcal_x',
      evento_gcal:   { summary: 'Corte — João', start: { dateTime: '2026-05-07T10:00:00Z' }, end: { dateTime: '2026-05-07T10:30:00Z' }, description: '' },
    };
    await finalizarComanda(comanda, payloadBase);
    const titulo = atualizarEvento.mock.calls[0][1].summary;
    expect(titulo).toMatch(/^✅/);
  });

  it('não duplica ✅ se título já começa com ele', async () => {
    const comanda = {
      ...comandaBase,
      gcal_event_id: 'gcal_x',
      evento_gcal:   { summary: '✅ Corte — João', start: { dateTime: '2026-05-07T10:00:00Z' }, end: { dateTime: '2026-05-07T10:30:00Z' }, description: '' },
    };
    await finalizarComanda(comanda, payloadBase);
    const titulo = atualizarEvento.mock.calls[0][1].summary;
    expect(titulo.match(/✅/g)).toHaveLength(1);
  });
});

// ─── finalizarComanda — idempotência ─────────────────────────────────────────

describe('finalizarComanda — idempotência', () => {
  beforeEach(() => vi.clearAllMocks());

  it('segunda chamada retorna idempotent=true sem lançar erro', async () => {
    supabase.rpc.mockResolvedValue(respostaIdempotente);
    const result = await finalizarComanda(comandaBase, payloadBase);
    expect(result.idempotent).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('double submit: ambas as promessas resolvem', async () => {
    // Simula: 1ª call demora, 2ª já vê comanda fechada (idempotente)
    let chamada = 0;
    supabase.rpc.mockImplementation(() => {
      chamada++;
      if (chamada === 1) {
        return new Promise((res) => setTimeout(() => res(respostaOk), 30));
      }
      return Promise.resolve(respostaIdempotente);
    });

    const [r1, r2] = await Promise.all([
      finalizarComanda(comandaBase, payloadBase),
      finalizarComanda(comandaBase, payloadBase),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Exatamente uma deve ser idempotente
    expect(r1.idempotent || r2.idempotent).toBe(true);
    expect(r1.idempotent && r2.idempotent).toBe(false);
  });

  it('retry após network error: segunda tentativa idempotente (banco não sofreu dupla escrita)', async () => {
    let tentativa = 0;
    supabase.rpc.mockImplementation(() => {
      tentativa++;
      if (tentativa === 1) return Promise.reject(new Error('network timeout'));
      return Promise.resolve(respostaIdempotente);
    });

    // Primeira tentativa falha
    await expect(finalizarComanda(comandaBase, payloadBase)).rejects.toThrow('network timeout');
    // Retry: banco já processou (ou não) — resultado idempotente é seguro
    const result = await finalizarComanda(comandaBase, payloadBase);
    expect(result.ok).toBe(true);
    expect(result.idempotent).toBe(true);
  });
});

// ─── finalizarComanda — erros do banco ───────────────────────────────────────

describe('finalizarComanda — erros mapeados do banco', () => {
  beforeEach(() => vi.clearAllMocks());

  it('P0010 (conflito de versão) → mensagem amigável', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'Conflito: comanda 42 foi modificada por outra sessão (version banco=2, version cliente=1). Recarregue e tente novamente.' },
    });
    await expect(finalizarComanda(comandaBase, payloadBase))
      .rejects.toThrow(/modificada em outra aba|outra sessão/i);
  });

  it('P0002 (já fechada) → mensagem amigável', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'Comanda 42 já está fechada: campos financeiros e de status são imutáveis.' },
    });
    await expect(finalizarComanda(comandaBase, payloadBase))
      .rejects.toThrow(/já foi fechada/i);
  });

  it('P0006 (cancelada) → mensagem amigável', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'Comanda 42 está cancelada (P0006)' },
    });
    await expect(finalizarComanda(comandaBase, payloadBase))
      .rejects.toThrow(/foi cancelada/i);
  });

  it('P0003 (forma_pagamento inválida) → mensagem amigável', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'forma_pagamento inválida ou ausente: "null"' },
    });
    await expect(finalizarComanda(comandaBase, payloadBase))
      .rejects.toThrow(/forma de pagamento/i);
  });

  it('P0005 (valor > soma componentes) → mensagem amigável', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'valor_total (100) superior à soma dos componentes (50.00). Possível manipulação.' },
    });
    await expect(finalizarComanda(comandaBase, payloadBase))
      .rejects.toThrow(/Erro de cálculo/i);
  });

  it('P0001 (comanda não encontrada) → lança erro', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'Comanda 42 não encontrada' },
    });
    await expect(finalizarComanda(comandaBase, payloadBase)).rejects.toThrow();
  });
});

// ─── finalizarComanda — optimistic locking ───────────────────────────────────

describe('finalizarComanda — optimistic locking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('version desatualizada (1 vs 3 no banco) → lança P0010', async () => {
    supabase.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'Conflito: comanda 42 foi modificada por outra sessão (version banco=3, version cliente=1). Recarregue e tente novamente.' },
    });
    const comandaDesatualizada = { ...comandaBase, version: 1 };
    await expect(finalizarComanda(comandaDesatualizada, payloadBase))
      .rejects.toThrow(/modificada em outra aba|outra sessão/i);
  });

  it('dois operadores simultâneos: um vence, outro recebe conflito', async () => {
    let chamadas = 0;
    supabase.rpc.mockImplementation(() => {
      chamadas++;
      if (chamadas === 1) return Promise.resolve(respostaOk);
      return Promise.resolve({
        data:  null,
        error: { message: 'Conflito: comanda 42 foi modificada por outra sessão (P0010)' },
      });
    });

    const resultados = await Promise.allSettled([
      finalizarComanda(comandaBase, payloadBase),
      finalizarComanda(comandaBase, payloadBase),
    ]);

    const sucessos = resultados.filter((r) => r.status === 'fulfilled');
    const falhas   = resultados.filter((r) => r.status === 'rejected');

    expect(sucessos).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].reason.message).toMatch(/modificada em outra aba|outra sessão/i);
  });

  it('envia version null quando comanda não tem version (compatibilidade)', async () => {
    supabase.rpc.mockResolvedValue(respostaOk);
    const comandaSemVersion = { ...comandaBase, version: undefined };
    await finalizarComanda(comandaSemVersion, payloadBase);
    const payload = supabase.rpc.mock.calls[0][1].p_payload;
    expect(payload.version).toBeNull();
  });
});

// ─── finalizarComanda — rede lenta / timeout ─────────────────────────────────

describe('finalizarComanda — rede lenta e timeout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resposta lenta (300ms) ainda resolve corretamente', async () => {
    supabase.rpc.mockImplementation(() =>
      new Promise((res) => setTimeout(() => res(respostaOk), 300))
    );
    const result = await finalizarComanda(comandaBase, payloadBase);
    expect(result.ok).toBe(true);
  }, 2000);

  it('rede cai (reject) → lança erro (sem engolir)', async () => {
    supabase.rpc.mockRejectedValue(new Error('Failed to fetch'));
    await expect(finalizarComanda(comandaBase, payloadBase)).rejects.toThrow('Failed to fetch');
  });

  it('cinco retries consecutivos: cada um idempotente após o primeiro sucesso', async () => {
    let n = 0;
    supabase.rpc.mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve(respostaOk);
      return Promise.resolve(respostaIdempotente);
    });

    const resultados = [];
    for (let i = 0; i < 5; i++) {
      resultados.push(await finalizarComanda(comandaBase, payloadBase));
    }

    expect(resultados[0].idempotent).toBe(false);
    resultados.slice(1).forEach((r) => expect(r.idempotent).toBe(true));
  });
});

// ─── finalizarComanda — validação de payload ─────────────────────────────────

describe('finalizarComanda — payload enviado para a RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.rpc.mockResolvedValue(respostaOk);
  });

  it('inclui todos os campos financeiros', async () => {
    await finalizarComanda(comandaBase, {
      ...payloadBase,
      valor_servicos: 40,
      valor_bar:      5,
      valor_loja:     5,
      valor_total:    50,
    });
    const p = supabase.rpc.mock.calls[0][1].p_payload;
    expect(p.valor_servicos).toBe(40);
    expect(p.valor_bar).toBe(5);
    expect(p.valor_loja).toBe(5);
    expect(p.valor_total).toBe(50);
  });

  it('defaults de arrays vazios para servicos/itens_bar/itens_loja ausentes', async () => {
    await finalizarComanda(comandaBase, {
      ...payloadBase,
      servicos:  undefined,
      itens_bar: undefined,
      itens_loja: undefined,
    });
    const p = supabase.rpc.mock.calls[0][1].p_payload;
    expect(p.servicos).toEqual([]);
    expect(p.itens_bar).toEqual([]);
    expect(p.itens_loja).toEqual([]);
  });

  it('defaults numéricos zerados quando valores ausentes', async () => {
    await finalizarComanda(comandaBase, {
      ...payloadBase,
      valor_servicos: undefined,
      valor_bar:      undefined,
      valor_loja:     undefined,
      valor_total:    undefined,
    });
    const p = supabase.rpc.mock.calls[0][1].p_payload;
    expect(p.valor_servicos).toBe(0);
    expect(p.valor_bar).toBe(0);
    expect(p.valor_loja).toBe(0);
    expect(p.valor_total).toBe(0);
  });
});
