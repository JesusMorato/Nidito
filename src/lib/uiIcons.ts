// Iconos de interfaz: trazo 2 px, esquinas redondas, rejilla 24. Nada de emojis en la UI
// (misma regla que GasTitos). Se dibujan con <UiIcon name="…" />.

export const UI_ICONS = {
  settings: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2.5"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2.5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  zone: '<path d="M4 8l5-3 6 3 5-3v12l-5 3-6-3-5 3z"/><path d="M9 5v12"/><path d="M15 8v12"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  merge: '<path d="M7 4v6a4 4 0 0 0 4 4h6"/><path d="M14 11l3 3-3 3"/><path d="M7 20v-6"/>',
  inbox: '<path d="M4 4h16v16H4z"/><path d="M4 14h5l1.5 2h3L15 14h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  users: '<circle cx="8" cy="8" r="3.5"/><circle cx="16.5" cy="9" r="3"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6"/><path d="M13 20c0-2.8 1.8-5 3.8-5S21 17.2 21 20"/>',
  pencil: '<path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  arrowOut: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  compare: '<rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l5 4-5 4"/><path d="M20 12H9"/>',
} as const

export type UiIconName = keyof typeof UI_ICONS
