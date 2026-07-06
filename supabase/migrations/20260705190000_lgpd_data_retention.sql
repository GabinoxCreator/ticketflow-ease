-- LGPD (retenção/minimização): expurga/anonimiza PII que hoje acumula sem prazo.
-- Segue o padrão dos crons existentes (função SECURITY DEFINER + cron.schedule,
-- como sweep_expired_event_seat_holds). NÃO deleta pedido pago (princípio "pedido
-- nunca é apagado"): pedidos abandonados/expirados/cancelados são ANONIMIZADOS
-- (some a PII, mantém o registro contábil). Prazos conservadores; ajustáveis.
-- ⚠️ Aplicar no SQL Editor (commitar ≠ aplicar) e conferir com as queries do fim.

create or replace function public.lgpd_retention_sweep()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Leads comerciais: 12 meses após a coleta. Prospecção fria não justifica
  --    reter telefone/nome indefinidamente. Hard delete (não há valor fiscal).
  delete from public.landing_leads
   where created_at < now() - interval '12 months';

  -- 2) Pedidos NÃO pagos e antigos (abandoned/expired/cancelled/failed), 6 meses
  --    após a última atualização → anonimiza a PII do comprador, preserva a linha.
  update public.orders
     set customer_name  = '[retido-lgpd]',
         customer_email = 'retido+' || id || '@festpag.invalid',
         customer_phone = null,
         customer_cpf   = null,
         user_id        = null
   where status in ('abandoned','expired','cancelled','failed')
     and updated_at < now() - interval '6 months'
     and customer_name <> '[retido-lgpd]';

  -- 3) Ingressos dos pedidos não-pagos e antigos: mesma anonimização.
  update public.tickets t
     set holder_name  = '[retido-lgpd]',
         holder_email = null,
         holder_phone = null,
         user_id      = null
    from public.orders o
   where t.order_id = o.id
     and o.status in ('abandoned','expired','cancelled','failed')
     and o.updated_at < now() - interval '6 months'
     and t.holder_name <> '[retido-lgpd]';

  -- 4) Convidados de lista pública: 6 meses após o evento/coleta (só nome).
  delete from public.guest_list_entries
   where created_at < now() - interval '6 months';

  -- Códigos de verificação/reset expirados já têm limpeza própria; audit_logs
  -- fica (registro de segurança) — revisitar retenção de metadata depois.
end;
$$;

-- Diário, 03:15 (baixo tráfego). Idempotente: guards evitam reprocessar linhas.
select cron.schedule(
  'lgpd-retention-daily',
  '15 3 * * *',
  $job$select public.lgpd_retention_sweep();$job$
);

-- VERIFICAÇÕES (rodar depois de aplicar):
-- select public.lgpd_retention_sweep();  -- execução manual, deve rodar sem erro
-- select jobname, schedule from cron.job where jobname = 'lgpd-retention-daily';
