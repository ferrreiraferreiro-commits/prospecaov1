/**
 * Mantém o Windows acordado (sem suspender por inatividade) enquanto houver
 * agendamento pendente ou campanha enviando. A tela pode apagar normalmente.
 * Não impede suspender pelo menu, fechar a tampa do notebook ou desligar.
 */
import { spawn, type ChildProcess } from 'node:child_process'

const reasons = new Set<string>()
let proc: ChildProcess | null = null

// ES_CONTINUOUS | ES_SYSTEM_REQUIRED, renovado a cada 50 s por um PowerShell oculto
const SCRIPT =
  "$s='[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);';" +
  '$t=Add-Type -MemberDefinition $s -Name XsAwake -Namespace Xs -PassThru;' +
  'while($true){ [void]$t::SetThreadExecutionState([uint32]2147483649); Start-Sleep -Seconds 50 }'

export function setKeepAwake(reason: string, on: boolean) {
  if (on) reasons.add(reason)
  else reasons.delete(reason)
  if (process.platform !== 'win32') return
  if (reasons.size && !proc) {
    proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', SCRIPT], { stdio: 'ignore', windowsHide: true })
    proc.on('exit', () => {
      proc = null
    })
    proc.on('error', () => {
      proc = null
    })
  } else if (!reasons.size && proc) {
    proc.kill()
    proc = null
  }
}

export function keepAwakeActive(): boolean {
  return proc !== null
}

process.on('exit', () => proc?.kill())
