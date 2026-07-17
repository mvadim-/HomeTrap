# ChangeLog

## [2026-07-17 14:23] Завершення фільтра статистики за орендарем

- `frontend/src/pages/Stats.tsx`, `frontend/src/theme.css` — завершено суто
  frontend-фільтр статистики за договором орендаря: похідний custom-період,
  інфо-рядок договору, маркери початку договорів, плитку простою та
  синхронізацію фільтрів з URL.
- `frontend/src/pages/Stats.test.tsx` — фінальна Docker-перевірка підтвердила
  140 frontend-тестів; регресійна backend-перевірка — 83 тести; production
  build frontend також успішний.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 7 завершено; `README.md`
  не потребує змін, бо нових команд немає, а `CLAUDE.md` — бо нових
  повторно використовуваних патернів не виявлено. Фізичне переміщення плану
  до `docs/plans/completed/` відкладено до фінальних фаз оркестратора.
- Зміни зачіпають production frontend. Для розгортання на Synology потрібно
  виконати rebuild і restart за `docs/deploy.md`: з локальним `.env` запустити
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`,
  потім перевірити стан через `docker compose --env-file .env -f
  docker/docker-compose.yml ps`. Автоматичний деплой не виконувався.

## [2026-07-17 14:19] Acceptance-перевірка фільтра статистики

- `frontend/src/pages/Stats.test.tsx` — додано прямі acceptance-тести
  майбутнього custom-діапазону, першого збігу двох договорів в
  одному місяці та прийнятої відсутності підсвітки активного
  орендаря для застарілого URL в наступному місяці.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 6 позначено
  виконаним після успішних Docker-перевірок: 140 frontend-тестів,
  83 backend-тести та production build frontend.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не
  виконувався.

## [2026-07-17 14:14] Стан фільтрів статистики в URL

- `frontend/src/pages/Stats.tsx` — додано відновлення квартири, масштабу й
  періоду з query-параметрів, валідацію дефолтів і канонічну синхронізацію
  актуальних фільтрів через history replace.
- `frontend/src/pages/Stats.test.tsx` — перевірено deep-link із похідним вибором
  орендаря, оновлення URL, нормалізацію невідомих параметрів і неповного
  довільного діапазону.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 5 позначено виконаним
  після успішного повного frontend test suite у Docker (137 тестів).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 14:09] Плитка простою у статистиці квартири

- `frontend/src/pages/Stats.tsx` — додано підрахунок місяців без перетину з
  жодним договором і плитку «Простій» лише для масштабу квартири.
- `frontend/src/pages/Stats.test.tsx` — перевірено розрив між договорами,
  покриття навіть одним днем, нульовий простій, квартиру без орендарів і
  відсутність плитки у портфелі.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 4 позначено виконаним
  після успішного повного frontend test suite у Docker (133 тести).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 14:05] Маркери початку договорів на графіку доходу

- `frontend/src/theme.css` — додано окремий токен кольору маркера орендаря
  для light, явної dark і системної dark тем.
- `frontend/src/pages/Stats.tsx` — у масштабі квартири графік доходу показує
  доступні з клавіатури пунктирні лінії на початку видимих місяців договорів
  із назвою орендаря та місяцем у `<title>`/`aria-label`.
- `frontend/src/pages/Stats.test.tsx` — перевірено видимий маркер квартири,
  його відсутність у портфелі та фільтрацію договору поза діапазоном.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 3 позначено виконаним
  після успішного повного frontend test suite у Docker (131 тест).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 14:00] Похідний вибір договору у статистиці

- `frontend/src/pages/Stats.tsx` — активний орендар у селекторі тепер
  визначається за точним збігом довільного діапазону з місяцями договору;
  під панеллю періоду показується рядок із датами й статусом договору.
- `frontend/src/pages/Stats.test.tsx` — перевірено завершений і активний
  договори, скидання похідного вибору після ручної зміни місяця та його
  відновлення повторним вибором орендаря.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 2 позначено виконаним
  після успішного повного frontend test suite у Docker (130 тестів).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 13:56] Пресет статистики за договором орендаря

- `frontend/src/pages/Stats.tsx` — сторінка статистики завантажує орендарів
  вибраної квартири, показує селектор лише для непорожнього списку та
  перетворює вибраний договір на довільний діапазон місяців.
- `frontend/src/pages/Stats.test.tsx` — додано безпечний дефолтний мок
  `getTenants` і перевірки завершеного/активного договору, зміни квартири,
  порожнього списку та необов'язкової помилки завантаження орендарів.
- `docs/plans/20260717-tenant-stats-filter.md` — Task 1 позначено виконаним
  після успішного повного frontend test suite у Docker (130 тестів).
- Зміна зачіпає production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-17 13:49] План фільтра статистики за орендарем

- `docs/plans/20260717-tenant-stats-filter.md` — новий план циклу: випадайка
  «Орендар» на сторінці «Статистика» як пресет періоду (дати договору →
  наявний custom-режим), інфо-рядок договору, маркери зміни орендарів на
  графіку доходу, плитка простою та стан фільтрів в URL. Суто фронтенд, без
  змін бекенда.
- План пройшов auto-review (APPROVE); зауваження внесено: токен
  `--chart-tenant-marker` в усі три блоки `theme.css`, без клієнтського
  сортування орендарів, дефолтний мок `getTenants` для наявних тестів,
  `aria-label` для випадайки.
- Лише документація; production-код не змінювався, деплой не потрібен.

## [2026-07-16 23:41] Завершення плану фінального полірування

- `docs/plans/20260716-review-polish.md` — завершений план із 11 виконаними задачами
  переміщено до `docs/plans/completed/` після implementation, review, finalize та
  stats фаз.
- Зміни production-коду в цьому кроці відсутні; додатковий деплой не виконувався.

## [2026-07-16 23:40] Усунення дублювання та зайвих обчислень у frontend

- `frontend/src/theme.ts`, `frontend/src/components/Layout.test.tsx` — inline bootstrap
  лишився єдиним джерелом початкової теми; runtime лише читає застосований `data-theme`,
  а компонентні тести виконують фактичний скрипт з `index.html`.
- `frontend/src/pages/Stats.tsx` — форматери місяців і чисел створюються один раз на
  рівні модуля та перевикористовуються під час рендерингу графіків.
- `frontend/src/components/InvoiceCalculator.tsx` і тест — read-only рахунки більше не
  будують draft payload, validity та warnings і не викликають `onDraftChange`.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 23:22] Усунення блимання теми до завантаження застосунку

- `frontend/index.html`, `frontend/src/main.tsx` — збережена або системна тема тепер
  синхронно застосовується inline-скриптом у `<head>` до завантаження CSS і React;
  запізнілу повторну ініціалізацію з module entry прибрано.
- `frontend/src/main.test.tsx` — bootstrap-тест виконує inline-скрипт із HTML та
  перевіряє, що він розташований перед application module і монтуванням React.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 23:16] Виправлення знахідок комплексного review

- `frontend/src/theme.ts`, `frontend/src/main.tsx`, `frontend/src/components/Layout.tsx` —
  збережену або системну тему застосовано до `html` до монтування React, тому login і
  початкова перевірка авторизації не блимають неправильною темою.
- `frontend/src/pages/Stats.tsx` — обидва графіки використовують спільну повну шкалу
  вибраного preset/custom періоду; all-time і надалі визначає межі за даними, а
  посилання пікової статті синхронно звіряється з apartment/scope/period.
- Компонентні тести доповнено bootstrap-перевіркою теми, крайніми порожніми місяцями,
  stale-посиланням, issued read-only рахунком, retry файлів після помилки та точними
  перевірками нейтральних CSS-класів.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:54] Завершення документації циклу полірування

- `docs/plans/20260716-review-polish.md` — Task 11 позначено виконаним; фінальне
  перенесення плану до `completed/` відкладено до завершення review, finalize і stats
  оркестратором.
- `README.md`, `CLAUDE.md` — змін не потребують: цикл не додав нових стабільних
  команд, архітектурних правил або робочих патернів.
- Зміни циклу зачіпають production frontend; для застосування потрібні rebuild і
  restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:50] Acceptance-перевірка фінального полірування

- `docs/plans/20260716-review-polish.md` — Task 10 позначено виконаним після
  browser walkthrough усіх 12 знахідок у light/dark темах; локальні стани без
  чернеток, боргів та архівної квартири додатково підтверджені компонентними тестами.
- У живому Docker-середовищі перевірено theme persistence після reload, read-only
  paid-рахунок, 404, dashboard, management-картку, локалізовані дати, графіки з
  гріделями й порожнім жовтнем, file-button flow та перехід із пікової статті.
- Повний Docker suite пройшов: 123 frontend Vitest, production build, 83 backend
  pytest і Ruff; acceptance виявила й окремим комітом виправила історичні суми
  завершених рахунків.
- Зміни цього циклу призначені для production frontend; для застосування потрібні
  rebuild і restart контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:48] Історичні суми завершених рахунків

- `frontend/src/components/InvoiceCalculator.tsx` — read-only вигляд виставлених і
  оплачених рахунків показує збережені snapshot-суми рядків та підсумків замість
  повторного обчислення за показниками й тарифом.
- `frontend/src/components/InvoiceCalculator.test.tsx` — додано регресійну перевірку
  історичної суми, яка навмисно відрізняється від поточного добутку показника й
  тарифу; targeted Vitest і browser-перевірка пройшли в Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:32] Перехід із пікової статті до рахунку

- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — плитка «Найбільша
  стаття» в режимі квартири знаходить рахунок пікового місяця, стає посиланням на
  нього та отримує theme-aware hover/focus-стан і локалізовану підказку; портфель,
  відсутній збіг і помилка API залишають звичайну плитку.
- `frontend/src/pages/Stats.test.tsx` — перевірено успішний перехід, відсутній
  рахунок, портфельний скоуп і помилку завантаження рахунків.
- `docs/plans/20260716-review-polish.md` — Task 9 позначено виконаним після успішних
  123 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:24] Умовна кнопка завантаження файлів орендаря

- `frontend/src/components/TenantSection.tsx` — кнопка «Завантажити» тепер
  з'являється лише після вибору файлів і знову приховується після успішного upload.
- `frontend/src/components/TenantSection.test.tsx` — перевірено відсутність кнопки
  без файлів, активний стан після вибору та приховування після успішного завантаження.
- `docs/plans/20260716-review-polish.md` — Task 8 позначено виконаним після успішних
  119 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:21] Читабельні шкали та пропуски на графіках

- `frontend/src/utils/ticks.ts`, `frontend/src/utils/ticks.test.ts` — додано
  обчислення заокругленої шкали з 3–4 поділками та table-driven перевірки, зокрема
  для `361 → 400/100` і `15 → 16/4`.
- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — обидва графіки
  отримали проміжні hairline-гріделі з muted-підписами; повний ряд місяців зберігає
  порожні слоти доходу й розриває лінії споживання без штучних точок.
- `frontend/src/pages/Stats.test.tsx` — перевірено гріделі, порожній жовтень 2025,
  розрив лінії та відсутність `NaN` у SVG-геометрії.
- `docs/plans/20260716-review-polish.md` — Task 7 позначено виконаним після успішних
  119 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:15] Локалізація дат орендаря

- `frontend/src/utils/format.ts`, `frontend/src/utils/format.test.ts` — додано
  UTC-safe форматування ISO-дат українською з поверненням невалідного значення без
  змін; table-driven тести охоплюють валідні, текстові й календарно хибні дати.
- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx`
  — локалізовано дату початку активного контракту, плитку «Орендар з» і періоди в
  історії; поля `input type="date"` збережено в ISO-форматі.
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx` — оновлено компонентні очікування
  локалізованих дат і збережено перевірки ISO-значень у формах.
- `docs/plans/20260716-review-polish.md` — Task 6 позначено виконаним після успішних
  113 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:11] Оновлення management-карток квартир

- `frontend/src/pages/Apartments.tsx`, `frontend/src/pages/portal.css` — картки
  квартир отримали аватар, бейдж активного або архівного стану, компактний рядок
  орендаря, підписану суму останнього рахунку зі статусом і вирівняний рядок дій;
  окремий рядок «Стан» прибрано.
- `frontend/src/pages/Apartments.test.tsx` — перевірено активну й архівну картки,
  аватари, статуси квартири та останнього рахунку, суму й відсутність архівації для
  вже архівної квартири.
- `docs/plans/20260716-review-polish.md` — Task 5 позначено виконаним після успішних
  109 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:07] Інформативні плитки дашборда

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/portal.css` — значення
  метрик приведено до нейтрального кольору, під ними додано окремі примітки про
  чернетки й неоплачені рахунки; плитку курсу замінено доходом портфеля за 12
  місяців із безпечним «—» при недоступній статистиці.
- `frontend/src/pages/Dashboard.test.tsx` — перевірено примітки з даними й без них,
  нейтральне значення «Оплачено», дохід портфеля та ізольовану помилку його запиту.
- `docs/plans/20260716-review-polish.md` — Task 4 позначено виконаним після успішних
  109 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:03] Розрізнення помилок завантаження рахунку

- `frontend/src/pages/InvoiceEdit.tsx` — екран завантаження рахунку використовує
  `ApiError.status`: для 404 показує «Рахунок не знайдено», для інших помилок —
  «Не вдалося завантажити рахунок»; обидва стани містять посилання на список.
- `frontend/src/pages/InvoiceEdit.test.tsx` — додано регресійні перевірки 404 і
  мережевої помилки, різних повідомлень та навігації до `/invoices`.
- `docs/plans/20260716-review-polish.md` — Task 3 позначено виконаним після успішних
  108 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 22:00] Read-only вигляд завершених рахунків

- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/pages/portal.css` —
  для виставлених і оплачених рахунків курс та поточні показники відображаються
  форматованим текстом замість disabled-полів; панель перевірки показників лишається
  тільки у чернетках.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/InvoiceEdit.test.tsx` — додано компонентні й сторінкові
  перевірки read-only стану paid-рахунку та збереження інтерактивного draft-стану.
- `docs/plans/20260716-review-polish.md` — Task 2 позначено виконаним після успішних
  106 frontend-тестів і production build у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 21:56] Персистентність теми інтерфейсу

- `frontend/src/components/Layout.tsx` — початкова тема синхронно відновлюється зі
  збереженого вибору або системної темної схеми до першого рендера; перемикач
  одночасно оновлює `data-theme` і `localStorage`.
- `frontend/src/components/Layout.test.tsx` — додано перевірки відновлення теми після
  перемонтування, fallback на `matchMedia` та збереження нового вибору.
- `docs/plans/20260716-review-polish.md` — Task 1 позначено виконаним після успішного
  прогону 104 frontend-тестів у Docker.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 19:55] Уточнення плану полірування після рев'ю

- `docs/plans/20260716-review-polish.md` — рев'ю проти коду (агент-інфраструктура
  була тимчасово недоступна, перевірку виконано вручну по тих самих точках):
  `ApiError.status` уже існує — Task 3 без змін client.ts; примітки плиток дашборда
  підтверджено похідними від наявного `needs_attention[].reason` (unpaid/draft);
  `getInvoices({apartmentId})` уже існує — Task 9 без змін client.ts.

## [2026-07-16 19:45] План фінального полірування за повторним рев'ю

- Проведено повторне візуальне рев'ю проти макета після виконання плану стилів:
  базові стилі відповідають макету; зафіксовано 12 залишкових знахідок
  (персистентність теми, read-only вигляд оплачених рахунків, 404-стан, примітки
  плиток, картка /apartments, ISO-дати, гріделі/порожні місяці графіків, дрібні
  покращення).
- `docs/plans/20260716-review-polish.md` — створено план з 11 тасків; зміни суто
  frontend. Деплой не потрібен (лише документація).

## [2026-07-16 19:17] Відновлення layout карток квартир

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Apartments.tsx`,
  `frontend/src/pages/portal.css` — dashboard-рядки та management-картки квартир
  отримали окремі variant-класи; grid дашборда більше не стискає заголовок і не
  накладає адресу, статус та кнопки на сторінці `/apartments`.
- `frontend/src/pages/Dashboard.test.tsx`, `frontend/src/pages/Apartments.test.tsx` —
  додано регресійні перевірки окремих layout-контрактів для двох екранів.
- Зміна зачіпає production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:58] Безпечне оновлення після збереження послуг і тарифів

- `frontend/src/pages/ApartmentDetail.tsx` — помилка refresh після успішного створення
  чи редагування послуги або створення тарифу тепер повідомляє, що зміну вже
  збережено, замість помилково пропонувати повторити мутацію з ризиком дублювання.
- `frontend/src/pages/ApartmentDetail.test.tsx` — додано регресійні перевірки окремої
  семантики mutation-success/refresh-error для створення послуги й тарифу.
- У Docker пройшли 101 frontend-тест, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:49] Усунення frontend code smells після рев’ю

- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx` —
  покоління квартири тепер змінюється в effect, без ref-мутації під час render; callback
  occupancy отримав явний discriminated state і передає лише дату початку контракту.
- `frontend/src/utils/decimal.ts`, `frontend/src/components/InvoiceCalculator.tsx` — точну
  десяткову арифметику винесено з UI-компонента в окремий domain utility.
- `frontend/src/utils/format.ts`, `frontend/src/pages/Invoices.tsx`,
  `frontend/src/pages/InvoiceEdit.tsx`, `frontend/src/pages/ApartmentDetail.tsx` — додано
  спільне форматування місяця для API-періодів `YYYY-MM` і `YYYY-MM-DD`.
- `frontend/src/pages/portal.css` — картки фактів квартири й summary статистики
  використовують спільний selector для border, surface, radius і shadow токенів.
- `frontend/src/utils/decimal.test.ts`, `frontend/src/utils/format.test.ts`,
  `frontend/src/components/TenantSection.test.tsx`, `frontend/src/theme.test.ts` — додано
  прямі unit/regression-перевірки нових контрактів. У Docker пройшли 99 frontend-тестів,
  production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:36] Безпечна навігація рахунків і валідація показників

- `frontend/src/pages/InvoiceEdit.tsx` — стан рахунку й чернетки очищається при зміні
  route; асинхронні load/mutation-відповіді прив'язано до покоління маршруту, а save,
  status і delete завжди спрямовано на id фактично відображеного рахунку.
- `frontend/src/components/InvoiceCalculator.tsx` — preview, payload, dirty-state та
  доступність save/issue використовують одну строгу десяткову граматику; exponent-
  нотація на кшталт `1e3` у показниках більше не може потрапити до backend.
- `frontend/src/pages/InvoiceEdit.test.tsx`,
  `frontend/src/components/InvoiceCalculator.test.tsx` — додано regression-перевірки
  stale route response, безпечного target id та узгодженої відмови від exponent-
  показників. У Docker пройшли 94 frontend-тести, production build, 83 backend-тести
  та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:26] Точність рахунку й безпечне оновлення орендаря

- `frontend/src/components/InvoiceCalculator.tsx`, `frontend/src/pages/InvoiceEdit.tsx` —
  локалізоване представлення курсу й показників відокремлено від точних API-рядків:
  незмінені шестизначні значення не стають dirty і не втрачають точність у payload;
  exponent-нотація відхиляється однаково для preview, save та issue.
- `frontend/src/components/TenantSection.tsx` — помилка refresh після успішної tenant-
  мутації тепер повідомляє, що зміну вже збережено, і не маскується як помилка самої
  мутації, яка могла спровокувати небезпечний повтор запиту.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/InvoiceEdit.test.tsx`, `frontend/src/components/TenantSection.test.tsx` —
  додано regression-перевірки точного курсу `44.791749`, заборони `1e3`,
  presentation `9583.500 → 9 583,5` зі збереженням raw payload та успішної мутації
  з невдалим наступним refresh.
- У Docker пройшли 92 frontend-тести, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:17] Ізоляція tenant-мутацій і точне поле курсу

- `frontend/src/components/TenantSection.tsx`, `frontend/src/pages/ApartmentDetail.tsx` —
  tenant-load і всі мутації прив’язано до покоління поточної квартири; завершення
  старого запиту після навігації більше не запускає load і не змінює стан нового
  маршруту. Помилка списку орендарів зберігає невідомий occupancy замість хибного
  стану «вільна».
- `frontend/src/components/InvoiceCalculator.tsx` — редактор курсу показує API-курс
  без хвостових нулів у локальному форматі (`44,7917`), але незмінена чернетка й
  save payload зберігають початковий точний рядок (`44.791700`).
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx`, `frontend/src/pages/InvoiceEdit.test.tsx` —
  додано regression-перевірки завершення мутації після зміни маршруту, unknown
  occupancy при tenant-list error і display-нормалізації зі збереженням raw payload.
- У Docker пройшли 88 frontend-тестів, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 18:07] Ізоляція стану картки квартири та орендаря

- `frontend/src/components/TenantSection.tsx` — помилка завантаження вкладень більше
  не приховує активного орендаря; при зміні квартири очищаються tenant-форми,
  ідентифікатор редагування, форма завершення контракту та вибрані файли.
- `frontend/src/pages/ApartmentDetail.tsx` — route-load отримав request token;
  попередні квартира, послуги, тарифи й форми очищаються одразу, а застарілі
  відповіді та помилки мутацій не змінюють стан нового маршруту.
- `frontend/src/components/TenantSection.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx` — додано regression-перевірки
  attachment-помилки, очищення приватного file draft, stale response та невдалого
  завантаження наступної квартири.
- У Docker пройшли 86 frontend-тестів, production build, 83 backend-тести та Ruff.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:57] Виправлення знахідок комплексного рев’ю

- `frontend/src/components/InvoiceCalculator.tsx` — editable-курс і показники більше
  не проходять через locale formatter: шестизначна точність API зберігається у
  draft/save payload, форматування лишається тільки у представленні.
- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/components/TenantSection.tsx` —
  дата контракту очищається при зміні квартири та помилці tenant/attachment load;
  у detail-header знову показуються статус і примітки квартири.
- `frontend/src/utils/utility.ts`, `frontend/src/pages/Stats.tsx`,
  `frontend/src/pages/portal.css` — класифікацію комунальних послуг уніфіковано,
  negative-marker отримав поведінковий hover/focus tooltip, а статистичні поверхні
  використовують theme-токени primary/on-primary та радіус 12px.
- `frontend/src/components/InvoiceCalculator.test.tsx`,
  `frontend/src/pages/ApartmentDetail.test.tsx`, `frontend/src/pages/Stats.test.tsx` —
  додано regression-перевірки точного payload, route reuse, метаданих квартири й
  інтерактивного tooltip; у Docker пройшли 82 frontend-тести, production build,
  83 backend-тести та Ruff.
- `AGENTS.md`, `docs/plans/20260716-mockup-style-alignment.md` — додано frontend-
  styling convention, ручний side-by-side review лишено відкритим owner-критерієм,
  а Post-Completion нотатку приведено до поточного стану.
- Зміни зачіпають production frontend; для застосування потрібні rebuild і restart
  контейнера за `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:42] Завершення циклу вирівнювання стилів

- `CLAUDE.md` — зафіксовано стабільне правило frontend-стилів: `theme.css` є
  джерелом правди для дизайн-токенів, а компоненти не дублюють кольори й тіні.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 8 закрито; перенесення
  завершеного плану відкладено до фінального кроку exec-harness після рев'ю,
  finalize і статистики.
- `README.md` не змінювався: новий патерн стосується розробки, а не користувацького
  запуску чи експлуатації HomeTrap.
- Цей документаційний крок не змінює runtime. Для застосування попередніх frontend-
  змін циклу у production потрібні rebuild і restart контейнера за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 17:37] Верифікація стилів і live-форматів

- `frontend/src/utils/format.ts`, `frontend/src/components/Layout.tsx`,
  `frontend/src/pages/Dashboard.tsx` — summary-курс НБУ тепер завжди округлюється до
  двох знаків: live-значення `44.748` показується як `44,75 ₴`, тоді як редаговане
  поле рахунку зберігає точність до чотирьох знаків.
- `frontend/src/pages/ApartmentDetail.tsx` — місяць останнього рахунку приймає
  реальний API-формат `YYYY-MM-DD` без `RangeError`; картка з live-чернеткою знову
  рендерить факти квартири.
- `frontend/src/utils/format.test.ts`, `frontend/src/components/Layout.test.tsx`,
  `frontend/src/pages/Dashboard.test.tsx`, `frontend/src/pages/ApartmentDetail.test.tsx` —
  додано regression-покриття округлення `44.748 → 44,75` та ISO-дати рахунку.
- У Playwright пройдено light/dark екрани шапки, дашборда, квартир, картки,
  рахунків, редактора, статистики й налаштувань; зовнішній Claude artifact і реальні
  дані вересня 2025 недоступні локальній автоматизації, тому їх покрито критеріями
  плану й тестами, а фінальний side-by-side лишено власнику в Post-Completion.
- Фінальний Docker-гейт: 81 frontend-тест, production build, 83 backend-тести та
  Ruff пройшли; усі 6 груп знахідок Overview мають браузерні та/або тестові докази.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 7 позначено виконаним.
- Зміна зачіпає frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:16] Статистика за палітрою макета

- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/portal.css` — лінії споживання,
  заливки, точки, сегменти доходу та легенду переведено на токени
  графіків; кінцеву точку виділено обводкою картки.
- Місяць із від’ємним сегментом більше не створює невалідний стек:
  на базовій лінії показується ромб коригування з tooltip оренди,
  комунальних і підсумку; підпис від’ємної суми не рендериться.
- `frontend/src/pages/Stats.test.tsx` — перевірено токени fill/stroke,
  area-path, розміри точок, позитивні бари й негативний місяць без
  `NaN`; у Docker пройшли 80 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 6 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:08] Картка квартири за затвердженим макетом

- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/pages/portal.css` — вузькі
  реквізити замінено повноширинною сіткою оренди, останнього рахунку, середньої
  комуналки за 12 місяців і початку оренди; помилка чи порожня статистика дає «—».
- Таблиця послуг отримала маркери газу, електроенергії та води з токенів графіків;
  інші послуги лишаються без маркера.
- `frontend/src/components/TenantSection.tsx` — контакти переведено на accent-лінки,
  нативний file input приховано за ghost-label «Додати файли», а вибрані назви
  показуються перед завантаженням.
- `frontend/src/pages/ApartmentDetail.test.tsx`,
  `frontend/src/components/TenantSection.test.tsx` — перевірено факти з даними,
  порожню історію та помилку статистики, стилізований picker, accent-контакти й
  маркери послуг; у Docker пройшли 79 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 5 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 17:00] Плитки й дашборд за затвердженим макетом

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/portal.css` — плитки отримали
  uppercase-eyebrow та кольорові позитивні/негативні значення; рядки квартир —
  38px аватари, компактні деталі й правий блок суми зі статусом без дубля адреси.
- Блок «Потребує уваги» отримав rose/amber/muted маркери для прострочених оплат,
  чернеток і поточних нагадувань та пояснення другим приглушеним рядком.
- `frontend/src/pages/Dashboard.test.tsx` — перевірено аватар, приховування дубля
  адреси, усі класи маркерів, note-класи та нульову заборгованість; у Docker пройшли
  76 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 4 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:55] Українські формати тарифів, показників і курсу

- `frontend/src/utils/format.ts`, `frontend/src/utils/format.test.ts` — додано спільні
  форматери тарифів, показників і курсу з українською комою, обрізанням хвостових
  нулів, групуванням тисяч та табличним покриттям краєвих значень.
- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/components/InvoiceCalculator.tsx`,
  `frontend/src/components/Layout.tsx`, `frontend/src/pages/Dashboard.tsx` — сирі значення
  API замінено локалізованими форматами; редаговані числові поля отримують очищені
  значення з крапкою без хибного dirty-стану.
- Компонентні тести квартири, рахунку й дашборда оновлено під нові формати; у Docker
  пройшли 75 frontend-тестів і production-збірка.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 3 позначено виконаним.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:49] Однорядкова шапка за затвердженим макетом

- `frontend/src/components/Layout.tsx`, `frontend/src/components/Layout.css` — логотип,
  навігацію, курс НБУ, тему й вихід об'єднано в одну шапку; додано SVG-будинок,
  суцільний активний pill, український формат курсу та перенос навігації з
  горизонтальним прокручуванням на вузьких екранах.
- `frontend/src/components/Layout.test.tsx` — перевірено SVG-марку, активний пункт,
  текст курсу та fallback при помилці API.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 2 позначено виконаним після
  успішних 58 frontend-тестів і production-збірки в Docker.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:45] Дизайн-токени за затвердженим макетом

- `frontend/src/theme.css` — оновлено light/dark палітри, додано токени кольорів
  графіків і контрастного тексту, картковий радіус 12px та компактну макетну тінь;
  у dark-темі тіні карток явно вимкнено.
- `frontend/src/pages/portal.css`, `frontend/src/theme.test.ts` — картки й плитки
  переведено на спільний `--shadow-card`; додано перевірки реальних токенів обох тем,
  hairline-бордерів і використання спільної тіні.
- `docs/plans/20260716-mockup-style-alignment.md` — Task 1 позначено виконаним після
  успішних 56 frontend-тестів у Docker.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 16:35] Правки плану стилів після авто-рев'ю

- `docs/plans/20260716-mockup-style-alignment.md` — враховано знахідки plan-review:
  токени НЕ перейменовуються (оновлюються значення наявних `--color-*`, додаються лише
  `--chart-*` і `--color-on-primary`) з явним мапінгом макет→код; у таск форматерів
  включено всі тест-файли зі старими форматами (інакше падав би тест-гейт) і плитку
  курсу на дашборді; зафіксовано точність курсу (чип/плитка — 2 знаки, поле — 2–4);
  «Середня комуналка» підтверджена як частина макета з fallback «—»; dark-тінь —
  явний `--shadow-card: none`; api/client.ts прибрано з файлів таска 5.

## [2026-07-16 16:20] План вирівнювання стилів із макетом

- Проведено візуальне рев'ю живого порталу (усі екрани, light + dark) проти
  затвердженого макета: функціонал повний, стилі розійшлися (шапка, токени карток,
  формати чисел, аватари/маркери, палітра графіків, від'ємний місяць без бара).
- `docs/plans/20260716-mockup-style-alignment.md` — створено план із 8 тасків;
  зміни суто frontend, без API. Деплой не потрібен (лише документація).

## [2026-07-16 15:56] Відновлення ширини таблиці послуг

- `frontend/src/pages/ApartmentDetail.tsx`, `frontend/src/pages/portal.css` — секція
  «Послуги й тарифи» явно займає обидві колонки detail-grid і більше не стискається
  до вузької лівої колонки після додавання повноширинного блоку орендаря.
- `frontend/src/pages/ApartmentDetail.test.tsx` — додано regression-перевірку
  layout-класу секції послуг.
- Зміна суто frontend; для production потрібні rebuild і restart контейнера за
  `docs/deploy.md`. Автоматичний деплой не виконувався.

## [2026-07-16 15:16] Повторюване видалення файлів орендаря

- `backend/app/services/storage.py`, `backend/app/routers/tenants.py` — файли орендаря
  перед видаленням метаданих атомарно переміщуються у приватний staging; помилка DB
  commit відновлює каталог, а помилка filesystem cleanup лишає durable маркер для
  повторного `DELETE`.
- `backend/tests/test_attachments.py` — додано регресію помилки cleanup з перевіркою
  збережених staged-файлів та успішного повторного видалення.
- Для production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 15:08] Усунення code smells після рев'ю

- `backend/app/services/storage.py`, `backend/tests/test_attachments.py` — запис
  вкладень переведено на атомарну заміну тимчасового файлу з очищенням partial write;
  додано регресію ін'єктованої помилки запису.
- `frontend/src/pages/Stats.tsx`, `frontend/src/pages/Stats.test.tsx` — розділено
  loading/error стани запитів споживання й доходу, завершення помилкових запитів та
  очищення помилок після успішної повторної спроби покрито тестом.
- `frontend/src/components/TenantSection.tsx`,
  `frontend/src/components/TenantSection.test.tsx` — stale відповіді попередньої
  квартири ігноруються, а file input повністю скидається після успішного upload.
- Для production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

## [2026-07-16 14:54] Виправлення після комплексного code review

- `backend/app/models.py`, `backend/alembic/versions/20260716_04_enforce_active_tenant.py`,
  `backend/app/routers/tenants.py` — інваріант одного активного орендаря закріплено
  частковим unique index, конфлікти commit повертають 409, а перетини контрактів
  відхиляються; файли видаляються лише після успішного commit метаданих.
- `backend/app/services/storage.py`, `backend/app/routers/tenants.py` — whitelist типів
  файлів зведено до одного mapping, batch обмежено 10 файлами та обробляється по одному
  файлу без накопичення всіх payload у пам'яті.
- `frontend/src/components/TenantSection.tsx` — локальну дату обчислено під час відкриття
  форм, наступний контракт починається з наступного календарного дня, а вкладення
  завантажуються лише для активного орендаря.
- `backend/tests/test_tenants.py`, `backend/tests/test_models.py`,
  `backend/tests/test_attachments.py`, `backend/tests/test_stats.py`,
  `frontend/src/components/TenantSection.test.tsx` — додано регресії конкурентного
  створення, перетинів дат, commit failures, batch limit, актуальної локальної дати та
  Kyiv-aware stats fixtures.
- `README.md`, `ChangeLog.md` — уточнено dev/production storage і backup, виправлено
  хронологію запису моделей. Для production потрібно перебудувати й перезапустити
  контейнер за `docs/deploy.md`; автоматичний деплой не виконувався.

## [2026-07-16 14:42] Документація орендарів і резервного копіювання

- `README.md` — описано життєвий цикл орендарів, один активний контракт на квартиру,
  підтримувані файли контрактів, ліміт 10 МБ і приватне зберігання.
- `docs/deploy.md` — уточнено автоматичне застосування tenant-міграції та оновлено
  backup/restore так, щоб разом із SQLite архівувався каталог `data/uploads`.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 9 позначено виконаним; перенесення
  плану до `completed/` залишено фінальному harness після review/finalize.
- Зміни суто документаційні; production не змінювався й потребує ручної перебудови
  та перезапуску контейнера за `docs/deploy.md` для попередніх функціональних змін.

## [2026-07-16 14:40] Acceptance-перевірка розривів із макетом

- `backend/tests/test_mockup_gap_acceptance.py` — додано інтегрований Docker-сценарій
  орендарів: порожня квартира, два вкладення з переглядом, завершення контракту,
  наступний орендар, історія обох і порожня статистика для всіх режимів періоду.
- `frontend/src/components/TenantSection.test.tsx`, `frontend/src/pages/Stats.test.tsx` —
  зафіксовано empty states квартири/файлів та запити для пресетів 12/6/24 місяці;
  наявні перевірки підтвердили довільний період, весь час, тайли та підписи графіка.
- Живий Docker UI перевірено через Playwright: блок орендаря, керування контрактом,
  файли, п'ять режимів статистики й три summary-тайли відповідають repo-макету.
- `docs/plans/20260716-mockup-gap-fixes.md` — Task 8 позначено виконаним після 78
  backend-тестів, Ruff, 48 frontend-тестів і production build у Docker. Для
  production потрібно перебудувати й перезапустити контейнер за `docs/deploy.md`;
  автоматичний деплой не виконувався.

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

## [2026-07-16 13:53] Моделі орендарів і вкладень контракту

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
