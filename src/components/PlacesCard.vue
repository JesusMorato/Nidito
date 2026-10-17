<script setup lang="ts">
// Lugares importantes (trabajo de cada uno, familia): la ficha enseña la distancia y los
// minutos andando a cada uno, y un botón a Google Maps en transporte público.
import { ref } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import type { LatLng } from '../lib/geo'
import AddressPicker from './AddressPicker.vue'
import Sheet from './Sheet.vue'
import UiIcon from './UiIcon.vue'

const { state: session } = useSession()
const data = useData()
const { toast } = useToast()
const { confirm } = useConfirm()

const open = ref(false)
const name = ref('')
const address = ref<string | null>(null)
const point = ref<LatLng | null>(null)

async function save() {
  if (!session.household || !name.value.trim() || !point.value) {
    toast('Pon un nombre y un pin en el mapa')
    return
  }
  try {
    await data.addPlace(session.household.id, name.value, point.value.lat, point.value.lng)
    open.value = false
    name.value = ''
    address.value = null
    point.value = null
    toast('Lugar guardado')
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}
async function remove(id: string, n: string) {
  if (await confirm({ title: 'Borrar lugar', message: `¿Borrar "${n}"?` })) await data.deletePlace(id).catch((e) => toast((e as Error).message))
}
</script>

<template>
  <div class="card">
    <div class="section-title" style="margin-top: 0">
      <h2>Lugares importantes</h2>
      <button type="button" class="small secondary" @click="open = true">+ Nuevo</button>
    </div>
    <p class="tiny" style="margin: 0 0 0.4rem">El trabajo de cada uno, la familia, el gimnasio. Cada ficha enseña a cuánto está de cada lugar.</p>
    <ul class="list">
      <li v-for="p in data.places.value" :key="p.id">
        <UiIcon name="pin" :size="18" /><span class="grow">{{ p.name }}</span>
        <button type="button" class="icon" aria-label="Borrar" @click="remove(p.id, p.name)"><UiIcon name="trash" :size="18" /></button>
      </li>
      <li v-if="!data.places.value.length"><span class="tiny">Todavía no hay lugares.</span></li>
    </ul>
    <Sheet v-if="open" title="Nuevo lugar" @close="open = false">
      <div class="field"><label for="pl-name">Nombre</label><input id="pl-name" v-model="name" placeholder="Trabajo de Ana" maxlength="40" /></div>
      <AddressPicker v-model:address="address" v-model:point="point" />
      <div class="row" style="justify-content: flex-end"><button type="button" @click="save">Guardar</button></div>
    </Sheet>
  </div>
</template>
