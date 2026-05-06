create table public.order_email_notifications (
  order_id uuid primary key,
  kind text not null default 'paid_confirmation',
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  resend_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.order_email_notifications enable row level security;
create policy "Admins view order_email_notifications"
  on public.order_email_notifications
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));