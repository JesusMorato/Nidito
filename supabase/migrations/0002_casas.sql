-- ============================================================
-- Nidito · 0002 · Casas (fase 1)
--   properties:    la ficha de cada casa. Es del hogar: la ven y editan los dos.
--   price_history: cada precio con el que ha llegado la casa (lo escribe save_property).
--   photos:        fotos subidas a Supabase Storage (carpeta = id del hogar).
--   save_property: ÚNICA puerta para crear o editar una casa (RPC). Apunta el
--                  historial de precio. En la fase 3 aprende a aplicar criterios y
--                  a buscar duplicados.
-- ============================================================

create table if not exists public.properties (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  created_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- lo que dice el anuncio
  title          text not null,
  address        text,
  neighborhood   text,
  lat            double precision,
  lng            double precision,
  price          integer check (price is null or price >= 0),
  m2             integer check (m2 is null or m2 > 0),
  m2_useful      integer check (m2_useful is null or m2_useful > 0),
  rooms          integer check (rooms is null or rooms >= 0),
  baths          integer check (baths is null or baths >= 0),
  floor          text,
  type           text not null default 'piso'
                 check (type in ('piso', 'atico', 'bajo', 'duplex', 'estudio', 'chalet', 'otro')),
  exterior       boolean,
  -- { ascensor, terraza, garaje, trastero, piscina, calefaccion, aire, orientacion, certificado }
  extras         jsonb not null default '{}'::jsonb,
  community_fee  numeric(8,2),
  ibi            numeric(8,2),
  notes          text,

  -- de dónde viene
  source         text not null default 'manual'
                 check (source in ('manual', 'pegado', 'enlace', 'correo', 'idealista')),
  url            text,
  agency         text,
  contact        text,
  external_ref   text,
  raw_text       text,
  cadastral_ref  text,

  -- lo vuestro
  status         text not null default 'nueva'
                 check (status in ('nueva', 'interesa', 'visita_pedida', 'visitada', 'oferta', 'comprada', 'descartada', 'retirada')),
  merged_into    uuid references public.properties(id) on delete set null
);
create index if not exists properties_household_idx on public.properties (household_id, status);

create table if not exists public.price_history (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  price       integer not null,
  seen_at     timestamptz not null default now(),
  source      text not null default 'manual'
);
create index if not exists price_history_property_idx on public.price_history (property_id, seen_at desc);

create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  path         text not null,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index if not exists photos_property_idx on public.photos (property_id, created_at);

-- ------------------------------------------------------------
-- save_property: crea o actualiza una casa a partir de un JSON con las columnas.
-- Devuelve el id. Si cambia el precio (o es nueva con precio), apunta el historial.
-- ------------------------------------------------------------
create or replace function public.save_property(p jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  hid uuid := public.current_household_id();
  pid uuid := nullif(p->>'id', '')::uuid;
  old_price integer;
  new_price integer := nullif(p->>'price', '')::integer;
  v_source text := coalesce(nullif(p->>'source', ''), 'manual');
begin
  if auth.uid() is null or hid is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  if length(trim(coalesce(p->>'title', ''))) = 0 then
    raise exception 'La casa necesita un título';
  end if;

  if pid is null then
    insert into public.properties (
      household_id, created_by, title, address, neighborhood, lat, lng,
      price, m2, m2_useful, rooms, baths, floor, type, exterior, extras,
      community_fee, ibi, notes, source, url, agency, contact, external_ref, raw_text,
      cadastral_ref, status
    ) values (
      hid, auth.uid(), trim(p->>'title'), nullif(p->>'address', ''), nullif(p->>'neighborhood', ''),
      nullif(p->>'lat', '')::double precision, nullif(p->>'lng', '')::double precision,
      new_price, nullif(p->>'m2', '')::integer, nullif(p->>'m2_useful', '')::integer,
      nullif(p->>'rooms', '')::integer, nullif(p->>'baths', '')::integer,
      nullif(p->>'floor', ''), coalesce(nullif(p->>'type', ''), 'piso'),
      case when p ? 'exterior' and jsonb_typeof(p->'exterior') = 'boolean' then (p->>'exterior')::boolean else null end,
      coalesce(p->'extras', '{}'::jsonb),
      nullif(p->>'community_fee', '')::numeric, nullif(p->>'ibi', '')::numeric, nullif(p->>'notes', ''),
      v_source, nullif(p->>'url', ''), nullif(p->>'agency', ''), nullif(p->>'contact', ''),
      nullif(p->>'external_ref', ''), nullif(p->>'raw_text', ''), nullif(p->>'cadastral_ref', ''),
      coalesce(nullif(p->>'status', ''), 'nueva')
    ) returning id into pid;
    if new_price is not null then
      insert into public.price_history (property_id, price, source) values (pid, new_price, v_source);
    end if;
  else
    select price into old_price from public.properties where id = pid and household_id = hid;
    if not found then
      raise exception 'Esa casa no es de tu hogar';
    end if;
    update public.properties set
      title = trim(p->>'title'),
      address = nullif(p->>'address', ''),
      neighborhood = nullif(p->>'neighborhood', ''),
      lat = nullif(p->>'lat', '')::double precision,
      lng = nullif(p->>'lng', '')::double precision,
      price = new_price,
      m2 = nullif(p->>'m2', '')::integer,
      m2_useful = nullif(p->>'m2_useful', '')::integer,
      rooms = nullif(p->>'rooms', '')::integer,
      baths = nullif(p->>'baths', '')::integer,
      floor = nullif(p->>'floor', ''),
      type = coalesce(nullif(p->>'type', ''), 'piso'),
      exterior = case when p ? 'exterior' and jsonb_typeof(p->'exterior') = 'boolean' then (p->>'exterior')::boolean else null end,
      extras = coalesce(p->'extras', '{}'::jsonb),
      community_fee = nullif(p->>'community_fee', '')::numeric,
      ibi = nullif(p->>'ibi', '')::numeric,
      notes = nullif(p->>'notes', ''),
      url = nullif(p->>'url', ''),
      agency = nullif(p->>'agency', ''),
      contact = nullif(p->>'contact', ''),
      external_ref = nullif(p->>'external_ref', ''),
      raw_text = coalesce(nullif(p->>'raw_text', ''), raw_text),
      cadastral_ref = nullif(p->>'cadastral_ref', ''),
      status = coalesce(nullif(p->>'status', ''), status),
      updated_at = now()
    where id = pid and household_id = hid;
    if new_price is not null and (old_price is null or old_price <> new_price) then
      insert into public.price_history (property_id, price, source) values (pid, new_price, v_source);
    end if;
  end if;
  return pid;
end
$$;

-- Cambiar solo el estado (atajo más barato que mandar la ficha entera).
create or replace function public.set_property_status(p_id uuid, p_status text)
returns void
language sql security definer
set search_path = public
as $$
  update public.properties set status = p_status, updated_at = now()
  where id = p_id and household_id = public.current_household_id();
$$;

revoke execute on function public.save_property(jsonb) from public, anon;
revoke execute on function public.set_property_status(uuid, text) from public, anon;
grant  execute on function public.save_property(jsonb) to authenticated;
grant  execute on function public.set_property_status(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- SEGURIDAD
-- ------------------------------------------------------------
alter table public.properties    enable row level security;
alter table public.price_history enable row level security;
alter table public.photos        enable row level security;

-- properties: del hogar. Crear y editar SOLO por save_property (no hay política de
-- insert/update, así que un insert directo desde la app falla).
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists properties_delete on public.properties;
create policy properties_delete on public.properties
  for delete to authenticated
  using (household_id = public.current_household_id());

-- price_history: se lee si la casa es del hogar; solo la escribe save_property.
drop policy if exists price_history_select on public.price_history;
create policy price_history_select on public.price_history
  for select to authenticated
  using (exists (select 1 from public.properties pr
                 where pr.id = price_history.property_id and pr.household_id = public.current_household_id()));

-- photos: del hogar; cada uno sube las suyas y borra las suyas.
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos
  for select to authenticated
  using (household_id = public.current_household_id());

drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos
  for insert to authenticated
  with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and exists (select 1 from public.properties pr where pr.id = photos.property_id and pr.household_id = photos.household_id)
  );

drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos
  for delete to authenticated
  using (household_id = public.current_household_id());

-- Supabase Storage: cubo privado "fotos"; cada hogar solo toca su carpeta (<household_id>/…).
-- Va dentro de un bloque condicional para que la prueba local (PGlite, sin Storage) no falle.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
      on conflict (id) do nothing;
    execute 'drop policy if exists fotos_select on storage.objects';
    execute $p$create policy fotos_select on storage.objects for select to authenticated
      using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.current_household_id()::text)$p$;
    execute 'drop policy if exists fotos_insert on storage.objects';
    execute $p$create policy fotos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.current_household_id()::text)$p$;
    execute 'drop policy if exists fotos_delete on storage.objects';
    execute $p$create policy fotos_delete on storage.objects for delete to authenticated
      using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.current_household_id()::text)$p$;
  end if;
end
$$;

insert into public.schema_migrations (filename) values ('0002_casas.sql')
on conflict (filename) do nothing;
