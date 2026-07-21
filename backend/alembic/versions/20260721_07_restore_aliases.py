"""Add durable restore identity aliases.

Revision ID: 20260721_07
Revises: 20260721_06
Create Date: 2026-07-21 15:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260721_07"
down_revision: str | None = "20260721_06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "restore_aliases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("restore_key", sa.String(length=32), nullable=False),
        sa.Column("target_restore_key", sa.String(length=32), nullable=False),
        sa.CheckConstraint(
            "entity_type IN ('apartment', 'service')",
            name="ck_restore_alias_entity_type",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "entity_type", "restore_key", name="uq_restore_alias_key"
        ),
    )


def downgrade() -> None:
    op.drop_table("restore_aliases")
