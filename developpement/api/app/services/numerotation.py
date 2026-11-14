"""Numérotation des pièces PREFIXE-AAAA-NNNN (AGENTS.md, règle 11).

Le compteur est incrémenté par une seule requête (INSERT … ON CONFLICT DO UPDATE …
RETURNING) dans la transaction de la pièce : deux pièces simultanées ne peuvent pas
recevoir le même numéro, et un numéro n'est consommé que si la pièce est enregistrée.
"""

from datetime import date
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

Prefixe = Literal["FAC", "DON", "ACH", "OF", "INV", "DEP", "TRF"]


async def prochain_numero(session: AsyncSession, prefixe: Prefixe, jour: date | None = None) -> str:
    annee = (jour or date.today()).year
    numero = await session.scalar(
        text(
            "INSERT INTO compteurs_documents (prefixe, annee, dernier_numero) "
            "VALUES (:prefixe, :annee, 1) "
            "ON CONFLICT (prefixe, annee) "
            "DO UPDATE SET dernier_numero = compteurs_documents.dernier_numero + 1 "
            "RETURNING dernier_numero"
        ),
        {"prefixe": prefixe, "annee": annee},
    )
    return f"{prefixe}-{annee}-{numero:04d}"
