# XS Prospecção

Prospecção por ligação e WhatsApp, busca de empresas no Google Maps e gestão do negócio (clientes, projetos, financeiro e precificação) num lugar só.

## Como funciona

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ App web (Vercel ou localhost)│  HTTP  │ Motor XS (no seu computador) │
│ React · leads · gestão       │ ─────► │ 127.0.0.1:3077               │
│ dados no Supabase            │        │ Chrome automatizado (Maps)   │
└──────────────────────────────┘        │ sessão do WhatsApp (Baileys) │
                                        └──────────────────────────────┘
```

- **App web**: tudo o que é tela e dado — Painel, Leads, Hoje, Modo Ligação, Funis, Clientes, Projetos, Financeiro, Precificação, Números, Ajustes. Funciona no celular e no PC.
- **Busca no Maps** (`api/maps.ts`): função da Vercel que consulta o Google (Places API) com a chave `GOOGLE_PLACES_KEY` (só no servidor) e lê o site público das empresas para achar Instagram e CNPJ. Exige login com acesso liberado. No `npm run dev`, o `vite.config.ts` chama a mesma função.
- **Motor XS** (`motor/`), opcional: mantém a sessão do WhatsApp para os disparos automáticos (Disparo, Funis, Agendadas). Só escuta em `127.0.0.1` e só aceita chamadas do próprio app. O código antigo da busca no Maps ainda está lá, mas o app não usa mais.

## Rodar

```bash
npm install
npm run dev          # app em http://localhost:5180
npm test             # testes do app
npm run build
```

Motor XS para quem só usa (Windows): no app, **Ajustes → Motor XS → Baixar o Motor XS**. É um único `Motor XS.exe` (Node embutido), que usa o Chrome ou o Edge do computador e guarda os dados na pasta `Motor XS - dados` ao lado dele.

Para desenvolver:

- `npm run motor` (ou dois cliques em **`Iniciar Motor XS.bat`**) · testes: `npm run test:motor`.
- Gerar um novo instalador: `npm run motor:exe` → `motor/build/Motor XS.exe` e `public/downloads/Motor-XS-Windows.zip` (publique o site para atualizar o download).

Deixe a janela do motor aberta enquanto usa a busca no Maps e o disparo. A sessão do WhatsApp, as campanhas e a última busca ficam em `motor/storage/` (fora do git).

## Módulos

| Área | O que faz |
|---|---|
| **Painel** | Meta do dia, retornos e reuniões, funil de prospecção, recebido no mês, projetos em andamento. |
| **Leads / Hoje / Ligação** | A Central de Prospecção: importação de TXT, registro de ligações, retornos, reuniões, roteiro e objeções. |
| **Buscar no Maps** | Varre a região em 19 ou 41 setores, abre cada ficha e confere telefone, site, Instagram, endereço e CNPJ (o sócio só é sugerido quando nome, telefone e cidade conferem). Pula quem já está nos leads e importa com um clique. |
| **Funis** | Sequências de WhatsApp: mensagens com variações em rodízio e esperas entre elas. Variáveis `{saudacao}`, `{responsavel}`, `{empresa}`, `{cidade}`, `{nicho}`, `{nome}`, `{servico}`. |
| **Disparo** | Campanhas com intervalo aleatório entre leads (1–60 min), um lead por vez, trava de duplicidade por telefone, confirmação de entrega/leitura e respostas recebidas. Pausa sozinho se o WhatsApp desconectar de forma suspeita. O resultado vai para o histórico de cada lead. |
| **Conexão** | QR Code do WhatsApp, status e mensagem de teste. |
| **Clientes** | Ficha do cliente (fixo/avulso, valor mensal, etiquetas), pagamentos, projetos e anotações/lembretes. "Virar cliente" na ficha do lead. |
| **Projetos** | Kanban por etapa, tarefas, prazo, prioridade e cobrança (entrada de 50% ou total). |
| **Financeiro** | Receitas e despesas por mês, gráfico de 6 meses, despesas por categoria, a receber. Pagamento de cliente marcado como pago vira receita sozinho. |
| **Precificação** | Custo da hora, preço por markup divisor (imposto + taxa + margem saem do preço), orçamentos salvos e "virar projeto". |

## Supabase

O app usa o projeto `central-prospeccao` (mesmos leads e logins). As migrações ficam em `supabase/migrations/` (0001 → 0004); a 0004 cria as tabelas da gestão com RLS por usuário. Defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (`.env.local` / Vercel). Sem elas, o app roda em modo local (dados no navegador).

## Deploy (Vercel)

Projeto `xs-prospeccao`. O `.vercelignore` deixa o `motor/` fora do deploy. Na versão publicada (https), o Chrome pode pedir permissão para o site acessar o Motor XS no computador — clique em Permitir.

## Estrutura

```
src/lib        regras puras (parser, duplicidade, métricas, biz.ts da gestão, mapsSearch, disparo)
src/data       Repository + LocalRepository + SupabaseRepository (inclui as tabelas da gestão)
src/store      useApp (prospecção) e useBiz (gestão)
src/pages      Painel, Leads, Hoje, Ligação, Maps, Funis, Disparo, WhatsApp, Clientes, Projetos, Financeiro, Precificação, Números, Ajustes
motor/src      server.ts (API local), maps.ts (busca), enrich.ts (links/telefone/CNPJ), whatsapp.ts, disparo.ts
```

Regras que continuam valendo: dados importados não são inventados nem alterados; duplicidade só por telefone, lugar no Maps ou nome + endereço; o histórico do lead nunca é sobrescrito.
