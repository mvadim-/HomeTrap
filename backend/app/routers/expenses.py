from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_db, get_write_db, require_auth
from app.models import Apartment, Expense
from app.schemas import ExpenseCreate, ExpenseResponse, ExpenseUpdate

router = APIRouter(tags=["expenses"], dependencies=[Depends(require_auth)])


def _get_apartment(session: Session, apartment_id: int) -> Apartment:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apartment not found",
        )
    return apartment


def _get_expense(session: Session, expense_id: int) -> Expense:
    expense = session.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found",
        )
    return expense


def _ensure_expense_is_editable(expense: Expense) -> None:
    if expense.invoice_line_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice-linked expenses can only be changed through the invoice",
        )


@router.get("/api/expenses", response_model=list[ExpenseResponse])
def list_expenses(
    apartment_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    session: Session = Depends(get_db),
) -> list[Expense]:
    query = select(Expense)
    if apartment_id is not None:
        query = query.where(Expense.apartment_id == apartment_id)
    if date_from is not None:
        query = query.where(Expense.date >= date_from)
    if date_to is not None:
        query = query.where(Expense.date <= date_to)
    query = query.order_by(Expense.date.desc(), Expense.id.desc())
    return list(session.scalars(query).all())


@router.post(
    "/api/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    payload: ExpenseCreate,
    session: Session = Depends(get_write_db),
) -> Expense:
    if payload.apartment_id is not None:
        _get_apartment(session, payload.apartment_id)
    expense = Expense(**payload.model_dump())
    session.add(expense)
    session.commit()
    return expense


@router.patch("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    session: Session = Depends(get_write_db),
) -> Expense:
    expense = _get_expense(session, expense_id)
    _ensure_expense_is_editable(expense)
    updates = payload.model_dump(exclude_unset=True)
    if "apartment_id" in updates and updates["apartment_id"] is not None:
        _get_apartment(session, updates["apartment_id"])
    for field, value in updates.items():
        setattr(expense, field, value)
    session.commit()
    return expense


@router.delete(
    "/api/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_expense(
    expense_id: int,
    session: Session = Depends(get_write_db),
) -> Response:
    expense = _get_expense(session, expense_id)
    _ensure_expense_is_editable(expense)
    session.delete(expense)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
