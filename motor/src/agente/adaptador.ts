// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O que o Laboratório, o Caderno e as rotinas precisam do vendedor (vieram do projeto separado xs-ia).
 * A implementação é a `equipe` (equipe.ts), em cima do agente.ts.
 */
import type { ContextoConferencia } from './conferente.js'
import type * as ia from './ia.js'
import type { AgenteConfig, Conversa, Licao, Material, NomeAgente, Pendencia, Reuniao } from './tipos.js'

export type Pronto = { mensagens: string[]; acao: string; dados?: Record<string, unknown> }

export interface DiaDiario {
  resumo: string
  funcionou: string[]
  naoFuncionou: string[]
  erros: string[]
}

export interface Dados {
  config: AgenteConfig
  conversas: Conversa[]
  licoes: Licao[]
  materiais: Material[]
  pendencias: Pendencia[]
  reunioes: Reuniao[]
  diario: Record<string, DiaDiario>
  lab: { provas: unknown[]; versoes: unknown[]; casos: unknown[]; entrevista: { mensagens: { de: 'xico' | 'voce'; texto: string }[]; resultado: unknown; em?: string } | null }
}

export interface AgenteIA {
  d: Dados
  readonly cfg: AgenteConfig
  salvar(): void
  ctx(): ia.Contexto
  comIA<T>(fn: () => Promise<{ dados: T; uso: ia.Uso }>): Promise<T | null>
  apoioPara(c: Conversa, consulta: string, comAgenda?: boolean): ia.Apoio
  contexto(c: Conversa, proativa: boolean, agora?: Date): ContextoConferencia
  entregarFalso(l: { empresa: string; nicho: string; cidade: string; uf: string }): Conversa
  sair(c: Conversa, pronto: Pronto, o: { agente: NomeAgente; proativa: boolean; fontes?: string[]; horarios?: string[]; maxBolhas?: number; refazer?: (atual: Pronto, motivo: string) => Promise<Pronto | null> }): Promise<'enviada' | 'aguardando' | 'barrada' | 'adiada'>
  pendencia(p: Omit<Pendencia, 'id' | 'criadaEm'>): Pendencia
  novaLicao(l: Partial<Licao> & { texto: string }): Licao
  ultimaNota(): number | null
}
