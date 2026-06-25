-- Barra de arrecadação — SOMENTE evento beneficente (Confra do Bem, 5-confra-do-bem).
-- Número CURADO: atualizado à mão por SQL (não soma pagamentos nem donation_click_events).
-- RLS ligado COM select público (a barra é pública e só lê). INSERT/UPDATE só pelo
-- owner/service-role via SQL Editor — sem policy de escrita pública.
-- Hardcoded sob o slug; generalizar no futuro modo "evento beneficente" (roadmap.md).
create table if not exists public.donation_campaign_progress (
  event_slug text primary key,
  goal_amount_cents bigint not null,
  raised_amount_cents bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.donation_campaign_progress enable row level security;

-- Leitura pública (anon/auth): a barra aparece pra qualquer visitante.
create policy donation_campaign_progress_public_select
  on public.donation_campaign_progress
  for select
  using (true);

-- Seed inicial Confra do Bem: meta R$ 230.000,00 / arrecadado R$ 14.000,00.
insert into public.donation_campaign_progress (event_slug, goal_amount_cents, raised_amount_cents)
values ('5-confra-do-bem', 23000000, 1400000)
on conflict (event_slug) do nothing;
