import { describe, expect, it } from 'vitest'
import {
  acharChave,
  buscaDoLead,
  chavesDosLeads,
  coletarHashtags,
  coletarPerfis,
  conferirResposta,
  FILTROS_PADRAO,
  IgErro,
  lerLista,
  lerPerfil,
  motivoDescarte,
  perfilParaLead,
  siteProprio,
  telefoneBr,
  telefoneDoWhatsApp,
  telefonesNoTexto,
  usuarioDe,
  type IgPerfil,
} from '../src/lib/instagram'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const diasAtras = (d: number) => Math.floor((AGORA - d * 86_400_000) / 1000)

/** Resposta de /api/v1/users/web_profile_info/ no formato do Instagram. */
function respostaPerfil(user: Record<string, unknown>) {
  return {
    data: {
      user: {
        username: 'studio.ana.nails',
        id: '123',
        full_name: 'Studio Ana Nails',
        biography: 'Manicure e pedicure 💅\nAgende pelo WhatsApp (43) 99876-5432\nLondrina - PR',
        bio_links: [{ title: 'Agenda', url: 'https://linktr.ee/studioana', link_type: 'external' }],
        external_url: 'https://linktr.ee/studioana',
        business_email: 'ana@gmail.com',
        business_phone_number: '',
        business_category_name: null,
        category_name: 'Salão de manicure',
        business_address_json: '{"city_name": "Londrina, Paraná", "street_address": "Rua Sergipe, 100", "zip_code": "86010-000"}',
        is_business_account: true,
        is_professional_account: true,
        is_private: false,
        is_verified: false,
        edge_followed_by: { count: 1840 },
        edge_follow: { count: 300 },
        edge_owner_to_timeline_media: { count: 212, edges: [{ node: { taken_at_timestamp: diasAtras(3) } }, { node: { taken_at_timestamp: diasAtras(10) } }] },
        ...user,
      },
    },
    status: 'ok',
  }
}

describe('usuários do Instagram', () => {
  it('lê @, links e ignora caminhos que não são perfil', () => {
    expect(usuarioDe('@Studio.Ana')).toBe('studio.ana')
    expect(usuarioDe('https://www.instagram.com/docesdamaria/?igsh=abc')).toBe('docesdamaria')
    expect(usuarioDe('instagram.com/p/C123')).toBeNull()
    expect(usuarioDe('nome com espaço')).toBe('nome')
    expect(lerLista('@a.b\ninstagram.com/c_d, @a.b ; e')).toEqual(['a.b', 'c_d', 'e'])
  })

  it('acha perfis em qualquer formato de resposta (busca, hashtag, seguidores)', () => {
    const busca = { users: [{ position: 0, user: { pk: '1', username: 'Loja.A', full_name: 'Loja A', is_private: false } }], hashtags: [{ hashtag: { name: 'ManicureLondrina' } }] }
    const tag = {
      data: { recent: { sections: [{ layout_content: { medias: [{ media: { user: { pk: 2, username: 'loja.b', full_name: 'Loja B' }, caption: { text: 'oi' } } }] } }], next_max_id: 'X1' } },
    }
    const seguidores = { users: [{ pk: 3, username: 'loja.c', full_name: '', is_private: true }], next_max_id: '50' }
    expect(coletarPerfis(busca).map((p) => p.usuario)).toEqual(['loja.a'])
    expect(coletarPerfis(tag)[0]).toMatchObject({ usuario: 'loja.b', pk: '2', nome: 'Loja B' })
    expect(coletarPerfis(seguidores)[0]).toMatchObject({ usuario: 'loja.c', privado: true })
    expect(coletarHashtags(busca)).toEqual(['manicurelondrina'])
    expect(acharChave(tag, 'next_max_id')).toBe('X1')
    expect(acharChave(seguidores, 'next_max_id')).toBe('50')
  })
})

describe('telefone, WhatsApp e site', () => {
  it('normaliza números do Brasil', () => {
    expect(telefoneBr('+55 (43) 99876-5432')).toBe('43998765432')
    expect(telefoneBr('043 3322-1100')).toBe('4333221100')
    expect(telefoneBr('12345')).toBeNull()
    expect(telefoneBr('43 8876 54321')).toBeNull()
  })

  it('acha telefone na bio e no link do WhatsApp', () => {
    expect(telefonesNoTexto('Pedidos: 43 9 9876 5432 ou (43) 3322-1100')).toEqual(['43998765432', '4333221100'])
    expect(telefonesNoTexto('CEP 86010-000, desde 2015')).toEqual([])
    expect(telefoneDoWhatsApp('https://wa.me/5543998765432?text=oi')).toBe('43998765432')
    expect(telefoneDoWhatsApp('https://api.whatsapp.com/send?phone=5543998765432')).toBe('43998765432')
  })

  it('linktree, WhatsApp e redes não contam como site', () => {
    expect(siteProprio('https://linktr.ee/loja')).toBeNull()
    expect(siteProprio('wa.me/5543998765432')).toBeNull()
    expect(siteProprio('https://www.facebook.com/loja')).toBeNull()
    expect(siteProprio('lojadaana.com.br')).toBe('https://lojadaana.com.br')
  })
})

describe('perfil → lead', () => {
  it('lê o perfil comercial com WhatsApp na bio', () => {
    const p = lerPerfil(respostaPerfil({}))!
    expect(p).toMatchObject({
      usuario: 'studio.ana.nails',
      nome: 'Studio Ana Nails',
      categoria: 'Salão de manicure',
      telefone: '43998765432',
      whatsapp: true,
      site: null,
      linkBio: 'https://linktr.ee/studioana',
      email: 'ana@gmail.com',
      seguidores: 1840,
      comercial: true,
      cidade: 'Londrina, Paraná',
      cep: '86010-000',
    })
    expect(Date.parse(p.ultimoPost!)).toBe(diasAtras(3) * 1000)
  })

  it('telefone do botão de contato vem antes da bio; fixo não vira WhatsApp', () => {
    const p = lerPerfil(respostaPerfil({ business_phone_number: '+554333221100', biography: 'Confeitaria' }))!
    expect(p.telefone).toBe('4333221100')
    expect(p.whatsapp).toBe(false)
  })

  it('resposta sem perfil devolve null', () => {
    expect(lerPerfil({ data: { user: null }, status: 'ok' })).toBeNull()
  })

  it('aplica os filtros', () => {
    const base = lerPerfil(respostaPerfil({}))!
    const f = FILTROS_PADRAO
    const motivo = (p: Partial<IgPerfil>, filtros = f, cidade = '') => motivoDescarte({ ...base, ...p }, filtros, cidade, AGORA)
    expect(motivo({})).toBeNull()
    expect(motivo({ privado: true })).toBe('privado')
    expect(motivo({ comercial: false })).toBe('pessoal')
    expect(motivo({ telefone: null })).toBe('sem_contato')
    expect(motivo({ site: 'https://loja.com' })).toBe('tem_site')
    expect(motivo({ ultimoPost: new Date(AGORA - 200 * 86_400_000).toISOString() })).toBe('parado')
    expect(motivo({ ultimoPost: null })).toBe('parado')
    expect(motivo({ seguidores: 50 }, { ...f, seguidoresMin: 100 })).toBe('seguidores')
    expect(motivo({}, { ...f, soCidade: true }, 'Maringá')).toBe('fora_cidade')
    expect(motivo({}, { ...f, soCidade: true }, 'Londrina, PR')).toBeNull()
  })

  it('vira lead com origem e busca para o acompanhamento', () => {
    const p = lerPerfil(respostaPerfil({}))!
    const lead = perfilParaLead(p, { nicho: 'Manicure', busca: 'Palavra-chave: manicure' })
    expect(lead).toMatchObject({
      empresa: 'Studio Ana Nails',
      nicho: 'Manicure',
      telefone: '43998765432',
      whatsapp: '43998765432',
      instagram: 'https://instagram.com/studio.ana.nails',
      website: null,
      endereco: 'Rua Sergipe, 100',
      cidade: 'Londrina',
      estado: 'Paraná',
      status: 'novo',
    })
    expect(lead.dados_extras).toMatchObject({ Origem: 'Instagram', 'Busca no Instagram': 'Palavra-chave: manicure', 'Link na bio': 'https://linktr.ee/studioana' })
    expect(buscaDoLead({ dados_extras: lead.dados_extras })).toBe('Palavra-chave: manicure')
    expect(buscaDoLead({ dados_extras: { Origem: 'Busca de empresas (base aberta)' } })).toBeNull()
  })

  it('reconhece leads que já existem pelo @ e pelo telefone', () => {
    const k = chavesDosLeads([{ instagram: 'https://instagram.com/Studio.Ana.Nails/', telefone: '(43) 99876-5432', whatsapp: null }])
    expect(k.usuarios.has('studio.ana.nails')).toBe(true)
    expect(k.telefones.size).toBe(1)
  })
})

describe('erros do Instagram', () => {
  const tipo = (r: Parameters<typeof conferirResposta>[0]) => {
    try {
      conferirResposta(r)
      return 'ok'
    } catch (e) {
      return e instanceof IgErro ? e.tipo : 'outro'
    }
  }

  it('separa login, pausa, verificação e perfil inexistente', () => {
    expect(tipo({ ok: true, status: 401, json: { message: 'Aguarde alguns minutos antes de tentar novamente.', require_login: true, status: 'fail' } })).toBe('login')
    expect(tipo({ ok: true, status: 429, json: { message: 'Please wait a few minutes before you try again.', status: 'fail' } })).toBe('limite')
    expect(tipo({ ok: true, status: 400, json: { message: 'checkpoint_required', checkpoint_url: '/challenge/' } })).toBe('verificacao')
    expect(tipo({ ok: true, status: 404, json: { status: 'fail' } })).toBe('nao_existe')
    expect(tipo({ ok: true, status: 200, json: null, texto: '<html>', url: 'https://www.instagram.com/accounts/login/' })).toBe('login')
    expect(tipo({ ok: false, erro: 'sem aba' })).toBe('extensao')
    expect(tipo({ ok: true, status: 200, json: { data: {}, status: 'ok' } })).toBe('ok')
  })
})
