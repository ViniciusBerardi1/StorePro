-- Função administrativa para excluir uma loja e todos os seus dados.
--
-- Problema: as tabelas de auditoria (movimentos_caixa, comanda_eventos,
-- historico) têm trigger append-only que bloqueia DELETE. O ON DELETE CASCADE
-- de `lojas` tenta deletar essas linhas e o trigger rejeita.
--
-- Solução: modificar fn_bloquear_mutacao_auditoria para respeitar a variável
-- de sessão customizada `app.admin_delete_override`. SET LOCAL é permitido para
-- qualquer role e reverte automaticamente ao fim da transação.

-- ─── 1. Atualiza o guard append-only para aceitar override de admin ────────
create or replace function fn_bloquear_mutacao_auditoria()
returns trigger language plpgsql as $$
begin
  if current_setting('app.admin_delete_override', true) = 'true' then
    return old;
  end if;
  raise exception
    'Tabela de auditoria "%" é append-only. Registro id=% não pode ser alterado nem deletado.',
    TG_TABLE_NAME, coalesce(OLD.id::text, '?')
    using errcode = 'P0020';
end;
$$;

-- ─── 2. Recria admin_delete_loja usando a variável de sessão ──────────────
create or replace function admin_delete_loja(p_loja_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sinaliza para os triggers append-only que este é um delete administrativo.
  -- SET LOCAL reverte automaticamente ao final da transação.
  set local app.admin_delete_override = 'true';
  delete from lojas where id = p_loja_id;
end;
$$;

-- ─── 3. Permissões: somente service_role ──────────────────────────────────
revoke all on function admin_delete_loja(uuid) from public;
revoke all on function admin_delete_loja(uuid) from anon;
revoke all on function admin_delete_loja(uuid) from authenticated;
grant execute on function admin_delete_loja(uuid) to service_role;
