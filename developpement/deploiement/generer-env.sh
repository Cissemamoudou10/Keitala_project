#!/usr/bin/env bash
# Génère les secrets de production SUR LE SERVEUR (jamais dans le dépôt), chmod 600.
# Refuse d'écraser un fichier existant. Usage : bash generer-env.sh
set -euo pipefail
cd "$(dirname "$0")"
umask 077

if [ -e /opt/apps/keitala/.env ]; then
  echo "ERREUR : /opt/apps/keitala/.env existe déjà ; rien n'est modifié." >&2
  exit 1
fi
cat > /opt/apps/keitala/.env <<FIN
ENV=prod
DEBUG=false
SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
ALLOWED_ORIGINS=[]
# En-tête de facture FICTIF pour la recette (P-006) : à remplacer par celui du client
ENTREPRISE_NOM=Keitala Négoce
ENTREPRISE_ADRESSE=Rue 312, Porte 45, Hamdallaye ACI 2000, Bamako, Mali
ENTREPRISE_TELEPHONE=20220000
ENTREPRISE_IDENTIFIANTS=NIF : 000000000X · RCCM : MA.BKO.2026.B.0000
ENTREPRISE_MENTIONS=Merci de votre confiance.
FIN

if [ ! -e /opt/apps/caddy/.env ]; then
  echo "KEITALA_CLE_PROXY=$(openssl rand -hex 32)" > /opt/apps/caddy/.env
fi
chmod 600 /opt/apps/keitala/.env /opt/apps/caddy/.env
echo "Secrets générés : /opt/apps/keitala/.env et /opt/apps/caddy/.env (chmod 600)."
