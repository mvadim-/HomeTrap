# ChangeLog

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

## [2026-07-16 14:20] Моделі орендарів і вкладень контракту

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
