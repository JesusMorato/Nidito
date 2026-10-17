// Genera el par de claves que hace falta para enviar avisos al móvil (Web Push).
// Se ejecuta UNA sola vez:  node scripts/generar-claves-vapid.mjs
// No usa ninguna librería: solo lo que trae Node.
//
// La clave PÚBLICA se escribe sola en .env (no es secreta, va dentro de la web).
// La clave PRIVADA NO se imprime en pantalla: se guarda en claves-vapid.local,
// que está en .gitignore, para que no acabe en el repo ni en ningún historial.
import { webcrypto as crypto } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const b64url = (bytes) => Buffer.from(bytes).toString('base64url')

const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publica = b64url(await crypto.subtle.exportKey('raw', par.publicKey))
const privada = b64url(await crypto.subtle.exportKey('pkcs8', par.privateKey))

// ---------- la clave pública, directa al .env ----------
const rutaEnv = join(raiz, '.env')
let env = readFileSync(rutaEnv, 'utf8')
const linea = `VITE_VAPID_PUBLIC_KEY=${publica}`
env = /^VITE_VAPID_PUBLIC_KEY=.*$/m.test(env)
  ? env.replace(/^VITE_VAPID_PUBLIC_KEY=.*$/m, linea)
  : `${env.replace(/\n*$/, '')}\n${linea}\n`
writeFileSync(rutaEnv, env)

// ---------- la clave privada, a un archivo que git ignora ----------
const rutaClaves = join(raiz, 'claves-vapid.local')
writeFileSync(rutaClaves, `Secretos para Supabase -> Edge Functions -> Secrets
Crea estos dos secretos y luego BORRA este archivo.

VAPID_PUBLIC_KEY
${publica}

VAPID_PRIVATE_KEY
${privada}
`)

console.log(`
=============================================================
 CLAVES PARA LOS AVISOS DEL MÓVIL · listas
=============================================================

 1) La clave pública ya está puesta en .env. No hay que tocar nada.
    (Es pública: va dentro de la web y no es un secreto.)

 2) La clave privada NO se imprime aquí a propósito. Está en:

       claves-vapid.local

    Abre ese archivo, copia los dos valores en
    Supabase -> Edge Functions -> Secrets
    y cuando termines BORRA el archivo.

 3) Dime que ya está y subo el cambio de .env.

=============================================================
`)
