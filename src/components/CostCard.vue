<script setup lang="ts">
// Coste real de la casa: impuestos, gastos, entrada, hipoteca y cuota frente al alquiler.
import { computed } from 'vue'
import { useSession } from '../composables/useSession'
import { costBreakdown, withDefaults } from '../lib/cost'
import { formatEur } from '../lib/format'
import type { Property } from '../types'

const props = defineProps<{ property: Property }>()
const { state: session } = useSession()
const finance = computed(() => withDefaults(session.household?.finance as Partial<import('../lib/cost').FinanceSettings> | undefined))
const isNew = computed(() => !!(props.property.extras as Record<string, unknown>)?.obra_nueva)
const c = computed(() => (props.property.price != null ? costBreakdown(props.property.price, finance.value, { isNew: isNew.value, communityFee: props.property.community_fee, ibi: props.property.ibi }) : null))
</script>

<template>
  <div v-if="c" class="card">
    <h2>Coste real</h2>
    <div class="kpis" style="margin-top: 0.6rem">
      <div class="kpi"><div class="label">Total con impuestos y gastos</div><div class="value">{{ formatEur(c.total) }}</div></div>
      <div class="kpi"><div class="label">Hay que tener ahorrado</div><div class="value">{{ formatEur(c.cashNeeded) }}</div></div>
      <div class="kpi"><div class="label">Cuota ({{ finance.down_pct }} % entrada, {{ finance.rate }} %, {{ finance.years }} años)</div><div class="value">{{ formatEur(c.monthlyMortgage) }}/mes</div></div>
      <div class="kpi"><div class="label">Al mes con comunidad e IBI</div><div class="value">{{ formatEur(c.monthlyTotal) }}</div></div>
    </div>
    <ul class="list" style="margin-top: 0.6rem; font-size: 0.9rem">
      <li><span class="grow">Precio</span><span class="num">{{ formatEur(c.price) }}</span></li>
      <li><span class="grow">{{ c.taxLabel }}</span><span class="num">{{ formatEur(c.taxes) }}</span></li>
      <li><span class="grow">Notaría, registro, gestoría y tasación</span><span class="num">{{ formatEur(c.fees) }}</span></li>
      <li v-if="c.vsRent != null">
        <span class="grow">Frente a vuestro alquiler ({{ formatEur(finance.rent!) }})</span>
        <span class="num" :class="c.vsRent > 0 ? 'neg' : 'pos'">{{ c.vsRent > 0 ? '+' : '' }}{{ formatEur(c.vsRent) }}/mes</span>
      </li>
    </ul>
    <p class="tiny" style="margin: 0.5rem 0 0">Tipos e importes de Ajustes → Hipoteca y gastos. Los impuestos hay que verificarlos en la web de la Comunidad de Madrid.</p>
  </div>
</template>
