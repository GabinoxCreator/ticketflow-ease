-- Quem tem ingresso passa a ver o próprio evento, mesmo não publicado.
--
-- PROBLEMA: a política pública de `events` só expõe `status='published'`. Um
-- cliente com ingresso de evento em rascunho ou finalizado não conseguia ler o
-- evento — o embed voltava NULO e a página Meus Ingressos morria inteira (tela
-- preta, sem ver nem os ingressos bons). Media 11 clientes em 17/08/2026, e
-- crescia sozinho: todo evento vira `finished` ao terminar.
--
-- A trava no front (commit 270d0ed) impede a tela de quebrar, mas o cliente
-- ficava vendo "Evento não disponível" num evento que ele COMPROU. Esta é a
-- correção de raiz: quem pagou tem direito de ver o que comprou.
--
-- POR QUE SECURITY DEFINER: a política de SELECT de `tickets` já consulta
-- `events` ("Produtores podem ver ingressos de seus eventos"). Uma política em
-- `events` que consultasse `tickets` diretamente criaria recursão entre as duas.
-- A função roda por dentro, sem RLS, e devolve só um booleano — não expõe linha
-- de `tickets` a ninguém.
create or replace function public.user_holds_ticket_for_event(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tickets t
    where t.event_id = _event_id
      and t.user_id = auth.uid()
  );
$$;

revoke all on function public.user_holds_ticket_for_event(uuid) from public, anon;
grant execute on function public.user_holds_ticket_for_event(uuid) to authenticated;

create policy "Quem tem ingresso vê o próprio evento"
on public.events for select to authenticated
using (public.user_holds_ticket_for_event(id));

-- Acelera a política acima E a listagem de Meus Ingressos, que filtra tickets
-- por user_id e não tinha índice para isso (2.517 ingressos, 525 clientes).
create index if not exists idx_tickets_user_event on public.tickets (user_id, event_id);

-- PROVAS RODADAS EM PRODUÇÃO (17/08/2026), impersonando por request.jwt.claims:
--   · cliente COM ingresso do rascunho  → vê o evento (1 não-publicado + 17 publicados)
--   · cliente logado SEM aquele ingresso → 0 rascunhos, não vê o evento alheio
--   · visitante anônimo                  → 0 rascunhos
--   · cliente real (Made in Brazil Bar)  → passou a ver os 3 eventos que faltavam
