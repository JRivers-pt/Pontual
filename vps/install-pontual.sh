#!/bin/bash
# =============================================================
# Pontual VPS - Script de Instalação Completa
# Ubuntu 24.04 LTS | Contabo
# Corre como root: bash /tmp/install-pontual.sh
# =============================================================
set -e

PONTUAL_DIR="/opt/pontual"
BACKUP_FILE="$PONTUAL_DIR/backups/cardpass_backup.sql"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Pontual VPS Setup - Instalação Automática     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── 1. Verificar Docker ─────────────────────────────────────
echo "[1/6] A verificar Docker..."
if ! command -v docker &> /dev/null; then
  echo "  Docker não encontrado. A instalar..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "  ✅ Docker instalado."
else
  echo "  ✅ Docker já instalado: $(docker --version)"
fi

# ─── 2. Firewall - Abrir Porto 5010 ─────────────────────────
echo "[2/6] A configurar Firewall (porto 5010 para relógios Suprema)..."
if command -v ufw &> /dev/null; then
  ufw allow 5010/tcp
  ufw allow 5010/udp
  echo "  ✅ Porto 5010 TCP+UDP aberto."
else
  echo "  ⚠️  UFW não encontrado. Adiciona manualmente o porto 5010."
fi

# ─── 3. Criar estrutura de pastas ────────────────────────────
echo "[3/6] A criar estrutura de pastas..."
mkdir -p "$PONTUAL_DIR/backups"
mkdir -p "$PONTUAL_DIR/agent"
echo "  ✅ Pastas criadas em $PONTUAL_DIR"

# ─── 4. Copiar ficheiros do agente ───────────────────────────
echo "[4/6] A copiar ficheiros do Agente Pontual..."
# Os ficheiros devem estar em /tmp/pontual-agent/
if [ -d "/tmp/pontual-agent" ]; then
  cp /tmp/pontual-agent/* "$PONTUAL_DIR/agent/"
  echo "  ✅ Ficheiros do agente copiados."
else
  echo "  ⚠️  Pasta /tmp/pontual-agent não encontrada."
  echo "     Copia os ficheiros manualmente para $PONTUAL_DIR/agent/"
fi

# ─── 5. Iniciar Docker Compose ───────────────────────────────
echo "[5/6] A iniciar containers Docker (MySQL + Agente)..."
cd "$PONTUAL_DIR"
docker compose up -d
echo "  ✅ Containers a iniciar..."
echo "  A aguardar MySQL ficar pronto (30 seg)..."
sleep 30

# ─── 6. Importar Backup se existir ───────────────────────────
echo "[6/6] A verificar backup da base de dados..."
if [ -f "$BACKUP_FILE" ]; then
  echo "  Backup encontrado! A importar cardpass3..."
  docker exec -i pontual-mysql mysql \
    -u pontual -pPontual2026! cardpass3 < "$BACKUP_FILE"
  echo "  ✅ Backup importado com sucesso!"
else
  echo "  ⚠️  Backup não encontrado em $BACKUP_FILE"
  echo "     Copia o ficheiro SQL para $PONTUAL_DIR/backups/cardpass_backup.sql"
  echo "     e corre: docker exec -i pontual-mysql mysql -u pontual -pPontual2026! cardpass3 < $BACKUP_FILE"
fi

# ─── Resumo Final ────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   INSTALAÇÃO CONCLUÍDA!                         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  MySQL:                                          ║"
echo "║    Host     : 127.0.0.1:3306                    ║"
echo "║    Database : cardpass3                          ║"
echo "║    User     : pontual                            ║"
echo "║    Password : Pontual2026!                       ║"
echo "║                                                  ║"
echo "║  Porto 5010 aberto para os relógios Suprema     ║"
echo "║                                                  ║"
echo "║  Comandos úteis:                                 ║"
echo "║    docker logs pontual-agent -f   (ver logs)    ║"
echo "║    docker compose restart         (reiniciar)   ║"
echo "║    docker ps                      (estado)      ║"
echo "║                                                  ║"
echo "║  Próximo passo:                                  ║"
echo "║    Alterar Server IP nos relógios para:          ║"
echo "║    169.58.201.101                                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
