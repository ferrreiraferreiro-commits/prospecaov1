// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
// Junta o Motor (motor/src) num arquivo só para rodar na VPS com `node motor.cjs`: mesmas opções do
// Motor WhatsApp XS.exe (motor/scripts/build-exe.mjs), sem o executável. Gasta menos memória que o tsx,
// o que importa com um Motor por conta.
// Uso: node whatsapp-cloud/empacotar-motor.mjs <pasta do motor com node_modules>
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const motor = path.resolve(process.argv[2] ?? 'motor')
const { build } = createRequire(path.join(motor, 'package.json'))('esbuild')
const version = JSON.parse(fs.readFileSync(path.join(motor, 'package.json'), 'utf8')).version

await build({
  entryPoints: [path.join(motor, 'src/server.ts')],
  outfile: path.join(motor, 'motor.cjs'),
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
console.log(`motor.cjs pronto (versão ${version})`)
