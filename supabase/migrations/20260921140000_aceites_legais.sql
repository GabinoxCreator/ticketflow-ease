-- Aceite dos documentos legais: passa a existir e a ficar guardado.
--
-- Por que: em 21/09/2026 a investigação achou que (a) o comprador não aceita nada,
-- nem no cadastro nem no checkout, e (b) o produtor marca uma caixa obrigatória que
-- não é gravada em lugar nenhum. Os Termos são justamente o documento que diz que
-- quem responde pelo evento é o produtor — sem prova de aceite, ele é difícil de
-- sustentar. Aceite por clique vale no Brasil desde que haja data e versão.
--
-- Regra da casa: quem grava é o SERVIDOR (edge ou gatilho). Aceite que o navegador
-- grava é aceite que qualquer um forja, e registro forjável não serve de prova.

create table if not exists public.aceites_legais (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  -- 'termos' | 'privacidade' | 'reembolso'
  documento   text not null check (documento in ('termos', 'privacidade', 'reembolso')),
  -- A DATA do documento aceito (ex.: '2026-04-14'), que é como as páginas se
  -- versionam. Muda o texto, muda a data, e o aceite seguinte nasce com a nova.
  versao      text not null check (versao ~ '^\d{4}-\d{2}-\d{2}$'),
  aceito_em   timestamptz not null default now(),
  -- onde o aceite aconteceu: 'cadastro_cliente' | 'cadastro_produtor' | 'checkout'
  contexto    text not null,
  -- O gatilho do banco não enxerga o pedido HTTP, então nesses casos fica nulo.
  -- Isso é esperado: a prova principal é usuário + documento + versão + data.
  ip          inet,
  navegador   text,
  pedido_id   uuid references public.orders(id) on delete set null
);

comment on table public.aceites_legais is
  'Registro histórico de aceite dos documentos legais. Append-only: nunca UPDATE, nunca DELETE — documento novo é linha nova.';

create index if not exists idx_aceites_legais_usuario on public.aceites_legais (usuario_id, documento, aceito_em desc);
create index if not exists idx_aceites_legais_pedido on public.aceites_legais (pedido_id) where pedido_id is not null;

alter table public.aceites_legais enable row level security;

-- O titular vê os aceites dele (direito de acesso do art. 18 da LGPD).
drop policy if exists "titular le os proprios aceites" on public.aceites_legais;
create policy "titular le os proprios aceites"
  on public.aceites_legais for select
  using (auth.uid() = usuario_id);

-- Admin da plataforma vê todos (é quem responde numa disputa).
drop policy if exists "admin le todos os aceites" on public.aceites_legais;
create policy "admin le todos os aceites"
  on public.aceites_legais for select
  using (public.has_role(auth.uid(), 'admin'));

-- NINGUÉM escreve pela chave pública. Sem policy de insert/update/delete, só o
-- service role (edges) e as funções SECURITY DEFINER conseguem gravar.
revoke all on public.aceites_legais from anon, authenticated;
grant select on public.aceites_legais to authenticated;

-- ── Quem grava ──────────────────────────────────────────────────────────────
-- Uma porta só, usada pelo gatilho do cadastro e pelas edges. Ignora repetido
-- (mesma pessoa, mesmo documento, mesma versão, mesmo contexto) para que uma
-- retentativa de rede não vire duas linhas.
create or replace function public.registrar_aceite(
  _usuario_id uuid,
  _versoes    jsonb,      -- {"termos":"2026-04-14","privacidade":"2026-07-05"}
  _contexto   text,
  _ip         inet default null,
  _navegador  text default null,
  _pedido_id  uuid default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _doc      text;
  _versao   text;
  _gravados integer := 0;
begin
  if _usuario_id is null or _versoes is null then
    return 0;
  end if;

  for _doc, _versao in select key, value #>> '{}' from jsonb_each(_versoes) loop
    -- Documento fora da lista ou versão com formato estranho é ignorado em
    -- silêncio: aceite é acessório do cadastro e NUNCA pode derrubar a criação
    -- da conta ou o fechamento do pedido.
    continue when _doc not in ('termos', 'privacidade', 'reembolso');
    continue when _versao !~ '^\d{4}-\d{2}-\d{2}$';

    if not exists (
      select 1 from public.aceites_legais a
      where a.usuario_id = _usuario_id
        and a.documento  = _doc
        and a.versao     = _versao
        and a.contexto   = _contexto
        and (_pedido_id is null or a.pedido_id is not distinct from _pedido_id)
    ) then
      insert into public.aceites_legais (usuario_id, documento, versao, contexto, ip, navegador, pedido_id)
      values (_usuario_id, _doc, _versao, _contexto, _ip, _navegador, _pedido_id);
      _gravados := _gravados + 1;
    end if;
  end loop;

  return _gravados;
end;
$$;

-- Só o servidor chama. O `REVOKE FROM PUBLIC` não tira o que o Supabase concede
-- direto a anon/authenticated na criação, então os dois vão nomeados
-- (lição de 17/09: `next_activation_code_numeric` ficou aberta exatamente assim).
revoke execute on function public.registrar_aceite(uuid, jsonb, text, inet, text, uuid) from public;
revoke execute on function public.registrar_aceite(uuid, jsonb, text, inet, text, uuid) from anon;
revoke execute on function public.registrar_aceite(uuid, jsonb, text, inet, text, uuid) from authenticated;

-- ── O gatilho do cadastro passa a gravar o aceite ───────────────────────────
-- Recriado a partir do corpo em produção (21/09/2026), com UMA adição no fim: a
-- chamada a registrar_aceite. Todo o resto é igual, inclusive as duas travas de
-- segurança de 22/06 e 09/09 (admin nunca por signup; produtor exige e-mail).
--
-- ⚠️ Quem editar este gatilho no futuro: ele é a única porta do cadastro do
-- PRODUTOR (o cliente entra pela edge auth-codigo, que grava o aceite por lá).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _role app_role;
  _pp_id uuid;
  _cpf_raw text;
  _cpf_norm text;
  _tipo_pessoa text;
  _sem_email boolean;                                               -- v2
  _email text;                                                      -- v2
  _aceites jsonb;                                                   -- 21/09
BEGIN
  _cpf_raw := new.raw_user_meta_data ->> 'cpf';
  _cpf_norm := CASE
    WHEN _cpf_raw IS NULL OR _cpf_raw = '' THEN NULL
    ELSE NULLIF(regexp_replace(_cpf_raw, '\D', '', 'g'), '')
  END;

  -- 'pf' | 'pj' — só o wizard de produtor manda. Ausente = cadastro antigo ou de
  -- cliente; nesse caso legal_name fica NULL, que é o comportamento de hoje.
  _tipo_pessoa := lower(coalesce(new.raw_user_meta_data ->> 'tipo_pessoa', ''));

  -- v2: conta criada só com WhatsApp. O Supabase exige um e-mail, então ela
  -- recebe um interno (<cpf>@sem-email.festpag.digital) e o metadata marca
  -- `sem_email`. No perfil o e-mail fica VAZIO — nenhum envio vai para lá.
  _sem_email := coalesce(new.raw_user_meta_data ->> 'sem_email', '') IN ('true', '1');
  _email := CASE WHEN _sem_email THEN '' ELSE coalesce(new.email, '') END;

  INSERT INTO public.profiles (id, nome_completo, whatsapp, email, cpf)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    _email,                                                         -- v2
    _cpf_norm
  );

  _role := coalesce((new.raw_user_meta_data ->> 'tipo_conta')::app_role, 'cliente');

  -- 'admin' NUNCA é concedido por signup self-service: rebaixa pra 'cliente'.
  -- (Trava de segurança de 22/06/2026 — não remover numa recriação futura.)
  IF _role = 'admin' THEN
    _role := 'cliente';
  END IF;

  -- v2: produtor continua exigindo e-mail de verdade (decisão do Gabriel, 09/09).
  IF _role = 'produtor' AND (_sem_email OR new.email IS NULL) THEN
    _role := 'cliente';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _role);

  IF _role = 'produtor' THEN
    INSERT INTO public.producer_profiles (
      owner_user_id, brand_name, email, document, legal_name, phone
    )
    VALUES (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'nome_completo', 'Minha Organização'),
      new.email,
      -- Mesmo valor normalizado que vai em profiles.cpf: CPF na PF, CNPJ na PJ.
      -- Só dígitos, porque é assim que a busca do painel de admin compara.
      _cpf_norm,
      -- Razão social só faz sentido em PJ. Na PF o campo do formulário é o nome
      -- da pessoa, que já está em brand_name — duplicar aqui só criaria confusão.
      CASE
        WHEN _tipo_pessoa = 'pj'
          THEN NULLIF(new.raw_user_meta_data ->> 'nome_completo', '')
        ELSE NULL
      END,
      NULLIF(new.raw_user_meta_data ->> 'whatsapp', '')
    )
    RETURNING id INTO _pp_id;

    INSERT INTO public.producer_members (producer_profile_id, user_id, role)
    VALUES (_pp_id, new.id, 'owner');
  END IF;

  -- 21/09/2026 — o aceite dos documentos legais deixa de morrer na tela.
  -- Envolvido em BEGIN/EXCEPTION porque aceite é acessório: se algo der errado
  -- aqui, a conta TEM que nascer do mesmo jeito. Perder um registro de aceite é
  -- ruim; impedir alguém de criar conta e comprar ingresso é pior.
  BEGIN
    _aceites := new.raw_user_meta_data -> 'aceites';
    IF _aceites IS NOT NULL AND jsonb_typeof(_aceites) = 'object' THEN
      PERFORM public.registrar_aceite(
        new.id,
        _aceites,
        CASE WHEN _role = 'produtor' THEN 'cadastro_produtor' ELSE 'cadastro_cliente' END
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'aceite nao gravado no cadastro de %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$function$;
