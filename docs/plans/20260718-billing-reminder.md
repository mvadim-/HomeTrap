# Нагадування про виставлення рахунків

## Overview
- Щомісячне нагадування орендодавцю про виставлення рахунка: за замовчуванням у
  день місяця з дати підписання договору (`Tenant.contract_start`), з ручним
  override (`Tenant.billing_day`).
- «Розумна» поведінка: перше нагадування за `days_before` днів до дня
  виставлення, повтор кожні `repeat_every_days`, автоматичне замовкання щойно
  рахунок за період існує (у будь-якому статусі).
- Авто-чернетка: у день виставлення система сама створює draft-рахунок через
  наявний `billing.create_draft`; при помилці — нагадування «створіть вручну»
  замість чернетки.
- Новий канал доставки Web Push (PWA + VAPID + pywebpush) додається як третій
  глобальний канал поряд з email і Telegram — працює і для наявних повідомлень.
- Dashboard-віджет «Найближчі виставлення» на 30 днів уперед.

## Context (from discovery)
- Файли: `backend/app/models.py`, `backend/app/services/notify.py`,
  `backend/app/services/billing.py` (`create_draft` перевикористовується),
  `backend/app/services/scheduler.py` (нові job НЕ додаються),
  `backend/app/routers/settings.py`, `backend/app/schemas.py`,
  `backend/alembic/versions/`, `frontend/src/pages/Settings.tsx`,
  `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/TenantSection.tsx`.
- Патерни: канали як `NotificationSender`-протокол (`TelegramSender`,
  `EmailSender`); налаштування — JSON у таблиці `Setting`
  (ключ `notifications`); дедуплікація — `notification_history` (ключ → дата);
  щоденна job о 08:00 Києва викликає `run_daily_notifications`; курс НБУ
  оновлюється о 06:00.
- Залежності: нова — `pywebpush`; Alembic-міграції застосовуються на старті
  застосунку; production — один Uvicorn worker (APScheduler у процесі).

## Development Approach
- **testing approach**: Regular (спочатку код, потім тести в межах того ж таска)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions/methods
  - write unit tests for modified functions/methods
  - add new test cases for new code paths
  - update existing test cases if behavior changes
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run tests after each change
- maintain backward compatibility (наявні збережені налаштування без нових
  ключів мають продовжувати працювати — merge із defaults)
- **після кожного завершеного таска — запис у `ChangeLog.md` і окремий git-коміт
  з коротким імперативним subject** (вимога CLAUDE.md; не батчити наприкінці)

## Testing Strategy
- **unit tests**: обов'язкові в кожному таску (див. Development Approach).
- **backend**: pytest у Docker —
  `docker compose -f docker/docker-compose.dev.yml run --rm backend pytest`.
- **frontend**: Vitest у Docker —
  `docker compose -f docker/docker-compose.dev.yml run --rm frontend npm test -- --run`.
- e2e-фреймворку (Playwright/Cypress) у проєкті немає — UI покривається
  Vitest-тестами компонентів, флоу підписки — моком `pushManager`.

## Progress Tracking
- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview
- Чиста функція `compute_billing_schedule(session, today)` у новому модулі
  `backend/app/services/billing_schedule.py` — єдине джерело правди для дат
  виставлення. Її використовують і щоденний notification-конвеєр, і endpoint
  віджета `GET /api/billing/upcoming`.
- Нагадування вбудовуються в наявну `run_daily_notifications` (та сама job,
  ті самі senders, та сама history-дедуплікація) — нових APScheduler job немає.
- Web Push — окремий модуль `backend/app/services/push.py`
  (VAPID-ключі, підписки, `WebPushSender`), інтегрований у `build_senders`.

## Technical Details
- `Tenant.billing_day`: nullable Integer 1–31; `NULL` = `contract_start.day`.
- Обрізання дня: 29–31 → останній день короткого місяця (лютий, 30-денні).
- **Вибір орендаря**: поточний мешканець — `contract_start <= today AND
  (contract_end IS NULL OR contract_end >= today)`. Договори не перетинаються
  (гарантія `_ensure_contract_does_not_overlap`), але майбутній орендар
  (`contract_start > today`) НЕ враховується — його перше виставлення з'явиться
  у розкладі лише після початку договору. Максимум один запис на квартиру.
- `next_billing_date`: найближча дата виставлення ≥ `contract_start` для
  активної квартири з поточним орендарем.
- `period` = перше число місяця `next_billing_date` (узгоджено з
  `uq_invoices_apartment_period`).
- Блок налаштувань у JSON `notifications`:
  `"billing_reminder": {"enabled": false, "days_before": 3,
  "repeat_every_days": 1, "auto_draft": true}` та `"push": {"enabled": false}`.
- History-ключі: `billing:{apartment_id}:{period}` (нагадування, зберігає дату
  останньої відправки) і `billing_draft:{apartment_id}:{period}` (разова
  авто-чернетка — не відтворюється після свідомого видалення).
- Вікно нагадування: `next_billing_date - days_before <= today <
  next_billing_date`; у сам день (`today == next_billing_date`) повідомлення
  надсилається завжди: при `auto_draft: true` — «чернетку створено» (без
  дублювання окремого нагадування), при `auto_draft: false` — звичайне
  нагадування. Після дня виставлення повтори не потрібні: далі працює наявний
  overdue-механізм.
- **By design**: авто-чернетка, яку так і не виставили, повторних нагадувань
  не отримує (overdue стежить лише за `issued`) — її видно у Dashboard-віджеті.
- Курс для чернетки: `nbu.get_rate(session, today).rate` — `create_draft`
  приймає `exchange_rate` аргументом і сам курс не тягне; `get_rate` вже має
  fallback на останній кешований курс і кидає `NbuRateUnavailable` лише коли
  немає ані живого, ані історичного.
- Fallback авто-чернетки: `BillingValidationError` (немає тарифу / активних
  послуг), `InvoiceChronologyError` (конфлікт хронології) та
  `NbuRateUnavailable` → нагадування з причиною і `logger.warning`, чернетка
  не створюється.
- `build_senders` отримує нову сигнатуру `build_senders(settings, session)` —
  `WebPushSender` потребує сесію для читання підписок/VAPID і видалення мертвих
  підписок під час відправки. Зачіпає обидва call sites: `notify.py`
  (конвеєр) і `settings.py` (`test_notification`), а також наявні тести, що
  патчать `app.routers.settings.build_senders`.
- `push_subscriptions`: `id`, `endpoint` (unique), `p256dh`, `auth`,
  `created_at`; відповіді 404/410 від push-сервісу → видалення підписки.
- VAPID-пара генерується при першому вмиканні каналу, зберігається в окремому
  `Setting`-ключі (не в `notifications`, щоб приватний ключ не потрапляв у
  відповідь API налаштувань).
- Service worker — тільки обробники `push` і `notificationclick`, без
  кешування. PWA-маніфест для встановлення на головний екран (вимога iOS).

## What Goes Where
- **Implementation Steps** (`[ ]` checkboxes): зміни коду, тести, документація
  в цьому репозиторії.
- **Post-Completion** (без checkboxes): ручна перевірка на пристроях,
  HTTPS на Synology reverse proxy, production-деплой.

## Implementation Steps

### Task 1: Міграція БД — billing_day і push_subscriptions

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/20260718_05_billing_day_push_subscriptions.py`
- Modify: `backend/tests/test_models.py`

- [x] додати `Tenant.billing_day: Mapped[int | None]` у `backend/app/models.py`
- [x] додати модель `PushSubscription` (`endpoint` unique, `p256dh`, `auth`, `created_at`)
- [x] створити Alembic-міграцію з обома змінами (add column + create table)
- [x] write tests: збереження/читання `billing_day`, unique на `endpoint` (success + violation)
- [x] run tests - must pass before next task

### Task 2: Чиста функція compute_billing_schedule

**Files:**
- Create: `backend/app/services/billing_schedule.py`
- Create: `backend/tests/test_billing_schedule.py`

- [x] реалізувати `compute_billing_schedule(session, today)`: активні квартири з поточним орендарем (`contract_start <= today AND (contract_end IS NULL OR contract_end >= today)`, максимум один запис на квартиру) → `billing_day` (override або `contract_start.day`, з обрізанням до кінця місяця), `next_billing_date` (≥ `contract_start`), `period`, `invoice_exists`/`invoice_status`
- [x] write tests: договір від 31-го у лютому (28/29) і 30-денному місяці, високосний рік, override, договір у майбутньому (не враховується поряд із поточним), договір що закінчився, квартира без орендаря, неактивна квартира
- [x] write tests: наявний рахунок за період у кожному статусі → `invoice_exists`/`invoice_status`
- [x] run tests - must pass before next task

### Task 3: Розширення схеми налаштувань із merge defaults

**Files:**
- Modify: `backend/app/services/notify.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/test_notify.py`

- [x] додати `billing_reminder` і `push` у `DEFAULT_NOTIFICATION_SETTINGS`
- [x] `get_notification_settings`: **глибокий** merge збереженого значення з defaults (нові вкладені блоки з'являються для старих інсталяцій без міграції даних; `DEFAULT_NOTIFICATION_SETTINGS.copy()` — shallow, для вкладених dict потрібен deep merge)
- [x] додати в `backend/app/schemas.py` вкладені моделі `BillingReminderSettings` (`days_before: Field(ge=0)`, `repeat_every_days: Field(ge=1)`) і `PushSettings` як поля `NotificationSettings` із `default_factory` — за зразком `TelegramNotificationSettings`/`EmailNotificationSettings`; інакше Pydantic (`extra="ignore"`) мовчки викине нові ключі з PUT/GET
- [x] write tests: merge старих збережених налаштувань без нових ключів; збереження/читання нових полів через API (success + невалідні значення)
- [x] run tests - must pass before next task

### Task 4: Нагадування про виставлення в щоденному конвеєрі

**Files:**
- Modify: `backend/app/services/billing_schedule.py`
- Modify: `backend/app/services/notify.py`
- Modify: `backend/tests/test_billing_schedule.py`
- Modify: `backend/tests/test_notify.py`

- [ ] додати в `billing_schedule.py` функцію відправки нагадувань (вікно `days_before`, повтор `repeat_every_days`, history-ключ `billing:{apartment_id}:{period}`), що приймає senders/history від конвеєра
- [ ] викликати її з `run_daily_notifications` при `billing_reminder.enabled`
- [ ] write tests (логіка нагадувань — у `test_billing_schedule.py`, інтеграція з конвеєром — у `test_notify.py`): перше нагадування на межі вікна, повтор через `repeat_every_days`, тиша поза вікном, замовкання при наявному рахунку, history не оновлюється якщо жодної доставки
- [ ] run tests - must pass before next task

### Task 5: Авто-чернетка в день виставлення

**Files:**
- Modify: `backend/app/services/billing_schedule.py`
- Modify: `backend/tests/test_billing_schedule.py`

- [ ] у день `next_billing_date` при `auto_draft`: виклик `billing.create_draft(session, apartment, period, rate)` з курсом `nbu.get_rate(session, today).rate`, повідомлення «чернетку створено», history-ключ `billing_draft:{apartment_id}:{period}`
- [ ] fallback: `BillingValidationError` / `InvoiceChronologyError` / `NbuRateUnavailable` → повідомлення «створіть вручну: причина» + `logger.warning`, без чернетки
- [ ] write tests: чернетка створюється рівно один раз (після видалення не відтворюється), зміст повідомлення, усі три fallback-сценарії
- [ ] write tests: у день виставлення `auto_draft: false` → нагадування надсилається (не тиша); `auto_draft: true` → лише повідомлення про чернетку, без дубльованого нагадування
- [ ] run tests - must pass before next task

### Task 6: Web Push бекенд — VAPID, WebPushSender

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/services/push.py`
- Modify: `backend/app/services/notify.py`
- Modify: `backend/app/routers/settings.py`
- Modify: `backend/tests/test_notify.py`
- Modify: `backend/tests/test_acceptance.py`
- Create: `backend/tests/test_push.py`

- [ ] додати `pywebpush` у `backend/requirements.txt`
- [ ] `push.py`: генерація VAPID-пари при першому вмиканні, збереження в окремому `Setting`-ключі, читання публічного ключа
- [ ] `WebPushSender` (протокол `NotificationSender`): відправка на всі підписки, 404/410 → видалення підписки, помилка однієї підписки не блокує інші
- [ ] змінити сигнатуру на `build_senders(settings, session)` і оновити обидва call sites: `run_daily_notifications` (notify.py) та `test_notification` (routers/settings.py); інтегрувати push при `push.enabled`
- [ ] оновити наявні тести, що патчать `app.routers.settings.build_senders` (`test_acceptance.py`, `test_notify.py`), під нову сигнатуру
- [ ] write tests (мок pywebpush): успішна відправка, 410 → підписка видалена, часткова помилка, генерація/повторне використання VAPID
- [ ] run tests - must pass before next task

### Task 7: API push-підписок

**Files:**
- Create: `backend/app/routers/push.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_push.py`

- [ ] `GET /api/push/public-key` (генерує VAPID за потреби)
- [ ] `POST /api/push/subscriptions` (upsert за endpoint) і `DELETE /api/push/subscriptions` (за endpoint)
- [ ] Pydantic-схеми підписки; зареєструвати router у `main.py` (з auth, як інші routers)
- [ ] write tests: підписка/повторна підписка/відписка, неавторизований доступ
- [ ] run tests - must pass before next task

### Task 8: Endpoint GET /api/billing/upcoming

**Files:**
- Create: `backend/app/routers/billing.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_billing_schedule.py`

- [ ] тонка обгортка над `compute_billing_schedule`: квартира, орендар, дата виставлення, статус рахунка за period; горизонт 30 днів, сортування за датою
- [ ] Pydantic-схема відповіді; реєстрація router у `main.py`
- [ ] write tests: сортування, горизонт, статуси (немає/чернетка/виставлено/оплачено), порожній результат
- [ ] run tests - must pass before next task

### Task 9: Override дня виставлення в картці орендаря (end-to-end)

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/tenants.py`
- Modify: `backend/tests/test_tenants.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/TenantSection.tsx`
- Modify: `frontend/src/components/TenantSection.test.tsx`

- [ ] додати `billing_day` (optional, 1–31) у tenant-схеми та create/update у router; додати поле в `TenantPayload` у `frontend/src/api/client.ts`
- [ ] поле «День виставлення рахунку» у формі орендаря з підказкою «порожнє = день підписання договору»
- [ ] write backend tests: збереження/очищення override, валідація меж (0, 32)
- [ ] write frontend tests: введення/очищення поля, відображення значення
- [ ] run tests (backend + frontend) - must pass before next task

### Task 10: Налаштування у Settings.tsx — блоки «Виставлення рахунків» і «Push»

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/api/client.ts` (тип `NotificationSettings` + клієнтські функції push)
- Modify: `frontend/src/pages/Settings.test.tsx`

- [ ] розширити TypeScript-тип `NotificationSettings` полями `billing_reminder` і `push` у `client.ts`
- [ ] блок «Виставлення рахунків»: enabled, days_before, repeat_every_days, auto_draft (токени `theme.css`)
- [ ] блок «Push»: глобальний перемикач каналу + кнопка «Підписати цей пристрій» зі статусом підписки цього пристрою
- [ ] write tests: збереження нових полів, валідація, стани підписки (мок API)
- [ ] run tests - must pass before next task

### Task 11: PWA — маніфест, service worker, флоу підписки

**Files:**
- Create: `frontend/public/manifest.webmanifest`
- Create: `frontend/public/sw.js`
- Modify: `frontend/index.html`
- Create: `frontend/src/utils/push.ts`
- Modify: `frontend/src/pages/Settings.tsx`
- Create: `frontend/src/utils/push.test.ts`

- [ ] маніфест (назва, іконки, display standalone) + link в `index.html`
- [ ] `sw.js`: обробники `push` → `showNotification` і `notificationclick` → відкриття застосунку; без кешування
- [ ] `push.ts`: реєстрація SW, запит дозволу, `pushManager.subscribe` з публічним VAPID-ключем, POST/DELETE підписки, визначення статусу пристрою
- [ ] підключити `push.ts` до кнопки підписки в Settings
- [ ] write tests: `push.ts` з моками `navigator.serviceWorker`/`pushManager` (успіх, відмова дозволу, відписка)
- [ ] run tests - must pass before next task

### Task 12: Dashboard-віджет «Найближчі виставлення»

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/api/client.ts` (клієнт `GET /api/billing/upcoming`)
- Modify: `frontend/src/pages/Dashboard.test.tsx`

- [ ] таблиця: квартира, орендар, дата, статус рахунка; сортування за датою, горизонт 30 днів
- [ ] підсвітка рядків без рахунка після дати виставлення (warning-токен `theme.css`); клік → сторінка квартири/рахунка
- [ ] write tests: рендер, сортування, підсвітка проблемних, порожній стан, помилка API
- [ ] run tests - must pass before next task

### Task 13: Документація і ChangeLog

**Files:**
- Modify: `docs/deploy.md`
- Modify: `ChangeLog.md`

- [ ] примітка в `docs/deploy.md`: HTTPS-передумова для Web Push (Synology reverse proxy), поведінка iOS (PWA на головний екран)
- [ ] звірити, що `ChangeLog.md` має записи за всі виконані цикли (самі записи створюються по ходу — див. Development Approach)
- [ ] run tests (повний прогін для фіксації стану) - must pass before next task

### Task 14: Verify acceptance criteria
- [ ] verify all requirements from Overview are implemented
- [ ] verify edge cases are handled (обрізання дня, межі договору, fallback-и, мертві підписки)
- [ ] run full test suite: `docker compose -f docker/docker-compose.dev.yml run --rm backend pytest` і `docker compose -f docker/docker-compose.dev.yml run --rm frontend npm test -- --run`
- [ ] production build frontend успішний (`npm run build` у Docker)
- [ ] verify test coverage meets project standard

### Task 15: [Final] Update documentation
- [ ] update README.md if needed
- [ ] update CLAUDE.md if new patterns discovered
- [ ] move this plan to `docs/plans/completed/`

## Post-Completion
*Items requiring manual intervention or external systems - no checkboxes, informational only*

**Manual verification:**
- ручна перевірка підписки push у dev (`docker/docker-compose.dev.yml`, localhost = secure context) і тестове повідомлення на всі три канали
- перевірка на телефоні: Android (браузер/PWA) та iOS ≥ 16.4 (PWA на головному екрані)

**External system updates:**
- HTTPS-сертифікат на Synology reverse proxy — передумова для push у production
- production-деплой за `docs/deploy.md`: `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`; Alembic-міграції застосуються автоматично на старті; один Uvicorn worker зберігається
