import { create } from 'zustand'
import type { StatusId } from '../lib/types'

export interface OutcomeTarget {
  leadId: string
  mode: 'call' | 'status'
  callId: string | null
  presetStatus: StatusId | null
}

interface UiState {
  drawerLeadId: string | null
  importOpen: boolean
  outcome: OutcomeTarget | null
  openLead(id: string | null): void
  setImportOpen(open: boolean): void
  openOutcome(target: OutcomeTarget | null): void
}

export const useUi = create<UiState>()((set) => ({
  drawerLeadId: null,
  importOpen: false,
  outcome: null,
  openLead: (id) => set({ drawerLeadId: id }),
  setImportOpen: (open) => set({ importOpen: open }),
  openOutcome: (target) => set({ outcome: target }),
}))
