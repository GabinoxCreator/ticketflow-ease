-- Evento privado: publica e vende normalmente, mas NÃO aparece nas listagens públicas.
-- Só quem tem o link abre a página. Pedido do cliente Torcida Jovem (24/09/2026).
--
-- Por que coluna nova e não um valor novo de `status`: `status = 'published'` é checado
-- em ~20 pontos do site (venda, checkout, painel do produtor, colaborador, mapa de mesas)
-- e na própria policy pública de `events`. Um status novo tiraria o evento privado da
-- venda junto. Aqui o evento privado continua `published` — muda só onde ele é LISTADO.
--
-- Aditiva: default `true` mantém todos os eventos de hoje exatamente como estão.
alter table public.events
  add column if not exists is_public boolean not null default true;

comment on column public.events.is_public is
  'Falso = evento privado: some da home e das listagens públicas, abre só por link direto. Continua publicado e vendendo normalmente.';

-- A home filtra por (is_public, status, date).
create index if not exists idx_events_publicos_por_data
  on public.events (date)
  where is_public and status = 'published';
