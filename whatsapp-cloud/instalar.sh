#!/usr/bin/env bash
# © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
#
# Liga o WhatsApp na nuvem (modo WHATSAPP_ENGINE=cloud) numa VPS que já tem a busca da XS (Caddy + Node 24).
# Não mexe na busca nem na base aberta: só acrescenta os serviços do WhatsApp.
#
# Na VPS, dentro da pasta descompactada do pacote (com motor/ e whatsapp-cloud/):
#   sudo bash whatsapp-cloud/instalar.sh gabriel
# O argumento é a conta do dono, com a sessão fixa "principal" (usuário de login da XS ou id da conta).
# As outras contas com plano em dia ganham o próprio WhatsApp na hora (até XS_CLOUD_MAX ligados).
# Pode rodar de novo para atualizar o código: as sessões do WhatsApp, campanhas e agendamentos ficam.
#
#   Serviços:  xs-whatsapp-motor@principal  (o Motor do dono, só em 127.0.0.1:3077)
#              xs-whatsapp-motor@c<id>      (um por conta, ligados pelo gateway, portas 3100+)
#              xs-whatsapp-gateway          (confere o login, só em 127.0.0.1:8092)
#   Internet:  https://<domínio>/whatsapp/*  → gateway (Caddy, HTTPS)
#   Dados:     /var/lib/xs-whatsapp/<sessão>    (sessão do WhatsApp, campanhas, agendamentos)
#   Logs:      /var/log/xs-whatsapp/*.log       (girados toda semana, 8 semanas)
#   Config:    /etc/xs-whatsapp/gateway.env
set -euo pipefail

USUARIOS="${1:-}"
APP=/opt/xs-whatsapp
DADOS=/var/lib/xs-whatsapp
LOGS=/var/log/xs-whatsapp
CONF=/etc/xs-whatsapp
SESSAO=principal
PORTA_MOTOR=3077
PORTA_GATEWAY=8092
# Endereço e chave PÚBLICA (publishable) do Supabase — as mesmas que já vão no site
SUPABASE_URL_PADRAO=https://hqrmlndauvcmdnqfhshg.supabase.co
SUPABASE_KEY_PADRAO=sb_publishable_zx6WCmbs1pOdgk0CmHCzvA_W82WKjV3

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$RAIZ/motor/package.json" ] && [ -f "$RAIZ/whatsapp-cloud/gateway.ts" ] || { echo "Rode de dentro da pasta do pacote (com motor/ e whatsapp-cloud/)."; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Rode com sudo."; exit 1; }

echo "== Conferindo o que já existe"
node -v | grep -qE '^v(2[4-9]|[3-9][0-9])' || { echo "Precisa do Node 24 (o instalar.sh da busca instala)."; exit 1; }
command -v caddy >/dev/null || { echo "Não achei o Caddy. Rode o instalar.sh da busca primeiro."; exit 1; }
for p in $PORTA_MOTOR $PORTA_GATEWAY; do
  if ss -ltnH "sport = :$p" | grep -q . && ! systemctl is-active --quiet xs-whatsapp-motor@$SESSAO xs-whatsapp-gateway; then
    echo "A porta $p já está em uso por outro programa:"; ss -ltnp "sport = :$p"; exit 1
  fi
done

echo "== Usuário e pastas"
id xswhatsapp >/dev/null 2>&1 || useradd --system --home-dir "$DADOS" --shell /usr/sbin/nologin xswhatsapp
install -d -m 750 -o xswhatsapp -g xswhatsapp "$DADOS" "$DADOS/$SESSAO" "$LOGS"
install -d -m 755 "$APP" "$CONF"

echo "== Código (Motor + gateway)"
rm -rf "$APP/motor.novo"
mkdir -p "$APP/motor.novo"
cp -r "$RAIZ/motor/src" "$RAIZ/motor/package.json" "$RAIZ/motor/package-lock.json" "$RAIZ/motor/tsconfig.json" "$APP/motor.novo/"
rm -f "$APP/motor.novo/src/"*.test.ts
(cd "$APP/motor.novo" && npm ci --omit=dev --no-audit --no-fund >/dev/null)
# Um arquivo só (como o .exe): gasta bem menos memória que rodar pelo tsx, um Motor por conta
node "$RAIZ/whatsapp-cloud/empacotar-motor.mjs" "$APP/motor.novo"
rm -rf "$APP/motor.antigo"
[ -d "$APP/motor" ] && mv "$APP/motor" "$APP/motor.antigo"
mv "$APP/motor.novo" "$APP/motor"
cp "$RAIZ/whatsapp-cloud/gateway.ts" "$APP/gateway.ts"
echo '{ "private": true, "type": "module" }' > "$APP/package.json"
chown -R root:root "$APP"

echo "== Configuração"
if [ ! -f "$CONF/gateway.env" ]; then
  [ -n "$USUARIOS" ] || { echo "Na primeira vez, diga quem pode usar: sudo bash whatsapp-cloud/instalar.sh gabriel"; exit 1; }
  cat > "$CONF/gateway.env" <<EOF
PORT=$PORTA_GATEWAY
HOST=127.0.0.1
SUPABASE_URL=$SUPABASE_URL_PADRAO
SUPABASE_ANON_KEY=$SUPABASE_KEY_PADRAO
# Quem usa o WhatsApp na nuvem: usuário de login da XS ou id da conta, separados por vírgula
XS_CLOUD_USUARIOS=$USUARIOS
# Sessões (um WhatsApp cada): nome:porta do Motor
XS_CLOUD_SESSOES=$SESSAO:$PORTA_MOTOR
XS_CLOUD_DADOS=$DADOS
NODE_NO_WARNINGS=1
EOF
elif [ -n "$USUARIOS" ]; then
  sed -i "s/^XS_CLOUD_USUARIOS=.*/XS_CLOUD_USUARIOS=$USUARIOS/" "$CONF/gateway.env"
fi
# Um WhatsApp por conta (acrescenta em instalações antigas sem mexer no que já foi ajustado)
grep -q '^XS_CLOUD_TODOS=' "$CONF/gateway.env" || cat >> "$CONF/gateway.env" <<EOF
# As outras contas com plano em dia ganham o próprio WhatsApp (1 = sim, 0 = só as da lista acima)
XS_CLOUD_TODOS=1
# Máximo de WhatsApps de outras contas ligados ao mesmo tempo (cada um gasta ~100 MB de memória)
XS_CLOUD_MAX=5
XS_CLOUD_PORTA_INICIAL=3100
EOF
chmod 640 "$CONF/gateway.env"
chgrp xswhatsapp "$CONF/gateway.env"
# Um arquivo por sessão: no futuro, outra sessão = outro arquivo + systemctl enable --now xs-whatsapp-motor@<nome>
[ -f "$CONF/motor-$SESSAO.env" ] || echo "XS_PORT=$PORTA_MOTOR" > "$CONF/motor-$SESSAO.env"

echo "== Serviços (sobem sozinhos com a VPS e reiniciam se cair)"
cat > /etc/systemd/system/xs-whatsapp-motor@.service <<EOF
[Unit]
Description=Motor WhatsApp XS na nuvem (sessão %i)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=xswhatsapp
Group=xswhatsapp
# Porta: a do dono fica em /etc; a de cada conta, o gateway escreve em $DADOS/portas
EnvironmentFile=-$CONF/motor-%i.env
EnvironmentFile=-$DADOS/portas/%i.env
Environment=XS_STORAGE=$DADOS/%i
# Agendamentos, saudação (Bom dia/Boa tarde) e logs no horário de Brasília, seja qual for o país da VPS
Environment=TZ=America/Sao_Paulo
Environment=NODE_ENV=production
Environment=NODE_NO_WARNINGS=1
WorkingDirectory=$APP/motor
ExecStart=/usr/bin/node $APP/motor/motor.cjs
Restart=always
RestartSec=5
TimeoutStopSec=20
MemoryMax=500M
StandardOutput=append:$LOGS/motor-%i.log
StandardError=append:$LOGS/motor-%i.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DADOS/%i

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/xs-whatsapp-gateway.service <<EOF
[Unit]
Description=Gateway do WhatsApp na nuvem da XS (confere o login e repassa ao Motor)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=xswhatsapp
Group=xswhatsapp
EnvironmentFile=$CONF/gateway.env
Environment=TZ=America/Sao_Paulo
ExecStart=/usr/bin/node $APP/gateway.ts
Restart=always
RestartSec=3
StandardOutput=append:$LOGS/gateway.log
StandardError=append:$LOGS/gateway.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
# Cria a pasta e a porta de cada conta nova (sessoes.json, portas/, <sessão>/)
ReadWritePaths=$DADOS

[Install]
WantedBy=multi-user.target
EOF

# O gateway (usuário xswhatsapp) pode ligar e desligar só os Motores da nuvem, nada mais
install -d -m 755 /etc/polkit-1/rules.d
cat > /etc/polkit-1/rules.d/50-xs-whatsapp.rules <<'EOF'
// XS: o gateway do WhatsApp na nuvem liga/desliga só os serviços xs-whatsapp-motor@<sessão>
polkit.addRule(function (action, subject) {
  if (action.id === "org.freedesktop.systemd1.manage-units" && subject.user === "xswhatsapp") {
    var unit = action.lookup("unit") || "";
    var verb = action.lookup("verb") || "";
    if (/^xs-whatsapp-motor@[a-z0-9_-]+\.service$/.test(unit) && (verb === "start" || verb === "stop" || verb === "restart")) {
      return polkit.Result.YES;
    }
  }
});
EOF

cat > /etc/logrotate.d/xs-whatsapp <<EOF
$LOGS/*.log {
	weekly
	rotate 8
	compress
	missingok
	notifempty
	copytruncate
}
EOF

# Caddy: /whatsapp/* vai para o gateway (HTTPS). O resto do Caddyfile continua como está.
if ! grep -q 'handle_path /whatsapp/\*' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-do-whatsapp
  awk -v porta="$PORTA_GATEWAY" '!feito && /^[[:space:]]*handle[[:space:]]*\{/ { print "\thandle_path /whatsapp/* {"; print "\t\treverse_proxy 127.0.0.1:" porta; print "\t}"; feito=1 } { print }' \
    /etc/caddy/Caddyfile.antes-do-whatsapp > /etc/caddy/Caddyfile
  if ! grep -q 'handle_path /whatsapp/\*' /etc/caddy/Caddyfile || ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    cp /etc/caddy/Caddyfile.antes-do-whatsapp /etc/caddy/Caddyfile
    echo "Não consegui colocar /whatsapp no Caddy sozinho (o arquivo voltou como estava). Me mande o /etc/caddy/Caddyfile."
    exit 1
  fi
  CADDY_MUDOU=1
fi

systemctl daemon-reload
systemctl enable xs-whatsapp-motor@$SESSAO.service xs-whatsapp-gateway.service >/dev/null
systemctl restart polkit 2>/dev/null || true
# Código novo em todos os Motores ligados (os das contas voltam com o gateway, se tiverem WhatsApp salvo)
systemctl try-restart 'xs-whatsapp-motor@*.service' || true
systemctl restart xs-whatsapp-motor@$SESSAO.service xs-whatsapp-gateway.service
[ -n "${CADDY_MUDOU:-}" ] && { systemctl reload caddy || systemctl restart caddy; }
rm -rf "$APP/motor.antigo"

sleep 4
echo
curl -fsS "http://127.0.0.1:$PORTA_GATEWAY/saude" && echo "  ← gateway e Motor respondendo"
DOMINIO="$(grep -m1 -oE '^[^[:space:]#{]+' /etc/caddy/Caddyfile)"
curl -fsS "https://$DOMINIO/whatsapp/saude" >/dev/null && echo "https://$DOMINIO/whatsapp/saude ← pela internet (HTTPS)"
echo
echo "Pronto. Logs: tail -f $LOGS/*.log    Situação: systemctl status xs-whatsapp-motor@$SESSAO xs-whatsapp-gateway"
