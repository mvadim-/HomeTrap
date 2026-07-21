"""Add stable apartment and service restore keys.

Revision ID: 20260721_06
Revises: 20260718_05
Create Date: 2026-07-21 14:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260721_06"
down_revision: str | None = "20260718_05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "apartments",
        sa.Column("restore_key", sa.String(length=32), nullable=True),
    )
    op.execute("UPDATE apartments SET restore_key = lower(hex(randomblob(16)))")
    with op.batch_alter_table("apartments") as batch_op:
        batch_op.alter_column(
            "restore_key",
            existing_type=sa.String(length=32),
            nullable=False,
        )
        batch_op.create_unique_constraint(
            "uq_apartments_restore_key",
            ["restore_key"],
        )
    op.add_column(
        "services",
        sa.Column("restore_key", sa.String(length=32), nullable=True),
    )
    op.execute("UPDATE services SET restore_key = lower(hex(randomblob(16)))")
    with op.batch_alter_table("services") as batch_op:
        batch_op.alter_column(
            "restore_key",
            existing_type=sa.String(length=32),
            nullable=False,
        )
        batch_op.create_unique_constraint(
            "uq_services_restore_key",
            ["restore_key"],
        )


def downgrade() -> None:
    with op.batch_alter_table("services") as batch_op:
        batch_op.drop_constraint("uq_services_restore_key", type_="unique")
        batch_op.drop_column("restore_key")
    with op.batch_alter_table("apartments") as batch_op:
        batch_op.drop_constraint("uq_apartments_restore_key", type_="unique")
        batch_op.drop_column("restore_key")
