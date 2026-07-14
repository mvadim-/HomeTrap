# HomeTrap — портал орендодавця (MVP)

## Overview

Портал для обліку квартир, комунальних платежів і виставлення рахунків орендарям.
Замінює Google Sheets «Оренда_Комунальні платежі» (вкладка на місяць: показники
лічильників × тариф + фіксовані послуги + оренда в USD × курс НБУ).

Розв'язувані проблеми:
- ручне копіювання показників з місяця в місяць;
- ручний пошук чинного тарифу та курсу;
- відсутність статистики по квартирі й портфелю;
- відсутність нагадувань про показники та неоплачені рахунки.

Затверджений UI-макет: https://claude.ai/code/artifact/75fc7149-2db9-4890-93cf-479efc13f4b2
(пастельні тони, шавлієвий акцент, світла + темна тема; екрани: Дашборд, Квартири,
картка квартири, Новий рахунок із живим перерахунком, Рахунки, Статистика).

## Context (from discovery)

- Репозиторій порожній: лише `CLAUDE.md` і `.gitignore` — проєкт з нуля.
- Структура даних підтверджена аналізом реальної таблиці (27 вкладок, кві 2024 — чер 2026).
- Рішення з брейншторму: FastAPI + React (Vite), SQLite, моноліт в одному Docker-контейнері,
  APScheduler усередині процесу; деплой на Synology NAS 723+ (Docker), згодом домен
  hometrap.pp.ua через Synology reverse proxy + Let's Encrypt.
- Майбутнє (закласти, НЕ реалізовувати): read-only токенізовані посилання для орендарів,
  подання показників орендарем.
- План пройшов авто-рев'ю (plan-review agent, 2026-07-14): критичні знахідки враховано
  (залежності тестів/upload, розбивка густих тасків, SPA-fallback, таймзона scheduler,
  реальна фікстура імпорту, Decimal-серіалізація).

## Development Approach

- **testing approach**: Regular (спочатку код, потім тести в межах того ж таска)
- завершувати кожен таск повністю перед переходом до наступного
- малі сфокусовані зміни
- **CRITICAL: кожен таск МУСИТЬ включати нові/оновлені тести** для зміненого коду
  - тести не опціональні — це обов'язкова частина чекліста
  - unit-тести для нових і змінених функцій, success + error сценарії
- **CRITICAL: усі тести мають проходити перед початком наступного таска** — без винятків
- **CRITICAL: оновлювати цей план при зміні скоупу під час реалізації**
- тести й розробка — через Docker (вимога CLAUDE.md)
- кожен завершений таск = запис у `ChangeLog.md` + окремий коміт

## Testing Strategy

- **unit-тести (backend)**: pytest + pytest-asyncio (`asyncio_mode = "auto"`) + httpx
  AsyncClient, тимчасова SQLite на кожен тест;
  запуск: `docker compose run --rm backend pytest`
- **unit-тести (frontend)**: Vitest + React Testing Library для компонентів із логікою
  (живий перерахунок рахунку); запуск: `docker compose run --rm frontend npm test`
- **e2e**: у MVP відсутні (нема наявної інфраструктури; додамо Playwright окремим циклом
  після MVP, якщо буде потреба)

## Progress Tracking

- позначати виконані пункти `[x]` одразу після завершення
- нові виявлені задачі — з префіксом ➕
- проблеми/блокери — з префіксом ⚠️
- тримати план синхронним із фактичною роботою

## Solution Overview

Моноліт в одному контейнері: FastAPI віддає `/api/*` і статику React зі збірки Vite
(з SPA-fallback: невідомі не-`/api` шляхи → `index.html`). SQLite-файл на volume
(простий бекап копіюванням). APScheduler у тому ж процесі (таймзона `Europe/Kyiv`,
прод — строго один uvicorn-воркер, щоб не дублювати задачі): щоденне оновлення курсу
НБУ та розсилка нагадувань (Telegram Bot API + SMTP).

Ключові рішення:
- **Тарифи з історією**: `Tariff(service_id, value, valid_from)`; для періоду рахунку
  береться тариф з найпізнішою `valid_from <= перше число періоду`.
- **Snapshot у рахунку**: `InvoiceLine` фіксує тариф і показники, `Invoice` — курс;
  подальші зміни довідників не впливають на виставлені рахунки.
- **Життєвий цикл**: `draft → issued → paid`; редагування лише в `draft`;
  `issued → draft` дозволено, `paid` — фінальний (можна зняти позначку оплати).
- **Валідація — м'які попередження** (не блокують): поточний показник < попереднього;
  споживання відхиляється від середнього за останні 6 місяців понад 50 %.
- **Курс НБУ**: https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange
  (valcode=USD, date, json); кеш у `ExchangeRate`; поле курсу в рахунку редаговане.
- **Гроші в API**: Decimal усередині, у JSON — рядком (Pydantic serializer), щоб фронтенд
  і бекенд збігалися до копійки.

## Technical Details

Структура репозиторію:

```
backend/
  app/
    main.py            # app factory, статика + SPA-fallback, роутери
    config.py          # налаштування з env
    db.py              # engine, session
    models.py          # SQLAlchemy-моделі
    schemas.py         # Pydantic-схеми (Decimal → str)
    auth.py            # сесії, login/logout, rate limit
    routers/           # apartments, services, tariffs, invoices, stats, settings, import
    services/          # billing.py, nbu.py, importer.py, notify.py, scheduler.py
  alembic/             # міграції
  tests/
frontend/
  src/                 # React + Vite, дизайн-токени з макета
docker/
  Dockerfile           # multi-stage: frontend build → backend runtime
  docker-compose.yml       # prod (Synology)
  docker-compose.dev.yml   # dev: hot-reload backend + frontend
docs/
  plans/
  deploy.md
```

Моделі даних (SQLite):
- `Apartment`: id, name, address, rent_amount (Decimal), rent_currency (default USD), notes, is_active
- `Service`: id, apartment_id, name, kind (`metered`/`fixed`), unit, provider_account, sort_order, is_active
- `Tariff`: id, service_id, value (Decimal), valid_from (date)
- `Invoice`: id, apartment_id, period (date, перше число місяця), status (`draft`/`issued`/`paid`),
  issued_at, paid_at, exchange_rate (Decimal), rent_amount_usd, rent_amount_uah,
  utilities_total, grand_total; unique (apartment_id, period)
- `InvoiceLine`: id, invoice_id, service_id, service_name, prev_reading, curr_reading,
  consumed, tariff_value, amount
- `ExchangeRate`: date, currency, rate (unique date+currency)
- `User`: id, username, password_hash (bcrypt)
- `Setting`: key, value (JSON) — telegram token/chat_id, SMTP, день нагадування,
  N днів до нагадування про неоплату

Грошові значення: Decimal, округлення до копійок (ROUND_HALF_UP) на рівні рядка й підсумків;
у JSON-відповідях — рядком.

## What Goes Where

- **Implementation Steps** (чекбокси): код, тести, документація в цьому репозиторії
- **Post-Completion** (без чекбоксів): реєстрація домену, налаштування Synology,
  створення Telegram-бота, ручна перевірка на NAS

## Implementation Steps

### Task 1: Каркас backend + Docker для розробки

**Files:**
- Create: `backend/app/main.py`, `backend/app/config.py`, `backend/requirements.txt`
- Create: `docker/Dockerfile`, `docker/docker-compose.dev.yml`
- Create: `backend/tests/test_health.py`
- Modify: `ChangeLog.md`

- [x] FastAPI app factory з `/api/health`; конфіг з env (шлях до БД, secret, debug)
- [x] `requirements.txt`: fastapi, uvicorn, sqlalchemy, alembic, pydantic-settings, httpx, apscheduler, bcrypt, openpyxl, python-multipart, pytest, pytest-asyncio, ruff
- [x] конфіг pytest: `asyncio_mode = "auto"`; dev-контейнер backend з hot-reload (uvicorn --reload, volume з кодом)
- [x] написати тест: `/api/health` повертає 200 і версію
- [x] прогнати тести в Docker — мають пройти перед таском 2

### Task 2: Моделі БД та міграції Alembic

**Files:**
- Create: `backend/app/db.py`, `backend/app/models.py`, `backend/alembic/*`
- Create: `backend/tests/test_models.py`

- [x] SQLAlchemy-моделі всіх сутностей з Technical Details (включно з unique-обмеженнями)
- [x] ініціалізувати Alembic, перша міграція, автозастосування міграцій на старті застосунку
- [x] фікстура pytest: тимчасова SQLite + сесія на кожен тест
- [x] тести: створення сутностей, каскад apartment→services→tariffs, unique (apartment, period)
- [x] тест вибору тарифу за датою: valid_from ≤ періоду, найпізніший
- [x] прогнати тести — мають пройти перед таском 3

### Task 3: Автентифікація адміна

**Files:**
- Create: `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/tests/test_auth.py`
- Modify: `backend/app/main.py`, `backend/app/config.py`

- [x] створення адміна з env (ADMIN_USERNAME/ADMIN_PASSWORD) при першому старті, bcrypt-хеш
- [x] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (під `require_auth`); підписана HttpOnly session cookie
- [x] залежність `require_auth` для всіх приватних роутерів
- [x] rate limit на login (проста in-memory: 5 спроб / 15 хв з IP)
- [x] тести: успішний вхід, хибний пароль, `GET /api/auth/me` без cookie → 401, rate limit → 429
- [x] прогнати тести — мають пройти перед таском 4

### Task 4: CRUD квартир, послуг і тарифів

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/routers/apartments.py`, `backend/app/routers/services.py`
- Create: `backend/tests/test_apartments.py`
- Modify: `backend/app/main.py`

- [x] базові Pydantic-схеми зі спільним серіалізатором Decimal → рядок (використовується всіма наступними роутерами)
- [x] CRUD `/api/apartments` (список з підсумками останнього рахунку, створення, редагування, архівація)
- [x] CRUD `/api/apartments/{id}/services` + сортування; заборона видалення послуги з рядками рахунків (тільки деактивація)
- [x] тарифи: `GET/POST /api/services/{id}/tariffs` (нове значення = новий запис із valid_from)
- [x] тести: CRUD-сценарії, помилки (404, дубль тарифу на ту саму дату), гроші в JSON — рядком
- [x] прогнати тести — мають пройти перед таском 5

### Task 5: Курс НБУ — клієнт, кеш, щоденне оновлення

**Files:**
- Create: `backend/app/services/nbu.py`, `backend/app/services/scheduler.py`
- Create: `backend/tests/test_nbu.py`
- Modify: `backend/app/main.py`

- [x] клієнт API НБУ (httpx): курс USD на дату; збереження в `ExchangeRate`
- [x] `get_rate(date)`: кеш → API → fallback на останній відомий курс із позначкою дати
- [x] APScheduler: старт разом із застосунком, таймзона `Europe/Kyiv`, щоденна задача оновлення курсу
- [x] `GET /api/rates/current` для чипа в шапці UI
- [x] тести з mock HTTP: свіжий курс, недоступний НБУ → fallback, кешування
- [x] прогнати тести — мають пройти перед таском 6

### Task 6: Рахунки — чернетка, перерахунок, попередження

**Files:**
- Create: `backend/app/services/billing.py`, `backend/app/routers/invoices.py`
- Create: `backend/tests/test_billing.py`
- Modify: `backend/app/main.py`

- [x] `POST /api/apartments/{id}/invoices` — чернетка за період: рядки з активних послуг, попередні показники з попереднього рахунку, тарифи чинні для періоду, курс НБУ
- [x] `PUT /api/invoices/{id}` (тільки draft; для issued → 409): поточні показники, курс; перерахунок сум (Decimal, копійки)
- [x] відповідь з м'якими попередженнями: показник менший за попередній; відхилення від середнього за 6 міс > 50 %
- [x] тести розрахунків: приклад із реальної таблиці (газ 22×7,95689=175,05; разом 2 210,51 + оренда 325×44,68=14 521 → 16 731,51), перший рахунок без історії, перенесення показників, тариф зі зміною посеред історії
- [x] тести попереджень: показник менший за попередній, аномальне споживання
- [x] прогнати тести — мають пройти перед таском 7

### Task 7: Рахунки — статуси та список

**Files:**
- Modify: `backend/app/services/billing.py`, `backend/app/routers/invoices.py`
- Create: `backend/tests/test_invoice_status.py`

- [x] переходи статусів: `issue` (snapshot тарифів/курсу, заборона редагування), `revert-to-draft`, `mark-paid`/`unmark-paid` з датою
- [x] `GET /api/invoices` — список з фільтрами по квартирі/статусу/періоду; `GET /api/invoices/{id}` — деталь з рядками
- [x] тести: повний життєвий цикл draft→issued→paid, заборонені переходи (PUT issued → 409, mark-paid для draft), фільтри списку
- [x] прогнати тести — мають пройти перед таском 8

### Task 8: Статистика

**Files:**
- Create: `backend/app/routers/stats.py`, `backend/tests/test_stats.py`
- Modify: `backend/app/main.py`

- [x] `GET /api/stats/consumption?apartment_id&months=12` — споживання по metered-послугах помісячно
- [x] `GET /api/stats/income?apartment_id|portfolio&months=12` — оренда/комуналка/разом помісячно + підсумки за період
- [x] `GET /api/stats/dashboard` — плитки дашборда: нараховано/оплачено за місяць, заборгованість, список «потребує уваги»
- [x] тести: агрегація на кількох рахунках, порожня історія, портфель із 2 квартир
- [x] прогнати тести — мають пройти перед таском 9

### Task 9: Імпорт історії з Google Sheets (XLSX)

**Files:**
- Create: `backend/app/services/importer.py`, `backend/app/routers/import_.py`
- Create: `backend/tests/test_importer.py`, `backend/tests/fixtures/sample_import.xlsx`

- [ ] парсер XLSX (openpyxl): вкладка «Загальна інформація» → послуги + тарифи з датами колонок; вкладки «<Місяць> <Рік>» → рахунки (показники, фіксовані суми, курс, оренда) зі статусом `paid`
- [ ] `POST /api/apartments/{id}/import` (upload файлу, python-multipart) + `dry_run=true` для попереднього перегляду
- [ ] звіт імпорту: створено N рахунків, пропущено/попередження (нечислові клітинки, розриви місяців)
- [ ] ідемпотентність: повторний імпорт не дублює наявні періоди (unique apartment+period)
- [ ] фікстура — анонімізований зріз РЕАЛЬНОГО експорту «Оренда_Комунальні платежі» (об'єднані клітинки, «7.95689грн.», прочерки «-»), не синтетика
- [ ] тести на фікстурі: повний імпорт, dry run, повторний імпорт, биті клітинки, об'єднані клітинки
- [ ] прогнати тести — мають пройти перед таском 10

### Task 10: Нагадування — Telegram + Email + налаштування

**Files:**
- Create: `backend/app/services/notify.py`, `backend/app/routers/settings.py`
- Create: `backend/tests/test_notify.py`
- Modify: `backend/app/services/scheduler.py`

- [ ] відправники: Telegram Bot API (token + chat_id) і SMTP; кожен канал вмикається окремо
- [ ] правила (щоденна задача, `Europe/Kyiv`): у день X місяця — «зняти показники» по активних квартирах; issued-рахунок не оплачено ≥ N днів — нагадування з повтором кожні M днів
- [ ] `GET/PUT /api/settings` (збереження в `Setting`), `POST /api/settings/test-notification`
- [ ] тести з mock-відправниками: спрацювання правил, вимкнені канали, повтор без дублю в той самий день
- [ ] прогнати тести — мають пройти перед таском 11

### Task 11: Каркас frontend — Vite, токени дизайну, логін

**Files:**
- Create: `frontend/*` (Vite + React + TypeScript), `frontend/src/theme.css`, `frontend/src/api/client.ts`
- Create: `frontend/src/pages/Login.tsx`, `frontend/src/components/Layout.tsx`
- Modify: `docker/docker-compose.dev.yml`

- [ ] Vite + React + TypeScript + react-router; API-клієнт (fetch, обробка 401 → редірект на логін)
- [ ] дизайн-токени з макета (CSS custom properties, світла/темна тема), Layout: шапка, навігація, чип курсу НБУ
- [ ] сторінка логіна; захищені маршрути
- [ ] dev-контейнер frontend (vite dev server, proxy /api → backend); Vitest + RTL налаштовані
- [ ] тести: рендер Login, редірект неавтентифікованого користувача
- [ ] прогнати тести — мають пройти перед таском 12

### Task 12: Frontend — Дашборд і Квартири

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Apartments.tsx`, `frontend/src/pages/ApartmentDetail.tsx`

- [ ] Дашборд: плитки (нараховано, оплачено, заборгованість, курс), список квартир зі статусами, блок «потребує уваги» (з `/api/stats/dashboard`)
- [ ] Квартири: список; картка квартири: реквізити, оренда, послуги з тарифами й «діє з», форми додавання/редагування послуг і тарифів
- [ ] кнопка-заглушка «Посилання орендаря» (майбутня фіча, disabled із тултипом)
- [ ] тести: рендер дашборда з mock-даними, картка квартири з таблицею послуг
- [ ] прогнати тести — мають пройти перед таском 13

### Task 13: Frontend — Рахунки

**Files:**
- Create: `frontend/src/pages/Invoices.tsx`, `frontend/src/pages/InvoiceEdit.tsx`
- Create: `frontend/src/components/InvoiceCalculator.tsx`

- [ ] список рахунків: фільтри по квартирі/статусу, статусні плашки (чернетка/виставлений/оплачений/прострочений)
- [ ] створення/редагування чернетки: попередні показники read-only, введення поточних, живий перерахунок сум і підсумків, редагований курс, показ попереджень валідації
- [ ] дії: виставити, повернути в чернетку, позначити оплаченим (з датою)
- [ ] тести: InvoiceCalculator — перерахунок при зміні показника й курсу, показ попередження при показнику меншому за попередній
- [ ] прогнати тести — мають пройти перед таском 14

### Task 14: Frontend — Статистика

**Files:**
- Create: `frontend/src/pages/Stats.tsx`, `frontend/src/components/charts/*`

- [ ] графіки споживання: окремі міні-графіки газ/світло/вода (SVG, кольори й підписи з макета), тултіпи
- [ ] графік доходу: стек оренда+комуналка помісячно; перемикач квартира/портфель
- [ ] тести: рендер графіків з mock-даними, порожня історія без падіння
- [ ] прогнати тести — мають пройти перед таском 15

### Task 15: Frontend — Налаштування та імпорт

**Files:**
- Create: `frontend/src/pages/Settings.tsx`

- [ ] Налаштування: Telegram/SMTP/дні нагадувань, кнопка тест-повідомлення
- [ ] секція імпорту XLSX: upload, dry-run прев'ю, звіт імпорту з попередженнями
- [ ] тести: рендер форми налаштувань, показ звіту dry-run з mock-відповіді
- [ ] прогнати тести — мають пройти перед таском 16

### Task 16: Продакшн-збірка та деплой на Synology

**Files:**
- Modify: `docker/Dockerfile`
- Create: `docker/docker-compose.yml`, `docs/deploy.md`, `.env.example`

- [ ] multi-stage Dockerfile: стадія 1 — `npm run build` frontend; стадія 2 — python-slim + backend, статика копіюється й віддається FastAPI
- [ ] SPA-fallback: невідомі не-`/api` шляхи → `index.html` (перевірити прямий перехід на /invoices у проді)
- [ ] прод compose: один сервіс, **один uvicorn-воркер** (вимога APScheduler), volume для SQLite, порт, env із `.env`, healthcheck, restart unless-stopped
- [ ] `docs/deploy.md`: перший запуск на Synology (Container Manager), оновлення, бекап БД (копія файлу з volume), reverse proxy + Let's Encrypt для hometrap.pp.ua, примітка про один воркер
- [ ] перевірити повну збірку: `docker compose build` і смоук локально (логін, створення квартири, рахунок, refresh на /invoices)
- [ ] прогнати всі тести в Docker — мають пройти перед таском 17

### Task 17: Verify acceptance criteria

- [ ] пройти повний сценарій: логін → квартира → послуги/тарифи → імпорт XLSX → чернетка з перенесеними показниками → виставлення → оплата → статистика → нагадування (test-notification)
- [ ] перевірити крайні випадки: перший рахунок без історії, зміна тарифу посеред періоду історії, недоступний НБУ
- [ ] прогнати повний тест-сьют: `docker compose run --rm backend pytest && docker compose run --rm frontend npm test`
- [ ] звірити реалізоване з Overview і макетом

### Task 18: [Final] Update documentation

- [ ] створити `README.md`: що це, як запустити dev і prod, посилання на docs/deploy.md
- [ ] оновити `CLAUDE.md`, якщо з'явилися нові патерни проєкту
- [ ] фінальний запис у `ChangeLog.md`
- [ ] перемістити цей план у `docs/plans/completed/`

## Post-Completion

**Ручна перевірка:**
- розгортання на Synology NAS 723+ за `docs/deploy.md`, смоук на реальному NAS
- імпорт реального XLSX-експорту таблиці «Оренда_Комунальні платежі» та звірка сум із таблицею
- перевірка нагадувань на реальному Telegram-акаунті та поштовій скриньці

**Зовнішні системи:**
- створити Telegram-бота через @BotFather, отримати token і chat_id
- SMTP-акаунт для email-нагадувань (наприклад, Gmail app password)
- зареєструвати домен hometrap.pp.ua; налаштувати Synology reverse proxy + Let's Encrypt
- прокинути порт на роутері до NAS (якщо ще не зроблено)

**Майбутні ітерації (поза MVP):**
- read-only токенізовані посилання для орендарів (перегляд своїх рахунків)
- подання показників орендарем через посилання (з фото лічильника)
- історія орендарів (хто жив, застава), PDF-версія рахунку
