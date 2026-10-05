#!/usr/bin/env bash
# © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
# Liga a busca na base aberta de comércios (Overture Maps) numa VPS que já tem a busca da XS (instalar.sh).
# Na VPS, dentro da pasta com lugares.ts e lugares-importar.ts:
#   sudo bash instalar-lugares.sh
# Pode rodar de novo para atualizar os arquivos. A primeira importação começa sozinha e leva uns 20–40 min.
set -euo pipefail

APP=/opt/xs-busca
DADOS=/var/lib/xs-busca
AQUI="$(cd "$(dirname "$0")" && pwd)"

[ -d "$APP" ] && [ -f /etc/xs-busca.env ] || { echo "Não achei $APP ou /etc/xs-busca.env. Rode o instalar.sh primeiro."; exit 1; }
cp "$AQUI/lugares.ts" "$AQUI/lugares-importar.ts" "$APP"/

echo "== DuckDB (lê a base da Overture direto do S3 público)"
cd "$APP"
[ -f package.json ] || echo '{ "private": true }' > package.json
npm install --omit=dev --no-audit --no-fund @duckdb/node-api@1.5 >/dev/null
cd - >/dev/null

echo "== Serviços"
cat > /etc/systemd/system/xs-lugares.service <<EOF
[Unit]
Description=Busca na base aberta de comércios da XS (Overture Maps)
After=network.target

[Service]
User=xsbusca
EnvironmentFile=/etc/xs-busca.env
Environment=PORT=8091
ExecStart=/usr/bin/node $APP/lugares.ts
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DADOS

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/xs-lugares-importar.service <<EOF
[Unit]
Description=Importa os comércios do Brasil da Overture Maps para a busca da XS
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=xsbusca
EnvironmentFile=/etc/xs-busca.env
WorkingDirectory=$DADOS
ExecStart=/usr/bin/node $APP/lugares-importar.ts --se-novo
Nice=10
TimeoutStartSec=4h
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DADOS
EOF

# A Overture publica uma versão por mês; conferir toda semana basta
cat > /etc/systemd/system/xs-lugares-importar.timer <<EOF
[Unit]
Description=Confere toda semana se há base nova da Overture

[Timer]
OnCalendar=Tue *-*-* 05:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Caddy: /lugares/* vai para este serviço (o resto continua como estava)
if ! grep -q 'handle_path /lugares/\*' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-dos-lugares
  awk '!feito && /^[[:space:]]*handle[[:space:]]*\{/ { print "\thandle_path /lugares/* {"; print "\t\treverse_proxy 127.0.0.1:8091"; print "\t}"; feito=1 } { print }' \
    /etc/caddy/Caddyfile.antes-dos-lugares > /etc/caddy/Caddyfile
  if ! grep -q 'handle_path /lugares/\*' /etc/caddy/Caddyfile || ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    cp /etc/caddy/Caddyfile.antes-dos-lugares /etc/caddy/Caddyfile
    echo "Não consegui colocar /lugares no Caddy sozinho (o arquivo voltou como estava). Me mande o /etc/caddy/Caddyfile."
    exit 1
  fi
fi

systemctl daemon-reload
systemctl enable --now xs-lugares.service xs-lugares-importar.timer
systemctl restart xs-lugares.service
systemctl reload caddy || systemctl restart caddy
systemctl start --no-block xs-lugares-importar.service

sleep 1
echo
curl -fsS http://127.0.0.1:8091/saude && echo "  ← serviço respondendo"
echo
echo "A importação começou em segundo plano (20–40 min). Para acompanhar:"
echo "  journalctl -fu xs-lugares-importar"
echo "Quando aparecer \"Pronto: … lugares\", a busca grátis já funciona no site."
