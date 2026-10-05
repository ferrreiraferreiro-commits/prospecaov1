# WhatsApp na nuvem (modo `WHATSAPP_ENGINE=cloud`)

Segunda forma de rodar o Motor WhatsApp XS. A primeira (Motor no computador) continua igual e é o padrão.

```
local:  XS Web ──ponte/127.0.0.1──▶ Motor no PC ──▶ WhatsApp
cloud:  XS Web ──HTTPS──▶ Caddy /whatsapp ──▶ gateway (login) ──▶ Motor da conta na VPS ──▶ WhatsApp
```

- **O Motor é o mesmo programa** (pasta `motor/`, empacotado num arquivo só, como no .exe). Na VPS ele roda com `XS_MODO=nuvem` (sem a ponte) e escuta só em 127.0.0.1.
- **Um WhatsApp por conta.** O dono tem a sessão fixa `principal` (porta 3077). Cada outra conta com plano em dia e o recurso do Motor ganha a sua sessão (`xs-whatsapp-motor@c<id>`, portas 3100+, pasta própria). O limite é `XS_CLOUD_MAX` ligadas ao mesmo tempo (padrão 5, ~100 MB cada). Quem passar do limite continua no Motor do computador.
- **gateway.ts** (127.0.0.1:8092) é a única porta de entrada.
  - Confere o login da XS (token do Supabase) e descobre a sessão da conta.
  - Repassa só os caminhos do Motor (`/health`, `/whatsapp/…`, `/disparo/…`, `/agenda…`) e só para o Motor **dela**.
  - Esconde o nome da máquina, IP, porta e erros técnicos.
- O gateway liga o Motor de cada conta pelo systemd. Uma regra do polkit deixa ele mexer só em `xs-whatsapp-motor@*`.
  - Motor sem WhatsApp conectado e sem uso há 30 min é desligado.
  - Motor com WhatsApp conectado volta sozinho quando a VPS reinicia.
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

## Ligar e desligar no site

Variável de ambiente da Vercel (vale no próximo deploy):

| Valor | O que acontece |
| --- | --- |
| `WHATSAPP_ENGINE=local` (ou sem a variável) | Exatamente como antes: todas as contas usam o Motor do computador. |
| `WHATSAPP_ENGINE=cloud` | As contas com sessão na VPS usam a nuvem. As outras continuam no Motor do computador. |

Voltar atrás = `WHATSAPP_ENGINE=local` e publicar de novo. Nada do modo local foi removido.

## Ajustes

Edite `/etc/xs-whatsapp/gateway.env` e depois rode `systemctl restart xs-whatsapp-gateway`.

- `XS_CLOUD_TODOS=0`: só as contas de `XS_CLOUD_USUARIOS` usam a nuvem.
- `XS_CLOUD_MAX=8`: mais contas ligadas ao mesmo tempo. Antes, confira a memória com `free -m`.
- Qual conta tem qual sessão fica registrado em `/var/lib/xs-whatsapp/sessoes.json`.

## Testes

```bash
node --test whatsapp-cloud/gateway.test.ts
```
