import { create } from 'zustand'
import type { StatusId } from '../lib/types'

export interface OutcomeTarget {
  leadId: string
  mode: 'call' | 'status'
  callId: string | null
  presetStatus: StatusId | null
}

export interface MessageTarget {
  leadId: string
  /** Modelo já escolhido ao abrir (ex.: "Depois da ligação") */
  templateId?: string
}

interface UiState {
  drawerLeadId: string | null
  importOpen: boolean
  outcome: OutcomeTarget | null
  message: MessageTarget | null
  openLead(id: string | null): void
  setImportOpen(open: boolean): void
  openOutcome(target: OutcomeTarget | null): void
  openMessage(target: MessageTarget | null): void
}

export const useUi = create<UiState>()((set) => ({
  drawerLeadId: null,
  importOpen: false,
  outcome: null,
  message: null,
  openLead: (id) => set({ drawerLeadId: id }),
  setImportOpen: (open) => set({ importOpen: open }),
  openOutcome: (target) => set({ outcome: target }),
  openMessage: (target) => set({ message: target }),
}))
