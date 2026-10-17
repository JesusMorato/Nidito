-- ============================================================
-- Nidito · 0003 · Valoraciones a dos (fase 2)
--   rating_aspects:     los aspectos que se puntúan (del hogar; vienen 10 de serie).
--   ratings:            estrellas 1–5 y comentario por casa, persona y aspecto.
--                       En modo "a ciegas" (households.blind_rating) la base de
--                       datos esconde las del otro hasta que yo he puntuado al
--                       menos un aspecto de esa casa.
--   property_reactions: veto ("para mí, no") con motivo y comentario general.
--   comments:           hilo de comentarios por casa.
--   push_subscriptions: aparatos con permiso para recibir avisos (copiado de GasTitos).
-- ============================================================

alter table public.households add column if not exists blind_rating boolean not null default true;

-- ------------------------------------------------------------
-- Aspectos
-- ------------------------------------------------------------
create table if not exists public.rating_aspects (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists rating_aspects_household_idx on public.rating_aspects (household_id, sort_order);

-- Los diez aspectos de partida. Se crean al crear el hogar (trigger) y, para los
-- hogares que ya existan al aplicar esta migración, aquí abajo.
create or replace function public.seed_default_aspects(p_household uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.rating_aspects where household_id = p_household) then
    return;
  end if;
  insert into public.rating_aspects (household_id, name, sort_order)
  select p_household, n, i from unnest(array[
    'Ubicación y barrio', 'Transporte', 'Luz', 'Distribución', 'Estado',
    'Tamaño', 'Ruido y entorno', 'Edificio', 'Precio para lo que es', 'Flechazo'
  ]) with ordinality as t(n, i);
end
$$;

create or replace function public.households_seed_aspects()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.seed_default_aspects(new.id);
  return new;
end
$$;
drop trigger if exists households_seed_aspects on public.households;
create trigger households_seed_aspects
  after insert on public.households
  for each row execute function public.households_seed_aspects();

do $$
declare h record;
begin
  for h in select id from public.households loop
    perform public.seed_default_aspects(h.id);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- Valoraciones
-- ------------------------------------------------------------
create table if not exists public.ratings (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  aspect_id   uuid not null references public.rating_aspects(id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  comment     text,
  updated_at  timestamptz not null default now(),
  primary key (property_id, user_id, aspect_id)
);
create index if not exists ratings_property_idx on public.ratings (property_id);

create table if not exists public.property_reactions (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  veto        boolean not null default false,
  veto_reason text,
  comment     text,
  updated_at  timestamptz not null default now(),
  primary key (property_id, user_id)
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now()
);
create index if not exists comments_property_idx on public.comments (property_id, created_at);

-- ¿La casa es de mi hogar? (security definer: evita consultas recursivas en las políticas)
create or replace function public.property_in_my_household(p_property uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.properties p
                 where p.id = p_property and p.household_id = public.current_household_id())
$$;

-- ¿Puedo ver las valoraciones de mi pareja sobre esta casa?
--   sí, si el hogar no va a ciegas; o si yo ya he puntuado al menos un aspecto.
create or replace function public.can_see_partner_ratings(p_property uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.households h
                 where h.id = public.current_household_id() and h.blind_rating = false)
      or exists (select 1 from public.ratings r
                 where r.property_id = p_property and r.user_id = auth.uid())
$$;

grant execute on function public.property_in_my_household(uuid) to authenticated;
grant execute on function public.can_see_partner_ratings(uuid) to authenticated;
revoke execute on function public.seed_default_aspects(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Avisos (Web Push)
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  aparato      text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ------------------------------------------------------------
-- SEGURIDAD
-- ------------------------------------------------------------
alter table public.rating_aspects     enable row level security;
alter table public.ratings            enable row level security;
alter table public.property_reactions enable row level security;
alter table public.comments           enable row level security;
alter table public.push_subscriptions enable row level security;

-- rating_aspects: del hogar, los dos los editan.
drop policy if exists aspects_select on public.rating_aspects;
create policy aspects_select on public.rating_aspects
  for select to authenticated using (household_id = public.current_household_id());
drop policy if exists aspects_insert on public.rating_aspects;
create policy aspects_insert on public.rating_aspects
  for insert to authenticated with check (household_id = public.current_household_id());
drop policy if exists aspects_update on public.rating_aspects;
create policy aspects_update on public.rating_aspects
  for update to authenticated using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
drop policy if exists aspects_delete on public.rating_aspects;
create policy aspects_delete on public.rating_aspects
  for delete to authenticated using (household_id = public.current_household_id());

-- ratings: las mías siempre; las del otro, según el modo a ciegas. Solo escribo las mías.
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings
  for select to authenticated
  using (
    public.property_in_my_household(property_id)
    and (user_id = auth.uid() or public.can_see_partner_ratings(property_id))
  );
drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert to authenticated
  with check (user_id = auth.uid() and public.property_in_my_household(property_id));
drop policy if exists ratings_update on public.ratings;
create policy ratings_update on public.ratings
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.property_in_my_household(property_id));
drop policy if exists ratings_delete on public.ratings;
create policy ratings_delete on public.ratings
  for delete to authenticated using (user_id = auth.uid());

-- property_reactions: las ven los dos; cada uno escribe la suya.
drop policy if exists reactions_select on public.property_reactions;
create policy reactions_select on public.property_reactions
  for select to authenticated using (public.property_in_my_household(property_id));
drop policy if exists reactions_insert on public.property_reactions;
create policy reactions_insert on public.property_reactions
  for insert to authenticated with check (user_id = auth.uid() and public.property_in_my_household(property_id));
drop policy if exists reactions_update on public.property_reactions;
create policy reactions_update on public.property_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reactions_delete on public.property_reactions;
create policy reactions_delete on public.property_reactions
  for delete to authenticated using (user_id = auth.uid());

-- comments: los ven los dos; cada uno escribe y borra los suyos.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (public.property_in_my_household(property_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated with check (user_id = auth.uid() and public.property_in_my_household(property_id));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated using (user_id = auth.uid());

-- push_subscriptions: cada uno los suyos.
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid() and household_id = public.current_household_id());
drop policy if exists push_update on public.push_subscriptions;
create policy push_update on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and household_id = public.current_household_id());
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

insert into public.schema_migrations (filename) values ('0003_valoraciones.sql')
on conflict (filename) do nothing;
