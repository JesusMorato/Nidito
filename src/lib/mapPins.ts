// Pines del mapa: un globo con el precio dentro ("385k"), del color del estado.
// Se dibujan con HTML (divIcon) para no depender de las imágenes de Leaflet.
import L from 'leaflet'

export function pinIcon(label: string, color: string, selected = false): L.DivIcon {
  const w = Math.max(34, 14 + label.length * 8)
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin${selected ? ' selected' : ''}" style="--pin:${color}"><span>${label}</span></div>`,
    iconSize: [w, 36],
    iconAnchor: [w / 2, 36],
  })
}

export function clusterIcon(count: number): L.DivIcon {
  return L.divIcon({ className: 'pin-wrap', html: `<div class="pin-cluster">${count}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] })
}
