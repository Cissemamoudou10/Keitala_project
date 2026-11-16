# Déploiement — ERP Keitala (D-037)

| Partie | Où | Adresse |
| :--- | :--- | :--- |
| App Next.js | Vercel (projet `keitala`, dossier racine `developpement/app`, Node 24, fonctions `fra1`) | https://keitala-negoce.vercel.app |
| API FastAPI + PostgreSQL 16 | VPS Hetzner `162.55.158.90`, `/opt/apps/keitala/` | `https://keitala-api.162-55-158-90.sslip.io` |
| Reverse proxy HTTPS (Caddy) | même VPS, `/opt/apps/caddy/`, partagé entre applications | ports 80 et 443 |

Accès au serveur : `ssh deploy@162.55.158.90` (clé, voir `C:\Users\cisse\dev\VPS\Hetzner\CLAUDE.md`).

## Sécurité

- Seul Caddy est publié. L'API et la base sont sur des réseaux Docker internes ; la base n'est jamais exposée.
- **Clé de proxy** : Caddy refuse (403) toute requête vers l'API sans l'en-tête `X-Cle-Proxy`. Seul le serveur Next (Vercel) la connaît (`API_CLE_PROXY`) : le navigateur et le reste d'Internet ne peuvent pas joindre l'API directement. Même valeur dans `/opt/apps/caddy/.env` (`KEITALA_CLE_PROXY`) et dans Vercel.
- Secrets générés sur le serveur par `generer-env.sh` (`openssl rand -hex 32`), `chmod 600`, jamais dans le dépôt.
- `ENV=prod`, `DEBUG=false` : documentation `/docs` désactivée, clé secrète obligatoire.
- Adresse sslip.io (service DNS tiers qui renvoie l'IP contenue dans le nom) : provisoire, à remplacer par un vrai domaine avant la mise en service réelle (P-007).

## Premier déploiement

```bash
# Sur le poste, depuis la racine du dépôt (code commité seulement)
bash developpement/deploiement/deployer.sh          # s'arrête : pas encore de .env
ssh deploy@162.55.158.90 "bash /opt/apps/keitala/generer-env.sh"
bash developpement/deploiement/deployer.sh          # construit, migre, démarre
# Premier Super Admin (mot de passe saisi au clavier, jamais en argument)
ssh -t deploy@162.55.158.90 "cd /opt/apps/keitala && docker compose exec api uv run --frozen --no-sync python -m app.commandes.creer_super_admin --nom '…' --email …"
# Sauvegarde quotidienne à 2 h 30
ssh deploy@162.55.158.90 '(crontab -l 2>/dev/null; echo "30 2 * * * bash /opt/apps/keitala/sauvegarde.sh >> /opt/backups/keitala.log 2>&1") | crontab -'
```

Vercel : variables d'environnement serveur `API_URL=https://keitala-api.162-55-158-90.sslip.io` et `API_CLE_PROXY` (type *sensitive*), puis redéploiement.

## Mises à jour

- API : commiter, puis `bash developpement/deploiement/deployer.sh` (les migrations s'appliquent au démarrage). L'ancienne version reste dans `/opt/apps/keitala/api.ancienne` ; version en place : `/opt/apps/keitala/VERSION`.
- App : `git push` sur `main` ; Vercel reconstruit tout seul.

## Vérifier

```bash
ssh deploy@162.55.158.90 "cd /opt/apps/keitala && docker compose ps && docker compose logs --tail 50 api"
curl -s -o /dev/null -w '%{http_code}\n' https://keitala-api.162-55-158-90.sslip.io/api/v1/sante   # 403 attendu : pas de clé
```

## Sauvegardes et restauration

- `sauvegarde.sh` : `pg_dump` compressé dans `/opt/backups/keitala/`, 14 jours gardés. **Copie hors serveur à mettre en place (P-023)** ; en attendant : `scp deploy@162.55.158.90:/opt/backups/keitala/<fichier> .`
- Restauration (sur une base vide) :
  ```bash
  gunzip -c keitala-AAAA-MM-JJ-HHMM.sql.gz | docker compose exec -T db psql -U keitala keitala
  ```
