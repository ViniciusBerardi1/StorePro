-- ============================================================
-- StorePro — Migration: corrige criação de comanda via Agenda
-- Aplique após 20260507_002_optimistic_lock.sql
-- ============================================================

-- ─── Problema ───────────────────────────────────────────────
-- Quando o usuário abre um evento de agenda que já tinha uma
-- comanda fechada, criarComanda() tentava UPDATE na comanda
-- 'fechada' → trigger bloqueava com P0002 → erro silencioso
-- → tela de Comandas vazia.

-- ─── Solução ─────────────────────────────────────────────────
-- Estreitar a guarda do trigger: só bloquear mudanças de STATUS
-- a partir de 'fechada'. Outros campos (ex: gcal_event_id = null)
-- podem ser atualizados — necessário para desvincular o evento
-- da comanda antiga e associar a uma nova.

create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin
  -- Bloqueia apenas mudanças de status a partir de 'fechada'
  -- (permite atualizar outros campos, ex: gcal_event_id = null ao reabrir agenda)
  if OLD.status = 'fechada' and NEW.status is distinct from OLD.status then
    raise exception
      'Comanda % já está fechada e não pode ser reaberta', OLD.id
      using errcode = 'P0002';
  end if;

  -- Validações na transição para 'fechada'
  if NEW.status = 'fechada' then
    if NEW.forma_pagamento is null or
       NEW.forma_pagamento not in ('debito', 'credito', 'pix') then
      raise exception 'forma_pagamento inválida ou ausente: "%"',
        coalesce(NEW.forma_pagamento, 'null')
        using errcode = 'P0003';
    end if;
    if coalesce(NEW.valor_total, -1) < 0 then
      raise exception 'valor_total não pode ser negativo'
        using errcode = 'P0004';
    end if;
    v_soma := coalesce(NEW.valor_servicos, 0)
            + coalesce(NEW.valor_bar, 0)
            + coalesce(NEW.valor_loja, 0);
    if NEW.valor_total > round(v_soma + 0.01, 2) then
      raise exception
        'valor_total (%) superior à soma dos componentes (%). Possível manipulação.',
        NEW.valor_total, v_soma
        using errcode = 'P0005';
    end if;
    -- Timestamps do servidor — cliente não pode definir esses valores
    NEW.closed_at  := now();
    NEW.updated_at := now();
  else
    -- Autosave ou atualização parcial: apenas atualiza updated_at
    NEW.updated_at := now();
  end if;

  -- Incrementa version em TODA atualização bem-sucedida
  NEW.version := coalesce(OLD.version, 0) + 1;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();
