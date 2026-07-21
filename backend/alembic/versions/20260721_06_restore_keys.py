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


def _ensure_restore_key(table_name: str, constraint_name: str) -> None:
    bind = op.get_bind()
    columns = {
        column["name"]: column
        for column in sa.inspect(bind).get_columns(table_name)
    }
    if "restore_key" not in columns:
        op.add_column(
            table_name,
            sa.Column("restore_key", sa.String(length=32), nullable=True),
        )
        columns = {
            column["name"]: column
            for column in sa.inspect(bind).get_columns(table_name)
        }

    op.execute(
        sa.text(
            f"UPDATE {table_name} "
            "SET restore_key = lower(hex(randomblob(16))) "
            "WHERE restore_key IS NULL"
        )
    )
    unique_exists = any(
        constraint["column_names"] == ["restore_key"]
        for constraint in sa.inspect(bind).get_unique_constraints(table_name)
    )
    if columns["restore_key"]["nullable"] or not unique_exists:
        with op.batch_alter_table(table_name) as batch_op:
            if columns["restore_key"]["nullable"]:
                batch_op.alter_column(
                    "restore_key",
                    existing_type=sa.String(length=32),
                    nullable=False,
                )
            if not unique_exists:
                batch_op.create_unique_constraint(
                    constraint_name,
                    ["restore_key"],
                )


def upgrade() -> None:
    _ensure_restore_key(
        "apartments",
        "uq_apartments_restore_key",
    )
    _ensure_restore_key(
        "services",
        "uq_services_restore_key",
    )


def downgrade() -> None:
    with op.batch_alter_table("services") as batch_op:
        batch_op.drop_constraint("uq_services_restore_key", type_="unique")
        batch_op.drop_column("restore_key")
    with op.batch_alter_table("apartments") as batch_op:
        batch_op.drop_constraint("uq_apartments_restore_key", type_="unique")
        batch_op.drop_column("restore_key")
