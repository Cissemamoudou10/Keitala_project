from pydantic import BaseModel, Field

from app.schemas.utilisateurs import UtilisateurLecture


class Identifiants(BaseModel):
    # Pas de validation de format ici : un email mal saisi doit donner le même
    # message qu'un mauvais mot de passe, pas une erreur de validation.
    email: str = Field(min_length=1, max_length=150)
    mot_de_passe: str = Field(min_length=1, max_length=128)


class DemandeRafraichissement(BaseModel):
    jeton_rafraichissement: str = Field(min_length=1)


class Jetons(BaseModel):
    """Réponse de connexion, destinée au proxy Next.js qui pose les cookies."""

    jeton_acces: str
    jeton_rafraichissement: str
    # Durées de vie en secondes, pour l'expiration des cookies
    duree_acces: int
    duree_rafraichissement: int
    utilisateur: UtilisateurLecture
