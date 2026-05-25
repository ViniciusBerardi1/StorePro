-- Cria a stored procedure baixar_estoque_comanda
-- Baixa o estoque de um conjunto de produtos de forma atômica (dentro de uma transação).
-- Se qualquer update falhar, tudo é revertido — sem inconsistência de estoque.
--
-- Parâmetro: items JSONB — array de {produto_id: int, quantidade: int}
-- Execução: cole este arquivo inteiro no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION baixar_estoque_comanda(items JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja_id      UUID;
  v_item         JSONB;
  v_produto      RECORD;
  v_nova_qtd     INT;
  v_tipo         TEXT;
BEGIN
  -- Resolve loja_id do usuário autenticado
  SELECT loja_id INTO v_loja_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem loja vinculada';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(items)
  LOOP
    -- FOR UPDATE garante lock de linha e evita race condition concorrente
    SELECT
      p.id,
      p.quantidade,
      p.nome,
      p.cor,
      p.foto,
      c.nome AS categoria_nome
    INTO v_produto
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.id      = (v_item->>'produto_id')::INT
      AND p.loja_id = v_loja_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE; -- produto não pertence a esta loja, ignora silenciosamente
    END IF;

    v_nova_qtd := GREATEST(0, v_produto.quantidade - (v_item->>'quantidade')::INT);

    -- Nada mudou, pula
    IF v_nova_qtd = v_produto.quantidade THEN
      CONTINUE;
    END IF;

    UPDATE produtos
    SET quantidade = v_nova_qtd
    WHERE id = v_produto.id;

    v_tipo := CASE WHEN v_nova_qtd = 0 THEN 'zerado' ELSE 'saida' END;

    INSERT INTO historico (
      produto_id, produto_nome, produto_cor, categoria_nome, foto,
      tipo, quantidade_anterior, quantidade_nova, loja_id
    ) VALUES (
      v_produto.id,
      v_produto.nome,
      COALESCE(v_produto.cor, ''),
      COALESCE(v_produto.categoria_nome, ''),
      COALESCE(v_produto.foto, ''),
      v_tipo,
      v_produto.quantidade,
      v_nova_qtd,
      v_loja_id
    );
  END LOOP;
END;
$$;
