// Bloqueo del scroll de la página mientras hay una hoja (modal) abierta.
//
// En iOS no basta con `overflow: hidden`: la página de detrás sigue moviéndose
// al arrastrar dentro de la hoja. Lo que funciona es fijar el body en su
// posición actual (`position: fixed` + `top: -scroll`) y, al cerrar, devolver
// el scroll a donde estaba. Llevamos un contador por si hay dos hojas abiertas
// a la vez: solo se bloquea con la primera y se libera con la última.

let abiertas = 0
let scrollGuardado = 0

export function lockScroll() {
  abiertas++
  if (abiertas > 1) return
  scrollGuardado = window.scrollY
  document.body.style.top = `-${scrollGuardado}px`
  document.body.classList.add('sheet-open')
}

export function unlockScroll() {
  if (abiertas === 0) return
  abiertas--
  if (abiertas > 0) return
  document.body.classList.remove('sheet-open')
  document.body.style.top = ''
  window.scrollTo(0, scrollGuardado)
}
