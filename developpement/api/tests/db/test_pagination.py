from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.pagination import paginer
from app.models import Article
from app.schemas.common import PaginationParams

# Les données initiales contiennent 29 articles
REQUETE = select(Article).order_by(Article.code_sku)


async def test_premiere_page(db_session: AsyncSession) -> None:
    items, total, pages = await paginer(db_session, REQUETE, PaginationParams(page=1, taille=10))
    assert (len(items), total, pages) == (10, 29, 3)


async def test_derniere_page_incomplete(db_session: AsyncSession) -> None:
    items, total, pages = await paginer(db_session, REQUETE, PaginationParams(page=3, taille=10))
    assert (len(items), total, pages) == (9, 29, 3)


async def test_page_au_dela_de_la_fin(db_session: AsyncSession) -> None:
    items, total, _ = await paginer(db_session, REQUETE, PaginationParams(page=9, taille=10))
    assert items == []
    assert total == 29
