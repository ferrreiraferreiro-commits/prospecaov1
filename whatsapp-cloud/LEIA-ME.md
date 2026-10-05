# WhatsApp da XS (na nuvem)

O WhatsApp dos disparos, funis e mensagens agendadas roda na VPS da XS. A pessoa só lê o QR Code dentro do site, sem instalar nada.

```
XS Web ──HTTPS──▶ Caddy /whatsapp ──▶ gateway (login) ──▶ WhatsApp da conta na VPS ──▶ WhatsApp
```

- **O serviço de WhatsApp** é a pasta `motor/`, empacotada num arquivo só (`whatsapp-cloud/empacotar-motor.mjs`). Ele escuta só em 127.0.0.1 e recusa qualquer pedido vindo direto de navegador.
- **Um WhatsApp por conta.**
  - O dono tem a sessão fixa `principal` (porta 3077).
  - Cada outra conta com plano em dia e o recurso de WhatsApp (no banco: recurso `motor`) ganha a sua sessão: `xs-whatsapp-motor@c<id>`, portas 3100+, pasta própria.
  - Limite: `XS_CLOUD_MAX` sessões ligadas ao mesmo tempo (hoje 7, ~100 a 200 MB cada). Quem passar do limite vê "temporariamente indisponível" até abrir vaga.
- **gateway.ts** (127.0.0.1:8092) é a única porta de entrada.
  - Confere o login da XS (token do Supabase) e descobre a sessão da conta.
  - Repassa só os caminhos do WhatsApp (`/health`, `/whatsapp/…`, `/disparo/…`, `/agenda…`) e só para o WhatsApp **dela**.
  - Esconde o nome da máquina, IP, porta e erros técnicos.
- O gateway liga a sessão de cada conta pelo systemd. Uma regra do polkit deixa ele mexer só em `xs-whatsapp-motor@*`.
  - Sessão sem WhatsApp conectado e sem uso há 30 min é desligada.
  - Sessão com WhatsApp conectado volta sozinha quando a VPS reinicia.
- O vigia reconecta o WhatsApp que cair com sessão salva. Também para o QR Code que ninguém está olhando.
- Sessões, campanhas e agendamentos ficam em `/var/lib/xs-whatsapp/<sessão>`. Tudo roda com `TZ=America/Sao_Paulo`.

## Instalar / atualizar na VPS

```bash
sudo bash whatsapp-cloud/instalar.sh gabriel
```

Rode de dentro do pacote que tem `motor/` e `whatsapp-cloud/`. Para atualizar, rode de novo: as sessões do WhatsApp ficam.

- Situação: `systemctl status xs-whatsapp-motor@principal xs-whatsapp-gateway`
- Logs: `tail -f /var/log/xs-whatsapp/*.log`
- Teste: `curl https://109-110-184-199.sslip.io/whatsapp/saude`

## Ajustes

Edite `/etc/xs-whatsapp/gateway.env` e depois rode `systemctl restart xs-whatsapp-gateway`.

- `XS_CLOUD_TODOS=0`: só as contas de `XS_CLOUD_USUARIOS` têm WhatsApp.
- `XS_CLOUD_MAX=8`: mais contas ligadas ao mesmo tempo. Antes, confira a memória com `free -m`.
- Qual conta tem qual sessão fica registrado em `/var/lib/xs-whatsapp/sessoes.json`.

No site, `VITE_WHATSAPP_URL` muda o endereço do gateway. É opcional; o padrão é o da VPS acima.

## Testes

```bash
npm run test:whatsapp
```
