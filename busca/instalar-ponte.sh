#!/usr/bin/env bash
# Liga a ponte do Motor WhatsApp XS numa VPS que já tem a busca instalada (instalar.sh).
# Na VPS, dentro da pasta com os arquivos .ts:
#   sudo bash instalar-ponte.sh
# Pode rodar de novo para atualizar o ponte.ts.
set -euo pipefail

APP=/opt/xs-busca
AQUI="$(cd "$(dirname "$0")" && pwd)"

[ -d "$APP" ] || { echo "Não achei $APP. Rode o instalar.sh primeiro."; exit 1; }
cp "$AQUI/ponte.ts" "$APP/ponte.ts"

cat > /etc/systemd/system/xs-ponte.service <<EOF
[Unit]
Description=Ponte do Motor WhatsApp XS (site <-> motor no computador da pessoa)
After=network.target

[Service]
User=xsbusca
Environment=PORT=8090
Environment=NODE_NO_WARNINGS=1
ExecStart=/usr/bin/node $APP/ponte.ts
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Caddy: /ponte/* vai para a ponte, o resto continua indo para a busca
if ! grep -q 'handle_path /ponte/\*' /etc/caddy/Caddyfile; then
  DOMINIO="$(grep -m1 -oE '^[^[:space:]#{]+' /etc/caddy/Caddyfile)"
  [ -n "$DOMINIO" ] || { echo "Não achei o domínio no /etc/caddy/Caddyfile."; exit 1; }
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.antes-da-ponte"
  cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
	encode gzip
	handle_path /ponte/* {
		reverse_proxy 127.0.0.1:8090
	}
	handle {
		reverse_proxy 127.0.0.1:8080
	}
}
EOF
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
fi

systemctl daemon-reload
systemctl enable xs-ponte.service
systemctl restart xs-ponte.service
systemctl reload caddy || systemctl restart caddy

sleep 1
echo
curl -fsS http://127.0.0.1:8090/saude && echo "  ← ponte respondendo"
