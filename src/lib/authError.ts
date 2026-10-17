// Cuando el login con Google falla, Supabase vuelve a la app con el motivo en la
// dirección (…/#error=…&error_description=… o ?error=…). Esto lo lee.

/** Devuelve la descripción del error de login que trae la URL, o null si no hay. */
export function readAuthError(search: string, hash: string): string | null {
  for (const part of [search, hash]) {
    const params = new URLSearchParams(part.replace(/^[?#]/, ''))
    if (params.has('error') || params.has('error_description')) {
      return params.get('error_description') || params.get('error') || null
    }
  }
  return null
}

/** Lee si Google está activado en Supabase (respuesta de /auth/v1/settings). */
export function googleEnabled(settings: unknown): boolean {
  const external = (settings as { external?: Record<string, unknown> } | null)?.external
  return external?.google === true
}
