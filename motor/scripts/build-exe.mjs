// Gera "Motor XS.exe": o motor inteiro num executável só (Node SEA).
// Uso: npm run build:exe   →   motor/build/Motor XS.exe
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'build')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

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
const exe = path.join(out, process.platform === 'win32' ? 'Motor XS.exe' : 'motor-xs')
fs.copyFileSync(process.execPath, exe)
// Ícone XS e nome do programa (antes de injetar o motor)
if (process.platform === 'win32') {
  const rcedit = path.join(root, 'node_modules', 'rcedit', 'bin', process.arch === 'x64' ? 'rcedit-x64.exe' : 'rcedit.exe')
  execFileSync(rcedit, [
    exe,
    '--set-icon', path.join(root, 'assets', 'icon.ico'),
    '--set-version-string', 'ProductName', 'Motor XS',
    '--set-version-string', 'FileDescription', 'Motor XS - XS Prospecção',
    '--set-version-string', 'CompanyName', 'XS Prospecção',
    '--set-version-string', 'OriginalFilename', 'Motor XS.exe',
    '--set-version-string', 'InternalName', 'Motor XS',
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

// 4) .zip para o botão "Baixar o Motor XS" do site (public/downloads → Vercel)
if (process.platform === 'win32') {
  const downloads = path.resolve(root, '..', 'public', 'downloads')
  fs.mkdirSync(downloads, { recursive: true })
  const zip = path.join(downloads, 'Motor-XS-Windows.zip')
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${exe}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force`], { stdio: 'inherit' })
  console.log(`  Download: public/downloads/Motor-XS-Windows.zip (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB) — publique o site para atualizar.\n`)
}
