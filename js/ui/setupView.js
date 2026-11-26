/**
 * МЕДИАПОЖАРНЫЙ — Экран подготовки к партии (Сетап эпизода)
 * Чек-лист аудитории, пресеты таймера, названия столов, 2-й экран и комплект печати.
 */

import { store } from '../state.js';
import { escapeHtml } from '../media.js';
import { renderBrandSvg } from './hubView.js';

/** Локальное состояние формы сетапа (сохраняется при переключении темы/настроек) */
const setupDraft = {
  checkedItems: new Set(),
  customDeptNames: {}
};

export function renderSetupView(root, actions) {
  const ep = store.getEpisode();
  const checklist = ep.printableHandouts?.hostChecklist || [
    'Рассадить 25–30 студентов за 5 столов (по 5–6 человек) и поставить таблички отделов.',
    'Выложить на Стол № 1 (OSINT) 8 запечатанных конвертов с названиями источников на обложке.',
    'Раздать столам физические памятки действий и маршрутные листы «Эстафета голоса».',
    'Проверить видимость экрана на проекторе или открыть 2-е окно для проектора.',
    'Показать сюжетный пролог и запустить Раунд 1.'
  ];

  const timerModes = Object.entries(ep.timings || {});
  const currentTimerMode = store.prefs.timerMode || 'standard';
  const hidePhenomena = Boolean(store.prefs.hidePhenomena);
  const audienceConnected = Boolean(store.ui.audienceConnected);
  const isLight = store.prefs.theme === 'light';
  const soundOn = store.prefs.soundEnabled;
  const hasSaved = store.hasSavedActiveGame(ep.id);

  const readyCount = setupDraft.checkedItems.size;
  const totalChecks = checklist.length;

  root.innerHTML = `
    <header class="site-header">
      <div class="container site-header-inner">
        <div class="header-brand" data-action="go-hub" role="button" tabindex="0" aria-label="Вернуться на главный экран">
          <div class="brand-mark">
            <div class="brand-icon brand-icon-sm">${renderBrandSvg(20)}</div>
            <div>
              <div class="brand-name" style="font-size:1.05rem;">Медиапожарный</div>
              <div class="brand-sub">Подготовка к партии • Часть ${ep.number}: «${escapeHtml(ep.title)}»</div>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <button type="button" class="btn btn-sm" data-action="go-hub">← На главную</button>
          <button type="button" class="btn btn-sm" data-action="open-rules">📘 Правила</button>
          <button type="button" class="btn btn-sm" data-action="open-media-manager">🖼️ Фото карточек</button>
          <button type="button" class="btn btn-sm" data-action="toggle-sound">
            ${soundOn ? '🔊 Звук' : '🔇 Без звука'}
          </button>
          <button type="button" class="btn btn-sm" data-action="toggle-theme">
            ${isLight ? '🌙 Тёмная' : '☀️ Светлая'}
          </button>
        </div>
      </div>
    </header>

    <main class="container setup-page anim-screen-in">
      <div class="section-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="badge badge-brand">ЧАСТЬ ${ep.number} • ПОДГОТОВКА К ПАРТИИ</span>
            <span class="badge badge-info">${escapeHtml(ep.meta.duration)}</span>
          </div>
          <h1 class="section-title">${escapeHtml(ep.title)}: ${escapeHtml(ep.subtitle)}</h1>
          <p class="section-subtitle">${escapeHtml(ep.tagline)}</p>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          <button type="button" class="btn btn-info" data-action="print-handouts">
            🖨️ Версия для печати (бланки, таблички, брошюра)
          </button>
        </div>
      </div>

      ${
        hasSaved
          ? `
            <div class="resume-banner">
              <div style="font-size:0.9rem;">
                <strong style="color:var(--accent-success-bright);">У вас есть незавершённая партия (Раунд ${store.game.round}/${ep.initialState.totalRounds}, Доверие ${store.game.trust}/10)</strong>
                <div style="color:var(--text-secondary); font-size:0.82rem; margin-top:2px;">
                  Вы можете вернуться прямо на игровое поле или запустить новую партию с нуля ниже.
                </div>
              </div>
              <button type="button" class="btn btn-success btn-sm" data-action="continue-game">
                ↻ Продолжить текущую партию
              </button>
            </div>
          `
          : ''
      }

      <div class="setup-grid">
        <!-- ЛЕВАЯ КОЛОНКА: Чек-лист готовности и настройка 5 столов -->
        <div class="setup-column">
          <section class="panel" aria-labelledby="checklist-heading">
            <div class="panel-header">
              <h2 id="checklist-heading" class="panel-title">📋 Чек-лист готовности аудитории</h2>
              <span class="badge ${readyCount === totalChecks ? 'badge-success' : 'badge-brand'} mono">
                ${readyCount} / ${totalChecks}
              </span>
            </div>

            <div class="checklist-stack">
              ${checklist
                .map((item, idx) => {
                  const isChecked = setupDraft.checkedItems.has(idx);
                  return `
                    <label class="check-row">
                      <input type="checkbox" data-setup-check="${idx}" ${isChecked ? 'checked' : ''} />
                      <span style="font-size:0.88rem; color:${isChecked ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration:${isChecked ? 'line-through' : 'none'};">
                        ${escapeHtml(item)}
                      </span>
                    </label>
                  `;
                })
                .join('')}
            </div>

            <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:0.78rem; color:var(--text-muted);">
              <span>Чек-лист необязателен — можно запускать игру в любой момент.</span>
              <button type="button" class="btn btn-xs btn-ghost" data-action="check-all">
                ${readyCount === totalChecks ? 'Снять отметки' : 'Отметить всё'}
              </button>
            </div>
          </section>

          <section class="panel" aria-labelledby="tables-heading">
            <div class="panel-header">
              <h2 id="tables-heading" class="panel-title">🏛️ 5 столов Антикризисного штаба (опционально)</h2>
              <span class="badge">Можно пропустить</span>
            </div>
            <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:14px;">
              При желании задайте пользовательские названия команд или группы (например, «Группа МК-31»). Если оставить поля пустыми, будут использоваться стандартные названия отделов.
            </p>

            <div style="display:flex; flex-direction:column; gap:10px;">
              ${ep.departments
                .map((dept) => {
                  const val = setupDraft.customDeptNames[dept.id] || '';
                  return `
                    <div style="display:grid; grid-template-columns: 190px 1fr; gap:10px; align-items:center;">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${dept.colorVar}; flex-shrink:0;"></span>
                        <span style="font-size:0.84rem; font-weight:700;">Стол № ${dept.number} • ${escapeHtml(dept.shortName)}</span>
                      </div>
                      <input
                        type="text"
                        class="input-field"
                        data-dept-name-input="${escapeHtml(dept.id)}"
                        value="${escapeHtml(val)}"
                        placeholder="Например: ${escapeHtml(dept.name)}"
                        maxlength="42"
                      />
                    </div>
                  `;
                })
                .join('')}
            </div>
          </section>
        </div>

        <!-- ПРАВАЯ КОЛОНКА: Таймер, Проектор (2-й экран), Шторка и Медиапсихология -->
        <div class="setup-column">
          <section class="panel" aria-labelledby="timer-mode-heading">
            <div class="panel-header">
              <h2 id="timer-mode-heading" class="panel-title">⏱️ Темп и настройки таймера</h2>
              <span class="badge badge-brand">4 раунда</span>
            </div>

            <div class="radio-cards" role="radiogroup" aria-label="Режим таймера">
              ${timerModes
                .map(([key, cfg]) => {
                  const selected = currentTimerMode === key;
                  return `
                    <button
                      type="button"
                      class="radio-card ${selected ? 'is-selected' : ''}"
                      data-timer-mode="${escapeHtml(key)}"
                      role="radio"
                      aria-checked="${selected}"
                    >
                      <strong style="font-size:0.88rem; color:${selected ? 'var(--accent-brand-bright)' : 'var(--text-primary)'};">
                        ${escapeHtml(cfg.label)}
                      </strong>
                      <span style="font-size:0.76rem; color:var(--text-muted); line-height:1.35;">
                        ${escapeHtml(cfg.description)}
                      </span>
                      <span class="mono" style="font-size:0.72rem; color:var(--text-secondary); margin-top:4px;">
                        Спикер: ${cfg.speakerSec}с • Финал: ${cfg.refutationSpeakerSec}с
                      </span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>

          <section class="panel" aria-labelledby="screen-mode-heading">
            <div class="panel-header">
              <h2 id="screen-mode-heading" class="panel-title">🖥️ Режим экрана в аудитории</h2>
              <span class="badge ${audienceConnected ? 'badge-success' : 'badge-info'}">
                ${audienceConnected ? '● 2-й экран подключён' : 'Режим 1 экрана (по умолчанию)'}
              </span>
            </div>

            <div style="display:flex; flex-direction:column; gap:12px;">
              <div class="toggle-row">
                <div>
                  <div style="font-size:0.88rem; font-weight:700;">Окно для проектора (2-й экран, BroadcastChannel)</div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                    Откроет чистое синхронизированное окно без спойлеров и кнопок ведущего — перетащите его на проектор.
                  </div>
                </div>
                <button type="button" class="btn btn-sm ${audienceConnected ? 'btn-outline-success' : 'btn-info'}" data-action="open-audience-window">
                  ${audienceConnected ? '✓ Открыто (обновить)' : '↗ Открыть 2-й экран'}
                </button>
              </div>

              <div class="toggle-row">
                <div>
                  <div style="font-size:0.88rem; font-weight:700;">Скрывать названия когнитивных искажений на вбросах</div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                    Рекомендуется: Стол № 5 (Медиапсихологи) угадывает феномен сам по сюжету, а вы открываете название по клику.
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-sm ${hidePhenomena ? 'btn-success' : ''}"
                  data-action="toggle-hide-phenomena"
                  aria-pressed="${hidePhenomena}"
                >
                  ${hidePhenomena ? '✓ Скрыто' : 'Показано сразу'}
                </button>
              </div>

              <div class="toggle-row">
                <div>
                  <div style="font-size:0.88rem; font-weight:700;">Шторка подсказок ведущего (клавиша <kbd>H</kbd>)</div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                    В режиме одного экрана открывает компактную боковую памятку с «красными флагами SMM», вердиктами и ручными правками.
                  </div>
                </div>
                <button type="button" class="btn btn-sm" data-action="preview-gm-drawer">
                  Проверить шторку
                </button>
              </div>
            </div>
          </section>

          <section class="panel" style="background: var(--bg-surface-2);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <div>
                <div style="font-weight:800; font-size:0.9rem;">Физические карточки на столах?</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                  В «Медиа-менеджере» можно примерить сканы/фото ваших карточек до загрузки в папку <code class="mono">./assets/</code>.
                </div>
              </div>
              <button type="button" class="btn btn-sm" data-action="open-media-manager">
                Проверить assets/
              </button>
            </div>
          </section>
        </div>
      </div>

      <!-- НИЖНЯЯ ПАНЕЛЬ ЗАПУСКА ПАРТИИ -->
      <div class="setup-launch-bar">
        <div>
          <div style="font-weight:800; font-size:1rem;">Всё готово к запуску «${escapeHtml(ep.title)}»</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">
            Старт: Доверие ${ep.initialState.trust}/${ep.initialState.maxTrust} • 6 «Искр слуха» на карте • По ${ep.initialState.apPerDepartment} ОД каждому из 5 столов
          </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:12px;">
          <button type="button" class="btn btn-lg" data-action="start-direct">
            Перейти сразу к игровому полю
          </button>
          <button type="button" class="btn btn-primary btn-lg" data-action="start-story">
            ▶ Начать с сюжетного пролога (3 слайда)
          </button>
        </div>
      </div>
    </main>
  `;

  bindSetupEvents(root, ep, checklist, actions);
}

function bindSetupEvents(root, ep, checklist, actions) {
  root.querySelectorAll('[data-action="go-hub"]').forEach((el) => {
    el.addEventListener('click', () => actions.onGoHub());
  });

  root.querySelector('[data-action="open-rules"]')?.addEventListener('click', () => {
    actions.onOpenRules('rules');
  });

  root.querySelectorAll('[data-action="open-media-manager"]').forEach((el) => {
    el.addEventListener('click', () => actions.onOpenRules('media'));
  });

  root.querySelector('[data-action="toggle-sound"]')?.addEventListener('click', () => {
    actions.onToggleSound();
  });

  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    actions.onToggleTheme();
  });

  root.querySelector('[data-action="print-handouts"]')?.addEventListener('click', () => {
    actions.onPrintHandouts();
  });

  root.querySelector('[data-action="continue-game"]')?.addEventListener('click', () => {
    actions.onContinueGame();
  });

  root.querySelector('[data-action="open-audience-window"]')?.addEventListener('click', () => {
    actions.onOpenAudienceWindow();
  });

  root.querySelector('[data-action="preview-gm-drawer"]')?.addEventListener('click', () => {
    actions.onToggleGmDrawer();
  });

  root.querySelector('[data-action="toggle-hide-phenomena"]')?.addEventListener('click', () => {
    store.savePrefs({ hidePhenomena: !store.prefs.hidePhenomena });
  });

  // Чек-лист готовности
  root.querySelectorAll('[data-setup-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.getAttribute('data-setup-check'));
      if (input.checked) {
        setupDraft.checkedItems.add(idx);
      } else {
        setupDraft.checkedItems.delete(idx);
      }
      renderSetupView(root, actions);
    });
  });

  root.querySelector('[data-action="check-all"]')?.addEventListener('click', () => {
    if (setupDraft.checkedItems.size === checklist.length) {
      setupDraft.checkedItems.clear();
    } else {
      checklist.forEach((_, idx) => setupDraft.checkedItems.add(idx));
    }
    renderSetupView(root, actions);
  });

  // Пресеты таймера
  root.querySelectorAll('[data-timer-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-timer-mode');
      store.savePrefs({ timerMode: mode });
    });
  });

  // Пользовательские названия столов
  root.querySelectorAll('[data-dept-name-input]').forEach((input) => {
    input.addEventListener('input', () => {
      const deptId = input.getAttribute('data-dept-name-input');
      setupDraft.customDeptNames[deptId] = input.value;
    });
  });

  // Запуск партии
  const collectSetupOptions = () => ({
    customDeptNames: { ...setupDraft.customDeptNames }
  });

  root.querySelector('[data-action="start-story"]')?.addEventListener('click', () => {
    actions.onStartGame(ep.id, collectSetupOptions(), true);
  });

  root.querySelector('[data-action="start-direct"]')?.addEventListener('click', () => {
    actions.onStartGame(ep.id, collectSetupOptions(), false);
  });
    }
