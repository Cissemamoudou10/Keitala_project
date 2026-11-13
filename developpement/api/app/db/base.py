from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base déclarative. Importer `app.models` pour enregistrer toutes les tables."""
