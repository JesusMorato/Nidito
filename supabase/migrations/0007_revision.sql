-- ============================================================
-- Nidito · 0007 · Correcciones de la revisión de seguridad y lógica
--   1. apply_criteria: un extra con valor null (el lector pone null en lo que el anuncio
--      no dice) cuenta como "sin dato" (−5), no como "no lo tiene" (−30 y descarte).
--   2. clean_url: solo se guardan enlaces http(s); "idealista.com/…" se completa.
--   3. ingest_token_valid: la función de correo comprueba el código ANTES de leer nada
--      (así nadie puede gastar llamadas a Claude con un código inventado).
--   4. ingest_email: el correo es entrada no confiable → se ignoran id, status, inbox y
--      source de cada ficha; cada casa se guarda por separado (una mala no tira las
--      demás); el correo se apunta SIEMPRE, también cuando falla.
--   5. register_link: el precio es el mayor importe ≥ 20.000 € que no sea una cuota
--      (/mes, /año), como hace el lector de la app; antes cogía el primero que veía.
--   6. merge_properties: también mueve visitas y contactos; no deja fusionar casas que ya
--      están fusionadas.
--   7. join_household: bloquea la fila del hogar para que dos altas a la vez no dejen
--      tres miembros.
--   8. Políticas de UPDATE de reacciones, visitas y contactos: revalidan que la casa es
--      del hogar (antes se podía apuntar la fila a una casa ajena).
-- ============================================================

-- ------------------------------------------------------------
-- 1 · apply_criteria (misma puntuación; solo cambia cómo se leen los extras)
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
  -- imprescindibles (extras y exterior). Solo un booleano de verdad cuenta como dato.
  for k, v in select * from jsonb_each(c.must) loop
    if v <> 'true'::jsonb then continue; end if;
    if k = 'exterior' then
      if pr.exterior is null then missing := array_append(missing, 'exterior'); score := score - 5;
      elsif pr.exterior then oks := array_append(oks, 'exterior'); score := score + 10;
      else fails := array_append(fails, 'interior'); score := score - 30; end if;
    else
      if pr.extras ? k and jsonb_typeof(pr.extras->k) = 'boolean' then
        present := (pr.extras->k)::text = 'true';
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
    if (pr.extras ? k and jsonb_typeof(pr.extras->k) = 'boolean' and (pr.extras->k)::text = 'true')
       or (k = 'exterior' and coalesce(pr.exterior, false)) then
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

-- Recalcular el encaje de lo que ya haya guardado (los que estaban "descartados por
-- null" no se rescatan solos: el motivo se queda apuntado y se rescatan desde la app).
do $$
declare r record;
begin
  for r in select id from public.properties where fit_score is not null loop
    perform public.apply_criteria(r.id);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 2 · clean_url
-- ------------------------------------------------------------
create or replace function public.clean_url(p text)
returns text
language sql immutable
as $$
  select case
    when p is null or trim(p) = '' then null
    when trim(p) ~* '^https?://' then trim(p)
    when trim(p) ~* '^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(/.*)?$' then 'https://' || trim(p)
    else null
  end
$$;

-- _save_property: igual que en 0004 pero el enlace pasa por clean_url.
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
      v_source, public.clean_url(p->>'url'), nullif(p->>'agency', ''), nullif(p->>'contact', ''),
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
      url = public.clean_url(p->>'url'),
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
revoke execute on function public._save_property(uuid, uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · ingest_token_valid (solo la función de correo, con la clave de servicio)
-- ------------------------------------------------------------
create or replace function public.ingest_token_valid(p_token text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.ingest_tokens where token = p_token)
$$;
revoke execute on function public.ingest_token_valid(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_token_valid(text) to service_role;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 4 · ingest_email endurecida
-- ------------------------------------------------------------
create or replace function public.ingest_email(p_token text, p_message jsonb, p_properties jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.ingest_tokens%rowtype;
  mid text := nullif(trim(coalesce(p_message->>'message_id', '')), '');
  existing public.inbound_messages%rowtype;
  ids uuid[] := '{}';
  errs text[] := '{}';
  pid uuid;
  item jsonb;
  v_status text := coalesce(nullif(p_message->>'status', ''), 'done');
  v_detail text := nullif(p_message->>'detail', '');
  v_received timestamptz;
  row_id uuid;
  n_items integer := 0;
begin
  select * into t from public.ingest_tokens where token = p_token;
  if not found then raise exception 'Código no válido'; end if;
  if mid is null then raise exception 'Falta message_id'; end if;

  select * into existing from public.inbound_messages where household_id = t.household_id and message_id = mid;
  if found then
    return jsonb_build_object('estado', 'repetido', 'id', existing.id, 'casas', to_jsonb(existing.property_ids));
  end if;

  -- Fecha del correo: si viene rara, ahora mismo.
  begin
    v_received := coalesce(nullif(p_message->>'received_at', '')::timestamptz, now());
  exception when others then
    v_received := now();
  end;

  if v_status = 'done' and jsonb_typeof(coalesce(p_properties, '[]'::jsonb)) = 'array' then
    for item in select * from jsonb_array_elements(p_properties) loop
      if jsonb_typeof(item) <> 'object' then continue; end if;
      n_items := n_items + 1;
      begin
        -- Lo que diga el correo sobre id, estado, bandeja u origen no se usa: solo crea casas nuevas del correo.
        pid := public._save_property(
          t.household_id, t.user_id,
          (item - 'id' - 'status' - 'inbox' - 'source' - 'merged_into' - 'discard_reason') || jsonb_build_object('source', 'correo')
        );
        ids := array_append(ids, pid);
      exception when others then
        errs := array_append(errs, left(coalesce(item->>'title', '(sin título)') || ': ' || sqlerrm, 200));
      end;
    end loop;
    if coalesce(array_length(ids, 1), 0) = 0 then
      v_status := case when coalesce(array_length(errs, 1), 0) > 0 then 'error' else 'ignored' end;
    end if;
    if coalesce(array_length(errs, 1), 0) > 0 then
      v_detail := concat_ws(' · ', v_detail, format('%s de %s con error: %s', array_length(errs, 1), n_items, array_to_string(errs, ' | ')));
    end if;
  end if;

  insert into public.inbound_messages (household_id, user_id, message_id, from_addr, subject, received_at, body, status, detail, property_ids)
  values (
    t.household_id, t.user_id, mid,
    left(coalesce(p_message->>'from', ''), 300), left(coalesce(p_message->>'subject', ''), 500),
    v_received,
    left(coalesce(p_message->>'body', ''), 20000),
    v_status, left(v_detail, 2000), ids
  ) returning id into row_id;

  return jsonb_build_object('estado', v_status, 'id', row_id, 'casas', to_jsonb(ids), 'errores', to_jsonb(errs));
end
$$;
revoke execute on function public.ingest_email(text, jsonb, jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_email(text, jsonb, jsonb) to service_role;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 5 · register_link: precio = mayor importe ≥ 20.000 € que no sea cuota
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
  v_url text := public.clean_url(p_url);
  haystack text := coalesce(p_title, '') || ' ' || coalesce(p_text, '');
begin
  select * into t from public.ingest_tokens where token = p_token;
  if not found then raise exception 'Código no válido'; end if;
  if v_url is null then raise exception 'Falta el enlace'; end if;

  m := regexp_match(v_url, 'idealista\.com/(?:[a-z]{2}/)?inmueble/(\d+)');
  if m is not null then v_ref := 'idealista:' || m[1]; end if;

  select max(replace(a[1], '.', '')::bigint)::integer into v_price
    from regexp_matches(haystack, '(\d{1,3}(?:\.\d{3})+|\d{5,8})\s*€(\s*/\s*mes|\s*al\s+mes|\s*/\s*año|\s*al\s+año|\s*mensual)?', 'gi') as a
   where a[2] is null
     and replace(a[1], '.', '')::bigint between 20000 and 50000000;

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
    'title', left(coalesce(nullif(trim(p_title), ''), 'Enlace compartido'), 120),
    'url', v_url,
    'external_ref', v_ref,
    'price', v_price,
    'raw_text', left(nullif(trim(coalesce(p_text, '')), ''), 20000),
    'source', 'enlace'
  ));
end
$$;

-- ------------------------------------------------------------
-- 6 · merge_properties: visitas y contactos también; sin cadenas de fusión
-- ------------------------------------------------------------
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
  if exists (select 1 from public.properties where id in (p_keep, p_drop) and merged_into is not null) then
    raise exception 'Una de las dos ya está fusionada con otra';
  end if;
  select * into d from public.properties where id = p_drop;

  update public.photos set property_id = p_keep where property_id = p_drop;
  update public.price_history set property_id = p_keep where property_id = p_drop;
  update public.visits set property_id = p_keep where property_id = p_drop;
  update public.contact_log set property_id = p_keep where property_id = p_drop;
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
revoke execute on function public.merge_properties(uuid, uuid) from public, anon;

-- ------------------------------------------------------------
-- 7 · join_household con bloqueo del hogar
-- ------------------------------------------------------------
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
  if length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'Tu nombre no puede estar vacío';
  end if;
  -- Bloquea la fila del hogar: dos altas a la vez se ponen en cola y la segunda ve ya dos miembros.
  select id into hid from public.households where invite_code = upper(trim(p_code)) for update;
  if hid is null then
    raise exception 'Código de invitación no válido';
  end if;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, auth.uid(), trim(p_display_name));
  return hid;
end
$$;
revoke execute on function public.join_household(text, text) from public, anon;
grant  execute on function public.join_household(text, text) to authenticated;

-- ------------------------------------------------------------
-- 8 · Políticas de UPDATE que revalidan la casa
-- ------------------------------------------------------------
drop policy if exists reactions_update on public.property_reactions;
create policy reactions_update on public.property_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.property_in_my_household(property_id));

drop policy if exists visits_update on public.visits;
create policy visits_update on public.visits
  for update to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id() and public.property_in_my_household(property_id));

drop policy if exists contact_update on public.contact_log;
create policy contact_update on public.contact_log
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = public.current_household_id() and public.property_in_my_household(property_id));

insert into public.schema_migrations (filename) values ('0007_revision.sql')
on conflict (filename) do nothing;
