/**
 * МЕДИАПОЖАРНЫЙ — Основной игровой экран: Ситуационный центр ведущего
 *
 * Объединяет:
 * - Верхнюю командную панель (раунд, фаза, таймеры, Шкала Доверия, инструменты ведущего)
 * - Полосу управления фазами и темпом раунда
 * - Карту кампуса (6 локаций в 2 средах: Онлайн и Офлайн)
 * - Доску доказательств (улики и конверты) и Панель вбросов без спойлеров
 * - Панель 5 отделов Антикризисного штаба с учётом ОД и «Эстафеты голоса»
 */

import { store } from '../state.js';
import {
  checkActionAvailability,
  getActionCost,
  getActiveDilemmaForRound,
  getRoundRumors,
  getTotalRedTokens,
  getTotalRemainingAP,
  getUnopenedClues,
  isDilemmaPending
} from '../engine.js';
import { renderMediaSlotHtml, escapeHtml } from '../media.js';
import { formatMMSS, formatSS } from '../timer.js';
import { renderBrandSvg } from './hubView.js';

const PHASE_META = {
  phase1: {
    short: 'Фаза 1',
    title: 'Новая волна (30 сек)',
    hint: 'Откройте 2 карты вбросов текущего раунда и примените их эффекты на карту кампуса.'
  },
  phase2_discuss: {
    short: 'Фаза 2А',
    title: 'Совещание столов (2:00)',
    hint: 'Столы работают с физическими карточками и бланками. На экране виден таймер и текущие очаги.'
  },
  phase2_dilemma: {
    short: 'Дилемма № 6',
    title: 'Этическая развилка (15 сек)',
    hint: 'Особый шаг Раунда 3 перед выходами спикеров: «Принять сделку» vs «Отказ / Вето Стола № 5».'
  },
  phase2_speeches: {
    short: 'Фаза 2Б',
    title: 'Выход спикеров (2:00)',
    hint: 'Дежурные спикеры выходят по очереди (25 сек на стол). Действия засчитываются только после выступления!'
  },
  phase3: {
    short: 'Фаза 3',
    title: 'Проверка поля (30 сек)',
    hint: 'Пошаговая проверка 6 локаций: Информационный взрыв (4+ без щита → Доверие -2) и Эффект молчания (2–3 без щита → +1 жетон).'
  }
};

export function renderBoardView(root, actions) {
  const ep = store.getEpisode();
  const game = store.game;

  if (!game) {
    actions.onGoHub();
    return;
  }

  const snap = store.ui.timerSnapshot;
  const editMode = Boolean(store.prefs.editMode);
  const soundOn = Boolean(store.prefs.soundEnabled);
  const isLight = store.prefs.theme === 'light';
  const audienceConnected = Boolean(store.ui.audienceConnected);
  const canUndo = store.canUndo();
  const undoCount = store.undoStack.length;

  const totalTokens = getTotalRedTokens(game);
  const totalApLeft = getTotalRemainingAP(game);
  const maxTotalAp = ep.departments.length * ep.initialState.apPerDepartment;
  const roundRumors = getRoundRumors(ep, game.round);
  const unopenedCount = getUnopenedClues(ep, game).length;
  const dilemmaPending = isDilemmaPending(ep, game);
  const activeDilemma = getActiveDilemmaForRound(ep, game.round);

  const speakerOrder = ep.speakerOrderByRound?.[game.round] || ep.departments.map((d) => d.id);
  const orderText = speakerOrder
    .map((id) => ep.departments.find((d) => d.id === id)?.number)
    .filter(Boolean)
    .join(' → ');

  const phaseInfo = PHASE_META[game.phase] || PHASE_META.phase1;
  const trustZoneClass =
    game.trust >= ep.initialState.winMinTrust
      ? 'zone-win'
      : game.trust >= 1
      ? 'zone-critical'
      : 'zone-dead';
  const trustAnimClass =
    store.ui.trustAnim === 'up'
      ? 'anim-trust-up'
      : store.ui.trustAnim === 'down'
      ? 'anim-trust-down'
      : '';

  const onlineLocations = ep.locations.filter((l) => l.env === 'online');
  const offlineLocations = ep.locations.filter((l) => l.env === 'offline');

  root.innerHTML = `
    <div class="board-shell">
      <!-- 1. ВЕРХНЯЯ КОМАНДНАЯ ПАНЕЛЬ -->
      <header class="command-bar">
        <!-- Левый блок: Эпизод, Раунд и Фаза -->
        <div class="command-group">
          <button type="button" class="brand-icon brand-icon-sm" data-action="go-hub-confirm" title="На главный экран «Медиапожарного» (партия автосохранена)">
            ${renderBrandSvg(20)}
          </button>
          <div style="min-width:0;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <strong style="font-size:0.95rem; white-space:nowrap;">${escapeHtml(ep.title)}</strong>
              <span class="badge badge-brand mono">РАУНД ${game.round}/${ep.initialState.totalRounds}</span>
              <span class="badge badge-info">${escapeHtml(phaseInfo.short)}</span>
            </div>
            <div style="font-size:0.74rem; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              Дедлайн ${escapeHtml(ep.meta.deadline || '18:00')} • Искр на карте: <strong style="color:${totalTokens > 0 ? 'var(--accent-danger-bright)' : 'var(--accent-success-bright)'};">${totalTokens}</strong> • ОД штаба: <strong>${totalApLeft}/${maxTotalAp}</strong>
            </div>
          </div>
        </div>

        <!-- Центр-лево: Интерактивная Шкала Доверия (0–10) -->
        <div class="trust-widget ${trustAnimClass}" aria-label="Шкала Доверия: ${game.trust} из ${game.maxTrust}">
          <div class="trust-top">
            <span class="trust-label">Шкала Доверия</span>
            <div class="trust-readout ${trustZoneClass}">
              ${
                editMode
                  ? `<button type="button" class="btn btn-xs btn-outline-danger" data-action="trust-delta" data-delta="-1" title="Уменьшить Доверие">-1</button>`
                  : ''
              }
              <span>${game.trust} / ${game.maxTrust}</span>
              ${
                editMode
                  ? `<button type="button" class="btn btn-xs btn-outline-success" data-action="trust-delta" data-delta="1" title="Увеличить Доверие">+1</button>`
                  : ''
              }
            </div>
          </div>

          <div class="trust-bar">
            ${Array.from({ length: game.maxTrust }, (_, idx) => {
              const segNum = idx + 1;
              const filled = segNum <= game.trust;
              const segTone = segNum < ep.initialState.winMinTrust ? 'is-critical-seg' : 'is-win-seg';
              const thresholdClass = segNum === ep.initialState.winMinTrust ? 'is-threshold' : '';
              return `<div class="trust-seg ${filled ? 'is-filled' : ''} ${segTone} ${thresholdClass}" title="Уровень ${segNum}${segNum === ep.initialState.winMinTrust ? ' — граница Полной победы' : ''}"></div>`;
            }).join('')}
          </div>

          <div class="trust-legend">
            <span>0 — провал</span>
            <span>1–4 — Пиррова зона</span>
            <span style="color:var(--accent-success-bright);">5–10 — зона победы</span>
          </div>
        </div>

        <!-- Центр-право: Основной таймер и таймер спикера -->
        <div class="timers-cluster">
          <div class="timer-box ${snap.mainRunning ? 'is-running' : ''}" data-timer-main-box>
            <button type="button" class="btn btn-icon-sm btn-primary" data-action="timer-toggle" title="Старт / Пауза (Space)">
              <span data-timer-main-toggle-icon>${snap.mainRunning ? '⏸' : '▶'}</span>
            </button>
            <div style="display:flex; flex-direction:column;">
              <span class="timer-digits" data-timer-main-digits>${formatMMSS(snap.mainRemaining)}</span>
              <span style="font-size:0.65rem; color:var(--text-muted); text-align:center;" data-timer-main-label>${escapeHtml(snap.mainLabel)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:3px;">
              <button type="button" class="btn btn-xs" data-action="timer-add" title="Добавить 30 секунд">+30с</button>
              <button type="button" class="btn btn-xs btn-ghost" data-action="timer-reset" title="Сбросить таймер фазы">↺</button>
            </div>
          </div>

          <div class="speaker-timer-box ${snap.speakerRunning ? 'is-running' : ''}" data-timer-speaker-box title="Таймер выступления дежурного спикера (клавиша S)">
            <button type="button" class="btn btn-xs btn-info" data-action="speaker-toggle" title="Запуск / Пауза таймера спикера (S)">
              🎙️
            </button>
            <span class="speaker-timer-digits" data-timer-speaker-digits>${formatSS(snap.speakerRemaining)}</span>
            <button type="button" class="btn btn-xs btn-ghost" data-action="speaker-reset" data-sec="${game.round === 4 ? 40 : 25}" title="Сбросить таймер спикера">
              ${game.round === 4 ? '40с' : '25с'}
            </button>
          </div>
        </div>

        <!-- Правый блок: Инструменты ведущего -->
        <div class="command-tools">
          <button type="button" class="btn btn-sm" data-action="undo" ${canUndo ? '' : 'disabled'} title="Отменить последний шаг (Ctrl+Z)">
            ↶ Отмена${undoCount > 0 ? ` (${undoCount})` : ''}
          </button>
          <button type="button" class="btn btn-sm ${editMode ? 'is-active' : ''}" data-action="toggle-edit-mode" title="Режим ручной правки жетонов, щитов, ОД и Доверия">
            ✏️ Правка
          </button>
          <button type="button" class="btn btn-sm" data-action="open-log" title="Хроника кризиса">
            📜 Журнал
          </button>
          <button type="button" class="btn btn-sm btn-outline-brand ${store.ui.gmDrawerOpen ? 'is-active' : ''}" data-action="toggle-gm-drawer" title="Шторка подсказок ведущего (H)">
            🛡️ Шторка
          </button>
          <button type="button" class="btn btn-sm" data-action="open-rules" title="Правила и шпаргалка (R)">
            📘
          </button>
          <button type="button" class="btn btn-sm" data-action="toggle-sound" title="Звук (M)">
            ${soundOn ? '🔊' : '🔇'}
          </button>
          <button type="button" class="btn btn-sm" data-action="toggle-theme" title="Светлая / Тёмная тема">
            ${isLight ? '🌙' : '☀️'}
          </button>
          <button type="button" class="btn btn-sm ${audienceConnected ? 'btn-outline-success' : 'btn-info'}" data-action="open-audience-window" title="Открыть синхронизированное окно для проектора">
            ${audienceConnected ? '● Проектор' : '↗ 2-й экран'}
          </button>
        </div>
      </header>

      <!-- 2. РАБОЧАЯ ОБЛАСТЬ СИТУАЦИОННОГО ЦЕНТРА -->
      <main class="board-workspace">
        <!-- Полоса управления фазами раунда -->
        <section class="phase-ribbon" aria-label="Ритм раунда">
          <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
              <span class="badge badge-brand">РАУНД ${game.round} • ${escapeHtml(phaseInfo.title)}</span>
              ${
                game.round === 4
                  ? `<span class="badge badge-danger">ФИНАЛЬНЫЙ РАУНД • ПОРЯДОК: 1 → 2 → 3 → 5 → 4 (ОПРОВЕРЖЕНИЕ)</span>`
                  : `<span class="badge">Порядок выходов: ${orderText}</span>`
              }
              ${
                game.draftPrepared
                  ? `<span class="badge badge-success">✓ Драфт «Сэндвича правды» готов (Опровержение: 1 ОД)</span>`
                  : ''
              }
              ${
                editMode
                  ? `<span class="badge badge-danger">РЕЖИМ РУЧНОЙ ПРАВКИ ВКЛЮЧЁН</span>`
                  : ''
              }
            </div>
            <div style="font-size:0.84rem; color:var(--text-secondary);">
              ${escapeHtml(phaseInfo.hint)}
            </div>
          </div>

          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
            ${renderPhaseActionButtons(game, ep, roundRumors, dilemmaPending, activeDilemma)}
          </div>
        </section>

        <!-- Верхний ярус: Карта 6 локаций + Правая колонка (Улики и Вбросы) -->
        <div class="board-main-grid">
          <!-- КАРТА КАМПУСА (2 среды × 3 локации) -->
          <section class="campus-map" aria-label="Карта 6 локаций кампуса">
            <!-- Онлайн-среда -->
            <div class="env-zone">
              <div class="env-zone-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="badge badge-info">🌐 ОНЛАЙН-СРЕДА</span>
                  <span style="font-size:0.8rem; color:var(--text-muted);">Профильная зона Стола № 2 (SMM) • также доступны OSINT и PR</span>
                </div>
                <span class="mono" style="font-size:0.78rem; color:var(--text-muted);">
                  Искр онлайн: <strong>${onlineLocations.reduce((s, l) => s + game.locations[l.id].tokens, 0)}</strong>
                </span>
              </div>
              <div class="locations-row">
                ${onlineLocations.map((loc) => renderLocationCard(ep, game, loc, editMode)).join('')}
              </div>
            </div>

            <!-- Офлайн-среда -->
            <div class="env-zone">
              <div class="env-zone-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="badge badge-success">🏛️ ОФЛАЙН-СРЕДА</span>
                  <span style="font-size:0.8rem; color:var(--text-muted);">Профильная зона Стола № 3 (Медиация) • также доступны OSINT, PR и Психологи</span>
                </div>
                <span class="mono" style="font-size:0.78rem; color:var(--text-muted);">
                  Искр офлайн: <strong>${offlineLocations.reduce((s, l) => s + game.locations[l.id].tokens, 0)}</strong>
                </span>
              </div>
              <div class="locations-row">
                ${offlineLocations.map((loc) => renderLocationCard(ep, game, loc, editMode)).join('')}
              </div>
            </div>
          </section>

          <!-- ПРАВАЯ КОЛОНКА: Доска доказательств + Вбросы раунда -->
          <aside class="intel-sidebar">
            <!-- Доска доказательств (Улики) -->
            <section class="panel" aria-label="Доска доказательств">
              <div class="panel-header" style="margin-bottom:10px;">
                <h2 class="panel-title">🔍 Доска доказательств</h2>
                <span class="badge ${game.clues.trueIds.length >= ep.initialState.winMinTrueClues ? 'badge-success' : 'badge-info'} mono">
                  ${game.clues.trueIds.length} / ${ep.initialState.winMinTrueClues} (макс. 4)
                </span>
              </div>

              <div class="evidence-slots" aria-hidden="true">
                ${[1, 2, 3, 4]
                  .map(
                    (n) =>
                      `<div class="evidence-slot ${game.clues.trueIds.length >= n ? 'is-filled' : ''}" title="Улика ${n}"></div>`
                  )
                  .join('')}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:0.76rem; color:var(--text-muted);">
                <span>Закрытых конвертов: <strong>${unopenedCount}/8</strong></span>
                <span>Шума отсеяно: <strong>${game.clues.falseIds.length}</strong></span>
              </div>

              <button
                type="button"
                class="btn btn-info"
                style="width:100%; margin-top:10px;"
                data-action="open-envelopes-modal"
              >
                ✉️ Стол конвертов (${unopenedCount} закрыто)
              </button>

              <div class="evidence-list">
                ${
                  game.clues.trueIds.length > 0
                    ? game.clues.trueIds
                        .map((cid) => {
                          const clue = ep.clueDeck.find((c) => c.id === cid);
                          if (!clue) return '';
                          return `
                            <button
                              type="button"
                              class="evidence-item-btn"
                              data-action="inspect-clue"
                              data-clue-id="${escapeHtml(clue.id)}"
                              title="Показать карточку улики на весь экран"
                            >
                              <span>✓ № ${clue.number}: ${escapeHtml(clue.coverTitle)}</span>
                              <span style="opacity:0.75;">⤢</span>
                            </button>
                          `;
                        })
                        .join('')
                    : `<div style="font-size:0.78rem; color:var(--text-muted); padding:8px 10px; border-radius:8px; background:var(--bg-surface-2); border:1px dashed var(--border-subtle);">
                         Подтверждённых улик пока нет. Стол № 1 (OSINT) вскрывает конверты за 1 ОД.
                       </div>`
                }
              </div>
            </section>

            <!-- Вбросы текущего раунда (без спойлеров будущих раундов и невскрытых карт) -->
            <section class="panel" aria-label="Вбросы текущего раунда">
              <div class="panel-header" style="margin-bottom:10px;">
                <h2 class="panel-title">⚡ Вбросы Раунда ${game.round}</h2>
                <span class="badge badge-danger mono">2 карты</span>
              </div>

              <div class="rumor-mini-list">
                ${roundRumors
                  .map((rumor) => {
                    const isRevealed = game.rumors.revealedIds.includes(rumor.id);
                    const isApplied = game.rumors.appliedIds.includes(rumor.id);
                    const isDilemma = Boolean(rumor.isDilemma);
                    const dilemmaDone = isDilemma && Boolean(game.dilemmaResolved[rumor.dilemmaId]);

                    if (!isRevealed) {
                      return `
                        <button
                          type="button"
                          class="rumor-mini-card"
                          style="border-style:dashed; border-color:var(--accent-danger-border);"
                          data-action="open-rumor"
                          data-rumor-id="${escapeHtml(rumor.id)}"
                        >
                          <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:0.86rem; color:var(--accent-danger-bright);">🔒 Карта вброса № ${rumor.number}</strong>
                            <span class="badge badge-danger">Открыть</span>
                          </div>
                          <span style="font-size:0.76rem; color:var(--text-muted);">
                            Скрыто до раскрытия ведущим (нажмите для показа аудитории)
                          </span>
                        </button>
                      `;
                    }

                    const statusBadge = isDilemma
                      ? dilemmaDone
                        ? '<span class="badge badge-success">Решено</span>'
                        : '<span class="badge badge-brand">Дилемма 15с</span>'
                      : isApplied
                      ? '<span class="badge badge-success">Применено</span>'
                      : '<span class="badge badge-danger">Не применено!</span>';

                    return `
                      <button
                        type="button"
                        class="rumor-mini-card ${isDilemma ? 'is-dilemma' : ''}"
                        data-action="open-rumor"
                        data-rumor-id="${escapeHtml(rumor.id)}"
                      >
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                          <strong style="font-size:0.86rem;">№ ${rumor.number}. «${escapeHtml(rumor.title)}»</strong>
                          ${statusBadge}
                        </div>
                        <span style="font-size:0.75rem; color:var(--text-secondary); line-height:1.35;">
                          ${escapeHtml(rumor.effectText)}
                        </span>
                      </button>
                    `;
                  })
                  .join('')}
              </div>

              ${
                activeDilemma && game.rumors.revealedIds.includes(activeDilemma.rumorId)
                  ? `
                    <button
                      type="button"
                      class="btn ${dilemmaPending ? 'btn-primary' : 'btn-outline-success'}"
                      style="width:100%; margin-top:10px;"
                      data-action="open-dilemma"
                      data-dilemma-id="${escapeHtml(activeDilemma.id)}"
                    >
                      ${
                        dilemmaPending
                          ? '⚖️ Открыть Этическую дилемму № 6 (15с)'
                          : '✓ Дилемма № 6 решена (показать итог)'
                      }
                    </button>
                  `
                  : ''
              }
            </section>
          </aside>
        </div>

        <!-- 3. НИЖНИЙ ЯРУС: 5 ОТДЕЛОВ АНТИКРИЗИСНОГО ШТАБА -->
        <section class="departments-section" aria-label="5 отделов Антикризисного штаба">
          <div class="departments-header">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:10px;">
              <h2 style="font-size:1.12rem;">🏛️ Антикризисный штаб (5 столов • по ${ep.initialState.apPerDepartment} ОД на раунд)</h2>
              <span class="badge badge-brand">Эстафета голоса: новый спикер каждый раунд</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted);">
              Неиспользованные ОД в конце раунда сгорают и не переносятся.
            </div>
          </div>

          <div class="departments-grid">
            ${ep.departments
              .map((dept) => renderDepartmentCard(ep, game, dept, speakerOrder, editMode))
              .join('')}
          </div>
        </section>
      </main>
    </div>
  `;

  bindBoardEvents(root, ep, game, actions);
}

/* ============================================================================
   Вспомогательные рендер-функции элементов игрового поля
   ============================================================================ */

function renderPhaseActionButtons(game, ep, roundRumors, dilemmaPending, activeDilemma) {
  const unrevealedRumors = roundRumors.filter((r) => !game.rumors.revealedIds.includes(r.id));
  const unappliedNonDilemma = roundRumors.filter(
    (r) => !r.isDilemma && !game.rumors.appliedIds.includes(r.id)
  );

  if (game.phase === 'phase1') {
    const nextRumor = unrevealedRumors[0] || unappliedNonDilemma[0];
    return `
      ${
        nextRumor
          ? `<button type="button" class="btn btn-danger" data-action="open-rumor" data-rumor-id="${escapeHtml(nextRumor.id)}">
               ⚡ ${game.rumors.revealedIds.includes(nextRumor.id) ? `Применить карту № ${nextRumor.number}` : `Открыть вброс № ${nextRumor.number}`}
             </button>`
          : ''
      }
      <button type="button" class="btn btn-primary" data-action="goto-phase" data-next-phase="phase2_discuss">
        К Фазе 2: Совещание столов (2:00) →
      </button>
    `;
  }

  if (game.phase === 'phase2_discuss') {
    if (game.round === 3 && dilemmaPending && activeDilemma) {
      return `
        <button type="button" class="btn btn-primary" data-action="goto-phase" data-next-phase="phase2_dilemma">
          ⚖️ Шаг 15 сек: Этическая дилемма № 6 →
        </button>
      `;
    }
    return `
      <button type="button" class="btn btn-primary" data-action="goto-phase" data-next-phase="phase2_speeches">
        🎙️ К выходу спикеров (2:00) →
      </button>
    `;
  }

  if (game.phase === 'phase2_dilemma') {
    return `
      ${
        activeDilemma
          ? `<button type="button" class="btn btn-primary" data-action="open-dilemma" data-dilemma-id="${escapeHtml(activeDilemma.id)}">
               ⚖️ Экран Дилеммы № 6
             </button>`
          : ''
      }
      <button type="button" class="btn" data-action="goto-phase" data-next-phase="phase2_speeches">
        К выходу спикеров →
      </button>
    `;
  }

  if (game.phase === 'phase2_speeches') {
    return `
      <button type="button" class="btn btn-outline-danger" data-action="goto-phase" data-next-phase="phase3">
        🔥 Завершить ходы → Фаза 3: Проверка поля
      </button>
    `;
  }

  if (game.phase === 'phase3') {
    return `
      <button type="button" class="btn btn-danger" data-action="open-phase3-modal">
        🔥 Открыть пошаговую проверку Фазы 3
      </button>
    `;
  }

  return '';
}

function renderLocationCard(ep, game, loc, editMode) {
  const ls = game.locations[loc.id];
  const tokens = ls?.tokens || 0;
  const shielded = Boolean(ls?.shielded);

  let stateClass = 'state-calm';
  let statusBadge = '<span class="badge badge-success">✓ Чисто</span>';

  if (shielded) {
    stateClass = 'state-shielded';
    statusBadge = '<span class="badge badge-success">🛡️ Щит до конца раунда</span>';
  } else if (tokens >= 4) {
    stateClass = 'state-overflow';
    statusBadge = '<span class="badge badge-danger">💥 УГРОЗА ВЗРЫВА 4+ (-2 Доверие)</span>';
  } else if (tokens === 3) {
    stateClass = 'state-risk';
    statusBadge = '<span class="badge badge-brand">⚠️ Риск взрыва + Эффект молчания</span>';
  } else if (tokens === 2) {
    stateClass = 'state-silence';
    statusBadge = '<span class="badge badge-brand">⚠️ Угроза Эффекта молчания (+1)</span>';
  } else if (tokens === 1) {
    statusBadge = '<span class="badge">1 искра (безопасно в Ф3)</span>';
  }

  const pulseClass =
    ls?.lastPulse === 'explosion'
      ? 'anim-explosion'
      : store.ui.refutationAnim
      ? 'anim-refutation-clear'
      : '';

  return `
    <article class="location-card ${stateClass} ${pulseClass}" data-location-id="${escapeHtml(loc.id)}">
      <div class="location-media">
        ${renderMediaSlotHtml({
          episode: ep,
          assetKey: loc.assetKey,
          alt: loc.name,
          fallbackType: 'location',
          fallbackData: loc
        })}
        ${
          shielded
            ? `<div class="location-shield-overlay" aria-label="Защищено Щитом модерации">
                 🛡️ ЩИТ МОДЕРАЦИИ
               </div>`
            : ''
        }
      </div>

      <div class="location-head">
        <h3 class="location-name">${escapeHtml(loc.name)}</h3>
        <span class="location-count-pill" title="Красных жетонов «Искры слуха»">${tokens} 🔥</span>
      </div>

      <div class="tokens-tray" aria-label="Красные жетоны: ${tokens}">
        ${
          tokens > 0
            ? Array.from({ length: Math.min(tokens, 10) }, () => `<span class="spark-token" aria-hidden="true">!</span>`).join('') +
              (tokens > 10 ? `<span class="badge badge-danger mono">+${tokens - 10}</span>` : '')
            : `<span class="tokens-empty">Очагов слуха нет</span>`
        }
      </div>

      <div class="location-status-row">
        ${statusBadge}
      </div>

      ${
        editMode
          ? `
            <div class="location-edit-row">
              <div style="display:flex; gap:4px;">
                <button type="button" class="btn btn-xs btn-outline-success" data-action="loc-delta" data-loc-id="${escapeHtml(loc.id)}" data-delta="-1" ${tokens <= 0 ? 'disabled' : ''}>-1 🔥</button>
                <button type="button" class="btn btn-xs btn-outline-danger" data-action="loc-delta" data-loc-id="${escapeHtml(loc.id)}" data-delta="1">+1 🔥</button>
              </div>
              <button type="button" class="btn btn-xs ${shielded ? 'btn-success' : ''}" data-action="loc-shield" data-loc-id="${escapeHtml(loc.id)}">
                ${shielded ? 'Снять щит' : '+ Щит'}
              </button>
            </div>
          `
          : ''
      }
    </article>
  `;
}

function renderDepartmentCard(ep, game, dept, speakerOrder, editMode) {
  const ds = game.departments[dept.id];
  const orderPos = speakerOrder.indexOf(dept.id) + 1;
  const displayName = ds.customName || dept.name;
  const isExhausted = ds.ap <= 0;
  const isFinalDept4 = game.round === 4 && dept.id === 'dept-4';
  const speakerSec = isFinalDept4 ? 40 : 25;

  return `
    <article
      class="dept-card ${isExhausted ? 'is-exhausted' : ''} ${game.phase === 'phase2_speeches' && !ds.spokeThisRound ? 'is-current-turn' : ''}"
      style="--dept-color: ${dept.colorVar};"
      data-dept-id="${escapeHtml(dept.id)}"
    >
      <div class="dept-top">
        <div style="min-width:0;">
          <div class="dept-num">Стол № ${dept.number} • Выход #${orderPos}</div>
          <h3 class="dept-title">${escapeHtml(displayName)}</h3>
          <div class="dept-zone-note">${escapeHtml(dept.zoneLabel)}</div>
        </div>
        <button
          type="button"
          class="btn btn-xs btn-ghost"
          data-action="start-dept-speaker"
          data-sec="${speakerSec}"
          title="Запустить мини-таймер спикера (${speakerSec} сек) для Стола № ${dept.number}"
        >
          🎙️ ${speakerSec}с
        </button>
      </div>

      <div class="dept-status-strip">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.72rem; font-weight:800; color:var(--text-muted);">ОД:</span>
          <div class="ap-dots" aria-label="Осталось ${ds.ap} из ${ds.maxAp} ОД">
            ${Array.from({ length: Math.max(ds.maxAp, ds.ap) }, (_, i) => {
              const spent = i >= ds.ap;
              return `<span class="ap-dot ${spent ? 'is-spent' : ''}"></span>`;
            }).join('')}
          </div>
          ${
            editMode
              ? `
                <button type="button" class="btn btn-xs btn-ghost" data-action="dept-ap-delta" data-dept-id="${escapeHtml(dept.id)}" data-delta="-1" title="-1 ОД">−</button>
                <button type="button" class="btn btn-xs btn-ghost" data-action="dept-ap-delta" data-dept-id="${escapeHtml(dept.id)}" data-delta="1" title="+1 ОД">+</button>
              `
              : ''
          }
        </div>

        <button
          type="button"
          class="relay-btn ${ds.spokeThisRound ? 'is-done' : ''}"
          data-action="toggle-relay"
          data-dept-id="${escapeHtml(dept.id)}"
          title="Отметка «Эстафеты голоса»: спикер стола выступил в этом раунде"
        >
          ${ds.spokeThisRound ? '✓ Выступил' : '○ Спикер'}
        </button>
      </div>

      <div class="dept-actions">
        ${dept.actions
          .map((act) => {
            const avail = checkActionAvailability(dept.id, act, ep, game);
            const cost = getActionCost(act, game);
            const isVetoHighlight = act.type === 'ethical_veto' && avail.allowed;
            const isRefutationReady = act.type === 'official_refutation' && avail.allowed;
            const costLabel =
              act.id === 'pr-refutation' && game.draftPrepared
                ? `${cost} ОД (драфт)`
                : `${cost} ОД`;

            return `
              <button
                type="button"
                class="dept-action-btn ${isVetoHighlight ? 'is-highlight' : ''} ${isRefutationReady ? 'is-final-ready' : ''}"
                data-action="trigger-dept-action"
                data-dept-id="${escapeHtml(dept.id)}"
                data-action-id="${escapeHtml(act.id)}"
                ${avail.allowed ? '' : 'disabled'}
                title="${escapeHtml(act.summary)}"
              >
                <span style="min-width:0;">
                  <span style="display:block; line-height:1.25;">${escapeHtml(act.name)}</span>
                  ${
                    !avail.allowed
                      ? `<span class="action-lock-hint">${escapeHtml(avail.reason)}</span>`
                      : ''
                  }
                </span>
                <span class="action-cost-tag">${escapeHtml(costLabel)}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    </article>
  `;
}

/* ============================================================================
   Обработчики событий Ситуационного центра
   ============================================================================ */

function bindBoardEvents(root, ep, game, actions) {
  root.querySelector('[data-action="go-hub-confirm"]')?.addEventListener('click', () => {
    actions.onGoHub();
  });

  // Таймеры
  root.querySelector('[data-action="timer-toggle"]')?.addEventListener('click', () => {
    actions.onToggleMainTimer();
  });
  root.querySelector('[data-action="timer-add"]')?.addEventListener('click', () => {
    actions.onAddMainTimer(30);
  });
  root.querySelector('[data-action="timer-reset"]')?.addEventListener('click', () => {
    actions.onResetMainTimer();
  });
  root.querySelector('[data-action="speaker-toggle"]')?.addEventListener('click', () => {
    actions.onToggleSpeakerTimer();
  });
  root.querySelector('[data-action="speaker-reset"]')?.addEventListener('click', (e) => {
    const sec = Number(e.currentTarget.getAttribute('data-sec')) || 25;
    actions.onResetSpeakerTimer(sec);
  });

  root.querySelectorAll('[data-action="start-dept-speaker"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sec = Number(btn.getAttribute('data-sec')) || 25;
      actions.onStartSpeakerTimer(sec);
    });
  });

  // Командные инструменты
  root.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
    actions.onUndo();
  });
  root.querySelector('[data-action="toggle-edit-mode"]')?.addEventListener('click', () => {
    actions.onToggleEditMode();
  });
  root.querySelector('[data-action="open-log"]')?.addEventListener('click', () => {
    actions.onOpenLog();
  });
  root.querySelector('[data-action="toggle-gm-drawer"]')?.addEventListener('click', () => {
    actions.onToggleGmDrawer();
  });
  root.querySelector('[data-action="open-rules"]')?.addEventListener('click', () => {
    actions.onOpenRules('rules');
  });
  root.querySelector('[data-action="toggle-sound"]')?.addEventListener('click', () => {
    actions.onToggleSound();
  });
  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    actions.onToggleTheme();
  });
  root.querySelector('[data-action="open-audience-window"]')?.addEventListener('click', () => {
    actions.onOpenAudienceWindow();
  });

  // Переключение фаз
  root.querySelectorAll('[data-action="goto-phase"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextPhase = btn.getAttribute('data-next-phase');
      actions.onRequestPhaseChange(nextPhase);
    });
  });

  root.querySelector('[data-action="open-phase3-modal"]')?.addEventListener('click', () => {
    actions.onOpenPhase3Modal();
  });

  // Вбросы, дилемма и конверты
  root.querySelectorAll('[data-action="open-rumor"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rumorId = btn.getAttribute('data-rumor-id');
      actions.onOpenRumorModal(rumorId);
    });
  });

  root.querySelector('[data-action="open-dilemma"]')?.addEventListener('click', (e) => {
    const dilemmaId = e.currentTarget.getAttribute('data-dilemma-id');
    actions.onOpenDilemmaModal(dilemmaId);
  });

  root.querySelector('[data-action="open-envelopes-modal"]')?.addEventListener('click', () => {
    actions.onOpenEnvelopesModal();
  });

  root.querySelectorAll('[data-action="inspect-clue"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const clueId = btn.getAttribute('data-clue-id');
      actions.onInspectClueModal(clueId);
    });
  });

  // Действия 5 отделов и Эстафета голоса
  root.querySelectorAll('[data-action="trigger-dept-action"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deptId = btn.getAttribute('data-dept-id');
      const actionId = btn.getAttribute('data-action-id');
      actions.onTriggerDepartmentAction(deptId, actionId);
    });
  });

  root.querySelectorAll('[data-action="toggle-relay"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deptId = btn.getAttribute('data-dept-id');
      actions.onToggleRelay(deptId);
    });
  });

  // Ручные правки (только в режиме правки)
  root.querySelectorAll('[data-action="loc-delta"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const locId = btn.getAttribute('data-loc-id');
      const delta = Number(btn.getAttribute('data-delta'));
      actions.onManualLocationTokens(locId, delta);
    });
  });

  root.querySelectorAll('[data-action="loc-shield"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const locId = btn.getAttribute('data-loc-id');
      actions.onManualLocationShield(locId);
    });
  });

  root.querySelectorAll('[data-action="trust-delta"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.getAttribute('data-delta'));
      actions.onManualTrust(delta);
    });
  });

  root.querySelectorAll('[data-action="dept-ap-delta"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deptId = btn.getAttribute('data-dept-id');
      const delta = Number(btn.getAttribute('data-delta'));
      actions.onManualDeptAP(deptId, delta);
    });
  });
                      }
