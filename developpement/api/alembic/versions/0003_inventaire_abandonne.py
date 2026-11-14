"""statut ANNULE pour un inventaire abandonné

Un inventaire ouvert par erreur bloquait l'ouverture d'un autre et ne pouvait que se
valider (P-018). Il peut désormais être abandonné : statut ANNULE, aucun mouvement de
stock, numéro conservé (rien n'est supprimé, AGENTS.md règle 5) ; le motif est ajouté
aux observations (D-029).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-14

"""

from __future__ import annotations

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE statut_inventaire_enum ADD VALUE IF NOT EXISTS 'ANNULE'")


def downgrade() -> None:
    # PostgreSQL ne retire pas une valeur d'un type énuméré : on recrée le type.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM inventaires WHERE statut = 'ANNULE') THEN
                RAISE EXCEPTION 'Des inventaires abandonnés existent : retour arrière impossible';
            END IF;
        END $$;
        """
    )
    # La contrainte compare le statut à une valeur du type : elle est recréée à l'identique
    op.execute("ALTER TABLE inventaires DROP CONSTRAINT chk_inventaire_validation")
    op.execute("ALTER TABLE inventaires ALTER COLUMN statut DROP DEFAULT")
    op.execute("ALTER TYPE statut_inventaire_enum RENAME TO statut_inventaire_enum_ancien")
    op.execute("CREATE TYPE statut_inventaire_enum AS ENUM ('EN_COURS', 'VALIDE')")
    op.execute(
        "ALTER TABLE inventaires ALTER COLUMN statut TYPE statut_inventaire_enum "
        "USING statut::text::statut_inventaire_enum"
    )
    op.execute("ALTER TABLE inventaires ALTER COLUMN statut SET DEFAULT 'EN_COURS'")
    op.execute("DROP TYPE statut_inventaire_enum_ancien")
    op.execute(
        "ALTER TABLE inventaires ADD CONSTRAINT chk_inventaire_validation "
        "CHECK ((statut = 'VALIDE') = (valide_le IS NOT NULL))"
    )
