import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Index, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.colonnes import CASCADE, date_creation, fk_uuid, pg_enum, uuid_pk
from app.models.enums import FamilleArticle


class Article(Base):
    """Stock, seuil et coût toujours exprimés en unité de base (unite_base)."""

    __tablename__ = "articles"
    __table_args__ = (Index("idx_articles_famille", "famille"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    code_sku: Mapped[str] = mapped_column(String(50), unique=True)
    designation: Mapped[str] = mapped_column(String(200))
    famille: Mapped[FamilleArticle] = mapped_column(pg_enum(FamilleArticle, "famille_article_enum"))
    categorie_code: Mapped[str | None] = mapped_column(String(10))
    contenance: Mapped[str | None] = mapped_column(String(50))
    unite_base: Mapped[str] = mapped_column(String(20))
    stock_actuel: Mapped[Decimal] = mapped_column(Numeric(15, 3), server_default=text("0"))
    stock_minimum: Mapped[Decimal] = mapped_column(Numeric(15, 3), server_default=text("0"))
    cout_moyen: Mapped[Decimal] = mapped_column(Numeric(15, 4), server_default=text("0"))
    prix_vente_standard: Mapped[Decimal] = mapped_column(Numeric(15, 2), server_default=text("0"))
    autoriser_stock_negatif: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    est_actif: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    date_creation: Mapped[datetime] = date_creation()

    unites: Mapped[list["ArticleUnite"]] = relationship(back_populates="article")


class ArticleUnite(Base):
    """Unité de saisie secondaire (ex. « Sac 50 kg », facteur 50 vers le kg)."""

    __tablename__ = "article_unites"
    __table_args__ = (UniqueConstraint("article_id", "libelle"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    article_id: Mapped[uuid.UUID] = fk_uuid("articles.id", ondelete=CASCADE)
    libelle: Mapped[str] = mapped_column(String(50))
    facteur_vers_base: Mapped[Decimal] = mapped_column(Numeric(12, 4))

    article: Mapped[Article] = relationship(back_populates="unites")
