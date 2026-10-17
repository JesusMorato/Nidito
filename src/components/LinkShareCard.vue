<script setup lang="ts">
// Compartir enlaces desde el móvil: cada uno tiene un código secreto que el atajo de
// iPhone manda junto al enlace. Igual que los pagos detectados de GasTitos.
import { onMounted, ref } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { supabaseAnonKey, supabaseUrl } from '../supabase'
import type { IngestToken } from '../types'
import UiIcon from './UiIcon.vue'

const { state: session } = useSession()
const data = useData()
const { toast } = useToast()
const { confirm } = useConfirm()

const token = ref<IngestToken | null>(null)
const loaded = ref(false)
const endpoint = `${supabaseUrl}/rest/v1/rpc/register_link`

onMounted(async () => {
  try {
    token.value = await data.loadIngestToken()
  } finally {
    loaded.value = true
  }
})

async function create() {
  if (!session.household || !session.user) return
  try {
    token.value = await data.createIngestToken(session.household.id, session.user.id)
    toast('Código creado')
  } catch (e) {
    toast(`No se ha podido crear: ${(e as Error).message}`)
  }
}
async function remove() {
  if (!session.user) return
  if (await confirm({ title: 'Desactivar', message: 'El atajo del iPhone dejará de funcionar hasta que crees otro código.' , confirmLabel: 'Desactivar' })) {
    await data.deleteIngestToken(session.user.id).catch((e) => toast((e as Error).message))
    token.value = null
  }
}
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} copiado`)
  } catch {
    toast('No se ha podido copiar; selecciónalo a mano')
  }
}
</script>

<template>
  <div class="card">
    <h2>Compartir enlaces desde el iPhone</h2>
    <p class="tiny" style="margin: 0.3rem 0 0.6rem">
      Desde la app de Idealista o cualquier portal: Compartir → atajo "Nidito". La casa aparece aquí con el enlace y, si el texto lo trae, el precio.
      Después la completas con "Pegar texto" o a mano. Los pasos están en <code>docs/ENLACES.md</code>.
    </p>
    <template v-if="!loaded"><p class="tiny">Cargando…</p></template>
    <template v-else-if="!token">
      <button type="button" class="secondary" @click="create">Activar: crear mi código</button>
    </template>
    <template v-else>
      <div class="field">
        <label>Código secreto (es tuyo, no lo compartas)</label>
        <div class="row"><code class="grow ellipsis">{{ token.token }}</code><button type="button" class="icon" aria-label="Copiar código" @click="copy(token!.token, 'Código')"><UiIcon name="copy" /></button></div>
      </div>
      <div class="field">
        <label>Dirección a la que manda el atajo</label>
        <div class="row"><code class="grow ellipsis">{{ endpoint }}</code><button type="button" class="icon" aria-label="Copiar dirección" @click="copy(endpoint, 'Dirección')"><UiIcon name="copy" /></button></div>
      </div>
      <div class="field">
        <label>Clave pública</label>
        <div class="row"><code class="grow ellipsis">{{ supabaseAnonKey }}</code><button type="button" class="icon" aria-label="Copiar clave" @click="copy(supabaseAnonKey, 'Clave')"><UiIcon name="copy" /></button></div>
      </div>
      <div class="row" style="justify-content: flex-end">
        <button type="button" class="ghost small" @click="create">Generar otro código</button>
        <button type="button" class="danger small" @click="remove">Desactivar</button>
      </div>
    </template>
  </div>
</template>
