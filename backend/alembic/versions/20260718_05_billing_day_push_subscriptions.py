"""Add tenant billing day and push subscriptions.

Revision ID: 20260718_05
Revises: 20260716_04
Create Date: 2026-07-18 21:31:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260718_05"
down_revision: str | None = "20260716_04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "billing_day",
            sa.Integer(),
            sa.CheckConstraint(
                "billing_day IS NULL OR billing_day BETWEEN 1 AND 31",
                name="ck_tenants_billing_day",
            ),
            nullable=True,
        ),
    )
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_column("tenants", "billing_day")
