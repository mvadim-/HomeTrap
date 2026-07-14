# ChangeLog

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
