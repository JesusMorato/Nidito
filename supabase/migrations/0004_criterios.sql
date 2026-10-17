-- ============================================================
-- Nidito · 0004 · Criterios, zonas, duplicados y enlaces (fase 3)
--   criteria:        los imprescindibles y preferencias del hogar (una fila por hogar).
--   zones:           polígonos dibujados en el mapa ([lat, lng], …).
--   apply_criteria:  calcula el encaje de una casa (fit_score 0–100 y fit_notes) y en qué
--                    zona está. Lo llama save_property y reapply_criteria().
--   find_duplicates: casas que pueden ser la misma (referencia, enlace, dirección+planta,
--                    o a menos de 30 m con m² y precio parecidos).
--   merge_properties: fusiona dos casas (fotos, precios, valoraciones y comentarios).
--   ingest_tokens + register_link: el atajo del iPhone comparte un enlace con un código
--                    secreto, como los pagos de GasTitos.
--   properties.inbox: para la fase 4 (correo): bandeja / aceptada / descartada.
-- ============================================================

alter table public.properties add column if not exists fit_score integer;
alter table public.properties add column if not exists fit_notes jsonb;
alter table public.properties add column if not exists in_zone text;
alter table public.properties add column if not exists inbox text not null default 'aceptada';
alter table public.properties add column if not exists discard_reason text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_inbox_check') then
    alter table public.properties add constraint properties_inbox_check check (inbox in ('bandeja', 'aceptada', 'descartada'));
  end if;
end
$$;

create table if not exists public.criteria (
  household_id uuid primary key references public.households(id) on delete cascade,
  max_price    integer,
  min_m2       integer,
  min_rooms    integer,
  min_baths    integer,
  -- tipos admitidos; vacío = cualquiera
  types        text[] not null default '{}',
  -- imprescindibles: { "ascensor": true, "exterior": true, "terraza": true }
  must         jsonb not null default '{}'::jsonb,
  -- preferencias con puntos 1–3: { "terraza": 2, "garaje": 1 }
  prefs        jsonb not null default '{}'::jsonb,
  -- si hay zonas dibujadas, exigir que la casa esté dentro de alguna
  require_zone boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists public.zones (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  color        text not null default '#2f6b73',
  -- [[lat, lng], [lat, lng], …] sin repetir el primero al final
  polygon      jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists zones_household_idx on public.zones (household_id);

create table if not exists public.ingest_tokens (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  token        text not null unique check (length(token) >= 16),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Geometría sin PostGIS (suficiente para una pareja; se prueba en local con PGlite)
-- ------------------------------------------------------------
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function public.point_in_polygon(p_lat double precision, p_lng double precision, p_poly jsonb)
returns boolean
language plpgsql immutable
as $$
declare
  n integer := jsonb_array_length(coalesce(p_poly, '[]'::jsonb));
  i integer;
  j integer;
  yi double precision; xi double precision; yj double precision; xj double precision;
  inside boolean := false;
begin
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0..n - 1 loop
    yi := (p_poly->i->>0)::double precision; xi := (p_poly->i->>1)::double precision;
    yj := (p_poly->j->>0)::double precision; xj := (p_poly->j->>1)::double precision;
    if ((yi > p_lat) <> (yj > p_lat)) and (p_lng < (xj - xi) * (p_lat - yi) / (yj - yi) + xi) then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end
$$;

-- ------------------------------------------------------------
-- Encaje con los criterios del hogar
--   Puntuación: 50 de partida; cada imprescindible cumplido +10, incumplido −30,
--   sin dato −5; cada preferencia presente +5 por punto (1–3). Se recorta a 0–100.
-- ------------------------------------------------------------
create or replace function public.apply_criteria(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pr public.properties%rowtype;
  c public.criteria%rowtype;
  fails text[] := '{}';
  oks text[] := '{}';
  missing text[] := '{}';
  score integer := 50;
  z record;
  zone_name text := null;
  has_zones boolean;
  has_criteria boolean;
  k text;
  v jsonb;
  present boolean;
begin
  select * into pr from public.properties where id = p_id;
  if not found then return null; end if;

  select count(*) > 0 into has_zones from public.zones where household_id = pr.household_id;
  if pr.lat is not null and pr.lng is not null then
    for z in select name, polygon from public.zones where household_id = pr.household_id order by created_at loop
      if public.point_in_polygon(pr.lat, pr.lng, z.polygon) then
        zone_name := z.name;
        exit;
      end if;
    end loop;
  end if;

  select * into c from public.criteria where household_id = pr.household_id;
  has_criteria := found;
  if not has_criteria then
    update public.properties set in_zone = zone_name, fit_score = null, fit_notes = null where id = p_id;
    return null;
  end if;

  -- precio
  if c.max_price is not null then
    if pr.price is null then missing := array_append(missing, 'precio');
    elsif pr.price > c.max_price then fails := array_append(fails, format('precio %s € (máximo %s €)', to_char(pr.price, 'FM999G999G999'), to_char(c.max_price, 'FM999G999G999'))); score := score - 30;
    else oks := array_append(oks, 'precio'); score := score + 10; end if;
  end if;
  -- metros
  if c.min_m2 is not null then
    if pr.m2 is null then missing := array_append(missing, 'm²');
    elsif pr.m2 < c.min_m2 then fails := array_append(fails, format('%s m² (mínimo %s)', pr.m2, c.min_m2)); score := score - 30;
    else oks := array_append(oks, 'm²'); score := score + 10; end if;
  end if;
  -- habitaciones
  if c.min_rooms is not null then
    if pr.rooms is null then missing := array_append(missing, 'habitaciones');
    elsif pr.rooms < c.min_rooms then fails := array_append(fails, format('%s habitaciones (mínimo %s)', pr.rooms, c.min_rooms)); score := score - 30;
    else oks := array_append(oks, 'habitaciones'); score := score + 10; end if;
  end if;
  -- baños
  if c.min_baths is not null then
    if pr.baths is null then missing := array_append(missing, 'baños');
    elsif pr.baths < c.min_baths then fails := array_append(fails, format('%s baños (mínimo %s)', pr.baths, c.min_baths)); score := score - 30;
    else oks := array_append(oks, 'baños'); score := score + 10; end if;
  end if;
  -- tipo
  if array_length(c.types, 1) > 0 then
    if pr.type = any (c.types) then oks := array_append(oks, 'tipo'); score := score + 10;
    else fails := array_append(fails, format('tipo %s', pr.type)); score := score - 30; end if;
  end if;
  -- imprescindibles (extras y exterior)
  for k, v in select * from jsonb_each(c.must) loop
    if v <> 'true'::jsonb then continue; end if;
    if k = 'exterior' then
      if pr.exterior is null then missing := array_append(missing, 'exterior'); score := score - 5;
      elsif pr.exterior then oks := array_append(oks, 'exterior'); score := score + 10;
      else fails := array_append(fails, 'interior'); score := score - 30; end if;
    else
      if pr.extras ? k then
        present := (pr.extras->>k)::boolean;
        if present then oks := array_append(oks, k); score := score + 10;
        else fails := array_append(fails, 'sin ' || k); score := score - 30; end if;
      else
        missing := array_append(missing, k); score := score - 5;
      end if;
    end if;
  end loop;
  -- zona
  if c.require_zone and has_zones then
    if pr.lat is null then missing := array_append(missing, 'ubicación'); score := score - 5;
    elsif zone_name is null then fails := array_append(fails, 'fuera de vuestras zonas'); score := score - 30;
    else oks := array_append(oks, 'zona ' || zone_name); score := score + 10; end if;
  end if;
  -- preferencias
  for k, v in select * from jsonb_each(c.prefs) loop
    if (pr.extras->>k) = 'true' or (k = 'exterior' and pr.exterior) then
      score := score + 5 * least(3, greatest(1, coalesce(nullif(v::text, 'null'), '1')::integer));
      oks := array_append(oks, k);
    end if;
  end loop;

  score := greatest(0, least(100, score));
  update public.properties
     set fit_score = score,
         fit_notes = jsonb_build_object('fail', to_jsonb(fails), 'ok', to_jsonb(oks), 'missing', to_jsonb(missing)),
         in_zone = zone_name
   where id = p_id;
  return jsonb_build_object('score', score, 'fail', to_jsonb(fails), 'ok', to_jsonb(oks), 'missing', to_jsonb(missing));
end
$$;

-- Vuelve a calcular el encaje de todas las casas del hogar (al cambiar criterios o zonas).
create or replace function public.reapply_criteria()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  if public.current_household_id() is null then raise exception 'No perteneces a ningún hogar'; end if;
  for r in select id from public.properties where household_id = public.current_household_id() loop
    perform public.apply_criteria(r.id);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ------------------------------------------------------------
-- save_property, ahora en dos piezas: la interna (sin sesión, la usa register_link)
-- y la pública (con sesión). La interna aplica criterios y decide la bandeja.
-- ------------------------------------------------------------
create or replace function public._save_property(hid uuid, uid uuid, p jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid := nullif(p->>'id', '')::uuid;
  old_price integer;
  new_price integer := nullif(p->>'price', '')::integer;
  v_source text := coalesce(nullif(p->>'source', ''), 'manual');
  v_notes jsonb;
  v_inbox text;
begin
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
      hid, uid, trim(p->>'title'), nullif(p->>'address', ''), nullif(p->>'neighborhood', ''),
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
    v_notes := public.apply_criteria(pid);
    -- Lo automático (correo, Idealista) pasa por la Bandeja o se descarta; lo vuestro entra directo.
    if v_source in ('correo', 'idealista') then
      if v_notes is not null and jsonb_array_length(v_notes->'fail') > 0 then
        v_inbox := 'descartada';
        update public.properties set inbox = v_inbox, discard_reason = array_to_string(array(select jsonb_array_elements_text(v_notes->'fail')), '; ') where id = pid;
      else
        update public.properties set inbox = 'bandeja' where id = pid;
      end if;
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
    perform public.apply_criteria(pid);
  end if;
  return pid;
end
$$;

create or replace function public.save_property(p jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  hid uuid := public.current_household_id();
begin
  if auth.uid() is null or hid is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  return public._save_property(hid, auth.uid(), p);
end
$$;

-- Casas del hogar que pueden ser la misma que p_id.
create or replace function public.find_duplicates(p_id uuid)
returns setof public.properties
language sql stable security definer
set search_path = public
as $$
  select o.*
  from public.properties pr
  join public.properties o
    on o.household_id = pr.household_id and o.id <> pr.id and o.merged_into is null
  where pr.id = p_id and pr.household_id = public.current_household_id()
    and (
      (pr.external_ref is not null and o.external_ref = pr.external_ref)
      or (pr.url is not null and o.url = pr.url)
      or (pr.address is not null and o.address is not null
          and lower(regexp_replace(o.address, '\s+', ' ', 'g')) = lower(regexp_replace(pr.address, '\s+', ' ', 'g'))
          and lower(coalesce(o.floor, '')) = lower(coalesce(pr.floor, '')))
      or (pr.lat is not null and o.lat is not null
          and public.distance_m(pr.lat, pr.lng, o.lat, o.lng) < 30
          and (pr.m2 is null or o.m2 is null or abs(pr.m2 - o.m2) <= 5)
          and (pr.price is null or o.price is null or abs(pr.price - o.price) <= 0.05 * greatest(pr.price, o.price)))
    )
  order by o.created_at
$$;

-- Fusiona p_drop dentro de p_keep: se mueven fotos, precios, valoraciones y comentarios;
-- los datos que a p_keep le falten se cogen de p_drop; p_drop queda marcada como fusionada.
create or replace function public.merge_properties(p_keep uuid, p_drop uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  hid uuid := public.current_household_id();
  d public.properties%rowtype;
begin
  if p_keep = p_drop then raise exception 'Son la misma casa'; end if;
  if not exists (select 1 from public.properties where id = p_keep and household_id = hid)
     or not exists (select 1 from public.properties where id = p_drop and household_id = hid) then
    raise exception 'Esas casas no son de tu hogar';
  end if;
  select * into d from public.properties where id = p_drop;

  update public.photos set property_id = p_keep where property_id = p_drop;
  update public.price_history set property_id = p_keep where property_id = p_drop;
  insert into public.ratings (property_id, user_id, aspect_id, stars, comment, updated_at)
    select p_keep, user_id, aspect_id, stars, comment, updated_at from public.ratings where property_id = p_drop
    on conflict (property_id, user_id, aspect_id) do nothing;
  delete from public.ratings where property_id = p_drop;
  insert into public.property_reactions (property_id, user_id, veto, veto_reason, comment, updated_at)
    select p_keep, user_id, veto, veto_reason, comment, updated_at from public.property_reactions where property_id = p_drop
    on conflict (property_id, user_id) do nothing;
  delete from public.property_reactions where property_id = p_drop;
  update public.comments set property_id = p_keep where property_id = p_drop;

  update public.properties k set
    address = coalesce(k.address, d.address),
    neighborhood = coalesce(k.neighborhood, d.neighborhood),
    lat = coalesce(k.lat, d.lat),
    lng = coalesce(k.lng, d.lng),
    price = coalesce(k.price, d.price),
    m2 = coalesce(k.m2, d.m2),
    m2_useful = coalesce(k.m2_useful, d.m2_useful),
    rooms = coalesce(k.rooms, d.rooms),
    baths = coalesce(k.baths, d.baths),
    floor = coalesce(k.floor, d.floor),
    exterior = coalesce(k.exterior, d.exterior),
    extras = coalesce(d.extras, '{}'::jsonb) || coalesce(k.extras, '{}'::jsonb),
    community_fee = coalesce(k.community_fee, d.community_fee),
    ibi = coalesce(k.ibi, d.ibi),
    notes = case when k.notes is null then d.notes when d.notes is null then k.notes else k.notes || E'\n' || d.notes end,
    url = coalesce(k.url, d.url),
    agency = coalesce(k.agency, d.agency),
    contact = coalesce(k.contact, d.contact),
    external_ref = coalesce(k.external_ref, d.external_ref),
    raw_text = coalesce(k.raw_text, d.raw_text),
    cadastral_ref = coalesce(k.cadastral_ref, d.cadastral_ref),
    updated_at = now()
  where k.id = p_keep;

  update public.properties set merged_into = p_keep, updated_at = now() where id = p_drop;
  perform public.apply_criteria(p_keep);
end
$$;

-- ------------------------------------------------------------
-- Enlace compartido desde el móvil (atajo de iPhone con código secreto)
-- ------------------------------------------------------------
create or replace function public.register_link(p_token text, p_url text, p_title text, p_text text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  t public.ingest_tokens%rowtype;
  existing uuid;
  old_price integer;
  v_price integer;
  v_ref text;
  m text[];
  v_url text := trim(coalesce(p_url, ''));
  haystack text := coalesce(p_text, '') || ' ' || coalesce(p_title, '');
begin
  select * into t from public.ingest_tokens where token = p_token;
  if not found then raise exception 'Código no válido'; end if;
  if v_url = '' then raise exception 'Falta el enlace'; end if;

  m := regexp_match(v_url, 'idealista\.com/(?:[a-z]{2}/)?inmueble/(\d+)');
  if m is not null then v_ref := 'idealista:' || m[1]; end if;
  m := regexp_match(haystack, '(\d{1,3}(?:\.\d{3})+|\d{5,7})\s*€');
  if m is not null then v_price := replace(m[1], '.', '')::integer; end if;

  -- Si ya la teníais (mismo enlace o referencia), solo se apunta el precio si ha cambiado.
  select id, price into existing, old_price from public.properties
   where household_id = t.household_id and merged_into is null
     and (url = v_url or (v_ref is not null and external_ref = v_ref))
   order by created_at limit 1;
  if existing is not null then
    if v_price is not null and (old_price is null or old_price <> v_price) then
      update public.properties set price = v_price, updated_at = now() where id = existing;
      insert into public.price_history (property_id, price, source) values (existing, v_price, 'enlace');
      perform public.apply_criteria(existing);
    end if;
    return existing;
  end if;

  return public._save_property(t.household_id, t.user_id, jsonb_build_object(
    'title', coalesce(nullif(trim(p_title), ''), 'Enlace compartido'),
    'url', v_url,
    'external_ref', v_ref,
    'price', v_price,
    'raw_text', nullif(trim(coalesce(p_text, '')), ''),
    'source', 'enlace'
  ));
end
$$;

-- ------------------------------------------------------------
-- Permisos y seguridad
-- ------------------------------------------------------------
revoke execute on function public._save_property(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_criteria(uuid) from public, anon, authenticated;
revoke execute on function public.reapply_criteria() from public, anon;
revoke execute on function public.find_duplicates(uuid) from public, anon;
revoke execute on function public.merge_properties(uuid, uuid) from public, anon;
grant execute on function public.reapply_criteria() to authenticated;
grant execute on function public.find_duplicates(uuid) to authenticated;
grant execute on function public.merge_properties(uuid, uuid) to authenticated;
-- register_link se llama con la clave pública (anon): el código secreto identifica al usuario.
grant execute on function public.register_link(text, text, text, text) to anon, authenticated;
grant execute on function public.distance_m(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.point_in_polygon(double precision, double precision, jsonb) to anon, authenticated;

alter table public.criteria      enable row level security;
alter table public.zones         enable row level security;
alter table public.ingest_tokens enable row level security;

drop policy if exists criteria_select on public.criteria;
create policy criteria_select on public.criteria for select to authenticated using (household_id = public.current_household_id());
drop policy if exists criteria_insert on public.criteria;
create policy criteria_insert on public.criteria for insert to authenticated with check (household_id = public.current_household_id());
drop policy if exists criteria_update on public.criteria;
create policy criteria_update on public.criteria for update to authenticated using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
drop policy if exists criteria_delete on public.criteria;
create policy criteria_delete on public.criteria for delete to authenticated using (household_id = public.current_household_id());

drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones for select to authenticated using (household_id = public.current_household_id());
drop policy if exists zones_insert on public.zones;
create policy zones_insert on public.zones for insert to authenticated with check (household_id = public.current_household_id());
drop policy if exists zones_update on public.zones;
create policy zones_update on public.zones for update to authenticated using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
drop policy if exists zones_delete on public.zones;
create policy zones_delete on public.zones for delete to authenticated using (household_id = public.current_household_id());

drop policy if exists tokens_select on public.ingest_tokens;
create policy tokens_select on public.ingest_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists tokens_insert on public.ingest_tokens;
create policy tokens_insert on public.ingest_tokens for insert to authenticated with check (user_id = auth.uid() and household_id = public.current_household_id());
drop policy if exists tokens_update on public.ingest_tokens;
create policy tokens_update on public.ingest_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and household_id = public.current_household_id());
drop policy if exists tokens_delete on public.ingest_tokens;
create policy tokens_delete on public.ingest_tokens for delete to authenticated using (user_id = auth.uid());

insert into public.schema_migrations (filename) values ('0004_criterios.sql')
on conflict (filename) do nothing;
