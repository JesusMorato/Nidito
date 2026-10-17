-- ============================================================
-- Nidito · 0006 · El cajón "después"
--   households.finance: datos para el coste real (ITP, bonificaciones, hipoteca, alquiler).
--   places:      lugares importantes (trabajo de cada uno, familia) para medir distancias.
--   visits:      visitas con fecha, lista de comprobación y notas.
--   contact_log: llamadas y mensajes con la inmobiliaria, y el próximo paso.
--   zone_notes:  notas de barrio (valen para todas las casas de la zona).
-- Todo es del hogar; cada uno borra lo suyo donde hay autor.
-- ============================================================

alter table public.households add column if not exists finance jsonb not null default '{}'::jsonb;

create table if not exists public.places (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,
  created_at   timestamptz not null default now()
);
create index if not exists places_household_idx on public.places (household_id);

create table if not exists public.visits (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz,
  done         boolean not null default false,
  -- { "humedades": true, "presion_agua": false, … } (true = revisado y bien, false = problema, ausente = sin mirar)
  checklist    jsonb not null default '{}'::jsonb,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists visits_property_idx on public.visits (property_id, scheduled_at);

create table if not exists public.contact_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  happened_at  timestamptz not null default now(),
  kind         text not null default 'llamada' check (kind in ('llamada', 'mensaje', 'correo', 'visita', 'otro')),
  note         text,
  next_step    text,
  created_at   timestamptz not null default now()
);
create index if not exists contact_log_property_idx on public.contact_log (property_id, happened_at desc);

create table if not exists public.zone_notes (
  id         uuid primary key default gen_random_uuid(),
  zone_id    uuid not null references public.zones(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists zone_notes_zone_idx on public.zone_notes (zone_id, created_at);

-- ¿La zona es de mi hogar?
create or replace function public.zone_in_my_household(p_zone uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.zones z where z.id = p_zone and z.household_id = public.current_household_id())
$$;
grant execute on function public.zone_in_my_household(uuid) to authenticated;

alter table public.places      enable row level security;
alter table public.visits      enable row level security;
alter table public.contact_log enable row level security;
alter table public.zone_notes  enable row level security;

drop policy if exists places_all on public.places;
create policy places_all on public.places for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());

drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits for select to authenticated using (household_id = public.current_household_id());
drop policy if exists visits_insert on public.visits;
create policy visits_insert on public.visits for insert to authenticated
  with check (household_id = public.current_household_id() and created_by = auth.uid() and public.property_in_my_household(property_id));
drop policy if exists visits_update on public.visits;
create policy visits_update on public.visits for update to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
drop policy if exists visits_delete on public.visits;
create policy visits_delete on public.visits for delete to authenticated using (household_id = public.current_household_id());

drop policy if exists contact_select on public.contact_log;
create policy contact_select on public.contact_log for select to authenticated using (household_id = public.current_household_id());
drop policy if exists contact_insert on public.contact_log;
create policy contact_insert on public.contact_log for insert to authenticated
  with check (household_id = public.current_household_id() and user_id = auth.uid() and public.property_in_my_household(property_id));
drop policy if exists contact_update on public.contact_log;
create policy contact_update on public.contact_log for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists contact_delete on public.contact_log;
create policy contact_delete on public.contact_log for delete to authenticated using (user_id = auth.uid());

drop policy if exists zone_notes_select on public.zone_notes;
create policy zone_notes_select on public.zone_notes for select to authenticated using (public.zone_in_my_household(zone_id));
drop policy if exists zone_notes_insert on public.zone_notes;
create policy zone_notes_insert on public.zone_notes for insert to authenticated
  with check (user_id = auth.uid() and public.zone_in_my_household(zone_id));
drop policy if exists zone_notes_delete on public.zone_notes;
create policy zone_notes_delete on public.zone_notes for delete to authenticated using (user_id = auth.uid());

insert into public.schema_migrations (filename) values ('0006_despues.sql')
on conflict (filename) do nothing;
