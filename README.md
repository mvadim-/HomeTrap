# HomeTrap

HomeTrap — самостійний портал для обліку оренди квартир: послуг і тарифів,
щомісячних рахунків, оплат, статистики, імпорту історії з XLSX та нагадувань через
Telegram або email. Backend побудований на FastAPI і SQLite, frontend — на React і
Vite; production-образ віддає їх як один застосунок.

## Швидкий запуск

Потрібен лише запущений Docker. Одна команда збере контейнери, запустить HomeTrap і
дочекається готовності backend та frontend:

```sh
./start.sh
```

Після запуску відкрийте <http://localhost:5173> і увійдіть як `admin` / `admin`.
Це локальні dev-credentials; для production використовуйте окрему конфігурацію з
розділу нижче.

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

Production Python-залежності зафіксовані точними версіями у
`backend/requirements.txt`, а test/lint-залежності відокремлені у
`backend/requirements-dev.txt`. Dev Compose збирає лише backend-dev target без
production-збірки frontend; Vite працює окремим сервісом.

## Орендарі та файли контрактів

На сторінці квартири можна додати активного орендаря, зберегти телефон, email,
дати й примітки, завершити контракт і переглянути історію попередніх орендарів.
Одночасно квартира може мати лише один активний контракт.

До активного контракту можна завантажити до 10 приватних вкладень за один запит у
форматах JPEG, PNG, WebP або PDF розміром до 10 МБ кожне, переглянути чи видалити їх
після входу. Метадані зберігаються у SQLite, а файли — у `/data/uploads` контейнера.
Dev Compose зберігає весь `/data` у named volume `hometrap-data`; production Compose
монтує його з хостового `data/`, тому production backup має охоплювати весь `data/`.

## Статистика

На сторінці «Статистика» можна вибрати орендаря, автоматично застосувати період
його договору, побачити початки договорів і простій квартири; вибрані фільтри
зберігаються в URL.

## Production

Створіть локальну конфігурацію та замініть усі значення `change-me` на надійні
секрети. Файл `.env` не можна додавати до Git.

```sh
cp .env.example .env
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
docker compose --env-file .env -f docker/docker-compose.yml ps
```

Порт за замовчуванням — <http://localhost:8000>, SQLite і файли контрактів
зберігаються у `data/`. Production-сервіс має працювати з одним Uvicorn worker,
щоб APScheduler не дублював фонові задачі.

Повна інструкція для Synology Container Manager, HTTPS, оновлень і резервного
копіювання: [docs/deploy.md](docs/deploy.md).
