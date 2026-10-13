// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, Copy, Download, FileArchive, Folder, LoaderCircle, Pin, Puzzle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { detectarExtensao, EXTENSAO_LOJA_URL, EXTENSAO_VERSAO, EXTENSAO_ZIP, NAVEGADORES, navegador, type Navegador, type NavegadorId } from '../lib/igPonte'
import { useApp } from '../store/useApp'
import { useInstagram } from '../store/useInstagram'
import { Button, InstagramIcon, Segmented } from './ui'

/**
 * Instalação da extensão XS · Instagram. Sem loja, o navegador só aceita do jeito manual
 * (baixar, extrair e carregar a pasta), então o tutorial mostra cada clique, com os nomes
 * dos botões do navegador escolhido.
 */

/** Card que aparece enquanto a extensão não está instalada. Fica verde sozinho quando ela aparece. */
export function InstalarExtensao() {
  const nav = navegador()

  // Procura a extensão a cada 2 s (ela avisa a aba da XS assim que é instalada)
  useEffect(() => {
    const id = setInterval(() => {
      void detectarExtensao(600).then((v) => {
        if (v) void useInstagram.getState().verificar()
      })
    }, 2000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30 ring-inset">
          <Puzzle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Instale a extensão XS · Instagram</h2>
          <p className="text-2xs text-fg-3">Uma vez só, leva 2 minutos. É ela que usa o Instagram logado no seu navegador para buscar.</p>
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
            ? 'A busca no Instagram funciona só no computador. Abra a XS no Brave ou no Chrome do seu computador para instalar.'
            : `O ${nav.nome} não aceita a extensão. Abra a XS no Brave, Chrome, Edge ou Opera.`}
        </p>
      )}

      <div className="p-4">
        <TutorialInstalacao />
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-2.5 text-2xs text-fg-4">
        <span className="flex-1">Instalou e esta tela não mudou? Recarregue a página da XS.</span>
        <Button size="xs" variant="ghost" icon={<RefreshCw className="size-3" />} onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </footer>
    </section>
  )
}

const BOTAO = 'inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-[13px] font-semibold text-white hover:bg-[#3b7bf6]'

/** Passo a passo completo, com escolha do navegador. Usado no card de instalação e no "Como usar". */
export function TutorialInstalacao() {
  const toast = useApp((s) => s.toast)
  const detectado = navegador()
  const [id, setId] = useState<NavegadorId>(detectado.suportado ? detectado.id : 'brave')
  const nav: Navegador = { ...NAVEGADORES[id], suportado: true }
  const [baixou, setBaixou] = useState(false)
  const [copiou, setCopiou] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(nav.extensoes)
      setCopiou(true)
      setTimeout(() => setCopiou(false), 2500)
    } catch {
      toast(`Copie à mão: ${nav.extensoes}`, 'info')
    }
  }

  if (EXTENSAO_LOJA_URL)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a href={EXTENSAO_LOJA_URL} target="_blank" rel="noreferrer" className={BOTAO}>
          <Puzzle className="size-4" /> Adicionar ao navegador
        </a>
        <span className="text-xs text-fg-3">Abre a loja do Chrome: clique em "Usar no Chrome" e confirme. Depois entre no Instagram e volte para cá.</span>
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-2">Qual navegador você usa?</span>
        <Segmented
          value={id}
          onChange={setId}
          options={(['brave', 'chrome', 'edge', 'opera'] as const).map((n) => ({
            id: n,
            label: (
              <>
                {NAVEGADORES[n].nome}
                {detectado.suportado && detectado.id === n && <span className="ml-1 text-[10px] text-emerald-300">· este</span>}
              </>
            ),
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
        <ol className="space-y-2">
          <Passo n={1} feito={baixou} titulo="Baixe a extensão">
            <div className="flex flex-wrap items-center gap-2">
              <a href={EXTENSAO_ZIP} download="xs-instagram.zip" onClick={() => setBaixou(true)} className={BOTAO}>
                <Download className="size-4" /> Baixar a extensão
              </a>
              <span className="text-2xs text-fg-4">xs-instagram.zip · v{EXTENSAO_VERSAO}</span>
            </div>
            <span className="mt-1.5 block">
              O arquivo <Mono>xs-instagram.zip</Mono> vai para a sua pasta <b>Downloads</b>.
            </span>
          </Passo>

          <Passo n={2} titulo="Extraia o arquivo">
            Abra a pasta <b>Downloads</b> (aperte <Tecla>⊞ Windows</Tecla> + <Tecla>E</Tecla> e clique em Downloads). Clique com o <b>botão direito</b> em{' '}
            <Mono>xs-instagram.zip</Mono> → <b>Extrair tudo…</b> → <b>Extrair</b>.
            <span className="mt-1 block">
              Vai abrir a pasta <Mono>xs-instagram</Mono> com 7 arquivos (background, icone, instagram, manifest…).{' '}
              <b className="text-fg">Não precisa abrir nenhum desses arquivos</b>: quem usa eles é o navegador.
            </span>
            <Dica>Deixe essa pasta num lugar fixo (Documentos, por exemplo). Se apagar a pasta, a extensão para de funcionar.</Dica>
          </Passo>

          <Passo n={3} titulo={`Abra a página de extensões do ${nav.nome}`}>
            Abra uma aba nova, cole este endereço na barra de cima e aperte <Tecla>Enter</Tecla>:
            <div className="mt-1.5 flex max-w-sm items-center gap-1.5">
              <span className="flex h-8 flex-1 items-center rounded-md border border-line bg-ink px-2.5 font-mono text-xs text-fg select-all">{nav.extensoes}</span>
              <Button size="md" icon={copiou ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />} onClick={() => void copiar()}>
                {copiou ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <span className="mt-1.5 block text-2xs text-fg-4">
              Ou pelo menu: {nav.menu}. (O navegador não deixa um site abrir essa página por link, por isso é preciso colar.)
            </span>
          </Passo>

          <Passo n={4} titulo={`Ligue o "${nav.modoDev}"`}>
            É uma chave {nav.ondeModoDev} da página de extensões. Clique nela para ficar azul (ligada). Aparecem uns botões novos.
          </Passo>

          <Passo n={5} titulo={`Clique em "${nav.carregar}" e escolha a pasta`}>
            Abre uma janela para escolher uma pasta. Vá até a pasta <Mono>xs-instagram</Mono> que você extraiu, clique nela <b>uma vez</b> e depois em{' '}
            <b>Selecionar pasta</b>.
            <Dica>
              É para escolher a <b>pasta</b>, não um arquivo. Se você entrou na pasta e está vendo os arquivos dentro dela, pode clicar em <b>Selecionar pasta</b> assim mesmo.
            </Dica>
          </Passo>

          <Passo n={6} titulo="Confira e deixe o ícone à mostra">
            A <b>XS Prospecção · Instagram</b> aparece na lista com a chave azul ligada. Para ver o ícone da XS ao lado da barra de endereço, clique no{' '}
            <Puzzle className="inline size-3.5 align-[-2px]" /> (quebra-cabeça) e no <Pin className="inline size-3.5 align-[-2px]" /> (alfinete) ao lado da XS.
          </Passo>

          <Passo n={7} titulo="Entre no Instagram e volte para a XS">
            Abra <Mono>instagram.com</Mono> nesse mesmo navegador e entre na conta que vai usar para buscar (de preferência uma conta só para isso). Volte para a tela{' '}
            <b>Instagram</b> da XS: ela mostra a extensão em verde e o @ da conta.
          </Passo>
        </ol>

        <div className="space-y-3 lg:sticky lg:top-4 lg:h-fit">
          <JanelaDePasta />
          <TelaDeExtensoes nav={nav} />
        </div>
      </div>

      <Problemas nav={nav} />
    </div>
  )
}

function Problemas({ nav }: { nav: Navegador }) {
  const itens: [string, ReactNode][] = [
    [
      'Apareceu "Arquivo de manifesto ausente" (Manifest file is missing)',
      <>
        Você escolheu a pasta errada. Clique em <b>{nav.carregar}</b> de novo e escolha a pasta onde está o arquivo <Mono>manifest</Mono> (a que tem os 7 arquivos).
      </>,
    ],
    ['Não aparece o botão para carregar', <>O {nav.modoDev} está desligado. Ligue a chave ({nav.ondeModoDev}) e o botão aparece.</>],
    ['Instalei e a XS continua pedindo a extensão', <>Recarregue a página da XS (tecla F5). Confira também se a chave da extensão está azul na página de extensões.</>],
    ['Apareceu um aviso sobre extensões no modo de desenvolvedor', <>É normal para extensões instaladas fora da loja. Pode fechar o aviso, a extensão continua funcionando.</>],
    [
      'Como atualizo quando sair uma versão nova?',
      <>
        Baixe de novo, extraia por cima da mesma pasta (substituindo os arquivos) e, na página de extensões, clique no <RefreshCw className="inline size-3 align-[-1px]" />{' '}
        (recarregar) da XS. A XS avisa quando tiver versão nova.
      </>,
    ],
  ]
  return (
    <div className="rounded-lg border border-line-soft">
      <p className="border-b border-line-soft px-3 py-2 text-xs font-semibold text-fg">Deu algum problema?</p>
      <div className="divide-y divide-line-soft">
        {itens.map(([q, r]) => (
          <details key={q} className="group px-3 py-2 text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-fg-2 hover:text-fg">
              <ChevronRight className="size-3.5 shrink-0 text-fg-4 transition-transform group-open:rotate-90" />
              {q}
            </summary>
            <p className="mt-1.5 pl-5 text-fg-3">{r}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

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
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-fg-2">
        <p className="mb-1 text-[13px] font-semibold text-fg">{titulo}</p>
        {children}
      </div>
    </li>
  )
}

function Dica({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 block rounded-md border border-gold/20 bg-gold/[0.05] px-2 py-1 text-2xs text-fg-3">💡 {children}</span>
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="rounded bg-tint/[0.06] px-1 font-mono text-[11px] text-fg">{children}</span>
}

function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-raised px-1 font-sans text-[10.5px] text-fg">{children}</kbd>
}

/** Desenho da janela do Windows para escolher a pasta (passo 5). */
function JanelaDePasta() {
  const arquivos = ['background', 'icone', 'instagram', 'manifest', 'ponte-xs', 'popup', 'popup']
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-[#202020] text-[11px] text-[#e8eaed] shadow-lg select-none" aria-hidden>
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#2b2b2b] px-2.5 py-1.5">
        <span className="flex-1 text-[10px] text-white/70">Selecionar a pasta da extensão</span>
        <span className="text-white/40">✕</span>
      </div>
      <div className="flex items-center gap-1 border-b border-white/10 px-2.5 py-1 text-[10px] text-white/60">
        Este Computador <ChevronRight className="size-2.5" /> Downloads
      </div>
      <div className="space-y-0.5 p-2">
        <div className="relative flex items-center gap-1.5 rounded bg-[#0b57d0]/40 px-1.5 py-1 ring-2 ring-blue-400">
          <Folder className="size-3.5 fill-[#e8b84a] text-[#e8b84a]" />
          xs-instagram
          <span className="ml-auto text-[9px] text-white/60">← esta pasta</span>
          <Marca n={5} />
        </div>
        <div className="flex items-center gap-1.5 px-1.5 py-1 text-white/40">
          <FileArchive className="size-3.5" />
          xs-instagram.zip
        </div>
        <div className="ml-5 border-l border-white/10 pl-2 text-[10px] leading-4 text-white/35">
          {arquivos.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-white/10 px-2.5 py-1.5">
        <span className="rounded bg-[#0b57d0] px-2 py-0.5 text-[10px] font-medium text-white ring-2 ring-blue-300">Selecionar pasta</span>
        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/70">Cancelar</span>
      </div>
    </figure>
  )
}

/** Desenho da página de extensões, mostrando onde clicar (passos 4, 5 e 6). */
function TelaDeExtensoes({ nav }: { nav: Navegador }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-[#202124] text-[11px] text-[#e8eaed] shadow-lg select-none" aria-hidden>
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#2b2c30] px-2.5 py-1.5">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
        </span>
        <span className="flex-1 truncate rounded-full bg-[#202124] px-2.5 py-0.5 font-mono text-[10px] text-white/70">{nav.extensoes}</span>
        <Puzzle className="size-3 text-white/50" />
      </div>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex-1 text-[13px] font-medium">Extensões</span>
        <span className="relative inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 ring-2 ring-blue-400">
          {nav.modoDev}
          <span className="relative h-3.5 w-6 rounded-full bg-[#8ab4f8]">
            <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-white" />
          </span>
          <Marca n={4} />
        </span>
      </div>
      <div className="flex gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="relative rounded-md px-2 py-1 font-medium text-[#8ab4f8] ring-2 ring-blue-400">
          {nav.carregar}
          <Marca n={5} />
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
          <Marca n={6} verde />
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

const COMO_BUSCAR: { titulo: string; texto: string }[] = [
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

/** Passo a passo de uso: como buscar e como instalar a extensão. Fica aberto até a pessoa esconder. */
export function ComoUsarInstagram() {
  const instalada = useInstagram((s) => !!s.extensao.versao)
  const [aba, setAba] = useState<'buscar' | 'instalar'>('buscar')
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
        <div className="space-y-3 border-t border-line-soft p-4">
          <Segmented
            value={aba}
            onChange={setAba}
            options={[
              { id: 'buscar', label: 'Como buscar leads' },
              { id: 'instalar', label: instalada ? 'Como instalar a extensão (outro computador)' : 'Como instalar a extensão' },
            ]}
          />
          {aba === 'instalar' ? (
            <TutorialInstalacao />
          ) : (
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {COMO_BUSCAR.map((p, i) => (
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
        </div>
      )}
    </section>
  )
}
