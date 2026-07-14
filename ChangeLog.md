# ChangeLog

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
