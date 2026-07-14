"""Snapshot service kind on invoice lines.

Revision ID: 20260714_02
Revises: 20260714_01
Create Date: 2026-07-14 20:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260714_02"
down_revision: str | None = "20260714_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "invoice_lines",
        sa.Column("service_kind", sa.String(length=20), nullable=True),
    )
    op.execute(
        """
        UPDATE invoice_lines
        SET service_kind = (
            SELECT services.kind FROM services WHERE services.id = invoice_lines.service_id
        )
        """
    )
    with op.batch_alter_table("invoice_lines") as batch_op:
        batch_op.alter_column("service_kind", existing_type=sa.String(length=20), nullable=False)
        batch_op.create_check_constraint(
            "ck_invoice_lines_service_kind",
            "service_kind IN ('metered', 'fixed')",
        )


def downgrade() -> None:
    with op.batch_alter_table("invoice_lines") as batch_op:
        batch_op.drop_constraint("ck_invoice_lines_service_kind", type_="check")
        batch_op.drop_column("service_kind")
