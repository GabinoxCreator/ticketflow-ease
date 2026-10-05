-- OS-118 (05/10/2026): quem PAGA o reembolso fica sabendo que tem um para pagar.
--
-- POR QUE EXISTE: o aviso de reembolso só nascia no PEDIDO (gatilho
-- `trg_reembolsos_aviso`, OS-103) e ia para o Gabriel. A APROVAÇÃO não avisava
-- ninguém, e é nela que o dinheiro passa a ter de sair: quem dá a baixa (o João,
-- desde a OS-112) só descobria um reembolso aprovado abrindo a gestão por acaso.
-- Enquanto isso o comprador espera o dinheiro dele.
--
-- O que muda:
--   1. `reembolso_avisos` ganha o canal 'gestao_aprovado' (o sininho da
--      aprovação), com o mesmo registro e a mesma repesca dos outros dois;
--   2. um gatilho novo chama a edge `aviso-reembolso` com { evento: 'aprovado' }
--      quando o pedido passa de 'solicitado' para 'aprovado'.
-- Quem recebe o sininho quem decide é a gestão (edge `alerta-produtos`), pelo
-- tipo 'reembolso_aprovado'. WhatsApp na aprovação não existe: quem aprova é o
-- próprio Gabriel (decisão dele em 05/10: "faz o sininho").
--
-- Como voltar atrás:
--   drop trigger if exists trg_reembolsos_aviso_aprovado on public.reembolsos;
--   drop function if exists public.avisar_reembolso_aprovado();
--   (o canal a mais no check não atrapalha nada e pode ficar.)

alter table public.reembolso_avisos drop constraint if exists reembolso_avisos_canal_check;
alter table public.reembolso_avisos
  add constraint reembolso_avisos_canal_check
  check (canal in ('whatsapp', 'gestao', 'gestao_aprovado'));

-- REGRA DE OURO, igual à do pedido: falhar ao avisar NUNCA pode derrubar a
-- aprovação. O pg_net só manda depois do commit, então aprovação desfeita
-- (ex.: mesa_parcial_nao_suportada) não avisa nada.
create or replace function public.avisar_reembolso_aprovado()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _segredo text;
begin
  select decrypted_secret into _segredo
    from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;

  if _segredo is null then
    raise warning '[AVISO-REEMBOLSO] CRON_SECRET nao encontrado no Vault; aviso da aprovacao do reembolso % nao foi disparado', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/aviso-reembolso',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', _segredo
               ),
    body    := jsonb_build_object('reembolso_id', new.id, 'evento', 'aprovado', 'origem', 'gatilho'),
    timeout_milliseconds := 25000
  );

  return new;
exception when others then
  raise warning '[AVISO-REEMBOLSO] gatilho da aprovacao falhou para o reembolso %: %', new.id, sqlerrm;
  return new;
end;
$fn$;

comment on function public.avisar_reembolso_aprovado() is
  'Chama a edge aviso-reembolso quando a casa aprova um reembolso, para quem paga saber (OS-118). Nunca derruba a aprovação.';

revoke all on function public.avisar_reembolso_aprovado() from public, anon, authenticated;

drop trigger if exists trg_reembolsos_aviso_aprovado on public.reembolsos;
create trigger trg_reembolsos_aviso_aprovado
  after update of status on public.reembolsos
  for each row
  when (old.status = 'solicitado' and new.status = 'aprovado')
  execute function public.avisar_reembolso_aprovado();
