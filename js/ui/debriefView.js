/**
 * МЕДИАПОЖАРНЫЙ — Финальный экран исхода и пост-игрового дебрифинга
 *
 * Включает:
 * - Драматический экран концовки (Полная победа / Пиррова победа / Поражение) с эпилогом
 * - Наглядный SVG-график динамики Шкалы Доверия по раундам и ключевым событиям
 * - Аналитическую сводку партии (улики, шум, взрывы, Дилемма № 6, синергии)
 * - Интерактивный режим дебрифинга (4 вопроса + разбор сработавших феноменов медиапсихологии)
 * - Экспорт отчёта партии (JSON и печатная версия @media print)
 */

import { store } from '../state.js';
import { getTotalRedTokens } from '../engine.js';
import { renderMediaSlotHtml, escapeHtml } from '../media.js';
import { renderBrandSvg } from './hubView.js';

/** Локальное состояние подсветки активного вопроса и фильтра феноменов в дебрифинге */
const debriefUi = {
  highlightedQuestion: 1,
  showAllGlossary: false
};

export function renderDebriefView(root, actions) {
  const ep = store.getEpisode();
  const game = store.game;

  if (!game) {
    actions.onGoHub();
    return;
  }

  const outcomeCode = game.outcome || 'lose_deadline';
  const ending =
    ep.debriefing?.endings?.[outcomeCode] ||
    ep.debriefing?.endings?.lose_deadline;

  const isWin = outcomeCode === 'full_win';
  const isPyrrhic = outcomeCode === 'pyrrhic_win';
  const accentColor = isWin
    ? 'var(--accent-success-bright)'
    : isPyrrhic
    ? 'var(--accent-brand-bright)'
    : 'var(--accent-danger-bright)';
  const badgeClass = isWin
    ? 'badge-success'
    : isPyrrhic
    ? 'badge-brand'
    : 'badge-danger';

  const isLight = store.prefs.theme === 'light';
  const soundOn = store.prefs.soundEnabled;
  const remainingTokens = getTotalRedTokens(game);

  const dilemma = ep.dilemmas?.[0];
  const dilemmaRes = dilemma ? game.dilemmaResolved?.[dilemma.id] : null;

  const triggeredPhenomena = collectTriggeredPhenomena(ep, game);
  const allGlossary = ep.debriefing?.glossary || [];
  const visibleGlossary = debriefUi.showAllGlossary
    ? allGlossary
    : allGlossary.filter((g) => triggeredPhenomena.ids.has(g.id));

  const synergyCount = game.stats?.synergiesTriggered?.length || 0;

  root.innerHTML = `
    <header class="site-header">
      <div class="container site-header-inner">
        <div class="header-brand" data-action="go-hub" role="button" tabindex="0" aria-label="На главный экран Медиапожарный">
          <div class="brand-mark">
            <div class="brand-icon brand-icon-sm">${renderBrandSvg(20)}</div>
            <div>
              <div class="brand-name" style="font-size:1.05rem;">Медиапожарный</div>
              <div class="brand-sub">Итоги и дебрифинг • Часть ${ep.number}: «${escapeHtml(ep.title)}»</div>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <button type="button" class="btn btn-sm" data-action="open-log">📜 Хроника кризиса</button>
          <button type="button" class="btn btn-sm btn-info" data-action="export-json">⬇ Отчёт JSON</button>
          <button type="button" class="btn btn-sm" data-action="print-report">🖨️ Печать отчёта</button>
          <button type="button" class="btn btn-sm" data-action="toggle-sound">${soundOn ? '🔊' : '🔇'}</button>
          <button type="button" class="btn btn-sm" data-action="toggle-theme">${isLight ? '🌙' : '☀️'}</button>
          <button type="button" class="btn btn-sm btn-primary" data-action="new-game">↻ Новая партия</button>
        </div>
      </div>
    </header>

    <main class="container debrief-page anim-screen-in">
      <!-- 1. ДРАМАТИЧЕСКИЙ ФИНАЛ И ЭПИЛОГ -->
      <section class="ending-hero" style="border-color: ${accentColor};">
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
            <span class="badge ${badgeClass}" style="font-size:0.84rem; padding:6px 14px;">
              ${escapeHtml(ending.badge)}
            </span>
            <span class="badge mono">РАУНД ${game.round}/${ep.initialState.totalRounds}</span>
            <span class="badge mono">ДОВЕРИЕ: ${game.trust}/${game.maxTrust}</span>
          </div>

          <h1 style="font-size: clamp(1.9rem, 3.1vw, 2.75rem); font-weight: 900; line-height: 1.1;">
            ${escapeHtml(ending.title)}
          </h1>

          <div style="font-size: 1rem; font-weight: 700; color: ${accentColor};">
            ${escapeHtml(ending.subtitle)}
          </div>

          <p style="font-size: 1.02rem; line-height: 1.65; color: var(--text-secondary);">
            ${escapeHtml(ending.epilogue)}
          </p>

          <div style="display:flex; flex-wrap:wrap; gap:10px; padding-top:6px;">
            <button type="button" class="btn btn-primary btn-lg" data-action="new-game">
              ↻ Запустить новую партию
            </button>
            <button type="button" class="btn btn-lg" data-action="go-hub">
              ← На главный экран «Медиапожарного»
            </button>
          </div>
        </div>

        <div style="border-radius:var(--radius-lg); overflow:hidden; min-height:290px; border:1px solid var(--border-default); background:var(--bg-surface-2);">
          ${renderMediaSlotHtml({
            episode: ep,
            assetKey: ending.assetKey,
            alt: ending.title,
            fallbackType: ending.fallbackType,
            fallbackData: { title: ending.title }
          })}
        </div>
      </section>

      <!-- 2. АНАЛИТИКА ПАРТИИ: SVG-ГРАФИК ДОВЕРИЯ + КЛЮЧЕВЫЕ МЕТРИКИ -->
      <section class="analytics-grid" aria-label="Аналитика партии">
        <!-- SVG-график динамики Шкалы Доверия -->
        <article class="panel" style="display:flex; flex-direction:column; gap:12px;">
          <div class="panel-header" style="margin-bottom:0;">
            <h2 class="panel-title">📈 Динамика Шкалы Доверия (0–10)</h2>
            <span class="badge badge-brand mono">Событий: ${game.trustHistory.length}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted);">
            Зелёная пунктирная линия — порог Полной победы (<strong>${ep.initialState.winMinTrust}/10</strong>). Красная зона (1–4) — «Пиррова победа».
          </div>
          <div style="width:100%; overflow-x:auto;">
            ${renderTrustChartSvg(game.trustHistory, game.maxTrust, ep.initialState.winMinTrust)}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; font-size:0.75rem; color:var(--text-muted);">
            ${game.trustHistory
              .slice(-5)
              .map(
                (pt) => `
              <span class="badge" title="${escapeHtml(pt.reason || '')}">
                ${escapeHtml(pt.label)}: <strong>${pt.trust}</strong>
              </span>
            `
              )
              .join('')}
          </div>
        </article>

        <!-- Сводка показателей и ключевых решений -->
        <article class="panel" style="display:flex; flex-direction:column; gap:14px;">
          <div class="panel-header" style="margin-bottom:0;">
            <h2 class="panel-title">📊 Сводка работы штаба</h2>
            <span class="badge ${game.refutationPublished ? 'badge-success' : 'badge-danger'}">
              ${game.refutationPublished ? '✓ Опровержение вышло' : '✕ Без опровержения'}
            </span>
          </div>

          <div class="stats-kpi-grid">
            <div class="kpi-card">
              <span class="kpi-value" style="color:var(--accent-success-bright);">${game.clues.trueIds.length} / 4</span>
              <span class="kpi-label">Истинных улик собрано (нужно ≥ 3)</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-value" style="color:var(--accent-info-bright);">${game.clues.falseIds.length} / 4</span>
              <span class="kpi-label">Ложных следов (шума) отсеяно</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-value" style="color:${game.stats.explosions > 0 ? 'var(--accent-danger-bright)' : 'var(--accent-success-bright)'};">${game.stats.explosions}</span>
              <span class="kpi-label">Информационных взрывов (4+)</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-value" style="color:var(--accent-brand-bright);">${game.stats.tokensRemoved} / ${remainingTokens}</span>
              <span class="kpi-label">Искр потушено / осталось в финале</span>
            </div>
          </div>

          <!-- Решение по Этической дилемме № 6 -->
          <div style="padding:12px 14px; border-radius:var(--radius-md); background:${
            dilemmaRes?.choice === 'accepted_dark_pr'
              ? 'var(--accent-danger-soft)'
              : dilemmaRes
              ? 'var(--accent-success-soft)'
              : 'var(--bg-surface-2)'
          }; border:1px solid ${
            dilemmaRes?.choice === 'accepted_dark_pr'
              ? 'var(--accent-danger-border)'
              : dilemmaRes
              ? 'var(--accent-success-border)'
              : 'var(--border-subtle)'
          }; font-size:0.84rem;">
            <div style="font-weight:800; margin-bottom:4px;">⚖️ Решение по Этической дилемме № 6 (Раунд 3):</div>
            <div style="color:var(--text-secondary);">
              ${
                dilemmaRes
                  ? escapeHtml(dilemmaRes.label)
                  : 'Партия завершилась до прохождения Дилеммы № 6.'
              }
            </div>
          </div>

          <!-- Дополнительные маркеры синергии -->
          <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.78rem;">
            <span class="badge badge-info">Щитов поставлено: ${game.stats.shieldsPlaced}</span>
            <span class="badge badge-indigo">Разборов искажений (Стол № 5): ${game.stats.biasesAnalyzed}</span>
            <span class="badge badge-success">Синергий улик: ${synergyCount}</span>
            <span class="badge ${game.draftPrepared ? 'badge-success' : ''}">
              Драфт Стола № 4: ${game.draftPrepared ? 'использован' : 'нет'}
            </span>
          </div>
        </article>
      </section>

      <!-- 3. РЕЖИМ ДЕБРИФИНГА: 4 ВОПРОСА ДЛЯ ОБСУЖДЕНИЯ С ПОТОКОМ -->
      <section class="section-block" aria-labelledby="debrief-q-heading">
        <div class="section-header">
          <div>
            <h2 id="debrief-q-heading" class="section-title">💬 Дебрифинг для аудитории (5–10 минут)</h2>
            <p class="section-subtitle">Нажмите на карточку вопроса, чтобы подсветить его как текущую тему обсуждения на проекторе</p>
          </div>
          <span class="badge badge-brand">4 вопроса для рефлексии</span>
        </div>

        <div class="debrief-questions-grid">
          ${(ep.debriefing?.questions || [])
            .map((q) => {
              const isHigh = debriefUi.highlightedQuestion === q.number;
              return `
                <article
                  class="debrief-q-card ${isHigh ? 'is-highlighted' : ''}"
                  data-highlight-q="${q.number}"
                  role="button"
                  tabindex="0"
                  style="cursor:pointer;"
                >
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                      <span class="how-step-num">${q.number}</span>
                      <h3 style="font-size:1.05rem;">${escapeHtml(q.title)}</h3>
                    </div>
                    ${isHigh ? '<span class="badge badge-brand">Обсуждаем сейчас</span>' : ''}
                  </div>
                  <p style="font-size:0.95rem; line-height:1.58; color:var(--text-secondary);">
                    ${escapeHtml(q.question)}
                  </p>
                </article>
              `;
            })
            .join('')}
        </div>
      </section>

      <!-- 4. ИНТЕРАКТИВНЫЙ РАЗБОР МЕДИАПСИХОЛОГИЧЕСКИХ ФЕНОМЕНОВ -->
      <section class="section-block" aria-labelledby="debrief-phen-heading">
        <div class="section-header">
          <div>
            <h2 id="debrief-phen-heading" class="section-title">🧠 Разбор медиапсихологических феноменов партии</h2>
            <p class="section-subtitle">
              В этой партии проявилось <strong>${triggeredPhenomena.ids.size}</strong> из ${allGlossary.length} феноменов курса
            </p>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-sm ${!debriefUi.showAllGlossary ? 'is-active' : ''}" data-action="phen-filter" data-mode="triggered">
              Сработавшие в партии (${triggeredPhenomena.ids.size})
            </button>
            <button type="button" class="btn btn-sm ${debriefUi.showAllGlossary ? 'is-active' : ''}" data-action="phen-filter" data-mode="all">
              Показать весь глоссарий (${allGlossary.length})
            </button>
          </div>
        </div>

        <div class="phenomena-grid">
          ${(visibleGlossary.length > 0 ? visibleGlossary : allGlossary)
            .map((item) => {
              const happened = triggeredPhenomena.ids.has(item.id);
              return `
                <article class="panel" style="padding:16px; display:flex; flex-direction:column; gap:8px; border-color:${happened ? 'var(--accent-indigo-border)' : 'var(--border-subtle)'};">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                    <span class="badge ${happened ? 'badge-indigo' : ''}">
                      ${happened ? '● Встретился в партии' : 'Из полного курса'}
                    </span>
                    <span style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(item.source)}</span>
                  </div>
                  <h3 style="font-size:1.02rem;">${escapeHtml(item.term)}</h3>
                  <p style="font-size:0.86rem; line-height:1.52; color:var(--text-secondary);">
                    ${escapeHtml(item.definition)}
                  </p>
                </article>
              `;
            })
            .join('')}
        </div>
      </section>

      <!-- НИЖНЯЯ ПАНЕЛЬ ДЕЙСТВИЙ -->
      <section class="panel" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">
        <div>
          <strong>Сохраните итоги занятия для методического портфолио</strong>
          <div style="font-size:0.82rem; color:var(--text-muted);">
            JSON-файл содержит полную Хронику кризиса, динамику Доверия и статистику; печать формирует аккуратный лист А4.
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          <button type="button" class="btn btn-info" data-action="export-json">⬇ Сохранить отчёт (JSON)</button>
          <button type="button" class="btn" data-action="print-report">🖨️ Печать отчёта</button>
          <button type="button" class="btn btn-primary" data-action="new-game">↻ Новая партия</button>
          <button type="button" class="btn" data-action="go-hub">На главный экран «Медиапожарного»</button>
        </div>
      </section>
    </main>
  `;

  bindDebriefEvents(root, actions);
}

/* ============================================================================
   SVG-график динамики Шкалы Доверия (адаптивный, высококонтрастный)
   ============================================================================ */

function renderTrustChartSvg(history = [], maxTrust = 10, winMinTrust = 5) {
  const points = history.length > 0 ? history : [{ label: 'Старт', trust: 7 }];
  const W = 680;
  const H = 240;
  const padL = 42;
  const padR = 24;
  const padT = 20;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xAt = (i) =>
    points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW;
  const yAt = (val) => padT + plotH - (Math.max(0, Math.min(maxTrust, val)) / maxTrust) * plotH;

  const thresholdY = yAt(winMinTrust);
  const zeroY = yAt(0);
  const pathD = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(pt.trust).toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${xAt(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${xAt(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="230" role="img" aria-label="График Шкалы Доверия по раундам">
      <defs>
        <linearGradient id="trustAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10B981" stop-opacity="0.34" />
          <stop offset="55%" stop-color="#F59E0B" stop-opacity="0.16" />
          <stop offset="100%" stop-color="#EF4444" stop-opacity="0.06" />
        </linearGradient>
      </defs>

      <!-- Зона Пирровой победы (1–4) -->
      <rect x="${padL}" y="${thresholdY}" width="${plotW}" height="${zeroY - thresholdY}" fill="rgba(239, 68, 68, 0.08)" />

      <!-- Горизонтальная сетка (0, 2, 5, 7, 10) -->
      ${[0, 2, 5, 7, 10]
        .map((v) => {
          const y = yAt(v);
          const isThreshold = v === winMinTrust;
          return `
            <line
              x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
              stroke="${isThreshold ? '#10B981' : 'rgba(148,163,184,0.22)'}"
              stroke-width="${isThreshold ? '1.6' : '1'}"
              ${isThreshold ? 'stroke-dasharray="6 4"' : ''}
            />
            <text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-family="JetBrains Mono, monospace" fill="${isThreshold ? '#34D399' : '#94A3B8'}" font-weight="${isThreshold ? '800' : '600'}">
              ${v}
            </text>
          `;
        })
        .join('')}

      <!-- Подпись границы победы -->
      <text x="${W - padR - 4}" y="${thresholdY - 6}" text-anchor="end" font-size="10.5" font-family="Inter, sans-serif" fill="#34D399" font-weight="700">
        Порог Полной победы (${winMinTrust}+)
      </text>

      <!-- Заливка и линия графика -->
      <path d="${areaD}" fill="url(#trustAreaGrad)" />
      <path d="${pathD}" fill="none" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Точки и подписи шагов -->
      ${points
        .map((pt, i) => {
          const cx = xAt(i);
          const cy = yAt(pt.trust);
          const dotColor =
            pt.trust >= winMinTrust ? '#10B981' : pt.trust >= 1 ? '#F59E0B' : '#EF4444';
          const showLabel =
            points.length <= 9 || i === 0 || i === points.length - 1 || i % 2 === 0;
          return `
            <g>
              <circle cx="${cx}" cy="${cy}" r="5.5" fill="${dotColor}" stroke="#0B0F17" stroke-width="2">
                <title>${escapeHtml(pt.label)}: Доверие ${pt.trust}/10 — ${escapeHtml(pt.reason || '')}</title>
              </circle>
              <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="11" font-family="JetBrains Mono, monospace" font-weight="800" fill="${dotColor}">
                ${pt.trust}
              </text>
              ${
                showLabel
                  ? `<text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="10.5" font-family="Inter, sans-serif" fill="#94A3B8">
                       ${escapeHtml(pt.label)}
                     </text>`
                  : ''
              }
            </g>
          `;
        })
        .join('')}
    </svg>
  `;
}

/* ============================================================================
   Определение медиапсихологических феноменов, проявившихся в партии
   ============================================================================ */

function collectTriggeredPhenomena(ep, game) {
  const ids = new Set();
  const rumorToGlossary = {
    'rumor-01': 'framing',
    'rumor-02': 'cancel-culture',
    'rumor-03': 'confirmation-bias',
    'rumor-04': 'spiral-of-silence',
    'rumor-05': 'institutional-panic',
    'rumor-06': 'streisand-effect',
    'rumor-08': 'illusory-truth'
  };
  const clueToGlossary = {
    'clue-05': 'false-authority',
    'clue-06': 'halo-effect',
    'clue-07': 'ad-hominem',
    'clue-08': 'false-authority'
  };

  for (const rid of game.rumors?.revealedIds || []) {
    if (rumorToGlossary[rid]) ids.add(rumorToGlossary[rid]);
  }
  for (const cid of game.clues?.falseIds || []) {
    if (clueToGlossary[cid]) ids.add(clueToGlossary[cid]);
  }

  // Если партия короткая или пустая — подсветим базовый набор первых двух вбросов
  if (ids.size === 0) {
    ids.add('framing');
    ids.add('cancel-culture');
  }

  return { ids };
}

/* ============================================================================
   Печатный отчёт партии (@media print)
   ============================================================================ */

export function renderPrintableReport(printRoot, ep, game) {
  const ending =
    ep.debriefing?.endings?.[game.outcome] || ep.debriefing?.endings?.lose_deadline;
  const dilemma = ep.dilemmas?.[0];
  const dilemmaRes = dilemma ? game.dilemmaResolved?.[dilemma.id] : null;
  const dateStr = new Date().toLocaleString('ru-RU');

  printRoot.innerHTML = `
    <section class="print-sheet">
      <div class="print-sheet-header">
        <div>
          <div class="print-sheet-title">ОТЧЁТ ПАРТИИ — «МЕДИАПОЖАРНЫЙ»</div>
          <div>Часть ${ep.number}: «${escapeHtml(ep.title)}: ${escapeHtml(ep.subtitle)}» • ${escapeHtml(dateStr)}</div>
        </div>
        <div class="print-sheet-badge">${escapeHtml(ending.badge)}</div>
      </div>

      <p><strong>Исход:</strong> ${escapeHtml(ending.title)} — ${escapeHtml(ending.subtitle)}</p>

      <table class="print-table">
        <thead>
          <tr><th>Показатель</th><th>Значение</th><th>Показатель</th><th>Значение</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Финальное Доверие</strong></td>
            <td>${game.trust} / ${game.maxTrust}</td>
            <td><strong>Пройдено раундов</strong></td>
            <td>${game.round} / ${ep.initialState.totalRounds}</td>
          </tr>
          <tr>
            <td><strong>Истинных улик</strong></td>
            <td>${game.clues.trueIds.length} / 4</td>
            <td><strong>Отсеяно шума</strong></td>
            <td>${game.clues.falseIds.length} / 4</td>
          </tr>
          <tr>
            <td><strong>Информационных взрывов</strong></td>
            <td>${game.stats.explosions}</td>
            <td><strong>Срабатываний Эффекта молчания</strong></td>
            <td>${game.stats.silenceTriggers}</td>
          </tr>
          <tr>
            <td><strong>Щитов модерации поставлено</strong></td>
            <td>${game.stats.shieldsPlaced}</td>
            <td><strong>Разборов искажений (Стол № 5)</strong></td>
            <td>${game.stats.biasesAnalyzed}</td>
          </tr>
        </tbody>
      </table>

      <div class="print-box">
        <strong>Решение по Этической дилемме № 6:</strong> ${escapeHtml(dilemmaRes?.label || 'Не достигнута')}<br/>
        <strong>Официальное опровержение («Сэндвич правды»):</strong> ${game.refutationPublished ? 'Опубликовано' : 'Не опубликовано'}
      </div>

      <h3 style="margin-top:12pt; margin-bottom:6pt;">Хроника ключевых событий</h3>
      <table class="print-table">
        <thead>
          <tr><th style="width:55pt;">Время</th><th style="width:55pt;">Раунд</th><th>Событие</th></tr>
        </thead>
        <tbody>
          ${[...(game.log || [])]
            .reverse()
            .map(
              (e) => `
            <tr>
              <td>${escapeHtml(e.time)}</td>
              <td>Р${e.round}</td>
              <td><strong>${escapeHtml(e.title)}</strong>${e.detail ? ` — ${escapeHtml(e.detail)}` : ''}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

function bindDebriefEvents(root, actions) {
  root.querySelectorAll('[data-action="go-hub"]').forEach((el) => {
    el.addEventListener('click', () => actions.onGoHub());
  });

  root.querySelectorAll('[data-action="new-game"]').forEach((el) => {
    el.addEventListener('click', () => actions.onNewGame());
  });

  root.querySelector('[data-action="open-log"]')?.addEventListener('click', () => {
    actions.onOpenLog();
  });

  root.querySelectorAll('[data-action="export-json"]').forEach((el) => {
    el.addEventListener('click', () => actions.onExportJson());
  });

  root.querySelectorAll('[data-action="print-report"]').forEach((el) => {
    el.addEventListener('click', () => actions.onPrintReport());
  });

  root.querySelector('[data-action="toggle-sound"]')?.addEventListener('click', () => {
    actions.onToggleSound();
  });

  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    actions.onToggleTheme();
  });

  root.querySelectorAll('[data-highlight-q]').forEach((card) => {
    const activate = () => {
      debriefUi.highlightedQuestion = Number(card.getAttribute('data-highlight-q'));
      renderDebriefView(root, actions);
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  root.querySelectorAll('[data-action="phen-filter"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      debriefUi.showAllGlossary = btn.getAttribute('data-mode') === 'all';
      renderDebriefView(root, actions);
    });
  });
    }
