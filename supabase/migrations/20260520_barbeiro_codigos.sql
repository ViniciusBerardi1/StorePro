-- Gera codigo_acesso único para todos os barbeiros que ainda não têm um.
-- Cada código é de 6 dígitos, único globalmente (o login não recebe contexto de loja).

DO $$
DECLARE
  b        RECORD;
  tentativa VARCHAR(10);
BEGIN
  FOR b IN SELECT id FROM barbeiros WHERE codigo_acesso IS NULL AND ativo = true LOOP
    LOOP
      -- gera número entre 100000 e 999999
      tentativa := LPAD(FLOOR(RANDOM() * 900000 + 100000)::BIGINT::TEXT, 6, '0');
      BEGIN
        UPDATE barbeiros SET codigo_acesso = tentativa WHERE id = b.id;
        EXIT; -- sucesso: vai para o próximo barbeiro
      EXCEPTION WHEN unique_violation THEN
        NULL; -- colisão: tenta novo número
      END;
    END LOOP;
  END LOOP;
END $$;
