# Correo automático: de Gmail a la Bandeja de Nidito

Solo merece la pena si recibís bastantes correos (ver `docs/PLAN.md`, fase 4). Con dos o
tres a la semana, "Pegar texto" los resuelve en diez segundos.

Cómo funciona: en tu Gmail creas una etiqueta **Nidito** y un filtro que la ponga a los
correos de las inmobiliarias y a las alertas de los portales. Un pequeño script en tu
propia cuenta de Google (Apps Script) mira esa etiqueta cada 10 minutos y manda lo nuevo a
Nidito. Nidito lee cada correo y crea las casas: las que cumplen vuestros imprescindibles
caen en la **Bandeja** (en la Lista, arriba), las que no, en **Descartadas** con el motivo.
Nada se borra: desde Descartadas se rescata con un toque.

Qué lee:
- **Alertas de portales** (Idealista, Fotocasa, pisos.com, Habitaclia): formato fijo, se
  leen con reglas, sin coste. Varias casas por correo.
- **Correos de inmobiliarias**: si configuras `ANTHROPIC_API_KEY` en Supabase, un modelo
  pequeño de Claude saca las fichas (unos céntimos por correo). Si no, el lector de reglas
  (el mismo de "Pegar texto") saca una ficha si encuentra precio o metros.

Cada persona lo monta en su cuenta. Son unos 10 minutos.

---

## 1. Publicar la función en Supabase

- [ ] Está en `supabase/functions/ingest-email/`. El workflow "Funciones Supabase" la
      publica al hacer push (necesita el secret `SUPABASE_ACCESS_TOKEN`, ver `AVISOS.md`).
      También a mano: `supabase functions deploy ingest-email --no-verify-jwt`.
- [ ] Opcional: Supabase → Edge Functions → Secrets → `ANTHROPIC_API_KEY` (y
      `ANTHROPIC_MODEL` si quieres otro modelo; por defecto `claude-haiku-5-5`).

## 2. Tu código secreto

- [ ] Nidito → Ajustes → **Correo automático** → si no tienes código, "Activar: crear mi
      código" (es el mismo código que el de compartir enlaces). Copia:
      - **Código secreto**
      - **Dirección de la función** (termina en `/functions/v1/ingest-email`)
      - **Clave pública**

## 3. El script en tu Google

- [ ] Entra en https://script.google.com con tu cuenta de Gmail → **Nuevo proyecto**.
- [ ] Borra lo que haya y pega el contenido de `scripts/apps-script/Code.gs`. Guarda
      (nombre del proyecto: Nidito).
- [ ] **Configuración del proyecto** (engranaje) → **Propiedades del script** → añade:
      `NIDITO_URL`, `NIDITO_TOKEN`, `NIDITO_APIKEY` con lo del punto 2.
- [ ] Arriba, elige la función **probarConexion** → **Ejecutar**. La primera vez pide
      permisos (Gmail y conexiones externas): acéptalos. En el registro debe salir `200`
      y una casa de prueba aparecerá en tu Bandeja (descártala).
- [ ] Elige la función **instalarDisparador** → **Ejecutar**. Crea el disparador de cada
      10 minutos y las etiquetas **Nidito** y **Nidito/Enviado**.

## 4. El filtro en Gmail

- [ ] Gmail → buscador → flecha de opciones → **De:** las direcciones de las inmobiliarias
      y de las alertas (por ejemplo `alertas@idealista.com`), separadas por `OR` →
      **Crear filtro** → marca **Aplicar la etiqueta: Nidito** → Crear.
- [ ] Opcional: marca también "Saltar Recibidos" si no quieres verlos.

## 5. Probar con un correo real

- [ ] Reenvíate (o espera) un correo de una inmobiliaria con la etiqueta Nidito. En menos
      de 10 minutos tiene que estar en la Bandeja o en Descartadas. Si no, en Apps Script
      → **Ejecuciones** se ve el error.
- [ ] En Nidito → Lista → Bandeja → "Correos recibidos" se ve cada correo con su estado:
      `done` (creó casas), `ignored` (sin casas reconocibles) o `error`. Si una de las
      casas de un correo no se pudo guardar, el detalle lo dice y las demás entran igual.
- Si la función no responde (código distinto de 2xx), el hilo se queda con la etiqueta
  **Nidito** y se reintenta en la siguiente pasada; los mensajes que sí llegaron no se
  repiten.

## Seguridad

La función no tiene sesión, así que la protege el **código secreto** del cuerpo: se
comprueba antes de leer nada (quien no lo tenga recibe un 403 sin gastar una llamada al
modelo) y además hace falta la clave pública de Supabase en la cabecera `apikey` (el
script la manda). Lo que diga el correo se trata como entrada no confiable: solo pasan los
campos conocidos y bien tipados, y la base de datos ignora `id`, `status` o `inbox` aunque
alguien los metiera en un correo. Si un día cambias el código en Ajustes, actualiza
`NIDITO_TOKEN` en el script.

## Límites

Una cuenta personal de Google tiene 90 minutos de ejecución y 20.000 lecturas de correo al
día: de sobra. El script manda como mucho 20 hilos por pasada.

## Alternativa sin Google: Cloudflare Email Routing

Si tenéis un dominio en Cloudflare, Email Routing puede entregar `casas@vuestrodominio` a
un Worker que llame a la misma función con el mismo cuerpo (`token`, `message_id`, `from`,
`subject`, `body_text`/`body_html`). No está montado; pídeselo a Claude si lo preferís.
