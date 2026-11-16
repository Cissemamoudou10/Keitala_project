from typing import Any

from sqlalchemy import Row, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import PaginationParams


async def paginer[T](
    session: AsyncSession, requete: Select[T], pagination: PaginationParams
) -> tuple[list[T], int, int]:
    """Exécute une requête par page. Renvoie (éléments, total, nombre de pages).

    La requête doit avoir un ORDER BY stable, sinon les pages peuvent se recouvrir.
    """
    requete_total: Select[Any] = select(func.count()).select_from(requete.order_by(None).subquery())
    total = (await session.execute(requete_total)).scalar_one()
    decalage = (pagination.page - 1) * pagination.taille
    resultat = await session.execute(requete.limit(pagination.taille).offset(decalage))
    pages_total = max(1, -(-total // pagination.taille))
    return list(resultat.scalars().all()), total, pages_total


async def paginer_lignes[*T](
    session: AsyncSession, requete: Select[*T], pagination: PaginationParams
) -> tuple[list[Row[*T]], int, int]:
    """Comme `paginer`, pour une requête à plusieurs colonnes : renvoie les lignes entières."""
    requete_total: Select[Any] = select(func.count()).select_from(requete.order_by(None).subquery())
    total = (await session.execute(requete_total)).scalar_one()
    decalage = (pagination.page - 1) * pagination.taille
    resultat = await session.execute(requete.limit(pagination.taille).offset(decalage))
    pages_total = max(1, -(-total // pagination.taille))
    return list(resultat.all()), total, pages_total
