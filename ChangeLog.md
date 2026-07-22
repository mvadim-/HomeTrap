# ChangeLog

## [2026-07-22 15:18] Task 7: read-only авто-витрати з рахунків

- `backend/app/schemas.py`, `frontend/src/api/client.ts` — expense API-контракт
  тепер повертає nullable `invoice_line_id`, щоб UI відрізняв авто-витрати.
- `frontend/src/pages/Expenses.tsx` — прив'язані до рахунка витрати позначаються
  як «з рахунку» і не мають дій редагування/видалення; звичайні витрати
  зберігають обидві дії.
- `backend/tests/test_expenses.py`, `frontend/src/pages/Expenses.test.tsx` — перевірено
  нове поле API, read-only стан прив'язаної витрати та незмінну редагованість
  звичайної.
- `docs/plans/20260722-invoice-adjustment-lines.md` — Task 7 позначено виконаним.
- Зміна призначена для production, але автоматичний деплой не виконувався;
  після backup і застосування міграції `20260722_09` потрібно перебудувати та
  перезапустити застосунок за `docs/deploy.md`.

## [2026-07-22 15:16] Task 6: UI коригувань рахунку

- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/pages/portal.css` —
  у редакторі чернетки додано адаптивну секцію разових коригувань із міткою,
  знаковою сумою, видаленням, окремим тоталом і негайним перерахунком суми рахунку;
  виставлені та оплачені рахунки показують збережені рядки лише для читання.
- `frontend/src/components/InvoiceCalculator.tsx` — для від'ємної компенсації
  доступні галочка авто-витрати та категорія; додатна сума вимикає й очищає цей
  стан, а невалідна сума або порожня мітка блокують збереження/виставлення.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/InvoiceEdit.test.tsx` — перевірено add/edit/delete,
  checkbox+категорію, positive guard, валідацію, read-only режим, тотали та
  передачу повного adjustment payload перед виставленням. У Docker пройдено
  206 frontend-тестів і production build.
- `docs/plans/20260722-invoice-adjustment-lines.md` — Task 6 позначено виконаним.
- Зміна призначена для production, але автоматичний деплой не виконувався;
  після backup і застосування міграції `20260722_09` потрібно перебудувати та
  перезапустити застосунок за `docs/deploy.md`.

## [2026-07-22 15:10] Task 5: клієнтський API коригувань рахунку

- `frontend/src/api/client.ts` — типи рахунку синхронізовано з backend-контрактом:
  додано adjustment-kind, nullable `service_id`, `adjustments_total`, прив'язану
  витрату й payload коригувань для `updateInvoice`.
- `frontend/src/api/client.test.ts` — перевірено отримання adjustment-тоталу та
  прив'язаної витрати через `getInvoice`, а також точну JSON-форму коригувань у
  `updateInvoice`.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/InvoiceEdit.test.tsx` — fixture-и приведено до нового
  обов'язкового типу відповіді рахунку. Валідація в Docker: 199 frontend-тестів
  пройдено, production build успішний.
- `docs/plans/20260722-invoice-adjustment-lines.md` — Task 5 позначено виконаним.
- Зміна призначена для production, але автоматичний деплой не виконувався;
  після backup і застосування міграції `20260722_09` потрібно перебудувати та
  перезапустити застосунок за `docs/deploy.md`.

## [2026-07-22 15:03] Task 4: backup/restore коригувань рахунку

- `backend/app/services/restore.py` — restore копіює `adjustments_total`, підтримує
  adjustment-рядки без `service_id`, ремапить нові invoice line ID та безпечно
  відв'язує витрату, якщо її рядок пропущено під час merge наявного рахунка.
- `backend/tests/test_restore.py`, `backend/tests/test_backup.py` — перевірено
  snapshot і повний export→import round-trip коригування з авто-витратою,
  ремап зв'язку, повторний ідемпотентний import і missing-line merge без дубля.
  Валідація: backend 237 passed, Ruff чисто — усе через Docker.
- `docs/plans/20260722-invoice-adjustment-lines.md` — Task 4 позначено виконаним.
- Зміна призначена для production, але автоматичний деплой не виконувався;
  перед розгортанням потрібен backup `data/`, потім rebuild/restart за
  `docs/deploy.md` із застосуванням міграції `20260722_09` з Task 1.

## [2026-07-22 14:55] Task 3: API-схеми коригувань рахунку

- `backend/app/schemas.py`, `backend/app/routers/invoices.py` — додано валідований
  список коригувань у `InvoiceUpdate`, nullable `service_id` у рядках/попередженнях
  і передавання payload до білінгу.
- `backend/app/services/billing.py` — відповідь рахунку тепер містить
  `adjustments_total`, канонічний `kind`, сумісний `service_kind`, мітку та компактну
  прив'язку авто-витрати; витрати рядків завантажуються разом із рахунком.
- `backend/tests/test_invoices.py` — перевірено API create/update/delete, тотали,
  серіалізацію витрати, від'ємний знак, категорію та конфлікт non-draft.
  Валідація: backend 234 passed, Ruff чисто — усе через Docker.
- `docs/plans/20260722-invoice-adjustment-lines.md` — Task 3 позначено виконаним;
  до переліку файлів додано billing-серіалізатор, потрібний для контракту відповіді.
- Зміна призначена для production, але автоматичний деплой не виконувався;
  перед розгортанням потрібен backup `data/`, потім rebuild/restart за
  `docs/deploy.md` із застосуванням міграції `20260722_09` з Task 1.

## [2026-07-22 14:46] Task 2: білінг коригувань та авто-витрат

- `backend/app/services/billing.py` — перерахунок розділяє комунальні послуги й
  коригування та включає обидва бакети в `grand_total`; `update_draft` підтримує
  повний список add/edit/delete коригувань лише для чернеток.
- `backend/app/services/billing.py` — від'ємне коригування за галочкою створює
  або ідемпотентно оновлює прив'язану UAH-витрату; зняття галочки чи видалення
  рядка прибирає витрату, а нова лінія флашиться перед прив'язкою.
- `backend/tests/test_billing.py` — перевірено тотали, add/edit/delete, sync і
  desync витрати, заборону витрати для додатної суми, non-draft guard та CASCADE.
  Валідація: backend 232 passed, Ruff чисто — усе через Docker.
- `docs/plans/20260722-invoice-adjustment-lines.md` — Task 2 позначено виконаним.
- Зміна призначена для production, але автоматичний деплой не виконувався;
  перед розгортанням потрібен backup `data/`, потім rebuild/restart за
  `docs/deploy.md` із застосуванням міграції `20260722_09` з Task 1.

## [2026-07-22 14:38] Task 1: модель рядків-коригувань рахунку

- `backend/app/models.py` — додано `ServiceKind.ADJUSTMENT`, nullable
  `InvoiceLine.service_id`, бакет `Invoice.adjustments_total` з default `0.00`
  та двобічний зв'язок `Expense.invoice_line_id` з DB CASCADE.
- `backend/alembic/versions/20260722_09_invoice_adjustments.py` — нова
  ідемпотентна міграція: SQLite batch-recreate `invoice_lines` зі збереженням
  CHECK, обох FK та індексів; додано колонку тоталу й nullable FK витрати.
- `backend/tests/test_models.py` — перевірено adjustment без послуги,
  `tariff_value=0`, default тоталу, CHECK, RESTRICT, структуру міграції та каскад
  invoice → line → expense. Валідація: backend 229 passed, ruff чисто.
- Зміна потребує production-міграції БД до `20260722_09`; автоматичний деплой
  не виконувався. Перед production-розгортанням потрібен backup `data/`, потім
  rebuild/restart за `docs/deploy.md`.

## [2026-07-22 14:13] План: рядок-коригування в рахунку з авто-витратою

- `docs/plans/20260722-invoice-adjustment-lines.md` — новий план: разовий
  рядок «Коригування/Компенсація» в редакторі рахунку зі знаковою сумою та
  галочкою «оплата за рахунок орендаря → врахувати як витрату», що зменшує суму
  рахунку й авто-створює прив'язану `Expense` для P&L. Носій — рядок рівня
  рахунку (не рекурсивна послуга); окремий бакет `adjustments_total`; міграція
  `20260722_09`. 10 задач (модель/білінг/API/backup-restore/frontend/агрегації).
- Уточнено через planning:make й скориговано за авто-рев'ю: симетрія
  чернетка/виставлений у P&L (виключення витрат чернеток), `tariff_value=0` для
  adjustment-ліній, SQLite batch-recreate зі збереженням констрейнтів, guard у
  restore, `ServiceKind.ADJUSTMENT`, виключення коригувань із income top_service.
- Лише документація; коду застосунку не зачеплено. Реалізацію не розпочато.

## [2026-07-22 08:20] Виправлення code review (codex): P&L неповні дані

- **Frontend:** `frontend/src/pages/Stats.tsx` — коли період має лише
  неконвертовані витрати (`values: []`, `unconverted.count > 0`), P&L більше
  не показує оманливе «немає даних», а виводить попередження про
  неконвертовані витрати. Тест `frontend/src/pages/Stats.test.tsx`
  («shows the unconverted warning when only unconverted expenses exist»).
- **Docs:** `ChangeLog.md` — актуалізовано лічильники тестів (backend 225 /
  frontend 197).
- **Валідація:** backend pytest 225 passed, ruff чисто; frontend 197 passed,
  `npm run build` — OK.

## [2026-07-21 22:30] Фіча #7 + #10: облік витрат, P&L і тренди статистики (завершено)

Зведений запис по завершеній фічі (деталі по тасках — у записах нижче).
Реалізовано ідею **#7 (облік витрат і чистий дохід, P&L)**
разом із залишком **#10 (тренди/порівняння у статистиці)**.

- **Backend — сутність і CRUD:** `backend/app/models.py` — модель `Expense`
  (`ExpenseCategory` StrEnum, nullable `apartment_id` FK→apartments CASCADE,
  `date`, `amount Numeric(12,2)`, `currency` дефолт `UAH`, `notes`, unique
  `restore_key`); Alembic-ревізія `backend/alembic/versions/20260721_08_*`
  (таблиця `expenses`, індекс `apartment_id`, unique `restore_key`).
  `backend/app/schemas.py` — `ExpenseCreate/Update/Response`; роутер
  `backend/app/routers/expenses.py` (GET/POST/PATCH/DELETE через
  `write_session`) зареєстровано в `backend/app/main.py`.
- **Backend — P&L і статистика:** `backend/app/routers/stats.py` — ендпойнт
  `GET /api/stats/pnl` (дохід = `rent_amount_uah` ISSUED/PAID; витрати зведені
  в грн; чистий, маржа лише коли дохід>0; помісячний тренд; `unconverted` для
  витрат без збереженого курсу) і розширене `/consumption` (`cost` у точках +
  `summary:{avg,min,max}`). `backend/app/services/nbu.py` — read-only helper
  `get_stored_rate` (останній `ExchangeRate` ≤ дати, без фетчу/запису).
- **Backend — backup/restore:** `backend/app/services/restore.py` — `expenses`
  у `ENTITY_NAMES` та merge-only `_import_expenses` (ідентичність за
  `restore_key`, ремапінг `apartment_id`, `NULL` → загальна витрата). Знімок —
  повний SQLite, тому таблиця в архів потрапляє автоматично.
- **Frontend:** `frontend/src/api/client.ts` — типи/функції витрат і
  `getPnlStats`, розширені `ConsumptionPoint/Series`. Нова сторінка
  `frontend/src/pages/Expenses.tsx` (CRUD) + маршрут у `frontend/src/App.tsx`
  і пункт навігації в `frontend/src/components/Layout.tsx`. Секція P&L і тренди
  споживання (YoY, дельти MoM/YoY, avg/min/max, перемикач одиниці/₴) у
  `frontend/src/pages/Stats.tsx`; нові токени графіків у
  `frontend/src/theme.css` (усі три блоки) і стилі в
  `frontend/src/pages/portal.css`.
- **Тести:** backend (`test_models`, `test_expenses`, `test_stats`,
  `test_restore`, `test_backup`, `test_settings`) — 225 passed, ruff чисто;
  frontend (`client.test.ts`, `Expenses.test.tsx`, `Stats.test.tsx`) —
  197 passed; `npm run build` — OK.
- **Документація:** оновлено `README.md` (розділ «Витрати та P&L», розширено
  «Статистика»), `docs/improvements-backlog.md` (#7 → ✔️ готово, примітка #10),
  `CLAUDE.md` (патерн read-only курсу для агрегацій).
- **Деплой:** зміна містить **міграцію БД (`20260721_08`)** і зачіпає
  production backend+frontend. Перед розгортанням на Synology — **ручний
  DR-архів усього `data/`** (in-app restore сумісний лише з тією ж
  Alembic-ревізією), потім rebuild/restart за `docs/deploy.md` (production
  `docker/docker-compose.yml`, один Uvicorn-worker). Автоматичний деплой не
  виконується.

## [2026-07-21 22:15] Task 9: Тренди й порівняння споживання (frontend)

- `frontend/src/pages/Stats.tsx` — `MiniLineChart` отримав проп `mode`
  (`units`/`cost`) і рахує всі метрики з нього. Додано: YoY-накладення
  (пунктирна лінія «той самий місяць торік») — рендериться **лише** коли
  діапазон охоплює попередній рік (є місяць із контрагентом −12 у видимих
  періодах, тобто 24 міс / весь час / custom, що перекриває минулий рік; у
  6/12-міс приховано); дельти vs попередній місяць і vs той самий місяць торік
  (`ConsumptionDeltaBadge`, стрілка+% з `aria-label`; без контрагента або при
  нульовій базі — без дельти); підпис `avg/min/max` по кожній послузі
  (у режимі одиниць — з `series.summary`, у режимі ₴ — пораховано з `cost`);
  секційний перемикач «Одиниці ↔ ₴», що перемикає весь блок споживання (лінія,
  поточне значення, дельти, зведення). Хелпер `shiftMonthKey` для арифметики
  місяців.
- `frontend/src/theme.css` — нові токени `--chart-yoy`, `--chart-delta-up`,
  `--chart-delta-down` у всіх трьох блоках (light `:root`,
  `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`).
- `frontend/src/pages/portal.css` — стилі `.consumption-unit-switch`,
  `.consumption-deltas`/`.consumption-delta`(-up/-down), `.consumption-summary`
  (dl зведення). YoY-лінія/точки використовують нові токени інлайн.
- `frontend/src/pages/Stats.test.tsx` — нові тести: YoY-лінія
  присутня/відсутня залежно від діапазону; дельта MoM рахується правильно та
  відсутня без попереднього місяця; підпис avg/min/max; перемикач одиниць/₴
  перемикає значення.
- Суто фронтенд-зміна; деплой — разом із загальним релізом фічі (див. план,
  Post-Completion). Окремих кроків розгортання не потребує.

## [2026-07-21 21:55] Task 8: Секція P&L на сторінці Статистики

- `frontend/src/pages/Stats.tsx` — нова секція «P&L» після секції «Дохід»,
  що перевикористовує наявні фільтри періоду/масштабу/квартири. Додано
  завантаження `getPnlStats` окремим `useEffect` (cleanup, залежності
  `apartmentId`/`scope`/`statsPeriod`; портфель → без `apartmentId`) зі
  станами loading/error/empty. Плитки Дохід/Витрати/Чистий/Маржа
  (`margin_percent=null → «—»`), помісячний графік `PnlChart` (згруповані
  стовпці дохід vs витрати + чистий лінією, підтримка від'ємного чистого,
  `role="img"`/`aria-label`, `<title>` на сегментах) та розбивка витрат за
  категоріями. При `unconverted.count>0` — банер-`note` зі списком валют і
  **явна позначка `*` + «неповний показник»** біля плиток чистого й маржі.
- `frontend/src/theme.css` — нові токени `--chart-expense` та `--chart-net`
  у всіх трьох блоках (light `:root`, `:root[data-theme="dark"]`,
  `@media (prefers-color-scheme: dark)`); дохід і категорійні смуги
  перевикористовують наявні `--chart-rent`/`--chart-expense`.
- `frontend/src/pages/portal.css` — стилі `.pnl-summary-grid`,
  `.pnl-unconverted-note`, легенда/свотчі P&L, бари `.pnl-income`/`.pnl-expense`,
  лінія/точки чистого, `.pnl-category-breakdown`; додано `.pnl-summary-grid`
  у колапс сітки при `max-width:900px`.
- `frontend/src/pages/Stats.test.tsx` — хелпери `pnlStats`/`emptyPnlStats`,
  дефолтний мок `getPnlStats` у `beforeEach`; нові тести: рендер плиток+графіка+
  розбивки, перезавантаження при зміні масштабу/періоду, порожній P&L,
  позначка неповних net/margin при неконвертованих витратах. Оновлено наявний
  тест «clears an incomplete custom range» (2→3 повідомлення про період —
  секція P&L додає третє). [decision]
- Суто фронтенд-зміна; деплой — разом із загальним релізом фічі (див. план,
  Post-Completion). Окремих кроків розгортання не потребує.

## [2026-07-21 21:35] Task 6: Клієнтські типи й функції API

- `frontend/src/api/client.ts` — додано типи `ExpenseCategory`, `Expense`,
  `ExpenseCreatePayload`/`ExpenseUpdatePayload`, `PnlStats` (+`PnlPoint`,
  `PnlTotals`, `PnlUnconverted`); грошові поля — рядки, `margin_percent`
  nullable, `expenses_by_category`/`by_currency` як `Record<string,string>`.
  Розширено `ConsumptionPoint` полем `cost` і `ConsumptionSeries` полем
  `summary` (новий тип `ConsumptionSummary` avg/min/max). Нові функції
  `getPnlStats` (перевикористовує `addStatsPeriod`, як `getIncomeStats`),
  `getExpenses` (фільтри apartmentId/dateFrom/dateTo), `createExpense` (POST),
  `updateExpense` (PATCH), `deleteExpense` (DELETE) — URL/verb за роутером
  бекенда `/api/expenses`, `/api/stats/pnl`.
- `frontend/src/api/client.test.ts` — нові тести форми запитів: серіалізація
  періоду P&L (months / date range), пропуск `apartment_id` для портфеля,
  фільтри списку витрат (+без фільтрів), тіла create/update, delete 204.
- `frontend/src/pages/Stats.test.tsx` — оновлено фікстури `getConsumptionStats`
  (нові обов'язкові поля `cost`/`summary`), щоб tsc-збірка проходила
  (тести Stats — у межах Task 8/9). [decision]

## [2026-07-21 21:10] Task 5: Покриття Expense у backup/restore

- `backend/app/services/restore.py` — додано `Expense` до `ENTITY_NAMES` та
  імпортів; новий merge-only `_import_expenses` (ідентичність за `restore_key`:
  exact match → пропуск, без оновлення live-рядків; ремапінг `apartment_id`
  через `apartment_map`, `NULL` → загальна витрата; без пре-алокації id —
  autoincrement, як leaf-сутності `Tariff`/`InvoiceLine`/`ExchangeRate`);
  підключено в `_import_rows` після `_import_exchange_rates`.
- `backend/tests/test_restore.py` — `_create_source` тепер сіє квартирну й
  загальну (`NULL`) витрати; нові round-trip тести (збереження `restore_key`,
  ремапінг квартири, `NULL` → загальна) та ідемпотентність (повторний import
  без дублів); оновлено exact-dict-асерти на `expenses`.
- `backend/tests/test_backup.py` — перевірка наявності таблиці `expenses` у
  знімку архіву (повний SQLite-копі).
- `backend/tests/test_settings.py` — оновлено exact-dict-асерти restore-summary
  на ключ `expenses`.

## [2026-07-21 20:35] Task 3: P&L-агрегація та /api/stats/pnl

- `backend/app/services/nbu.py` — додано read-only helper `get_stored_rate`
  (останній `ExchangeRate` ≤ дати для валюти; без фетчу/запису), придатний для
  агрегацій, що не мають мутувати стан.
- `backend/app/schemas.py` — додано `PnlStats` (+`PnlPoint`, `PnlTotals`,
  `PnlUnconverted`): `values`, `totals` з `expenses_by_category`, `net`,
  `margin_percent` (nullable), `unconverted{count,by_currency}`.
- `backend/app/routers/stats.py` — новий ендпойнт `GET /api/stats/pnl` (той
  самий контракт періоду й `apartment_id`/portfolio, що `/income`): дохід =
  `rent_amount_uah` ISSUED/PAID (комуналка виключена); витрати зводяться в грн
  (UAH як є; USD за збереженим курсом `≤ date`), не-UAH/не-USD та без курсу →
  `unconverted` і виключені з `expenses_total`; фільтр дат витрат із верхньою
  межею «< перше число місяця після `period_end`»; групування за місяцем;
  маржа лише коли дохід>0.
- `backend/tests/test_stats.py` — тести P&L: квартира vs портфель, дохід лише
  з оренди, суми за категоріями, UAH/USD-конвертація, неконвертовані (EUR та
  USD без курсу), помісячний тренд, регресія на витрату в кінці місяця,
  дохід=0 → `margin_percent=null`, край без витрат, `404`/`401`.
- Лише backend; міграцій не додано.

## [2026-07-21 20:10] Task 2: схеми та CRUD-роутер витрат

- `backend/app/schemas.py` — додано `ExpenseCreate`/`ExpenseUpdate`/
  `ExpenseResponse` (валідація `amount > 0`, `currency` 3 літери з
  нормалізацією до верхнього регістру, `category` з `ExpenseCategory`,
  опційний `apartment_id`). `ExpenseUpdate` — часткове оновлення
  (`exclude_unset`). Додано аліас `date_type`, щоб поле `date` не затіняло тип.
- `backend/app/routers/expenses.py` — новий роутер за зразком `tenants.py`:
  `GET /api/expenses` (фільтри `apartment_id`, `date_from`/`date_to`),
  `POST`, `PATCH/{id}`, `DELETE/{id}` через `get_write_db`; `404` для
  неіснуючої квартири/витрати.
- `backend/app/main.py` — зареєстровано `expenses_router`.
- `backend/tests/test_expenses.py` — CRUD-happy-path, дефолт/нормалізація
  валюти, загальна витрата (`apartment_id=null`), фільтри за квартирою й
  датами, помилки валідації (`amount<=0`, категорія, валюта), `404`
  (квартира/витрата), вимога авторизації.
- Лише backend; міграцій не додано (таблиця з Task 1).

## [2026-07-21 19:45] Task 1: модель Expense + міграція

- `backend/app/models.py` — додано `ExpenseCategory(StrEnum)` (repair/tax/
  insurance/commission/other) та модель `Expense` (nullable `apartment_id`
  FK→apartments `ondelete=CASCADE`, `date`, `category` з `CheckConstraint`,
  `amount Numeric(12,2)`, `currency String(3)` default `UAH`, `notes`,
  стабільний unique `restore_key` за зразком `Service`); relationship
  `Apartment.expenses` (cascade `all, delete-orphan`).
- `backend/alembic/versions/20260721_08_add_expenses.py` — нова ревізія
  (down_revision `20260721_07`): таблиця `expenses`, індекс `apartment_id`,
  unique `restore_key`; ідемпотентна перевірка існування (SQLite-friendly).
- `backend/tests/test_models.py` — тести створення квартирної/загальної
  витрати, дефолт `currency=UAH`, генерація `restore_key`, `CheckConstraint`
  категорії, unique `restore_key`, каскад видалення з квартирою; оновлено
  очікуваний head-revision та перелік таблиць міграції.
- Деплой: зміна містить міграцію БД — застосується автоматично при старті
  backend (див. `docs/deploy.md`).

## [2026-07-21 19:31] План: P&L та розширена статистика (#7 + #10)

- `docs/plans/20260721-pnl-and-stats-trends.md` — новий план реалізації ідеї
  #7 (облік витрат, звіт P&L: дохід−витрати=чистий, маржа) разом із залишковою
  частиною #10 (тренди/порівняння споживання: YoY, дельта, avg/min/max,
  вартість спожитого). 11 задач: модель `Expense` + міграція, CRUD-роутер,
  ендпойнт `/api/stats/pnl`, розширення `/consumption`, покриття backup/restore,
  фронтенд (сторінка витрат + секція P&L + тренди в Statistics).
- План уточнено через planning:make й скориговано за авто-рев'ю (межа дат
  витрат, неповні net/margin при неконвертованих сумах, merge-only import,
  обсяг YoY). Чек-вкладення й міжквартирне порівняння — поза обсягом v1.
- Лише документація; коду застосунку не зачеплено. Реалізація почнеться
  окремими комітами по задачах.

## [2026-07-21 17:39] Скрипт оновлення для Synology

- `synology-update.sh` — новий скрипт безпечного оновлення на Synology: `git fetch`
  (якщо нема нового — вихід без простою) → **бекап `data/` першим**, до будь-яких
  змін → `git pull --ff-only` → `up -d --build` → очікування `healthy` → ротація
  старих бекапів; наприкінці друкує підказку відкату (код + дані). Конфігурується
  через оточення (`HOMETRAP_DIR`, `HOMETRAP_BACKUP_DIR`, `HOMETRAP_KEEP_BACKUPS`,
  `HOMETRAP_HEALTH_TIMEOUT`, `SUDO`).
- `docs/deploy.md` — у розділ «Оновлення» додано покажчик на скрипт.
- Операційний хелпер; production-код застосунку не зачеплено.

## [2026-07-21 16:22] Відновлювана міграція restore-ключів

- `backend/alembic/versions/20260721_06_restore_keys.py` — міграція перевіряє
  фактичний стан колонок та unique constraints, заповнює лише відсутні ключі й
  безпечно продовжується після частково виконаного SQLite DDL.
- `backend/tests/test_models.py` — додано регресію стану з доданою nullable
  `apartments.restore_key`, але старою Alembic-ревізією.
- Docker-перевірка: backend — 206 тестів passed, `ruff check .` — passed; реальна
  dev-БД оновлена до `20260721_07`, health endpoint повертає `200`.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; міграція
  автоматично завершить частково застосований стан, автоматичний деплой не виконувався.

## [2026-07-21 16:20] Завершення плану backup/restore

- `docs/plans/completed/20260720-backup-and-restore.md` — план backup/restore
  підготовлено до перенесення в каталог завершених планів після успішних
  review/finalize циклів.
- `docs/improvements-backlog.md` — посилання реалізованої функції синхронізовано з
  канонічним шляхом завершеного плану.
- Фінальна Docker-перевірка: backend — 205 тестів passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed.
- Зміна призначена для production. Перед розгортанням зробіть ручний DR-архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; автоматичний
  деплой не виконувався.

## [2026-07-21 16:05] Канонічні колізії шляхів restore-архіву

- `backend/app/services/restore_archive.py` — перевірка дублікатів ZIP-членів тепер
  порівнює канонічні extraction targets, тому dot-сегменти, повторні чи Windows-
  роздільники та file/directory slash-варіанти відхиляються до розпакування.
- `backend/tests/test_settings.py` — додано API-регресії для еквівалентних шляхів із
  перевіркою `422`, незмінності live-БД та наявних uploads.
- Docker-перевірка: backend — 205 тестів passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed; `git diff --check` — passed.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; міграцій БД
  немає, автоматичний деплой не виконувався.

## [2026-07-21 15:39] Спрощення координації та restore pipeline

- `backend/app/services/storage.py`, `backend/app/auth.py`, mutating router-и та
  `backend/app/services/scheduler.py` — усі production DB writers переведено на
  єдиний `write_session`/`get_write_db` transaction API замість розсипаних
  декораторів і ручних outer-lock блоків; commit/rollback/close для owned session
  тепер визначені в одному місці.
- `backend/app/services/restore_archive.py`, `backend/app/routers/settings.py` —
  потокове приймання upload, безпечне розпакування, manifest/revision validation і
  запуск транзакційного merge винесено із HTTP router у restore archive service;
  router залишає лише mapping доменних помилок у `413`/`422`.
- `backend/app/services/backup_limits.py`, `backend/app/services/backup.py` — backup
  і restore використовують одну перевірку member count, uncompressed size та
  compression ratio, зберігаючи попередні backup error messages.
- `backend/app/services/restore.py` — 299-рядковий `_import_rows` розбито на
  типізований `ImportContext` і окремі helpers для квартир, послуг, тарифів,
  орендарів, вкладень, рахунків, рядків та курсів; прибрано зайвий `except: raise`.
- `backend/tests/test_{storage,backup,settings}.py` — додано commit/rollback регресію
  централізованої write-session і переведено quota/concurrency перевірки на нові
  спільні service API.
- Docker-перевірка: backend — 201 тест passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed; `git diff --check` — passed.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; міграцій БД
  немає, автоматичний деплой не виконувався.

## [2026-07-21 15:19] Crash-safe backup, restore і видалення tenant

- `backend/app/services/{restore,storage}.py`, `backend/app/main.py` — restore тепер
  durably створює journal і всі батьківські каталоги, переміщує та fsync-ить файли до
  DB commit, а startup recovery завершує committed операції або прибирає orphan-файли;
  `.deleting` tenant-каталоги також автоматично відновлюються чи видаляються за станом БД.
- `backend/app/routers/services.py`, `backend/app/services/restore.py` — hard delete
  послуги прибирає її restore aliases, а імпорт відхиляє невалідні, dangling і
  конфліктні source aliases до commit.
- `backend/app/services/backup.py` — preflight обходить uploads потоково без повної
  матеріалізації/сортування, зупиняється на member quota та заздалегідь враховує
  manifest, ZIP headers, central directory і EOCD разом із верхньою межею SQLite.
- `backend/tests/test_{apartments,attachments,backup,restore}.py` — додано регресії
  alias cleanup/validation, помилки фіналізації, crash до DB commit, directory fsync,
  startup recovery tenant delete і bounded/metadata-aware backup preflight.
- Docker-перевірка: backend — 200 тестів passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed; `git diff --check` — passed.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; recovery
  виконується автоматично на старті, автоматичний деплой не виконувався.

## [2026-07-21 15:02] Атомарний restore та ранні backup-квоти

- `backend/app/services/restore.py`, `backend/app/models.py`, міграція
  `20260721_07_restore_aliases.py` — exact/alias identity резервується до fallback,
  stable live `restore_key` більше не перезаписується; merge планується до єдиного
  write-flush, а файловий durable journal завершується або відкидається на startup.
- `backend/app/services/storage.py`, DB-mutating routers і scheduler — усі production
  writers координуються зі snapshot/restore через спільний lock у sync worker-thread,
  тому check/insert і довші maintenance-операції не конкурують за SQLite write-lock.
- `backend/app/services/backup.py` — розмір БД/uploads і кількість ZIP members
  перевіряються до `VACUUM INTO` та створення архіву; неможливий backup завершується
  контрольованим `BackupLimitError` без великих temp-файлів.
- `backend/tests/test_{backup,models,restore}.py` — додано регресії order-independent
  exact/fallback, alias після перейменування, пізнього flush, раннього quota reject та
  startup recovery committed attachment journal.
- Docker-перевірка: backend — 192 тести passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed; `git diff --check` — passed.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; Alembic-міграція
  і recovery journal виконуються автоматично на старті, автоматичний деплой не виконувався.

## [2026-07-21 14:29] Коректний 413 і безпечне fallback-зіставлення restore

- `backend/app/middleware.py`, `backend/tests/test_settings.py` — перевищення ліміту
  chunked multipart тепер повертає `413`, навіть коли FastAPI перехоплює помилку
  парсингу; Starlette гарантовано закриває вже створені spool-файли.
- `backend/app/services/restore.py`, `backend/tests/test_restore.py` — fallback для
  квартир і послуг не може повторно зайняти live-рядок, уже зіставлений з іншим
  source `restore_key`; збережено ідемпотентність та коректний ремап дочірніх даних.
- Docker-перевірка: backend — 189 тестів passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; автоматичний
  деплой не виконувався.

## [2026-07-21 14:12] Усунення критичних ризиків backup/restore

- `backend/app/{middleware,auth,main}.py`, `backend/app/routers/settings.py` —
  restore-запити автентифікуються й обмежуються за сирим розміром на ASGI-рівні до
  multipart parsing; chunked body також контролюється потоково.
- `backend/app/services/{backup,backup_limits,restore}.py` — успішно створений ZIP
  гарантовано відповідає restore-квотам; вкладення staging-копіюються до відкриття
  live SQLite write transaction, а фінальне переміщення лишається атомарним.
- `backend/app/models.py`, `backend/alembic/versions/20260721_06_restore_keys.py` —
  квартири й послуги отримали унікальні стабільні restore-ключі: допустимі дублікати
  бізнес-полів зберігаються та ідемпотентно відновлюються.
- `backend/app/routers/tenants.py` — multipart attachment upload переведено у
  синхронний FastAPI handler, тому очікування shared lock не блокує event loop.
- `backend/tests/test_{attachments,backup,models,restore,settings}.py`, план,
  `docs/deploy.md`, `CLAUDE.md` — додано регресії раннього upload guard, квот,
  дублікатів, staging до flush і schema constraints; уточнено production deploy.
- Docker-перевірка: backend — 186 тестів passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed.
- Зміна призначена для production backend. Перед розгортанням зробіть ручний архів
  усього `data/`, потім виконайте rebuild/restart за `docs/deploy.md`; Alembic
  міграція застосовується автоматично, автоматичний деплой не виконувався.

## [2026-07-21 13:46] Захист бекапу й відновлення після code review

- `backend/app/services/{backup,restore,storage}.py`, `backend/app/routers/{settings,tenants}.py`
  — синхронізовано SQLite snapshot/restore з файловими мутаціями вкладень; додано
  потокові квоти ZIP, безпечне розпакування, перевірку бізнес-ключів, інтервалів
  договорів і метаданих/вмісту вкладень; blocking restore виконується у threadpool.
- `backend/app/constants.py`, `backend/app/main.py` — версію застосунку винесено з
  `main` у незалежний модуль без runtime-імпорту.
- `backend/tests/test_{backup,restore,settings}.py`, `frontend/src/api/client.test.ts`
  — додано конкурентні, rollback, zip-bomb/zip-slip, interrupted-download і
  fetch-рівневі регресії; тестову lifecycle-обгортку API спрощено до context manager.
- `frontend/src/pages/Settings.tsx`, `docs/deploy.md`, `CLAUDE.md`, план і backlog —
  уточнено секретність архіву, обов'язковий ручний DR-бекап перед оновленням,
  ресурсні ліміти та інваріанти супроводу backup/restore.
- Docker-перевірка: backend — 177 тестів passed, `ruff check .` — passed;
  frontend — 171 тест passed, production build — passed.
- Зміна призначена для production backend і frontend. Для розгортання спочатку
  зробіть ручний архів усього `data/`, потім виконайте rebuild/restart за
  `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-21 13:24] Завершення документації бекапу та відновлення

- `README.md` і `CLAUDE.md` перевірено: опис користувацької можливості вже додано
  в Task 6, нових повторно використовуваних проєктних патернів не виявлено, тому
  додаткові зміни не потрібні.
- `docs/plans/20260720-backup-and-restore.md` — Task 8 позначено виконаним;
  термінальне перенесення плану відкладено оркестратору до завершення
  review/finalize.
- Зміна суто документаційна; production-код не зачеплено, деплой не потрібен.

## [2026-07-21 13:21] Перевірка критеріїв бекапу та відновлення

- `backend/tests/test_settings.py` — додано обмежений інтеграційний round-trip
  великого ZIP-бекапу з вкладенням 9 MiB: upload, завантаження бекапу, імпорт і
  побайтова перевірка відновленого файла.
- `docs/plans/20260720-backup-and-restore.md` — Task 7 позначено виконаним після
  перевірки критеріїв прийняття та крайових випадків.
- Docker-перевірка: backend — 159 тестів passed, `ruff check .` і перевірка
  форматування — passed; frontend — 168 тестів passed, production build — passed.
- Зміна суто тестова; production-код не зачеплено, деплой не потрібен.

## [2026-07-21 13:15] Документація бекапу та відновлення

- `README.md` — додано короткий опис завантаження ZIP-знімка та недеструктивного
  імпорту без перезапуску зі сторінки «Налаштування».
- `docs/deploy.md` — розмежовано in-app імпорт-злиття без зміни наявних даних і
  ручний архів `data/` для повного аварійного відновлення або відкату; додано
  вимоги сумісності й поводження з архівом як із секретом.
- `docs/plans/20260720-backup-and-restore.md` — Task 6 позначено виконаним.
- Зміна суто документаційна; production-код не зачеплено, деплой не потрібен.

## [2026-07-21 13:12] UI бекапу та недеструктивного відновлення

- `frontend/src/api/client.ts` — додано завантаження ZIP-бекапу з іменем від API
  та multipart-відправлення архіву на відновлення з типізованим зведенням.
- `frontend/src/pages/Settings.tsx` — додано секцію «Бекап і відновлення»: безпечне
  збереження архіву, вибір ZIP, підтвердження недеструктивного імпорту, результат
  доданих/пропущених записів і зрозумілі помилки.
- `frontend/src/pages/Settings.test.tsx` — додано перевірки рендеру секції,
  завантаження, підтвердженого відновлення зі зведенням і помилки API.
- Docker-перевірка: frontend — 168 тестів passed; production build — passed.
- Зміна призначена для production frontend. Для розгортання на Synology виконати
  rebuild і restart за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-21 13:06] Відновлення резервної копії через API

- `backend/app/routers/settings.py` — додано захищений multipart endpoint
  `POST /api/settings/restore`: ZIP розпаковується у тимчасову теку після перевірки
  абсолютних і `..` шляхів, manifest/ревізія/SHA валідуюються, а результат
  недеструктивного імпорту повертається як зведення доданих і пропущених сутностей.
- Биті, несумісні й ворожі архіви отримують зрозумілу відповідь 422; тимчасові
  файли прибираються, а помилка не залишає частково імпортованих даних.
- `backend/tests/test_settings.py` — додано покриття успішного злиття зі збереженням
  локальних даних, авторизації, битого ZIP, несумісної ревізії, невірного SHA-256
  і zip-slip через `..`.
- Docker-перевірка: backend — 158 тестів passed; `ruff check .` — passed; цільова
  перевірка форматування змінених файлів — passed.
- Зміна призначена для production backend. Для розгортання на Synology виконати
  rebuild і restart за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-21 12:58] Недеструктивний імпорт резервної копії

- `backend/app/services/restore.py` — додано валідацію manifest, SHA-256 і ревізії
  snapshot DB, а також транзакційний upsert-missing для квартир, послуг, тарифів,
  орендарів, вкладень, рахунків, рядків рахунків і курсів валют із FK-ремапом.
- Імпорт не переносить користувачів, налаштування та push-підписки; конфлікт іншого
  активного орендаря звітується як пропуск. Вкладення копіюються після `flush`, а
  при помилці нові файли прибираються до rollback.
- `backend/tests/test_restore.py` — додано 11 тестів на round-trip, часткове та
  повторне злиття, незмінність наявних даних, FK, manifest/SHA, активного орендаря,
  вкладення наявного орендаря і атомарний rollback без orphan-файлів.
- Docker-перевірка: backend — 152 тести passed; `ruff check .` — passed.
- Зміна призначена для production backend. Для розгортання на Synology виконати
  rebuild і restart за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-21 12:50] Завантаження резервної копії через API

- `backend/app/routers/settings.py` — додано захищений endpoint
  `GET /api/settings/backup`, який віддає ZIP із часовою міткою та очищає
  тимчасовий архів після завершення відповіді.
- `backend/tests/test_settings.py` — додано перевірки валідного ZIP для
  автентифікованого адміністратора, очищення temp-файла і відповіді 401 без
  автентифікації.
- Зміна призначена для production backend. Для розгортання на Synology виконати
  rebuild і restart за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-21 12:44] Сервіс створення резервної копії

- `backend/app/services/backup.py` — додано консистентний SQLite-знімок через
  `VACUUM INTO`, ZIP із базою, uploads і manifest та автоматичне очищення
  тимчасових файлів.
- `backend/tests/test_backup.py` — додано перевірки структури архіву, manifest,
  SHA-256, читабельності знімка, порожньої uploads-теки та прибирання temp-файлів.
- Зміна призначена для production backend. Для розгортання на Synology виконати
  rebuild і restart за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-21 11:11] План: бекап і недеструктивне відновлення (#1)

- `docs/plans/20260720-backup-and-restore.md` — новий план реалізації ідеї #1:
  бекап (знімок `VACUUM INTO` → zip: db + uploads + manifest) і відновлення як
  недеструктивний імпорт-відсутнього-за-бізнес-ключем (без рестарту, атомарно).
  Пройдено авто-рев'ю (plan-review): враховано конфлікт активного орендаря,
  skip `PushSubscription`, атомарність файлів, zip-slip guard, перевірку `sha256`.
- `docs/improvements-backlog.md` — запис #1 синхронізовано з новою семантикою
  (недеструктивний імпорт замість повної заміни; без рестарту) + покажчик на план.
- Зміна суто документаційна; production-код не зачеплено, деплой не потрібен.

## [2026-07-20 18:38] Доповнення інструкції деплою (Synology)

- `docs/deploy.md` — у розділ «Перший запуск» додано два кроки, що блокували
  перший деплой:
  - створення теки `data/` перед запуском (вона в `.gitignore`; Docker на Synology
    не створює джерело bind-mount → помилка `Bind mount failed`);
  - явні вимоги до `.env` у production: `HOMETRAP_SECRET_KEY` ≥32 символи без
    `change-me`, `ADMIN_PASSWORD` ≥12 символів без `change-me` (інакше застосунок
    аварійно завершується на старті), з командами генерації.
- Зміна суто документаційна; production-код не зачеплено, деплой не потрібен.

## [2026-07-20 17:51] Рефайн беклогу покращень (прохід по 20 ідеях)

- `docs/improvements-backlog.md` — ітеративний рефайн усіх 20 ідей:
  - Виокремлено епік «Кабінет орендаря (Tenant PWA)» (T0–T5), що поглинув #3, #8,
    #12, #15, #17; детальний рефайн складових відкладено до планування епіку.
  - Уточнено (✅, готові до плану): #1 бекап/відновлення, #5 інлайн-дії дашборда,
    #6 bulk-генерація, #7 P&L + тренди (поглинув #10), #9 спосіб оплати, #11 2FA,
    #13 оплата лінк/QR, #14 журнал ремонтів.
  - Знижено пріоритет (🔽): #2, #4, #16, #18, #19, #20 — через невеликий портфель,
    автопродовження договорів і наявні канали зв'язку.
  - Дорожню карту пересортовано; легенду доповнено статусами 🔗/🔽 і приміткою про
    стабільні номери.
- Зміна суто документаційна; production-код не зачеплено, деплой не потрібен.

## [2026-07-20 13:34] Беклог покращень і нових можливостей

- `docs/improvements-backlog.md` — новий живий документ із 20 ідей (10 покращень +
  10 нових можливостей) на основі брейнсторму й огляду ринку property-management
  порталів; містить дорожню карту з 4 хвиль, легенду статусів і структуру для
  ітеративного уточнення (блоки «Уточнення» та «Критерії готовності» на кожну ідею).
- Зміна суто документаційна; production-код не зачеплено, деплой не потрібен.

## [2026-07-20 12:32] Виставлення рахунків у наступному місяці (arrears)

- `backend/app/services/billing_schedule.py` — рахунок за період M тепер
  виставляється в день білінгу місяця M+1 (`_period_for_billing_date`).
  Межі договору фільтруються за періодом, а не за датою дії; орендар із
  договором, що завершився минулого місяця, лишається у вибірці, щоб виставити
  його останній період. Курс для авто-чернетки береться за `period` (як у
  ручному створенні рахунка), а не за `today`.
- `backend/tests/test_billing_schedule.py`, `backend/tests/test_notify.py` —
  очікування зсунуто під arrears-модель (нагадування/чернетка за липень тепер у
  серпні); додано покриття межі старту (перший місяць виставляється наступного)
  та завершення договору.
- `frontend/src/pages/Dashboard.tsx` — у віджет «Найближчі виставлення» додано
  колонку «Період», щоб явно показувати місяць, за який виставляється рахунок.
- Docker-перевірка: backend — 136 тестів passed; frontend — 164 тести passed;
  ручна перевірка `/api/billing/upcoming` і Dashboard: орендар із договором від
  13.11 показує дату 13.08.2026 за період 07.2026, без «прострочено».
- Зміна зачіпає production backend і frontend. Для розгортання на Synology
  виконати rebuild і restart за `docs/deploy.md`: `docker compose --env-file
  .env -f docker/docker-compose.yml up -d --build`. Автоматичний деплой не
  виконувався.

## [2026-07-19 00:37] Завершення плану billing reminder

- `docs/plans/20260718-billing-reminder.md` переміщено до
  `docs/plans/completed/20260718-billing-reminder.md` після виконання 15 tasks,
  review/fix, аналізу code smells, фінального critical review, finalize і stats.
- Production-код у цьому docs-only кроці не змінювався.
- Додатковий deployment не потрібен і не виконувався.

## [2026-07-19 00:17] Усунення code smells у delivery та Web Push

- `backend/app/services/notification_delivery.py`, `backend/app/services/notify.py`,
  `backend/app/services/billing_schedule.py` — спільні delivery-примітиви винесено
  в незалежний модуль без циклічного імпорту; збереження notification history
  зведено до одного helper для обох шляхів завершення daily job.
- `backend/app/services/push.py`, `backend/alembic/env.py`,
  `backend/tests/test_push.py` — генерація VAPID-ключів відновлюється після
  конкурентного insert через rollback і повторне читання канонічного значення;
  startup-міграції зберігають application loggers, а Web Push логує лише безпечні
  структуровані category/status і санітизований traceback неочікуваних помилок.
- Зміна призначена для production. Для розгортання виконайте backup, rebuild і
  restart контейнера за `docs/deploy.md`; міграцій БД і нових змінних середовища
  немає. Автоматичний деплой не виконувався.

## [2026-07-19 00:09] Незалежний цикл billing reminder

- `backend/app/services/billing_schedule.py` — reminder/auto-draft pipeline тепер
  обирає найближче поточне або майбутнє виставлення незалежно від пропущеного
  попереднього періоду; Dashboard зберігає rollover-пропуск і один рядок на квартиру.
- `backend/tests/test_billing_schedule.py` — додано регресії для pre-reminder та
  авто-чернетки поточного періоду за наявності пропущеного попереднього рахунка.
- Зміна призначена для production. Для розгортання виконайте backup, rebuild і
  restart контейнера за `docs/deploy.md`; міграцій БД і нових змінних середовища
  немає. Автоматичний деплой не виконувався.

## [2026-07-18 23:56] Збереження пропущеного виставлення під час rollover

- `backend/app/services/billing_schedule.py` — після переходу місяця розклад
  зберігає найновіше попередньомісячне виставлення без рахунка; за наявності
  рахунка обирає найближчу допустиму майбутню дату, не створюючи backlog і більше
  одного рядка на квартиру.
- `backend/tests/test_billing_schedule.py`, `backend/tests/test_notify.py` — додано
  регресії для переходу 31 липня → 1 серпня, рахунка за попередній період,
  довгого договору та відсутності reminder/auto-draft для простроченого fallback;
  pipeline-сценарії явно фіксують закритий попередній період.
- Зміна призначена для production. Для розгортання виконайте backup, rebuild і
  restart контейнера за `docs/deploy.md`; міграцій БД і нових змінних середовища
  немає. Автоматичний деплой не виконувався.

## [2026-07-18 23:48] Обмеження розкладу billing reminder

- `backend/app/services/billing_schedule.py` — канонічний розклад обмежено одним
  релевантним виставленням на квартиру: простроченим у поточному місяці або
  найближчим майбутнім у межах договору; усунуто розгортання всієї історії.
- `backend/app/services/billing_schedule.py` — конкурентне створення рахунка за
  той самий період більше не перериває щоденний job: після rollback наявний
  рахунок ідемпотентно придушує авто-чернетку, а сесія продовжує обробку.
- `backend/tests/test_billing_schedule.py` — додано регресії для `contract_end`,
  довгого договору, переходу місяця та `IntegrityError` race із продовженням job.
- Зміна призначена для production. Для розгортання виконайте backup, rebuild і
  restart контейнера за `docs/deploy.md`; міграцій БД і нових змінних середовища
  немає. Автоматичний деплой не виконувався.

## [2026-07-18 23:40] Узгодження прострочених виставлень із billing-періодами

- `backend/app/services/billing_schedule.py`, `backend/app/routers/billing.py`,
  `backend/app/schemas.py` — кожен рядок розкладу тепер описує одну фактичну дату
  `billing_date`, її період і статус; пропущені періоди не зникають після зміни
  місяця, а найближче майбутнє виставлення лишається окремим рядком для
  30-денного Dashboard і нагадувань.
- `frontend/src/api/client.ts`, `frontend/src/pages/Dashboard.tsx` — UI перейшов
  на узгоджений API-контракт, окремо сортує і підсвічує пропущені occurrence-и та
  пояснює, що таблиця містить прострочені й заплановані дати.
- `backend/tests/test_billing_schedule.py`, `frontend/src/pages/Dashboard.test.tsx`
  — додано контрактні регресії для простроченої дати без підміни майбутнім
  періодом та для збереження пропуску після переходу на новий місяць.
- Зміна призначена для production. Для розгортання виконайте backup, потім
  rebuild і restart контейнера за `docs/deploy.md`; міграцій БД і нових змінних
  середовища немає. Автоматичний деплой не виконувався.

## [2026-07-18 23:22] Виправлення за комплексним review billing reminder

- `backend/app/services/notify.py`, `backend/app/services/billing_schedule.py` —
  авто-чернетки виконуються без активних каналів доставки, readings-history
  оновлюється лише після власної успішної доставки, а API отримав явну ознаку
  простроченого виставлення.
- `backend/app/schemas.py`, `backend/app/models.py`,
  `backend/alembic/versions/20260718_05_billing_day_push_subscriptions.py` — межу
  попереднього нагадування обмежено 365 днями, а `billing_day` захищено CHECK 1–31
  на рівні БД.
- `frontend/src/pages/Dashboard.tsx`, `frontend/src/utils/push.ts` та тести —
  Dashboard використовує backend-контракт `is_overdue`, перевірка Push-стану не
  реєструє service worker, а невдала браузерна відписка більше не повертає успіх.
- `backend/requirements.txt`, `README.md`, `docs/deploy.md` — закріплено прямі
  криптографічні залежності та повне runtime-дерево Web Push; уточнено час
  scheduler, двоетапне ввімкнення Push, секретність VAPID/підписок і мінімальну
  iOS/iPadOS 16.4.
- Зміни призначені для production. Для розгортання виконайте backup, потім rebuild
  і restart контейнера командою з `docs/deploy.md`; міграція додасть CHECK під час
  старту. Автоматичний деплой не виконувався.

## [2026-07-18 23:04] Документація billing reminder

- `README.md` — описано розрахунок дати виставлення, Dashboard-віджет,
  авто-чернетки та налаштування Telegram, email і Web Push без дублювання
  production-інструкції.
- `CLAUDE.md` — зафіксовано стабільний патерн розширення каналів через
  `NotificationSender` і використання наявного щоденного scheduler-конвеєра.
- `docs/plans/20260718-billing-reminder.md` — Task 15 позначено виконаним;
  фізичне переміщення плану відкладено до завершального кроку planning harness.
- Цикл змінює лише документацію і не потребує production-деплою. Розгортання
  самої фічі виконується за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-18 23:02] Верифікація billing reminder

- `backend/tests/test_billing_schedule.py` — додано acceptance-перевірку включних
  меж договору: орендарі враховуються у дати початку та завершення договору.
- `backend/tests/test_push.py` — перевірку видалення мертвих Web Push-підписок
  розширено на обидві передбачені відповіді push-сервісу, HTTP 404 і 410.
- `docs/plans/20260718-billing-reminder.md` — лише Task 14 позначено виконаним після
  звірки Overview/Technical Details і повних Docker-перевірок: 121 backend-тест,
  161 frontend-тест, Ruff, Alembic check та production frontend build із TypeScript.
- Числового coverage threshold у конфігурації проєкту немає; виконано наявний
  стандарт покриття success/error та edge-case тестами для змінених сценаріїв.
- Зміни тестові й локальні, тому окремого production-деплою не потребують. Для
  розгортання перевіреної фічі потрібні rebuild і restart контейнера за
  `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-18 22:55] Документація Web Push і контрольний прогін

- `docs/deploy.md` — задокументовано HTTPS як передумову Web Push через Synology
  reverse proxy, встановлення PWA на початковий екран iOS та production-оновлення
  з rebuild/restart контейнера й автоматичним застосуванням міграцій.
- `ChangeLog.md` — звірено наявність окремих записів за всі Task 1–12 поточного
  циклу нагадувань про виставлення рахунків.
- `docs/plans/20260718-billing-reminder.md` — лише Task 13 позначено виконаним
  після повного Docker-прогону: 119 backend-тестів, Ruff, Alembic check, 161
  frontend-тест і production frontend build із TypeScript-перевіркою.
- Цей цикл змінює лише документацію й локально перевіряє код у Docker, тому сам
  по собі не потребує production-деплою. Для розгортання фічі потрібні rebuild і
  restart контейнера за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-18 22:50] Віджет найближчих виставлень на дашборді

- `frontend/src/api/client.ts`, `frontend/src/pages/Dashboard.tsx` — додано
  типізований клієнт `GET /api/billing/upcoming` і таблицю виставлень на наступні
  30 днів зі стабільним сортуванням за датою, статусами рахунків та переходами до
  відповідного рахунка або квартири.
- `frontend/src/theme.css`, `frontend/src/pages/portal.css` — додано семантичні
  warning-токени для світлої й темної тем та підсвітку прострочених виставлень без
  створеного рахунка.
- `frontend/src/pages/Dashboard.test.tsx` — перевірено рендер, сортування,
  підсвітку проблемного рядка, переходи, порожній стан і локальну помилку API;
  у Docker пройшли 6 цільових і 161 повний Vitest-тест, TypeScript typecheck та
  production build.
- `docs/plans/20260718-billing-reminder.md` — лише Task 12 позначено виконаним.
- Зміна призначена для production frontend. Для розгортання потрібно виконати
  rebuild image і restart контейнера за `docs/deploy.md`; міграцій і нових
  змінних середовища немає. Автоматичний деплой не виконувався.

## [2026-07-18 22:44] PWA та Push-підписка пристрою

- `frontend/public/manifest.webmanifest`, `frontend/public/icon.svg`,
  `frontend/index.html` — додано standalone PWA-маніфест, мінімальну SVG-іконку та
  підключення manifest/favicon без дублювання raster assets.
- `frontend/public/sw.js` — додано лише обробники Push-повідомлень і кліку по
  сповіщенню з відкриттям застосунку; service worker не містить кешування.
- `frontend/src/utils/push.ts`, `frontend/src/pages/Settings.tsx` — реалізовано
  типізоване визначення статусу пристрою, реєстрацію service worker, permission і
  VAPID subscription flow, синхронізацію POST/DELETE з backend та робочі кнопки
  підписки/відписки зі статусами браузера.
- `frontend/src/utils/push.test.ts`, `frontend/src/pages/Settings.test.tsx` —
  перевірено успішну підписку, відмову в дозволі, відписку й UI-флоу; у Docker
  пройшли 12 цільових і 158 повних Vitest-тестів, окремий TypeScript typecheck,
  production build та перевірка PWA assets.
- `docs/plans/20260718-billing-reminder.md` — лише Task 11 позначено виконаним.
- Зміна призначена для production frontend: Web Push і service worker потребують
  HTTPS (виняток — localhost). Для розгортання потрібно виконати rebuild image і
  restart контейнера за `docs/deploy.md`, після чого перевірити доступність
  `/manifest.webmanifest`, `/sw.js` та повторно підписати потрібні браузери.
  Автоматичний деплой не виконувався; міграцій і нових env-змінних немає.

## [2026-07-18 22:38] Налаштування billing reminder і Push

- `frontend/src/api/client.ts` — тип `NotificationSettings` доповнено блоками
  `billing_reminder` і `push`; додано типізовані клієнтські обгортки для VAPID
  public key, створення та видалення Push-підписки.
- `frontend/src/pages/Settings.tsx` — у форму додано налаштування нагадувань про
  виставлення рахунків, глобальний перемикач Push, статус цього пристрою та кнопку
  майбутнього PWA-флоу; використано наявні компоненти стилів на токенах `theme.css`.
- `frontend/src/pages/Settings.test.tsx` — перевірено рендер станів Push,
  збереження нових вкладених полів і блокування невалідного інтервалу повторів.
- `docs/plans/20260718-billing-reminder.md` — Task 10 позначено виконаним після
  успішних Docker-перевірок: 8 цільових і 154 повних frontend-тести та production
  build із TypeScript-перевіркою.
- Зміна зачіпає production frontend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; міграцій і нових змінних середовища немає.
  Повний service worker / `pushManager` флоу буде доданий у Task 11. Автоматичний
  деплой не виконувався.

## [2026-07-18 22:32] Override дня виставлення для орендаря

- `backend/app/schemas.py`, `backend/tests/test_tenants.py` — до tenant API додано
  nullable `billing_day` з межами 1–31; перевірено збереження, очищення,
  видачу у списку та відхилення значень 0 і 32.
- `frontend/src/api/client.ts`, `frontend/src/components/TenantSection.tsx` — картка орендаря
  показує override, а create/edit форма дає ввести або очистити день
  з підказкою про fallback на день підписання договору.
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx`, `frontend/src/pages/Stats.test.tsx` — додано
  Vitest-перевірки billing day та оновлено типізовані tenant fixtures.
- `docs/plans/20260718-billing-reminder.md` — Task 9 позначено виконаним після
  успішних Docker-перевірок: 119 backend-тестів, `ruff check`, 152 frontend-тести
  та production build.
- Зміна зачіпає production backend і frontend. Для розгортання потрібні
  rebuild і restart контейнера за `docs/deploy.md`; міграція `billing_day`
  вже входить до цієї гілки, нових env-змінних немає. Автоматичний
  деплой не виконувався.

## [2026-07-18 22:25] API найближчих виставлень рахунків

- `backend/app/routers/billing.py`, `backend/app/main.py` — додано захищений endpoint
  `GET /api/billing/upcoming` як тонку обгортку над спільним розкладом із включним
  горизонтом 30 днів і стабільним сортуванням за датою та квартирою.
- `backend/app/schemas.py` — додано типізовану відповідь із квартирою, орендарем,
  датою виставлення, періодом і nullable статусом рахунка.
- `backend/tests/test_billing_schedule.py` — перевірено сортування, включну межу
  горизонту, відсікання 31-го дня, відсутність рахунка, статуси draft/issued/paid
  і порожній результат.
- `docs/plans/20260718-billing-reminder.md` — Task 8 позначено виконаним після
  успішних Docker-перевірок: 118 backend-тестів і `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; нових міграцій і змінних середовища немає.
  Автоматичний деплой не виконувався.

## [2026-07-18 22:19] API керування Web Push підписками

- `backend/app/routers/push.py`, `backend/app/main.py` — додано захищені endpoint-и
  отримання VAPID public key, створення або оновлення підписки за endpoint та
  ідемпотентного видалення підписки.
- `backend/app/schemas.py` — додано валідацію URL endpoint, браузерних ключів
  `p256dh`/`auth` і типізовані відповіді без розкриття приватного VAPID-ключа.
- `backend/tests/test_push.py` — перевірено генерацію й повторне використання public
  key, підписку, оновлення без дубля, повторну відписку, валідацію та 401 для всіх
  нових маршрутів.
- `docs/plans/20260718-billing-reminder.md` — Task 7 позначено виконаним після
  успішних Docker-перевірок: 115 backend-тестів і `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; нових міграцій та змінних середовища немає.
  Автоматичний деплой не виконувався.

## [2026-07-18 22:09] Web Push backend із VAPID

- `backend/requirements.txt`, `backend/app/services/push.py` — додано
  `pywebpush`, одноразову генерацію та окреме збереження VAPID-пари й канал
  Web Push для всіх активних підписок; відповіді 404/410 видаляють мертві
  підписки, а збій однієї доставки не блокує решту.
- `backend/app/services/notify.py`, `backend/app/routers/settings.py` —
  `build_senders` отримує DB-сесію, Push підключається як третій глобальний
  канал, а VAPID-пара створюється при першому збереженні ввімкненого Push.
- `backend/tests/test_push.py`, `backend/tests/test_notify.py`,
  `backend/tests/test_acceptance.py` — перевірено успішну й частково успішну
  доставку, повну помилку, очищення 410, повторне використання VAPID та нову
  сигнатуру обох call sites.
- `docs/plans/20260718-billing-reminder.md` — Task 6 позначено виконаним після
  успішних Docker-перевірок: 111 backend-тестів і `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild image,
  restart контейнера й звичайний startup за `docs/deploy.md`, щоб встановити
  `pywebpush`; нових міграцій і змінних середовища немає. VAPID-пара
  згенерується в таблиці `settings` при першому ввімкненні Push, тому backup
  production-бази має зберігатися між оновленнями. Автоматичний деплой не
  виконувався.

## [2026-07-18 21:54] Автоматичні чернетки у день виставлення

- `backend/app/services/billing_schedule.py` — у день виставлення додано одноразове
  створення draft-рахунка з курсом НБУ, окремий history-ключ і повідомлення про
  успіх; вимкнений auto-draft надсилає звичайне нагадування без тиші через
  інтервал повтору.
- `backend/app/services/billing_schedule.py` — помилки валідації, хронології та
  недоступного курсу відкочують сесію, логуються й замінюються повідомленням із
  проханням створити рахунок вручну та причиною помилки.
- `backend/tests/test_billing_schedule.py` — перевірено точні аргументи створення,
  повідомлення без дублювання, невідтворення видаленої чернетки, усі три fallback-
  сценарії та ручне нагадування при вимкненому auto-draft.
- `docs/plans/20260718-billing-reminder.md` — Task 5 позначено виконаним після
  успішних Docker-перевірок: 105 backend-тестів і `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; міграції та нові змінні середовища не потрібні.
  Автоматичний деплой не виконувався.

## [2026-07-18 21:47] Щоденні нагадування про виставлення рахунків

- `backend/app/services/billing_schedule.py` — додано відправку нагадувань у
  налаштованому вікні до дня виставлення, повтор від останньої успішної доставки,
  замовкання за наявності рахунка та history-ключ за квартирою і періодом.
- `backend/app/services/notify.py` — нагадування підключено до наявного щоденного
  конвеєра при ввімкненому `billing_reminder`, без нової scheduler job.
- `backend/tests/test_billing_schedule.py`, `backend/tests/test_notify.py` — перевірено
  межу вікна, повтор, тишу поза вікном і за наявності рахунка, незмінну history
  без доставки та інтеграцію з daily-конвеєром.
- `docs/plans/20260718-billing-reminder.md` — Task 4 позначено виконаним після
  успішних Docker-перевірок: 100 backend-тестів і `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; міграції та нові змінні середовища не потрібні.
  Автоматичний деплой не виконувався.

## [2026-07-18 21:42] Налаштування нагадувань і Push

- `backend/app/services/notify.py` — додано вимкнені за замовчуванням блоки
  billing reminder і Push та глибоке доповнення старих збережених налаштувань
  новими значеннями без міграції даних.
- `backend/app/schemas.py` — додано вкладені API-схеми billing reminder і Push
  з валідацією невід'ємного вікна та додатного інтервалу повторів.
- `backend/tests/test_notify.py` — перевірено deep merge старих налаштувань,
  збереження й читання нових полів через API та відхилення невалідних значень.
- `docs/plans/20260718-billing-reminder.md` — Task 3 позначено виконаним після
  успішних Docker-перевірок: 96 backend-тестів і `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; міграції даних і нові змінні середовища не
  потрібні. Автоматичний деплой не виконувався.

## [2026-07-18 21:37] Розклад виставлення рахунків

- `backend/app/services/billing_schedule.py` — додано обчислення найближчої дати
  виставлення для поточного орендаря з override дня, обрізанням до кінця місяця
  та інформацією про рахунок відповідного періоду.
- `backend/tests/test_billing_schedule.py` — перевірено лютий звичайного й
  високосного року, 30-денний місяць, override, межі договорів і квартир та всі
  статуси наявного рахунка.
- `docs/plans/20260718-billing-reminder.md` — Task 2 позначено виконаним після
  успішних Docker-перевірок: 94 backend-тести та `ruff check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; міграції чи нові змінні середовища не потрібні.
  Автоматичний деплой не виконувався.

## [2026-07-18 21:31] Схема даних для нагадувань і Web Push

- `backend/app/models.py` — до орендаря додано optional день виставлення рахунку,
  а також модель push-підписки з унікальним endpoint і ключами шифрування.
- `backend/alembic/versions/20260718_05_billing_day_push_subscriptions.py` — нова
  міграція додає `tenants.billing_day` і таблицю `push_subscriptions`.
- `backend/tests/test_models.py` — перевірено збереження дня виставлення,
  унікальність endpoint і застосування нової міграції під час startup.
- `docs/plans/20260718-billing-reminder.md` — Task 1 позначено виконаним після
  успішних Docker-перевірок: 84 backend-тести, `ruff check` та `alembic check`.
- Зміна зачіпає production backend. Для розгортання потрібні rebuild і restart
  контейнера за `docs/deploy.md`; міграція застосовується автоматично на startup.
  Автоматичний деплой не виконувався.

## [2026-07-18 21:24] План нагадувань про виставлення рахунків

- `docs/plans/20260718-billing-reminder.md` — новий план фічі: день виставлення
  з `contract_start` активного орендаря з override (`Tenant.billing_day`),
  «розумні» нагадування до дня виставлення з замовканням при наявному рахунку,
  авто-чернетка через `billing.create_draft`, Web Push (PWA + VAPID +
  pywebpush) як третій глобальний канал, Dashboard-віджет «Найближчі
  виставлення». 15 задач; план пройшов авто-ревʼю, критичні зауваження
  (Pydantic-схеми налаштувань, сигнатура `build_senders`) враховані.
- Зміна суто документаційна, production-коду не зачіпає; деплой не потрібен.

## [2026-07-17 15:42] Завершення плану фільтра статистики за орендарем

- `docs/plans/20260717-tenant-stats-filter.md` — завершений план із 7 виконаними
  задачами переміщено до `docs/plans/completed/` після implementation, review,
  external Codex, finalize та stats фаз.
- Зміни production-коду в цьому кроці відсутні; додатковий деплой не потрібен
  і автоматично не виконувався.

## [2026-07-17 15:27] Достовірність простою за весь час

- `frontend/src/pages/Stats.tsx` — плитка «Простій» не показує часткове або
  хибне число для «Весь час», доки обидва статистичні запити не
  завершаться успішно; loading і partial failure мають окремі недоступні
  стани.
- `frontend/src/pages/Stats.test.tsx` — додано регресії очікування обох all-time
  відповідей і збою одного stats API після успіху іншого.
- Docker-перевірка: frontend — 18 файлів і 150 тестів, backend — 83 тести;
  production build frontend успішний (45 модулів).
- Зміна зачіпає production frontend. Для розгортання на Synology потрібно
  виконати rebuild і restart за `docs/deploy.md`: з локальним `.env` запустити
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`,
  потім `docker compose --env-file .env -f docker/docker-compose.yml ps`.
  Автоматичний деплой не виконувався.

## [2026-07-17 15:12] Недоступність простою без валідного періоду

- `frontend/src/pages/Stats.tsx` — плитка «Простій» показує тире замість
  хибних `0 міс`, доки довільний період неповний або невалідний.
- `frontend/src/pages/Stats.test.tsx` — додано регресії для неповного та
  зворотного custom-діапазонів у масштабі квартири.
- Docker-перевірка: frontend — 18 файлів і 148 тестів, backend — 83 тести;
  production build frontend успішний (45 модулів).
- Зміна зачіпає production frontend. Для розгортання на Synology потрібно
  виконати rebuild і restart за `docs/deploy.md`: з локальним `.env` запустити
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`,
  потім `docker compose --env-file .env -f docker/docker-compose.yml ps`.
  Автоматичний деплой не виконувався.

## [2026-07-17 14:58] Спрощення фільтрів статистики

- `frontend/src/pages/Stats.tsx` — URL-синхронізацію та завантаження орендарів
  винесено в локальні hooks; tenant-state тепер прив’язаний до квартири, а
  політику вибору квартири зведено до одного helper. Форматер поточного місяця
  Києва повторно використовується, а місяць обчислюється один раз на render.
- `frontend/src/pages/Stats.test.tsx` — додано регресію від показу орендарів
  попередньої квартири під час нового запиту та прибрано невикористаний reject
  із deferred helper.
- Docker-перевірка: frontend — 18 файлів і 146 тестів, backend — 83 тести;
  production build frontend успішний (45 модулів).
- Зміни зачіпають production frontend. Для розгортання на Synology потрібно
  виконати rebuild і restart за `docs/deploy.md`: з локальним `.env` запустити
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`,
  потім `docker compose --env-file .env -f docker/docker-compose.yml ps`.
  Автоматичний деплой не виконувався.

## [2026-07-17 14:38] Виправлення review фільтра статистики

- `frontend/src/pages/Stats.tsx` — числовий простій тепер з’являється лише після
  успішного завантаження орендарів; активні договори використовують поточний
  місяць `Europe/Kyiv`, а майбутні договори формують валідний одномісячний
  діапазон. Фільтри відновлюються при Back/Forward без циклів запису URL.
- `frontend/src/pages/Stats.test.tsx` — додано регресії для loading/error,
  майбутнього договору, межі Kyiv-місяця, history-навігації та застарілої
  відповіді `getTenants`; повторювані Tenant-фікстури замінено фабрикою.
- `README.md`, `docs/plans/20260717-tenant-stats-filter.md` — задокументовано
  поведінку сторінки статистики, обробку недоступних даних та статус ручної
  перевірки перед релізом.
- Зміни зачіпають production frontend. Для розгортання на Synology потрібно
  виконати rebuild і restart за `docs/deploy.md`: з локальним `.env` запустити
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`,
  потім `docker compose --env-file .env -f docker/docker-compose.yml ps`.
  Автоматичний деплой не виконувався.

## [2026-07-17 14:23] Завершення фільтра статистики за орендарем

- `frontend/src/pages/Stats.tsx`, `frontend/src/theme.css` — завершено суто
  frontend-фільтр статистики за договором орендаря: похідний custom-період,
  інфо-рядок договору, маркери початку договорів, плитку простою та
  синхронізацію фільтрів з URL.
- `frontend/src/pages/Stats.test.tsx` — фінальна Docker-перевірка підтвердила
  140 frontend-тестів; регресійна backend-перевірка — 83 тести; production
  build frontend також успішний.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 7 завершено; `README.md`
  не потребує змін, бо нових команд немає, а `CLAUDE.md` — бо нових
  повторно використовуваних патернів не виявлено. Фізичне переміщення плану
  до `docs/plans/completed/` відкладено до фінальних фаз оркестратора.
- Зміни зачіпають production frontend. Для розгортання на Synology потрібно
  виконати rebuild і restart за `docs/deploy.md`: з локальним `.env` запустити
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`,
  потім перевірити стан через `docker compose --env-file .env -f
  docker/docker-compose.yml ps`. Автоматичний деплой не виконувався.

## [2026-07-17 14:19] Acceptance-перевірка фільтра статистики

- `frontend/src/pages/Stats.test.tsx` — додано прямі acceptance-тести
  майбутнього custom-діапазону, першого збігу двох договорів в
  одному місяці та прийнятої відсутності підсвітки активного
  орендаря для застарілого URL в наступному місяці.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 6 позначено
  виконаним після успішних Docker-перевірок: 140 frontend-тестів,
  83 backend-тести та production build frontend.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не
  виконувався.

## [2026-07-17 14:14] Стан фільтрів статистики в URL

- `frontend/src/pages/Stats.tsx` — додано відновлення квартири, масштабу й
  періоду з query-параметрів, валідацію дефолтів і канонічну синхронізацію
  актуальних фільтрів через history replace.
- `frontend/src/pages/Stats.test.tsx` — перевірено deep-link із похідним вибором
  орендаря, оновлення URL, нормалізацію невідомих параметрів і неповного
  довільного діапазону.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 5 позначено виконаним
  після успішного повного frontend test suite у Docker (137 тестів).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 14:09] Плитка простою у статистиці квартири

- `frontend/src/pages/Stats.tsx` — додано підрахунок місяців без перетину з
  жодним договором і плитку «Простій» лише для масштабу квартири.
- `frontend/src/pages/Stats.test.tsx` — перевірено розрив між договорами,
  покриття навіть одним днем, нульовий простій, квартиру без орендарів і
  відсутність плитки у портфелі.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 4 позначено виконаним
  після успішного повного frontend test suite у Docker (133 тести).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 14:05] Маркери початку договорів на графіку доходу

- `frontend/src/theme.css` — додано окремий токен кольору маркера орендаря
  для light, явної dark і системної dark тем.
- `frontend/src/pages/Stats.tsx` — у масштабі квартири графік доходу показує
  доступні з клавіатури пунктирні лінії на початку видимих місяців договорів
  із назвою орендаря та місяцем у `<title>`/`aria-label`.
- `frontend/src/pages/Stats.test.tsx` — перевірено видимий маркер квартири,
  його відсутність у портфелі та фільтрацію договору поза діапазоном.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 3 позначено виконаним
  після успішного повного frontend test suite у Docker (131 тест).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 14:00] Похідний вибір договору у статистиці

- `frontend/src/pages/Stats.tsx` — активний орендар у селекторі тепер
  визначається за точним збігом довільного діапазону з місяцями договору;
  під панеллю періоду показується рядок із датами й статусом договору.
- `frontend/src/pages/Stats.test.tsx` — перевірено завершений і активний
  договори, скидання похідного вибору після ручної зміни місяця та його
  відновлення повторним вибором орендаря.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 2 позначено виконаним
  після успішного повного frontend test suite у Docker (130 тестів).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 13:56] Пресет статистики за договором орендаря

- `frontend/src/pages/Stats.tsx` — сторінка статистики завантажує орендарів
  вибраної квартири, показує селектор лише для непорожнього списку та
  перетворює вибраний договір на довільний діапазон місяців.
- `frontend/src/pages/Stats.test.tsx` — додано безпечний дефолтний мок
  `getTenants` і перевірки завершеного/активного договору, зміни квартири,
  порожнього списку та необов'язкової помилки завантаження орендарів.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 1 позначено виконаним
  після успішного повного frontend test suite у Docker (130 тестів).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 13:49] План фільтра статистики за орендарем

- `docs/plans/20260717-tenant-stats-filter.md` — новий план циклу: випадайка
  «Орендар» на сторінці «Статистика» як пресет періоду (дати договору →
  наявний custom-режим), інфо-рядок договору, маркери зміни орендарів на
  графіку доходу, плитка простою та стан фільтрів в URL. Суто фронтенд, без
  змін бекенда.
- План пройшов auto-review (APPROVE); зауваження внесено: токен
  `--chart-tenant-marker` в усі три блоки `theme.css`, без клієнтського
  сортування орендарів, дефолтний мок `getTenants` для наявних тестів,
  `aria-label` для випадайки.
- Лише документація; production-код не змінювався, деплой не потрібен.

## [2026-07-16 23:41] Завершення плану фінального полірування

- `docs/plans/20260716-review-polish.md` — завершений план із 11 виконаними задачами
  переміщено до `docs/plans/completed/` після implementation, review, finalize та
  stats фаз.
- Зміни production-коду в цьому кроці відсутні; додатковий деплой не виконувався.

## [2026-07-16 23:40] Усунення дублювання та зайвих обчислень у frontend

- `frontend/src/theme.ts`, `frontend/src/components/Layout.test.tsx` — inline bootstrap
  лишився єдиним джерелом початкової теми; runtime лише читає застосований `data-theme`,
  а компонентні тести виконують фактичний скрипт з `index.html`.
- `frontend/src/pages/Stats.tsx` — форматери місяців і чисел створюються один раз на
  рівні модуля та перевикористовуються під час рендерингу графіків.
- `frontend/src/components/InvoiceCalculator.tsx` і тест — read-only рахунки більше не
  будують draft payload, validity та warnings і не викликають `onDraftChange`.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 23:22] Усунення блимання теми до завантаження застосунку

- `frontend/index.html`, `frontend/src/main.tsx` — збережена або системна тема тепер
  синхронно застосовується inline-скриптом у `<head>` до завантаження CSS і React;
  запізнілу повторну ініціалізацію з module entry прибрано.
- `frontend/src/main.test.tsx` — bootstrap-тест виконує inline-скрипт із HTML та
  перевіряє, що він розташований перед application module і монтуванням React.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 23:16] Виправлення знахідок комплексного review

- `frontend/src/theme.ts`, `frontend/src/main.tsx`, `frontend/src/components/Layout.tsx` —
  збережену або системну тему застосовано до `html` до монтування React, тому login і
  початкова перевірка авторизації не блимають неправильною темою.
- `frontend/src/pages/Stats.tsx` — обидва графіки використовують спільну повну шкалу
  вибраного preset/custom періоду; all-time і надалі визначає межі за даними, а
  посилання пікової статті синхронно звіряється з apartment/scope/period.
- Компонентні тести доповнено bootstrap-перевіркою теми, крайніми порожніми місяцями,
  stale-посиланням, issued read-only рахунком, retry файлів після помилки та точними
  перевірками нейтральних CSS-класів.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:54] Завершення документації циклу полірування

- `docs/plans/20260716-review-polish.md` — Task 11 позначено виконаним; фінальне
  перенесення плану до `completed/` відкладено до завершення review, finalize і stats
  оркестратором.
- `README.md`, `CLAUDE.md` — змін не потребують: цикл не додав нових стабільних
  команд, архітектурних правил або робочих патернів.
- Зміни циклу зачіпають production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:50] Acceptance-перевірка фінального полірування

- `docs/plans/20260716-review-polish.md` — Task 10 позначено виконаним після
  browser walkthrough усіх 12 знахідок у light/dark темах; локальні стани без
  чернеток, боргів та архівної квартири додатково підтверджені компонентними тестами.
- У живому Docker-середовищі перевірено theme persistence після reload, read-only
  paid-рахунок, 404, dashboard, management-картку, локалізовані дати, графіки з
  гріделями й порожнім жовтнем, file-button flow та перехід із пікової статті.
- Повний Docker suite пройшов: 123 frontend Vitest, production build, 83 backend
  pytest і Ruff; acceptance виявила й окремим комітом виправила історичні суми
  завершених рахунків.
- Зміни цього циклу призначені для production frontend; для застосування потрібні
  rebuild і restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:48] Історичні суми завершених рахунків

- `frontend/src/components/InvoiceCalculator.tsx` — read-only вигляд виставлених і
  оплачених рахунків показує збережені snapshot-суми рядків та підсумків замість
  повторного обчислення за показниками й тарифом.
- `frontend/src/components/InvoiceCalculator.test.tsx` — додано регресійну перевірку
  історичної суми, яка навмисно відрізняється від поточного добутку показника й
  тарифу; targeted Vitest і browser-перевірка пройшли в Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:32] Перехід із пікової статті до рахунку

- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — плитка «Найбільша
  стаття» в режимі квартири знаходить рахунок пікового місяця, стає посиланням на
  нього та отримує theme-aware hover/focus-стан і локалізовану підказку; портфель,
  відсутній збіг і помилка API залишають звичайну плитку.
- `frontend/src/pages/Stats.test.tsx` — перевірено успішний перехід, відсутній
  рахунок, портфельний скоуп і помилку завантаження рахунків.
- `docs/plans/20260716-review-polish.md` — Task 9 позначено виконаним після успішних
  123 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:24] Умовна кнопка завантаження файлів орендаря

- `frontend/src/components/TenantSection.tsx` — кнопка «Завантажити» тепер
  з'являється лише після вибору файлів і знову приховується після успішного upload.
- `frontend/src/components/TenantSection.test.tsx` — перевірено відсутність кнопки
  без файлів, активний стан після вибору та приховування після успішного завантаження.
- `docs/plans/20260716-review-polish.md` — Task 8 позначено виконаним після успішних
  119 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:21] Читабельні шкали та пропуски на графіках

- `frontend/src/utils/ticks.ts`, `frontend/src/utils/ticks.test.ts` — додано
  обчислення заокругленої шкали з 3–4 поділками та table-driven перевірки, зокрема
  для `361 → 400/100` і `15 → 16/4`.
- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — обидва графіки
  отримали проміжні hairline-гріделі з muted-підписами; повний ряд місяців зберігає
  порожні слоти доходу й розриває лінії споживання без штучних точок.
- `frontend/src/pages/Stats.test.tsx` — перевірено гріделі, порожній жовтень 2025,
  розрив лінії та відсутність `NaN` у SVG-геометрії.
- `docs/plans/20260716-review-polish.md` — Task 7 позначено виконаним після успішних
  119 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:15] Локалізація дат орендаря

- `frontend/src/utils/format.ts`, `frontend/src/utils/format.test.ts` — додано
  UTC-safe форматування ISO-дат українською з поверненням невалідного значення без
  змін; table-driven тести охоплюють валідні, текстові й календарно хибні дати.
- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx`
  — локалізовано дату початку активного контракту, плитку «Орендар з» і періоди в
  історії; поля `input type="date"` збережено в ISO-форматі.
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx` — оновлено компонентні очікування
  локалізованих дат і збережено перевірки ISO-значень у формах.
- `docs/plans/20260716-review-polish.md` — Task 6 позначено виконаним після успішних
  113 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:11] Оновлення management-карток квартир

- `frontend/src/pages/Apartments.tsx`, `frontend/src/pages/portal.css` — картки
  квартир отримали аватар, бейдж активного або архівного стану, компактний рядок
  орендаря, підписану суму останнього рахунку зі статусом і вирівняний рядок дій;
  окремий рядок «Стан» прибрано.
- `frontend/src/pages/Apartments.test.tsx` — перевірено активну й архівну картки,
  аватари, статуси квартири та останнього рахунку, суму й відсутність архівації для
  вже архівної квартири.
- `docs/plans/20260716-review-polish.md` — Task 5 позначено виконаним після успішних
  109 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:07] Інформативні плитки дашборда

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/portal.css` — значення
  метрик приведено до нейтрального кольору, під ними додано окремі примітки про
  чернетки й неоплачені рахунки; плитку курсу замінено доходом портфеля за 12
  місяців із безпечним «—» при недоступній статистиці.
- `frontend/src/pages/Dashboard.test.tsx` — перевірено примітки з даними й без них,
  нейтральне значення «Оплачено», дохід портфеля та ізольовану помилку його запиту.
- `docs/plans/20260716-review-polish.md` — Task 4 позначено виконаним після успішних
  109 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:03] Розрізнення помилок завантаження рахунку

- `frontend/src/pages/InvoiceEdit.tsx` — екран завантаження рахунку використовує
  `ApiError.status`: для 404 показує «Рахунок не знайдено», для інших помилок —
  «Не вдалося завантажити рахунок»; обидва стани містять посилання на список.
- `frontend/src/pages/InvoiceEdit.test.tsx` — додано регресійні перевірки 404 і
  мережевої помилки, різних повідомлень та навігації до `/invoices`.
- `docs/plans/20260716-review-polish.md` — Task 3 позначено виконаним після успішних
  108 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:00] Read-only вигляд завершених рахунків

- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/pages/portal.css` —
  для виставлених і оплачених рахунків курс та поточні показники відображаються
  форматованим текстом замість disabled-полів; панель перевірки показників лишається
  тільки у чернетках.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/InvoiceEdit.test.tsx` — додано компонентні й сторінкові
  перевірки read-only стану paid-рахунку та збереження інтерактивного draft-стану.
- `docs/plans/20260716-review-polish.md` — Task 2 позначено виконаним після успішних
  106 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 21:56] Персистентність теми інтерфейсу

- `frontend/src/components/Layout.tsx` — початкова тема синхронно відновлюється зі
  збереженого вибору або системної темної схеми до першого рендера; перемикач
  одночасно оновлює `data-theme` і `localStorage`.
- `frontend/src/components/Layout.test.tsx` — додано перевірки відновлення теми після
  перемонтування, fallback на `matchMedia` та збереження нового вибору.
- `docs/plans/20260716-review-polish.md` — Task 1 позначено виконаним після успішного
  прогону 104 frontend-тестів у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 19:55] Уточнення плану полірування після рев'ю

- `docs/plans/20260716-review-polish.md` — рев'ю проти коду (агент-інфраструктура
  була тимчасово недоступна, перевірку виконано вручну по тих самих точках):
  `ApiError.status` уже існує — Task 3 без змін client.ts; примітки плиток дашборда
  підтверджено похідними від наявного `needs_attention[].reason` (unpaid/draft);
  `getInvoices({apartmentId})` уже існує — Task 9 без змін client.ts.

## [2026-07-16 19:45] План фінального полірування за повторним рев'ю

- Проведено повторне візуальне рев'ю проти макета після виконання плану стилів:
  базові стилі відповідають макету; зафіксовано 12 залишкових знахідок
  (персистентність теми, read-only вигляд оплачених рахунків, 404-стан, примітки
  плиток, картка /apartments, ISO-дати, гріделі/порожні місяці графіків, дрібні
  покращення).
- `docs/plans/20260716-review-polish.md` — створено план з 11 тасків; зміни суто
  frontend. Деплой не потрібен (лише документація).

## [2026-07-16 19:17] Відновлення layout карток квартир

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Apartments.tsx`,
  `frontend/src/pages/portal.css` — dashboard-рядки та management-картки квартир
  отримали окремі variant-класи; grid дашборда більше не стискає заголовок і не
  накладає адресу, статус та кнопки на сторінці `/apartments`.
- `frontend/src/pages/Dashboard.test.tsx`, `frontend/src/pages/Apartments.test.tsx` —
  додано регресійні перевірки окремих layout-контрактів для двох екранів.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:58] Безпечне оновлення після збереження послуг і тарифів

- `frontend/src/pages/ApartmentDetail.tsx` — помилка refresh після успішного створення
  чи редагування послуги або створення тарифу тепер повідомляє, що зміну вже
  збережено, замість помилково пропонувати повторити мутацію з ризиком дублювання.
- `frontend/src/pages/ApartmentDetail.test.tsx` — додано регресійні перевірки окремої
  семантики mutation-success/refresh-error для створення послуги й тарифу.
- У Docker пройшли 101 frontend-тест, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:49] Усунення frontend code smells після рев’ю

- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx` —
  покоління квартири тепер змінюється в effect, без ref-мутації під час render; callback
  occupancy отримав явний discriminated state і передає лише дату початку контракту.
- `frontend/src/utils/decimal.ts`, `frontend/src/components/InvoiceCalculator.tsx` — точну
  десяткову арифметику винесено з UI-компонента в окремий domain utility.
- `frontend/src/utils/format.ts`, `frontend/src/pages/Invoices.tsx`,
  `frontend/src/pages/InvoiceEdit.tsx`, `frontend/src/pages/ApartmentDetail.tsx` — додано
  спільне форматування місяця для API-періодів `YYYY-MM` і `YYYY-MM-DD`.
- `frontend/src/pages/portal.css` — картки фактів квартири й summary статистики
  використовують спільний selector для border, surface, radius і shadow токенів.
- `frontend/src/utils/decimal.test.ts`, `frontend/src/utils/format.test.ts`,
  `frontend/src/components/TenantSection.test.tsx`, `frontend/src/theme.test.ts` — додано
  прямі unit/regression-перевірки нових контрактів. У Docker пройшли 99 frontend-тестів,
  production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:36] Безпечна навігація рахунків і валідація показників

- `frontend/src/pages/InvoiceEdit.tsx` — стан рахунку й чернетки очищається при зміні
  route; асинхронні load/mutation-відповіді прив'язано до покоління маршруту, а save,
  status і delete завжди спрямовано на id фактично відображеного рахунку.
- `frontend/src/components/InvoiceCalculator.tsx` — preview, payload, dirty-state та
  доступність save/issue використовують одну строгу десяткову граматику; exponent-
  нотація на кшталт `1e3` у показниках більше не може потрапити до backend.
- `frontend/src/pages/InvoiceEdit.test.tsx`,
  `frontend/src/components/InvoiceCalculator.test.tsx` — додано regression-перевірки
  stale route response, безпечного target id та узгодженої відмови від exponent-
  показників. У Docker пройшли 94 frontend-тести, production build, 83 backend-тести
  та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:26] Точність рахунку й безпечне оновлення орендаря

- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/pages/InvoiceEdit.tsx` —
  локалізоване представлення курсу й показників відокремлено від точних API-рядків:
  незмінені шестизначні значення не стають dirty і не втрачають точність у payload;
  exponent-нотація відхиляється однаково для preview, save та issue.
- `frontend/src/components/TenantSection.tsx` — помилка refresh після успішної tenant-
  мутації тепер повідомляє, що зміну вже збережено, і не маскується як помилка самої
  мутації, яка могла спровокувати небезпечний повтор запиту.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/InvoiceEdit.test.tsx`, `frontend/src/components/TenantSection.test.tsx` —
  додано regression-перевірки точного курсу `44.791749`, заборони `1e3`,
  presentation `9583.500 → 9 583,5` зі збереженням raw payload та успішної мутації
  з невдалим наступним refresh.
- У Docker пройшли 92 frontend-тести, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:17] Ізоляція tenant-мутацій і точне поле курсу

- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx` —
  tenant-load і всі мутації прив’язано до покоління поточної квартири; завершення
  старого запиту після навігації більше не запускає load і не змінює стан нового
  маршруту. Помилка списку орендарів зберігає невідомий occupancy замість хибного
  стану «вільна».
- `frontend/src/components/InvoiceCalculator.tsx` — редактор курсу показує API-курс
  без хвостових нулів у локальному форматі (`44,7917`), але незмінена чернетка й
  save payload зберігають початковий точний рядок (`44.791700`).
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx`, `frontend/src/pages/InvoiceEdit.test.tsx` —
  додано regression-перевірки завершення мутації після зміни маршруту, unknown
  occupancy при tenant-list error і display-нормалізації зі збереженням raw payload.
- У Docker пройшли 88 frontend-тестів, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:07] Ізоляція стану картки квартири та орендаря

- `frontend/src/components/TenantSection.tsx` — помилка завантаження вкладень більше
  не приховує активного орендаря; при зміні квартири очищаються tenant-форми,
  ідентифікатор редагування, форма завершення контракту та вибрані файли.
- `frontend/src/pages/ApartmentDetail.tsx` — route-load отримав request token;
  попередні квартира, послуги, тарифи й форми очищаються одразу, а застарілі
  відповіді та помилки мутацій не змінюють стан нового маршруту.
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx` — додано regression-перевірки
  attachment-помилки, очищення приватного file draft, stale response та невдалого
  завантаження наступної квартири.
- У Docker пройшли 86 frontend-тестів, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:57] Виправлення знахідок комплексного рев’ю

- `frontend/src/components/InvoiceCalculator.tsx` — editable-курс і показники більше
  не проходять через locale formatter: шестизначна точність API зберігається у
  draft/save payload, форматування лишається тільки у представленні.
- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/components/TenantSection.tsx` —
  дата контракту очищається при зміні квартири та помилці tenant/attachment load;
  у detail-header знову показуються статус і примітки квартири.
- `frontend/src/utils/utility.ts`, `frontend/src/pages/Stats.tsx`,
  `frontend/src/pages/portal.css` — класифікацію комунальних послуг уніфіковано,
  negative-marker отримав поведінковий hover/focus tooltip, а статистичні поверхні
  використовують theme-токени primary/on-primary та радіус 12px.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx`, `frontend/src/pages/Stats.test.tsx` —
  додано regression-перевірки точного payload, route reuse, метаданих квартири й
  інтерактивного tooltip; у Docker пройшли 82 frontend-тести, production build,
  83 backend-тести та Ruff.
- `AGENTS.md`, `docs/plans/20260716-mockup-style-alignment.md` — додано frontend-
  styling convention, ручний side-by-side review лишено відкритим owner-критерієм,
  а Post-Completion нотатку приведено до поточного стану.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:42] Завершення циклу вирівнювання стилів

- `CLAUDE.md` — зафіксовано стабільне правило frontend-стилів: `theme.css` є
  джерелом правди для дизайн-токенів, а компоненти не дублюють кольори й тіні.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 8 закрито; перенесення
  завершеного плану відкладено до фінального кроку exec-harness після рев'ю,
  finalize і статистики.
- `README.md` не змінювався: новий патерн стосується розробки, а не користувацького
  запуску чи експлуатації HomeTrap.
- Цей документаційний крок не змінює runtime. Для застосування попередніх frontend-
  змін циклу у production потрібні rebuild і restart контейнера за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 17:37] Верифікація стилів і live-форматів

- `frontend/src/utils/format.ts`, `frontend/src/components/Layout.tsx`,
  `frontend/src/pages/Dashboard.tsx` — summary-курс НБУ тепер завжди округлюється до
  двох знаків: live-значення `44.748` показується як `44,75 ₴`, тоді як редаговане
  поле рахунку зберігає точність до чотирьох знаків.
- `frontend/src/pages/ApartmentDetail.tsx` — місяць останнього рахунку приймає
  реальний API-формат `YYYY-MM-DD` без `RangeError`; картка з live-чернеткою знову
  рендерить факти квартири.
- `frontend/src/utils/format.test.ts`, `frontend/src/components/Layout.test.tsx`,
  `frontend/src/pages/Dashboard.test.tsx`, `frontend/src/pages/ApartmentDetail.test.tsx` —
  додано regression-покриття округлення `44.748 → 44,75` та ISO-дати рахунку.
- У Playwright пройдено light/dark екрани шапки, дашборда, квартир, картки,
  рахунків, редактора, статистики й налаштувань; зовнішній Claude artifact і реальні
  дані вересня 2025 недоступні локальній автоматизації, тому їх покрито критеріями
  плану й тестами, а фінальний side-by-side лишено власнику в Post-Completion.
- Фінальний Docker-гейт: 81 frontend-тест, production build, 83 backend-тести та
  Ruff пройшли; усі 6 груп знахідок Overview мають браузерні та/або тестові докази.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 7 позначено виконаним.
- Зміна зачіпає frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:16] Статистика за палітрою макета

- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — лінії споживання,
  заливки, точки, сегменти доходу та легенду переведено на токени
  графіків; кінцеву точку виділено обводкою картки.
- Місяць із від’ємним сегментом більше не створює невалідний стек:
  на базовій лінії показується ромб коригування з tooltip оренди,
  комунальних і підсумку; підпис від’ємної суми не рендериться.
- `frontend/src/pages/Stats.test.tsx` — перевірено токени fill/stroke,
  area-path, розміри точок, позитивні бари й негативний місяць без
  `NaN`; у Docker пройшли 80 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 6 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:08] Картка квартири за затвердженим макетом

- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/pages/portal.css` — вузькі
  реквізити замінено повноширинною сіткою оренди, останнього рахунку, середньої
  комуналки за 12 місяців і початку оренди; помилка чи порожня статистика дає «—».
- Таблиця послуг отримала маркери газу, електроенергії та води з токенів графіків;
  інші послуги лишаються без маркера.
- `frontend/src/components/TenantSection.tsx` — контакти переведено на accent-лінки,
  нативний file input приховано за ghost-label «Додати файли», а вибрані назви
  показуються перед завантаженням.
- `frontend/src/pages/ApartmentDetail.test.tsx`,
  `frontend/src/components/TenantSection.test.tsx` — перевірено факти з даними,
  порожню історію та помилку статистики, стилізований picker, accent-контакти й
  маркери послуг; у Docker пройшли 79 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 5 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:00] Плитки й дашборд за затвердженим макетом

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/portal.css` — плитки отримали
  uppercase-eyebrow та кольорові позитивні/негативні значення; рядки квартир —
  38px аватари, компактні деталі й правий блок суми зі статусом без дубля адреси.
- Блок «Потребує уваги» отримав rose/amber/muted маркери для прострочених оплат,
  чернеток і поточних нагадувань та пояснення другим приглушеним рядком.
- `frontend/src/pages/Dashboard.test.tsx` — перевірено аватар, приховування дубля
  адреси, усі класи маркерів, note-класи та нульову заборгованість; у Docker пройшли
  76 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 4 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:55] Українські формати тарифів, показників і курсу

- `frontend/src/utils/format.ts`, `frontend/src/utils/format.test.ts` — додано спільні
  форматери тарифів, показників і курсу з українською комою, обрізанням хвостових
  нулів, групуванням тисяч та табличним покриттям краєвих значень.
- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/components/InvoiceCalculator.tsx`,
  `frontend/src/components/Layout.tsx`, `frontend/src/pages/Dashboard.tsx` — сирі значення
  API замінено локалізованими форматами; редаговані числові поля отримують очищені
  значення з крапкою без хибного dirty-стану.
- Компонентні тести квартири, рахунку й дашборда оновлено під нові формати; у Docker
  пройшли 75 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 3 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:49] Однорядкова шапка за затвердженим макетом

- `frontend/src/components/Layout.tsx`, `frontend/src/components/Layout.css` — логотип,
  навігацію, курс НБУ, тему й вихід об'єднано в одну шапку; додано SVG-будинок,
  суцільний активний pill, український формат курсу та перенос навігації з
  горизонтальним прокручуванням на вузьких екранах.
- `frontend/src/components/Layout.test.tsx` — перевірено SVG-марку, активний пункт,
  текст курсу та fallback при помилці API.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 2 позначено виконаним після
  успішних 58 frontend-тестів і production-збірки в Docker.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:45] Дизайн-токени за затвердженим макетом

- `frontend/src/theme.css` — оновлено light/dark палітри, додано токени кольорів
  графіків і контрастного тексту, картковий радіус 12px та компактну макетну тінь;
  у dark-темі тіні карток явно вимкнено.
- `frontend/src/pages/portal.css`, `frontend/src/theme.test.ts` — картки й плитки
  переведено на спільний `--shadow-card`; додано перевірки реальних токенів обох тем,
  hairline-бордерів і використання спільної тіні.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 1 позначено виконаним після
  успішних 56 frontend-тестів у Docker.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:35] Правки плану стилів після авто-рев'ю

- `docs/plans/20260716-mockup-style-alignment.md` — враховано знахідки plan-review:
  токени НЕ перейменовуються (оновлюються значення наявних `--color-*`, додаються лише
  `--chart-*` і `--color-on-primary`) з явним мапінгом макет→код; у таск форматерів
  включено всі тест-файли зі старими форматами (інакше падав би тест-гейт) і плитку
  курсу на дашборді; зафіксовано точність курсу (чип/плитка — 2 знаки, поле — 2–4);
  «Середня комуналка» підтверджена як частина макета з fallback «—»; dark-тінь —
  явний `--shadow-card: none`; api/client.ts прибрано з файлів таска 5.

## [2026-07-16 16:20] План вирівнювання стилів із макетом

- Проведено візуальне рев'ю живого порталу (усі екрани, light + dark) проти
  затвердженого макета: функціонал повний, стилі розійшлися (шапка, токени карток,
  формати чисел, аватари/маркери, палітра графіків, від'ємний місяць без бара).
- `docs/plans/20260716-mockup-style-alignment.md` — створено план із 8 тасків;
  зміни суто frontend, без API. Деплой не потрібен (лише документація).

## [2026-07-16 15:56] Відновлення ширини таблиці послуг

- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/pages/portal.css` — секція
  «Послуги й тарифи» явно займає обидві колонки detail-grid і більше не стискається
  до вузької лівої колонки після додавання повноширинного блоку орендаря.
- `frontend/src/pages/ApartmentDetail.test.tsx` — додано regression-перевірку
  layout-класу секції послуг.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 15:16] Повторюване видалення файлів орендаря

- `backend/app/services/storage.py`, `backend/app/routers/tenants.py` — файли орендаря
  перед видаленням метаданих атомарно переміщуються у приватний staging; помилка DB
  commit відновлює каталог, а помилка filesystem cleanup лишає durable маркер для
  повторного `DELETE`.
- `backend/tests/test_attachments.py` — додано регресію помилки cleanup з перевіркою
  збережених staged-файлів та успішного повторного видалення.
- Для production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 15:08] Усунення code smells після рев'ю

- `backend/app/services/storage.py`, `backend/tests/test_attachments.py` — запис
  вкладень переведено на атомарну заміну тимчасового файлу з очищенням partial write;
  додано регресію ін'єктованої помилки запису.
- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/Stats.test.tsx` — розділено
  loading/error стани запитів споживання й доходу, завершення помилкових запитів та
  очищення помилок після успішної повторної спроби покрито тестом.
- `frontend/src/components/TenantSection.tsx`,
  `frontend/src/components/TenantSection.test.tsx` — stale відповіді попередньої
  квартири ігноруються, а file input повністю скидається після успішного upload.
- Для production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 14:54] Виправлення після комплексного code review

- `backend/app/models.py`, `backend/alembic/versions/20260716_04_enforce_active_tenant.py`,
  `backend/app/routers/tenants.py` — інваріант одного активного орендаря закріплено
  частковим unique index, конфлікти commit повертають 409, а перетини контрактів
  відхиляються; файли видаляються лише після успішного commit метаданих.
- `backend/app/services/storage.py`, `backend/app/routers/tenants.py` — whitelist типів
  файлів зведено до одного mapping, batch обмежено 10 файлами та обробляється по одному
  файлу без накопичення всіх payload у пам'яті.
- `frontend/src/components/TenantSection.tsx` — локальну дату обчислено під час відкриття
  форм, наступний контракт починається з наступного календарного дня, а вкладення
  завантажуються лише для активного орендаря.
- `backend/tests/test_tenants.py`, `backend/tests/test_models.py`,
  `backend/tests/test_attachments.py`, `backend/tests/test_stats.py`,
  `frontend/src/components/TenantSection.test.tsx` — додано регресії конкурентного
  створення, перетинів дат, commit failures, batch limit, актуальної локальної дати та
  Kyiv-aware stats fixtures.
- `README.md`, `ChangeLog.md` — уточнено dev/production storage і backup, виправлено
  хронологію запису моделей. Для production потрібно перебудувати й перезапустити
  контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 14:42] Документація орендарів і резервного копіювання

- `README.md` — описано життєвий цикл орендарів, один активний контракт на квартиру,
  підтримувані файли контрактів, ліміт 10 МБ і приватне зберігання.
- `docs/deploy.md` — уточнено автоматичне застосування tenant-міграції та оновлено
  backup/restore так, щоб разом із SQLite архівувався каталог `data/uploads`.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 9 позначено виконаним; перенесення
  плану до `completed/` залишено фінальному harness після review/finalize.
- Зміни суто документаційні; production не змінювався й потребує ручної перебудови
  та перезапуску контейнера за `docs/deploy.md` для попередніх функціональних змін.

## [2026-07-16 14:40] Acceptance-перевірка розривів із макетом

- `backend/tests/test_mockup_gap_acceptance.py` — додано інтегрований Docker-сценарій
  орендарів: порожня квартира, два вкладення з переглядом, завершення контракту,
  наступний орендар, історія обох і порожня статистика для всіх режимів періоду.
- `frontend/src/components/TenantSection.test.tsx`, `frontend/src/pages/Stats.test.tsx` —
  зафіксовано empty states квартири/файлів та запити для пресетів 12/6/24 місяці;
  наявні перевірки підтвердили довільний період, весь час, тайли та підписи графіка.
- Живий Docker UI перевірено через Playwright: блок орендаря, керування контрактом,
  файли, п'ять режимів статистики й три summary-тайли відповідають repo-макету.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 8 позначено виконаним після 78
  backend-тестів, Ruff, 48 frontend-тестів і production build у Docker. Для
  production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 14:29] Діапазон і підсумки статистики

- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — додано спільний
  вибір періоду для споживання й доходу, довільний діапазон по місяцях, три
  підсумкові тайли та компактні суми над стовпчиками доходу.
- `frontend/src/api/client.ts` — типізовано пресети, весь час і довільний період для
  stats API, nullable `months` та найбільшу статтю комунальних у відповіді доходу.
- `frontend/src/pages/Stats.test.tsx` — перевірено пресети, весь час, довільний і
  помилковий діапазони, тайли, стан без даних та підписи стовпчиків.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 7 позначено виконаним після 47
  frontend-тестів і production build у Docker. Для production потрібно перебудувати
  й перезапустити контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 14:22] Орендарі у списках квартир

- `frontend/src/pages/Apartments.tsx`, `frontend/src/pages/Dashboard.tsx`,
  `frontend/src/utils/format.ts` — у картках квартир показано скорочене ім'я активного
  орендаря із сумою оренди або стан «Квартира вільна».
- `frontend/src/api/client.ts`, frontend fixtures — додано обов'язкове поле
  `current_tenant_name` до типізованого контракту квартири.
- `frontend/src/pages/Apartments.test.tsx`, `frontend/src/pages/Dashboard.test.tsx` —
  перевірено картки з активним орендарем і без нього на обох сторінках.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 6 позначено виконаним після 45
  frontend-тестів і production build у Docker. Для production потрібно перебудувати
  й перезапустити контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 14:18] Картка орендаря у квартирі

- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx`,
  `frontend/src/pages/portal.css` — додано активного орендаря, редагування й завершення
  контракту, створення наступного орендаря, історію та керування файлами контракту.
- `frontend/src/api/client.ts`, `backend/app/routers/tenants.py` — додано типізовані
  tenant/attachment-запити, multipart upload і захищене читання списку метаданих файлів.
- `frontend/src/components/TenantSection.test.tsx`, `frontend/src/api/client.test.ts`,
  `frontend/src/pages/ApartmentDetail.test.tsx`, `backend/tests/test_attachments.py` —
  перевірено активного/нового орендаря, історію, файли, 409 і multipart-контракт.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 5 позначено виконаним після 44
  frontend-тестів, frontend build, 77 backend-тестів і Ruff у Docker. Для production
  потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`; автоматичний
  деплой не виконувався.

## [2026-07-16 14:11] Довільний період і summary статистики

- `backend/app/routers/stats.py`, `backend/app/schemas.py` — додано взаємовиключні
  режими статистики за кількістю місяців, довільним діапазоном і за весь час;
  income повертає найбільшу статтю комунальних, її частку та піковий місяць.
- `backend/tests/test_stats.py` — перевірено обрізання діапазону, відсутність нижньої
  межі для all-time, помилки комбінацій параметрів, default 12 місяців, fixed-послугу
  як найбільшу статтю на двох квартирах і стан без комунальних даних.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 4 позначено виконаним після 77
  успішних backend-тестів і Ruff у Docker. Для production потрібно перебудувати й
  перезапустити контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 14:05] Файли контрактів орендарів

- `backend/app/services/storage.py`, `backend/app/config.py` — додано приватне сховище
  у `/data/uploads`, UUID-імена з MIME-whitelist розширень, обмеження 10 МБ і захист
  шляхів від виходу за каталог завантажень.
- `backend/app/routers/tenants.py`, `backend/app/schemas.py` — додано захищені API для
  множинного завантаження, перегляду й видалення вкладень; DELETE орендаря явно
  очищає його файли, а soft-архівація квартири їх зберігає.
- `backend/tests/test_attachments.py` — перевірено два файли, MIME/розширення, ліміт
  розміру, авторизацію, байти відповіді, видалення, архівацію та path traversal.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 3 позначено виконаним після 75
  успішних backend-тестів і Ruff у Docker. Для production потрібно перебудувати й
  перезапустити контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 13:58] API орендарів і життєвий цикл контракту

- `backend/app/schemas.py`, `backend/app/routers/tenants.py`, `backend/app/main.py` —
  додано валідовані схеми й захищений CRUD орендарів, завершення контракту та
  інваріант одного активного орендаря на квартиру.
- `backend/app/routers/apartments.py` — список і деталі квартир повертають
  `current_tenant_name`; імена активних орендарів завантажуються одним запитом.
- `backend/tests/test_tenants.py` — перевірено послідовну історію двох орендарів,
  конфлікти активних контрактів, валідацію дат/email, 404/401, оновлення, видалення
  та ім'я поточного орендаря у списку квартир.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 2 позначено виконаним після 71
  успішного backend-тесту і Ruff у Docker. Для production потрібна перебудова та
  перезапуск контейнера за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 13:53] Моделі орендарів і вкладень контракту

- `backend/app/models.py`, `backend/alembic/versions/20260716_03_add_tenants.py` —
  додано моделі й таблиці `Tenant`/`TenantAttachment`, зв'язки з каскадним видаленням,
  індекси орендарів і метадані файлів контракту.
- `backend/tests/test_models.py` — додано перевірки створення активного орендаря,
  nullable `contract_end`, вкладення та DB-рівневого каскаду
  apartment → tenant → attachment; startup-тест перевіряє нові таблиці міграції.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 1 позначено виконаним після 68
  успішних backend-тестів, Ruff і `alembic check` у Docker.

## [2026-07-16 14:10] Правки плану після авто-рев'ю

- `docs/plans/20260716-mockup-gap-fixes.md` — виправлено за знахідками plan-review:
  `uploads_dir` → абсолютний `/data/uploads` (інакше файли випадали б із persistent
  volume і губилися при перебудові контейнера); прибрано хибне припущення про каскадне
  видалення квартири (насправді soft-архівація — файли орендарів зберігаються,
  очищення диска лише явним кодом у DELETE орендаря/файла); специфіковано
  `top_service` (агрегація InvoiceLine.amount за грошима, працює для fixed-послуг),
  тайли беруть суми з наявного `totals` без дублювання; «Весь час» → явний параметр
  `all_time=true`; розширення файла — з whitelist за content-type.

## [2026-07-16 13:55] План виправлень розривів із макетом

- `docs/plans/20260716-mockup-gap-fixes.md` — створено план за результатами порівняння
  макета з реалізацією: орендарі (ПІБ/телефон/email, історія контрактів, файли
  контракту JPG/PNG/WebP/PDF на волюмі), статистика (пресети 6/12/24/весь час +
  довільний період, саммарі-тайли, підписи над стовпчиками), ім'я орендаря у списках.
  9 тасків; зміна лише документація — деплой не потрібен.

## [2026-07-16 11:09] Імпорт реального XLSX-експорту

- `backend/app/services/importer.py` — додано адаптер для фактичної структури
  `mazepy175a.xlsx`: визначення типів послуг за показниками, зіставлення історичних
  назв, місячні тарифи, оренда/курс і разові коригування.
- `frontend/src/pages/Settings.tsx` — порожній список квартир тепер пояснює, чому
  імпорт недоступний, веде до створення квартири та показує деталь помилки API.
- `backend/tests/test_importer.py`, `frontend/src/pages/Settings.test.tsx` — додано
  анонімізовані регресійні тести реального XLSX-layout і стану без квартири; сам
  користувацький файл у репозиторій не додавався.
- Docker-перевірки пройдено: реальний файл імпортовано в одноразову базу (26
  рахунків), 66 backend-тестів, Ruff, 39 frontend-тестів і frontend build. Для
  production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-15 10:37] Однокомандний запуск Docker

- `start.sh` — додано кореневий idempotent launcher: перевіряє Docker/Compose,
  збирає й запускає dev-stack, чекає готовності backend/frontend та показує URL і
  локальні credentials.
- `README.md` — додано короткий сценарій запуску HomeTrap командою `./start.sh`.

## [2026-07-14 21:37] Серіалізація мутацій рахунків

- `backend/app/services/billing.py`, `backend/app/routers/invoices.py` — мутації
  рахунків серіалізовано SQLite write-reservation на квартирі; статус повторно
  читається після отримання lock, тому stale-запит не видаляє вже виставлений рахунок.
- `backend/app/services/importer.py` — XLSX-імпорт бере той самий lock до будь-яких
  записів і відхиляє від’ємну оренду в USD або гривнях.
- `backend/tests/test_billing.py`, `backend/tests/test_importer.py` — додано регресії
  конкурентного виставлення/видалення, одночасного створення чернетки й імпорту та
  відкату імпорту з від’ємною орендою.
- Docker-перевірки пройдено: 65 backend-тестів, Ruff, 37 frontend-тестів, frontend
  build, dev/production Compose config, dev і production image build; production
  image не містить pytest/Ruff і містить SPA. Для production потрібно перебудувати
  й перезапустити контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-14 21:24] Усунення code smells порталу

- `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/tests/test_auth.py` —
  lifecycle login-reservation оформлено як lease, що гарантовано звільняє pending
  слот після неочікуваної помилки.
- `backend/app/services/billing.py`, `backend/app/routers/invoices.py`,
  `backend/app/services/importer.py` та тести — HTTP-мапінг переведено на типізовані
  billing errors, спільний validator хронології використовується API й імпортом, а
  нульові та від’ємні місячні тарифи більше не підміняються fallback-значенням.
- `backend/app/routers/apartments.py`, `backend/tests/test_apartments.py` — останні
  рахунки для списку квартир завантажуються одним batch-запитом без N+1.
- `backend/requirements.txt`, `backend/requirements-dev.txt`, `docker/Dockerfile`,
  `docker/docker-compose.dev.yml`, `README.md`, `docs/deploy.md` — exact runtime/dev
  Python-залежності розділено, а dev backend збирається без production frontend stage.
- `frontend/src/components/InvoiceStatusBadge.tsx`, `frontend/src/utils/format.ts` і
  сторінки порталу — централізовано статуси рахунків, filter options та формат UAH.
- Docker-перевірки пройдено: 62 backend-тести, Ruff, 37 frontend-тестів, frontend
  build, dev/production Compose config, backend-dev і production runtime images;
  production image не містить pytest/Ruff. Для production потрібно перебудувати й
  перезапустити контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-14 21:01] Закриття фінальних зауважень безпеки

- `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/tests/test_auth.py` —
  ліміт входу атомарно резервує спробу до bcrypt і не допускає обходу паралельними
  запитами.
- `backend/app/services/notify.py`, `backend/tests/test_notify.py` — SMTP STARTTLS
  використовує системний перевірочний SSL-контекст із валідацією сертифіката та
  hostname.
- `backend/app/services/importer.py`, `backend/tests/test_importer.py` — XLSX-імпорт
  відхиляє нульові й від’ємні тарифи та відкочує створені сутності.
- Docker-перевірки пройдено: 59 backend-тестів, Ruff, 37 frontend-тестів,
  frontend build, production Compose config і multi-stage image build.
- Production-зміна потребує перебудови й перезапуску контейнера за `docs/deploy.md`;
  автоматичне розгортання в межах цього циклу не виконується.

## [2026-07-14 20:50] Відновлення коректної хронології чернеток

- `backend/app/services/importer.py`, `backend/tests/test_importer.py` — XLSX-імпорт
  відхиляє наступні місяці, доки існує незавершена рання чернетка, і не створює
  рахунок, який заблокує її редагування.
- `backend/app/services/billing.py`, `backend/app/routers/invoices.py`,
  `backend/tests/test_billing.py` — додано видалення лише чернеток через API, щоб
  помилковий майбутній період можна було прибрати й створити правильний рахунок.
- `frontend/src/api/client.ts`, `frontend/src/pages/InvoiceEdit.tsx`,
  `frontend/src/pages/portal.css` та відповідні тести — у редакторі чернетки додано
  підтверджене видалення з поверненням до списку рахунків.
- Docker-перевірки пройдено: 57 backend-тестів, Ruff, 37 frontend-тестів,
  frontend build, production Compose config і multi-stage image build.
- Для production після оновлення потрібно перебудувати й перезапустити контейнер за
  `docs/deploy.md`; автоматичне розгортання в межах цього циклу не виконується.

## [2026-07-14 20:38] Посилено цілісність рахунків і production-деплой

- `backend/app/services/billing.py`, `backend/tests/test_billing.py`,
  `backend/tests/test_invoice_status.py` — заборонено створювати наступний рахунок до
  завершення ранньої чернетки та виставляти metered-рахунок без поточних показників.
- `backend/app/services/importer.py`, `backend/tests/test_importer.py` — імпорт більше
  не вставляє історичні місяці перед наявними рахунками й не порушує snapshot показників.
- `backend/app/routers/stats.py`, `backend/tests/test_stats.py` — статистика споживання
  виключає чернетки, а поточний місяць визначається в таймзоні `Europe/Kyiv`.
- `backend/app/config.py`, `backend/tests/test_auth.py` — production-запуск відхиляє
  короткий або шаблонний `ADMIN_PASSWORD` до створення адміністратора.
- `docker/docker-compose.yml`, `.env.example`, `docs/deploy.md` — production HTTP-порт
  за замовчуванням прив'язано до `127.0.0.1` зі збереженням сумісності з Synology
  reverse proxy; уточнено перевірку health endpoint і параметр bind address.
- Повний Docker-цикл пройдено: 54 backend-тести, Ruff, 35 frontend-тестів,
  frontend build, production Compose config та multi-stage image build.

## [2026-07-14 20:28] Захист історичних рахунків і proxy-aware login

- `backend/app/services/importer.py`, `backend/app/services/billing.py` — повторний
  XLSX-імпорт не змінює наявні рахунки, а backdated-чернетка не створюється, якщо
  для квартири вже існує пізніший рахунок.
- `backend/app/routers/stats.py` — історія споживання фільтрується за snapshot типу
  рядка рахунку й не зникає після зміни поточного типу послуги.
- `backend/app/config.py`, `backend/app/routers/auth.py`, `.env.example` — rate limit
  розділяє клієнтів за `X-Forwarded-For` лише для явно довірених CIDR безпосереднього
  proxy; запити від інших peer не можуть підробити IP цим заголовком.
- `backend/tests/test_auth.py`, `backend/tests/test_billing.py`,
  `backend/tests/test_importer.py`, `backend/tests/test_stats.py` — додано регресійні
  сценарії для незмінності імпорту, backdated-періодів, snapshot-статистики та
  безпечної обробки proxy IP.
- `docs/deploy.md` — додано production-налаштування точного Docker gateway CIDR для
  Synology reverse proxy. Для розгортання оновіть `.env` за інструкцією та перебудуйте
  контейнер; автоматичне розгортання в межах цього циклу не виконувалося.

## [2026-07-14 20:14] Виправлення за результатами комплексного рев'ю

- `backend/app/config.py`, `backend/app/auth.py`, `backend/app/main.py` — production
  відхиляє слабкий session secret, пошкоджені cookie не спричиняють 500, а scheduler
  можна вимкнути в герметичних тестах.
- `backend/app/models.py`, `backend/alembic/versions/20260714_02_invoice_line_kind.py`,
  `backend/app/services/billing.py`, `backend/app/routers/invoices.py` — тип послуги
  зберігається у snapshot рядка, попередній показник шукається по останньому наявному
  рядку, а старі рахунки не можна змінити після появи новішого.
- `backend/app/services/nbu.py`, `backend/app/services/importer.py`,
  `backend/app/routers/stats.py`, `backend/app/services/notify.py`, `backend/app/db.py`,
  `backend/app/schemas.py` — оброблено конкурентне кешування курсу, безпечний повторний
  XLSX-імпорт і строгі типи/курс, виключено чернетки з доходу, обмежено історію
  дедуплікації та звужено валюту MVP до USD.
- `frontend/src/pages/Apartments.tsx`, `frontend/src/pages/ApartmentDetail.tsx`,
  `frontend/src/api/client.ts`, `frontend/src/pages/portal.css` — додано створення,
  редагування й архівацію квартир, деактивацію послуг та повну тарифну історію з
  коректним визначенням чинного й майбутнього тарифу.
- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/pages/InvoiceEdit.tsx` —
  живий розрахунок використовує точну десяткову арифметику й snapshot типу рядка;
  актуальні показники та курс зберігаються перед виставленням рахунку.
- `backend/tests/*`, `frontend/src/**/*.test.tsx` — тестова БД тепер створюється
  Alembic-міграціями; розширено покриття billing/import/notification adapters,
  API transport, login, protected routes, apartment CRUD, invoice transitions і settings.
- `docker/docker-compose.dev.yml`, `README.md`, `docs/deploy.md`,
  `docs/plans/20260714-rental-payment-portal.md` — dev-вхід працює одразу, команди
  Compose виправлено, описано HTTPS-only login, ротацію bootstrap-пароля та захист
  бекапів із секретами. Production-деплой: перебудувати образ за `docs/deploy.md`;
  автоматичне розгортання в межах цього циклу не виконувалося.

## [2026-07-14 19:50] Фінальна документація порталу

- `README.md` — додано огляд HomeTrap, Docker-команди для розробки, тестів і
  production-запуску та посилання на Synology deployment guide.
- `CLAUDE.md` — зафіксовано сталі dev/prod Docker-конвенції та вимогу одного Uvicorn
  worker для коректної роботи APScheduler.
- `docs/plans/20260714-rental-payment-portal.md` — Task 18 позначено виконаним;
  фактичне переміщення плану відкладено до terminal harness після review-фаз.

## [2026-07-14 19:48] Acceptance-перевірка порталу

- `backend/tests/test_acceptance.py` — додано наскрізний API-сценарій від логіна,
  квартири, послуги й тарифу через XLSX-імпорт і перенесення показників до оплати,
  статистики та тестового сповіщення в одній ізольованій БД.
- Наявними backend-тестами повторно підтверджено перший рахунок без історії, вибір
  тарифу за періодом та fallback на кешований курс при недоступному НБУ.
- Frontend звірено з доступним описом макета: шавлієві пастельні токени, світла/темна
  тема й усі заявлені екрани присутні; зовнішній Claude artifact недоступний через
  HTTP 403, тому pixel-level порівняння не виконувалося.
- `docs/plans/20260714-rental-payment-portal.md` — Task 17 позначено виконаним після
  повного Docker test suite.

## [2026-07-14 19:43] Production-збірка та Synology deployment

- `docker/Dockerfile`, `docker/docker-compose.yml`, `.dockerignore`, `.env.example` —
  додано multi-stage frontend/backend образ, один Uvicorn worker, SQLite bind volume,
  healthcheck, restart policy та безпечні placeholder-налаштування без credentials.
- `backend/app/main.py`, `backend/app/config.py`, `backend/tests/test_static.py` —
  production-застосунок віддає Vite assets і повертає `index.html` для SPA-маршрутів,
  не підміняючи невідомі `/api/*`; додано success/error тести fallback.
- `docs/deploy.md`, `.gitignore` — описано Synology Container Manager, оновлення,
  консистентний бекап SQLite, reverse proxy, Let's Encrypt і вимогу одного worker;
  локальні runtime-дані виключено з Git.
- `docs/plans/20260714-rental-payment-portal.md` — Task 16 позначено виконаним після
  43 backend і 13 frontend тестів, Ruff, Vite build та production smoke у Docker:
  login, apartment, invoice, healthcheck і прямий refresh `/invoices` пройшли.

## [2026-07-14 19:37] Налаштування та імпорт у frontend

- `frontend/src/pages/Settings.tsx`, `frontend/src/pages/portal.css` — додано форму
  Telegram/SMTP і розкладу нагадувань, тестове повідомлення та секцію XLSX-імпорту
  з вибором квартири, dry-run переглядом, фактичним запуском і звітом попереджень.
- `frontend/src/api/client.ts`, `frontend/src/App.tsx` — типізовано settings/import API,
  додано коректне завантаження `FormData` та підключено захищений маршрут налаштувань;
  жодні реальні облікові дані у frontend не вбудовано.
- `frontend/src/pages/Settings.test.tsx` — перевірено порожні секретні поля й показ
  dry-run звіту; у Docker пройшли 13 frontend і 41 backend тест, Vite build та Ruff.
  Зміни є production UI; розгортання виконується після Task 16 за майбутнім
  `docs/deploy.md`.
- `docs/plans/20260714-rental-payment-portal.md` — Task 15 позначено виконаним.

## [2026-07-14 19:32] Статистика у frontend

- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — додано адаптивні
  SVG-графіки споживання газу, світла й води з тултіпами, стековий графік доходу
  та перемикач статистики квартири/портфеля без сторонньої chart-бібліотеки.
- `frontend/src/api/client.ts`, `frontend/src/App.tsx` — типізовано API статистики та
  підключено сторінку до захищеного маршруту `/stats`.
- `frontend/src/pages/Stats.test.tsx` — перевірено графіки, перемикання масштабу й
  порожню історію; у Docker пройшли 11 frontend і 41 backend тест, Vite build та
  Ruff. Зміни є production UI; розгортання виконується після Task 16 за майбутнім
  `docs/deploy.md`.
- `docs/plans/20260714-rental-payment-portal.md` — Task 14 позначено виконаним.

## [2026-07-14 19:27] Інтерфейс рахунків

- `frontend/src/pages/Invoices.tsx`, `frontend/src/pages/InvoiceEdit.tsx` — додано
  список рахунків із фільтрами та статусами, створення чернетки, перегляд рахунку,
  виставлення, повернення в чернетку, оплату з відображенням дати й скасування оплати.
- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/api/client.ts` — додано
  типізований invoice API, живий перерахунок показників, тарифів, курсу та підсумків,
  редагування чернетки й показ попереджень українською.
- `frontend/src/**/*.test.tsx`, `frontend/src/pages/portal.css`, `frontend/src/App.tsx` —
  додано адаптивні стилі, маршрути та перевірки калькулятора, фільтрів і статусних
  переходів; у Docker пройшли 9 frontend-тестів і production Vite build. Зміни є
  production UI; розгортання виконується після Task 16 за майбутнім `docs/deploy.md`.
- `docs/plans/20260714-rental-payment-portal.md` — Task 13 позначено виконаним.

## [2026-07-14 19:19] Дашборд і керування квартирами

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Apartments.tsx` — додано
  портфельні показники, курс НБУ, статуси квартир, список рахунків, що потребують
  уваги, та каталог квартир.
- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/pages/portal.css` — додано
  адаптивну картку квартири, таблицю послуг і тарифів, форми додавання/редагування
  послуг і нових тарифів та disabled-заглушку посилання орендаря.
- `frontend/src/api/client.ts`, `frontend/src/App.tsx` — типізовано dashboard,
  apartments, services і tariffs API та підключено нові захищені маршрути.
- `frontend/src/pages/*.test.tsx` — перевірено mock-дашборд, картку квартири,
  таблицю послуг, тариф і форму редагування; у Docker пройшли 5 frontend і 41
  backend тест, Vite build та Ruff. Зміни є production UI; для деплою слід виконати
  production Docker-інструкції, які будуть додані в окремому таску плану.
- `docs/plans/20260714-rental-payment-portal.md` — Task 12 позначено виконаним.

## [2026-07-14 19:13] Frontend-каркас, тема та вхід

- `frontend/src/*` — додано React Router, API-клієнт із cookie-сесією та переходом на
  login після `401`, захищені маршрути, сторінку входу й базовий Layout із навігацією
  та чипом актуального курсу НБУ.
- `frontend/src/theme.css`, CSS компонентів — додано пастельні дизайн-токени,
  шавлієвий акцент, адаптивний інтерфейс і світлу/темну тему.
- `frontend/package.json`, `frontend/vite.config.ts`, TypeScript-конфігурація —
  налаштовано Vite, Vitest і React Testing Library; додано тести форми входу та
  редіректу неавтентифікованого користувача.
- `docker/Dockerfile.frontend`, `docker/docker-compose.dev.yml`, `.gitignore` — додано
  відтворюваний frontend dev-образ із hot reload, проксі `/api` до backend та
  виключення залежностей і Vite-збірки. Цей цикл є локальним; production-образ і
  інструкції деплою передбачені окремими наступними задачами плану.
- `docs/plans/20260714-rental-payment-portal.md` — Task 11 позначено виконаним після
  успішних 2 frontend і 41 backend тестів, Vite build, Ruff та live-перевірки proxy
  в Docker.

## [2026-07-14 19:04] Нагадування та налаштування каналів

- `backend/app/services/notify.py` — додано окремо керовані Telegram Bot API та SMTP
  відправники, правила нагадувань про показники й прострочені рахунки та захист від
  повторної відправки в той самий день.
- `backend/app/routers/settings.py`, `backend/app/schemas.py`, `backend/app/main.py` —
  додано захищені `GET/PUT /api/settings`, тестове сповіщення й валідацію конфігурації
  каналів зі збереженням у `Setting`.
- `backend/app/services/scheduler.py` — додано щоденний запуск нагадувань о 08:00 у
  таймзоні `Europe/Kyiv`.
- `backend/tests/test_notify.py`, `backend/tests/test_nbu.py` — додано тести правил,
  повторів, вимкнених каналів, API налаштувань і scheduler; у Docker пройшли 41 тест
  та `ruff check`.
- `docs/plans/20260714-rental-payment-portal.md` — Task 10 позначено виконаним після
  успішної повної перевірки backend у Docker.

## [2026-07-14 19:00] Імпорт історії з XLSX

- `backend/app/services/importer.py`, `backend/app/routers/import_.py`, `backend/app/main.py`,
  `backend/app/schemas.py` — додано захищений XLSX-import послуг, історії тарифів і
  оплачених рахунків, dry-run, ідемпотентний повторний запуск та звіт із попередженнями.
- `backend/tests/fixtures/sample_import.xlsx`, `backend/tests/fixtures/generate_sample_import.py`
  — додано відтворювану анонімізовану compatibility-фікстуру з merged cells, тарифами
  із суфіксом `грн.`, прочерками й битою клітинкою; реального експорту в репозиторії немає.
- `backend/tests/test_importer.py` — перевірено повний імпорт, dry-run без запису,
  повторний імпорт, нечислові клітинки, розрив місяців, merged cells, помилки upload
  та авторизацію.
- `docs/plans/20260714-rental-payment-portal.md` — Task 9 позначено виконаним після
  успішних 37 `pytest` і `ruff check` у Docker.

## [2026-07-14 18:54] Статистика порталу

- `backend/app/routers/stats.py`, `backend/app/main.py` — додано захищені endpoints
  помісячного споживання, доходу квартири/портфеля та плиток дашборда із переліком
  неоплачених рахунків, що потребують уваги.
- `backend/app/schemas.py` — додано типізовані відповіді статистики зі спільною
  серіалізацією грошових і кількісних `Decimal`-значень у JSON-рядки.
- `backend/tests/test_stats.py` — перевірено агрегацію кількох місяців, двох квартир,
  порожню історію, метрики дашборда, авторизацію та помилки параметрів.
- `docs/plans/20260714-rental-payment-portal.md` — Task 8 позначено виконаним після
  успішних 33 `pytest` і `ruff check` у Docker.

## [2026-07-14 18:48] Життєвий цикл і список рахунків

- `backend/app/services/billing.py`, `backend/app/routers/invoices.py` — додано переходи
  `draft → issued → paid`, повернення до чернетки/зняття оплати, часові позначки,
  захищені detail/list endpoints і фільтри за квартирою, статусом та періодом.
- `backend/app/schemas.py` — додано схему елемента списку, часові поля у відповіді
  рахунку та стабільну UTC-серіалізацію дат переходів для SQLite.
- `backend/tests/test_invoice_status.py` — перевірено повний життєвий цикл, заборонені
  переходи й редагування, snapshot значень, деталі, фільтри та авторизацію.
- `docs/plans/20260714-rental-payment-portal.md` — Task 7 позначено виконаним після
  успішних 29 `pytest` і `ruff check` у Docker.

## [2026-07-14 18:44] Чернетки рахунків і перерахунок

- `backend/app/services/billing.py`, `backend/app/routers/invoices.py` — додано створення
  чернетки за період із чинними тарифами, курсом НБУ та перенесеними показниками, а
  також редагування показників і курсу лише для чернетки.
- `backend/app/schemas.py`, `backend/app/models.py`, `backend/app/main.py` — додано API-
  схеми рахунків із Decimal-серіалізацією, стабільний порядок рядків і реєстрацію
  захищених invoice-маршрутів.
- `backend/tests/test_billing.py` — перевірено точний розрахунок реального прикладу,
  перший рахунок, перенесення показників, історію тарифів, м'які попередження та
  помилки авторизації/валідації.
- `docs/plans/20260714-rental-payment-portal.md` — Task 6 позначено виконаним після
  успішних `pytest` і `ruff check` у Docker.

## [2026-07-14 18:35] Курс НБУ та щоденне оновлення

- `backend/app/services/nbu.py`, `backend/app/routers/rates.py` — додано HTTP-клієнт
  НБУ, кешування курсу USD, fallback на останній відомий курс і захищений endpoint
  `/api/rates/current` із датою фактичного курсу.
- `backend/app/services/scheduler.py`, `backend/app/main.py` — додано запуск і коректну
  зупинку APScheduler у життєвому циклі застосунку та щоденне оновлення о 06:00 у
  таймзоні `Europe/Kyiv`.
- `backend/app/schemas.py`, `backend/tests/test_nbu.py` — додано серіалізацію курсу
  рядком і тести свіжого курсу, кешу, fallback, помилки НБУ, scheduler та API.
- `docs/plans/20260714-rental-payment-portal.md` — Task 5 позначено виконаним після
  успішних `pytest` і `ruff check` у Docker.

## [2026-07-14 18:29] CRUD квартир, послуг і тарифів

- `backend/app/schemas.py` — додано спільні Pydantic-схеми API із серіалізацією
  `Decimal` у JSON-рядки та валідацією квартир, послуг і тарифів.
- `backend/app/routers/apartments.py`, `backend/app/routers/services.py`,
  `backend/app/main.py` — додано захищений CRUD квартир і послуг, архівацію,
  сортування, історію тарифів та заборону видалення використаних послуг.
- `backend/tests/test_apartments.py` — додано success/error перевірки CRUD,
  авторизації, 404/409/422, сортування, останнього рахунку й грошових JSON-рядків.
- `docs/plans/20260714-rental-payment-portal.md` — Task 4 позначено виконаним після
  успішних `pytest` і `ruff check` у Docker.

## [2026-07-14 18:22] Автентифікація адміністратора

- `backend/app/auth.py`, `backend/app/routers/auth.py` — додано створення адміністратора
  з env, bcrypt-хешування, підписану HttpOnly session cookie, login/logout/me та
  in-memory rate limit невдалих входів за IP.
- `backend/app/config.py`, `backend/app/main.py` — додано admin-налаштування, життєвий
  цикл DB-сесій і підключення auth-роутера.
- `backend/tests/test_auth.py` — додано перевірки bootstrap адміністратора, успішного й
  хибного входу, захищеного `/api/auth/me`, виходу та відповіді 429 після п'яти спроб.
- `docs/plans/20260714-rental-payment-portal.md` — Task 3 позначено виконаним після
  успішних `pytest` і `ruff check` у Docker.

## [2026-07-14 18:18] Моделі БД та початкова міграція

- `backend/app/db.py`, `backend/app/models.py` — додано SQLAlchemy 2.0 моделі всіх
  сутностей порталу, зв'язки, каскади, унікальні обмеження та вибір чинного тарифу.
- `backend/alembic.ini`, `backend/alembic/*`, `backend/app/main.py` — додано початкову
  міграцію та її автоматичне застосування під час старту FastAPI.
- `backend/tests/conftest.py`, `backend/tests/test_models.py` — додано тимчасову SQLite
  на кожен тест і перевірки сутностей, каскадів, унікальності, тарифів та startup-міграції.
- `docs/plans/20260714-rental-payment-portal.md` — Task 2 позначено виконаним після
  успішних `pytest`, `ruff check` і `alembic check` у Docker.

## [2026-07-14 18:12] Каркас backend і Docker dev-середовище

- `backend/app/*` — додано FastAPI app factory, `/api/health` і env-конфігурацію БД,
  secret та debug-режиму.
- `backend/requirements.txt`, `backend/pytest.ini`, `backend/tests/test_health.py` — додано
  backend-залежності, асинхронну конфігурацію pytest і тест health endpoint.
- `docker/Dockerfile`, `docker/docker-compose.dev.yml` — додано Python-образ і backend
  dev-сервіс із hot-reload, volume для коду та SQLite.
- `docs/plans/20260714-rental-payment-portal.md` — Task 1 позначено виконаним після
  успішних `pytest` і `ruff check` у Docker.

## [2026-07-14 17:40] Правки плану після авто-рев'ю

- `docs/plans/20260714-rental-payment-portal.md` — враховано знахідки plan-review агента:
  додано `pytest-asyncio`, `python-multipart`, `ruff` у залежності; Task 6 розбито на
  «чернетка/перерахунок» і «статуси/список»; фронтенд-таск статистики/налаштувань розбито
  на два; додано SPA-fallback у прод-збірку; таймзона `Europe/Kyiv` і один uvicorn-воркер
  для APScheduler; фікстура імпорту — з реального експорту; серіалізація Decimal рядком;
  тест 401 через `/api/auth/me`. Тепер 18 тасків.

## [2026-07-14 17:10] План реалізації порталу HomeTrap

- `docs/plans/20260714-rental-payment-portal.md` — створено план MVP за результатами
  брейншторму: FastAPI + React (Vite) + SQLite, моноліт в одному Docker-контейнері,
  деплой на Synology NAS; 16 тасків від каркаса до деплою.
- Скоуп MVP: квартири/послуги/тарифи з історією, рахунки (чернетка → виставлений →
  оплачений, курс НБУ, snapshot), імпорт історії з XLSX, статистика, нагадування
  Telegram + Email.
- UI-макет затверджено: https://claude.ai/code/artifact/75fc7149-2db9-4890-93cf-479efc13f4b2
- `ChangeLog.md` — створено цей файл.
