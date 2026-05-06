-- 1) Garantir tabela
create table if not exists public.order_email_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  kind text not null default 'paid_confirmation',
  status text not null default 'sending',
  source text,
  recipient_email text,
  resend_email_id text,
  error_code text,
  error_message text,
  attempt_count int not null default 0,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Adicionar colunas novas em tabelas pré-existentes
alter table public.order_email_notifications
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists source text,
  add column if not exists recipient_email text,
  add column if not exists resend_email_id text,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists attempt_count int not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- 3) Backfill id
update public.order_email_notifications set id = gen_random_uuid() where id is null;
alter table public.order_email_notifications alter column id set not null;

-- 4) Migrar colunas legadas se existirem
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='order_email_notifications' and column_name='resend_message_id') then
    execute 'update public.order_email_notifications set resend_email_id = coalesce(resend_email_id, resend_message_id)';
    execute 'alter table public.order_email_notifications drop column resend_message_id';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='order_email_notifications' and column_name='last_error') then
    execute 'update public.order_email_notifications set error_message = coalesce(error_message, last_error)';
    execute 'alter table public.order_email_notifications drop column last_error';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='order_email_notifications' and column_name='attempts') then
    execute 'update public.order_email_notifications set attempt_count = greatest(attempt_count, attempts)';
    execute 'alter table public.order_email_notifications drop column attempts';
  end if;
end $$;

-- 5) Backfill claimed_at + normalizar status legado
update public.order_email_notifications set claimed_at = coalesce(claimed_at, created_at, now()) where claimed_at is null;
alter table public.order_email_notifications alter column claimed_at set not null;
update public.order_email_notifications set status = 'sending' where status = 'pending';
alter table public.order_email_notifications alter column status set default 'sending';

-- 6) Trocar PK para id
do $$
declare _pk text;
begin
  select conname into _pk
    from pg_constraint
   where conrelid = 'public.order_email_notifications'::regclass and contype = 'p';
  if _pk is not null and _pk <> 'order_email_notifications_pkey_id' then
    execute format('alter table public.order_email_notifications drop constraint %I', _pk);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.order_email_notifications'::regclass and contype='p') then
    execute 'alter table public.order_email_notifications add constraint order_email_notifications_pkey_id primary key (id)';
  end if;
end $$;

-- 7) Unique (order_id, kind)
create unique index if not exists ux_order_email_notifications_order_kind
  on public.order_email_notifications (order_id, kind);

-- 8) Constraint de status
alter table public.order_email_notifications drop constraint if exists order_email_notifications_status_chk;
alter table public.order_email_notifications
  add constraint order_email_notifications_status_chk
  check (status in ('sending','sent','failed'));

-- 9) Garantir função e trigger de updated_at (defensivo)
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_oen_updated_at on public.order_email_notifications;
create trigger set_oen_updated_at before update on public.order_email_notifications
  for each row execute function public.update_updated_at_column();

-- 10) Index auxiliar
create index if not exists idx_oen_status on public.order_email_notifications(status);