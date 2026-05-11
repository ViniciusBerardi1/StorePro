-- ============================================================
-- StorePro — Limpar dados de demonstração/teste
-- Mantém: lojas, profiles, auth.users (usuários e senhas)
-- Remove: todo conteúdo operacional inserido manualmente
--
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- Desabilita triggers append-only para permitir DELETE
alter table historico        disable trigger trg_imutavel_historico;
alter table comanda_eventos  disable trigger trg_imutavel_comanda_eventos;
alter table audit_log        disable trigger trg_imutavel_audit_log;
alter table movimentos_caixa disable trigger trg_imutavel_movimentos_caixa;

-- Remove dados respeitando ordem de FKs
delete from uso_beneficios;
delete from comanda_eventos;
delete from movimentos_caixa;
update atendimentos set comanda_id      = null;  -- quebra FK circular
update comandas     set sessao_caixa_id = null;  -- quebra FK → sessoes_caixa
delete from atendimentos;
delete from comandas;
delete from sessoes_caixa;
delete from assinaturas;
delete from historico;
delete from webhook_logs;
delete from audit_log;
delete from planos;
delete from barbeiros;
delete from servicos;
delete from clientes;
delete from produtos;
delete from configuracoes;
delete from horarios_especiais;

-- Reabilita triggers
alter table historico        enable trigger trg_imutavel_historico;
alter table comanda_eventos  enable trigger trg_imutavel_comanda_eventos;
alter table audit_log        enable trigger trg_imutavel_audit_log;
alter table movimentos_caixa enable trigger trg_imutavel_movimentos_caixa;

-- Confirma o que ficou
select 'lojas'    as tabela, count(*) as registros from lojas
union all
select 'profiles',           count(*) from profiles
union all
select 'barbeiros',          count(*) from barbeiros
union all
select 'servicos',           count(*) from servicos
union all
select 'clientes',           count(*) from clientes
union all
select 'produtos',           count(*) from produtos
union all
select 'comandas',           count(*) from comandas;
