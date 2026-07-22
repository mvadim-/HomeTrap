"""Add invoice adjustment lines and linked expenses.

Revision ID: 20260722_09
Revises: 20260721_08
Create Date: 2026-07-22 15:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260722_09"
down_revision: str | None = "20260721_08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _invoice_lines_table(
    *, service_id_nullable: bool, service_kind_check: str
) -> sa.Table:
    """Describe the pre-recreate table so SQLite keeps every constraint/index."""
    metadata = sa.MetaData()
    table = sa.Table(
        "invoice_lines",
        metadata,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=service_id_nullable),
        sa.Column("service_name", sa.String(length=200), nullable=False),
        sa.Column("prev_reading", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("curr_reading", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("consumed", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("tariff_value", sa.Numeric(precision=12, scale=5), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("service_kind", sa.String(length=20), nullable=False),
        sa.CheckConstraint(
            service_kind_check,
            name="ck_invoice_lines_service_kind",
        ),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["invoices.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    sa.Index("ix_invoice_lines_invoice_id", table.c.invoice_id)
    sa.Index("ix_invoice_lines_service_id", table.c.service_id)
    return table


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    invoice_line_columns = {
        column["name"]: column
        for column in inspector.get_columns("invoice_lines")
    }
    invoice_line_checks = {
        constraint["name"]: constraint["sqltext"]
        for constraint in inspector.get_check_constraints("invoice_lines")
    }
    invoice_line_foreign_keys = {
        tuple(constraint["constrained_columns"]): constraint
        for constraint in inspector.get_foreign_keys("invoice_lines")
    }
    invoice_line_indexes = {
        index["name"] for index in inspector.get_indexes("invoice_lines")
    }
    current_check = invoice_line_checks.get(
        "ck_invoice_lines_service_kind",
        "service_kind IN ('metered', 'fixed')",
    )
    check_has_adjustment = "adjustment" in current_check
    service_id_nullable = invoice_line_columns["service_id"]["nullable"]
    invoice_fk = invoice_line_foreign_keys.get(("invoice_id",))
    service_fk = invoice_line_foreign_keys.get(("service_id",))
    constraints_complete = (
        invoice_fk is not None
        and invoice_fk["referred_table"] == "invoices"
        and invoice_fk["options"].get("ondelete") == "CASCADE"
        and service_fk is not None
        and service_fk["referred_table"] == "services"
        and service_fk["options"].get("ondelete") == "RESTRICT"
    )
    indexes_complete = {
        "ix_invoice_lines_invoice_id",
        "ix_invoice_lines_service_id",
    } <= invoice_line_indexes
    if (
        not service_id_nullable
        or not check_has_adjustment
        or not constraints_complete
        or not indexes_complete
    ):
        source_table = _invoice_lines_table(
            service_id_nullable=service_id_nullable,
            service_kind_check=current_check,
        )
        with op.batch_alter_table(
            "invoice_lines",
            copy_from=source_table,
            recreate="always",
        ) as batch_op:
            if not service_id_nullable:
                batch_op.alter_column(
                    "service_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )
            if not check_has_adjustment:
                batch_op.drop_constraint(
                    "ck_invoice_lines_service_kind",
                    type_="check",
                )
                batch_op.create_check_constraint(
                    "ck_invoice_lines_service_kind",
                    "service_kind IN ('metered', 'fixed', 'adjustment')",
                )

    inspector = sa.inspect(bind)
    invoice_columns = {
        column["name"] for column in inspector.get_columns("invoices")
    }
    if "adjustments_total" not in invoice_columns:
        op.add_column(
            "invoices",
            sa.Column(
                "adjustments_total",
                sa.Numeric(precision=12, scale=2),
                nullable=False,
                server_default=sa.text("0.00"),
            ),
        )

    inspector = sa.inspect(bind)
    expense_columns = {column["name"] for column in inspector.get_columns("expenses")}
    expense_invoice_line_fk = next(
        (
            constraint
            for constraint in inspector.get_foreign_keys("expenses")
            if constraint["constrained_columns"] == ["invoice_line_id"]
            and constraint["referred_table"] == "invoice_lines"
            and constraint["options"].get("ondelete") == "CASCADE"
        ),
        None,
    )
    expense_indexes = {index["name"] for index in inspector.get_indexes("expenses")}
    invoice_line_column_missing = "invoice_line_id" not in expense_columns
    expense_fk_missing = expense_invoice_line_fk is None
    expense_index_missing = "ix_expenses_invoice_line_id" not in expense_indexes
    if invoice_line_column_missing or expense_fk_missing or expense_index_missing:
        with op.batch_alter_table("expenses", recreate="always") as batch_op:
            if invoice_line_column_missing:
                batch_op.add_column(
                    sa.Column("invoice_line_id", sa.Integer(), nullable=True)
                )
            if expense_fk_missing:
                batch_op.create_foreign_key(
                    "fk_expenses_invoice_line_id_invoice_lines",
                    "invoice_lines",
                    ["invoice_line_id"],
                    ["id"],
                    ondelete="CASCADE",
                )
            if expense_index_missing:
                batch_op.create_index(
                    "ix_expenses_invoice_line_id",
                    ["invoice_line_id"],
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    expense_columns = {
        column["name"] for column in inspector.get_columns("expenses")
    }
    if "invoice_line_id" in expense_columns:
        with op.batch_alter_table("expenses", recreate="always") as batch_op:
            batch_op.drop_index("ix_expenses_invoice_line_id")
            batch_op.drop_constraint(
                "fk_expenses_invoice_line_id_invoice_lines",
                type_="foreignkey",
            )
            batch_op.drop_column("invoice_line_id")

    inspector = sa.inspect(bind)
    invoice_columns = {
        column["name"] for column in inspector.get_columns("invoices")
    }
    if "adjustments_total" in invoice_columns:
        op.drop_column("invoices", "adjustments_total")

    inspector = sa.inspect(bind)
    invoice_line_columns = {
        column["name"]: column
        for column in inspector.get_columns("invoice_lines")
    }
    invoice_line_checks = {
        constraint["name"]: constraint["sqltext"]
        for constraint in inspector.get_check_constraints("invoice_lines")
    }
    current_check = invoice_line_checks.get(
        "ck_invoice_lines_service_kind",
        "service_kind IN ('metered', 'fixed', 'adjustment')",
    )
    if invoice_line_columns["service_id"]["nullable"] or "adjustment" in current_check:
        op.execute("DELETE FROM invoice_lines WHERE service_id IS NULL")
        source_table = _invoice_lines_table(
            service_id_nullable=invoice_line_columns["service_id"]["nullable"],
            service_kind_check=current_check,
        )
        with op.batch_alter_table(
            "invoice_lines",
            copy_from=source_table,
            recreate="always",
        ) as batch_op:
            if invoice_line_columns["service_id"]["nullable"]:
                batch_op.alter_column(
                    "service_id",
                    existing_type=sa.Integer(),
                    nullable=False,
                )
            if "adjustment" in current_check:
                batch_op.drop_constraint(
                    "ck_invoice_lines_service_kind",
                    type_="check",
                )
                batch_op.create_check_constraint(
                    "ck_invoice_lines_service_kind",
                    "service_kind IN ('metered', 'fixed')",
                )
