"""clé d'idempotence des pièces (protection contre le double enregistrement)

Avec une connexion instable, une pièce peut être envoyée deux fois (réponse perdue,
nouvel essai). Chaque formulaire génère une clé à son ouverture ; la pièce la garde, avec
unicité : un second envoi avec la même clé renvoie la pièce déjà créée (P-009, D-030).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-14

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels = None
depends_on = None

TABLES = ("achats", "ventes", "reglements", "depenses", "transferts_internes")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("cle_idempotence", UUID(as_uuid=True), nullable=True))
        op.create_unique_constraint(f"uq_{table}_cle_idempotence", table, ["cle_idempotence"])


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(f"uq_{table}_cle_idempotence", table, type_="unique")
        op.drop_column(table, "cle_idempotence")
