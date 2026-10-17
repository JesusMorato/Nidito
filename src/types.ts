// Tipos que reflejan las tablas de Supabase (ver docs/MODELO-DATOS.md).

export interface Household {
  id: string
  name: string
  invite_code: string
  created_at: string
}

export interface Member {
  household_id: string
  user_id: string
  display_name: string
  joined_at: string
}
