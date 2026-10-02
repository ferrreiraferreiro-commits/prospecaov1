# Central de Prospecção

Mesa de trabalho para prospecção ativa por telefone: importe a lista de leads (TXT exportado), ligue, registre o resultado em poucos cliques e acompanhe follow-ups, reuniões e metas.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # testes (parser, duplicidade, métricas, fluxo completo)
npm run build
```

Sem configurar nada, o app roda em **modo local**: os dados ficam no navegador (localStorage). Use **Ajustes → Exportar backup** de vez em quando.

## Supabase (sincronizar entre dispositivos)

1. Crie um projeto no Supabase e rode `supabase/migrations/0001_init.sql` no SQL Editor.
2. Em *Authentication → Users*, crie o seu usuário (e-mail + senha). Desative novos cadastros em *Authentication → Providers/Sign In* se quiser.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Com as variáveis definidas, o app pede login e todas as tabelas ficam protegidas por RLS (`user_id = auth.uid()`).

Para migrar o que já está no modo local: exporte o backup antes, configure o Supabase, entre e use **Restaurar backup**.

## Deploy (Vercel)

Importe o repositório na Vercel (framework: Vite). Defina as duas variáveis `VITE_SUPABASE_*` no projeto. O `vercel.json` já redireciona as rotas para o SPA.

## Fluxo de uso

- **Central**: indicadores, filtros rápidos (Novos, Para ligar, Follow-up…), busca e lista de leads com ações rápidas (tel, WhatsApp, Maps, Instagram, site).
- **Liguei**: registra data e hora no clique e abre "Como foi a ligação?". Teclas `1`–`0` escolhem o resultado, `Ctrl+Enter` salva.
- **Hoje**: retornos do dia (e atrasados), tentar novamente, novos, reuniões e o que já foi feito hoje. "Começar ligações" abre a fila no Modo Ligação.
- **Modo Ligação**: empresa à esquerda, roteiro (teleprompter, `↑`/`↓`) e objeções no centro, anotações e resultado à direita. "Salvar e próximo lead" segue a fila.
- **Ajustes**: seu nome e serviço (usados no roteiro), meta diária, edição do roteiro e das objeções, backup.

## Estrutura

```
src/lib        regras puras: parser do TXT, duplicidade, métricas/filtros/fila do dia, roteiro
src/data       Repository (interface) + LocalRepository + SupabaseRepository
src/store      estado (zustand) e ações: importar, registrar ligação, resultado, follow-up, reunião
src/components peças de UI (linha do lead, painel de resultado, drawer, importador…)
src/pages      Central, Hoje, Modo Ligação, Estatísticas, Ajustes, Login
supabase/      migração SQL com RLS
tests/         vitest (inclui o TXT real em tests/fixtures)
```

Regras importantes:
- Dados importados não são alterados; "Não informado"/"Sem site oficial" viram ausência de dado.
- Duplicidade só é sugerida por telefone, local no Maps ou nome + endereço — nunca só pelo nome.
- O histórico nunca é sobrescrito: cada ligação, mudança de status, follow-up e reunião vira um registro.
