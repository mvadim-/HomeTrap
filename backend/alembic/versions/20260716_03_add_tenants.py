"""Add tenants and contract attachments.

Revision ID: 20260716_03
Revises: 20260714_02
Create Date: 2026-07-16 14:20:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260716_03"
down_revision: str | None = "20260714_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("contract_start", sa.Date(), nullable=False),
        sa.Column("contract_end", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["apartment_id"], ["apartments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenants_apartment_id", "tenants", ["apartment_id"])
    op.create_index(
        "ix_tenants_apartment_id_contract_end",
        "tenants",
        ["apartment_id", "contract_end"],
    )
    op.create_table(
        "tenant_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("original_name", sa.String(length=500), nullable=False),
        sa.Column("stored_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tenant_attachments_tenant_id",
        "tenant_attachments",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_attachments_tenant_id", table_name="tenant_attachments")
    op.drop_table("tenant_attachments")
    op.drop_index("ix_tenants_apartment_id_contract_end", table_name="tenants")
    op.drop_index("ix_tenants_apartment_id", table_name="tenants")
    op.drop_table("tenants")
