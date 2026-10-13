// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Gera public/downloads/xs-instagram.zip (a extensão do Instagram) a cada dev/build,
// então o download do site sempre bate com a pasta extensao-instagram/.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pasta = join(raiz, 'extensao-instagram')
const destino = join(raiz, 'public', 'downloads', 'xs-instagram.zip')

const TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const arquivos = readdirSync(pasta)
  .filter((n) => !n.startsWith('.'))
  .sort()
  .map((nome) => ({ nome: `xs-instagram/${nome}`, dados: readFileSync(join(pasta, nome)) }))
arquivos.push({ nome: 'xs-instagram/icone.png', dados: readFileSync(join(raiz, 'public', 'icons', 'icon-192.png')) })

// Data fixa: o zip só muda quando os arquivos mudam
const DOS_HORA = 0
const DOS_DATA = ((2026 - 1980) << 9) | (1 << 5) | 1

const partes = []
const central = []
let pos = 0
for (const { nome, dados } of arquivos) {
  const nomeBuf = Buffer.from(nome, 'utf8')
  const comp = deflateRawSync(dados, { level: 9 })
  const crc = crc32(dados)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt16LE(DOS_HORA, 10)
  local.writeUInt16LE(DOS_DATA, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comp.length, 18)
  local.writeUInt32LE(dados.length, 22)
  local.writeUInt16LE(nomeBuf.length, 26)
  partes.push(local, nomeBuf, comp)

  const cab = Buffer.alloc(46)
  cab.writeUInt32LE(0x02014b50, 0)
  cab.writeUInt16LE(20, 4)
  cab.writeUInt16LE(20, 6)
  cab.writeUInt16LE(0x0800, 8)
  cab.writeUInt16LE(8, 10)
  cab.writeUInt16LE(DOS_HORA, 12)
  cab.writeUInt16LE(DOS_DATA, 14)
  cab.writeUInt32LE(crc, 16)
  cab.writeUInt32LE(comp.length, 20)
  cab.writeUInt32LE(dados.length, 24)
  cab.writeUInt16LE(nomeBuf.length, 28)
  cab.writeUInt32LE(pos, 42)
  central.push(cab, nomeBuf)
  pos += 30 + nomeBuf.length + comp.length
}
const tamCentral = central.reduce((s, b) => s + b.length, 0)
const fim = Buffer.alloc(22)
fim.writeUInt32LE(0x06054b50, 0)
fim.writeUInt16LE(arquivos.length, 8)
fim.writeUInt16LE(arquivos.length, 10)
fim.writeUInt32LE(tamCentral, 12)
fim.writeUInt32LE(pos, 16)

mkdirSync(dirname(destino), { recursive: true })
writeFileSync(destino, Buffer.concat([...partes, ...central, fim]))
console.log(`Extensão do Instagram empacotada: public/downloads/xs-instagram.zip (${arquivos.length} arquivos)`)
