-- ============================================================================
-- Espelho do DDL de RETIRADA DE ABADÁ (já aplicado direto no banco).
-- Evento "Feijuca da Ana": o abadá é entregue dias ANTES do evento. A retirada
-- valida o ingresso SEM consumi-lo — ele continua 'valid' para a portaria no dia.
-- Só versionamento; idempotente (add column if not exists).
-- ============================================================================

alter table public.tickets add column if not exists abada_redeemed_at timestamptz;
alter table public.tickets add column if not exists abada_redeemed_by uuid;

alter table public.events  add column if not exists abada_enabled boolean default false;
