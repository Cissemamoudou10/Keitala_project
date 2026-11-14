"""Recherche tolérante aux accents et à la casse (charte, section 7 : « attie » trouve
« Attiéké »), sans extension PostgreSQL, donc sans migration."""

from sqlalchemy import ColumnElement, func, or_
from sqlalchemy.orm import QueryableAttribute

# Colonnes texte, y compris facultatives (NULL ne correspond jamais au motif)
Colonne = ColumnElement[str] | QueryableAttribute[str] | QueryableAttribute[str | None]

_AVEC_ACCENTS = "àâäáãåéèêëíìîïóòôöõúùûüçñÿ"
_SANS_ACCENTS = "aaaaaaeeeeiiiiooooouuuucny"
_TABLE = str.maketrans(_AVEC_ACCENTS, _SANS_ACCENTS)


def simplifier(texte: str) -> str:
    """Minuscules sans accents, comme `simplifier_sql` côté base."""
    return texte.lower().translate(_TABLE)


def simplifier_sql(colonne: Colonne) -> ColumnElement[str]:
    return func.translate(func.lower(colonne), _AVEC_ACCENTS, _SANS_ACCENTS)


def contient(recherche: str, *colonnes: Colonne) -> ColumnElement[bool]:
    """Condition : l'une des colonnes contient le texte cherché (accents et casse ignorés)."""
    motif = "%" + simplifier(recherche.strip()).replace("%", r"\%").replace("_", r"\_") + "%"
    return or_(*(simplifier_sql(colonne).like(motif) for colonne in colonnes))
