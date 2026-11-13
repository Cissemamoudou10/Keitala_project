from typing import Any

from pydantic import BaseModel, Field


class ErreurReponse(BaseModel):
    code: str = Field(description="Code d'erreur stable, lu par l'application")
    message: str = Field(description="Message en français, prêt à afficher")
    details: dict[str, Any] | None = Field(default=None, description="Contexte facultatif")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, description="Numéro de page, à partir de 1")
    taille: int = Field(default=50, ge=1, le=200, description="Nombre d'éléments par page")


class PageReponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    taille: int
    pages_total: int
