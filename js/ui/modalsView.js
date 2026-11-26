/**
 * МЕДИАПОЖАРНЫЙ — Интерактивные модальные сцены и генератор печатного комплекта
 *
 * Реализует:
 * - Полноэкранный показ вбросов (BREAKING / НОВЫЙ ВБРОС) со скрытием/раскрытием феномена
 * - Витрину 8 конвертов улик (1 ОД = 1 конверт) и эффектное вскрытие с печатью
 * - Мастер выполнения действий 5 отделов (цели, две среды, красные флаги SMM, скрипты)
 * - Экран Этической дилеммы № 6 (выбор 4 жетонов для «чёрного PR» vs Этическое вето)
 * - Панель проверки Официального опровержения («Сэндвич правды», 40 сек)
 * - Пошаговую проверку Фазы 3 (Взрывы 4+, Эффект молчания 2–3, снятие щитов)
 * - Хронику кризиса, подтверждения, онбординг ведущего и печатные бланки (@media print)
 */

import { store } from '../state.js';
import {
  getActionCost,
  getEligibleLocations,
  getRoundRumors,
  getTotalRedTokens
} from '../engine.js';
import { renderMediaSlotHtml, hydrateMediaSlots, escapeHtml } from '../media.js';
import { renderRulesModalContent } from './rulesView.js';

/** Локальное состояние открытых пошаговых мастеров внутри модалок */
let wizardState = {
  modalKey: null,
  selectedLocId: null,
  selectedOnlineId: null,
  selectedOfflineId: null,
  checkedIds: new Set(),
  selectedRumorId: null,
  customPhenomenon: '',
  dilemmaStep: 'choose', // 'choose' | 'pick_tokens'
  dilemmaRemovals: {},   // locId -> count
  logRoundFilter: 'all',
  onboardingStep: 0
};

function resetWizardIfChanged(key) {
  if (wizardState.modalKey !== key) {
    wizardState = {
      modalKey: key,
      selectedLocId: null,
      selectedOnlineId: null,
      selectedOfflineId: null,
      checkedIds: new Set(),
      selectedRumorId: null,
      customPhenomenon: '',
      dilemmaStep: 'choose',
      dilemmaRemovals: {},
      logRoundFilter: 'all',
      onboardingStep: 0
    };
  }
}

export function renderModalRoot(root, actions) {
  const modal = store.ui.modal;

  if (!modal) {
    root.classList.remove('has-modal');
    root.innerHTML = '';
    wizardState.modalKey = null;
    return;
  }

  root.classList.add('has-modal');
  const modalKey = `${modal.type}:${JSON.stringify(modal.payload || {})}`;
  resetWizardIfChanged(modalKey);

  const ep = store.getEpisode();
  const game = store.game;

  switch (modal.type) {
    case 'rumor':
      renderRumorModal(root, ep, game, modal.payload, actions);
      break;
    case 'envelopes':
      renderEnvelopesModal(root, ep, game, actions);
      break;
    case 'clue_reveal':
      renderClueRevealModal(root, ep, game, modal.payload, actions);
      break;
    case 'dept_action':
      renderDeptActionModal(root, ep, game, modal.payload, actions);
      break;
    case 'dilemma':
      renderDilemmaModal(root, ep, game, modal.payload, actions);
      break;
    case 'refutation':
      renderRefutationModal(root, ep, game, actions);
      break;
    case 'phase3':
      renderPhase3Modal(root, ep, game, actions);
      break;
    case 'log':
      renderLogModal(root, ep, game, actions);
      break;
    case 'confirm':
      renderConfirmModal(root, modal.payload, actions);
      break;
    case 'onboarding':
      renderOnboardingModal(root, actions);
      break;
    case 'rules':
      renderRulesModalShell(root, ep, modal.payload, actions);
      break;
    default:
      store.closeModal();
      return;
  }

  // Закрытие по клику на полупрозрачный фон (кроме критических шагов, если не указано иное)
  const backdrop = root.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        actions.onCloseModal();
      }
    });
  }

  root.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onCloseModal());
  });

  hydrateMediaSlots(root);
}

/* ============================================================================
   1. Полноэкранный показ карты вброса (BREAKING / НОВЫЙ ВБРОС)
   ============================================================================ */

function renderRumorModal(root, ep, game, payload, actions) {
  const rumor = ep.rumorDeck.find((r) => r.id === payload.rumorId);
  if (!rumor) {
    actions.onCloseModal();
    return;
  }

  const isApplied = game.rumors.appliedIds.includes(rumor.id);
  const isDilemma = Boolean(rumor.isDilemma);
  const dilemmaDone = isDilemma && Boolean(game.dilemmaResolved[rumor.dilemmaId]);
  const hidePhen =
    store.prefs.hidePhenomena && !game.rumors.revealedPhenomenaIds.includes(rumor.id);

  root.innerHTML = `
    <div class="modal-backdrop modal-rumor" role="dialog" aria-modal="true" aria-labelledby="rumor-modal-title">
      <div class="modal-dialog modal-lg">
        <div class="breaking-strip">
          <span>⚡ BREAKING / НОВЫЙ ВБРОС • РАУНД ${rumor.round} • КАРТА № ${rumor.number}</span>
          <span>${escapeHtml(rumor.sourceLabel || 'Медиапоток кампуса')}</span>
        </div>

        <div class="modal-body">
          <div class="rumor-stage">
            <div style="border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--border-default); min-height:280px; background:var(--bg-surface-2);">
              ${renderMediaSlotHtml({
                episode: ep,
                assetKey: rumor.assetKey,
                alt: `Карта вброса № ${rumor.number}: ${rumor.title}`,
                fallbackType: rumor.fallbackType,
                fallbackData: rumor,
                contain: true
              })}
            </div>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                  <span class="badge badge-danger">Вброс № ${rumor.number} из 8</span>
                  ${isDilemma ? '<span class="badge badge-brand">КАРТА-ЛОВУШКА • ЭТИЧЕСКАЯ ДИЛЕММА</span>' : ''}
                  ${isApplied ? '<span class="badge badge-success">✓ Эффект уже на карте</span>' : ''}
                </div>
                <h2 id="rumor-modal-title" style="font-size:1.7rem; font-weight:900;">
                  «${escapeHtml(rumor.title)}»
                </h2>
              </div>

              <p style="font-size:1.02rem; line-height:1.6; color:var(--text-secondary);">
                ${escapeHtml(rumor.text)}
              </p>

              <!-- Блок медиапсихологического феномена (с опцией скрытия для Стола № 5) -->
              <div class="phenomenon-box">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <span style="font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent-indigo-bright);">
                    🧠 Медиапсихологический феномен (для Стола № 5)
                  </span>
                  ${
                    hidePhen
                      ? `<button type="button" class="btn btn-xs btn-info" data-action="reveal-phenomenon">
                           👁️ Раскрыть феномен
                         </button>`
                      : '<span class="badge badge-indigo">Открыто</span>'
                  }
                </div>
                ${
                  hidePhen
                    ? `<div style="font-size:0.86rem; color:var(--text-muted);">
                         Скрыто на экране: пусть Стол № 5 (Медиапсихологи) самостоятельно назовёт сработавшее когнитивное искажение и контрмеру за 1 ОД.
                       </div>`
                    : `<div class="anim-phenomenon-reveal">
                         <div style="font-size:1.05rem; font-weight:800; color:var(--text-primary);">${escapeHtml(rumor.phenomenon)}</div>
                         <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">
                           <strong>Контрмера:</strong> ${escapeHtml(rumor.phenomenonCounter || '')}
                         </div>
                       </div>`
                }
              </div>

              <!-- Блок игрового эффекта -->
              <div class="rumor-effect-box">
                <span style="font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent-danger-bright);">
                  🔥 Эффект на игровом поле
                </span>
                <div style="font-size:0.96rem; font-weight:800; color:var(--text-primary);">
                  ${escapeHtml(rumor.effectText)}
                </div>
                ${
                  !isDilemma
                    ? `<div style="font-size:0.76rem; color:var(--text-muted);">
                         Напоминание: в Фазе 1 Информационный взрыв (4+) не срабатывает мгновенно — у штаба есть текущий раунд, чтобы потушить очаг или поставить Щит.
                       </div>`
                    : ''
                }
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" data-action="close-modal">Закрыть</button>
          ${
            isDilemma
              ? `<button type="button" class="btn btn-primary btn-lg" data-action="goto-dilemma-from-rumor">
                   ${dilemmaDone ? '⚖️ Посмотреть итог Дилеммы № 6' : '⚖️ Перейти к экрану Этической дилеммы № 6 →'}
                 </button>`
              : !isApplied
              ? `<button type="button" class="btn btn-danger btn-lg" data-action="apply-rumor">
                   🔥 Применить эффект на карту
                 </button>`
              : `<span class="badge badge-success" style="padding:10px 14px;">✓ Эффект применён к карте кампуса</span>`
          }
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="reveal-phenomenon"]')?.addEventListener('click', () => {
    actions.onRevealPhenomenon(rumor.id);
  });

  root.querySelector('[data-action="apply-rumor"]')?.addEventListener('click', () => {
    actions.onApplyRumor(rumor.id);
  });

  root.querySelector('[data-action="goto-dilemma-from-rumor"]')?.addEventListener('click', () => {
    actions.onOpenDilemmaModal(rumor.dilemmaId);
  });
}

/* ============================================================================
   2. Витрина 8 пронумерованных конвертов улик (Стол № 1 OSINT)
   ============================================================================ */

function renderEnvelopesModal(root, ep, game, actions) {
  const osintDept = game.departments['dept-1'];
  const osintAp = osintDept ? osintDept.ap : 0;
  const trueCount = game.clues.trueIds.length;
  const falseCount = game.clues.falseIds.length;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="env-modal-title">
      <div class="modal-dialog modal-xl">
        <div class="modal-header">
          <div>
            <h2 id="env-modal-title" style="font-size:1.35rem;">✉️ Колода «Улики и факты» — 8 конвертов Стола № 1 (OSINT)</h2>
            <div style="font-size:0.84rem; color:var(--text-muted); margin-top:2px;">
              На закрытых конвертах видно только название источника с обложки (как на физических конвертах). Строгое правило: <strong>1 ОД Стола № 1 = 1 конверт</strong>.
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="badge ${osintAp > 0 ? 'badge-info' : 'badge-danger'} mono">ОД Стола № 1: ${osintAp} / 2</span>
            <span class="badge badge-success mono">Истинных: ${trueCount}/3 (макс. 4)</span>
            <span class="badge mono">Шума: ${falseCount}</span>
            <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Закрыть">✕</button>
          </div>
        </div>

        <div class="modal-body">
          ${
            osintAp <= 0
              ? `<div style="margin-bottom:16px; padding:12px 16px; border-radius:var(--radius-md); background:var(--accent-danger-soft); border:1px solid var(--accent-danger-border); font-size:0.88rem;">
                   <strong>У Стола № 1 (OSINT) закончились ОД в этом раунде (0/2).</strong> Новые закрытые конверты можно будет вскрыть в следующем раунде. Уже вскрытые конверты доступны для повторного показа аудитории.
                 </div>`
              : ''
          }

          <div class="envelopes-grid">
            ${ep.clueDeck
              .map((clue) => {
                const isOpened = game.clues.openedIds.includes(clue.id);
                const isTrue = clue.isTrue;
                const canOpenNow = !isOpened && osintAp >= 1 && game.phase !== 'phase3';

                let cardClass = '';
                let sealHtml = '<span class="envelope-seal">🔒 ЗАПЕЧАТАНО • 1 ОД</span>';
                let footerHtml = canOpenNow
                  ? '<span style="font-size:0.78rem; color:var(--accent-info-bright); font-weight:700;">Нажмите, чтобы вскрыть (-1 ОД) →</span>'
                  : '<span style="font-size:0.76rem; color:var(--text-muted);">Нет ОД у Стола № 1</span>';

                if (isOpened) {
                  cardClass = isTrue ? 'is-opened-true' : 'is-opened-false';
                  sealHtml = isTrue
                    ? '<span class="badge badge-success">✓ ИСТИННАЯ УЛИКА</span>'
                    : '<span class="badge badge-danger">✕ ЛОЖНЫЙ СЛЕД</span>';
                  footerHtml = '<span style="font-size:0.76rem; color:var(--text-secondary);">Нажмите, чтобы показать на экране</span>';
                }

                return `
                  <button
                    type="button"
                    class="envelope-card ${cardClass}"
                    data-envelope-id="${escapeHtml(clue.id)}"
                    data-envelope-opened="${isOpened ? '1' : '0'}"
                    ${!isOpened && !canOpenNow ? 'disabled' : ''}
                  >
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                      <span class="envelope-num">№ ${clue.number}</span>
                      ${sealHtml}
                    </div>
                    <div style="font-size:0.96rem; font-weight:800; line-height:1.3; color:var(--text-primary);">
                      ${escapeHtml(clue.coverTitle)}
                    </div>
                    <div>${footerHtml}</div>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" data-action="close-modal">Вернуться к карте</button>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-envelope-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const clueId = btn.getAttribute('data-envelope-id');
      const isOpened = btn.getAttribute('data-envelope-opened') === '1';
      if (isOpened) {
        actions.onInspectClueModal(clueId);
      } else {
        actions.onOpenClueEnvelope(clueId);
      }
    });
  });
}

/* ============================================================================
   3. Экран вскрытого конверта улики с анимацией печати вердикта
   ============================================================================ */

function renderClueRevealModal(root, ep, game, payload, actions) {
  const clue = ep.clueDeck.find((c) => c.id === payload.clueId);
  if (!clue) {
    actions.onCloseModal();
    return;
  }

  const isTrue = Boolean(clue.isTrue);
  const justOpened = Boolean(payload.justOpened);

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clue-modal-title">
      <div class="modal-dialog modal-lg anim-clue-unfold">
        <div class="modal-header" style="border-bottom-color:${isTrue ? 'var(--accent-success-border)' : 'var(--accent-danger-border)'};">
          <div>
            <span class="badge ${isTrue ? 'badge-success' : 'badge-danger'}">
              КОНВЕРТ № ${clue.number} • ${isTrue ? 'ДОКАЗАТЕЛЬНАЯ БАЗА' : 'ИНФОРМАЦИОННЫЙ ШУМ'}
            </span>
            <h2 id="clue-modal-title" style="font-size:1.38rem; margin-top:6px;">
              ${escapeHtml(clue.coverTitle)}
            </h2>
          </div>
          <div class="verdict-stamp ${isTrue ? 'is-true' : 'is-false'} ${justOpened ? 'anim-stamp-slam' : ''}">
            ${isTrue ? '✓ ' : '✕ '}${escapeHtml(clue.verdictLabel)}
          </div>
        </div>

        <div class="modal-body">
          <div class="clue-reveal-grid">
            <div style="border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--border-default); min-height:270px; background:var(--bg-surface-2);">
              ${renderMediaSlotHtml({
                episode: ep,
                assetKey: clue.assetKey,
                alt: `Карточка улики № ${clue.number}: ${clue.coverTitle}`,
                fallbackType: clue.fallbackType,
                fallbackData: clue,
                contain: true
              })}
            </div>

            <div style="display:flex; flex-direction:column; gap:14px;">
              <div style="padding:14px 16px; border-radius:var(--radius-md); background:${isTrue ? 'var(--accent-success-soft)' : 'var(--accent-danger-soft)'}; border:1px solid ${isTrue ? 'var(--accent-success-border)' : 'var(--accent-danger-border)'};">
                <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:${isTrue ? 'var(--accent-success-bright)' : 'var(--accent-danger-bright)'};">
                  ${isTrue ? 'Суть доказательства' : `Ловушка мышления: ${escapeHtml(clue.trapName || 'Шум')}`}
                </div>
                <div style="font-size:0.98rem; font-weight:700; margin-top:6px; line-height:1.5;">
                  ${escapeHtml(clue.summary)}
                </div>
              </div>

              <p style="font-size:0.95rem; line-height:1.6; color:var(--text-secondary);">
                ${escapeHtml(clue.details)}
              </p>

              <div style="padding:12px 14px; border-radius:var(--radius-sm); background:var(--bg-surface-2); border:1px solid var(--border-subtle); font-size:0.84rem; color:var(--text-secondary);">
                <strong style="color:var(--text-primary);">Методический акцент:</strong> ${escapeHtml(clue.usageHint)}
              </div>

              <div style="display:flex; align-items:center; justify-content:space-between; padding-top:6px; font-size:0.84rem; color:var(--text-muted);">
                <span>Собрано истинных улик на доске:</span>
                <strong class="mono" style="font-size:1rem; color:${game.clues.trueIds.length >= 3 ? 'var(--accent-success-bright)' : 'var(--accent-brand-bright)'};">
                  ${game.clues.trueIds.length} / 3 (макс. 4)
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" data-action="back-to-envelopes">← К столу конвертов</button>
          <button type="button" class="btn ${isTrue ? 'btn-success' : 'btn-primary'}" data-action="close-modal">
            ${isTrue ? '✓ Закрепить на Доске доказательств' : 'Убрать в сброс и закрыть'}
          </button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="back-to-envelopes"]')?.addEventListener('click', () => {
    actions.onOpenEnvelopesModal();
  });
}

/* ============================================================================
   4. Мастер выполнения действия отдела (выбор целей + чек-листы ведущего)
   ============================================================================ */

function renderDeptActionModal(root, ep, game, payload, actions) {
  const dept = ep.departments.find((d) => d.id === payload.deptId);
  const action = dept?.actions.find((a) => a.id === payload.actionId);
  if (!dept || !action) {
    actions.onCloseModal();
    return;
  }

  const cost = getActionCost(action, game);
  const checklist = action.checklistId ? ep.validationChecklists?.[action.checklistId] : null;
  const eligible = getEligibleLocations(action, ep, game);

  // Автовыбор, если цель всего одна
  if (
    ['remove_token', 'add_shield', 'remove_and_shield', 'remove_and_trust'].includes(action.type) &&
    !wizardState.selectedLocId &&
    eligible.length === 1
  ) {
    wizardState.selectedLocId = eligible[0].id;
  }

  let bodyHtml = '';

  // Вариант А: выбор 1 локации
  if (['remove_token', 'add_shield', 'remove_and_shield', 'remove_and_trust'].includes(action.type)) {
    bodyHtml += `
      <div style="margin-bottom:18px;">
        <div style="font-size:0.84rem; font-weight:800; margin-bottom:10px;">
          Выберите целевую локацию на карте кампуса:
        </div>
        <div class="target-picker-grid">
          ${eligible
            .map((loc) => {
              const ls = game.locations[loc.id];
              const isSel = wizardState.selectedLocId === loc.id;
              return `
                <button type="button" class="target-tile ${isSel ? 'is-selected' : ''}" data-pick-loc="${escapeHtml(loc.id)}">
                  <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <span class="badge ${loc.env === 'online' ? 'badge-info' : 'badge-success'}">${loc.env === 'online' ? 'Онлайн' : 'Офлайн'}</span>
                    <span class="mono" style="font-weight:800;">${ls.tokens} 🔥 ${ls.shielded ? '🛡️' : ''}</span>
                  </div>
                  <strong style="font-size:0.9rem;">${escapeHtml(loc.name)}</strong>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  // Вариант Б: Аналитическая сводка OSINT (1 онлайн + 1 офлайн)
  if (action.type === 'remove_split_envs') {
    const onlineTargets = ep.locations.filter((l) => l.env === 'online' && game.locations[l.id].tokens > 0);
    const offlineTargets = ep.locations.filter((l) => l.env === 'offline' && game.locations[l.id].tokens > 0);

    if (!wizardState.selectedOnlineId && onlineTargets.length === 1) {
      wizardState.selectedOnlineId = onlineTargets[0].id;
    }
    if (!wizardState.selectedOfflineId && offlineTargets.length === 1) {
      wizardState.selectedOfflineId = offlineTargets[0].id;
    }

    bodyHtml += `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div>
          <div style="font-size:0.84rem; font-weight:800; color:var(--accent-info-bright); margin-bottom:8px;">
            1. Онлайн-локация (-1 жетон):
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${onlineTargets
              .map((loc) => {
                const isSel = wizardState.selectedOnlineId === loc.id;
                return `
                  <button type="button" class="target-tile ${isSel ? 'is-selected' : ''}" data-pick-online="${escapeHtml(loc.id)}">
                    <strong>${escapeHtml(loc.name)}</strong>
                    <span class="mono" style="font-size:0.8rem; color:var(--text-muted);">Сейчас: ${game.locations[loc.id].tokens} 🔥</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
        <div>
          <div style="font-size:0.84rem; font-weight:800; color:var(--accent-success-bright); margin-bottom:8px;">
            2. Офлайн-локация (-1 жетон):
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${offlineTargets
              .map((loc) => {
                const isSel = wizardState.selectedOfflineId === loc.id;
                return `
                  <button type="button" class="target-tile ${isSel ? 'is-selected' : ''}" data-pick-offline="${escapeHtml(loc.id)}">
                    <strong>${escapeHtml(loc.name)}</strong>
                    <span class="mono" style="font-size:0.8rem; color:var(--text-muted);">Сейчас: ${game.locations[loc.id].tokens} 🔥</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Вариант В: Разбор когнитивного искажения (Стол № 5)
  if (action.type === 'bias_analysis') {
    const revealedRumors = ep.rumorDeck.filter((r) => game.rumors.revealedIds.includes(r.id));
    bodyHtml += `
      <div style="display:flex; flex-direction:column; gap:14px; margin-bottom:16px;">
        <div style="font-size:0.88rem; color:var(--text-secondary);">
          Спикер Стола № 5 должен устно назвать сработавший медиапсихологический феномен и предложить контрмеру → <strong>+1 к Шкале Доверия</strong>.
        </div>

        ${
          revealedRumors.length > 0
            ? `
              <div>
                <div style="font-size:0.82rem; font-weight:800; margin-bottom:8px;">Какой вброс разбирает Стол № 5 (выбор откроет его название на карточке):</div>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px;">
                  ${revealedRumors
                    .map((r) => {
                      const isSel = wizardState.selectedRumorId === r.id;
                      return `
                        <button type="button" class="target-tile ${isSel ? 'is-selected' : ''}" data-pick-rumor="${escapeHtml(r.id)}" data-phen-name="${escapeHtml(r.phenomenon)}">
                          <span class="badge badge-danger">Карта № ${r.number} • Раунд ${r.round}</span>
                          <strong style="font-size:0.88rem;">«${escapeHtml(r.title)}»</strong>
                          <span style="font-size:0.76rem; color:var(--accent-indigo-bright);">Верный ответ (ведущему): ${escapeHtml(r.phenomenon)}</span>
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `
            : ''
        }

        <div>
          <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:6px;">Или впишите названный феномен (опционально для журнала):</label>
          <input type="text" class="input-field" id="bias-custom-input" value="${escapeHtml(wizardState.customPhenomenon)}" placeholder="Например: Фрейминг и дегуманизация / Спираль молчания" />
        </div>
      </div>
    `;
  }

  // Вариант Г: Подготовка драфта (Стол № 4)
  if (action.type === 'prepare_draft') {
    bodyHtml += `
      <div style="padding:16px; border-radius:var(--radius-md); background:var(--accent-success-soft); border:1px solid var(--accent-success-border); margin-bottom:14px;">
        <strong style="color:var(--accent-success-bright);">Подготовка основы «Сэндвича правды» (1 ОД)</strong>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-top:6px;">
          На доске уже есть ${game.clues.trueIds.length} истинных улик. После подтверждения цена финального действия «Официальное опровержение» в Раунде 4 снизится с <strong>2 ОД до 1 ОД</strong>.
        </p>
      </div>
    `;
  }

  // Чек-лист ведущего (Красные флаги SMM / Скрипты медиации)
  if (checklist) {
    bodyHtml += `
      <div style="padding:14px 16px; border-radius:var(--radius-md); background:var(--bg-surface-2); border:1px solid var(--accent-brand-border);">
        <div style="font-weight:800; font-size:0.88rem; color:var(--accent-brand-bright);">${escapeHtml(checklist.title)}</div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 10px;">${escapeHtml(checklist.hint)}</div>
        <div class="checklist-stack">
          ${checklist.items
            .map((item) => {
              const checked = wizardState.checkedIds.has(item.id);
              return `
                <label class="check-row" style="background:var(--bg-surface);">
                  <input type="checkbox" data-wizard-check="${escapeHtml(item.id)}" ${checked ? 'checked' : ''} />
                  <span style="font-size:0.84rem;">${escapeHtml(item.label)}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  // Проверка готовности кнопки подтверждения
  let ready = true;
  if (['remove_token', 'add_shield', 'remove_and_shield', 'remove_and_trust'].includes(action.type)) {
    ready = Boolean(wizardState.selectedLocId);
  } else if (action.type === 'remove_split_envs') {
    ready = Boolean(wizardState.selectedOnlineId && wizardState.selectedOfflineId);
  }
  if (checklist) {
    const allChecked = checklist.items.every((it) => wizardState.checkedIds.has(it.id));
    ready = ready && allChecked;
  }

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="act-modal-title">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <span class="badge badge-brand">СТОЛ № ${dept.number} • ${escapeHtml(dept.shortName)} • СТОИМОСТЬ: ${cost} ОД</span>
            <h2 id="act-modal-title" style="font-size:1.3rem; margin-top:6px;">${escapeHtml(action.name)}</h2>
          </div>
          <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Закрыть">✕</button>
        </div>

        <div class="modal-body">
          <div style="padding:10px 14px; border-radius:var(--radius-sm); background:var(--bg-surface-2); border-left:3px solid ${dept.colorVar}; font-size:0.86rem; color:var(--text-secondary); margin-bottom:16px;">
            <strong>Подсказка ведущему:</strong> ${escapeHtml(action.gmHint || action.summary)}
          </div>
          ${bodyHtml}
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" data-action="close-modal">Отмена</button>
          <button type="button" class="btn btn-primary" data-action="confirm-dept-action" ${ready ? '' : 'disabled'}>
            ✓ Засчитать выступление (-${cost} ОД)
          </button>
        </div>
      </div>
    </div>
  `;

  // Биндинги мастера
  root.querySelectorAll('[data-pick-loc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.selectedLocId = btn.getAttribute('data-pick-loc');
      renderDeptActionModal(root, ep, game, payload, actions);
    });
  });

  root.querySelectorAll('[data-pick-online]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.selectedOnlineId = btn.getAttribute('data-pick-online');
      renderDeptActionModal(root, ep, game, payload, actions);
    });
  });

  root.querySelectorAll('[data-pick-offline]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.selectedOfflineId = btn.getAttribute('data-pick-offline');
      renderDeptActionModal(root, ep, game, payload, actions);
    });
  });

  root.querySelectorAll('[data-pick-rumor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.selectedRumorId = btn.getAttribute('data-pick-rumor');
      wizardState.customPhenomenon = btn.getAttribute('data-phen-name') || '';
      renderDeptActionModal(root, ep, game, payload, actions);
    });
  });

  root.querySelector('#bias-custom-input')?.addEventListener('input', (e) => {
    wizardState.customPhenomenon = e.target.value;
  });

  root.querySelectorAll('[data-wizard-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-wizard-check');
      if (input.checked) wizardState.checkedIds.add(id);
      else wizardState.checkedIds.delete(id);
      renderDeptActionModal(root, ep, game, payload, actions);
    });
  });

  root.querySelector('[data-action="confirm-dept-action"]')?.addEventListener('click', () => {
    actions.onExecuteDeptAction(dept.id, action.id, {
      locationId: wizardState.selectedLocId,
      onlineLocationId: wizardState.selectedOnlineId,
      offlineLocationId: wizardState.selectedOfflineId,
      rumorId: wizardState.selectedRumorId,
      phenomenonName: wizardState.customPhenomenon.trim()
    });
  });

  root.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onCloseModal());
  });
}

/* ============================================================================
   5. Экран Этической дилеммы № 6 (Раунд 3 — Чёрный PR vs Этическое вето)
   ============================================================================ */

function renderDilemmaModal(root, ep, game, payload, actions) {
  const dilemma = (ep.dilemmas || []).find((d) => d.id === payload.dilemmaId) || ep.dilemmas?.[0];
  if (!dilemma) {
    actions.onCloseModal();
    return;
  }

  const resolved = game.dilemmaResolved[dilemma.id];
  const totalMapTokens = getTotalRedTokens(game);
  const maxRemovable = Math.min(dilemma.acceptOption.tokensToRemove || 4, totalMapTokens);
  const pickedSum = Object.values(wizardState.dilemmaRemovals).reduce((s, n) => s + n, 0);

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dilemma-title">
      <div class="modal-dialog modal-lg">
        <div class="modal-header" style="background:linear-gradient(90deg, var(--accent-brand-soft), var(--accent-danger-soft));">
          <div>
            <span class="badge badge-brand">РАУНД 3 • ОСОБЫЙ ШАГ 15 СЕКУНД • КАРТА-ЛОВУШКА № 6</span>
            <h2 id="dilemma-title" style="font-size:1.45rem; margin-top:6px;">${escapeHtml(dilemma.title)}</h2>
          </div>
          <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Закрыть">✕</button>
        </div>

        <div class="modal-body">
          ${
            resolved
              ? `
                <div style="padding:20px; border-radius:var(--radius-lg); background:${
                  resolved.choice === 'accepted_dark_pr' ? 'var(--accent-danger-soft)' : 'var(--accent-success-soft)'
                }; border:2px solid ${
                  resolved.choice === 'accepted_dark_pr' ? 'var(--accent-danger-bright)' : 'var(--accent-success-bright)'
                };">
                  <div style="font-size:1.15rem; font-weight:900;">Решение штаба зафиксировано: ${escapeHtml(resolved.label)}</div>
                  <p style="margin-top:8px; color:var(--text-secondary);">
                    ${
                      resolved.choice === 'accepted_dark_pr'
                        ? `Снято ${resolved.removed} красных жетонов, но сработал Эффект Стрейзанд: Шкала Доверия упала на -3.`
                        : 'Сделка заблокирована! Эффект Стрейзанд предотвращён (+1 к Шкале Доверия, +1 красный жетон в Потоковый чат).'
                    }
                  </p>
                </div>
              `
              : wizardState.dilemmaStep === 'pick_tokens'
              ? `
                <div style="margin-bottom:16px; padding:14px 16px; border-radius:var(--radius-md); background:var(--accent-danger-soft); border:1.5px solid var(--accent-danger-bright);">
                  <strong style="color:var(--accent-danger-bright);">Фиксация выбора «Чёрный PR» (Эффект Стрейзанд: -3 к Доверию)</strong>
                  <div style="font-size:0.86rem; color:var(--text-secondary); margin-top:4px;">
                    Выберите <strong>${maxRemovable}</strong> любых красных жетона с карты для мгновенного снятия (выбрано: <strong class="mono">${pickedSum} / ${maxRemovable}</strong>). Сразу после подтверждения Шкала Доверия упадёт на <strong>-3</strong>.
                  </div>
                </div>

                <div class="target-picker-grid">
                  ${ep.locations
                    .map((loc) => {
                      const avail = game.locations[loc.id].tokens;
                      const picked = wizardState.dilemmaRemovals[loc.id] || 0;
                      const canInc = picked < avail && pickedSum < maxRemovable;
                      const canDec = picked > 0;
                      return `
                        <div class="target-tile ${picked > 0 ? 'is-selected' : ''}">
                          <div style="display:flex; justify-content:space-between; width:100%;">
                            <strong style="font-size:0.86rem;">${escapeHtml(loc.shortName)}</strong>
                            <span class="mono" style="font-size:0.8rem;">Есть: ${avail} 🔥</span>
                          </div>
                          <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-top:6px;">
                            <button type="button" class="btn btn-xs" data-dil-dec="${escapeHtml(loc.id)}" ${canDec ? '' : 'disabled'}>−</button>
                            <span class="mono" style="font-weight:900; color:${picked > 0 ? 'var(--accent-danger-bright)' : 'var(--text-muted)'};">Снять: ${picked}</span>
                            <button type="button" class="btn btn-xs btn-outline-danger" data-dil-inc="${escapeHtml(loc.id)}" ${canInc ? '' : 'disabled'}>+</button>
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              `
              : `
                <p style="font-size:1.02rem; line-height:1.58; color:var(--text-primary); margin-bottom:16px;">
                  ${escapeHtml(dilemma.prompt)}
                </p>

                <div class="dilemma-protocol-box">
                  <div style="font-size:0.82rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--accent-indigo-bright);">
                    ⚖️ ${escapeHtml(dilemma.protocolTitle)}
                  </div>
                  <div class="dilemma-protocol-list">
                    ${dilemma.protocolQuestions.map((q) => `<div>${escapeHtml(q)}</div>`).join('')}
                  </div>
                </div>

                <div class="dilemma-choices-grid">
                  <!-- Ветка 1: Принять сделку (чёрный PR — НЕ цензурируется!) -->
                  <div class="dilemma-option-card is-dark-pr">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                      <span class="badge badge-danger">${escapeHtml(dilemma.acceptOption.badge)}</span>
                      <h3 style="font-size:1.15rem;">${escapeHtml(dilemma.acceptOption.label)}</h3>
                      <p style="font-size:0.86rem; color:var(--text-secondary); line-height:1.5;">
                        ${escapeHtml(dilemma.acceptOption.description)}
                      </p>
                    </div>
                    <button type="button" class="btn btn-danger btn-lg" data-action="dilemma-choose-accept">
                      🔥 Принять сделку (-4 жетона / Доверие -3)
                    </button>
                  </div>

                  <!-- Ветка 2: Отказ / Вето Стола № 5 -->
                  <div class="dilemma-option-card is-ethical-veto">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                      <span class="badge badge-success">${escapeHtml(dilemma.rejectOption.badge)}</span>
                      <h3 style="font-size:1.15rem;">${escapeHtml(dilemma.rejectOption.label)}</h3>
                      <p style="font-size:0.86rem; color:var(--text-secondary); line-height:1.5;">
                        ${escapeHtml(dilemma.rejectOption.description)}
                      </p>
                    </div>
                    <button type="button" class="btn btn-success btn-lg" data-action="dilemma-choose-reject">
                      🛡️ Отказ / Вето Стола № 5 (+1 Доверие, +1 в чат)
                    </button>
                  </div>
                </div>
              `
          }
        </div>

        <div class="modal-footer">
          ${
            !resolved && wizardState.dilemmaStep === 'pick_tokens'
              ? `
                <button type="button" class="btn" data-action="dilemma-back">← Назад к развилке</button>
                <button type="button" class="btn btn-danger btn-lg" data-action="dilemma-confirm-accept" ${pickedSum === maxRemovable ? '' : 'disabled'}>
                  Подтвердить «чёрный PR» (-${pickedSum} жетон., Доверие -3)
                </button>
              `
              : `<button type="button" class="btn" data-action="close-modal">Закрыть</button>`
          }
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="dilemma-choose-accept"]')?.addEventListener('click', () => {
    wizardState.dilemmaStep = 'pick_tokens';
    wizardState.dilemmaRemovals = {};
    renderDilemmaModal(root, ep, game, payload, actions);
  });

  root.querySelector('[data-action="dilemma-choose-reject"]')?.addEventListener('click', () => {
    actions.onResolveDilemmaReject(dilemma.id, true);
  });

  root.querySelector('[data-action="dilemma-back"]')?.addEventListener('click', () => {
    wizardState.dilemmaStep = 'choose';
    renderDilemmaModal(root, ep, game, payload, actions);
  });

  root.querySelectorAll('[data-dil-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-dil-inc');
      wizardState.dilemmaRemovals[id] = (wizardState.dilemmaRemovals[id] || 0) + 1;
      renderDilemmaModal(root, ep, game, payload, actions);
    });
  });

  root.querySelectorAll('[data-dil-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-dil-dec');
      wizardState.dilemmaRemovals[id] = Math.max(0, (wizardState.dilemmaRemovals[id] || 0) - 1);
      renderDilemmaModal(root, ep, game, payload, actions);
    });
  });

  root.querySelector('[data-action="dilemma-confirm-accept"]')?.addEventListener('click', () => {
    actions.onResolveDilemmaAccept(dilemma.id, { ...wizardState.dilemmaRemovals });
  });

  root.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onCloseModal());
  });
}

/* ============================================================================
   6. Панель проверки Официального опровержения («Сэндвич правды», Раунд 4)
   ============================================================================ */

function renderRefutationModal(root, ep, game, actions) {
  const checklist = ep.validationChecklists?.truthSandwich;
  const trueClues = game.clues.trueIds
    .map((id) => ep.clueDeck.find((c) => c.id === id))
    .filter(Boolean);
  const cost = game.draftPrepared ? 1 : 2;
  const allChecked = (checklist?.items || []).every((it) => wizardState.checkedIds.has(it.id));
  const totalTokens = getTotalRedTokens(game);

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="refut-title">
      <div class="modal-dialog modal-lg">
        <div class="modal-header" style="background:linear-gradient(90deg, var(--accent-success-soft), var(--accent-brand-soft));">
          <div>
            <span class="badge badge-success">РАУНД 4 • ФИНАЛЬНОЕ ВЫСТУПЛЕНИЕ СТОЛА № 4 • ${cost} ОД ${game.draftPrepared ? '(С ДРАФТОМ)' : ''}</span>
            <h2 id="refut-title" style="font-size:1.4rem; margin-top:6px;">📣 Официальное опровержение («Сэндвич правды»)</h2>
          </div>
          <button type="button" class="btn btn-info btn-sm" data-action="start-refutation-timer">
            🎙️ Таймер спикера: 40 сек
          </button>
        </div>

        <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
          <!-- Сводка доказательной базы -->
          <div style="padding:14px 16px; border-radius:var(--radius-md); background:var(--bg-surface-2); border:1px solid var(--accent-success-border);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:0.88rem; color:var(--accent-success-bright);">Верифицированная доказательная база (${trueClues.length}/3 минимум):</strong>
              <span class="badge badge-success">✓ Условие по уликам выполнено</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${trueClues
                .map((c) => `<span class="badge badge-success">✓ № ${c.number}: ${escapeHtml(c.coverTitle)}</span>`)
                .join('')}
            </div>
          </div>

          <!-- Чек-лист формулы «Сэндвич правды» -->
          <div>
            <div style="font-weight:800; font-size:0.92rem; margin-bottom:8px;">${escapeHtml(checklist?.title || 'Чек-лист «Сэндвича правды»')}</div>
            <div class="checklist-stack">
              ${(checklist?.items || [])
                .map((item) => {
                  const checked = wizardState.checkedIds.has(item.id);
                  return `
                    <label class="check-row">
                      <input type="checkbox" data-refut-check="${escapeHtml(item.id)}" ${checked ? 'checked' : ''} />
                      <span style="font-size:0.9rem;">${escapeHtml(item.label)}</span>
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>

          <div style="padding:12px 14px; border-radius:var(--radius-sm); background:var(--accent-brand-soft); border:1px solid var(--accent-brand-border); font-size:0.86rem;">
            <strong>Результат публикации:</strong> с карты мгновенно снимаются все оставшиеся <strong>${totalTokens}</strong> красных жетонов и фиксируется финал партии. Текущая Шкала Доверия: <strong>${game.trust}/10</strong> (${game.trust >= ep.initialState.winMinTrust ? 'Полная победа!' : 'Пиррова победа (зона 1–4)'}).
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" data-action="close-modal">Отмена</button>
          <button type="button" class="btn btn-success btn-lg" data-action="publish-refutation" ${allChecked ? '' : 'disabled'}>
            🚀 Опубликовать Официальное опровержение (-${cost} ОД)
          </button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="start-refutation-timer"]')?.addEventListener('click', () => {
    actions.onStartSpeakerTimer(40);
  });

  root.querySelectorAll('[data-refut-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-refut-check');
      if (input.checked) wizardState.checkedIds.add(id);
      else wizardState.checkedIds.delete(id);
      renderRefutationModal(root, ep, game, actions);
    });
  });

  root.querySelector('[data-action="publish-refutation"]')?.addEventListener('click', () => {
    actions.onExecuteDeptAction('dept-4', 'pr-refutation', {});
  });

  root.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onCloseModal());
  });
}

/* ============================================================================
   7. Фаза 3 — Пошаговая наглядная проверка поля (6 локаций)
   ============================================================================ */

function renderPhase3Modal(root, ep, game, actions) {
  const p3 = game.phase3State;
  const results = p3?.results || [];
  const allChecked = Boolean(p3?.completed) || p3?.stepIndex >= ep.locations.length - 1;
  const isFinalRound = game.round >= ep.initialState.totalRounds;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="p3-title">
      <div class="modal-dialog modal-lg">
        <div class="modal-header">
          <div>
            <span class="badge badge-danger">РАУНД ${game.round} • ФАЗА 3 — ПРОВЕРКА ПОЛЯ</span>
            <h2 id="p3-title" style="font-size:1.35rem; margin-top:6px;">Системные триггеры конца раунда</h2>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="badge badge-brand mono">Доверие: ${game.trust} / ${game.maxTrust}</span>
            <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Свернуть">✕</button>
          </div>
        </div>

        <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
          <div style="font-size:0.86rem; color:var(--text-secondary);">
            Порядок проверки каждой незащищённой локации: <strong>4+ жетона → Информационный взрыв (-2 к Доверию)</strong>; <strong>2–3 жетона → Эффект молчания (+1 жетон)</strong>. Зелёный «Щит модерации» блокирует оба триггера и снимается в конце Фазы 3.
          </div>

          <div class="phase3-grid">
            ${results
              .map((res, idx) => {
                const locState = game.locations[res.locationId];
                const isJust = idx === p3.stepIndex;
                let cls = '';
                let icon = '⏳';
                if (res.status === 'explosion') {
                  cls = 'res-explosion';
                  icon = '💥';
                } else if (res.status === 'silence') {
                  cls = 'res-silence';
                  icon = '⚠️';
                } else if (res.status === 'shielded') {
                  cls = 'res-shield';
                  icon = '🛡️';
                } else if (res.status === 'calm') {
                  icon = '✓';
                }

                return `
                  <div class="phase3-item ${cls} ${isJust ? 'is-just-checked' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                      <strong style="font-size:0.92rem;">${icon} ${escapeHtml(res.name)}</strong>
                      <span class="mono" style="font-size:0.82rem; font-weight:800;">
                        ${locState.tokens} 🔥 ${locState.shielded ? '🛡️' : ''}
                      </span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">
                      ${escapeHtml(res.note)}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>

        <div class="modal-footer">
          ${
            !allChecked
              ? `
                <button type="button" class="btn" data-action="p3-run-all">Проверить все сразу</button>
                <button type="button" class="btn btn-danger btn-lg" data-action="p3-next">
                  🔥 Проверить следующую локацию (${Math.max(1, (p3?.stepIndex ?? -1) + 2)} / ${ep.locations.length})
                </button>
              `
              : `
                <button type="button" class="btn btn-primary btn-lg" data-action="p3-finish">
                  ${
                    isFinalRound
                      ? '⏱️ Завершить Раунд 4 — Проверка дедлайна 18:00 →'
                      : `Снять отработавшие щиты и начать Раунд ${game.round + 1} →`
                  }
                </button>
              `
          }
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="p3-next"]')?.addEventListener('click', () => {
    actions.onPhase3NextStep();
  });

  root.querySelector('[data-action="p3-run-all"]')?.addEventListener('click', () => {
    actions.onPhase3RunAll();
  });

  root.querySelector('[data-action="p3-finish"]')?.addEventListener('click', () => {
    actions.onPhase3Finish();
  });
}

/* ============================================================================
   8. Хроника кризиса (Живой журнал с фильтрацией по раундам)
   ============================================================================ */

function renderLogModal(root, ep, game, actions) {
  const filter = wizardState.logRoundFilter;
  const entries = (game?.log || []).filter((e) =>
    filter === 'all' ? true : Number(e.round) === Number(filter)
  );

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="log-title">
      <div class="modal-dialog modal-lg">
        <div class="modal-header">
          <div>
            <h2 id="log-title" style="font-size:1.3rem;">📜 Хроника кризиса</h2>
            <div style="font-size:0.8rem; color:var(--text-muted);">Полная запись вбросов, улик, действий отделов и триггеров</div>
          </div>
          <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Закрыть">✕</button>
        </div>

        <div class="modal-body">
          <div class="tabs-bar">
            ${['all', 1, 2, 3, 4]
              .map(
                (r) => `
              <button type="button" class="tab-btn ${String(filter) === String(r) ? 'is-active' : ''}" data-log-filter="${r}">
                ${r === 'all' ? `Все события (${game?.log?.length || 0})` : `Раунд ${r}`}
              </button>
            `
              )
              .join('')}
          </div>

          <div class="log-list">
            ${
              entries.length > 0
                ? entries
                    .map(
                      (e) => `
                  <div class="log-entry type-${escapeHtml(e.type)}">
                    <span class="mono" style="font-size:0.76rem; color:var(--text-muted);">${escapeHtml(e.time)}</span>
                    <div>
                      <div style="font-weight:800; font-size:0.88rem;">${escapeHtml(e.title)}</div>
                      ${e.detail ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">${escapeHtml(e.detail)}</div>` : ''}
                    </div>
                    <span class="badge mono">Р${e.round} • ${escapeHtml(e.phase)}</span>
                  </div>
                `
                    )
                    .join('')
                : `<div style="padding:24px; text-align:center; color:var(--text-muted);">В этом раунде записей пока нет.</div>`
            }
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" data-action="close-modal">Закрыть</button>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-log-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizardState.logRoundFilter = btn.getAttribute('data-log-filter');
      renderLogModal(root, ep, game, actions);
    });
  });

  root.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onCloseModal());
  });
}

/* ============================================================================
   9. Универсальное окно подтверждения (сброс, неиспользованные ОД и т. п.)
   ============================================================================ */

function renderConfirmModal(root, payload, actions) {
  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="modal-dialog modal-sm">
        <div class="modal-header">
          <h2 id="confirm-title" style="font-size:1.2rem;">${escapeHtml(payload.title || 'Подтвердите действие')}</h2>
          <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:0.95rem; line-height:1.58; color:var(--text-secondary);">
            ${escapeHtml(payload.message || '')}
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn" data-action="close-modal">${escapeHtml(payload.cancelLabel || 'Отмена')}</button>
          <button type="button" class="btn ${payload.danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-yes">
            ${escapeHtml(payload.confirmLabel || 'Подтвердить')}
          </button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="confirm-yes"]')?.addEventListener('click', () => {
    if (typeof payload.onConfirm === 'function') {
      payload.onConfirm();
    } else {
      actions.onCloseModal();
    }
  });
}

/* ============================================================================
   10. Короткий интерактивный онбординг ведущего при первом запуске
   ============================================================================ */

const ONBOARDING_STEPS = [
  {
    badge: 'ШАГ 1 ИЗ 3 • ФОРМАТ «МЕДИАПОЖАРНОГО»',
    title: 'Экран ведущего + живая настольная игра за 5 столами',
    body: 'Студенты не заходят в приложение с телефонов — они играют вживую с бумажными бланками, карточками и 8 конвертами на Столе № 1. Вы управляете темпом, картой кампуса, вбросами, Шкалой Доверия и таймерами с одного пульта.'
  },
  {
    badge: 'ШАГ 2 ИЗ 3 • ОДИН ИЛИ ДВА ЭКРАНА БЕЗ СПОЙЛЕРОВ',
    title: 'Гибридная работа с проектором в аудитории',
    body: 'В режиме одного экрана будущие вбросы и закрытые конверты скрыты, а нажатие клавиши H открывает компактную «Шторку ведущего» с подсказками. Если ноутбук подключён к проектору как расширенный экран, нажмите «↗ 2-й экран» и перетащите чистое окно для аудитории на проектор.'
  },
  {
    badge: 'ШАГ 3 ИЗ 3 • ЗАЩИТА ОТ ОШИБОК И ГОРЯЧИЕ КЛАВИШИ',
    title: 'Автосохранение, Undo (25 шагов) и быстрые клавиши',
    body: 'Каждый шаг мгновенно сохраняется в браузере, а Ctrl+Z отменяет случайное нажатие. Space — старт/пауза таймера, S — 25-секундный таймер спикера, H — шторка ведущего, R — правила, M — звук, F — полный экран.'
  }
];

function renderOnboardingModal(root, actions) {
  const step = ONBOARDING_STEPS[wizardState.onboardingStep] || ONBOARDING_STEPS[0];
  const isLast = wizardState.onboardingStep >= ONBOARDING_STEPS.length - 1;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div class="modal-dialog modal-sm">
        <div class="modal-header">
          <span class="badge badge-brand">${escapeHtml(step.badge)}</span>
          <button type="button" class="btn btn-xs btn-ghost" data-action="skip-onboarding">Пропустить</button>
        </div>

        <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
          <h2 id="onb-title" style="font-size:1.35rem;">${escapeHtml(step.title)}</h2>
          <p style="font-size:0.95rem; line-height:1.62; color:var(--text-secondary);">
            ${escapeHtml(step.body)}
          </p>
          <div class="slide-dots" style="margin-top:6px;">
            ${ONBOARDING_STEPS.map(
              (_, i) => `<span class="slide-dot ${i === wizardState.onboardingStep ? 'is-active' : ''}"></span>`
            ).join('')}
          </div>
        </div>

        <div class="modal-footer">
          ${
            wizardState.onboardingStep > 0
              ? `<button type="button" class="btn" data-action="onb-prev">← Назад</button>`
              : `<button type="button" class="btn btn-ghost" data-action="skip-onboarding">Пропустить</button>`
          }
          ${
            isLast
              ? `<button type="button" class="btn btn-primary" data-action="finish-onboarding">Начать работу →</button>`
              : `<button type="button" class="btn btn-primary" data-action="onb-next">Далее →</button>`
          }
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-action="skip-onboarding"], [data-action="finish-onboarding"]').forEach((btn) => {
    btn.addEventListener('click', () => actions.onFinishOnboarding());
  });

  root.querySelector('[data-action="onb-prev"]')?.addEventListener('click', () => {
    wizardState.onboardingStep = Math.max(0, wizardState.onboardingStep - 1);
    renderOnboardingModal(root, actions);
  });

  root.querySelector('[data-action="onb-next"]')?.addEventListener('click', () => {
    wizardState.onboardingStep = Math.min(ONBOARDING_STEPS.length - 1, wizardState.onboardingStep + 1);
    renderOnboardingModal(root, actions);
  });
}

/* ============================================================================
   11. Оболочка модалки Правил и Медиа-менеджера (делегируется в rulesView.js)
   ============================================================================ */

function renderRulesModalShell(root, ep, payload, actions) {
  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-modal-title">
      <div class="modal-dialog modal-xl">
        <div class="modal-header">
          <div>
            <h2 id="rules-modal-title" style="font-size:1.35rem;">📘 Справочник правил и Медиа-менеджер «Медиапожарный»</h2>
            <div style="font-size:0.8rem; color:var(--text-muted);">Часть ${ep.number}: «${escapeHtml(ep.title)}» • Все правила, глоссарий и диагностика ./assets/</div>
          </div>
          <button type="button" class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal-body" id="rules-modal-body-mount"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-info" data-action="print-from-rules">🖨️ Распечатать бланки для столов</button>
          <button type="button" class="btn btn-primary" data-action="close-modal">Готово</button>
        </div>
      </div>
    </div>
  `;

  const mount = root.querySelector('#rules-modal-body-mount');
  renderRulesModalContent(mount, ep, payload?.tab || 'rules', actions);

  root.querySelector('[data-action="print-from-rules"]')?.addEventListener('click', () => {
    actions.onPrintHandouts();
  });
}

/* ============================================================================
   12. Генератор печатного комплекта раздаточных материалов (@media print)
   ============================================================================ */

export function renderPrintableHandouts(printRoot, ep) {
  const hostSheet = `
    <section class="print-sheet">
      <div class="print-sheet-header">
        <div>
          <div class="print-sheet-title">МЕДИАПОЖАРНЫЙ — Памятка ведущего</div>
          <div>Часть ${ep.number}: «${escapeHtml(ep.title)}: ${escapeHtml(ep.subtitle)}»</div>
        </div>
        <div class="print-sheet-badge">Ведущий • 40–45 мин</div>
      </div>

      <p><strong>Стартовая расстановка («Искры слуха»):</strong> Сливы кампуса — 3, Потоковый чат — 2, Коворкинг — 1, остальные локации — 0. <strong>Шкала Доверия:</strong> 7/10 (0 — провал, 1–4 — Пиррова победа, 5–10 — Полная победа).</p>

      <table class="print-table">
        <thead>
          <tr><th>Фаза раунда (5 мин)</th><th>Тайминг</th><th>Что делает ведущий</th></tr>
        </thead>
        <tbody>
          <tr><td>Фаза 1. Новая волна</td><td>30 сек</td><td>Вскрывает 2 карты вбросов текущего раунда и добавляет жетоны. Взрыв 4+ в Фазе 1 НЕ срабатывает.</td></tr>
          <tr><td>Фаза 2А. Совещание столов</td><td>2:00</td><td>Столы обсуждают ходы на 2 ОД. В Раунде 3 после обсуждения — особый шаг 15 сек: Дилемма № 6.</td></tr>
          <tr><td>Фаза 2Б. Выход спикеров</td><td>2:00 (25с/стол)</td><td>Порядок в Р1–3: 1→2→3→4→5. В Р4: 1→2→3→5→4 (40 сек на «Сэндвич правды»). Новый спикер каждый раунд!</td></tr>
          <tr><td>Фаза 3. Проверка поля</td><td>30 сек</td><td>На каждой локации без щита: 4+ жетонов → Взрыв (-2 к Доверию); 2–3 жетона → Эффект молчания (+1 жетон). Все щиты снимаются.</td></tr>
        </tbody>
      </table>

      <div class="print-box">
        <strong>Шпаргалка конвертов Стола № 1 (ТОЛЬКО ДЛЯ ВЕДУЩЕГО — не показывать студентам!):</strong><br/>
        • Истинные улики (нужно ≥ 3): № 1 (Figma + бриф), № 2 (Полный чат + чек 2000 ₽), № 3 (Слепое жюри), № 4 (Ответ инди-дизайнера).<br/>
        • Ложные следы (шум): № 5 (Кружочек подруги), № 6 (Behance/зачётка — ореол), № 7 (Досье на админа — Ad hominem), № 8 (Бот-антиплагиат — ложный авторитет).
      </div>
    </section>
  `;

  const deptSheets = ep.departments
    .map(
      (dept) => `
    <section class="print-sheet">
      <div class="print-sheet-header">
        <div>
          <div class="print-sheet-title">СТОЛ № ${dept.number}: ${escapeHtml(dept.name)}</div>
          <div>Часть ${ep.number}: «${escapeHtml(ep.title)}» • Профильная зона: ${escapeHtml(dept.zoneLabel)}</div>
        </div>
        <div class="print-sheet-badge">Бюджет: 2 ОД / раунд</div>
      </div>

      <p>${escapeHtml(dept.roleSummary)}</p>

      <table class="print-table">
        <thead>
          <tr><th>Действие отдела</th><th style="width:60pt;">Цена</th><th>Условие и эффект</th></tr>
        </thead>
        <tbody>
          ${dept.actions
            .map(
              (a) => `
            <tr>
              <td><strong>${escapeHtml(a.name)}</strong></td>
              <td><strong>${a.cost} ОД</strong>${a.draftCost ? `<br/>(${a.draftCost} ОД с драфтом)` : ''}</td>
              <td><strong>Условие:</strong> ${escapeHtml(a.requirementText)}<br/>${escapeHtml(a.summary)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <div class="print-box">
        <strong>Маршрутный лист «Эстафета голоса» (один человек не может выступать дважды!):</strong>
        <table class="print-table" style="margin-top:6pt;">
          <thead>
            <tr><th>Раунд</th><th>Дежурный спикер (Имя, фамилия)</th><th>Потрачено ОД (макс. 2)</th><th>Главный тезис выступления (25 сек)</th></tr>
          </thead>
          <tbody>
            ${[1, 2, 3, 4]
              .map(
                (r) => `
              <tr>
                <td><strong>Раунд ${r}</strong></td>
                <td style="height:26pt;"></td>
                <td>☐ 1 ОД  ☐ 2 ОД</td>
                <td></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `
    )
    .join('');

  const envelopesSheet = `
    <section class="print-sheet">
      <div class="print-sheet-header">
        <div>
          <div class="print-sheet-title">Ярлыки на 8 запечатанных конвертов (Стол № 1 — OSINT)</div>
          <div>Вырежьте и наклейте на лицевую сторону конвертов</div>
        </div>
        <div class="print-sheet-badge">8 конвертов</div>
      </div>
      <div class="print-two-col">
        ${ep.clueDeck
          .map(
            (c) => `
          <div class="print-box" style="margin-top:0;">
            <div style="font-size:13pt; font-weight:800;">КОНВЕРТ № ${c.number}</div>
            <div style="font-size:11pt; margin-top:4pt;"><strong>Источник:</strong> ${escapeHtml(c.coverTitle)}</div>
            <div style="font-size:8.5pt; margin-top:6pt; color:#475569;">Вскрывать строго за 1 ОД Стола № 1 по команде ведущего.</div>
          </div>
        `
          )
          .join('')}
      </div>
    </section>
  `;

  printRoot.innerHTML = hostSheet + deptSheets + envelopesSheet;
                  }
