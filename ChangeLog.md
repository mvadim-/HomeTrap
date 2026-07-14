# ChangeLog

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
