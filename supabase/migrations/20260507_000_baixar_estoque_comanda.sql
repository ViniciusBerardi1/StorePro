-- ============================================================
-- StorePro — Migration: função baixar_estoque_comanda
-- Aplique ANTES de 20260507_001_finalizar_comanda.sql
-- ============================================================
-- Baixa estoque em batch atômico ao finalizar uma comanda.
-- Referenciada via PERFORM dentro de finalizar_comanda().
-- PostgreSQL resolve referências em runtime, por isso a criação
-- de finalizar_comanda não falha mesmo se esta função não existir
-- ainda — mas a chamada falha com 42883 quando há produtos.

create or replace function baixar_estoque_comanda(items jsonb)
returns void language plpgsql as $$
declare
  item_rec  jsonb;
  v_pid     int;
  v_qtd     int;
  v_ant     int;
  v_nov     int;
  v_nome    text;
  v_cor     text;
  v_cat     text;
  v_foto    text;
  v_tipo    text;
begin
  for item_rec in select * from jsonb_array_elements(items)
  loop
    v_pid := (item_rec->>'produto_id')::int;
    v_qtd := (item_rec->>'quantidade')::int;

    select p.quantidade, p.nome, p.cor, coalesce(c.nome,''), p.foto
    into   v_ant, v_nome, v_cor, v_cat, v_foto
    from   produtos p
    left   join categorias c on c.id = p.categoria_id
    where  p.id = v_pid
    for    update of p;

    if not found then continue; end if;

    v_ant := coalesce(v_ant, 0);
    v_nov := greatest(0, v_ant - v_qtd);

    if v_ant = v_nov then continue; end if;

    update produtos set quantidade = v_nov where id = v_pid;

    v_tipo := case
      when v_nov = 0         then 'zerado'
      when v_nov > v_ant     then 'entrada'
      else                        'saida'
    end;

    insert into historico(
      produto_id, produto_nome, produto_cor, categoria_nome, foto,
      tipo, quantidade_anterior, quantidade_nova
    ) values (
      v_pid, v_nome, coalesce(v_cor,''), v_cat, v_foto,
      v_tipo, v_ant, v_nov
    );
  end loop;
end;
$$;
