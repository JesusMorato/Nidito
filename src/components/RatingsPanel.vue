<script setup lang="ts">
// Valoraciones a dos de una casa: mis estrellas por aspecto, las de mi pareja
// (si el modo a ciegas lo permite), la nota conjunta, el veto y los comentarios.
import { computed, ref } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { formatScore, summarise } from '../lib/ratings'
import { formatDate } from '../lib/format'
import type { Property } from '../types'
import StarRating from './StarRating.vue'
import UiIcon from './UiIcon.vue'
import Sheet from './Sheet.vue'

const props = defineProps<{ property: Property }>()
const { state: session, me, partner, nameOf } = useSession()
const data = useData()
const { toast } = useToast()
const { confirm } = useConfirm()

const myId = computed(() => session.user?.id ?? '')
const aspects = computed(() => data.activeAspects.value)
const ratings = computed(() => data.ratingsOf(props.property.id))
const summary = computed(() => summarise(ratings.value, aspects.value, myId.value, partner.value?.user_id ?? null))
const blind = computed(() => session.household?.blind_rating !== false)
/** A ciegas y sin puntuar: lo de mi pareja está escondido (la base de datos no lo manda). */
const hidden = computed(() => blind.value && !summary.value.ratedByMe && !!partner.value)

const mine = (aspectId: string) => ratings.value.find((r) => r.user_id === myId.value && r.aspect_id === aspectId)
const theirs = (aspectId: string) => ratings.value.find((r) => r.user_id === partner.value?.user_id && r.aspect_id === aspectId)

const commentFor = ref<string | null>(null)
const commentText = ref('')
function openComment(aspectId: string) {
  commentFor.value = aspectId
  commentText.value = mine(aspectId)?.comment ?? ''
}

async function setStars(aspectId: string, stars: number | null) {
  try {
    if (stars == null) {
      await data.unrate(props.property.id, aspectId, myId.value)
      return
    }
    const first = await data.rate(props.property.id, aspectId, myId.value, stars, mine(aspectId)?.comment ?? null)
    if (first && partner.value) data.notifyPartner('valoracion', props.property.id)
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}
async function saveComment() {
  const aspectId = commentFor.value
  if (!aspectId) return
  const cur = mine(aspectId)
  commentFor.value = null
  try {
    await data.rate(props.property.id, aspectId, myId.value, cur?.stars ?? 3, commentText.value)
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}

// --- veto ---
const myReaction = computed(() => data.reactionsOf(props.property.id).find((r) => r.user_id === myId.value))
const theirReaction = computed(() => data.reactionsOf(props.property.id).find((r) => r.user_id === partner.value?.user_id))
const vetoOpen = ref(false)
const vetoReason = ref('')
async function toggleVeto() {
  if (myReaction.value?.veto) {
    await data.setReaction(props.property.id, myId.value, { veto: false, veto_reason: null }).catch((e) => toast((e as Error).message))
    return
  }
  vetoReason.value = ''
  vetoOpen.value = true
}
async function confirmVeto() {
  vetoOpen.value = false
  try {
    await data.setReaction(props.property.id, myId.value, { veto: true, veto_reason: vetoReason.value.trim() || null })
    toast('Veto puesto')
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}

// --- comentarios ---
const comments = computed(() => data.commentsOf(props.property.id))
const newComment = ref('')
const sending = ref(false)
async function send() {
  if (!newComment.value.trim() || sending.value) return
  sending.value = true
  try {
    await data.addComment(props.property.id, myId.value, newComment.value)
    if (partner.value) data.notifyPartner('comentario', props.property.id, { text: newComment.value.trim().slice(0, 140) })
    newComment.value = ''
  } catch (e) {
    toast(`No se ha podido enviar: ${(e as Error).message}`)
  } finally {
    sending.value = false
  }
}
async function removeComment(id: string) {
  if (await confirm({ title: 'Borrar comentario', message: 'Se borra para los dos.' })) {
    await data.deleteComment(id).catch((e) => toast((e as Error).message))
  }
}
</script>

<template>
  <div class="card ratings">
    <div class="row between">
      <h2>Valoración</h2>
      <div v-if="summary.joint != null" class="row" style="gap: 0.4rem">
        <span class="score-pill" title="Nota conjunta">★ {{ formatScore(summary.joint) }}</span>
      </div>
    </div>

    <div class="who-row">
      <div class="who yo"><span class="avatar">{{ (me?.display_name ?? 'Yo').slice(0, 1).toUpperCase() }}</span> Tú <strong class="num">{{ formatScore(summary.mine) }}</strong></div>
      <div v-if="partner" class="who pareja">
        <span class="avatar">{{ partner.display_name.slice(0, 1).toUpperCase() }}</span> {{ partner.display_name }}
        <strong class="num">{{ hidden ? '?' : formatScore(summary.partner) }}</strong>
      </div>
    </div>
    <p v-if="hidden" class="help">A ciegas: las estrellas de {{ partner?.display_name }} aparecen cuando tú hayas puntuado al menos un aspecto.</p>
    <p v-else-if="summary.disagreedAspects.length" class="tag warn" style="margin: 0.3rem 0 0">Desacuerdo en: {{ summary.disagreedAspects.join(', ') }}</p>

    <ul class="aspect-list">
      <li v-for="a in aspects" :key="a.id" class="aspect">
        <div class="aspect-head">
          <span class="aspect-name">{{ a.name }}</span>
          <button type="button" class="icon small-icon" :aria-label="`Comentar ${a.name}`" :class="{ has: !!mine(a.id)?.comment }" @click="openComment(a.id)"><UiIcon name="pencil" :size="15" /></button>
        </div>
        <div class="aspect-rows">
          <div class="aspect-row">
            <span class="tiny who-label yo">Tú</span>
            <StarRating :value="mine(a.id)?.stars ?? null" color="var(--casa)" @change="setStars(a.id, $event)" />
          </div>
          <div v-if="partner" class="aspect-row">
            <span class="tiny who-label pareja">{{ partner.display_name.split(' ')[0] }}</span>
            <StarRating v-if="!hidden" :value="theirs(a.id)?.stars ?? null" color="var(--pareja)" readonly :size="20" />
            <span v-else class="tiny">· · · · ·</span>
          </div>
        </div>
        <p v-if="mine(a.id)?.comment" class="aspect-comment yo">{{ mine(a.id)?.comment }}</p>
        <p v-if="!hidden && theirs(a.id)?.comment" class="aspect-comment pareja">{{ theirs(a.id)?.comment }}</p>
      </li>
    </ul>

    <div class="row between" style="margin-top: 0.8rem">
      <span v-if="theirReaction?.veto" class="tag neg">{{ partner?.display_name }}: para mí, no{{ theirReaction.veto_reason ? ' · ' + theirReaction.veto_reason : '' }}</span>
      <span v-else />
      <button type="button" class="small" :class="myReaction?.veto ? 'danger-solid' : 'danger'" @click="toggleVeto">
        {{ myReaction?.veto ? 'Quitar mi veto' : 'Para mí, no' }}
      </button>
    </div>
    <p v-if="myReaction?.veto && myReaction.veto_reason" class="tiny" style="margin: 0.3rem 0 0; text-align: right">Tu motivo: {{ myReaction.veto_reason }}</p>

    <hr class="sep" />
    <h3>Comentarios</h3>
    <ul class="comments">
      <li v-for="c in comments" :key="c.id" :class="c.user_id === myId ? 'yo' : 'pareja'">
        <div class="comment-meta tiny">{{ nameOf(c.user_id) }} · {{ formatDate(c.created_at) }}</div>
        <div class="comment-body">{{ c.body }}</div>
        <button v-if="c.user_id === myId" type="button" class="ghost small comment-del" @click="removeComment(c.id)">Borrar</button>
      </li>
    </ul>
    <p v-if="!comments.length" class="tiny">Nada todavía. Lo que escribas aquí lo ve tu pareja.</p>
    <form class="row" style="margin-top: 0.5rem; flex-wrap: nowrap" @submit.prevent="send">
      <input v-model="newComment" class="grow" placeholder="Escribe un comentario…" maxlength="1000" />
      <button type="submit" class="small" :disabled="!newComment.trim() || sending">Enviar</button>
    </form>

    <Sheet v-if="commentFor" :title="aspects.find((a) => a.id === commentFor)?.name ?? 'Comentario'" @close="commentFor = null">
      <div class="field"><textarea v-model="commentText" rows="3" placeholder="Qué te ha parecido este aspecto" /></div>
      <div class="row" style="justify-content: flex-end"><button type="button" @click="saveComment">Guardar</button></div>
    </Sheet>
    <Sheet v-if="vetoOpen" title="Para mí, no" @close="vetoOpen = false">
      <p class="muted">Un veto saca la casa de la lista principal aunque tenga buena nota. Tu pareja verá el veto y el motivo.</p>
      <div class="field"><label for="veto-r">Motivo (opcional)</label><input id="veto-r" v-model="vetoReason" placeholder="Demasiado lejos del trabajo" /></div>
      <div class="row" style="justify-content: flex-end"><button type="button" class="danger-solid" @click="confirmVeto">Poner veto</button></div>
    </Sheet>
  </div>
</template>

<style>
.ratings .score-pill { background: var(--star); color: #4a3800; font-weight: 800; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.95rem; }
.who-row { display: flex; gap: 1rem; margin: 0.6rem 0 0.2rem; flex-wrap: wrap; }
.who { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
.who strong { font-size: 1.05rem; margin-left: 0.2rem; }
.who.yo .avatar { background: var(--casa-soft); color: var(--casa-ink); }
.who.pareja .avatar { background: var(--pareja-soft); color: var(--pareja-ink); }
.aspect-list { list-style: none; margin: 0.6rem 0 0; padding: 0; }
.aspect { padding: 0.55rem 0; border-top: 1px solid var(--line); }
.aspect-head { display: flex; justify-content: space-between; align-items: center; }
.aspect-name { font-weight: 600; font-size: 0.95rem; }
.small-icon { width: 32px; height: 32px; color: var(--ink-3); }
.small-icon.has { color: var(--casa); }
.aspect-rows { display: flex; flex-direction: column; gap: 0.1rem; }
.aspect-row { display: flex; align-items: center; gap: 0.5rem; }
.who-label { width: 46px; flex: none; font-weight: 700; }
.who-label.yo { color: var(--casa); }
.who-label.pareja { color: var(--pareja); }
.aspect-comment { margin: 0.15rem 0 0 46px; font-size: 0.85rem; color: var(--ink-2); }
.aspect-comment.yo { border-left: 3px solid var(--casa-soft); padding-left: 0.5rem; }
.aspect-comment.pareja { border-left: 3px solid var(--pareja-soft); padding-left: 0.5rem; }
.comments { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.comments li { background: var(--surface-2); border-radius: var(--r-md); padding: 0.5rem 0.75rem; position: relative; }
.comments li.yo { background: var(--casa-soft); }
.comments li.pareja { background: var(--pareja-soft); }
.comment-body { white-space: pre-wrap; font-size: 0.93rem; }
.comment-del { position: absolute; right: 0.2rem; top: 0.15rem; font-size: 0.75rem; min-height: 0; padding: 0.2rem 0.4rem; }
</style>
