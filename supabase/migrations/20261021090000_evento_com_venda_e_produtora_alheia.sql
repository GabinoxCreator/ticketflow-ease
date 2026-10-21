-- OS-266 (21/10/2026) · Produtor não apaga pedido pago nem usa a página de outro.
-- Nasceu da varredura OS-262 (_docs/varredura-banco/site-2026-10-17.md, achados E9, B5 e B6).
--
-- 1) Evento que já tem pedido, ingresso ou venda na porta não se apaga (E9).
--    As chaves orders/tickets/door_sales -> events são ON DELETE CASCADE: apagar o
--    evento levava junto todos os pedidos e ingressos dele, pagos ou não, e fere
--    "pedido nunca é apagado" (lição de 23/05). A trava é um gatilho, e não a regra
--    de acesso, para valer para todo mundo: o produtor, a casa (admin) e a cascata
--    que vem de apagar a conta do produtor (profiles -> events). Uma regra de acesso
--    só esconderia a linha, e o painel diria "Evento excluído" sem ter excluído.
--    Para tirar o evento do ar, despublica-se (unpublish_event), como já existe.
--    Evento sem nenhum pedido (rascunho que nunca vendeu) continua se apagando.
--
-- 2) O evento só fica pendurado em produtora de que o usuário é membro ativo (B5).
--    Antes, INSERT e UPDATE aceitavam qualquer producer_profile_id, e a página
--    pública da produtora lista os eventos por esse campo, com a marca e o contato
--    dela. O dono da produtora é membro "owner" (17 de 17 em 21/10). O campo vazio
--    continua valendo (16 eventos antigos não têm produtora). A casa (admin) segue
--    pela regra própria "Admins podem gerenciar todos os eventos".
--
-- 3) Imagem do bucket event-images: trocar e apagar só quem subiu o arquivo, ou a
--    casa (B6). Antes bastava ser produtor. O dono do arquivo é o owner_id que o
--    próprio storage grava na subida (85 de 85 preenchidos em 21/10). Não vale
--    "o arquivo que o meu evento usa": o endereço da imagem é texto livre no evento,
--    e bastaria copiar o endereço da imagem de outro produtor para poder apagá-la.
--    Subir arquivo novo segue igual. Quem tenta apagar arquivo de outro recebe
--    resposta vazia do storage (sem erro), e a tela segue: o arquivo só fica sem uso.

-- 1) Evento com pedido não se apaga ---------------------------------------------
create or replace function public._evento_com_pedido_nao_se_apaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.orders where event_id = old.id)
     or exists (select 1 from public.tickets where event_id = old.id)
     or exists (select 1 from public.door_sales where event_id = old.id) then
    raise exception 'Este evento já tem pedidos e não pode ser excluído. Para tirá-lo do ar, despublique o evento.'
      using errcode = 'P0001', hint = 'evento_com_pedidos';
  end if;
  return old;
end;
$$;

revoke all on function public._evento_com_pedido_nao_se_apaga() from public, anon, authenticated;

drop trigger if exists trg_evento_com_pedido_nao_se_apaga on public.events;
create trigger trg_evento_com_pedido_nao_se_apaga
  before delete on public.events
  for each row execute function public._evento_com_pedido_nao_se_apaga();

-- 2) Evento só na produtora de que o usuário é membro ---------------------------
alter policy "Produtores podem criar eventos" on public.events
  with check (
    producer_id = auth.uid()
    and public.has_role(auth.uid(), 'produtor'::app_role)
    and (producer_profile_id is null or public.is_producer_member(auth.uid(), producer_profile_id))
  );

alter policy "Produtores podem atualizar seus eventos" on public.events
  using (producer_id = auth.uid())
  with check (
    producer_id = auth.uid()
    and (producer_profile_id is null or public.is_producer_member(auth.uid(), producer_profile_id))
  );

-- 3) Imagem de evento: troca e apaga só quem subiu, ou a casa ---------------------
alter policy "event-images authorized update" on storage.objects
  using (
    bucket_id = 'event-images'
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or owner_id = (auth.uid())::text
    )
  )
  with check (
    bucket_id = 'event-images'
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or owner_id = (auth.uid())::text
    )
  );

alter policy "event-images authorized delete" on storage.objects
  using (
    bucket_id = 'event-images'
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or owner_id = (auth.uid())::text
    )
  );

-- VOLTAR ATRÁS (só se precisar; devolve exatamente o que estava no ar em 21/10):
-- drop trigger if exists trg_evento_com_pedido_nao_se_apaga on public.events;
-- drop function if exists public._evento_com_pedido_nao_se_apaga();
-- alter policy "Produtores podem criar eventos" on public.events
--   with check ((producer_id = auth.uid()) and has_role(auth.uid(), 'produtor'::app_role));
-- alter policy "Produtores podem atualizar seus eventos" on public.events
--   using (producer_id = auth.uid()) with check (producer_id = auth.uid());
-- alter policy "event-images authorized update" on storage.objects
--   using ((bucket_id = 'event-images') and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'produtor'::app_role)
--          or exists (select 1 from public.producer_members where producer_members.user_id = auth.uid() and producer_members.status = 'active')))
--   with check ((bucket_id = 'event-images') and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'produtor'::app_role)
--          or exists (select 1 from public.producer_members where producer_members.user_id = auth.uid() and producer_members.status = 'active')));
-- alter policy "event-images authorized delete" on storage.objects
--   using ((bucket_id = 'event-images') and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'produtor'::app_role)
--          or exists (select 1 from public.producer_members where producer_members.user_id = auth.uid() and producer_members.status = 'active')));
