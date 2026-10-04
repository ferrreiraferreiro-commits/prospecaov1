// Gera "Motor WhatsApp XS.exe": o motor inteiro num executável só (Node SEA).
// Uso: npm run build:exe   →   motor/build/Motor WhatsApp XS.exe
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'build')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

/**
 * Tira a assinatura digital do node.exe copiado. Depois de trocar o ícone e injetar o motor
 * ela ficaria inválida, e assinatura quebrada é pior para o antivírus do que nenhuma.
 * (Mesmo efeito de "signtool remove /s", sem precisar do Windows SDK.)
 */
function stripSignature(file) {
  const buf = fs.readFileSync(file)
  const pe = buf.readUInt32LE(0x3c)
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('Arquivo não é um executável do Windows.')
  const opt = pe + 24
  const dirs = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96)
  const sec = dirs + 4 * 8 // IMAGE_DIRECTORY_ENTRY_SECURITY
  const off = buf.readUInt32LE(sec)
  const size = buf.readUInt32LE(sec + 4)
  if (!off || !size) return
  if (off + size < buf.length - 8) throw new Error('Assinatura fora do lugar esperado; não removida.')
  buf.writeUInt32LE(0, sec)
  buf.writeUInt32LE(0, sec + 4)
  buf.writeUInt32LE(0, opt + 64) // checksum do cabeçalho
  fs.writeFileSync(file, buf.subarray(0, off))
}

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

// 1) Um arquivo JavaScript só, com todas as dependências
await build({
  entryPoints: [path.join(root, 'src/server.ts')],
  outfile: path.join(out, 'motor.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  // Opcionais do Baileys (mídia, prévia de link, QR no terminal): não usados pelo motor
  external: ['sharp', 'jimp', 'link-preview-js', 'audio-decode', 'qrcode-terminal', 'bufferutil', 'utf-8-validate', '@napi-rs/canvas'],
  define: { 'import.meta.url': '__xs_import_meta_url', 'process.env.XS_VERSION': JSON.stringify(version) },
  banner: { js: 'const __xs_import_meta_url = require("url").pathToFileURL(__filename).href;' },
})

// 2) Blob do Node SEA
const seaConfig = path.join(out, 'sea-config.json')
fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: path.join(out, 'motor.cjs'), output: path.join(out, 'sea-prep.blob'), disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }),
)
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' })

// 3) Cópia do node.exe com o motor injetado
const exe = path.join(out, process.platform === 'win32' ? 'Motor WhatsApp XS.exe' : 'motor-xs')
fs.copyFileSync(process.execPath, exe)
if (process.platform === 'win32') stripSignature(exe)
// Ícone XS e nome do programa (antes de injetar o motor)
if (process.platform === 'win32') {
  const rcedit = path.join(root, 'node_modules', 'rcedit', 'bin', process.arch === 'x64' ? 'rcedit-x64.exe' : 'rcedit.exe')
  execFileSync(rcedit, [
    exe,
    '--set-icon', path.join(root, 'assets', 'icon.ico'),
    '--set-version-string', 'ProductName', 'Motor WhatsApp XS',
    '--set-version-string', 'FileDescription', 'Motor WhatsApp XS - XS Prospecção',
    '--set-version-string', 'LegalCopyright', 'XS Prospecção',
    '--set-version-string', 'CompanyName', 'XS Prospecção',
    '--set-version-string', 'OriginalFilename', 'Motor WhatsApp XS.exe',
    '--set-version-string', 'InternalName', 'Motor WhatsApp XS',
    '--set-file-version', version,
    '--set-product-version', version,
  ])
}
const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js')
execFileSync(
  process.execPath,
  [postject, exe, 'NODE_SEA_BLOB', path.join(out, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--overwrite'],
  { stdio: 'inherit' },
)

for (const f of ['motor.cjs', 'sea-prep.blob', 'sea-config.json']) fs.rmSync(path.join(out, f), { force: true })
const mb = (fs.statSync(exe).size / 1024 / 1024).toFixed(1)
console.log(`\n  Pronto: ${path.relative(process.cwd(), exe)} (${mb} MB) · versão ${version}`)

// 4) .zip para o botão "Baixar o Motor WhatsApp XS" do site (public/downloads → Vercel)
if (process.platform === 'win32') {
  const downloads = path.resolve(root, '..', 'public', 'downloads')
  fs.mkdirSync(downloads, { recursive: true })
  const zip = path.join(downloads, 'Motor-WhatsApp-XS.zip')
  const leia = path.join(out, 'LEIA-ME.txt')
  fs.writeFileSync(
    leia,
    [
      `Motor WhatsApp XS ${version} - XS Prospecção`,
      '',
      'O que é: o programa que mantém o seu WhatsApp conectado para os disparos, funis e mensagens agendadas da XS.',
      'Ele roda só no seu computador, só aceita conexões do próprio computador e do site da XS, e não envia seus dados para outros lugares.',
      '',
      'Como usar:',
      '1. Extraia o "Motor WhatsApp XS.exe" numa pasta fixa (ex.: Documentos).',
      '2. Dê dois cliques. Se o Windows mostrar "O Windows protegeu o computador", clique em "Mais informações" e depois em "Executar assim mesmo".',
      '   Esse aviso aparece em programas novos que ainda não têm assinatura digital paga; não é sinal de vírus.',
      '3. Deixe a janela preta aberta enquanto usa os disparos. Para fechar, feche a janela.',
      '',
      'Os dados do Motor (sessão do WhatsApp e campanhas) ficam na pasta "Motor XS - dados", ao lado do programa.',
      'Para remover tudo, apague o programa e essa pasta.',
    ].join('\r\n'),
  )
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${exe}','${leia}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force`], { stdio: 'inherit' })
  console.log(`  Download: public/downloads/Motor-WhatsApp-XS.zip (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB) — publique o site para atualizar.\n`)
}
