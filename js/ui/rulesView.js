/**
 * МЕДИАПОЖАРНЫЙ — Встроенная брошюра правил, глоссарий и Медиа-менеджер (assets/)
 *
 * Вкладки:
 * - rules       — Ход раунда и формат очной партии
 * - departments — 5 отделов Антикризисного штаба (2 ОД, действия, чек-листы)
 * - triggers    — Триггеры Фазы 3, Шкала Доверия, Дилемма № 6 и исходы
 * - glossary    — Глоссарий медиапсихологических феноменов
 * - hotkeys     — Шпаргалка горячих клавиш ведущего
 * - media       — Медиа-менеджер ./assets/ (диагностика + drag-and-drop примерка фото в IndexedDB)
 */

import {
  clearAllMediaOverrides,
  escapeHtml,
  getEpisodeMediaManifest,
  removeMediaOverride,
  resolveMediaAsset,
  saveMediaOverride
} from '../media.js';

const TABS = [
  { id: 'rules', label: '⏱️ Ход раунда' },
  { id: 'departments', label: '🏛️ 5 отделов' },
  { id: 'triggers', label: '🔥 Триггеры и исходы' },
  { id: 'glossary', label: '🧠 Глоссарий' },
  { id: 'hotkeys', label: '⌨️ Горячие клавиши' },
  { id: 'media', label: '🖼️ Медиа-менеджер (assets)' }
];

let activeTab = 'rules';
let mediaCategoryFilter = 'all';

export function renderRulesModalContent(mount, ep, initialTab = 'rules', actions = {}) {
  if (!mount || !ep) return;
  activeTab = TABS.some((t) => t.id === initialTab) ? initialTab : 'rules';
  paintRulesView(mount, ep, actions);
}

function paintRulesView(mount, ep, actions) {
  mount.innerHTML = `
    <div class="tabs-bar" role="tablist" aria-label="Разделы справочника">
      ${TABS.map(
        (t) => `
        <button
          type="button"
          class="tab-btn ${activeTab === t.id ? 'is-active' : ''}"
          data-rules-tab="${t.id}"
          role="tab"
          aria-selected="${activeTab === t.id}"
        >
          ${t.label}
        </button>
      `
      ).join('')}
    </div>

    <div id="rules-tab-content">
      ${renderTabBody(activeTab, ep)}
    </div>
  `;

  mount.querySelectorAll('[data-rules-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-rules-tab');
      paintRulesView(mount, ep, actions);
    });
  });

  if (activeTab === 'media') {
    hydrateMediaManagerTable(mount, ep, actions);
  }
}

function renderTabBody(tabId, ep) {
  switch (tabId) {
    case 'rules':
      return renderRoundRulesTab(ep);
    case 'departments':
      return renderDepartmentsTab(ep);
    case 'triggers':
      return renderTriggersTab(ep);
    case 'glossary':
      return renderGlossaryTab(ep);
    case 'hotkeys':
      return renderHotkeysTab();
    case 'media':
      return renderMediaManagerSkeleton(ep);
    default:
      return renderRoundRulesTab(ep);
  }
}

/* ============================================================================
   Вкладка 1: Ход раунда и регламент очной партии
   ============================================================================ */

function renderRoundRulesTab(ep) {
  return `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div class="panel" style="background:var(--bg-surface-2);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <h3 style="font-size:1.1rem;">Часть ${ep.number}: «${escapeHtml(ep.title)}: ${escapeHtml(ep.subtitle)}»</h3>
          <span class="badge badge-brand">${escapeHtml(ep.meta.duration)}</span>
        </div>
        <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.58;">
          ${escapeHtml(ep.description)}
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
          <span class="badge badge-info">👥 ${escapeHtml(ep.meta.players)}</span>
          <span class="badge badge-success">🎯 Стартовое Доверие: ${ep.initialState.trust}/${ep.initialState.maxTrust}</span>
          <span class="badge badge-danger">🔥 Стартовые искры: 6 (Сливы 3, Чат 2, Коворкинг 1)</span>
        </div>
      </div>

      <h3 style="font-size:1.05rem;">Пошаговый ритм каждого раунда (5 минут)</h3>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
        <article class="panel" style="padding:16px;">
          <span class="badge badge-danger">ФАЗА 1 • 30 СЕК</span>
          <h4 style="margin-top:8px; font-size:0.98rem;">Новая волна (2 вброса)</h4>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:6px; line-height:1.5;">
            Ведущий открывает 2 карты вбросов текущего раунда и применяет их эффекты на карту. Информационный взрыв (4+) в Фазе 1 НЕ срабатывает мгновенно — у штаба есть текущий раунд на реакцию.
          </p>
        </article>

        <article class="panel" style="padding:16px;">
          <span class="badge badge-brand">ФАЗА 2А • 2:00</span>
          <h4 style="margin-top:8px; font-size:0.98rem;">Совещание 5 столов</h4>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:6px; line-height:1.5;">
            Каждый стол получает ровно <strong>2 ОД</strong> (всего 10 ОД на штаб) и планирует ходы на бумажном маршрутном листе. В Раунде 3 сразу после обсуждения — особый шаг на <strong>15 сек</strong>: Этическая дилемма № 6.
          </p>
        </article>

        <article class="panel" style="padding:16px;">
          <span class="badge badge-info">ФАЗА 2Б • 2:00</span>
          <h4 style="margin-top:8px; font-size:0.98rem;">Выход спикеров (Эстафета)</h4>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:6px; line-height:1.5;">
            От каждого стола выступает <strong>новый</strong> дежурный спикер (25 сек). Порядок в Р1–3: <strong>1→2→3→4→5</strong>; в Р4: <strong>1→2→3→5→4</strong> (40 сек на Официальное опровержение). Действия засчитываются только после речи!
          </p>
        </article>

        <article class="panel" style="padding:16px;">
          <span class="badge badge-danger">ФАЗА 3 • 30 СЕК</span>
          <h4 style="margin-top:8px; font-size:0.98rem;">Проверка поля</h4>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:6px; line-height:1.5;">
            Проверка 6 локаций без щита на Информационный взрыв (4+ → -2 Доверие) и Эффект молчания (2–3 → +1 жетон). В конце Фазы 3 все зелёные щиты снимаются, а неиспользованные ОД сгорают.
          </p>
        </article>
      </div>

      <div class="panel" style="border-color:var(--accent-brand-border); background:var(--accent-brand-soft);">
        <strong style="font-size:0.92rem; color:var(--accent-brand-bright);">Правило «Эстафета голоса» и честная работа с конвертами</strong>
        <ul class="gm-bullet-list" style="margin-top:6px;">
          <li>Один студент не может выступать спикером стола дважды за игру — за 4 раунда к микрофону выходят 4 разных человека от каждого стола.</li>
          <li>Стол № 1 (OSINT) видит только обложки 8 конвертов. Вскрытие строго ограничено бюджетом: <strong>1 ОД = 1 конверт</strong>.</li>
          <li>В Раунде 3 ведущий не запрещает «чёрный PR»: если аудитория выбирает снос канала, выбор фиксируется на экране и срабатывает штраф Эффекта Стрейзанд (-3 к Доверию).</li>
        </ul>
      </div>
    </div>
  `;
}

/* ============================================================================
   Вкладка 2: Справочник 5 отделов Антикризисного штаба
   ============================================================================ */

function renderDepartmentsTab(ep) {
  return `
    <div style="display:flex; flex-direction:column; gap:14px;">
      ${ep.departments
        .map(
          (dept) => `
        <article class="panel" style="padding:16px; border-left:4px solid ${dept.colorVar};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div>
              <span class="mono" style="font-size:0.74rem; font-weight:800; color:${dept.colorVar};">СТОЛ № ${dept.number}</span>
              <h3 style="font-size:1.05rem;">${escapeHtml(dept.name)}</h3>
            </div>
            <span class="badge">${escapeHtml(dept.zoneLabel)} • 2 ОД/раунд</span>
          </div>
          <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:10px;">${escapeHtml(dept.roleSummary)}</p>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:26%;">Действие</th>
                <th style="width:12%;">Цена</th>
                <th style="width:26%;">Условие</th>
                <th>Эффект</th>
              </tr>
            </thead>
            <tbody>
              ${dept.actions
                .map(
                  (a) => `
                <tr>
                  <td><strong>${escapeHtml(a.name)}</strong></td>
                  <td class="mono"><strong>${a.cost} ОД</strong>${a.draftCost ? `<br/><span style="font-size:0.74rem;color:var(--accent-success-bright);">${a.draftCost} ОД (драфт)</span>` : ''}</td>
                  <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(a.requirementText)}</td>
                  <td style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(a.summary)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </article>
      `
        )
        .join('')}
    </div>
  `;
}

/* ============================================================================
   Вкладка 3: Системные триггеры Фазы 3, Дилемма № 6 и условия исхода
   ============================================================================ */

function renderTriggersTab(ep) {
  return `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
        <article class="panel" style="border-color:var(--accent-danger-border); background:var(--accent-danger-soft);">
          <span class="badge badge-danger">ТРИГГЕР 1 • 4+ КРАСНЫХ ЖЕТОНОВ</span>
          <h3 style="margin-top:8px; font-size:1.05rem;">💥 Информационный взрыв</h3>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin-top:6px; line-height:1.55;">
            Если в конце Фазы 2 на незащищённой локации осталось <strong>4 или более</strong> красных жетонов, в Фазе 3 локация «взрывается» → Шкала Доверия падает на <strong>-2</strong>. Эффект молчания сверху на эту локацию не добавляется.
          </p>
        </article>

        <article class="panel" style="border-color:var(--accent-brand-border); background:var(--accent-brand-soft);">
          <span class="badge badge-brand">ТРИГГЕР 2 • 2–3 КРАСНЫХ ЖЕТОНА</span>
          <h3 style="margin-top:8px; font-size:1.05rem;">⚠️ Эффект молчания</h3>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin-top:6px; line-height:1.55;">
            Если на незащищённой локации в Фазе 3 осталось <strong>2 или 3</strong> красных жетона, слух разрастается сам по себе → на локацию добавляется <strong>+1 красный жетон</strong>.
          </p>
        </article>

        <article class="panel" style="border-color:var(--accent-success-border); background:var(--accent-success-soft);">
          <span class="badge badge-success">ЗАЩИТА • ДО КОНЦА РАУНДА</span>
          <h3 style="margin-top:8px; font-size:1.05rem;">🛡️ Зелёный «Щит модерации»</h3>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin-top:6px; line-height:1.55;">
            Ставится в Фазе 2 и полностью защищает локацию от <strong>обоих</strong> негативных триггеров Фазы 3 (и от взрыва 4+, и от Эффекта молчания). В конце Фазы 3 все щиты снимаются с поля.
          </p>
        </article>
      </div>

      <article class="panel">
        <h3 style="font-size:1.05rem; margin-bottom:10px;">Условия исхода партии (Дедлайн ${escapeHtml(ep.meta.deadline || '18:00')})</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:24%;">Исход</th>
              <th>Условия достижения</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="badge badge-success">🏆 Полная победа</span></td>
              <td>В Раунде 4 Стол № 4 зачитал корректное <strong>Официальное опровержение</strong> (на базе <strong>≥ 3 истинных улик</strong> по формуле «Сэндвич правды»), на карте <strong>0 красных жетонов</strong>, Шкала Доверия <strong>5–10</strong>.</td>
            </tr>
            <tr>
              <td><span class="badge badge-brand">⚠️ Пиррова победа</span></td>
              <td>Официальное опровержение опубликовано и собрано ≥ 3 истинных улик, но Шкала Доверия к финалу упала в критическую зону <strong>1–4</strong>.</td>
            </tr>
            <tr>
              <td><span class="badge badge-danger">✕ Поражение</span></td>
              <td><strong>Мгновенное</strong> — при падении Шкалы Доверия до <strong>0</strong> в любом раунде; либо <strong>по дедлайну</strong> в конце Раунда 4, если не собрано ≥ 3 истинных улик или не опубликовано Официальное опровержение.</td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  `;
}

/* ============================================================================
   Вкладка 4: Глоссарий медиапсихологии
   ============================================================================ */

function renderGlossaryTab(ep) {
  const list = ep.debriefing?.glossary || [];
  return `
    <div class="phenomena-grid">
      ${list
        .map(
          (g) => `
        <article class="panel" style="padding:16px; display:flex; flex-direction:column; gap:8px;">
          <span class="badge badge-indigo" style="align-self:flex-start;">${escapeHtml(g.source)}</span>
          <h3 style="font-size:1rem;">${escapeHtml(g.term)}</h3>
          <p style="font-size:0.84rem; color:var(--text-secondary); line-height:1.52;">${escapeHtml(g.definition)}</p>
        </article>
      `
        )
        .join('')}
    </div>
  `;
}

/* ============================================================================
   Вкладка 5: Горячие клавиши ведущего
   ============================================================================ */

function renderHotkeysTab() {
  const keys = [
    { key: 'Space', desc: 'Старт / Пауза основного таймера текущей фазы' },
    { key: 'S', desc: 'Запуск / Пауза мини-таймера дежурного спикера (25 сек / 40 сек в Р4)' },
    { key: 'Ctrl + Z', desc: 'Отмена последнего шага (стек Undo до 25 действий)' },
    { key: 'H', desc: 'Открыть / скрыть «Шторку подсказок ведущего» (памятка + ручные правки)' },
    { key: 'R', desc: 'Открыть / закрыть Справочник правил и Медиа-менеджер' },
    { key: 'M', desc: 'Включить / выключить звук (Mute)' },
    { key: 'F', desc: 'Полноэкранный режим браузера (удобно для проектора)' },
    { key: '← / →', desc: 'Листание слайдов сюжетного пролога' },
    { key: 'Esc', desc: 'Закрыть текущее модальное окно или Шторку ведущего' }
  ];

  return `
    <div class="panel">
      <h3 style="font-size:1.05rem; margin-bottom:12px;">Шпаргалка горячих клавиш ведущего</h3>
      <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:14px;">
        Клавиши работают на игровом поле и в прологе (автоматически отключаются, когда курсор стоит в текстовом поле ввода).
      </p>
      <table class="data-table">
        <thead>
          <tr><th style="width:150px;">Клавиша</th><th>Действие</th></tr>
        </thead>
        <tbody>
          ${keys
            .map(
              (item) => `
            <tr>
              <td><kbd>${escapeHtml(item.key)}</kbd></td>
              <td>${escapeHtml(item.desc)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ============================================================================
   Вкладка 6: Медиа-менеджер (диагностика ./assets/ + drag-and-drop в IndexedDB)
   ============================================================================ */

function renderMediaManagerSkeleton(ep) {
  const manifest = getEpisodeMediaManifest(ep);
  const categories = ['all', ...Array.from(new Set(manifest.map((m) => m.category)))];

  return `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div class="panel" style="background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="max-width:68ch;">
          <strong style="font-size:0.96rem;">Как подключить фотографии ваших физических карточек и сюжетных сцен</strong>
          <p style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px; line-height:1.5;">
            Положите файлы с указанными именами (<code class="mono">.webp</code>, <code class="mono">.jpg</code>, <code class="mono">.jpeg</code> или <code class="mono">.png</code>) в папку <code class="mono">${escapeHtml(ep.assetsBase)}</code> перед загрузкой на GitHub. Для мгновенной примерки на этом ноутбуке просто перетащите фото на нужную строку ниже — оно сохранится локально в браузере (IndexedDB).
          </p>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <span class="badge badge-info mono" id="media-summary-badge">Проверка слотов…</span>
          <button type="button" class="btn btn-xs btn-outline-danger" data-action="clear-all-overrides">
            🗑️ Сбросить все локальные примерки
          </button>
        </div>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${categories
          .map(
            (cat) => `
          <button
            type="button"
            class="btn btn-xs ${mediaCategoryFilter === cat ? 'is-active' : ''}"
            data-media-cat="${escapeHtml(cat)}"
          >
            ${cat === 'all' ? `Все слоты (${manifest.length})` : escapeHtml(cat)}
          </button>
        `
          )
          .join('')}
      </div>

      <div style="overflow-x:auto; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:74px;">Превью</th>
              <th>Слот и категория</th>
              <th>Ожидаемый путь (GitHub Pages)</th>
              <th style="width:155px;">Статус</th>
              <th style="width:210px;">Локальная примерка (Drag & Drop)</th>
            </tr>
          </thead>
          <tbody id="media-manager-tbody">
            <tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">Сканирование папки ./assets/…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function hydrateMediaManagerTable(mount, ep, actions) {
  const manifest = getEpisodeMediaManifest(ep);

  // Фильтры категорий
  mount.querySelectorAll('[data-media-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mediaCategoryFilter = btn.getAttribute('data-media-cat');
      paintRulesView(mount, ep, actions);
    });
  });

  // Сброс всех локальных примерок
  mount.querySelector('[data-action="clear-all-overrides"]')?.addEventListener('click', async () => {
    await clearAllMediaOverrides();
    actions.onMediaUpdated?.('Локальные примерки изображений очищены.');
    paintRulesView(mount, ep, actions);
  });

  const resolvedList = await Promise.all(
    manifest.map(async (item) => ({
      ...item,
      probe: await resolveMediaAsset(item.basePath)
    }))
  );

  if (!mount.isConnected) return;

  const assetsFoundCount = resolvedList.filter((r) => r.probe.source === 'assets').length;
  const overridesCount = resolvedList.filter((r) => r.probe.source === 'override').length;

  const summaryBadge = mount.querySelector('#media-summary-badge');
  if (summaryBadge) {
    summaryBadge.textContent = `В assets/: ${assetsFoundCount} • Примерка: ${overridesCount} • Встроенная графика: ${
      resolvedList.length - assetsFoundCount - overridesCount
    }`;
  }

  const filtered =
    mediaCategoryFilter === 'all'
      ? resolvedList
      : resolvedList.filter((r) => r.category === mediaCategoryFilter);

  const tbody = mount.querySelector('#media-manager-tbody');
  if (!tbody) return;

  tbody.innerHTML = filtered
    .map((item) => {
      const p = item.probe;
      const thumbHtml =
        p.found && p.url
          ? `<img src="${escapeHtml(p.url)}" alt="" style="width:56px; height:40px; object-fit:cover; border-radius:6px; border:1px solid var(--border-default);" />`
          : `<div style="width:56px; height:40px; border-radius:6px; background:var(--bg-surface-3); border:1px dashed var(--border-default); display:grid; place-items:center; font-size:0.68rem; color:var(--text-muted);">SVG</div>`;

      const statusBadge =
        p.source === 'assets'
          ? `<span class="badge badge-success">✓ Найден (${escapeHtml(p.ext || 'файл')})</span>`
          : p.source === 'override'
          ? `<span class="badge badge-brand">★ Локальное фото</span>`
          : `<span class="badge">Встроенная графика</span>`;

      return `
        <tr data-media-row="${escapeHtml(item.basePath)}">
          <td>${thumbHtml}</td>
          <td>
            <div style="font-weight:700; font-size:0.84rem;">${escapeHtml(item.label)}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(item.category)}</div>
          </td>
          <td>
            <code class="mono" style="font-size:0.74rem; color:var(--accent-info-bright); word-break:break-all;">${escapeHtml(item.basePath)}.jpg</code>
            <div style="font-size:0.7rem; color:var(--text-muted);">также .webp / .png</div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <label class="dropzone-mini" data-dropzone="${escapeHtml(item.basePath)}">
                <span>📂 Загрузить / бросить</span>
                <input type="file" accept="image/*" style="display:none;" data-file-input="${escapeHtml(item.basePath)}" />
              </label>
              ${
                p.source === 'override'
                  ? `<button type="button" class="btn btn-xs btn-ghost" data-remove-override="${escapeHtml(item.basePath)}" title="Вернуть стандартный файл / графику">✕</button>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Загрузка файла через клик или Drag & Drop
  const applyFile = async (basePath, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    await saveMediaOverride(basePath, file);
    actions.onMediaUpdated?.('Изображение применено для предпросмотра (сохранено в IndexedDB).');
    paintRulesView(mount, ep, actions);
  };

  tbody.querySelectorAll('[data-file-input]').forEach((input) => {
    input.addEventListener('change', () => {
      const basePath = input.getAttribute('data-file-input');
      const file = input.files?.[0];
      if (file) applyFile(basePath, file);
    });
  });

  tbody.querySelectorAll('[data-dropzone]').forEach((zone) => {
    const basePath = zone.getAttribute('data-dropzone');
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('is-dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) applyFile(basePath, file);
    });
  });

  tbody.querySelectorAll('[data-remove-override]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const basePath = btn.getAttribute('data-remove-override');
      await removeMediaOverride(basePath);
      actions.onMediaUpdated?.('Локальная примерка удалена.');
      paintRulesView(mount, ep, actions);
    });
  });
}
