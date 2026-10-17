<script setup lang="ts">
// Bandeja: lo que llegó solo (correo, Idealista) y espera un vistazo. Aceptar la mete
// en Casas; descartar la deja en Descartadas, de donde siempre se puede rescatar.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { formatDate } from '../lib/format'
import type { Property } from '../types'
import PropertyCard from '../components/PropertyCard.vue'
import EmptyState from '../components/EmptyState.vue'
import UiIcon from '../components/UiIcon.vue'

const router = useRouter()
const { state: session } = useSession()
const data = useData()
const { toast } = useToast()

onMounted(() => data.ensureLoaded(session.household?.id))

const showDiscarded = ref(false)
const showMail = ref(false)
const discarded = computed(() => data.autoDiscarded.value)
const firstPhoto = (p: Property) => data.photosOf(p.id)[0] ?? null

async function accept(p: Property) {
  try {
    await data.setInbox(p.id, 'aceptada')
    toast('Casa aceptada')
  } catch (e) {
    toast(`No se ha podido: ${(e as Error).message}`)
  }
}
async function discard(p: Property) {
  try {
    await data.setInbox(p.id, 'descartada', 'Descartada a mano')
    toast('Casa descartada; la puedes rescatar abajo')
  } catch (e) {
    toast(`No se ha podido: ${(e as Error).message}`)
  }
}
const statusLabel = { done: 'casas creadas', ignored: 'sin casas', error: 'error' } as const
</script>

<template>
  <div class="space-yo stack">
    <button type="button" class="ghost small back-link" style="align-self: flex-start; padding-left: 0" @click="router.push({ name: 'list' })"><UiIcon name="chevronLeft" :size="18" /> Casas</button>
    <h1>Bandeja</h1>
    <p class="muted" style="margin-top: -0.4rem">Lo que llega por correo o de Idealista espera aquí. Acepta lo que os interese y descarta el resto; nada se borra.</p>

    <template v-if="data.inboxItems.value.length">
      <div v-for="p in data.inboxItems.value" :key="p.id" class="inbox-item">
        <router-link :to="{ name: 'property', params: { id: p.id } }" class="pcard-link">
          <PropertyCard :property="p" :photo="firstPhoto(p)" :photo-url="firstPhoto(p) ? data.photoUrl(firstPhoto(p)!) : ''">
            <template #tags>
              <span v-if="p.fit_score != null" class="tag" :class="p.fit_score >= 70 ? 'pos' : p.fit_score >= 40 ? 'warn' : 'neg'">Encaje {{ p.fit_score }}</span>
              <span v-if="p.fit_notes?.missing?.length" class="tag warn">Faltan datos</span>
            </template>
          </PropertyCard>
        </router-link>
        <div class="row" style="justify-content: flex-end; margin-top: 0.4rem">
          <button type="button" class="ghost small" @click="discard(p)">Descartar</button>
          <button type="button" class="small" @click="accept(p)"><UiIcon name="check" :size="16" /> Aceptar</button>
        </div>
      </div>
    </template>
    <div v-else class="card">
      <EmptyState kind="casas"><strong>Nada por revisar.</strong><br />Las casas que lleguen solas aparecerán aquí.</EmptyState>
    </div>

    <div class="card flat">
      <button type="button" class="ghost block" style="justify-content: space-between" @click="showDiscarded = !showDiscarded">
        <span>Descartadas automáticamente ({{ discarded.length }})</span><UiIcon :name="showDiscarded ? 'chevronUp' : 'chevronDown'" :size="18" />
      </button>
      <ul v-if="showDiscarded" class="list">
        <li v-for="p in discarded" :key="p.id">
          <div class="grow">
            <router-link :to="{ name: 'property', params: { id: p.id } }" style="font-weight: 600; color: var(--ink); text-decoration: none">{{ p.title }}</router-link>
            <div class="tiny">{{ p.discard_reason ?? 'sin motivo' }}</div>
          </div>
          <button type="button" class="secondary small" @click="accept(p)">Rescatar</button>
        </li>
        <li v-if="!discarded.length"><span class="tiny">Ninguna. Si el filtro fuera demasiado estricto, aquí se vería.</span></li>
      </ul>
    </div>

    <div class="card flat">
      <button type="button" class="ghost block" style="justify-content: space-between" @click="showMail = !showMail">
        <span>Correos recibidos ({{ data.inbound.value.length }})</span><UiIcon :name="showMail ? 'chevronUp' : 'chevronDown'" :size="18" />
      </button>
      <ul v-if="showMail" class="list">
        <li v-for="m in data.inbound.value" :key="m.id">
          <div class="grow">
            <div class="ellipsis" style="font-weight: 600">{{ m.subject || '(sin asunto)' }}</div>
            <div class="tiny ellipsis">{{ formatDate(m.received_at) }} · {{ m.from_addr }} · {{ statusLabel[m.status] }}{{ m.detail ? ' · ' + m.detail : '' }}</div>
          </div>
        </li>
        <li v-if="!data.inbound.value.length"><span class="tiny">Todavía no ha llegado ningún correo. Los pasos están en docs/CORREO.md.</span></li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.inbox-item { background: var(--surface-2); border-radius: var(--r-lg); padding: 0.5rem; }
</style>
