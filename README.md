# HomeTrap

HomeTrap — самостійний портал для обліку оренди квартир: послуг і тарифів,
щомісячних рахунків, оплат, статистики, імпорту історії з XLSX та нагадувань через
Telegram або email. Backend побудований на FastAPI і SQLite, frontend — на React і
Vite; production-образ віддає їх як один застосунок.

## Розробка

Потрібен Docker із Compose. Запустіть backend із hot reload та Vite dev server:

```sh
docker compose -f docker/docker-compose.dev.yml up --build
```

Frontend буде доступний на <http://localhost:5173>, backend health endpoint — на
<http://localhost:8000/api/health>. Для локального dev-середовища створюється
користувач `admin` із паролем `admin`; ці значення задані лише у dev Compose і не
призначені для production. Зупинка середовища:

```sh
docker compose -f docker/docker-compose.dev.yml down
```

Тести й lint також запускаються тільки в Docker:

```sh
docker compose -f docker/docker-compose.dev.yml run --rm backend pytest
docker compose -f docker/docker-compose.dev.yml run --rm backend ruff check .
docker compose -f docker/docker-compose.dev.yml run --rm frontend npm test
docker compose -f docker/docker-compose.dev.yml run --rm frontend npm run build
```

## Production

Створіть локальну конфігурацію та замініть усі значення `change-me` на надійні
секрети. Файл `.env` не можна додавати до Git.

```sh
cp .env.example .env
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
docker compose --env-file .env -f docker/docker-compose.yml ps
```

Порт за замовчуванням — <http://localhost:8000>, SQLite зберігається у `data/`.
Production-сервіс має працювати з одним Uvicorn worker, щоб APScheduler не дублював
фонові задачі.

Повна інструкція для Synology Container Manager, HTTPS, оновлень і резервного
копіювання: [docs/deploy.md](docs/deploy.md).
