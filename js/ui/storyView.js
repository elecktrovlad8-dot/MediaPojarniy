/**
 * МЕДИАПОЖАРНЫЙ — Полноэкранный сюжетный пролог (презентация завязки для аудитории)
 * Листается кликами или стрелками клавиатуры (← / →), автоматически синхронизируется со 2-м экраном.
 */

import { store } from '../state.js';
import { renderMediaSlotHtml, escapeHtml } from '../media.js';
import { renderBrandSvg } from './hubView.js';

export function renderStoryView(root, actions) {
  const ep = store.getEpisode();
  const slides = ep.storySlides || [];
  const total = slides.length;
  const idx = Math.max(0, Math.min(total - 1, store.storySlideIndex || 0));
  const slide = slides[idx];

  if (!slide) {
    actions.onFinishPrologue();
    return;
  }

  const isFirst = idx === 0;
  const isLast = idx === total - 1;
  const isLight = store.prefs.theme === 'light';
  const audienceConnected = Boolean(store.ui.audienceConnected);

  root.innerHTML = `
    <div class="story-page anim-screen-in" role="region" aria-label="Сюжетный пролог">
      <!-- Верхняя панель пролога -->
      <header class="story-topbar">
        <div class="brand-mark">
          <div class="brand-icon brand-icon-sm">${renderBrandSvg(20)}</div>
          <div>
            <div class="brand-name" style="font-size:1rem;">${escapeHtml(ep.title)} — Пролог</div>
            <div class="brand-sub">${escapeHtml(ep.subtitle)} • Слайд ${idx + 1} из ${total}</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
          ${
            audienceConnected
              ? `<span class="badge badge-success">● Проектор синхронизирован</span>`
              : `<button type="button" class="btn btn-sm btn-info" data-action="open-audience-window">↗ 2-й экран проектора</button>`
          }
          <button type="button" class="btn btn-sm" data-action="toggle-theme" title="Светлая / Тёмная тема">
            ${isLight ? '🌙 Тёмная' : '☀️ Светлая'}
          </button>
          <button type="button" class="btn btn-sm" data-action="toggle-fullscreen" title="Полноэкранный режим (F)">
            ⛶ Полный экран
          </button>
          <button type="button" class="btn btn-sm btn-ghost" data-action="skip-prologue">
            Пропустить к полю →
          </button>
        </div>
      </header>

      <!-- Центральная кинематографичная сцена слайда -->
      <main class="story-stage">
        <div class="story-media-frame">
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
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
            <span class="badge ${idx === 1 ? 'badge-danger' : idx === 2 ? 'badge-live' : 'badge-brand'}">
              ${escapeHtml(slide.badge)}
            </span>
            <span class="badge mono">СЛАЙД ${idx + 1} / ${total}</span>
          </div>

          <div>
            <h1 style="font-size: clamp(1.85rem, 3vw, 2.7rem); font-weight: 900; line-height: 1.1;">
              ${escapeHtml(slide.title)}
            </h1>
            <div style="font-size: 1.08rem; font-weight: 700; color: var(--accent-brand-bright); margin-top: 8px;">
              ${escapeHtml(slide.subtitle)}
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            ${(slide.body || [])
              .map(
                (paragraph) => `
              <p style="font-size: 1.06rem; line-height: 1.65; color: var(--text-secondary);">
                ${escapeHtml(paragraph)}
              </p>
            `
              )
              .join('')}
          </div>

          ${
            slide.highlight
              ? `
                <div style="padding: 16px 18px; border-radius: var(--radius-md); background: ${
                  idx === 1 ? 'var(--accent-danger-soft)' : 'var(--accent-brand-soft)'
                }; border-left: 4px solid ${
                  idx === 1 ? 'var(--accent-danger-bright)' : 'var(--accent-brand-bright)'
                }; font-size: 0.98rem; font-weight: 600; color: var(--text-primary); line-height: 1.55;">
                  ${escapeHtml(slide.highlight)}
                </div>
              `
              : ''
          }
        </article>
      </main>

      <!-- Нижняя панель навигации по слайдам -->
      <footer class="story-footer">
        <div style="display:flex; align-items:center; gap:10px;">
          <button
            type="button"
            class="btn btn-lg"
            data-action="prev-slide"
            ${isFirst ? 'disabled' : ''}
          >
            ← Назад
          </button>
          <span style="font-size:0.8rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:6px;">
            Навигация: <kbd>←</kbd> <kbd>→</kbd>
          </span>
        </div>

        <div class="slide-dots" role="tablist" aria-label="Слайды пролога">
          ${slides
            .map(
              (s, i) => `
            <button
              type="button"
              class="slide-dot ${i === idx ? 'is-active' : ''}"
              data-goto-slide="${i}"
              role="tab"
              aria-selected="${i === idx}"
              aria-label="Слайд ${i + 1}: ${escapeHtml(s.title)}"
            ></button>
          `
            )
            .join('')}
        </div>

        <div>
          ${
            isLast
              ? `
                <button type="button" class="btn btn-primary btn-lg" data-action="finish-prologue">
                  🔥 Начать Раунд 1 →
                </button>
              `
              : `
                <button type="button" class="btn btn-primary btn-lg" data-action="next-slide">
                  Следующий слайд →
                </button>
              `
          }
        </div>
      </footer>
    </div>
  `;

  bindStoryEvents(root, idx, total, actions);
}

function bindStoryEvents(root, idx, total, actions) {
  root.querySelector('[data-action="prev-slide"]')?.addEventListener('click', () => {
    if (idx > 0) actions.onSetSlide(idx - 1);
  });

  root.querySelector('[data-action="next-slide"]')?.addEventListener('click', () => {
    if (idx < total - 1) actions.onSetSlide(idx + 1);
  });

  root.querySelectorAll('[data-goto-slide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Number(btn.getAttribute('data-goto-slide'));
      actions.onSetSlide(target);
    });
  });

  root.querySelector('[data-action="finish-prologue"]')?.addEventListener('click', () => {
    actions.onFinishPrologue();
  });

  root.querySelector('[data-action="skip-prologue"]')?.addEventListener('click', () => {
    actions.onFinishPrologue();
  });

  root.querySelector('[data-action="open-audience-window"]')?.addEventListener('click', () => {
    actions.onOpenAudienceWindow();
  });

  root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    actions.onToggleTheme();
  });

  root.querySelector('[data-action="toggle-fullscreen"]')?.addEventListener('click', () => {
    actions.onToggleFullscreen();
  });
}
