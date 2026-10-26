#!/bin/bash
# Desconecta (logout) o WhatsApp de TODAS as sessões da VPS e desliga os serviços.
# Uso na VPS: bash desconectar-todos.sh
DADOS=/var/lib/xs-whatsapp
CONF=/etc/xs-whatsapp
for dir in "$DADOS"/*/; do
  s=$(basename "$dir")
  [ -f "$dir/whatsapp_auth/creds.json" ] || continue
  porta=$(cat "$CONF/motor-$s.env" "$DADOS/portas/$s.env" 2>/dev/null | grep -m1 '^XS_PORT=' | cut -d= -f2)
  echo "== $s (porta ${porta:-?})"
  systemctl start "xs-whatsapp-motor@$s"
  for i in $(seq 1 20); do curl -s "http://127.0.0.1:$porta/health" >/dev/null && break; sleep 1; done
  curl -s -X POST "http://127.0.0.1:$porta/whatsapp/desconectar"; echo
  systemctl stop "xs-whatsapp-motor@$s"
  rm -rf "$dir/whatsapp_auth"
done
# A fixa (principal) só sobe com a VPS, e o gateway acha que as automáticas ainda estão ligadas: religa/reinicia
systemctl start xs-whatsapp-motor@principal
systemctl restart xs-whatsapp-gateway
echo "Pronto. Sessões com login restantes:"; ls -d "$DADOS"/*/whatsapp_auth 2>/dev/null || echo "nenhuma"
