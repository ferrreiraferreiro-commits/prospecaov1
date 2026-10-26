#!/bin/bash
# Libera a IA no WhatsApp para todas as contas no gateway da VPS (o Xico continua só do dono).
# Muda só uma linha, para não perder o que a VPS já tem (regra das 24 h).
set -e
G=/opt/xs-whatsapp/gateway.ts
cp "$G" "$G.antes-da-ia-para-todos"
sed -i "s#caminho.startsWith('/agente/') \&\& !s.fixa#caminho.startsWith('/agente/xico') \&\& !s.fixa#" "$G"
echo "Linhas trocadas: $(grep -c "startsWith('/agente/xico')" "$G")"
