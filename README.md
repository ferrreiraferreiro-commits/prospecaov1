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

1. Crie um projeto no Supabase e rode as migrações de `supabase/migrations/` em ordem (0001, 0002, 0003) no SQL Editor.
2. Em *Authentication → Users*, crie o seu usuário (e-mail + senha). Desative novos cadastros em *Authentication → Providers/Sign In* se quiser.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Com as variáveis definidas, o app pede login e todas as tabelas ficam protegidas por RLS (`user_id = auth.uid()`).

Para migrar o que já está no modo local: exporte o backup antes, configure o Supabase, entre e use **Restaurar backup**.

## Deploy (Vercel)

Importe o repositório na Vercel (framework: Vite). Defina as duas variáveis `VITE_SUPABASE_*` no projeto. O `vercel.json` já redireciona as rotas para o SPA e agenda `/api/keepalive` uma vez por dia, para o Supabase gratuito não pausar por falta de uso.

## Fluxo de uso

- **Central**: indicadores, filtros rápidos (Novos, Para ligar, Follow-up…), busca e lista de leads com ações rápidas (tel, WhatsApp, Maps, Instagram, site).
- **Liguei**: registra data e hora no clique e abre "Como foi a ligação?". Teclas `1`–`0` escolhem o resultado, `Ctrl+Enter` salva.
- **Hoje**: retornos do dia (e atrasados), tentar novamente, novos, reuniões e o que já foi feito hoje. "Começar ligações" abre a fila no Modo Ligação.
- **Modo Ligação**: empresa à esquerda, roteiro (teleprompter, `↑`/`↓`) e objeções no centro, anotações e resultado à direita. "Salvar e próximo lead" segue a fila.
- **Mensagens**: modelos de WhatsApp com variáveis ({saudacao}, {responsavel}, {empresa}…) e variações em rodízio. O WhatsApp abre com o texto pronto; quem envia é você. Depois de "Pediu WhatsApp" o app oferece mandar a mensagem.
- **Disparo**: disparo assistido — fila de leads filtrada, uma mensagem por vez, espera sorteada entre envios e limite por dia (sem robô, para não arriscar o número).
- **Novas tentativas**: depois de "Não atendeu" a próxima tentativa já vem agendada (dia seguinte, período oposto). Depois de N tentativas seguidas sem resposta, o lead sai da fila e aparece em "Sugestão: encerrar".
- **Reuniões**: resultado (fechou com valor, realizada, não fechou, não compareceu); Números mostra faturamento, ticket médio e taxa de fechamento.
- **Números**: inclui o melhor horário para ligar (taxa de atendimento por dia × hora).
- **Prioridade**: sem site + nota alta + muitas avaliações vem primeiro (etiqueta "Alto potencial").
- **CNPJ**: consulta dados públicos e sócios (BrasilAPI); o sócio só é sugerido se nome, telefone e cidade conferirem.
- **Avisos e app**: aviso na hora do retorno (e notificação do sistema, se permitida); instalável no celular/PC como app.
- **Ajustes**: seu nome e serviço (usados no roteiro), meta diária, roteiros, mensagens, tentativas, avisos, backup.

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
- Duplicidade só é sugerida por telefone (DDD + 8 últimos dígitos, então o nono dígito não engana), local no Maps ou nome + endereço — nunca só pelo nome.
- O histórico nunca é sobrescrito: cada ligação, mudança de status, follow-up e reunião vira um registro.
