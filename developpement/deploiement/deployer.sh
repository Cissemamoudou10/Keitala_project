#!/usr/bin/env bash
# Déploie l'API depuis le poste : envoie EXACTEMENT le code commité (git archive), puis
# reconstruit et redémarre sur le serveur. Usage, depuis la racine du dépôt :
#   bash developpement/deploiement/deployer.sh
set -euo pipefail
SERVEUR=deploy@162.55.158.90
RACINE=$(git rev-parse --show-toplevel)
cd "$RACINE"

if [ -n "$(git status --porcelain developpement/api developpement/deploiement)" ]; then
  echo "ERREUR : modifications non commitées dans l'API ou le déploiement." >&2
  exit 1
fi
VERSION=$(git rev-parse --short HEAD)
echo "Déploiement de $VERSION vers $SERVEUR"

# 1. Le code de l'API et les fichiers de déploiement, dans des dossiers temporaires
ssh "$SERVEUR" 'mkdir -p /opt/apps/keitala /opt/apps/caddy &&
  rm -rf /opt/apps/keitala/api.nouvelle /tmp/deploiement-keitala &&
  mkdir /opt/apps/keitala/api.nouvelle /tmp/deploiement-keitala'
git archive HEAD:developpement/api | ssh "$SERVEUR" 'tar -x -C /opt/apps/keitala/api.nouvelle'
git archive HEAD:developpement/deploiement | ssh "$SERVEUR" 'tar -x -C /tmp/deploiement-keitala'

# 2. Mise en place, reconstruction et redémarrage (le script distant est entre
#    apostrophes : aucune variable n'est développée sur le poste)
ssh "$SERVEUR" "VERSION=$VERSION bash -s" <<'DISTANT'
set -euo pipefail
D=/tmp/deploiement-keitala
cd /opt/apps/keitala
rm -rf api.ancienne
if [ -d api ]; then mv api api.ancienne; fi
mv api.nouvelle api
echo "$VERSION" > VERSION
cp "$D/docker-compose.yml" "$D/generer-env.sh" "$D/sauvegarde.sh" /opt/apps/keitala/
cp "$D/caddy/docker-compose.yml" "$D/caddy/Caddyfile" /opt/apps/caddy/
rm -rf "$D"
if [ ! -e /opt/apps/keitala/.env ]; then
  echo "Premier déploiement : lancer d'abord bash /opt/apps/keitala/generer-env.sh" >&2
  exit 2
fi
docker compose build api
docker compose up -d
cd /opt/apps/caddy
docker compose up -d
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
DISTANT
echo "Déployé : $VERSION"
