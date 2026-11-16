"""montant des lignes d'achat et de vente arrondi au franc

Les règlements se saisissent en FCFA entiers ; une ligne calculée au centime
(1,5 kg à 333 FCFA = 499,50 FCFA) laissait un reste impossible à solder (P-019, D-031).
PostgreSQL 16 ne sait pas changer l'expression d'une colonne calculée : on la supprime et
on la recrée (aucune vue ne l'utilise). Les totaux des pièces sont recalculés.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-16

"""

from __future__ import annotations

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels = None
depends_on = None

PIECES = (("lignes_achat", "achats", "achat_id"), ("lignes_vente", "ventes", "vente_id"))


def _montant_des_lignes(decimales: int) -> None:
    for lignes, pieces, cle in PIECES:
        op.execute(f"ALTER TABLE {lignes} DROP COLUMN montant_total")
        op.execute(
            f"ALTER TABLE {lignes} ADD COLUMN montant_total DECIMAL(15, 2) "
            f"GENERATED ALWAYS AS (ROUND(quantite * prix_unitaire, {decimales})) STORED"
        )
        # Total de la pièce = somme de ses lignes (un don reste à 0 : ses prix sont à 0)
        op.execute(
            f"UPDATE {pieces} p SET montant_total = s.total FROM ("
            f"SELECT {cle}, SUM(montant_total) AS total FROM {lignes} GROUP BY {cle}"
            f") s WHERE s.{cle} = p.id AND p.montant_total <> s.total"
        )


def upgrade() -> None:
    _montant_des_lignes(0)


def downgrade() -> None:
    _montant_des_lignes(2)
