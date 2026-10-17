<script setup lang="ts">
// Notas de barrio: comentarios de una zona que valen para todas sus casas.
import { computed, ref } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { formatDate } from '../lib/format'
import type { Zone } from '../types'

const props = defineProps<{ zone: Zone; compact?: boolean }>()
const { state: session, nameOf } = useSession()
const data = useData()
const { toast } = useToast()
const notes = computed(() => data.zoneNotesOf(props.zone.id))
const body = ref('')

async function add() {
  if (!session.user || !body.value.trim()) return
  try {
    await data.addZoneNote(props.zone.id, session.user.id, body.value)
    body.value = ''
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}
</script>

<template>
  <div>
    <h3 v-if="!compact">Notas de {{ zone.name }}</h3>
    <ul class="list">
      <li v-for="n in notes" :key="n.id" style="align-items: flex-start">
        <div class="grow"><div class="tiny">{{ nameOf(n.user_id) }} · {{ formatDate(n.created_at) }}</div><div style="white-space: pre-wrap">{{ n.body }}</div></div>
        <button v-if="n.user_id === session.user?.id" type="button" class="ghost small" @click="data.deleteZoneNote(n.id)">Borrar</button>
      </li>
      <li v-if="!notes.length"><span class="tiny">Sin notas. Lo que aprendáis del barrio ("de noche hay ruido en esta calle") vale para todas sus casas.</span></li>
    </ul>
    <form class="row" style="flex-wrap: nowrap; margin-top: 0.4rem" @submit.prevent="add">
      <input v-model="body" class="grow" placeholder="Nota sobre el barrio…" maxlength="500" />
      <button type="submit" class="small" :disabled="!body.trim()">Añadir</button>
    </form>
  </div>
</template>
