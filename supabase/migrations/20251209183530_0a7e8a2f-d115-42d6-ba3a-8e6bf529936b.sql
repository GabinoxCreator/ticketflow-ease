-- Enum para tipos de role
create type public.app_role as enum ('cliente', 'produtor', 'admin');

-- Tabela de perfis (dados do usuário)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text not null,
  whatsapp text not null,
  email text not null,
  avatar_url text,
  created_at timestamp with time zone default now()
);

-- Tabela de roles (SEPARADA por segurança!)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'cliente',
  unique (user_id, role)
);

-- Habilitar RLS em ambas tabelas
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Função de segurança para verificar roles (evita recursão)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Políticas RLS para profiles
create policy "Usuários podem ver seu próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Usuários podem inserir seu próprio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Usuários podem atualizar seu próprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

-- Políticas RLS para user_roles
create policy "Usuários podem ver suas próprias roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Usuários podem inserir suas próprias roles"
  on public.user_roles for insert
  with check (auth.uid() = user_id);

-- Trigger para criar perfil automaticamente no signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome_completo, whatsapp, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    new.email
  );
  
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'tipo_conta')::app_role, 'cliente')
  );
  
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();