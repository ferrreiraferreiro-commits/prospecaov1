#!/bin/bash
# Apaga as conversas salvas (tela Conversas e vendedor IA) de TODAS as sessões da VPS.
# Mantém o login do WhatsApp e a configuração/treino da IA. Uso na VPS: bash apagar-conversas.sh
DADOS=/var/lib/xs-whatsapp
# Os serviços regravam o que têm na memória: desliga todos antes de apagar
systemctl stop 'xs-whatsapp-motor@*'
for dir in "$DADOS"/*/; do
  rm -f "$dir"conversas.json "$dir"agente-conversas.json "$dir"agente-fila.json "$dir"agente-pendencias.json \
    "$dir"agente-atividade.json "$dir"agente-reativar.json "$dir"agente-diario.json "$dir"agente-dias.json
done
systemctl start xs-whatsapp-motor@principal
systemctl restart xs-whatsapp-gateway
echo "Pronto. Conversas restantes:"; ls "$DADOS"/*/conversas.json 2>/dev/null || echo "nenhuma"
