// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Check, CircleStop, Download, Globe, Hash, ListPlus, LoaderCircle, Pause, Play, Plus, RefreshCw, Search, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/kit'
import { ComoUsarInstagram, InstalarExtensao } from '../components/ExtensaoInstagram'
import { PageHeader } from '../components/PageHeader'
import { Button, InstagramIcon, Progress, WhatsAppIcon } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { abrirInstagram, EXTENSAO_VERSAO, EXTENSAO_ZIP, versaoAntiga } from '../lib/igPonte'
import {
  buscaDoLead,
  FILTROS_PADRAO,
  FONTE_LABEL,
  lerLista,
  MOTIVO_LABEL,
  VELOCIDADE_LABEL,
  type IgFiltros,
  type IgFonte,
  type Motivo,
  type Velocidade,
} from '../lib/instagram'
import { formatElapsed, type Mode } from '../lib/mapsSearch'
import { useApp } from '../store/useApp'
import { useInstagram, type IgBuscaInput, type IgFase } from '../store/useInstagram'

const FORM_KEY = 'xs-prospeccao:ig:form'

interface Form {
  fonte: IgFonte
  termos: Record<Exclude<IgFonte, 'lista'>, string[]>
  lista: string
  cidade: string
  nicho: string
  meta: number
  filtros: IgFiltros
  velocidade: Velocidade
  hashtags: boolean
  reler: boolean
}

const DEFAULT_FORM: Form = {
  fonte: 'palavra',
  termos: { palavra: [], hashtag: [], seguidores: [] },
  lista: '',
  cidade: '',
  nicho: '',
  meta: 50,
  filtros: FILTROS_PADRAO,
  velocidade: 'normal',
  hashtags: true,
  reler: false,
}

function loadForm(): Form {
  try {
    const s = JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}') as Partial<Form>
    return { ...DEFAULT_FORM, ...s, termos: { ...DEFAULT_FORM.termos, ...s.termos }, filtros: { ...FILTROS_PADRAO, ...s.filtros } }
  } catch {
    return DEFAULT_FORM
  }
}

const FONTES: { id: IgFonte; hint: string; icon: ReactNode }[] = [
  { id: 'palavra', hint: 'Perfis e posts do assunto', icon: <Search className="size-3.5" /> },
  { id: 'hashtag', hint: 'Quem posta na hashtag', icon: <Hash className="size-3.5" /> },
  { id: 'seguidores', hint: 'Quem segue um perfil', icon: <UsersRound className="size-3.5" /> },
  { id: 'lista', hint: 'Cole os @ que já tem', icon: <ListPlus className="size-3.5" /> },
]

const PLACEHOLDER: Record<Exclude<IgFonte, 'lista'>, string> = {
  palavra: 'Ex.: manicure, nail designer',
  hashtag: 'Ex.: #confeitarialondrina',
  seguidores: 'Ex.: @guiadacidade',
}

const DICA: Record<IgFonte, string> = {
  palavra: 'Acha contas com o nome parecido e quem posta sobre o assunto. Com a cidade, o Instagram já prioriza quem é dela.',
  hashtag: 'Hashtags da cidade rendem mais: #manicurelondrina, #docesdelondrina.',
  seguidores: 'Use perfis da sua cidade que negócios seguem: guias, jornais, feiras, associações comerciais, fornecedores.',
  lista: 'Um por linha: @perfil ou o link do perfil.',
}

const FASE_LABEL: Record<IgFase, string> = {
  buscando: 'Buscando',
  pausada: 'Pausada',
  esperando: 'Pausa pedida pelo Instagram',
  concluida: 'Concluída',
  parada: 'Parada',
  erro: 'Erro',
}

const CONVERSA = new Set(['falei_responsavel', 'pediu_whatsapp', 'follow_up', 'cliente_potencial', 'agendou_reuniao'])

function haQuanto(iso: string | null): string {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (d < 1) return 'hoje'
  if (d < 30) return `há ${d} d`
  if (d < 365) return `há ${Math.floor(d / 30)} m`
  return 'há +1 ano'
}

const milhar = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.', ',')} mil` : n.toLocaleString('pt-BR'))

export function InstagramPage() {
  const toast = useApp((s) => s.toast)
  const estado = useInstagram((s) => s.estado)
  const extensao = useInstagram((s) => s.extensao)
  const [form, setForm] = useState<Form>(loadForm)
  const [termoInput, setTermoInput] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    void useInstagram.getState().verificar()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(form))
    } catch {
      /* sem armazenamento */
    }
  }, [form])

  const rodando = !!estado && ['buscando', 'pausada', 'esperando'].includes(estado.fase)
  useEffect(() => {
    if (!rodando) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [rodando])

  const fonte = form.fonte
  const termos = fonte === 'lista' ? lerLista(form.lista) : form.termos[fonte]
  const setFiltros = (p: Partial<IgFiltros>) => setForm({ ...form, filtros: { ...form.filtros, ...p } })

  function addTermo(texto: string) {
    if (fonte === 'lista') return
    const novos = texto
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (!novos.length) return
    const atuais = form.termos[fonte]
    const juntos = [...atuais, ...novos.filter((n) => !atuais.some((a) => a.toLowerCase() === n.toLowerCase()))]
    setForm({ ...form, termos: { ...form.termos, [fonte]: juntos } })
    setTermoInput('')
  }
  function tirarTermo(t: string) {
    if (fonte === 'lista') return
    setForm({ ...form, termos: { ...form.termos, [fonte]: form.termos[fonte].filter((x) => x !== t) } })
  }

  function comecar() {
    // Termo digitado e não confirmado com Enter também vale
    const pendente = fonte !== 'lista' && termoInput.trim() ? termoInput.split(',').map((t) => t.trim()).filter(Boolean) : []
    const lista = [...termos, ...pendente.filter((p) => !termos.includes(p))]
    if (pendente.length) addTermo(termoInput)
    if (!lista.length) return toast(fonte === 'lista' ? 'Cole pelo menos um perfil.' : 'Digite pelo menos uma busca.', 'error')
    const input: IgBuscaInput = {
      fonte,
      termos: lista,
      cidade: form.cidade.trim(),
      nicho: form.nicho.trim(),
      meta: form.meta,
      filtros: form.filtros,
      velocidade: form.velocidade,
      hashtags: form.hashtags,
      reler: form.reler,
    }
    void useInstagram.getState().buscar(input)
  }

  const resultados = useMemo(() => (estado ? [...estado.aprovados].reverse() : []), [estado])
  const tempo = estado ? (estado.fim ? Date.parse(estado.fim) : Date.now()) - Date.parse(estado.inicio) : 0
  const esperaSeg = estado?.esperaAte ? Math.max(0, Math.round((estado.esperaAte - Date.now()) / 1000)) : 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Instagram"
        subtitle="Ache negócios que só existem no Instagram (sem Google, sem site) e mande direto para os seus leads, com telefone, WhatsApp e bio."
      />

      <Conexao />
      <AvisoAtualizar />
      <ComoUsarInstagram />

      <div className="grid gap-3 xl:grid-cols-[23rem_1fr]">
        {/* Formulário */}
        <section className="panel h-fit divide-y divide-line-soft">
          <div className="space-y-2.5 p-4">
            <p className="label">Como buscar</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink p-0.5">
              {FONTES.map((f) => (
                <button
                  key={f.id}
                  disabled={rodando}
                  onClick={() => setForm({ ...form, fonte: f.id })}
                  className={clsx(
                    'rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-60',
                    fonte === f.id ? 'bg-raised ring-1 ring-line-strong ring-inset' : 'hover:bg-hover',
                  )}
                >
                  <span className={clsx('flex items-center gap-1.5 text-xs font-semibold', fonte === f.id ? 'text-fg' : 'text-fg-2')}>
                    {f.icon}
                    {f.id === 'seguidores' ? 'Seguidores' : FONTE_LABEL[f.id]}
                  </span>
                  <span className="block text-2xs text-fg-4">{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 p-4">
            <p className="label">
              {fonte === 'palavra' ? 'Palavras-chave' : fonte === 'hashtag' ? 'Hashtags' : fonte === 'seguidores' ? 'Perfis' : 'Perfis'}
              {termos.length > 0 && <span className="text-blue-300"> · {termos.length}</span>}
            </p>
            {fonte === 'lista' ? (
              <textarea
                className="input min-h-28 py-2 font-mono text-xs"
                value={form.lista}
                disabled={rodando}
                onChange={(e) => setForm({ ...form, lista: e.target.value })}
                placeholder={'@studioana.nails\ninstagram.com/docesdamaria'}
              />
            ) : (
              <>
                {termos.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {termos.map((t) => (
                      <Tag key={t} onRemove={rodando ? undefined : () => tirarTermo(t)}>
                        {t}
                      </Tag>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input
                    className="input"
                    value={termoInput}
                    disabled={rodando}
                    onChange={(e) => setTermoInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTermo(termoInput))}
                    placeholder={PLACEHOLDER[fonte]}
                  />
                  <Button onClick={() => addTermo(termoInput)} disabled={rodando || !termoInput.trim()} icon={<Plus className="size-3.5" />} aria-label="Adicionar" />
                </div>
              </>
            )}
            <p className="text-2xs text-fg-4">{DICA[fonte]}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-4">
            <label className="block">
              <span className="label">
                Cidade <span className="font-normal text-fg-4">(opcional)</span>
              </span>
              <input className="input" value={form.cidade} disabled={rodando} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Ex.: Londrina" />
            </label>
            <label className="block">
              <span className="label">
                Nicho nos leads <span className="font-normal text-fg-4">(opcional)</span>
              </span>
              <input className="input" value={form.nicho} disabled={rodando} onChange={(e) => setForm({ ...form, nicho: e.target.value })} placeholder="Categoria do perfil" />
            </label>
          </div>

          <div className="space-y-2 p-4">
            <p className="label">Quantos leads</p>
            <div className="flex items-center gap-1">
              {[20, 50, 100, 200].map((n) => (
                <ChipButton key={n} active={form.meta === n} disabled={rodando} onClick={() => setForm({ ...form, meta: n })} className="num h-7 px-2.5 text-xs">
                  {n}
                </ChipButton>
              ))}
              <input
                type="number"
                min={1}
                max={1000}
                disabled={rodando}
                className="input num h-7 w-20"
                value={form.meta}
                onChange={(e) => setForm({ ...form, meta: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })}
                aria-label="Quantidade personalizada"
              />
            </div>
          </div>

          <div className={clsx('space-y-2.5 p-4', rodando && 'pointer-events-none opacity-60')}>
            <p className="label">Filtros</p>
            <Check2 checked={form.filtros.comercial} onChange={(v) => setFiltros({ comercial: v })} label="Só contas comerciais" hint="Perfis de negócio ou criador (pessoa física fica de fora)." />
            <Check2 checked={form.filtros.contato} onChange={(v) => setFiltros({ contato: v })} label="Precisa ter telefone ou WhatsApp" hint="Do botão de contato, do link de WhatsApp ou escrito na bio." />
            <Tri label="Site" icon={<Globe className="size-3.5" />} value={form.filtros.site} onChange={(v) => setFiltros({ site: v })} />
            <p className="text-2xs text-fg-4">"Sem site" acha quem mais precisa de um. Linktree e WhatsApp não contam como site.</p>
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs text-fg-2">Postou em</span>
              <select className="input h-7 flex-1 text-xs" value={form.filtros.ativoDias} onChange={(e) => setFiltros({ ativoDias: Number(e.target.value) })}>
                <option value={0}>Tanto faz</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={60}>Últimos 60 dias</option>
                <option value={90}>Últimos 90 dias</option>
                <option value={180}>Últimos 6 meses</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs text-fg-2">Seguidores</span>
              <input
                type="number"
                min={0}
                className="input num h-7 flex-1 text-xs"
                value={form.filtros.seguidoresMin || ''}
                placeholder="mín."
                onChange={(e) => setFiltros({ seguidoresMin: Math.max(0, Number(e.target.value) || 0) })}
                aria-label="Mínimo de seguidores"
              />
              <span className="text-2xs text-fg-4">a</span>
              <input
                type="number"
                min={0}
                className="input num h-7 flex-1 text-xs"
                value={form.filtros.seguidoresMax || ''}
                placeholder="sem máx."
                onChange={(e) => setFiltros({ seguidoresMax: Math.max(0, Number(e.target.value) || 0) })}
                aria-label="Máximo de seguidores"
              />
            </div>
            <Check2
              checked={form.filtros.soCidade}
              onChange={(v) => setFiltros({ soCidade: v })}
              disabled={!form.cidade.trim()}
              label="Só quem cita a cidade"
              hint={form.cidade.trim() ? 'No endereço, na bio ou no nome do perfil.' : 'Preencha a cidade para usar.'}
            />
          </div>

          <div className={clsx('space-y-2.5 p-4', rodando && 'pointer-events-none opacity-60')}>
            <p className="label">Velocidade</p>
            <div className="grid grid-cols-3 gap-0.5 rounded-md border border-line bg-ink p-0.5">
              {(Object.keys(VELOCIDADE_LABEL) as Velocidade[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setForm({ ...form, velocidade: v })}
                  aria-pressed={form.velocidade === v}
                  className={clsx('rounded px-1 py-1 text-center transition-colors', form.velocidade === v ? 'bg-raised ring-1 ring-line-strong ring-inset' : 'hover:bg-hover')}
                >
                  <span className={clsx('block text-2xs font-semibold', form.velocidade === v ? 'text-fg' : 'text-fg-3')}>{VELOCIDADE_LABEL[v].label}</span>
                  <span className="block text-[10px] text-fg-4">{VELOCIDADE_LABEL[v].hint}</span>
                </button>
              ))}
            </div>
            <p className="text-2xs text-fg-4">Quanto mais rápido, mais cedo o Instagram pede pausa. Quando pede, a XS espera e continua sozinha.</p>
            {fonte === 'palavra' && <Check2 checked={form.hashtags} onChange={(v) => setForm({ ...form, hashtags: v })} label="Varrer também as hashtags sugeridas" />}
            <Check2
              checked={!form.reler}
              onChange={(v) => setForm({ ...form, reler: !v })}
              label="Pular perfis já abertos antes"
              hint="Não gasta consulta com quem já foi descartado nos últimos 60 dias."
            />
          </div>

          <div className="space-y-1.5 p-4">
            {rodando ? (
              <div className="grid grid-cols-2 gap-1.5">
                {estado!.fase === 'buscando' ? (
                  <Button size="lg" icon={<Pause className="size-4" />} onClick={() => useInstagram.getState().pausar()}>
                    Pausar
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" icon={<Play className="size-4" />} onClick={() => useInstagram.getState().continuar()}>
                    Continuar
                  </Button>
                )}
                <Button variant="danger" size="lg" icon={<CircleStop className="size-4" />} onClick={() => useInstagram.getState().parar()}>
                  Parar
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full" icon={<InstagramIcon className="size-4" />} disabled={!extensao.versao} onClick={comecar}>
                Buscar no Instagram
              </Button>
            )}
            {!extensao.versao && !extensao.verificando && <p className="text-center text-2xs text-fg-4">Instale a extensão acima para buscar.</p>}
          </div>
        </section>

        {/* Andamento + resultados */}
        <div className="min-w-0 space-y-3">
          {estado ? (
            <Card
              title={
                <span className="flex items-center gap-2">
                  {estado.fase === 'buscando' && <LoaderCircle className="size-3.5 animate-spin text-blue-400" />}
                  {FASE_LABEL[estado.fase]}
                  {estado.termoAtual && rodando && <span className="font-normal text-fg-3">· {estado.termoAtual}</span>}
                  {estado.modo === 'pagina' && (
                    <span className="rounded bg-blue-500/10 px-1.5 text-2xs leading-5 font-medium text-blue-300" title="O Instagram barrou a leitura rápida: a XS abre cada perfil pela página, como uma pessoa.">
                      lendo pela página
                    </span>
                  )}
                </span>
              }
              description={`${FONTE_LABEL[estado.input.fonte]} · ${estado.input.termos.slice(0, 4).join(', ')}${estado.input.termos.length > 4 ? '…' : ''}${estado.input.cidade ? ` · ${estado.input.cidade}` : ''} · meta ${estado.input.meta}`}
              actions={
                <button onClick={() => setShowLogs((s) => !s)} className="text-2xs font-medium text-fg-3 hover:text-fg">
                  {showLogs ? 'Esconder registro' : 'Ver registro'}
                </button>
              }
            >
              <Progress value={estado.aprovados.length} max={estado.input.meta} tone={estado.fase === 'erro' ? 'gold' : 'accent'} className="h-1.5" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className={clsx('flex-1 text-xs', estado.fase === 'erro' ? 'text-red-300' : estado.fase === 'esperando' || estado.fase === 'pausada' ? 'text-gold' : 'text-fg-2')}>
                  {estado.fase === 'esperando' && esperaSeg ? `O Instagram pediu uma pausa. Continua sozinho em ${formatElapsed(esperaSeg * 1000)}.` : (estado.erro ?? estado.mensagem)}
                </p>
                {estado.fase === 'esperando' && (
                  <Button size="xs" onClick={() => useInstagram.getState().continuar()}>
                    Tentar agora
                  </Button>
                )}
                {estado.fase === 'pausada' && (
                  <Button size="xs" icon={<InstagramIcon className="size-3" />} onClick={() => void abrirInstagram()}>
                    Abrir o Instagram
                  </Button>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Metric label="Achados" value={estado.achados} />
                <Metric label="Abertos" value={estado.lidos} />
                <Metric label="Aprovados" value={estado.aprovados.length} tone="text-emerald-300" />
                <Metric label="Nos leads" value={estado.salvos} tone="text-blue-300" />
                <Metric label="Já vistos" value={estado.pulados} />
                <Metric label="Tempo" value={formatElapsed(tempo)} />
              </dl>
              {Object.keys(estado.descartes).length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  <span className="text-2xs text-fg-4">Descartados:</span>
                  {(Object.entries(estado.descartes) as [Motivo, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, n]) => (
                      <span key={m} className="rounded bg-tint/[0.05] px-1.5 text-2xs leading-5 text-fg-3">
                        {MOTIVO_LABEL[m]} <span className="num text-fg-2">{n}</span>
                      </span>
                    ))}
                </div>
              )}
              {showLogs && (
                <pre className="mt-3 max-h-56 overflow-y-auto rounded-md border border-line-soft bg-ink p-2.5 font-mono text-[10.5px] leading-4 whitespace-pre-wrap text-fg-3">
                  {estado.logs.slice().reverse().join('\n') || 'Sem registros.'}
                </pre>
              )}
            </Card>
          ) : (
            <div className="panel flex items-center gap-3 px-4 py-3 text-xs text-fg-3">
              <InstagramIcon className="size-4 shrink-0 text-blue-400" />
              Escolha como buscar ao lado. A XS abre um perfil por vez na sua conta do Instagram, aplica os filtros e manda os aprovados direto para os seus leads.
            </div>
          )}

          {resultados.length > 0 && (
            <section className="panel">
              <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-semibold">{resultados.length} perfil(is) aprovados</h2>
                  <p className="text-2xs text-fg-3">
                    {resultados.filter((r) => r.whatsapp).length} com WhatsApp · {resultados.filter((r) => !r.site).length} sem site
                  </p>
                </div>
                {estado!.salvos > 0 && (
                  <Link to="/leads" className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:underline">
                    <Check className="size-3.5" /> {estado!.salvos} nos seus leads
                  </Link>
                )}
                {!rodando && resultados.some((r) => !r.salvo) && (
                  <Button variant="primary" size="sm" icon={<Download className="size-3.5" />} onClick={() => void useInstagram.getState().salvar()}>
                    Salvar nos leads
                  </Button>
                )}
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                      <th className="py-2 pl-4 font-medium">Perfil</th>
                      <th className="px-2 py-2 font-medium">Contato</th>
                      <th className="px-2 py-2 font-medium">Site</th>
                      <th className="px-2 py-2 text-right font-medium">Seguidores</th>
                      <th className="px-2 py-2 font-medium">Último post</th>
                      <th className="px-4 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {resultados.map((r) => (
                      <tr key={r.usuario} className="align-top">
                        <td className="max-w-[18rem] py-2.5 pr-2 pl-4">
                          <a href={`https://instagram.com/${r.usuario}`} target="_blank" rel="noreferrer" className="pv font-medium text-fg hover:text-blue-300">
                            {r.nome || `@${r.usuario}`}
                          </a>
                          <p className="truncate text-2xs text-fg-3">
                            <span className="pv">@{r.usuario}</span>
                            {r.categoria ? ` · ${r.categoria}` : ''}
                            {r.cidade ? ` · ${r.cidade}` : ''}
                          </p>
                          {r.bio && <p className="pv mt-0.5 line-clamp-2 text-2xs text-fg-4">{r.bio}</p>}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.telefone ? (
                            <span className="num inline-flex items-center gap-1.5 whitespace-nowrap text-fg">
                              <span className="pv">{formatPhone(r.telefone)}</span>
                              {r.whatsapp && <WhatsAppIcon className="size-3.5 text-emerald-300" aria-label="WhatsApp" />}
                            </span>
                          ) : (
                            <span className="text-fg-4">Sem telefone</span>
                          )}
                          {r.email && <p className="pv truncate text-2xs text-fg-4">{r.email}</p>}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.site ? (
                            <a href={r.site} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200" aria-label="Abrir o site">
                              <Globe className="size-4" />
                            </a>
                          ) : (
                            <span className="rounded bg-emerald-500/10 px-1.5 text-2xs leading-5 font-medium text-emerald-300">sem site</span>
                          )}
                        </td>
                        <td className="num px-2 py-2.5 text-right text-fg-2">{milhar(r.seguidores)}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-fg-3">{haQuanto(r.ultimoPost)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {r.salvo ? <Check className="ml-auto size-3.5 text-emerald-300" aria-label="Nos leads" /> : <span className="text-2xs text-fg-4">na fila</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>

      <Acompanhamento />
    </div>
  )
}

/** Extensão instalada? Instagram logado? Números de hoje. */
function Conexao() {
  const { versao, conta, verificando, erro } = useInstagram((s) => s.extensao)
  const hoje = useInstagram((s) => s.hoje)

  if (!versao) {
    if (verificando)
      return (
        <section className="panel flex items-center gap-2 px-4 py-3 text-xs text-fg-3">
          <LoaderCircle className="size-3.5 animate-spin text-blue-400" /> Procurando a extensão…
        </section>
      )
    return <InstalarExtensao />
  }

  return (
    <section className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs">
      <span className="inline-flex items-center gap-2 text-fg-2">
        <span className="size-2 rounded-full bg-emerald-400" />
        Extensão <span className="num text-fg-4">v{versao}</span>
      </span>
      <span className="inline-flex items-center gap-2 text-fg-2">
        {verificando ? (
          <LoaderCircle className="size-3 animate-spin text-fg-3" />
        ) : (
          <span className={clsx('size-2 rounded-full', conta?.logado ? 'bg-emerald-400' : conta?.aba === false && !erro ? 'bg-fg-4' : 'bg-red-400')} />
        )}
        {conta?.logado ? (
          <>
            Instagram: <span className="pv font-medium text-fg">@{conta.usuario ?? 'conectado'}</span>
          </>
        ) : erro ? (
          <span className="text-red-300">{erro}</span>
        ) : conta?.aba === false ? (
          'Instagram fechado: abre sozinho na busca'
        ) : (
          <span className="text-red-300">Instagram sem login neste navegador</span>
        )}
        {!conta?.logado && (
          <button onClick={() => void abrirInstagram()} className="font-medium text-blue-300 underline-offset-2 hover:underline">
            Abrir o Instagram
          </button>
        )}
      </span>
      <span className="flex-1" />
      <span className="text-fg-3">
        Hoje: <span className="num text-fg">{hoje.perfis}</span> perfis abertos · <span className="num text-fg">{hoje.leads}</span> leads
        {hoje.pausas > 0 && (
          <>
            {' '}
            · <span className="num text-gold">{hoje.pausas}</span> pausa(s) do Instagram
          </>
        )}
      </span>
      <Button size="xs" variant="ghost" icon={<RefreshCw className="size-3" />} loading={verificando} onClick={() => void useInstagram.getState().verificar()}>
        Conferir
      </Button>
    </section>
  )
}

/** Extensão instalada é de uma versão antiga: baixar de novo e recarregar. */
function AvisoAtualizar() {
  const versao = useInstagram((s) => s.extensao.versao)
  if (!versao || !versaoAntiga(versao)) return null
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-gold/30 bg-gold/[0.06] px-4 py-3 text-xs">
      <span className="min-w-0 flex-1 text-fg-2">
        <b className="text-gold">Saiu uma versão nova da extensão (v{EXTENSAO_VERSAO}).</b> Baixe de novo, extraia por cima da pasta <span className="font-mono">xs-instagram</span>{' '}
        e clique no botão de recarregar (↻) da extensão na página de extensões do navegador.
      </span>
      <a href={EXTENSAO_ZIP} download="xs-instagram.zip" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-gold px-2.5 text-xs font-semibold text-on-gold hover:bg-gold/85">
        <Download className="size-3.5" /> Baixar a versão nova
      </a>
    </section>
  )
}

/** Como estão os leads que vieram do Instagram, por busca, e o histórico das buscas. */
function Acompanhamento() {
  const leads = useApp((s) => s.leads)
  const meetings = useApp((s) => s.meetings)
  const historico = useInstagram((s) => s.historico)

  const dados = useMemo(() => {
    const fechou = new Set(meetings.filter((m) => m.resultado === 'fechou').map((m) => m.lead_id))
    const reuniao = new Set(meetings.map((m) => m.lead_id))
    type Linha = { busca: string; leads: number; abordados: number; conversa: number; reuniao: number; fechou: number }
    const porBusca = new Map<string, Linha>()
    const total: Linha = { busca: 'Total', leads: 0, abordados: 0, conversa: 0, reuniao: 0, fechou: 0 }
    for (const l of leads) {
      const b = buscaDoLead(l)
      if (!b) continue
      const linha = porBusca.get(b) ?? { busca: b, leads: 0, abordados: 0, conversa: 0, reuniao: 0, fechou: 0 }
      const inc = (k: keyof Omit<Linha, 'busca'>) => {
        linha[k]++
        total[k]++
      }
      inc('leads')
      if (l.status !== 'novo' || l.status2) inc('abordados')
      if (CONVERSA.has(l.status)) inc('conversa')
      if (l.status === 'agendou_reuniao' || reuniao.has(l.id)) inc('reuniao')
      if (fechou.has(l.id)) inc('fechou')
      porBusca.set(b, linha)
    }
    return { total, linhas: [...porBusca.values()].sort((a, b) => b.leads - a.leads) }
  }, [leads, meetings])

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Leads do Instagram" description="Como os leads que vieram do Instagram estão andando no seu funil.">
        {dados.total.leads === 0 ? (
          <p className="text-xs text-fg-3">Nenhum lead do Instagram ainda. Os que a busca aprovar aparecem aqui.</p>
        ) : (
          <>
            <dl className="grid grid-cols-5 gap-2">
              <Metric label="Leads" value={dados.total.leads} />
              <Metric label="Abordados" value={dados.total.abordados} />
              <Metric label="Conversa" value={dados.total.conversa} tone="text-blue-300" />
              <Metric label="Reunião" value={dados.total.reuniao} tone="text-gold" />
              <Metric label="Fechou" value={dados.total.fechou} tone="text-emerald-300" />
            </dl>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[460px] text-xs">
                <thead>
                  <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                    <th className="py-1.5 font-medium">Busca</th>
                    <th className="px-2 py-1.5 text-right font-medium">Leads</th>
                    <th className="px-2 py-1.5 text-right font-medium">Abordados</th>
                    <th className="px-2 py-1.5 text-right font-medium">Conversa</th>
                    <th className="px-2 py-1.5 text-right font-medium">Reunião</th>
                    <th className="py-1.5 pl-2 text-right font-medium">Fechou</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {dados.linhas.slice(0, 12).map((l) => (
                    <tr key={l.busca}>
                      <td className="max-w-[14rem] truncate py-1.5 text-fg-2">{l.busca}</td>
                      <td className="num px-2 py-1.5 text-right text-fg">{l.leads}</td>
                      <td className="num px-2 py-1.5 text-right text-fg-2">{l.abordados}</td>
                      <td className="num px-2 py-1.5 text-right text-fg-2">
                        {l.conversa} <span className="text-fg-4">{pct(l.conversa, l.abordados)}</span>
                      </td>
                      <td className="num px-2 py-1.5 text-right text-fg-2">{l.reuniao}</td>
                      <td className="num py-1.5 pl-2 text-right text-emerald-300">{l.fechou || <span className="text-fg-4">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-2xs text-fg-4">"Conversa" mostra quanto dos abordados respondeu. Repita as buscas que mais convertem.</p>
          </>
        )}
      </Card>

      <Card title="Histórico de buscas" description="As últimas buscas feitas neste navegador.">
        {historico.length === 0 ? (
          <p className="text-xs text-fg-3">Nenhuma busca ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-xs">
              <thead>
                <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                  <th className="py-1.5 font-medium">Quando</th>
                  <th className="px-2 py-1.5 font-medium">Busca</th>
                  <th className="px-2 py-1.5 text-right font-medium">Abertos</th>
                  <th className="px-2 py-1.5 text-right font-medium">Aprovados</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {historico.slice(0, 12).map((h) => (
                  <tr key={h.id}>
                    <td className="py-1.5 whitespace-nowrap text-fg-3">
                      {new Date(h.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-1.5 text-fg-2">
                      <span className="text-fg-4">{FONTE_LABEL[h.fonte]}:</span> {h.termos.join(', ')}
                      {h.fim === 'erro' && <span className="text-red-300"> · erro</span>}
                      {h.fim === 'parada' && <span className="text-fg-4"> · parada</span>}
                    </td>
                    <td className="num px-2 py-1.5 text-right text-fg-2">{h.lidos}</td>
                    <td className="num px-2 py-1.5 text-right text-emerald-300">{h.aprovados}</td>
                    <td className="num py-1.5 pl-2 text-right text-fg-3">{formatElapsed(h.duracaoMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Tag({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-blue-500/15 pr-1 pl-2 text-2xs font-medium text-blue-200 ring-1 ring-blue-500/30 ring-inset">
      {children}
      {onRemove && (
        <button onClick={onRemove} className="rounded p-0.5 hover:bg-blue-500/20" aria-label={`Remover ${String(children)}`}>
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function ChipButton({ active, onClick, children, disabled, className }: { active?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={clsx(
        'h-6 rounded-md border px-2 text-2xs font-medium transition-colors disabled:opacity-40',
        active ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-line text-fg-3 hover:border-blue-500/40 hover:text-fg-2',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Check2({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start gap-2 text-xs text-fg-2', disabled && 'opacity-50')}>
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-2xs text-fg-4">{hint}</span>}
      </span>
    </label>
  )
}

function Tri({ label, icon, value, onChange }: { label: string; icon: ReactNode; value: Mode; onChange: (v: Mode) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-24 items-center gap-1.5 text-xs text-fg-2">
        {icon}
        {label}
      </span>
      <div className="grid flex-1 grid-cols-3 gap-0.5 rounded-md border border-line bg-ink p-0.5">
        {(
          [
            [1, 'Com'],
            [0, 'Tanto faz'],
            [-1, 'Sem'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={clsx('h-6 rounded text-2xs font-medium transition-colors', value === v ? 'bg-raised text-fg ring-1 ring-line-strong ring-inset' : 'text-fg-3 hover:text-fg-2')}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-ink px-2.5 py-1.5">
      <dt className="text-[10px] text-fg-4">{label}</dt>
      <dd className={clsx('num text-sm font-semibold', tone ?? 'text-fg')}>{value}</dd>
    </div>
  )
}
