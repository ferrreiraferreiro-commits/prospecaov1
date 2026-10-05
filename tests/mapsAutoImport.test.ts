import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository } from '../src/data/localRepository'
import type { MapsResult, MapsState } from '../src/lib/mapsSearch'
import { useApp } from '../src/store/useApp'

const { addMapsRunToLeads } = await import('../src/lib/mapsAutoImport')

const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

function result(id: string, patch: Partial<MapsResult> = {}): MapsResult {
  return {
    id,
    name: `Empresa ${id}`,
    niche: 'barbearia',
    phone: '',
    website: '',
    instagram: '',
    address: '',
    city: 'Poços de Caldas',
    state: 'MG',
    rating: 0,
    reviewsCount: 0,
    lat: 0,
    lng: 0,
    mapsUrl: `https://www.google.com/maps/place/x/data=!4m2!3m1!1s0x0:0x${id}`,
    cnpj: '',
    responsibleName: '',
    responsibleRole: '',
    enrichmentConfidence: 'not_found',
    enrichmentSource: '',
    hasWhatsapp: false,
    recurring: false,
    ...patch,
  }
}

function run(results: MapsResult[], patch: Partial<MapsState> = {}): MapsState {
  return {
    runId: 'r1',
    active: false,
    phase: 'completed',
    message: '',
    progress: 100,
    cardsFound: results.length,
    approvedCount: results.length,
    discarded: 0,
    recurringDetected: 0,
    recurringBlocked: 0,
    currentSector: 0,
    totalSectors: 0,
    center: { lat: 0, lng: 0, label: 'Poços de Caldas, MG' },
    input: null,
    results,
    logs: [],
    error: null,
    startedAt: null,
    finishedAt: null,
    elapsedMs: 0,
    imported: false,
    ...patch,
  }
}

describe('busca no Maps vai direto para os leads', () => {
  beforeEach(async () => {
    mem.clear()
    await useApp.getState().init(new LocalRepository())
  })

  it('salva tudo e marca a origem', async () => {
    const n = await addMapsRunToLeads(run([result('a', { phone: '(35) 99999-0001' }), result('b')]))
    expect(n).toBe(2)
    const { leads, imports } = useApp.getState()
    expect(leads.map((l) => l.empresa)).toEqual(['Empresa a', 'Empresa b'])
    expect(imports[0].arquivo).toBe('Google Maps · barbearia · Poços de Caldas, MG')
  })

  it('pula quem já está nos leads (telefone ou lugar no Maps) e não duplica ao repetir', async () => {
    await addMapsRunToLeads(run([result('a', { phone: '(35) 99999-0001' })]))
    const again = run([result('a2', { phone: '35999990001' }), result('a', { phone: '' }), result('c')], { runId: 'r2' })
    expect(await addMapsRunToLeads(again)).toBe(1)
    expect(useApp.getState().leads.map((l) => l.empresa)).toEqual(['Empresa a', 'Empresa c'])
    expect(await addMapsRunToLeads(again)).toBe(0)
    expect(useApp.getState().leads).toHaveLength(2)
  })

  it('salva o que achou numa busca parada no meio', async () => {
    expect(await addMapsRunToLeads(run([result('a')], { phase: 'cancelled' }))).toBe(1)
  })

  it('não mexe em busca em andamento ou já salva', async () => {
    expect(await addMapsRunToLeads(run([result('a')], { active: true, phase: 'scrolling' }))).toBeNull()
    expect(await addMapsRunToLeads(run([result('a')], { imported: true }))).toBeNull()
    expect(useApp.getState().leads).toHaveLength(0)
  })
})
