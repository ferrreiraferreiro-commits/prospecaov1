// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Check, ChevronDown, Copy, Download, FolderOpen, LoaderCircle, Puzzle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { detectarExtensao, EXTENSAO_LOJA_URL, EXTENSAO_VERSAO, EXTENSAO_ZIP, navegador } from '../lib/igPonte'
import { useApp } from '../store/useApp'
import { useInstagram } from '../store/useInstagram'
import { Button, InstagramIcon } from './ui'

/**
 * Instalador da extensão XS · Instagram: passo a passo com os nomes certos do navegador
 * de quem está usando. Fica verde sozinho quando a extensão aparece (ela avisa a aba da XS
 * assim que é instalada, sem precisar recarregar).
 */
export function InstalarExtensao() {
  const toast = useApp((s) => s.toast)
  const nav = navegador()
  const [baixou, setBaixou] = useState(false)
  const [copiou, setCopiou] = useState(false)

  // Procura a extensão a cada 2 s enquanto ela não aparece
  useEffect(() => {
    const id = setInterval(() => {
      void detectarExtensao(600).then((v) => {
        if (v) void useInstagram.getState().verificar()
      })
    }, 2000)
    return () => clearInterval(id)
  }, [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(nav.extensoes)
      setCopiou(true)
      setTimeout(() => setCopiou(false), 2500)
    } catch {
      toast(`Copie à mão: ${nav.extensoes}`, 'info')
    }
  }

  const loja = !!EXTENSAO_LOJA_URL

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30 ring-inset">
          <Puzzle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Instale a extensão XS · Instagram</h2>
          <p className="text-2xs text-fg-3">Uma vez só, leva 1 minuto. É ela que usa o Instagram logado no seu navegador para buscar.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-ink px-2 py-1 text-2xs text-fg-3">
          <LoaderCircle className="size-3 animate-spin text-blue-400" />
          Esperando a extensão…
        </span>
      </header>

      {!nav.suportado && (
        <p className="flex items-start gap-2 border-b border-line-soft bg-gold/[0.06] px-4 py-2.5 text-xs text-gold">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {nav.nome === 'celular'
            ? 'A busca no Instagram funciona só no computador. Abra a XS no Chrome do seu computador para instalar.'
            : `O ${nav.nome} não aceita a extensão. Abra a XS no Chrome, Edge, Opera ou Brave.`}
        </p>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_22rem]">
        <ol className="space-y-2">
          <Passo n={1} feito={baixou} titulo={loja ? 'Adicione a extensão' : 'Baixe a extensão'}>
            {loja ? (
              <a href={EXTENSAO_LOJA_URL} target="_blank" rel="noreferrer" onClick={() => setBaixou(true)} className={BOTAO}>
                <Puzzle className="size-4" /> Adicionar ao {nav.nome === 'Edge' ? 'Edge' : 'Chrome'}
              </a>
            ) : (
              <a href={EXTENSAO_ZIP} download="xs-instagram.zip" onClick={() => setBaixou(true)} className={BOTAO}>
                <Download className="size-4" /> Baixar a extensão
              </a>
            )}
            <span className="ml-2 text-2xs text-fg-4">
              {loja ? 'Abre a loja do Chrome: clique em "Usar no Chrome" e confirme.' : `xs-instagram.zip · v${EXTENSAO_VERSAO}`}
            </span>
          </Passo>

          {!loja && (
            <>
              <Passo n={2} titulo="Extraia o arquivo">
                Na pasta <b>Downloads</b>, clique com o botão direito em <Mono>xs-instagram.zip</Mono> → <b>Extrair tudo</b> → <b>Extrair</b>. Vai aparecer a pasta{' '}
                <Mono>xs-instagram</Mono>. Deixe ela guardada: se apagar a pasta, a extensão para de funcionar.
              </Passo>

              <Passo n={3} titulo={`Abra as extensões do ${nav.suportado ? nav.nome : 'Chrome'}`}>
                <div className="mt-1 flex max-w-sm items-center gap-1.5">
                  <span className="flex h-8 flex-1 items-center rounded-md border border-line bg-ink px-2.5 font-mono text-xs text-fg select-all">{nav.extensoes}</span>
                  <Button size="md" icon={copiou ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />} onClick={() => void copiar()}>
                    {copiou ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
                <span className="mt-1 block">
                  Abra uma aba nova, cole na barra de endereço e aperte <b>Enter</b> (o navegador não deixa abrir esse endereço por link). Lá, ligue a chave{' '}
                  <b>{nav.modoDev}</b>
                  {nav.nome === 'Edge' ? ' (no menu da esquerda)' : ' (no canto de cima, à direita)'}.
                </span>
              </Passo>

              <Passo n={4} titulo="Carregue a pasta">
                Clique em <b>{nav.carregar}</b>, escolha a pasta <Mono>xs-instagram</Mono> e clique em <b>Selecionar pasta</b>.
              </Passo>
            </>
          )}

          <Passo n={loja ? 2 : 5} titulo="Entre no Instagram e volte para cá">
            Entre numa conta do Instagram nesse mesmo navegador (de preferência uma conta só para buscar). Esta tela fica verde sozinha quando a extensão estiver ativa.
          </Passo>
        </ol>

        {!loja && <TelaDeExtensoes nav={nav} />}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-2.5 text-2xs text-fg-4">
        <span className="flex-1">Instalou e esta tela não mudou? Recarregue a página. Funciona no Chrome, Edge, Opera e Brave do computador.</span>
        <Button size="xs" variant="ghost" icon={<RefreshCw className="size-3" />} onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </footer>
    </section>
  )
}

const BOTAO = 'inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-[13px] font-semibold text-white hover:bg-[#3b7bf6]'

function Passo({ n, titulo, feito, children }: { n: number; titulo: string; feito?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border border-line-soft bg-ink/60 px-3 py-2.5">
      <span
        className={clsx(
          'num flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
          feito ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/15 text-blue-200',
        )}
      >
        {feito ? <Check className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 text-xs text-fg-2">
        <p className="mb-1 text-[13px] font-semibold text-fg">{titulo}</p>
        {children}
      </div>
    </li>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="rounded bg-tint/[0.06] px-1 font-mono text-[11px] text-fg">{children}</span>
}

/** Desenho da página de extensões, mostrando onde clicar. */
function TelaDeExtensoes({ nav }: { nav: ReturnType<typeof navegador> }) {
  return (
    <figure className="h-fit overflow-hidden rounded-lg border border-line bg-[#202124] text-[11px] text-[#e8eaed] shadow-lg select-none" aria-hidden>
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#2b2c30] px-2.5 py-1.5">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
        </span>
        <span className="flex-1 truncate rounded-full bg-[#202124] px-2.5 py-0.5 font-mono text-[10px] text-white/70">{nav.extensoes}</span>
      </div>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex-1 text-[13px] font-medium">Extensões</span>
        <span className="relative inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 ring-2 ring-blue-400">
          {nav.modoDev}
          <span className="relative h-3.5 w-6 rounded-full bg-[#8ab4f8]">
            <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-white" />
          </span>
          <Marca n={3} />
        </span>
      </div>
      <div className="flex gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="relative rounded-md px-2 py-1 font-medium text-[#8ab4f8] ring-2 ring-blue-400">
          {nav.carregar}
          <Marca n={4} />
        </span>
        <span className="rounded-md px-2 py-1 text-white/40">Compactar</span>
        <span className="rounded-md px-2 py-1 text-white/40">Atualizar</span>
      </div>
      <div className="p-3">
        <div className="relative rounded-lg border border-white/10 bg-[#292a2d] p-2.5 ring-2 ring-emerald-400/70">
          <div className="flex items-start gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-black text-[9px] font-black tracking-tight text-white">XS</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">XS Prospecção · Instagram</p>
              <p className="text-[10px] text-white/50">{EXTENSAO_VERSAO}</p>
            </div>
            <span className="relative mt-0.5 h-3.5 w-6 rounded-full bg-[#8ab4f8]">
              <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-white" />
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-white/50">
            <FolderOpen className="size-3" /> xs-instagram
          </p>
          <Marca n={5} verde />
        </div>
      </div>
    </figure>
  )
}

function Marca({ n, verde }: { n: number; verde?: boolean }) {
  return (
    <span
      className={clsx(
        'absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white',
        verde ? 'bg-emerald-500' : 'bg-blue-500',
      )}
    >
      {n}
    </span>
  )
}

const COMO_USAR_KEY = 'xs-prospeccao:ig:como-usar'

const COMO_USAR: { titulo: string; texto: string }[] = [
  {
    titulo: 'Use uma conta só para buscar',
    texto: 'Entre no Instagram, neste navegador, com uma conta separada (pode ser nova). A busca abre muitos perfis e o Instagram pode pedir pausa ou bloquear a conta.',
  },
  {
    titulo: 'Escolha como buscar',
    texto: 'Palavra-chave com a cidade é o jeito mais fácil (ex.: manicure · Londrina). Hashtag da cidade e seguidores de um perfil local trazem ainda mais gente.',
  },
  {
    titulo: 'Ajuste os filtros',
    texto: 'O padrão já traz negócio com telefone, sem site e que postou nos últimos 90 dias: quem mais precisa de um site.',
  },
  {
    titulo: 'Clique em Buscar no Instagram',
    texto: 'A XS abre uma aba do Instagram em segundo plano e lê um perfil por vez. Pode usar outras telas da XS; só não feche a aba da XS nem a do Instagram.',
  },
  {
    titulo: 'Se o Instagram pedir pausa',
    texto: 'A busca espera sozinha e continua. Se ele pedir login ou verificação, resolva na aba do Instagram e clique em Continuar.',
  },
  {
    titulo: 'Trabalhe os leads',
    texto: 'Os aprovados entram em Leads com o @, o WhatsApp e a bio. Lá embaixo você vê qual busca rende mais conversa e reunião.',
  },
]

/** Passo a passo de uso. Fica aberto até a pessoa esconder. */
export function ComoUsarInstagram() {
  const [aberto, setAberto] = useState(() => {
    try {
      return localStorage.getItem(COMO_USAR_KEY) !== 'fechado'
    } catch {
      return true
    }
  })
  function alternar() {
    setAberto(!aberto)
    try {
      localStorage.setItem(COMO_USAR_KEY, aberto ? 'fechado' : 'aberto')
    } catch {
      /* sem armazenamento */
    }
  }
  return (
    <section className="panel">
      <button onClick={alternar} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={aberto}>
        <InstagramIcon className="size-4 text-blue-300" />
        <span className="flex-1 text-[13px] font-semibold">Como usar a busca no Instagram</span>
        <span className="text-2xs text-fg-3">{aberto ? 'Esconder' : 'Ver o passo a passo'}</span>
        <ChevronDown className={clsx('size-3.5 text-fg-4 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <ol className="grid gap-2 border-t border-line-soft p-4 sm:grid-cols-2 xl:grid-cols-3">
          {COMO_USAR.map((p, i) => (
            <li key={p.titulo} className="flex gap-2.5 rounded-lg border border-line-soft bg-ink/60 px-3 py-2.5">
              <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-2xs font-semibold text-blue-200">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-fg">{p.titulo}</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-fg-3">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
