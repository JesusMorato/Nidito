# Configuración manual (solo la puede hacer el dueño)

Marca cada punto cuando lo termines. Son los mismos pasos que en GasTitos.

## 1. Crear el proyecto de Supabase y conectar la app

El plan gratuito de Supabase permite **dos proyectos activos por organización**. Si
GasTitos y la app de vuelos ya ocupan los dos, crea otra organización gratuita (menú de
arriba a la izquierda → New organization) y el proyecto dentro de ella.

- [ ] https://supabase.com → **New project**. Nombre: `Nidito`. Región: *West EU (Ireland)*
      (la misma que GasTitos). Apunta la **contraseña de la base de datos**: la necesitas
      en el punto 3. Usa solo letras y números (el workflow de migraciones lo exige).
- [ ] Cuando termine de crearse: **Project Settings → API**. Copia la *Project URL* y la
      clave *anon / publishable*.
- [ ] Pégalas en el archivo `.env` del repositorio:
      ```
      VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
      VITE_SUPABASE_ANON_KEY=sb_publishable_...
      ```
      Son datos públicos (van dentro de la web); lo que protege los datos son las reglas
      RLS. Haz commit y push, o pídeselo a Claude.

## 2. Ejecutar las migraciones

Hay seis archivos en `supabase/migrations/` (0001 a 0006). La forma cómoda es el punto 3:
con el secret puesto, el workflow "Migraciones Supabase" las aplica todas en orden y en
cada push futuro. Si prefieres a mano:

- [ ] Supabase → proyecto Nidito → **SQL Editor** (menú lateral).
- [ ] Pega el contenido completo de `0001_init.sql` y pulsa **Run**. Debe decir *Success*.
      Repite con 0002, 0003, 0004, 0005 y 0006, **en ese orden**. Si alguna da error, copia
      el mensaje tal cual y pégaselo a Claude.

## 3. Secret de la base de datos (para que las migraciones siguientes se apliquen solas)

- [ ] Supabase → botón **Connect** (arriba) → pestaña **Session pooler**
      (NO "Direct connection": esa va solo por IPv6 y GitHub no la alcanza).
- [ ] Copia la cadena. Se parece a
      `postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
- [ ] Sustituye `[YOUR-PASSWORD]` (con corchetes incluidos) por la contraseña del punto 1.
- [ ] GitHub → repo Nidito → **Settings → Secrets and variables → Actions →
      New repository secret**. Name: `SUPABASE_DB_URL`. Secret: la cadena entera.
- [ ] Opcional: GitHub → **Actions → Migraciones Supabase → Run workflow** para
      comprobar que sale en verde (dirá "0001_init.sql ya aplicada").

## 4. Activar GitHub Pages

- [ ] Espera a que en **Actions** el workflow "Deploy a GitHub Pages" esté en verde.
- [ ] GitHub → repo → **Settings → Pages**. Source: *Deploy from a branch*.
      Branch: `gh-pages`, carpeta `/ (root)`. Save.
- [ ] En 1-2 minutos: https://jesusmorato.github.io/Nidito/

## 5. Crear las dos cuentas y cerrar el registro

- [ ] Supabase → **Authentication → Users → Add user → Create new user**.
      Email y contraseña de la primera persona. Marca *Auto Confirm User*.
- [ ] Repite para la segunda persona.
- [ ] Supabase → **Authentication → Sign In / Providers → Email**: desactiva
      *Allow new users to sign up*. (Así nadie más puede registrarse.)
- [ ] Supabase → **Authentication → URL Configuration**:
      - Site URL: `https://jesusmorato.github.io/Nidito/`
      - Redirect URLs: añade `https://jesusmorato.github.io/Nidito/**`
        y, para probar en local, `http://localhost:5173/Nidito/**`

## 6. Login con Google (opcional)

Igual que en GasTitos: en cuanto actives Google en Supabase, el botón "Entrar con Google"
aparece solo. Los pasos detallados están en el `docs/CONFIGURACION-MANUAL.md` de GasTitos,
punto 5; cambia el nombre del proyecto y la URL del proyecto de Supabase por los de Nidito.

## 7. Primera prueba (criterio de "hecho" de la fase 0)

- [ ] Abre https://jesusmorato.github.io/Nidito/ y entra con la primera cuenta.
- [ ] Crea el hogar. Copia el código de invitación (Ajustes).
- [ ] Entra con la segunda cuenta (otro navegador o incógnito) y únete con el código.
- [ ] En Ajustes de cada cuenta tiene que aparecer el nombre del otro.
- [ ] Cuéntale a Claude el resultado, funcione o no.

## 8. Instalar la app en el móvil (icono propio)

- iPhone (Safari): abre la dirección → botón compartir → "Añadir a pantalla de inicio".
- Android (Chrome): abre la dirección → menú ⋮ → "Instalar aplicación".

## 9. Funciones de Supabase (avisos y correo)

- [ ] Supabase → Account settings → Access Tokens: generar uno y guardarlo en GitHub como
      secret `SUPABASE_ACCESS_TOKEN`. El workflow "Funciones Supabase" publica
      `notify-partner` e `ingest-email` en cada push que las toque (o lánzalo a mano desde
      Actions).
- [ ] Avisos en el móvil: `node scripts/generar-claves-vapid.mjs`, los secrets
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` en Supabase → Edge
      Functions → Secrets, y la clave pública en `.env`. Pasos completos en `docs/AVISOS.md`.
- [ ] Correo automático (opcional, solo si hay volumen): `docs/CORREO.md`. Si queréis que
      Claude lea los correos de inmobiliarias, secret `ANTHROPIC_API_KEY` en Supabase.
- [ ] Compartir enlaces desde el iPhone: `docs/ENLACES.md` (cada uno en su móvil).

## 10. Después de la primera semana

- [ ] Ajustes → Vuestros criterios: precio máximo, m², habitaciones, imprescindibles.
- [ ] Mapa → botón de zonas → dibujar los barrios donde buscáis.
- [ ] Ajustes → Hipoteca y gastos: alquiler actual, entrada, tipo y plazo. Verificar el
      ITP y las bonificaciones en la web de la Comunidad de Madrid.
- [ ] Ajustes → Lugares importantes: el trabajo de cada uno.
