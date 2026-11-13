"""Aides pour déclarer les colonnes récurrentes du schéma.

Les modèles décrivent `schema.sql` v1.1 sans le remplacer : la base est créée par la
migration 0001. Les contraintes CHECK, déclencheurs et vues vivent dans cette migration ;
les modèles reprennent seulement ce qu'Alembic compare (types, nullabilité, clés
étrangères, index) pour que `alembic check` reste muet.
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import MappedColumn, mapped_column

# Règles ON DELETE reprises de schema.sql (absentes = comportement par défaut, NO ACTION)
RESTRICT = "RESTRICT"
CASCADE = "CASCADE"


def pg_enum(enum_class: type[enum.Enum], name: str) -> ENUM:
    """Type énuméré PostgreSQL déjà créé par la migration."""
    return ENUM(enum_class, name=name, create_type=False)


def uuid_pk() -> MappedColumn[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


def date_creation() -> MappedColumn[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


def horodatage_optionnel() -> MappedColumn[datetime | None]:
    return mapped_column(DateTime(timezone=True), nullable=True)


def fk_uuid(
    cible: str, *, nullable: bool = False, ondelete: str | None = None
) -> MappedColumn[Any]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey(cible, ondelete=ondelete), nullable=nullable
    )


def fk_int(cible: str, *, nullable: bool = False, ondelete: str | None = None) -> MappedColumn[Any]:
    return mapped_column(Integer, ForeignKey(cible, ondelete=ondelete), nullable=nullable)


def fk_bigint(
    cible: str, *, nullable: bool = False, ondelete: str | None = None
) -> MappedColumn[Any]:
    return mapped_column(BigInteger, ForeignKey(cible, ondelete=ondelete), nullable=nullable)
