"""Add expenses table.

Revision ID: 20260721_08
Revises: 20260721_07
Create Date: 2026-07-21 16:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260721_08"
down_revision: str | None = "20260721_07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "expenses" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restore_key", sa.String(length=32), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "category IN ('repair', 'tax', 'insurance', 'commission', 'other')",
            name="ck_expenses_category",
        ),
        sa.ForeignKeyConstraint(
            ["apartment_id"], ["apartments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("restore_key", name="uq_expenses_restore_key"),
    )
    op.create_index("ix_expenses_apartment_id", "expenses", ["apartment_id"])


def downgrade() -> None:
    op.drop_index("ix_expenses_apartment_id", table_name="expenses")
    op.drop_table("expenses")
