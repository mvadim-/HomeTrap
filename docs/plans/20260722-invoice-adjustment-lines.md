# Рядок-коригування в рахунку з авто-витратою

## Overview
- Додає в редактор рахунку **разовий рядок «Коригування/Компенсація»** зі
  знаковою сумою (типово — від'ємна знижка) та галочкою **«оплата за рахунок
  орендаря → врахувати як витрату»**.
- При галочці рядок: (а) **зменшує суму рахунку** до сплати орендарем; (б)
  **автоматично створює прив'язану `Expense`** (для P&L), синхронізовану за
  життєвим циклом рядка/рахунку.
- Розв'язує реальний кейс: орендар полагодив щось за свій кошт (напр., котел) і
  просить вирахувати з рахунку — одна дія коректно закриває і **рахунок**
  (менша сума), і **P&L** (ваш чистий дохід падає на суму компенсації).
- Носій — **рядок рівня рахунку, НЕ послуга** (свідоме рішення): послуга
  рекурсивна й потрапляла б у кожен наступний рахунок; коригування — разове.

## Context (from discovery)
- **Модель:** `backend/app/models.py` — `InvoiceLine` (зараз `service_id`
  NOT NULL FK RESTRICT; `service_kind IN ('metered','fixed')`), `Invoice`
  (`utilities_total`, `grand_total`), `Expense` (додано в попередній фічі:
  `apartment_id` nullable, `date`, `category`, `amount`, `currency`, `notes`,
  `restore_key`).
- **Білінг:** `backend/app/services/billing.py` — `create_draft` (рядки з
  активних послуг), `recalculate` (сумує `line.amount` → `utilities_total`;
  `grand_total = rent + utilities`), `update_draft` (приймає лише
  `exchange_rate` + `readings` метрованих ліній; редагуються тільки чернетки),
  `delete_draft`, `invoice_response`, `money()`.
- **API:** `backend/app/routers/invoices.py` (`InvoiceUpdate` → `update_draft`),
  `backend/app/schemas.py` (`InvoiceUpdate`/`InvoiceResponse`/line-схеми).
- **Backup/Restore:** `backend/app/services/restore.py` — `_import_invoices`,
  `_import_invoice_lines`, `_import_expenses`, `ImportContext` (мапи id),
  `ENTITY_NAMES`; інваріант CLAUDE.md: нові поля/зв'язки мають бути покриті в
  merge + round-trip тестах.
- **Frontend:** `frontend/src/pages/InvoiceEdit.tsx`,
  `frontend/src/components/InvoiceCalculator.tsx` (редактор ліній/тоталів),
  `frontend/src/api/client.ts` (типи `Invoice`/`InvoiceUpdatePayload`),
  `frontend/src/pages/Stats.tsx` (`IncomeChart` — стек оренда+комуналка;
  P&L-секція), `frontend/src/pages/Expenses.tsx` (журнал витрат).
- **Related patterns:** `money()` квантування; редагуються лише чернетки
  (`status == draft`); стабільний `restore_key`; P&L-дохід = **лише оренда**
  (`rent_amount_uah`), комуналка/коригування транзитні й у P&L-дохід не входять.
- **Dependencies:** фіча спирається на сутність `Expense` (міграція
  `20260721_08`, поточний head). Нова міграція — `20260722_09`.

## Development Approach
- **Testing approach:** Regular (спочатку код, потім тести в межах таска) —
  конвенція проєкту.
- Complete each task fully before moving to the next; small, focused changes.
- **CRITICAL: every task MUST include new/updated tests** (success + error/edge).
- **CRITICAL: all tests must pass before starting next task.**
- **CRITICAL: update this plan file when scope changes during implementation.**
- Run tests (Docker, per CLAUDE.md):
  - backend: `docker compose -f docker/docker-compose.dev.yml run --rm backend pytest`
  - lint: `docker compose -f docker/docker-compose.dev.yml run --rm backend ruff check .`
  - frontend: `docker compose -f docker/docker-compose.dev.yml run --rm frontend npm test`
- Maintain backward compatibility: рахунки без коригувань поводяться як зараз
  (`adjustments_total = 0`).

## Testing Strategy
- **Backend (pytest):** `test_models.py` (нові поля/констрейнти/каскад),
  `test_billing.py` (recalculate з коригуванням, update_draft add/edit/delete,
  авто-expense sync/desync, лише-draft), `test_invoices.py` (API payload/serialize),
  `test_restore.py`/`test_backup.py` (round-trip: adjustment-лінія, adjustments_total,
  прив'язана витрата з invoice_line_id, ідемпотентність), `test_stats.py`
  (income з adjustments; P&L незмінний — дохід лише оренда).
- **Frontend (Vitest+RTL):** `client.test.ts` (форма запитів),
  `InvoiceEdit.test.tsx`/`InvoiceCalculator.test.tsx` (додавання/редагування/
  видалення коригування, галочка+категорія, тотали), `Expenses.test.tsx`
  (прив'язані витрати — read-only), `Stats.test.tsx` (adjustments у графіку доходу).
- **e2e:** немає фреймворка — ручний walkthrough у Post-Completion.

## Progress Tracking
- Mark completed `[x]` immediately; ➕ для нових задач; ⚠️ для блокерів.
- Update plan if scope deviates.

## Solution Overview
- **Модель:**
  - `InvoiceLine.service_id` → **nullable** (коригування не має послуги; лінії
    послуг лишаються з FK RESTRICT). `service_kind` CHECK розширюється до
    `('metered','fixed','adjustment')`; додається член enum
    **`ServiceKind.ADJUSTMENT`**. Для adjustment: `service_name` = мітка,
    `amount` = знакова сума, метрові поля `None`, **`tariff_value=Decimal("0")`**
    (колонка NOT NULL — обов'язково задавати 0, не лишати null).
  - `Invoice.adjustments_total Numeric(12,2)` default `0.00`;
    **`grand_total = rent + utilities + adjustments`**.
  - `Expense.invoice_line_id` nullable FK → `invoice_lines.id`
    **ondelete CASCADE** (видалення лінії/рахунку прибирає авто-витрату).
- **Білінг:**
  - `recalculate`: `utilities_total` = сума metered+fixed; `adjustments_total`
    = сума adjustment-ліній; `grand_total` = rent + utilities + adjustments.
  - `update_draft` розширюється: приймає список коригувань (add/edit/delete за
    `id`), крім наявних `readings`/`exchange_rate`. Лише для чернеток.
  - **Авто-expense sync (під write-session/lock, у `update_draft`):** для
    adjustment-лінії з `record_as_expense=true` створити/оновити прив'язану
    `Expense` (`apartment_id` = рахунку, `date` = період рахунку,
    `amount` = |сума|, `currency='UAH'`, обрана `category`,
    `invoice_line_id` = лінія). Зняли галочку → видалити прив'язану витрату;
    видалили лінію/рахунок → CASCADE. **Прапорець/категорія не зберігаються
    окремими колонками** — джерело істини це наявність прив'язаної `Expense`
    (її `category`); UI дізнається стан із серіалізованої лінії. **Флаш лінії
    перед створенням витрати**, щоб мати `invoice_line_id`.
- **Знак і галочка:** сума коригування знакова (типово знижка — від'ємна).
  «Врахувати як витрату» доступна лише для **знижки** (від'ємна сума) — бо це
  ваш видаток; для доплати (додатна) галочки немає.
- **P&L «чернетка vs виставлений» (критично — симетрія доходу й витрати):**
  дохід у P&L/`/income` рахується лише для `issued/paid`. Прив'язана витрата
  створюється вже на **чернетці** (в `update_draft`), тож щоб net не падав до
  визнання доходу, **`/pnl` виключає витрати, прив'язані до рахунка-чернетки**
  (join `Expense.invoice_line_id → invoice_lines → invoices.status`; враховуємо
  лише коли статус `issued/paid`, а також усі витрати без прив'язки).
  Це симетрично з доходом і не потребує змін у `transition_invoice`.
- **P&L лишається коректним:** дохід = лише оренда; коригування — у своєму
  бакеті (P&L-дохід не чіпає); компенсація входить у P&L **лише** через
  прив'язану витрату — рівно один раз (net падає на суму компенсації, і лише
  після виставлення рахунка).
- **Витрати-таб:** прив'язані (авто) витрати показуються **read-only** з
  приміткою «з рахунку» — редагування/видалення лише через рахунок (щоб не
  розсинхронити з лінією).
- **Графік доходу:** додається сегмент/обробка `adjustments`, щоб стек
  сходився з `grand_total`.

## Technical Details
- **Числа:** `amount`/`adjustments_total` — `Numeric(12,2)`, квантування через
  `money()`. `grand_total` може стати від'ємним (велика знижка) — уже
  толерується (income-графік має обробку від'ємних «коригувань»).
- **Міграція `20260722_09`** (`down_revision='20260721_08'`, ідемпотентна):
  зробити `invoice_lines.service_id` nullable — на SQLite це **повний
  `batch_alter_table` recreate** таблиці, тож у рецепті треба **явно зберегти
  всі наявні констрейнти**: CHECK `ck_invoice_lines_service_kind` (розширений до
  `('metered','fixed','adjustment')`), FK `invoice_id` (ondelete CASCADE), FK
  `service_id` (ondelete RESTRICT) та індекси — інакше batch тихо їх втратить.
  Додати `invoices.adjustments_total` (default 0, заповнити наявним),
  `expenses.invoice_line_id` + FK CASCADE + індекс.
- **Схеми:** додати `ServiceKind.ADJUSTMENT`; `InvoiceLineResponse.service_id`
  → **`int | None`** і `InvoiceWarning.service_id` теж (adjustment-лінія має
  null). `InvoiceUpdate` +`adjustments: list[AdjustmentInput]`
  (`id?`, `label`, `amount`, `record_as_expense: bool`, `category?`).
  `InvoiceResponse` +`adjustments_total`; лінії серіалізують `kind`,
  `service_name` (мітку) і для adjustment — прив'язану `expense`
  (id/category) для round-trip у UI.
- **Restore порядок:** invoices (копіювати `adjustments_total`) →
  invoice_lines (nullable service_id: `service_map[sid].id if sid is not None
  else None` — **інакше `service_map[None]` KeyError**; adjustment kind;
  будувати `line_map` old→new id) → expenses (remap `invoice_line_id` через
  **`line_map.get(old)`** — на miss лишити `None`, бо лінія наявного рахунка
  пропускається при merge, а витрату однаково дедуплікує `restore_key`).
  Ідемпотентність — за `restore_key` витрати й наявною логікою ліній.
- **`/income` та dashboard:** у циклі `income_stats` по `invoice.lines`
  **виключити** `service_kind == 'adjustment'` з `service_totals`/`top_service`
  (інакше коригування засмічує «найбільшу статтю»). Додати явне поле
  `adjustments` у помісячні точки, `totals` та схему `IncomeStats`, щоб
  `total = rent + utilities + adjustments` сходився в графіку. `dashboard_stats`
  використовує `grand_total` (тепер нетить коригування) — **свідомо**
  (орендар винен менше); зафіксувати приміткою й тестом.
- **Валідація:** `record_as_expense` лише коли `amount < 0`; `category` з
  `ExpenseCategory`; мітка непорожня; редагування коригувань лише для draft
  (інакше `409`, як наявна логіка).

## What Goes Where
- **Implementation Steps** (`[ ]`): код, тести, документація в цьому репозиторії.
- **Post-Completion** (без checkbox): ручна браузерна верифікація, деплой
  (міграція БД).

## Implementation Steps

### Task 1: Модель і міграція (adjustment-лінія, adjustments_total, зв'язок expense)

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/20260722_09_invoice_adjustments.py`
- Modify: `backend/tests/test_models.py`

- [x] `InvoiceLine.service_id` → nullable; додати `ServiceKind.ADJUSTMENT`;
  розширити CHECK `service_kind` до `('metered','fixed','adjustment')`
- [x] `Invoice.adjustments_total Numeric(12,2)` default `0.00`;
  `Expense.invoice_line_id` nullable FK→`invoice_lines.id` ondelete CASCADE
  (+relationship, +індекс)
- [x] міграція `20260722_09` (down_revision=`20260721_08`, ідемпотентна):
  **`batch_alter_table` recreate `invoice_lines`** зі збереженням УСІХ наявних
  констрейнтів (CHECK розширений, FK invoice_id CASCADE, FK service_id RESTRICT,
  індекси); + `adjustments_total` (заповнити 0), + `expenses.invoice_line_id` FK
  CASCADE + індекс
- [x] write tests: adjustment-лінія з `service_id=NULL` і `tariff_value=0`;
  **каскад invoice→line→expense** усе ще спрацьовує після міграції (пряме
  `session.delete`, `PRAGMA foreign_keys=ON`)
- [x] write tests: CHECK відхиляє невалідний `service_kind`;
  FK service_id RESTRICT збережено; `adjustments_total` default; head → `09`
- [x] run migration + tests — must pass before task 2

### Task 2: Білінг — recalculate, update_draft, авто-expense sync

**Files:**
- Modify: `backend/app/services/billing.py`
- Modify: `backend/tests/test_billing.py`

- [x] `recalculate`: `utilities_total` = metered+fixed; `adjustments_total` =
  adjustment-лінії; `grand_total = rent + utilities + adjustments`
- [x] розширити `update_draft`: приймати коригування (add/edit/delete за `id`)
  поряд із `readings`/`exchange_rate`; лише для draft
- [x] авто-expense sync під write-session: create/update/delete прив'язаної
  `Expense` за станом `record_as_expense`+`category`; **флаш нової лінії перед
  створенням витрати** (потрібен `invoice_line_id`); ідемпотентно (без дублів
  при повторному save/recalculate); adjustment-лінія має `tariff_value=0`
- [x] write tests: recalculate з коригуванням (тотали й grand_total);
  add/edit/delete коригування; галочка створює/оновлює/видаляє витрату
- [x] write tests: `record_as_expense` лише для від'ємної суми; non-draft →
  помилка; видалення лінії прибирає витрату (CASCADE)
- [x] run tests — must pass before task 3

### Task 3: Схеми та API рахунку

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/invoices.py`
- Modify: `backend/app/services/billing.py`
- Modify: `backend/tests/test_invoices.py`

- [x] `ServiceKind.ADJUSTMENT` у схемах; `InvoiceLineResponse.service_id` та
  `InvoiceWarning.service_id` → `int | None`
- [x] `InvoiceUpdate` +`adjustments` (`id?`, `label`, `amount`,
  `record_as_expense`, `category?`) з валідацією; `InvoiceResponse`
  +`adjustments_total` + серіалізація `kind`/мітки + прив'язаної витрати
- [x] прокинути коригування з роутера в `update_draft`
- [x] write tests: створення/зміна/видалення коригування через API; серіалізація
  тоталів і прив'язки
- [x] write tests: валідація (галочка лише для від'ємної; невалідна категорія;
  редагування non-draft → `409`)
- [x] run tests — must pass before task 4

### Task 4: Backup/Restore покриття

**Files:**
- Modify: `backend/app/services/restore.py`
- Modify: `backend/tests/test_restore.py`
- Modify: `backend/tests/test_backup.py`

- [x] `_import_invoice_lines`: nullable `service_id`
  (`service_map[sid].id if sid is not None else None` — не `service_map[None]`)
  + `adjustment` kind; будувати `line_map` old→new id (лише для реально
  доданих ліній)
- [x] `_import_invoices`: копіювати `adjustments_total`; `_import_expenses`:
  remap `invoice_line_id` через **`line_map.get(old)`** (miss → `None`)
- [x] звірити інваріант CLAUDE.md (copied fields, порядок імпорту, ідемпотентність)
- [x] write tests (round-trip): adjustment-лінія + `adjustments_total` +
  прив'язана витрата (`invoice_line_id`) переживають export→import; ремап
  коректний; повторний import ідемпотентний
- [x] write tests: витрата, прив'язана до лінії **наявного** (пропущеного при
  merge) рахунка — `invoice_line_id` стає `None`, без KeyError, без дубля
- [x] run tests — must pass before task 5

### Task 5: Клієнтські типи й API

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`

- [ ] типи: `InvoiceLine.kind` +`'adjustment'`, `Invoice.adjustments_total`,
  прив'язана `expense` у лінії; `InvoiceUpdatePayload` +`adjustments`
- [ ] оновити `getInvoice`/`updateInvoice` під нові поля
- [ ] write tests: форма тіла `updateInvoice` з коригуваннями; парсинг
  `adjustments_total`
- [ ] run tests — must pass before task 6

### Task 6: UI редактора рахунку — рядки-коригування

**Files:**
- Modify: `frontend/src/components/InvoiceCalculator.tsx`
- Modify: `frontend/src/pages/InvoiceEdit.tsx`
- Modify: `frontend/src/pages/portal.css`
- Modify: `frontend/src/components/InvoiceCalculator.test.tsx`
- Modify: `frontend/src/pages/InvoiceEdit.test.tsx`

- [ ] секція «Коригування»: додати/редагувати/видалити рядок (мітка, знакова
  сума), відображення в тоталах (окремий рядок «Коригування» + оновлений
  «Разом»)
- [ ] галочка «оплата за рахунок орендаря → врахувати як витрату» (лише для
  від'ємної суми) + вибір категорії
- [ ] стани/валідація за наявними патернами; лише для draft
- [ ] write tests: додавання/редагування/видалення; галочка+категорія;
  перерахунок «Разом»; заборона галочки для додатної суми
- [ ] run tests — must pass before task 7

### Task 7: Витрати-таб — прив'язані витрати read-only

**Files:**
- Modify: `frontend/src/pages/Expenses.tsx`
- Modify: `frontend/src/pages/Expenses.test.tsx`

- [ ] прив'язані (авто) витрати (`invoice_line_id != null`) показуються з
  приміткою «з рахунку»; кнопки «Редагувати»/«Видалити» вимкнені/приховані
  (керування лише через рахунок)
- [ ] write tests: прив'язана витрата read-only; звичайна — редагована як зараз
- [ ] run tests — must pass before task 8

### Task 8: Агрегації — income/adjustments, P&L draft-фільтр, dashboard

**Files:**
- Modify: `backend/app/routers/stats.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/test_stats.py`
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/theme.css`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [ ] `income_stats`: **виключити** `service_kind=='adjustment'` з
  `service_totals`/`top_service`; додати поле `adjustments` у помісячні точки,
  `totals` і схему `IncomeStats` (щоб `total = rent + utilities + adjustments`)
- [ ] `/pnl`: **виключати витрати, прив'язані до рахунка-чернетки** (join
  `invoice_line_id → invoice_lines → invoices.status`; рахувати лише
  `issued/paid` + усі непов'язані витрати)
- [ ] `IncomeChart`: сегмент/обробка `adjustments`, щоб стек сходився з
  `grand_total`; токен кольору в усі три блоки `theme.css` за потреби
- [ ] write tests (backend): `/income` не рахує adjustment у top_service й
  віддає `adjustments`; `/pnl` не рахує витрату чернетки, але рахує після
  виставлення; `dashboard` `charged/outstanding` нетить коригування (свідомо)
- [ ] write tests (frontend): місяць із коригуванням показує сегмент; тотал
  сходиться; P&L-секція коректна
- [ ] run tests — must pass before task 9

### Task 9: Verify acceptance criteria
- [ ] перевірити вимоги Overview: рядок-коригування зменшує рахунок; галочка
  створює прив'язану витрату; P&L падає на суму компенсації рівно раз;
  прив'язані витрати read-only; тотали/графік сходяться
- [ ] edge cases: зняття галочки видаляє витрату; видалення лінії/рахунку
  (CASCADE); редагування non-draft заблоковане; grand_total від'ємний;
  **P&L не рахує компенсацію поки рахунок чернетка, рахує після виставлення**;
  income top_service ігнорує коригування; backup/restore round-trip (у т.ч.
  прив'язка до пропущеної лінії)
- [ ] run full backend suite + `ruff check .`
- [ ] run full frontend suite + `npm run build`

### Task 10: [Final] Update documentation
- [ ] `ChangeLog.md` (`## [YYYY-MM-DD HH:MM] …`, файли, поведінка, примітка про
  міграцію `20260722_09` і деплой)
- [ ] README.md: описати рядок-коригування/компенсацію в рахунку
- [ ] CLAUDE.md: за потреби (патерн авто-expense, прив'язаної до invoice-лінії)
- [ ] `docs/improvements-backlog.md`: занотувати як покращення білінгу/P&L
- [ ] окремий git-коміт циклу; move this plan to `docs/plans/completed/`

## Post-Completion
*Ручні дії та зовнішні системи — інформаційно, без checkbox*

**Manual verification:**
- Browser walkthrough (light/dark): додати компенсацію з галочкою → рахунок
  зменшився, у Витратах з'явилася read-only витрата «з рахунку», P&L-net впав
  на суму; зняти галочку → витрата зникла; видалити чернетку → витрата зникла.
- Ручний backup → restore на даних із коригуванням: перевірити відновлення
  `adjustments_total`, adjustment-лінії та прив'язки `invoice_line_id`.

**External system updates:**
- Містить **міграцію БД** (`20260722_09`); зачіпає production backend+frontend.
  Перед розгортанням — ручний DR-архів усього `data/`, потім rebuild/restart за
  `docs/deploy.md` (один Uvicorn-worker). Автоматичний деплой не виконується.
