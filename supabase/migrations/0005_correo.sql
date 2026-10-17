-- ============================================================
-- Nidito · 0005 · Correo automático y Bandeja (fase 4)
--   inbound_messages: cada correo que llega (de Apps Script a la función ingest-email),
--                     con su estado y las casas que creó. Se guarda el texto para poder
--                     volver a leerlo si el lector mejora.
--   ingest_email:     la función de Supabase (con la clave de servicio) llama a esta
--                     función SQL con el correo ya leído y las fichas que sacó; aquí se
--                     comprueba el código secreto, se evita repetir un correo y se
--                     crean las casas con _save_property (source = 'correo', así pasan
--                     por los criterios y caen en la Bandeja o en Descartadas).
--   set_inbox:        aceptar, descartar o rescatar una casa de la Bandeja.
-- ============================================================

create table if not exists public.inbound_messages (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  message_id   text not null,
  from_addr    text not null default '',
  subject      text not null default '',
  received_at  timestamptz not null default now(),
  body         text,
  status       text not null default 'done' check (status in ('done', 'ignored', 'error')),
  detail       text,
  property_ids uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (household_id, message_id)
);
create index if not exists inbound_messages_household_idx on public.inbound_messages (household_id, received_at desc);

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
  pid uuid;
  item jsonb;
  v_status text := coalesce(nullif(p_message->>'status', ''), 'done');
  row_id uuid;
begin
  select * into t from public.ingest_tokens where token = p_token;
  if not found then raise exception 'Código no válido'; end if;
  if mid is null then raise exception 'Falta message_id'; end if;

  select * into existing from public.inbound_messages where household_id = t.household_id and message_id = mid;
  if found then
    return jsonb_build_object('estado', 'repetido', 'id', existing.id, 'casas', to_jsonb(existing.property_ids));
  end if;

  if v_status = 'done' then
    for item in select * from jsonb_array_elements(coalesce(p_properties, '[]'::jsonb)) loop
      pid := public._save_property(t.household_id, t.user_id, item || jsonb_build_object('source', 'correo'));
      ids := array_append(ids, pid);
    end loop;
    if coalesce(array_length(ids, 1), 0) = 0 then v_status := 'ignored'; end if;
  end if;

  insert into public.inbound_messages (household_id, user_id, message_id, from_addr, subject, received_at, body, status, detail, property_ids)
  values (
    t.household_id, t.user_id, mid,
    coalesce(p_message->>'from', ''), coalesce(p_message->>'subject', ''),
    coalesce(nullif(p_message->>'received_at', '')::timestamptz, now()),
    left(coalesce(p_message->>'body', ''), 20000),
    v_status, nullif(p_message->>'detail', ''), ids
  ) returning id into row_id;

  return jsonb_build_object('estado', v_status, 'id', row_id, 'casas', to_jsonb(ids));
end
$$;

-- Aceptar, descartar o rescatar una casa de la Bandeja.
create or replace function public.set_inbox(p_id uuid, p_inbox text, p_reason text default null)
returns void
language sql security definer
set search_path = public
as $$
  update public.properties
     set inbox = p_inbox,
         discard_reason = case when p_inbox = 'descartada' then coalesce(p_reason, discard_reason) else null end,
         updated_at = now()
   where id = p_id and household_id = public.current_household_id()
     and p_inbox in ('bandeja', 'aceptada', 'descartada');
$$;

revoke execute on function public.ingest_email(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.set_inbox(uuid, text, text) from public, anon;
grant execute on function public.set_inbox(uuid, text, text) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_email(text, jsonb, jsonb) to service_role;
  end if;
end
$$;

alter table public.inbound_messages enable row level security;
drop policy if exists inbound_select on public.inbound_messages;
create policy inbound_select on public.inbound_messages
  for select to authenticated using (household_id = public.current_household_id());
drop policy if exists inbound_delete on public.inbound_messages;
create policy inbound_delete on public.inbound_messages
  for delete to authenticated using (household_id = public.current_household_id());

insert into public.schema_migrations (filename) values ('0005_correo.sql')
on conflict (filename) do nothing;
