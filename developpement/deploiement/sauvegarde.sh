#!/usr/bin/env bash
# Sauvegarde quotidienne de la base Keitala (cron de l'utilisateur deploy, 02 h 30).
# Garde 14 jours sur le serveur. Copie hors serveur : voir README (P-023).
set -euo pipefail
DOSSIER=/opt/backups/keitala
mkdir -p "$DOSSIER"
FICHIER="$DOSSIER/keitala-$(date +%Y-%m-%d-%H%M).sql.gz"
cd /opt/apps/keitala
docker compose exec -T db pg_dump -U keitala --no-owner keitala | gzip > "$FICHIER.partiel"
mv "$FICHIER.partiel" "$FICHIER"
find "$DOSSIER" -name 'keitala-*.sql.gz' -mtime +14 -delete
echo "$(date -Iseconds) sauvegarde $FICHIER ($(du -h "$FICHIER" | cut -f1))"
