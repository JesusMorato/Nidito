<script setup lang="ts">
// Ajustes → Hipoteca y gastos: lo que usa la tarjeta "Coste real" de cada ficha.
import { reactive, ref, watch } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { DEFAULT_FINANCE, withDefaults, type FinanceSettings } from '../lib/cost'

const { state: session, refresh } = useSession()
const data = useData()
const { toast } = useToast()

const f = reactive<FinanceSettings>({ ...DEFAULT_FINANCE })
const dirty = ref(false)
watch(() => session.household?.finance, (fin) => { Object.assign(f, withDefaults(fin as Partial<FinanceSettings> | undefined)); dirty.value = false }, { immediate: true, deep: true })
watch(f, () => { dirty.value = true }, { deep: true })

const num = (k: keyof FinanceSettings) => ({
  get: () => (f[k] == null ? '' : String(f[k])),
  set: (v: string) => { (f as unknown as Record<string, unknown>)[k] = v.trim() === '' ? (k === 'rent' ? null : 0) : Number(v.replace(',', '.')) },
})
const fields: Array<{ key: keyof FinanceSettings; label: string; hint?: string }> = [
  { key: 'rent', label: 'Vuestro alquiler actual (€/mes)' },
  { key: 'down_pct', label: 'Entrada (% del precio)' },
  { key: 'rate', label: 'Tipo de interés (% anual)' },
  { key: 'years', label: 'Plazo (años)' },
  { key: 'itp_rate', label: 'ITP vivienda usada (%)', hint: 'Madrid: 6' },
  { key: 'vat_rate', label: 'IVA obra nueva (%)' },
  { key: 'ajd_rate', label: 'AJD obra nueva (%)' },
  { key: 'notary', label: 'Notaría (€)' },
  { key: 'registry', label: 'Registro (€)' },
  { key: 'agency', label: 'Gestoría (€)' },
  { key: 'appraisal', label: 'Tasación (€)' },
]
const models = Object.fromEntries(fields.map((x) => [x.key, num(x.key)])) as Record<string, { get: () => string; set: (v: string) => void }>

async function save() {
  if (!session.household) return
  try {
    await data.saveFinance(session.household.id, { ...f })
    await refresh()
    toast('Guardado')
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}
</script>

<template>
  <div class="card">
    <h2>Hipoteca y gastos</h2>
    <p class="tiny" style="margin: 0.3rem 0 0.6rem">Para la tarjeta "Coste real" de cada casa. Verifica los impuestos en la web de la Comunidad de Madrid: la fuente que usó el plan tenía incoherencias.</p>
    <div class="grid2">
      <div v-for="x in fields" :key="x.key" class="field">
        <label :for="'fin-' + x.key">{{ x.label }}</label>
        <input :id="'fin-' + x.key" :value="models[x.key].get()" inputmode="decimal" :placeholder="x.hint" @change="models[x.key].set(($event.target as HTMLInputElement).value)" />
      </div>
    </div>
    <label class="check field"><input v-model="f.under35" type="checkbox" /> Menores de 35 (bonificación del 10 % de la cuota del ITP, vivienda habitual hasta 250.000 €)</label>
    <label class="check field"><input v-model="f.big_family" type="checkbox" /> Familia numerosa (ITP al 4 %)</label>
    <div class="row" style="justify-content: flex-end"><button type="button" :disabled="!dirty" @click="save">Guardar</button></div>
  </div>
</template>
