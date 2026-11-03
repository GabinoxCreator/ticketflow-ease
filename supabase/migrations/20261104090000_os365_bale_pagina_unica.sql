-- ============================================================================
-- OS-365, ajuste da Doca 347 (pedido do Gabriel, 03/11): o Balé vira UMA página
-- ("Alice através da Dança", um link só), e as duas sessões continuam eventos
-- separados por trás, cada uma com o próprio mapa. A família abre a página,
-- toca em "Reservar poltrona", informa o CPF do aluno e a tela mostra a(s)
-- sessão(ões) dele.
--
-- O que muda no banco:
--   * listas_alunos ganha o link e o título da página (pagina_slug, pagina_titulo);
--   * evento_lista_info devolve os dois (o resto igual à 20261103130000);
--   * lista_pela_pagina(_slug): do link da página para a 1ª sessão publicada.
--     O site só pergunta isto quando o link não é de nenhum evento;
--   * o link de evento nunca pega o link de uma página: events_set_slug (a do
--     ar, igual) passa a pular os links das páginas (link_e_de_pagina). Sem
--     isso, um evento novo chamado "Alice através da Dança" (de qualquer
--     produtor) ganharia o link do QR das mães.
-- Não mexe em compra, ingresso, portaria nem repasse.
-- ============================================================================

alter table public.listas_alunos
  add column if not exists pagina_slug text,
  add column if not exists pagina_titulo text;

alter table public.listas_alunos
  drop constraint if exists listas_alunos_pagina_slug_formato;
alter table public.listas_alunos
  add constraint listas_alunos_pagina_slug_formato
  check (pagina_slug is null or pagina_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create unique index if not exists listas_alunos_pagina_slug_key
  on public.listas_alunos (pagina_slug) where pagina_slug is not null;

create or replace function public.evento_lista_info(_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object(
        'tem_lista', true,
        'lista_id', l.id,
        'limite_por_aluno', l.limite_por_aluno,
        'abre_em', l.abre_em,
        'sessao', le.sessao,
        'pagina_slug', l.pagina_slug,
        'pagina_titulo', l.pagina_titulo,
        'sessoes', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'event_id', e.id, 'slug', e.slug, 'title', e.title,
                   'date', e.date, 'time', e.time, 'sessao', le2.sessao)
                 order by le2.sessao)
            from public.listas_alunos_eventos le2
            join public.events e on e.id = le2.event_id
           where le2.lista_id = l.id
             and e.status = 'published'
        ), '[]'::jsonb)
      )
       from public.listas_alunos_eventos le
       join public.listas_alunos l on l.id = le.lista_id
      where le.event_id = _event_id
        and l.trava_ligada),
    jsonb_build_object('tem_lista', false)
  );
$$;

-- Do link da página para a 1ª sessão publicada. Sem dado de pessoa.
create or replace function public.lista_pela_pagina(_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object(
        'tem_pagina', true,
        'lista_id', l.id,
        'slug', l.pagina_slug,
        'titulo', l.pagina_titulo,
        'event_id', s.event_id)
       from public.listas_alunos l
       join lateral (
         select le.event_id
           from public.listas_alunos_eventos le
           join public.events e on e.id = le.event_id
          where le.lista_id = l.id
            and e.status = 'published'
          order by le.sessao
          limit 1
       ) s on true
      where l.pagina_slug = _slug
        and l.trava_ligada),
    jsonb_build_object('tem_pagina', false)
  );
$$;

revoke all on function public.lista_pela_pagina(text) from public;
grant execute on function public.lista_pela_pagina(text) to anon, authenticated, service_role;

-- O link da página é reservado: evento nenhum fica com ele.
create or replace function public.link_e_de_pagina(_slug text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.listas_alunos where pagina_slug = _slug);
$$;

-- Aberta a todos de propósito: o gatilho de link roda com o papel de quem grava
-- o evento (qualquer um que tenha INSERT em events), e ela só diz se um link é
-- de página (dado público).
grant execute on function public.link_e_de_pagina(text) to public;

-- events_set_slug do ar (md5 a210aec6… em 03/11), com duas mudanças: refaz o
-- link quando ele é o de uma página, e o candidato pula link de página.
create or replace function public.events_set_slug()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  base text;
  candidate text;
  suffix text;
  i int := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' OR (TG_OP = 'UPDATE' AND NEW.title <> OLD.title AND NEW.slug = OLD.slug)
     OR public.link_e_de_pagina(NEW.slug) THEN
    base := NULLIF(public.slugify(NEW.title), '');
    IF base IS NULL THEN base := 'evento'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.events WHERE slug = candidate AND id <> NEW.id) OR public.link_e_de_pagina(candidate) LOOP
      i := i + 1;
      IF i = 1 THEN
        suffix := substr(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 1, 6);
        candidate := base || '-' || suffix;
      ELSE
        candidate := base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      END IF;
      EXIT WHEN i > 5;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END $function$;
