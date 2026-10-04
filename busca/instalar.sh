#!/usr/bin/env bash
# Instala o servidor de busca da XS numa VPS Ubuntu (testado na HostMF, x86, 2 GB; serve também na Oracle).
#
#   Na VM, dentro da pasta com os arquivos busca/*.ts e este script:
#   sudo bash instalar.sh 129-151-10-20.sslip.io
#
# O domínio pode ser o IP com traços + ".sslip.io" (grátis, aponta para o próprio IP).
# Depois: sudo systemctl start xs-busca-importar   (primeira importação, ~20–40 min)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMINIO="${1:?Informe o domínio. Ex.: sudo bash instalar.sh 129-151-10-20.sslip.io}"
APP=/opt/xs-busca
DADOS=/var/lib/xs-busca
AQUI="$(cd "$(dirname "$0")" && pwd)"

echo "== Pacotes (Node 24, unzip, Caddy)"
apt-get update -y
apt-get install -y curl unzip ca-certificates gnupg openssl debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent iptables-persistent
if ! node -v 2>/dev/null | grep -qE '^v(2[4-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== Memória extra (swap) para servidores pequenos"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "== Usuário, pastas e código"
id xsbusca >/dev/null 2>&1 || useradd --system --home-dir "$DADOS" --shell /usr/sbin/nologin xsbusca
mkdir -p "$APP" "$DADOS"
cp "$AQUI"/*.ts "$APP"/
chown -R xsbusca:xsbusca "$DADOS"

# Senha que só este servidor e a Vercel conhecem (gerada uma vez)
if [ ! -f /etc/xs-busca.env ]; then
  {
    echo "XS_BUSCA_TOKEN=$(openssl rand -hex 24)"
    echo "XS_DADOS=$DADOS"
    echo "NODE_NO_WARNINGS=1"
  } > /etc/xs-busca.env
  chmod 600 /etc/xs-busca.env
fi

echo "== Serviços"
cat > /etc/systemd/system/xs-busca.service <<EOF
[Unit]
Description=Busca de empresas da XS
After=network.target

[Service]
User=xsbusca
EnvironmentFile=/etc/xs-busca.env
ExecStart=/usr/bin/node $APP/servidor.ts
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

cat > /etc/systemd/system/xs-busca-importar.service <<EOF
[Unit]
Description=Importa a base aberta do CNPJ para a busca da XS
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=xsbusca
EnvironmentFile=/etc/xs-busca.env
WorkingDirectory=$DADOS
ExecStart=/usr/bin/node $APP/importar.ts --se-novo
Nice=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DADOS
EOF

# A Receita publica uma vez por mês; conferir toda semana basta
cat > /etc/systemd/system/xs-busca-importar.timer <<EOF
[Unit]
Description=Confere toda semana se há base nova do CNPJ

[Timer]
OnCalendar=Mon *-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "== HTTPS (Caddy pega o certificado sozinho)"
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

echo "== Firewall: libera 80 e 443 (algumas imagens, como a da Oracle, bloqueiam tudo menos SSH)"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp; ufw allow 443/tcp; fi
netfilter-persistent save >/dev/null 2>&1 || true

systemctl daemon-reload
systemctl enable --now xs-busca.service xs-ponte.service xs-busca-importar.timer
systemctl restart caddy

echo
echo "Pronto."
echo "  Primeira importação:   sudo systemctl start --no-block xs-busca-importar  (acompanhe: journalctl -fu xs-busca-importar)"
echo "  Endereço para a Vercel: https://$DOMINIO"
echo "  Senha para a Vercel:    sudo grep XS_BUSCA_TOKEN /etc/xs-busca.env"
