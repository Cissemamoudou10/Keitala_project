"""Format d'erreur unique de l'API : {code, message, details}, message en français."""

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ErreurReponse

logger = logging.getLogger(__name__)


class ErreurMetier(Exception):
    """Erreur prévue, levée par les services (ex. STOCK_INSUFFISANT)."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


_ERREURS_HTTP: dict[int, tuple[str, str]] = {
    401: ("NON_AUTHENTIFIE", "Votre session a expiré. Reconnectez-vous."),
    403: ("ACCES_REFUSE", "Vous n'avez pas les droits pour cette action."),
    404: ("RESSOURCE_INTROUVABLE", "L'élément demandé est introuvable."),
    405: ("METHODE_NON_AUTORISEE", "Cette opération n'est pas permise."),
}

# Traduction des erreurs de validation Pydantic les plus courantes
_MESSAGES_VALIDATION: dict[str, str] = {
    "missing": "Champ obligatoire.",
    "string_too_short": "Texte trop court.",
    "string_too_long": "Texte trop long.",
    "greater_than": "La valeur est trop petite.",
    "greater_than_equal": "La valeur est trop petite.",
    "less_than": "La valeur est trop grande.",
    "less_than_equal": "La valeur est trop grande.",
    "decimal_parsing": "Nombre invalide.",
    "int_parsing": "Nombre entier invalide.",
    "uuid_parsing": "Identifiant invalide.",
    "date_from_datetime_parsing": "Date invalide.",
    "date_parsing": "Date invalide.",
    "enum": "Valeur non autorisée.",
}


def _reponse(status_code: int, erreur: ErreurReponse) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=erreur.model_dump())


async def _erreur_metier(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ErreurMetier)
    return _reponse(
        exc.status_code, ErreurReponse(code=exc.code, message=exc.message, details=exc.details)
    )


async def _erreur_http(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code, message = _ERREURS_HTTP.get(
        exc.status_code, ("ERREUR_REQUETE", "La requête n'a pas pu être traitée.")
    )
    return _reponse(exc.status_code, ErreurReponse(code=code, message=message))


async def _erreur_validation(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details: dict[str, list[str]] = {}
    for erreur in exc.errors():
        # On retire "body"/"query" : le front n'a besoin que du nom du champ
        chemin = [
            str(partie) for partie in erreur["loc"] if partie not in ("body", "query", "path")
        ]
        champ = ".".join(chemin) or "requete"
        message = _MESSAGES_VALIDATION.get(erreur["type"], erreur["msg"])
        details.setdefault(champ, []).append(message)
    return _reponse(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        ErreurReponse(
            code="DONNEES_INVALIDES",
            message="Certains champs sont invalides ou manquants.",
            details=details,
        ),
    )


async def _erreur_inattendue(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Erreur inattendue sur %s %s", request.method, request.url.path)
    return _reponse(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        ErreurReponse(
            code="ERREUR_INTERNE",
            message="Une erreur inattendue est survenue. Votre saisie n'a pas été enregistrée ; "
            "réessayez dans un instant.",
        ),
    )


def enregistrer_gestionnaires_erreurs(app: FastAPI) -> None:
    app.add_exception_handler(ErreurMetier, _erreur_metier)
    app.add_exception_handler(StarletteHTTPException, _erreur_http)
    app.add_exception_handler(RequestValidationError, _erreur_validation)
    app.add_exception_handler(Exception, _erreur_inattendue)
