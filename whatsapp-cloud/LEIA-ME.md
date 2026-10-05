# WhatsApp na nuvem (modo `WHATSAPP_ENGINE=cloud`)

Segunda forma de rodar o Motor WhatsApp XS. A primeira (Motor no computador) continua igual e é o padrão.

```
local:  XS Web ──ponte/127.0.0.1──▶ Motor no PC ──▶ WhatsApp
cloud:  XS Web ──HTTPS──▶ Caddy /whatsapp ──▶ gateway (login) ──▶ Motor na VPS ──▶ WhatsApp
```

- **O Motor é o mesmo programa** (pasta `motor/`). Na VPS ele roda com `XS_MODO=nuvem` (sem a ponte) e escuta só em `127.0.0.1:3077`.
- **gateway.ts** (`127.0.0.1:8092`) é a única porta de entrada. Ela confere o login da XS (token do Supabase) e a lista `XS_CLOUD_USUARIOS`, repassa só os caminhos do Motor (`/health`, `/whatsapp/…`, `/disparo/…`, `/agenda…`) e esconde nome da máquina, IP, porta e erros técnicos.
- O vigia do gateway reconecta sozinho se o WhatsApp cair com sessão salva. Ele também para o QR Code se ninguém estiver olhando a tela.
- O systemd sobe tudo quando a VPS liga e reinicia o que cair. Sessão, campanhas e agendamentos ficam em `/var/lib/xs-whatsapp/principal`, e o Motor roda com `TZ=America/Sao_Paulo`.

## Instalar / atualizar na VPS

```bash
sudo bash whatsapp-cloud/instalar.sh gabriel
```

Rode de dentro do pacote que tem `motor/` e `whatsapp-cloud/`. Para atualizar, rode de novo (a sessão do WhatsApp fica). Para trocar quem pode usar, edite `XS_CLOUD_USUARIOS` em `/etc/xs-whatsapp/gateway.env` e rode `systemctl restart xs-whatsapp-gateway`.

- Situação: `systemctl status xs-whatsapp-motor@principal xs-whatsapp-gateway`
- Logs: `tail -f /var/log/xs-whatsapp/*.log`
- Teste: `curl https://109-110-184-199.sslip.io/whatsapp/saude`

## Ligar e desligar no site

Variável de ambiente da Vercel (vale no próximo deploy):

| Valor | O que acontece |
| --- | --- |
| `WHATSAPP_ENGINE=local` (ou sem a variável) | Exatamente como antes: todas as contas usam o Motor do computador. |
| `WHATSAPP_ENGINE=cloud` | As contas da lista da VPS usam a nuvem. As outras continuam no Motor do computador. |

Voltar atrás = `WHATSAPP_ENGINE=local` e publicar de novo. Nada do modo local foi removido.

## Futuro: um WhatsApp por pessoa

Cada sessão é um Motor separado (`xs-whatsapp-motor@<nome>`, com sua pasta e sua porta).

1. Crie `/etc/xs-whatsapp/motor-<nome>.env` com `XS_PORT=<porta>`.
2. Crie a pasta `/var/lib/xs-whatsapp/<nome>`.
3. Rode `systemctl enable --now xs-whatsapp-motor@<nome>`.
4. Acrescente `<nome>:<porta>` em `XS_CLOUD_SESSOES` e `usuario:<nome>` em `XS_CLOUD_USUARIOS`.

## Testes

```bash
node --test whatsapp-cloud/gateway.test.ts
```
