# P&L та розширена статистика: тренди й порівняння (#7 + #10)

## Overview
- Реалізує ідею **#7 (облік витрат і чистий дохід, P&L)** разом із залишковою
  частиною **#10 (тренди/порівняння у статистиці)**, як вирішено при уточненні
  обсягу.
- Додає нову сутність **«Витрата»** (`Expense`) з CRUD, звіт **P&L** (дохід
  від оренди − витрати = чистий, маржа %) за період по квартирі та портфелю в
  одній валюті (грн), із помісячним трендом.
- Розширює наявний графік *Статистики → Споживання* порівняннями й
  агрегатами: **рік-до-року (YoY)**, **дельта vs попередній період**,
  **середнє / мін / макс** по кожній послузі та **вартість спожитого** (грн).
- Проблема, яку розв'язує: власник бачить не лише скільки нараховано, а й
  скільки витрачено та скільки лишилось чистими, і як споживання/витрати
  змінюються в часі — без ручних підрахунків.

## Context (from discovery)
- **Backend:** `backend/app/models.py` (усі сутності зі стабільним
  `restore_key` у `Apartment`/`Service`), `backend/app/schemas.py`
  (`ConsumptionStats`/`IncomeStats` вже структуровані, рядки 234-290),
  `backend/app/routers/stats.py` (ендпойнти `/consumption`, `/income`,
  `/dashboard`; хелпер періоду `_resolve_period`), `backend/app/routers/
  tenants.py` (взірець CRUD + write-session), `backend/app/services/billing.py`
  (`money()`, робота з `Decimal`/`Numeric`), `backend/app/services/nbu.py`
  (`get_rate(session, date, currency)` — точна дата → останній курс ≤ дати →
  фолбек-фетч), `backend/app/services/storage.py` (`write_session`/
  `get_write_db`, координація під data-store lock).
- **Backup/Restore:** `backend/app/services/restore.py` — `ENTITY_NAMES`
  (рядки 40-49), `_import_rows` + `_import_*` хелпери, `ImportContext`,
  `_stable_existing_or_add`/`_exact_identity_matches` для стабільних
  `restore_key`; `backend/app/services/backup.py` — знімок = повний SQLite
  файл (нова таблиця потрапляє в архів автоматично, але **merge при restore
  треба додати вручну**).
- **Frontend:** `frontend/src/pages/Stats.tsx` (~800 рядків; фільтри
  `periodMode`/`scope`/`apartmentId`, `MiniLineChart` для споживання,
  `IncomeChart` для доходу, плитки підсумків), `frontend/src/api/client.ts`
  (типи `ConsumptionStats`/`IncomeStats`, `getConsumptionStats`/
  `getIncomeStats`, `addStatsPeriod`), `frontend/src/App.tsx` (маршрути),
  `frontend/src/components/Layout.tsx` (навігація), `frontend/src/theme.css`
  (токени графіків — три блоки: light `:root`, `:root[data-theme="dark"]`,
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`).
- **Related patterns:** стабільний `restore_key` (`uuid4().hex`, unique) →
  ідемпотентний re-import; грошові суми `Numeric(12,2)` + `money()` квантування;
  період статистики виражається `date_from`/`date_to`/`months`/`all_time`;
  дохід уже зберігається в грн (`Invoice.rent_amount_uah`).
- **Dependencies:** #7 раніше не реалізовано — сутності «Витрата» в коді немає
  (перевірено: ні моделі, ні роутера). Міжквартирне порівняння з #10 —
  свідомо **поза обсягом** (малоактуально при кількох квартирах). Чек-вкладення
  до витрат — **відкладено з v1** (як ROI у #7).

## Development Approach
- **Testing approach:** Regular (спочатку код, потім тести в межах того самого
  таска) — конвенція попередніх планів проєкту.
- Complete each task fully before moving to the next.
- Make small, focused changes; touch only те, що вимагає задача.
- **CRITICAL: every task MUST include new/updated tests** for code changes in
  that task:
  - tests are not optional — they are a required part of the checklist;
  - write tests for new/modified behavior, success and error scenarios.
- **CRITICAL: all tests must pass before starting next task** — no exceptions.
- **CRITICAL: update this plan file when scope changes during implementation.**
- Run tests after each change (Docker, per CLAUDE.md):
  - backend: `docker compose -f docker/docker-compose.dev.yml run --rm backend pytest`
  - lint: `docker compose -f docker/docker-compose.dev.yml run --rm backend ruff check .`
  - frontend: `docker compose -f docker/docker-compose.dev.yml run --rm frontend npm test`
- Maintain backward compatibility: наявні ендпойнти статистики та сторінка
  Stats без нових даних працюють як зараз.

## Testing Strategy
- **Unit tests (backend):** pytest у `backend/tests/` — `test_models.py`
  (модель/констрейнти/міграція), новий `test_expenses.py` (CRUD + валідація),
  `test_stats.py` (P&L-агрегація, розширене споживання), `test_backup.py`/
  `test_restore.py` (round-trip витрат, збереження `restore_key`, ремапінг
  квартири, загальна витрата з `apartment_id = NULL`).
- **Unit/component tests (frontend):** Vitest + RTL — `client.test.ts` (форма
  запитів), `Stats.test.tsx` (P&L-секція, тренди споживання), новий
  `Expenses.test.tsx` (CRUD-потоки). Моки нових API поруч із наявними.
- **e2e tests:** у проєкті немає UI e2e-фреймворка — не додаємо; фінальна
  перевірка — ручний browser walkthrough у light/dark (Post-Completion).
- **Backup/Restore round-trip** — обов'язковий (інваріант CLAUDE.md): нова
  сутність не має бути мовчки виключена з покриття.

## Progress Tracking
- Mark completed items with `[x]` immediately when done.
- Add newly discovered tasks with ➕ prefix.
- Document issues/blockers with ⚠️ prefix.
- Update plan if implementation deviates from original scope.

## Solution Overview
- **Модель:** `Expense(apartment_id nullable FK→apartments ondelete CASCADE,
  date, category, amount, currency, notes, restore_key)` — за патерном
  `Apartment`/`Service` зі стабільним unique `restore_key`. `category` — enum
  `ExpenseCategory` (ремонт/податок/страхування/комісія/інше) з
  `CheckConstraint`; `currency` `String(3)` дефолт `UAH`.
- **CRUD:** окремий роутер `routers/expenses.py` за зразком `tenants.py`
  (через `write_session`/`get_write_db`), зареєстрований у `main.py`.
- **P&L:** новий ендпойнт `GET /api/stats/pnl` (той самий контракт періоду й
  `apartment_id`/portfolio, що й `/income`). Дохід = сума `rent_amount_uah`
  ISSUED/PAID-рахунків за період (комуналка транзитна, у прибуток не входить);
  витрати зводяться в грн; чистий = дохід − витрати; маржа % = чистий/дохід.
- **Конвертація витрат у грн (read-only):** витрати в UAH — без конвертації;
  у валюті — за **збереженим** курсом (останній `ExchangeRate` ≤ `date`
  витрати). Оскільки P&L працює на read-only сесії, **не викликаємо**
  `nbu.get_rate` (він пише/фетчить) — додаємо чистий helper пошуку збереженого
  курсу; місяці/витрати без доступного курсу виводимо окремим полем
  «неконвертовано» замість тихого нуля. **Важливо:** зберігаються лише USD-курси
  (`nbu.DEFAULT_CURRENCY = "USD"`), тож будь-яка не-UAH/не-USD витрата
  потрапляє в `unconverted`; неконвертовані суми виключені з `expenses_total`,
  тому `net`/`margin` при `unconverted.count > 0` завідомо оптимістичні й
  **мають бути позначені неповними в UI** (Task 8).
- **Розширене споживання:** до серій додаємо `cost` (= `InvoiceLine.amount`,
  уже вартість спожитого в грн) та зведення `avg/min/max` по `consumed`.
  YoY та дельту рахуємо **на фронтенді** з наявних помісячних точок (бекенд
  уже повертає повний часовий ряд) — щоб не дублювати логіку періодів.
- **Обсяг YoY (свідоме рішення v1):** `/consumption` повертає лише вибране
  вікно, тож YoY-накладення й «той самий місяць торік» показуються **лише
  коли діапазон охоплює попередній рік** (24 міс / весь час / custom, що
  перекриває минулий рік). У дефолтному 6/12-міс вигляді YoY прихований —
  прийнятно при кількох квартирах; альтернатива (бекенд віддає prior-year
  контекст для 12-міс) — відкладений кандидат, не в v1.
- **Frontend:** P&L — нова секція на сторінці *Статистика* (перевикористовує
  фільтри періоду/масштабу); CRUD витрат — **окрема сторінка** `Expenses.tsx`
  + маршрут + пункт навігації, щоб не роздувати Stats.tsx. Тренди/порівняння
  споживання — у наявному `MiniLineChart`.
- **Backup/Restore:** `expenses` додається в `ENTITY_NAMES`, `_import_rows`
  отримує `_import_expenses` (ідентичність за `restore_key`, ремапінг
  `apartment_id` через `ImportContext.apartment_map`, `NULL` → загальна
  витрата). `RestoreAlias` розширювати не треба — витрати не є ціллю
  alias-посилань інших сутностей.

## Technical Details
- **Числові типи:** `amount Numeric(12,2)`; конвертований у грн підсумок
  квантуємо через наявний `money()` (`ROUND_HALF_UP`, 2 знаки). Маржа —
  `Numeric` з квантуванням до `0.01`, лише коли дохід > 0 (інакше `null`).
- **`ExpenseCategory`:** `StrEnum` (`repair`, `tax`, `insurance`, `commission`,
  `other`) з людськими підписами на фронтенді; `CheckConstraint` за зразком
  `ck_services_kind`.
- **Міграція Alembic:** нова ревізія `backend/alembic/versions/20260721_08_*`,
  `down_revision` = поточний head (перевірити `alembic heads`; за ChangeLog —
  `20260721_07`). Створює таблицю `expenses`, індекс на `apartment_id`, unique
  на `restore_key`; за зразком наявних міграцій — ідемпотентна перевірка
  наявності перед створенням (SQLite-friendly).
- **Фільтр дат витрат (критично):** `Invoice.period` завжди перший день
  місяця, а `_resolve_period` повертає `period_end = _month_start(_today())`.
  `Expense.date` — довільна дата, тому наївне `Expense.date <= period_end`
  відкинуло б усі витрати поточного місяця не за 1-ше число. Верхню межу
  задаємо як `Expense.date < _shift_month(period_end, 1)` (перше число
  наступного місяця), нижню — `Expense.date >= period_start`. Помісячне
  групування витрат — за `_month_start(Expense.date)`.
- **P&L-контракт відповіді:** `{scope, apartment_id, months,
  values:[{period, income, expenses, net}], totals:{income, expenses_total,
  expenses_by_category:{...}, net, margin_percent}, unconverted:{count,...}}`.
- **Розширене споживання (схема):** `ConsumptionPoint` +`cost`;
  `ConsumptionSeries` +`summary:{avg, min, max}`. Наявні поля незмінні
  (зворотна сумісність).
- **Фронтенд-порівняння:** дельта = поточний місяць vs попередній місяць і vs
  той самий місяць торік (з ряду); YoY-накладення — пунктирна лінія «того ж
  місяця торік» на `MiniLineChart`, коли діапазон охоплює попередній рік;
  перемикач одиниць/₴ для вартості спожитого. Нові кольори — токени в усі три
  блоки `theme.css`.
- **Видалення квартири:** `Expense.apartment_id` CASCADE — витрати квартири
  видаляються разом із нею (узгоджено з `invoices`/`tenants`); загальні
  витрати (`NULL`) не зачіпаються.

## What Goes Where
- **Implementation Steps** (`[ ]` checkboxes): зміни коду, тестів і
  документації в цьому репозиторії.
- **Post-Completion** (без checkboxes): ручна браузерна верифікація та
  розгортання (міграція БД) на production.

## Implementation Steps

### Task 1: Модель Expense + Alembic-міграція

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/20260721_08_add_expenses.py`
- Modify: `backend/tests/test_models.py`

- [x] додати `ExpenseCategory(StrEnum)` та модель `Expense` (nullable
  `apartment_id` FK→apartments `ondelete="CASCADE"`, `date`, `category` з
  `CheckConstraint`, `amount Numeric(12,2)`, `currency String(3)` default
  `"UAH"`, `notes Text`, `restore_key` unique за зразком `Service`)
- [x] додати relationship `Apartment.expenses` (cascade `all, delete-orphan`)
- [x] створити міграцію: таблиця `expenses`, індекс `apartment_id`, unique
  `restore_key`; `down_revision` = поточний head; ідемпотентна перевірка
  існування (SQLite-friendly, за зразком `20260721_06/07`)
- [x] write tests: створення витрати (квартирна й загальна `NULL`), дефолт
  `currency=UAH`, дефолт-генерація `restore_key`
- [x] write tests: `CheckConstraint` категорії відхиляє невалідне значення;
  unique `restore_key`; каскад видалення разом із квартирою — прямим
  `session.delete(apartment)` (soft-archive не тригерить каскад), із
  увімкненим SQLite `PRAGMA foreign_keys=ON` як у наявних cascade-тестах
- [x] run migration + tests — must pass before task 2

### Task 2: Схеми та CRUD-роутер витрат

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/expenses.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_expenses.py`

- [x] схеми `ExpenseCreate`/`ExpenseUpdate`/`ExpenseResponse` (валідація
  `amount > 0`, `currency` 3 літери, `category` з enum, `apartment_id`
  опційний)
- [x] роутер `expenses.py`: `GET /api/expenses` (фільтри `apartment_id`,
  діапазон дат), `POST`, `PATCH/{id}`, `DELETE/{id}` — через
  `write_session`/`get_write_db` за зразком `tenants.py`; `404` для
  неіснуючої квартири/витрати
- [x] зареєструвати роутер у `main.py`
- [x] write tests: CRUD-happy-path, фільтр за квартирою й датами, загальна
  витрата (`apartment_id=null`)
- [x] write tests: помилки — `amount<=0`, невалідна категорія/валюта,
  неіснуюча квартира (`404`), неіснуюча витрата (`404`)
- [x] run tests — must pass before task 3

### Task 3: P&L-агрегація та ендпойнт /api/stats/pnl

**Files:**
- Modify: `backend/app/routers/stats.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/nbu.py`
- Modify: `backend/tests/test_stats.py`

- [x] додати read-only helper збереженого курсу (останній `ExchangeRate` ≤
  дати, без фетчу/запису) — у `nbu.py` поруч із `get_rate`
- [x] схема `PnlStats` (`values`, `totals` з `expenses_by_category`, `net`,
  `margin_percent`, `unconverted`)
- [x] ендпойнт `GET /api/stats/pnl` (той самий контракт періоду й
  `apartment_id`/portfolio, що `/income`): дохід = `rent_amount_uah`
  ISSUED/PAID; витрати за категоріями зведені в грн; помісячні точки
  `{period, income, expenses, net}`; маржа лише коли дохід>0
- [x] коректно рахувати «неконвертовані» витрати (немає збереженого курсу) —
  окреме поле, не тихий нуль; фільтр дат витрат через межу «< перше число
  наступного місяця» (див. Technical Details), групування за місяцем
- [x] write tests: дохід лише з оренди (комуналка виключена); суми витрат за
  категоріями; конвертація UAH/валюта; чистий і маржа; помісячний тренд;
  масштаб квартира vs портфель
- [x] write tests: **витрата серед/у кінці поточного місяця потрапляє в
  період** (регресія на межу місяця); край — немає витрат; дохід=0 →
  `margin_percent=null`; відсутній курс → потрапляє в `unconverted`
- [x] run tests — must pass before task 4

### Task 4: Розширене споживання (вартість, avg/min/max) — backend

**Files:**
- Modify: `backend/app/routers/stats.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/test_stats.py`

- [ ] додати `cost` (= `InvoiceLine.amount`) у кожну точку `consumption`
  (розширити SELECT) і зведення `summary:{avg,min,max}` по `consumed` у серію
- [ ] зберегти зворотну сумісність наявних полів `ConsumptionSeries`/`Point`
- [ ] write tests: серія містить `cost` і коректні `avg/min/max`; порожня
  історія → серії немає (як зараз); один місяць → avg=min=max
- [ ] run tests — must pass before task 5

### Task 5: Покриття Expense у backup/restore (інваріант)

**Files:**
- Modify: `backend/app/services/restore.py`
- Modify: `backend/tests/test_restore.py`
- Modify: `backend/tests/test_backup.py`

- [ ] додати `"expenses"` до `ENTITY_NAMES`
- [ ] `_import_expenses` — ідентичність за `restore_key`: **exact match →
  пропуск** (merge-only, як `tariffs`/`invoices`/`exchange_rates`; БЕЗ
  оновлення live-рядків), ремапінг `apartment_id` через `apartment_map`,
  `NULL` → загальна витрата; підключити в `_import_rows`
- [ ] **не** пре-алокувати id (Expense — leaf-сутність без дочірніх посилань;
  покладаємось на autoincrement, як `Tariff`/`InvoiceLine`/`ExchangeRate`)
- [ ] звірити чек-лист інваріанту CLAUDE.md: бізнес-ключі, copied fields,
  `ENTITY_NAMES`, свідомі виключення (чек-вкладення відкладено — витрати чеків
  не мають)
- [ ] write tests (round-trip): витрата (квартирна й загальна) переживає
  export→import; `restore_key` збережено; ремапінг квартири коректний;
  повторний import ідемпотентний (без дублів)
- [ ] write tests: підрахунки `ImportSummary.added["expenses"]` коректні
- [ ] run tests — must pass before task 6

### Task 6: Клієнтські типи й функції API

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`

- [ ] типи `Expense`, `ExpenseCategory`, `PnlStats`; розширити
  `ConsumptionSeries`/`ConsumptionPoint` полями `cost`/`summary`
- [ ] функції `getExpenses`/`createExpense`/`updateExpense`/`deleteExpense`,
  `getPnlStats` (перевикористати `addStatsPeriod`)
- [ ] write tests: форма URL/тіла запитів для нових функцій (фільтри, період)
- [ ] run tests — must pass before task 7

### Task 7: Сторінка CRUD витрат

**Files:**
- Create: `frontend/src/pages/Expenses.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/pages/Expenses.test.tsx`

- [ ] сторінка `Expenses.tsx`: форма (квартира або «загальна», дата, категорія,
  сума+валюта, нотатки) + список із редагуванням/видаленням; стани
  завантаження/помилки/порожнього списку за наявними патернами сторінок
- [ ] маршрут у `App.tsx` та пункт навігації в `Layout.tsx`
- [ ] write tests: створення/редагування/видалення; загальна витрата;
  валідація суми; помилка API → банер, сторінка не падає
- [ ] run tests — must pass before task 8

### Task 8: Секція P&L на сторінці Статистики

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/theme.css`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [ ] секція «P&L»: плитки дохід / витрати / чистий / маржа за період+масштаб;
  помісячний графік (дохід vs витрати; чистий лінією) з `<title>`/`aria-label`;
  розбивка витрат за категоріями
- [ ] завантаження `getPnlStats` за зразком наявних ефектів (cleanup,
  залежність від `apartmentId`/`scope`/`statsPeriod`); при `unconverted.count>0`
  — показ «неконвертовано» і **явна позначка `net`/`margin` як неповних**
- [ ] нові кольори — токени в усі три блоки `theme.css`
- [ ] write tests: рендер P&L (мок `getPnlStats`), зміна масштабу/періоду,
  порожній P&L, повідомлення про неконвертовані витрати + позначка неповних
  net/margin
- [ ] run tests — must pass before task 9

### Task 9: Тренди й порівняння споживання (frontend)

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/theme.css`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [ ] YoY-накладення на `MiniLineChart` (пунктир «той самий місяць торік»)
  показується **лише** коли діапазон охоплює попередній рік (24 міс / весь
  час / custom, що перекриває минулий рік); у 6/12-міс — приховано
- [ ] дельта vs попередній місяць і vs той самий місяць торік (стрілка/%,
  доступність через `aria-label`); плитки/підпис `avg/min/max` по послузі
- [ ] перемикач одиниць ↔ ₴ (вартість спожитого з `cost`)
- [ ] нові кольори/стани — токени в усі три блоки `theme.css`
- [ ] write tests: YoY-лінія присутня/відсутня залежно від діапазону; дельта
  рахується правильно (у т.ч. відсутній попередній місяць → без стрілки);
  avg/min/max; перемикач одиниць/₴
- [ ] run tests — must pass before task 10

### Task 10: Verify acceptance criteria
- [ ] verify all requirements from Overview are implemented (CRUD витрат;
  P&L дохід/витрати/чистий/маржа по квартирі та портфелю; YoY, дельта,
  avg/min/max, вартість спожитого; backup/restore покриття)
- [ ] verify edge cases: дохід=0 (маржа null), витрати без курсу
  (unconverted), порожні періоди, видалення квартири з витратами, загальні
  витрати (`NULL`)
- [ ] run full backend suite: `docker compose -f docker/docker-compose.dev.yml
  run --rm backend pytest` + `ruff check .`
- [ ] run full frontend suite: `docker compose -f docker/docker-compose.dev.yml
  run --rm frontend npm test`
- [ ] verify frontend build: `docker compose -f docker/docker-compose.dev.yml
  run --rm frontend npm run build`

### Task 11: [Final] Update documentation
- [ ] додати запис у `ChangeLog.md` (`## [YYYY-MM-DD HH:MM] …`, зачеплені
  файли, поведінка, примітка про міграцію та деплой)
- [ ] оновити `docs/improvements-backlog.md`: статус #7 (🏗️→✔️) і примітку
  #10 (реалізовано в межах цієї роботи; чек-вкладення — окремий кандидат)
- [ ] update README.md if needed (нова сторінка «Витрати»/розділ статистики)
- [ ] update CLAUDE.md if new patterns discovered (напр., read-only курс для
  агрегацій)
- [ ] створити окремий git-коміт циклу з коротким імперативним заголовком
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion
*Ручні дії та зовнішні системи — інформаційно, без checkboxes*

**Manual verification:**
- Browser walkthrough у light і dark темах через `docker/docker-compose.dev.yml`:
  сторінка «Витрати» (CRUD, загальна витрата), секція P&L (масштаб/період,
  неконвертовані витрати), тренди споживання (YoY, дельта, avg/min/max,
  одиниці/₴).
- Ручний backup → restore на dev-даних із витратами: підтвердити, що витрати
  й `restore_key` відновлюються, повторний import ідемпотентний.
- Статус: очікує виконання перед релізом.

**External system updates:**
- Зміна містить **міграцію БД** і зачіпає production backend+frontend. Перед
  розгортанням на Synology — **ручний DR-архів усього `data/`** (in-app restore
  сумісний лише з тією ж Alembic-ревізією), потім rebuild/restart за
  `docs/deploy.md` (production `docker/docker-compose.yml` з локальним `.env`,
  один Uvicorn-worker). Автоматичний деплой не виконується.
