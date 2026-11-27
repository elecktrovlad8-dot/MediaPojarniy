/**
 * МЕДИАПОЖАРНЫЙ — Главный экран платформы (Хаб)
 * Представляет систему, объясняет механику очной игры и выводит витрину антологии эпизодов.
 */

import { getAllEpisodes } from '../../data/episodes/index.js';
import { store } from '../state.js';
import { renderMediaSlotHtml, escapeHtml } from '../media.js';
import { getTotalRedTokens } from '../engine.js';

export function renderBrandSvg(size = 24) {
  return `
    <svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <path d="M32 8c3 11-7 16-7 25 0 6 4 10 10 10 3 0 5-1 7-3-2 10-10 17-20 17-11 0-19-8-19-19 0-12 10-19 17-27 3-3 6-4 12-3z" fill="#F59E0B"/>
      <path d="M39 18c6 6 13 13 13 23 0 9-7 16-16 16 5-3 8-8 8-14 0-6-5-12-5-25z" fill="#EF4444"/>
    </svg>
  `;
}

export function renderHubView(root, actions) {
  const episodes = getAllEpisodes();
  const featured = episodes.find((ep) => ep.status === 'available') || episodes[0];
  const upcoming = episodes.filter((ep) => ep.status !== 'available');

  const hasResume = store.hasSavedActiveGame(featured.id);
  const savedGame = hasResume ? store.game : null;
  const isLight = store.prefs.theme === 'light';
  const soundOn = store.prefs.soundEnabled;

  root.innerHTML = `
    <header class="site-header">
      <div class="container site-header-inner">
        <div class="header-brand" data-action="go-hub" role="button" tabindex="0" aria-label="На главную Медиапожарный">
          <div class="brand-mark">
            <div class="brand-icon">${renderBrandSvg(24)}</div>
            <div>
              <div class="brand-name">Медиапожарный</div>
              <div class="brand-sub">Ситуационный центр ведущего</div>
            </div>
          </div>
        </div>

        <nav class="header-actions" aria-label="Инструменты ведущего">
          <button type="button" class="btn btn-sm" data-action="open-rules">
            📘 О проекте и правила
          </button>
          <button type="button" class="btn btn-sm" data-action="open-media-manager">
            🖼️ Медиа-менеджер (assets)
          </button>
          <button type="button" class="btn btn-sm" data-action="open-onboarding" title="Краткий тур для ведущего">
            🧭 Гид ведущего
          </button>
          <button type="button" class="btn btn-sm" data-action="toggle-sound" aria-pressed="${soundOn}">
            ${soundOn ? '🔊 Звук: вкл' : '🔇 Звук: выкл'}
          </button>
          <button type="button" class="btn btn-sm" data-action="toggle-theme" title="Переключить тему для проектора">
            ${isLight ? '🌙 Тёмная' : '☀️ Светлая (проектор)'}
          </button>
        </nav>
      </div>
    </header>

    <main class="container hub-page anim-screen-in">
      <!-- HERO-БЛОК ПЛАТФОРМЫ -->
      <section class="hub-hero" aria-labelledby="hub-hero-heading">
        <div class="hub-hero-copy">
          <div class="hub-hero-pills">
            <span class="badge badge-brand">🔥 Очный настольный симулятор + цифровой штаб</span>
            <span class="badge badge-info">Для вузов • 25–30 студентов</span>
            <span class="badge badge-success">Без телефонов игроков</span>
          </div>

          <h1 id="hub-hero-heading" class="hub-hero-title">
            Управляйте информационным пожаром в реальном времени
          </h1>

          <p class="hub-hero-lead">
            <strong>«Медиапожарный»</strong> — цифровой ситуационный центр преподавателя и гейм-мастера для проведения очных антикризисных PR-игр и практикумов по медиапсихологии. Студенты работают вживую за 5 столами с физическими карточками, конвертами и бланками, а ваш проектор превращается в динамичный штаб-экран с картой кампуса, Шкалой Доверия, таймерами и дебрифингом.
          </p>

          <div class="hub-hero-pills">
            <span class="badge">Антикризисный PR</span>
            <span class="badge">OSINT и фактчекинг</span>
            <span class="badge">Медиация конфликтов</span>
            <span class="badge">Противодействие культуре отмены</span>
            <span class="badge">Когнитивные искажения</span>
          </div>

          <div class="hub-hero-actions">
            <button type="button" class="btn btn-primary btn-lg" data-action="select-episode" data-episode-id="${escapeHtml(featured.id)}">
              ▶ Выбрать Часть 1: «${escapeHtml(featured.title)}»
            </button>
            ${
              hasResume
                ? `<button type="button" class="btn btn-success btn-lg" data-action="continue-game">
                     ↻ Продолжить партию (Раунд ${savedGame.round}/${featured.initialState.totalRounds})
                   </button>`
                : ''
            }
            <button type="button" class="btn btn-lg" data-action="open-print-kit">
              🖨️ Комплект печати для столов
            </button>
          </div>
        </div>

        <!-- Визуальный макет штаб-экрана справа -->
        <div class="hub-hero-visual">
          <div class="panel" style="background: var(--bg-surface-2); border-color: var(--accent-brand-border); display:flex; flex-direction:column; gap:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="badge badge-live">ШТАБ В ЭФИРЕ • ПРЕВЬЮ</span>
              <span class="mono" style="font-size:0.82rem; color:var(--accent-brand-bright); font-weight:800;">ДЕДЛАЙН 18:00</span>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted); margin-bottom:6px;">
                <span>ШКАЛА ДОВЕРИЯ ФАКУЛЬТЕТА</span>
                <span class="mono" style="color:var(--accent-success-bright); font-weight:800;">7 / 10</span>
              </div>
              <div class="trust-bar" aria-hidden="true">
                ${Array.from({ length: 10 }, (_, i) => {
                  const n = i + 1;
                  const filled = n <= 7;
                  const segClass = n <= 4 ? 'is-critical-seg' : 'is-win-seg';
                  const threshold = n === 5 ? 'is-threshold' : '';
                  return `<div class="trust-seg ${filled ? 'is-filled' : ''} ${segClass} ${threshold}"></div>`;
                }).join('')}
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div style="padding:10px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--accent-danger-border);">
                <div style="font-size:0.72rem; color:var(--accent-danger-bright); font-weight:800;">ОНЛАЙН-СРЕДА (3)</div>
                <div style="font-size:0.8rem; margin-top:4px; color:var(--text-secondary);">Сливы кампуса • <strong>3 🔥</strong></div>
                <div style="font-size:0.8rem; color:var(--text-secondary);">Потоковый чат • <strong>2 🔥</strong></div>
                <div style="font-size:0.8rem; color:var(--text-muted);">Соцсети партнёра • 0</div>
              </div>
              <div style="padding:10px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--accent-success-border);">
                <div style="font-size:0.72rem; color:var(--accent-success-bright); font-weight:800;">ОФЛАЙН-СРЕДА (3)</div>
                <div style="font-size:0.8rem; margin-top:4px; color:var(--text-secondary);">Коворкинг • <strong>1 🔥</strong></div>
                <div style="font-size:0.8rem; color:var(--text-muted);">Студсовет • 0</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">Деканат • 0</div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:8px; border-top:1px dashed var(--border-default); font-size:0.78rem; color:var(--text-muted);">
              <span>5 отделов • по 2 ОД на раунд</span>
              <span class="badge badge-info">2-й экран проектора готов</span>
            </div>
          </div>
        </div>
      </section>

      <!-- БЛОК «КАК ПРОХОДИТ ЖИВАЯ ПАРТИЯ В АУДИТОРИИ» -->
      <section class="section-block" aria-labelledby="how-heading">
        <div class="section-header">
          <div>
            <h2 id="how-heading" class="section-title">Как проходит живая партия в аудитории</h2>
            <p class="section-subtitle">40–45 минут от пролога до пост-игрового разбора — без установки приложений и смартфонов участников</p>
          </div>
          <span class="badge badge-brand">Режим 1 экрана или 2-е окно для проектора</span>
        </div>

        <div class="how-grid">
          <article class="how-card">
            <div class="how-step-num">01</div>
            <h3>5 отделов за столами</h3>
            <p>
              Аудитория делится на 5 столов (OSINT, SMM, Медиация, PR-редакция, Медиапсихологи). У студентов на столах — бумажные памятки, бланки и 8 запечатанных конвертов улик.
            </p>
          </article>

          <article class="how-card">
            <div class="how-step-num">02</div>
            <h3>4 раунда по 5 минут</h3>
            <p>
              В начале раунда ведущий вскрывает 2 карты вбросов на большом экране. Столы совещаются 2 минуты, затем дежурные спикеры выходят по «Эстафете голоса» (25 секунд на стол).
            </p>
          </article>

          <article class="how-card">
            <div class="how-step-num">03</div>
            <h3>Тушение очагов на карте</h3>
            <p>
              Отделы тратят по 2 ОД, чтобы вскрывать конверты (1 ОД = 1 конверт), снимать «Искры слуха», ставить «Щиты модерации» и избегать Информационных взрывов (4+ жетона).
            </p>
          </article>

          <article class="how-card">
            <div class="how-step-num">04</div>
            <h3>Этика, финал и дебрифинг</h3>
            <p>
              В Раунде 3 штаб проходит Этическую дилемму Стрейзанд, в Раунде 4 зачитывает «Сэндвич правды», а после финала экран строит график Доверия и открывает вопросы для рефлексии.
            </p>
          </article>
        </div>
      </section>

      <!-- ВИТРИНА ВЫБОРА ЧАСТИ (АНТОЛОГИЯ СЦЕНАРИЕВ) -->
      <section class="section-block" aria-labelledby="episodes-heading">
        <div class="section-header">
          <div>
            <h2 id="episodes-heading" class="section-title">Антология кризисных сценариев</h2>
          </div>
        </div>

        <div class="episodes-grid">
          <!-- Главная карточка: Часть 1 «Вирус слуха» -->
          <article class="episode-featured-card">
            <div class="episode-featured-media">
              ${renderMediaSlotHtml({
                episode: featured,
                assetKey: featured.coverAsset || 'cover',
                alt: `Обложка Части 1: ${featured.title}`,
                fallbackType: 'episode-cover',
                fallbackData: { title: featured.title }
              })}
            </div>

            <div class="episode-featured-body">
              <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                  <span class="badge badge-success">● ДОСТУПНО • ЧАСТЬ ${featured.number}</span>
                  <span class="badge badge-brand">100% играбельно</span>
                </div>

                <div>
                  <h3 style="font-size:1.75rem; font-weight:900;">${escapeHtml(featured.title)}</h3>
                  <div style="font-size:1rem; font-weight:700; color:var(--accent-brand-bright); margin-top:2px;">
                    ${escapeHtml(featured.subtitle)}
                  </div>
                </div>

                <p style="font-size:0.93rem; color:var(--text-secondary); line-height:1.58;">
                  ${escapeHtml(featured.description)}
                </p>

                <div class="episode-meta-grid">
                  <div class="episode-meta-item">
                    <span class="episode-meta-label">Длительность</span>
                    <span class="episode-meta-value">40–45 минут</span>
                  </div>
                  <div class="episode-meta-item">
                    <span class="episode-meta-label">Участники</span>
                    <span class="episode-meta-value">25–30 чел. (5 столов)</span>
                  </div>
                  <div class="episode-meta-item">
                    <span class="episode-meta-label">Структура</span>
                    <span class="episode-meta-value">4 раунда • 8 вбросов • 8 улик</span>
                  </div>
                  <div class="episode-meta-item">
                    <span class="episode-meta-label">Аудитория</span>
                    <span class="episode-meta-value">${escapeHtml(featured.meta.audience)}</span>
                  </div>
                </div>

                ${
                  hasResume
                    ? `
                      <div class="resume-banner">
                        <div style="font-size:0.84rem;">
                          <strong style="color:var(--accent-success-bright);">Обнаружена незавершённая партия</strong>
                          <div style="color:var(--text-secondary); margin-top:2px;">
                            Раунд ${savedGame.round}/${featured.initialState.totalRounds} • Доверие: ${savedGame.trust}/10 • Истинных улик: ${savedGame.clues.trueIds.length}/4 • Искр: ${getTotalRedTokens(savedGame)}
                          </div>
                        </div>
                        <div style="display:flex; gap:8px;">
                          <button type="button" class="btn btn-success btn-sm" data-action="continue-game">Продолжить</button>
                          <button type="button" class="btn btn-outline-danger btn-sm" data-action="discard-saved">Сбросить</button>
                        </div>
                      </div>
                    `
                    : ''
                }
              </div>

              <div style="display:flex; flex-wrap:wrap; gap:10px; padding-top:8px;">
                <button type="button" class="btn btn-primary btn-lg" data-action="select-episode" data-episode-id="${escapeHtml(featured.id)}">
                  Выбрать часть и настроить партию →
                </button>
                <button type="button" class="btn" data-action="open-rules">
                  Правила и комплект печати
                </button>
              </div>
            </div>
          </article>

          <!-- Слоты будущих частей антологии (Часть 2 и Часть 3) -->
          <div class="episodes-upcoming-stack">
            ${upcoming
              .map(
                (ep) => `
              <article class="episode-upcoming-card">
                <div style="display:flex; flex-direction:column; gap:8px; position:relative; z-index:1;">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <span class="badge ${ep.status === 'in_development' ? 'badge-brand' : 'badge-info'}">
                      ЧАСТЬ ${ep.number} • ${escapeHtml(ep.statusLabel || 'Скоро')}
                    </span>
                    <span class="mono" style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(ep.meta.duration)}</span>
                  </div>
                  <h3 style="font-size:1.22rem;">${escapeHtml(ep.title)}</h3>
                  <div style="font-size:0.84rem; font-weight:700; color:var(--text-muted);">${escapeHtml(ep.subtitle)}</div>
                  <p style="font-size:0.84rem; color:var(--text-secondary); line-height:1.5;">
                    ${escapeHtml(ep.description)}
                  </p>
                </div>

                <div style="position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:10px; border-top:1px dashed var(--border-subtle); font-size:0.76rem; color:var(--text-muted);">
                  <span>Слот антологии: <code class="mono">${escapeHtml(ep.moduleHint || 'data/episodes/')}</code></span>
                  <span class="badge">${escapeHtml(ep.statusLabel || 'Скоро')}</span>
                </div>
              </article>
            `
              )
              .join('')}
          </div>
        </div>
      </section>
    </main>
  `;

  bindHubEvents(root, actions);
}

function bindHubEvents(root, actions) {
  root.querySelectorAll('[data-action="select-episode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const epId = btn.getAttribute('data-episode-id');
      actions.onSelectEpisode(epId);
    });
  });

  root.querySelectorAll('[data-action="continue-game"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onContinueGame());
  });

  root.querySelector('[data-action="discard-saved"]')?.addEventListener('click', () => {
    actions.onDiscardSaved();
  });

  root.querySelectorAll('[data-action="open-rules"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onOpenRules('rules'));
  });

  root.querySelector('[data-action="open-media-manager"]')?.addEventListener('click', () => {
    actions.onOpenRules('media');
  });

  root.querySelector('[data-action="open-onboarding"]')?.addEventListener('click', () => {
    actions.onOpenOnboarding();
  });

  root.querySelector('[data-action="open-print-kit"]')?.addEventListener('click', () => {
    actions.onPrintHandouts();
  });

  root.querySelector('[data-action="toggle-sound"]')?.addEventListener('click', () => {
    actions.onToggleSound();
  });

  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    actions.onToggleTheme();
  });
}
