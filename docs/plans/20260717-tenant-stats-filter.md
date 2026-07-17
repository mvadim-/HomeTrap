# Фільтр статистики за орендарем (tenant-stats-filter)

## Overview
- На сторінці «Статистика» поруч із селектором квартири додається випадайка
  «Орендар», яка працює як пресет періоду: вибір орендаря обмежує статистику
  місяцями дії його договору.
- Додатково: інфо-рядок договору, маркери зміни орендарів на графіку доходу,
  плитка простою та збереження стану фільтрів в URL.
- Розв'язує задачу «подивитись споживання/дохід саме за цього орендаря» без
  ручного підбирання дат і без змін у бекенді.

## Context (from discovery)
- Files/components involved: `frontend/src/pages/Stats.tsx`,
  `frontend/src/pages/Stats.test.tsx`, `frontend/src/theme.css`,
  `frontend/src/api/client.ts` (лише читання — `getTenants` вже існує,
  `client.ts:357`).
- Related patterns found: період статистики вже виражається через
  `periodMode`/`dateFrom`/`dateTo` → `statsPeriod` → API `date_from`/`date_to`;
  графіки споживають CSS-токени з `theme.css`; сторінки використовують
  react-router (`useSearchParams` доступний).
- Dependencies identified: `Invoice` НЕ має `tenant_id` — орендар прив'язаний до
  квартири через `contract_start`/`contract_end`, контракти не перетинаються,
  активний орендар максимум один (`backend/app/models.py`). Тому «фільтр за
  орендарем» = діапазон місяців його договору.

## Development Approach
- **Testing approach**: Regular (спочатку код, потім тести в межах того самого
  таска).
- Complete each task fully before moving to the next.
- Make small, focused changes.
- **CRITICAL: every task MUST include new/updated tests** for code changes in
  that task:
  - tests are not optional — they are a required part of the checklist;
  - write tests for new/modified behavior, success and error scenarios.
- **CRITICAL: all tests must pass before starting next task** — no exceptions.
- **CRITICAL: update this plan file when scope changes during implementation.**
- Run tests after each change: `docker compose -f docker/docker-compose.dev.yml
  run --rm frontend npm test`.
- Maintain backward compatibility: без вибраного орендаря сторінка поводиться
  як зараз.

## Testing Strategy
- **Unit/component tests**: Vitest + RTL у `frontend/src/pages/Stats.test.tsx`
  для кожного таска (моки `getTenants` поруч з наявними моками API).
- **e2e tests**: у проєкті немає UI e2e-фреймворка — не додаємо; фінальна
  перевірка — ручний browser walkthrough у light/dark (Post-Completion).
- Backend-тести не змінюються (бекенд не зачіпається).

## Progress Tracking
- Mark completed items with `[x]` immediately when done.
- Add newly discovered tasks with ➕ prefix.
- Document issues/blockers with ⚠️ prefix.
- Update plan if implementation deviates from original scope.

## Solution Overview
- Суто фронтендова реалізація (підхід A з brainstorm): вибір орендаря
  перемикає `periodMode` на `"custom"` і підставляє межі договору; далі працює
  наявний ланцюжок `statsPeriod` → запити.
- Вибір орендаря — похідний стан: окремого `selectedTenantId` немає, випадайка
  показує орендаря, чиї місяці договору точно збігаються з поточним
  custom-діапазоном; ручна зміна дат природно скидає підсвітку на «—».
- Маркери на графіку доходу та плитка простою рендеряться лише в масштабі
  «Квартира» — у «Портфелі» дані одного орендаря вводили б в оману.
- Стан фільтрів синхронізується з URL (`useSearchParams`, `replace: true`);
  орендар в URL не пишеться, бо відновлюється з дат.

## Technical Details
- Місяць договору: `contract_start` округлюється вниз до місяця
  (15.03.2024 → `2024-03`); `contract_end` → його місяць включно; для
  активного орендаря (`contract_end == null`) — поточний місяць.
- Порядок списку: бекенд `list_tenants` вже повертає активного першим, далі за
  спаданням `contract_start` (`backend/app/routers/tenants.py:115-119`) —
  клієнтське сортування НЕ дублюємо; на фронтенді лише позначка «(поточний)»
  для орендаря з `contract_end == null`. Квартира без орендарів → випадайка
  прихована. Помилка `getTenants` → порожній список, випадайка прихована, без
  error-банера (функція опційна).
- Випадайка має `aria-label="Орендар для статистики"` (за зразком сусіднього
  селектора квартири).
- Зміна квартири → `getTenants(apartmentId)` наново; вибір скидається
  автоматично (дати перестають збігатися або залишаються — похідний стан сам
  дає коректну підсвітку). Свідоме рішення: custom-діапазон дат при зміні
  квартири НЕ скидається — період є просто датами (пресет-семантика), лише
  підсвітка орендаря зникає.
- Інфо-рядок: «Договір: 15.03.2024 — досі · активний» або
  «Договір: 01.02.2023 — 28.02.2024 · завершений»; показується лише коли
  випадайка має активний збіг.
- Маркери: вертикальна пунктирна лінія на лівому краю слота місяця
  `contract_start` кожного орендаря у видимому діапазоні `chartPeriods`;
  без текстових підписів, доступність через `<title>`/`aria-label`
  («Початок договору: Іван Петренко, березень 2024»). Колір — новий токен
  `--chart-tenant-marker` у `theme.css`, доданий в УСІ ТРИ блоки токенів:
  `:root` (light), `:root[data-theme="dark"]` та
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`.
- Плитка простою: місяць покритий, якщо будь-який договір перетинає хоч один
  його день (`contract_start` ≤ кінця місяця і (`contract_end` порожній або
  ≥ початку місяця)); простій = кількість місяців `chartPeriods` без покриття.
- URL-параметри: `apartment=<id>`, `scope=portfolio|apartment`,
  `period=6|12|24|all|custom`, `from`/`to` (`YYYY-MM`, лише для custom).
  Валідація при завантаженні: неіснуюча квартира → дефолт (перша активна),
  невалідний період → `"12"`, неповна пара from/to → порожні поля custom.

## What Goes Where
- **Implementation Steps** (`[ ]` checkboxes): зміни коду, тестів і
  документації в цьому репозиторії.
- **Post-Completion** (без checkboxes): ручна верифікація в браузері та
  розгортання на production.

## Implementation Steps

### Task 1: Випадайка орендарів із пресетом періоду

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [x] завантажувати орендарів вибраної квартири через `getTenants` (ефект на
  зміну `apartmentId`, з cleanup за зразком наявних ефектів); порядок
  використовуємо як є з API (без клієнтського сортування)
- [x] випадайка з `aria-label="Орендар для статистики"`: суфікс «(поточний)»
  для орендаря з `contract_end == null`; приховати випадайку, якщо орендарів
  немає або `getTenants` завершився помилкою (без error-банера)
- [x] обробник вибору: `periodMode="custom"`, `dateFrom` = місяць
  `contract_start`, `dateTo` = місяць `contract_end` або поточний місяць
- [x] додати дефолтний мок `getTenants` (порожній список) до НАЯВНИХ тестів
  `Stats.test.tsx`, щоб новий ефект не робив реальних fetch-викликів і не
  давав act()-попереджень
- [x] write tests: вибір орендаря → custom-режим, поля заповнені, API отримує
  `date_from`/`date_to` договору; активний орендар → `dateTo` = поточний
  місяць і позначка «(поточний)»
- [x] write tests: зміна квартири → нові орендарі; квартира без орендарів →
  випадайки немає; помилка `getTenants` → випадайка прихована, сторінка
  працює далі
- [x] run tests — must pass before task 2

### Task 2: Похідний стан вибору та інфо-рядок договору

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [x] обчислювати значення випадайки зіставленням поточного custom-діапазону з
  місяцями договорів (перший збіг); без збігу — плейсхолдер «—»
- [x] інфо-рядок під панеллю періоду при активному збігу: «Договір:
  {dd.mm.yyyy} — {dd.mm.yyyy|досі} · {активний|завершений}»
- [x] write tests: ручна зміна дати → випадайка «—», інфо-рядок зникає;
  повторний вибір орендаря відновлює підсвітку та рядок
- [x] run tests — must pass before task 3

### Task 3: Маркери зміни орендарів на графіку доходу

**Files:**
- Modify: `frontend/src/theme.css`
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [x] додати токен `--chart-tenant-marker` в усі три блоки токенів
  `theme.css`: `:root`, `:root[data-theme="dark"]` та
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
- [x] передавати в `IncomeChart` місяці початку договорів (лише при
  `scope="apartment"`) і малювати вертикальні пунктирні лінії на лівому краю
  відповідних слотів з `<title>`/`aria-label`
- [x] write tests: маркер з aria-label «Початок договору: …» присутній у
  scope="apartment" і відсутній у portfolio; місяць поза діапазоном → маркера
  немає
- [x] run tests — must pass before task 4

### Task 4: Плитка простою

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [x] обчислення простою: місяці `chartPeriods`, не покриті жодним договором
  (перетин хоч в один день)
- [x] четверта плитка у `stats-summary-grid`: «Простій» → «X міс» → «без
  орендаря за період»; рендер лише при `scope="apartment"`
- [x] write tests: розрив між договорами рахується правильно; повне покриття →
  «0 міс»; квартира без орендарів → усі місяці; у portfolio плитки немає
- [x] run tests — must pass before task 5

### Task 5: Стан фільтрів в URL

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/pages/Stats.test.tsx`

- [x] ініціалізація стану з `useSearchParams` (apartment, scope, period,
  from/to) з валідацією: неіснуюча квартира → дефолт, невалідний період →
  «12», неповна пара from/to → порожні поля
- [x] запис актуальних фільтрів в URL при зміні стану через
  `setSearchParams(..., { replace: true })`
- [x] write tests: старт із query-параметрами відновлює стан (зокрема
  підсвітку орендаря через збіг дат); зміна фільтрів оновлює URL;
  невалідні параметри → дефолти
- [x] run tests — must pass before task 6

### Task 6: Verify acceptance criteria

- [x] verify all requirements from Overview are implemented
- [x] verify edge cases are handled (два договори в одному місяці → перший
  збіг; майбутні місяці custom-діапазону; порожній список орендарів;
  прийнятий trade-off: URL з періодом активного орендаря, відкритий у
  наступному місяці, не підсвітить орендаря — `dateTo` застаріє)
- [x] run full test suite: `docker compose -f docker/docker-compose.dev.yml
  run --rm frontend npm test`
- [x] run backend suite незмінним для регресії: `docker compose -f
  docker/docker-compose.dev.yml run --rm backend pytest`
- [x] verify frontend build: `docker compose -f docker/docker-compose.dev.yml
  run --rm frontend npm run build`

### Task 7: [Final] Update documentation

- [x] додати запис у `ChangeLog.md` (`## [YYYY-MM-DD HH:MM] …`, зачеплені
  файли, поведінка, примітка про деплой)
- [x] update README.md if needed — оновлення не потрібне: нових команд немає
- [x] update CLAUDE.md if new patterns discovered — оновлення не потрібне:
  нових повторно використовуваних патернів не виявлено
- [x] створити окремий git-коміт циклу з коротким імперативним заголовком
- [x] move this plan to `docs/plans/completed/` — фізичне переміщення
  відкладено до завершальних review/finalize/stats фаз оркестратора

## Post-Completion
*Ручні дії та зовнішні системи — інформаційно, без checkboxes*

**Manual verification:**
- Browser walkthrough сторінки «Статистика» у light і dark темах через
  `docker/docker-compose.dev.yml`: вибір орендаря, ручна зміна дат, маркери,
  плитка простою, оновлення сторінки з параметрами в URL.

**External system updates:**
- Зміни зачіпають production frontend: на Synology потрібні rebuild і restart
  контейнера за `docs/deploy.md` (production compose `docker/docker-compose.yml`
  з локальним `.env`). Автоматичний деплой не виконується.
