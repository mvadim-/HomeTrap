"""Enforce one active tenant per apartment.

Revision ID: 20260716_04
Revises: 20260716_03
Create Date: 2026-07-16 15:05:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260716_04"
down_revision: str | None = "20260716_03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_tenants_active_apartment",
        "tenants",
        ["apartment_id"],
        unique=True,
        sqlite_where=sa.text("contract_end IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_tenants_active_apartment", table_name="tenants")
