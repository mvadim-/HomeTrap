# Розгортання HomeTrap на Synology NAS

Production-конфігурація запускає frontend і FastAPI в одному контейнері. Uvicorn
працює рівно з одним worker, тому вбудований APScheduler не дублює фонові задачі.
Python runtime-залежності образу зафіксовані точними версіями у
`backend/requirements.txt`; dev/test інструменти у production-образ не входять.

## Перший запуск

1. Встановіть **Container Manager** у Package Center та скопіюйте репозиторій у
   окрему теку NAS, наприклад `/volume1/docker/hometrap`.
2. У корені репозиторію створіть локальний файл налаштувань:

   ```sh
   cp .env.example .env
   ```

3. Замініть усі `change-me` у `.env`: задайте довгий випадковий
   `HOMETRAP_SECRET_KEY` і надійний `ADMIN_PASSWORD`. Не додавайте `.env` до Git і
   не передавайте його разом із бекапами. У production застосунок на старті
   **перевіряє** ці значення і **аварійно завершується**, якщо вони слабкі:

   - `HOMETRAP_SECRET_KEY` — щонайменше 32 символи, унікальний, без підрядка
     `change-me`. Згенерувати: `openssl rand -hex 32`.
   - `ADMIN_PASSWORD` — щонайменше 12 символів, без підрядка `change-me`.
     Згенерувати: `openssl rand -hex 12`.
   `ADMIN_PASSWORD` використовується лише під час створення першого адміністратора:
   подальша зміна змінної не оновлює bcrypt-хеш у БД. Для ротації спершу зробіть
   бекап, зупиніть сервіс і виконайте одноразову команду (пароль не зберігається в
   shell history):

   ```sh
   read -s NEW_ADMIN_PASSWORD && export NEW_ADMIN_PASSWORD
   docker compose --env-file .env -f docker/docker-compose.yml stop hometrap
   docker compose --env-file .env -f docker/docker-compose.yml run --rm -e NEW_ADMIN_PASSWORD hometrap python -c 'import os; from sqlalchemy import select; from app.auth import hash_password; from app.config import get_settings; from app.db import create_database_engine, create_session_factory; from app.models import User; engine=create_database_engine(get_settings().database_path); session=create_session_factory(engine)(); user=session.scalar(select(User).order_by(User.id)); user.password_hash=hash_password(os.environ["NEW_ADMIN_PASSWORD"]); session.commit(); session.close(); engine.dispose()'
   unset NEW_ADMIN_PASSWORD
   docker compose --env-file .env -f docker/docker-compose.yml start hometrap
   ```
4. **Створіть теку `data/`** у корені проєкту (`mkdir -p data` через SSH або через
   File Station): вона в `.gitignore` й не потрапляє у клон, а Docker на Synology
   не створює відсутнє джерело bind-mount, тож без неї запуск падає з
   `Bind mount failed: ... /data does not exist`. Потім у Container Manager
   відкрийте **Project → Create**, виберіть теку репозиторію та файл
   `docker/docker-compose.yml` і виконайте build і запуск. Еквівалент у SSH-консолі:

   ```sh
   cd /volume1/docker/hometrap
   mkdir -p data
   docker compose --env-file .env -f docker/docker-compose.yml up -d --build
   docker compose --env-file .env -f docker/docker-compose.yml ps
   ```

5. Дочекайтеся стану `healthy`, налаштуйте HTTPS
   reverse proxy за розділом нижче й лише тоді входьте через `https://hometrap.pp.ua`.
   Production cookie має атрибут `Secure`, тому вхід через прямий HTTP не працює.
   За замовчуванням порт прив'язаний лише до `127.0.0.1`, тому перевіряйте health
   endpoint із самого NAS через `http://127.0.0.1:8000/api/health`. Порт можна
   змінити через `HOMETRAP_PORT` у `.env`.

SQLite зберігається у `data/hometrap.db`, а файли контрактів — у `data/uploads` поза
контейнером. Увесь каталог `data/` підключений до `/data` наявним Docker volume,
тому база й завантажені файли зберігаються між перебудовами. Каталог `data/` і
`.env` ігноруються Git.

## Оновлення

Перед кожним оновленням зробіть **ручний DR-архів усього каталогу `data/`** за
процедурою нижче. In-app ZIP для відкату оновлення недостатній: його відновлення
лише додає відсутні записи, не повертає попередній стан, а після Alembic-міграції
архів із попередньою ревізією буде відхилений. Лише після ручного архівування
оновіть файли репозиторію і перебудуйте проєкт:

```sh
cd /volume1/docker/hometrap
git pull --ff-only
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
docker compose --env-file .env -f docker/docker-compose.yml ps
```

Ці кроки (pull → бекап `data/` перед міграціями → rebuild+restart → очікування
healthy → ротація бекапів) автоматизує скрипт
[`synology-update.sh`](../synology-update.sh) у корені репозиторію:
`sh synology-update.sh` (або `SUDO=sudo sh synology-update.sh`, якщо docker
потребує root).

Команда `up -d --build` перебудовує production-образ із backend і frontend та
перезапускає контейнер. Міграції Alembic, включно з таблицею Push-підписок і днем
виставлення орендаря та стабільними ключами backup/restore для квартир і послуг,
застосовуються автоматично під час старту; окрема команда міграції не потрібна.
Не збільшуйте кількість Uvicorn workers і не масштабуйте сервіс: APScheduler
виконується в процесі застосунку.

## Бекап і відновлення даних

Після входу адміністратор може відкрити **Налаштування → Бекап і відновлення** та
завантажити ZIP зі знімком SQLite, файлами контрактів і manifest. Застосунок створює
узгоджений знімок без зупинки сервісу.

Завантаження ZIP у цій самій секції запускає **недеструктивний імпорт**, а не відкат:
HomeTrap додає лише відсутні квартири, послуги, тарифи, орендарів, вкладення,
рахунки й курси валют за їхніми бізнес-ключами. Наявні записи не змінюються і не
видаляються, а користувачі, налаштування та Push-підписки не імпортуються. Архів з
іншою ревізією схеми або пошкодженим знімком буде відхилено. Імпорт не перезапускає
контейнер; після завершення сторінкою можна користуватися далі.

Архіви мають захисні квоти (128 MiB upload, 5000 ZIP-членів, 256 MiB після
розпакування). HomeTrap створює ZIP без стиснення та перевіряє його за цими самими
квотами до завантаження, тому виданий застосунком архів завжди сумісний з імпортом.
Якщо накопичені дані вже перевищують квоту, endpoint бекапу поверне зрозумілу
помилку; для такого обсягу використайте ручний архів усього `data/` нижче.

In-app бекап містить SQLite з Telegram token, SMTP credentials, приватним
VAPID-ключем і Push endpoint/key material пристроїв у відкритому вигляді, а також
приватні файли контрактів. Вважайте кожен бекап секретом: обмежте ACL та
використовуйте шифроване сховище Hyper Backup.

Для повного аварійного відновлення або відкату стану й надалі використовуйте ручний
архів усього каталогу `data/`. На відміну від in-app імпорту, ця процедура повністю
замінює поточну БД і файли, тому потребує короткої зупинки контейнера:

```sh
cd /volume1/docker/hometrap
docker compose --env-file .env -f docker/docker-compose.yml stop hometrap
tar -czf /volume1/backup/hometrap-$(date +%F-%H%M).tar.gz data
docker compose --env-file .env -f docker/docker-compose.yml start hometrap
```

Перед ручним відновленням збережіть поточний каталог `data/` окремо, відновіть із
вибраного архіву одночасно `data/hometrap.db` і `data/uploads`, потім запустіть
сервіс. Втрата або заміна VAPID-стану в SQLite вимагає повторної Push-підписки всіх
пристроїв.

## HTTPS для hometrap.pp.ua

HTTPS є обов'язковою передумовою для service worker і Web Push (виняток браузерів —
лише `localhost`). Тому Push у production потрібно перевіряти через Synology reverse
proxy за публічною HTTPS-адресою, а не через прямий HTTP-порт контейнера.

1. Спрямуйте DNS-запис `A` домену `hometrap.pp.ua` на публічну IP-адресу NAS і
   налаштуйте на маршрутизаторі доступ до портів 80/443.
2. У **Control Panel → Security → Certificate** додайте сертифікат Let's Encrypt для
   `hometrap.pp.ua` і призначте його цьому домену.
3. У **Control Panel → Login Portal → Advanced → Reverse Proxy** створіть правило:
   HTTPS `hometrap.pp.ua:443` → HTTP `localhost:8000` (або значення
   `HOMETRAP_PORT`). Увімкніть перенаправлення HTTP на HTTPS.
4. Визначте адресу Docker gateway, через яку Synology proxy входить у контейнер,
   і додайте її як один точний CIDR `/32` у `.env`:

   ```sh
   CONTAINER_ID=$(docker compose --env-file .env -f docker/docker-compose.yml ps -q hometrap)
   docker inspect "$CONTAINER_ID" --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'
   # приклад результату: 172.18.0.1 → HOMETRAP_TRUSTED_PROXY_CIDRS=172.18.0.1/32
   docker compose --env-file .env -f docker/docker-compose.yml up -d --force-recreate
   ```

   HomeTrap довіряє `X-Forwarded-For` лише від цих безпосередніх proxy-адрес.
   Не використовуйте широкі мережі на кшталт `0.0.0.0/0`: це дозволить підробляти
   IP і обходити rate limit входу.
5. Перевірте вхід, створення квартири й рахунку через HTTPS, пряме оновлення
   сторінки `https://hometrap.pp.ua/invoices`, доступність `/manifest.webmanifest`
   і `/sw.js`, а потім підписку пристрою на Push у налаштуваннях HomeTrap.

На iPhone/iPad з iOS/iPadOS 16.4 або новішою відкрийте HomeTrap у Safari, виберіть
**Поділитися → На початковий екран**, запустіть встановлену PWA з іконки й лише
тоді ввімкніть Push у налаштуваннях. Web Push для звичайної вкладки Safari на iOS
не використовується; старіші версії iOS/iPadOS його не підтримують.

Не змінюйте `HOMETRAP_BIND_ADDRESS=127.0.0.1`: це залишає порт 8000 доступним
Synology reverse proxy через `localhost`, але не публікує HTTP API у мережі.
