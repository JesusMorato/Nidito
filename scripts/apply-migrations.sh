#!/usr/bin/env bash
# Aplica, en orden, los archivos supabase/migrations/*.sql que aún no estén
# registrados en public.schema_migrations. Cada archivo se ejecuta dentro de
# una transacción: o entra entero o no entra.
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta la variable SUPABASE_DB_URL}"

cd "$(dirname "$0")/.."

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "create table if not exists public.schema_migrations (filename text primary key, applied_at timestamptz not null default now());"

applied=0
for f in $(ls supabase/migrations/*.sql | sort); do
  name=$(basename "$f")
  exists=$(psql "$SUPABASE_DB_URL" -tA -c "select 1 from public.schema_migrations where filename = '$name'")
  if [ "$exists" = "1" ]; then
    echo "· $name ya aplicada, se omite"
    continue
  fi
  echo "→ aplicando $name"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction \
    -f "$f" \
    -c "insert into public.schema_migrations (filename) values ('$name') on conflict (filename) do nothing;"
  applied=$((applied + 1))
done

echo "Listo: $applied migración(es) nueva(s) aplicada(s)."
