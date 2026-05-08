import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Dashboard from "./Dashboard";

// O Dashboard busca dados internamente via supabaseDb
vi.mock("../../services/supabaseDb", () => ({
  db: {
    getAtendimentosPeriodo:     vi.fn(),
    getComandasFechadasPeriodo: vi.fn(),
  },
}));

import { db } from "../../services/supabaseDb";

const atendConcluido = {
  id: 1, status: "concluido", valor_total: 100,
  forma_pagamento: "pix", data_hora: new Date().toISOString(), cliente_nome: "João",
};

const atendCancelado = {
  id: 2, status: "cancelado", valor_total: 0,
  forma_pagamento: null, data_hora: new Date().toISOString(), cliente_nome: "Maria",
};

const cmdFechada = {
  id: 1, status: "fechada", valor_total: 100,
  valor_servicos: 100, valor_bar: 0, valor_loja: 0,
  forma_pagamento: "pix", created_at: new Date().toISOString(), cliente_nome: "João",
};

const produtoEstoqueBaixo = {
  id: 10, nome: "Gel Capilar", quantidade: 0, estoque_minimo: 2, preco_custo: 5,
};

const produtoEstoqueOk = {
  id: 11, nome: "Shampoo", quantidade: 10, estoque_minimo: 2, preco_custo: 8,
};

function renderDash(produtos = []) {
  return render(<Dashboard produtos={produtos} setView={vi.fn()} />);
}

// ─── Loading ──────────────────────────────────────────────────────

describe("Dashboard — loading", () => {
  it("mostra skeletons animados enquanto os dados carregam", () => {
    db.getAtendimentosPeriodo.mockReturnValue(new Promise(() => {}));
    db.getComandasFechadasPeriodo.mockReturnValue(new Promise(() => {}));
    renderDash();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ─── Erro de rede ─────────────────────────────────────────────────

describe("Dashboard — erro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exibe mensagem de erro quando o fetch falha", async () => {
    db.getAtendimentosPeriodo.mockRejectedValue(new Error("network error"));
    db.getComandasFechadasPeriodo.mockRejectedValue(new Error("network error"));
    renderDash();
    await waitFor(() =>
      expect(screen.getByText(/Erro ao carregar financeiro/i)).toBeInTheDocument()
    );
  });
});

// ─── KPIs com dados ───────────────────────────────────────────────

describe("Dashboard — KPIs financeiros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getAtendimentosPeriodo.mockResolvedValue([atendConcluido]);
    db.getComandasFechadasPeriodo.mockResolvedValue([cmdFechada]);
  });

  it("exibe o label 'Faturamento'", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("Faturamento")).toBeInTheDocument()
    );
  });

  it("exibe o label 'Atendimentos'", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("Atendimentos")).toBeInTheDocument()
    );
  });

  it("exibe o label 'Ticket médio'", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("Ticket médio")).toBeInTheDocument()
    );
  });

  it("exibe o label 'Comandas fechadas'", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("Comandas fechadas")).toBeInTheDocument()
    );
  });

  it("conta corretamente 1 atendimento concluído no sub-texto", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("1 concluídos")).toBeInTheDocument()
    );
  });

  it("exibe 0 concluídos quando todos os atendimentos são cancelados", async () => {
    db.getAtendimentosPeriodo.mockResolvedValue([atendCancelado]);
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("0 concluídos")).toBeInTheDocument()
    );
  });

  it("exibe quantidade de cancelados no sub-texto de atendimentos", async () => {
    db.getAtendimentosPeriodo.mockResolvedValue([atendConcluido, atendCancelado]);
    renderDash();
    await waitFor(() =>
      expect(screen.getByText("1 cancelados")).toBeInTheDocument()
    );
  });
});

// ─── Estoque ──────────────────────────────────────────────────────

describe("Dashboard — estoque baixo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getAtendimentosPeriodo.mockResolvedValue([]);
    db.getComandasFechadasPeriodo.mockResolvedValue([]);
  });

  it("exibe seção de estoque baixo quando há produtos com quantidade ≤ mínimo", async () => {
    renderDash([produtoEstoqueBaixo]);
    await waitFor(() =>
      expect(screen.getByText(/Estoque baixo/i)).toBeInTheDocument()
    );
    expect(screen.getByText("Gel Capilar")).toBeInTheDocument();
  });

  it("não exibe seção de estoque baixo quando todos os produtos estão ok", async () => {
    renderDash([produtoEstoqueOk]);
    await waitFor(() =>
      expect(screen.getByText("Faturamento")).toBeInTheDocument()
    );
    expect(screen.queryByText(/Estoque baixo/i)).not.toBeInTheDocument();
  });

  it("não exibe seção de estoque baixo quando lista de produtos está vazia", async () => {
    renderDash([]);
    await waitFor(() =>
      expect(screen.getByText("Faturamento")).toBeInTheDocument()
    );
    expect(screen.queryByText(/Estoque baixo/i)).not.toBeInTheDocument();
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────

describe("Dashboard — tabs Caixa/Extrato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getAtendimentosPeriodo.mockResolvedValue([]);
    db.getComandasFechadasPeriodo.mockResolvedValue([]);
  });

  it("exibe as tabs Caixa e Extrato", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Caixa/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Extrato/i })).toBeInTheDocument();
  });
});
