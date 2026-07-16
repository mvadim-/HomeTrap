# HomeTrap — виправлення розривів із макетом: орендарі та статистика

## Overview

Порівняння затвердженого макета (https://claude.ai/code/artifact/994b65dd-24a0-4afb-94b6-212040432bfc)
з реалізацією в `main` виявило пропущений функціонал. Мета циклу:

1. **Орендарі**: дані орендаря (ПІБ, телефон, email) на квартирі; історія орендарів —
   новий орендар додається після завершення контракту попереднього; прикріплення
   кількох файлів контракту (фото/PDF) для перегляду.
2. **Статистика**: вибір діапазону (пресети 6/12/24 міс/весь час + довільний період
   по місяцях) і саммарі-тайли з макета («Оренда за період», «Комунальні за період»,
   «Найбільша стаття · пік споживання»).
3. **Дрібні розриви з макетом**: ім'я орендаря у списку квартир і на дашборді;
   підписи сум над стовпчиками графіка доходу.

## Context (from discovery)

- `backend/app/models.py` — сутностей орендаря немає взагалі; треба нові таблиці.
- `backend/app/routers/stats.py` — параметр `months` (1–120) уже підтримується обома
  ендпоінтами; довільного періоду і саммарі немає.
- `frontend/src/pages/Stats.tsx` — жорсткі 12 місяців, без перемикача періоду і тайлів;
  графік доходу без підписів над стовпчиками (лише тултіпи).
- `frontend/src/pages/ApartmentDetail.tsx` — лише disabled-кнопка «Посилання орендаря»;
  блоку орендаря немає.
- Інфраструктура завантажень: є тільки XLSX-імпорт (python-multipart уже в залежностях);
  роздачі приватних файлів немає — потрібні сховище на волюмі та ендпоінт з автентифікацією.
- Патерни: роутери з `Depends(require_auth)`, Decimal → str у схемах, Alembic-міграції
  автозастосовуються на старті, тести pytest (Docker) + Vitest.

## Development Approach

- **testing approach**: Regular (спочатку код, потім тести в межах того ж таска)
- завершувати кожен таск повністю перед переходом до наступного
- малі сфокусовані зміни; зворотна сумісність наявних API
- **CRITICAL: кожен таск МУСИТЬ включати нові/оновлені тести** (success + error)
- **CRITICAL: усі тести мають проходити перед початком наступного таска**
- **CRITICAL: оновлювати цей план при зміні скоупу під час реалізації**
- розробка й тести — через Docker (вимога CLAUDE.md)
- кожен завершений таск = запис у `ChangeLog.md` + окремий коміт

## Testing Strategy

- **unit-тести (backend)**: pytest, `docker compose -f docker/docker-compose.dev.yml run --rm backend pytest`
- **unit-тести (frontend)**: Vitest + RTL, `docker compose -f docker/docker-compose.dev.yml run --rm frontend npm test`
- **e2e**: відсутні в проєкті — не додаємо в цьому циклі

## Progress Tracking

- позначати виконані пункти `[x]` одразу після завершення
- нові виявлені задачі — з префіксом ➕; блокери — з префіксом ⚠️

## Solution Overview

- **Tenant** — окрема сутність з історією: багато орендарів на квартиру, активний той,
  у кого `contract_end IS NULL`. Інваріант «щонайбільше один активний орендар на
  квартиру» забезпечується на рівні API (перевірка + 409), нового активного можна
  створити лише після завершення контракту попереднього (`end-contract`).
- **TenantAttachment** — файли контракту на волюмі (`/data/uploads/tenants/{tenant_id}/`,
  ім'я — UUID), метадані в БД; роздача лише через автентифікований ендпоінт
  (FileResponse), щоб файли не були публічними.
- **Статистика**: `months` (пресети), `date_from`/`date_to` (довільний період, місяці)
  або `all_time=true` — режими взаємовиключні; для тайлів наявний блок `totals`
  доповнюється лише полем `top_service` (без дублювання сум).
- **Очищення файлів — тільки явним кодом**, не БД-каскадом: DELETE орендаря та DELETE
  файла видаляють вміст із диска у застосунку. «Видалення» квартири в проєкті — це
  soft-архівація (`is_active=False`), рядки не видаляються — файли орендарів
  архівованої квартири **зберігаються** (архівація зворотна).

## Technical Details

Нові моделі:
- `Tenant`: id, apartment_id (FK, CASCADE, index), full_name (обов'язкове), phone?,
  email?, contract_start (date), contract_end (date | null), notes?; індекс
  (apartment_id, contract_end)
- `TenantAttachment`: id, tenant_id (FK, CASCADE, index), original_name, stored_name
  (UUID + розширення), content_type, size_bytes, uploaded_at

Обмеження файлів: JPG/PNG/WebP/PDF, ≤ 10 МБ на файл; перевірка content-type і розширення;
розширення `stored_name` береться з валідованого whitelist за content-type (не з імені
файлу користувача — `original_name` лише для відображення/Content-Disposition).
Конфіг: `uploads_dir` (default **`/data/uploads`** — абсолютний шлях на тому самому
volume, що й `database_path=/data/hometrap.db`; за патерном `Settings` у `config.py`).

API:
- `GET /api/apartments/{id}/tenants` — активний + історія (сортування: активний, далі за contract_start desc)
- `POST /api/apartments/{id}/tenants` — 409, якщо вже є активний
- `PUT /api/tenants/{id}` — контакти, дати, нотатки (валідація: end ≥ start)
- `POST /api/tenants/{id}/end-contract` — {contract_end}; 409, якщо вже завершений
- `DELETE /api/tenants/{id}` — запис + файли з диска
- `POST /api/tenants/{id}/attachments` — multipart, кілька файлів
- `GET /api/attachments/{id}` — FileResponse під require_auth
- `DELETE /api/attachments/{id}` — метадані + файл
- `GET /api/stats/consumption|income` — режими періоду (взаємовиключні, 422 при
  комбінуванні): `months` (default 12) | `date_from`+`date_to` (обидва разом,
  date_from ≤ date_to) | `all_time=true` (без нижньої межі);
  income додатково повертає `top_service: {name, share_percent, peak_period} | null` —
  агрегація `InvoiceLine.amount` по послугах за період (issued+paid): найбільша стаття
  комунальних **за грошима**, share_percent — частка від utilities_total,
  peak_period — місяць із максимальною сумою цієї послуги (працює і для fixed-послуг);
  наявний блок `totals` не дублюється — тайли беруть суми з нього
- `GET /api/apartments` — у списку додається `current_tenant_name` (для карток і дашборда)

## What Goes Where

- **Implementation Steps**: код + тести + документація в цьому репозиторії
- **Post-Completion**: перебудова контейнера на Synology, ручна перевірка завантажень

## Implementation Steps

### Task 1: Моделі Tenant і TenantAttachment + міграція

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/<rev>_add_tenants.py`
- Modify: `backend/tests/test_models.py`

- [ ] додати моделі `Tenant` і `TenantAttachment` за Technical Details (FK CASCADE, індекси)
- [ ] Alembic-міграція: таблиці `tenants`, `tenant_attachments`
- [ ] тести: створення орендаря з квартирою, каскад apartment→tenant→attachments, nullable contract_end
- [ ] прогнати backend-тести — мають пройти перед таском 2

### Task 2: API орендарів (CRUD + життєвий цикл контракту)

**Files:**
- Create: `backend/app/routers/tenants.py`, `backend/tests/test_tenants.py`
- Modify: `backend/app/schemas.py`, `backend/app/main.py`, `backend/app/routers/apartments.py`

- [ ] схеми TenantIn/TenantOut/TenantEndContract (email-валідація, end ≥ start)
- [ ] `GET/POST /api/apartments/{id}/tenants`, `PUT /api/tenants/{id}`, `POST /api/tenants/{id}/end-contract`, `DELETE /api/tenants/{id}`
- [ ] інваріант: створення при наявному активному → 409; end-contract двічі → 409
- [ ] `current_tenant_name` у відповіді списку квартир (`GET /api/apartments`)
- [ ] тести: створення/історія (2 орендарі послідовно), 409-кейси, валідація дат/email, 404, current_tenant_name у списку
- [ ] прогнати backend-тести — мають пройти перед таском 3

### Task 3: Файли контракту — завантаження і перегляд

**Files:**
- Create: `backend/app/services/storage.py`, `backend/tests/test_attachments.py`
- Modify: `backend/app/routers/tenants.py`, `backend/app/config.py`

- [ ] `storage.py`: збереження на `uploads_dir=/data/uploads` (UUID-ім'я, розширення з whitelist за content-type, підпапка tenants/{id}), видалення, захист від path traversal
- [ ] `POST /api/tenants/{id}/attachments` (кілька файлів): валідація типу (JPG/PNG/WebP/PDF) і розміру ≤ 10 МБ → 415/413
- [ ] `GET /api/attachments/{id}` — FileResponse з правильним content-type, під require_auth; `DELETE /api/attachments/{id}` — файл + запис
- [ ] DELETE орендаря прибирає його файли з диска явним кодом (не покладатися на БД-каскад; архівація квартири файли НЕ чіпає)
- [ ] тести: upload ok (2 файли), заборонений тип → 415, завеликий → 413, GET віддає байти, GET без auth → 401, DELETE чистить диск
- [ ] прогнати backend-тести — мають пройти перед таском 4

### Task 4: Статистика — довільний період і summary

**Files:**
- Modify: `backend/app/routers/stats.py`, `backend/app/schemas.py`
- Modify: `backend/tests/test_stats.py`

- [ ] consumption та income: режими `date_from`/`date_to` (перше число місяця, обидва разом) та `all_time=true`; комбінування режимів або date_from > date_to → 422
- [ ] income: поле `top_service` — агрегація InvoiceLine.amount по послугах (issued+paid): назва, share_percent від utilities_total, peak_period (місяць з max сумою послуги); null без комунальних даних; наявний `totals` не змінюється
- [ ] `months` за замовчуванням 12 — наявні клієнти працюють без змін
- [ ] тести: діапазон дат ріже вибірку, all_time знімає нижню межу, 422-кейси (months+dates, months+all_time, from>to), top_service за грошима на 2 квартирах (включно з fixed-послугою як топ), null без даних
- [ ] прогнати backend-тести — мають пройти перед таском 5

### Task 5: Frontend — блок «Орендар» на картці квартири

**Files:**
- Create: `frontend/src/components/TenantSection.tsx`, `frontend/src/components/TenantSection.test.tsx`
- Modify: `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/api/client.ts`

- [ ] API-клієнт: типи й методи tenants/attachments (multipart)
- [ ] картка активного орендаря: ПІБ, телефон, email, контракт з дати; редагування; «Завершити контракт» (дата, confirm)
- [ ] «Новий орендар»: форма доступна лише коли активного немає (після завершення контракту); 409 з бекенда показується зрозуміло
- [ ] файли контракту: завантаження кількох, список з original_name, відкриття в новій вкладці, видалення з confirm
- [ ] історія колишніх орендарів (згорнутий блок: ПІБ, період контракту)
- [ ] тести: рендер активного орендаря, форма нового після завершення, список файлів, помилка 409
- [ ] прогнати frontend-тести — мають пройти перед таском 6

### Task 6: Frontend — ім'я орендаря у списку квартир і на дашборді

**Files:**
- Modify: `frontend/src/pages/Apartments.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/Apartments.test.tsx`, `frontend/src/pages/Dashboard.test.tsx`

- [ ] показ `current_tenant_name` у рядку квартири (як у макеті: «Оксана К. · оренда 325 $»); без орендаря — «квартира вільна»
- [ ] те саме в списку квартир на дашборді
- [ ] тести: рядок з орендарем і без
- [ ] прогнати frontend-тести — мають пройти перед таском 7

### Task 7: Frontend — Статистика: діапазон і саммарі-тайли

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`, `frontend/src/api/client.ts`, `frontend/src/pages/portal.css`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [ ] перемикач періоду: чіпи «6 міс / 12 міс / 24 міс» (months) + «Весь час» (`all_time=true`) + режим «Довільний період» (два input type="month" → date_from/date_to); спільний для споживання й доходу
- [ ] три саммарі-тайли: «Оренда за період» і «Комунальні за період» з наявного income.totals, «Найбільша стаття» з income.top_service (назва · частка % · «пік — <місяць>»); стан без даних
- [ ] підписи сум над стовпчиками доходу (як у макеті; компактний формат «16,7»)
- [ ] підзаголовок сторінки відображає обраний період замість жорстких «12 місяців»
- [ ] тести: перемикання пресета змінює запит, довільний період, рендер тайлів, підписи над стовпчиками
- [ ] прогнати frontend-тести — мають пройти перед таском 8

### Task 8: Verify acceptance criteria

- [ ] повний сценарій у Docker: створити орендаря → прикріпити 2 файли → переглянути → завершити контракт → додати нового → історія обох; статистика: пресети, довільний період, тайли
- [ ] крайні випадки: квартира без орендаря, орендар без файлів, статистика без даних у діапазоні
- [ ] повний тест-сьют: backend pytest + Ruff + frontend Vitest + build — усе зелене
- [ ] звірити з макетом: блок орендаря, тайли статистики, підписи стовпчиків

### Task 9: [Final] Update documentation

- [ ] `docs/deploy.md`: примітка про міграцію (автозастосовується) і файли у `data/uploads` (входять у наявний volume/бекап)
- [ ] `README.md`: розділ про орендарів і файли контрактів
- [ ] фінальний запис у `ChangeLog.md`
- [ ] перемістити цей план у `docs/plans/completed/`

## Post-Completion

**Ручна перевірка:**
- перебудувати й перезапустити контейнер на Synology за `docs/deploy.md`
- перевірити завантаження/перегляд фото контракту з реального телефона (розмір файлів з камери)
- переконатися, що бекап volume включає `data/uploads`

**Майбутні ітерації (поза цим циклом):**
- read-only посилання для орендарів (тепер з'явиться сутність, до якої їх чіпляти)
- прив'язка invoice до орендаря періоду (для точної статистики по орендарях)
