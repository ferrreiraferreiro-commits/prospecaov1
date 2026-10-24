// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { CircleHelp, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

const lido = (id: string) => {
  try {
    return localStorage.getItem(`xs:ajuda:${id}`) === '1'
  } catch {
    return false
  }
}

/**
 * "Como funciona": explica a aba em poucos passos. Some quando você fecha (e volta pelo "?").
 */
export function ComoFunciona({ id, titulo, passos, children }: { id: string; titulo: string; passos: ReactNode[]; children?: ReactNode }) {
  const [aberto, setAberto] = useState(() => !lido(id))
  const fechar = () => {
    setAberto(false)
    try {
      localStorage.setItem(`xs:ajuda:${id}`, '1')
    } catch {
      /* sem armazenamento */
    }
  }
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 text-2xs text-fg-4 hover:text-fg-2">
        <CircleHelp className="size-3.5" /> Como funciona
      </button>
    )
  return (
    <div className="panel relative border-blue-500/20 bg-blue-500/[0.04] px-4 py-3">
      <button type="button" onClick={fechar} className="absolute top-2.5 right-2.5 rounded p-1 text-fg-4 hover:bg-hover hover:text-fg" aria-label="Fechar ajuda">
        <X className="size-3.5" />
      </button>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-200">
        <CircleHelp className="size-3.5" /> {titulo}
      </p>
      <ol className="mt-2 space-y-1.5 pr-6">
        {passos.map((p, i) => (
          <li key={i} className="flex gap-2.5 text-xs leading-5 text-fg-2">
            <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-blue-500/15 text-[10px] font-semibold text-blue-200">{i + 1}</span>
            <span className="min-w-0">{p}</span>
          </li>
        ))}
      </ol>
      {children}
    </div>
  )
}

/** Selo pequeno de risco/estado, no padrão da XS. */
export function Selo({ tom = 'neutro', children }: { tom?: 'neutro' | 'azul' | 'verde' | 'ouro' | 'vermelho'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold whitespace-nowrap ring-1 ring-inset',
        tom === 'neutro' && 'bg-tint/[0.04] text-fg-3 ring-line',
        tom === 'azul' && 'bg-blue-500/10 text-blue-300 ring-blue-500/25',
        tom === 'verde' && 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
        tom === 'ouro' && 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
        tom === 'vermelho' && 'bg-red-500/10 text-red-300 ring-red-500/25',
      )}
    >
      {children}
    </span>
  )
}
