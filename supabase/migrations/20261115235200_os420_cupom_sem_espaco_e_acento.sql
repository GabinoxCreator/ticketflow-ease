-- OS-420 · O cupom vale mesmo digitado com espaço ou acento.
--
-- As artes do Fogo & Fumaça mostram "JP 10", "PACHÁ 10", "VITÓRIO 10". Quem
-- digitava igual à arte recebia "Cupom inválido", porque a `validate-coupon`
-- comparava o código letra por letra. Agora a COMPARAÇÃO ignora espaço (qualquer
-- espaço, inclusive no meio) e acento; o cupom continua gravado como o produtor
-- digitou, e nenhum cupom existente é regravado.
--
-- Por que não há índice único no código normalizado: o remendo de 10/11 criou
-- pares no mesmo evento que viram o mesmo código (PACHA10 / PACHÁ10, 4 pares no
-- Fogo & Fumaça em 15/11). Esses pares ficam como estão, os dois ativos; a trava
-- de duplicata vale só para cupom novo ou código editado (gatilho abaixo).
--
-- Ordem de subida: esta migration ANTES do redeploy da `validate-coupon`
-- (a edge nova chama `buscar_cupom`; sem a função, todo cupom daria inválido).
-- A edge velha continua funcionando com esta migration aplicada.
--
-- Voltar atrás (sem dado a desfazer, nada é regravado):
--   drop trigger if exists event_coupons_trava_duplicata on public.event_coupons;
--   drop function if exists public.event_coupons_trava_duplicata();
--   drop function if exists public.buscar_cupom(uuid, text);
--   drop function if exists public.cupom_normalizado(text);
-- (antes, devolver a `validate-coupon` à versão anterior, que não chama `buscar_cupom`).

-- O `create trigger` (e o `drop trigger if exists`, mesmo sem o gatilho existir)
-- pega trava forte em `event_coupons`: quem compra com cupom espera enquanto
-- isso. Se outra conversa segurar a tabela, desiste em 5 s em vez de enfileirar
-- todo mundo atrás (aplicar fora de venda; desistiu, nada fica pela metade,
-- é só rodar de novo). `local`: vale só para esta aplicação.
set local lock_timeout = '5s';

-- 1) Normalizar: maiúsculas, sem espaço, sem acento.
--    Sem regex e sem a extensão `unaccent`, para a função ser imutável:
--    `translate` troca cada letra acentuada pela simples (as duas listas de
--    letras têm o mesmo tamanho, 54) e APAGA o que vem depois na lista de
--    origem, que não tem par na de destino: espaço, tab, quebra de linha, os
--    espaços invisíveis que vêm de copiar e colar (U+00A0, U+2007, U+2009,
--    U+202F, U+200B, U+FEFF) e o acento "solto" de texto decomposto (NFD:
--    U+0300 grave, U+0301 agudo, U+0302 circunflexo, U+0303 til, U+0308 trema,
--    U+0327 cedilha, U+030A anel), que sobra quando o "Á" chega como "A" + acento.
--    Hífen, ponto, sublinhado, `%` e `*` continuam no texto como vieram: a busca
--    é por igualdade, nunca curinga (OS-269).
create or replace function public.cupom_normalizado(p_codigo text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.upper(
    pg_catalog.translate(
      coalesce(p_codigo, ''),
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸ'
        || E' \t\n\r\u00A0\u2007\u2009\u202F\u200B\uFEFF\u0300\u0301\u0302\u0303\u0308\u0327\u030A',
      'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNYY'
    )
  );
$$;

comment on function public.cupom_normalizado(text) is
  'OS-420: código do cupom em maiúsculas, sem espaço e sem acento, só para COMPARAR. O cupom continua gravado como o produtor digitou.';

-- 2) Achar o cupom do evento pelo que o comprador digitou.
--    Só cupons ATIVOS. Desempate quando dois do mesmo evento viram o mesmo
--    código (os pares do remendo): primeiro o digitado exatamente igual ao
--    gravado; depois o que ainda vale (validade e limite de uso); depois o
--    mais antigo; por fim o id, para a resposta ser sempre a mesma (os pares de
--    10/11 nasceram no mesmo instante). Texto vazio depois de normalizar, ou
--    com mais de 40 letras, não acha nada. Validade e limite continuam sendo
--    conferidos pela edge ("Cupom expirado" / "Cupom esgotado") e pelo
--    carrinho, pelo id.
create or replace function public.buscar_cupom(p_event_id uuid, p_codigo text)
returns setof public.event_coupons
language sql
stable
set search_path = ''
as $$
  with alvo as (
    select public.cupom_normalizado(p_codigo) as norm,
           pg_catalog.upper(pg_catalog.btrim(coalesce(p_codigo, ''))) as exato
  )
  select c.*
  from public.event_coupons c, alvo a
  where p_event_id is not null
    and a.norm <> ''
    and pg_catalog.length(a.norm) <= 40
    and c.event_id = p_event_id
    and c.is_active
    and public.cupom_normalizado(c.code) = a.norm
  order by
    (c.code = a.exato) desc,
    ((c.valid_until is null or c.valid_until >= pg_catalog.now())
      and (c.max_uses is null or c.uses_count < c.max_uses)) desc,
    c.created_at asc,
    c.id asc
  limit 1;
$$;

comment on function public.buscar_cupom(uuid, text) is
  'OS-420: acha o cupom ativo do evento ignorando espaço e acento (igualdade, sem curinga). Só a edge validate-coupon chama (service_role).';

-- Só o servidor chama: ninguém do navegador sonda cupom por aqui.
revoke all on function public.buscar_cupom(uuid, text) from public, anon, authenticated;
grant execute on function public.buscar_cupom(uuid, text) to service_role;

-- 3) Trava de duplicata para cupom novo ou código editado.
--    Gatilho DEPOIS da gravação (after), de propósito: o gatilho "before" roda
--    ANTES da regra de acesso (RLS), e qualquer pessoa logada (ou anônima, que
--    tem o privilégio de insert na tabela) descobriria se um código existe no
--    evento de outro produtor pela diferença entre "Já existe..." e "sem
--    permissão". No "after", quem não é dono do evento já foi barrado pela RLS.
--    `security definer` para enxergar todos os cupons do evento; só responde se
--    existe ou não. Editar o próprio cupom sem mudar o código passa (a trava
--    ignora a própria linha e nem roda quando código e evento não mudam). A
--    trava por evento (advisory lock até o fim da transação) impede que dois
--    "PACHA10" e "PACHÁ10" criados no mesmo instante passem os dois. Mesmo
--    código de erro do índice único (23505), com a frase que a tela do produtor
--    mostra.
create or replace function public.event_coupons_trava_duplicata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.code is not distinct from old.code
     and new.event_id is not distinct from old.event_id then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event_coupons:' || new.event_id::text, 420)
  );

  if exists (
    select 1
    from public.event_coupons c
    where c.event_id = new.event_id
      and c.id is distinct from new.id
      and public.cupom_normalizado(c.code) = public.cupom_normalizado(new.code)
  ) then
    raise exception 'Já existe um cupom com esse código neste evento.'
      using errcode = '23505';
  end if;

  return null;
end;
$$;

comment on function public.event_coupons_trava_duplicata() is
  'OS-420: recusa (23505) cupom novo ou código editado que, sem espaço e sem acento, fica igual a outro do mesmo evento. Gatilho after, depois da RLS.';

revoke all on function public.event_coupons_trava_duplicata() from public, anon, authenticated;

drop trigger if exists event_coupons_trava_duplicata on public.event_coupons;
create trigger event_coupons_trava_duplicata
  after insert or update of code, event_id on public.event_coupons
  for each row execute function public.event_coupons_trava_duplicata();
