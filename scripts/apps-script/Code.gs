// ============================================================
// Nidito · Apps Script para Gmail
// Cada 10 minutos mira la etiqueta "Nidito" de tu Gmail y manda a Nidito los correos
// que aún no ha mandado. Se instala en TU cuenta de Google (script.google.com), así
// que nadie más lee tu correo. Pasos en docs/CORREO.md.
//
// Configura estas tres cosas en "Propiedades del script" (Configuración del proyecto):
//   NIDITO_URL    → la dirección de la función (Ajustes → Correo automático → Dirección)
//   NIDITO_TOKEN  → tu código secreto (Ajustes → Compartir enlaces / Correo automático)
//   NIDITO_APIKEY → la clave pública de Supabase
// ============================================================

var ETIQUETA = 'Nidito'
var ETIQUETA_HECHO = 'Nidito/Enviado'
var MAX_POR_PASADA = 20

function configuracion() {
  var p = PropertiesService.getScriptProperties()
  var cfg = { url: p.getProperty('NIDITO_URL'), token: p.getProperty('NIDITO_TOKEN'), apikey: p.getProperty('NIDITO_APIKEY') }
  if (!cfg.url || !cfg.token || !cfg.apikey) {
    throw new Error('Faltan NIDITO_URL, NIDITO_TOKEN o NIDITO_APIKEY en Propiedades del script')
  }
  return cfg
}

function etiqueta(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre)
}

/** La función que ejecuta el disparador cada 10 minutos. */
function enviarCorreosNuevos() {
  var cfg = configuracion()
  var pendiente = etiqueta(ETIQUETA)
  var hecho = etiqueta(ETIQUETA_HECHO)
  var hilos = pendiente.getThreads(0, MAX_POR_PASADA)
  var enviados = 0
  for (var i = 0; i < hilos.length; i++) {
    var mensajes = hilos[i].getMessages()
    for (var j = 0; j < mensajes.length; j++) {
      var m = mensajes[j]
      // Los hilos que ya tienen "Nidito/Enviado" solo mandan los mensajes nuevos: se
      // recuerda cada id en las propiedades del usuario.
      var clave = 'enviado:' + m.getId()
      if (PropertiesService.getUserProperties().getProperty(clave)) continue
      var cuerpo = {
        token: cfg.token,
        message_id: m.getId(),
        from: m.getFrom(),
        subject: m.getSubject(),
        received_at: m.getDate().toISOString(),
        body_text: m.getPlainBody(),
        body_html: m.getBody(),
      }
      var res = UrlFetchApp.fetch(cfg.url, {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: cfg.apikey, Authorization: 'Bearer ' + cfg.apikey },
        payload: JSON.stringify(cuerpo),
        muteHttpExceptions: true,
      })
      var codigo = res.getResponseCode()
      if (codigo >= 200 && codigo < 300) {
        PropertiesService.getUserProperties().setProperty(clave, '1')
        enviados++
      } else {
        console.error('Nidito ' + codigo + ': ' + res.getContentText().slice(0, 300))
      }
    }
    hilos[i].addLabel(hecho).removeLabel(pendiente)
  }
  console.log('Nidito: ' + enviados + ' correo(s) enviado(s)')
}

/** Ejecútala una vez a mano para crear el disparador de cada 10 minutos. */
function instalarDisparador() {
  var existentes = ScriptApp.getProjectTriggers()
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'enviarCorreosNuevos') ScriptApp.deleteTrigger(existentes[i])
  }
  ScriptApp.newTrigger('enviarCorreosNuevos').timeBased().everyMinutes(10).create()
  etiqueta(ETIQUETA)
  etiqueta(ETIQUETA_HECHO)
  console.log('Disparador creado: cada 10 minutos. Etiquetas "Nidito" y "Nidito/Enviado" listas.')
}

/** Manda un correo de prueba a Nidito sin tocar Gmail, para comprobar la configuración. */
function probarConexion() {
  var cfg = configuracion()
  var res = UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.apikey, Authorization: 'Bearer ' + cfg.apikey },
    payload: JSON.stringify({
      token: cfg.token,
      message_id: 'prueba-' + Date.now(),
      from: 'prueba@nidito',
      subject: 'Correo de prueba',
      received_at: new Date().toISOString(),
      body_text: 'Piso de prueba en calle Mayor 1: 3 habitaciones, 90 m2, 300.000 €.',
    }),
    muteHttpExceptions: true,
  })
  console.log(res.getResponseCode() + ' ' + res.getContentText())
}
