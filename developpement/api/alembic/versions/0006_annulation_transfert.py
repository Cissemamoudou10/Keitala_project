"""annulation d'un transfert entre comptes

Le schéma v1.1 ne prévoyait pas d'annuler un transfert (on refaisait un transfert
inverse). À la demande de l'utilisateur (D-034), un transfert s'annule comme les autres
pièces : statut ANNULE, auteur, date et motif, contre-passation sur les deux comptes.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-16

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels = None
depends_on = None

STATUT = postgresql.ENUM(name="statut_document_enum", create_type=False)


def upgrade() -> None:
    op.add_column(
        "transferts_internes",
        sa.Column("statut", STATUT, nullable=False, server_default="VALIDE"),
    )
    op.add_column(
        "transferts_internes",
        sa.Column("annule_par", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "transferts_internes",
        sa.Column("annule_le", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column("transferts_internes", sa.Column("motif_annulation", sa.Text(), nullable=True))
    op.create_foreign_key(
        "transferts_internes_annule_par_fkey",
        "transferts_internes",
        "utilisateurs",
        ["annule_par"],
        ["id"],
    )
    op.create_check_constraint(
        "chk_transfert_annulation",
        "transferts_internes",
        "(statut = 'ANNULE') = (annule_le IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("chk_transfert_annulation", "transferts_internes", type_="check")
    op.drop_constraint(
        "transferts_internes_annule_par_fkey", "transferts_internes", type_="foreignkey"
    )
    for colonne in ("motif_annulation", "annule_le", "annule_par", "statut"):
        op.drop_column("transferts_internes", colonne)
