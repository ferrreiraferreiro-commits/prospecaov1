import fs from 'node:fs'
import path from 'node:path'
import { isSea } from 'node:sea'
import { fileURLToPath } from 'node:url'

/**
 * Onde o motor guarda a sessão do WhatsApp, as campanhas e a última busca. Nunca vai para o git.
 * - Motor XS.exe: pasta "Motor XS - dados" ao lado do executável
 * - npm start (código-fonte): motor/storage
 */
function defaultStorage(): string {
  if (isSea()) return path.join(path.dirname(process.execPath), 'Motor XS - dados')
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'storage')
}

export const storageDir = process.env.XS_STORAGE ?? defaultStorage()
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
