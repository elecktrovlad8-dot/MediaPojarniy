/**
 * МЕДИАПОЖАРНЫЙ — Умный загрузчик медиафайлов (./assets/...), IndexedDB-примерка и встроенная графика
 *
 * Особенности:
 * 1. Все пути строго относительные (./assets/...) для 100% совместимости с GitHub Pages.
 * 2. Для каждого слота автоматически проверяются расширения .webp, .jpg, .jpeg, .png.
 * 3. Поддерживается локальный drag-and-drop предпросмотр фото карточек через IndexedDB.
 * 4. При отсутствии файла мгновенно отображается тематический SVG/UI-макет без сломанных иконок.
 */

const EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'];
const IDB_NAME = 'mediapozharny_media_db_v1';
const IDB_STORE = 'overrides';

/** Кэш результатов проверки файлов в ./assets/: basePath -> { found, url, source } */
const probeCache = new Map();
/** Кэш локальных пользовательских превью из IndexedDB: fullKey -> dataUrl */
const overrideCache = new Map();
let idbPromise = null;

/* ============================================================================
   IndexedDB для локальной примерки фото физических карточек в Медиа-менеджере
   ============================================================================ */

function openMediaDB() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

export async function initMediaOverrides() {
  const db = await openMediaDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const storeObj = tx.objectStore(IDB_STORE);
      const req = storeObj.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          overrideCache.set(String(cursor.key), cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function saveMediaOverride(fullKey, fileOrDataUrl) {
  let dataUrl = fileOrDataUrl;
  if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
    dataUrl = await readFileAsDataUrl(fileOrDataUrl);
  }
  overrideCache.set(fullKey, dataUrl);
  probeCache.delete(fullKey);

  const db = await openMediaDB();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(dataUrl, fullKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return dataUrl;
}

export async function removeMediaOverride(fullKey) {
  overrideCache.delete(fullKey);
  probeCache.delete(fullKey);

  const db = await openMediaDB();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(fullKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export async function clearAllMediaOverrides() {
  overrideCache.clear();
  probeCache.clear();

  const db = await openMediaDB();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения'));
    reader.readAsDataURL(file);
  });
}

/* ============================================================================
   Проверка наличия изображения в ./assets/ (webp → jpg → jpeg → png)
   ============================================================================ */

function loadImageUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Формирует полный относительный базовый путь без расширения, например:
 * ./assets/images/episodes/part1/rumors/rumor-01
 */
export function buildAssetBasePath(episode, assetKey) {
  const base = (episode?.assetsBase || './assets/images/episodes/part1/').replace(/\/?$/, '/');
  const cleanKey = String(assetKey || '').replace(/^\/+/, '');
  return `${base}${cleanKey}`;
}

/**
 * Ищет файл для слота: сначала в IndexedDB-примерке, затем в папке ./assets/.
 * Возвращает { found: boolean, url: string | null, source: 'override' | 'assets' | 'fallback', ext?: string }
 */
export async function resolveMediaAsset(basePath) {
  if (!basePath) {
    return { found: false, url: null, source: 'fallback' };
  }

  if (overrideCache.has(basePath)) {
    return {
      found: true,
      url: overrideCache.get(basePath),
      source: 'override'
    };
  }

  if (probeCache.has(basePath)) {
    return probeCache.get(basePath);
  }

  // Если базовый путь уже содержит явное расширение
  if (/\.(webp|jpg|jpeg|png|svg)$/i.test(basePath)) {
    const ok = await loadImageUrl(basePath);
    const result = ok
      ? { found: true, url: basePath, source: 'assets' }
      : { found: false, url: null, source: 'fallback' };
    probeCache.set(basePath, result);
    return result;
  }

  for (const ext of EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    const ok = await loadImageUrl(candidate);
    if (ok) {
      const result = { found: true, url: candidate, source: 'assets', ext };
      probeCache.set(basePath, result);
      return result;
    }
  }

  const fallbackRes = { found: false, url: null, source: 'fallback' };
  probeCache.set(basePath, fallbackRes);
  return fallbackRes;
}

/**
 * Возвращает полный перечень медиа-слотов для диагностики в Медиа-менеджере.
 */
export function getEpisodeMediaManifest(episode) {
  if (!episode) return [];
  const items = [];
  const add = (category, label, assetKey) => {
    items.push({
      category,
      label,
      assetKey,
      basePath: buildAssetBasePath(episode, assetKey),
      expectedFileHint: `${buildAssetBasePath(episode, assetKey)}.jpg (или .webp / .png)`
    });
  };

  add('Обложка', `Обложка «${episode.title}»`, episode.coverAsset || 'cover');

  for (const slide of episode.storySlides || []) {
    add('Сюжетный пролог', slide.title, slide.assetKey);
  }

  const endings = episode.debriefing?.endings || {};
  const addedEndingKeys = new Set();
  for (const endObj of Object.values(endings)) {
    if (endObj.assetKey && !addedEndingKeys.has(endObj.assetKey)) {
      addedEndingKeys.add(endObj.assetKey);
      add('Финальные сцены', endObj.badge, endObj.assetKey);
    }
  }

  for (const r of episode.rumorDeck || []) {
    add('Карточки вбросов (8)', `Вброс № ${r.number}: ${r.title}`, r.assetKey);
  }

  for (const c of episode.clueDeck || []) {
    add('Карточки улик (8)', `Конверт № ${c.number}: ${c.coverTitle}`, c.assetKey);
  }

  for (const loc of episode.locations || []) {
    add('Локации карты (6)', loc.name, loc.assetKey);
  }

  for (const dept of episode.departments || []) {
    if (dept.assetKey) {
      add('Отделы штаба (5, опц.)', `Стол № ${dept.number}: ${dept.shortName}`, dept.assetKey);
    }
  }

  return items;
}

/* ============================================================================
   Рендеринг HTML-слота с мгновенным встроенным fallback и автоподстановкой фото
   ============================================================================ */

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Генерирует контейнер `.media-slot`.
 * Сразу показывает красивую встроенную векторную/UI-графику, а `hydrateMediaSlots`
 * мгновенно заменяет её реальной фотографией, если она есть в `./assets/` или IndexedDB.
 */
export function renderMediaSlotHtml({
  episode,
  assetKey,
  alt = '',
  fallbackType = 'generic',
  fallbackData = {},
  contain = false,
  className = ''
}) {
  const basePath = buildAssetBasePath(episode, assetKey);
  const cached = overrideCache.has(basePath)
    ? { found: true, url: overrideCache.get(basePath) }
    : probeCache.get(basePath);

  const modeClass = contain ? 'media-contain' : '';

  if (cached && cached.found && cached.url) {
    return `
      <div class="media-slot ${modeClass} ${className}" data-media-base="${escapeHtml(basePath)}" data-media-alt="${escapeHtml(alt)}" data-media-hydrated="1">
        <img class="media-photo" src="${escapeHtml(cached.url)}" alt="${escapeHtml(alt)}" loading="lazy" />
      </div>
    `;
  }

  return `
    <div class="media-slot ${modeClass} ${className}" data-media-base="${escapeHtml(basePath)}" data-media-alt="${escapeHtml(alt)}">
      ${renderBuiltInFallback(fallbackType, fallbackData)}
    </div>
  `;
}

/**
 * Асинхронно проверяет все непроверенные `.media-slot` в указанном контейнере
 * и подставляет найденные фотографии из `./assets/` или IndexedDB.
 */
export function hydrateMediaSlots(rootEl = document) {
  const slots = rootEl.querySelectorAll('.media-slot[data-media-base]:not([data-media-hydrated="1"])');
  slots.forEach((slot) => {
    const basePath = slot.getAttribute('data-media-base');
    const alt = slot.getAttribute('data-media-alt') || '';
    slot.setAttribute('data-media-hydrated', '1');

    resolveMediaAsset(basePath).then((res) => {
      if (!res.found || !res.url) return;
      if (!slot.isConnected) return;
      slot.innerHTML = `<img class="media-photo" src="${escapeHtml(res.url)}" alt="${escapeHtml(alt)}" />`;
    });
  });
}

/* ============================================================================
   Богатая библиотека встроенных SVG / UI-макетов (работает без единой картинки)
   ============================================================================ */

export function renderBuiltInFallback(type, data = {}) {
  switch (type) {
    /* --- Обложка Части 1 «Вирус слуха» --- */
    case 'episode-cover':
      return `
        <div class="media-fallback-card" style="background: radial-gradient(circle at 20% 20%, rgba(245,158,11,0.28), transparent 52%), radial-gradient(circle at 82% 80%, rgba(239,68,68,0.3), transparent 50%), linear-gradient(145deg, #101829, #090D16); color: #F8FAFC;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="badge badge-danger">ЭПИЗОД 01 • КЕЙС-СИМУЛЯТОР</span>
            <span class="mono" style="font-size:0.78rem;color:#FBBF24;font-weight:800;">ДЕДЛАЙН 18:00</span>
          </div>
          <div style="margin-block:auto;padding-block:12px;">
            <svg viewBox="0 0 280 120" width="100%" height="120" aria-hidden="true">
              <defs>
                <linearGradient id="covGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#F59E0B" />
                  <stop offset="100%" stop-color="#EF4444" />
                </linearGradient>
              </defs>
              <circle cx="140" cy="60" r="46" fill="none" stroke="url(#covGrad)" stroke-width="2" stroke-dasharray="6 5" opacity="0.7" />
              <circle cx="140" cy="60" r="28" fill="rgba(239,68,68,0.16)" stroke="#F87171" stroke-width="1.5" />
              <line x1="40" y1="30" x2="112" y2="54" stroke="#38BDF8" stroke-width="1.5" opacity="0.75" />
              <line x1="45" y1="92" x2="114" y2="68" stroke="#34D399" stroke-width="1.5" opacity="0.75" />
              <line x1="238" y1="34" x2="168" y2="54" stroke="#FBBF24" stroke-width="1.5" opacity="0.75" />
              <line x1="235" y1="88" x2="168" y2="68" stroke="#C084FC" stroke-width="1.5" opacity="0.75" />
              <circle cx="40" cy="30" r="6" fill="#38BDF8" />
              <circle cx="45" cy="92" r="6" fill="#34D399" />
              <circle cx="238" cy="34" r="6" fill="#FBBF24" />
              <circle cx="235" cy="88" r="6" fill="#C084FC" />
              <path d="M140 36c2 8-5 12-5 19 0 5 4 8 8 8 2 0 4-1 5-2-2 8-8 14-16 14-9 0-15-6-15-15 0-10 8-15 13-22 2-2 4-3 10-2z" fill="#F59E0B" />
              <path d="M146 44c4 5 10 10 10 18 0 7-5 13-13 13 4-3 6-7 6-11 0-5-3-10-3-20z" fill="#EF4444" />
            </svg>
            <div style="text-align:center;margin-top:4px;">
              <div style="font-size:1.35rem;font-weight:900;letter-spacing:-0.02em;">ВИРУС СЛУХА</div>
              <div style="font-size:0.82rem;color:#CBD5E1;">Дело о краденом гранте • 300 000 ₽</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.74rem;color:#94A3B8;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
            <span>6 локаций кампуса</span>
            <span>8 улик • 8 вбросов</span>
          </div>
        </div>
      `;

    /* --- Сюжетные слайды пролога --- */
    case 'story-award':
      return `
        <div class="media-fallback-card" style="background: radial-gradient(circle at 50% 25%, rgba(245,158,11,0.28), transparent 60%), #101726; color:#F8FAFC; padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="badge badge-brand">КЕЙС-ЧЕМПИОНАТ • ФИНАЛ</span>
            <span class="mono" style="color:#34D399;font-weight:800;">11:30</span>
          </div>
          <div style="text-align:center;padding:24px 12px;border:1px solid rgba(251,191,36,0.4);border-radius:16px;background:rgba(15,23,42,0.7);">
            <div style="font-size:0.8rem;letter-spacing:0.12em;color:#FBBF24;font-weight:800;">СЕРТИФИКАТ ПОБЕДИТЕЛЯ</div>
            <div style="font-size:2.1rem;font-weight:900;margin:8px 0;color:#FFFFFF;">300 000 ₽</div>
            <div style="font-size:1rem;font-weight:700;color:#CBD5E1;">Марина Соколова • 3 курс, Медиакоммуникации</div>
            <div style="margin-top:12px;display:inline-flex;gap:8px;flex-wrap:wrap;justify-content:center;">
              <span class="badge badge-success">Грант на студенческое медиа</span>
              <span class="badge badge-info">Оплачиваемая стажировка</span>
            </div>
          </div>
          <div style="font-size:0.8rem;color:#94A3B8;text-align:center;">Подписание договора с креативным агентством назначено на 18:00</div>
        </div>
      `;

    case 'story-telegram':
      return `
        <div style="width:100%;padding:16px;">
          <div class="mock-tg-card">
            <div class="mock-tg-header">
              <span class="mock-tg-channel">⚡ Сливы кампуса</span>
              <span class="badge badge-danger">13:42 • 4 218 подп.</span>
            </div>
            <div class="mock-tg-body">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:10px;border-radius:8px;background:#0F172A;border:1px solid rgba(255,255,255,0.12);text-align:center;">
                  <div style="font-size:0.7rem;color:#94A3B8;">СЛАЙД МАРИНЫ</div>
                  <div style="height:46px;margin-top:6px;border-radius:6px;background:linear-gradient(135deg,#2563EB,#06B6D4);opacity:0.85;"></div>
                </div>
                <div style="padding:10px;border-radius:8px;background:#0F172A;border:1px solid rgba(239,68,68,0.45);text-align:center;">
                  <div style="font-size:0.7rem;color:#FCA5A5;">ИНДИ-ДИЗАЙНЕР (?)</div>
                  <div style="height:46px;margin-top:6px;border-radius:6px;background:linear-gradient(135deg,#1D4ED8,#0891B2);opacity:0.85;"></div>
                </div>
              </div>
              <div class="mock-tg-quote">
                [обрезанная переписка • имя скрыто]<br/>
                «Спасибо огромное, без вашей помощи мы бы точно не протащили этот проект, завтра переведу деньги за работу»
              </div>
              <div style="font-weight:700;color:#F8FAFC;">
                🔥 Вот так на нашем факультете покупают жюри и воруют чужие концепты. Агентству норм отдавать 300К за такое?!
              </div>
            </div>
            <div class="mock-tg-footer">
              <span>😡 312 • 🤡 184 • 🔥 96</span>
              <span>👁 2 840 • ↪ 412 репостов</span>
            </div>
          </div>
        </div>
      `;

    case 'story-mission':
      return `
        <div class="media-fallback-card" style="background:linear-gradient(155deg,#0F172A,#182235);color:#F8FAFC;padding:22px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="badge badge-live">СВОДКА НА 14:00</span>
            <span class="mono" style="color:#FBBF24;font-weight:800;">ДОВЕРИЕ 7 / 10</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-block:12px;">
            <div style="padding:12px;border-radius:10px;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.45);">
              <div style="font-size:0.74rem;color:#FCA5A5;font-weight:800;">ОНЛАЙН-ОЧАГИ</div>
              <div style="margin-top:6px;font-size:0.86rem;">• Сливы кампуса: <strong>3 🔥</strong></div>
              <div style="font-size:0.86rem;">• Потоковый чат: <strong>2 🔥</strong></div>
              <div style="font-size:0.86rem;color:#94A3B8;">• Соцсети партнера: 0</div>
            </div>
            <div style="padding:12px;border-radius:10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);">
              <div style="font-size:0.74rem;color:#FCD34D;font-weight:800;">ОФЛАЙН-ОЧАГИ</div>
              <div style="margin-top:6px;font-size:0.86rem;">• Коворкинг: <strong>1 🔥</strong></div>
              <div style="font-size:0.86rem;color:#94A3B8;">• Студсовет: 0</div>
              <div style="font-size:0.86rem;color:#94A3B8;">• Деканат: 0</div>
            </div>
          </div>
          <div style="padding:10px 12px;border-radius:10px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.45);font-size:0.84rem;color:#A7F3D0;">
            Цель победы: ≥ 3 истинные улики + «Официальное опровержение» в Раунде 4 + 0 искр + Доверие ≥ 5.
          </div>
        </div>
      `;

    /* --- Макеты 8 карточек вбросов --- */
    case 'rumor-stickers':
      return renderRumorMockup('ЧАТ ПОТОКА • МЕМ-БЕСЕДА', 'Стикерпак «Грантоедка»', '😂 🤡 💸 Переслано 68 раз', [
        '«Ловите свежий стикерпак с защиты 😂»',
        '«Когда презентация сама себя не купит 💸»',
        '«Ну и классика — отличница года 🤡»'
      ], '#EF4444');

    case 'rumor-raid':
      return renderRumorMockup('СОЦСЕТИ АГЕНТСТВА-ПАРТНЕРА', 'Набег комментаторов', '#ОтменитьГрант • 142 комментария за 15 мин', [
        '@anon_campus: «Вы вообще проверяете, кому отдаёте 300 000 ₽?!»',
        '@design_watch: «Позор агентству за поддержку плагиата! #ОтменитьГрант»',
        '@user991: «Отписываюсь, пока не отмените итоги!»'
      ], '#F97316');

    case 'rumor-ai-witness':
      return renderRumorMockup('СЛИВЫ КАМПУСА • АПДЕЙТ', '«Свидетель с нейросетью»', 'Анонимное сообщение в предложку', [
        '«Сидел вчера за соседним столом в коворкинге: у неё были открыты 4 вкладки нейросетей!»',
        '«Слайды сгенерированы за одну ночь, зуб даю!»',
        'Студсовет уже репостит скрин в рабочий чат…'
      ], '#EAB308');

    case 'rumor-silence':
      return renderRumorMockup('ЛИЧНЫЕ СООБЩЕНИЯ • КОВОРКИНГ', '«Убери мою фамилию из титров»', 'Шкала Доверия -1 немедленно', [
        'Одногруппник 1: «Марин, без обид, сними мою фамилию со слайда, мне проблемы не нужны»',
        'Одногруппник 2: «Давай я тоже выйду из проекта, сейчас токсично»',
        'Марина открывает бланк отказа от гранта…'
      ], '#DC2626');

    case 'rumor-dean':
      return renderRumorMockup('ВХОДЯЩИЙ ЗВОНОК • ДЕКАНАТ', '«Подписание договора заморожено»', 'PR-директор агентства → Замдекана', [
        '«Коллеги, под нашими постами рейд. Мы ставим контракт на паузу до документальных разъяснений».',
        'Замдекана: «Срочно решите это к вечеру, нам репутационный скандал не нужен!»'
      ], '#F59E0B');

    case 'rumor-dilemma':
      return renderRumorMockup('ЗАКРЫТЫЙ ЧАТ • КАРТА-ЛОВУШКА № 6', 'Предложение «Чёрного PR»', 'ЭТИЧЕСКАЯ ДИЛЕММА • 15 СЕКУНД', [
        '«Есть 300 бот-аккаунтов — снесём "Сливы кампуса" жалобами за 10 минут!»',
        '«Плюс сольём старые переписки предполагаемого админа. Минус 4 очага сразу — жмём кнопку?»'
      ], '#F59E0B');

    case 'rumor-ultimatum':
      return renderRumorMockup('ОФИЦИАЛЬНОЕ ПИСЬМО • 17:00', 'Ультиматум агентства', 'ДО ДЕДЛАЙНА 1 ЧАС', [
        '«Если ровно к 18:00 факультет не опубликует доказательный разбор ситуации, грант 300 000 ₽ и стажировка будут переданы команде со второго места».',
        'Таймер запущен: последний раунд!'
      ], '#EF4444');

    case 'rumor-illusion':
      return renderRumorMockup('ИНФОРМАЦИОННЫЙ ФОН • 17:15', '«Дыма без огня не бывает»', '+1 жетон в КАЖДЫЙ очаг с ≥ 2 жетонами', [
        '«Да может и не крала, но что-то там точно мутное…»',
        '«Осадочек всё равно остался, столько раз уже писали!»',
        'Непотушенные очаги разгораются сами собой.'
      ], '#C084FC');

    /* --- Макеты 8 конвертов улик --- */
    case 'clue-figma':
      return renderClueMockup('FIGMA VERSION HISTORY + БРИФ', true, 'ЛОГ ИСХОДНИКОВ • 42 ИТЕРАЦИИ', [
        'v1.0 (21 день назад) — черновые вайрфреймы (автор: m.sokolova)',
        'v19.4 (12 дней назад) — подключение UI-кита агентства из брифа',
        'v42.0 (вчера, 21:14) — финальная сборка презентации',
        'ВЫВОД: шрифты и сетка — официальный шаблон из брифа конкурса.'
      ]);

    case 'clue-receipt':
      return renderClueMockup('ЭКСПОРТ ЧАТА + БАНКОВСКИЙ ЧЕК', true, 'НЕОБРЕЗАННЫЙ ОРИГИНАЛ', [
        'Чат: «Артём К. (выпускник, монтажёр)» — не член жюри!',
        'Контекст: срочный ночной рендер титров для учебного ролика',
        'Чек СБП: 2 000 ₽ • получатель Артём К. • время совпадает до минуты',
        'ВЫВОД: скриншот «Сливов» был намеренно обрезан сверху.'
      ]);

    case 'clue-jury':
      return renderClueMockup('ПРОТОКОЛ ОРГКОМИТЕТА', true, 'СЛЕПОЕ РЕЦЕНЗИРОВАНИЕ', [
        'Шифр работы Марины в таблице жюри: ID-408 (без ФИО)',
        'Оценки 5 независимых экспертов: 94 / 92 / 96 / 91 / 95',
        'Состав жюри трека: обвиняемый преподаватель НЕ ВХОДИТ в список',
        'ВЫВОД: подкуп или предвзятость жюри исключены регламентом.'
      ]);

    case 'clue-designer':
      return renderClueMockup('ОФИЦИАЛЬНЫЙ ОТВЕТ АВТОРА', true, 'ПРЯМОЙ ЗАПРОС ИНДИ-ДИЗАЙНЕРУ', [
        'От: @indie_studio_official (верифицированный аккаунт)',
        '«Полгода назад мы делали открытый воркшоп для студентов. Я сам разрешил развивать сетку и приём в учебных кейсах».',
        '«Никаких претензий к Марине у меня нет, удачи с проектом!»'
      ]);

    case 'clue-circle':
      return renderClueMockup('ВИДЕОСООБЩЕНИЕ В TELEGRAM', false, 'ЭМОЦИОНАЛЬНОЕ ПОРУЧИТЕЛЬСТВО', [
        '● Кружочек (01:32) от лучшей подруги Марины',
        '«Я знаю её с 1-го курса! Она святой человек, она плачет, прекратите травлю!»',
        'ФАКТОВ И ДОКУМЕНТОВ: 0 • В доказательную базу не годится.'
      ]);

    case 'clue-behance':
      return renderClueMockup('ЗАЧЁТНАЯ КНИЖКА И BEHANCE', false, 'ЛОВУШКА: ЭФФЕКТ ОРЕОЛА', [
        'Средний балл за 5 семестров: 5.0',
        'Победы в двух прошлых хакатонах (2024–2025)',
        'ПРОБЛЕМА: прошлые заслуги не доказывают честность текущего проекта.'
      ]);

    case 'clue-dossier':
      return renderClueMockup('СКРИНЫ КОММЕНТАРИЕВ СТУДЕНТА', false, 'ЛОВУШКА: AD HOMINEM', [
        'Подборка токсичных сообщений студента, не прошедшего отбор',
        'Гипотеза: «возможно, это админ канала Сливы кампуса»',
        'ПРОБЛЕМА: переход на личность не опровергает обвинения против Марины.'
      ]);

    case 'clue-bot':
      return renderClueMockup('СКРИН БОТА + КОММЕНТ «ЮРИСТА»', false, 'ЛОВУШКА: ЛОЖНЫЙ АВТОРИТЕТ', [
        'Бесплатный бот-антиплагиат текста: «Уникальность 84%» (не проверяет дизайн!)',
        'Коммент @anon_lawyer77: «Тут чистая 128.1 УК РФ, всех посадят»',
        'ПРОБЛЕМА: невалидный инструмент и анонимный псевдоэксперт.'
      ]);

    /* --- Постеры 6 локаций --- */
    case 'location':
      return renderLocationPoster(data);

    /* --- Финальные сцены --- */
    case 'ending-win':
      return renderEndingPoster('ПОЛНАЯ ПОБЕДА', '300 000 ₽ грант подписан • 0 очагов • Репутация спасена', '#10B981');
    case 'ending-pyrrhic':
      return renderEndingPoster('ПИРРОВА ПОБЕДА', 'Грант сохранён, но доверие в критической зоне (1–4)', '#F59E0B');
    case 'ending-lose':
      return renderEndingPoster('КРИЗИС ПРОИГРАН', 'Информационный пожар не остановлен до дедлайна', '#EF4444');

    default:
      return `
        <div class="media-fallback-card" style="align-items:center;justify-content:center;text-align:center;">
          <div style="font-weight:800;font-size:0.95rem;">${escapeHtml(data.title || 'Медиапожарный')}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);">Слот готов для фото из ./assets/</div>
        </div>
      `;
  }
}

function renderRumorMockup(channel, headline, subline, lines, accent) {
  return `
    <div style="width:100%;padding:14px;">
      <div class="mock-tg-card" style="border-color:${accent};">
        <div class="mock-tg-header" style="border-bottom-color:${accent}44;">
          <span class="mock-tg-channel" style="color:${accent};">🔥 ${escapeHtml(channel)}</span>
          <span class="mono" style="font-size:0.72rem;color:#CBD5E1;">LIVE</span>
        </div>
        <div class="mock-tg-body">
          <div style="font-size:1.05rem;font-weight:900;color:#FFFFFF;">${escapeHtml(headline)}</div>
          <div style="font-size:0.78rem;color:${accent};font-weight:700;">${escapeHtml(subline)}</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${lines
              .map(
                (line) => `
              <div style="padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border-left:3px solid ${accent};font-size:0.82rem;color:#E2E8F0;">
                ${escapeHtml(line)}
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderClueMockup(docType, isTrue, subtitle, rows) {
  const accent = isTrue ? '#10B981' : '#EF4444';
  const badgeText = isTrue ? 'ВЕРИФИЦИРОВАННЫЙ ИСТОЧНИК' : 'НЕВАЛИДНЫЙ / ШУМ';
  return `
    <div style="width:100%;padding:12px;">
      <div class="mock-doc-card" style="border-color:${accent};">
        <div class="mock-doc-head">
          <span class="mono" style="font-size:0.74rem;font-weight:800;color:${accent};">${escapeHtml(docType)}</span>
          <span class="badge ${isTrue ? 'badge-success' : 'badge-danger'}">${badgeText}</span>
        </div>
        <div style="font-weight:800;font-size:0.95rem;">${escapeHtml(subtitle)}</div>
        <div class="mock-doc-code">
          ${rows.map((r) => `<div>› ${escapeHtml(r)}</div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderLocationPoster(data = {}) {
  const isOnline = data.env === 'online';
  const color = isOnline ? '#38BDF8' : '#34D399';
  const bg = isOnline
    ? 'linear-gradient(135deg, rgba(6,182,212,0.22), rgba(15,23,42,0.92))'
    : 'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(15,23,42,0.92))';

  const icons = {
    tg: '<path d="M21 5L2 12.5l7 2.2L18 8l-6.8 8.3.2 4.7 3.2-3 4.2 3L21 5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    chat: '<path d="M4 6h16v10H8l-4 3V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="11" r="1" fill="currentColor"/><circle cx="12" cy="11" r="1" fill="currentColor"/><circle cx="15" cy="11" r="1" fill="currentColor"/>',
    partner: '<path d="M3 20h18M5 20V8l7-4 7 4v12M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    coworking: '<path d="M5 10h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-5zm11 1h2a2 2 0 0 1 0 4h-2M8 6c0-1.5 1-2 1-3m4 3c0-1.5 1-2 1-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    council: '<circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M15 14c2.8 0 5 1.8 5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    dean: '<path d="M12 3L2 8l10 5 10-5-10-5zM6 10.5V16c0 1.8 2.7 3 6 3s6-1.2 6-3v-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  };

  return `
    <div style="width:100%;height:100%;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:${bg};color:#F8FAFC;">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
        <span class="mono" style="font-size:0.68rem;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:0.06em;">
          ${isOnline ? '● ОНЛАЙН-СРЕДА' : '● ОФЛАЙН-СРЕДА'}
        </span>
        <span style="font-size:0.78rem;color:#CBD5E1;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
          ${escapeHtml(data.description || '')}
        </span>
      </div>
      <div style="width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,0.08);border:1px solid ${color}55;color:${color};flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          ${icons[data.icon] || icons.chat}
        </svg>
      </div>
    </div>
  `;
}

function renderEndingPoster(title, subtitle, accent) {
  return `
    <div class="media-fallback-card" style="background:radial-gradient(circle at 50% 25%, ${accent}38, transparent 60%), #0E1525;color:#F8FAFC;align-items:center;justify-content:center;text-align:center;padding:28px;">
      <div style="width:72px;height:72px;border-radius:20px;display:grid;place-items:center;background:${accent}22;border:2px solid ${accent};color:${accent};font-size:2rem;font-weight:900;">
        ${accent === '#10B981' ? '✓' : accent === '#F59E0B' ? '!' : '✕'}
      </div>
      <div style="font-size:1.5rem;font-weight:900;letter-spacing:0.04em;color:${accent};">${escapeHtml(title)}</div>
      <div style="font-size:0.9rem;color:#CBD5E1;max-width:32ch;">${escapeHtml(subtitle)}</div>
    </div>
  `;
      }
