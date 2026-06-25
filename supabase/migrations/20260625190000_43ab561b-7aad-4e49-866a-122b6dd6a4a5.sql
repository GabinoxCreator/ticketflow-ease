-- Telemetria de cliques de doação — SOMENTE evento beneficente (Confra do Bem,
-- slug 5-confra-do-bem). Conta cliques em "Doar" (card) e "Copiar PIX" (modal).
-- Gravação EXCLUSIVAMENTE via edge function track-donation-click (service-role).
-- RLS ligado SEM policy: nenhum acesso anon/auth; só o service-role ignora RLS.
-- Hardcoded sob o slug; generalizar no futuro modo "evento beneficente" (roadmap.md).
create table if not exists public.donation_click_events (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null,
  button text not null check (button in ('doar', 'copiar_pix')),
  created_at timestamptz not null default now()
);

create index if not exists donation_click_events_slug_button_idx
  on public.donation_click_events (event_slug, button);

alter table public.donation_click_events enable row level security;
-- Intencional: sem CREATE POLICY. INSERT só pela edge com service-role.
