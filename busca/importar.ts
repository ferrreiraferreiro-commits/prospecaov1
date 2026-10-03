/**
 * Importador da base aberta do CNPJ (Receita Federal) para um SQLite pronto para busca.
 *
 *   node busca/importar.ts                 → baixa o mês mais recente e monta o banco
 *   node busca/importar.ts --mes 2026-09   → um mês específico
 *   node busca/importar.ts --local <pasta> → usa os .zip que já estão na pasta (sem baixar)
 *   node busca/importar.ts --se-novo       → só importa se a Receita publicou um mês mais novo que o do banco
 *
 * Guarda só estabelecimentos ATIVOS. O banco novo é montado ao lado e só no fim
 * substitui o anterior, então a busca nunca fica fora do ar durante a atualização.
 * Precisa do `unzip` instalado (apt install unzip).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DatabaseSync } from 'node:sqlite'
import { addressOf, cleanName, emailKind, norm, phoneOf, splitLine } from './lib.ts'
import { markSharedDomains, SCHEMA } from './schema.ts'

const SHARE = 'YggdBLfdninEJX9'
const WEBDAV = 'https://arquivos.receitafederal.gov.br/public.php/webdav'
const AUTH = { Authorization: `Basic ${Buffer.from(`${SHARE}:`).toString('base64')}` }

const DATA = path.resolve(process.env.XS_DADOS ?? 'dados')
const DB_FILE = path.join(DATA, 'busca.db')

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ---------------------------------------------------------------------------
// Download (WebDAV público da Receita)
// ---------------------------------------------------------------------------

async function propfind(dir: string): Promise<{ href: string; size: number }[]> {
  const res = await fetch(`${WEBDAV}/${dir}`, { method: 'PROPFIND', headers: { ...AUTH, Depth: '1' } })
  if (!res.ok) throw new Error(`Receita respondeu ${res.status} ao listar ${dir}`)
  const xml = await res.text()
  return [...xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)].map((m) => ({
    href: decodeURIComponent(/<d:href>([^<]+)<\/d:href>/.exec(m[1])?.[1] ?? ''),
    size: Number(/<d:getcontentlength>(\d+)/.exec(m[1])?.[1] ?? 0),
  }))
}

async function latestMonth(): Promise<string> {
  const months = (await propfind(''))
    .map((e) => /(\d{4}-\d{2})\/$/.exec(e.href)?.[1])
    .filter((m): m is string => !!m)
    .sort()
  if (!months.length) throw new Error('Nenhum mês encontrado na Receita.')
  return months[months.length - 1]
}

async function download(month: string, dir: string): Promise<void> {
  const files = (await propfind(`${month}/`)).filter((e) => e.href.endsWith('.zip')).map((e) => ({ name: path.basename(e.href), size: e.size }))
  const wanted = files.filter((f) => /^(Estabelecimentos|Empresas|Socios)\d\.zip$|^(Municipios|Cnaes|Qualificacoes)\.zip$/.test(f.name))
  fs.mkdirSync(dir, { recursive: true })
  for (const f of wanted) {
    const dest = path.join(dir, f.name)
    if (fs.existsSync(dest) && fs.statSync(dest).size === f.size) continue
    for (let attempt = 1; ; attempt++) {
      try {
        log(`baixando ${f.name} (${(f.size / 1e6).toFixed(0)} MB)`)
        const res = await fetch(`${WEBDAV}/${month}/${f.name}`, { headers: AUTH })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(`${dest}.part`))
        if (fs.statSync(`${dest}.part`).size !== f.size) throw new Error('arquivo incompleto')
        fs.renameSync(`${dest}.part`, dest)
        break
      } catch (err) {
        if (attempt >= 3) throw err
        log(`falhou (${String(err)}), tentando de novo`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Leitura dos .zip (CSV ; em latin1)
// ---------------------------------------------------------------------------

async function* rows(zip: string): AsyncGenerator<string[]> {
  const child = spawn('unzip', ['-p', zip], { stdio: ['ignore', 'pipe', 'inherit'] })
  child.stdout.setEncoding('latin1')
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of rl) if (line) yield splitLine(line)
}

const zipsOf = (dir: string, prefix: string) =>
  fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix) && n.endsWith('.zip'))
    .sort()
    .map((n) => path.join(dir, n))

// ---------------------------------------------------------------------------
// Montagem do banco
// ---------------------------------------------------------------------------


async function build(dir: string, month: string) {
  const tmp = `${DB_FILE}.novo`
  fs.rmSync(tmp, { force: true })
  const db = new DatabaseSync(tmp)
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-400000;')
  db.exec(SCHEMA)
  const t0 = Date.now()

  // Tabelas pequenas
  const insMun = db.prepare('INSERT INTO municipio VALUES (?, ?, ?)')
  for await (const f of rows(path.join(dir, 'Municipios.zip'))) {
    insMun.run(Number(f[0]), f[1], norm(f[1]))
  }
  const insCnae = db.prepare('INSERT OR REPLACE INTO cnae VALUES (?, ?, ?)')
  for await (const f of rows(path.join(dir, 'Cnaes.zip'))) insCnae.run(f[0], f[1], norm(f[1]))
  const insQual = db.prepare('INSERT OR REPLACE INTO qualificacao VALUES (?, ?)')
  for await (const f of rows(path.join(dir, 'Qualificacoes.zip'))) insQual.run(f[0], f[1])

  // Estabelecimentos ativos
  const insEst = db.prepare('INSERT OR IGNORE INTO est VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  let lidas = 0
  let ativas = 0
  db.exec('BEGIN')
  for (const zip of zipsOf(dir, 'Estabelecimentos')) {
    log(`lendo ${path.basename(zip)}`)
    for await (const f of rows(zip)) {
      if (++lidas % 500_000 === 0) {
        db.exec('COMMIT; BEGIN')
        log(`${(lidas / 1e6).toFixed(1)} mi linhas · ${(ativas / 1e6).toFixed(2)} mi ativas`)
      }
      if (f[5] !== '02') continue
      ativas++
      const p1 = phoneOf(f[21], f[22])
      const p2 = phoneOf(f[23], f[24])
      // Celular primeiro: é o que vira WhatsApp
      const main = p1?.mobile ? p1 : p2?.mobile ? p2 : (p1 ?? p2)
      const other = main === p1 ? p2 : p1
      const email = f[27].trim().toLowerCase()
      const mun = Number(f[20])
      insEst.run(
        f[0] + f[1] + f[2],
        f[0],
        f[4].trim(),
        f[11],
        f[12],
        f[19],
        mun,
        f[17].trim(),
        norm(f[17]),
        addressOf({ tipo: f[13], logradouro: f[14], numero: f[15], complemento: f[16], bairro: '', cidade: '', uf: '' }),
        f[18],
        main?.phone ?? null,
        main?.mobile ? 1 : 0,
        other && other.phone !== main?.phone ? other.phone : null,
        email || null,
        emailKind(email),
        f[10],
        f[3] === '1' ? 1 : 0,
      )
    }
  }
  db.exec('COMMIT')
  log(`estabelecimentos: ${ativas} ativos de ${lidas}`)
  db.exec('CREATE INDEX est_basico ON est(basico)')
  log(`e-mails de provedor/contador desmarcados como site próprio: ${markSharedDomains(db)}`)

  // Empresas e sócios: só os que têm estabelecimento ativo
  const has = db.prepare('SELECT 1 FROM est WHERE basico = ? LIMIT 1')
  const insEmp = db.prepare('INSERT OR IGNORE INTO empresa VALUES (?, ?, ?, ?)')
  db.exec('BEGIN')
  let n = 0
  for (const zip of zipsOf(dir, 'Empresas')) {
    log(`lendo ${path.basename(zip)}`)
    for await (const f of rows(zip)) {
      if (++n % 500_000 === 0) db.exec('COMMIT; BEGIN')
      // Sem CPF: o do MEI vem dentro da razão social
      if (has.get(f[0])) insEmp.run(f[0], cleanName(f[1]), f[2], f[5])
    }
  }
  db.exec('COMMIT')
  const insSoc = db.prepare('INSERT INTO socio VALUES (?, ?, ?)')
  db.exec('BEGIN')
  for (const zip of zipsOf(dir, 'Socios')) {
    log(`lendo ${path.basename(zip)}`)
    for await (const f of rows(zip)) {
      if (++n % 500_000 === 0) db.exec('COMMIT; BEGIN')
      // Só pessoas (identificador 2) e só quem tem estabelecimento ativo
      if (f[1] === '2' && has.get(f[0])) insSoc.run(f[0], f[2].trim(), f[4])
    }
  }
  db.exec('COMMIT')

  log('criando índices')
  db.exec('CREATE INDEX est_busca ON est(uf, mun, cnae); CREATE INDEX socio_basico ON socio(basico); ANALYZE;')
  const meta = db.prepare('INSERT INTO meta VALUES (?, ?)')
  meta.run('mes', month)
  meta.run('gerado_em', new Date().toISOString())
  meta.run('ativos', String(ativas))
  db.close()

  // Troca de uma vez: quem está buscando continua no arquivo antigo até reabrir
  fs.renameSync(tmp, DB_FILE)
  log(`pronto em ${((Date.now() - t0) / 60000).toFixed(1)} min → ${DB_FILE}`)
}

// ---------------------------------------------------------------------------

const local = arg('--local')
const month = arg('--mes') ?? (local ? 'local' : await latestMonth())
const dir = local ? path.resolve(local) : path.join(DATA, 'receita', month)
fs.mkdirSync(DATA, { recursive: true })
if (process.argv.includes('--se-novo') && fs.existsSync(DB_FILE)) {
  const db = new DatabaseSync(DB_FILE, { readOnly: true })
  const atual = (db.prepare("SELECT valor FROM meta WHERE chave = 'mes'").get() as { valor: string } | undefined)?.valor
  db.close()
  if (atual === month) {
    log(`base já está no mês ${month}, nada a fazer`)
    process.exit(0)
  }
}
if (!local) {
  log(`mês ${month}`)
  await download(month, dir)
}
await build(dir, month)
// Apaga meses antigos baixados (fica só o atual)
if (!local) {
  for (const old of fs.readdirSync(path.join(DATA, 'receita'))) if (old !== month) fs.rmSync(path.join(DATA, 'receita', old), { recursive: true, force: true })
}
