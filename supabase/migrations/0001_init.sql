-- ============================================================
-- Nidito · migración inicial (fase 0)
-- Crea el hogar de dos personas, las reglas de seguridad (RLS) y las
-- funciones de alta. Copiado del esqueleto de GasTitos. Se puede ejecutar
-- varias veces sin romper nada. Las tablas de casas llegan en la fase 1.
-- ============================================================

create extension if not exists pgcrypto;

-- Registro de migraciones aplicadas (lo usa el workflow de GitHub)
create table if not exists public.schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TABLAS
-- ------------------------------------------------------------

-- Un "hogar" es la pareja. Tiene un código de invitación para que
-- la segunda persona se una.
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at  timestamptz not null default now()
);

-- Quién pertenece a qué hogar. Cada usuario solo puede estar en uno.
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

-- ------------------------------------------------------------
-- FUNCIONES DE APOYO
-- ------------------------------------------------------------

-- Hogar del usuario que está haciendo la petición (o null si no tiene).
-- security definer: se salta RLS para evitar consultas recursivas.
create or replace function public.current_household_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1
$$;

-- Máximo dos miembros por hogar.
create or replace function public.enforce_two_members()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.household_members where household_id = new.household_id) >= 2 then
    raise exception 'Este hogar ya tiene dos miembros';
  end if;
  return new;
end
$$;
drop trigger if exists household_members_max_two on public.household_members;
create trigger household_members_max_two
  before insert on public.household_members
  for each row execute function public.enforce_two_members();

-- Crear un hogar y unirse a él (lo llama la app la primera vez).
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  if length(trim(p_name)) = 0 or length(trim(p_display_name)) = 0 then
    raise exception 'El nombre del hogar y el tuyo no pueden estar vacíos';
  end if;
  insert into public.households (name) values (trim(p_name)) returning id into hid;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, auth.uid(), trim(p_display_name));
  return hid;
end
$$;

-- Unirse a un hogar existente con su código de invitación.
create or replace function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  select id into hid from public.households where invite_code = upper(trim(p_code));
  if hid is null then
    raise exception 'Código de invitación no válido';
  end if;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, auth.uid(), trim(p_display_name));
  return hid;
end
$$;

-- Solo usuarios autenticados pueden llamar a estas funciones.
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
grant  execute on function public.create_household(text, text) to authenticated;
grant  execute on function public.join_household(text, text) to authenticated;
grant  execute on function public.current_household_id() to authenticated, anon;

-- ------------------------------------------------------------
-- SEGURIDAD (RLS) · activada en TODAS las tablas
-- ------------------------------------------------------------

alter table public.schema_migrations  enable row level security;
alter table public.households         enable row level security;
alter table public.household_members  enable row level security;

-- schema_migrations: sin políticas = nadie desde la app (solo el workflow).

-- households: solo veo mi hogar; solo lo modifico si soy miembro.
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (id = public.current_household_id());

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (id = public.current_household_id())
  with check (id = public.current_household_id());

-- household_members: veo a los miembros de mi hogar. Nadie inserta directamente
-- (se hace por create_household / join_household). Puedo editar mi propio nombre.
drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists members_update_self on public.household_members;
create policy members_update_self on public.household_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = public.current_household_id());

-- Marcar esta migración como aplicada (por si se ejecuta a mano en el SQL Editor)
insert into public.schema_migrations (filename) values ('0001_init.sql')
on conflict (filename) do nothing;
