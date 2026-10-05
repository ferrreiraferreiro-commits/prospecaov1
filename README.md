# XS Prospecção

Prospecção por ligação e WhatsApp, busca de empresas (base aberta de comércios ou Google Maps) e gestão do negócio (clientes, projetos, financeiro e precificação) num lugar só.

## Como funciona

```
┌──────────────────────────────┐ HTTPS  ┌──────────────────────────────────────┐
│ App web (Vercel ou localhost)│ ─────► │ VPS da XS                            │
│ React · leads · gestão       │        │ /lugares   base aberta de comércios  │
│ dados no Supabase            │        │ /whatsapp  gateway → um WhatsApp por │
└──────────────────────────────┘        │            conta (whatsapp-cloud/)   │
                                        └──────────────────────────────────────┘
```

- **App web**: tudo o que é tela e dado — Painel, Leads, Hoje, Modo Ligação, Funis, Clientes, Projetos, Financeiro, Precificação, Números, Ajustes. Funciona no celular e no PC.
- **Busca de empresas**, duas fontes:
  - **Base aberta** (grátis, sem limite): comércios do Brasil da [Overture Maps](https://overturemaps.org) (dados de Meta, Microsoft, Foursquare…) num SQLite na VPS. `busca/lugares-importar.ts` monta a base (toda semana confere se há versão nova), `busca/lugares.ts` responde em milissegundos em `/lugares/*`. Instalação, numa VPS que já tem o `instalar.sh`: `sudo bash busca/instalar-lugares.sh`.
  - **Google Maps** (Places API) com a chave de cada usuário (Ajustes → Busca do Google, tabela `busca_google`). Cada conta usa a própria cota grátis do Google (1.000 consultas/mês) e a XS para no teto (950 por padrão).
- **`api/maps.ts`** (Vercel): confere o login e a conta liberada; repassa a busca grátis à VPS (`XS_BUSCA_URL` + `XS_BUSCA_TOKEN`), chama o Google com a chave do usuário e abre o site das empresas para achar o Instagram. No `npm run dev`, o `vite.config.ts` chama a mesma função.
- A busca antiga pela base do CNPJ (`busca/servidor.ts`, `importar.ts`) não é mais usada pelo app.
- **WhatsApp da XS** (`motor/` + `whatsapp-cloud/`): roda na VPS, um WhatsApp por conta, para os disparos automáticos (Disparo, Funis, Agendadas). O site fala com o gateway por HTTPS, com o login da pessoa; nada para instalar no computador. Detalhes em [`whatsapp-cloud/LEIA-ME.md`](whatsapp-cloud/LEIA-ME.md).

## Rodar

```bash
npm install
npm run dev          # app em http://localhost:5180
npm test             # testes do app
npm run build
```

WhatsApp: `npm run test:whatsapp` (gateway + serviço). Instalar/atualizar na VPS: `sudo bash whatsapp-cloud/instalar.sh gabriel` (veja o LEIA-ME).

## Módulos

| Área | O que faz |
|---|---|
| **Painel** | Meta do dia, retornos e reuniões, funil de prospecção, recebido no mês, projetos em andamento. |
| **Leads / Hoje / Ligação** | A Central de Prospecção: importação de TXT, registro de ligações, retornos, reuniões, roteiro e objeções. |
| **Buscar empresas** | 101 tipos de negócio em 11 grupos, por cidade e bairro, na base aberta (grátis) ou no Google (com a chave do usuário). Filtros de telefone, celular e site; pula quem já está nos leads; os resultados entram direto na lista. |
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

Projeto `xs-prospeccao`. O `.vercelignore` deixa `motor/` e `whatsapp-cloud/` fora do deploy (eles rodam na VPS).

## Estrutura

```
src/lib        regras puras (parser, duplicidade, métricas, biz.ts da gestão, mapsSearch, disparo)
src/data       Repository + LocalRepository + SupabaseRepository (inclui as tabelas da gestão)
src/store      useApp (prospecção) e useBiz (gestão)
src/pages      Painel, Leads, Hoje, Ligação, Maps, Funis, Disparo, WhatsApp, Clientes, Projetos, Financeiro, Precificação, Números, Ajustes
motor/src      WhatsApp de uma conta: server.ts, whatsapp.ts, disparo.ts, agenda.ts (roda na VPS)
whatsapp-cloud gateway.ts (login + um WhatsApp por conta), instalar.sh (systemd, Caddy, polkit)
```

Regras que continuam valendo: dados importados não são inventados nem alterados; duplicidade só por telefone, lugar no Maps ou nome + endereço; o histórico do lead nunca é sobrescrito.

## Direitos autorais

© 2026 **Gabriel Yamashita Marcelino** — XS Prospecção. Todos os direitos reservados.

Software proprietário: o `LICENSE` tem os termos e o [`DIREITOS_AUTORAIS.md`](DIREITOS_AUTORAIS.md) as regras para cópias, alterações e trabalho com IA. Nenhuma cópia, revenda ou alteração é permitida sem autorização por escrito do titular.
