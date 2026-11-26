/**
 * МЕДИАПОЖАРНЫЙ — Чистый синхронизированный «Экран аудитории» (2-е окно для проектора)
 *
 * Работает локально через BroadcastChannel API без сервера.
 * Показывает аудитории только зрелищную визуализацию (пролог, карту 6 локаций, Шкалу Доверия,
 * крупный таймер, открытые вбросы, вскрытые улики, дилемму и финал) — без спойлеров и пульта ведущего.
 */

import { store } from '../state.js';
import { getTotalRedTokens } from '../engine.js';
import { renderMediaSlotHtml, hydrateMediaSlots, escapeHtml } from '../media.js';
import { formatMMSS, formatSS } from '../timer.js';
import { renderBrandSvg } from './hubView.js';

const AUDIENCE_PHASE_TITLES = {
  phase1: 'ФАЗА 1 • НОВАЯ ВОЛНА',
  phase2_discuss: 'ФАЗА 2 • СОВЕЩАНИЕ СТОЛОВ',
  phase2_dilemma: 'ОСОБЫЙ ШАГ • ЭТИЧЕСКАЯ ДИЛЕММА № 6',
  phase2_speeches: 'ФАЗА 2 • ВЫХОД ДЕЖУРНЫХ СПИКЕРОВ',
  phase3: 'ФАЗА 3 • ПРОВЕРКА ПОЛЯ',
  finished: 'ИТОГИ ПАРТИИ'
};

export function renderAudienceView(root) {
  const ep = store.getEpisode();
  const hostScreen = store.hostScreen || (store.game ? 'board' : 'hub');
  const game = store.game;

  if (hostScreen === 'story' && game) {
    renderAudienceStory(root, ep);
  } else if (hostScreen === 'debrief' && game && game.outcome) {
    renderAudienceEnding(root, ep, game);
  } else if (game && (hostScreen === 'board' || !game.outcome)) {
    renderAudienceBoard(root, ep, game);
  } else {
    renderAudienceStandby(root, ep);
  }

  // Привязка единственной служебной кнопки «Полный экран» (удобно после переноса окна на проектор)
  root.querySelector('[data-action="aud-fullscreen"]')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  hydrateMediaSlots(root);
}

/* ============================================================================
   1. Экран ожидания (когда ведущий на Главном хабе или на экране Сетапа)
   ============================================================================ */

function renderAudienceStandby(root, ep) {
  root.innerHTML = `
    <div class="audience-shell anim-screen-in" style="justify-content:center; align-items:center;">
      <div style="position:fixed; top:16px; right:20px; display:flex; align-items:center; gap:8px; z-index:20;">
        <span class="badge badge-success">● Синхронизировано с ведущим</span>
        <button type="button" class="btn btn-xs" data-action="aud-fullscreen" title="На весь экран проектора">⛶ Полный экран</button>
      </div>

      <div class="hub-hero" style="max-width:1280px; width:100%;">
        <div class="hub-hero-copy">
          <div class="brand-mark">
            <div class="brand-icon">${renderBrandSvg(26)}</div>
            <div>
              <div class="brand-name" style="font-size:1.35rem;">Медиапожарный</div>
              <div class="brand-sub">Экран аудитории • Ситуационный центр</div>
            </div>
          </div>

          <h1 class="hub-hero-title">
            Часть ${ep.number}: «${escapeHtml(ep.title)}»
          </h1>
          <div style="font-size:1.25rem; font-weight:800; color:var(--accent-brand-bright);">
            ${escapeHtml(ep.subtitle)}
          </div>
          <p class="hub-hero-lead">
            ${escapeHtml(ep.tagline)}. Займите места за 5 столами Антикризисного штаба и подготовьте маршрутные листы «Эстафеты голоса». Партия начнётся по команде ведущего.
          </p>

          <div class="hub-hero-pills">
            <span class="badge badge-brand">4 раунда по 5 минут</span>
            <span class="badge badge-info">5 отделов • по 2 ОД</span>
            <span class="badge badge-danger">Дедлайн ${escapeHtml(ep.meta.deadline || '18:00')}</span>
          </div>
        </div>

        <div class="episode-featured-media" style="min-height:360px;">
          ${renderMediaSlotHtml({
            episode: ep,
            assetKey: ep.coverAsset || 'cover',
            alt: ep.title,
            fallbackType: 'episode-cover',
            fallbackData: { title: ep.title }
          })}
        </div>
      </div>
    </div>
  `;
}

/* ============================================================================
   2. Проекция сюжетного пролога (синхронно со слайдами ведущего)
   ============================================================================ */

function renderAudienceStory(root, ep) {
  const slides = ep.storySlides || [];
  const idx = Math.max(0, Math.min(slides.length - 1, store.storySlideIndex || 0));
  const slide = slides[idx];
  if (!slide) {
    renderAudienceStandby(root, ep);
    return;
  }

  root.innerHTML = `
    <div class="story-page anim-screen-in">
      <header class="story-topbar">
        <div class="brand-mark">
          <div class="brand-icon brand-icon-sm">${renderBrandSvg(20)}</div>
          <div>
            <div class="brand-name" style="font-size:1.05rem;">Медиапожарный • ${escapeHtml(ep.title)}</div>
            <div class="brand-sub">${escapeHtml(ep.subtitle)}</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <span class="badge badge-brand mono">ПРОЛОГ • ${idx + 1} / ${slides.length}</span>
          <button type="button" class="btn btn-xs" data-action="aud-fullscreen">⛶</button>
        </div>
      </header>

      <main class="story-stage">
        <div class="story-media-frame" style="min-height:440px;">
          ${renderMediaSlotHtml({
            episode: ep,
            assetKey: slide.assetKey,
            alt: slide.title,
            fallbackType: slide.fallbackType,
            fallbackData: { title: slide.title },
            contain: true
          })}
        </div>

        <article class="story-copy">
          <span class="badge ${idx === 1 ? 'badge-danger' : idx === 2 ? 'badge-live' : 'badge-brand'}" style="align-self:flex-start;">
            ${escapeHtml(slide.badge)}
          </span>
          <h1 style="font-size: clamp(2.1rem, 3.4vw, 3.1rem); font-weight: 900; line-height: 1.08;">
            ${escapeHtml(slide.title)}
          </h1>
          <div style="font-size: 1.18rem; font-weight: 700; color: var(--accent-brand-bright);">
            ${escapeHtml(slide.subtitle)}
          </div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${(slide.body || [])
              .map(
                (p) => `<p style="font-size: 1.12rem; line-height: 1.62; color: var(--text-secondary);">${escapeHtml(p)}</p>`
              )
              .join('')}
          </div>
          ${
            slide.highlight
              ? `<div style="padding:18px 20px; border-radius:var(--radius-md); background:${
                  idx === 1 ? 'var(--accent-danger-soft)' : 'var(--accent-brand-soft)'
                }; border-left:4px solid ${
                  idx === 1 ? 'var(--accent-danger-bright)' : 'var(--accent-brand-bright)'
                }; font-size:1.05rem; font-weight:700;">
                  ${escapeHtml(slide.highlight)}
                </div>`
              : ''
          }
        </article>
      </main>

      <footer class="story-footer" style="justify-content:center;">
        <div class="slide-dots">
          ${slides
            .map((_, i) => `<span class="slide-dot ${i === idx ? 'is-active' : ''}"></span>`)
            .join('')}
        </div>
      </footer>
    </div>
  `;
}

/* ============================================================================
   3. Главный проекторный штаб-экран (Карта 6 локаций + Шкала + Таймер + Улики)
   ============================================================================ */

function renderAudienceBoard(root, ep, game) {
  const snap = store.ui.timerSnapshot;
  const totalTokens = getTotalRedTokens(game);
  const onlineLocations = ep.locations.filter((l) => l.env === 'online');
  const offlineLocations = ep.locations.filter((l) => l.env === 'offline');
  const speakerOrder = ep.speakerOrderByRound?.[game.round] || ep.departments.map((d) => d.id);
  const roundRumors = ep.rumorDeck.filter((r) => r.round === game.round);
  const phaseLabel = AUDIENCE_PHASE_TITLES[game.phase] || 'АКТИВНЫЙ РАУНД';

  const trustZoneClass =
    game.trust >= ep.initialState.winMinTrust
      ? 'zone-win'
      : game.trust >= 1
      ? 'zone-critical'
      : 'zone-dead';

  const spotlightHtml = renderAudienceSpotlight(ep, game, store.audienceSpotlight);

  root.innerHTML = `
    <div class="audience-shell">
      <!-- Шапка проектора: Эпизод/Раунд | Крупная Шкала Доверия | Крупный Таймер -->
      <header class="audience-header">
        <div class="brand-mark">
          <div class="brand-icon">${renderBrandSvg(24)}</div>
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="brand-name" style="font-size:1.25rem;">${escapeHtml(ep.title)}</span>
              <span class="badge badge-brand mono">РАУНД ${game.round} / ${ep.initialState.totalRounds}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
              <span class="badge badge-info">${escapeHtml(phaseLabel)}</span>
              <span style="font-size:0.84rem; color:var(--text-muted);">
                Искр на карте: <strong style="color:${totalTokens > 0 ? 'var(--accent-danger-bright)' : 'var(--accent-success-bright)'};">${totalTokens}</strong>
              </span>
            </div>
          </div>
        </div>

        <!-- Крупная Шкала Доверия -->
        <div class="trust-widget" style="max-width:520px; width:100%; margin-inline:auto;">
          <div class="trust-top">
            <span class="trust-label" style="font-size:0.84rem;">ШКАЛА ДОВЕРИЯ ФАКУЛЬТЕТА</span>
            <span class="trust-readout ${trustZoneClass}" style="font-size:1.35rem;">${game.trust} / ${game.maxTrust}</span>
          </div>
          <div class="trust-bar">
            ${Array.from({ length: game.maxTrust }, (_, i) => {
              const n = i + 1;
              const filled = n <= game.trust;
              const tone = n < ep.initialState.winMinTrust ? 'is-critical-seg' : 'is-win-seg';
              const threshold = n === ep.initialState.winMinTrust ? 'is-threshold' : '';
              return `<div class="trust-seg ${filled ? 'is-filled' : ''} ${tone} ${threshold}" style="height:20px;"></div>`;
            }).join('')}
          </div>
          <div class="trust-legend">
            <span>0 — поражение</span>
            <span>1–4 — Пиррова победа</span>
            <span style="color:var(--accent-success-bright);">5–10 — Полная победа</span>
          </div>
        </div>

        <!-- Крупные таймеры -->
        <div style="display:flex; align-items:center; gap:14px;">
          <div class="timer-box ${snap.mainRunning ? 'is-running' : ''}" data-timer-main-box style="padding:10px 18px;">
            <div style="text-align:center;">
              <div class="audience-timer-big" data-timer-main-digits>${formatMMSS(snap.mainRemaining)}</div>
              <div style="font-size:0.74rem; color:var(--text-muted); font-weight:700; margin-top:2px;" data-timer-main-label>
                ${escapeHtml(snap.mainLabel)}
              </div>
            </div>
          </div>

          <div class="speaker-timer-box ${snap.speakerRunning ? 'is-running' : ''}" data-timer-speaker-box style="padding:10px 14px; flex-direction:column; gap:2px;">
            <span style="font-size:0.68rem; color:var(--text-muted); font-weight:800; text-transform:uppercase;">Спикер</span>
            <span class="speaker-timer-digits" style="font-size:1.55rem;" data-timer-speaker-digits>${formatSS(snap.speakerRemaining)}</span>
          </div>

          <button type="button" class="btn btn-icon btn-ghost" data-action="aud-fullscreen" title="Полный экран">⛶</button>
        </div>
      </header>

      <!-- Основная зона проектора: 6 локаций + Правая панель улик и вбросов -->
      <main class="audience-main">
        <section class="campus-map">
          <div class="env-zone">
            <div class="env-zone-header">
              <span class="badge badge-info">🌐 ОНЛАЙН-СРЕДА</span>
              <span class="mono" style="font-size:0.84rem; color:var(--text-muted);">
                Очагов онлайн: <strong>${onlineLocations.reduce((s, l) => s + game.locations[l.id].tokens, 0)}</strong>
              </span>
            </div>
            <div class="locations-row">
              ${onlineLocations.map((loc) => renderAudienceLocationCard(ep, game, loc)).join('')}
            </div>
          </div>

          <div class="env-zone">
            <div class="env-zone-header">
              <span class="badge badge-success">🏛️ ОФЛАЙН-СРЕДА</span>
              <span class="mono" style="font-size:0.84rem; color:var(--text-muted);">
                Очагов офлайн: <strong>${offlineLocations.reduce((s, l) => s + game.locations[l.id].tokens, 0)}</strong>
              </span>
            </div>
            <div class="locations-row">
              ${offlineLocations.map((loc) => renderAudienceLocationCard(ep, game, loc)).join('')}
            </div>
          </div>
        </section>

        <aside class="intel-sidebar">
          <!-- Доска подтверждённых улик (без спойлеров закрытых конвертов) -->
          <section class="panel">
            <div class="panel-header" style="margin-bottom:10px;">
              <h2 class="panel-title">🔍 Доказательная база</h2>
              <span class="badge ${game.clues.trueIds.length >= 3 ? 'badge-success' : 'badge-info'} mono">
                ${game.clues.trueIds.length} / 3
              </span>
            </div>
            <div class="evidence-slots">
              ${[1, 2, 3, 4]
                .map((n) => `<div class="evidence-slot ${game.clues.trueIds.length >= n ? 'is-filled' : ''}" style="height:12px;"></div>`)
                .join('')}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
              ${
                game.clues.trueIds.length > 0
                  ? game.clues.trueIds
                      .map((id) => {
                        const c = ep.clueDeck.find((x) => x.id === id);
                        if (!c) return '';
                        return `
                          <div style="padding:10px 12px; border-radius:var(--radius-sm); background:var(--accent-success-soft); border:1px solid var(--accent-success-border); font-size:0.84rem; font-weight:700;">
                            ✓ № ${c.number}. ${escapeHtml(c.coverTitle)}
                          </div>
                        `;
                      })
                      .join('')
                  : `<div style="font-size:0.84rem; color:var(--text-muted); padding:10px; border-radius:var(--radius-sm); border:1px dashed var(--border-subtle);">
                       Истинных улик пока нет. Цель: собрать минимум 3 до 18:00.
                     </div>`
              }
            </div>
            ${
              game.draftPrepared
                ? `<div style="margin-top:10px;" class="badge badge-success">✓ Драфт «Сэндвича правды» готов (1 ОД в Р4)</div>`
                : ''
            }
          </section>

          <!-- Открытые вбросы текущего раунда -->
          <section class="panel">
            <div class="panel-header" style="margin-bottom:10px;">
              <h2 class="panel-title">⚡ Вбросы Раунда ${game.round}</h2>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${roundRumors
                .map((r) => {
                  const revealed = game.rumors.revealedIds.includes(r.id);
                  if (!revealed) {
                    return `
                      <div style="padding:12px; border-radius:var(--radius-sm); background:var(--bg-surface-2); border:1px dashed var(--border-default); font-size:0.84rem; color:var(--text-muted);">
                        🔒 Карта вброса № ${r.number} — ожидает открытия
                      </div>
                    `;
                  }
                  return `
                    <div style="padding:12px; border-radius:var(--radius-sm); background:var(--bg-surface-2); border:1px solid ${r.isDilemma ? 'var(--accent-brand-border)' : 'var(--accent-danger-border)'};">
                      <div style="font-weight:800; font-size:0.9rem;">№ ${r.number}. «${escapeHtml(r.title)}»</div>
                      <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(r.effectText)}</div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </section>
        </aside>
      </main>

      <!-- Нижняя строка: Статус 5 отделов (ОД + порядок выхода + Эстафета голоса) -->
      <footer class="audience-footer-strip">
        ${ep.departments
          .map((dept) => {
            const ds = game.departments[dept.id];
            const pos = speakerOrder.indexOf(dept.id) + 1;
            const label = ds.customName || dept.shortName;
            return `
              <div class="audience-dept-pill ${game.phase === 'phase2_speeches' && !ds.spokeThisRound ? 'is-active' : ''}" style="--dept-color:${dept.colorVar};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.76rem; font-weight:800; color:${dept.colorVar};">СТОЛ № ${dept.number} • #${pos}</span>
                  <span class="badge ${ds.spokeThisRound ? 'badge-success' : ''}" style="font-size:0.7rem;">
                    ${ds.spokeThisRound ? '✓ Выступил' : 'Ожидает'}
                  </span>
                </div>
                <strong style="font-size:0.94rem;">${escapeHtml(label)}</strong>
                <div class="ap-dots">
                  ${Array.from({ length: Math.max(ds.maxAp, ds.ap) }, (_, i) => `<span class="ap-dot ${i >= ds.ap ? 'is-spent' : ''}"></span>`).join('')}
                  <span class="mono" style="font-size:0.76rem; color:var(--text-muted); margin-left:4px;">${ds.ap}/${ds.maxAp} ОД</span>
                </div>
              </div>
            `;
          })
          .join('')}
      </footer>

      ${spotlightHtml}
    </div>
  `;
}

function renderAudienceLocationCard(ep, game, loc) {
  const ls = game.locations[loc.id];
  const tokens = ls?.tokens || 0;
  const shielded = Boolean(ls?.shielded);

  let stateClass = 'state-calm';
  let statusBadge = '<span class="badge badge-success">✓ Чисто</span>';

  if (shielded) {
    stateClass = 'state-shielded';
    statusBadge = '<span class="badge badge-success">🛡️ Щит активен</span>';
  } else if (tokens >= 4) {
    stateClass = 'state-overflow';
    statusBadge = '<span class="badge badge-danger">💥 УГРОЗА ВЗРЫВА 4+</span>';
  } else if (tokens === 3) {
    stateClass = 'state-risk';
    statusBadge = '<span class="badge badge-brand">⚠️ Риск взрыва</span>';
  } else if (tokens === 2) {
    stateClass = 'state-silence';
    statusBadge = '<span class="badge badge-brand">⚠️ Эффект молчания (+1)</span>';
  } else if (tokens === 1) {
    statusBadge = '<span class="badge">1 искра</span>';
  }

  return `
    <article class="location-card ${stateClass}">
      <div class="location-media" style="height:122px;">
        ${renderMediaSlotHtml({
          episode: ep,
          assetKey: loc.assetKey,
          alt: loc.name,
          fallbackType: 'location',
          fallbackData: loc
        })}
        ${shielded ? `<div class="location-shield-overlay">🛡️ ЩИТ МОДЕРАЦИИ</div>` : ''}
      </div>
      <div class="location-head">
        <h3 class="location-name" style="font-size:1.05rem;">${escapeHtml(loc.name)}</h3>
        <span class="location-count-pill">${tokens} 🔥</span>
      </div>
      <div class="tokens-tray">
        ${
          tokens > 0
            ? Array.from({ length: Math.min(tokens, 10) }, () => `<span class="spark-token">!</span>`).join('')
            : `<span class="tokens-empty">Очагов нет</span>`
        }
      </div>
      <div class="location-status-row">${statusBadge}</div>
    </article>
  `;
}

/* ============================================================================
   4. Полноэкранная проекция активного события (Вброс / Улика / Дилемма / Фаза 3)
   ============================================================================ */

function renderAudienceSpotlight(ep, game, spotlight) {
  if (!spotlight || !spotlight.type) return '';

  // А) Вброс на весь экран проектора
  if (spotlight.type === 'rumor') {
    const rumor = ep.rumorDeck.find((r) => r.id === spotlight.payload?.rumorId);
    if (!rumor || !game.rumors.revealedIds.includes(rumor.id)) return '';

    const hidePhen =
      store.prefs.hidePhenomena && !game.rumors.revealedPhenomenaIds.includes(rumor.id);

    return `
      <div class="audience-spotlight modal-rumor">
        <div class="modal-dialog modal-xl">
          <div class="breaking-strip">
            <span>⚡ BREAKING / НОВЫЙ ВБРОС • РАУНД ${rumor.round} • КАРТА № ${rumor.number}</span>
            <span>${escapeHtml(rumor.sourceLabel || '')}</span>
          </div>
          <div class="modal-body">
            <div class="rumor-stage">
              <div style="border-radius:var(--radius-lg); overflow:hidden; min-height:340px; border:1px solid var(--border-default); background:var(--bg-surface-2);">
                ${renderMediaSlotHtml({
                  episode: ep,
                  assetKey: rumor.assetKey,
                  alt: rumor.title,
                  fallbackType: rumor.fallbackType,
                  fallbackData: rumor,
                  contain: true
                })}
              </div>
              <div style="display:flex; flex-direction:column; gap:18px;">
                <h2 style="font-size:2.1rem; font-weight:900;">«${escapeHtml(rumor.title)}»</h2>
                <p style="font-size:1.18rem; line-height:1.62; color:var(--text-secondary);">${escapeHtml(rumor.text)}</p>
                <div class="phenomenon-box">
                  <span style="font-size:0.78rem; font-weight:800; color:var(--accent-indigo-bright); text-transform:uppercase;">
                    🧠 Медиапсихологический феномен
                  </span>
                  ${
                    hidePhen
                      ? `<div style="font-size:1rem; font-weight:700; color:var(--text-muted);">
                           Задача Стола № 5: диагностируйте феномен по сюжету вброса!
                         </div>`
                      : `<div class="anim-phenomenon-reveal" style="font-size:1.25rem; font-weight:900;">
                           ${escapeHtml(rumor.phenomenon)}
                         </div>`
                  }
                </div>
                <div class="rumor-effect-box">
                  <span style="font-size:0.78rem; font-weight:800; color:var(--accent-danger-bright); text-transform:uppercase;">
                    🔥 Эффект на карте кампуса
                  </span>
                  <div style="font-size:1.12rem; font-weight:800;">${escapeHtml(rumor.effectText)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Б) Вскрытый конверт улики на весь экран
  if (spotlight.type === 'clue_reveal') {
    const clue = ep.clueDeck.find((c) => c.id === spotlight.payload?.clueId);
    if (!clue || !game.clues.openedIds.includes(clue.id)) return '';
    const isTrue = Boolean(clue.isTrue);

    return `
      <div class="audience-spotlight">
        <div class="modal-dialog modal-xl anim-clue-unfold">
          <div class="modal-header">
            <div>
              <span class="badge ${isTrue ? 'badge-success' : 'badge-danger'}">КОНВЕРТ № ${clue.number} • ВСКРЫТО ОТДЕЛОМ OSINT</span>
              <h2 style="font-size:1.7rem; margin-top:6px;">${escapeHtml(clue.coverTitle)}</h2>
            </div>
            <div class="verdict-stamp ${isTrue ? 'is-true' : 'is-false'} anim-stamp-slam">
              ${isTrue ? '✓ ' : '✕ '}${escapeHtml(clue.verdictLabel)}
            </div>
          </div>
          <div class="modal-body">
            <div class="clue-reveal-grid">
              <div style="border-radius:var(--radius-lg); overflow:hidden; min-height:320px; border:1px solid var(--border-default); background:var(--bg-surface-2);">
                ${renderMediaSlotHtml({
                  episode: ep,
                  assetKey: clue.assetKey,
                  alt: clue.coverTitle,
                  fallbackType: clue.fallbackType,
                  fallbackData: clue,
                  contain: true
                })}
              </div>
              <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="padding:18px; border-radius:var(--radius-md); background:${isTrue ? 'var(--accent-success-soft)' : 'var(--accent-danger-soft)'}; border:1.5px solid ${isTrue ? 'var(--accent-success-border)' : 'var(--accent-danger-border)'};">
                  <div style="font-size:0.84rem; font-weight:800; color:${isTrue ? 'var(--accent-success-bright)' : 'var(--accent-danger-bright)'}; text-transform:uppercase;">
                    ${isTrue ? 'Верифицированный факт' : `Ловушка: ${escapeHtml(clue.trapName || 'Шум')}`}
                  </div>
                  <div style="font-size:1.15rem; font-weight:800; margin-top:8px;">${escapeHtml(clue.summary)}</div>
                </div>
                <p style="font-size:1.08rem; line-height:1.62; color:var(--text-secondary);">${escapeHtml(clue.details)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // В) Этическая дилемма № 6 (Раунд 3)
  if (spotlight.type === 'dilemma') {
    const dilemma = (ep.dilemmas || []).find((d) => d.id === spotlight.payload?.dilemmaId) || ep.dilemmas?.[0];
    if (!dilemma) return '';
    const resolved = game.dilemmaResolved[dilemma.id];

    return `
      <div class="audience-spotlight">
        <div class="modal-dialog modal-xl">
          <div class="modal-header" style="background:linear-gradient(90deg, var(--accent-brand-soft), var(--accent-danger-soft));">
            <div>
              <span class="badge badge-brand">РАУНД 3 • 15 СЕКУНД НА РЕШЕНИЕ ШТАБА</span>
              <h2 style="font-size:1.8rem; margin-top:6px;">${escapeHtml(dilemma.title)}</h2>
            </div>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap:18px;">
            <p style="font-size:1.18rem; line-height:1.58;">${escapeHtml(dilemma.prompt)}</p>
            <div class="dilemma-protocol-box" style="margin-bottom:0;">
              <div style="font-size:0.9rem; font-weight:800; color:var(--accent-indigo-bright);">⚖️ ${escapeHtml(dilemma.protocolTitle)}</div>
              <div class="dilemma-protocol-list" style="font-size:1rem;">
                ${dilemma.protocolQuestions.map((q) => `<div>${escapeHtml(q)}</div>`).join('')}
              </div>
            </div>
            ${
              resolved
                ? `<div style="padding:20px; border-radius:var(--radius-lg); background:${resolved.choice === 'accepted_dark_pr' ? 'var(--accent-danger-soft)' : 'var(--accent-success-soft)'}; border:2px solid ${resolved.choice === 'accepted_dark_pr' ? 'var(--accent-danger-bright)' : 'var(--accent-success-bright)'}; font-size:1.25rem; font-weight:900;">
                     ВЫБОР ШТАБА: ${escapeHtml(resolved.label)}
                   </div>`
                : `<div class="dilemma-choices-grid">
                     <div class="dilemma-option-card is-dark-pr">
                       <span class="badge badge-danger">${escapeHtml(dilemma.acceptOption.badge)}</span>
                       <h3 style="font-size:1.3rem;">${escapeHtml(dilemma.acceptOption.label)}</h3>
                       <p style="font-size:0.96rem; color:var(--text-secondary);">Мгновенно снимает 4 любых жетона с карты… но с какими последствиями для доверия?</p>
                     </div>
                     <div class="dilemma-option-card is-ethical-veto">
                       <span class="badge badge-success">${escapeHtml(dilemma.rejectOption.badge)}</span>
                       <h3 style="font-size:1.3rem;">${escapeHtml(dilemma.rejectOption.label)}</h3>
                       <p style="font-size:0.96rem; color:var(--text-secondary);">Принципиальный отказ от бот-атаки и контр-слива (Стол № 5 может применить Вето за 0 ОД).</p>
                     </div>
                   </div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  // Г) Официальное опровержение в эфире (Раунд 4)
  if (spotlight.type === 'refutation') {
    const snap = store.ui.timerSnapshot;
    return `
      <div class="audience-spotlight">
        <div class="modal-dialog modal-lg">
          <div class="modal-header" style="background:linear-gradient(90deg, var(--accent-success-soft), var(--accent-brand-soft));">
            <div>
              <span class="badge badge-live">ПРЯМОЙ ЭФИР • РАУНД 4 • СТОЛ № 4</span>
              <h2 style="font-size:1.85rem; margin-top:6px;">📣 Официальное опровержение («Сэндвич правды»)</h2>
            </div>
            <div class="speaker-timer-box" data-timer-speaker-box style="padding:10px 18px;">
              <span class="speaker-timer-digits" style="font-size:2rem;" data-timer-speaker-digits>${formatSS(snap.speakerRemaining)}</span>
            </div>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
            <div style="padding:16px; border-radius:var(--radius-md); background:var(--accent-success-soft); border-left:4px solid var(--accent-success-bright); font-size:1.1rem;">
              <strong>1. ПРАВДА:</strong> утверждаем честный факт без повторения ярлыка фейка
            </div>
            <div style="padding:16px; border-radius:var(--radius-md); background:var(--accent-info-soft); border-left:4px solid var(--accent-info-bright); font-size:1.1rem;">
              <strong>2. РАЗБОР МАНИПУЛЯЦИИ:</strong> предъявляем ≥ 3 верифицированные улики
            </div>
            <div style="padding:16px; border-radius:var(--radius-md); background:var(--accent-brand-soft); border-left:4px solid var(--accent-brand-bright); font-size:1.1rem;">
              <strong>3. ПРАВДА И ПОЗИЦИЯ:</strong> уважительное завершение и открытость факультета
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Д) Пошаговая проверка Фазы 3
  if (spotlight.type === 'phase3') {
    const results = game.phase3State?.results || [];
    return `
      <div class="audience-spotlight">
        <div class="modal-dialog modal-xl">
          <div class="modal-header">
            <div>
              <span class="badge badge-danger">РАУНД ${game.round} • ФАЗА 3 — ПРОВЕРКА ПОЛЯ</span>
              <h2 style="font-size:1.65rem; margin-top:4px;">Проверка 6 локаций кампуса</h2>
            </div>
            <span class="badge badge-brand mono" style="font-size:1.05rem; padding:8px 14px;">
              ДОВЕРИЕ: ${game.trust} / ${game.maxTrust}
            </span>
          </div>
          <div class="modal-body">
            <div class="phase3-grid">
              ${results
                .map((res, idx) => {
                  const ls = game.locations[res.locationId];
                  const cls =
                    res.status === 'explosion'
                      ? 'res-explosion'
                      : res.status === 'silence'
                      ? 'res-silence'
                      : res.status === 'shielded'
                      ? 'res-shield'
                      : '';
                  return `
                    <div class="phase3-item ${cls} ${idx === game.phase3State.stepIndex ? 'is-just-checked' : ''}">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="font-size:1.08rem;">${escapeHtml(res.name)}</strong>
                        <span class="mono" style="font-weight:900;">${ls.tokens} 🔥 ${ls.shielded ? '🛡️' : ''}</span>
                      </div>
                      <div style="font-size:0.94rem; color:var(--text-secondary);">${escapeHtml(res.note)}</div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

/* ============================================================================
   5. Финальный экран исхода и вопросы дебрифинга для проектора
   ============================================================================ */

function renderAudienceEnding(root, ep, game) {
  const ending = ep.debriefing?.endings?.[game.outcome] || ep.debriefing?.endings?.lose_deadline;
  const isWin = game.outcome === 'full_win';
  const isPyrrhic = game.outcome === 'pyrrhic_win';
  const badgeClass = isWin ? 'badge-success' : isPyrrhic ? 'badge-brand' : 'badge-danger';

  root.innerHTML = `
    <div class="audience-shell anim-screen-in" style="gap:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="brand-mark">
          <div class="brand-icon brand-icon-sm">${renderBrandSvg(20)}</div>
          <div class="brand-name" style="font-size:1.1rem;">Медиапожарный • Итоги и дебрифинг</div>
        </div>
        <button type="button" class="btn btn-xs" data-action="aud-fullscreen">⛶ Полный экран</button>
      </div>

      <section class="ending-hero" style="border-color:${isWin ? 'var(--accent-success-bright)' : isPyrrhic ? 'var(--accent-brand-bright)' : 'var(--accent-danger-bright)'};">
        <div style="display:flex; flex-direction:column; gap:14px;">
          <span class="badge ${badgeClass}" style="align-self:flex-start; font-size:0.86rem; padding:6px 14px;">
            ${escapeHtml(ending.badge)}
          </span>
          <h1 style="font-size: clamp(2rem, 3.2vw, 2.9rem); font-weight:900;">${escapeHtml(ending.title)}</h1>
          <div style="font-size:1.05rem; font-weight:700; color:var(--text-muted);">${escapeHtml(ending.subtitle)}</div>
          <p style="font-size:1.08rem; line-height:1.65; color:var(--text-secondary);">${escapeHtml(ending.epilogue)}</p>

          <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:6px;">
            <span class="badge badge-brand mono">Доверие: ${game.trust}/${game.maxTrust}</span>
            <span class="badge badge-success mono">Истинных улик: ${game.clues.trueIds.length}/4</span>
            <span class="badge badge-danger mono">Взрывов: ${game.stats.explosions}</span>
            <span class="badge badge-info mono">Шума отсеяно: ${game.clues.falseIds.length}</span>
          </div>
        </div>

        <div style="border-radius:var(--radius-lg); overflow:hidden; min-height:300px; border:1px solid var(--border-default);">
          ${renderMediaSlotHtml({
            episode: ep,
            assetKey: ending.assetKey,
            alt: ending.title,
            fallbackType: ending.fallbackType,
            fallbackData: { title: ending.title }
          })}
        </div>
      </section>

      <section>
        <h2 style="font-size:1.35rem; margin-bottom:12px;">💬 4 вопроса для обсуждения с аудиторией</h2>
        <div class="debrief-questions-grid">
          ${(ep.debriefing?.questions || [])
            .map(
              (q) => `
            <article class="debrief-q-card">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="how-step-num" style="width:30px; height:30px; font-size:0.85rem;">${q.number}</span>
                <h3 style="font-size:1.04rem;">${escapeHtml(q.title)}</h3>
              </div>
              <p style="font-size:0.95rem; color:var(--text-secondary); line-height:1.55;">${escapeHtml(q.question)}</p>
            </article>
          `
            )
            .join('')}
        </div>
      </section>
    </div>
  `;
                             }
