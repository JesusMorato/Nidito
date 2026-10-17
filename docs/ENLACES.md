# Compartir un anuncio desde el móvil (Compartir → Nidito)

Desde la app de Idealista, Fotocasa, pisos.com o Safari: botón **Compartir** → atajo
**Nidito**. La casa aparece en Nidito con el enlace y el título y, si el texto compartido
trae el precio, también el precio. Si ya la teníais (mismo enlace o misma referencia de
Idealista) no se duplica: solo se apunta el precio nuevo si ha cambiado.

Después la completas desde su ficha: **"Rellenar desde el texto"** (el lector saca metros,
habitaciones, extras…) o **Editar**. Nidito no descarga la página del portal: lo prohíben
sus condiciones.

Cada persona lo monta en su iPhone con **su propio código**. Son unos 5 minutos.

---

## 1. Activar en Nidito

1. Abre Nidito → **Ajustes** → tarjeta **"Compartir enlaces desde el iPhone"**.
2. Pulsa **"Activar: crear mi código"**.
3. Aparecen tres cosas, cada una con un botón de copiar:
   - **Código secreto**. Es tuyo: no lo compartas.
   - **Dirección** a la que manda el atajo.
   - **Clave pública**.

Consejo: haz esta parte en el propio iPhone, así puedes copiar y pegar en Atajos.

## 2. Crear el atajo en Atajos

1. Abre la app **Atajos** → pestaña **Atajos** → **+**.
2. Pulsa el nombre de arriba y llámalo **Nidito**.
3. Toca el icono de información (ⓘ) abajo → activa **"Mostrar en la hoja para compartir"**.
   En "Tipos de hoja para compartir" deja marcados **URL** y **Texto**.
4. Añade la acción **"Obtener contenido de URL"** y rellénala así:
   - **URL**: pega la **dirección** que copiaste de Nidito.
   - Despliega **"Mostrar más"**.
   - **Método**: `POST`.
   - **Cabeceras**: añade dos:
     - `apikey` → pega la **clave pública**.
     - `Content-Type` → `application/json`.
   - **Cuerpo de la solicitud**: `JSON`. Añade estos campos (Texto):

     | Clave     | Valor                                                        |
     |-----------|--------------------------------------------------------------|
     | `p_token` | pega tu **código secreto**                                   |
     | `p_url`   | pastilla **Entrada del atajo** (variable "Shortcut Input")   |
     | `p_title` | pastilla **Entrada del atajo** → propiedad **Nombre**        |
     | `p_text`  | pastilla **Entrada del atajo** (la misma variable otra vez)  |

     Para poner una variable: toca el campo Valor y, en la barra que hay encima del
     teclado, toca **Entrada del atajo** (si no la ves, "Seleccionar variable"). Cuando
     lo compartido es una URL, la pastilla vale como enlace; cuando es texto, como texto.
     Por eso se manda en `p_url` y en `p_text` a la vez: Nidito usa lo que sirva.
5. Opcional: añade después la acción **"Mostrar notificación"** con el texto "Guardado en
   Nidito", para saber que ha entrado.
6. Pulsa **Listo**.

## 3. Probar

- En la app de Idealista, abre un anuncio → Compartir → busca **Nidito** en la lista de
  apps y atajos (puede estar al final, en "Más").
- En unos segundos la casa aparece en la Lista de Nidito (tira hacia abajo para refrescar,
  o cambia de pestaña).
- Si no aparece: comprueba que el código secreto está bien pegado (sin espacios) y que la
  URL termina en `/rest/v1/rpc/register_link`. Un código mal escrito devuelve el error
  "Código no válido".

## Qué pasa por dentro

El atajo llama a la función `register_link` de Supabase con la clave pública (anon). El
código secreto identifica a la persona y a su hogar (tabla `ingest_tokens`): sin un código
válido la función no hace nada. La casa se crea con `source = 'enlace'` a tu nombre,
pasa por los criterios (solo avisan: lo que compartes tú entra directo) y, si el enlace
o la referencia ya existían, se reutiliza la ficha y se apunta el precio.

Android: Chrome permite "Compartir" con apps web instaladas (Web Share Target), pero
Nidito no lo tiene montado todavía; de momento, copia el texto del anuncio y usa
"Pegar texto".
