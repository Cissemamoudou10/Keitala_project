"""S1-T1 : création du premier Super Admin, sur une base où il n'en existe aucun.

Usage (dans le conteneur, AGENTS.md section 10) :
    docker exec -it keitala_api uv run --frozen python -m app.commandes.creer_super_admin \\
        --nom "Awa Keita" --email awa@keitala.ml

Le mot de passe est demandé au clavier (deux fois), jamais passé en argument : il
finirait dans l'historique du terminal. Pour un script, `--mot-de-passe-stdin` le lit
sur l'entrée standard.
"""

import argparse
import asyncio
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.erreurs import ErreurMetier
from app.services.utilisateurs import SuperAdminDejaPresent, creer_premier_super_admin


def _lire_mot_de_passe(depuis_stdin: bool) -> str:
    if depuis_stdin:
        return sys.stdin.readline().rstrip("\n")
    premier = getpass.getpass("Mot de passe (8 caractères au moins) : ")
    if getpass.getpass("Confirmez le mot de passe : ") != premier:
        sys.exit("Les deux mots de passe sont différents. Rien n'a été créé.")
    return premier


async def _executer(nom: str, email: str, mot_de_passe: str) -> int:
    moteur = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with AsyncSession(moteur, expire_on_commit=False) as session:
            utilisateur = await creer_premier_super_admin(session, nom, email, mot_de_passe)
    except SuperAdminDejaPresent:
        print("Un Super Admin existe déjà : créez les autres comptes dans l'application.")
        return 1
    except ValidationError as erreur:
        champs = ", ".join(str(e["loc"][0]) for e in erreur.errors())
        print(f"Valeur refusée ({champs}). Rien n'a été créé.")
        return 1
    except ErreurMetier as erreur:
        print(erreur.message)
        return 1
    finally:
        await moteur.dispose()
    print(f"Super Admin créé : {utilisateur.nom_complet} <{utilisateur.email}>.")
    return 0


def main() -> None:
    parseur = argparse.ArgumentParser(description="Crée le premier Super Admin.")
    parseur.add_argument("--nom", required=True, help="Nom complet")
    parseur.add_argument("--email", required=True, help="Adresse de connexion")
    parseur.add_argument(
        "--mot-de-passe-stdin",
        action="store_true",
        help="Lire le mot de passe sur l'entrée standard (scripts)",
    )
    arguments = parseur.parse_args()
    mot_de_passe = _lire_mot_de_passe(arguments.mot_de_passe_stdin)
    sys.exit(asyncio.run(_executer(arguments.nom, arguments.email, mot_de_passe)))


if __name__ == "__main__":
    main()
