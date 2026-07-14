"""Create the initial HomeTrap schema.

Revision ID: 20260714_01
Revises:
Create Date: 2026-07-14 18:30:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260714_01"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "apartments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=False),
        sa.Column("rent_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("rent_currency", sa.String(length=3), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "exchange_rates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date", "currency", name="uq_exchange_rates_date_currency"),
    )
    op.create_index("ix_exchange_rates_date", "exchange_rates", ["date"])
    op.create_table(
        "settings",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=False),
        sa.Column("period", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exchange_rate", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("rent_amount_usd", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("rent_amount_uah", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("utilities_total", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("grand_total", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'issued', 'paid')", name="ck_invoices_status"),
        sa.ForeignKeyConstraint(["apartment_id"], ["apartments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("apartment_id", "period", name="uq_invoices_apartment_period"),
    )
    op.create_index("ix_invoices_apartment_id", "invoices", ["apartment_id"])
    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("apartment_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=True),
        sa.Column("provider_account", sa.String(length=100), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("kind IN ('metered', 'fixed')", name="ck_services_kind"),
        sa.ForeignKeyConstraint(["apartment_id"], ["apartments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_services_apartment_id", "services", ["apartment_id"])
    op.create_table(
        "tariffs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Numeric(precision=12, scale=5), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_id", "valid_from", name="uq_tariffs_service_date"),
    )
    op.create_index("ix_tariffs_service_id", "tariffs", ["service_id"])
    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("service_name", sa.String(length=200), nullable=False),
        sa.Column("prev_reading", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("curr_reading", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("consumed", sa.Numeric(precision=14, scale=3), nullable=True),
        sa.Column("tariff_value", sa.Numeric(precision=12, scale=5), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invoice_lines_invoice_id", "invoice_lines", ["invoice_id"])
    op.create_index("ix_invoice_lines_service_id", "invoice_lines", ["service_id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_lines_service_id", table_name="invoice_lines")
    op.drop_index("ix_invoice_lines_invoice_id", table_name="invoice_lines")
    op.drop_table("invoice_lines")
    op.drop_index("ix_tariffs_service_id", table_name="tariffs")
    op.drop_table("tariffs")
    op.drop_index("ix_services_apartment_id", table_name="services")
    op.drop_table("services")
    op.drop_index("ix_invoices_apartment_id", table_name="invoices")
    op.drop_table("invoices")
    op.drop_table("users")
    op.drop_table("settings")
    op.drop_index("ix_exchange_rates_date", table_name="exchange_rates")
    op.drop_table("exchange_rates")
    op.drop_table("apartments")
