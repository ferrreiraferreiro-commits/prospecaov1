import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Onde fica a sessão do WhatsApp, as campanhas e os agendamentos da conta. Nunca vai para o git.
 * Na VPS: XS_STORAGE=/var/lib/xs-whatsapp/<sessão> (whatsapp-cloud/instalar.sh). Em testes: motor/storage.
 */
export const storageDir = process.env.XS_STORAGE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'storage')
fs.mkdirSync(storageDir, { recursive: true })

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(storageDir, file), 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Grava em arquivo temporário e renomeia: um desligamento no meio não corrompe o JSON. */
export function writeJson(file: string, data: unknown) {
  const target = path.join(storageDir, file)
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1))
  fs.renameSync(tmp, target)
}
