"""coût unitaire des lignes d'inventaire (stock de départ)

Le stock de départ est saisi par un inventaire (D-018), alors que le coût moyen de chaque
article est encore à 0. Sans coût saisi, ce stock vaudrait 0 FCFA et diluerait le coût
moyen au premier achat. La ligne d'inventaire porte donc, au besoin, le coût unitaire
de l'excédent constaté (D-028).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-14

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lignes_inventaire",
        sa.Column("cout_unitaire", sa.Numeric(15, 4), nullable=True),
    )
    op.create_check_constraint(
        "chk_ligne_inventaire_cout", "lignes_inventaire", "cout_unitaire >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("chk_ligne_inventaire_cout", "lignes_inventaire", type_="check")
    op.drop_column("lignes_inventaire", "cout_unitaire")
