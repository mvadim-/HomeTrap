# Розгортання HomeTrap на Synology NAS

Production-конфігурація запускає frontend і FastAPI в одному контейнері. Uvicorn
працює рівно з одним worker, тому вбудований APScheduler не дублює фонові задачі.

## Перший запуск

1. Встановіть **Container Manager** у Package Center та скопіюйте репозиторій у
   окрему теку NAS, наприклад `/volume1/docker/hometrap`.
2. У корені репозиторію створіть локальний файл налаштувань:

   ```sh
   cp .env.example .env
   ```

3. Замініть усі `change-me` у `.env`: задайте довгий випадковий
   `HOMETRAP_SECRET_KEY` і надійний `ADMIN_PASSWORD`. Не додавайте `.env` до Git і
   не передавайте його разом із бекапами.
4. У Container Manager відкрийте **Project → Create**, виберіть теку репозиторію та
   файл `docker/docker-compose.yml`, потім виконайте build і запуск. Еквівалент у
   SSH-консолі:

   ```sh
   cd /volume1/docker/hometrap
   docker compose --env-file .env -f docker/docker-compose.yml up -d --build
   docker compose --env-file .env -f docker/docker-compose.yml ps
   ```

5. Дочекайтеся стану `healthy` і відкрийте `http://NAS_IP:8000`. Порт можна змінити
   через `HOMETRAP_PORT` у `.env`.

SQLite зберігається у `data/hometrap.db` поза контейнером. Каталог `data/` і `.env`
ігноруються Git.

## Оновлення

Перед оновленням зробіть бекап. Потім оновіть файли репозиторію і перебудуйте проєкт:

```sh
cd /volume1/docker/hometrap
git pull --ff-only
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
docker compose --env-file .env -f docker/docker-compose.yml ps
```

Міграції Alembic застосовуються автоматично під час старту. Не збільшуйте кількість
Uvicorn workers і не масштабуйте сервіс: APScheduler виконується в процесі застосунку.

## Бекап і відновлення SQLite

Щоб отримати узгоджену копію, коротко зупиніть контейнер перед копіюванням файлу:

```sh
cd /volume1/docker/hometrap
docker compose --env-file .env -f docker/docker-compose.yml stop hometrap
cp data/hometrap.db /volume1/backup/hometrap-$(date +%F-%H%M).db
docker compose --env-file .env -f docker/docker-compose.yml start hometrap
```

Зберігайте бекапи в окремій захищеній shared folder і налаштуйте її регулярне
резервування через Hyper Backup. Для відновлення зупиніть сервіс, збережіть поточний
файл окремо, скопіюйте обраний бекап у `data/hometrap.db`, потім запустіть сервіс.

## HTTPS для hometrap.pp.ua

1. Спрямуйте DNS-запис `A` домену `hometrap.pp.ua` на публічну IP-адресу NAS і
   налаштуйте на маршрутизаторі доступ до портів 80/443.
2. У **Control Panel → Security → Certificate** додайте сертифікат Let's Encrypt для
   `hometrap.pp.ua` і призначте його цьому домену.
3. У **Control Panel → Login Portal → Advanced → Reverse Proxy** створіть правило:
   HTTPS `hometrap.pp.ua:443` → HTTP `localhost:8000` (або значення
   `HOMETRAP_PORT`). Увімкніть перенаправлення HTTP на HTTPS.
4. Перевірте вхід, створення квартири й рахунку через HTTPS, а також пряме оновлення
   сторінки `https://hometrap.pp.ua/invoices`.

Не публікуйте порт 8000 у зовнішній мережі після налаштування reverse proxy;
обмежте його локально правилами firewall Synology.
